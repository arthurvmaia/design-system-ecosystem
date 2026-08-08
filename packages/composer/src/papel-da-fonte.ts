import { analisarCss } from './analisar-css.js';

/**
 * Qual família é a de TÍTULO e qual é a de TEXTO, numa folha de origem.
 *
 * ## Por que isto precisa existir
 *
 * `inventariarFontes` devolve as famílias com contagem, e o `papelSugerido`
 * dela só sabe emitir `'mono'` ou `null` — `display` e `body` eram
 * inalcançáveis, e o `FonteDoKit` do schema prometia os quatro. Sem essa
 * decisão não há como a marca substituir fonte nenhuma: trocar tudo pela fonte
 * de título deixaria o site inteiro em display, e trocar tudo pela de corpo
 * apagaria a hierarquia.
 *
 * ## Como decide
 *
 * Pelo SELETOR onde a família aparece, que é a única evidência que a folha
 * carrega. Um `h1{font-family:X}` diz que X é título; um `body{font-family:Y}`
 * diz que Y é texto. Nome de classe entra como sinal fraco (`.font-display`,
 * `.titulo`), porque nome de classe é intenção declarada por quem escreveu — e
 * às vezes mente.
 *
 * ## O que ela NÃO faz
 *
 * Não adivinha. Empate, evidência fraca ou família única sem sinal nenhum
 * devolvem `null`, e quem consome trata `null` como "não mexe". É a mesma regra
 * que `clusters.ts` já segue com `papel: null`: recolorir na dúvida é pior que
 * manter a aparência original, e o mesmo vale para a fonte.
 */

export type PapelDeFonte = 'display' | 'body' | 'mono';

/** Peso de cada evidência. Seletor de elemento vale mais que nome de classe. */
const PESO = { elemento: 5, classe: 2 } as const;

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

/**
 * Os nomes que abrem uma pilha de SISTEMA: "use a fonte do aparelho".
 *
 * Defeito medido no primeiro site gerado de verdade. O preflight do Tailwind
 * declara no `:root`:
 *
 *   `font-family: ui-sans-serif, system-ui, sans-serif, "Apple Color Emoji",
 *                 "Segoe UI Emoji", "Segoe UI Symbol", "Noto Color Emoji"`
 *
 * A regra "primeira família não genérica" pulava as três primeiras (que estão
 * na lista acima) e elegia **"Noto Color Emoji"** como a fonte de corpo do
 * site. Um fallback de emoji virava a identidade tipográfica da origem.
 *
 * A correção não é uma lista negra de nomes de emoji — seria interminável e
 * `Roboto` ou `Arial` são fonte escolhida num site e fallback noutro. O que
 * decide é o COMEÇO da pilha: quando ela abre com um destes, o site declarou
 * que não escolheu fonte nenhuma, e tudo que vem depois é reserva.
 */
const ABREM_PILHA_DE_SISTEMA = new Set([
  'ui-sans-serif',
  'ui-serif',
  'ui-monospace',
  'ui-rounded',
  'system-ui',
  '-apple-system',
  'blinkmacsystemfont',
]);

/**
 * A pilha é de sistema? Nesse caso não há família escolhida a preservar — e é
 * justamente onde a marca DEVE entrar, porque o usuário escolheu uma fonte e a
 * origem não.
 */
export const ehPilhaDeSistema = (pilha: readonly string[]): boolean => {
  const primeira = pilha.find((f) => f.trim().length > 0);
  return primeira !== undefined && ABREM_PILHA_DE_SISTEMA.has(primeira.trim().toLowerCase());
};

/**
 * As duas chaves de pilha de sistema.
 *
 * Precisam ser DUAS, e o motivo foi medido no site gerado: com uma chave só,
 * qualquer pilha de sistema monoespaçada na folha marcava a chave inteira como
 * `mono`, e aí a pilha de sistema SANS — que é a do `:root`, a de maior
 * alcance — recebia o token de monoespaçada. O site saía inteiro em fonte de
 * código.
 *
 * O `@` no começo é proposital: nome de família em CSS não começa com arroba,
 * então a chave nunca colide com um nome vindo da folha.
 */
export const PILHA_DE_SISTEMA = '@sistema';
export const PILHA_DE_SISTEMA_MONO = '@sistema-mono';

/** Qual das duas chaves esta pilha de sistema é. */
export const chaveDaPilhaDeSistema = (pilha: readonly string[]): string =>
  pilha.some((f) => /^(ui-)?monospace$/i.test(f.trim())) ? PILHA_DE_SISTEMA_MONO : PILHA_DE_SISTEMA;

/** `h1`…`h6` isolados, e as palavras que anunciam título num nome de classe. */
const HEADING_ELEMENTO = /(^|[\s,>+~])h[1-6]\b/i;
const HEADING_CLASSE =
  /\b(title|titulo|heading|headline|display|hero|logo)\b|--(title|heading|display)/i;

/** `body`/`html`/`:root`/`p`, e as palavras de texto corrido. */
const CORPO_ELEMENTO = /(^|[\s,>+~])(body|html|p)\b|:root/i;
const CORPO_CLASSE = /\b(body|prose|paragraph|texto|content|copy)\b/i;

