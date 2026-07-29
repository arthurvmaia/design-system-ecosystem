import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { lerCssDoBundle } from './cascata.js';

/**
 * Medir a fidelidade de um bundle — sem navegador, sem rede, sem opinião.
 *
 * A pergunta que este arquivo responde é uma só: **o que sai do bundle é o que
 * estava na página?** Até aqui a resposta era impressão. Alguém abria a Galeria,
 * comparava com o site e dizia "está diferente". Impressão não serve para
 * comparar duas versões do motor: sem número, "melhorou" é fé.
 *
 * Cinco medidas, todas derivadas de arquivo em disco:
 *
 * 1. **CSS retido** — quantas regras o bundle guardou das que a página tinha.
 *    É a medida que mais dói: uma poda agressiva devolve um bundle bonito no
 *    preview (que carrega o CSS da origem por fora) e quebrado no `.zip`.
 * 2. **Seletores mortos** — regras cujo seletor exige um ancestral que o bundle
 *    não tem. Elas contam como "retidas" e não valem nada; sem separá-las, um
 *    bundle que levou todo o CSS e perdeu o `<body class="dark">` parece íntegro.
 * 3. **Instrumentação vazada** — `data-dsx*` no HTML entregue. É lixo nosso no
 *    arquivo do usuário, e denuncia limpeza incompleta.
 * 4. **Scripts declarados × presentes** — `<script src>` que o índice pede e não
 *    existem no bundle. É o que faz ícone não desenhar e fundo não aparecer.
 * 5. **Ícones não desenhados** — web component de ícone que ficou como casca
 *    vazia, sem SVG dentro. A caixa aparece, o desenho não.
 *
 * Tudo é contagem simples e determinística. Nada aqui tenta adivinhar se o
 * resultado "parece" certo: isso é trabalho de comparação de pixel, que roda
 * noutro lugar e é caro. Este medidor é o que se pode rodar sobre o acervo
 * inteiro em segundos.
 */

/** Uma medida de um bundle. Tudo em número, para comparar duas rodadas. */
export type MedidaDeBundle = {
  /** Caminho do bundle medido. */
  dir: string;
  /** Rótulo curto para o relatório (nome do segmento ou do componente). */
  nome: string;
  /** Regras CSS no bundle. */
  regras: number;
  /** Regras CSS na origem (a captura inteira), quando disponível. */
  regrasNaOrigem: number | null;
  /** `regras / regrasNaOrigem`, em porcentagem. `null` sem origem para comparar. */
  retencao: number | null;
  /** Regras cujo seletor exige ancestral ausente do HTML do bundle. */
  seletoresMortos: number;
  /** Ocorrências de `data-dsx*` no HTML entregue. */
  instrumentacaoVazada: number;
  /** `<script src>` locais pedidos pelo índice. */
  scriptsDeclarados: number;
  /** Desses, quantos não existem em disco. */
  scriptsAusentes: number;
  /** `<script src>` para fora (CDN): contam como dependência de rede. */
  scriptsRemotos: number;
  /** Web components de ícone sem SVG dentro. */
  iconesVazios: number;
  /** Ícones que chegaram com o SVG inline (o que queremos). */
  iconesInline: number;
};

/** O resumo de uma rodada inteira — é isto que se compara entre duas versões. */
export type LinhaDeBase = {
  gravadoEm: number;
  bundles: MedidaDeBundle[];
  resumo: {
    total: number;
    /** Média de retenção entre os bundles que têm origem para comparar. */
    retencaoMedia: number | null;
    retencaoMinima: number | null;
    retencaoMaxima: number | null;
    comSeletorMorto: number;
    comInstrumentacao: number;
    comScriptAusente: number;
    comIconeVazio: number;
  };
};

/**
 * Conta regras CSS sem montar um parser.
 *
 * Uma "regra" aqui é um bloco `{...}` que não é `@media`/`@supports` (esses são
 * containers e seriam contados duas vezes). É aproximado de propósito: a medida
 * serve para comparar dois números produzidos do mesmo jeito, não para auditar
 * uma folha de estilo.
 */
