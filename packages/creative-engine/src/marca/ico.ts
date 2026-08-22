/**
 * O `favicon.ico` de verdade: um container ICO com vários tamanhos dentro.
 *
 * ## Por que não é um PNG renomeado
 *
 * Porque um PNG renomeado é o "SVG que é apenas bitmap disfarçado" que a espec
 * do pacote proíbe, na outra ponta. O `.ico` existe justamente porque o
 * navegador e o Windows escolhem, entre os tamanhos que o arquivo carrega, o
 * que melhor serve ao lugar — a aba, o atalho, a barra de tarefas. Com um
 * tamanho só, o sistema reduz por conta e a forma some.
 *
 * ## O formato, que é simples e antigo
 *
 * Um cabeçalho de 6 bytes, uma entrada de 16 bytes por imagem, e as imagens em
 * seguida. Cada entrada diz onde a sua imagem começa e quantos bytes tem, então
 * os deslocamentos só podem ser calculados depois de saber o tamanho de todas.
 *
 * O conteúdo pode ser BMP ou PNG. Aqui é PNG: ele já vem pronto do canvas, e o
 * suporte é universal desde o Windows Vista.
 */

/** Uma imagem que vai dentro do container. */
export type ImagemDoIco = {
  /** O lado, em pixels. 256 é o máximo que o formato endereça. */
  readonly lado: number;
  readonly png: Uint8Array;
};

const CABECALHO = 6;
const ENTRADA = 16;

export const montarIco = (imagens: readonly ImagemDoIco[]): Uint8Array => {
  if (imagens.length === 0) throw new Error('ICO_SEM_IMAGEM');
  const foraDeFaixa = imagens.find((i) => i.lado < 1 || i.lado > 256);
  if (foraDeFaixa !== undefined) {
    throw new Error(`ICO_LADO_INVALIDO: ${foraDeFaixa.lado} (o formato vai de 1 a 256)`);
  }

  const cabecalho = Buffer.alloc(CABECALHO);
  cabecalho.writeUInt16LE(0, 0); // reservado
  cabecalho.writeUInt16LE(1, 2); // 1 = ícone
  cabecalho.writeUInt16LE(imagens.length, 4);

  const diretorio = Buffer.alloc(ENTRADA * imagens.length);
  let deslocamento = CABECALHO + ENTRADA * imagens.length;
  imagens.forEach((imagem, i) => {
    const base = i * ENTRADA;
    // 256 é escrito como 0: o campo tem um byte, e o formato usa o zero para o
    // maior tamanho em vez de gastar dois bytes por dimensão.
    diretorio.writeUInt8(imagem.lado === 256 ? 0 : imagem.lado, base);
    diretorio.writeUInt8(imagem.lado === 256 ? 0 : imagem.lado, base + 1);
    diretorio.writeUInt8(0, base + 2); // paleta: nenhuma
    diretorio.writeUInt8(0, base + 3); // reservado
    diretorio.writeUInt16LE(1, base + 4); // planos
    diretorio.writeUInt16LE(32, base + 6); // bits por pixel, com alfa
    diretorio.writeUInt32LE(imagem.png.byteLength, base + 8);
    diretorio.writeUInt32LE(deslocamento, base + 12);
    deslocamento += imagem.png.byteLength;
  });

  return new Uint8Array(
    Buffer.concat([cabecalho, diretorio, ...imagens.map((i) => Buffer.from(i.png))]),
  );
};

/** O que um `.ico` carrega dentro, lido de volta. Serve para conferir o que se gravou. */
export const lerIco = (bytes: Uint8Array): readonly { lado: number; bytes: number }[] => {
  const b = Buffer.from(bytes);
  if (b.byteLength < CABECALHO || b.readUInt16LE(2) !== 1) throw new Error('ICO_INVALIDO');
  const quantas = b.readUInt16LE(4);
  return Array.from({ length: quantas }, (_, i) => {
    const base = CABECALHO + i * ENTRADA;
    const cru = b.readUInt8(base);
    return { lado: cru === 0 ? 256 : cru, bytes: b.readUInt32LE(base + 8) };
  });
};
