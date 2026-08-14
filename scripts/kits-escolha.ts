/**
 * A ESCOLHA de quais kits entram no banco de prova, separada do comando.
 *
 * Mesma razão de `curadoria-escolha.ts`: `kits-provar.ts` carrega o `.env` do
 * servidor no topo, antes de qualquer import que o leia. Isso é certo para o
 * comando e impede o teste — sob `pnpm test`, que chama `node --import tsx`
 * direto, `dotenv` não resolve a partir da raiz e o arquivo inteiro morre no
 * carregamento. A decisão não precisa de nada disso, então mora aqui, pura.
 */

/**
 * De vários kits com o MESMO nome, prova só o mais novo.
 *
 * `pnpm kits` monta uma leva por nicho e NÃO apaga a anterior. Rodar a
 * remontagem três vezes deixou 32 kits para 10 nichos — três levas empilhadas,
 * e as duas de baixo com 3 a 11 peças contra 13-14 da de cima. Provar todas
 * custa o triplo do tempo de parede e, pior, enche o placar de reprovação de
 * kit que a remontagem acabou de substituir: manda consertar o que ninguém mais
 * usa. É o mesmo engano que `projeto-de-kit.ts` já corrigia do outro lado, e
 * pela mesma razão — parece medição e não é.
 *
 * Os superados FICAM no banco. Quatro projetos reais ainda apontam para eles, e
 * apagá-los daqui quebraria site que existe. O que muda é só quem entra na
 * prova, e quantos ficaram de fora sai dito na tela: corte calado leria como
 * cobertura.
 */
export const maisNovoPorNome = <T extends { name: string; createdAt: number }>(
  kits: readonly T[],
): T[] => {
  const porNome = new Map<string, T>();
  for (const k of kits) {
    const atual = porNome.get(k.name);
    if (atual === undefined || k.createdAt > atual.createdAt) porNome.set(k.name, k);
  }
  return [...porNome.values()].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
};
