import type { AjusteDeCor, ClusterDeCor, PapelDeCor } from '@ds/shared';
import { CONFIANCA_MINIMA_PARA_RECOLORIR } from '@ds/shared';
import { analisarCss, avisoDeReparo } from './analisar-css.js';
import { coresDoValor } from './inventario.js';

/**
 * Recoloração: troca literais de cor por nomes que a marca controla.
 *
 * O defeito que isto conserta foi medido no primeiro site gerado de verdade:
 * o `marca.css` declarava 17 tokens (`--marca-*`) e as peças usavam ZERO — o
 * CSS de origem é utilitária Tailwind com a cor LITERAL dentro da regra
 * (`.bg-\[\#0D3C1F\]{background-color:rgb(13 60 31/var(--tw-bg-opacity,1))}`).
 * Vencer a cascata não adianta quando não existe variável para redefinir. A
 * saída é criar a variável NO PONTO DE USO:
 *
 *   `#0d3c1f`                     → `var(--marca-primary, #0d3c1f)`
 *   `rgb(13 60 31 / var(--x,1))`  → `rgb(from var(--marca-primary, #0d3c1f) r g b / var(--x,1))`
 *
 * Duas propriedades desse desenho carregam o contrato inteiro:
 *
 * - **O fallback é SEMPRE o literal original.** Marca ausente, token não
 *   atribuído, kit antigo: a peça degrada para a aparência de origem, nunca
 *   para quebrado.
 * - **Esta função NUNCA declara `--marca-*`, só consome.** É o que garante que
 *   o `:root` do `marca.css` alcança as peças por herança limpa: a origem não
 *   declara nada nesse namespace, então não há proxy no caminho para
 *   interceptar (o defeito de herança que o escopo tem com `--primary` não
 *   existe aqui POR CONSTRUÇÃO). Há teste para o invariante.
 *
 * E uma restrição herdada do inventário: a substituição anda pelos valores das
 * declarações com o MESMO tokenizador que os inventariou (`coresDoValor`), que
 * pula `url(...)` inteiro — um `#0d3c1f` dentro de um SVG em data-uri não é
 * cor da página e não pode ser tocado.
 */

/**
 * O destino de uma cor: o papel que ela assume e, quando o papel foi HERDADO
 * de um vizinho de matiz, a relação a preservar (ver `AjusteDeCor`).
 */
export type DestinoDaCor = { papel: PapelDeCor; ajuste: AjusteDeCor | null };

export type MapaDeRecoloracao = ReadonlyMap<string /* hexOpaco */, DestinoDaCor>;

export type ResultadoRecoloracao = {
  css: string;
  /** Quantas ocorrências viraram var(). */
  reescritas: number;
  /** Quantas ficaram como estavam (sem papel, sem confiança, ou já var()). */
  mantidas: number;
  avisos: string[];
};

/**
 * RETEMA: a origem de tema invertido inteira migra para a paleta da marca.
 *
 * O caso medido, duas vezes, no mesmo site: peça de um site preto (`#03020A`)
 * composta numa página de cafeteria clara. A recoloração por cluster veste o
 * que TEM papel, e o resto sobrevive com a cor de origem — o texto branco fica
 * invisível sobre o bege, os cartões continuam pretos no meio da página clara e
 * o verde-esmeralda de um site de segurança aparece numa marca de café. O dono
 * foi direto: "os componentes têm que vir na paleta de cores da marca", para
 * QUALQUER site.
 *
 * A régua não pode ser uma tabela de cores — cada origem tem as suas. Ela é
 * derivada da própria cor, e é por isso que serve a qualquer par origem/marca:
 *
 * - **cor saturada** (acento da origem: esmeralda, fúcsia, índigo) → os acentos
 *   da marca, alternando por MATIZ na ordem em que aparecem, para dois acentos
 *   distintos na origem continuarem distintos aqui;
 * - **neutra em contexto de FUNDO/borda** → a superfície da marca: o cartão
 *   preto do tema escuro vira o cartão claro do tema claro;
 * - **neutra extrema em contexto de TEXTO** → a tinta da marca, que é o que
 *   devolve a legibilidade;
 * - **neutra intermediária em texto** → o corpo de texto da marca.
 *
 * O que ela NÃO faz: nada quando os temas combinam. Origem escura vestindo
 * marca escura mantém tudo — ali a cor de origem é acerto, não defeito.
 */