export const contarRegras = (css: string): number => {
  let n = 0;
  let i = 0;
  let dentroDeComentario = false;
  while (i < css.length) {
    if (dentroDeComentario) {
      if (css.startsWith('*/', i)) {
        dentroDeComentario = false;
        i += 2;
        continue;
      }
      i++;
      continue;
    }
    if (css.startsWith('/*', i)) {
      dentroDeComentario = true;
      i += 2;
      continue;
    }
    if (css[i] === '{') {
      // O seletor é o que veio desde o último `}` ou `{`.
      const antes = css.slice(Math.max(0, i - 400), i);
      const corte = Math.max(antes.lastIndexOf('}'), antes.lastIndexOf('{'));
      const seletor = antes.slice(corte + 1).trim();
      // `@media`, `@supports`, `@layer`, `@container` abrem bloco mas não são
      // regra: as regras deles serão contadas quando aparecerem dentro.
      if (!/^@(media|supports|layer|container|scope|document)\b/i.test(seletor)) n++;
    }
    i++;
  }
  return n;
};

/**
 * Seletores que exigem um ancestral que o bundle não tem.
 *
 * O caso que motivou a medida: `html.dark body .card` continua no CSS depois de
 * a poda o ter deixado passar, mas o bundle saía sem `class="dark"` no `<html>`
 * — a regra existe, está íntegra, e não pinta nada. Nenhum erro é emitido. Este
 * contador é o único jeito de ver isso sem abrir o navegador.
 *
 * Olha só as âncoras de documento (`html`/`body` com classe ou atributo), que
 * são as que somem quando o documento não viaja com o segmento. Classe de
 * elemento comum não entra: um seletor pode mirar coisa que só existe num
 * estado, e isso não é defeito.
 */
