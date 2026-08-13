import { createHash } from 'node:crypto';
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import {
  type MapaDeRecoloracao,
  type ReguasDeEscala,
  type Retema,
  atributosDeProxy,
  coresDoValor,
  corrigirParesDeCor,
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
  soltarAncestraisAusentes,
  tokensDeMovimento,
} from '@ds/composer';
import {
  type KitComponenteDeGeracao,
  KitDesignSystem,
  type ProjectBranding,
  type ProjectLayout,
  type ResultadoDeAceite,
  buildTypographyCss,
  conferirSiteGerado,
  distribuirTokens,
  ehPecaDeFundo,
  escalaDeReferencia,
  listarAssetsFaltando,
  projectGeneratedVersionDir,
  projectMediaDir,
  rastreamentoDeTerceiro,
  reguasParaOrigem,
  resolverSecoes,
  separarCamadasDePagina,
  separarComportamentosDaPagina,
  vaultCaptureV2Dir,
} from '@ds/shared';
import { SCRIPT_DAS_ABAS, cssDasAbas, temAbasCriadas } from './abas-da-pagina.js';
import { lerCssDoBundle } from './cascata.js';
import {
  CSS_DO_ALTERNADOR,
  type EstadoDerivado,
  SCRIPT_DO_ALTERNADOR,
  avisosDosEstados,
  derivarEstados,
  lerEstadosDoBundle,
  podarEstadosJaVivos,
} from './estados.js';
import { buildBrandingCss } from './index.js';
import {
  PISO_DE_LETRA_MOVEL,
  REGRA_DA_LISTA_SUSPENSA,
  REGRA_DA_TINTA_DA_MARCA,
  REGRA_QUE_ABRE_PASSAGEM,
  acenderLetraMiuda,
  acenderOpacidadeCongelada,
  alvosDoComportamento,
  ancorarNavNasSecoes,
  atributosDoDocumentoDaPeca,
  comportamentoAlcancaAPagina,
  destravarOpacidadeSemRevelador,
  envolverCamadaDePagina,
  envolverSecao,
  extrairCamadasDeFundo,
  extrairCorpo,
  limparEstadoRevelado,
  limparParaComposicao,
  limparTransformCongelado,
  reescreverRefsCss,
  reescreverRefsHtml,
  removerMarcasDeTerceiro,
  soltarRaizDaSecaoNoFluxo,
  trocarMonogramaDaOrigem,
} from './montagem.js';
import {
  SCRIPT_DA_REDE_DE_SEGURANCA,
  SCRIPT_DA_REVELACAO,
  cssDaRevelacao,
  destravarRevelacaoSemGatilho,
  marcarAlvosDeRevelacao,
} from './movimento-da-pagina.js';
import { removerScriptsQueCompilamCss } from './pecas.js';
import { cssResponsivoBase } from './responsivo.js';
import { criarSecaoNoEstilo, cssDasSecoesCriadas } from './secoes-no-estilo.js';

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
  /**
   * O texto que cada ESTADO capturado desta seção mostra quando ligado, por id
   * de estado (`st_1`, `st_2`…). Só é lido quando o estado muda TEXTO, e existe
   * por uma razão só: o texto da origem NUNCA viaja. Sem esta entrada o estado
   * cai com `precisa-texto`, e isso é melhor que injetar a palavra que a outra
   * empresa escreveu.
   */
  estados?: Record<string, { rotulo?: string; texto?: string }>;
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
  /**
   * `prototipo` libera placeholder MARCADO nas seções construídas de depoimento,
   * números e logos; `entrega` (o padrão) recusa e declara o motivo.
   *
   * A distinção é do dono: *"pode colocar dados de placeholder, esses sites são
   * só protótipos, não é para cliente final"*. O padrão é `entrega` porque é o
   * modo em que o erro custa caro — site no ar com depoimento inventado é
   * problema do cliente, não do motor.
   */
  modoDeConteudo?: 'prototipo' | 'entrega';
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
  /**
   * O veredito da regra de aceite do site (`docs/regras-de-aceite.md`).
   *
   * `aprovado: false` significa DEFEITO — conserte o motor antes de entregar.
   * `comPendencia: true` significa limite declarado: pode subir, mas vai para a
   * tela de pendências com o motivo.
   */
  aceite: ResultadoDeAceite;
};

/**
 * Troca cada chave pelo valor em TODAS as ocorrências; o que não casar vira aviso.
 *
 * Trocava só a primeira, e isso deixava rastro de outra empresa na página. Medido
 * numa faixa de cartões: "KRAFTON" aparecia quatro vezes, o criativo mandou
 * trocar, e três ficaram — o site do cliente saiu com o nome de uma empresa de
 * games repetido três vezes, sem nada avisar. A regra S2 não pega isso, porque
 * ali não é o nome da ORIGEM: é o conteúdo que a origem exibia.
 *
 * Quem quiser textos DIFERENTES para trechos iguais continua conseguindo: basta
 * a chave carregar o contexto que os distingue (a tag em volta, o número ao
 * lado), e aí ela deixa de ser igual. O padrão passa a ser o que quase sempre se
 * quis dizer — "troque isto por aquilo" —, e o caso raro é que pede o trabalho
 * extra, não o comum.
 */
const aplicarSubstituicoes = (
  html: string,
  substituicoes: Record<string, string> | undefined,
  avisos: string[],
  rotulo: string,
): string => {
  if (substituicoes === undefined) return html;
  let saida = html;
  for (const [de, para] of Object.entries(substituicoes)) {
    if (!saida.includes(de)) {
      avisos.push(
        `[${rotulo}] uma substituição não casou (o HTML de origem não contém o trecho que começa com "${de.slice(0, 60)}").`,
      );
      continue;
    }
    saida = saida.split(de).join(para);
  }
  return saida;
};

/**
 * A cor que a FOLHA dá ao `body` — a página da origem, quando ela mora no CSS.
 *
 * Vale a PRIMEIRA regra que pinta o body com cor opaca, e não a última: a
 * declaração base vem antes das variações, então `@media (prefers-color-scheme:
 * dark){body{background:#000}}` num site claro não inverte o tema lido aqui.
 *
 * Alfa < 1 não define página: por baixo de um fundo translúcido ainda há o que
 * pintar, e o tema é do que está embaixo.
 *
 * Isto lê TEMA (claro ou escuro), não renderização exata — por isso não vale
 * reimplementar a cascata: `body` como elemento inteiro basta, e `.body-x` ou
 * `#body` não são a página.
 */
/**
 * O valor de uma custom property declarada na própria folha da origem.
 *
 * Sites escritos à mão guardam a cor de página numa variável
 * (`body{background:var(--bg-0)}` com `:root{--bg-0:#07070a}`), e sem resolver
 * isso a leitura devolve nada. Medido no acervo: 49 das 270 falhas de leitura
 * são exatamente esta forma (`--bg-0` 33, `--bg-base` 11, `--c-bg` 5).
 *
 * Segue a cadeia até três saltos: uma variável que aponta para outra é comum, e
 * um ciclo travaria o laço.
 */