export type Retema = {
  /** O tema da MARCA: para onde as cores da origem migram. */
  alvo: 'claro' | 'escuro';
  /**
   * A cor de PÁGINA da origem (o `<body>` dela), quando conhecida.
   *
   * Sem isto, todo neutro escuro vira superfície — e o bloco que na origem era
   * a página inteira vira uma faixa branca chapada no meio de uma página bege.
   * Com isto, o que era página lá continua sendo página aqui.
   */
  corDePagina?: string;
  /**
   * Matizes já vistas, na ordem. Compartilhar este array entre a folha e o HTML
   * inline mantém o mesmo acento da origem no mesmo acento da marca nos dois
   * lados — senão o ícone do cartão sai numa cor e a borda dele em outra.
   */
  matizes?: number[];
  /**
   * Só os ACENTOS migram; superfície e texto ficam como na origem.
   *
   * É o regime de quando os temas COMBINAM (site escuro vestindo marca escura).
   * Ali a superfície da origem é acerto — mas o acento não: um ícone
   * verde-esmeralda continua verde-esmeralda num streetwear vermelho, e o dono
   * pediu componente na paleta da marca em QUALQUER site. Trocar só a cor com
   * croma resolve isso sem achatar um tema que já estava certo.
   */
  apenasAcentos?: boolean;
  /**
   * Os hexes dos tokens da marca e o fundo da página, para o PISO DE CONTRASTE.
   *
   * Sem isto, a migração acerta o papel e erra a leitura: um título que na
   * origem era um tom quente vira a primária da marca e, se a primária for
   * escura como o fundo, o texto some — foi o "Nascido do sussurro ancestral"
   * marrom sobre preto. Com os hexes em mãos, o papel escolhido é CONFERIDO
   * contra o fundo e, quando não alcança o mínimo legível, cede para o token
   * que alcança. A régua é a da WCAG (razão de contraste), não o olho.
   */
  tokens?: Readonly<Partial<Record<PapelDeCor, string>>>;
  fundoDaPagina?: string;
};

const PROPS_DE_TEXTO = new Set([
  'color',
  'caret-color',
  'accent-color',
  '-webkit-text-fill-color',
  'text-decoration-color',
  'fill',
  'stroke',
]);

const PROPS_DE_FUNDO = new Set([
  'background',
  'background-color',
  'background-image',
  'border-color',
  'border',
  'border-top-color',
  'border-right-color',
  'border-bottom-color',
  'border-left-color',
  'outline-color',
  'box-shadow',
]);

/**
 * Luminância SIMPLES, sem decodificar a gama do sRGB.
 *
 * Ela mede "quão claro isto parece" e serve ao CLASSIFICADOR: é por ela que um
 * hex vira superfície, tinta ou acento, e os limiares dessa classificação foram
 * calibrados com esta escala. Trocá-la mudaria em silêncio o papel de cores que
 * hoje são atribuídas certo — por isso ela FICA.
 *
 * Para contraste ela não serve, e o motivo está em `luminanciaWcag`.
 */
const luminanciaDoHex = (hexOpaco: string): number | null => {
  const m = /^#([0-9a-f]{6})$/i.exec(hexOpaco);
  if (m === null || m[1] === undefined) return null;
  const canal = (i: number): number => Number.parseInt(m[1]?.slice(i, i + 2) ?? '00', 16) / 255;
  return 0.2126 * canal(0) + 0.7152 * canal(2) + 0.0722 * canal(4);
};

