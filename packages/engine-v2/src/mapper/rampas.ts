import type { DesignToken, EixoDeToken } from '@ds/shared';
import type { RawNode } from './raw.js';

/**
 * As RAMPAS do site: os degraus de tamanho de letra, de respiro e de raio que
 * ele realmente usa.
 *
 * ## O buraco que isto fecha
 *
 * O motor media composição, comportamento e portabilidade com rigor, e não
 * media linguagem visual. Uma peça saía com a fidelidade auditada e sem uma
 * única medida de escala — e é por isso que "quero a tipografia deste site"
 * entregava nomes de fonte. Nome de fonte era tudo que existia.
 *
 * ## Por que rampa, e não a lista de valores
 *
 * Uma página tem dezenas de tamanhos medidos e a maioria é ruído: o mesmo
 * degrau aparece como 15.98px e 16px em nós diferentes, e um `<sup>` perdido
 * não é um degrau de escala. Interessa o conjunto pequeno de degraus com peso
 * de evidência atrás.
 *
 * ## As três decisões que sustentam o resultado
 *
 * **1. Tipografia só conta onde há texto PRÓPRIO.** Um `<div>` que embrulha um
 * parágrafo tem `font-size` computado igual ao dele e não pinta letra nenhuma.
 * Contar esses nós faria o degrau de corpo pesar cinco vezes mais só porque o
 * site tem cinco níveis de embrulho — e a rampa passaria a medir a profundidade
 * do HTML, não a escala.
 *
 * **2. O representante do degrau é o valor MAIS FREQUENTE, não a média.** Um
 * degrau é um valor que o site escolheu. A média entre 16 e 15.98 dá 15.99, que
 * não existe em lugar nenhum e reapareceria como token no site gerado.
 *
 * **3. Papel só onde a medição separa.** `corpo` é o degrau onde está a maior
 * parte do TEXTO (medição direta, não inferência). `display` é o maior degrau,
 * e só quando ele se destaca do corpo o bastante para não ser um título comum.
 * O resto fica `null` — a mesma regra que `clusters.ts` segue na cor, pelo
 * mesmo motivo: hierarquia inventada é pior que hierarquia ausente.
 */

/** Quanto dois valores podem diferir e ainda serem o mesmo degrau. */
const TOLERANCIA: Record<EixoDeToken, { relativa: number; absoluta: number }> = {
  // Escala de texto é fina: 16 e 18 são degraus diferentes em qualquer site.
  tipografia: { relativa: 0.04, absoluta: 0.6 },
  // Respiro é grosso: 22 e 24 são o mesmo respiro na prática, e separá-los
  // encheria a rampa de degraus que ninguém desenhou.
  espaco: { relativa: 0.12, absoluta: 2 },
  raio: { relativa: 0.2, absoluta: 2 },
};

/** Teto de degraus por eixo. Acima disso não é rampa, é lista de valores. */
const MAXIMO_DE_DEGRAUS = 12;

/**
 * O piso de evidência: um degrau precisa aparecer em pelo menos 2 nós E em 1%
 * do que foi medido naquele eixo. Um valor único numa página inteira é acidente
 * (um `<sup>`, um badge de canto), e promovê-lo a degrau da escala do site é
 * exatamente o tipo de ruído que faz a rampa não servir para nada.
 */
const MINIMO_DE_NOS = 2;
const FRACAO_MINIMA = 0.01;

/** O quanto o maior degrau precisa se destacar do corpo para ser `display`. */
const FATOR_DE_DISPLAY = 1.6;

/**
 * O quanto o maior degrau pode saltar do degrau logo abaixo e ainda ser um
 * degrau da ESCALA.
 *
 * Medido no acervo: um site trouxe a rampa 10, 11, 11.2, 12, 14, 16, 20 e
 * **208**. Os 208px são um algarismo decorativo, não o topo de uma escala
 * tipográfica — nenhum site desenha um degrau dez vezes maior que o anterior.
 * Sem esta trava, `display` apontava para a decoração, e uma marca que
 * governasse tamanho a partir daí escalaria o site inteiro por um enfeite.
 *
 * Salto grande demais devolve `display: null`: "o maior texto desta página é
 * uma peça solta" é uma resposta melhor que um display inventado.
 */
const SALTO_MAXIMO_ATE_O_DISPLAY = 3.5;

