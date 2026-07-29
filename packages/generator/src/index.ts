import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import Anthropic from '@anthropic-ai/sdk';
import {
  type GeneratePayload,
  type ProjectBranding,
  buildTypographyCss,
  derivarDiretrizes,
  derivarEscala,
  distribuirTokens,
  libraryComponentBundleDir,
  projectGeneratedVersionDir,
  resolverSecoes,
} from '@ds/shared';
import { z } from 'zod';
import { lerCssDoBundle } from './cascata.js';
import { type ModeloDeCopy, executarPlano, montarPlanoEditorial } from './editorial.js';
import { cssResponsivoBase } from './responsivo.js';

export { cssResponsivoBase } from './responsivo.js';
export { lerCssDoBundle, type LeituraDeCss } from './cascata.js';
import {
  envolverSecao,
  extrairCorpo,
  limparParaComposicao,
  reescreverRefsCss,
  reescreverRefsHtml,
} from './montagem.js';

/**
 * Gerador de site.
 *
 * Fluxo:
 * 1. O usuário escolhe um blueprint (estrutura de página com slots ordenados).
 * 2. LLM recebe: os slots a preencher + catálogo da library + conteúdo + branding.
 * 3. LLM retorna: qual componente ocupa cada slot e o conteúdo interpolado.
 * 4. Post-processing: monta o HTML final, mescla CSS, aplica tokens da marca.
 *
 * O risco histórico desta fase era o site sair incoerente ("Frankenstein"),
 * porque o modelo inventava a estrutura a cada geração. O blueprint remove essa
 * liberdade: a estrutura vem pronta e o modelo só faz curadoria dentro dela.
 *
 * A segunda defesa é a coerência de origem — `preferDesignSystemId` faz o
 * gerador priorizar peças do mesmo design system, evitando colar componentes
 * de linguagens visuais que não conversam.
 */

/**
 * O que o modelo ainda decide.
 *
 * Antes ele escolhia as seções E os componentes. Agora as duas coisas vêm do
 * usuário em `layout.secoes`, então sobrou uma tarefa só: trocar os textos
 * genéricos que vieram do site de origem pelo conteúdo de quem está gerando.
 * Estrutura não se pede a quem já a recebeu pronta.
 */
const CompositionPlan = z.object({
  sections: z.array(
    z.object({
      secaoId: z.string(),
      substitutions: z.record(z.string(), z.string()).optional(),
    }),
  ),
});
export type CompositionPlan = z.infer<typeof CompositionPlan>;

export type LibraryCatalogItem = {
  id: string;
  name: string;
  category: string;
  htmlPreview: string;
  designSystemId?: string | null;
};

/**
 * O gerador consome o CONTRATO de geração — o mesmo payload que a fila grava
 * no job (`GeneratePayload` em @ds/shared). Fila e API deixam de divergir: a
 * mídia, o kit com `bundlePath` e o layout chegam idênticos nos dois modos.
 */
export type GenerateInput = GeneratePayload;

export type GenerateOptions = {
  apiKey: string;
  model: string;
  onProgress?: (msg: string) => void;
  /**
   * Modelo do pipeline editorial (ver ./editorial.ts). Quando presente e o
   * projeto tem identidade verbal, a copy nasce do plano validado e é gravada
   * em copy.json na versão gerada. Nos testes, uma função simulada.
   */
  modeloDeCopy?: ModeloDeCopy;
};

export type GenerateResult = {
  outputDir: string;
  plan: CompositionPlan;
  totalBytes: number;
};

/**
 * Ordena o catálogo colocando primeiro as peças do design system preferido.
 * O modelo lê de cima para baixo, então a ordem já é um viés de coerência —
 * sem excluir as demais, que continuam disponíveis se nada servir.
 */
