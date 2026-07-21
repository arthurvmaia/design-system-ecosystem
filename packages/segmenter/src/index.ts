import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  type ComponentCategory,
  type ComponentKind,
  type RejectedSegment,
  type RejeitadosManifest,
  type SegmentRecord,
  type SegmentsManifest,
  newSegmentId,
  vaultExtractedDir,
  vaultRejeitadosPath,
  vaultSegmentsDir,
  vaultSegmentsManifest,
} from '@ds/shared';
import { HTMLElement, parse } from 'node-html-parser';
import { extrairPadroes } from './padroes.js';

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

/**
 * Nunca viram componente. `noscript` e `template` entram porque carregam HTML
 * que nunca é pintado: pixel de rastreamento, iframe de tag manager, molde de
 * clonagem por JS. Sem eles na lista, o GTM de um site WordPress virava um
 * "componente" de 161 bytes na Galeria.
 */
const NON_COMPONENT_TAGS = new Set([
  'script',
  'link',
  'meta',
  'style',
  'title',
  'noscript',
  'template',
]);

/** Filhos que podem virar componente. Ignora script, link, texto solto. */
const filhosUteis = (node: HTMLElement): HTMLElement[] =>
  node.childNodes.filter(
    (n): n is HTMLElement =>
      n instanceof HTMLElement && !NON_COMPONENT_TAGS.has(n.tagName.toLowerCase()),
  );

/**
 * Um candidato a segmento. Quase sempre um nó só, mas às vezes vários — ver
 * `ehBloco` e o agrupamento de conteúdo solto em `coletarCandidatos`.
 */
type Candidato = { nodes: HTMLElement[]; rotulo: string | null };

/**
 * Tags que declaram "eu sou uma seção". Quando o autor da página escreveu isto,
 * não há heurística que precise adivinhar.
 */
const TAG_DE_BLOCO = new Set([
  'section',
  'article',
  'header',
  'footer',
  'nav',
  'main',
  'aside',
  'form',
]);

/**
 * Fatia mínima para um filho valer como bloco por conta própria, sem tag
 * semântica e sem rótulo. Abaixo disso é peça solta, e peça solta se junta com
 * as vizinhas.
 */
const FATIA_DE_BLOCO = 0.08;

/**
 * Um candidato é bloco (vale sozinho) ou conteúdo solto (se junta aos vizinhos)?
 *
 * Existe porque muita página não embrulha o hero. Os pedaços dele — imagem,
 * título, parágrafo, botão — ficam soltos como irmãos das `<section>` de
 * verdade, dentro do mesmo container de padding:
 *
 *   <div class="p-10">
 *     <img>            ← hero
 *     <h1>             ← hero
 *     <p>              ← hero
 *     <div>CTA</div>   ← hero
 *     <section>...</section>
 *     <section>...</section>
 *   </div>
 *
 * Emitir um por um dá uma Galeria com um `<p>` de 238 bytes como "componente".
 * Agrupar tudo que é solto e está lado a lado reconstrói o hero que o HTML não
 * embrulhou, e deixa as `<section>` em paz.
 */
const ehBloco = (node: HTMLElement, rotulo: string | null, fatia: number): boolean =>
  rotulo !== null || TAG_DE_BLOCO.has(node.tagName.toLowerCase()) || fatia >= FATIA_DE_BLOCO;

/**
 * Fração do conteúdo do nível a partir da qual um filho deixa de ser seção e
 * passa a ser embrulho. Um elemento que sozinho carrega quase tudo não é uma
 * parte da página — é a página.
 */
const FATIA_DE_EMBRULHO = 0.6;

/**
 * Rede de segurança, não o freio principal. Quem para a descida de verdade é a
 * `FATIA_DE_EMBRULHO`: assim que um nível distribui o conteúdo entre vários
 * filhos, nenhum passa de 60% e a busca para sozinha. O limite existe só para
 * o caso patológico de aninhamento infinito.
 *
 * Precisa ser generoso porque cadeia de embrulho consome profundidade sem
 * produzir nada: `body > div > main > div > section` já gasta 3 níveis antes
 * de chegar na primeira seção de verdade.
 */
const PROFUNDIDADE_MAX = 8;

