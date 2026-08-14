/**
 * O PAR: o texto e o fundo em que ele senta, conferidos JUNTOS.
 *
 * ## O defeito que isto conserta
 *
 * A recoloração migra cor por cor, cada uma pelo seu papel, e cada escolha
 * isolada está certa. A guarda que já existia (`textoQueSeLe`) confere o texto
 * contra o **fundo da PÁGINA** — e é aí que o buraco mora: o texto que falha não
 * senta na página, senta num cartão, num botão, numa faixa.
 *
 * Medido no banco de prova, num botão real:
 *
 * ```
 * origem:  fundo #FBFCD4 (amarelo claro) × texto stone-900 (quase preto) = 16,64:1
 * depois:  fundo --marca-accent #e8a33c  × texto --marca-heading #faf3ec =  1,96:1
 * ```
 *
 * Os dois lados migraram CERTO. O texto contra a página dá 16,78:1; o fundo do
 * botão contra a página dá 8,56:1. Cada um passa sozinho, e o par — que é o que
 * a pessoa lê — colapsa. Quando a marca é escura, "fundo claro da origem" e
 * "texto escuro da origem" caem os DOIS na família clara da marca.
 *
 * Foi este par que reprovou a regra S4 em 19 dos 20 kits.
 *
 * ## Por que aqui, e não dentro da recoloração
 *
 * Porque o par está atravessado entre dois lugares: a CLASSE está no HTML
 * (`class="bg-[#FBFCD4] text-stone-900"`) e o TOKEN está no CSS já recolorido
 * (`.text-stone-900{color:var(--marca-heading,…)}`). Nenhum dos dois sozinho
 * enxerga o par; esta passagem junta os dois e é a única que pode.
 *
 * ## Como o conserto é feito
 *
 * Trocando a TINTA, nunca o fundo. O fundo é a superfície da região e manda no
 * desenho — mexer nele muda o que a peça é. A tinta é o que precisa se acomodar
 * para ser lida, e é o que um designer trocaria.
 *
 * O conserto sai como `style` no próprio elemento: vence a cascata sem
 * `!important`, atinge só aquele elemento, e não reescreve a folha da origem —
 * o mesmo princípio da folha de ajustes.
 */

/** O contraste mínimo. O mesmo piso da recoloração e da regra S4. */
export const PISO_DO_PAR = 3;

export type TokensDaMarca = Readonly<Record<string, string>>;

const hexOpaco = (v: string): string | null => {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(v.trim());
  if (m === null) return null;
  const h = m[1] as string;
  return h.length === 3
    ? `#${h[0]}${h[0]}${h[1]}${h[1]}${h[2]}${h[2]}`.toLowerCase()
    : `#${h}`.toLowerCase();
};

const luminancia = (hex: string): number | null => {
  const n = hexOpaco(hex);
  if (n === null) return null;
  const v = Number.parseInt(n.slice(1), 16);
  const canais = [(v >> 16) & 255, (v >> 8) & 255, v & 255].map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * (canais[0] ?? 0) + 0.7152 * (canais[1] ?? 0) + 0.0722 * (canais[2] ?? 0);
};

/** A razão de contraste entre duas cores. `null` quando alguma não se lê. */
export const contrasteEntre = (a: string, b: string): number | null => {
  const la = luminancia(a);
  const lb = luminancia(b);
  if (la === null || lb === null) return null;
  const [alto, baixo] = la >= lb ? [la, lb] : [lb, la];
  return (alto + 0.05) / (baixo + 0.05);
};

/**
 * A cor DERIVADA: o papel da marca com o ajuste que a recoloração aplicou.
 *
 * ## Por que isto precisa existir aqui
 *
 * A recoloração não escreve só `var(--marca-primary)`. Quando o papel foi
 * herdado de um vizinho de matiz, o que separava as duas cores tem de
 * sobreviver à troca, e ela emite a cor RELATIVA:
 *
 * ```css
 * color: oklch(from var(--marca-secondary, #0d0c22) calc(l - 0.457) calc(c * 0.192) h)
 * ```
 *
 * A conferência do par lia `var(--marca-secondary)` e comparava o TOKEN CRU —
 * enquanto a tela pintava uma cor 0,457 de luminância mais escura. Ela concluía
 * que o par estava bom e a pessoa via 1,49:1. Medido: era esta a forma de todos
 * os trechos de S4 que sobraram depois do par literal.
 *
 * Julgar contraste pela cor que NÃO está na tela é o mesmo defeito da régua
 * alimentada por constante, com outra roupa.
 */
export type AjusteDeCor = { deltaL: number; ratioC: number };