const buildCatalog = (items: LibraryCatalogItem[], preferDesignSystemId: string | null): string => {
  const ordered =
    preferDesignSystemId === null
      ? items
      : [
          ...items.filter((c) => c.designSystemId === preferDesignSystemId),
          ...items.filter((c) => c.designSystemId !== preferDesignSystemId),
        ];

  return ordered
    .map((c) => {
      const origem =
        preferDesignSystemId !== null && c.designSystemId === preferDesignSystemId
          ? ' | origem: PREFERIDA'
          : '';
      return `- ID ${c.id} | category: ${c.category} | name: "${c.name}"${origem}\n  preview: ${c.htmlPreview.slice(0, 300)}...`;
    })
    .join('\n');
};

const FORMATO = `Formato:
{
  "sections": [
    {"componentId": "cmp_...", "role": "hero", "substitutions": {"texto original": "texto novo"}},
    ...
  ]
}`;

const REGRAS_COMUNS = `- Só use componentes da biblioteca, por ID. Nunca invente um ID.
- Prefira componentes marcados como "origem: PREFERIDA" — vêm do mesmo design
  system e mantêm a página visualmente coerente. Só saia deles se nenhum servir.
- Substitua textos genéricos do preview por textos do conteúdo do usuário via
  mapa de substituições. Nunca invente fatos que não estejam no conteúdo.
- Retorne SÓ JSON, sem markdown.`;

/** Catálogo para o planejador, nascido do KIT com bundle em disco. */
const catalogoDoKit = (input: GenerateInput): LibraryCatalogItem[] =>
  input.kit.components.map((cmp) => {
    const htmlPath = join(cmp.bundlePath, 'index.html');
    const preview = existsSync(htmlPath) ? readFileSync(htmlPath, 'utf8').slice(0, 500) : '';
    return {
      id: cmp.id,
      name: cmp.name,
      category: cmp.category,
      htmlPreview: preview,
      designSystemId: cmp.designSystemId ?? null,
    };
  });

/**
 * A estrutura é do usuário: aqui ela é DESCRITA ao modelo, não pedida a ele.
 *
 * O que sobra para o modelo é o texto. Cada seção traz as peças que a compõem e,
 * quando o usuário escreveu, a instrução dele sobre o que aquela seção deve ou
 * não comunicar. Seção sem instrução é delegação explícita.
 */
const descreverEstrutura = (input: GenerateInput): string => {
  const { secoes } = resolverSecoes(input.layout.secoes, input.kit.components);
  if (secoes.length === 0) return 'O projeto não declarou nenhuma seção.';
  return secoes
    .map((s, i) => {
      const nome = s.nome.trim() === '' ? `Seção ${i + 1}` : s.nome.trim();
      const pecas =
        s.pecas.length === 0
          ? 'sem peça do kit: esta seção é criada no estilo do kit'
          : `peças, nesta ordem: ${s.pecas.map((p) => `"${p.id}" (${p.name})`).join(', ')}`;
      const diz =
        s.instrucao === undefined
          ? '   o usuário deixou o texto por sua conta: escreva no tom da marca, SEM inventar fatos'
          : `   o usuário pediu: ${s.instrucao}`;
      return `${i + 1}. [${s.id}] "${nome}" — ${pecas}\n${diz}`;
    })
    .join('\n');
};