const valorDaVariavel = (css: string, nome: string, saltos = 3): string | null => {
  if (saltos <= 0) return null;
  const esc = nome.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const m = new RegExp(`${esc}\\s*:\\s*([^;}]+)`, 'i').exec(css);
  const bruto = m?.[1]?.trim();
  if (bruto === undefined) return null;
  const encadeada = /var\(\s*(--[\w-]+)/.exec(bruto);
  if (encadeada?.[1] !== undefined) return valorDaVariavel(css, encadeada[1], saltos - 1);
  return bruto;
};

/** A primeira cor OPACA de um valor de declaração, resolvendo `var()`. */
const corOpacaDoValor = (valor: string, css: string): string | null => {
  const direta = coresDoValor(valor).find((c) => c.alfa === undefined);
  if (direta !== undefined) return direta.hexOpaco;
  const v = /var\(\s*(--[\w-]+)/.exec(valor);
  if (v?.[1] === undefined) return null;
  const resolvido = valorDaVariavel(css, v[1]);
  if (resolvido === null) return null;
  return coresDoValor(resolvido).find((c) => c.alfa === undefined)?.hexOpaco ?? null;
};

const corDePaginaNoCss = (css: string): string | null => {
  const regra = /([^{}]*)\{([^{}]*)\}/g;
  let m = regra.exec(css);
  while (m !== null) {
    const seletor = m[1] ?? '';
    const declaracoes = m[2] ?? '';
    // `html` conta tanto quanto `body`: é dele que a página herda o fundo
    // quando o `body` não declara nada, e é onde 203 das 270 falhas moram.
    if (/(^|[\s,>+~])(body|html)(?![\w-])/i.test(seletor)) {
      for (const d of declaracoes.split(';')) {
        const i = d.indexOf(':');
        if (i < 0) continue;
        const prop = d.slice(0, i).trim().toLowerCase();
        if (prop !== 'background' && prop !== 'background-color') continue;
        const opaca = corOpacaDoValor(d.slice(i + 1), css);
        if (opaca !== null) return opaca;
      }
    }
    m = regra.exec(css);
  }
  return null;
};

/**
 * A cor de PÁGINA de uma origem: a superfície sobre a qual ela foi desenhada.
 *
 * Duas fontes, nesta ordem, porque duas sintaxes guardam o mesmo fato:
 *
 * 1. `bg-[#hex]` na tag `<body>` — o idioma do Tailwind arbitrário;
 * 2. `body { background(-color): ... }` na folha — onde um site escrito à mão
 *    põe a cor da página.
 *
 * Ler só a primeira foi o defeito medido no site do clube, e ele custou 14
 * trechos ilegíveis num site só. A origem `green-museum` é de tema CLARO e
 * declara `body{background-color:#E6E3D6}` no CSS, sem nada na tag — então o
 * tema dela saía DESCONHECIDO. E desconhecido caía no regime "os temas
 * combinam", que é o único internamente INCOERENTE: ele mantém a superfície da
 * origem e mesmo assim resgata o texto para a tinta da marca. Metade da
 * migração. Na tela: tinta clara da marca sobre o cartão creme da origem.
 *
 * Por isso a leitura precisa cobrir as duas sintaxes — e quando nenhuma
 * responde, quem chama tem de DIZER que não soube, em vez de seguir com um
 * palpite calado.
 */
export const corDePaginaDaOrigem = (
  attrsBody: string | undefined,
  css?: string,
  attrsHtml?: string,
): string | null => {
  /**
   * CINCO idiomas, e a leitura falhava em três deles.
   *
   * Medido sobre os 425 trechos que a regra S4 reprovou nos 20 sites de prova:
   * **270 (64%) vinham de a cor de página não ter sido lida**. Sem cor, o motor
   * não conclui "tema oposto" — conclui NADA, e o silêncio caía no regime
   * "temas combinam", que congela a superfície da origem e mesmo assim resgata
   * o texto para a tinta da marca. Meia migração: tinta clara sobre cartão
   * creme.
   *
   * Onde a cor realmente morava naquelas 270:
   *
   * | onde | falhas |
   * |---|---|
   * | `class="bg-[#hex]"` na tag `<html>` (não no `<body>`) | 203 |
   * | `body{background:var(--bg-0)}` com a variável na folha | 49 |
   * | classe nomeada (`bg-white`, `bg-background`) no body/html | 18 |
   *
   * Das 270, **268 se resolvem só com isto**: a tinta já medida passa de 3:1
   * contra a superfície certa. Não é preciso tocar no texto.
   *
   * A ordem para na primeira que responde, e a tag vence a folha: quem escreveu
   * a classe na tag decidiu ali.
   */
  const naTag = (attrs: string | undefined): string | null => {
    if (attrs === undefined) return null;
    const m = /bg-\[(#(?:[0-9a-f]{3}|[0-9a-f]{6}))\]/i.exec(attrs);
    return m?.[1] ?? null;
  };
  const doBody = naTag(attrsBody);
  if (doBody !== null) return doBody;
  const doHtml = naTag(attrsHtml);
  if (doHtml !== null) return doHtml;

  const folha = css === undefined ? '' : css;
  if (folha.trim().length === 0) return null;

  const naFolha = corDePaginaNoCss(folha);
  if (naFolha !== null) return naFolha;

  /**
   * Último idioma: a classe NOMEADA na tag, resolvida na folha.
   *
   * `<body class="bg-white">` não diz cor nenhuma sozinho — quem diz é
   * `.bg-white{background-color:#fff}` lá embaixo. São 18 das 270.
   */
  for (const attrs of [attrsBody, attrsHtml]) {
    if (attrs === undefined) continue;
    const classes = /\bclass="([^"]*)"/i.exec(attrs)?.[1] ?? '';
    for (const c of classes.split(/\s+/).filter((x) => /^bg-[\w-]+$/.test(x))) {
      const esc = c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regra = new RegExp(`\\.${esc}(?![\\w-])[^{}]*\\{([^{}]*)\\}`, 'i').exec(folha);
      const corpo = regra?.[1];
      if (corpo === undefined) continue;
      for (const d of corpo.split(';')) {
        const i = d.indexOf(':');
        if (i < 0) continue;
        const prop = d.slice(0, i).trim().toLowerCase();
        if (prop !== 'background' && prop !== 'background-color') continue;
        const opaca = corOpacaDoValor(d.slice(i + 1), folha);
        if (opaca !== null) return opaca;
      }
    }
  }
  return null;
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

/**
 * A vaga de FOTO que recebe um VÍDEO.
 *
 * Até aqui a troca era estritamente preservadora de tipo: `<img>` virava
 * `<img>`, `<video>` virava `<video>`, e não havia caminho nenhum de um para o
 * outro. Isso deixava o pedido do dono sem via — *"em componentes que tem
 * espaço para midia, vc se ver que da para encaixar um video de forma harmonica
 * e bonita, vc pode gerar um video"* —, porque a peça capturada quase nunca traz
 * um `<video>`: ela traz `<img>`.
 *
 * A decisão de QUE vaga comporta vídeo não mora aqui, e é de propósito: ela é do
 * criativo, que olha a página e ancora um `kind: 'video'` naquela seção. Aqui
 * mora só o mecanismo — quando a seção tem vídeo sobrando e nenhuma tag
 * `<video>` para recebê-lo, a primeira foto de origem ainda não trocada vira o
 * vídeo.
 *
 * **Sempre `muted` e `playsInline`.** Sem os dois, o navegador do celular
 * RECUSA o autoplay e o que aparece é um retângulo preto — pior que a foto que
 * estava ali. `loop` porque vídeo ambiente que para no fim deixa a seção morta,
 * e `poster` com a foto que ele substituiu, para o primeiro quadro não ser
 * vazio enquanto carrega.
 */
const trocarFotoPorVideo = (
  html: string,
  cmpId: string,
  videos: readonly string[],
  capa: string | undefined,
): { html: string; usados: number } => {
  /**
   * A vaga tem de ser GRANDE — "a primeira que aparecer" produziu um absurdo.
   *
   * Medido no site do clube: o vídeo de estádio de 8 segundos foi parar num
   * `w-10 h-10 rounded-full grayscale`, que é o avatar de 40px do depoimento.
   * Vídeo ali não é decisão de desenho, é acidente.
   *
   * A marcação diz o tamanho, e é dela que sai a régua: uma medida pequena
   * declarada (`w-10`, `h-8`…) desqualifica a vaga, e `w-full`, `h-full`,
   * `inset-0`, `aspect-` ou `object-cover` qualificam. Sem nenhum dos dois
   * sinais a vaga é ACEITA — a peça pode dimensionar por CSS próprio, e recusar
   * por falta de pista deixaria o vídeo de fora justamente nas peças bem
   * escritas.
   */
  const vagaComporta = (classes: string): boolean => {
    if (/\b[wh]-(?:[1-9]|1[0-6])\b/.test(classes)) return false;
    if (/\brounded-full\b/.test(classes) && !/\b(?:w-full|h-full|inset-0)\b/.test(classes)) {
      return false;
    }
    return true;
  };

  let usados = 0;
  const saida = html.replace(/<img\b[^>]*>/gi, (tag) => {
    if (usados >= videos.length) return tag;
    const src = /\bsrc\s*=\s*"([^"]+)"/i.exec(tag)?.[1];
    if (src === undefined || !src.startsWith(`assets/${cmpId}/`)) return tag;
    if (src.includes('/frames/')) return tag;
    // As classes da `<img>` viajam: é delas que vem o tamanho, o recorte e o
    // arredondamento da vaga. Vídeo sem elas sai fora da moldura.
    const classes = /\bclass\s*=\s*"([^"]*)"/i.exec(tag)?.[1] ?? '';
    if (!vagaComporta(classes)) return tag;
    const novo = videos[usados];
    if (novo === undefined) return tag;
    usados += 1;
    const classe = classes === '' ? '' : ` class="${classes}"`;
    /**
     * A capa vem da MÍDIA DO PROJETO, nunca do asset da origem.
     *
     * Usar a foto que estava ali seria devolver a imagem de outra empresa como
     * primeiro quadro do vídeo — o mesmo vazamento que a troca de mídia existe
     * para fechar. Sem capa do projeto, melhor sem capa nenhuma.
     */
    const poster = capa === undefined ? '' : ` poster="${capa}"`;
    return `<video${classe} src="${novo}"${poster} autoplay loop muted playsinline></video>`;
  });
  return { html: saida, usados };
};

/**
 * Palavras que aparecem em endereço de site e não são nome de marca.
 *
 * Sem esta lista, `design-studio.example.com` mandaria trocar "design" e
 * "studio" pelo nome do cliente, e o site sairia com "Sorriso Vivo System" no
 * lugar de "Design System". A régua é: só troca o que só pode ser um nome
 * próprio.
 */
const NAO_E_NOME_DE_MARCA = new Set([
  'design',
  'system',
  'systems',
  'studio',
  'agency',
  'digital',
  'visual',
  'creative',
  'media',
  'labs',
  'tech',
  'landing',
  'template',
  'theme',
  'demo',
  'preview',
  'site',
  'website',
  'page',
  'aura',
  'build',
  'academy',
  'shop',
  'store',
  'online',
  'group',
  'company',
  'solutions',
  'services',
  'global',
  'world',
  'brasil',
  'brazil',
]);

/**
 * O nome da EMPRESA DE ORIGEM, deduzido do endereço que o bundle guarda.
 *
 * O dono viu "CANVAS" em letras gigantes no rodapé do site de uma clínica, e
 * "© 2024 CANVAS SYSTEMS" embaixo. O kit empresta o desenho; o nome da outra
 * empresa não pode ir junto — e a regra S2 dizia isso mas só conferia foto e
 * vídeo, nunca texto.
 *
 * O endereço é a fonte certa porque existe em toda captura e não depende de
 * ninguém ter preenchido nada: `canvas-visual.aura.build` entrega `canvas`.
 * Palavra genérica de domínio fica de fora, e menos de quatro letras também —
 * trocar "app" ou "co" espalharia estrago pelo texto inteiro.
 */
/**
 * Terminações que fazem de um trecho de caminho um ARQUIVO, não um domínio.
 *
 * `style.css` tem a mesma forma de `marca.com`, e daria "style" como nome de
 * empresa — trocado no texto inteiro, seria um estrago difícil de rastrear até
 * aqui.
 */
const EXTENSOES = new Set([
  'html',
  'htm',
  'css',
  'js',
  'mjs',
  'json',
  'php',
  'asp',
  'aspx',
  'jsp',
  'xml',
  'txt',
  'md',
  'png',
  'jpg',
  'jpeg',
  'svg',
  'webp',
  'gif',
  'avif',
  'pdf',
  'ico',
  'woff',
  'woff2',
  'mp4',
  'webm',
]);

/** O trecho tem cara de domínio (`canvas-visual.aura.build`) e não de arquivo? */
const pareceDominio = (trecho: string): boolean => {
  if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(trecho)) return false;
  const fim = trecho.split('.').at(-1)?.toLowerCase() ?? '';
  return fim.length >= 2 && !EXTENSOES.has(fim);
};

