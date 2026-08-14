import { z } from 'zod';
import type { EscalaDaOrigem, OrigemConsolidada } from './kit-design-system.js';

/**
 * A ESCALA do site gerado: de quem é a régua de tamanho.
 *
 * ## O buraco que isto fecha
 *
 * A fonte da marca já vale dentro das peças (`retipografar.ts` reescreve
 * `font-family` no ponto de uso). O TAMANHO não valia: cada peça continuava com
 * os degraus do site de onde foi capturada. Um kit que junta o hero de um site
 * com os preços de outro saía com título de 64px em cima e de 40px embaixo —
 * não porque alguém escolheu, mas porque dois designers escolheram, em dois
 * sites diferentes, e ninguém conciliou.
 *
 * ## Por que `da-marca` é o padrão
 *
 * Três razões, e a primeira é a que decide: a FAMÍLIA da fonte já se comporta
 * assim. Tamanho seguir outra regra que família seria surpresa sem motivo.
 * Depois: misturar origens é a promessa central do produto, e régua que não
 * conversa mina justamente isso. Por fim, o desalinhamento já estava declarado
 * como DEFEITO a corrigir, não como fidelidade a preservar.
 *
 * ## Por que ligar o padrão não quebra projeto que já existe
 *
 * O regime só produz efeito onde há régua MEDIDA. Origem capturada antes de o
 * motor medir escala vem com `escala` ausente ou vazia, e aí não há de onde
 * tirar degrau nenhum: a reescrita não acontece e o literal original continua
 * valendo. É a mesma degradação da recoloração e da retipografia — sem dado,
 * a peça sai como estava.
 *
 * ## O terceiro eixo: o raio de canto
 *
 * O raio entra pelo MESMO argumento que valeu para o tamanho, e ele é
 * verificável a olho nu: duas origens com raios diferentes — uma de canto vivo,
 * outra de canto arredondado — lidas na mesma página são duas caras, e o kit
 * inteiro passa a parecer recortado de dois lugares. Misturar origens é a
 * promessa do produto; o raio é um dos três eixos que decidem se ela se cumpre.
 *
 * Quem quiser a fidelidade de cada origem desliga os três de uma vez pelo
 * `escalaDoSite: 'de-cada-origem'`. Um interruptor por eixo seria escolha de
 * quem não sabe o que está escolhendo: os três descrevem a mesma coisa, que é
 * de quem é a régua do site.
 */

export const RegimeDeEscala = z.enum(['da-marca', 'de-cada-origem']);
export type RegimeDeEscala = z.infer<typeof RegimeDeEscala>;

export const REGIME_DE_ESCALA_PADRAO: RegimeDeEscala = 'da-marca';

/** O prefixo dos tokens que o `marca.css` declara e as peças consomem. */
export const TOKEN_DE_PASSO = '--marca-passo';
export const TOKEN_DE_ESPACO = '--marca-espaco';
export const TOKEN_DE_RAIO = '--marca-raio';

export const nomeDoPasso = (i: number): string => `${TOKEN_DE_PASSO}-${i + 1}`;
export const nomeDoEspaco = (i: number): string => `${TOKEN_DE_ESPACO}-${i + 1}`;
export const nomeDoRaio = (i: number): string => `${TOKEN_DE_RAIO}-${i + 1}`;

/**
 * A régua de referência: a origem cuja escala rege o site inteiro.
 *
 * Preferência declarada ganha, porque é escolha explícita do usuário. Sem ela,
 * ganha a régua com MAIS degraus medidos — não é arbitrário: mais degraus é
 * mais evidência, e uma régua curta usada como referência achataria as peças
 * das origens mais ricas. Empate resolve pelo id, para a saída ser determinística
 * (duas gerações do mesmo kit têm de produzir o mesmo site).
 */
export const escalaDeReferencia = (
  origens: readonly OrigemConsolidada[],
  preferido?: string | null,
): OrigemConsolidada | null => {
  const comEscala = origens.filter((o) => (o.escala?.degraus.length ?? 0) > 0);
  if (comEscala.length === 0) return null;

  const preferida = comEscala.find((o) => o.designSystemId === preferido);
  if (preferida !== undefined) return preferida;

  return [...comEscala].sort((a, b) => {
    const d = (b.escala?.degraus.length ?? 0) - (a.escala?.degraus.length ?? 0);
    return d !== 0 ? d : a.designSystemId.localeCompare(b.designSystemId);
  })[0] as OrigemConsolidada;
};

