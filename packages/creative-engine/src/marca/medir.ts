/// <reference lib="dom" />

/**
 * O que se MEDE num arquivo de marca, e por que cada medida existe.
 *
 * Nenhuma delas responde "ficou bonito", que ninguém mede. Todas respondem
 * "isto é utilizável?", que se mede exatamente — e é a pergunta cujo "não"
 * custa caro, porque uma marca errada é carregada por tudo o que a empresa faz
 * depois e só é notada quando já está em todos os lugares.
 *
 * Roda no navegador porque precisa de canvas, e é executada pela mesma via de
 * `derivar-navegador.ts`: uma função com tudo dentro, injetada numa página.
 */

/** O que se lê de UM arquivo. */
export type MedidaDaPeca = {
  readonly largura: number;
  readonly altura: number;
  /** O menor e o maior valor do canal de transparência. */
  readonly alfaMinimo: number;
  readonly alfaMaximo: number;
  /**
   * Que fração dos pixels não é nem escura nem clara, e sim meio-tom.
   *
   * É a medida que separa SILHUETA de foto dessaturada. A primeira tentativa
   * contava "quantos tons distintos existem", e reprovava a silhueta correta:
   * a borda macia do recorte — que é justamente o que faz a logo não parecer
   * recorte de tesoura — produz dezenas de valores intermediários. Contá-los é
   * contar o antialiasing, não a tinta.
   *
   * A pergunta certa é de PROPORÇÃO: numa silhueta, o meio-tom é só a borda, e
   * borda é pouca coisa. Numa foto dessaturada, ele é o desenho inteiro.
   */
  readonly fracaoIntermediaria: number;
  /**
   * A silhueta em grade grossa: para cada célula, quanto dela é marca (0 a 1).
   *
   * É com ela que se compara uma versão com a outra. Comparar pixel a pixel
   * reprovaria por antialiasing; comparar a FORMA é o que separa "a mesma marca
   * em três roupas" de "três marcas".
   */
  readonly silhueta: readonly number[];
  /**
   * A ASSINATURA VISUAL: a cor média em cada célula de uma grade grossa.
   *
   * A silhueta responde "é a mesma FORMA?" e serve para provar que as versões
   * da logo saem do mesmo símbolo. Esta responde "é a mesma IMAGEM?", e serve
   * para o contrário: provar que duas artes são ideias DIFERENTES.
   *
   * Ela existe porque faltava. Pedir três capas de categoria com `count: 3` num
   * prompt só devolve três variações da MESMA ideia — três fotos do mesmo
   * consultório vazio —, e a régua não tinha como perceber: ela media a logo e
   * não olhava as artes. O dono percebeu abrindo o PDF, que é exatamente o que
   * uma régua existe para evitar.
   *
   * Grade grossa e cor média de propósito: o que se compara é COMPOSIÇÃO e
   * paleta, não pixel. Duas fotos da mesma cena com o móvel deslocado continuam
   * sendo a mesma ideia, e é isso que precisa ser pego.
   */
  readonly assinatura: readonly number[];
};

/** O lado da grade da silhueta. 32×32 = 1024 células, forma sem ruído de borda. */
export const LADO_DA_GRADE = 32;

/** Como reconhecer a marca dentro de cada versão. */
export type ModoDeLeitura =
  /** Fundo transparente: é marca o que tem alfa. */
  | 'alfa'
  /** Sobre branco: é marca o que difere do branco. */
  | 'sobre-claro'
  /** Silhueta clara sobre fundo escuro: é marca o que é claro. */
  | 'sobre-escuro';

/**
 * Mede um arquivo. Roda DENTRO de um navegador.
 *
 * `origem` é o PNG como data URI. `modo` diz como reconhecer a marca ali, e ele
 * é por VERSÃO porque cada uma guarda a forma de um jeito: na transparente ela
 * está no alfa, na de fundo branco ela é o que não é branco, e na monocromática
 * ela é o que é claro.
 */
