/**
 * Montagem PURA de uma seção do site a partir do bundle de um componente.
 *
 * O bundle V2 é um documento completo (doctype/head/body) com CSS em
 * `assets/css/*.css`, JS em `assets/js/*.js` e arquivos em `assets/...`;
 * o legado é um fragmento com `styles.css`. Aqui vive tudo que dá para
 * testar sem disco: extrair o corpo, tirar avisos internos do bundle,
 * reescrever referências de asset para o namespace do componente.
 */

/** Extrai o conteúdo do <body> quando o HTML é um documento completo. */
export const extrairCorpo = (html: string): string => {
  const m = html.match(/<body[^>]*>([\s\S]*)<\/body>/i);
  return (m?.[1] ?? html).trim();
};

/**
 * Os atributos crus de `<html>` e `<body>` do documento do bundle.
 *
 * O corpo da peça sai do `<body>`, e os atributos ficam para trás — mas é neles
 * que moram o tema (`class="dark"`), o fundo (`class="bg-[#03020A]"`) e a
 * tipografia base de qualquer site feito com utilitários. Sem eles, `html.dark
 * .card` e `body.bg-black .x` viram regras mortas: íntegras no arquivo, sem
 * casar com nada na tela. Os proxies do compositor os vestem de volta.
 */
export const atributosDoDocumentoDaPeca = (html: string): { html?: string; body?: string } => {
  const pegar = (tag: 'html' | 'body'): string | undefined => {
    const m = new RegExp(`<${tag}\\b([^>]*)>`, 'i').exec(html);
    const bruto = m?.[1]?.trim();
    return bruto === undefined || bruto === '' ? undefined : bruto;
  };
  const saida: { html?: string; body?: string } = {};
  const h = pegar('html');
  const b = pegar('body');
  if (h !== undefined) saida.html = h;
  if (b !== undefined) saida.body = b;
  return saida;
};

/**
 * Remove um elemento inteiro pelo atributo, contando abertura e fechamento.
 *
 * Regex não serve aqui: o bloco a remover tem `<div>` dentro, e um `[\s\S]*?`
 * pararia no primeiro `</div>`, deixando órfãos que quebram o resto da página.
 * Este varredor conta profundidade e corta no fechamento certo.
 */
const removerElementoPorAtributo = (html: string, atributo: string, tag = 'div'): string => {
  const abertura = new RegExp(`<${tag}\\b[^>]*\\b${atributo}\\b[^>]*>`, 'i');
  let saida = html;
  for (;;) {
    const inicio = abertura.exec(saida);
    if (inicio === null) return saida;
    const corpoComeca = inicio.index + inicio[0].length;
    const passo = new RegExp(`<${tag}\\b[^>]*>|</${tag}\\s*>`, 'gi');
    passo.lastIndex = corpoComeca;
    let profundidade = 1;
    let fim = -1;
    for (;;) {
      const m = passo.exec(saida);
      if (m === null) break;
      profundidade += m[0].startsWith('</') ? -1 : 1;
      if (profundidade === 0) {
        fim = m.index + m[0].length;
        break;
      }
    }
    // Sem fechamento à vista, o honesto é não mexer: cortar até o fim do
    // documento faria sumir conteúdo que nada tem a ver com o bloco.
    if (fim === -1) return saida;
    saida = saida.slice(0, inicio.index) + saida.slice(fim);
  }
};

/**
 * Extrai o MIOLO do bloco `<div data-ds-camadas-de-fundo>` de um documento.
 *
 * É o inverso complementar de `limparParaComposicao`: a limpeza tira o bloco de
 * cada peça porque numa página o fundo é da página; esta função é quem permite
 * à página TER esse fundo quando o kit não trouxe nenhuma peça de fundo — sem
 * ela, a remoção vira só perda (o vão preto que o dono viu no hero).
 *
 * Usa a mesma varredura por profundidade do removedor: o miolo tem `<div>`
 * aninhado e regex preguiçosa cortaria no primeiro `</div>`.
 */
