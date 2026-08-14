import { analisarCss } from './analisar-css.js';
import {
  type FontesDaOrigem,
  PILHA_DE_SISTEMA,
  PILHA_DE_SISTEMA_MONO,
  type PapelDeFonte,
  chaveDaPilhaDeSistema,
  ehPilhaDeSistema,
} from './papel-da-fonte.js';

/**
 * Retipografia: troca a família de origem por um nome que a marca controla.
 *
 * ## O defeito, medido
 *
 * A marca do usuário PERDIA a cascata, e o número explica por quê:
 *
 *   `body{font-family:var(--font-body)}`  →  especificidade (0,0,1)
 *   `.font-sans` da origem                →  especificidade (0,1,0)
 *
 * A classe utilitária ganha de um seletor de elemento, sempre. A fonte
 * escolhida pelo usuário só alcançava tag nua — e num site Tailwind quase nada
 * é tag nua. Ele escolhia a fonte, o app dizia que tinha aplicado, e o site
 * saía com a fonte do site de origem.
 *
 * E não é acidente do escopo: `escopo.ts` mantém a origem em especificidade
 * ZERO de propósito, para o `marca.css` poder vencer. O problema é que os dois
 * falam línguas diferentes — a marca fala em seletor de elemento e a origem
 * fala em classe utilitária.
 *
 * ## A saída é a mesma que a cor já provou
 *
 * Não disputar a cascata: reescrever a origem para CONSUMIR o token, com a
 * pilha original como fallback.
 *
 *   `font-family:"Space Grotesk",sans-serif`
 *   → `font-family:var(--marca-fonte-display, "Space Grotesk",sans-serif)`
 *
 * Os dois invariantes que `recolorir.ts` carrega valem aqui igual, e há teste
 * para os dois:
 *
 * - **O fallback é SEMPRE a pilha original.** Marca sem tipografia, papel não
 *   decidido, kit antigo: a peça degrada para a fonte de origem, nunca para
 *   uma fonte de sistema aleatória.
 * - **Esta função NUNCA declara `--marca-*`, só consome.** É o que garante que
 *   o `:root` do `marca.css` alcança as peças por herança limpa — a origem não
 *   declara nada nesse namespace, então não há proxy no caminho para
 *   interceptar.
 *
 * O namespace `--marca-fonte-*` foi escolhido e não `--font-*`: `--font-*` é
 * literalmente o namespace de tema do Tailwind v4, e a primeira captura de um
 * site v4 traria a colisão de volta pela porta dos fundos.
 */

export type ResultadoRetipografia = {
  css: string;
  /** Quantas declarações passaram a consumir o token da marca. */
  reescritas: number;
  /** Quantas ficaram como estavam (papel não decidido, ou já é var()). */
  mantidas: number;
};

/** O token que a marca declara para cada papel. */
export const TOKEN_DE_FONTE: Record<PapelDeFonte, string> = {
  display: '--marca-fonte-display',
  body: '--marca-fonte-body',
  mono: '--marca-fonte-mono',
};

/** `família (minúscula) → papel`. Vazio = nada a fazer. */
export type MapaDeFontes = ReadonlyMap<string, PapelDeFonte>;

export const mapaDeFontes = (fontes: FontesDaOrigem): MapaDeFontes => {
  const mapa = new Map<string, PapelDeFonte>();
  if (fontes.display !== null) mapa.set(fontes.display.toLowerCase(), 'display');
  if (fontes.body !== null) mapa.set(fontes.body.toLowerCase(), 'body');
  if (fontes.mono !== null) mapa.set(fontes.mono.toLowerCase(), 'mono');
  // As pilhas de sistema entram SEMPRE, sem passar pela eleição: o site que
  // pede a fonte do aparelho não escolheu nada, e é justamente onde a fonte que
  // o usuário escolheu tem mais razão de entrar. É também a regra de maior
  // alcance, porque o preflight a declara na raiz e toda peça herda.
  mapa.set(PILHA_DE_SISTEMA, 'body');
  mapa.set(PILHA_DE_SISTEMA_MONO, 'mono');
  return mapa;
};

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

export const retipografarCss = (css: string, mapa: MapaDeFontes): ResultadoRetipografia => {
  if (mapa.size === 0) return { css, reescritas: 0, mantidas: 0 };

  const analise = analisarCss(css);
  if ('erro' in analise) {
    // Folha ilegível segue como está. O escopo já declara esse risco em aviso;
    // duplicar o aviso aqui só encheria a lista.
    return { css, reescritas: 0, mantidas: 0 };
  }
  const raiz = analise.raiz;

  let reescritas = 0;
  let mantidas = 0;

  raiz.walkDecls(/^font-family$/i, (decl) => {
    const pai = decl.parent;
    // Dentro de `@font-face` o `font-family` é o NOME da fonte declarada.
    // Envolvê-lo em `var()` criaria uma fonte chamada "var(...)", e a peça
    // perderia o arquivo que acabou de baixar.
    if (pai?.type === 'atrule' && pai.name.toLowerCase() === 'font-face') return;

    // Já é var(): ou outra passagem já fez, ou a origem usava variável. Nos
    // dois casos, mexer de novo aninharia fallback sobre fallback.
    if (decl.value.includes('var(--marca-fonte-')) {
      mantidas += 1;
      return;
    }

    const pilha = decl.value.split(',').map((f) => f.trim().replace(/^['"]|['"]$/g, ''));
    // A mesma chave do placar: pilha de sistema é "o site não escolheu fonte",
    // e é onde a marca tem mais razão de entrar.
    const familia = ehPilhaDeSistema(pilha)
      ? chaveDaPilhaDeSistema(pilha)
      : pilha.find((f) => f.length > 0 && !GENERICAS.has(f.toLowerCase()));
    if (familia === undefined) {
      mantidas += 1;
      return;
    }
    const papel = mapa.get(familia.toLowerCase());
    if (papel === undefined) {
      mantidas += 1;
      return;
    }

    // A pilha INTEIRA vira o fallback. O `var()` aceita vírgula no fallback:
    // tudo depois da primeira vírgula é o valor de reserva, incluindo as
    // outras vírgulas. É o que preserva `sans-serif` no fim.
    decl.value = `var(${TOKEN_DE_FONTE[papel]}, ${decl.value})`;
    reescritas += 1;
  });

  return { css: raiz.toString(), reescritas, mantidas };
};
