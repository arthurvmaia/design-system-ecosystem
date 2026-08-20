/// <reference lib="dom" />

/**
 * AS VERSÕES DA LOGO, derivadas de UM símbolo — o algoritmo, canônico.
 *
 * ## Por que este arquivo existe, e por que aqui
 *
 * Pedir "o mesmo símbolo em fundo branco" ao gerador abre um pedido NOVO, e o
 * modelo desenha outro símbolo. Foi a queixa do dono: a marca chegava em três
 * modelos diferentes em vez de uma marca em três roupas. Não se conserta
 * caprichando no texto do pedido, porque geração independente não repete
 * desenho.
 *
 * Aqui o símbolo é gerado UMA vez e as versões saem por CÁLCULO, do mesmo
 * arquivo. É o `CLAUDE.md` ao pé da letra: "cor, geometria, recorte, máscara,
 * escala e exportação são calculados, nunca gerados". O custo também muda: uma
 * geração, não três.
 *
 * O algoritmo nasceu na frente de Lojas (`orbis-lojas-shopify`) e passou a
 * morar no motor porque as três frentes do portal precisam dele: quem gera um
 * site precisa das versões da marca, quem monta uma loja precisa, e a frente
 * Criativos precisa. Duas cópias do mesmo recorte divergiriam, e a divergência
 * apareceria como "a logo do site não é a logo da loja".
 *
 * ## Por que é UMA função com tudo dentro
 *
 * Ela roda no NAVEGADOR — precisa de canvas, e canvas não existe em Node nem no
 * workerd da Vercel. O motor a executa injetando-a numa página do Playwright, e
 * a injeção serializa a função pelo `toString()`: qualquer ajudante declarado
 * FORA dela não viajaria junto, e a chamada quebraria dentro da página com um
 * "não definido" que nenhum teste de tipo pega.
 *
 * ## Por que devolve data URI, e não Blob
 *
 * `Blob` não atravessa a fronteira entre a página e o Node. Devolvendo texto, a
 * MESMA função serve o motor (que grava em disco) e a tela (que converte de
 * volta para `Blob` em três linhas, com `converterParaBlob`). Uma função, dois
 * consumidores, nenhuma segunda implementação para divergir.
 *
 * ## O que o recorte pressupõe
 *
 * Que o símbolo veio sobre **fundo liso de cor única, bem separado do símbolo**
 * — e o pedido de geração pede exatamente isso. Fundo liso é o caso em que
 * separar por cor é exato, e não estimativa.
 */

/** As três versões que saem do mesmo símbolo, como data URI de PNG. */
export type LogosDerivadas = {
  /** O símbolo recortado, fundo transparente de verdade. */
  readonly transparente: string;
  /** O mesmo símbolo sobre branco. */
  readonly fundoBranco: string;
  /** A silhueta do mesmo símbolo, branca, sobre preto. */
  readonly fundoPreto: string;
};

/**
 * Recorta e deriva. Roda DENTRO de um navegador.
 *
 * `origem` é o símbolo como data URI ou URL que a página consiga carregar.
 * Lança quando o canvas não existe ou a imagem não carrega — quem chama decide
 * o que fazer, e nas duas frentes a decisão é a mesma: entregar o símbolo como
 * ele veio, com aviso, em vez de um recorte que comeu metade do desenho.
 */
