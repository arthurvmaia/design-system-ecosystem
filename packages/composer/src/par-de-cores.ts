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
} => {
  const tinta = new Map<string, string>();
  const fundo = new Map<string, string>();
  const tintaLiteral = new Map<string, string>();

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
      const rgb = /^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)/i.exec(v);
      if (rgb === null) return null;
      const n = (i: number): string =>
        Math.min(255, Number.parseInt(rgb[i] ?? '0', 10))
          .toString(16)
          .padStart(2, '0');
      return `#${n(1)}${n(2)}${n(3)}`;
    };

    const pTinta = papelDe(/(?:^|[;\s])color/);
    const pFundo = papelDe(/background(?:-color)?/);
    const lTinta = pTinta === null ? literalDe(/(?:^|[;\s])color/) : null;
    for (const c of classes) {
      if (pTinta !== null && !tinta.has(c)) tinta.set(c, pTinta);
      if (pFundo !== null && !fundo.has(c)) fundo.set(c, pFundo);
      if (lTinta !== null && !tintaLiteral.has(c)) tintaLiteral.set(c, lTinta);
    }
  }
  return { tinta, fundo, tintaLiteral };
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
  papelDoFundo: string,
  tokens: TokensDaMarca,
  piso = PISO_DO_PAR,
): string | null => {
  const fundo = tokens[papelDoFundo];
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
    `${papelDoFundo}-foreground`,
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
  // Fundo sem papel nenhum quer dizer que a recoloração não tocou nesta página.
  // A tinta pode vir de qualquer um dos dois mapas (ver `tintaLiteral`).
  if ((mapa.tinta.size === 0 && mapa.tintaLiteral.size === 0) || mapa.fundo.size === 0) {
    return { html, corrigidos: [] };
  }

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
  const pilha: { tag: string; fundo: string | null }[] = [];
  const fundoVigente = (): string | null => {
    for (let i = pilha.length - 1; i >= 0; i--) {
      const f = pilha[i]?.fundo;
      if (f != null) return f;
    }
    return null;
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
    if (!ehProxy) {
      for (const c of listaDoEl) {
        const f = mapa.fundo.get(c);
        if (f !== undefined) {
          fundoProprio = f;
          break;
        }
      }
    }
    const resultado = conferir(tudo, attrs, classesDoEl, listaDoEl, fundoProprio);
    if (!autoFechada) pilha.push({ tag: nome, fundo: fundoProprio });
    return resultado;
  }

  function conferir(
    tudo: string,
    attrs: string,
    classes: string,
    lista: readonly string[],
    fundoProprio: string | null,
  ): string {
    if (classes === '') return tudo;
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
    for (const c of lista) {
      const t = mapa.tinta.get(c);
      if (t !== undefined) {
        papelDaTinta = t;
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
    // O fundo é o próprio, quando ele declara um; senão, o do ancestral mais
    // próximo que declara. É onde o texto realmente senta.
    const papelDoFundo = fundoProprio ?? fundoVigente();
    if (papelDoFundo === null || (papelDaTinta === null && hexDaTintaLiteral === null)) {
      return tudo;
    }

    const hexFundo = tokens[papelDoFundo];
    const hexTinta = papelDaTinta === null ? hexDaTintaLiteral : tokens[papelDaTinta];
    if (hexFundo === undefined || hexTinta === undefined || hexTinta === null) return tudo;
    const razao = contrasteEntre(hexTinta, hexFundo);
    if (razao === null || razao >= piso) return tudo;

    const nova = tintaQueSeLeSobre(papelDoFundo, tokens, piso);
    if (nova === null || nova === papelDaTinta) return tudo;

    corrigidos.push({
      classes,
      papelDoFundo,
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