/**
 * Enfeite: brilho de fundo, orbe, gradiente, divisor, espaçador, canvas de shader.
 *
 * O teste é de natureza, não de tamanho — um botão também é pequeno, mas tem
 * texto; um ícone também é vazio, mas é `<svg>`. O que define o enfeite é não
 * ter substância nenhuma: **sem filhos e sem texto**. Um `<div>` nessas
 * condições não é componente em página nenhuma. É o brilho roxo desfocado no
 * canto da tela, a linha entre duas seções, o vão que empurra o conteúdo.
 * Não há o que curar ali, e era isso que estava enchendo a Galeria.
 *
 * A primeira versão desta regra exigia também estar fora do fluxo
 * (`absolute`/`fixed`). Pegava os brilhos e deixava passar os divisores de 35
 * bytes, que são igualmente vazios e igualmente inúteis — a posição no fluxo
 * nunca foi o que importava.
 *
 * As tags abaixo escapam porque carregam conteúdo sem precisar de filho nem de
 * texto: uma imagem é uma imagem mesmo sozinha.
 */
const TAG_COM_CONTEUDO_PROPRIO = new Set([
  'img',
  'svg',
  'video',
  'iframe',
  'input',
  'textarea',
  'select',
  'button',
  'picture',
  'source',
]);

/**
 * Escondido pelo próprio autor da página. Não há o que curar no que ninguém vê.
 *
 * Isto pega uma família inteira que passava pelo filtro de mídia: o `<svg>` de
 * `display:none` que guarda o sprite de ícones, o `<iframe>` 0x0 de rastreamento,
 * o `<div hidden>` que espera JS. São `<svg>` e `<iframe>` de verdade — por isso
 * escapavam de "não tem conteúdo" — mas nascem invisíveis.
 */
const ESCONDIDO_NO_STYLE = /(^|;)\s*(display\s*:\s*none|visibility\s*:\s*hidden)/i;

/**
 * Utilitário responsivo que traz o elemento de volta em alguma largura.
 * `hidden md:flex` é a receita padrão do menu que só aparece no desktop — e um
 * menu de desktop é um componente perfeitamente legítimo.
 */
const VOLTA_A_APARECER =
  /^(sm|md|lg|xl|2xl):(flex|block|grid|inline|inline-flex|inline-block|table|contents)$/;

const estaEscondido = (node: HTMLElement): boolean => {
  if (node.getAttribute('hidden') !== undefined) return true;
  if (node.getAttribute('aria-hidden') === 'true') return true;
  if (ESCONDIDO_NO_STYLE.test(node.getAttribute('style') ?? '')) return true;

  const classes = (node.getAttribute('class') ?? '').split(/\s+/).filter((c) => c.length > 0);
  if (classes.includes('sr-only') || classes.includes('invisible')) return true;

  // Só a classe `hidden` sem prefixo esconde de verdade. `md:hidden` some no
  // desktop mas aparece no celular, e o teste abaixo nem a enxerga — a
  // comparação é por classe inteira, não por trecho.
  return classes.includes('hidden') && !classes.some((c) => VOLTA_A_APARECER.test(c));
};

const ehEnfeite = (node: HTMLElement): boolean => {
  if (estaEscondido(node)) return true;
  if (TAG_COM_CONTEUDO_PROPRIO.has(node.tagName.toLowerCase())) return false;

  // A pergunta é sobre a subárvore inteira, não sobre os filhos diretos.
  // Enfeite costuma vir embrulhado:
  //
  //   <div class="absolute inset-0 -z-10 pointer-events-none">
  //     <div class="w-full h-full" data-us-project="..."></div>
  //   </div>
  //
  // O de fora tem um filho, então a versão antiga o considerava conteúdo — mas
  // não há uma letra nem uma imagem em lugar nenhum ali dentro. Vazio embrulhado
  // continua vazio.
  if (node.textContent.trim().length > 0) return false;
  return node.querySelector([...TAG_COM_CONTEUDO_PROPRIO].join(',')) === null;
};

