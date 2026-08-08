import { escoparCss, nomesGlobaisDe } from './escopo.js';
import { type MapaDeRecoloracao, recolorirCss } from './recolorir.js';

/**
 * A composição de várias origens num documento só.
 *
 * O escopo do CSS (em `escopo.ts`) resolve metade do problema. A outra metade é
 * o HTML: um seletor escopado como `:where([data-ds-corpo="ds_x"]) .card` só
 * casa se existir, no documento final, um ancestral com aquele atributo.
 *
 * São **dois** proxies por peça, não um, e isso não é zelo:
 *
 * ```
 * <div data-ds-raiz="ds_x"  class="{as classes do <html> de origem}">
 *   <div data-ds-corpo="ds_x" class="{as classes do <body> de origem}">
 *     …a peça…
 * ```
 *
 * `html.dark body .card` é um seletor comuníssimo — tema no `<html>`, tipografia
 * no `<body>`. Com um proxy só, ele não teria em que casar e a peça sairia sem
 * tema. Com dois, casa exatamente como casava na origem.
 *
 * As classes originais vão nos proxies pelo mesmo motivo: `bg-[#03020A]` e
 * `text-white` escritos no `<body>` do site de origem pintam o fundo da página
 * inteira. Sem elas, a peça vem sem fundo e ninguém sabe dizer o que sumiu.
 */

/** Uma peça pronta para entrar no documento composto. */
export type PecaComposta = {
  /** Id da origem — vira o valor dos atributos de proxy. */
  origem: string;
  /** O HTML da peça (o corpo do bundle, já sem `<html>`/`<head>`). */
  html: string;
  /** O CSS inteiro da origem, na ordem da cascata dela. */
  css: string;
  /** Atributos crus de `<html>` e `<body>` da origem, quando conhecidos. */
  documentoAttrs?: { html?: string; body?: string };
  /** `<script src>` externos que a peça declara. */
  scripts?: readonly string[];
};

export type ResultadoComposicao = {
  /** O CSS de todas as origens, escopado, na ordem em que as peças entraram. */
  css: string;
  /** O HTML de cada peça, já envolvido nos proxies, na mesma ordem. */
  pecas: string[];
  /** Scripts externos, deduplicados por URL e na ordem da primeira aparição. */
  scripts: string[];
  /** Nomes globais renomeados por colisão. */
  renomeados: Array<{ origem: string; tipo: string; de: string; para: string }>;
  avisos: string[];
};

/** Os nomes de atributo, num lugar só — o CSS e o HTML precisam concordar. */
export const atributosDeProxy = (
  origem: string,
): { raiz: string; corpo: string; valor: string } => ({
  raiz: 'data-ds-raiz',
  corpo: 'data-ds-corpo',
  valor: origem,
});

/** Extrai o valor de um atributo de uma string de atributos crus. */
const valorDe = (attrs: string | undefined, nome: string): string => {
  if (attrs === undefined) return '';
  const m = new RegExp(`\\b${nome}\\s*=\\s*("([^"]*)"|'([^']*)')`, 'i').exec(attrs);
  return m?.[2] ?? m?.[3] ?? '';
};