const planSite = async (input: GenerateInput, opts: GenerateOptions): Promise<CompositionPlan> => {
  const client = new Anthropic({ apiKey: opts.apiKey });

  const system = `Você escreve o texto de um site já estruturado.

A ESTRUTURA E AS PEÇAS JÁ ESTÃO DECIDIDAS pelo usuário. Você não escolhe quais
seções existem, nem em que ordem aparecem, nem quais componentes as compõem.
Não acrescente, não remova e não reordene nada.

Sua tarefa é uma só: para cada seção, devolver o mapa de substituições que troca
os textos genéricos herdados do site de origem pelo conteúdo deste usuário.

Regras:
- Um item por seção, usando o "secaoId" exatamente como fornecido.
- NUNCA copie texto, nome ou marca do site de origem: o kit empresta o jeito
  visual, a identidade é do usuário.
- Nunca invente fato, número, cliente ou prêmio que não esteja no conteúdo.
${REGRAS_COMUNS}

${FORMATO}`;

  const modoUser = `ESTRUTURA DO SITE (é isto, na ordem):
${descreverEstrutura(input)}`;

  const midias =
    input.media.length === 0
      ? 'nenhuma enviada'
      : input.media
          .map(
            (m) => `- ${m.kind} "${m.originalName}"${m.slotRole ? ` → seção ${m.slotRole}` : ''}`,
          )
          .join('\n');

  const user = `PROJETO: ${input.projectName}

${modoUser}

DENSIDADE: ${input.layout.density}
MOVIMENTO: ${input.layout.motion}

CONTEÚDO DO USUÁRIO:
${JSON.stringify(input.content, null, 2)}

IDENTIDADE VISUAL:
${JSON.stringify(input.branding, null, 2)}

MÍDIA DO USUÁRIO (prefira seções que aproveitem o que existe):
${midias}

BIBLIOTECA DISPONÍVEL:
${buildCatalog(catalogoDoKit(input), input.layout.preferDesignSystemId)}

Componha o site.`;

  // Mesmo racional do extractor: o Fable 5 pensa dentro do max_tokens (em
  // effort max, 16k amputava o plano) e os classificadores de segurança podem
  // recusar uma requisição legítima — recusa cai para o modelo de fallback.
  const MODELO_FALLBACK = 'claude-opus-4-8';
  const chamar = (model: string) =>
    client.messages.create({
      model,
      max_tokens: 64000,
      output_config: { effort: 'max' },
      system,
      messages: [{ role: 'user', content: user }],
    });

  let response = await chamar(opts.model);
  if (response.stop_reason === 'refusal' && opts.model !== MODELO_FALLBACK) {
    response = await chamar(MODELO_FALLBACK);
  }

  const text = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('\n');

  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error(`Composição não retornou JSON: ${text.slice(0, 200)}`);
  return CompositionPlan.parse(JSON.parse(match[0]));
};

const applySubstitutions = (html: string, subs?: Record<string, string>): string => {
  if (!subs) return html;
  let out = html;
  for (const [from, to] of Object.entries(subs)) {
    out = out.split(from).join(to);
  }
  return out;
};

/**
 * CSS da marca aplicado ao site gerado.
 *
 * A tipografia sai de `buildTypographyCss` (fonte da verdade compartilhada):
 * declara `--font-display`/`--font-body` com pilha de fallback e — o que faltava
 * — aplica a fonte de títulos aos headings e a de corpo ao body. A importação da
 * família em si entra por um `<link>` no head (ver `generateSite`), carregando
 * só os pesos usados.
 */
export const buildBrandingCss = (branding: ProjectBranding): string => {
  const typo = buildTypographyCss(branding.typography);

  // Tokens semânticos da paleta nova (A5); sem paleta, o legado de 4 cores
  // segue valendo. Este CSS carrega DEPOIS do esqueleto — vence a cascata.
  const tokens = branding.paleta !== undefined ? distribuirTokens(branding.paleta) : undefined;
  const varsSemanticas =
    tokens !== undefined
      ? Object.entries(tokens)
          .map(([token, hex]) => `  --marca-${token}: ${hex};`)
          .join('\n')
      : '';

  const fundo = tokens?.background ?? branding.palette.background;
  const texto = tokens?.body ?? branding.palette.foreground;
  const primaria = tokens?.primary ?? branding.palette.primary;

  // Escala tipográfica derivada dos presets (A5); sem tipografia nova, só as
  // famílias legadas do buildTypographyCss.
  let escalaCss = '';
  if (branding.tipografia !== undefined) {
    const e = derivarEscala(branding.tipografia);
    const headings = e.headings.map((tam, i) => `h${i + 1} { font-size: ${tam}; }`).join('\n');
    escalaCss = `
h1, h2, h3, h4, h5, h6 {
  font-weight: ${e.pesoTitulos};
  line-height: ${e.lineHeightTitulos};
  letter-spacing: ${e.letterSpacingTitulos};${e.transformacaoTitulos !== 'nenhuma' ? `\n  text-transform: ${e.transformacaoTitulos};` : ''}
}
${headings}
body { font-size: ${e.corpoTamanho}; line-height: ${e.corpoLineHeight}; }
`;
  }

  return `${typo.css}
:root {
  --brand-primary: ${primaria};
  ${branding.palette.secondary ? `--brand-secondary: ${branding.palette.secondary};` : ''}
  --brand-bg: ${fundo};
  --brand-fg: ${texto};
  ${branding.palette.accent ? `--brand-accent: ${branding.palette.accent};` : ''}
${varsSemanticas}
}
/* Override dos --primary do componente para casar com a marca. */
:root { --primary: var(--brand-primary); }
body { background: var(--brand-bg); color: var(--brand-fg); }
${escalaCss}${
  tokens !== undefined
    ? `a { color: var(--marca-link); }
h1, h2, h3, h4, h5, h6 { color: var(--marca-heading); }
`
    : ''
}`;
};

