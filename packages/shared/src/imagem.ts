/**
 * A medida de uma imagem, lida dos BYTES.
 *
 * Existe para o portão de entrega poder conferir sozinho, em vez de acreditar
 * na folha de conferência que veio junto. A folha é escrita por quem produziu;
 * um número que só ela afirma não é medição, é declaração — e uma entrega que
 * confia na própria declaração não tem portão nenhum.
 *
 * Lê só o cabeçalho: 24 bytes bastam para largura e altura, e descompactar a
 * imagem inteira para saber o tamanho dela seria pagar caro por um dado que
 * está na frente do arquivo.
 */

export type DimensaoDaImagem = { readonly largura: number; readonly altura: number };

/** Assinatura do PNG: os oito primeiros bytes, sempre os mesmos. */
const ASSINATURA_PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] as const;

/**
 * A dimensão de um PNG, ou `null` quando não dá para afirmar.
 *
 * `null` é resposta, não falha: quem chama tem de tratar "não consegui medir"
 * como pendência, e não como aprovação. É a mesma regra da régua inteira.
 */
export const dimensaoDePng = (bytes: Uint8Array): DimensaoDaImagem | null => {
  if (bytes.length < 24) return null;
  for (const [i, esperado] of ASSINATURA_PNG.entries()) {
    if (bytes[i] !== esperado) return null;
  }
  // O IHDR é o primeiro chunk, e largura e altura são os seus dois primeiros
  // campos: inteiros de 32 bits, big-endian, nos bytes 16..23.
  const lerU32 = (off: number): number =>
    ((bytes[off] as number) << 24) |
    ((bytes[off + 1] as number) << 16) |
    ((bytes[off + 2] as number) << 8) |
    (bytes[off + 3] as number);

  const largura = lerU32(16) >>> 0;
  const altura = lerU32(20) >>> 0;
  return largura > 0 && altura > 0 ? { largura, altura } : null;
};
