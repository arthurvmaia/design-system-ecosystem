import { useCallback, useState } from 'react';

/**
 * A CHAVE DE ENVIO, que sobrevive ao F5.
 *
 * ## O que ela é
 *
 * O id do job criativo sai dela: o servidor faz `idDaChave(chave)` e cria o
 * arquivo do pedido com exclusividade. É isso que faz clicar duas vezes
 * devolver o MESMO job em vez de abrir dois e cobrar duas.
 *
 * ## O buraco que isto fecha
 *
 * Ela vivia num `useState`, ou seja, na memória da aba. Recarregar a página
 * sorteava outra chave, e o mesmo pedido — a mesma marca, o mesmo formato, o
 * mesmo texto — virava um segundo job PAGO. A idempotência existia e cobria só
 * o clique repetido, que é o caso barato; o caso caro é a pessoa que recarrega
 * porque achou que travou.
 *
 * Guardar no `sessionStorage` faz a chave durar o que a aba durar. Não é
 * `localStorage` de propósito: a chave é do envio em curso, não da pessoa, e
 * uma chave que atravessa dias colidiria com um pedido legítimo feito depois.
 *
 * ## Quando ela é trocada
 *
 * No sucesso, e só nele. Enquanto o pedido não entrou, qualquer tentativa nova
 * tem de reaproveitar a chave — é isso que faz a repetição ser reconhecida.
 * Depois que entrou, a próxima peça é outro pedido e merece outra chave.
 */
const guardar = (nome: string, valor: string): void => {
  try {
    sessionStorage.setItem(nome, valor);
  } catch {
    // Aba anônima com armazenamento bloqueado, cota cheia: a chave volta a
    // durar só o que a memória durar, que é o comportamento de antes. Degrada,
    // não quebra.
  }
};

const lerOuCriar = (nome: string): string => {
  try {
    const guardada = sessionStorage.getItem(nome);
    if (guardada !== null && guardada.trim() !== '') return guardada;
  } catch {
    // idem
  }
  const nova = crypto.randomUUID();
  guardar(nome, nova);
  return nova;
};

/**
 * `nome` separa as telas: os quatro passos e o Expresso são dois envios
 * diferentes, e compartilhar a chave faria um herdar o job do outro.
 */
export const useChaveDeEnvio = (nome: string): [string, () => void] => {
  const [chave, setChave] = useState(() => lerOuCriar(nome));
  const renovar = useCallback(() => {
    const nova = crypto.randomUUID();
    guardar(nome, nova);
    setChave(nova);
  }, [nome]);
  return [chave, renovar];
};
