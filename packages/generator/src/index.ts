import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import Anthropic from '@anthropic-ai/sdk';
import {
  type EscalaDaOrigem,
  type GeneratePayload,
  OBJETIVOS,
  type ProjectBranding,
  buildTypographyCss,
  derivarDiretrizes,
  derivarEscala,
  distribuirTokens,
  explicarPapel,
  nomeDoEspaco,
  nomeDoPasso,
  nomeDoRaio,
  projectGeneratedVersionDir,
  resolverSecoes,
} from '@ds/shared';
import { z } from 'zod';
import { type ModeloDeCopy, executarPlano, montarPlanoEditorial } from './editorial.js';
import { montarPaginaDoKit } from './pagina.js';

export { cssResponsivoBase } from './responsivo.js';
export { lerCssDoBundle, type LeituraDeCss } from './cascata.js';
export { removerScriptsQueCompilamCss } from './pecas.js';
export { type PecaDoKit, consolidarDesignSystemDoKit } from './design-system-do-kit.js';
export {
  type EntradaDaPagina,
  type ResultadoDaPagina,
  type SecaoCriativa,
  montarPaginaDoKit,
} from './pagina.js';
export {
  type LinhaDeBase,
  type MedidaDeBundle,
  bundlesEm,
  comparar,
  contarInstrumentacao,
  contarRegras,
  contarSeletoresMortos,
  cssDaOrigem,
  medirBundle,
  medirIcones,
  medirScripts,
  resumir,
} from './fidelidade.js';
export type { Contexto, Veredito, Violacao } from './portao.js';
export { avaliarPortao, linhasDeContexto } from './portao.js';

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
  const objetivo = input.layout.objetivo ?? null;
  // As seções originais, para achar o papel — `resolverSecoes` devolve o slug
  // (que pode ter vindo por inferência da categoria da peça), e o papel
  // declarado é o que casa com a sequência de marketing.
  const porId = new Map(input.layout.secoes.map((s) => [s.id, s]));

  const cabecalho =
    objetivo === null
      ? ''
      : `O objetivo deste site é ${OBJETIVOS[objetivo].rotulo.toLowerCase()}. ${OBJETIVOS[objetivo].explica}\n\n`;

  const corpo = secoes
    .map((s, i) => {
      const nome = s.nome.trim() === '' ? `Seção ${i + 1}` : s.nome.trim();
      const pecas =
        s.pecas.length === 0
          ? 'sem peça do kit: esta seção é criada no estilo do kit'
          : `peças, nesta ordem: ${s.pecas.map((p) => `"${p.id}" (${p.name})`).join(', ')}`;
      // O PAPEL da seção na página, quando se sabe qual é.
      //
      // Sem isto, um texto de "Objeções" e um de "Abertura" chegavam com a
      // mesma descrição — nome e peças — e saíam com o mesmo tom. A função da
      // seção é o que decide se ali cabe uma promessa curta ou uma resposta
      // que tira o medo de alguém.
      const papel = porId.get(s.id)?.papel;
      const etapa = papel === undefined ? undefined : explicarPapel(papel, objetivo);
      const faz = etapa === undefined ? '' : `\n   função na página: ${etapa.faz}`;
      const diz =
        s.instrucao === undefined
          ? '   o usuário deixou o texto por sua conta: escreva no tom da marca, SEM inventar fatos'
          : `   o usuário pediu: ${s.instrucao}`;
      return `${i + 1}. [${s.id}] "${nome}" — ${pecas}${faz}\n${diz}`;
    })
    .join('\n');

  return `${cabecalho}${corpo}`;
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

  // Mesmo racional do extractor: o modelo pensa DENTRO do max_tokens (em
  // effort max, 16k amputava o plano) e os classificadores de segurança podem
  // recusar uma requisição legítima — recusa cai para o modelo de fallback.
  // O padrão da geração é o Opus 5 em effort max (ver `getModels` no servidor):
  // é aqui que um plano raso vira um site que alguém refaz à mão.
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

/**
 * Os tokens de ESCALA: os degraus de tamanho, de respiro e de raio que as peças
 * consomem.
 *
 * ## O defeito, medido
 *
 * A fonte da marca já valia DENTRO das peças de origem — `retipografar.ts`
 * reescreve `font-family` no ponto de uso, e a peça passa a consumir
 * `var(--marca-fonte-display, ...)`. O TAMANHO não valia: cada peça continuava
 * com os degraus do site de onde foi capturada, e um kit que junta o hero de um
 * site com os preços de outro saía com título de 64px em cima e de 40px embaixo.
 * Não porque alguém escolheu, mas porque dois designers escolheram, em dois
 * sites, e ninguém conciliou.
 *
 * A reescrita da peça troca o literal por `font-size: var(--marca-passo-5, 3rem)`
 * — e alguém precisa DECLARAR `--marca-passo-5`. É esta função. Sem ela a peça
 * fica com um `var()` que não resolve e cai no fallback, ou seja, o defeito
 * inteiro de volta em silêncio.
 *
 * ## A saída
 *
 * Uma declaração por degrau da régua de referência, dentro do mesmo `:root` dos
 * tokens de cor e de fonte, na ordem em que a régua os mediu:
 *
 *   `--marca-passo-1: 12px;` … `--marca-espaco-1: 4px;` … `--marca-raio-1: 4px;`
 *
 * O nome sai de `nomeDoPasso`/`nomeDoEspaco`/`nomeDoRaio` (@ds/shared), os
 * MESMOS que a reescrita das peças usa. Nome montado à mão nas duas pontas é
 * exatamente como elas divergem sem ninguém perceber.
 *
 * ## Os invariantes
 *
 * - **Sem régua medida, nada é declarado.** `escala` ausente, nula ou sem
 *   degraus produz o CSS de sempre, byte a byte. Projeto que já existe não muda
 *   de aparência porque o motor aprendeu a medir escala; é a mesma degradação da
 *   recoloração e da retipografia, sem dado a peça sai como estava. (Régua sem
 *   degrau nem chega aqui na prática: `escalaDeReferencia` só elege origem com
 *   degraus medidos.)
 * - **Aqui é o único lugar que DECLARA `--marca-*`.** `recolorir.ts` e
 *   `retipografar.ts` carregam o invariante espelhado do outro lado: elas só
 *   consomem. É isso que mantém a herança do `:root` limpa até dentro do bundle,
 *   sem proxy no caminho para interceptar.
 * - **O índice é a identidade do degrau.** Valor impossível (um `Infinity` que
 *   passou pelo `positive()` do schema) não vira declaração, mas também não é
 *   removido da lista: filtrar deslocaria os vizinhos e `--marca-passo-5`
 *   passaria a nomear outro tamanho aqui e na peça. Sem a declaração, aquele
 *   degrau cai no literal de origem, que é a degradação certa.
 */
