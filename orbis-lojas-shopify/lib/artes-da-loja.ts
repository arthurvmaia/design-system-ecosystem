/**
 * AS ARTES DA LOJA: versão, alterações gastas e aprovação.
 *
 * Cada peça de imagem tem uma vida própria — nasce na V1, pode ser refeita no
 * máximo duas vezes e termina aprovada. Este módulo é onde essa vida é decidida.
 *
 * ## Por que a regra mora AQUI, e não no botão
 *
 * Esconder "pedir alteração" quando o crédito acaba resolve o caso de quem
 * clica. Não resolve recarregar a página, reabrir o projeto, voltar um passo,
 * apertar "gerar tudo de novo" ou chamar a rota por fora — e cada um desses é
 * um jeito de ganhar uma terceira geração que não existe. Regra de negócio em
 * componente de tela é regra que vale enquanto ninguém tenta.
 *
 * Aqui é função pura: entra o estado da arte, sai o que pode. Quem desenha a
 * tela pergunta, e quem grava também.
 *
 * ## O que CONTA como alteração
 *
 * Só a versão que ficou pronta. Clicar e o provedor falhar não gasta tentativa:
 * o cliente não pediu um erro, pediu uma imagem. Por isso `comAlteracao` só é
 * chamada com a URL nova na mão.
 */

/** Duas, e não há terceira. A geração original não conta. */
export const LIMITE_DE_ALTERACOES = 2;

export type ArteDaLoja = {
  /** A versão em uso: é ela que vai para o tema e para a entrega. */
  url: string;
  /** 1 na original, 2 depois da primeira alteração, 3 depois da segunda. */
  versao: number;
  /** Quantas alterações foram GERADAS com sucesso (0 a 2). */
  alteracoes: number;
  aprovada: boolean;
};

export type EstadoDaArte = "ausente" | "gerando" | "aguardando" | "aprovada" | "limite";

/** Números vindos do disco não são de confiança: podem ter sido editados à mão. */
function inteiroSeguro(valor: unknown, minimo: number, maximo: number, padrao: number): number {
  const numero = Math.trunc(Number(valor));
  if (!Number.isFinite(numero)) return padrao;
  return Math.min(maximo, Math.max(minimo, numero));
}

/**
 * Lê uma arte gravada, sem confiar no que veio.
 *
 * O cofre é `localStorage`: qualquer pessoa abre o console e escreve
 * `alteracoes: -5`. Ler com limites transforma isso em nada — é a diferença
 * entre um limite e uma sugestão.
 */
export function arteLida(bruto: unknown): ArteDaLoja | null {
  if (!bruto) return null;
  if (typeof bruto === "string") return bruto ? arteNova(bruto) : null;
  const dado = bruto as Partial<ArteDaLoja>;
  if (typeof dado.url !== "string" || !dado.url) return null;
  const alteracoes = inteiroSeguro(dado.alteracoes, 0, LIMITE_DE_ALTERACOES, 0);
  return {
    url: dado.url,
    /* a versão é DERIVADA das alterações, não lida: são a mesma verdade dita
       duas vezes, e duas verdades divergem */
    versao: alteracoes + 1,
    alteracoes,
    aprovada: dado.aprovada === true,
  };
}

/** A primeira geração de uma peça: V1, nenhuma alteração gasta. */
export function arteNova(url: string): ArteDaLoja {
  return { url, versao: 1, alteracoes: 0, aprovada: false };
}

export function alteracoesRestantes(arte: ArteDaLoja | null | undefined): number {
  if (!arte) return LIMITE_DE_ALTERACOES;
  return Math.max(0, LIMITE_DE_ALTERACOES - arte.alteracoes);
}

/**
 * Pode pedir outra versão desta arte?
 *
 * Duas portas fechadas: acabou o crédito, ou a arte já foi aprovada. A segunda
 * importa tanto quanto a primeira — refazer o que o cliente aprovou troca uma
 * decisão dele por um sorteio.
 */
