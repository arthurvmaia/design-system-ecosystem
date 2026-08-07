import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  type MapaDeRecoloracao,
  type ReguasDeEscala,
  type Retema,
  atributosDeProxy,
  envolverEmProxies,
  escoparCss,
  fontesDaOrigem,
  mapaDeFontes,
  mapaDeRecoloracao,
  nomesGlobaisDe,
  recolorirCss,
  reescalarCss,
  retemarHtmlInline,
  retipografarCss,
} from '@ds/composer';
import {
  type KitComponenteDeGeracao,
  KitDesignSystem,
  type ProjectBranding,
  type ProjectLayout,
  buildTypographyCss,
  distribuirTokens,
  ehPecaDeFundo,
  escalaDeReferencia,
  listarAssetsFaltando,
  projectGeneratedVersionDir,
  projectMediaDir,
  reguasParaOrigem,
  resolverSecoes,
  separarCamadasDePagina,
  separarComportamentosDaPagina,
  vaultCaptureV2Dir,
} from '@ds/shared';
import { lerCssDoBundle } from './cascata.js';
import { buildBrandingCss } from './index.js';
import {
  REGRA_DA_TINTA_DA_MARCA,
  REGRA_QUE_ABRE_PASSAGEM,
  atributosDoDocumentoDaPeca,
  envolverCamadaDePagina,
  envolverSecao,
  extrairCamadasDeFundo,
  extrairCorpo,
  limparEstadoRevelado,
  limparParaComposicao,
  limparTransformCongelado,
  reescreverRefsCss,
  reescreverRefsHtml,
} from './montagem.js';
import { removerScriptsQueCompilamCss } from './pecas.js';
import { cssResponsivoBase } from './responsivo.js';

/**
 * `montarPaginaDoKit`: TODO o determinístico da geração num lugar só.
 *
 * O que existia antes, medido nos restos: cada site do modo fila era um script
 * `_tmp-*.ts` descartável — 1371 linhas, ids de componente hardcoded, ~120
 * `troca(html, stringExata, novoTexto)` — reescrito do zero a cada projeto. O
 * escopo, a recoloração, o fundo, o responsivo, a cascata do `marca.css`: tudo
 * dependia de o agente lembrar de cada regra, e a regra esquecida não dava
 * erro, dava um site errado.
 *
 * A divisão agora é nítida:
 *
 * - **O código faz o que é mecânico**: resolver as seções, separar o fundo,
 *   compor com escopo e recoloração, vestir os proxies, copiar assets e mídia,
 *   escrever as quatro folhas na ordem da cascata, montar o documento.
 * - **O agente faz o que é criativo**, e ENTREGA como dado: os textos por
 *   seção (`substituicoes`), o HTML das seções sem peça (`htmlCriado` +
 *   `cssCriado`), a escolha de onde vai cada mídia (`midia`).
 *
 * Se algo determinístico faltar aqui, é defeito DESTE módulo — nunca trabalho
 * para um script avulso.
 */

/** O criativo de uma seção, produzido pelo agente (ou pelo modo api). */
export type SecaoCriativa = {
  /** Casa com `layout.secoes[].id`. */
  secaoId: string;
  /**
   * Trocas de texto nas peças DESTA seção: chave é o trecho exato do HTML de
   * origem, valor é o texto novo. Troca que não casa vira aviso, não silêncio.
   */
  substituicoes?: Record<string, string>;
  /**
   * HTML criado para a seção (no estilo do kit, consultando o design system
   * consolidado + a identidade do usuário). Entra DEPOIS das peças da seção,
   * ou sozinho quando a seção não tem peça.
   */
  htmlCriado?: string;
};

export type EntradaDaPagina = {
  projectId: `prj_${string}`;
  /** O <title> e o lang do documento. */
  titulo: string;
  lang?: string;
  kit: { id: string; components: readonly KitComponenteDeGeracao[] };
  /** O design system consolidado do kit (`kits.tokensJson`). Null = sem recoloração. */
  designSystem?: unknown;
  layout: ProjectLayout;
  branding: ProjectBranding;
  secoes?: readonly SecaoCriativa[];
  /** CSS das seções criadas. Vai em `assets/criadas.css`, entre styles e responsivo. */
  cssCriado?: string;
  /** Regras responsivas além da base (`cssResponsivoBase`). */
  responsivoExtra?: string;
  /**
   * Mídia a copiar: `de` relativo a `projects/<id>/media/`, `para` relativo à
   * raiz do site gerado (ex.: `midia/hero.webp`). O HTML criado referencia o
   * `para`.
   */
  midia?: readonly {
    de: string;
    para: string;
    /**
     * A seção a que esta mídia pertence.
     *
     * Com ela, o compositor TROCA sozinho as fotos que a peça trouxe do site de
     * origem pelas do projeto, na ordem. Sem ela, a mídia só é copiada e cabe
     * ao criativo referenciá-la — e foi assim que um site de joalheria saiu
     * com foto de imóvel na Nova Zelândia: a peça veio com a foto de outra
     * empresa e ninguém a trocou.
     */
    secaoId?: string;
    /**
     * O que esta mídia É, no vocabulário do manifesto do projeto.
     *
     * Sem isto, a logo da marca ancorada numa seção entraria na fila das fotos
     * de conteúdo e substituiria a foto do hero pelo símbolo da empresa. Marca
     * (`logo`, `icon`) tem caminho próprio — o das variações e do favicon.
     * Ausente = conteúdo, que é como as entradas antigas se comportavam.
     */
    kind?: 'image' | 'video' | 'logo' | 'icon' | '3d' | 'lottie' | 'mockup';
  }[];
  /** Sobrescreve o destino (testes). Default: `generated/<iso>` do projeto. */
  outputDir?: string;
};

export type ResultadoDaPagina = {
  outputDir: string;
  arquivos: string[];
  avisos: string[];
  /** Peças pedidas no layout cujo bundle não está em disco. */
  faltando: string[];
  recoloracao: { origens: number; reescritas: number; mantidas: number };
  /** Quantas declarações de fonte passaram a consumir o token da marca. */
  retipografia: { reescritas: number };
  /**
   * Tamanhos e respiros que passaram a consumir a régua da marca, e quantos
   * ficaram com o valor da origem (unidade relativa, expressão fluida, valor
   * fora de qualquer degrau). `mantidas` alto não é defeito: é o quanto daquela
   * folha o alinhamento não alcança, e é a única forma de saber disso.
   */
  reescala: { reescritas: number; mantidas: number };
  /**
   * O site sobrevive sozinho?
   *
   * `fechadoEmSi` responde a pergunta que o dono fez em voz alta: apagar um kit,
   * uma peça da Biblioteca ou reextrair uma origem pode quebrar um site que já
   * foi entregue? Com ele verdadeiro, não — tudo o que a página pede está na
   * pasta dela. `externas` lista o que vem da internet (fonte de CDN, por
   * exemplo): não quebra por apagar nada aqui, mas depende de rede, e quem
   * entrega precisa saber.
   */
  independente: { fechadoEmSi: boolean; pendentes: string[]; externas: string[] };
};

/** Troca cada chave pelo valor, uma vez; o que não casar vira aviso. */
const aplicarSubstituicoes = (
  html: string,
  substituicoes: Record<string, string> | undefined,
  avisos: string[],
  rotulo: string,
): string => {
  if (substituicoes === undefined) return html;
  let saida = html;
  for (const [de, para] of Object.entries(substituicoes)) {
    const idx = saida.indexOf(de);
    if (idx < 0) {
      avisos.push(
        `[${rotulo}] uma substituição não casou (o HTML de origem não contém o trecho que começa com "${de.slice(0, 60)}").`,
      );
      continue;
    }
    saida = saida.slice(0, idx) + para + saida.slice(idx + de.length);
  }
  return saida;
};

/** A cor de `bg-[#hex]` nos atributos de `<body>` da origem, quando declarada. */
const corDeFundoDaOrigem = (attrs: string | undefined): string | null => {
  if (attrs === undefined) return null;
  const m = /bg-\[(#(?:[0-9a-f]{3}|[0-9a-f]{6}))\]/i.exec(attrs);
  return m?.[1] ?? null;
};

/** Luminância relativa (0 escuro → 1 claro) de um hex; null quando não é hex. */
const luminancia = (cor: string): number | null => {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(cor.trim());
  if (m === null || m[1] === undefined) return null;
  const h = m[1].length === 3 ? [...m[1]].map((c) => c + c).join('') : m[1];
  const canal = (i: number): number => Number.parseInt(h.slice(i, i + 2), 16) / 255;
  return 0.2126 * canal(0) + 0.7152 * canal(2) + 0.0722 * canal(4);
};

/** Matiz (0–360) de um hex, ou null quando é cinza puro / não é hex. */
const matiz = (cor: string): number | null => {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(cor.trim());
  if (m === null || m[1] === undefined) return null;
  const h = m[1].length === 3 ? [...m[1]].map((c) => c + c).join('') : m[1];
  const [r, g, b] = [0, 2, 4].map((i) => Number.parseInt(h.slice(i, i + 2), 16) / 255) as [
    number,
    number,
    number,
  ];
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  if (d === 0) return null;
  const bruto = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return (bruto * 60 + 360) % 360;
};

/**
 * Veste a decoração da camada herdada com as cores da MARCA.
 *
 * A camada vem com as cores literais do site de origem em classes de valor
 * arbitrário (`bg-[#1A0B40]`), e o dono foi categórico: todo componente tem de
 * sair na paleta da marca. A recoloração por cluster alcança parte disso, mas
 * só quando aquele literal virou cluster com papel — decoração de fundo
 * costuma ficar de fora, e então a cafeteria ganha blobs roxos.
 *
 * Aqui a troca é direta e determinística: cada elemento decorativo da camada
 * recebe, INLINE (que vence a classe), a cor primária ou a de acento da marca,
 * alternando na ordem em que aparecem. Duas cores bastam porque é isso que a
 * camada tem: brilhos difusos que dão profundidade, não desenho com semântica.
 */
const vestirDecoracaoNaMarca = (html: string, tokens: readonly string[]): string => {
  let i = 0;
  return html.replace(/<div\b[^>]*\bbg-\[#(?:[0-9a-f]{3}|[0-9a-f]{6})\][^>]*>/gi, (tag) => {
    const cor = tokens[i % tokens.length] ?? tokens[0];
    i += 1;
    if (/\bstyle\s*=\s*"/i.test(tag)) {
      return tag.replace(/\bstyle\s*=\s*"([^"]*)"/i, (_m, estilo: string) => {
        const limpo = estilo.trim().replace(/;$/, '');
        return `style="${limpo};background:${cor}"`;
      });
    }
    return tag.replace(/>$/, ` style="background:${cor}">`);
  });
};