export const contarSeletoresMortos = (css: string, html: string): number => {
  const attrsHtml = /<html\b([^>]*)>/i.exec(html)?.[1] ?? '';
  const attrsBody = /<body\b([^>]*)>/i.exec(html)?.[1] ?? '';
  const classesDe = (attrs: string): Set<string> =>
    new Set(
      (/class\s*=\s*("([^"]*)"|'([^']*)')/i.exec(attrs)?.[2] ?? '')
        .split(/\s+/)
        .filter((c) => c.length > 0),
    );
  const classesHtml = classesDe(attrsHtml);
  const classesBody = classesDe(attrsBody);
  const temAtributo = (attrs: string, nome: string): boolean =>
    new RegExp(`\\b${nome.replace(/[^\w-]/g, '')}\\s*[=\\]]`, 'i').test(`${attrs}]`);

  let mortos = 0;
  // Cada seletor que começa ancorado em html/body com qualificador.
  for (const m of css.matchAll(/(^|[},])\s*([^{},]{0,300}?)\s*\{/g)) {
    const lista = (m[2] ?? '').trim();
    if (lista.length === 0 || lista.startsWith('@')) continue;
    for (const sel of lista.split(',')) {
      const s = sel.trim();
      const ancora = /^(html|body)((?:[.#][\w-]+|\[[^\]]+\])+)/i.exec(s);
      if (ancora === null) continue;
      const alvo = (ancora[1] ?? '').toLowerCase();
      const quals = ancora[2] ?? '';
      const classes = alvo === 'html' ? classesHtml : classesBody;
      const attrs = alvo === 'html' ? attrsHtml : attrsBody;
      let vivo = true;
      for (const q of quals.matchAll(/[.#]([\w-]+)|\[([\w-]+)/g)) {
        const classe = q[1];
        const attr = q[2];
        if (classe !== undefined && !classes.has(classe)) vivo = false;
        if (attr !== undefined && !temAtributo(attrs, attr)) vivo = false;
      }
      if (!vivo) mortos++;
    }
  }
  return mortos;
};

/** Ocorrências de instrumentação nossa que vazaram para o arquivo entregue. */
export const contarInstrumentacao = (html: string): number =>
  [...html.matchAll(/\bdata-dsx[\w-]*/gi)].length;

const CDN_CONHECIDAS = /^(https?:)?\/\//i;

/** Scripts que o índice pede: quantos são locais, quantos faltam, quantos remotos. */
export const medirScripts = (
  html: string,
  dir: string,
): { declarados: number; ausentes: number; remotos: number } => {
  let declarados = 0;
  let ausentes = 0;
  let remotos = 0;
  for (const m of html.matchAll(/<script\b[^>]*\bsrc\s*=\s*"([^"]+)"/gi)) {
    const src = m[1] ?? '';
    if (src.length === 0) continue;
    if (CDN_CONHECIDAS.test(src)) {
      remotos++;
      continue;
    }
    declarados++;
    if (!existsSync(join(dir, src))) ausentes++;
  }
  return { declarados, ausentes, remotos };
};

/**
 * Ícones: os que chegaram desenhados e os que ficaram como casca.
 *
 * `<iconify-icon icon="...">` sem nada dentro é uma caixa que nunca vira
 * desenho fora do site de origem. `<span data-ds-icone="inline">` é o oposto: o
 * SVG foi trazido para a luz e sobrevive sem rede.
 */
export const medirIcones = (html: string): { inline: number; vazios: number } => {
  const inline = [...html.matchAll(/data-ds-icone\s*=\s*"inline"/gi)].length;
  let vazios = 0;
  // Web components de ícone conhecidos, com o corpo vazio ou só espaço.
  for (const m of html.matchAll(
    /<(iconify-icon|ion-icon|lord-icon|material-symbols|iconify-emoji)\b[^>]*>([\s\S]{0,80}?)<\/\1>/gi,
  )) {
    const corpo = (m[2] ?? '').trim();
    if (corpo.length === 0 || !/<svg\b/i.test(corpo)) vazios++;
  }
  // A forma auto-fechada também é casca.
  vazios += [...html.matchAll(/<(iconify-icon|ion-icon|lord-icon)\b[^>]*\/>/gi)].length;
  // E a que o motor marcou explicitamente como não desenhada.
  vazios += [...html.matchAll(/data-ds-icone\s*=\s*"nao-desenhado"/gi)].length;
  return { inline, vazios };
};

/**
 * Todo o CSS que a PÁGINA tinha — o denominador honesto da retenção.
 *
 * São duas fontes, e usar só uma dá um número sem sentido. As folhas externas
 * ficam em `capture-v2/assets/css/` com nome hashed; o CSS inline mora nos
 * `<style>` do documento salvo em `extracted/design-system.html`. Medindo só as
 * externas, um bundle que leva os dois "retém" 300% — mediu-se contra a metade
 * do total.
 */
export const cssDaOrigem = (opts: {
  dirAssetsCaptura?: string;
  htmlDaPagina?: string;
}): string => {
  let out = '';
  const dirCss =
    opts.dirAssetsCaptura !== undefined ? join(opts.dirAssetsCaptura, 'css') : undefined;
  if (dirCss !== undefined && existsSync(dirCss)) {
    for (const nome of readdirSync(dirCss)) {
      if (!nome.endsWith('.css')) continue;
      try {
        out += `\n${readFileSync(join(dirCss, nome), 'utf8')}`;
      } catch {
        // arquivo ilegível não invalida a medida do resto
      }
    }
  }
  if (opts.htmlDaPagina !== undefined && existsSync(opts.htmlDaPagina)) {
    try {
      const doc = readFileSync(opts.htmlDaPagina, 'utf8');
      for (const m of doc.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)) out += `\n${m[1] ?? ''}`;
    } catch {
      // idem
    }
  }
  return out;
};

/**
 * Mede um bundle.
 *
 * `dirAssetsCaptura` e `htmlDaPagina` juntos formam o denominador. Sem eles a
 * retenção fica nula — o que é honesto: um bundle de Biblioteca cuja extração
 * de origem foi apagada não tem contra o que ser medido, e inventar um número
 * seria pior que não ter.
 */
export const medirBundle = (
  dir: string,
  opts: { nome?: string; dirAssetsCaptura?: string; htmlDaPagina?: string } = {},
): MedidaDeBundle | null => {
  const indexPath = join(dir, 'index.html');
  if (!existsSync(indexPath)) return null;
  const html = readFileSync(indexPath, 'utf8');
  const css = lerCssDoBundle(dir).css;
  const regras = contarRegras(css);
  const origem = cssDaOrigem(opts);
  const naOrigem = origem.length > 0 ? contarRegras(origem) : null;
  const scripts = medirScripts(html, dir);
  const icones = medirIcones(html);
  return {
    dir,
    nome: opts.nome ?? dir.split(/[\\/]/).slice(-1)[0] ?? dir,
    regras,
    regrasNaOrigem: naOrigem !== null && naOrigem > 0 ? naOrigem : null,
    retencao:
      naOrigem !== null && naOrigem > 0 ? Math.round((regras / naOrigem) * 1000) / 10 : null,
    seletoresMortos: contarSeletoresMortos(css, html),
    instrumentacaoVazada: contarInstrumentacao(html),
    scriptsDeclarados: scripts.declarados,
    scriptsAusentes: scripts.ausentes,
    scriptsRemotos: scripts.remotos,
    iconesVazios: icones.vazios,
    iconesInline: icones.inline,
  };
};

/** Junta as medidas num resumo comparável. */
export const resumir = (bundles: MedidaDeBundle[]): LinhaDeBase => {
  const comRetencao = bundles.map((b) => b.retencao).filter((r): r is number => r !== null);
  const media =
    comRetencao.length > 0
      ? Math.round((comRetencao.reduce((a, b) => a + b, 0) / comRetencao.length) * 10) / 10
      : null;
  return {
    gravadoEm: Date.now(),
    bundles,
    resumo: {
      total: bundles.length,
      retencaoMedia: media,
      retencaoMinima: comRetencao.length > 0 ? Math.min(...comRetencao) : null,
      retencaoMaxima: comRetencao.length > 0 ? Math.max(...comRetencao) : null,
      comSeletorMorto: bundles.filter((b) => b.seletoresMortos > 0).length,
      comInstrumentacao: bundles.filter((b) => b.instrumentacaoVazada > 0).length,
      comScriptAusente: bundles.filter((b) => b.scriptsAusentes > 0).length,
      comIconeVazio: bundles.filter((b) => b.iconesVazios > 0).length,
    },
  };
};

/**
 * Lista os diretórios de bundle dentro de uma pasta de bundles.
 *
 * As cópias de segurança (`seg_3.anterior`, que a recompilação deixa até a
 * medição confirmar) ficam de fora. Contá-las dobrava o acervo e envenenava a
 * comparação: os defeitos da versão antiga voltavam para a soma como se fossem
 * novos, e a linha "instrumentação 207 → 207" dizia que nada tinha melhorado
 * quando 2908 atributos haviam acabado de sair.
 */
export const bundlesEm = (raiz: string): string[] => {
  if (!existsSync(raiz)) return [];
  try {
    return readdirSync(raiz)
      .filter((n) => !n.endsWith('.anterior'))
      .map((n) => join(raiz, n))
      .filter((p) => {
        try {
          return statSync(p).isDirectory() && existsSync(join(p, 'index.html'));
        } catch {
          return false;
        }
      });
  } catch {
    return [];
  }
};

/** A comparação entre duas rodadas — é o que vai no corpo do commit. */
export const comparar = (
  antes: LinhaDeBase,
  depois: LinhaDeBase,
): { linha: string; melhorou: boolean }[] => {
  const linhas: { linha: string; melhorou: boolean }[] = [];
  const pct = (n: number | null): string => (n === null ? '—' : `${n}%`);
  linhas.push({
    linha: `CSS retido (média): ${pct(antes.resumo.retencaoMedia)} → ${pct(depois.resumo.retencaoMedia)}`,
    melhorou: (depois.resumo.retencaoMedia ?? 0) > (antes.resumo.retencaoMedia ?? 0),
  });
  const par = (rotulo: string, a: number, d: number): void => {
    linhas.push({ linha: `${rotulo}: ${a} → ${d}`, melhorou: d < a });
  };
  par('Bundles com seletor morto', antes.resumo.comSeletorMorto, depois.resumo.comSeletorMorto);
  par(
    'Bundles com instrumentação',
    antes.resumo.comInstrumentacao,
    depois.resumo.comInstrumentacao,
  );
  par('Bundles com script ausente', antes.resumo.comScriptAusente, depois.resumo.comScriptAusente);
  par('Bundles com ícone vazio', antes.resumo.comIconeVazio, depois.resumo.comIconeVazio);
  return linhas;
};
