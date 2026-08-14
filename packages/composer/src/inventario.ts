import { analisarCss } from './analisar-css.js';
import { type CorAnalisada, analisarCor } from './cor.js';

/**
 * Inventário de cores de um CSS: cada literal, com CONTEXTO e contagem.
 *
 * Por que `walkDecls` e não regex sobre o texto: foi um regex que inutilizou o
 * `derivarTokens` do contrato — ele só casava `color|background|border` no
 * INÍCIO da declaração, e as três cores que dominavam a tela do site real
 * (`#0D3C1F`, `#3D7F61`, `#F69066`) não apareciam em contrato nenhum, porque
 * viviam em gradientes, sombras e shorthands. Andar pelas declarações parseadas
 * enxerga o valor inteiro de cada propriedade, seja ela qual for.
 *
 * O contexto importa tanto quanto a cor: `#111` em `background` e `#111` em
 * `color` são papéis diferentes num tema claro. É o contexto que permite ao
 * cluster decidir se um neutro é fundo ou texto.
 */

export type ContextoDeCor = 'bg' | 'text' | 'border' | 'gradient' | 'shadow' | 'icone' | 'outro';

export type OcorrenciaDeCor = CorAnalisada & {
  contexto: ContextoDeCor;
  ocorrencias: number;
};

