import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  type ComponentCategory,
  type ComponentKind,
  type SegmentRecord,
  type SegmentsManifest,
  newSegmentId,
  vaultExtractedDir,
  vaultSegmentsDir,
  vaultSegmentsManifest,
} from '@ds/shared';
import { HTMLElement, parse } from 'node-html-parser';

/**
 * Segmenter.
 *
 * Estratégia:
 * 1. Parse do design-system.html gerado pelo script do professor.
 * 2. Iterate sobre os filhos diretos do <body>.
 * 3. Se houver um comentário `<!-- [id] -->` imediatamente antes de um nó, usa como nome.
 * 4. Se não houver, deriva um nome de section/id/class.
 * 5. Salva manifest.json em vault/{ds}/segments/.
 *
 * A categoria sai de heurística sobre o rótulo da seção, o id e as classes
 * (ver `inferCategory`). É de graça e acerta o caso óbvio — `<!-- hero -->` é
 * hero. O classificador LLM da Fase 3 continua existindo para o que a
 * heurística não alcança, e sobrescreve o que for definido aqui.
 */

const NON_COMPONENT_TAGS = new Set(['script', 'link', 'meta', 'style', 'title']);

const inferNameFromNode = (node: HTMLElement, index: number): string => {
  // Section id ex: "hero", "features", "footer"
  const id = node.getAttribute('id');
  if (id) return prettify(id);
  // Classe descritiva
  const cls = node.getAttribute('class');
  if (cls) {
    const first = cls
      .split(/\s+/)
      .find((c) => c.length > 3 && !/^(w|h|p|m|flex|grid|text|bg|border|rounded)-/.test(c));
    if (first) return prettify(first);
  }
  // Tag semântica
  const tag = node.tagName.toLowerCase();
  if (tag === 'header') return 'Cabeçalho';
  if (tag === 'nav') return 'Navegação';
  if (tag === 'footer') return 'Rodapé';
  if (tag === 'section') return `Seção ${index + 1}`;
  if (tag === 'main') return 'Conteúdo Principal';
  return `Bloco ${index + 1}`;
};

