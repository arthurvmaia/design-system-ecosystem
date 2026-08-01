/**
 * O que se perde quando a captura é cortada em cada fase.
 *
 * O aviso da Galeria dizia sempre a mesma frase: "pode faltar conteúdo". É
 * verdade e não ajuda — a pessoa não sabe se o que faltou foi uma imagem, um
 * comportamento de rolagem ou uma seção inteira, então não sabe se o resultado
 * serve para o que ela precisa.
 *
 * O motor já grava a fase interrompida em `capturaParcial.fase`. Aqui ela vira
 * a consequência: o que aquela fase estava fazendo quando o tempo acabou.
 *
 * Uma consequência de cada vez, curta, sem jargão de pipeline. Fase que não
 * estiver na tabela cai no texto geral — inventar um efeito específico para uma
 * fase desconhecida seria pior que a frase genérica.
 */
const CONSEQUENCIA: Record<string, string> = {
  'v2-percurso':
    'A leitura da página parou no meio da rolagem: as dobras mais abaixo podem ter ficado sem medição, e efeitos que só aparecem ao passar o mouse ou ao rolar podem não ter sido descobertos.',
  'v2-estados':
    'A descoberta de estados parou: accordion aberto, modal e menu podem não ter sido capturados. O que já estava na tela foi guardado.',
  'v2-candidatos':
    'A busca por peças dentro das seções parou: alguns botões, cards e campos podem não ter virado subcomponentes.',
  'scroll-amostra':
    'A amostragem de comportamento de rolagem parou: efeitos de revelar, parallax e barra fixa podem não ter sido reconhecidos.',
  'assets-rede':
    'O download de arquivos do site parou: parte das imagens e fontes pode ter ficado apontando para o endereço de origem em vez de vir junto.',
  'assets-drenar':
    'O download de arquivos do site parou: parte das imagens e fontes pode ter ficado apontando para o endereço de origem em vez de vir junto.',
  segmentar:
    'A separação em peças parou: pode haver menos componentes aqui do que o site realmente tem.',
  'v2-compilar':
    'A montagem dos arquivos parou: alguns componentes podem ter ficado sem o pacote próprio e não abrem sozinhos.',
};

const GERAL = 'O que deu para capturar foi guardado, mas pode faltar conteúdo.';

/** A frase que explica o corte. Sempre devolve algo legível. */
export const oQueFaltou = (fase: string | undefined): string => {
  if (fase === undefined || fase.trim() === '') return GERAL;
  return CONSEQUENCIA[fase] ?? GERAL;
};

/**
 * Quanto tempo dar na próxima tentativa, em MILISSEGUNDOS, ou `null` quando não
 * dá para saber.
 *
 * O aviso antigo dizia "extraia o site de novo para eu completar", e essa frase
 * mandava repetir uma ação que dá o mesmo resultado: sem mudar o orçamento, a
 * fase é cortada no mesmo lugar. Medido nesta página: a primeira captura cortou
 * o percurso aos 61s; repetida com 900s de orçamento, a fase recebeu 414s e foi
 * cortada de novo. Repetir sem número não conserta nada.
 *
 * O motor grava no motivo quanto a fase chegou a receber ("orçamento da fase
 * esgotado (414394ms)"). Isso é o PISO do que ela precisa — ela foi cortada ali,
 * então precisa de mais. Dobrar esse piso é o palpite honesto, e a tela diz que
 * é um palpite.
 *
 * A conta é sobre a fase, mas o botão controla o TOTAL, e a fase recebe uma
 * fração dele. Por isso o resultado é multiplicado de volta: pedir 2x o tempo da
 * fase no total daria à fase bem menos que o dobro.
 */
export const orcamentoSugeridoMs = (motivo: string | undefined): number | null => {
  const m = motivo?.match(/\((\d+)ms\)/);
  if (!m) return null;
  const daFase = Number(m[1]);
  if (!Number.isFinite(daFase) || daFase <= 0) return null;
  // A fase mais cara (o percurso) recebe cerca de um terço do total, então o
  // total precisa ser cerca de três vezes o que se quer dar a ela.
  const total = daFase * 2 * 3;
  // Arredonda para o minuto de cima: o número vai para a tela e para uma linha
  // de comando, e "2700000" lê melhor que "2486364".
  return Math.ceil(total / 60_000) * 60_000;
};

/** O mesmo número em minutos, para a frase da tela. */
export const emMinutos = (ms: number): number => Math.round(ms / 60_000);