/**
 * Encontra as seções, descendo pelos embrulhos até achá-las.
 *
 * Página moderna quase nunca põe as seções direto no `<body>`. Duas formas
 * comuns, ambas já vistas aqui:
 *
 *   <body><div class="min-h-screen"> ...tudo... </div></body>
 *
 *   <body>
 *     <div class="z-50">   ← overlay fixo, 300 bytes
 *     <div class="z-40">   ← outro overlay, 450 bytes
 *     <div>                ← 105 KB: a página inteira
 *   </body>
 *
 * No primeiro caso a página vira um segmento só. No segundo, três — sendo dois
 * enfeites e um com tudo dentro. Nos dois, nada aproveitável para curar.
 *
 * Por isso a regra é proporção: se um filho concentra a maior parte do conteúdo
 * do nível, ele é container e a busca continua lá dentro. Os irmãos pequenos
 * continuam sendo segmentos normais — um overlay é um componente legítimo.
 *
 * **Um filho só também é embrulho.** Exigir dois filhos para descer parecia
 * prudente e era o bug: `<main>` com um único `<div>` dentro reprovava no teste
 * e a página inteira virava um segmento de 28 KB. Justamente o embrulho mais
 * óbvio que existe — o que não se dá nem ao trabalho de ter irmãos — era o
 * único que passava batido. Basta ter conteúdo dentro.
 *
 * A descida não precisa de outro freio: assim que um nível reparte o conteúdo
 * entre vários filhos, nenhum alcança a fatia e a busca para exatamente onde
 * estão as seções de verdade.
 *
 * Um filho precedido de `<!-- rótulo -->` nunca é aberto: o comentário é o
 * extrator declarando "isto é uma seção", e essa declaração vale mais que
 * qualquer heurística de tamanho.
 */
const coletarCandidatos = (container: HTMLElement, profundidade = 0): Candidato[] => {
  const filhos = filhosUteis(container);
  const totalBytes = filhos.reduce((soma, f) => soma + f.outerHTML.length, 0);

  const saida: Candidato[] = [];
  let rotulo: string | null = null;

  // Peças soltas acumuladas até agora, esperando o próximo bloco para fechar.
  let solto: HTMLElement[] = [];
  const fecharSolto = (): void => {
    if (solto.length > 0) {
      saida.push({ nodes: solto, rotulo: null });
      solto = [];
    }
  };

  for (const child of container.childNodes) {
    // biome-ignore lint/suspicious/noExplicitAny: a iteração precisa acessar o shape do nó
    const c = child as any;

    // node-html-parser: nodeType 8 = comentário
    if (
      c.nodeType === 8 ||
      (c.rawText && !c.tagName && typeof c.rawText === 'string' && c.rawText.startsWith('<!--'))
    ) {
      const match = String(c.rawText ?? '')
        .trim()
        .match(/<!--\s*\[?([^\]]+?)\]?\s*-->/);
      if (match?.[1]) rotulo = match[1].trim();
      continue;
    }

    if (!(c instanceof HTMLElement)) {
      rotulo = null;
      continue;
    }
    if (NON_COMPONENT_TAGS.has(c.tagName.toLowerCase())) {
      rotulo = null;
      continue;
    }

    // Enfeite não é componente e também não é embrulho: some antes dos dois
    // testes. Sem isto a Galeria enche de brilho de fundo de 83 bytes.
    if (rotulo === null && ehEnfeite(c)) {
      continue;
    }

    const fatia = totalBytes > 0 ? c.outerHTML.length / totalBytes : 0;
    const ehEmbrulho =
      rotulo === null &&
      profundidade < PROFUNDIDADE_MAX &&
      filhosUteis(c).length >= 1 &&
      fatia >= FATIA_DE_EMBRULHO;

    if (ehEmbrulho) {
      // O que vem de dentro já foi agrupado no nível de lá. Fecha o que estava
      // solto aqui antes, senão a ordem da página se perde.
      fecharSolto();
      saida.push(...coletarCandidatos(c, profundidade + 1));
    } else if (ehBloco(c, rotulo, fatia)) {
      fecharSolto();
      saida.push({ nodes: [c], rotulo });
    } else {
      solto.push(c);
    }

    rotulo = null;
  }

  fecharSolto();
  return saida;
};

/**
 * Nomes de categoria em português, para o fallback quando a seção não traz um
 * título visível.
 *
 * Antes o nome saía do `id`/`class` do site — e site em inglês dava "Platform",
 * "Section Padding", "Orchestration". O usuário quer os nomes em português, então
 * o nome passa a sair do que a pessoa lê na tela (o título da seção, na língua do
 * conteúdo) e, na falta dele, do rótulo da categoria em PT. O `id`/`class` do
 * site não entra mais na nomeação.
 */
