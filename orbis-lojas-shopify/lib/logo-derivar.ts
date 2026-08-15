/**
 * AS VERSÕES DA LOGO, derivadas de UM símbolo.
 *
 * Pedir "o mesmo símbolo em fundo branco" ao gerador abre um pedido NOVO, e o
 * modelo desenha outro símbolo. Foi a queixa do dono: a marca chegava em três
 * modelos diferentes em vez de uma marca em três roupas. Não se conserta
 * caprichando no texto do pedido — geração independente não repete desenho.
 *
 * Aqui o símbolo é gerado UMA vez e as versões saem por cálculo, do mesmo
 * arquivo. É o `CLAUDE.md` ao pé da letra: "cor, geometria, recorte, máscara,
 * escala e exportação são calculados, nunca gerados".
 *
 * O recorte é possível porque o pedido já manda o símbolo vir sobre "fundo liso
 * de cor única, bem separado do símbolo". Fundo liso é o caso em que separar
 * por cor é exato, e não estimativa.
 *
 * Roda no NAVEGADOR: precisa de canvas, e o servidor deste app é workerd, que
 * não tem. O que sobe de volta são três PNGs prontos.
 */

/** O lado das peças derivadas. Logo não precisa de 4k, precisa de nitidez de forma. */
const LADO = 1024;
/** Respiro em volta do símbolo, em fração do lado. Sem ele a forma encosta na borda. */
const MARGEM = 0.1;
const BRANCO = "#ffffff";
const PRETO = "#101010";

export type LogosDerivadas = {
  /** O símbolo recortado, fundo transparente de verdade. */
  transparente: Blob;
  /** O mesmo símbolo sobre branco. */
  fundoBranco: Blob;
  /** A silhueta do mesmo símbolo, branca, sobre preto. */
  fundoPreto: Blob;
};

function distancia(r: number, g: number, b: number, alvo: [number, number, number]) {
  return Math.sqrt((r - alvo[0]) ** 2 + (g - alvo[1]) ** 2 + (b - alvo[2]) ** 2);
}

/**
 * A cor do fundo, lida nas BORDAS e não num canto só.
 *
 * Um canto pode cair em cima de uma sombra ou de um respingo do desenho. Lendo
 * uma faixa das quatro bordas e tirando a mediana de cada canal, um ponto fora
 * da curva não decide nada.
 */
function corDoFundo(dados: Uint8ClampedArray, largura: number, altura: number): [number, number, number] {
  const amostras: Array<[number, number, number]> = [];
  const passo = Math.max(1, Math.floor(largura / 64));
  const ler = (x: number, y: number) => {
    const i = (y * largura + x) * 4;
    amostras.push([dados[i], dados[i + 1], dados[i + 2]]);
  };
  for (let x = 0; x < largura; x += passo) {
    ler(x, 0);
    ler(x, altura - 1);
  }
  for (let y = 0; y < altura; y += passo) {
    ler(0, y);
    ler(largura - 1, y);
  }
  const mediana = (canal: number) => {
    const valores = amostras.map((cor) => cor[canal]).sort((a, b) => a - b);
    return valores[Math.floor(valores.length / 2)] ?? 0;
  };
  return [mediana(0), mediana(1), mediana(2)];
}

/**
 * Tira o fundo, com uma faixa de transição em vez de um corte seco.
 *
 * Corte seco (dentro/fora) devolve borda serrilhada, que é o que faz uma logo
 * recortada parecer recorte de tesoura. Entre os dois limiares o pixel fica
 * meio transparente, e a borda do desenho continua macia como veio.
 */
function tirarOFundo(imagem: ImageData, fundo: [number, number, number]) {
  const { data } = imagem;
  const dentro = 42;
  const fora = 90;
  for (let i = 0; i < data.length; i += 4) {
    const d = distancia(data[i], data[i + 1], data[i + 2], fundo);
    if (d <= dentro) data[i + 3] = 0;
    else if (d < fora) data[i + 3] = Math.round(data[i + 3] * ((d - dentro) / (fora - dentro)));
  }
  return imagem;
}

