import type {
  ContadorChave,
  FaseTiming,
  TelemetriaContadores,
  TelemetriaRelatorio,
} from '@ds/shared';
import { TELEMETRIA_VERSION } from '@ds/shared';
import type { ExplorerLimits } from './config.js';

/** Nomes canônicos de fase — a chave que liga `fase(nome)` ao orçamento. */
export const FASE = {
  abrirNavegador: 'abrir-navegador',
  carregar: 'carregar',
  estabilizar: 'estabilizar',
  scrollLazy: 'scroll-lazy',
  scrollAmostra: 'scroll-amostra',
  interacoes: 'interacoes',
  assetsRede: 'assets-rede',
  assetsFallback: 'assets-fallback',
  drenarRede: 'drenar-rede',
  segmentar: 'segmentar',
  associar: 'associar',
  persistir: 'persistir',
  preview: 'preview',
  validar: 'validar',
  fechar: 'fechar',
} as const;
export type FaseNome = (typeof FASE)[keyof typeof FASE];

/**
 * Relógio de fases com orçamento — o mecanismo que CONTROLA o processamento.
 *
 * Não é log passivo: cada fase roda sob um `AbortSignal` ligado ao teto (da fase
 * E do total). Quando o teto estoura, o sinal aborta e a fase é abandonada com
 * um resultado parcial — o `fn` cooperativo (fetch, loops nossos, ações
 * Playwright) para; o não-cooperativo (um `evaluate` preso) é deixado para trás
 * e morre no fechamento do navegador. Assim nenhuma fase segura o pipeline
 * indefinidamente, que era a origem do "7 minutos".
 *
 * O tempo é injetável (`now`) para os testes puros controlarem o relógio sem
 * timer real; o corte por tempo usa `setTimeout` de verdade.
 */

export type Now = () => number;

/**
 * Interface mínima de contador. A `Telemetria` a satisfaz; camadas de baixo
 * nível (fetcher, captura de rede) recebem só isto, e os testes usam um stub —
 * sem acoplar o download ao relógio inteiro.
 */
export interface Contador {
  inc(chave: ContadorChave, n?: number): void;
}

/** Teto total (real, do processo inteiro) e teto por fase, em ms. */
export type Orcamento = {
  total: number;
  fases: Record<string, number>;
};

/**
 * Erro que sinaliza corte por orçamento — distingue "acabou o tempo" de um erro
 * de verdade do `fn` (que deve ser propagado, não engolido como parcial).
 */
export class OrcamentoExcedido extends Error {
  constructor(public readonly fase: string) {
    super(`orçamento excedido na fase ${fase}`);
    this.name = 'OrcamentoExcedido';
  }
}

const CONTADORES: ContadorChave[] = [
  'requests',
  'downloadsOk',
  'downloadsAbortados',
  'fallbacksHttp',
  'timeouts',
  'candidatos',
  'acoes',
  'estados',
  'segmentos',
  'previewsValidados',
  'assetsLocais',
  'assetsExternos',
];

export type FaseResultado<T> = { valor?: T; abortada: boolean; ms: number };

export class Telemetria {
  private readonly inicio: number;
  private readonly fasesReg: FaseTiming[] = [];
  private readonly cont: Record<ContadorChave, number>;
  private parcialFlag = false;
  private faseInterrompida?: string;
  private motivoInterrupcao?: string;
  /** O que foi ampliado e por quê — declarado, nunca implícito. */
  private readonly ampliacoes: { de: number; para: number; motivo: string }[] = [];

  constructor(
    private readonly orc: Orcamento,
    private readonly now: Now = Date.now,
  ) {
    this.inicio = now();
    this.cont = Object.fromEntries(CONTADORES.map((k) => [k, 0])) as Record<ContadorChave, number>;
  }

  /** Tempo já decorrido do processo (ms). */
  decorrido(): number {
    return this.now() - this.inicio;
  }

  /** Quanto resta do orçamento TOTAL (ms). Nunca negativo. */
  restanteTotal(): number {
    return Math.max(0, this.orc.total - this.decorrido());
  }