/** `oklch(from var(--marca-X, …) calc(l - 0.457) calc(c * 0.192) h)` → o ajuste. */
export const lerAjusteRelativo = (valor: string): AjusteDeCor | null => {
  if (!/oklch\(\s*from/i.test(valor)) return null;
  const l = /calc\(\s*l\s*([+-])\s*([\d.]+)\s*\)/i.exec(valor);
  const c = /calc\(\s*c\s*\*\s*([\d.]+)\s*\)/i.exec(valor);
  if (l === null && c === null) return null;
  const sinal = l?.[1] === '-' ? -1 : 1;
  return {
    deltaL: l === null ? 0 : sinal * Number.parseFloat(l[2] ?? '0'),
    ratioC: c === null ? 1 : Number.parseFloat(c[1] ?? '1'),
  };
};

/**
 * O ALFA de uma superfície translúcida, quando ela declara um.
 *
 * Reconhece as três formas que aparecem no CSS composto: a sintaxe relativa que
 * a recoloração emite (`rgb(from var(--marca-x) r g b / .05)`), o `rgba()` da
 * origem e o `color-mix` com porcentagem de transparente.
 */
export const lerAlfa = (valor: string): number | null => {
  const m = /\/\s*([\d.]+%?)\s*\)/.exec(valor);
  if (m !== null) {
    const bruto = m[1] ?? '';
    const n = Number.parseFloat(bruto);
    if (!Number.isFinite(n)) return null;
    const a = bruto.endsWith('%') ? n / 100 : n;
    return a >= 0 && a < 1 ? a : null;
  }
  const mix = /color-mix\([^)]*transparent\s+([\d.]+)%/i.exec(valor);
  if (mix !== null) {
    const n = Number.parseFloat(mix[1] ?? '');
    return Number.isFinite(n) && n > 0 && n <= 100 ? 1 - n / 100 : null;
  }
  return null;
};

/** Compõe uma cor com alfa sobre a que está atrás. */
export const comporSobre = (frente: string, atras: string, alfa: number): string | null => {
  const f = hexOpaco(frente);
  const a = hexOpaco(atras);
  if (f === null || a === null) return null;
  const canal = (i: number): string => {
    const cf = Number.parseInt(f.slice(1 + i * 2, 3 + i * 2), 16);
    const ca = Number.parseInt(a.slice(1 + i * 2, 3 + i * 2), 16);
    return Math.round(cf * alfa + ca * (1 - alfa))
      .toString(16)
      .padStart(2, '0');
  };
  return `#${canal(0)}${canal(1)}${canal(2)}`;
};

const paraLinear = (x: number): number => (x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4);
const deLinear = (x: number): number =>
  x <= 0.0031308 ? 12.92 * x : 1.055 * x ** (1 / 2.4) - 0.055;

/** Aplica o ajuste da recoloração a um hex, no mesmo espaço em que ela o escreveu. */
export const aplicarAjuste = (hex: string, ajuste: AjusteDeCor): string | null => {
  const n = hexOpaco(hex);
  if (n === null) return null;
  const v = Number.parseInt(n.slice(1), 16);
  const [r, g, b] = [(v >> 16) & 255, (v >> 8) & 255, v & 255].map((c) => paraLinear(c / 255)) as [
    number,
    number,
    number,
  ];

  const lc = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const mc = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const sc = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const L = 0.2104542553 * lc + 0.793617785 * mc - 0.0040720468 * sc;
  const A = 1.9779984951 * lc - 2.428592205 * mc + 0.4505937099 * sc;
  const B = 0.0259040371 * lc + 0.7827717662 * mc - 0.808675766 * sc;

  const Ln = Math.min(1, Math.max(0, L + ajuste.deltaL));
  const An = A * ajuste.ratioC;
  const Bn = B * ajuste.ratioC;

  const l2 = (Ln + 0.3963377774 * An + 0.2158037573 * Bn) ** 3;
  const m2 = (Ln - 0.1055613458 * An - 0.0638541728 * Bn) ** 3;
  const s2 = (Ln - 0.0894841775 * An - 1.291485548 * Bn) ** 3;
  const canais = [
    4.0767416621 * l2 - 3.3077115913 * m2 + 0.2309699292 * s2,
    -1.2684380046 * l2 + 2.6097574011 * m2 - 0.3413193965 * s2,
    -0.0041960863 * l2 - 0.7034186147 * m2 + 1.707614701 * s2,
  ].map((x) =>
    Math.round(Math.min(255, Math.max(0, deLinear(x) * 255)))
      .toString(16)
      .padStart(2, '0'),
  );
  return `#${canais.join('')}`;
};

/**
 * As classes de um seletor — só as que valem por si, sem depender de ancestral.
 *
 * ## As duas formas, e por que a segunda me pegou
 *
 * A primeira versão só reconhecia a classe SOLTA (`.text-stone-900{…}`) e
 * achou ZERO pares num site com 144 `var(--marca-)` na folha. O motivo é o
 * escopo por origem: `escoparCss` reescreve a regra como
 *
 * ```css
 * :where([data-ds-raiz="ds_…"], [data-ds-corpo="ds_…"]):is(.from-black){…}
 * ```
 *
 * e nesse site NÃO sobrou nenhuma cópia solta da classe. Procurar a forma
 * errada é como a correção rodou, não achou nada e não avisou nada — o par
 * seguiu quebrado com o conserto instalado.
 *
 * ## O que continua de fora, de propósito
 *
 * Seletor com descendente (`:where(…) ::before`, `.pai .filho`) não entra: ele
 * depende de um ancestral que o recorte pode ter deixado para trás, e o par
 * dele não se conhece sem o documento. Depois de tirar o prefixo de escopo, o
 * que sobra tem de ser EXATAMENTE uma classe.
 */