export const extrairCamadasDeFundo = (html: string): string | null => {
  const abertura = /<div\b[^>]*\bdata-ds-camadas-de-fundo\b[^>]*>/i.exec(html);
  if (abertura === null) return null;
  const corpoComeca = abertura.index + abertura[0].length;
  const passo = /<div\b[^>]*>|<\/div\s*>/gi;
  passo.lastIndex = corpoComeca;
  let profundidade = 1;
  for (;;) {
    const m = passo.exec(html);
    if (m === null) return null;
    profundidade += m[0].startsWith('</') ? -1 : 1;
    if (profundidade === 0) {
      const miolo = html.slice(corpoComeca, m.index).trim();
      return miolo.length > 0 ? miolo : null;
    }
  }
};

/**
 * Remove o transform inline CONGELADO da captura em elementos de parallax.
 *
 * O coletor grava o estado do DOM no instante do print, e um elemento com
 * `data-parallax` chega com `style="transform: translate(9.9px, -9.8px)"` —
 * a posição da rolagem em que a captura estava. Na página composta o script de
 * parallax da origem viaja junto e reaplica o transform a cada rolagem; o
 * valor congelado só serve para a peça nascer deslocada antes do primeiro
 * evento. Elementos SEM `data-parallax` não são tocados: transform estático
 * pode ser design (rotate de um cartão, por exemplo).
 */
export const limparTransformCongelado = (html: string): string =>
  html.replace(/<[^>]*\bdata-parallax\b[^>]*>/gi, (tag) =>
    tag.replace(/\bstyle\s*=\s*"([^"]*)"/i, (_m, estilo: string) => {
      const limpo = estilo
        .split(';')
        .map((d) => d.trim())
        .filter((d) => d.length > 0 && !/^transform\s*:/i.test(d))
        .join(';');
      return limpo.length > 0 ? `style="${limpo}"` : '';
    }),
  );

/**
 * As classes que um observador de rolagem ACRESCENTA quando o elemento aparece.
 *
 * A lista é curta de propósito. `active`, `show`, `open` e `selected` também são
 * classes de estado, e ficaram DE FORA porque abrem aba, menu e carrossel: tirar
 * uma delas não devolveria movimento nenhum, fecharia o menu que devia estar
 * aberto. Aqui só entra nome que, na prática, um site usa para uma coisa só.
 */
const CLASSES_DE_REVELACAO = [
  'is-visible',
  'is-inview',
  'in-view',
  'aos-animate',
  'revealed',
  'scroll-visible',
  'animate-in',
] as const;

/**
 * Devolve ao elemento o estado ANTES da revelação — mas só se alguém for revelá-lo.
 *
 * ## O defeito, medido
 *
 * O coletor grava o DOM no instante do print, e nesse instante o observador de
 * rolagem já correu a página inteira. Todo elemento de reveal chega com a classe
 * final aplicada: 9 marcas de `is-visible` num dos sites do acervo, 18 em outro.
 * O CSS que faz o movimento (`.reveal{opacity:0}` / `.reveal.is-visible{opacity:1}`)
 * viaja inteiro e correto, o script viaja, o observador registra os elementos —
 * e não tem o que fazer, porque todos já estão no estado final. A página nasce
 * pronta e nunca se mexe. Nada disso aparece como erro.
 *
 * ## Por que a limpeza é CONDICIONAL
 *
 * Tirar a classe sem mais nada é pior que deixar. Medido num site gerado: com a
 * classe removida à mão, o elemento fica em `opacity:0` — e se o script que a
 * reaplica não estiver na página, ele fica invisível PARA SEMPRE. A página
 * parada vira a página vazia.
 *
 * Então a classe só sai quando as duas provas estão na mão: algum script local
 * da página cita aquele nome, e algum script local usa `IntersectionObserver`.
 * É a mesma disciplina de `limparTransformCongelado`, que só limpa o transform
 * de quem tem `data-parallax` porque é esse atributo que prova que existe script
 * para reaplicá-lo.
 */