/** Índice do degrau mais próximo de um valor, ou -1 se a régua está vazia. */
const maisProximo = (regua: readonly number[], valor: number): number => {
  let melhor = -1;
  let menorDistancia = Number.POSITIVE_INFINITY;
  regua.forEach((d, i) => {
    const distancia = Math.abs(d - valor);
    if (distancia < menorDistancia) {
      menorDistancia = distancia;
      melhor = i;
    }
  });
  return melhor;
};

const limitar = (n: number, min: number, max: number): number => Math.min(max, Math.max(min, n));

/**
 * Para cada degrau da régua de ORIGEM, o índice do degrau correspondente na
 * régua de REFERÊNCIA.
 *
 * ## A âncora é o corpo, e isso não é detalhe
 *
 * O alinhamento poderia ser por posição relativa (o terceiro de cinco vira o
 * quinto de nove), e seria pior por um motivo concreto: réguas de comprimentos
 * diferentes deslocariam o TEXTO DE LEITURA. O corpo é o degrau onde está a
 * maior parte do texto da página — é o que a pessoa passa mais tempo lendo, e é
 * onde um erro de meio degrau aparece como "esta seção tem letra menor que a
 * outra". Ancorar corpo no corpo garante que o texto corrido de duas origens
 * saia do mesmo tamanho, que é a coisa mais visível que este alinhamento faz.
 *
 * A hierarquia em volta vem por DESLOCAMENTO: um degrau acima do corpo na
 * origem vira um degrau acima do corpo na referência. Assim o que era destaque
 * continua destaque, e o que era miúdo continua miúdo.
 *
 * Sem `corpo` medido nas duas (eixo de espaço, ou tipografia de origem antiga),
 * cai para posição relativa — que é pior âncora, mas melhor que nenhuma.
 */
export const alinharDegraus = (
  origem: readonly number[],
  referencia: readonly number[],
  ancoras?: { origem: number | null; referencia: number | null },
): number[] => {
  if (origem.length === 0 || referencia.length === 0) return [];
  const ultimo = referencia.length - 1;

  const ci = ancoras?.origem != null ? maisProximo(origem, ancoras.origem) : -1;
  const cr = ancoras?.referencia != null ? maisProximo(referencia, ancoras.referencia) : -1;

  if (ci >= 0 && cr >= 0) {
    return origem.map((_, i) => limitar(cr + (i - ci), 0, ultimo));
  }

  // Posição relativa. Régua de um degrau só aponta para o primeiro: não há
  // proporção a preservar quando não há segundo ponto.
  if (origem.length === 1) return [0];
  return origem.map((_, i) => Math.round((i / (origem.length - 1)) * ultimo));
};

export type ReguaAlinhada = {
  /** Valor medido na origem → nome do token que a substitui. */
  porValor: ReadonlyMap<number, string>;
};

/**
 * O mapa `valor da origem → token da marca`, para um eixo.
 *
 * É o que `reescalar.ts` consome: encontrou `font-size: 40px` no CSS de uma
 * origem, pergunta a este mapa qual token põe no lugar. Fora do mapa, o valor
 * fica como está — a mesma regra de "na dúvida, não mexe" que a recoloração
 * segue com cluster sem papel.
 */
/**
 * Corta o RABO da régua: degrau que saltou longe demais do anterior.
 *
 * Uma régua de espaço cresce por degraus vizinhos — `4, 8, 12, 16, 24, 32, 48`.
 * Quando o último salta muito além do anterior, aquilo não é degrau: é a medida
 * de um embrulho de página que entrou na amostragem como se fosse respiro.
 *
 * O limiar é 4×, e ele foi CALIBRADO nos dois lados. A régua real que motivou
 * isto é `[6, 10, 16, 20, 24, 32, 40, 100, 160, 470, 2520]`: o salto de 470 para
 * 2520 é 5,4× e cai; o de 160 para 470 é 2,9× e fica. Do outro lado, uma régua
 * grossa e legítima como `[4, 12, 48]` tem um salto de 4,0× — e um limiar de 3
 * a decapitava.
 *
 * Medido no acervo: uma régua termina em **2520px** e outra em 470px, contra
 * uma mediana de 96px para o maior degrau. A causa foi corrigida na FONTE
 * (`engine-v2/mapper/rampas.ts` passou a recusar respiro maior que meia página),
 * mas a evidência gravada não guarda os nós — então as réguas do acervo de hoje
 * só se limpam recapturando os 57 sites, o que custa horas. Este corte é o que
 * as limpa agora, e continua valendo como rede depois.
 *
 * Por que o rabo e não o meio: o salto absurdo aparece sempre no fim, porque a
 * régua vem ordenada. Cortar no meio removeria degrau legítimo e deslocaria
 * todos os vizinhos — e é o deslocamento que faz o que era destaque continuar
 * destaque.
 */