const prettify = (raw: string): string => {
  return raw
    .replace(/[-_]/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
};

/**
 * Palavras que indicam a categoria, da mais específica para a mais genérica.
 * A ordem importa: "pricing-cards" é pricing, não card.
 */
const PISTAS: ReadonlyArray<readonly [ComponentCategory, RegExp]> = [
  ['hero', /\b(hero|banner|jumbotron|masthead|capa)\b/i],
  ['header', /\b(header|topbar|cabecalho|cabeçalho)\b/i],
  ['nav', /\b(nav|navbar|navigation|menu|navegacao|navegação)\b/i],
  ['footer', /\b(footer|rodape|rodapé)\b/i],
  ['pricing', /\b(pricing|price|plano|planos|precos|preços|assinatura)\b/i],
  ['testimonial', /\b(testimonial|depoimento|review|avaliacao|avaliação)\b/i],
  ['faq', /\b(faq|perguntas|duvidas|dúvidas)\b/i],
  ['cta', /\b(cta|call-to-action|contato|contact|newsletter|inscreva)\b/i],
  ['form', /\b(form|formulario|formulário|checkout|login|signup|cadastro)\b/i],
  ['accordion', /\b(accordion|collapse|sanfona)\b/i],
  ['gallery', /\b(gallery|galeria|portfolio|portfólio|work|trabalhos|projetos)\b/i],
  ['stats', /\b(stats|metrics|numbers|numeros|números|resultados|counter)\b/i],
  ['logo-cloud', /\b(logos?|clients?|brands?|marcas|parceiros|trusted)\b/i],
  ['team', /\b(team|equipe|about|sobre|quem-somos)\b/i],
  ['timeline', /\b(timeline|roadmap|processo|etapas|steps|linha-do-tempo)\b/i],
  ['feature', /\b(features?|servicos?|serviços?|services?|solucoes|soluções|expertise)\b/i],
  ['card', /\b(cards?|grid|tiles?)\b/i],
  ['button', /\b(buttons?|botoes|botões|btn)\b/i],
  ['badge', /\b(badges?|tags?|pills?|chips?)\b/i],
];

/**
 * Deduz a categoria a partir do rótulo da seção e dos atributos do nó.
 *
 * Antes tudo saía como `other`, e a Biblioteca ficava com todas as prateleiras
 * zeradas até alguém rodar o classificador LLM — que custa uma chamada de API
 * para descobrir que uma seção chamada `<!-- hero -->` é um hero.
 *
 * Isto resolve o caso óbvio de graça. O classificador continua existindo e
 * continua mandando: quando ele rodar, sobrescreve o que estiver aqui.
 */
const inferCategory = (name: string, node: HTMLElement): ComponentCategory => {
  const tag = node.tagName.toLowerCase();
  if (tag === 'header') return 'header';
  if (tag === 'nav') return 'nav';
  if (tag === 'footer') return 'footer';
  if (tag === 'form') return 'form';

  // O rótulo do comentário é o sinal mais confiável, porque é o nome que o
  // próprio prompt mandou o extrator escrever. Depois, id e classes.
  const texto = [name, node.getAttribute('id') ?? '', node.getAttribute('class') ?? ''].join(' ');

  for (const [categoria, padrao] of PISTAS) {
    if (padrao.test(texto)) return categoria;
  }
  return 'other';
};

export type SegmentationResult = {
  designSystemId: `ds_${string}`;
  segments: SegmentRecord[];
  manifestPath: string;
};

/**
 * Roda a segmentação a partir do vault de um design system já extraído.
 */
export const segmentDesignSystem = (designSystemId: `ds_${string}`): SegmentationResult => {
  const extractedDir = vaultExtractedDir(designSystemId);
  const dsHtmlPath = join(extractedDir, 'design-system.html');
  if (!existsSync(dsHtmlPath)) {
    throw new Error(`design-system.html não encontrado em ${extractedDir}`);
  }

  const html = readFileSync(dsHtmlPath, 'utf8');
  const root = parse(html, { comment: true });
  const body = root.querySelector('body');
  if (!body) {
    throw new Error('body não encontrado no design-system.html');
  }

  const segments: SegmentRecord[] = [];
  let position = 0;
  let pendingComment: string | null = null;

  for (const child of body.childNodes) {
    // node-html-parser: nodeType 3 = comment
    // biome-ignore lint/suspicious/noExplicitAny: children iteration precisa acessar shape
    const c = child as any;
    const type = c.nodeType;

    // Nó de comentário: tenta extrair o nome do próximo elemento
    if (
      type === 8 ||
      (c.rawText && !c.tagName && typeof c.rawText === 'string' && c.rawText.startsWith('<!--'))
    ) {
      const raw = (c.rawText ?? '').trim();
      const match = raw.match(/<!--\s*\[?([^\]]+?)\]?\s*-->/);
      if (match) pendingComment = match[1].trim();
      continue;
    }

    // Só considera elementos
    if (!(c instanceof HTMLElement)) {
      pendingComment = null;
      continue;
    }
    if (NON_COMPONENT_TAGS.has(c.tagName.toLowerCase())) {
      pendingComment = null;
      continue;
    }
    if (c.tagName.toLowerCase() === 'script' && !c.getAttribute('src')) continue;

    const name = pendingComment ? prettify(pendingComment) : inferNameFromNode(c, position);
    pendingComment = null;

    const snippet = c.outerHTML.trim();
    if (snippet.length < 30) continue;

    segments.push({
      id: newSegmentId(),
      designSystemId,
      category: inferCategory(name, c),
      kind: 'component' satisfies ComponentKind,
      name,
      htmlSnippet: snippet,
      previewPath: null,
      position,
      inLibrary: false,
    });
    position++;
  }

  // Escreve manifest.
  const segmentsDir = vaultSegmentsDir(designSystemId);
  mkdirSync(segmentsDir, { recursive: true });
  const manifest: SegmentsManifest = {
    designSystemId,
    generatedAt: Date.now(),
    segments,
  };
  const manifestPath = vaultSegmentsManifest(designSystemId);
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');

  return {
    designSystemId,
    segments,
    manifestPath,
  };
};

/**
 * Retorna o head do design-system.html isolado (para injeção em preview iframe).
 */
export const extractHead = (designSystemId: `ds_${string}`): string => {
  const dsHtmlPath = join(vaultExtractedDir(designSystemId), 'design-system.html');
  if (!existsSync(dsHtmlPath)) return '';
  const html = readFileSync(dsHtmlPath, 'utf8');
  const root = parse(html);
  const head = root.querySelector('head');
  return head ? head.outerHTML : '';
};
