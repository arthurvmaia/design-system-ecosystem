import { placarDasArtes, type ArteDaLoja } from "./artes-da-loja";
import { IDIOMA_PADRAO, idiomaDe } from "./idiomas.mjs";

/**
 * EM QUE PONTO O PROJETO ESTÁ — e onde o cliente parou.
 *
 * ## O estado é DERIVADO, não guardado
 *
 * Um campo `estado` gravado à parte vira a segunda verdade sobre a mesma
 * coisa, e duas verdades divergem: basta uma gravação falhar no meio para o
 * projeto dizer `asset_review` com as artes todas aprovadas. Aqui o estado sai
 * do que já existe — o passo, as artes, a entrega — e por isso não tem como
 * discordar da tela.
 *
 * Ele é GRAVADO junto assim mesmo, mas como registro: serve para o resumo e
 * para o servidor, não como fonte.
 *
 * ## O ponto de parada é outra coisa
 *
 * Esse sim precisa ser guardado, porque não se deduz de nada: em que passo a
 * pessoa estava, que tema escolheu, que nicho, e o que ela digitou por cima da
 * marca gerada. Sem isso, fechar a aba jogava fora as coleções escritas à mão
 * — que é o trabalho que mais custa a refazer, porque não é sorteável.
 */

/**
 * Os seis momentos, com os nomes que o banco já usa.
 *
 * `editing` e `completed` não são invenção desta tela: a tabela `projects` já
 * grava os dois. Os quatro do meio são o caminho do cliente até lá.
 */
export type EstadoDoProjeto =
  | "editing"
  | "generating_assets"
  | "asset_review"
  | "final_review"
  | "approved"
  | "completed";

export const ESTADOS: readonly EstadoDoProjeto[] = [
  "editing", "generating_assets", "asset_review", "final_review", "approved", "completed",
];

/** O que dizer a quem está olhando. Um por estado, sem jargão de banco. */
export const ROTULO_DO_PROJETO: Record<EstadoDoProjeto, string> = {
  editing: "Em preenchimento",
  generating_assets: "Gerando as artes",
  asset_review: "Aprovando as artes",
  final_review: "Revisando a loja",
  approved: "Aprovado, montando o pacote",
  completed: "Finalizado",
};

export type PontoDoProjeto = {
  /** O passo em que a pessoa estava (0 a 3). */
  passo: number;
  /** "gerada" | "manual" — quem escreve a marca. Vazio = ainda não escolheu. */
  modo: string;
  nicheId: string;
  themeId: string;
  /** O último estado registrado, para o resumo. A verdade é `estadoDoProjeto`. */
  estado: EstadoDoProjeto;
  /**
   * O IDIOMA em que a loja vai nascer.
   *
   * Guardado junto do resto do ponto porque a escolha e do PRIMEIRO passo e o
   * pedido so sai no ultimo: quem fecha o navegador no meio tem de voltar na
   * lingua que escolheu, e nao em portugues.
   */
  idioma: string;
};

export const PONTO_INICIAL: PontoDoProjeto = {
  passo: 0, modo: "", nicheId: "", themeId: "", estado: "editing", idioma: IDIOMA_PADRAO,
};

/**
 * Onde o projeto está AGORA.
 *
 * A ordem das perguntas é a ordem em que os momentos acontecem, e a primeira
 * que responde sim vence: entregue ganha de aprovado, aprovado ganha de em
 * revisão, e assim por diante. Perguntar na ordem errada faria um projeto já
 * entregue voltar a dizer que está na etapa das artes.
 */
export function estadoDoProjeto({
  passo,
  artes,
  gerando = false,
  entrega = "idle",
}: {
  passo: number;
  artes: Record<string, ArteDaLoja>;
  gerando?: boolean;
  entrega?: "idle" | "working" | "done" | "error";
}): EstadoDoProjeto {
  if (entrega === "done") return "completed";
  /* já confirmou e o pacote está sendo montado: a decisão dele já foi tomada,
     mesmo que o arquivo ainda não exista */
  if (entrega === "working") return "approved";
  if (gerando) return "generating_assets";
  if (passo >= 3) return "final_review";
  /* a etapa das artes só é "aprovando artes" quando existe arte para aprovar */
  if (passo === 2 && Object.keys(artes).length > 0) return "asset_review";
  return "editing";
}

/** O projeto pode entrar na revisão? Só com tudo o que é obrigatório aprovado. */
export function podeRevisar(artes: Record<string, ArteDaLoja>, obrigatorias: readonly string[]): boolean {
  if (!obrigatorias.length || !Object.keys(artes).length) return true;
  return placarDasArtes(artes, obrigatorias).pendentes.length === 0;
}

/** Números e textos vindos do disco não são de confiança. */
function texto(valor: unknown): string {
  return typeof valor === "string" ? valor.slice(0, 120) : "";
}

/**
 * Lê o ponto de parada gravado, sem confiar no que veio.
 *
 * Um `passo: 9` gravado à mão levaria a tela a um passo que não existe e a
 * deixaria em branco; um `modo` inventado passaria pelas duas comparações e
 * nenhuma seção apareceria. Limitar na leitura é o que faz o cofre ser um
 * cofre e não um buraco.
 */
export function pontoLido(bruto: unknown): PontoDoProjeto {
  if (!bruto || typeof bruto !== "object") return PONTO_INICIAL;
  const dado = bruto as Record<string, unknown>;
  const passoBruto = Math.trunc(Number(dado.passo));
  const modo = texto(dado.modo);
  const estado = texto(dado.estado) as EstadoDoProjeto;
  return {
    passo: Number.isFinite(passoBruto) ? Math.min(3, Math.max(0, passoBruto)) : 0,
    modo: modo === "gerada" || modo === "manual" ? modo : "",
    nicheId: texto(dado.nicheId),
    themeId: texto(dado.themeId),
    estado: ESTADOS.includes(estado) ? estado : "editing",
    /* quem parou no meio antes desta tela existir volta em portugues, que era
       o unico idioma que havia — nao numa lingua sorteada */
    idioma: idiomaDe(dado.idioma),
  };
}

/**
 * Até onde dá para restaurar de verdade.
 *
 * Voltar alguém para a etapa do tema sem ter escolhido o modo da marca é pior
 * que voltar para o começo: a tela abre pela metade, sem as decisões que as
 * seções de cima assumem já tomadas. Então o passo restaurado é o maior que o
 * material guardado sustenta.
 */
export function passoRestauravel(ponto: PontoDoProjeto, temArtes: boolean): number {
  if (!ponto.modo) return 0;
  if (ponto.modo === "gerada" && !ponto.nicheId) return 0;
  /* a revisão pressupõe artes aprovadas; sem arte guardada ela abriria vazia */
  if (ponto.passo >= 3 && !temArtes && ponto.modo === "gerada") return 2;
  return ponto.passo;
}