const classesDoSeletor = (seletor: string): string[] => {
  const out = new Set<string>();
  const limpar = (c: string): string => c.replace(/\\/g, '');

  // A forma escopada: `…:is(.classe)` no fim, sem nada depois.
  for (const parte of seletor.split(/,(?![^()]*\))/)) {
    const p = parte.trim();
    const escopada = /:is\(\.((?:\\.|[\w-])+)\)$/.exec(p);
    if (escopada?.[1] !== undefined) {
      out.add(limpar(escopada[1]));
      continue;
    }
    const solta = /^\.((?:\\.|[\w-])+)$/.exec(p);
    if (solta?.[1] !== undefined) out.add(limpar(solta[1]));
  }
  return [...out];
};

/**
 * O mapa `classe → papel`, lido do CSS JÁ RECOLORIDO.
 *
 * Duas leituras separadas, porque a mesma classe não pode servir aos dois lados:
 * `.text-*` diz TINTA, `.bg-*` diz FUNDO. Uma regra que declare os dois entra
 * nos dois mapas, e o par dela é conferido do mesmo jeito.
 */
export const mapearClassesPorPapel = (
  css: string,
): {
  tinta: Map<string, string>;
  fundo: Map<string, string>;
  /** `classe → hex` da tinta que NÃO virou papel (ver `literalDe`). */
  tintaLiteral: Map<string, string>;
  /**
   * `classe → hex` do FUNDO que não virou papel — o outro lado do mesmo buraco.
   *
   * `bg-white/95` e `bg-slate-50` não pertencem a papel nenhum, então a
   * recoloração não os toca e o mapa de papéis não os conhece. A conferência
   * caía para o papel do ANCESTRAL — quase sempre o fundo escuro da página — e
   * escolhia uma tinta clara que ia parar sobre a superfície branca. Medido: 14
   * elementos com o conserto aplicado e ainda a 1,16:1, mais 13 a 1,04:1.
   */
  fundoLiteral: Map<string, string>;
  /** `classe → ajuste` quando a recoloração escreveu cor DERIVADA (ver `lerAjusteRelativo`). */
  ajusteDaTinta: Map<string, AjusteDeCor>;
  ajusteDoFundo: Map<string, AjusteDeCor>;
  /**
   * `classe → alfa` da superfície TRANSLÚCIDA.
   *
   * A recoloração preserva o alfa da origem: `bg-primary/5` sai como
   * `rgb(from var(--marca-primary) r g b / 0.05)`. Ler só o token era julgar
   * pela cor opaca enquanto a tela pinta 5% dela sobre o que está atrás —
   * exatamente o mesmo erro do ajuste em OKLCH, com outra roupa.
   *
   * Medido: um selo com `bg-primary/5` sobre página escura recebeu de MIM a
   * tinta `--marca-primary-foreground` (#111110, escura), porque eu comparei
   * com o dourado opaco. Na tela, escuro sobre escuro: 1,00:1. A correção
   * piorava o que ia consertar.
   */
  alfaDoFundo: Map<string, number>;
} => {
  const tinta = new Map<string, string>();
  const fundo = new Map<string, string>();
  const tintaLiteral = new Map<string, string>();
  const fundoLiteral = new Map<string, string>();
  const ajusteDaTinta = new Map<string, AjusteDeCor>();
  const ajusteDoFundo = new Map<string, AjusteDeCor>();
  const alfaDoFundo = new Map<string, number>();

  for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const seletor = m[1] ?? '';
    const corpo = m[2] ?? '';

    const classes = classesDoSeletor(seletor);
    if (classes.length === 0) continue;

    const papelDe = (prop: RegExp): string | null => {
      const decl = new RegExp(`${prop.source}\\s*:([^;]*)`, 'i').exec(corpo);
      const v = decl?.[1] ?? '';
      return /var\(--marca-([a-z-]+)/i.exec(v)?.[1] ?? null;
    };

    /**
     * A tinta LITERAL, para o par meio recolorido.
     *
     * Metade das colisões medidas tinha esta forma: `.bg-[#0D0C22].text-white`.
     * O fundo virou papel da marca — e num tema claro `--marca-background` é
     * quase branco —, enquanto `text-white` continuou literal, porque branco
     * não pertence a papel nenhum. O par colapsou para 1,49:1 e a correção não
     * enxergava: ela só falava em papéis, e um dos lados não tinha papel.
     *
     * Guardar o hex literal é o que permite comparar os dois lados quando só um
     * deles foi recolorido.
     */
    const literalDe = (prop: RegExp): string | null => {
      const decl = new RegExp(`${prop.source}\\s*:([^;]*)`, 'i').exec(corpo);
      const v = (decl?.[1] ?? '').trim();
      if (v === '' || /var\(/i.test(v)) return null;
      const hex = /#([0-9a-f]{3,8})\b/i.exec(v);
      if (hex !== null) return `#${hex[1]}`;
      const nome = /^(white|black)\b/i.exec(v);
      if (nome !== null) return nome[1]?.toLowerCase() === 'white' ? '#ffffff' : '#000000';
      /**
       * Cor TRANSLÚCIDA não é superfície — e fingir que é escolheu tinta errada.
       *
       * `rgba(20,20,30,0.5)` entrava na tabela como fundo opaco escuro; na tela,
       * composta sobre a página creme, aquela superfície é quase-creme. O
       * corretor escolheu `primary-foreground` (branco) para o fundo da tabela
       * e o branco pousou no creme real: 1,10:1, medido. Alfa abaixo de 0,95
       * não vira literal — o fundo verdadeiro é o de trás, e a pilha o tem.
       */
      const rgb = /^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)(?:[\s,/]+([\d.]+))?/i.exec(v);
      if (rgb === null) return null;
      const alfaDaCor = rgb[4] === undefined ? 1 : Number.parseFloat(rgb[4]);
      if (Number.isFinite(alfaDaCor) && alfaDaCor < 0.95) return null;
      const n = (i: number): string =>
        Math.min(255, Number.parseInt(rgb[i] ?? '0', 10))
          .toString(16)
          .padStart(2, '0');
      return `#${n(1)}${n(2)}${n(3)}`;
    };

    const valorDe = (prop: RegExp): string =>
      new RegExp(`${prop.source}\\s*:([^;]*)`, 'i').exec(corpo)?.[1] ?? '';

    const pTinta = papelDe(/(?:^|[;\s])color/);
    const pFundo = papelDe(/background(?:-color)?/);
    const lTinta = pTinta === null ? literalDe(/(?:^|[;\s])color/) : null;
    const lFundo = pFundo === null ? literalDe(/background(?:-color)?/) : null;
    const aTinta = lerAjusteRelativo(valorDe(/(?:^|[;\s])color/));
    const aFundo = lerAjusteRelativo(valorDe(/background(?:-color)?/));
    const alfa = lerAlfa(valorDe(/background(?:-color)?/));
    for (const c of classes) {
      if (pTinta !== null && !tinta.has(c)) tinta.set(c, pTinta);
      if (pFundo !== null && !fundo.has(c)) fundo.set(c, pFundo);
      if (lTinta !== null && !tintaLiteral.has(c)) tintaLiteral.set(c, lTinta);
      if (lFundo !== null && !fundoLiteral.has(c)) fundoLiteral.set(c, lFundo);
      if (aTinta !== null && !ajusteDaTinta.has(c)) ajusteDaTinta.set(c, aTinta);
      if (aFundo !== null && !ajusteDoFundo.has(c)) ajusteDoFundo.set(c, aFundo);
      if (alfa !== null && !alfaDoFundo.has(c)) alfaDoFundo.set(c, alfa);
    }
  }
  return {
    tinta,
    fundo,
    tintaLiteral,
    fundoLiteral,
    ajusteDaTinta,
    ajusteDoFundo,
    alfaDoFundo,
  };
};