const SALTO_MAXIMO = 4;
const semRaboAbsurdo = (degraus: readonly number[]): number[] => {
  const fora: number[] = [];
  for (let i = degraus.length - 1; i > 0; i--) {
    const atual = degraus[i];
    const anterior = degraus[i - 1];
    if (atual === undefined || anterior === undefined || anterior <= 0) break;
    if (atual / anterior <= SALTO_MAXIMO) break;
    fora.push(i);
  }
  // Nunca esvazia a régua: sem degrau não há reescala, e ficar com a régua
  // torta é melhor que ficar sem régua nenhuma.
  if (fora.length >= degraus.length - 1) return [...degraus];
  return degraus.filter((_, i) => !fora.includes(i));
};

/**
 * A distorção máxima que um degrau da referência pode impor ao valor da origem.
 *
 * O alinhamento é POSICIONAL, e no topo da régua ele deforma: a referência de
 * um kit publicava `--marca-espaco-8: 100px` e `-9: 160px`, e o `sm:p-8` de
 * 32px da origem caiu no 100px (3,1×), o `gap-10` de 40px caiu no 160px (4×).
 * Num grid de 12 colunas e 1040px, 11 gaps de 160px somam 1760px: as tracks
 * colapsam a zero e o terceiro cartão termina 520px além da borda — foi o S12
 * de dois kits, medido.
 *
 * Harmonizar não é deformar. Medido nos pares legítimos do acervo, a razão
 * chega a 1,67× (24→40); os que estouram começam em 3,1×. Acima de 2×, o
 * literal da origem vale mais que o degrau — a mesma degradação que o
 * `reescalar` já promete: não reescrever nunca é melhor que reescrever errado.
 */
export const DISTORCAO_MAXIMA_DA_REGUA = 2;

/**
 * A razão sozinha condenaria o desenho deliberado: "pontas nas pontas" leva
 * 12px→32px (2,7×) e o canto quase vivo 2px→12px (6×) — deltas de 20px e 10px,
 * inofensivos e INTENCIONAIS. O dano que o S12 mediu escala com o delta
 * absoluto: 40px→160px são 120px a mais em CADA gap de um grid. A guarda só
 * age quando as DUAS coisas passam do limite.
 */
export const FOLGA_DA_DISTORCAO_PX = 32;

export const reguaDaOrigem = (
  origemBruta: readonly number[],
  referenciaBruta: readonly number[],
  nome: (i: number) => string,
  ancoras?: { origem: number | null; referencia: number | null },
): ReguaAlinhada => {
  const origem = semRaboAbsurdo(origemBruta);
  const referencia = semRaboAbsurdo(referenciaBruta);
  const destinos = alinharDegraus(origem, referencia, ancoras);
  const porValor = new Map<number, string>();
  origem.forEach((valor, i) => {
    const j = destinos[i];
    if (j === undefined) return;
    const destino = referencia[j];
    if (destino !== undefined && valor > 0 && destino > 0) {
      const razao = destino > valor ? destino / valor : valor / destino;
      if (razao > DISTORCAO_MAXIMA_DA_REGUA && Math.abs(destino - valor) > FOLGA_DA_DISTORCAO_PX) {
        return;
      }
    }
    porValor.set(valor, nome(j));
  });
  return { porValor };
};

/** As três réguas de uma origem, prontas para a reescrita. */
export const reguasParaOrigem = (
  daOrigem: EscalaDaOrigem | undefined,
  daReferencia: EscalaDaOrigem | undefined,
): { tipografia: ReguaAlinhada; espaco: ReguaAlinhada; raio: ReguaAlinhada } => {
  const vazia: ReguaAlinhada = { porValor: new Map() };
  if (daOrigem === undefined || daReferencia === undefined) {
    return { tipografia: vazia, espaco: vazia, raio: vazia };
  }
  return {
    tipografia: reguaDaOrigem(daOrigem.degraus, daReferencia.degraus, nomeDoPasso, {
      origem: daOrigem.corpo,
      referencia: daReferencia.corpo,
    }),
    // Respiro não tem "corpo": nomear um degrau de espaço como o principal
    // exigiria saber a intenção de quem desenhou, e a medição não separa isso.
    espaco: reguaDaOrigem(daOrigem.espacos, daReferencia.espacos, nomeDoEspaco),
    // Raio também não tem âncora, e pela mesma razão do espaço: não existe um
    // "raio de corpo". O que a medição entrega é a lista de arredondamentos que
    // a origem usa, do mais fechado ao mais aberto, e é a POSIÇÃO nessa lista
    // que carrega a intenção — o menor continua sendo o discreto do selo, o
    // maior continua sendo o da pílula.
    raio: reguaDaOrigem(daOrigem.raios, daReferencia.raios, nomeDoRaio),
  };
};
