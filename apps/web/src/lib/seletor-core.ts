/**
 * Núcleo PURO dos seletores próprios (Select, Combobox, MultiSelect, Menu).
 *
 * Toda a lógica que decide comportamento vive aqui, sem DOM e sem React:
 * navegação por teclado (setas com pulo de desabilitado e loop, Home/End,
 * busca por digitação com janela de tempo, Enter/Espaço, Esc), filtragem de
 * combobox com normalização de acento, e o posicionamento do flutuante
 * (flip/clamp na viewport). Os componentes visuais só EXECUTAM o que o núcleo
 * decidiu — e é o núcleo que os testes cobrem exaustivamente, sem navegador.
 */

export type OpcaoDeSeletor = {
  valor: string;
  rotulo: string;
  descricao?: string;
  desabilitada?: boolean;
  /** Agrupamento visual opcional (cabeçalho de grupo). */
  grupo?: string;
};

/** Remove acentos e caixa para busca digitada e filtro de combobox. */
export const normalizarBusca = (t: string): string =>
  t
    .normalize('NFD')
    .replace(/\p{Mn}/gu, '')
    .toLowerCase()
    .trim();

/** Filtra opções para o combobox: prefixo pesa mais que ocorrência interna. */
export const filtrarOpcoes = (
  opcoes: readonly OpcaoDeSeletor[],
  consulta: string,
): OpcaoDeSeletor[] => {
  const q = normalizarBusca(consulta);
  if (q.length === 0) return [...opcoes];
  const comPeso = opcoes
    .map((o) => {
      const alvo = normalizarBusca(`${o.rotulo} ${o.descricao ?? ''}`);
      const idx = alvo.indexOf(q);
      return { o, peso: idx === -1 ? -1 : idx === 0 ? 0 : 1 };
    })
    .filter((x) => x.peso >= 0);
  comPeso.sort((a, b) => a.peso - b.peso);
  return comPeso.map((x) => x.o);
};

// ── Navegação por índice ─────────────────────────────────────────────────────

const habilitadas = (opcoes: readonly OpcaoDeSeletor[]): number[] =>
  opcoes.flatMap((o, i) => (o.desabilitada ? [] : [i]));

/**
 * Próximo índice ativo a partir de uma tecla de navegação. `null` de entrada =
 * nada ativo ainda (abrir com seta ativa a primeira/última habilitada).
 * Setas fazem LOOP; Home/End vão ao extremo habilitado; desabilitada é pulada.
 */
export const moverAtivo = (
  opcoes: readonly OpcaoDeSeletor[],
  atual: number | null,
  tecla: 'ArrowDown' | 'ArrowUp' | 'Home' | 'End',
): number | null => {
  const validas = habilitadas(opcoes);
  if (validas.length === 0) return null;
  const primeiro = validas[0] as number;
  const ultimo = validas[validas.length - 1] as number;
  if (tecla === 'Home') return primeiro;
  if (tecla === 'End') return ultimo;
  if (atual === null) return tecla === 'ArrowDown' ? primeiro : ultimo;
  const pos = validas.indexOf(atual);
  const base = pos === -1 ? (tecla === 'ArrowDown' ? -1 : validas.length) : pos;
  const delta = tecla === 'ArrowDown' ? 1 : -1;
  const proxima = (base + delta + validas.length) % validas.length;
  return validas[proxima] as number;
};

/**
 * Busca por digitação (typeahead): acumula caracteres numa janela de tempo e
 * move para a PRÓXIMA opção cujo rótulo começa com o buffer (a partir do
 * ativo, com loop). Repetir a mesma letra cicla entre as opções que começam
 * com ela — o comportamento nativo de <select> que os usuários esperam.
 */
export type EstadoTypeahead = { buffer: string; ultimoMs: number };
export const JANELA_TYPEAHEAD_MS = 700;