/**
 * Fundo ambiente derivado da PALETA DA MARCA: a base chapada mais dois brilhos
 * difusos nas cores primária e de acento. É o fundo da página quando o kit não
 * traz camada nenhuma E a origem dominante também não tem camada para herdar —
 * sem isto a página compõe sobre o vazio. Mesmo envelope fixo da camada
 * herdada, mesma passagem.
 */
const camadaDaMarca = (fundo: string, primaria: string, acento: string): string =>
  `<div data-ds-camadas-de-pagina data-ds-camada-da-marca aria-hidden="true" style="position:fixed;inset:0;z-index:-1;pointer-events:none;overflow:hidden;background:${fundo}">
<div style="position:absolute;top:-18%;left:-12%;width:58%;height:58%;border-radius:50%;background:${primaria};opacity:.16;filter:blur(110px)"></div>
<div style="position:absolute;bottom:-22%;right:-12%;width:52%;height:52%;border-radius:50%;background:${acento};opacity:.13;filter:blur(130px)"></div>
</div>`;

/**
 * O respiro lateral que a peça PERDEU ao sair do site de origem.
 *
 * Na origem, nav e hero moravam dentro de um container com largura máxima e
 * respiro (`max-w-7xl mx-auto px-4 md:px-8`). A captura recorta a peça e o pai
 * fica para trás — na composição a seção passa a ocupar a viewport inteira, e o
 * conteúdo encosta na borda: o nome no canto esquerdo, o menu e o mockup de
 * celular cortados na direita. Foi o que o dono viu no café e no asteric.
 *
 * O container não viaja no bundle (nem no manifesto, nem no `raw.html`), mas a
 * peça carrega a IMPRESSÃO DIGITAL dele: margem negativa horizontal só existe
 * para cancelar o respiro de um pai que existia. `-mx-4 px-4 md:-mx-8 md:px-8`
 * diz, literalmente, "meu pai me dava 16px de respiro, 32px no desktop".
 *
 * Daí sai o par (respiro base, respiro no desktop), na escala do Tailwind
 * (N × 4px). A largura máxima não fica registrada em lugar nenhum, e 1280px
 * (`max-w-7xl`) é o container que acompanha esse par na esmagadora maioria dos
 * sites — é convenção assumida, e está dita aqui para quem precisar mudá-la.
 */
/**
 * ── Por que só a MARGEM NEGATIVA justifica devolver o container ─────────────
 *
 * Uma tentativa anterior usava uma segunda evidência: o container declarado no
 * CSS da origem (`.container{max-width:1200px;margin:0 auto}`). Ela parecia
 * mais abrangente e foi PIOR — o dono viu na hora: "ficou parecendo pdf".
 *
 * O motivo é a diferença entre as duas evidências. Margem negativa
 * (`-mx-4 md:-mx-8`) prova que o container era um PAI, que a captura recortou:
 * devolvê-lo restaura o desenho. Uma classe de container no CSS prova o
 * contrário — que a origem se contém DENTRO da peça, que veio inteira. Ali,
 * acrescentar um container externo encaixota o que já estava contido, e a
 * página vira uma coluna estreita entre duas margens largas.
 *
 * Por isso a evidência do CSS não entra. Origem cujo container era um pai com
 * utilitárias (`max-w-7xl mx-auto`, regras separadas no CSS compilado) fica sem
 * detecção — é a limitação conhecida, e ela é melhor que o falso positivo.
 */
/**
 * A moldura MEDIDA: onde a peça realmente ficava na página de origem.
 *
 * ── Por que esta evidência vale mais que as outras duas ────────────────────
 *
 * A margem negativa (abaixo) só denuncia o container quando a peça furou o
 * respiro do pai — coisa que, na prática, só a nav faz. O container declarado
 * no CSS foi tentado e reprovado: encaixotava o que já estava contido, e o dono
 * viu na hora ("ficou parecendo pdf"). O próprio comentário daquela reversão já
 * nomeava a lacuna que sobrou: "origem cujo container era um pai com utilitárias
 * (`max-w-7xl mx-auto`) fica sem detecção — é a limitação conhecida".
 *
 * Era exatamente o caso do cogni, e o resultado apareceu no site de joalheria:
 * o título "Uma joia que é sua" começando em x=0, cortado pela borda.
 *
 * Esta terceira evidência não é heurística nenhuma — é a posição que a captura
 * MEDIU. O mapa estrutural guarda o `pageBox` de cada nó e o pai de cada um, e
 * daí sai a verdade inteira: no cogni o hero ficava em x=129 com 1182 de
 * largura, dentro de um container em x=80 com 1280 — que é `max-w-7xl` com
 * `px-12`. Largura do container e respiro saem SUBTRAÍDOS, não supostos.
 *
 * E ela também sabe dizer quando NÃO fazer nada: peça que ocupava a viewport
 * inteira na origem é sangria de propósito, e recebe moldura nenhuma. É esse
 * discernimento que faltava à tentativa que virou PDF.
 */
type MolduraMedida = { largura: number; respiro: number };

type MapaNo = {
  fingerprint: { hash: string; stableClasses?: string[] };
  pageBox?: { x: number; w: number };
  parent?: string | null;
};

type MapaDaOrigem = { nos: MapaNo[]; viewport: number };

/**
 * O cache do mapa estrutural, criado A CADA MONTAGEM.
 *
 * Não pode ser de módulo: o servidor vive por horas, e uma reextração no meio
 * do caminho deixaria a geometria velha em memória para todas as gerações
 * seguintes — a peça mudaria de lugar no site sem nada no código explicar.
 */
const lerMapaDaOrigem = (
  dsId: string,
  cache: Map<string, MapaDaOrigem | null>,
): MapaDaOrigem | null => {
  const emCache = cache.get(dsId);
  if (emCache !== undefined) return emCache;
  let lido: MapaDaOrigem | null = null;
  try {
    const caminho = join(vaultCaptureV2Dir(dsId as `ds_${string}`), 'manifest.json');
    if (existsSync(caminho)) {
      const m = JSON.parse(readFileSync(caminho, 'utf8')) as {
        structuralMap?: MapaNo[];
        viewport?: { width?: number };
      };
      const nos = m.structuralMap ?? [];
      const viewport = m.viewport?.width ?? 0;
      if (nos.length > 0 && viewport > 0) lido = { nos, viewport };
    }
  } catch {
    // Captura antiga, ilegível ou de outro formato: cai no plano B (a margem
    // negativa). Melhor uma evidência a menos do que uma montagem interrompida.
  }
  cache.set(dsId, lido);
  return lido;
};

/** As classes do primeiro elemento do corpo da peça — a âncora do casamento. */
const classesDaRaiz = (html: string): string[] => {
  const tag = /<(?!\/|!)([a-z][\w-]*)\b[^>]*>/i.exec(html);
  if (tag === null) return [];
  const cls = /\bclass\s*=\s*"([^"]*)"/i.exec(tag[0])?.[1];
  return cls === undefined ? [] : cls.split(/\s+/).filter((c) => c.length > 0);
};

const molduraMedida = (
  dsId: string,
  html: string,
  cache: Map<string, MapaDaOrigem | null>,
): MolduraMedida | null => {
  const mapa = lerMapaDaOrigem(dsId, cache);
  if (mapa === null) return null;
  const classes = new Set(classesDaRaiz(html));
  if (classes.size === 0) return null;

  // Casa pela INTERSEÇÃO das classes, não pela igualdade.
  //
  // Exigir que todas as classes do nó estivessem no elemento parecia o rigor
  // certo e derrubava casamento bom: a nav de uma das origens casava 11 de 12 e
  // era descartada pela única diferença — `bg-white/95` contra `bg-transparent`,
  // que é a classe que ela troca ao rolar. Estado não é identidade.
  //
  // O corte pede DUAS coisas ao mesmo tempo: um piso absoluto, porque quatro
  // classes genéricas (`relative flex w-full items-center`) casam com meia
  // página, e um piso proporcional, porque casar 4 de 30 é coincidência.
  let melhor: MapaNo | null = null;
  let melhorPeso = 0;
  let melhorFracao = 0;
  for (const no of mapa.nos) {
    const doNo = no.fingerprint.stableClasses ?? [];
    if (doNo.length === 0 || no.pageBox === undefined) continue;
    const inter = doNo.reduce((n, c) => (classes.has(c) ? n + 1 : n), 0);
    const fracao = inter / doNo.length;
    if (inter < 4 || fracao < 0.6) continue;
    if (inter > melhorPeso || (inter === melhorPeso && fracao > melhorFracao)) {
      melhor = no;
      melhorPeso = inter;
      melhorFracao = fracao;
    }
  }
  if (melhor === null || melhor.pageBox === undefined) return null;

  const porHash = new Map(mapa.nos.map((n) => [n.fingerprint.hash, n]));
  // Sobe até o ancestral MAIS ALTO que ainda é mais estreito que a viewport: é
  // ele o container da página. Parar no primeiro pegaria um wrapper interno.
  let container: MapaNo | null = null;
  let atual: MapaNo | null = melhor;
  const vistos = new Set<string>();
  while (atual !== null) {
    const pai: MapaNo | null =
      typeof atual.parent === 'string' ? (porHash.get(atual.parent) ?? null) : null;
    if (pai === null || vistos.has(pai.fingerprint.hash)) break;
    vistos.add(pai.fingerprint.hash);
    if (pai.pageBox !== undefined && pai.pageBox.w < mapa.viewport) container = pai;
    atual = pai;
  }
  const esquerda = melhor.pageBox.x;
  const direita = mapa.viewport - (melhor.pageBox.x + melhor.pageBox.w);

  // Sem ancestral mais estreito, o respiro veio do PRÓPRIO corpo da página —
  // `body{padding:0 48px}` sem largura máxima. Aconteceu: uma peça em x=48 com
  // 1344 de largura numa viewport de 1440, respiro dos dois lados, e nenhum
  // container para subtrair. Recusar aí devolveria a peça colada na borda por
  // falta de um nó intermediário que nunca existiu. A simetria é o que autoriza
  // a leitura: respiro igual dos dois lados é container; só de um é desenho.
  if (container?.pageBox === undefined) {
    const assimetria = Math.abs(direita - esquerda);
    if (esquerda < 8 || assimetria > Math.max(8, esquerda * 0.25)) return null;
    return { largura: mapa.viewport, respiro: Math.round(esquerda) };
  }

  const respiro = Math.round(esquerda - container.pageBox.x);
  // Respiro nulo ou negativo = a peça já encostava nas bordas do container por
  // decisão de desenho. Devolver moldura aí seria mudar a essência dela.
  if (respiro <= 0) return null;
  return { largura: Math.round(container.pageBox.w), respiro };
};