export async function medirPeca(entrada: {
  origem: string;
  modo: ModoDeLeitura;
}): Promise<MedidaDaPeca> {
  const LADO = 32;
  /** Abaixo disto é escuro; acima de `CLARO` é claro; entre os dois é meio-tom. */
  const ESCURO = 60;
  const CLARO = 195;

  const img = new Image();
  await new Promise<void>((ok, falha) => {
    img.onload = () => ok();
    img.onerror = () => falha(new Error('IMAGEM_NAO_CARREGOU'));
    img.src = entrada.origem;
  });

  const canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('CANVAS_INDISPONIVEL');
  ctx.drawImage(img, 0, 0);
  const { data, width, height } = ctx.getImageData(0, 0, canvas.width, canvas.height);

  let alfaMinimo = 255;
  let alfaMaximo = 0;
  let opacos = 0;
  let meioTom = 0;
  const soma = new Array<number>(LADO * LADO).fill(0);
  const conta = new Array<number>(LADO * LADO).fill(0);
  /** A grade da assinatura é mais grossa: 8×8 basta para comparar composição. */
  const GRADE = 8;
  const somaCor = new Array<number>(GRADE * GRADE * 3).fill(0);
  const contaCor = new Array<number>(GRADE * GRADE).fill(0);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * 4;
      const r = data[i] ?? 0;
      const g = data[i + 1] ?? 0;
      const b = data[i + 2] ?? 0;
      const a = data[i + 3] ?? 0;
      if (a < alfaMinimo) alfaMinimo = a;
      if (a > alfaMaximo) alfaMaximo = a;
      const luz = (r + g + b) / 3;
      // Pixel vazado não tem cor: contá-lo somaria o preto do buffer.
      if (a > 24) {
        opacos += 1;
        if (luz > ESCURO && luz < CLARO) meioTom += 1;
      }

      const ehMarca =
        entrada.modo === 'alfa'
          ? a > 24
          : entrada.modo === 'sobre-claro'
            ? a > 24 && luz < 224
            : a > 24 && luz > 128;

      const celula =
        Math.min(LADO - 1, Math.floor((y / height) * LADO)) * LADO +
        Math.min(LADO - 1, Math.floor((x / width) * LADO));
      soma[celula] = (soma[celula] ?? 0) + (ehMarca ? 1 : 0);
      conta[celula] = (conta[celula] ?? 0) + 1;

      const cy = Math.min(GRADE - 1, Math.floor((y / height) * GRADE));
      const cx = Math.min(GRADE - 1, Math.floor((x / width) * GRADE));
      const base = (cy * GRADE + cx) * 3;
      somaCor[base] = (somaCor[base] ?? 0) + r;
      somaCor[base + 1] = (somaCor[base + 1] ?? 0) + g;
      somaCor[base + 2] = (somaCor[base + 2] ?? 0) + b;
      contaCor[cy * GRADE + cx] = (contaCor[cy * GRADE + cx] ?? 0) + 1;
    }
  }

  return {
    largura: width,
    altura: height,
    alfaMinimo,
    alfaMaximo,
    fracaoIntermediaria: opacos === 0 ? 0 : meioTom / opacos,
    silhueta: soma.map((s, i) => {
      const c = conta[i] ?? 0;
      return c === 0 ? 0 : s / c;
    }),
    assinatura: somaCor.map((v, i) => {
      const c = contaCor[Math.floor(i / 3)] ?? 0;
      return c === 0 ? 0 : v / c / 255;
    }),
  };
}

/**
 * A distância entre duas silhuetas, de 0 (a mesma forma) a 1 (nada em comum).
 *
 * Média da diferença absoluta célula a célula. É a conta que responde à queixa
 * que originou tudo isto: pedir "o mesmo símbolo em fundo branco" ao gerador
 * abre um pedido NOVO, e a marca chega em três modelos diferentes. Versões
 * recortadas do MESMO arquivo ficam perto de zero; desenhos diferentes não.
 */
export const distanciaDeSilhueta = (a: readonly number[], b: readonly number[]): number => {
  if (a.length === 0 || a.length !== b.length) return Number.NaN;
  let total = 0;
  for (let i = 0; i < a.length; i += 1) total += Math.abs((a[i] ?? 0) - (b[i] ?? 0));
  return total / a.length;
};

/**
 * A distância VISUAL entre duas artes, de 0 (a mesma imagem) a 1.
 *
 * Média da diferença absoluta célula a célula, sobre a cor média. É a conta que
 * responde à queixa do dono: "estão todas com a mesma ideia de arte".
 *
 * Ela é a irmã invertida de `distanciaDeSilhueta`. Aquela prova que as versões
 * da logo são a MESMA coisa; esta prova que as artes são coisas DIFERENTES. As
 * duas medem a mesma grandeza — o que muda é de que lado do limiar a resposta
 * certa fica.
 */
export const distanciaVisual = (a: readonly number[], b: readonly number[]): number => {
  if (a.length === 0 || a.length !== b.length) return Number.NaN;
  let total = 0;
  for (let i = 0; i < a.length; i += 1) total += Math.abs((a[i] ?? 0) - (b[i] ?? 0));
  return total / a.length;
};