export const aplicarTypeahead = (
  opcoes: readonly OpcaoDeSeletor[],
  atual: number | null,
  estado: EstadoTypeahead,
  caractere: string,
  agoraMs: number,
): { ativo: number | null; estado: EstadoTypeahead } => {
  const dentroDaJanela = agoraMs - estado.ultimoMs <= JANELA_TYPEAHEAD_MS;
  const repetido = dentroDaJanela && estado.buffer === caractere;
  const buffer = dentroDaJanela && !repetido ? estado.buffer + caractere : caractere;
  const q = normalizarBusca(buffer);
  const n = opcoes.length;
  if (n === 0 || q.length === 0) return { ativo: atual, estado: { buffer, ultimoMs: agoraMs } };
  const inicio = atual === null ? 0 : repetido || q.length === 1 ? atual + 1 : atual;
  for (let passo = 0; passo < n; passo++) {
    const i = (inicio + passo + n) % n;
    const o = opcoes[i] as OpcaoDeSeletor;
    if (o.desabilitada) continue;
    if (normalizarBusca(o.rotulo).startsWith(q)) {
      return { ativo: i, estado: { buffer, ultimoMs: agoraMs } };
    }
  }
  return { ativo: atual, estado: { buffer, ultimoMs: agoraMs } };
};

// ── Seleção múltipla ─────────────────────────────────────────────────────────

/**
 * Alterna um valor numa seleção múltipla respeitando o limite. Com limite
 * atingido, adicionar é IGNORADO (o componente mostra o porquê); remover
 * sempre funciona. O item principal é sempre o primeiro da lista.
 */
export const alternarMulti = (
  selecao: readonly string[],
  valor: string,
  limite?: number,
): { selecao: string[]; recusadoPorLimite: boolean } => {
  if (selecao.includes(valor)) {
    return { selecao: selecao.filter((v) => v !== valor), recusadoPorLimite: false };
  }
  if (limite !== undefined && selecao.length >= limite) {
    return { selecao: [...selecao], recusadoPorLimite: true };
  }
  return { selecao: [...selecao, valor], recusadoPorLimite: false };
};

/** Promove um valor a item PRINCIPAL (primeiro da lista), preservando o resto. */
export const promoverPrincipal = (selecao: readonly string[], valor: string): string[] =>
  selecao.includes(valor) ? [valor, ...selecao.filter((v) => v !== valor)] : [...selecao];

// ── Posicionamento do flutuante ──────────────────────────────────────────────

export type Retangulo = { x: number; y: number; w: number; h: number };

export type PosicaoFlutuante = {
  x: number;
  y: number;
  maxAltura: number;
  /** Abriu para cima (não coube embaixo)? Os componentes ajustam a origem da animação. */
  paraCima: boolean;
};

/**
 * Posiciona o flutuante sob o gatilho, com flip para cima quando não cabe
 * embaixo e clamp horizontal na viewport. `alturaDesejada` é o teto natural do
 * conteúdo; a altura final respeita o espaço real (mínimo legível de 120px).
 */
export const posicionarFlutuante = (
  gatilho: Retangulo,
  viewport: { w: number; h: number },
  alturaDesejada: number,
  margem = 8,
): PosicaoFlutuante => {
  const abaixo = viewport.h - (gatilho.y + gatilho.h) - margem;
  const acima = gatilho.y - margem;
  const cabeEmbaixo = abaixo >= Math.min(alturaDesejada, 160) || abaixo >= acima;
  const espaco = cabeEmbaixo ? abaixo : acima;
  const maxAltura = Math.max(120, Math.min(alturaDesejada, espaco));
  const y = cabeEmbaixo ? gatilho.y + gatilho.h + 4 : Math.max(margem, gatilho.y - 4 - maxAltura);
  const x = Math.max(margem, Math.min(gatilho.x, viewport.w - gatilho.w - margem));
  return { x, y, maxAltura, paraCima: !cabeEmbaixo };
};