/**
 * Luminância da WCAG, com a decodificação de gama do sRGB.
 *
 * É a única que serve para CONTRASTE, e a falta dela era um defeito medido: sem
 * a gama, o motor **superestimava o contraste em +0,91 de média** nos 425
 * trechos que a regra S4 reprovou nos 20 sites de prova, chegando a +3,43. Ele
 * dava sinal verde e não recolorimava textos que o navegador reprova.
 *
 * Caso concreto: texto `#475569` sobre página `#0b0b0d`. O navegador lê 2,60:1;
 * sem a gama o motor lia 4,03:1, concluía que passava e deixava como estava.
 *
 * Separada da de cima de propósito, e não trocada no lugar dela: a outra
 * alimenta o CLASSIFICADOR de papel, cujos limiares foram calibrados na escala
 * simples. Trocar as duas de uma vez mudaria a atribuição de papel de cores que
 * hoje estão certas — um conserto de contraste não pode ter esse efeito
 * colateral.
 */
const luminanciaWcag = (hexOpaco: string): number | null => {
  const m = /^#([0-9a-f]{6})$/i.exec(hexOpaco);
  if (m === null || m[1] === undefined) return null;
  const canal = (i: number): number => {
    const s = Number.parseInt(m[1]?.slice(i, i + 2) ?? '00', 16) / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * canal(0) + 0.7152 * canal(2) + 0.0722 * canal(4);
};

/**
 * Croma ABSOLUTO (max − min dos canais) e matiz de um hexOpaco.
 *
 * Absoluto, e não saturação relativa (`d/max`), porque `#0A0A1A` — o quase
 * preto de um dos temas escuros — tem saturação relativa de 0,6 e croma de
 * 0,06: pela saturação ele passaria por "cor de acento" e viraria a primária da
 * marca, quando o que ele é de fato é superfície. O croma absoluto separa
 * "colorido" de "quase neutro" do jeito que o olho separa.
 */
const croma = (hexOpaco: string): { croma: number; matiz: number } | null => {
  const m = /^#([0-9a-f]{6})$/i.exec(hexOpaco);
  if (m === null || m[1] === undefined) return null;
  const [r, g, b] = [0, 2, 4].map(
    (i) => Number.parseInt(m[1]?.slice(i, i + 2) ?? '00', 16) / 255,
  ) as [number, number, number];
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  if (d === 0) return { croma: 0, matiz: 0 };
  const bruto = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return { croma: d, matiz: (bruto * 60 + 360) % 360 };
};

/** Matizes já vistas, para acento distinto na origem continuar distinto aqui. */
const ACENTOS: PapelDeCor[] = ['primary', 'accent'];

/**
 * Os papéis que são TINTA: cor para escrever, não para pintar superfície.
 *
 * Serve à guarda espelho da que protege o texto. O papel de um cluster diz o
 * que a cor É na paleta da ORIGEM, não o que ela FAZ nesta declaração — e num
 * site de tema claro a cor mais escura da paleta é a tinta de título. Quando
 * essa mesma cor aparece pintando um CARTÃO (`bg-stone-900`, o plano em
 * destaque), herdar o papel de tinta pinta o cartão com a cor da LETRA.
 *
 * Medido no site do clube: o cartão escuro da origem saiu BRANCO
 * (`--marca-heading`) e o texto branco por cima dele ficou em 1,0:1 — a mesma
 * cor, exatamente. Do outro lado, o `bg-white` vizinho tinha virado marinho.
 * Os dois cartões trocaram de lado.
 */
const PAPEIS_DE_TINTA: ReadonlySet<PapelDeCor> = new Set<PapelDeCor>([
  'heading',
  'body',
  'muted',
  'primary-foreground',
]);

/** Distância euclidiana simples entre dois hexOpacos, em 0–1. */
const distancia = (a: string, b: string): number | null => {
  const ler = (h: string): [number, number, number] | null => {
    const m = /^#([0-9a-f]{6})$/i.exec(h.trim());
    if (m === null || m[1] === undefined) return null;
    return [0, 2, 4].map((i) => Number.parseInt(m[1]?.slice(i, i + 2) ?? '00', 16) / 255) as [
      number,
      number,
      number,
    ];
  };
  const x = ler(a);
  const y = ler(b);
  if (x === null || y === null) return null;
  return Math.sqrt((x[0] - y[0]) ** 2 + (x[1] - y[1]) ** 2 + (x[2] - y[2]) ** 2) / Math.sqrt(3);
};

/** Razão de contraste da WCAG entre dois hexOpacos (1 = igual, 21 = máximo). */
const contraste = (a: string, b: string): number | null => {
  const la = luminanciaWcag(a);
  const lb = luminanciaWcag(b);
  if (la === null || lb === null) return null;
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
};

/**
 * O piso de contraste: 3:1, o mínimo da WCAG para texto grande.
 *
 * Não uso 4.5:1 (texto pequeno) porque isto se aplica a TODO texto migrado,
 * incluindo rótulo decorativo em caixa alta, e exigir 4.5 achataria a paleta
 * inteira para uma cor só. 3:1 é o que separa "tem destaque" de "sumiu".
 */
const PISO_DE_CONTRASTE = 3;

/**
 * O papel de texto que REALMENTE se lê sobre o fundo da página.
 *
 * Tenta o preferido; se ele não alcança o piso, percorre os candidatos na
 * ordem em que um designer os tentaria (tinta de título, corpo, acento,
 * primária) e fica com o primeiro que alcança. Se nenhum alcançar — marca com
 * paleta impossível — devolve o preferido: o site fica como estava, e nenhuma
 * escolha aqui piora o que já era ruim.
 */
const textoQueSeLe = (preferido: PapelDeCor, retema: Retema): PapelDeCor => {
  const fundo = retema.fundoDaPagina;
  const tokens = retema.tokens;
  if (fundo === undefined || tokens === undefined) return preferido;
  const hexPreferido = tokens[preferido];
  const doPreferido = hexPreferido === undefined ? null : contraste(hexPreferido, fundo);
  if (doPreferido !== null && doPreferido >= PISO_DE_CONTRASTE) return preferido;
  for (const candidato of ['heading', 'body', 'accent', 'primary'] as const) {
    const hex = tokens[candidato];
    if (hex === undefined) continue;
    const razao = contraste(hex, fundo);
    if (razao !== null && razao >= PISO_DE_CONTRASTE) return candidato;
  }
  return preferido;
};

const papelDoRetema = (
  hexOpaco: string,
  propriedade: string,
  retema: Retema,
): PapelDeCor | null => {
  const c = croma(hexOpaco);
  const lum = luminanciaDoHex(hexOpaco);
  if (c === null || lum === null) return null;

  // Colorida: é acento da origem, vira acento da marca. A ordem de chegada das
  // MATIZES decide qual — determinístico e estável entre execuções.
  if (c.croma >= 0.15) {
    const vistas = retema.matizes ?? [];
    let indice = vistas.findIndex((m) => Math.abs(m - c.matiz) < 30);
    if (indice < 0) {
      vistas.push(c.matiz);
      indice = vistas.length - 1;
    }
    const acento = ACENTOS[indice % ACENTOS.length] ?? 'primary';
    // Acento em TEXTO passa pelo piso: cor de marca que não se lê sobre o
    // fundo da página vira título ilegível, não vira identidade.
    return PROPS_DE_TEXTO.has(propriedade) ? textoQueSeLe(acento, retema) : acento;
  }

  /**
   * Temas que combinam: superfície e tinta da origem estão certas — MENOS
   * quando o texto deixa de se ler.
   *
   * O compositor torna cada seção transparente para a página ser uma
   * superfície só. Isso tem um efeito colateral: o texto que na origem sentava
   * num bloco CLARO passa a sentar no fundo da página. Foi assim que um título
   * `#2c1810` foi parar sobre `#14110e` — razão de contraste 1,2:1, ou seja,
   * invisível. Não é a marca que está errada nem a origem: é a composição que
   * mudou o chão embaixo do texto, então é ela que devolve a legibilidade.
   */
  if (retema.apenasAcentos === true) {
    if (!PROPS_DE_TEXTO.has(propriedade)) return null;
    const fundo = retema.fundoDaPagina;
    if (fundo === undefined) return null;
    const razao = contraste(hexOpaco, fundo);
    if (razao === null || razao >= PISO_DE_CONTRASTE) return null;
    return textoQueSeLe(lum >= 0.5 ? 'heading' : 'body', retema);
  }

  if (PROPS_DE_FUNDO.has(propriedade)) {
    // O que era a PÁGINA na origem continua sendo página aqui. Sem esta
    // distinção, o bloco de fundo do site inteiro virava uma faixa branca
    // chapada no meio de uma página bege — o oposto de "uma página só".
    const daPagina = retema.corDePagina;
    if (daPagina !== undefined) {
      const d = distancia(hexOpaco, daPagina);
      if (d !== null && d <= 0.06) return 'background';
    }
    // Neutra em fundo/borda: é superfície, e superfície acompanha o tema.
    return 'surface';
  }

  // Neutra em texto: extremo vira tinta de título, meio-termo vira corpo —
  // sempre conferido contra o fundo da página.
  if (PROPS_DE_TEXTO.has(propriedade)) {
    return textoQueSeLe(lum >= 0.75 || lum <= 0.25 ? 'heading' : 'body', retema);
  }

  return null;
};

/**
 * O retema do HTML: `style=""` e atributos de pintura do SVG.
 *
 * A folha de estilo não é o único lugar onde a origem guarda cor. O ícone do
 * bundle chega com `style=";color:rgb(16, 185, 129)"` e com `fill`/`stroke` no
 * próprio SVG, e o cartão em destaque com um gradiente inline — nada disso
 * passa pelo `recolorirCss`, que lê arquivo `.css`. Sem esta segunda passagem,
 * o site da cafeteria fica com cadeado esmeralda e um cartão preto no meio de
 * três brancos: foi exatamente o que sobrou na primeira tentativa.
 */
export const retemarHtmlInline = (
  html: string,
  entrada: Retema,
): { html: string; trocas: number } => {
  // A memória das matizes precisa sobreviver às chamadas: sem o array, cada
  // cor abriria uma lista nova e TODO acento viraria a primária.
  const retema: Retema = { ...entrada, matizes: entrada.matizes ?? [] };
  let trocas = 0;

  const trocarValor = (valor: string, propriedade: string): string => {
    let saida = valor;
    for (const cor of coresDoValor(valor)) {
      const papel = papelDoRetema(cor.hexOpaco, propriedade, retema);
      if (papel === null) continue;
      const nova = reescrever(cor.hexOpaco, cor.alfa, { papel, ajuste: null });
      const idx = saida.indexOf(cor.literal);
      if (idx < 0) continue;
      saida = saida.slice(0, idx) + nova + saida.slice(idx + cor.literal.length);
      trocas += 1;
    }
    return saida;
  };

  // 1. Atributos style="...": declaração a declaração, para o papel sair do
  //    contexto certo (um `color` não pode ser tratado como fundo).
  let saida = html.replace(/\bstyle="([^"]*)"/gi, (tudo, estilo: string) => {
    if (estilo.includes('--marca-') || !/#|rgba?\(|hsla?\(/i.test(estilo)) return tudo;
    const novo = estilo
      .split(';')
      .map((parte) => {
        const i = parte.indexOf(':');
        if (i < 0) return parte;
        const prop = parte.slice(0, i).trim().toLowerCase();
        return `${parte.slice(0, i)}:${trocarValor(parte.slice(i + 1), prop)}`;
      })
      .join(';');
    return `style="${novo}"`;
  });

  // 2. Atributos de pintura do SVG. `currentColor` e `none` passam intactos —
  //    eles já herdam a cor de quem manda, que é o comportamento desejado.
  saida = saida.replace(
    /\b(fill|stroke|stop-color|flood-color)="(#[0-9a-fA-F]{3,8}|rgba?\([^"]*\)|hsla?\([^"]*\))"/g,
    (_tudo, attr: string, valor: string) => `${attr}="${trocarValor(valor, attr)}"`,
  );

  return { html: saida, trocas };
};