/**
 * A tinta que SE LÊ sobre aquele fundo.
 *
 * A ordem é a que um designer tentaria: primeiro a tinta de contraste do
 * próprio papel (`primary-foreground` para a primária), depois título, corpo,
 * o fundo da página e a superfície — as duas últimas cobrem o caso do fundo
 * claro, em que a tinta que se lê é escura.
 *
 * Se nenhuma alcançar — paleta impossível — devolve `null` e nada é trocado:
 * nenhuma escolha aqui pode piorar o que já estava ruim.
 */
export const tintaQueSeLeSobre = (
  papelDoFundo: string | null,
  tokens: TokensDaMarca,
  piso = PISO_DO_PAR,
  /**
   * O hex do fundo, quando ele NÃO tem papel.
   *
   * `bg-white/95` e `bg-slate-50` não pertencem a papel nenhum, e a recoloração
   * não os toca. Sem este caminho a escolha da tinta caía para o papel do
   * ancestral — quase sempre o fundo escuro da página — e a tinta clara ia
   * parar sobre a superfície branca. Medido: 14 elementos com o conserto
   * aplicado e ainda a 1,16:1.
   */
  hexDoFundo?: string,
): string | null => {
  /**
   * Quando o hex vem, é ELE que decide — mesmo havendo papel.
   *
   * O papel continua servindo para a PREFERÊNCIA (`${papel}-foreground` é o par
   * que a paleta pretende), mas a comparação tem de ser contra a cor pintada. A
   * primeira versão só olhava o hex quando não havia papel, e por isso uma
   * superfície `bg-primary/5` — 5% do dourado sobre uma página escura — era
   * julgada contra o dourado OPACO: a tinta escolhida se lia no dourado e
   * sumia na tela.
   */
  const fundo = hexDoFundo ?? (papelDoFundo === null ? undefined : tokens[papelDoFundo]);
  if (fundo === undefined) return null;
  /**
   * Papéis de TEXTO primeiro; `background` e `surface` só no fim.
   *
   * Sobre um fundo CLARO a tinta que se lê é escura, e num tema escuro a única
   * cor escura da paleta é a da página — então eles são candidatos legítimos, e
   * tirá-los deixaria sem conserto justamente o botão âmbar que abriu esta
   * frente (1,96:1).
   *
   * O perigo deles é real e foi medido: 52 elementos saíram pintados com
   * `--marca-background` sobre a própria página, 1,00:1. Mas a causa não era a
   * lista — era ler como superfície um `[data-ds-corpo]` que o compositor deixa
   * TRANSPARENTE de propósito. Consertado o proxy, o fundo claro que chega aqui
   * é fundo claro de verdade, e a tinta escura sobre ele é a escolha certa.
   *
   * A ordem importa: um papel de texto que sirva vence sempre um de superfície.
   */
  const candidatos = [
    ...(papelDoFundo === null ? [] : [`${papelDoFundo}-foreground`]),
    'primary-foreground',
    'heading',
    'body',
    'muted',
    'background',
    'surface',
  ];
  for (const papel of candidatos) {
    const hex = tokens[papel];
    if (hex === undefined) continue;
    const razao = contrasteEntre(hex, fundo);
    if (razao !== null && razao >= piso) return papel;
  }
  return null;
};

