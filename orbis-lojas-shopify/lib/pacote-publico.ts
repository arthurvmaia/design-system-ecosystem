/**
 * O PACOTE PUBLICADO POR MINUTOS, para a Shopify baixar o tema.
 *
 * Instalar tema é a única coisa que a Admin API não deixa fazer empurrando
 * bytes: você entrega uma URL e os servidores dela vão buscar o arquivo. Não há
 * endpoint para criar tema vazio e preencher depois, e não há upload direto.
 *
 * Isso obriga o pacote a existir num endereço que a Shopify alcance — o que num
 * computador de casa não é `localhost`, e num servidor é o próprio domínio.
 *
 * ## As três coisas que tornam isso aceitável
 *
 * 1. **Imprevisível.** A chave sai de `crypto.getRandomValues`, 32 caracteres
 *    hexadecimais. Adivinhar não é uma estratégia.
 * 2. **Curto.** Vale minutos, o suficiente para a Shopify baixar. O prazo viaja
 *    com o arquivo e é conferido a cada pedido.
 * 3. **Estreito.** Só o prefixo `pacotes/` é servido, e o formato da chave é
 *    validado antes de ela virar caminho.
 *
 * E o conteúdo é o mesmo ZIP que o cliente já baixa pelo botão: tema e artes da
 * marca dele. Nenhuma credencial, nenhum dado de comprador.
 *
 * Este módulo é puro de propósito: quem grava e quem serve importam daqui, e o
 * teste consegue exercitar a regra sem R2 e sem worker.
 */

/** Onde os pacotes moram. Nada fora daqui é servido pela rota pública. */
export const PREFIXO_DO_PACOTE = "pacotes/";

/**
 * Quanto tempo o endereço vive.
 *
 * A Shopify baixa em segundos, mas o processamento do tema é assíncrono e ela
 * pode voltar para buscar. Quinze minutos cobrem isso com folga e ainda são
 * pouco tempo para uma janela de exposição.
 */
export const VALIDADE_MS = 15 * 60 * 1000;

/** Uma chave nova, sorteada. Nunca derivada do projeto nem do cliente. */
export function novaChaveDePacote(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * A chave é só hexadecimal, e do tamanho certo.
 *
 * Conferir isso é o que impede o endereço de virar caminho para outra coisa: um
 * `..` ou uma barra na chave transformaria a rota pública num leitor do
 * armazenamento inteiro.
 */
export function chaveDePacoteValida(chave: string): boolean {
  return /^[0-9a-f]{32}$/.test(String(chave ?? ""));
}

/** O prazo viaja com o arquivo, em texto, porque é assim que o R2 guarda. */
export function prazoDoPacote(agora = Date.now()): string {
  return String(agora + VALIDADE_MS);
}

/**
 * Passou da hora?
 *
 * Sem prazo gravado a resposta é SIM. Um arquivo cujo prazo se perdeu é um
 * arquivo sem prazo, e um endereço público sem prazo é o contrário do que este
 * módulo existe para fazer.
 */
export function pacoteExpirou(prazo: string | undefined, agora = Date.now()): boolean {
  const limite = Number(prazo);
  if (!Number.isFinite(limite) || limite <= 0) return true;
  return agora > limite;
}

/** O endereço público do pacote, quando o app sabe qual é o dele. */
export function enderecoDoPacote(base: string | undefined, chave: string): string {
  const raiz = String(base ?? "").trim().replace(/\/+$/, "");
  if (!raiz || !/^https:\/\//i.test(raiz) || !chaveDePacoteValida(chave)) return "";
  return `${raiz}/api/pacote/${chave}`;
}
