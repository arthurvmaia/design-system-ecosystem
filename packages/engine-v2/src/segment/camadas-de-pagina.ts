import type { StructuralNode, VisualLayer } from '@ds/shared';

/**
 * As camadas que atravessam a página inteira — o fundo por trás de todas as
 * dobras.
 *
 * A segmentação corta a página em dobras e olha o que está DENTRO de cada uma.
 * Só que o traço mais característico de muitos sites não vive dentro de dobra
 * nenhuma: é uma camada fixa por baixo de todas — o canvas com as duas linhas
 * de luz do Cogni, os blobs de gradiente, o grão. Medido, o motor as vê e as
 * rotula (`fixed`, `background`), mas a posse delas cai no `<body>`, que não é
 * uma dobra escolhida — então nenhum segmento as carregava e elas sumiam.
 *
 * Aqui elas viram componente por direito próprio, separadas em dois grupos que
 * NÃO se misturam porque têm fidelidade diferente: o que é puro CSS viaja
 * inteiro; o que depende de runtime (canvas/WebGL/vídeo) precisa do script para
 * se mexer, e isso tem de ficar dito.
 */

/** Papéis de camada que descrevem pano de fundo, não conteúdo. */
const PAPEIS_DE_FUNDO = new Set(['fixed', 'background']);

/**
 * Uma camada de página é GRANDE em relação à tela. O corte é por ÁREA, não por
 * largura: um blob de gradiente de `50vw` é quadrado e fica meio fora da tela
 * (`top:-20%; left:-10%`), então reprova em qualquer regra de "ocupa a largura
 * toda" — e é exatamente o degradê que dá o clima do site. Área pega os dois
 * casos: a folha que forra a tela inteira e o brilho que a banha.
 */
const FRACAO_DE_AREA = 0.15;
/** Mesmo grande em área, uma faixa fininha é separador, não fundo. */
const LADO_MINIMO = 0.25;

/** Teto por grupo: fundo é uma composição, não um catálogo. */
const MAX_POR_GRUPO = 6;

export type CamadasDePagina = {
  /** Hashes das camadas que dependem de runtime para se mexer. */
  comRuntime: string[];
  /** Hashes das camadas que são puro CSS (gradiente, blur, grão). */
  soCss: string[];
};

/**
 * Escolhe as camadas de página a partir da medição.
 *
 * `hashesComRuntime` são os elementos que a captura ligou a mídia ou runtime
 * (canvas, WebGL, vídeo, lottie) — quem decide isso é o chamador, que tem as
 * detecções em mãos. Puro: recebe medição, devolve decisão.
 */
export const escolherCamadasDePagina = (opts: {
  camadas: readonly VisualLayer[];
  nos: readonly StructuralNode[];
  viewport: { width: number; height: number };
  /** Altura TOTAL da página: é contra ela que "atravessa a página" se mede. */
  pageHeight: number;
  hashesComRuntime: ReadonlySet<string>;
}): CamadasDePagina => {
  const { camadas, nos, viewport, pageHeight, hashesComRuntime } = opts;
  const porHash = new Map(nos.map((n) => [n.fingerprint.hash, n]));
  const areaDaTela = Math.max(1, viewport.width * viewport.height);
  const larguraMinima = viewport.width * LADO_MINIMO;
  const alturaMinima = viewport.height * LADO_MINIMO;

  const comRuntime: string[] = [];
  const soCss: string[] = [];
  const vistos = new Set<string>();

  for (const camada of camadas) {
    if (!PAPEIS_DE_FUNDO.has(camada.role)) continue;
    const caixa = camada.pageBox;
    if (caixa === undefined) continue;
    if (caixa.w < larguraMinima || caixa.h < alturaMinima) continue;
    if ((caixa.w * caixa.h) / areaDaTela < FRACAO_DE_AREA) continue;

    const hash = camada.fingerprint.hash;
    if (vistos.has(hash)) continue;
    // O `<body>` e a `<html>` também são camadas de tela cheia, e não são fundo:
    // são a página. O nó estrutural diz quem é quem.
    const no = porHash.get(hash);
    if (no !== undefined && (no.role === 'document' || no.parent === null)) continue;
    const tag = camada.fingerprint.tag.toLowerCase();
    if (tag === 'body' || tag === 'html') continue;

    // "Camada de PÁGINA" precisa atravessar a página, e a régua é a ALTURA DA
    // PÁGINA, não a da viewport. Medido no acervo: das 31 camadas escolhidas
    // pela regra antiga, 22 cobriam menos de 30% da página — o fundo do hero
    // (900 px numa página de 4795) era colado atrás de todas as dobras.
    const fixa = camada.stacking.position === 'fixed';
    const atravessa = pageHeight > 0 && caixa.h >= pageHeight * 0.7;
    if (!fixa && !atravessa) continue;

    // Fundo não tem texto. O header fixo do antigravity virou "Fundo da
    // página" porque `fixed` entrava sem olhar conteúdo — uma barra cheia de
    // links não é pano de fundo, é navegação.
    if ((no?.subtreeTextLength ?? 0) > 40) continue;

    vistos.add(hash);
    const temRuntime =
      hashesComRuntime.has(hash) ||
      (no?.mediaTags ?? []).some((t) => t === 'canvas' || t === 'video' || t === 'iframe');
    const destino = temRuntime ? comRuntime : soCss;
    if (destino.length < MAX_POR_GRUPO) destino.push(hash);
  }

  return { comRuntime, soCss };
};