  /**
   * Amplia o orçamento total quando o SITE se mostra maior que o típico.
   *
   * O total era uma constante, e o acervo mostrou o preço: **43 das 58 capturas
   * saíram PARCIAIS** — três em cada quatro. Não surpreende, olhando a variação
   * do que ele tem de cobrir: de 12 a 1168 nós no mapa (100×) e de 900 a 15412
   * pixels de altura (17×). Um número fixo não serve aos dois extremos; ele ou
   * esfomeia o site grande ou desperdiça no pequeno.
   *
   * A ampliação acontece DEPOIS de a página estar medida — é o único momento em
   * que se sabe o tamanho do trabalho. Antes disso seria o mesmo chute com outro
   * nome.
   *
   * Só cresce, nunca encolhe: o objetivo é não estourar, e reduzir o total no
   * meio do caminho abortaria fases que já tinham sido autorizadas a rodar.
   */
  ampliarTotal(novoTotal: number, motivo: string): boolean {
    const alvo = Math.round(novoTotal);
    if (!Number.isFinite(alvo) || alvo <= this.orc.total) return false;
    this.ampliacoes.push({ de: this.orc.total, para: alvo, motivo });
    this.orc.total = alvo;
    return true;
  }

  /** As ampliações aplicadas, para o relatório. */
  ampliacoesDoTotal(): readonly { de: number; para: number; motivo: string }[] {
    return this.ampliacoes;
  }

  /**
   * O orçamento total VIGENTE — já com as ampliações.
   *
   * Quem calcula teto de fase precisa ler daqui, e não da constante de
   * configuração. Ler da constante foi o defeito que fez a primeira versão da
   * ampliação não servir para nada: o total subia para 355 s e o teto do
   * percurso continuava em 61,2 s, que é a fração de 180 s.
   */
  totalAtual(): number {
    return this.orc.total;
  }

  /**
   * Teto efetivo de uma fase: o menor entre o teto da fase e o que resta do
   * total. É o que impede a soma dos limites individuais de furar o total
   * (regra 13): uma fase nunca roda além do que resta do processo.
   */
  tetoFase(nome: string, override?: number): number {
    const daFase = override ?? this.orc.fases[nome] ?? this.orc.total;
    return Math.max(0, Math.min(daFase, this.restanteTotal()));
  }

  /**
   * Deve iniciar uma fase cara? (regra 14) — só se ainda houver pelo menos
   * `custoMinMs` do total. Perto do fim, o chamador pula a fase, finaliza o que
   * é seguro e persiste o parcial.
   */
  deveIniciar(custoMinMs: number): boolean {
    return this.restanteTotal() >= custoMinMs;
  }

  /** Incrementa um contador agregado. */
  inc(chave: ContadorChave, n = 1): void {
    this.cont[chave] += n;
  }

  /** Marca o processo como parcial (a primeira interrupção define fase/motivo). */
  marcarParcial(fase: string, motivo: string): void {
    if (!this.parcialFlag) {
      this.parcialFlag = true;
      this.faseInterrompida = fase;
      this.motivoInterrupcao = motivo;
    }
  }

  get parcial(): boolean {
    return this.parcialFlag;
  }

  /**
   * Desfaz a marca de parcial de UMA fase, quando o chamador provou que o corte
   * não custou cobertura — ex.: o percurso cortado com a descida já em 100% da
   * página. Só perdoa se a fase interrompida for exatamente esta (um corte
   * anterior em outra fase continua valendo). Quem perdoa assume o dever de
   * declarar o que o corte encurtou como limitação.
   */
  perdoarCorte(fase: string): boolean {
    if (!this.parcialFlag || this.faseInterrompida !== fase) return false;
    this.parcialFlag = false;
    this.faseInterrompida = undefined;
    this.motivoInterrupcao = undefined;
    return true;
  }

  /**
   * Em que fase o corte aconteceu, quando houve corte.
   *
   * Quem decide o que fazer depois de um corte precisa saber ONDE ele foi. Um
   * corte no percurso e um corte na compilação têm consequências diferentes, e
   * tratar os dois igual foi o que fez a conferência de pixel sumir de capturas
   * em que ela tinha tempo de sobra para rodar.
   */
  get faseCortada(): string | undefined {
    return this.faseInterrompida;
  }