const respiroPerdido = (html: string): { base: number; desktop: number } | null => {
  let base: number | null = null;
  let desktop: number | null = null;
  for (const m of html.matchAll(/(?:^|["'\s])(?:(md|lg|xl):)?-m[xlr]-(\d{1,2})(?=["'\s])/g)) {
    const passos = Number(m[2]);
    if (!Number.isFinite(passos)) continue;
    const px = passos * 4;
    if (m[1] === undefined) base = Math.max(base ?? 0, px);
    else desktop = Math.max(desktop ?? 0, px);
  }
  if (base === null && desktop === null) return null;
  return { base: base ?? desktop ?? 0, desktop: desktop ?? base ?? 0 };
};

/**
 * Troca as fotos que a peça trouxe do site de ORIGEM pelas do projeto.
 *
 * O kit empresta o layout e o desenho; a identidade é do usuário — e foto é
 * identidade. Sem esta troca, o site de joalheria sai com a casa à beira-mar
 * que a imobiliária de origem fotografou, e o de barbearia com o escritório de
 * outra empresa. O dono foi explícito: a imagem tem de ter a ver com a marca.
 *
 * O alvo é preciso: só `<img>`/`<source>` que apontam para os ASSETS da peça
 * (`assets/<cmpId>/…`), que é exatamente o acervo do site de origem. Ícone
 * desenhado em SVG inline, logo da marca e mídia que o criativo já colocou não
 * são tocados.
 *
 * Sobrando foto de origem sem substituta, ela FICA — e a regra já foi o
 * contrário. Removê-la parecia o certo ("melhor um espaço vazio do que a casa
 * de outra empresa") até se ver o que acontece quando NÃO HÁ mídia nenhuma: o
 * caminho de API e a prévia do kit não passavam `midia`, a fila chegava vazia
 * aqui e o site saía sem uma foto sequer — buraco em toda seção, layout
 * desmontado, e nenhum aviso que explicasse. Um buraco quebra a ESSÊNCIA do
 * desenho, que é justamente o que o kit empresta; uma foto trocável não. Ela
 * sai no aviso, com o que fazer para resolver.
 */
const trocarFotosDaOrigem = (
  html: string,
  cmpId: string,
  disponiveis: readonly string[],
): { html: string; usadas: number; mantidas: number } => {
  let usadas = 0;
  let mantidas = 0;
  const saida = html.replace(/<img\b[^>]*>/gi, (tag) => {
    const src = /\bsrc\s*=\s*"([^"]+)"/i.exec(tag)?.[1];
    if (src === undefined || !src.startsWith(`assets/${cmpId}/`)) return tag;
    // Frame de referência visual não é foto de conteúdo: é o retrato inteiro
    // da seção, e quem decide sobre ele é a regra da referência visual.
    if (src.includes('/frames/')) return tag;
    const nova = disponiveis[usadas];
    if (nova === undefined) {
      mantidas += 1;
      return tag;
    }
    usadas += 1;
    // O `alt` também é da origem ("Sirocco no deserto durante a hora dourada")
    // e descreveria a foto ERRADA — sai junto com ela. Alt vazio em imagem
    // decorativa é o certo; texto alternativo específico é trabalho do
    // criativo, que conhece o conteúdo.
    return tag
      .replace(/\bsrc\s*=\s*"[^"]+"/i, `src="${nova}"`)
      .replace(/\bsrcset\s*=\s*"[^"]*"/i, '')
      .replace(/\balt\s*=\s*"[^"]*"/i, 'alt=""');
  });
  return { html: saida, usadas, mantidas };
};

/**
 * Troca o VÍDEO que a peça trouxe da origem pelo vídeo do projeto.
 *
 * Gêmea da troca de fotos, e existe pelo mesmo motivo — com um agravante. Foto
 * de outra empresa num site é constrangedor; vídeo de outra empresa é a marca
 * dela falando, com a voz dela, dentro do site do cliente. E não havia troca
 * nenhuma: o único tratamento de `<video>` na composição era APAGÁ-LO, e só
 * quando o tema da origem era oposto ao da marca. Nos outros casos ele
 * atravessava inteiro até o site entregue.
 *
 * Três lugares carregam o endereço e os três mudam juntos: o `src` do próprio
 * `<video>`, o `src` de cada `<source>` (que é como o site oferece mp4 e webm
 * ao mesmo tempo) e o `poster`, que é o quadro mostrado antes de dar play — sem
 * ele, o primeiro instante do vídeo ainda é o da outra empresa.
 *
 * O `poster` recebe FOTO, não vídeo, e por isso a função aceita as duas filas:
 * ele é uma imagem, e usar o caminho do mp4 ali não mostraria nada.
 *
 * Sem vídeo do projeto, o da origem FICA, pela mesma razão da foto: o buraco
 * quebra o desenho, e o aviso diz o que resolver.
 */
const trocarVideosDaOrigem = (
  html: string,
  cmpId: string,
  videos: readonly string[],
  fotos: readonly string[],
): { html: string; usados: number; mantidos: number } => {
  let usados = 0;
  let mantidos = 0;
  const daOrigem = (u: string | undefined): boolean => u?.startsWith(`assets/${cmpId}/`) === true;

  const saida = html.replace(/<video\b[^>]*>[\s\S]*?<\/video>/gi, (bloco) => {
    const abertura = /<video\b[^>]*>/i.exec(bloco)?.[0] ?? '';
    const src = /\bsrc\s*=\s*"([^"]+)"/i.exec(abertura)?.[1];
    const fontes = [...bloco.matchAll(/<source\b[^>]*\bsrc\s*=\s*"([^"]+)"/gi)].map((m) => m[1]);
    // Vídeo que não veio do acervo da origem não é da origem: pode ser mídia
    // que o criativo já pôs, e trocá-la desfaria o trabalho dele.
    if (!daOrigem(src) && !fontes.some(daOrigem)) return bloco;

    const novo = videos[usados];
    if (novo === undefined) {
      mantidos += 1;
      return bloco;
    }
    usados += 1;
    const capa = fotos[0];
    let saidaBloco = bloco
      .replace(/(<video\b[^>]*\bsrc\s*=\s*")[^"]+(")/i, `$1${novo}$2`)
      .replace(/(<source\b[^>]*\bsrc\s*=\s*")[^"]+(")/gi, `$1${novo}$2`);
    if (capa !== undefined) {
      saidaBloco = saidaBloco.replace(/(<video\b[^>]*\bposter\s*=\s*")[^"]+(")/i, `$1${capa}$2`);
    }
    return saidaBloco;
  });
  return { html: saida, usados, mantidos };
};

/** Os `<script src>` remotos de um documento de bundle, na ordem. */
const scriptsRemotosDe = (html: string): string[] => {
  const out: string[] = [];
  for (const m of html.matchAll(/<script\b[^>]*\bsrc\s*=\s*"([^"]+)"/gi)) {
    const src = m[1];
    if (src === undefined || !/^(https?:)?\/\//i.test(src)) continue;
    if (!out.includes(src)) out.push(src);
  }
  return out;
};

export const montarPaginaDoKit = (entrada: EntradaDaPagina): ResultadoDaPagina => {
  const avisos: string[] = [];
  const faltando: string[] = [];
  const arquivos: string[] = [];

  // ── O design system, validado sem confiança cega ──────────────────────────
  // O campo chega como `unknown` porque atravessa JSON (payload do job, coluna
  // do banco). Schema de versão futura degrada para "sem recoloração", dito.
  let ds: KitDesignSystem | null = null;
  if (entrada.designSystem != null) {
    const parse = KitDesignSystem.safeParse(entrada.designSystem);
    if (parse.success) ds = parse.data;
    else avisos.push('O design system do kit não validou no schema: sigo sem recoloração.');
  }
  if (ds === null) {
    avisos.push('Sem design system consolidado: as peças saem com as cores do site de origem.');
  }
  const mapasPorOrigem = new Map<string, MapaDeRecoloracao>();
  for (const origem of ds?.origens ?? []) {
    const mapa = mapaDeRecoloracao(origem.clusters);
    if (mapa.size > 0) mapasPorOrigem.set(origem.designSystemId, mapa);
  }

  // ── O fundo da marca, a referência de compatibilidade ─────────────────────
  // Decide duas coisas mais abaixo: se a página herda a camada de fundo da
  // origem dominante (portão de luminância) e quais origens precisam do
  // resgate de contraste — texto branco de origem escura numa página clara
  // (ou o inverso) some, e a recoloração por cluster não o alcança porque
  // branco/preto são neutros, sem papel.
  const tokensDaMarca =
    entrada.branding.paleta !== undefined ? distribuirTokens(entrada.branding.paleta) : undefined;
  const fundoDaMarca = tokensDaMarca?.background ?? entrada.branding.palette.background;
  const primariaDaMarca = tokensDaMarca?.primary ?? entrada.branding.palette.primary;
  const acentoDaMarca = tokensDaMarca?.accent ?? entrada.branding.palette.accent ?? primariaDaMarca;
  const lumDaMarca = luminancia(fundoDaMarca);
  /**
   * O retema de cada origem de tema invertido, criado UMA vez por origem.
   *
   * O objeto guarda estado (as matizes já vistas), e é por isso que ele é
   * compartilhado entre a folha da origem e o HTML das peças dela: o acento
   * esmeralda tem de virar a MESMA cor da marca no ícone e na borda.
   */
  const retemaPorOrigem = new Map<string, Retema>();
  const origensComFundoOposto = new Set<string>();
  if (lumDaMarca !== null) {
    for (const cmp of entrada.kit.components) {
      const origem = cmp.designSystemId ?? cmp.id;
      if (retemaPorOrigem.has(origem)) continue;
      const indexPath = join(cmp.bundlePath, 'index.html');
      if (!existsSync(indexPath)) continue;
      const cor = corDeFundoDaOrigem(
        atributosDoDocumentoDaPeca(readFileSync(indexPath, 'utf8')).body,
      );
      const lum = cor === null ? null : luminancia(cor);
      const oposto = lum !== null && Math.abs(lumDaMarca - lum) > 0.4;
      if (oposto) origensComFundoOposto.add(origem);
      /**
       * TODA origem ganha retema; o que muda é a extensão.
       *
       * Tema oposto → retema completo (superfície, texto e acento migram).
       * Tema igual → só os ACENTOS. O acento de outra marca é errado nos dois
       * casos: o ícone esmeralda de um site de segurança não pode aparecer num
       * streetwear vermelho só porque os dois são escuros.
       */
      retemaPorOrigem.set(origem, {
        alvo: lumDaMarca > 0.5 ? 'claro' : 'escuro',
        ...(cor !== null ? { corDePagina: cor } : {}),
        matizes: [],
        ...(oposto ? {} : { apenasAcentos: true }),
        // Os hexes reais da marca e o fundo da página: é com eles que o piso
        // de contraste confere se o texto migrado ainda se lê.
        ...(tokensDaMarca !== undefined ? { tokens: tokensDaMarca } : {}),
        fundoDaPagina: fundoDaMarca,
      });
    }
  }

  /**
   * ── A escala, quando a marca rege ────────────────────────────────────────
   *
   * Uma régua só para o site inteiro. Sem isto, um kit que junta o hero de um
   * site com os preços de outro sai com título de 64px em cima e de 40px
   * embaixo — não porque alguém escolheu, mas porque dois designers
   * escolheram, em sites diferentes, e ninguém conciliou.
   *
   * O regime `de-cada-origem` não é um segundo caminho de código: é ESTE
   * caminho desligado. Sem régua, `reescalarCss` não é chamado e o literal da
   * origem continua valendo, que é exatamente o comportamento anterior.
   */
  const regeAMarca = entrada.branding.escalaDoSite !== 'de-cada-origem';
  const referencia = regeAMarca
    ? escalaDeReferencia(ds?.origens ?? [], entrada.layout.preferDesignSystemId)
    : null;
  const reguasPorOrigem = new Map<string, ReguasDeEscala>();
  if (referencia !== null) {
    for (const origem of ds?.origens ?? []) {
      const reguas = reguasParaOrigem(origem.escala, referencia.escala);
      if (
        reguas.tipografia.porValor.size > 0 ||
        reguas.espaco.porValor.size > 0 ||
        reguas.raio.porValor.size > 0
      ) {
        reguasPorOrigem.set(origem.designSystemId, reguas);
      }
    }
  }
  if (regeAMarca && referencia === null && (ds?.origens.length ?? 0) > 0) {
    avisos.push(
      'Nenhuma origem do kit tem escala medida: os tamanhos e respiros saem como no site de origem. Recapture para o motor medir a régua.',
    );
  }

  // ── Estrutura: seções do usuário, fundo e comportamento separados ─────────
  const resolvidas = resolverSecoes(entrada.layout.secoes, [...entrada.kit.components]);
  avisos.push(...resolvidas.avisos);
  // Comportamento sai ANTES do fundo: uma peça pode ser as duas coisas (um
  // fundo que reage à rolagem), e nesse caso o que decide é o que ela FAZ.
  const comportamento = separarComportamentosDaPagina(resolvidas.secoes);
  avisos.push(...comportamento.avisos);
  const separado = separarCamadasDePagina(comportamento.secoes);
  avisos.push(...separado.avisos);

  const outputDir =
    entrada.outputDir ??
    projectGeneratedVersionDir(entrada.projectId, new Date().toISOString().replace(/[:.]/g, '-'));
  mkdirSync(join(outputDir, 'assets'), { recursive: true });

  const porId = new Map(entrada.kit.components.map((c) => [c.id, c]));
  const criativoPorSecao = new Map((entrada.secoes ?? []).map((s) => [s.secaoId, s]));

  /**
   * ── A origem dominante da página ──────────────────────────────────────────
   *
   * Quem tem mais peças nas seções; empate vai para a origem do hero (a dobra
   * que define a cara do site); persistindo, a primeira origem na ordem das
   * seções. É dela que a página herda o fundo quando o kit não traz peça de
   * fundo nenhuma — sem isso, `limparParaComposicao` tira o fundo de cada peça
   * e ninguém devolve: a página compõe sobre um vazio (o "vão preto").
   */
  const contagemPorOrigem = new Map<string, number>();
  const pecasPorOrigem = new Map<string, KitComponenteDeGeracao[]>();
  const ordemDasOrigens: string[] = [];
  let origemDoHero: string | null = null;
  for (const secao of separado.secoes) {
    for (const peca of secao.pecas) {
      const cmp = porId.get(peca.id);
      if (cmp === undefined) continue;
      const origem = cmp.designSystemId ?? cmp.id;
      contagemPorOrigem.set(origem, (contagemPorOrigem.get(origem) ?? 0) + 1);
      if (!pecasPorOrigem.has(origem)) {
        pecasPorOrigem.set(origem, []);
        ordemDasOrigens.push(origem);
      }
      pecasPorOrigem.get(origem)?.push(cmp);
      if (origemDoHero === null && secao.slug === 'hero') origemDoHero = origem;
    }
  }
  const origemDominante =
    ordemDasOrigens.length === 0
      ? null
      : ordemDasOrigens.reduce((melhor, o) => {
          const co = contagemPorOrigem.get(o) ?? 0;
          const cm = contagemPorOrigem.get(melhor) ?? 0;
          if (co > cm) return o;
          if (co === cm && o === origemDoHero && melhor !== origemDoHero) return o;
          return melhor;
        });

  // Estado da composição, compartilhado entre seções e camadas: uma origem
  // entra com CSS uma vez só, e os nomes globais (keyframes) acumulam.
  const origensComCss = new Set<string>();
  const nomesUsados = {
    keyframes: new Set<string>(),
    fontFace: new Set<string>(),
    layer: new Set<string>(),
  };
  let concatCss = '';
  const scriptsRemotos: string[] = [];
  /**
   * Scripts LOCAIS das peças, um por conteúdo, na ordem da primeira aparição.
   *
   * Antes cada peça carregava as próprias tags no lugar onde o corpo dela caiu,
   * e duas peças do mesmo site carregavam o MESMO arquivo duas vezes — dois
   * listeners no botão do menu mobile (abre e fecha no mesmo clique), dois
   * requestAnimationFrame desenhando o mesmo canvas. Aqui a página composta
   * volta a ser como a origem: cada script uma vez, no fim do body, quando
   * todos os elementos que ele procura já existem.
   */
  const scriptsLocais: string[] = [];
  /** O texto de cada script local — a prova de quem reaplica o quê. */
  const corpoDosScriptsLocais: string[] = [];
  const chavesDeScriptLocal = new Set<string>();
  /** Origem → respiro do container que ela tinha e a captura não trouxe. */
  const containerPorOrigem = new Map<string, { base: number; desktop: number }>();
  /**
   * Origem → a moldura MEDIDA no mapa estrutural da captura.
   *
   * Vale mais que o mapa acima e o substitui quando existe: aquele infere o
   * container a partir de uma marca indireta (a margem negativa), este lê onde
   * a peça de fato estava. Guarda a MAIOR largura e o MAIOR respiro vistos na
   * origem, porque a página composta tem um eixo só.
   */
  const molduraPorOrigem = new Map<string, MolduraMedida>();
  /** O mapa estrutural de cada origem, lido uma vez por montagem. */
  const cacheDoMapa = new Map<string, MapaDaOrigem | null>();
  const recoloracaoTotais = { origens: 0, reescritas: 0, mantidas: 0 };
  const retipografiaTotais = { reescritas: 0 };
  const reescalaTotais = { reescritas: 0, mantidas: 0 };

  /**
   * Processa UMA peça: CSS da origem (recolorido → escopado, uma vez), corpo
   * vestido nos proxies, assets copiados e referências reescritas.
   */
  /**
   * As mídias do projeto ANCORADAS em cada seção, na ordem em que chegaram.
   * É delas que sai a troca das fotos de origem.
   */
  const midiaPorSecao = new Map<string, { fotos: string[]; videos: string[] }>();
  for (const m of entrada.midia ?? []) {
    if (m.secaoId === undefined) continue;
    // Marca não é conteúdo: a logo tem o caminho das variações e do favicon, e
    // entrar aqui faria o símbolo da empresa substituir a foto do hero.
    if (m.kind === 'logo' || m.kind === 'icon') continue;
    const lista = midiaPorSecao.get(m.secaoId) ?? { fotos: [], videos: [] };
    // Foto e vídeo em filas SEPARADAS, porque os buracos que eles preenchem são
    // de formatos diferentes: pôr um `.mp4` no `src` de uma `<img>` não mostra
    // nada, e uma `.jpg` no `<video>` também não. Uma fila só, na ordem de
    // chegada, faria isso na primeira vez que o projeto tivesse os dois.
    if (m.kind === 'video') lista.videos.push(m.para);
    else lista.fotos.push(m.para);
    midiaPorSecao.set(m.secaoId, lista);
  }
  /** As filas da seção em processamento; cada peça consome o que usar. */
  let fotosDaSecao: string[] = [];
  let videosDaSecao: string[] = [];

  const processarPeca = (
    cmpId: string,
    substituicoes: Record<string, string> | undefined,
    rotulo: string,
    opcoes?: { descartarReferenciaVisual?: boolean },
  ): string | null => {
    const cmp = porId.get(cmpId);
    if (cmp === undefined) {
      avisos.push(`[${rotulo}] a peça ${cmpId} não está no kit do payload: ficou de fora.`);
      return null;
    }
    const indexPath = join(cmp.bundlePath, 'index.html');
    if (!existsSync(indexPath)) {
      faltando.push(cmpId);
      avisos.push(`[${rotulo}] a peça ${cmpId} não tem bundle em disco: ficou de fora.`);
      return null;
    }
    const documento = readFileSync(indexPath, 'utf8');

    // Referência visual é imagem CONGELADA da origem: não recolore, não aceita
    // substituição de texto — numa seção que JÁ tem conteúdo criado, ela só
    // injetaria a marca de outro site (o "Arquitetura da Mente" no meio do
    // café). O criado cobre a seção; a peça sai, dito.
    if (
      opcoes?.descartarReferenciaVisual === true &&
      documento.includes('data-ds-aviso="referencia-visual"')
    ) {
      avisos.push(
        `[${rotulo}] a peça ${cmpId} (${cmp.name}) é referência visual — imagem congelada do site de origem, sem recoloração nem texto da marca. A seção já tem conteúdo criado no estilo do kit, então a imagem saiu.`,
      );
      return null;
    }

    // Fundo/efeito mantém as cores originais: a peça foi escolhida PELA cor.
    // A origem-apelido dá a ela um escopo próprio sem recoloração.
    //
    // O apelido usa `__`, e não `::` como usava, porque este mesmo texto vira
    // SUFIXO de nome global no escopo: `@keyframes girar` renomeia para
    // `girar--<origem>`. Com dois-pontos ali sai `girar--ds_a::original`, que
    // não é um identificador CSS válido — o navegador descarta a at-rule
    // inteira e a animação da peça de fundo simplesmente não roda. Era um dos
    // motivos de as páginas saírem paradas.
    const manterCores = ehPecaDeFundo(cmp);
    const origemBase = cmp.designSystemId ?? cmp.id;
    const origem = manterCores ? `${origemBase}__original` : origemBase;

    if (!origensComCss.has(origem)) {
      origensComCss.add(origem);
      const leitura = lerCssDoBundle(cmp.bundlePath);
      if (leitura.faltando.length > 0) {
        avisos.push(
          `[${rotulo}] ${leitura.faltando.length} folha(s) do bundle de ${cmpId} não existem em disco.`,
        );
      }
      // O silêncio aqui já custou uma prévia inteira sem diagnóstico: peça sem
      // folha nenhuma renderiza crua e nada dizia por quê. Os dois casos da
      // cascata viram voz: bundle SEM CSS, e CSS achado por chute alfabético
      // (o index.html do bundle não declara a ordem das folhas).
      if (leitura.css.trim().length === 0) {
        avisos.push(
          `[${rotulo}] o bundle de ${cmpId} não tem CSS nenhum: a peça vai aparecer sem estilo.`,
        );
      } else if (leitura.origem === 'vazio') {
        avisos.push(
          `[${rotulo}] o index.html do bundle de ${cmpId} não declara as folhas: o CSS entrou em ordem alfabética, que pode não ser a cascata original.`,
        );
      }
      let css = leitura.css;
      const mapa = manterCores ? undefined : mapasPorOrigem.get(origemBase);
      // O RETEMA entra junto da recoloração: origem de tema oposto ao da marca
      // tem TODA cor que nenhum cluster cobria migrada para a paleta —
      // superfície, acento e tinta (ver Retema no composer).
      const retema = manterCores ? undefined : retemaPorOrigem.get(origemBase);
      if ((mapa !== undefined || retema !== undefined) && css.trim().length > 0) {
        const rec = recolorirCss(
          css,
          mapa ?? new Map(),
          retema === undefined ? undefined : { retema },
        );
        css = rec.css;
        recoloracaoTotais.origens += 1;
        recoloracaoTotais.reescritas += rec.reescritas;
        recoloracaoTotais.mantidas += rec.mantidas;
        avisos.push(...rec.avisos.map((a) => `[${origemBase}] ${a}`));
      }
      /**
       * A retipografia, logo depois da recoloração e ANTES do escopo — pela
       * mesma razão que a recoloração vem antes: as duas reescrevem VALOR, e o
       * escopo reescreve SELETOR. Rodando nessa ordem, cada transformação fica
       * cega para a outra.
       *
       * `manterCores` também segura esta: quem pediu a peça pela aparência de
       * origem quis a aparência inteira, letra incluída.
       */
      if (!manterCores && css.trim().length > 0) {
        const fontes = fontesDaOrigem(css);
        const ret = retipografarCss(css, mapaDeFontes(fontes));
        css = ret.css;
        retipografiaTotais.reescritas += ret.reescritas;
        if (fontes.display === null && fontes.body === null) {
          avisos.push(
            `[${origemBase}] não deu para dizer qual fonte é de título e qual é de texto, então a tipografia desta origem fica como está.`,
          );
        }
      }

      /**
       * A reescala fecha a trinca de reescrita de VALOR, e vem por último das
       * três de propósito: ela lê `font-size`, que a retipografia não toca (a
       * retipografia mexe em `font-family`), então as duas são cegas uma para a
       * outra em qualquer ordem — mas manter a ordem cor → letra → tamanho faz o
       * placar e os avisos saírem na mesma sequência em que a pessoa pensa a
       * marca.
       *
       * `manterCores` segura esta também, pela terceira vez e pelo mesmo motivo:
       * quem escolheu a peça pela aparência de origem quis a aparência inteira,
       * e proporção é aparência.
       */
      const reguas = manterCores ? undefined : reguasPorOrigem.get(origemBase);
      if (reguas !== undefined && css.trim().length > 0) {
        const esc = reescalarCss(css, reguas);
        css = esc.css;
        reescalaTotais.reescritas += esc.reescritas;
        reescalaTotais.mantidas += esc.mantidas;
      }

      if (css.trim().length > 0) {
        const proxies = atributosDeProxy(origem);
        const escopo = escoparCss(css, {
          raiz: `${proxies.raiz}="${origem}"`,
          corpo: `${proxies.corpo}="${origem}"`,
          sufixo: origem,
          nomesUsados,
        });
        avisos.push(...escopo.avisos.map((a) => `[${origem}] ${a}`));
        const declarados = nomesGlobaisDe(escopo.css);
        for (const n of declarados.keyframes) nomesUsados.keyframes.add(n);
        for (const n of declarados.fontFace) nomesUsados.fontFace.add(n);
        for (const n of declarados.layer) nomesUsados.layer.add(n);
        // As referências de asset do CSS apontam para a pasta da peça que
        // trouxe a folha — as peças da mesma origem compartilham os arquivos.
        concatCss += `\n/* origem ${origem} — primeira peça: ${cmpId} */\n${reescreverRefsCss(escopo.css, cmpId)}`;
      }
    }

    // O compilador de CSS localizado (Tailwind CDN) NÃO vai para o site
    // composto: ele recompilaria as utilitárias com os literais de origem por
    // cima da recoloração. Ver removerScriptsQueCompilamCss.
    const semCompilador = removerScriptsQueCompilamCss(
      limparParaComposicao(extrairCorpo(documento)),
      cmp.bundlePath,
    );
    for (const src of semCompilador.removidos) {
      avisos.push(
        `[${rotulo}] o script ${src} compila CSS em runtime e foi removido do site composto: o CSS compilado viaja nos arquivos do bundle (verificado pela marca do compilador).`,
      );
    }
    for (const src of semCompilador.mantidos) {
      avisos.push(
        `[${rotulo}] o script ${src} compila CSS em runtime e foi MANTIDO: o bundle desta peça não traz o CSS compilado, e removê-lo deixaria a peça sem estilo. As cores de origem podem vazar por cima da marca nesta peça.`,
      );
    }
    // O transform congelado da captura sai: o script de parallax da origem
    // viaja junto e reaplica o valor certo a cada rolagem.
    let corpo = limparTransformCongelado(semCompilador.corpo);

    /**
     * O container perdido é da ORIGEM, não desta peça.
     *
     * Só a nav costuma carregar a margem negativa que o denuncia (é ela que
     * precisa furar o respiro do pai para encostar o fundo nas bordas). O hero
     * da MESMA origem morava no mesmo container e não tem marca nenhuma — se a
     * regra valesse só para quem tem a marca, o menu alinhava e o título
     * continuava colado na borda, que foi exatamente o que apareceu no asteric.
     */
    const respiro = respiroPerdido(corpo);
    if (respiro !== null) {
      const anterior = containerPorOrigem.get(origemBase);
      containerPorOrigem.set(origemBase, {
        base: Math.max(anterior?.base ?? 0, respiro.base),
        desktop: Math.max(anterior?.desktop ?? 0, respiro.desktop),
      });
    }
    // A medição, quando a captura a tem, manda: ela sabe a largura do container
    // e o respiro por subtração, e sabe também quando a peça era sangria de
    // propósito e não deve receber moldura nenhuma.
    const medida = molduraMedida(origemBase, corpo, cacheDoMapa);
    if (medida !== null) {
      const anterior = molduraPorOrigem.get(origemBase);
      molduraPorOrigem.set(origemBase, {
        largura: Math.max(anterior?.largura ?? 0, medida.largura),
        respiro: Math.max(anterior?.respiro ?? 0, medida.respiro),
      });
    }

    // A segunda passagem do retema: `style=""` e `fill`/`stroke` do SVG, que
    // não moram em folha nenhuma. Sem ela sobram o ícone esmeralda e o cartão
    // com gradiente escuro no meio de uma página clara.
    const retemaDaPeca = manterCores ? undefined : retemaPorOrigem.get(origemBase);
    if (retemaDaPeca !== undefined) {
      const r = retemarHtmlInline(corpo, retemaDaPeca);
      corpo = r.html;
      if (r.trocas > 0) recoloracaoTotais.reescritas += r.trocas;
    }
    corpo = aplicarSubstituicoes(corpo, substituicoes, avisos, rotulo);
    corpo = envolverEmProxies({
      origem,
      html: corpo,
      css: '',
      documentoAttrs: atributosDoDocumentoDaPeca(documento),
    });

    // Assets do bundle → assets/<cmpId>/ (menos o css, que entrou na folha).
    const assetsDir = join(cmp.bundlePath, 'assets');
    if (existsSync(assetsDir)) {
      const destino = join(outputDir, 'assets', cmpId);
      for (const entry of readdirSync(assetsDir)) {
        if (entry === 'css') continue;
        cpSync(join(assetsDir, entry), join(destino, entry), { recursive: true });
      }
      corpo = reescreverRefsHtml(corpo, cmpId);
      // Com as refs já no namespace da peça, dá para reconhecer o que é foto
      // DA ORIGEM e trocá-la pela do projeto.
      const troca = trocarFotosDaOrigem(corpo, cmpId, fotosDaSecao);
      corpo = troca.html;
      fotosDaSecao = fotosDaSecao.slice(troca.usadas);
      if (troca.usadas > 0) {
        avisos.push(
          `[${rotulo}] ${troca.usadas} foto(s) do site de origem trocada(s) pela mídia do projeto.`,
        );
      }
      if (troca.mantidas > 0) {
        avisos.push(
          `[${rotulo}] ${troca.mantidas} foto(s) do site de origem CONTINUAM na página: não havia mídia do projeto para esta seção. Gere as mídias automáticas ou envie imagens para ela — enquanto isso o site mostra a foto de outra empresa.`,
        );
      }
      // O vídeo segue a mesma régua, e com mais urgência: vídeo de outra
      // empresa é a marca dela falando dentro do site do cliente.
      const tv = trocarVideosDaOrigem(corpo, cmpId, videosDaSecao, fotosDaSecao);
      corpo = tv.html;
      videosDaSecao = videosDaSecao.slice(tv.usados);
      if (tv.usados > 0) {
        avisos.push(
          `[${rotulo}] ${tv.usados} vídeo(s) do site de origem trocado(s) pelo do projeto (com a capa junto).`,
        );
      }
      if (tv.mantidos > 0) {
        avisos.push(
          `[${rotulo}] ${tv.mantidos} vídeo(s) do site de origem CONTINUAM na página: não havia vídeo do projeto para esta seção — o site entrega o vídeo de outra empresa até você enviar o seu.`,
        );
      }
    }
    // Frames da referência visual também moram no bundle e viajam junto.
    const framesDir = join(cmp.bundlePath, 'frames');
    if (existsSync(framesDir)) {
      cpSync(framesDir, join(outputDir, 'assets', cmpId, 'frames'), { recursive: true });
      corpo = corpo.replaceAll('src="frames/', `src="assets/${cmpId}/frames/`);
    }

    for (const s of scriptsRemotosDe(documento)) {
      if (!scriptsRemotos.includes(s)) scriptsRemotos.push(s);
    }

    // As tags de script saem do corpo: local entra UMA vez (por conteúdo) no
    // fim do body; remoto já foi coletado em `scriptsRemotos` logo acima.
    corpo = corpo.replace(
      /<script\b([^>]*)>([\s\S]*?)<\/script>/gi,
      (tag, attrs: string, conteudo: string) => {
        const src = /\bsrc\s*=\s*"([^"]+)"/i.exec(attrs)?.[1];
        if (src !== undefined && /^(https?:)?\/\//i.test(src)) return '';
        let chave: string;
        if (src !== undefined) {
          // O nome do arquivo é hash de conteúdo nos bundles novos, mas o
          // caminho carrega o namespace da peça — a identidade de verdade são
          // os bytes, então o dedupe lê o arquivo já copiado para o site.
          const arquivo = join(outputDir, src);
          chave = existsSync(arquivo)
            ? createHash('sha1').update(readFileSync(arquivo)).digest('hex')
            : src;
        } else {
          chave = `inline:${conteudo.trim()}`;
        }
        if (chavesDeScriptLocal.has(chave)) return '';
        chavesDeScriptLocal.add(chave);
        scriptsLocais.push(tag);
        // O CONTEÚDO, além da tag: é nele que se lê se existe observador de
        // rolagem na página e quais classes de estado ele reaplica. Sem essa
        // prova, tirar a classe congelada deixaria o elemento invisível para
        // sempre em vez de devolver o movimento.
        if (src !== undefined) {
          const arquivo = join(outputDir, src);
          if (existsSync(arquivo)) corpoDosScriptsLocais.push(readFileSync(arquivo, 'utf8'));
        } else {
          corpoDosScriptsLocais.push(conteudo);
        }
        return '';
      },
    );
    return corpo;
  };

  // ── As camadas de fundo, antes das seções ─────────────────────────────────
  let camadasHtml = '';
  if (separado.camadas.length > 0) {
    const corpos = separado.camadas
      .map((c) => processarPeca(c.id, undefined, 'fundo da página'))
      .filter((c): c is string => c !== null);
    if (corpos.length > 0) {
      camadasHtml = `\n${envolverCamadaDePagina(corpos.join('\n'), {
        componentIds: separado.camadas.map((c) => c.id),
      })}\n`;
      avisos.push(
        'Fundo por peça de referência visual é imagem estática do frame de origem: cobre a tela, mas não anima e não recolore.',
      );
    }
  }

  // ── Os comportamentos da página ───────────────────────────────────────────
  //
  // O HTML deles é quase nada — "Aparecer conforme rola" tem 191 bytes — e o
  // que vale é o efeito colateral de `processarPeca`: o CSS da origem entra na
  // cascata e o script local vai para o FIM do body, junto com os outros, onde
  // encontra os elementos de todas as seções já montados. Um observador
  // registrado antes de os elementos existirem não observaria nada, e é por isso
  // que nenhum script fica inline no meio da página.
  //
  // Entram na cascata ANTES das seções, de propósito: comportamento é a base
  // sobre a qual a seção manda, e não o contrário.
  //
  // Limitação conhecida, e vale dizer: o CSS de cada origem é escopado nela, e
  // um comportamento vindo da origem A não alcança o CSS das seções da origem B.
  // O SCRIPT alcança — ele é global e procura por seletor —, mas a regra que
  // esconde o elemento antes da revelação é de cada origem. Comportamento
  // escolhido da mesma origem das seções funciona inteiro; misturado, funciona
  // no que compartilha a origem.
  //
  // O pouco de HTML vai num `<div data-ds-comportamento>` SOBRE o conteúdo, e
  // não atrás como o fundo: o ponteiro personalizado precisa ficar por cima, e o
  // resto não ocupa espaço nenhum de qualquer forma.
  let comportamentoHtml = '';
  if (comportamento.comportamentos.length > 0) {
    const corpos = comportamento.comportamentos
      .map((c) => processarPeca(c.id, undefined, 'comportamento da página'))
      .filter((c): c is string => c !== null);
    if (corpos.length > 0) {
      const ids = comportamento.comportamentos.map((c) => c.id).join(' ');
      comportamentoHtml = `\n<div data-ds-comportamento="${ids}" style="position:fixed;inset:0;pointer-events:none;z-index:9999">\n${corpos.join('\n')}\n</div>\n`;
      avisos.push(
        `${corpos.length} comportamento(s) da página aplicados: o CSS e o script deles valem para todas as seções, não para uma faixa.`,
      );
    }
  }

  // ── As seções, na ordem do usuário ────────────────────────────────────────
  let bodyHtml = '';
  for (const secao of separado.secoes) {
    const criativo = criativoPorSecao.get(secao.id);
    const temCriado = criativo?.htmlCriado !== undefined && criativo.htmlCriado.trim().length > 0;
    const partes: string[] = [];
    const usados: string[] = [];
    // As filas DESTA seção, que as peças dela vão consumindo.
    const daSecao = midiaPorSecao.get(secao.id);
    fotosDaSecao = [...(daSecao?.fotos ?? [])];
    videosDaSecao = [...(daSecao?.videos ?? [])];
    for (const peca of secao.pecas) {
      const corpo = processarPeca(peca.id, criativo?.substituicoes, secao.nome || secao.slug, {
        descartarReferenciaVisual: temCriado,
      });
      if (corpo === null) continue;
      partes.push(corpo);
      usados.push(peca.id);
    }
    if (temCriado && criativo?.htmlCriado !== undefined) {
      // O envelope dá à seção criada o mesmo ponto de apoio que os proxies dão
      // às peças: a REGRA_QUE_ABRE_PASSAGEM o torna transparente e o fundo é
      // da página. O conteúdo interno segue mandando nos próprios cartões.
      partes.push(`<div data-ds-criado>\n${criativo.htmlCriado}\n</div>`);
    }
    if (partes.length === 0) {
      avisos.push(
        `A seção "${secao.nome || secao.slug}" saiu vazia: sem peça em disco e sem HTML criado. Ela foi mantida para o problema aparecer na prévia, não sumir.`,
      );
      partes.push(`<!-- seção "${secao.nome}" sem conteúdo -->`);
    }
    const conteudoDaSecao = partes.join('\n');
    // Nav que era sticky/fixed na origem: a section vira o sticky (na
    // composição o containing block da nav é a própria section, onde sticky
    // não tem curso). A regra CSS correspondente vive no bloco base abaixo.
    const fixaNoTopo =
      secao.slug === 'nav' && /class="[^"]*\b(?:sticky|fixed)\b[^"]*"/.test(conteudoDaSecao);
    bodyHtml += `\n${envolverSecao(conteudoDaSecao, {
      role: secao.slug,
      secaoId: secao.id,
      componentIds: usados,
      criouAlgo: criativo?.htmlCriado !== undefined || usados.length < secao.pecas.length,
      fixaNoTopo,
    })}\n`;
  }

  // ── Fundo herdado da origem dominante ─────────────────────────────────────
  // Só quando nenhuma peça de fundo foi promovida: o kit não trouxe fundo, mas
  // as peças vieram de um site que TINHA (o bundle guarda as camadas em
  // `data-ds-camadas-de-fundo`, que a composição retira de cada peça). A página
  // herda as camadas da origem dominante UMA vez; a REGRA_QUE_ABRE_PASSAGEM
  // torna o fundo das seções transparente e o fundo passa a ser da página
  // inteira — inclusive atrás das seções de outras origens.
  //
  // A camada herdada entra SEMPRE que existir — a decoração da origem (feixes,
  // canvas, blobs) é o que dá vida à página, e o dono quer vê-la. O que ela NÃO
  // pode trazer é a cor: o fundo chapado do site de origem some (regra de
  // herdada, abaixo) e o que resta é girado para a matiz da marca. Uma versão
  // anterior descartava a camada quando o claro/escuro não batia, e o resultado
  // foi um site sem as linhas — o defeito oposto, e pior.
  let giroDoCanvas = 0;
  if (camadasHtml === '' && origemDominante !== null) {
    const temaOposto = origensComFundoOposto.has(origemDominante);
    for (const cmp of pecasPorOrigem.get(origemDominante) ?? []) {
      const indexPath = join(cmp.bundlePath, 'index.html');
      if (!existsSync(indexPath)) continue;
      const documento = readFileSync(indexPath, 'utf8');
      let miolo = extrairCamadasDeFundo(documento);
      if (miolo === null) continue;

      /**
       * O `<canvas>` da camada é cena OPACA pintada por JavaScript: aqueles
       * pixels não moram em CSS nenhum, então nem a recoloração nem token
       * algum os alcança. Enquanto o tema da origem bate com o da marca (site
       * escuro vestindo marca escura) ele é lucro — é dele que saem os feixes
       * de neon. Com o tema INVERTIDO ele é ruína: numa marca clara de
       * cafeteria, ele repinta a página inteira com a noite da origem, e a
       * tentativa de girar a matiz só trocou o roxo por verde. Então ele sai, e
       * a decoração que RESTA (blobs, gradientes) veste a marca logo abaixo.
       */
      if (temaOposto) {
        // Vídeo de fundo cai na MESMA régua do canvas, e pelo mesmo motivo:
        // são pixels, não CSS. Um vídeo escuro cobrindo a viewport impõe a
        // noite da origem a uma marca clara, e nenhuma recoloração o alcança.
        miolo = miolo
          .replace(/<canvas\b[^>]*>[\s\S]*?<\/canvas>/gi, '')
          .replace(/<video\b[^>]*>[\s\S]*?<\/video>/gi, '');
      } else if (/<canvas\b/i.test(miolo)) {
        /**
         * Tema igual, canvas mantido: os feixes continuam, mas na matiz da
         * marca. `hue-rotate` é a única alça que existe sobre pixel pintado por
         * JavaScript, e aqui ela é segura porque o giro alcança SÓ o canvas —
         * girar a camada inteira foi o que, num teste anterior, trocou o roxo
         * por verde e escureceu a página. O ângulo sai da cor decorativa da
         * própria camada até a primária da marca.
         */
        const corDecorativa = /bg-\[(#(?:[0-9a-f]{3}|[0-9a-f]{6}))\]/i.exec(miolo)?.[1] ?? null;
        const daOrigem = corDecorativa === null ? null : matiz(corDecorativa);
        const alvo = matiz(primariaDaMarca);
        if (daOrigem !== null && alvo !== null) {
          giroDoCanvas = Math.round(((alvo - daOrigem + 540) % 360) - 180);
        }
      }
      miolo = vestirDecoracaoNaMarca(miolo, [primariaDaMarca, acentoDaMarca]);

      let corpoCamada = envolverEmProxies({
        origem: origemDominante,
        html: miolo,
        css: '',
        documentoAttrs: atributosDoDocumentoDaPeca(documento),
      });
      corpoCamada = reescreverRefsHtml(corpoCamada, cmp.id);
      camadasHtml = `\n${envolverCamadaDePagina(corpoCamada, {
        componentIds: [cmp.id],
        herdada: true,
      })}\n`;
      avisos.push(
        temaOposto
          ? `O kit não tem peça de fundo: a página herdou as camadas de "${cmp.name}" (origem dominante) com a decoração vestida na paleta da marca. O canvas da origem saiu — ele é pintado por JavaScript no tema escuro daquele site, e nenhuma recoloração alcança pixel.`
          : `O kit não tem peça de fundo: a página herdou as camadas de "${cmp.name}" (origem dominante), com o fundo chapado removido e a decoração vestida na paleta da marca.`,
      );
      break;
    }
  }
  if (camadasHtml === '') {
    camadasHtml = `\n${camadaDaMarca(fundoDaMarca, primariaDaMarca, acentoDaMarca)}\n`;
  }

  // ── Base da página composta (do compositor, não de uma origem) ────────────
  // O reset tira a margem default do UA (8px de fresta na cor do body em volta
  // de tudo); a passagem é a regra que torna os embrulhos do compositor
  // transparentes sobre o fundo da página — emitida SEMPRE, com ou sem camada;
  // `--pagina-fundo` publica esse fundo para o CSS criado consumir; a regra de
  // sticky é o par CSS do atributo `data-fixa-no-topo`.
  concatCss += `\n/* base da página composta */\nhtml,body{margin:0}\n:root{--pagina-fundo:${fundoDaMarca}}\nbody{background:var(--pagina-fundo)}\n${REGRA_QUE_ABRE_PASSAGEM}\n${REGRA_DA_TINTA_DA_MARCA}\n[data-secao="nav"][data-fixa-no-topo]{position:sticky;top:0;z-index:60}\n`;

  /**
   * O CONTAINER da página, devolvido às seções que provaram tê-lo perdido.
   *
   * `--pagina-largura` fica publicado junto do fundo: o CSS criado consome o
   * mesmo valor e as seções criadas nascem no mesmo eixo das seções de
   * biblioteca. Alinhar é isso — não é cada seção achar o próprio centro.
   */
  // A medição substitui a inferência na origem em que as duas aparecem: ler
  // onde a peça estava é melhor que deduzir de uma marca indireta.
  const origensComMoldura = new Set([...molduraPorOrigem.keys(), ...containerPorOrigem.keys()]);
  if (origensComMoldura.size > 0) {
    /**
     * UM eixo para a página inteira.
     *
     * Cada origem tinha o container dela — 1280 aqui, 1152 ali. Devolver o de
     * cada uma alinharia a seção com a origem DELA e desalinharia as seções
     * entre si, que é o que o dono não quer: "o grid do site precisa estar
     * alinhado com o mesmo". Então a página adota a maior largura e o maior
     * respiro entre as origens, e toda seção que perdeu container entra nesse
     * eixo único.
     */
    const larguras = [...molduraPorOrigem.values()].map((m) => m.largura);
    const respiros = [
      ...[...molduraPorOrigem.values()].map((m) => m.respiro),
      ...[...containerPorOrigem.values()].map((r) => r.base),
    ];
    const largura = larguras.length > 0 ? Math.max(...larguras) : 1280;
    const respiroDesktop = respiros.length > 0 ? Math.max(...respiros) : 24;
    // No celular o respiro do desktop come metade da tela. O `min` mantém o
    // valor medido nas telas que o comportam e encolhe nas que não.
    concatCss += `:root{--pagina-largura:${largura}px;--pagina-respiro:min(${respiroDesktop}px,6vw)}\n`;
    for (const origem of origensComMoldura) {
      // O alvo é a seção que carrega o proxy DAQUELA origem — assim toda seção
      // dela entra no mesmo eixo, com marca de margem negativa ou sem.
      const alvo = `[data-secao]:has(>[data-ds-raiz="${origem}"])`;
      // `box-sizing:border-box` não é detalhe: sem ele a largura máxima vale
      // para a caixa de CONTEÚDO, o container sai com a largura + respiro dos
      // dois lados, e a peça que sangra de propósito (a nav, com margem
      // negativa) estoura para fora dele — na tela isso é uma barra cortada.
      concatCss += `${alvo}{display:block;box-sizing:border-box;max-width:var(--pagina-largura);margin-inline:auto;padding-inline:var(--pagina-respiro)}\n`;
    }
    const medidas = molduraPorOrigem.size;
    avisos.push(
      medidas > 0
        ? `Grid da página: ${largura}px de largura com ${respiroDesktop}px de respiro, MEDIDOS no mapa estrutural de ${medidas} origem(ns) — é onde a peça ficava antes de ser recortada. Todas as seções entram no mesmo eixo para o conteúdo não encostar na borda nem cada seção achar o próprio centro.`
        : `Margem negativa nas peças de ${containerPorOrigem.size} origem(ns) denuncia o container que elas tinham e a captura não trouxe: a página devolveu ${largura}px de largura e o respiro lateral a TODAS as seções dessas origens, para o conteúdo não encostar na borda da tela.`,
    );
  }

  // A camada HERDADA não traz a cor de fundo da origem: sem esta regra, a
  // página inteira nasce pintada com a cor do site de onde as peças vieram
  // (`bg-[#03020A]` num deles) e a marca perde a própria superfície.
  if (camadasHtml.includes('data-ds-camada-herdada')) {
    concatCss +=
      '[data-ds-camada-herdada]>[data-ds-raiz],[data-ds-camada-herdada] [data-ds-corpo]{background-color:transparent!important;background-image:none!important}\n';
    if (giroDoCanvas !== 0) {
      concatCss += `[data-ds-camada-herdada] canvas{filter:hue-rotate(${giroDoCanvas}deg)}\n`;
    }
  }

  // ── Mídia do projeto ──────────────────────────────────────────────────────
  for (const m of entrada.midia ?? []) {
    // Nada de sair da pasta de mídia nem da pasta do site: os dois lados vêm
    // de dado externo (o agente escreve o entrada.json à mão).
    if (m.de.split(/[\\/]/).includes('..') || m.para.split(/[\\/]/).includes('..')) {
      avisos.push(`Mídia com travessia de caminho ignorada: ${m.de} -> ${m.para}`);
      continue;
    }
    const origem = join(projectMediaDir(entrada.projectId), m.de);
    if (!existsSync(origem)) {
      avisos.push(`Mídia não encontrada no projeto: ${m.de}`);
      continue;
    }
    const destino = join(outputDir, m.para);
    mkdirSync(join(destino, '..'), { recursive: true });
    cpSync(origem, destino);
    arquivos.push(m.para);
  }

  // ── As logos da marca: o kit INTEIRO viaja com o site ─────────────────────
  // A marca automática gera as variações (principal, horizontal, símbolo,
  // clara, escura, favicon…) e distribui por local (`logosLocais`) — mas nada
  // disso chegava ao site: o autor copiava uma ou duas na mão e o resto morria
  // no painel. Aqui todas as variações existentes são copiadas para `midia/`
  // com nome estável (`logo-<tipo>.<ext>`), respeitando o que o autor já
  // copiou (mesma fonte não entra duas vezes; alvo ocupado não é sobrescrito).
  const alvoPorFonte = new Map<string, string>();
  for (const m of entrada.midia ?? []) {
    if (!alvoPorFonte.has(m.de)) alvoPorFonte.set(m.de, m.para);
  }
  const alvosOcupados = new Set(alvoPorFonte.values());
  const copiarLogo = (fonte: string, alvo: string): string | null => {
    const existente = alvoPorFonte.get(fonte);
    if (existente !== undefined) return existente;
    if (fonte.split(/[\\/]/).includes('..') || alvosOcupados.has(alvo)) return null;
    const origem = join(projectMediaDir(entrada.projectId), fonte);
    if (!existsSync(origem)) {
      avisos.push(`Logo da marca não encontrada no projeto: ${fonte}`);
      return null;
    }
    const destino = join(outputDir, alvo);
    mkdirSync(join(destino, '..'), { recursive: true });
    cpSync(origem, destino);
    arquivos.push(alvo);
    alvoPorFonte.set(fonte, alvo);
    alvosOcupados.add(alvo);
    return alvo;
  };
  for (const logo of entrada.branding.logos ?? []) {
    const ext = (logo.path.split('.').pop() ?? 'svg').toLowerCase();
    copiarLogo(logo.path, `midia/logo-${logo.tipo}.${ext}`);
  }
  // O favicon: a variação do local `favicon`, com os legados como degrau.
  const fonteDoFavicon =
    entrada.branding.logosLocais?.favicon ??
    entrada.branding.faviconPath ??
    entrada.branding.logoPath ??
    null;
  let faviconHref: string | null = null;
  if (fonteDoFavicon !== null) {
    const ext = (fonteDoFavicon.split('.').pop() ?? 'svg').toLowerCase();
    faviconHref =
      alvoPorFonte.get(fonteDoFavicon) ?? copiarLogo(fonteDoFavicon, `midia/logo-favicon.${ext}`);
  }
  if (faviconHref === null) {
    avisos.push('O site saiu sem favicon: a marca do projeto não tem logo nenhuma gravada.');
  }

  // ── As quatro folhas, na ordem da cascata ─────────────────────────────────
  // ESQUELETO (peças, escopado e recolorido) → CRIADAS (as seções do agente)
  // → RESPONSIVO (vence larguras fixas só no mobile) → MARCA (a identidade por
  // último, vencendo sem !important — e agora com o que vencer, porque a
  // recoloração criou os pontos de consumo).
  const escrever = (rel: string, conteudo: string): void => {
    writeFileSync(join(outputDir, rel), conteudo, 'utf8');
    arquivos.push(rel);
  };
  escrever('assets/styles.css', concatCss);
  escrever('assets/criadas.css', entrada.cssCriado ?? '/* nenhuma seção criada */');
  escrever(
    'assets/responsivo.css',
    entrada.responsivoExtra === undefined
      ? cssResponsivoBase()
      : `${cssResponsivoBase()}\n\n/* deste site */\n${entrada.responsivoExtra}`,
  );
  // A régua da referência vira `--marca-passo-N` e `--marca-espaco-N` aqui, e é
  // o que as peças reescritas acima consomem. Sem referência, `buildBrandingCss`
  // sai idêntico ao de antes: nenhum token novo, nenhuma mudança de aparência.
  escrever('assets/marca.css', buildBrandingCss(entrada.branding, referencia?.escala));

  const fontImportUrl = buildTypographyCss(entrada.branding.typography).importUrl;
  const fontLinks = fontImportUrl
    ? `<link rel="preconnect" href="https://fonts.googleapis.com"/>\n<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin/>\n<link rel="stylesheet" href="${fontImportUrl}"/>\n`
    : '';
  // Locais primeiro (na ordem da primeira aparição), remotos depois — a mesma
  // ordem relativa que a página tinha quando cada peça carregava as próprias
  // tags inline e os remotos fechavam o body.
  const scriptsHtml = [
    ...scriptsLocais,
    ...scriptsRemotos.map((s) => `<script src="${s}"></script>`),
  ].join('\n');

  /**
   * O título da aba é o NOME DA MARCA, e nada mais.
   *
   * A aba é onde a marca aparece quando o site não está à vista, e ali cabem
   * poucos caracteres: "Café da Estação · cafeteria em São Paulo" chega ao
   * usuário como "Café da Estação · cafeteria em S…". O que o `titulo` da
   * entrada traz é o nome do PROJETO, útil no estúdio e ruído no navegador —
   * por isso a decisão é do compositor, e não de quem escreve o criativo: vale
   * para todo site gerado, sem depender de alguém lembrar.
   */
  const tituloDaAba = entrada.branding.brandName?.trim() || entrada.titulo;

  const faviconLink =
    faviconHref === null
      ? ''
      : `<link rel="icon"${faviconHref.endsWith('.svg') ? ' type="image/svg+xml"' : ''} href="${faviconHref}"/>\n`;
  /**
   * O movimento devolvido: as classes de revelação saem, e o observador reage.
   *
   * Roda AQUI, e não peça a peça, porque a prova é da PÁGINA: o script que
   * reaplica a classe pode ter vindo de outra peça da mesma origem, e no
   * momento em que a peça foi processada ele ainda não tinha sido coletado.
   */
  const revelacao = limparEstadoRevelado(`${camadasHtml}${bodyHtml}`, corpoDosScriptsLocais);
  if (revelacao.limpas > 0) {
    avisos.push(
      `Movimento devolvido: ${revelacao.limpas} elemento(s) tinham a classe de revelação (${revelacao.classes.join(', ')}) já aplicada pela captura — o observador de rolagem viajou junto e não tinha o que revelar. Eles voltam ao estado inicial e a página se anima ao rolar.`,
    );
  }
  const finalHtml = `<!doctype html>
<html lang="${entrada.lang ?? 'pt-BR'}">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1.0"/>
<title>${tituloDaAba}</title>
${faviconLink}${fontLinks}<link rel="stylesheet" href="assets/styles.css"/>
<link rel="stylesheet" href="assets/criadas.css"/>
<link rel="stylesheet" href="assets/responsivo.css"/>
<link rel="stylesheet" href="assets/marca.css"/>
</head>
<body>${revelacao.html}${comportamentoHtml}
${scriptsHtml}
</body>
</html>`;
  escrever('index.html', finalHtml);

  /**
   * O site entregue tem de SOBREVIVER SOZINHO — e isto confere, não presume.
   *
   * O dono foi direto: "os sites que já foram gerados têm que ser independentes,
   * pois já foram gerados e não dependem mais dos componentes, já que está em
   * disco". Ele está certo, e a montagem já copiava tudo — mas isso era um
   * acidente feliz. Apagar um kit, uma peça da Biblioteca ou reextrair uma
   * origem não pode quebrar um site que já foi entregue ao cliente, e a única
   * forma de garantir é olhar o resultado.
   *
   * A conferência é o que se pode conferir sem rede: toda referência do HTML
   * final tem de ser relativa ao próprio site e existir em disco. O que aponta
   * para fora — CDN de fonte, `mailto:`, `tel:` — é declarado, porque é decisão
   * de desenho, não descuido: uma fonte do Google é um endereço que o site
   * carrega, e quem entrega precisa saber disso.
   */
  // `listarAssetsFaltando` é a MESMA regra que valida a extração — e é a regra
  // certa porque já sabe a distinção que custou caro aprender: `<a href="/home">`
  // é navegação, não arquivo. Duplicar o laço aqui repetiria o engano (o
  // primeiro rascunho reprovou o próprio teste por causa de um `<a>`).
  const pendentesEmDisco = listarAssetsFaltando(outputDir, finalHtml);
  const dependenciasExternas: string[] = [];
  for (const m of finalHtml.matchAll(/<[a-z][\w-]*\b[^>]*?\s(?:href|src)\s*=\s*"([^"]+)"/gi)) {
    const ref = m[1];
    if (ref === undefined || !/^(?:https?:)?\/\//i.test(ref)) continue;
    if (!dependenciasExternas.includes(ref)) dependenciasExternas.push(ref);
  }
  if (pendentesEmDisco.length > 0) {
    avisos.push(
      `O site NÃO está fechado em si: ${pendentesEmDisco.length} referência(s) apontam para arquivo que não foi copiado (${pendentesEmDisco.slice(0, 3).join(', ')}). Ele quebra se a peça de origem sair do disco.`,
    );
  }
  if (dependenciasExternas.length > 0) {
    avisos.push(
      `O site carrega ${dependenciasExternas.length} endereço(s) da internet (${dependenciasExternas.slice(0, 2).join(', ')}): funciona offline no resto, mas isto depende de rede.`,
    );
  }

  return {
    outputDir,
    arquivos,
    avisos,
    faltando,
    recoloracao: recoloracaoTotais,
    retipografia: retipografiaTotais,
    reescala: reescalaTotais,
    independente: {
      fechadoEmSi: pendentesEmDisco.length === 0,
      pendentes: pendentesEmDisco,
      externas: dependenciasExternas,
    },
  };
};
