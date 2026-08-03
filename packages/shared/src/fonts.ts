/**
 * Catálogo de fontes e montagem do CSS tipográfico.
 *
 * Fonte da verdade única, usada pelos dois lados:
 * - o web usa `GOOGLE_FONTS` para o seletor visual e `googleFontsCss2Url` para
 *   carregar a fonte no preview;
 * - o gerador usa `buildTypographyCss` para IMPORTAR e APLICAR as fontes no site
 *   final (o que hoje não acontece — o CSS gravava `--font-display: Inter` sem
 *   nunca importar a família nem aplicá-la aos títulos).
 *
 * A lista é curada e conservadora nos pesos: cada família lista só os pesos que
 * ela realmente tem, para o `css2` do Google nunca receber um peso inexistente
 * (o que derrubaria o carregamento inteiro da fonte).
 */

export type FontCategory = 'sans-serif' | 'serif' | 'display' | 'handwriting' | 'monospace';

export type FontDef = {
  family: string;
  category: FontCategory;
  /** Pesos realmente disponíveis na família (subconjunto seguro). */
  weights: number[];
  /** Aparece na lista curta antes de qualquer busca. */
  recommended?: boolean;
};

/**
 * Catálogo curado de Google Fonts populares. Pesos conservadores e verificáveis.
 * Não é a lista inteira do Google de propósito: uma lista enorme devolveria ao
 * usuário a indecisão que o seletor curado existe para remover, e evita depender
 * de uma API com chave.
 */
export const GOOGLE_FONTS: FontDef[] = [
  // Sans-serif
  { family: 'Inter', category: 'sans-serif', weights: [400, 500, 600, 700], recommended: true },
  { family: 'Roboto', category: 'sans-serif', weights: [400, 500, 700], recommended: true },
  { family: 'Open Sans', category: 'sans-serif', weights: [400, 500, 600, 700], recommended: true },
  { family: 'Lato', category: 'sans-serif', weights: [400, 700] },
  {
    family: 'Montserrat',
    category: 'sans-serif',
    weights: [400, 500, 600, 700],
    recommended: true,
  },
  { family: 'Poppins', category: 'sans-serif', weights: [400, 500, 600, 700], recommended: true },
  { family: 'DM Sans', category: 'sans-serif', weights: [400, 500, 700], recommended: true },
  { family: 'Nunito', category: 'sans-serif', weights: [400, 600, 700] },
  { family: 'Source Sans 3', category: 'sans-serif', weights: [400, 600, 700] },
  { family: 'Work Sans', category: 'sans-serif', weights: [400, 500, 600, 700] },
  { family: 'Raleway', category: 'sans-serif', weights: [400, 500, 600, 700] },
  { family: 'Manrope', category: 'sans-serif', weights: [400, 500, 600, 700], recommended: true },
  { family: 'Rubik', category: 'sans-serif', weights: [400, 500, 600, 700] },
  { family: 'Mulish', category: 'sans-serif', weights: [400, 600, 700] },
  { family: 'Karla', category: 'sans-serif', weights: [400, 500, 700] },
  { family: 'Figtree', category: 'sans-serif', weights: [400, 500, 600, 700] },
  { family: 'Plus Jakarta Sans', category: 'sans-serif', weights: [400, 500, 600, 700] },
  { family: 'Space Grotesk', category: 'sans-serif', weights: [400, 500, 700], recommended: true },
  { family: 'Archivo', category: 'sans-serif', weights: [400, 500, 600, 700] },
  { family: 'Libre Franklin', category: 'sans-serif', weights: [400, 500, 600, 700] },
  { family: 'Oswald', category: 'sans-serif', weights: [400, 500, 600, 700] },
  { family: 'Josefin Sans', category: 'sans-serif', weights: [400, 500, 600, 700] },
  { family: 'Quicksand', category: 'sans-serif', weights: [400, 500, 600, 700] },
  { family: 'IBM Plex Sans', category: 'sans-serif', weights: [400, 500, 600, 700] },
  // Serif
  {
    family: 'Playfair Display',
    category: 'serif',
    weights: [400, 500, 600, 700],
    recommended: true,
  },
  { family: 'Merriweather', category: 'serif', weights: [400, 700], recommended: true },
  { family: 'Lora', category: 'serif', weights: [400, 500, 600, 700], recommended: true },
  { family: 'PT Serif', category: 'serif', weights: [400, 700] },
  { family: 'Bitter', category: 'serif', weights: [400, 500, 700] },
  { family: 'EB Garamond', category: 'serif', weights: [400, 500, 600, 700] },
  { family: 'Cormorant Garamond', category: 'serif', weights: [400, 500, 600, 700] },
  { family: 'Source Serif 4', category: 'serif', weights: [400, 600, 700] },
  { family: 'IBM Plex Serif', category: 'serif', weights: [400, 500, 600, 700] },
  // Display
  { family: 'Bebas Neue', category: 'display', weights: [400], recommended: true },
  { family: 'Abril Fatface', category: 'display', weights: [400] },
  { family: 'Comfortaa', category: 'display', weights: [400, 700] },
  { family: 'Righteous', category: 'display', weights: [400] },
  { family: 'Archivo Black', category: 'display', weights: [400] },
  // Handwriting
  { family: 'Pacifico', category: 'handwriting', weights: [400] },
  { family: 'Dancing Script', category: 'handwriting', weights: [400, 700] },
  { family: 'Caveat', category: 'handwriting', weights: [400, 700] },
  // Monospace
  { family: 'Roboto Mono', category: 'monospace', weights: [400, 500, 700], recommended: true },
  { family: 'JetBrains Mono', category: 'monospace', weights: [400, 500, 700] },
  { family: 'Space Mono', category: 'monospace', weights: [400, 700] },
  { family: 'IBM Plex Mono', category: 'monospace', weights: [400, 500, 700] },
  { family: 'Fira Code', category: 'monospace', weights: [400, 500, 700] },
];