export type ParCorrigido = {
  /** As classes do elemento, para o aviso dizer QUEM foi corrigido. */
  classes: string;
  papelDoFundo: string;
  papelAntes: string;
  papelDepois: string;
  razaoAntes: number;
};

/**
 * Confere todo elemento que carrega fundo E tinta, e conserta o par que colapsa.
 *
 * Elemento que já traz `color` no `style` fica intocado: ali alguém — o criativo
 * ou outra passagem — já decidiu, e sobrepor decisão explícita é como duas
 * correções passam a brigar.
 */
/** Tags que não abrem escopo: não empilham e não têm filho. */
const SEM_FILHO = new Set([
  'area',
  'base',
  'br',
  'col',
  'embed',
  'hr',
  'img',
  'input',
  'link',
  'meta',
  'param',
  'source',
  'track',
  'wbr',
]);

export const corrigirParesDeCor = (
  html: string,
  css: string,
  tokens: TokensDaMarca,
  piso = PISO_DO_PAR,
): { html: string; corrigidos: ParCorrigido[] } => {
  const mapa = mapearClassesPorPapel(css);
  /**
   * O portão só fecha quando falta um LADO INTEIRO do par.
   *
   * A versão anterior exigia `mapa.fundo.size > 0`, isto é, ao menos uma
   * superfície com PAPEL — e barrava na porta justamente a página cuja
   * superfície é literal (`bg-white/95`, `bg-slate-50`), que é onde o defeito
   * mora. Cada lado do par pode chegar por papel ou por literal, e basta um de
   * cada.
   */
  const temFundo = mapa.fundo.size > 0 || mapa.fundoLiteral.size > 0;
  const temTinta = mapa.tinta.size > 0 || mapa.tintaLiteral.size > 0;
  if (!temFundo || !temTinta) return { html, corrigidos: [] };

  const corrigidos: ParCorrigido[] = [];

  /**
   * A pilha de ancestrais com fundo — e é ela que fez a regra funcionar.
   *
   * A primeira versão exigia fundo e tinta no MESMO elemento, e achou zero num
   * site que reprovava em S4. Os dois trechos que falhavam eram
   *
   *     h3 .text-3xl .font-newsreader .text-stone-900   1,96:1
   *     p  .text-stone-700 .text-lg .leading-relaxed    1,12:1
   *
   * e nenhum dos dois carrega classe de fundo: o fundo vinha do CARTÃO que os
   * envolve. É o caso NORMAL, não a exceção — quem escreve HTML põe a
   * superfície no contêiner e o texto dentro dele.
   *
   * Então o fundo do elemento é o do ancestral mais próximo que declara um, ele
   * mesmo incluído. Sem pilha, a regra só pegaria botão — que é justamente o
   * caso raro.
   */
  const pilha: {
    tag: string;
    fundo: string | null;
    /** O fundo LITERAL, quando a superfície não pertence a papel nenhum. */
    hex: string | null;
    ajuste: AjusteDeCor | undefined;
    /** O alfa da superfície, quando ela é translúcida (ver `alfaDoFundo`). */
    alfa: number | undefined;
    /**
     * A TINTA vigente, que desce por herança — e cuja falta era o maior buraco.
     *
     * `color` é herdada; `background` não. Um contêiner externo declara a tinta
     * clara, um contêiner INTERNO declara a superfície clara, e o texto lá no
     * fundo nasce claro sobre claro sem ter classe nenhuma.
     *
     * A conferência só olhava elemento COM classe de tinta, e o elemento que
     * colapsa não tem classe nenhuma. Medido no banco de prova: **52
     * ocorrências** de `rgb(250,250,249)` sobre `rgb(250,250,250)` — 1,00:1,
     * sem uma classe no atributo. Era o maior aglomerado de S4 que restava.
     */
    tintaPapel: string | null;
    tintaHex: string | null;
    /**
     * O AJUSTE da tinta viaja com ela — e esquecê-lo foi a terceira aparição
     * do mesmo erro.
     *
     * Quando a tinta é herdada, quem a declarou pode tê-la escrito como cor
     * DERIVADA (`oklch(from var(--marca-x) calc(l - 0.62) …)`). Sem carregar o
     * ajuste, a comparação volta a ser contra o token cru — exatamente o que já
     * fazia o par passar aqui e a pessoa ver 1,49:1 na tela.
     */
    tintaAjuste: AjusteDeCor | undefined;
  }[] = [];
  /** O ajuste e o hex do fundo VIGENTE, para pintar a mesma cor que a tela pinta. */
  let ajusteVigente: AjusteDeCor | undefined;
  /** A tinta que `conferir` acabou de aplicar — o walker a empurra p/ pilha. */
  let tintaCorrigidaAgora: string | null = null;
  let hexVigente: string | null = null;
  let alfaVigente: number | undefined;
  const fundoVigente = (): string | null => {
    for (let i = pilha.length - 1; i >= 0; i--) {
      const n = pilha[i];
      if (n === undefined) continue;
      if (n.fundo == null && n.hex == null) continue;
      ajusteVigente = n.ajuste;
      hexVigente = n.hex;
      alfaVigente = n.alfa;
      return n.fundo;
    }
    return null;
  };
  /** A tinta que o elemento HERDA, quando ele não declara nenhuma. */
  const tintaVigente = (): {
    papel: string | null;
    hex: string | null;
    ajuste: AjusteDeCor | undefined;
  } => {
    for (let i = pilha.length - 1; i >= 0; i--) {
      const n = pilha[i];
      if (n === undefined) continue;
      if (n.tintaPapel == null && n.tintaHex == null) continue;
      return { papel: n.tintaPapel, hex: n.tintaHex, ajuste: n.tintaAjuste };
    }
    return { papel: null, hex: null, ajuste: undefined };
  };

  const saida = html.replace(
    /<\/([a-z][\w-]*)\s*>|<([a-z][\w-]*)\b([^>]*)>/gi,
    (tudo, fechando: string | undefined, tag: string | undefined, attrs: string | undefined) => {
      if (fechando !== undefined) {
        const alvo = fechando.toLowerCase();
        for (let i = pilha.length - 1; i >= 0; i--) {
          if (pilha[i]?.tag === alvo) {
            pilha.length = i;
            break;
          }
        }
        return tudo;
      }
      return abrir(tudo, tag ?? '', attrs ?? '');
    },
  );

  function abrir(tudo: string, tag: string, attrs: string): string {
    const nome = tag.toLowerCase();
    const autoFechada = /\/\s*$/.test(attrs) || SEM_FILHO.has(nome);
    const classesDoEl = /\bclass="([^"]*)"/i.exec(attrs)?.[1] ?? '';
    const listaDoEl = classesDoEl.split(/\s+/).filter(Boolean);

    /**
     * O proxy da origem NÃO pinta, mesmo carregando classe de fundo.
     *
     * `REGRA_QUE_ABRE_PASSAGEM` deixa `[data-ds-raiz]`, `[data-ds-corpo]` e
     * `[data-ds-criado]` transparentes de propósito, para a página ser UMA
     * superfície contínua. A classe da origem (`bg-teal-700`) continua no
     * atributo e não desenha nada.
     *
     * Ler aquilo como superfície real foi o que produziu a pior regressão desta
     * frente: eu via um fundo CLARO que não existia, escolhia tinta escura para
     * ele, e a tinta caía sobre o fundo ESCURO da página. Medido nos 20 sites
     * de prova: 52 elementos pintados com `--marca-background` sobre a própria
     * página — texto exatamente da cor do fundo, 1,00:1.
     *
     * Dentro de um proxy, o fundo é o da PÁGINA.
     */
    const ehProxy = /\bdata-ds-(?:raiz|corpo|criado)\b/i.test(attrs);
    let fundoProprio: string | null = ehProxy ? 'background' : null;
    let hexDoFundoProprio: string | null = null;
    let ajusteDoFundoProprio: AjusteDeCor | undefined;
    let alfaDoFundoProprio: number | undefined;
    if (!ehProxy) {
      for (const c of listaDoEl) {
        const f = mapa.fundo.get(c);
        if (f !== undefined) {
          fundoProprio = f;
          ajusteDoFundoProprio = mapa.ajusteDoFundo.get(c);
          alfaDoFundoProprio = mapa.alfaDoFundo.get(c);
          break;
        }
        const h = mapa.fundoLiteral.get(c);
        if (h !== undefined) {
          hexDoFundoProprio = h;
          break;
        }
      }
    }
    // A tinta que ESTE elemento declara — vira a vigente para os filhos.
    let tintaPropriaPapel: string | null = null;
    let tintaPropriaHex: string | null = null;
    let tintaPropriaAjuste: AjusteDeCor | undefined;
    for (const c of listaDoEl) {
      const t = mapa.tinta.get(c);
      if (t !== undefined) {
        tintaPropriaPapel = t;
        tintaPropriaAjuste = mapa.ajusteDaTinta.get(c);
        break;
      }
      const h = mapa.tintaLiteral.get(c);
      if (h !== undefined) {
        tintaPropriaHex = h;
        break;
      }
    }
    tintaCorrigidaAgora = null;
    const resultado = conferir(
      tudo,
      attrs,
      classesDoEl,
      listaDoEl,
      fundoProprio,
      hexDoFundoProprio,
      ajusteDoFundoProprio,
      alfaDoFundoProprio,
    );
    /**
     * O elemento corrigido AVISA os descendentes: a tinta que desce e a nova.
     *
     * Sem isto, o conteiner ganhava o style e a folha sem classe, herdando a
     * tinta VELHA pela pilha, ganhava um segundo style redundante — o mesmo
     * conserto escrito duas vezes, e corrigidos contando dobrado.
     */
    if (tintaCorrigidaAgora !== null) {
      tintaPropriaPapel = tintaCorrigidaAgora;
      tintaPropriaAjuste = undefined;
      tintaPropriaHex = null;
    }
    if (!autoFechada) {
      pilha.push({
        tag: nome,
        fundo: fundoProprio,
        hex: hexDoFundoProprio,
        ajuste: ajusteDoFundoProprio,
        alfa: alfaDoFundoProprio,
        tintaPapel: tintaPropriaPapel,
        tintaHex: tintaPropriaHex,
        tintaAjuste: tintaPropriaAjuste,
      });
    }
    return resultado;
  }

  function conferir(
    tudo: string,
    attrs: string,
    classes: string,
    lista: readonly string[],
    fundoProprio: string | null,
    hexDoFundoProprio: string | null,
    ajusteDoFundoProprio: AjusteDeCor | undefined,
    alfaDoFundoProprio: number | undefined,
  ): string {
    /**
     * Elemento SEM classe também é conferido — era o maior buraco que restava.
     *
     * A guarda antiga desistia em `classes === ''`, e os 63 achados que
     * sobraram no banco eram exatamente isso: folhas sem classe nenhuma,
     * herdando a tinta de um ancestral e sentando num fundo que a pilha
     * conhece. O texto não precisa de classe para ser ilegível; a correção
     * pousa como `style` no próprio elemento, com ou sem classe.
     */
    /**
     * O `style` é extraído ANTES de procurar `color` dentro dele.
     *
     * Numa regex só, o `^` da alternância se referia ao início do atributo
     * inteiro e não ao do valor, então `style="color:…"` — com `color` logo na
     * primeira declaração, que é o caso comum — escapava do guarda.
     */
    const styleAtual = /\bstyle="([^"]*)"/i.exec(attrs)?.[1] ?? '';
    if (styleAtual.split(';').some((d) => /^\s*color\s*:/i.test(d))) return tudo;

    let papelDaTinta: string | null = null;
    let classeDaTinta: string | null = null;
    for (const c of lista) {
      const t = mapa.tinta.get(c);
      if (t !== undefined) {
        papelDaTinta = t;
        classeDaTinta = c;
        break;
      }
    }
    /**
     * A tinta LITERAL entra quando ela não virou papel — o par MEIO recolorido.
     *
     * `.bg-[#0D0C22].text-white`: o fundo virou papel da marca, o branco
     * continuou branco (não pertence a papel nenhum), e num tema claro o par
     * colapsou para 1,49:1. Sem este ramo a correção via um lado só e desistia.
     */
    let hexDaTintaLiteral: string | null = null;
    if (papelDaTinta === null) {
      for (const c of lista) {
        const t = mapa.tintaLiteral.get(c);
        if (t !== undefined) {
          hexDaTintaLiteral = t;
          break;
        }
      }
    }
    /**
     * A tinta HERDADA, quando este elemento não declara nenhuma.
     *
     * `color` desce por herança; `background` não. Um contêiner externo declara
     * a tinta clara, um contêiner INTERNO declara a superfície clara, e o texto
     * lá no fundo nasce claro sobre claro — sem classe nenhuma no atributo.
     *
     * Conferir só quem tem classe de TINTA deixava esse caso passar inteiro:
     * medido no banco de prova, **52 ocorrências** de `rgb(250,250,249)` sobre
     * `rgb(250,250,250)`, 1,00:1, e era o maior aglomerado de S4 que restava.
     *
     * Quem recebe o conserto é ESTE elemento — o que traz a superfície nova —,
     * e tudo o que estiver dentro dele herda a tinta corrigida.
     */
    let ajusteDaTintaUsado =
      classeDaTinta === null ? undefined : mapa.ajusteDaTinta.get(classeDaTinta);
    if (papelDaTinta === null && hexDaTintaLiteral === null) {
      const herdada = tintaVigente();
      papelDaTinta = herdada.papel;
      hexDaTintaLiteral = herdada.hex;
      ajusteDaTintaUsado = herdada.ajuste;
    }
    // O fundo é o próprio, quando ele declara um; senão, o do ancestral mais
    // próximo que declara. É onde o texto realmente senta.
    ajusteVigente = undefined;
    hexVigente = null;
    alfaVigente = undefined;
    const proprio = fundoProprio !== null || hexDoFundoProprio !== null;
    const papelDoFundo = proprio ? fundoProprio : fundoVigente();
    const ajusteDoFundoUsado = proprio ? ajusteDoFundoProprio : ajusteVigente;
    const hexDoFundoUsado = proprio ? hexDoFundoProprio : hexVigente;
    const alfaDoFundoUsado = proprio ? alfaDoFundoProprio : alfaVigente;
    if (
      (papelDoFundo === null && hexDoFundoUsado === null) ||
      (papelDaTinta === null && hexDaTintaLiteral === null)
    ) {
      return tudo;
    }

    /**
     * A cor a comparar é a que a tela PINTA, não o token cru.
     *
     * Quando a recoloração emitiu cor derivada — `oklch(from var(--marca-X)
     * calc(l - 0.457) …)` —, ler o token era comparar uma cor que não está na
     * tela. Foi assim que o par passava aqui e a pessoa via 1,49:1.
     */
    const pintado = (papel: string, ajuste: AjusteDeCor | undefined): string | undefined => {
      const base = tokens[papel];
      if (base === undefined || ajuste === undefined) return base;
      return aplicarAjuste(base, ajuste) ?? base;
    };
    /**
     * A superfície TRANSLÚCIDA é composta sobre o que está atrás dela.
     *
     * `bg-primary/5` não é a primária: é 5% dela sobre a página. Julgar pela cor
     * opaca me fez pintar um selo com `--marca-primary-foreground` (escura)
     * sobre uma superfície que, na tela, é quase preta — 1,00:1. A correção
     * piorava o que ia consertar, e o erro é o mesmo de ler o token cru em vez
     * da cor derivada: julgar pela cor que não está na tela.
     *
     * O que está atrás é a superfície do ANCESTRAL mais próximo; na falta de
     * um, a página. A composição para no primeiro fundo opaco, que é o que o
     * navegador também faz.
     */
    const opaco =
      papelDoFundo === null
        ? (hexDoFundoUsado ?? undefined)
        : pintado(papelDoFundo, ajusteDoFundoUsado);
    const atrasDele = (() => {
      if (alfaDoFundoUsado === undefined || opaco === undefined) return undefined;
      for (let i = pilha.length - 1; i >= 0; i--) {
        const n = pilha[i];
        if (n === undefined || n.alfa !== undefined) continue;
        if (n.fundo != null) return pintado(n.fundo, n.ajuste);
        if (n.hex != null) return n.hex;
      }
      return tokens.background;
    })();
    const hexFundo =
      alfaDoFundoUsado !== undefined && opaco !== undefined && atrasDele !== undefined
        ? (comporSobre(opaco, atrasDele, alfaDoFundoUsado) ?? opaco)
        : opaco;
    const hexTinta =
      papelDaTinta === null ? hexDaTintaLiteral : pintado(papelDaTinta, ajusteDaTintaUsado);
    if (hexFundo === undefined || hexTinta === undefined || hexTinta === null) return tudo;
    const razao = contrasteEntre(hexTinta, hexFundo);
    if (razao === null || razao >= piso) return tudo;

    const nova = tintaQueSeLeSobre(papelDoFundo, tokens, piso, hexFundo);
    if (nova === null || nova === papelDaTinta) return tudo;

    tintaCorrigidaAgora = nova;
    corrigidos.push({
      classes,
      papelDoFundo: papelDoFundo ?? `literal ${hexFundo}`,
      papelAntes: papelDaTinta ?? `literal ${hexDaTintaLiteral ?? ''}`,
      papelDepois: nova,
      razaoAntes: razao,
    });

    const estilo = `color:var(--marca-${nova})`;
    const jaTemStyle = /\bstyle="([^"]*)"/i.exec(attrs);
    // A barra da tag auto-fechada fica no FIM, depois do style novo: colar o
    // atributo depois dela produziria `<img/ style=…>`, que o navegador lê como
    // um atributo chamado "/".
    const semBarra = attrs.replace(/\/\s*$/, '');
    const barra = attrs === semBarra ? '' : ' /';
    const novosAttrs =
      jaTemStyle === null
        ? `${semBarra} style="${estilo}"${barra}`
        : semBarra.replace(
            /\bstyle="([^"]*)"/i,
            (_t, v: string) => `style="${v.trim().replace(/;$/, '')};${estilo}"`,
          ) + barra;
    return `<${tudo.slice(1).match(/^[a-z][\w-]*/i)?.[0] ?? ''}${novosAttrs}>`;
  }

  return { html: saida, corrigidos };
};