/** O contexto de uma declaração, pela propriedade e pelo valor. */
const contextoDe = (prop: string, valor: string): ContextoDeCor => {
  const p = prop.toLowerCase();
  // Gradiente vence a propriedade: um `background: linear-gradient(...)` é
  // contexto de gradiente, não de fundo chapado — o cluster trata diferente.
  if (/gradient\(/i.test(valor)) return 'gradient';
  if (p === 'background' || p === 'background-color' || p === 'background-image') return 'bg';
  if (p === 'color' || p === 'caret-color' || p === 'accent-color') return 'text';
  if (
    /^border(-(top|right|bottom|left))?(-color)?$/.test(p) ||
    p === 'outline-color' ||
    p === 'outline' ||
    p === 'column-rule-color' ||
    p === 'text-decoration-color'
  ) {
    return 'border';
  }
  if (p === 'box-shadow' || p === 'text-shadow' || p === 'filter') return 'shadow';
  if (p === 'fill' || p === 'stroke') return 'icone';
  return 'outro';
};

/**
 * Extrai os literais de cor de UM valor de CSS, pulando `url(...)` inteiro.
 *
 * O pulo do url não é detalhe: um SVG em data-uri carrega `%23F69066` e `#id`
 * de gradiente interno — nada disso é cor da página, e um replace que entrasse
 * ali corromperia o asset.
 */
export const coresDoValor = (valor: string): CorAnalisada[] => {
  const achadas: CorAnalisada[] = [];
  let i = 0;
  while (i < valor.length) {
    // Pula url(...) com parênteses balanceados.
    const url = /^url\(/i.exec(valor.slice(i));
    if (url !== null) {
      let nivel = 0;
      let j = i + 3; // aponta para o '('
      do {
        const ch = valor[j];
        if (ch === '(') nivel++;
        if (ch === ')') nivel--;
        j++;
      } while (j < valor.length && nivel > 0);
      i = j;
      continue;
    }

    // Hex: para no primeiro caractere que não é dígito hex.
    if (valor[i] === '#') {
      const m = /^#[0-9a-fA-F]{3,8}/.exec(valor.slice(i));
      if (m !== null) {
        const cor = analisarCor(m[0]);
        if (cor !== null) achadas.push(cor);
        i += m[0].length;
        continue;
      }
    }

    // Funções de cor: captura com parênteses balanceados (o alfa pode ser um
    // var() com vírgula dentro).
    const fn = /^(rgba?|hsla?)\(/i.exec(valor.slice(i));
    if (fn !== null) {
      let nivel = 0;
      let j = i + (fn[1] as string).length;
      const inicio = i;
      do {
        const ch = valor[j];
        if (ch === '(') nivel++;
        if (ch === ')') nivel--;
        j++;
      } while (j < valor.length && nivel > 0);
      const cor = analisarCor(valor.slice(inicio, j));
      if (cor !== null) achadas.push(cor);
      i = j;
      continue;
    }

    i++;
  }
  return achadas;
};

/**
 * Inventaria as cores de um CSS inteiro.
 *
 * CSS que não parseia devolve lista vazia em vez de lançar: o chamador declara
 * a limitação ("não deu para inventariar a origem X") e a peça segue com a
 * aparência original — perder a recoloração de uma origem é degradação
 * aceitável; derrubar a consolidação do kit inteiro não é.
 */
export const inventariarCores = (css: string): OcorrenciaDeCor[] => {
  const analise = analisarCss(css);
  if ('erro' in analise) {
    return [];
  }
  const raiz = analise.raiz;

  // Agrega por literal+contexto: o mapa preserva a primeira CorAnalisada e
  // soma as repetições.
  const mapa = new Map<string, OcorrenciaDeCor>();
  raiz.walkDecls((decl) => {
    const contexto = decl.prop.startsWith('--') ? 'outro' : contextoDe(decl.prop, decl.value);
    for (const cor of coresDoValor(decl.value)) {
      const chave = `${cor.literal}|${contexto}`;
      const atual = mapa.get(chave);
      if (atual !== undefined) {
        atual.ocorrencias += 1;
      } else {
        mapa.set(chave, { ...cor, contexto, ocorrencias: 1 });
      }
    }
  });
  return [...mapa.values()];
};

/** Uma família tipográfica encontrada, com contagem. */
export type FonteInventariada = {
  familia: string;
  papelSugerido: 'display' | 'body' | 'mono' | null;
  ocorrencias: number;
};

/**
 * Inventaria as famílias de fonte que são DECISÃO DE DESIGN.
 *
 * Só a PRIMEIRA família de cada pilha entra, e essa regra é o conserto de um
 * defeito visível: o painel do kit listava "Apple Color Emoji", "Segoe UI
 * Symbol", "Menlo", "Monaco", "SFMono-Regular" ao lado de Geist e Inter. Nada
 * daquilo foi escolhido por ninguém — é a cauda de fallback que todo
 * `font-family` carrega, e listar tudo transformava a informação em ruído.
 *
 * Uma lista de nomes proibidos resolveria pela metade e envelheceria mal (a
 * próxima pilha traria outro fallback exótico). A posição resolve inteiro: numa
 * pilha, quem manda é o primeiro nome disponível; o resto só existe para quando
 * ele falta.
 *
 * `monospace` em qualquer lugar da pilha ainda marca a família como `mono` — é
 * a única sugestão de papel que dá para afirmar sem olhar a página.
 */
export const inventariarFontes = (css: string): FonteInventariada[] => {
  const analise = analisarCss(css);
  if ('erro' in analise) {
    return [];
  }
  const raiz = analise.raiz;
  /** Palavras que nomeiam uma CLASSE de fonte, nunca uma família concreta. */
  const GENERICAS = new Set([
    'sans-serif',
    'serif',
    'monospace',
    'cursive',
    'fantasy',
    'system-ui',
    'ui-sans-serif',
    'ui-serif',
    'ui-monospace',
    'ui-rounded',
    'math',
    'emoji',
    'fangsong',
    'inherit',
    'initial',
    'revert',
    'unset',
  ]);
  const mapa = new Map<string, FonteInventariada>();
  raiz.walkDecls(/^font(-family)?$/, (decl) => {
    const pilha = decl.value.split(',').map((f) => f.trim().replace(/^['"]|['"]$/g, ''));
    const temMono = pilha.some((f) => f.toLowerCase() === 'monospace');
    // A primeira família concreta da pilha: pular as genéricas cobre o caso de
    // `font-family: system-ui, "Minha Fonte"`, em que a escolha vem depois.
    const escolhida = pilha.find((f) => f.length > 0 && !GENERICAS.has(f.toLowerCase()));
    if (escolhida === undefined) return;
    const atual = mapa.get(escolhida);
    if (atual !== undefined) atual.ocorrencias += 1;
    else
      mapa.set(escolhida, {
        familia: escolhida,
        papelSugerido: temMono ? 'mono' : null,
        ocorrencias: 1,
      });
  });
  return [...mapa.values()].sort((a, b) => b.ocorrencias - a.ocorrencias);
};
