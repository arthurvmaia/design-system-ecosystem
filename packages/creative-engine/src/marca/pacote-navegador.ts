/// <reference lib="dom" />

/**
 * As peças da marca que saem do símbolo por CÁLCULO — o desenho, no navegador.
 *
 * ## O que está aqui, e por que nada disto é gerado
 *
 * A referência de marca entrega logotipo principal, versão por extenso,
 * monograma, favicon em vários tamanhos e comportamento em redução. Pedir cada
 * um ao gerador seria pedir um desenho NOVO a cada vez — a queixa que originou
 * este motor inteiro — e custaria 75 por peça.
 *
 * Todos eles são o mesmo símbolo em outra roupa: reescalado, acompanhado do
 * nome em tipografia, ou recortado. Escala, recorte e composição de texto são
 * cálculo, e cálculo repete.
 *
 * ## Por que o nome é DESENHADO em tipografia, e não gerado
 *
 * Porque modelo de imagem erra letra, e a grafia da marca é a única coisa deste
 * contrato que não admite interpretação. Escrito com a fonte embutida, ele sai
 * exato — e a régua consegue LER o que saiu, em vez de precisar de OCR.
 */

/** O que desenhar. */
export type PecaDoPacote =
  /** Símbolo e nome lado a lado. É o logotipo principal. */
  | 'lockup-horizontal'
  /** Símbolo em cima, nome embaixo. Para espaço estreito. */
  | 'lockup-vertical'
  /** Só o nome, na tipografia da marca. */
  | 'nome-por-extenso'
  /** Só o símbolo, reescalado. Serve ao favicon e ao avatar. */
  | 'simbolo';

export type EntradaDoDesenho = {
  /** O símbolo recortado, como data URI de PNG com fundo transparente. */
  readonly simbolo: string;
  readonly nome: string;
  /** A cor da marca, para o nome. */
  readonly cor: string;
  /** O `@font-face` com o arquivo dentro. Vazio = a letra da casa. */
  readonly fonteCss: string;
  /** A família da fonte, se houver. */
  readonly familia: string | null;
  readonly peca: PecaDoPacote;
  /** O lado do quadro. Para lockups, é a ALTURA; a largura sai da composição. */
  readonly lado: number;
  /** Fundo do quadro. `null` = transparente. */
  readonly fundo: string | null;
};

/**
 * Monta o HTML de UMA peça.
 *
 * Separado da execução do navegador pela mesma razão de `htmlDaPeca`: a decisão
 * de layout fica legível e conferível sem subir Chromium.
 */
export const htmlDaPecaDaMarca = (e: EntradaDoDesenho): string => {
  const familia =
    e.familia === null
      ? 'system-ui,sans-serif'
      : `'${e.familia.replace(/'/g, '')}',system-ui,sans-serif`;
  const fundo = e.fundo === null ? 'transparent' : e.fundo;
  const nomeEscapado = e.nome.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  // O símbolo ocupa a altura toda menos o respiro; o nome acompanha numa
  // proporção fixa dele, que é o que mantém o lockup coerente em qualquer
  // tamanho. Proporção, e não pixel, porque a peça é exportada em vários lados.
  const respiro = Math.round(e.lado * 0.08);
  const alturaDoSimbolo = e.lado - respiro * 2;
  const corpoDoNome = Math.round(alturaDoSimbolo * (e.peca === 'lockup-vertical' ? 0.24 : 0.34));

  const simbolo = `<img class="s" src="${e.simbolo}" alt="${nomeEscapado}">`;
  const nome = `<span class="n" data-papel="nome">${nomeEscapado}</span>`;

  const miolo =
    e.peca === 'simbolo'
      ? simbolo
      : e.peca === 'nome-por-extenso'
        ? nome
        : e.peca === 'lockup-horizontal'
          ? `${simbolo}${nome}`
          : `${simbolo}${nome}`;

  const eixo = e.peca === 'lockup-vertical' ? 'column' : 'row';
  // No lockup horizontal o símbolo é o mais alto; no vertical ele encolhe para
  // o conjunto caber na altura pedida.
  const alturaFinalDoSimbolo =
    e.peca === 'lockup-vertical' ? Math.round(alturaDoSimbolo * 0.62) : alturaDoSimbolo;

  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><style>
  ${e.fonteCss}
  *{margin:0;padding:0;box-sizing:border-box}
  html,body{background:${fundo}}
  .q{display:inline-flex;flex-direction:${eixo};align-items:center;
     gap:${Math.round(alturaDoSimbolo * (e.peca === 'lockup-vertical' ? 0.14 : 0.2))}px;
     padding:${respiro}px;height:${e.peca === 'nome-por-extenso' ? 'auto' : `${e.lado}px`}}
  /* Altura fixa e largura AUTO: é o que garante a proporção do símbolo. */
  .s{display:block;height:${alturaFinalDoSimbolo}px;width:auto}
  .n{font:700 ${corpoDoNome}px/1 ${familia};letter-spacing:-.01em;color:${e.cor};white-space:nowrap}
</style></head><body><div class="q" id="q">${miolo}</div></body></html>`;
};

/**
 * A caixa que a peça realmente ocupa, medida.
 *
 * O quadro do lockup não tem largura conhecida de antemão — ela depende do
 * comprimento do nome e da fonte. Medir e recortar por essa medida é o que faz
 * o arquivo sair sem faixa vazia dos lados, que numa logo é o defeito que
 * desalinha tudo o que a usa depois.
 */
export const medirQuadro = (): { largura: number; altura: number } => {
  const q = document.getElementById('q');
  if (q === null) throw new Error('QUADRO_AUSENTE');
  const r = q.getBoundingClientRect();
  return { largura: Math.ceil(r.width), altura: Math.ceil(r.height) };
};