export async function derivarLogos(origem: string): Promise<LogosDerivadas> {
  /** O lado das peças derivadas. Logo não precisa de 4k, precisa de nitidez de forma. */
  const LADO = 1024;
  /** Respiro em volta do símbolo, em fração do lado. Sem ele a forma encosta na borda. */
  const MARGEM = 0.1;
  const BRANCO = '#ffffff';
  const PRETO = '#101010';

  const distancia = (r: number, g: number, b: number, alvo: [number, number, number]): number =>
    Math.sqrt((r - alvo[0]) ** 2 + (g - alvo[1]) ** 2 + (b - alvo[2]) ** 2);

  /**
   * A cor do fundo, lida nas BORDAS e não num canto só.
   *
   * Um canto pode cair em cima de uma sombra ou de um respingo do desenho.
   * Lendo uma faixa das quatro bordas e tirando a mediana de cada canal, um
   * ponto fora da curva não decide nada.
   */
  const corDoFundo = (
    dados: Uint8ClampedArray,
    largura: number,
    altura: number,
  ): [number, number, number] => {
    const amostras: [number, number, number][] = [];
    const passo = Math.max(1, Math.floor(largura / 64));
    const ler = (x: number, y: number): void => {
      const i = (y * largura + x) * 4;
      amostras.push([dados[i] ?? 0, dados[i + 1] ?? 0, dados[i + 2] ?? 0]);
    };
    for (let x = 0; x < largura; x += passo) {
      ler(x, 0);
      ler(x, altura - 1);
    }
    for (let y = 0; y < altura; y += passo) {
      ler(0, y);
      ler(largura - 1, y);
    }
    const mediana = (canal: 0 | 1 | 2): number => {
      const valores = amostras.map((cor) => cor[canal]).sort((a, b) => a - b);
      return valores[Math.floor(valores.length / 2)] ?? 0;
    };
    return [mediana(0), mediana(1), mediana(2)];
  };

  /**
   * Tira o fundo, com uma faixa de transição em vez de um corte seco.
   *
   * Corte seco (dentro/fora) devolve borda serrilhada, que é o que faz uma logo
   * recortada parecer recorte de tesoura. Entre os dois limiares o pixel fica
   * meio transparente, e a borda do desenho continua macia como veio.
   */
  const tirarOFundo = (imagem: ImageData, fundo: [number, number, number]): ImageData => {
    const { data } = imagem;
    const dentro = 42;
    const fora = 90;
    for (let i = 0; i < data.length; i += 4) {
      const d = distancia(data[i] ?? 0, data[i + 1] ?? 0, data[i + 2] ?? 0, fundo);
      if (d <= dentro) data[i + 3] = 0;
      else if (d < fora)
        data[i + 3] = Math.round((data[i + 3] ?? 0) * ((d - dentro) / (fora - dentro)));
    }
    return imagem;
  };

  /** O retângulo que o símbolo ocupa de verdade, para poder centralizá-lo. */
  const areaDoSimbolo = (
    imagem: ImageData,
  ): { x: number; y: number; largura: number; altura: number } | null => {
    const { data, width, height } = imagem;
    let x0 = width;
    let y0 = height;
    let x1 = -1;
    let y1 = -1;
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        if ((data[(y * width + x) * 4 + 3] ?? 0) > 24) {
          if (x < x0) x0 = x;
          if (y < y0) y0 = y;
          if (x > x1) x1 = x;
          if (y > y1) y1 = y;
        }
      }
    }
    if (x1 < 0) return null;
    return { x: x0, y: y0, largura: x1 - x0 + 1, altura: y1 - y0 + 1 };
  };

  const carregar = (url: string): Promise<HTMLImageElement> =>
    new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('IMAGEM_NAO_CARREGOU'));
      img.src = url;
    });

  const img = await carregar(origem);
  const base = document.createElement('canvas');
  base.width = img.naturalWidth || LADO;
  base.height = img.naturalHeight || LADO;
  const ctxBase = base.getContext('2d', { willReadFrequently: true });
  if (!ctxBase) throw new Error('CANVAS_INDISPONIVEL');
  ctxBase.drawImage(img, 0, 0);

  const pixels = ctxBase.getImageData(0, 0, base.width, base.height);
  const recortado = tirarOFundo(pixels, corDoFundo(pixels.data, base.width, base.height));
  ctxBase.putImageData(recortado, 0, 0);

  const area = areaDoSimbolo(recortado);
  /* Símbolo que ocupa o quadro inteiro significa que o fundo não era liso e o
     recorte não pegou nada: melhor entregar o arquivo como veio do que um
     recorte errado que come metade do desenho. */
  const util = area ?? { x: 0, y: 0, largura: base.width, altura: base.height };

  /**
   * A ordem importa: recorta, mede ONDE o desenho está, e só então redesenha
   * centralizado com respiro. Centralizar antes de recortar centralizaria o
   * quadro, não a forma — e o gerador quase nunca põe o símbolo no meio exato.
   */
  const desenhar = (fundo: string | null, silhueta: boolean): string => {
    const canvas = document.createElement('canvas');
    canvas.width = LADO;
    canvas.height = LADO;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('CANVAS_INDISPONIVEL');
    if (fundo !== null) {
      ctx.fillStyle = fundo;
      ctx.fillRect(0, 0, LADO, LADO);
    }
    const disponivel = LADO * (1 - MARGEM * 2);
    const escala = Math.min(disponivel / util.largura, disponivel / util.altura);
    const larguraFinal = util.largura * escala;
    const alturaFinal = util.altura * escala;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(
      base,
      util.x,
      util.y,
      util.largura,
      util.altura,
      (LADO - larguraFinal) / 2,
      (LADO - alturaFinal) / 2,
      larguraFinal,
      alturaFinal,
    );
    if (silhueta) {
      /* Monocromática de verdade: a máscara é o ALFA do recorte, pintada de uma
         cor só. É esta versão que sobrevive a bordado, carimbo e uma tinta. */
      ctx.globalCompositeOperation = 'source-in';
      ctx.fillStyle = BRANCO;
      ctx.fillRect(0, 0, LADO, LADO);
      ctx.globalCompositeOperation = 'destination-over';
      ctx.fillStyle = PRETO;
      ctx.fillRect(0, 0, LADO, LADO);
      ctx.globalCompositeOperation = 'source-over';
    }
    return canvas.toDataURL('image/png');
  };

  return {
    transparente: desenhar(null, false),
    fundoBranco: desenhar(BRANCO, false),
    fundoPreto: desenhar(null, true),
  };
}

/**
 * O data URI de volta para `Blob`, para quem vai subir o arquivo do navegador.
 *
 * Existe aqui, e não na tela que precisa dela, porque o formato de saída é
 * decisão DESTE arquivo: se um dia ele devolver outra coisa, o conversor muda
 * junto em vez de a tela descobrir sozinha.
 */
export const converterParaBlob = (dataUri: string): Blob => {
  const [cabecalho = '', dados = ''] = dataUri.split(',');
  const tipo = cabecalho.match(/data:([^;]+)/)?.[1] ?? 'image/png';
  const binario = atob(dados);
  const bytes = new Uint8Array(binario.length);
  for (let i = 0; i < binario.length; i += 1) bytes[i] = binario.charCodeAt(i);
  return new Blob([bytes], { type: tipo });
};