/**
 * O mapa hexOpaco → papel de uma origem consolidada.
 *
 * Só entram clusters com papel E confiança acima do limiar compartilhado
 * (`CONFIANCA_MINIMA_PARA_RECOLORIR` mora no schema, ao lado do tipo, porque o
 * painel do kit mostra "este cluster será recolorido" com a MESMA régua).
 */
export const mapaDeRecoloracao = (clusters: readonly ClusterDeCor[]): MapaDeRecoloracao => {
  const mapa = new Map<string, DestinoDaCor>();
  for (const c of clusters) {
    if (c.papel === null || c.confianca < CONFIANCA_MINIMA_PARA_RECOLORIR) continue;
    const destino: DestinoDaCor = { papel: c.papel, ajuste: c.ajuste };
    for (const m of c.membros) {
      // Primeiro papel vence: um hex não pode servir a dois papéis, e a ordem
      // dos clusters já é a de peso.
      if (!mapa.has(m.hexOpaco)) mapa.set(m.hexOpaco, destino);
    }
  }
  return mapa;
};

/** `+ 0.12` ou `- 0.12`: `calc(l + -0.12)` não é CSS válido. */
const somaEmCalc = (n: number): string =>
  n < 0 ? `- ${Math.abs(n).toFixed(3)}` : `+ ${n.toFixed(3)}`;