  /**
   * Roda uma fase sob orçamento. Passa um `AbortSignal` ao `fn` e CORRE o `fn`
   * contra o corte por tempo: se o teto estoura, o sinal aborta e a fase retorna
   * `abortada` mesmo que o `fn` não coopere (o `fn` abandonado é engolido). Erro
   * real do `fn` (não-abort) é propagado.
   */
  async fase<T>(
    nome: string,
    fn: (signal: AbortSignal) => Promise<T>,
    override?: number,
  ): Promise<FaseResultado<T>> {
    const teto = this.tetoFase(nome, override);
    const ac = new AbortController();
    const t0 = this.now();
    const timer = setTimeout(() => ac.abort(new OrcamentoExcedido(nome)), teto);
    // Promise que rejeita quando o sinal aborta — para correr contra o `fn`.
    const abortP = new Promise<never>((_, rej) => {
      if (ac.signal.aborted) rej(new OrcamentoExcedido(nome));
      else
        ac.signal.addEventListener('abort', () => rej(new OrcamentoExcedido(nome)), { once: true });
    });
    abortP.catch(() => {}); // não deixa virar unhandled rejection quando o fn vence
    let abortada = false;
    try {
      const fnP = fn(ac.signal);
      fnP.catch(() => {}); // idem: rejeição tardia do fn abandonado não vaza
      const valor = await Promise.race([fnP, abortP]);
      return { valor, abortada: false, ms: this.now() - t0 };
    } catch (err) {
      if (err instanceof OrcamentoExcedido || ac.signal.aborted) {
        abortada = true;
        this.marcarParcial(nome, `orçamento da fase esgotado (${teto}ms)`);
        return { valor: undefined, abortada: true, ms: this.now() - t0 };
      }
      throw err;
    } finally {
      clearTimeout(timer);
      this.fasesReg.push({
        nome,
        ms: this.now() - t0,
        abortada,
        motivo: abortada ? 'orçamento da fase' : undefined,
      });
    }
  }

  /**
   * Mede uma fase SEM cortar (para ops que já têm o próprio timeout — goto,
   * launch, close, drenagem). Só cronometra e registra; erro é propagado.
   */
  async medir<T>(nome: string, fn: () => Promise<T>): Promise<T> {
    const t0 = this.now();
    try {
      return await fn();
    } finally {
      this.registrar(nome, this.now() - t0);
    }
  }

  /**
   * Roda uma fase COOPERATIVA sob orçamento: passa um `AbortSignal` que aborta no
   * teto e AGUARDA o `fn` até o fim — o `fn` deve checar o sinal e encerrar
   * sozinho (o loop de interações, os workers de download). Diferente de `fase`,
   * NÃO abandona o `fn` (nada roda solto no navegador depois). Erro real do `fn`
   * é propagado; o corte por tempo vira parcial via o próprio sinal.
   */
  async faseCooperativa<T>(
    nome: string,
    fn: (signal: AbortSignal) => Promise<T>,
    override?: number,
  ): Promise<T> {
    const teto = this.tetoFase(nome, override);
    const ac = new AbortController();
    const t0 = this.now();
    const timer = setTimeout(() => ac.abort(new OrcamentoExcedido(nome)), teto);
    try {
      return await fn(ac.signal);
    } finally {
      clearTimeout(timer);
      const abortada = ac.signal.aborted;
      this.fasesReg.push({
        nome,
        ms: this.now() - t0,
        abortada,
        motivo: abortada ? 'orçamento da fase' : undefined,
      });
      if (abortada) this.marcarParcial(nome, `orçamento da fase esgotado (${teto}ms)`);
    }
  }

  /** Registra uma fase JÁ medida por fora (ex.: passos do pipeline em outro pacote). */
  registrar(nome: string, ms: number, abortada = false, motivo?: string): void {
    this.fasesReg.push({ nome, ms: Math.max(0, Math.round(ms)), abortada, motivo });
    if (abortada) this.marcarParcial(nome, motivo ?? 'orçamento da fase');
  }

  /** O relatório final — só nomes/durações/contagens, nada sensível (regra 16). */
  relatorio(): TelemetriaRelatorio {
    const contadores: TelemetriaContadores = {};
    for (const k of CONTADORES) if (this.cont[k] > 0) contadores[k] = this.cont[k];
    return {
      version: TELEMETRIA_VERSION,
      totalMs: this.decorrido(),
      budgetMs: this.orc.total,
      parcial: this.parcialFlag,
      faseInterrompida: this.faseInterrompida,
      motivo: this.motivoInterrupcao,
      fases: this.fasesReg,
      contadores,
    };
  }
}

/**
 * Combina o sinal de uma fase com um timeout próprio, devolvendo um AbortSignal
 * que dispara no que vier primeiro. É o que dá a downloads/drenagem um teto
 * INDIVIDUAL sem perder o corte por orçamento da fase (regras 5, 6, 7).
 */
