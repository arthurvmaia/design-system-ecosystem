import { pathToFileURL } from 'node:url';

/**
 * Este arquivo é o que a pessoa mandou rodar, ou alguém só o importou?
 *
 * Os scripts terminam com uma linha que chama `principal()` quando são o
 * comando. A conta era por substring — `process.argv[1]?.includes('reextrair')`
 * — e ela também dá verdadeiro para `scripts/reextrair.test.ts`, porque o nome
 * do teste contém o nome do script.
 *
 * O efeito não era um teste que falha e se explica. Em `reextrair` o script
 * imprimia o texto de uso e encerrava o processo: o arquivo de teste morria
 * antes do primeiro `test()`, e o relatório dizia `tests 1, fail 1` sem nomear
 * nenhum. Em `acervo-limpar-orfas` era pior, porque não falhava: cada rodada da
 * suíte varria o vault de verdade da máquina para listar as órfãs.
 *
 * A comparação certa é de identidade, não de parecença: só é o comando se a URL
 * deste módulo for exatamente a do arquivo que o Node recebeu.
 */
export const executadoDireto = (metaUrl: string): boolean => {
  const entrada = process.argv[1];
  if (entrada === undefined) return false;
  return metaUrl === pathToFileURL(entrada).href;
};
