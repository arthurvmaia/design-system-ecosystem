import postcss from 'postcss';

/**
 * Os tokens de MOVIMENTO de uma folha de estilo: quanto tempo as coisas levam e
 * com que curva.
 *
 * O dono pediu que as animações do app viessem do design system que ele extrai,
 * e a ideia é auto-referente do jeito certo: o app que colhe vocabulário visual
 * passa a usar o vocabulário que colheu.
 *
 * Mas com uma trava que não é negociável: **nada de CSS de terceiro no shell**.
 * O `PreviewFrame` isola conteúdo de origem em iframe com `sandbox` e sem
 * `allow-same-origin` por um motivo; regra arbitrária solta no app fura esse
 * isolamento e ainda quebra layout de forma imprevisível. O que atravessa a
 * fronteira aqui são NÚMEROS — uma duração, uma curva — e número não executa.
 *
 * É a diferença entre inspirado no acervo e contaminado pelo acervo.
 *
 * A mediana, e não a média: uma folha com um `transition: 30s` de carrossel
 * arrastaria a média para um valor que não descreve nada. A mediana ignora o
 * exagero isolado, que é exatamente o que se quer de uma medida de "o ritmo
 * deste site".
 */

export type TokensDeMovimento = {
  /** Mediana das durações curtas (reações: hover, foco, cor). */
  rapidaMs: number;
  /** Mediana das durações longas (entradas, revelações). */
  mediaMs: number;
  /** A curva mais frequente. */
  easing: string;
  /** Quantas declarações sustentam a medida. Zero = nada foi medido. */
  amostras: number;
};

/** O que o app usa quando o acervo não tem o que dizer. */
export const MOVIMENTO_PADRAO: TokensDeMovimento = {
  rapidaMs: 150,
  mediaMs: 300,
  easing: 'cubic-bezier(0.4, 0, 0.2, 1)',
  amostras: 0,
};

const DURACAO = /(\d*\.?\d+)\s*(ms|s)\b/g;
const CURVA =
  /(cubic-bezier\([^)]*\)|linear|ease-in-out|ease-in|ease-out|ease|steps\([^)]*\))(?![\w-])/g;

/** Mediana de uma lista já ordenada de números. Lista vazia devolve `null`. */
const mediana = (ordenada: number[]): number | null => {
  if (ordenada.length === 0) return null;
  const meio = Math.floor(ordenada.length / 2);
  const alto = ordenada[meio] ?? 0;
  if (ordenada.length % 2 === 1) return alto;
  const baixo = ordenada[meio - 1] ?? alto;
  return Math.round((baixo + alto) / 2);
};

/**
 * Lê durações e curvas de `transition*` e `animation*`.
 *
 * Fora do intervalo de 40ms a 2s nada entra: abaixo disso é ajuste imperceptível
 * (e costuma ser `0s` de reset), acima é carrossel ou loop de fundo — nenhum dos
 * dois descreve a reação de uma interface ao toque de alguém.
 */
export const tokensDeMovimento = (css: string): TokensDeMovimento => {
  let raiz: postcss.Root;
  try {
    raiz = postcss.parse(css);
  } catch {
    return MOVIMENTO_PADRAO;
  }

  const duracoes: number[] = [];
  const curvas = new Map<string, number>();

  raiz.walkDecls((decl) => {
    const prop = decl.prop.toLowerCase();
    const ehTempo = /^(transition|animation)(-duration)?$/.test(prop);
    const ehCurva = /^(transition|animation)(-timing-function)?$/.test(prop);
    if (!ehTempo && !ehCurva) return;

    if (ehTempo) {
      for (const m of decl.value.matchAll(DURACAO)) {
        const n = Number.parseFloat(m[1] ?? '');
        if (!Number.isFinite(n)) continue;
        const ms = m[2] === 's' ? n * 1000 : n;
        if (ms >= 40 && ms <= 2000) duracoes.push(Math.round(ms));
      }
    }
    if (ehCurva) {
      for (const m of decl.value.matchAll(CURVA)) {
        const c = (m[1] ?? '').replace(/\s+/g, ' ').trim();
        if (c !== '') curvas.set(c, (curvas.get(c) ?? 0) + 1);
      }
    }
  });

  if (duracoes.length === 0 && curvas.size === 0) return MOVIMENTO_PADRAO;

  duracoes.sort((a, b) => a - b);
  // O corte entre "reação" e "entrada" é a própria mediana da folha: acima dela
  // ficam as durações longas do site, abaixo as curtas. Isso faz o par sair da
  // distribuição real em vez de um limiar que eu escolhi de fora.
  const meio = mediana(duracoes);
  const curtas = meio === null ? [] : duracoes.filter((d) => d <= meio);
  const longas = meio === null ? [] : duracoes.filter((d) => d > meio);

  const maisFrequente = [...curvas.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];

  return {
    rapidaMs: mediana(curtas) ?? MOVIMENTO_PADRAO.rapidaMs,
    mediaMs: mediana(longas) ?? meio ?? MOVIMENTO_PADRAO.mediaMs,
    easing: maisFrequente ?? MOVIMENTO_PADRAO.easing,
    amostras: duracoes.length,
  };
};

/**
 * Os tokens como declarações CSS, prontos para entrar num `:root`.
 *
 * São só custom properties com valor numérico — nenhum seletor, nenhuma regra
 * do site de origem. É o formato que mantém a promessa de não contaminar.
 */
export const cssDosTokensDeMovimento = (t: TokensDeMovimento): string =>
  [
    `--orbis-duracao-rapida: ${t.rapidaMs}ms;`,
    `--orbis-duracao-media: ${t.mediaMs}ms;`,
    `--orbis-easing: ${t.easing};`,
  ].join('\n');