/** Gera o site final e escreve em projects/{id}/generated/{iso}/ */
export const generateSite = async (
  input: GenerateInput,
  opts: GenerateOptions,
): Promise<GenerateResult> => {
  opts.onProgress?.('Planejando composição via LLM');
  const plan = await planSite(input, opts);

  const iso = new Date().toISOString().replace(/[:.]/g, '-');
  const outputDir = projectGeneratedVersionDir(input.projectId as `prj_${string}`, iso);
  mkdirSync(outputDir, { recursive: true });
  mkdirSync(join(outputDir, 'assets'), { recursive: true });

  // Monta cada seção levando o BUNDLE COMPLETO do componente: corpo extraído
  // (bundles V2 são documentos completos), CSS dividido concatenado na ordem,
  // JS e arquivos copiados para o namespace do componente — o esqueleto viaja
  // inteiro, não só os primeiros bytes do HTML.
  let bodyHtml = '';
  let concatCss = '';
  const subsPorSecao = new Map(plan.sections.map((s) => [s.secaoId, s.substitutions]));
  const { secoes: resolvidas } = resolverSecoes(input.layout.secoes, input.kit.components);

  // O laço externo é a ESTRUTURA DO USUÁRIO, na ordem dele. O interno são as
  // peças daquela seção — todas dentro da mesma <section>, que é o que "N peças
  // por seção" quer dizer no HTML final.
  for (const secao of resolvidas) {
    const substituicoes = subsPorSecao.get(secao.id);
    let corpoDaSecao = '';
    const usados: string[] = [];
    let faltou = false;

    for (const peca of secao.pecas) {
      const bundleDir = libraryComponentBundleDir(peca.id as `cmp_${string}`);
      const htmlPath = join(bundleDir, 'index.html');
      if (!existsSync(htmlPath)) {
        opts.onProgress?.(`Peça ${peca.id} sem bundle em disco, seguindo sem ela`);
        faltou = true;
        continue;
      }

      // A ordem dos `<link>` do bundle É a cascata. Ler a pasta e ordenar por
      // nome punha `animations` antes de `tokens` e as folhas externas de nome
      // hexadecimal no meio — todo o cuidado do compilador em não inverter a
      // cascata era desfeito aqui, e o site saía errado sem nada faltar.
      const leitura = lerCssDoBundle(bundleDir);
      let css = leitura.css;
      if (leitura.faltando.length > 0) {
        opts.onProgress?.(
          `Peça ${peca.id}: ${leitura.faltando.length} folha(s) de estilo declaradas e ausentes`,
        );
      }
      if (css.trim() === '') {
        opts.onProgress?.(`Peça ${peca.id} entrou SEM estilo nenhum — o bundle não tem CSS`);
      }

      let corpo = limparParaComposicao(extrairCorpo(readFileSync(htmlPath, 'utf8')));
      corpo = applySubstitutions(corpo, substituicoes);

      // Arquivos do bundle (JS, imagens, fontes) vão para assets/<cmpId>/ e as
      // referências são reescritas — componentes não colidem entre si.
      const assetsDir = join(bundleDir, 'assets');
      if (existsSync(assetsDir)) {
        const destino = join(outputDir, 'assets', peca.id);
        for (const entry of readdirSync(assetsDir)) {
          if (entry === 'css') continue;
          cpSync(join(assetsDir, entry), join(destino, entry), { recursive: true });
        }
        corpo = reescreverRefsHtml(corpo, peca.id);
        css = reescreverRefsCss(css, peca.id);
      }

      corpoDaSecao += `\n${corpo}\n`;
      concatCss += `\n/* ${secao.slug} · ${peca.id} */\n${css}`;
      usados.push(peca.id);
    }

    // Seção que o usuário pediu sem peça do kit: no modo API não há como criar
    // o visual, então ela sai declarada e vazia em vez de sumir da página. O
    // modo fila, que é quem gera de verdade, cria a seção no estilo do kit.
    if (usados.length === 0) {
      corpoDaSecao = `\n<!-- seção "${secao.nome}" pedida sem peça do kit: criar no estilo -->\n`;
    }

    bodyHtml += `\n${envolverSecao(corpoDaSecao, {
      role: secao.slug,
      secaoId: secao.id,
      componentIds: usados,
      criouAlgo: faltou,
    })}\n`;
    opts.onProgress?.(`Adicionado: ${secao.nome} (${usados.length} peça(s))`);
  }

  // Ordem da cascata: ESQUELETO (CSS dos componentes) → RESPONSIVO (vence as
  // larguras fixas capturadas, só no mobile) → MARCA (a identidade por último,
  // vencendo sem !important).
  const brandingCss = buildBrandingCss(input.branding);
  writeFileSync(join(outputDir, 'assets/styles.css'), concatCss, 'utf8');
  writeFileSync(join(outputDir, 'assets/responsivo.css'), cssResponsivoBase(), 'utf8');
  writeFileSync(join(outputDir, 'assets/marca.css'), brandingCss, 'utf8');

  // Importa as fontes escolhidas (só os pesos usados) via <link> no head — a
  // aplicação aos títulos/corpo está no styles.css. Preconnect para acelerar.
  const fontImportUrl = buildTypographyCss(input.branding.typography).importUrl;
  const fontLinks = fontImportUrl
    ? `<link rel="preconnect" href="https://fonts.googleapis.com"/>
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin/>
<link rel="stylesheet" href="${fontImportUrl}"/>
`
    : '';

  const finalHtml = `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1.0"/>
<title>${input.projectName}</title>
${fontLinks}<link rel="stylesheet" href="assets/styles.css"/>
<link rel="stylesheet" href="assets/responsivo.css"/>
<link rel="stylesheet" href="assets/marca.css"/>
</head>
<body>
${bodyHtml}
</body>
</html>`;

  writeFileSync(join(outputDir, 'index.html'), finalHtml, 'utf8');
  writeFileSync(join(outputDir, 'plan.json'), JSON.stringify(plan, null, 2), 'utf8');

  // Pipeline editorial (A11): com modelo plugado e voz definida, a copy nasce
  // do plano determinístico + validadores e fica versionada junto do site.
  if (opts.modeloDeCopy !== undefined && input.branding.identidadeVerbal !== undefined) {
    const diretrizes = derivarDiretrizes(input.branding.identidadeVerbal);
    const planoEditorial = montarPlanoEditorial({
      briefs: input.content.briefs ?? {},
      diretrizes,
    });
    const copy = await executarPlano(planoEditorial, opts.modeloDeCopy, {
      vocabularioEvitar: diretrizes.vocabularioEvitar,
    });
    writeFileSync(join(outputDir, 'copy.json'), JSON.stringify(copy, null, 2), 'utf8');
    opts.onProgress?.(
      `Copy editorial: ${planoEditorial.pedidos.length} pedido(s), ${copy.problemas.length} problema(s) irrecuperável(is)`,
    );
  }

  return { outputDir, plan, totalBytes: finalHtml.length + concatCss.length + brandingCss.length };
};