const escaparAtributo = (v: string): string => v.replace(/"/g, '&quot;');

/**
 * Classes do `<body>` de origem que impõem o tamanho da PÁGINA, e por isso não
 * podem viajar para dentro de uma peça.
 *
 * `min-h-screen` no corpo do site de origem quer dizer "a página ocupa pelo
 * menos a tela". Copiada para o proxy de cada peça, ela passa a querer dizer
 * "esta BARRA DE MENU ocupa pelo menos a tela" — e foi exatamente o que
 * aconteceu: a nav de um site gerado saiu com 1000 px de altura e a primeira
 * dobra ficou vazia, com o menu boiando sozinho num gradiente.
 *
 * O resto das classes do corpo continua viajando, e deve: é delas que vem o
 * tema, a cor de tinta e a fonte que a peça espera ter em volta.
 */
const TAMANHO_DA_PAGINA = /^(?:min-)?h-(?:screen|full|dvh|svh|lvh)$|^min-h-\[/;

const semTamanhoDePagina = (classes: string): string =>
  classes
    .split(/\s+/)
    .filter((c) => c.length > 0 && !TAMANHO_DA_PAGINA.test(c))
    .join(' ');

/**
 * Envolve o HTML de uma peça nos dois proxies.
 *
 * Os atributos que NÃO são `class` também viajam (`data-theme`, `lang`,
 * `data-color-mode`): seletor de tema com atributo é tão comum quanto com
 * classe, e perder um é perder o tema inteiro da peça.
 */
export const envolverEmProxies = (peca: PecaComposta): string => {
  const { raiz, corpo, valor } = atributosDeProxy(peca.origem);
  const attrsHtml = peca.documentoAttrs?.html ?? '';
  const attrsBody = peca.documentoAttrs?.body ?? '';

  // `class` entra como class; os demais atributos entram como estão. `lang` sai
  // fora: repeti-lo num <div> interno confunde leitor de tela sem ganho nenhum.
  const semClasseNemLang = (attrs: string): string =>
    attrs
      .replace(/\bclass\s*=\s*("[^"]*"|'[^']*')/i, '')
      .replace(/\blang\s*=\s*("[^"]*"|'[^']*')/i, '')
      .trim();

  const classesDaRaiz = semTamanhoDePagina(valorDe(attrsHtml, 'class'));
  const abreRaiz = [
    `<div ${raiz}="${escaparAtributo(valor)}"`,
    classesDaRaiz.length > 0 ? ` class="${escaparAtributo(classesDaRaiz)}"` : '',
    semClasseNemLang(attrsHtml).length > 0 ? ` ${semClasseNemLang(attrsHtml)}` : '',
    '>',
  ].join('');

  const classesDoCorpo = semTamanhoDePagina(valorDe(attrsBody, 'class'));
  const abreCorpo = [
    `<div ${corpo}="${escaparAtributo(valor)}"`,
    classesDoCorpo.length > 0 ? ` class="${escaparAtributo(classesDoCorpo)}"` : '',
    semClasseNemLang(attrsBody).length > 0 ? ` ${semClasseNemLang(attrsBody)}` : '',
    '>',
  ].join('');

  return `${abreRaiz}${abreCorpo}${peca.html}</div></div>`;
};

/**
 * Compõe as peças.
 *
 * A ordem das peças é a ordem do CSS: a primeira origem entra primeiro e as
 * seguintes vão depois. Como cada uma está escopada com especificidade zero,
 * essa ordem não decide quem vence — decide só a ordem de leitura do arquivo,
 * que é o que se quer para conseguir depurar.
 */
export type OpcoesComposicao = {
  /**
   * Mapa de recoloração POR ORIGEM (hexOpaco → papel semântico).
   *
   * A recoloração roda ANTES do escopo, sobre o CSS cru do bundle — o mesmo
   * texto que a consolidação inventariou, então as chaves casam por
   * construção. A ordem também mantém as duas transformações cegas uma para a
   * outra: a recoloração nunca vê `:where(...)`, o escopo nunca vê
   * `rgb(from ...)`.
   *
   * Origem sem entrada no mapa sai com as cores originais — kit antigo, peça
   * com "manter cores originais", consolidação que falhou: tudo degrada para a
   * aparência de origem, e o resultado diz quanto foi reescrito.
   */
  recoloracaoPorOrigem?: ReadonlyMap<string, MapaDeRecoloracao>;
};

export const compor = (
  pecas: readonly PecaComposta[],
  opcoes?: OpcoesComposicao,
): ResultadoComposicao => {
  const avisos: string[] = [];
  const renomeados: ResultadoComposicao['renomeados'] = [];
  const partesCss: string[] = [];
  const html: string[] = [];
  const scripts: string[] = [];
  const scriptsVistos = new Set<string>();

  // Nomes globais acumulados: a primeira origem a declarar `@keyframes girar`
  // fica com o nome; a segunda é que renomeia. Assim o diff fica no lado novo.
  const usados = {
    keyframes: new Set<string>(),
    fontFace: new Set<string>(),
    layer: new Set<string>(),
  };

  // Uma origem repetida (duas peças do mesmo site) escopa uma vez só: o CSS é
  // idêntico, e duplicá-lo dobraria o arquivo sem mudar nada na tela.
  const origensComCss = new Set<string>();

  for (const peca of pecas) {
    const { raiz, corpo } = atributosDeProxy(peca.origem);

    if (!origensComCss.has(peca.origem) && peca.css.trim().length > 0) {
      origensComCss.add(peca.origem);

      // Recolorir antes de escopar (ver OpcoesComposicao).
      let cssDaOrigem = peca.css;
      const mapa = opcoes?.recoloracaoPorOrigem?.get(peca.origem);
      if (mapa !== undefined && mapa.size > 0) {
        const rec = recolorirCss(cssDaOrigem, mapa);
        cssDaOrigem = rec.css;
        avisos.push(
          `[${peca.origem}] recoloração: ${rec.reescritas} cor(es) apontando para a marca, ${rec.mantidas} mantida(s).`,
        );
        avisos.push(...rec.avisos.map((a) => `[${peca.origem}] ${a}`));
      }

      const r = escoparCss(cssDaOrigem, {
        raiz: `${raiz}="${peca.origem}"`,
        corpo: `${corpo}="${peca.origem}"`,
        sufixo: peca.origem,
        nomesUsados: usados,
      });
      partesCss.push(`/* origem: ${peca.origem} */\n${r.css}`);
      avisos.push(...r.avisos.map((a) => `[${peca.origem}] ${a}`));
      for (const n of r.renomeados) renomeados.push({ origem: peca.origem, ...n });

      // Agora sim: o que esta origem declarou passa a contar como usado.
      const meus = nomesGlobaisDe(r.css);
      for (const n of meus.keyframes) usados.keyframes.add(n);
      for (const n of meus.fontFace) usados.fontFace.add(n);
      for (const n of meus.layer) usados.layer.add(n);
    }

    html.push(envolverEmProxies(peca));

    for (const s of peca.scripts ?? []) {
      if (scriptsVistos.has(s)) continue;
      scriptsVistos.add(s);
      scripts.push(s);
    }
  }

  return { css: partesCss.join('\n\n'), pecas: html, scripts, renomeados, avisos };
};