export function podePedirAlteracao(arte: ArteDaLoja | null | undefined): boolean {
  if (!arte) return false;
  return !arte.aprovada && alteracoesRestantes(arte) > 0;
}

/**
 * Pode GERAR esta peça agora?
 *
 * Peça que ainda não existe, sim. Peça que existe segue a regra da alteração —
 * é isto que faz "gerar tudo de novo" não virar crédito infinito, porque a
 * pergunta é a mesma para os dois caminhos.
 */
export function podeGerar(arte: ArteDaLoja | null | undefined): boolean {
  if (!arte) return true;
  return podePedirAlteracao(arte);
}

/** A versão nova ficou pronta: sobe a versão e gasta uma alteração. */
export function comAlteracao(arte: ArteDaLoja, url: string): ArteDaLoja {
  if (!podePedirAlteracao(arte)) return arte;
  const alteracoes = arte.alteracoes + 1;
  return { url, versao: alteracoes + 1, alteracoes, aprovada: false };
}

export function aprovar(arte: ArteDaLoja): ArteDaLoja {
  return { ...arte, aprovada: true };
}

export function estadoDaArte(arte: ArteDaLoja | null | undefined, gerando = false): EstadoDaArte {
  if (gerando) return "gerando";
  if (!arte) return "ausente";
  if (arte.aprovada) return "aprovada";
  return alteracoesRestantes(arte) === 0 ? "limite" : "aguardando";
}

export const ROTULO_DO_ESTADO: Record<EstadoDaArte, string> = {
  ausente: "sem arte",
  gerando: "gerando alteração",
  aguardando: "aguardando aprovação",
  aprovada: "aprovada",
  limite: "limite de alterações",
};

/**
 * O placar das artes obrigatórias.
 *
 * Obrigatória é a que o tema precisa para não abrir com buraco. As desenhadas
 * (nome por extenso, favicon) não entram: elas não são geradas, não têm versão
 * e não há o que aprovar — cobrar aprovação delas seria pedir um clique que não
 * decide nada.
 */
export function placarDasArtes(
  artes: Record<string, ArteDaLoja>,
  obrigatorias: readonly string[],
): { total: number; aprovadas: number; pendentes: string[] } {
  const pendentes = obrigatorias.filter((chave) => !artes[chave]?.aprovada);
  return { total: obrigatorias.length, aprovadas: obrigatorias.length - pendentes.length, pendentes };
}

/**
 * Só as artes APROVADAS vão para a loja — e cada uma leva o CORTE IRMÃO dela.
 *
 * Versão velha e arte em análise continuam fora: aprovar é a decisão do
 * cliente, e entregar o que ele não aprovou é decidir no lugar dele.
 *
 * O irmão é outra coisa. A dobra de banner vira DOIS arquivos da mesma foto —
 * `banner-2` e `banner-2-mobile` —, cortados para o computador e para o
 * celular pela mesma composição, no mesmo instante. Só o primeiro é peça da
 * bancada: é ele que a pessoa vê e é nele que ela clica em aprovar. O irmão
 * não aparece em lugar nenhum, então nunca era aprovado — ficava reprovado
 * para sempre, por não ter como ser visto.
 *
 * Duas consequências, as duas medidas na loja gerada: o campo do celular caía
 * no corte largo (jogando fora exatamente a composição que existe para o texto
 * caber na tela estreita), e o tema voltava a escrever a frase por cima da
 * foto — porque o sinal de "esta arte já leva a frase assada" é a presença
 * desse arquivo. Era a frase aparecendo duas vezes na mesma dobra.
 */
export function urlsAprovadas(artes: Record<string, ArteDaLoja>): Record<string, string> {
  const saida: Record<string, string> = {};
  for (const [chave, arte] of Object.entries(artes)) {
    if (!arte?.aprovada || !arte.url) continue;
    saida[chave] = arte.url;
    const irmao = artes[`${chave}-mobile`];
    if (irmao?.url) saida[`${chave}-mobile`] = irmao.url;
  }
  return saida;
}