const CATEGORIA_PT: Record<string, string> = {
  hero: 'Destaque',
  header: 'Cabeçalho',
  nav: 'Navegação',
  footer: 'Rodapé',
  pricing: 'Preços',
  testimonial: 'Depoimentos',
  faq: 'Perguntas frequentes',
  cta: 'Chamada',
  form: 'Formulário',
  feature: 'Funcionalidades',
  card: 'Cards',
  button: 'Botões',
  badge: 'Selos',
  input: 'Campo',
  accordion: 'Acordeão',
  gallery: 'Galeria',
  stats: 'Números',
  'logo-cloud': 'Marcas',
  team: 'Equipe',
  timeline: 'Linha do tempo',
  other: 'Seção',
};

/** O texto do primeiro título (h1–h4) do nó — a legenda na língua do site. */
const tituloDoNo = (node: HTMLElement): string | null => {
  const h = /^h[1-4]$/.test(node.tagName.toLowerCase())
    ? node
    : node.querySelector('h1, h2, h3, h4');
  const texto = h?.textContent.trim().replace(/\s+/g, ' ') ?? '';
  if (texto.length < 3) return null;
  return texto.length > 44 ? `${texto.slice(0, 44)}…` : texto;
};

/**
 * Nome de um candidato, em português.
 *
 * A ordem: o título visível da seção (na língua do conteúdo — é o que a pessoa lê
 * e reconhece), depois a tag semântica, depois o rótulo da categoria em PT. O
 * `id`/`class` do site não entra: era de lá que vinham os nomes em inglês.
 */
const nomeDoCandidato = (
  nodes: HTMLElement[],
  category: ComponentCategory,
  index: number,
): string => {
  const primeiro = nodes[0];
  if (primeiro === undefined) return `Seção ${index + 1}`;

  for (const n of nodes) {
    const titulo = tituloDoNo(n);
    if (titulo) return titulo;
  }

  const tag = primeiro.tagName.toLowerCase();
  if (tag === 'header') return 'Cabeçalho';
  if (tag === 'nav') return 'Navegação';
  if (tag === 'footer') return 'Rodapé';

  return CATEGORIA_PT[category] ?? `Seção ${index + 1}`;
};

/**
 * O `<h1>` é o título principal da página, e ele mora no hero. Quando um grupo
 * de peças soltas carrega um, a categoria não precisa de mais nenhuma pista.
 */
const grupoTemH1 = (nodes: HTMLElement[]): boolean =>
  nodes.some((n) => n.tagName.toLowerCase() === 'h1' || n.querySelector('h1') !== null);

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

/** Tags que carregam substância própria — mídia ou controle. */
const TAGS_MIDIA = new Set([
  'img',
  'svg',
  'video',
  'iframe',
  'canvas',
  'picture',
  'button',
  'input',
  'select',
  'textarea',
]);

const temMidia = (nodes: HTMLElement[]): boolean =>
  nodes.some(
    (n) =>
      TAGS_MIDIA.has(n.tagName.toLowerCase()) ||
      n.querySelector([...TAGS_MIDIA].join(',')) !== null,
  );

/**
 * O bloco vale a Galeria?
 *
 * A Galeria é para o que o algoritmo realmente conseguiu interpretar. Passa só o
 * que dá para reconhecer como componente: tem texto de verdade OU tem
 * mídia/controle. O resto — invólucro vazio, fragmento sem substância, bloco que
 * não dá para nomear — é reprovado COM o motivo e vai para a Revisão, em vez de
 * sujar a Galeria. Conservador de propósito: na dúvida, aprova. Site novo e fora
 * do padrão vai cair mais aqui, e isso é esperado.
 */
const validarSegmento = (
  nodes: HTMLElement[],
  snippet: string,
  category: ComponentCategory,
): { ok: boolean; motivos: string[] } => {
  const texto = nodes
    .map((n) => n.textContent)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
  const temTexto = texto.length >= 12;
  const midia = temMidia(nodes);

  const motivos: string[] = [];
  if (!temTexto && !midia) {
    motivos.push('Bloco sem texto nem mídia visível — parece um invólucro vazio ou uma decoração.');
  }
  if (snippet.length < 60 && !midia) {
    motivos.push('Fragmento pequeno demais para ser um componente reutilizável.');
  }
  if (category === 'other' && !temTexto && !midia) {
    motivos.push('Não foi possível identificar o que este bloco representa.');
  }

  return { ok: motivos.length === 0, motivos: [...new Set(motivos)] };
};

