import type { RuntimeKind } from '@ds/shared';

/**
 * Levar a biblioteca que o site usa, para reproduzir o que ela desenha.
 *
 * O motor já detecta cada runtime (Iconify, Tailwind por CDN, GSAP, Three, o
 * script que pinta o fundo em canvas) e já **baixa** os arquivos `.js` para
 * `capture-v2/assets/js/`. O que faltava era o passo óbvio depois disso: o
 * bundle continuava emitindo `<script src="https://cdn…">`, apontando para o
 * endereço original. A biblioteca estava no disco e o arquivo entregue a
 * ignorava.
 *
 * O efeito é o que se esperaria: o site gerado só funciona com internet, e só
 * enquanto aquele CDN existir. Um `.zip` entregue a um cliente que abre offline
 * mostra caixas vazias e fundo morto — e nada no arquivo explica por quê.
 *
 * A decisão NÃO é "baixe tudo". Ela tem três respostas, e a do meio é a que
 * exige olhar:
 *
 * - **levar** — o script faz um trabalho que não dá para materializar de outro
 *   jeito (pintar um fundo, mover um carrossel, animar uma cena). Com ele em
 *   disco, o bundle roda sozinho.
 * - **dispensar** — a saída daquele runtime JÁ foi materializada, e carregar a
 *   biblioteca seria peso morto que ainda por cima recomeçaria o trabalho:
 *   o Tailwind por CDN compila classes que já capturamos do CSSOM; o Iconify
 *   desenha ícones que já trouxemos para o HTML.
 * - **remoto** — não está em disco (a busca falhou, ou o arquivo é servido só
 *   com credencial). Fica a URL original, e a dependência de rede é declarada.
 *
 * E um detalhe que muda a resposta e é fácil de errar: **para o Iconify,
 * localizar a biblioteca não resolve nada.** O traçado de cada ícone vem de
 * `api.iconify.design` em tempo de execução; ter o `iconify-icon.min.js` no
 * disco só significa ter o carteiro, não a carta. Quem tira o Iconify da rede é
 * o inline do SVG, não a cópia do script.
 */

/** O que fazer com um script da página. */
export type DecisaoDeScript = 'levar' | 'dispensar' | 'remoto';

export type ScriptDaPagina = {
  /** URL original, como aparece no documento. */
  url: string;
  /** Caminho local dentro de `capture-v2/assets/`, quando foi baixado. */
  localPath?: string;
};

export type ScriptDecidido = ScriptDaPagina & {
  decisao: DecisaoDeScript;
  /** Por quê — vai para os avisos do bundle, nunca fica só no código. */
  motivo: string;
  /** O runtime que este script serve, quando reconhecido. */
  runtime?: RuntimeKind;
};

/** Reconhece pelo nome do arquivo qual runtime aquele script serve. */
const RUNTIME_DO_SCRIPT: Array<[RuntimeKind, RegExp]> = [
  ['iconify', /iconify/i],
  ['tailwind-cdn', /cdn\.tailwindcss\.com|tailwindcss@|tailwind\.min\.js/i],
  ['three', /three(\.min)?\.(m?js)/i],
  ['gsap', /gsap|TweenMax|TimelineMax/i],
  ['scrolltrigger', /scrolltrigger/i],
  ['lottie', /lottie|bodymovin|dotlottie/i],
  ['swiper', /swiper/i],
  ['embla', /embla/i],
  ['splide', /splide/i],
  ['lenis', /lenis/i],
  ['locomotive', /locomotive-scroll/i],
  ['p5', /p5(\.min)?\.js/i],
  ['matter', /matter(\.min)?\.js/i],
  ['anime', /anime(\.min)?\.js/i],
  ['pixi', /pixi/i],
  ['barba', /barba/i],
];

const runtimeDoScript = (url: string): RuntimeKind | undefined =>
  RUNTIME_DO_SCRIPT.find(([, re]) => re.test(url))?.[0];

export type ContextoDaDecisao = {
  /**
   * O CSS que o Tailwind por CDN compila foi capturado do CSSOM?
   *
   * Quando sim, a biblioteca é peso morto — e pior, ela recomeçaria a
   * compilação no navegador de quem abrir o site, sobrescrevendo o que já está
   * pronto.
   */
  cssCompiladoCapturado: boolean;
  /** Ícones que ficaram como casca. Zero significa que o Iconify não faz falta. */
  iconesPendentes: number;
};

/**
 * Decide o destino de cada script da página.
 *
 * Função pura: recebe a lista e o contexto, devolve a decisão com o motivo
 * escrito. Quem copia arquivo é o compilador.
 */
export const decidirScripts = (
  scripts: readonly ScriptDaPagina[],
  ctx: ContextoDaDecisao,
): ScriptDecidido[] =>
  scripts.map((s) => {
    const runtime = runtimeDoScript(s.url);

    if (runtime === 'tailwind-cdn' && ctx.cssCompiladoCapturado) {
      return {
        ...s,
        runtime,
        decisao: 'dispensar',
        motivo:
          'Tailwind por CDN dispensado: o CSS que ele compila já foi capturado do CSSOM. Levá-lo faria o navegador recompilar tudo por cima do que já está pronto.',
      };
    }

    if (runtime === 'iconify' && ctx.iconesPendentes === 0) {
      return {
        ...s,
        runtime,
        decisao: 'dispensar',
        motivo:
          'Biblioteca de ícones dispensada: os SVGs foram trazidos para o HTML e não dependem mais dela.',
      };
    }

    if (s.localPath !== undefined && s.localPath.length > 0) {
      return {
        ...s,
        runtime,
        decisao: 'levar',
        motivo:
          runtime === 'iconify'
            ? // Honestidade sobre o alcance: a biblioteca viaja, mas o traçado
              // de cada ícone continua vindo de uma API. Dizer "agora funciona
              // offline" aqui seria falso.
              'Biblioteca de ícones incluída no bundle. Atenção: o desenho de cada ícone ainda é buscado na API da biblioteca em tempo de execução — só o inline do SVG tira essa dependência.'
            : `${runtime ?? 'Script'} incluído no bundle: o site roda sem depender do endereço original.`,
      };
    }

    return {
      ...s,
      runtime,
      decisao: 'remoto',
      motivo: `Script não pôde ser baixado e continua apontando para a origem (${s.url}): o site precisa de internet para reproduzir o que ele faz.`,
    };
  });

/**
 * Os runtimes que passaram a viajar no bundle.
 *
 * É o que a classificação usa para deixar de tratar como dependência de rede o
 * que já não é. Só entra o que a cópia do script de fato resolve — o Iconify
 * fica de fora de propósito, pelo motivo explicado no topo do arquivo.
 */
export const runtimesQueViajam = (decididos: readonly ScriptDecidido[]): RuntimeKind[] => {
  const out = new Set<RuntimeKind>();
  for (const d of decididos) {
    if (d.decisao !== 'levar') continue;
    if (d.runtime === undefined) continue;
    if (d.runtime === 'iconify') continue;
    out.add(d.runtime);
  }
  return [...out];
};

/** O caminho do script dentro do bundle, ou a URL remota quando não deu. */
export const refDoScript = (d: ScriptDecidido): string | null => {
  if (d.decisao === 'dispensar') return null;
  if (d.decisao === 'levar' && d.localPath !== undefined) return `assets/${d.localPath}`;
  return d.url;
};