/** Fallback CSS por categoria — o site continua legível se o Google Fonts cair. */
const FALLBACK: Record<FontCategory, string> = {
  'sans-serif': 'Arial, Helvetica, sans-serif',
  serif: 'Georgia, "Times New Roman", serif',
  display: 'system-ui, -apple-system, sans-serif',
  handwriting: 'cursive',
  monospace: '"Courier New", monospace',
};

export const fallbackFor = (category: FontCategory): string => FALLBACK[category];

/** Extrai o nome da família de uma string que pode vir como stack ("Inter, sans-serif"). */
export const familyName = (raw: string): string =>
  (raw.split(',')[0] ?? raw).trim().replace(/^["']|["']$/g, '');

/** Acha a definição da família (tolera stacks e caixa). */
export const findFont = (raw: string): FontDef | undefined => {
  const n = familyName(raw).toLowerCase();
  return GOOGLE_FONTS.find((f) => f.family.toLowerCase() === n);
};

/** Pilha CSS pronta: `"Família", <fallback da categoria>`. */
export const fontStack = (raw: string): string => {
  const name = familyName(raw);
  if (name === '') return FALLBACK['sans-serif'];
  const def = findFont(raw);
  const fb = def ? fallbackFor(def.category) : 'system-ui, sans-serif';
  const quoted = /\s/.test(name) ? `"${name}"` : name;
  return `${quoted}, ${fb}`;
};

/** Monta a URL do Google Fonts css2 para as famílias/pesos dados (ou null se vazio). */
export const googleFontsCss2Url = (
  families: Array<{ family: string; weights: number[] }>,
): string | null => {
  const parts = families
    .filter((f) => f.family.trim() !== '')
    .map((f) => {
      const pesos = [...new Set(f.weights.length > 0 ? f.weights : [400])].sort((a, b) => a - b);
      const fam = encodeURIComponent(f.family).replace(/%20/g, '+');
      return `family=${fam}:wght@${pesos.join(';')}`;
    });
  if (parts.length === 0) return null;
  return `https://fonts.googleapis.com/css2?${parts.join('&')}&display=swap`;
};

/** Pesos a carregar de fato: só os desejados que a família tem (ou o base). */
const pickWeights = (def: FontDef | undefined, desejados: number[]): number[] => {
  if (!def) return desejados;
  const disponiveis = def.weights;
  const escolhidos = desejados.filter((w) => disponiveis.includes(w));
  if (escolhidos.length > 0) return escolhidos;
  return [disponiveis.includes(400) ? 400 : (disponiveis[0] ?? 400)];
};

/** Só o necessário: títulos usam mais peso; corpo, uma escala de leitura. */
const HEADING_WEIGHTS = [600, 700];
const BODY_WEIGHTS = [400, 500, 700];

export type TypographyChoice = { display: string; body: string; mono?: string };

/**
 * As famílias/pesos que uma escolha tipográfica precisa carregar — só o
 * necessário (título com peso de título, corpo com escala de leitura), e uma só
 * entrada quando título e corpo compartilham a família.
 */
export const fontFamiliesToLoad = (
  typography: TypographyChoice,
): Array<{ family: string; weights: number[] }> => {
  const dispDef = findFont(typography.display);
  const bodyDef = findFont(typography.body);
  const families: Array<{ family: string; weights: number[] }> = [];
  if (dispDef)
    families.push({ family: dispDef.family, weights: pickWeights(dispDef, HEADING_WEIGHTS) });
  if (bodyDef) {
    if (dispDef && bodyDef.family === dispDef.family) {
      families[0] = {
        family: dispDef.family,
        weights: [
          ...new Set([
            ...pickWeights(dispDef, HEADING_WEIGHTS),
            ...pickWeights(bodyDef, BODY_WEIGHTS),
          ]),
        ],
      };
    } else {
      families.push({ family: bodyDef.family, weights: pickWeights(bodyDef, BODY_WEIGHTS) });
    }
  }
  return families;
};

/**
 * O contrato central: a partir da escolha tipográfica, devolve a URL do Google
 * Fonts (só as famílias/pesos usados, para um `<link>` no head) e o CSS que
 * declara as variáveis e APLICA a fonte de títulos aos headings e a de corpo ao
 * body. É isto que faz a fonte escolhida realmente valer no site gerado — o CSS
 * antigo só declarava a variável e nunca importava nem aplicava aos títulos.
 */
export const buildTypographyCss = (
  typography: TypographyChoice,
): { importUrl: string | null; css: string } => {
  const importUrl = googleFontsCss2Url(fontFamiliesToLoad(typography));
  const display = fontStack(typography.display);
  const body = fontStack(typography.body);
  const mono = typography.mono ? fontStack(typography.mono) : null;

  /**
   * Os tokens saem em DOIS namespaces, e não é redundância.
   *
   * `--font-*` continua servindo as duas regras de tag nua abaixo, que é o que
   * o app sempre teve. `--marca-fonte-*` é o que as PEÇAS consomem depois da
   * retipografia (`@ds/composer`), e existe separado por um motivo medido: as
   * regras de tag nua valem (0,0,1) e perdem para qualquer classe utilitária da
   * origem, então elas nunca alcançaram o conteúdo das peças.
   *
   * O namespace é `--marca-*` e não `--font-*` porque `--font-*` é literalmente
   * o namespace de tema do Tailwind v4: a primeira captura de um site v4
   * declararia o mesmo nome, o proxy da origem interceptaria a herança, e a
   * marca voltaria a perder — desta vez sem nem a cascata para culpar.
   */
  const css = [
    `:root{--font-display:${display};--font-body:${body};${mono ? `--font-mono:${mono};` : ''}` +
      `--marca-fonte-display:${display};--marca-fonte-body:${body};${
        mono ? `--marca-fonte-mono:${mono};` : ''
      }}`,
    'body{font-family:var(--font-body)}',
    'h1,h2,h3,h4,h5,h6{font-family:var(--font-display)}',
  ].join('\n');
  return { importUrl, css };
};