/** A expressão recolorida de UM literal, dado o papel. */
const reescrever = (hexOpaco: string, alfa: string | undefined, destino: DestinoDaCor): string => {
  const fonte = `var(--marca-${destino.papel}, ${hexOpaco})`;
  const { ajuste } = destino;

  if (ajuste !== null) {
    // Cor DERIVADA: o papel foi herdado de um vizinho de matiz, e o que a
    // separa dele tem de sobreviver à troca. Em OKLCH isso é literal — a
    // luminância se desloca pelo mesmo tanto e o croma escala pela mesma
    // razão, agora em torno da cor da marca. É assim que um hover mais escuro
    // continua mais escuro depois de virar amarelo.
    const canais = `calc(l ${somaEmCalc(ajuste.deltaL)}) calc(c * ${ajuste.ratioC.toFixed(3)}) h`;
    return alfa === undefined
      ? `oklch(from ${fonte} ${canais})`
      : `oklch(from ${fonte} ${canais} / ${alfa})`;
  }

  return alfa === undefined
    ? fonte
    : // Sintaxe de cor relativa: preserva o alfa como expressão (pode ser um
      // var() do Tailwind) enquanto os canais vêm do token da marca. O
      // fallback dentro do var() mantém a degradação para o literal original.
      `rgb(from ${fonte} r g b / ${alfa})`;
};