type Amostra = { valor: number; ref: number; caracteres: number };

type Degrau = {
  valor: number;
  ocorrencias: number;
  caracteres: number;
  amostra: number[];
  refs: number[];
};

/**
 * Agrupa amostras vizinhas em degraus.
 *
 * Varre em ordem crescente e estende o degrau enquanto o próximo valor couber
 * na tolerância medida a partir do MENOR valor do degrau — e não do
 * representante. Medir a partir do representante deixaria a janela andar: com
 * tolerância de 12%, uma sequência 20, 22, 24, 26, 29 viraria um degrau só,
 * porque cada passo cabe no anterior. Ancorar no menor mantém o degrau do
 * tamanho que a tolerância promete.
 */
const agrupar = (amostras: readonly Amostra[], eixo: EixoDeToken): Degrau[] => {
  const ordenadas = [...amostras].sort((a, b) => a.valor - b.valor);
  const { relativa, absoluta } = TOLERANCIA[eixo];
  const degraus: Degrau[] = [];
  let atual: Amostra[] = [];

  const fechar = (): void => {
    if (atual.length === 0) return;
    // O representante é o valor mais frequente; empate resolve pelo menor, que
    // é o mais provável de ser o valor "redondo" que o site declarou.
    const frequencia = new Map<number, number>();
    for (const a of atual) frequencia.set(a.valor, (frequencia.get(a.valor) ?? 0) + 1);
    let melhor = atual[0]?.valor ?? 0;
    let melhorContagem = -1;
    for (const [valor, contagem] of [...frequencia.entries()].sort((x, y) => x[0] - y[0])) {
      if (contagem > melhorContagem) {
        melhor = valor;
        melhorContagem = contagem;
      }
    }
    degraus.push({
      valor: melhor,
      ocorrencias: atual.length,
      caracteres: atual.reduce((s, a) => s + a.caracteres, 0),
      amostra: [...new Set(atual.map((a) => a.valor))].sort((a, b) => a - b).slice(0, 8),
      refs: atual.map((a) => a.ref),
    });
    atual = [];
  };

  for (const a of ordenadas) {
    const base = atual[0];
    if (base === undefined) {
      atual.push(a);
      continue;
    }
    const limite = base.valor + Math.max(base.valor * relativa, absoluta);
    if (a.valor <= limite) atual.push(a);
    else {
      fechar();
      atual.push(a);
    }
  }
  fechar();
  return degraus;
};

/** Só os degraus com evidência suficiente, e no máximo os `MAXIMO_DE_DEGRAUS` maiores em peso. */
const filtrarPorEvidencia = (degraus: readonly Degrau[]): Degrau[] => {
  const total = degraus.reduce((s, d) => s + d.ocorrencias, 0);
  const piso = Math.max(MINIMO_DE_NOS, Math.ceil(total * FRACAO_MINIMA));
  const comEvidencia = degraus.filter((d) => d.ocorrencias >= piso);
  // Nenhum degrau passou (página com pouquíssimos nós): devolve o mais pesado,
  // porque "não sei nada" é pior que "sei um" quando um existe.
  const base =
    comEvidencia.length > 0
      ? comEvidencia
      : degraus.length > 0
        ? [[...degraus].sort((a, b) => b.ocorrencias - a.ocorrencias)[0] as Degrau]
        : [];
  return [...base]
    .sort((a, b) => b.ocorrencias - a.ocorrencias)
    .slice(0, MAXIMO_DE_DEGRAUS)
    .sort((a, b) => a.valor - b.valor);
};

const PREFIXO: Record<EixoDeToken, string> = {
  tipografia: 'tipo',
  espaco: 'espaco',
  raio: 'raio',
};

export type RampasDaPagina = {
  tokens: DesignToken[];
  /** `ref` do nó → ids dos degraus que ele usa. */
  porRef: Map<number, string[]>;
};

/**
 * As rampas de uma coleta.
 *
 * Nó sem `visual` (coleta antiga) simplesmente não entra: a ausência é "não
 * medido", nunca zero. Um `padding: 0` medido e um padding não medido dizem
 * coisas opostas, e somá-los no mesmo balde faria o degrau de menor respiro
 * nascer do que ninguém observou.
 */
