/**
 * O atraso que a credencial errada paga.
 *
 * `POST /api/orbis/entrar` respondia na mesma velocidade para senha certa e
 * errada, sem contador e sem espera. Com o app publicado por túnel, isso é uma
 * porta que aceita quantos palpites por segundo a rede aguentar — e do outro
 * lado da porta há UMA senha, compartilhada, que abre o acervo inteiro.
 *
 * ## Por que atraso, e não bloqueio
 *
 * Bloquear depois de N erros trocaria um problema por outro: qualquer pessoa que
 * descobrisse o endereço poderia trancar o dono para fora só errando de
 * propósito. O atraso não tranca ninguém — a senha certa continua entrando na
 * hora seguinte à espera —, mas transforma força bruta em algo que leva anos.
 *
 * ## Por que o contador é global
 *
 * O óbvio seria contar por IP. Só que o IP visível atrás de um túnel é o do
 * túnel, e o `x-forwarded-for` é escrito por quem chama: contar por ele daria a
 * quem ataca um jeito de zerar o contador a cada tentativa, trocando o
 * cabeçalho. Como o que se protege é UMA senha, e não uma conta por pessoa,
 * contar globalmente é o que corresponde ao risco real.
 *
 * O preço está declarado: alguém martelando a porta faz o dono esperar até
 * cinco segundos no próximo acerto. Cinco segundos uma vez, contra palpites
 * ilimitados para sempre.
 *
 * ## O que isto NÃO é
 *
 * Estado em memória do processo. Reiniciar zera, e dois processos não
 * compartilham o contador — o que importa no dia em que isto rodar com mais de
 * uma instância. Ali, o contador precisa sair da memória.
 */

/** Teto do atraso. Acima disto, esperar mais só castiga quem digitou errado. */
export const ATRASO_MAXIMO_MS = 5_000;

/** A primeira falha já paga alguma coisa; daí em diante dobra. */
const ATRASO_INICIAL_MS = 250;

/**
 * Quanto esperar antes de responder, dado o número de falhas seguidas.
 *
 * Puro de propósito: a curva é o que decide se a porta é forçável, e ela precisa
 * ser conferível sem subir servidor nenhum.
 */
export const atrasoDaTentativa = (falhasSeguidas: number): number => {
  if (falhasSeguidas <= 0) return 0;
  const bruto = ATRASO_INICIAL_MS * 2 ** (falhasSeguidas - 1);
  return Math.min(bruto, ATRASO_MAXIMO_MS);
};

let falhasSeguidas = 0;

/** Registra uma credencial errada e devolve quanto essa tentativa deve esperar. */
export const registrarFalha = (): number => {
  falhasSeguidas++;
  return atrasoDaTentativa(falhasSeguidas);
};

/** Entrou: o contador volta a zero. */
export const registrarAcerto = (): void => {
  falhasSeguidas = 0;
};

/** Quantas falhas seguidas há agora. Existe para o teste e para diagnóstico. */
export const falhasAtuais = (): number => falhasSeguidas;

export const esperar = (ms: number): Promise<void> =>
  ms <= 0 ? Promise.resolve() : new Promise((ok) => setTimeout(ok, ms));