/**
 * Junta o CSS que o design system carrega — arquivos do vault e `<style>`
 * inline. As animações declaradas em `@keyframes` só aparecem aqui: no HTML há
 * a classe que as usa, nunca a definição.
 *
 * Falha de leitura é silenciosa de propósito. CSS ausente significa uma
 * categoria a menos na Galeria, não uma extração perdida.
 */
const lerCssDoVault = (extractedDir: string, html: string): string => {
  const partes: string[] = [];

  const cssDir = join(extractedDir, 'assets', 'css');
  if (existsSync(cssDir)) {
    for (const arquivo of readdirSync(cssDir)) {
      if (!arquivo.endsWith('.css')) continue;
      try {
        partes.push(readFileSync(join(cssDir, arquivo), 'utf8'));
      } catch {
        // Arquivo ilegível não derruba a segmentação.
      }
    }
  }

  for (const m of html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)) {
    partes.push(m[1] ?? '');
  }

  return partes.join('\n');
};

export type SegmentationResult = {
  designSystemId: `ds_${string}`;
  segments: SegmentRecord[];
  /** Candidatos que não passaram na validação — vão para a Revisão, não a Galeria. */
  rejected: RejectedSegment[];
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

  // As seções raramente ficam direto no <body>. Ver `coletarCandidatos`.
  const candidatos = coletarCandidatos(body);

  const segments: SegmentRecord[] = [];
  const rejeitados: RejectedSegment[] = [];
  let position = 0;

  for (const { nodes, rotulo } of candidatos) {
    const principal = nodes[0];
    if (principal === undefined) continue;

    const snippet = nodes
      .map((n) => n.outerHTML.trim())
      .join('\n')
      .trim();
    if (snippet.length < 30) continue;

    // Categoria primeiro (não depende do nome de exibição), para o nome poder
    // cair no rótulo da categoria em PT quando a seção não tiver título visível.
    const category =
      nodes.length > 1 && grupoTemH1(nodes) ? 'hero' : inferCategory(rotulo ?? '', principal);
    const name = rotulo ? prettify(rotulo) : nomeDoCandidato(nodes, category, position);

    // Validação: só o que dá para reconhecer como componente entra na Galeria.
    // O que não passa vai para a Revisão, com o motivo — não some calado.
    const veredito = validarSegmento(nodes, snippet, category);
    if (!veredito.ok) {
      rejeitados.push({
        id: newSegmentId(),
        designSystemId,
        category,
        kind: 'component' satisfies ComponentKind,
        name,
        htmlSnippet: snippet,
        position: rejeitados.length,
        motivos: veredito.motivos,
      });
      continue;
    }

    segments.push({
      id: newSegmentId(),
      designSystemId,
      category,
      kind: 'component' satisfies ComponentKind,
      name,
      htmlSnippet: snippet,
      previewPath: null,
      position,
      inLibrary: false,
    });
    position++;
  }

  // Segundo passe: os sistemas que atravessam a página inteira (tipografia,
  // botões, cards, interações). Vêm depois das seções de propósito — são a
  // leitura transversal do mesmo material, não mais um pedaço dele.
  for (const padrao of extrairPadroes(body, lerCssDoVault(extractedDir, html))) {
    segments.push({
      id: newSegmentId(),
      designSystemId,
      category: padrao.category,
      kind: padrao.kind,
      name: padrao.name,
      htmlSnippet: padrao.htmlSnippet,
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

  // rejeitados.json: o par do manifest, para a tela de Revisão.
  const rejeitadosManifest: RejeitadosManifest = {
    designSystemId,
    generatedAt: Date.now(),
    rejeitados,
  };
  writeFileSync(
    vaultRejeitadosPath(designSystemId),
    JSON.stringify(rejeitadosManifest, null, 2),
    'utf8',
  );

  return {
    designSystemId,
    segments,
    rejected: rejeitados,
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