const nomesDaOrigem = (bundlePath: string): string[] => {
  try {
    const caminho = join(bundlePath, 'manifest.json');
    if (!existsSync(caminho)) return [];
    const m = JSON.parse(readFileSync(caminho, 'utf8')) as { source?: { url?: string } };
    const url = m.source?.url;
    if (url === undefined) return [];
    const u = new URL(url);
    /**
     * O acervo não veio dos sites: veio de um CATÁLOGO que guarda cada um deles
     * numa pasta com o nome do domínio original. O endereço da peça é
     * `ds.asimov.academy/1_temas_escuros/canvas-visual.aura.build/design-system`
     * — o host é o catálogo, e a marca está no CAMINHO.
     *
     * Medido: 246 das 288 peças da Biblioteca são assim. Lendo só o host, a
     * troca não achava nome em 85% do acervo e não fazia nada — foi por essa
     * fresta que "CANVAS" chegou ao rodapé do site da clínica com a troca já
     * ligada. Havendo domínio no caminho, ele MANDA: o host, ali, é quem
     * hospeda a cópia, e trocar "asimov" pelo nome do cliente seria trocar o
     * nome do arquivista.
     */
    const doCaminho = u.pathname.split('/').find(pareceDominio);
    const dominio = doCaminho ?? u.hostname;
    /**
     * O rótulo mais específico do domínio é o primeiro — depois de pular o
     * SUBDOMÍNIO de serviço.
     *
     * `dominio.split('.')[0]` cru devolve "www" em `www.marca.com` e "app" em
     * `app.sanok.design`: o nome da marca é o rótulo SEGUINTE. Trocar "www"
     * pelo nome do cliente não faz nada, e é por essa fresta que nomes de
     * origem sobreviveram no site gerado.
     */
    const SUBDOMINIO_DE_SERVICO = new Set([
      'www',
      'app',
      'web',
      'site',
      'demo',
      'preview',
      'staging',
      'dev',
      'test',
      'cdn',
      'static',
      'assets',
    ]);
    const partes = dominio.split('.').filter(Boolean);
    const rotulo =
      partes.find((p) => !SUBDOMINIO_DE_SERVICO.has(p.toLowerCase())) ?? partes[0] ?? '';

    const pedacos = rotulo.split(/[-_]/).filter((t) => t.length >= 4);
    const nomes = new Set(pedacos.filter((t) => !NAO_E_NOME_DE_MARCA.has(t.toLowerCase())));

    /**
     * O rótulo COLADO precisa casar com o nome ESPAÇADO da tela.
     *
     * `humanacademy.com` vira um token só, e a página escreve "Human Academy".
     * `\bhumanacademy\b` não casa com isso, e o nome da outra empresa fica no
     * site do cliente — foi um dos que o dono achou.
     *
     * Quando o rótulo TERMINA numa palavra que já sabemos não ser marca
     * (`academy`, `studio`, `design`…), a fronteira está achada: o resto é o
     * nome, e o par vira um padrão que tolera separador no meio.
     */
    if (pedacos.length === 1) {
      const colado = (pedacos[0] ?? '').toLowerCase();
      for (const sufixo of NAO_E_NOME_DE_MARCA) {
        if (sufixo.length < 4 || !colado.endsWith(sufixo)) continue;
        const cabeca = colado.slice(0, -sufixo.length);
        if (cabeca.length < 3) continue;
        // `[\s._-]*` entre as duas metades: casa "humanacademy", "Human Academy"
        // e "human-academy" com o mesmo padrão.
        nomes.add(`${cabeca}[\\s._-]*${sufixo}`);
        break;
      }
    }
    return [...nomes];
  } catch {
    return [];
  }
};

/**
 * Atributos que a pessoa LÊ ou OUVE.
 *
 * `alt` é lido em voz alta pelo leitor de tela e aparece quando a foto não
 * carrega; `title` vira balão ao parar o mouse; `placeholder` fica dentro do
 * campo; `content` de `<meta>` é o que o buscador mostra. Nome de outra empresa
 * em qualquer um deles é o mesmo defeito do rodapé, só que mais escondido.
 *
 * Os demais atributos são maquinaria: `class`, `id`, `src`, `href`. Reescrevê-los
 * quebraria o CSS e os links.
 */
const ATRIBUTOS_VISIVEIS = new Set(['alt', 'title', 'aria-label', 'placeholder', 'content']);

/**
 * Percorre o documento separando o que a pessoa LÊ do que é maquinaria.
 *
 * A troca e a conferência precisam enxergar exatamente a mesma coisa. Se a troca
 * pula o endereço dentro de um `content` de `og:url` e a conferência não
 * pulasse, todo site reprovaria por um nome que ninguém vê — a regra viraria
 * ruído e alguém aprenderia a ignorá-la. Por isso as duas passam por aqui, em
 * vez de cada uma manter a própria régua.
 *
 * `transformar` recebe cada trecho visível e devolve o que fica no lugar; quem
 * só quer LER devolve o trecho intacto e anota o que viu.
 */