export const derivarRampas = (nos: readonly RawNode[]): RampasDaPagina => {
  const tipografia: Amostra[] = [];
  const espaco: Amostra[] = [];
  const raio: Amostra[] = [];

  for (const n of nos) {
    const v = n.visual;
    if (v === undefined || !n.visivel) continue;

    // Só onde há texto PRÓPRIO: um embrulho herda o tamanho e não pinta letra.
    const proprio = n.ownText.trim().length;
    if (proprio > 0 && v.fontSize > 0) {
      tipografia.push({ valor: v.fontSize, ref: n.ref, caracteres: proprio });
    }
    /**
     * O respiro de um EMBRULHO de página não é respiro: é layout.
     *
     * A amostragem pegava `padY`, `padX` e `gap` de qualquer nó visível,
     * inclusive do contêiner que envolve a página inteira. Medido no acervo: a
     * rampa de um site termina em **2520px** e a de outro em 470px, contra uma
     * mediana de 120px para o maior degrau. Ninguém escreve respiro de 2520px —
     * aquilo é a altura de um wrapper entrando na régua como se fosse espaço.
     *
     * O estrago não fica na régua: esses degraus viram `--marca-espaco-10/11`, a
     * reescala manda respiros legítimos para eles, e a peça sai empurrada para
     * fora do eixo da página. Foi a causa medida por trás dos elementos
     * ceifados na borda — 198 deles nos 20 sites de prova.
     *
     * O teto sai do PRÓPRIO nó, não de constante: um respiro maior que a metade
     * da caixa que o contém não está separando duas coisas, está sendo a coisa.
     */
    const meia = Math.max(n.box.w, n.box.h) / 2;
    for (const valor of [v.padY, v.padX, v.gap]) {
      if (valor <= 0) continue;
      if (meia > 0 && valor > meia) continue;
      espaco.push({ valor, ref: n.ref, caracteres: 0 });
    }
    if (v.radius > 0) raio.push({ valor: v.radius, ref: n.ref, caracteres: 0 });
  }

  const tokens: DesignToken[] = [];
  const porRef = new Map<number, string[]>();

  for (const [eixo, amostras] of [
    ['tipografia', tipografia],
    ['espaco', espaco],
    ['raio', raio],
  ] as const) {
    const degraus = filtrarPorEvidencia(agrupar(amostras, eixo));
    degraus.forEach((d, i) => {
      const id = `${PREFIXO[eixo]}-${i + 1}`;
      tokens.push({
        id,
        eixo,
        valor: d.valor,
        ocorrencias: d.ocorrencias,
        caracteres: d.caracteres,
        papel: null,
        amostra: d.amostra,
      });
      for (const ref of d.refs) {
        const atual = porRef.get(ref);
        if (atual === undefined) porRef.set(ref, [id]);
        else if (!atual.includes(id)) atual.push(id);
      }
    });
  }

  return { tokens: comPapel(tokens), porRef };
};

/**
 * Marca `corpo` e `display` na rampa de tipografia. Os outros eixos saem sem
 * papel: um respiro de 24px não é "o respiro grande", é um degrau da rampa, e
 * nomeá-lo exigiria saber a intenção de quem desenhou.
 */
const comPapel = (tokens: readonly DesignToken[]): DesignToken[] => {
  const tipo = tokens.filter((t) => t.eixo === 'tipografia');
  if (tipo.length === 0) return [...tokens];

  // `corpo`: onde está a maior parte do texto. Medição direta.
  const corpo = [...tipo].sort((a, b) => b.caracteres - a.caracteres)[0];
  const porTamanho = [...tipo].sort((a, b) => b.valor - a.valor);
  const maior = porTamanho[0];
  const segundo = porTamanho[1];
  // Um degrau isolado lá em cima é decoração, não escala.
  const ehSalto =
    maior !== undefined &&
    segundo !== undefined &&
    maior.valor > segundo.valor * SALTO_MAXIMO_ATE_O_DISPLAY;

  return tokens.map((t) => {
    if (t.eixo !== 'tipografia') return t;
    if (corpo !== undefined && t.id === corpo.id) return { ...t, papel: 'corpo' as const };
    if (
      maior !== undefined &&
      corpo !== undefined &&
      t.id === maior.id &&
      !ehSalto &&
      maior.valor >= corpo.valor * FATOR_DE_DISPLAY
    ) {
      return { ...t, papel: 'display' as const };
    }
    return t;
  });
};