/** O retângulo que o símbolo ocupa de verdade, para poder centralizá-lo. */
function areaDoSimbolo(imagem: ImageData) {
  const { data, width, height } = imagem;
  let x0 = width, y0 = height, x1 = -1, y1 = -1;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (data[(y * width + x) * 4 + 3] > 24) {
        if (x < x0) x0 = x;
        if (y < y0) y0 = y;
        if (x > x1) x1 = x;
        if (y > y1) y1 = y;
      }
    }
  }
  if (x1 < 0) return null;
  return { x: x0, y: y0, largura: x1 - x0 + 1, altura: y1 - y0 + 1 };
}

function paraBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("CANVAS_SEM_BLOB"))), "image/png");
  });
}

function carregar(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("IMAGEM_NAO_CARREGOU"));
    img.src = url;
  });
}

/**
 * Do símbolo gerado saem as três versões.
 *
 * A ordem importa: recorta, mede onde o desenho está, e só então redesenha
 * centralizado com respiro. Centralizar ANTES de recortar centralizaria o
 * quadro, não a forma — e o gerador quase nunca põe o símbolo no meio exato.
 */
export async function derivarLogos(urlDoSimbolo: string): Promise<LogosDerivadas> {
  const img = await carregar(urlDoSimbolo);
  const origem = document.createElement("canvas");
  origem.width = img.naturalWidth || LADO;
  origem.height = img.naturalHeight || LADO;
  const ctxOrigem = origem.getContext("2d", { willReadFrequently: true });
  if (!ctxOrigem) throw new Error("CANVAS_INDISPONIVEL");
  ctxOrigem.drawImage(img, 0, 0);

  const pixels = ctxOrigem.getImageData(0, 0, origem.width, origem.height);
  const recortado = tirarOFundo(pixels, corDoFundo(pixels.data, origem.width, origem.height));
  ctxOrigem.putImageData(recortado, 0, 0);

  const area = areaDoSimbolo(recortado);
  /* símbolo que ocupa o quadro inteiro significa que o fundo não era liso e o
     recorte não pegou nada: melhor entregar o arquivo como veio do que um
     recorte errado que come metade do desenho */
  const util = area ?? { x: 0, y: 0, largura: origem.width, altura: origem.height };

  const desenhar = (fundo: string | null, silhueta: boolean) => {
    const canvas = document.createElement("canvas");
    canvas.width = LADO;
    canvas.height = LADO;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("CANVAS_INDISPONIVEL");
    if (fundo) {
      ctx.fillStyle = fundo;
      ctx.fillRect(0, 0, LADO, LADO);
    }
    const disponivel = LADO * (1 - MARGEM * 2);
    const escala = Math.min(disponivel / util.largura, disponivel / util.altura);
    const larguraFinal = util.largura * escala;
    const alturaFinal = util.altura * escala;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(
      origem,
      util.x, util.y, util.largura, util.altura,
      (LADO - larguraFinal) / 2, (LADO - alturaFinal) / 2, larguraFinal, alturaFinal,
    );
    if (silhueta) {
      /* monocromática de verdade: a máscara é o ALFA do recorte, pintada de uma
         cor só. É esta versão que sobrevive a bordado, carimbo e uma tinta. */
      ctx.globalCompositeOperation = "source-in";
      ctx.fillStyle = BRANCO;
      ctx.fillRect(0, 0, LADO, LADO);
      ctx.globalCompositeOperation = "destination-over";
      ctx.fillStyle = PRETO;
      ctx.fillRect(0, 0, LADO, LADO);
      ctx.globalCompositeOperation = "source-over";
    }
    return paraBlob(canvas);
  };

  const [transparente, fundoBranco, fundoPreto] = await Promise.all([
    desenhar(null, false),
    desenhar(BRANCO, false),
    desenhar(null, true),
  ]);
  return { transparente, fundoBranco, fundoPreto };
}