const percorrerTextoVisivel = (html: string, transformar: (trecho: string) => string): string =>
  html.replace(
    /(<script\b[\s\S]*?<\/script>|<style\b[\s\S]*?<\/style>)|(<[^>]*>)|([^<]+)/gi,
    (inteiro, bloco: string | undefined, tag: string | undefined, texto: string | undefined) => {
      if (bloco !== undefined) return inteiro;
      if (texto !== undefined) return transformar(texto);
      if (tag === undefined) return inteiro;
      return tag.replace(
        /\b([a-zA-Z-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g,
        (todo, attr: string, dupla: string | undefined, simples: string | undefined) => {
          if (!ATRIBUTOS_VISIVEIS.has(attr.toLowerCase())) return todo;
          const valor = dupla ?? simples ?? '';
          // Barra dentro do valor quer dizer endereço, não frase: trocar ali
          // corromperia o link em vez de limpar o texto.
          if (valor.includes('/')) return todo;
          const novo = transformar(valor);
          if (novo === valor) return todo;
          const aspas = dupla !== undefined ? '"' : "'";
          return `${attr}=${aspas}${novo}${aspas}`;
        },
      );
    },
  );

/**
 * Troca o nome da origem pelo da marca, respeitando a CAIXA de cada ocorrência.
 *
 * `CANVAS` vira `SORRISO VIVO`, `Canvas` vira `Sorriso Vivo`, `canvas` vira
 * `sorriso vivo`. Sem isso o rodapé em versalete sairia com uma palavra em caixa
 * mista no meio, e a troca ficaria mais visível que o problema.
 *
 * Só toca no que a pessoa lê — nunca em script, estilo ou atributo de máquina.
 * Um nome de classe como `canvas-grid` ou a tag `<canvas>` não são o nome da
 * empresa, e reescrevê-los quebraria o CSS e o desenho.
 */
const trocarNomeDaOrigem = (
  html: string,
  nomes: readonly string[],
  marca: string,
): { html: string; trocas: number } => {
  if (nomes.length === 0 || marca.trim() === '') return { html, trocas: 0 };
  let trocas = 0;
  const naCaixaDe = (original: string): string => {
    if (original === original.toUpperCase()) return marca.toUpperCase();
    if (original[0] === original[0]?.toUpperCase()) return marca;
    return marca.toLowerCase();
  };
  /**
   * A marca REPETIDA lado a lado vira uma só.
   *
   * `nomesDaOrigem` quebra o rótulo do domínio em tokens: `sanok-design` vira
   * `['sanok', 'design']`. O logotipo da origem escreve os dois juntos —
   * "sanok.design", "canvas visual" — e cada token vira a marca, então sai
   * `MARCA.MARCA` ou `MARCA MARCA`. O dono fotografou isso em quatro sites, e
   * num deles TRIPLICADO ("PROVA ADVOCACIA E CONSULTORIA" três vezes).
   *
   * A colagem é o sinal: dois nomes de marca encostados, com nada entre eles
   * além de pontuação de junção, não foram escritos assim por ninguém. Texto
   * legítimo que repete a marca traz palavra no meio, e aí a expressão não casa.
   */
  const escapado = marca.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const repetida = new RegExp(`(${escapado})(?:[\\s.·|/–—-]*\\1)+`, 'gi');

  const saida = percorrerTextoVisivel(html, (trecho) => {
    let t = trecho;
    for (const nome of nomes) {
      t = t.replace(new RegExp(`\\b${nome}\\b`, 'gi'), (m) => {
        trocas += 1;
        return naCaixaDe(m);
      });
    }
    return t.replace(repetida, '$1');
  });
  return { html: saida, trocas };
};

/**
 * Os nomes de origem que SOBRARAM no que a pessoa lê. Alimenta a regra S2.
 *
 * A troca acontece peça a peça, com os nomes daquela origem. Esta varredura
 * roda uma vez, no site pronto, com a união de todos eles — é a diferença entre
 * "eu tentei" e "não ficou nenhum". Sem marca preenchida a troca não tem para
 * que trocar, e é justamente aí que a regra precisa falar.
 */
const nomesQueSobraram = (html: string, nomes: readonly string[]): string[] => {
  if (nomes.length === 0) return [];
  const achados = new Set<string>();
  percorrerTextoVisivel(html, (trecho) => {
    for (const nome of nomes) {
      if (new RegExp(`\\b${nome}\\b`, 'i').test(trecho)) achados.add(nome);
    }
    return trecho;
  });
  return [...achados];
};

/**
 * As três constantes e a régua do rastreamento moram em `@ds/shared`.
 *
 * Elas nasceram aqui e rodavam tarde demais: na montagem da página, quando a
 * peça já tinha entrado no kit e o site já era do cliente. A curadoria — que
 * roda com o bundle EM DISCO — precisa da MESMA régua para recusar antes, e
 * duas cópias divergiriam na primeira regex nova. Ver `shared/rastreamento.ts`.
 */

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
      // A folha entra na leitura do tema: um site escrito à mão guarda a cor da
      // página em `body{background}`, não numa classe do Tailwind na tag.
      // O `.html` já vinha de `atributosDoDocumentoDaPeca` e era jogado fora:
      // 203 das 270 falhas de leitura tinham a cor exatamente ali.
      const attrs = atributosDoDocumentoDaPeca(readFileSync(indexPath, 'utf8'));
      const cor = corDePaginaDaOrigem(attrs.body, lerCssDoBundle(cmp.bundlePath).css, attrs.html);
      const lum = cor === null ? null : luminancia(cor);
      const oposto = lum !== null && Math.abs(lumDaMarca - lum) > 0.4;
      if (oposto) origensComFundoOposto.add(origem);
      /**
       * Tema que não se leu vira AVISO, porque o silêncio aqui já custou caro.
       *
       * Sem cor de página, `oposto` é falso por falta de dado — não por
       * medição — e a origem cai no regime "os temas combinam". Esse regime
       * mantém a superfície da origem E resgata o texto para a tinta da marca:
       * quando o palpite erra, sai tinta clara sobre cartão claro. Dizer que
       * não se soube é o que separa "medi e combinam" de "não medi".
       */
      if (cor === null) {
        avisos.push(
          `[${origem}] não deu para ler a cor de página desta origem (nem \`bg-[#hex]\` no <body>, nem \`body{background}\` na folha): ela foi tratada como tema COMPATÍVEL com a marca, então as superfícies dela ficam como estavam. Se aparecer texto claro sobre bloco claro nas peças desta origem, é por aqui.`,
        );
      }
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
  // Quantos quadros congelados de animação foram acesos (ver acenderOpacidadeCongelada).
  let congeladasAcesas = 0;
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
  /**
   * O que a REGRA DE ACEITE do site precisa contar enquanto a página é montada.
   *
   * Contado aqui, e não relido do HTML no fim, porque só aqui se sabe a
   * diferença entre "esta foto é da marca" e "esta foto é da origem e ficou por
   * falta de substituta" — no HTML pronto as duas são só um `<img>`.
   */
  const paraOAceite = { fotosDaOrigem: 0, videosDaOrigem: 0, secoesVazias: [] as string[] };
  /**
   * Peça → origem, e as origens que de fato PISARAM na página.
   *
   * As duas existem para julgar se um comportamento está vivo. O CSS de um
   * comportamento sai escopado na origem dele; se nenhuma seção, camada ou
   * ponteiro da página veio daquela origem, aquele CSS casa zero elementos —
   * medido no site do clube, onde o único comportamento do kit tinha origem
   * `ds_…CBFVX9` e os proxies presentes eram outros três.
   *
   * `origensNaPagina` só recebe origem cujo corpo ENTROU no HTML: `processarPeca`
   * sozinho não basta, porque ele também roda para peças cujo corpo é depois
   * descartado (é o caso do próprio comportamento não-`cursor`).
   */
  const origemDaPeca = new Map<string, string>();
  const origensNaPagina = new Set<string>();
  /** Quantas vezes o nome da empresa de origem foi trocado pelo da marca. */
  let nomesTrocados = 0;
  /** Os nomes de todas as origens do kit, para a varredura final da regra S2. */
  const nomesDeOrigemVistos = new Set<string>();
  /** Rastreadores de terceiro: o que saiu, e o que não deu para tirar. */
  const rastreadores = { removidos: [] as string[], mantidos: [] as string[] };
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
  /**
   * Os arquivos que a MARCA declarou como logotipo — venham rotulados como
   * vierem na lista de mídia.
   *
   * O `kind` da mídia é declaração de quem escreveu a lista, e declaração erra.
   * Medido no site do clube: o escudo entrou como `kind: 'image'` e foi parar
   * numa vaga de foto de 272x520. O escudo é **33% transparente**, então o que
   * apareceu foi o fundo escuro do cartão atravessando o vazio do logotipo — o
   * dono viu "espaço preto sobrando" e estava certo.
   *
   * Logotipo tem margem própria e fundo vazio por construção. Esticado numa
   * caixa de foto ele sempre sobra, com qualquer `object-fit`. Então a régua não
   * é o rótulo: é a PROCEDÊNCIA. Arquivo que a marca registrou como logo não
   * preenche vaga de foto, e isso vale para qualquer marca.
   */
  const arquivosDeLogo = new Set<string>();
  const anotarLogo = (p: unknown): void => {
    if (typeof p === 'string' && p.trim() !== '') arquivosDeLogo.add(p);
  };
  for (const l of entrada.branding.logos ?? []) anotarLogo(l.path);
  anotarLogo(entrada.branding.logoPath);
  anotarLogo(entrada.branding.faviconPath);
  for (const p of Object.values(entrada.branding.logosLocais ?? {})) {
    anotarLogo(p);
    if (p !== null && typeof p === 'object') anotarLogo((p as { path?: unknown }).path);
  }

  const midiaPorSecao = new Map<string, { fotos: string[]; videos: string[] }>();
  const logosBarradas: string[] = [];
  for (const m of entrada.midia ?? []) {
    if (m.secaoId === undefined) continue;
    // Marca não é conteúdo: a logo tem o caminho das variações e do favicon, e
    // entrar aqui faria o símbolo da empresa substituir a foto do hero.
    if (m.kind === 'logo' || m.kind === 'icon') continue;
    if (arquivosDeLogo.has(m.de)) {
      if (!logosBarradas.includes(m.de)) logosBarradas.push(m.de);
      continue;
    }
    const lista = midiaPorSecao.get(m.secaoId) ?? { fotos: [], videos: [] };
    // Foto e vídeo em filas SEPARADAS, porque os buracos que eles preenchem são
    // de formatos diferentes: pôr um `.mp4` no `src` de uma `<img>` não mostra
    // nada, e uma `.jpg` no `<video>` também não. Uma fila só, na ordem de
    // chegada, faria isso na primeira vez que o projeto tivesse os dois.
    if (m.kind === 'video') lista.videos.push(m.para);
    else lista.fotos.push(m.para);
    midiaPorSecao.set(m.secaoId, lista);
  }
  if (logosBarradas.length > 0) {
    avisos.push(
      `${logosBarradas.length} arquivo(s) da marca estavam na lista de mídia como se fossem foto (${logosBarradas.slice(0, 3).join(', ')}) e ficaram de fora das vagas de conteúdo: logotipo tem fundo vazio e margem própria, e esticado numa vaga de foto ele deixa o fundo do cartão aparecendo. Ele continua entrando onde é logotipo — cabeçalho, rodapé e favicon.`,
    );
  }
  /**
   * O logotipo que substitui o MONOGRAMA da origem.
   *
   * Preferência por `simbolo` e `reduzida`: o monograma mora numa caixa pequena
   * e quadrada, e uma logo horizontal com o nome escrito, espremida ali, sai
   * ilegível.
   *
   * O destino é calculado aqui porque as logos só são copiadas no FIM da
   * montagem, depois das seções — e a peça precisa do caminho na hora de trocar.
   * Quando a mesma imagem já viaja como MÍDIA do projeto, o alvo é o dela: dois
   * caminhos para o mesmo arquivo seriam duas cópias dentro do `.zip`.
   */
  const alvoDeMidiaPorFonte = new Map<string, string>();
  for (const m of entrada.midia ?? []) {
    if (!alvoDeMidiaPorFonte.has(m.de)) alvoDeMidiaPorFonte.set(m.de, m.para);
  }
  const logoParaMonograma = ((): { src: string; alt: string } | null => {
    const logos = entrada.branding.logos ?? [];
    const escolhida =
      logos.find((l) => l.tipo === 'simbolo') ??
      logos.find((l) => l.tipo === 'reduzida') ??
      logos.find((l) => l.tipo === 'principal') ??
      logos[0];
    if (escolhida === undefined) return null;
    const ext = (escolhida.path.split('.').pop() ?? 'svg').toLowerCase();
    const src = alvoDeMidiaPorFonte.get(escolhida.path) ?? `midia/logo-${escolhida.tipo}.${ext}`;
    return { src, alt: entrada.branding.brandName || 'Logotipo' };
  })();

  /** As filas da seção em processamento; cada peça consome o que usar. */
  let fotosDaSecao: string[] = [];
  let videosDaSecao: string[] = [];

  /**
   * As alças dos ESTADOS capturados, numeradas pela PÁGINA inteira.
   *
   * Contador da página, e não da peça, porque a mesma peça pode entrar em duas
   * seções: alça por peça repetiria `orb-1` e o alternador acharia o elemento
   * errado. E é `data-orbis-ancora`, nunca `id`: id é maquinaria da peça, e é
   * dele que o script da origem depende (`getElementById('active-card')`).
   */
  let alcasDeEstado = 0;
  const proximaAncora = (): string => {
    alcasDeEstado += 1;
    return `orb-${alcasDeEstado}`;
  };
  /** O que cada estado capturado virou. Vira `estados-derivados.json`. */
  const derivadosDeEstado: EstadoDerivado[] = [];

  const processarPeca = (
    cmpId: string,
    substituicoes: Record<string, string> | undefined,
    rotulo: string,
    opcoes?: {
      descartarReferenciaVisual?: boolean;
      copiaDeEstado?: Record<string, { rotulo?: string; texto?: string }>;
    },
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
    origemDaPeca.set(cmpId, origemBase);
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
    // E o quadro em que o print pegou a animação da biblioteca (GSAP e afins
    // escrevem no `style`): sem o driver, aquele `opacity: 0.42` fica para
    // sempre e o texto não se lê.
    const acesas = acenderOpacidadeCongelada(corpo);
    corpo = acesas.html;
    if (acesas.acesas > 0) congeladasAcesas += acesas.acesas;

    /**
     * O LOGOTIPO DE OUTRA EMPRESA sai — mesma decisão dos scripts de
     * rastreamento acima, e pelo mesmo motivo: não é conteúdo, é marca alheia.
     *
     * O dono viu no hero do clube uma faixa "Operado por" com British Museum,
     * Sotheby's, ArtStation e Kickstarter — os parceiros de um template de
     * museu. Nada pegava: a troca de mídia só enxerga `<img>`/`<video>` de
     * `assets/<cmpId>/`, e marca pictórica não tem texto para a regra S2 achar.
     *
     * Some do HTML e é DITO, como os rastreadores. Não vira pendência porque
     * não há decisão humana a tomar: logotipo de terceiro no site do cliente é
     * defeito em qualquer leitura.
     */
    /**
     * O MONOGRAMA da origem vira o logotipo da marca.
     *
     * Vem antes da remoção de marcas de terceiro de propósito: o monograma é um
     * slot de logotipo que se RESOLVE, não um logotipo alheio que se remove.
     * Trocado aqui, ele não chega à poda de container vazio.
     *
     * Medido no site do clube: a substituição escrita à mão no
     * `entrada-geracao.json` consertava a nav e sobravam OUTROS DOIS — o mesmo
     * "M" reaparece no avatar do depoimento e no balão. Substituição por site
     * conserta um lugar; isto vale para todas as peças de todos os sites.
     */
    const comLogo = trocarMonogramaDaOrigem(corpo, logoParaMonograma);
    corpo = comLogo.html;
    if (comLogo.trocados > 0) {
      avisos.push(
        `[${rotulo}] ${comLogo.trocados} monograma(s) da origem (uma letra numa caixa, que é como aquele site desenhava a marca dele) foram trocados pelo logotipo desta marca.`,
      );
    }

    const semMarcasAlheias = removerMarcasDeTerceiro(corpo);
    corpo = semMarcasAlheias.html;
    if (semMarcasAlheias.removidas.length > 0) {
      avisos.push(
        `[${rotulo}] ${semMarcasAlheias.removidas.length} logotipo(s) de OUTRA empresa saíram da peça (${semMarcasAlheias.removidas.join(', ')}): vieram de uma coleção de logotipos do site de origem e não têm nada a ver com esta marca.`,
      );
    }

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

    /**
     * O NOME DA EMPRESA DE ORIGEM sai do que a pessoa lê.
     *
     * O dono viu "CANVAS" em letras gigantes no rodapé de um site de clínica, e
     * "© 2024 CANVAS SYSTEMS" logo abaixo. A regra S2 já dizia que nada da
     * origem sobrevive, mas só conferia foto e vídeo — texto passava direto.
     *
     * Vem DEPOIS das substituições do criativo, e isso é a ordem certa: o
     * criativo casa com frases do site de origem, e trocar o nome antes faria
     * essas buscas não acharem mais nada. O que ele não alcançou — rodapé,
     * marca-d'água, aviso de copyright — esta troca alcança, porque é cega.
     *
     * Fica FORA do bloco de assets de propósito. Rodapé e barra de menu costumam
     * não ter pasta `assets/`, e é exatamente neles que o nome aparece: preso
     * ali dentro, o conserto não pegava justamente as peças que o motivaram.
     */
    const nomesDestaOrigem = nomesDaOrigem(cmp.bundlePath);
    for (const n of nomesDestaOrigem) nomesDeOrigemVistos.add(n);
    const nome = trocarNomeDaOrigem(
      corpo,
      nomesDestaOrigem,
      entrada.branding.brandName?.trim() ?? '',
    );
    corpo = nome.html;
    nomesTrocados += nome.trocas;

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
      /**
       * O VÍDEO escolhe a vaga ANTES das fotos, e a ordem é a decisão.
       *
       * Medido: rodando depois, as fotos da seção já haviam ocupado as duas
       * vagas de `<img>` da peça e o vídeo não tinha onde pousar — ele
       * simplesmente não aparecia no site, sem erro nenhum.
       *
       * Vídeo é mais escasso que foto e custa mais para produzir; quando o
       * criativo ancora um numa seção, é porque ele quer aquilo ali. Uma vaga
       * por peça, para o vídeo não comer a seção inteira e deixar as fotos de
       * fora — o inverso do defeito.
       *
       * Só quando a peça NÃO tem `<video>`: tendo, aquele é o destino natural e
       * a troca vídeo→vídeo mais abaixo faz o trabalho com a capa junto.
       */
      if (videosDaSecao.length > 0 && !/<video\b/i.test(corpo)) {
        const fv = trocarFotoPorVideo(corpo, cmpId, videosDaSecao.slice(0, 1), fotosDaSecao[0]);
        corpo = fv.html;
        videosDaSecao = videosDaSecao.slice(fv.usados);
        if (fv.usados > 0) {
          avisos.push(
            `[${rotulo}] uma vaga de foto recebeu VÍDEO do projeto: a peça não trazia tag de vídeo, e sem isto o vídeo ancorado nesta seção não teria onde entrar. Ele entra mudo, em laço e inline, que é o que o celular deixa tocar sozinho, e a capa sai da mídia do projeto — nunca do asset da origem.`,
          );
        }
      }
      const troca = trocarFotosDaOrigem(corpo, cmpId, fotosDaSecao);
      corpo = troca.html;
      fotosDaSecao = fotosDaSecao.slice(troca.usadas);
      if (troca.usadas > 0) {
        avisos.push(
          `[${rotulo}] ${troca.usadas} foto(s) do site de origem trocada(s) pela mídia do projeto.`,
        );
      }
      if (troca.mantidas > 0) {
        paraOAceite.fotosDaOrigem += troca.mantidas;
        avisos.push(
          `[${rotulo}] ${troca.mantidas} foto(s) do site de origem CONTINUAM na página: não havia mídia do projeto para esta seção. Gere as mídias automáticas ou envie imagens para ela — enquanto isso o site mostra a foto de outra empresa.`,
        );
      }
      /**
       * Vídeo do projeto que não achou `<video>` na peça entra na vaga de FOTO.
       *
       * Roda ANTES da troca vídeo→vídeo, e a ordem importa: se houvesse
       * `<video>` na peça, ele seria o destino natural e esta conversão roubaria
       * o arquivo dele. Por isso ela só age quando a peça não tem `<video>`
       * nenhum — a checagem é o próprio `tv.usados` sair zero, então a
       * conversão vem depois de saber disso.
       */
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
        paraOAceite.videosDaOrigem += tv.mantidos;
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

    /**
     * OS ESTADOS CAPTURADOS VIRAM INTERAÇÃO — e é aqui, não antes.
     *
     * Depois de `reescreverRefsHtml` e da troca de mídia, porque é só com as
     * refs já no namespace `assets/<cmpId>/` que dá para distinguir "o mesmo
     * asset local" de "uma URL do servidor de outra empresa", e é só depois da
     * troca que se sabe se a foto que o estado quer repor JÁ foi substituída
     * pela do projeto (se foi, repô-la fura a S2). Antes da varredura de
     * `<script>` logo abaixo, para que nada emitido aqui passe pelo coletor.
     *
     * A fila de mídia da seção não é tocada: este caminho nunca lê
     * `fotosDaSecao`/`videosDaSecao` nem chama as trocas. Ele só reescreve
     * atributos em elementos que já existem.
     */
    const doBundle = lerEstadosDoBundle(cmp.bundlePath);
    if (doBundle.aviso !== null) avisos.push(`[${rotulo}] ${doBundle.aviso}`);
    if (doBundle.estados.length > 0) {
      const derivacao = derivarEstados({
        pecaId: cmpId,
        corpo,
        estados: doBundle.estados,
        copiaPorEstado: new Map(Object.entries(opcoes?.copiaDeEstado ?? {})),
        nomesDaOrigem: nomesDestaOrigem,
        proximaAncora,
      });
      // Os `<template>` entram FORA dos proxies de propósito: eles não
      // renderizam nada, e fora do `[data-ds-raiz]` o CSS escopado da origem
      // não tem como alcançá-los. O alternador os acha por `querySelector`.
      corpo =
        derivacao.templates.length > 0
          ? `${derivacao.corpo}\n${derivacao.templates}`
          : derivacao.corpo;
      derivadosDeEstado.push(...derivacao.derivados);
      for (const a of avisosDosEstados(derivacao.derivados)) avisos.push(`[${rotulo}] ${a}`);
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
        /**
         * O RASTREAMENTO da empresa de origem não entra no site do cliente.
         *
         * O corpo do script é lido antes de qualquer outra decisão porque este
         * é o único ponto por onde todo script local passa. Puro sai e o
         * arquivo some do disco junto: deixá-lo copiado seria entregar o
         * rastreador de outra empresa na pasta do cliente, sem tag mas ali.
         */
        const corpoDoScript =
          src === undefined
            ? conteudo
            : existsSync(join(outputDir, src))
              ? readFileSync(join(outputDir, src), 'utf8')
              : '';
        const rastreio = rastreamentoDeTerceiro(corpoDoScript);
        if (rastreio === 'puro') {
          rastreadores.removidos.push(src ?? `trecho embutido em ${rotulo}`);
          if (src !== undefined && existsSync(join(outputDir, src))) {
            rmSync(join(outputDir, src), { force: true });
          }
          return '';
        }
        if (rastreio === 'misturado') {
          rastreadores.mantidos.push(src ?? `trecho embutido em ${rotulo}`);
        }
        /**
         * Tag cujo ARQUIVO não existe não é emitida — é 404 garantido.
         *
         * Medido no banco de prova, no kit de imóvel: três peças citavam o
         * mesmo script e nenhum dos três arquivos estava em disco. O site
         * subia com três requisições que só podiam falhar, e a regra S8
         * reprovava por referência quebrada.
         *
         * Duas coisas se somavam. O dedupe usava o hash do arquivo COPIADO e,
         * quando ele faltava, caía no caminho como chave — e o caminho carrega
         * o namespace da peça, então três cópias do mesmo script viravam três
         * chaves distintas e nenhuma era deduplicada. E a tag seguia emitida
         * mesmo sem arquivo.
         *
         * Agora a identidade sai do arquivo do BUNDLE, que sempre existe, e a
         * ausência do copiado vira aviso em vez de 404 silencioso.
         */
        let chave: string;
        if (src !== undefined) {
          const copiado = join(outputDir, src);
          const noBundle = join(cmp.bundlePath, src.replace(`assets/${cmpId}/`, 'assets/'));
          const fonte = existsSync(copiado) ? copiado : existsSync(noBundle) ? noBundle : null;
          if (fonte === null) {
            avisos.push(
              `[${rotulo}] o script ${src} não existe nem no site nem no bundle da peça: a tag saiu, para o site não subir com uma requisição que só pode falhar.`,
            );
            return '';
          }
          chave = createHash('sha1').update(readFileSync(fonte)).digest('hex');
          // A tag só vale se o arquivo estiver NO SITE. Existindo só no bundle,
          // a referência apontaria para o vazio depois de o site viajar.
          if (!existsSync(copiado)) {
            avisos.push(
              `[${rotulo}] o script ${src} existe no bundle mas não foi copiado para o site: a tag saiu em vez de virar 404.`,
            );
            return '';
          }
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
      .map((c) => {
        const corpo = processarPeca(c.id, undefined, 'fundo da página');
        // A origem só conta como presente quando o corpo dela entra no HTML.
        if (corpo !== null) origensNaPagina.add(origemDaPeca.get(c.id) ?? c.id);
        return corpo;
      })
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
  /** Cada comportamento que chegou, com o que se precisa para julgá-lo vivo. */
  const comportamentosProcessados: {
    nome: string;
    origem: string;
    ehCursor: boolean;
    scripts: string[];
  }[] = [];
  if (comportamento.comportamentos.length > 0) {
    /**
     * A peça de comportamento também recebe fotos do projeto.
     *
     * Parece contraditório — comportamento não tem conteúdo —, mas o HTML dela
     * é a UNIÃO dos elementos que ela anima, e alguns deles têm imagem. Medido
     * no site de uma clínica: a peça "Revelar ao rolar" entregou 4 fotos do
     * site de origem, porque roda fora do laço das seções e a fila de fotos
     * chegava vazia. Ela consome o que as seções não usaram.
     */
    fotosDaSecao = [...midiaPorSecao.values()].flatMap((m) => m.fotos);
    videosDaSecao = [...midiaPorSecao.values()].flatMap((m) => m.videos);
    /**
     * O HTML de uma peça de INTERAÇÃO não vai para a página — só o CSS e o
     * script dela.
     *
     * A distinção nasceu de um defeito medido no site de uma clínica. A peça
     * "Revelar ao rolar" carrega, como HTML, a UNIÃO DOS ELEMENTOS QUE ELA
     * ANIMA: cartões, títulos e parágrafos de verdade, tirados das dobras da
     * origem. Renderizar isso dentro do embrulho fixo colava aquele conteúdo
     * inteiro por cima da página, em x=0, sobre todo o resto. O que a peça
     * entrega de útil — o `.reveal{opacity:0}` e o observador — já viajou pelo
     * efeito colateral de `processarPeca`, que põe o CSS na cascata e o script
     * no fim do body.
     *
     * O PONTEIRO é o oposto, e por isso o dele fica: o elemento É a peça, e sem
     * o `<div class="cursor">` não há o que seguir o mouse.
     */
    const corpos: string[] = [];
    const soComportamento: string[] = [];
    for (const c of comportamento.comportamentos) {
      // Os scripts que ESTA peça acrescentou, isolados pela fatia que ela abriu
      // em `corpoDosScriptsLocais`. É deles que saem os seletores que provam se
      // o comportamento alcança alguma coisa — o julgamento em si só pode
      // acontecer depois de as seções existirem, mais abaixo.
      const antes = corpoDosScriptsLocais.length;
      const corpo = processarPeca(c.id, undefined, 'comportamento da página');
      const scriptsDaPeca = corpoDosScriptsLocais.slice(antes);
      if (corpo === null) continue;
      comportamentosProcessados.push({
        nome: c.name,
        origem: origemDaPeca.get(c.id) ?? c.id,
        ehCursor: c.category === 'cursor',
        scripts: scriptsDaPeca,
      });
      if (c.category === 'cursor') {
        corpos.push(corpo);
        origensNaPagina.add(origemDaPeca.get(c.id) ?? c.id);
      } else soComportamento.push(c.name);
    }
    if (soComportamento.length > 0) {
      avisos.push(
        `${soComportamento.length} comportamento(s) entraram só como CSS e script (${soComportamento.join(', ')}): o HTML deles é a amostra dos alvos na origem, não conteúdo para esta página.`,
      );
    }
    if (corpos.length > 0) {
      const ids = comportamento.comportamentos.map((c) => c.id).join(' ');
      comportamentoHtml = `\n<div data-ds-comportamento="${ids}" style="position:fixed;inset:0;pointer-events:none;z-index:9999">\n${corpos.join('\n')}\n</div>\n`;
      avisos.push(`${corpos.length} peça(s) de ponteiro aplicadas sobre a página inteira.`);
    }
  }

  // ── As seções, na ordem do usuário ────────────────────────────────────────
  let bodyHtml = '';
  /** Alguma etapa sem peça virou seção construída? Decide a folha extra. */
  let usouSecaoCriada = false;
  // O ritmo do kit é medido UMA vez: as seções criadas e as abas andam no mesmo
  // compasso do resto da página, e não em dois tempos diferentes.
  const ritmoDaPagina = tokensDeMovimento(concatCss);
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
        copiaDeEstado: criativo?.estados,
      });
      if (corpo === null) continue;
      partes.push(corpo);
      usados.push(peca.id);
      origensNaPagina.add(origemDaPeca.get(peca.id) ?? peca.id);
    }
    if (temCriado && criativo?.htmlCriado !== undefined) {
      // O envelope dá à seção criada o mesmo ponto de apoio que os proxies dão
      // às peças: a REGRA_QUE_ABRE_PASSAGEM o torna transparente e o fundo é
      // da página. O conteúdo interno segue mandando nos próprios cartões.
      partes.push(`<div data-ds-criado>\n${criativo.htmlCriado}\n</div>`);
    }
    /**
     * Etapa sem peça: o compositor CONSTRÓI a seção na linguagem do kit.
     *
     * As sequências passaram de 7-9 para 11-12 etapas e a Biblioteca não cobre
     * todas em todo nicho — `testimonial` tem 3 peças para 20 kits. Até aqui a
     * etapa saía vazia, com aviso. O dono pediu que ela fosse criada, e a régua
     * de conteúdo mora em `secoes-no-estilo.ts`: texto dele, tokens do kit, e
     * placeholder MARCADO só em modo protótipo.
     *
     * Só com a permissão que ele deu (`criarSecoesFaltantes`): sem ela, seção
     * que ele não pediu não nasce, e o vazio sobe declarado como sempre.
     */
    if (partes.length === 0 && entrada.layout.permissoes?.criarSecoesFaltantes === true) {
      const doLayout = entrada.layout.secoes.find((x) => x.id === secao.id);
      const criada = criarSecaoNoEstilo({
        papel: secao.slug,
        nome: secao.nome || secao.slug,
        instrucao: doLayout?.instrucao ?? null,
        marca: {
          nome: entrada.branding.brandName,
          chamada: entrada.branding.mainCta?.label,
          email: entrada.branding.contact?.email,
          telefone: entrada.branding.contact?.phone,
          endereco: entrada.branding.contact?.address,
        },
        duracaoMs: ritmoDaPagina.mediaMs,
        easing: ritmoDaPagina.easing,
        modo: entrada.modoDeConteudo ?? 'entrega',
      });
      if (criada.html !== undefined) {
        partes.push(`<div data-ds-criado>
${criada.html}
</div>`);
        usouSecaoCriada = true;
        avisos.push(
          `A seção "${secao.nome || secao.slug}" não tinha peça no kit e foi CONSTRUÍDA na paleta e no ritmo do kit.`,
        );
      } else {
        avisos.push(criada.recusa);
      }
    }
    if (partes.length === 0) {
      paraOAceite.secoesVazias.push(secao.nome || secao.slug);
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
  /**
   * O respiro MÍNIMO na emenda entre duas seções.
   *
   * O dono apontou duas vezes: "componentes colado um com outro". Medido nos 20
   * sites de prova, em 1440px: **149 emendas com menos de 8px de vão, e ZERO
   * acima de 160px**. Não é um extremo e outro — é um só: as peças se encostam.
   *
   * A causa é a composição: cada peça traz o respiro que tinha na origem, onde
   * ela era uma seção entre outras da MESMA página. Empilhadas de origens
   * diferentes, o que separava lá deixa de separar aqui.
   *
   * ## O que isto NÃO toca
   *
   * O espaçamento INTERNO da peça, que é regra dura deste projeto ("não mude a
   * essência do componente"). Isto é `margin-top` na EMENDA, entre uma seção e a
   * próxima — a fronteira que a composição criou e que ninguém desenhou.
   *
   * ## Por que `max()` e não um valor fixo
   *
   * Seção que JÁ respira não ganha nada: `max` deixa o maior valer. O piso sai
   * do degrau medido do próprio kit (`--marca-espaco-8`), não de constante — um
   * site de ritmo apertado ganha piso apertado. O `2.5rem` é a reserva para
   * quando o kit não tem régua de espaço medida.
   *
   * ## O que foi descartado, e por quê
   *
   * A primeira proposta era `padding-block` na raiz de cada seção. Simulada nos
   * 20 sites, ela deixava TODOS mais altos — +9,9% no total — porque somava
   * respiro também onde já havia. O piso na emenda só age onde falta.
   */
  const respiroDaEmenda =
    '[data-secao] + [data-secao]{margin-top:max(var(--marca-espaco-8, 2.5rem), 0px)}';
  concatCss += `\n/* base da página composta */\nhtml,body{margin:0}\n:root{--pagina-fundo:${fundoDaMarca}}\nbody{background:var(--pagina-fundo)}\n${REGRA_QUE_ABRE_PASSAGEM}\n${REGRA_DA_TINTA_DA_MARCA}\n${REGRA_DA_LISTA_SUSPENSA}\n[data-secao="nav"][data-fixa-no-topo]{position:sticky;top:0;z-index:60}\n${respiroDaEmenda}\n`;

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
  /**
   * O qualificador de id que o RECORTE deixou para trás é solto.
   *
   * A peça foi cortada de dentro de um `#platform` que não existe no site
   * composto, e toda regra que a origem qualificou por ele parou de casar —
   * inclusive `@media (max-width:980px){#platform .split-section{...:1fr}}`. No
   * celular a seção saía 72px fora da tela, com o layout de duas colunas que a
   * origem só usava no desktop. O porquê por extenso está em
   * `composer/src/ancestral-ausente.ts`.
   *
   * Os ids saem do HTML JÁ MONTADO — corpo, camadas de fundo e comportamentos —,
   * que é a única fonte que sabe o que sobrou depois do recorte.
   */
  const idsNaPagina = new Set(
    [...`${bodyHtml}${camadasHtml}${comportamentoHtml}`.matchAll(/\bid="([^"]+)"/g)].flatMap((m) =>
      m[1] === undefined ? [] : [m[1]],
    ),
  );
  const ancestrais = soltarAncestraisAusentes(concatCss, idsNaPagina);
  concatCss = ancestrais.css;
  if (ancestrais.relaxados > 0 || ancestrais.descartados > 0) {
    avisos.push(
      `${ancestrais.relaxados} regra(s) da origem estavam presas a um id que o recorte deixou para trás e voltaram a valer sem ele; ${ancestrais.descartados} foram descartadas por não sobrar âncora nenhuma. É o que devolve o comportamento de celular que a origem escreveu preso a uma seção.`,
    );
  }

  /**
   * `@font-face` que aponta para arquivo que não veio sai da folha.
   *
   * Medido: um CSS de fonte capturado pedia 8 arquivos `.woff2` e a captura
   * baixou 2. Os outros 6 continuavam declarados, e o navegador pedia cada um —
   * 404 a cada carregamento, sem nada quebrar na tela (a família cai na próxima
   * da pilha). Ficava invisível para quem gera e visível para quem mede.
   *
   * Só o `src` que falta é descartado; a declaração fica de pé enquanto sobrar
   * um arquivo que existe. Sem nenhum, o bloco inteiro sai — uma família sem
   * arquivo nenhum não veste texto, só custa requisição.
   *
   * A conta acontece AQUI, e não onde a folha é concatenada, porque é aqui que
   * todos os assets das peças já foram copiados: antes disso "não existe em
   * disco" ainda não quer dizer nada.
   */
  const limparFontesSemArquivo = (
    css: string,
  ): { css: string; srcRemovidos: number; blocosRemovidos: number } => {
    let srcRemovidos = 0;
    let blocosRemovidos = 0;
    const saida = css.replace(/@font-face\s*\{[^}]*\}/gi, (bloco) => {
      if (!/\burl\(/i.test(bloco)) return bloco;
      let aindaTem = false;
      const novo = bloco.replace(/src\s*:\s*([^;}]+)/gi, (_decl, valor: string) => {
        const partes = valor.split(',').filter((parte) => {
          const ref = /url\(\s*["']?([^"')]+)["']?\s*\)/i.exec(parte)?.[1];
          // `local(...)` e fonte remota não são arquivo desta pasta: ficam.
          if (ref === undefined) return true;
          if (/^(https?:)?\/\/|^data:/i.test(ref)) return true;
          // A folha mora em `assets/styles.css`: o relativo resolve dali.
          if (existsSync(join(outputDir, 'assets', ref.split('?')[0] ?? ref))) return true;
          srcRemovidos += 1;
          return false;
        });
        if (partes.length === 0) return 'src:';
        aindaTem = true;
        return `src:${partes.join(',')}`;
      });
      if (aindaTem) return novo;
      blocosRemovidos += 1;
      return '';
    });
    return { css: saida, srcRemovidos, blocosRemovidos };
  };
  const fontes = limparFontesSemArquivo(concatCss);
  concatCss = fontes.css;
  if (fontes.srcRemovidos > 0) {
    avisos.push(
      `${fontes.srcRemovidos} arquivo(s) de fonte declarados no CSS não vieram na captura e foram retirados da folha (${fontes.blocosRemovidos} família(s) ficaram sem arquivo nenhum): o navegador pedia cada um e recebia 404. O texto usa a próxima fonte da pilha.`,
    );
  }

  /**
   * A folha é escrita NO FIM, e isso não é estilo — é o que faz as correções
   * existirem.
   *
   * `escrever('assets/styles.css', concatCss)` morava aqui, no meio do
   * caminho. Só que `concatCss` continua CRESCENDO depois desta linha: é
   * abaixo que `soltarRaizDaSecaoNoFluxo` devolve a raiz da peça ao fluxo e
   * que `destravarOpacidadeSemRevelador` acende o texto que ficou na
   * opacidade inicial. Tudo isso ia para uma string que já tinha virado
   * arquivo — escrito e descartado no mesmo fôlego.
   *
   * O sintoma era sempre o mesmo, e me enganou quatro vezes seguidas: eu
   * consertava, media, e o NÚMERO NÃO MEXIA. S13 de 33/40 para 32/40 depois
   * de um destravamento que, no papel, acendia centenas de trechos. A
   * conferência estava certa; a folha é que não tinha a correção dentro.
   *
   * A regra que fica: string que ainda vai crescer não vira arquivo no meio da
   * função. Escrever é o último ato.
   */
  const escreverAFolhaComposta = (): void => escrever('assets/styles.css', concatCss);
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

  /**
   * A folha dos RETOQUES — nasce vazia e é a ÚLTIMA da cascata.
   *
   * O dono pediu um botão em cada site gerado para dizer "esse título está
   * pequeno", "esse azul não é o meu azul". A pergunta que decide o desenho é
   * onde esse pedido pousa.
   *
   * Regerar a página inteira é o caminho óbvio e é o errado: refaz tudo o que já
   * estava bom, paga a composição de novo, e o retoque some na geração seguinte.
   * Editar o `index.html` à mão é pior — destrói a reprodutibilidade e não há
   * como desfazer.
   *
   * Então o retoque pousa aqui. Emitida SEMPRE, mesmo vazia, para que ajustar
   * seja só escrever nela; e ligada por último no `<head>` para vencer a cascata
   * sem precisar de um `!important` sequer. A composição original fica intacta, e
   * desfazer um ajuste é apagar o bloco dele.
   */
  escrever(
    'assets/ajustes.css',
    [
      '/* Retoques pedidos DEPOIS da geração.',
      '   Cada bloco traz o pedido que o originou; apagar o bloco desfaz o',
      '   ajuste. Esta folha é a última da cascata, então o que estiver aqui',
      '   vence sem precisar de !important. */',
      '',
    ].join('\n'),
  );

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

  /**
   * E o outro lado da mesma moeda: o que chegou no estado INICIAL, invisível,
   * esperando um revelador que não alcança ninguém aqui.
   *
   * Medido nos 20 sites de prova: 362 trechos de texto em opacidade ZERO, com
   * classe de nome revelador (`gsap-fade-up`, `pc-hidden-content`,
   * `stack-card`). A regra S13 reprovava em 31 das 40 larguras.
   */
  /**
   * A NAV passa a apontar para as seções desta página.
   *
   * O dono clicou nos itens do menu três vezes e nada acontecia: os `href` vêm
   * do site de origem e apontam para âncoras e rotas que não existem aqui.
   */
  const nav = ancorarNavNasSecoes(bodyHtml, [
    ...separado.secoes.map((s) => ({ id: s.id, papel: s.slug, nome: s.nome || s.slug })),
  ]);
  if (nav.ligados > 0) {
    bodyHtml = nav.html;
    avisos.push(
      `${nav.ligados} link(s) do menu passaram a apontar para as seções desta página. Eles vinham do site de origem, apontando para âncoras e rotas que não existem aqui — clicar não fazia nada.`,
    );
  }

  if (congeladasAcesas > 0) {
    avisos.push(
      `${congeladasAcesas} elemento(s) chegaram com a opacidade CONGELADA no meio de uma animação (o quadro em que a captura pegou o GSAP e afins) e foram acesos. Sem o driver na página composta, aquele valor ficaria para sempre e o texto não se leria.`,
    );
  }

  // Letra abaixo de 12px não se lê no celular, por melhor que seja o contraste.
  // A lista sai do CSS composto, não de uma lista fixa: ela precisa alcançar
  // tanto `text-[10px]` quanto o `.eyebrow` que aquele site inventou.
  const miudas = acenderLetraMiuda(concatCss);
  if (miudas.classes.length > 0) {
    concatCss += miudas.css;
    avisos.push(
      `${miudas.classes.length} classe(s) escreviam texto abaixo de ${PISO_DE_LETRA_MOVEL}px e ganharam piso no celular (${miudas.classes.slice(0, 3).join(', ')}). Na origem aquilo era um selo discreto numa tela larga; em 390px vira letra que não se lê.`,
    );
  }

  // A raiz de cada peça volta ao fluxo: quem flutua é a `<section>`. Sem isto,
  // a seção da nav sai com 0px e reprova S14, S18 e S19 de uma vez só.
  const soltas = soltarRaizDaSecaoNoFluxo(concatCss);
  if (soltas.classes.length > 0) concatCss += soltas.css;

  const destravadas = destravarOpacidadeSemRevelador(
    concatCss,
    corpoDosScriptsLocais,
    `${camadasHtml}${bodyHtml}`,
  );
  if (destravadas.destravadas.length > 0) {
    concatCss += destravadas.css;
    avisos.push(
      `${destravadas.destravadas.length} classe(s) que a origem deixa invisíveis à espera de revelação (${destravadas.destravadas.slice(0, 3).join(', ')}) voltaram a aparecer: nenhum script que viajou alcança elemento nesta página, então ninguém levantaria aquela opacidade. Perde-se a animação de entrada; o texto fica.`,
    );
  }

  /**
   * O comportamento que viajou inteiro e não faz NADA.
   *
   * Ele chegava sem uma linha de aviso: CSS na cascata, script no fim do body,
   * assets copiados. Medido no site do clube: a única peça de comportamento do
   * kit ("Revelar ao rolar") tinha origem que nenhuma seção usava, então o CSS
   * dela — escopado naquela origem — casava zero elementos, e os dois scripts
   * dela procuravam `.scroll-item` e `[data-counter-target]`, com 0 e 0
   * ocorrências no `index.html`. O site saía parado e a S6 carimbava verde.
   *
   * O julgamento tem de acontecer AQUI, depois das seções e das camadas: antes
   * delas não existe página contra a qual medir alcance. Só o veredito desceu —
   * o `processarPeca` de cada comportamento continua lá em cima, onde o CSS
   * dele entra na cascata antes do CSS das seções.
   *
   * Duas provas, e as duas precisam valer: a origem do comportamento pisou na
   * página, E algum seletor literal dos scripts dele acha alvo. Sem seletor
   * legível a segunda degrada para "vivo" — ver `comportamentoAlcancaAPagina`.
   */
  const htmlParaAlcance = `${revelacao.html}${comportamentoHtml}`;
  const comportamentosVivos: string[] = [];
  const comportamentosMortos: string[] = [];
  for (const c of comportamentosProcessados) {
    // O ponteiro é o próprio elemento na página: ele não procura alvo nenhum.
    const alvos = c.ehCursor ? [] : alvosDoComportamento(c.scripts);
    const vivo =
      c.ehCursor ||
      (origensNaPagina.has(c.origem) && comportamentoAlcancaAPagina(htmlParaAlcance, alvos));
    if (vivo) {
      comportamentosVivos.push(c.nome);
      continue;
    }
    comportamentosMortos.push(`${c.nome} (${c.origem})`);
    const presentes = [...origensNaPagina];
    avisos.push(
      `O comportamento "${c.nome}" (origem ${c.origem}) viajou e NÃO alcança nada: as origens que a página tem são ${presentes.length > 0 ? presentes.join(', ') : 'nenhuma'}${
        alvos.length > 0
          ? `, e os seletores dos scripts dele (${alvos.slice(0, 3).join(', ')}) não acham elemento nenhum`
          : ''
      }. O CSS dele sai escopado numa origem ausente e casa zero elementos: é peso morto, e o site fica parado ao rolar.`,
    );
  }

  /**
   * A CAMADA DE MOVIMENTO do compositor — a rede quando nada reage à rolagem.
   *
   * `layout.motion` é declarado pelo usuário no wizard e, até aqui, o
   * determinístico não o lia em lugar nenhum (só uma string de prompt). Honrar
   * a declaração é o conserto; ignorá-la era o defeito. E a camada só entra
   * quando NADA mais revela ao rolar — comportamento vivo ou classe de
   * revelação devolvida desligam a rede, porque duas revelações sobre o mesmo
   * elemento são piores que uma.
   *
   * O porquê inteiro (0/12 kits com comportamento de origem própria; o ritmo
   * medido em vez de chutado; por que isto não fere "não mude a essência")
   * mora em `movimento-da-pagina.ts`.
   */
  // `nenhuma` vira `null` em vez de um booleano: assim o tipo que chega em
  // `cssDaRevelacao` é o da intensidade, e não o do campo inteiro. Booleano
  // separado deixaria o compilador sem como saber que 'nenhuma' já saiu.
  const intensidade = entrada.layout.motion === 'nenhuma' ? null : entrada.layout.motion;
  const jaReageARolagem = comportamentosVivos.length > 0 || revelacao.limpas > 0;
  let corpoDaPagina = revelacao.html;

  /**
   * A PODA DOS ESTADOS QUE JÁ ESTÃO VIVOS.
   *
   * É aqui e em nenhum outro lugar: este é o único ponto em que
   * `corpoDosScriptsLocais` está completo (todas as peças já passaram) e o
   * corpo da página é uma string só. Os scripts locais viajam para o fim do
   * body, e se o da origem já liga aquele clique, o fio desta fatia seria o
   * SEGUNDO listener: abre e fecha na mesma ação. Foi o defeito dos "dois
   * listeners no botão do menu mobile", e não vale a pena repeti-lo.
   */
  const poda = podarEstadosJaVivos({
    html: corpoDaPagina,
    derivados: derivadosDeEstado,
    scriptsLocais: corpoDosScriptsLocais,
  });
  corpoDaPagina = poda.html;

  /**
   * O PAR conferido: o texto e o fundo em que ele senta, juntos.
   *
   * A recoloração migra cor por cor e cada escolha isolada está certa; a guarda
   * que existia confere o texto contra o fundo da PÁGINA. Só que o texto que
   * falha não senta na página — senta num botão, num cartão, numa faixa.
   *
   * Medido num botão do banco de prova: na origem o par dava 16,64:1
   * (#FBFCD4 × stone-900) e depois da migração dava 1,96:1, com cada lado
   * passando sozinho contra a página. Foi este par que reprovou a S4 em 19 dos
   * 20 kits.
   */
  if (tokensDaMarca !== undefined) {
    const par = corrigirParesDeCor(corpoDaPagina, concatCss, tokensDaMarca);
    corpoDaPagina = par.html;
    if (par.corrigidos.length > 0) {
      const exemplo = par.corrigidos[0];
      const detalhe =
        exemplo === undefined
          ? '.'
          : ` (o pior: --marca-${exemplo.papelAntes} sobre --marca-${exemplo.papelDoFundo} dava ${exemplo.razaoAntes.toFixed(2)}:1, virou --marca-${exemplo.papelDepois}).`;
      avisos.push(
        `${par.corrigidos.length} par(es) de cor colapsaram depois da recoloração e foram corrigidos na TINTA${detalhe}`,
      );
    }
  }
  derivadosDeEstado.length = 0;
  derivadosDeEstado.push(...poda.derivados);
  for (const id of poda.podados) {
    avisos.push(
      `o estado "${id}" foi podado: o script da origem já liga aquele clique, e um segundo tratador abriria e fecharia na mesma ação.`,
    );
  }
  const estadosLigados = derivadosDeEstado.filter((d) => d.veredito === 'ligado').length;
  let linkDosEstados = '';
  let scriptDosEstados = '';
  if (estadosLigados > 0) {
    escrever('assets/estados.css', CSS_DO_ALTERNADOR);
    linkDosEstados = '<link rel="stylesheet" href="assets/estados.css"/>\n';
    scriptDosEstados = `\n${SCRIPT_DO_ALTERNADOR}`;
  }

  let linkDoMovimento = '';
  let scriptDoMovimento = '';
  if (intensidade !== null && !jaReageARolagem) {
    const marcado = marcarAlvosDeRevelacao(corpoDaPagina);
    if (marcado.marcados > 0) {
      const tokens = tokensDeMovimento(concatCss);
      corpoDaPagina = marcado.html;
      escrever('assets/movimento.css', cssDaRevelacao(tokens, intensidade));
      linkDoMovimento = '<link rel="stylesheet" href="assets/movimento.css"/>\n';
      scriptDoMovimento = `\n${SCRIPT_DA_REVELACAO}`;
      avisos.push(
        `Nenhuma peça deste site reagia à rolagem, e o layout pede movimento "${intensidade}": a camada de movimento do compositor entrou e marcou ${marcado.marcados} seção(ões) para revelar ao aparecer (a primeira dobra, a navegação e o rodapé ficam de fora). A duração (${tokens.mediaMs}ms) e a curva (${tokens.easing}) saíram MEDIDAS do CSS do próprio kit, em ${tokens.amostras} declaração(ões) — nada dentro das peças foi tocado.`,
      );
    }
  }
  const movimentoAoRolar = jaReageARolagem || scriptDoMovimento !== '';

  /**
   * O conteúdo preso a um ancestral de revelação que não chega é DESTRAVADO.
   *
   * Achado pelo banco de prova: 8 de 12 kits entregavam uma seção inteira em
   * `opacity: 0`, invisível para sempre. O CSS da origem esconde o elemento até
   * que um ANCESTRAL ganhe `.in-view`, e quem põe essa classe é o script da
   * origem — que quase nunca alcança a página composta, porque a peça de
   * comportamento vem de outra origem que a das seções.
   *
   * Roda depois da camada de movimento de propósito: se ela entrou, o conteúdo
   * já tem quem o revele e não há nada a destravar.
   */
  const destrave = destravarRevelacaoSemGatilho(concatCss, corpoDaPagina);
  let linkDoDestrave = '';
  if (destrave.classes.length > 0) {
    escrever('assets/destrave.css', destrave.css);
    linkDoDestrave = '<link rel="stylesheet" href="assets/destrave.css"/>\n';
    avisos.push(
      `${destrave.classes.length} classe(s) da origem nasciam invisíveis esperando um ancestral de revelação que não chega nesta página (${destrave.classes.slice(0, 4).join(', ')}): o conteúdo foi destravado. Perder a animação de entrada é perda pequena e visível; uma seção em branco é perda grande e silenciosa.`,
    );
  }

  /**
   * As ABAS que o criativo escreveu ganham estilo e comportamento.
   *
   * É o contorno para o que a captura não entrega: dos 100 estados do acervo,
   * 75 são idênticos ao HTML base, e no site do clube não havia `role="tab"`
   * nenhum — os ícones que pareciam abas eram desenho. Em vez de DERIVAR
   * interação de uma captura vazia, o compositor a CONSTRÓI a partir da
   * marcação padrão, uma vez por página, no ritmo medido do próprio kit.
   */
  let linkDasSecoesCriadas = '';
  if (usouSecaoCriada) {
    escrever(
      'assets/secoes-criadas.css',
      cssDasSecoesCriadas(ritmoDaPagina.mediaMs, ritmoDaPagina.easing),
    );
    linkDasSecoesCriadas = '<link rel="stylesheet" href="assets/secoes-criadas.css"/>\n';
  }
  let linkDasAbas = '';
  let scriptDasAbas = '';
  if (temAbasCriadas(corpoDaPagina)) {
    const tokens = ritmoDaPagina;
    escrever('assets/abas.css', cssDasAbas(tokens.mediaMs, tokens.easing));
    linkDasAbas = '<link rel="stylesheet" href="assets/abas.css"/>\n';
    scriptDasAbas = `\n${SCRIPT_DAS_ABAS}`;
    avisos.push(
      `A página tem abas escritas no conteúdo criado: o compositor pôs o estilo e o alternador (clique e setas do teclado), com a transição de ${tokens.mediaMs}ms medida no CSS do kit. Sem JavaScript o conteúdo de todas as abas continua legível, empilhado.`,
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
${linkDoMovimento}${linkDosEstados}${linkDasSecoesCriadas}${linkDasAbas}${linkDoDestrave}<link rel="stylesheet" href="assets/responsivo.css"/>
<link rel="stylesheet" href="assets/marca.css"/>
<link rel="stylesheet" href="assets/ajustes.css"/>
</head>
<body>${corpoDaPagina}${comportamentoHtml}
${scriptsHtml}${scriptDoMovimento}${scriptDosEstados}${scriptDasAbas}${SCRIPT_DA_REDE_DE_SEGURANCA}
</body>
</html>`;
  // Agora sim: nada mais cresce em `concatCss`. Ver o bloco onde esta função
  // foi declarada — a folha escrita cedo demais engolia as correções.
  escreverAFolhaComposta();
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

  /**
   * A REGRA DE ACEITE do site, aplicada antes de a montagem devolver.
   *
   * É o portão que o dono pediu: "uma etapa de conferência antes de gerar o
   * site, assim a gente só sobe o que realmente passa pelas regras, e o que não
   * passar você vai estudar e tentar passar; se não tiver como, pode seguir e
   * deixar na tela de pendências".
   *
   * Por isso ela NÃO interrompe a montagem. O site é escrito de qualquer forma —
   * interromper deixaria a pessoa sem nada para olhar, e olhar é justamente como
   * se descobre o que consertar. O veredito viaja no resultado, e quem chama
   * decide: consertar o motor, ou mandar para pendências com o motivo escrito.
   *
   * O contraste NÃO é conferido aqui, e agora isso é dito em vez de fingido:
   * medi-lo exige o navegador, e a montagem é determinística e sem rede. Antes
   * a regra S4 morava neste veredito recebendo `contrastesAbaixoDoPiso: 0` — a
   * constante —, e passava verde em todo site sem olhar um par de cores. Ela
   * vive em `conferirSiteNoNavegador`, junto das outras que dependem de layout
   * resolvido, e quem não roda `pnpm conferir` fica SEM veredito sobre elas.
   */
  if (rastreadores.removidos.length > 0) {
    avisos.push(
      `${rastreadores.removidos.length} script(s) de RASTREAMENTO da empresa de origem foram removidos do site e do disco (${rastreadores.removidos.slice(0, 3).join(', ')}): eles mandavam o visitante deste site para a conta de analytics de outra empresa.`,
    );
  }
  if (rastreadores.mantidos.length > 0) {
    avisos.push(
      `${rastreadores.mantidos.length} script(s) misturam rastreamento com comportamento de verdade e NÃO puderam ser removidos inteiros (${rastreadores.mantidos.slice(0, 3).join(', ')}): separe o rastreamento no motor antes de entregar.`,
    );
  }

  if (nomesTrocados > 0) {
    avisos.push(
      `Nome da empresa de origem trocado pelo da marca em ${nomesTrocados} lugar(es): rodapé, marca-d'água e avisos de copyright entram nessa conta.`,
    );
  }

  const aceite = conferirSiteGerado({
    html: finalHtml,
    nomeDaMarca: entrada.branding.brandName ?? '',
    refsQuebradas: pendentesEmDisco,
    fotosDaOrigemMantidas: paraOAceite.fotosDaOrigem,
    videosDaOrigemMantidos: paraOAceite.videosDaOrigem,
    nomesDaOrigemNoTexto: nomesQueSobraram(finalHtml, [...nomesDeOrigemVistos]),
    rastreadoresDaOrigem: rastreadores.mantidos.length,
    gridMedido: molduraPorOrigem.size > 0,
    secoesVazias: paraOAceite.secoesVazias,
    temFavicon: faviconHref !== null,
    pecasComMovimento: entrada.kit.components.filter((c) => c.kind === 'animation').length,
    // O inventário do kit acima continua sendo o que é — inventário. O que
    // decide a S6 agora é o que a PÁGINA tem, e são estes três.
    comportamentosVivos: comportamentosVivos.length,
    comportamentosMortos,
    movimentoAoRolar,
  });
  for (const v of aceite.vereditos) {
    if (v.estado === 'passou') continue;
    avisos.push(`[aceite ${v.codigo}] ${v.titulo}: ${v.motivo}`);
  }
  /**
   * O veredito fica GRAVADO ao lado do site.
   *
   * Sem isto ele só existiria no retorno da função, e quem gerou o site pela
   * fila veria os avisos passarem no terminal e sumirem. A tela de pendências
   * precisa poder ler, depois, o que cada site deve — e o dono precisa poder
   * abrir um site de três dias atrás e saber por que ele subiu com ressalva.
   *
   * Ao lado do site, como o histórico de ajustes, e pela mesma razão: pertence
   * ÀQUELA versão, viaja no .zip e some junto quando ela é apagada.
   */
  escrever('aceite.json', JSON.stringify({ formato: 1, geradoEm: Date.now(), ...aceite }, null, 2));

  /**
   * O QUE ACONTECEU COM CADA ESTADO CAPTURADO, por escrito.
   *
   * Os `bundle/states.json` existem desde sempre e ninguém os lia: uma busca no
   * repositório inteiro achava a própria escrita e mais nada. Este arquivo é a
   * primeira vez que o conteúdo daqueles 16 arquivos (100 estados medidos) sai
   * em texto, com o motivo de cada um ter entrado ou ficado de fora. Ele vale
   * mais que os fios que liga: é por ele que se enxerga o que a captura
   * precisa melhorar.
   */
  if (derivadosDeEstado.length > 0) {
    escrever(
      'estados-derivados.json',
      JSON.stringify(
        { formato: 1, geradoEm: Date.now(), ligados: estadosLigados, estados: derivadosDeEstado },
        null,
        2,
      ),
    );
  }

  return {
    outputDir,
    arquivos,
    avisos,
    aceite,
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