export const sinalComTimeout = (
  base: AbortSignal | undefined,
  timeoutMs: number,
): { signal: AbortSignal; limpar: () => void } => {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(new Error('timeout')), timeoutMs);
  const onAbort = (): void => ac.abort((base as AbortSignal).reason);
  if (base) {
    if (base.aborted) ac.abort(base.reason);
    else base.addEventListener('abort', onAbort, { once: true });
  }
  return {
    signal: ac.signal,
    limpar: () => {
      clearTimeout(timer);
      base?.removeEventListener('abort', onAbort);
    },
  };
};

/**
 * Monta o orçamento a partir dos limites resolvidos. Devolve também AVISOS
 * (regra 13): se a soma dos tetos das fases sequenciais principais fura o total,
 * o operador é avisado de que as fases vão ser clampadas — nunca em silêncio.
 */
export const resolveOrcamento = (
  limits: ExplorerLimits,
): { orcamento: Orcamento; avisos: string[] } => {
  const fases: Record<string, number> = {
    [FASE.abrirNavegador]: 20_000,
    [FASE.carregar]: limits.faseCarregarMs,
    [FASE.estabilizar]: limits.faseEstabilizarMs,
    [FASE.scrollLazy]: limits.faseScrollLazyMs,
    [FASE.scrollAmostra]: limits.faseScrollAmostraMs,
    [FASE.interacoes]: limits.faseInteracoesMs,
    [FASE.assetsRede]: limits.faseAssetsMs,
    [FASE.assetsFallback]: limits.faseAssetsMs,
    [FASE.drenarRede]: limits.faseDrenarMs,
    [FASE.segmentar]: limits.faseSegmentarMs,
    [FASE.validar]: limits.faseValidarMs,
    [FASE.fechar]: 10_000,
  };
  const orcamento: Orcamento = { total: limits.orcamentoTotalMs, fases };

  const avisos: string[] = [];
  // Caminho crítico sequencial da captura por navegador (o que roda em série).
  const critico =
    limits.faseCarregarMs +
    limits.faseEstabilizarMs +
    limits.faseScrollLazyMs +
    limits.faseScrollAmostraMs +
    limits.faseInteracoesMs +
    limits.faseAssetsMs +
    limits.faseDrenarMs;
  if (critico > limits.orcamentoTotalMs) {
    avisos.push(
      `A soma dos tetos das fases (${critico}ms) excede o orçamento total (${limits.orcamentoTotalMs}ms): fases serão clampadas ao tempo restante e a captura pode sair parcial.`,
    );
  }
  return { orcamento, avisos };
};

/**
 * Corre uma promise contra um timeout (e, opcionalmente, um `AbortSignal`).
 * Resolve o valor se chegar a tempo, `null` se estourar OU o sinal abortar — e
 * ABANDONA a original (settle tardio é engolido), SEMPRE limpando o timer. É o
 * que garante que um corpo de resposta que nunca termina não segure o pipeline
 * (regras 6 e 18), e que a drenagem, ao encerrar, CANCELE as leituras pendentes
 * (o sinal) sem deixar timer vivo. Rejeição ANTES do corte é propagada.
 */
export const corridaComTimeout = <T>(
  p: Promise<T>,
  timeoutMs: number,
  signal?: AbortSignal,
): Promise<T | null> =>
  new Promise<T | null>((resolve, reject) => {
    let pronto = false;
    const fim = (acao: () => void): void => {
      if (pronto) return;
      pronto = true;
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
      acao();
    };
    const timer = setTimeout(() => fim(() => resolve(null)), timeoutMs);
    const onAbort = (): void => fim(() => resolve(null));
    if (signal) {
      if (signal.aborted) return fim(() => resolve(null));
      signal.addEventListener('abort', onAbort, { once: true });
    }
    p.then(
      (v) => fim(() => resolve(v)),
      (e) => fim(() => reject(e)),
    );
  });

/**
 * Redação para log seguro de URL: tira credenciais (userinfo) e a query string,
 * que podem carregar token. NUNCA logar a URL crua de um asset/página (regra 16).
 */
export const urlParaLog = (u: string): string => {
  try {
    const url = new URL(u);
    return `${url.protocol}//${url.host}${url.pathname}`;
  } catch {
    return '[url inválida]';
  }
};
