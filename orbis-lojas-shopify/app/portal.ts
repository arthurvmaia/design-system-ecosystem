/**
 * De volta ao vestíbulo.
 *
 * Este app é uma das três portas da suíte Orbis, e quem entra por uma porta
 * precisa poder sair por ela. No modo `--app` do Chrome — que é como o INICIAR
 * abre a suíte — não existe barra de endereço nem botão de voltar visível, então
 * sem este caminho a pessoa fica presa aqui dentro.
 *
 * O endereço sai do host de onde ESTE app foi aberto, e não de `localhost` fixo:
 * quem abre a suíte pelo celular aponta para o IP da máquina, e um `localhost`
 * cravado mandaria o telefone falar consigo mesmo.
 *
 * É a única linha que este app conhece sobre o resto da suíte — o acoplamento
 * cabe numa frase, e é o preço de não trancar ninguém.
 */
export const PORTA_DO_PORTAL = 4000;

export function enderecoDoPortal(): string {
  if (typeof window === "undefined") return `http://localhost:${PORTA_DO_PORTAL}`;
  return `${window.location.protocol}//${window.location.hostname}:${PORTA_DO_PORTAL}`;
}