export const limparEstadoRevelado = (
  html: string,
  scripts: readonly string[],
): { html: string; limpas: number; classes: string[] } => {
  const todo = scripts.join('\n');
  if (!todo.includes('IntersectionObserver')) return { html, limpas: 0, classes: [] };
  // O nome tem de aparecer como STRING no script — é assim que `classList.add`
  // o recebe. Procurar solto casaria com um comentário ou com outra palavra.
  const reveladas = CLASSES_DE_REVELACAO.filter(
    (c) => todo.includes(`'${c}'`) || todo.includes(`"${c}"`) || todo.includes(`\`${c}\``),
  );
  if (reveladas.length === 0) return { html, limpas: 0, classes: [] };

  const alvo = new Set<string>(reveladas);
  let limpas = 0;
  const saida = html.replace(/\bclass\s*=\s*"([^"]*)"/gi, (inteiro, valor: string) => {
    const mantidas = valor.split(/\s+/).filter((c) => c.length > 0 && !alvo.has(c));
    if (mantidas.length === valor.split(/\s+/).filter((c) => c.length > 0).length) return inteiro;
    limpas += 1;
    return mantidas.length > 0 ? `class="${mantidas.join(' ')}"` : 'class=""';
  });
  return { html: saida, limpas, classes: reveladas };
};

/**
 * Prepara o corpo do bundle para virar parte de uma página.
 *
 * Três coisas saem:
 *
 * 1. `<aside data-ds-aviso>` — conversa da Galeria com o usuário, não conteúdo
 *    do site gerado.
 * 2. `<link rel=stylesheet>` — o CSS entra concatenado.
 * 3. `<div data-ds-camadas-de-fundo>` — e este é o que mais importa. O motor
 *    embute nele as camadas `position:fixed` que passavam atrás daquela dobra,
 *    para a peça, vista SOZINHA na Galeria, aparecer com o fundo que ela tinha
 *    no site. Numa página montada isso vira duplicata: cada peça arrasta uma
 *    cópia do fundo da própria origem. O sintoma mais feio era a navegação, que
 *    tem poucos pixels de altura e chegava carregando um canvas de tela cheia
 *    junto: o que devia ser uma barra virava uma dobra inteira. Numa página, o
 *    fundo é da PÁGINA, e quem o coloca uma vez só é `envolverCamadaDePagina`.
 */
