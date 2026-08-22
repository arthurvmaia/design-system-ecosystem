/// <reference lib="dom" />

/**
 * O que se MEDE numa apresentação, e por que estas coisas.
 *
 * A apresentação nasceu sem régua, e a primeira consequência apareceu na
 * primeira leitura: um conceito de banner saiu recortado pelo `object-fit`, com
 * a headline cortada no meio, numa página cujo propósito é mostrar a peça
 * inteira. Quem viu foi o olho, ao abrir o PDF.
 *
 * É a mesma classe de defeito que C2 pega nas peças — conteúdo que existe no
 * documento e não aparece —, e a resposta é a mesma: medir a geometria em vez
 * de confiar no CSS.
 *
 * Roda no navegador, injetada numa página, como o resto do motor.
 */

export type MedidaDaApresentacao = {
  readonly paginas: number;
  /**
   * O que TRANSBORDA a própria página.
   *
   * Cada página é um quadro fechado que vira uma folha de PDF: o que passa da
   * borda não é cortado com aviso, é simplesmente perdido na impressão.
   */
  readonly transbordos: readonly { readonly pagina: number; readonly onde: string }[];
  /**
   * As imagens marcadas `data-inteiro` que estão sendo RECORTADAS.
   *
   * A proporção renderizada contra a do arquivo responde exato. Uma imagem de
   * referência pode ser recortada; uma de aplicação não — ela existe para
   * mostrar a peça inteira, e recortada ela vira outra peça.
   */
  readonly recortadas: readonly {
    readonly pagina: number;
    readonly alt: string;
    readonly proporcaoNoArquivo: number;
    readonly proporcaoNaPagina: number;
  }[];
  /** Imagens que não carregaram. Elas ocupam lugar e não mostram nada. */
  readonly quebradas: readonly { readonly pagina: number; readonly alt: string }[];
  /** A família que o corpo do documento realmente está usando. */
  readonly familiaAplicada: string | null;
};

/** Mede a apresentação já carregada na página. */
export function medirApresentacao(): MedidaDaApresentacao {
  const FOLGA = 2;
  const DESVIO = 0.02;

  const paginas = Array.from(document.querySelectorAll('section.p'));
  const transbordos: { pagina: number; onde: string }[] = [];
  const recortadas: {
    pagina: number;
    alt: string;
    proporcaoNoArquivo: number;
    proporcaoNaPagina: number;
  }[] = [];
  const quebradas: { pagina: number; alt: string }[] = [];

  const nomeDe = (el: Element): string => {
    const alt = el.getAttribute('alt');
    if (alt !== null && alt.trim() !== '') return alt;
    const texto = (el.textContent ?? '').trim().slice(0, 40);
    return texto === '' ? el.tagName.toLowerCase() : texto;
  };

  paginas.forEach((secao, i) => {
    const n = i + 1;
    const quadro = secao.getBoundingClientRect();

    for (const el of Array.from(secao.querySelectorAll('*'))) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) continue;
      if (
        r.top < quadro.top - FOLGA ||
        r.bottom > quadro.bottom + FOLGA ||
        r.left < quadro.left - FOLGA ||
        r.right > quadro.right + FOLGA
      ) {
        const onde = nomeDe(el);
        if (!transbordos.some((t) => t.pagina === n && t.onde === onde)) {
          transbordos.push({ pagina: n, onde });
        }
      }
    }

    for (const img of Array.from(secao.querySelectorAll('img'))) {
      const alt = nomeDe(img);
      if (!img.naturalWidth) {
        quebradas.push({ pagina: n, alt });
        continue;
      }
      if (!img.hasAttribute('data-inteiro')) continue;
      const r = img.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      const noArquivo = img.naturalWidth / img.naturalHeight;
      const naPagina = r.width / r.height;
      if (Math.abs(naPagina - noArquivo) / noArquivo > DESVIO) {
        recortadas.push({
          pagina: n,
          alt,
          proporcaoNoArquivo: noArquivo,
          proporcaoNaPagina: naPagina,
        });
      }
    }
  });

  const corpo = document.querySelector('h2') ?? document.querySelector('h1');
  const familiaAplicada =
    corpo === null
      ? null
      : (getComputedStyle(corpo).fontFamily.split(',')[0] ?? '').replace(/['"]/g, '').trim();

  return { paginas: paginas.length, transbordos, recortadas, quebradas, familiaAplicada };
}