const varsDaEscala = (escala: EscalaDaOrigem | null | undefined): string => {
  if (escala == null || escala.degraus.length === 0) return '';

  const linhas: string[] = [];
  escala.degraus.forEach((px, i) => {
    if (Number.isFinite(px)) linhas.push(`  ${nomeDoPasso(i)}: ${px}px;`);
  });
  escala.espacos.forEach((px, i) => {
    if (Number.isFinite(px)) linhas.push(`  ${nomeDoEspaco(i)}: ${px}px;`);
  });
  escala.raios.forEach((px, i) => {
    if (Number.isFinite(px)) linhas.push(`  ${nomeDoRaio(i)}: ${px}px;`);
  });
  return linhas.length === 0 ? '' : `\n${linhas.join('\n')}`;
};

/**
 * CSS da marca aplicado ao site gerado.
 *
 * A tipografia sai de `buildTypographyCss` (fonte da verdade compartilhada):
 * declara `--font-display`/`--font-body` com pilha de fallback e — o que faltava
 * — aplica a fonte de títulos aos headings e a de corpo ao body. A importação da
 * família em si entra por um `<link>` no head (ver `generateSite`), carregando
 * só os pesos usados.
 *
 * A `escala` é a régua de REFERÊNCIA do kit (`escalaDeReferencia`), e chega por
 * parâmetro opcional porque quem monta a página é que sabe qual origem rege —
 * esta função só declara o que recebeu. Sem ela, o CSS sai idêntico ao de antes.
 *
 * A escala por TAG derivada dos presets (h1..h6 mais abaixo) não sai daqui e não
 * disputa com os tokens novos: ela pinta a tag nua, com especificidade (0,0,1),
 * e os tokens existem para o ponto de uso dentro das peças, que é onde a classe
 * utilitária da origem ganharia da tag.
 */
export const buildBrandingCss = (
  branding: ProjectBranding,
  escala?: EscalaDaOrigem | null,
): string => {
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
${varsSemanticas}${varsDaEscala(escala)}
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

  // A montagem inteira delega ao `montarPaginaDoKit` — a MESMA implementação
  // do modo fila. Antes eram dois montadores (o laço daqui e o passo a passo
  // do CLAUDE.md), e todo conserto tinha de acontecer duas vezes ou divergir
  // em silêncio: a recoloração e o fundo-como-camada nasceram no montador novo
  // e este laço nunca os teria. O plano do LLM entra como o CRIATIVO
  // (substituições por seção), que é exatamente o formato que o montador
  // espera.
  const resultado = montarPaginaDoKit({
    projectId: input.projectId as `prj_${string}`,
    titulo: input.projectName,
    kit: { id: input.kit.id, components: input.kit.components },
    designSystem: input.kit.designSystem ?? null,
    layout: input.layout,
    branding: input.branding,
    secoes: plan.sections.map((sec) => ({
      secaoId: sec.secaoId,
      substituicoes: sec.substitutions,
    })),
    // A mídia do projeto ATRAVESSA para o montador — e não atravessava.
    //
    // Este caminho chamava o montador sem `midia` nenhuma, então ele não tinha
    // por onde trocar as fotos que a peça trouxe da origem, e o site do cliente
    // saía com o acervo fotográfico de outra empresa. A prova de que ninguém
    // tinha reparado é que o manifesto já trazia tudo o que faltava: `path` é o
    // mesmo `de` relativo a `projects/<id>/media/`, `secaoId` é onde o dono pôs
    // a imagem e `kind` separa foto de logo.
    midia: input.media.map((m) => ({
      de: m.path,
      para: `midia/${m.path}`,
      secaoId: m.secaoId,
      kind: m.kind,
    })),
    outputDir,
  });
  for (const aviso of resultado.avisos) opts.onProgress?.(aviso);
  if (resultado.faltando.length > 0) {
    opts.onProgress?.(`Peças sem bundle em disco: ${resultado.faltando.join(', ')}`);
  }
  opts.onProgress?.(
    `Recoloração: ${resultado.recoloracao.reescritas} cor(es) apontando para a marca em ${resultado.recoloracao.origens} origem(ns)`,
  );

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

  const totalBytes = resultado.arquivos.reduce((n, rel) => {
    try {
      return n + readFileSync(join(outputDir, rel)).length;
    } catch {
      return n;
    }
  }, 0);
  return { outputDir, plan, totalBytes };
};