export const limparParaComposicao = (corpo: string): string =>
  removerElementoPorAtributo(
    corpo
      .replace(/<aside[^>]*data-ds-aviso[\s\S]*?<\/aside>/gi, '')
      .replace(/<link[^>]*rel=["']stylesheet["'][^>]*>/gi, ''),
    'data-ds-camadas-de-fundo',
  ).trim();

/**
 * Reescreve referências de asset do HTML para o namespace do componente:
 * `assets/x` vira `assets/<cmpId>/x` — cada componente leva os próprios
 * arquivos sem colidir com os dos outros.
 */
export const reescreverRefsHtml = (html: string, cmpId: string): string =>
  html.replace(/(src|href|poster)=(["'])assets\//gi, `$1=$2assets/${cmpId}/`);

/**
 * Reescreve url() do CSS concatenado para caminhos relativos À PRÓPRIA FOLHA.
 *
 * A folha composta vive em `assets/styles.css`, e url() de CSS resolve contra
 * a URL DA FOLHA, não contra a página. A versão anterior escrevia
 * `url(assets/<cmpId>/x)` — que o navegador resolvia para `assets/assets/…`,
 * e TODA fonte e imagem referenciada pelo CSS composto respondia 404 em
 * silêncio (fonte cai no fallback sem erro na tela; medido na prévia do kit:
 * 129 refs quebradas). Relativo à folha, `<cmpId>/x` resolve para
 * `assets/<cmpId>/x`, que é onde os assets da peça foram copiados.
 */
export const reescreverRefsCss = (css: string, cmpId: string): string =>
  // `assets/` primeiro; `../` depois — a saída do segundo introduz o namespace
  // e não pode ser reprocessada pelo primeiro.
  css
    .replace(/url\(\s*(["']?)assets\//gi, `url($1${cmpId}/`)
    .replace(/url\(\s*(["']?)\.\.\//gi, `url($1${cmpId}/`);

/**
 * Envelopa a seção com a proveniência explícita que o produto exige.
 *
 * Uma seção pode levar VÁRIAS peças agora, então `data-componente` lista os ids
 * separados por espaço e `data-origem` ganhou um terceiro valor: `misto`, para o
 * caso em que parte da seção veio do kit e parte foi criada no estilo. Dizer
 * "biblioteca" numa seção meio inventada seria mentir sobre a procedência, que é
 * justamente o que estes atributos existem para registrar.
 *
 * `data-secao-id` carrega o id da seção do usuário. Sem ele, duas seções do
 * mesmo papel produziriam dois `data-secao="hero"` indistinguíveis, e âncoras e
 * `querySelector` pegariam sempre a primeira.
 */
export const envolverSecao = (
  corpo: string,
  dados: {
    role: string;
    secaoId?: string;
    componentIds: readonly string[];
    criouAlgo?: boolean;
    /**
     * A peça desta seção era sticky/fixed na origem. Na composição o proxy e a
     * `<section>` viram o containing block dela — exatamente da altura da
     * própria peça, onde sticky não tem para onde grudar. O atributo permite ao
     * CSS base da página promover a SEÇÃO a sticky, devolvendo o comportamento
     * que a origem tinha (a nav que acompanha a rolagem).
     */
    fixaNoTopo?: boolean;
  },
): string => {
  const origem =
    dados.componentIds.length === 0 ? 'gerado' : dados.criouAlgo === true ? 'misto' : 'biblioteca';
  const cmp =
    dados.componentIds.length > 0 ? ` data-componente="${dados.componentIds.join(' ')}"` : '';
  const sid = dados.secaoId !== undefined ? ` data-secao-id="${dados.secaoId}"` : '';
  const fixa = dados.fixaNoTopo === true ? ' data-fixa-no-topo' : '';

  return `<section data-secao="${dados.role}"${sid} data-origem="${origem}"${cmp}${fixa}>\n${corpo}\n</section>`;
};

/**
 * Embrulha as peças de fundo da página numa camada fixa atrás de tudo.
 *
 * Na origem essas peças (categoria `background`, kind `effect`) eram uma
 * camada que atravessa a página inteira; postas no fluxo como `<section>`,
 * colapsam numa faixa. O engine-v2 já recompõe o conceito DENTRO do bundle
 * (`data-ds-camadas-de-fundo`); este embrulho é o par do lado do site gerado,
 * para a peça que `separarCamadasDePagina` (de `@ds/shared`) promoveu a
 * camada da página.
 *
 * Cada propriedade do estilo tem um porquê:
 * - `position:fixed` + `inset:0`: a camada cobre a viewport inteira e segue
 *   presente durante toda a rolagem — é a limitação que o próprio bundle
 *   declara: o fundo atravessa a página, não uma dobra.
 * - `z-index:-1`: atrás de TODO o conteúdo, sem depender da posição no DOM
 *   nem exigir z-index no resto da página.
 * - `pointer-events:none`: fundo é decoração; ele não pode roubar o clique
 *   de um link ou botão que passa por cima.
 * - `overflow:hidden`: efeito que desenha além da borda (partícula, blob
 *   animado) não pode criar rolagem horizontal — requisito do mobile.
 *
 * `aria-hidden="true"` porque a camada é puramente decorativa: leitor de tela
 * não tem o que anunciar ali.
 *
 * O `corpo` chega aqui JÁ vestido nos dois proxies do compositor
 * (`data-ds-raiz`/`data-ds-corpo`): o CSS de origem precisa casar dentro da
 * camada do mesmo jeito que casa dentro de uma seção — o embrulho não pode
 * despir a peça.
 *
 * `herdada` distingue os DOIS fundos possíveis, que merecem tratamento oposto:
 *
 * - **peça de fundo promovida** pelo usuário: ele a escolheu PELA aparência,
 *   então ela entra inteira, cor de origem e tudo;
 * - **camada HERDADA da origem dominante** (o kit não trouxe peça de fundo):
 *   ninguém escolheu aquelas cores, elas vieram de carona com as peças. Aqui a
 *   camada é decoração a ser vestida com a marca — o atributo permite ao CSS
 *   base apagar o fundo chapado da origem (que pintaria a página inteira da cor
 *   do site de onde as peças saíram) e girar a matiz do que resta.
 */
export const envolverCamadaDePagina = (
  corpo: string,
  dados: { componentIds: readonly string[]; herdada?: boolean },
): string =>
  `<div data-ds-camadas-de-pagina${dados.herdada === true ? ' data-ds-camada-herdada' : ''} aria-hidden="true" data-componente="${dados.componentIds.join(' ')}" style="position:fixed;inset:0;z-index:-1;pointer-events:none;overflow:hidden">\n${corpo}\n</div>`;

/**
 * Sem isto, o fundo da página existe e ninguém o vê.
 *
 * O compositor veste cada peça em dois proxies e copia para o de corpo as
 * classes do `<body>` da origem. Entre elas vem a cor de fundo da página de
 * onde a peça saiu (num dos sites capturados, `bg-[#03020A]`, um preto quase
 * puro). O resultado é que cada peça pinta um retângulo opaco do tamanho dela,
 * e o fundo da página — camada herdada ou o `body` pintado pela marca — fica
 * atrás de todos eles.
 *
 * A regra morava dentro de `envolverCamadaDePagina` e só existia quando a
 * página TINHA camada — página sem camada nenhuma voltava a mostrar um fundo
 * por seção (o "não integrado" que o dono apontou). Agora ela é da BASE da
 * página composta: emitida sempre, por `montarPaginaDoKit`.
 *
 * O alcance cobre os quatro embrulhos que o compositor mesmo cria — a
 * `<section>`, o proxy de raiz (o `<html>` da origem também carrega fundo), o
 * proxy de corpo e o envelope `[data-ds-criado]` das seções criadas no estilo.
 * O que ela NÃO toca é tão importante quanto o que toca:
 *
 * - o fundo próprio de cada elemento interno da peça continua, porque ele é da
 *   peça e não da página de origem;
 * - o proxy da camada de fundo fica de fora do seletor (ele não vive dentro de
 *   `[data-secao]`), então um fundo feito só de gradiente no corpo sobrevive;
 * - o conteúdo DENTRO de `[data-ds-criado]` segue mandando nos próprios
 *   cartões e molduras — só o envelope é transparente.
 *
 * `!important` porque a classe da origem e este seletor têm a mesma força, e
 * quem ganha passa a depender da ordem em que o CSS foi concatenado. Empate
 * decidido por acaso é defeito que volta sozinho.
 */
export const REGRA_QUE_ABRE_PASSAGEM =
  '[data-secao],[data-secao]>[data-ds-raiz],[data-secao] [data-ds-corpo],[data-ds-criado]{background-color:transparent!important;background-image:none!important}';

/**
 * A TINTA padrão da página composta é a da marca, não a da origem.
 *
 * É o par obrigatório da regra acima. O compositor tira o fundo do `<body>` da
 * origem para a página ser uma superfície só — e a cor de TEXTO daquele mesmo
 * `<body>`, que os proxies também vestem, continuava valendo e descia por
 * herança até o último parágrafo. Num caso real, o título herdou `#2c1810` (a
 * tinta escura de um site que tinha seções claras) e foi parar sobre o fundo
 * `#14110e` da marca: razão de contraste 1,2:1, texto invisível.
 *
 * Trocar a superfície e manter a tinta é meia troca. Aqui ela se completa.
 *
 * Sem `!important` de propósito: isto é o PADRÃO, não uma imposição. Qualquer
 * elemento que declare a própria cor — e o `escoparCss` os preserva — continua
 * mandando nela. O que morre é só a herança cega do corpo de origem, e a
 * especificidade basta para isso: o escopo sai em `:where()`, que não pontua.
 */
export const REGRA_DA_TINTA_DA_MARCA =
  '[data-secao]>[data-ds-raiz],[data-secao] [data-ds-corpo],[data-ds-criado]{color:var(--marca-body)}';