export const recolorirCss = (
  css: string,
  mapa: MapaDeRecoloracao,
  opcoes?: { retema?: Retema },
): ResultadoRecoloracao => {
  // Mesmo motivo do `retemarHtmlInline`: a lista de matizes tem de existir e
  // ser a MESMA durante toda a folha, senão não há ordem de acento nenhuma.
  const retema =
    opcoes?.retema === undefined
      ? undefined
      : { ...opcoes.retema, matizes: opcoes.retema.matizes ?? [] };
  if (mapa.size === 0 && retema === undefined) {
    return { css, reescritas: 0, mantidas: 0, avisos: [] };
  }

  const analise = analisarCss(css);
  if ('erro' in analise) {
    return {
      css,
      reescritas: 0,
      mantidas: 0,
      avisos: [`CSS não parseou: a origem ficou com as cores originais. ${analise.erro}`],
    };
  }
  const raiz = analise.raiz;
  // O reparo entra nos avisos daqui também: quem lê o relatório de uma origem
  // precisa saber que a folha dela estava torta, e não só que a cor saiu certa.
  const avisosDoReparo = analise.reparo === null ? [] : [avisoDeReparo(analise.reparo)];

  /**
   * As custom properties que a origem usa como TINTA.
   *
   * `--brown: #2c1810` não diz nada sobre o papel dela; `color: var(--brown)`,
   * trinta regras abaixo, diz tudo. Sem esta varredura prévia, a declaração da
   * variável escapa do retema (o nome não é `--text-algo`) e o título continua
   * ilegível por mais que a régua esteja certa — foi assim no site da
   * barbearia. Uma passada antes de reescrever resolve: o USO define o papel.
   */
  const propsDeTinta = new Set<string>();
  raiz.walkDecls((decl) => {
    const prop = decl.prop.toLowerCase();
    if (!PROPS_DE_TEXTO.has(prop)) return;
    for (const m of decl.value.matchAll(/var\(\s*(--[\w-]+)/g)) {
      if (m[1] !== undefined) propsDeTinta.add(m[1].toLowerCase());
    }
  });

  let reescritas = 0;
  let mantidas = 0;
  let retemadas = 0;
  /** Textos que iam sair sem contraste e foram levados para uma tinta legível. */
  let ilegiveisCorrigidas = 0;
  /** Fundos que iam ser pintados com a cor da letra e viraram superfície. */
  let fundosComTintaCorrigidos = 0;

  raiz.walkDecls((decl) => {
    // Idempotência: um valor que já consome --marca-* não é tocado de novo.
    // Sem esta guarda, recolorir duas vezes embrulharia o var() num var().
    if (decl.value.includes('--marca-')) {
      mantidas += coresDoValor(decl.value).length;
      return;
    }
    const cores = coresDoValor(decl.value);
    if (cores.length === 0) return;

    /**
     * Em que papel esta DECLARAÇÃO pinta.
     *
     * A custom property do Tailwind entra pelo que ela alimenta: `.from-white`
     * compila para `--tw-gradient-from:#fff`, e o literal mora ALI, não na
     * função `gradient()` — foi exatamente por essa fresta que o branco do
     * título do hero escapou do retema na primeira tentativa.
     */
    const bruta = decl.prop.toLowerCase();
    const propriedade = propsDeTinta.has(bruta)
      ? 'color'
      : bruta.startsWith('--') && (bruta.includes('gradient') || bruta.includes('bg'))
        ? 'background'
        : bruta.startsWith('--') && bruta.includes('text')
          ? 'color'
          : /gradient\(/i.test(decl.value) && !PROPS_DE_TEXTO.has(bruta)
            ? 'background'
            : bruta;

    let valor = decl.value;
    for (const cor of cores) {
      let destino = mapa.get(cor.hexOpaco);
      if (destino === undefined && retema !== undefined) {
        const papel = papelDoRetema(cor.hexOpaco, propriedade, retema);
        if (papel !== null) {
          destino = { papel, ajuste: null };
          retemadas++;
        }
      }
      if (destino === undefined) {
        mantidas++;
        continue;
      }
      /**
       * NENHUM texto sai pintado com uma cor que não se lê no fundo da página.
       *
       * `textoQueSeLe` já existia, e era aplicado só no caminho do RETEMA — o
       * que preenche as lacunas. O caminho do CLUSTER vence primeiro e passava
       * sem conferência nenhuma, e é por ele que veio o pior defeito que o dono
       * viu: um hero inteiro com o texto na cor `#0b1530` sobre o fundo
       * `#0b1530`. Contraste 1,0:1 — o texto tinha exatamente a cor do fundo,
       * porque o cluster daquela cor da origem tinha papel de superfície e
       * ninguém perguntou se o destino ainda dava para ler.
       *
       * A origem não estava errada: lá, `#0D0C22` era tinta escura sobre bloco
       * claro. Errado é herdar o PAPEL sem herdar o chão — e o chão, aqui, é o
       * da marca.
       */
      if (retema !== undefined && PROPS_DE_TEXTO.has(propriedade)) {
        const legivel = textoQueSeLe(destino.papel, retema);
        if (legivel !== destino.papel) {
          destino = { ...destino, papel: legivel };
          ilegiveisCorrigidas++;
        }
      }
      /**
       * E NENHUM fundo sai pintado com a cor da LETRA — a guarda espelho.
       *
       * O papel do cluster descreve a cor na paleta da origem; a declaração
       * descreve o que ela faz aqui. Quando os dois discordam, quem manda é a
       * declaração: um `heading` pintando `background-color` não é tinta de
       * título, é uma superfície que por acaso tem a cor da tinta lá.
       *
       * O retema sabe decidir superfície (é o que ele faz o dia inteiro: mede
       * croma, luminância e a distância até a página da origem), então o papel
       * incompatível cede o lugar para ele em vez de virar um palpite novo. Sem
       * isto, o cartão escuro da origem saía branco com texto branco por cima.
       */
      if (
        retema !== undefined &&
        PROPS_DE_FUNDO.has(propriedade) &&
        PAPEIS_DE_TINTA.has(destino.papel)
      ) {
        const comoSuperficie = papelDoRetema(cor.hexOpaco, propriedade, retema);
        if (comoSuperficie === null) {
          /**
           * O retema não tem superfície para oferecer — é o regime de quando os
           * TEMAS COMBINAM, onde a superfície da origem já está certa e por isso
           * não migra. Aqui a resposta certa não é pintar com a tinta: é NÃO
           * RECOLORIR, deixando o bloco com a cor que ele tinha na origem.
           *
           * Sem esta saída, o cartão escuro de uma origem compatível saía
           * pintado de `--marca-body` — um bloco azul-claro no meio de uma
           * página marinho, com o texto branco sumindo dentro dele. Era o que
           * sobrava do "Desde 1926" e do "Na cidade" a 1,5:1.
           */
          mantidas++;
          fundosComTintaCorrigidos++;
          continue;
        }
        if (comoSuperficie !== destino.papel) {
          destino = { papel: comoSuperficie, ajuste: destino.ajuste };
          fundosComTintaCorrigidos++;
        }
      }
      const nova = reescrever(cor.hexOpaco, cor.alfa, destino);
      // Replace de UMA ocorrência do literal exato. O literal veio do próprio
      // valor, então ele existe; se o mesmo literal aparece duas vezes no
      // valor, o laço o encontra de novo na próxima cor da lista.
      const idx = valor.indexOf(cor.literal);
      if (idx >= 0) {
        valor = valor.slice(0, idx) + nova + valor.slice(idx + cor.literal.length);
        reescritas++;
      } else {
        mantidas++;
      }
    }
    decl.value = valor;
  });

  const avisos = [
    ...(retemadas > 0
      ? [
          `tema invertido em relação à marca: ${retemadas} cor(es) da origem que nenhum cluster cobria foram migradas para a paleta (superfícies para a superfície da marca, acentos para os acentos, texto para a tinta).`,
        ]
      : []),
    ...(ilegiveisCorrigidas > 0
      ? [
          `${ilegiveisCorrigidas} texto(s) sairiam com uma cor que não se lê no fundo desta página e foram levados para uma tinta legível: o cluster da origem dava a eles papel de superfície, e o chão aqui é outro.`,
        ]
      : []),
    ...(fundosComTintaCorrigidos > 0
      ? [
          `${fundosComTintaCorrigidos} fundo(s) sairiam pintados com a cor da LETRA e viraram superfície: na paleta da origem aquela cor é tinta de título ou de texto, mas aqui ela pinta um bloco — e bloco com cor de tinta some sob o próprio texto.`,
        ]
      : []),
  ];
  return { css: raiz.toString(), reescritas, mantidas, avisos: [...avisosDoReparo, ...avisos] };
};