type Placar = { display: number; body: number; ocorrencias: number; mono: boolean };

/**
 * O placar de cada família da folha.
 *
 * Exportado porque o teste precisa ver a evidência, não só o veredito — quando
 * a decisão sai errada, o que se quer olhar é por que ela saiu assim.
 */
export const placarDasFontes = (css: string): Map<string, Placar> => {
  const placar = new Map<string, Placar>();
  const analise = analisarCss(css);
  if ('erro' in analise) {
    return placar;
  }
  const raiz = analise.raiz;

  raiz.walkDecls(/^font-family$/i, (decl) => {
    // Dentro de `@font-face` o `font-family` é a DECLARAÇÃO do nome, não um
    // uso. Contá-la daria peso a uma família que talvez ninguém aplique.
    const pai = decl.parent;
    if (pai?.type === 'atrule' && pai.name.toLowerCase() === 'font-face') return;

    const pilha = decl.value.split(',').map((f) => f.trim().replace(/^['"]|['"]$/g, ''));
    // Pilha de sistema não tem família escolhida — e nem por isso fica de fora
    // do placar: ela entra sob uma chave própria, porque é justamente onde a
    // marca deve entrar (o usuário escolheu fonte, a origem não).
    const familia = ehPilhaDeSistema(pilha)
      ? chaveDaPilhaDeSistema(pilha)
      : pilha.find((f) => f.length > 0 && !GENERICAS.has(f.toLowerCase()));
    if (familia === undefined) return;

    const atual = placar.get(familia) ?? { display: 0, body: 0, ocorrencias: 0, mono: false };
    atual.ocorrencias += 1;
    // A pilha de sistema já se declarou pela chave; para as demais, `monospace`
    // em qualquer posição marca a família como monoespaçada.
    if (familia === PILHA_DE_SISTEMA_MONO) atual.mono = true;
    else if (familia !== PILHA_DE_SISTEMA && pilha.some((f) => f.toLowerCase() === 'monospace'))
      atual.mono = true;

    const seletor = pai?.type === 'rule' ? pai.selector : '';
    if (HEADING_ELEMENTO.test(seletor)) atual.display += PESO.elemento;
    else if (CORPO_ELEMENTO.test(seletor)) atual.body += PESO.elemento;
    else if (HEADING_CLASSE.test(seletor)) atual.display += PESO.classe;
    else if (CORPO_CLASSE.test(seletor)) atual.body += PESO.classe;

    placar.set(familia, atual);
  });
  return placar;
};

export type FontesDaOrigem = {
  display: string | null;
  body: string | null;
  mono: string | null;
};

/**
 * As três famílias de uma origem, ou `null` em cada uma que não deu para
 * afirmar.
 *
 * A regra do desempate final é o que evita o erro mais caro: se a MESMA família
 * ganha display e body, ela é a fonte única do site, e devolvê-la nos dois
 * papéis faria a marca trocar tudo por uma coisa só — apagando a hierarquia que
 * o site de origem tinha por peso e tamanho, não por família.
 */
export const fontesDaOrigem = (css: string): FontesDaOrigem => {
  const placar = placarDasFontes(css);
  const entradas = [...placar.entries()];

  // As pilhas de SISTEMA ficam fora da eleição, e isso é o ponto: elas não
  // disputam com uma família de verdade porque não são uma escolha do site.
  // Medido — com elas dentro, a pilha do `:root` vencia `Inter` no eixo de
  // corpo, e a fonte que a origem de fato escolheu ficava sem token.
  //
  // Elas recebem o token direto em `mapaDeFontes`, sempre.
  const entradasReais = entradas.filter(
    ([f]) => f !== PILHA_DE_SISTEMA && f !== PILHA_DE_SISTEMA_MONO,
  );

  const mono = entradasReais.find(([, p]) => p.mono)?.[0] ?? null;
  const candidatas = entradasReais.filter(([f]) => f !== mono);

  const melhor = (eixo: 'display' | 'body'): string | null => {
    const comEvidencia = candidatas
      .filter(([, p]) => p[eixo] > 0)
      .sort((a, b) => b[1][eixo] - a[1][eixo] || b[1].ocorrencias - a[1].ocorrencias);
    const primeiro = comEvidencia[0];
    const segundo = comEvidencia[1];
    if (primeiro === undefined) return null;
    // Empate de evidência não elege: duas famílias com o mesmo peso no mesmo
    // eixo significa que a folha não distingue, e escolher seria inventar.
    if (segundo !== undefined && segundo[1][eixo] === primeiro[1][eixo]) return null;
    return primeiro[0];
  };

  const display = melhor('display');
  const body = melhor('body');

  // Fonte única servindo aos dois papéis: mantém-se como CORPO. É o papel de
  // maior alcance, e trocar só o corpo preserva a hierarquia de peso e tamanho
  // que o site de origem construiu sem mudar de família.
  if (display !== null && display === body) return { display: null, body, mono };

  return { display, body, mono };
};
