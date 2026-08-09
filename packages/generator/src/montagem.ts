import { ROTULO_DE_PAPEL } from '@ds/shared/schemas';
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

  /**
   * A TERCEIRA prova: o script tem de ALCANÇAR esta página.
   *
   * As duas provas acima — existe `IntersectionObserver`, e algum script cita a
   * classe — dizem que o revelador existe. Não dizem que ele encontra alguém.
   * E é aí que estava o pior defeito que o banco de prova achou: em **8 de 12
   * kits**, uma seção inteira saía com `opacity: 0` e ficava **invisível para
   * sempre**.
   *
   * A mecânica é a mesma do site que não se mexia: o CSS da origem é escopado
   * por origem e o script procura por classe. Quando a peça que revela vem de
   * uma origem e as seções vêm de outra, `querySelectorAll` volta vazio. Só que
   * aqui o estrago é maior: lá o conteúdo aparecia e não animava; aqui a classe
   * final é tirada, ninguém a devolve, e o texto some.
   *
   * O comentário desta função já previa o risco por extenso — *"se o script que
   * a reaplica não estiver na página, ele fica invisível PARA SEMPRE"* — e a
   * guarda que ele descrevia cobria só metade dele. Esta é a outra metade.
   *
   * Sem alcance, a classe FICA. O site nasce sem a animação de entrada, que é
   * uma perda pequena e visível; a alternativa é uma seção em branco, que é uma
   * perda grande e silenciosa.
   */
  if (!comportamentoAlcancaAPagina(html, alvosDoComportamento(scripts))) {
    return { html, limpas: 0, classes: [] };
  }

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
 * As coleções de ícone que são, na verdade, CATÁLOGOS DE LOGOTIPO de empresa.
 *
 * `simple-icons` é o caso puro: cada ícone dela É a marca de uma empresa real.
 * `logos` e `skill-icons` são da mesma natureza. Um ícone dessas coleções num
 * site de cliente não é decoração — é o logotipo de outra companhia.
 */
const COLECOES_DE_MARCA = ['simple-icons', 'logos', 'skill-icons'];

/**
 * As marcas que FICAM, porque no rodapé elas não são marca de terceiro: são o
 * endereço do próprio cliente.
 *
 * Isto nasceu de um falso positivo medido na primeira versão desta função. Ela
 * tirou, junto com os quatro parceiros do museu, o `instagram`, o `facebook`, o
 * `youtube` e o `x` do rodapé — que eram exatamente os links sociais DO CLUBE.
 * O ícone da rede é a placa do link, não a propaganda da rede.
 *
 * A régua, então, não é "de que coleção veio", é PARA QUE SERVE: ícone de
 * plataforma onde a marca do cliente tem perfil é afordância de navegação;
 * logotipo de empresa numa fileira de "parceiros" é conteúdo da origem.
 */
const PLATAFORMAS_DE_CONTATO = new Set([
  'instagram',
  'facebook',
  'x',
  'twitter',
  'youtube',
  'linkedin',
  'tiktok',
  'whatsapp',
  'telegram',
  'pinterest',
  'threads',
  'spotify',
  'github',
  'gitlab',
  'discord',
  'twitch',
  'behance',
  'dribbble',
  'medium',
  'reddit',
  'snapchat',
  'kwai',
  'maps',
  'googlemaps',
  'waze',
  'gmail',
  'googlemybusiness',
]);

/**
 * Tira do corpo os LOGOTIPOS DE TERCEIRO que a peça trouxe da origem.
 *
 * O defeito foi visto pelo dono no primeiro site do clube: uma faixa "Operado
 * por" (na origem, "Em parceria com") exibindo British Museum, Sotheby's,
 * ArtStation e Kickstarter — os parceiros de um template de MUSEU, agora no
 * hero de um time de futebol.
 *
 * Por que nada pegava isso: a troca de mídia só enxerga `<img>` e `<video>` com
 * `src` dentro de `assets/<cmpId>/`, e estes são `<iconify-icon>` ou `<svg>`
 * inline — a regex estruturalmente não casa. Pelo texto também não havia como:
 * marca pictórica não tem texto, e "Sotheby's" nunca entraria na lista de nomes
 * da origem, que só conhece o nome de quem FEZ o template.
 *
 * O que resolve é o sinal que a captura já grava e ninguém lia:
 * `data-ds-icone-origem="simple-icons:sothebys"` diz, por extenso, de que
 * coleção o ícone veio. Coleção de logotipo → é marca de terceiro, e sai.
 *
 * Sai o ELEMENTO inteiro, não só o desenho: deixar a casca vazia manteria o
 * respiro de um logotipo que não existe mais, e a fileira ficaria com buracos
 * regulares — pior que encurtar. A fileira é `flex-wrap`, então ela encolhe sem
 * desmontar. E o que saiu é DITO, para virar decisão de quem monta o kit.
 */
/**
 * Troca o MONOGRAMA da origem pelo logotipo da marca.
 *
 * ## O defeito
 *
 * Nem todo logotipo é `<img>`. Um site feito com utilitárias costuma desenhar a
 * marca como uma LETRA dentro de um quadrado: um `<div class="w-8 h-8
 * rounded-full">` com um `<span>M</span>` dentro. Para a troca de mídia isso é
 * invisível — ela só enxerga `<img>` e `<video>` —, e para a troca de texto
 * também, porque "M" não é o nome de empresa nenhuma.
 *
 * O dono viu o "M" na barra de navegação de um clube que TEM escudo. Consertei
 * aquele caso com uma substituição escrita à mão no `entrada-geracao.json`, e
 * então medi o site: sobravam **outros dois** — o mesmo monograma reaparece no
 * avatar do depoimento e no balão de conversa. Substituição por site conserta um
 * lugar; o defeito é da classe.
 *
 * ## A régua, e por que ela é estreita
 *
 * Só troca o que é INEQUIVOCAMENTE um selo de marca: caixa pequena (até 16 na
 * escala de utilitárias), quadrada ou redonda, e cujo conteúdo inteiro é uma ou
 * duas LETRAS MAIÚSCULAS. Um "4" de contador, um "GG" de tamanho de camisa numa
 * caixa grande, ou uma caixa com palavra dentro não entram.
 *
 * Sem logotipo da marca, nada acontece: trocar a letra por vazio deixaria um
 * círculo oco, que é pior que a letra errada.
 */
export const trocarMonogramaDaOrigem = (
  corpo: string,
  logo: { src: string; alt: string } | null,
): { html: string; trocados: number } => {
  if (logo === null) return { html: corpo, trocados: 0 };
  let trocados = 0;
  // A caixa: `w-8 h-8`… até `w-16 h-16`, com canto arredondado. As duas classes
  // de tamanho têm de bater — caixa que não é quadrada não é selo de marca.
  /*
    Só o `<div>` MAIS INTERNO casa, e o veto de aninhamento é o que garante isso.
    Sem ele a expressão casava qualquer div e CONSUMIA a região inteira, então o
    selo lá dentro nunca era visitado — medido: de dois monogramas trocados
    passou para um, com dois sobrando. É a mesma armadilha do `String.replace`
    que a poda de container já tinha ensinado.
  */
  const html = corpo.replace(
    /(<div\b[^>]*\bclass="([^"]*)"[^>]*>)((?:(?!<\/?div\b)[\s\S]){0,200}?)(<\/div>)/gi,
    (inteiro, abre: string, classes: string, dentro: string, fecha: string) => {
      /**
       * A ordem das classes NÃO importa — e supor que importava deixou um
       * monograma passar.
       *
       * A primeira versão exigia `w-N` antes de `h-N` na mesma expressão. No
       * site do clube havia um `h-10 w-10`, altura primeiro, e ele atravessou
       * intacto: dois monogramas trocados e um sobrando. Quem escreve utilitária
       * não segue ordem nenhuma, então a checagem é por presença.
       */
      const tam = /\bw-(8|10|12|14|16)\b/.exec(classes)?.[1];
      if (tam === undefined) return inteiro;
      if (!new RegExp(`\\bh-${tam}\\b`).test(classes)) return inteiro;
      if (!/\brounded[\w-]*\b/.test(classes)) return inteiro;
      // O conteúdo inteiro, sem tags: tem de ser uma ou duas maiúsculas.
      const texto = dentro.replace(/<[^>]*>/g, '').trim();
      if (!/^[A-ZÀ-Þ]{1,2}$/.test(texto)) return inteiro;
      // Uma `<img>` já ali significa que o slot foi resolvido por outro caminho.
      if (/<img\b/i.test(dentro)) return inteiro;
      trocados += 1;
      return `${abre}<img src="${logo.src}" alt="${logo.alt}" style="width:100%;height:100%;object-fit:contain">${fecha}`;
    },
  );
  return { html, trocados };
};

export const removerMarcasDeTerceiro = (corpo: string): { html: string; removidas: string[] } => {
  const removidas: string[] = [];
  const daColecaoDeMarca = (tag: string): string | null => {
    const m = /\b(?:data-ds-icone-origem|icon)\s*=\s*"([^"]+)"/i.exec(tag);
    const nome = m?.[1];
    if (nome === undefined) return null;
    const [colecao, marca] = nome.toLowerCase().split(':');
    if (colecao === undefined || !COLECOES_DE_MARCA.includes(colecao)) return null;
    // Rede social e mapa ficam: ali o ícone é a placa do link do cliente.
    if (marca !== undefined && PLATAFORMAS_DE_CONTATO.has(marca)) return null;
    return nome;
  };
  /**
   * O buraco é MARCADO em vez de apagado direto — e é isso que permite podar.
   *
   * Apagar e pronto deixou, no site do clube, o rótulo "OPERADO POR" sozinho
   * sobre uma fileira vazia: um título anunciando nada. Trocar por vazio é
   * justamente o que a doutrina do projeto proíbe. Com a marca no lugar, dá
   * para saber QUAIS containers ficaram ocos por causa da remoção — e só esses
   * são podados. Um `<div>` que já era vazio antes (espaçador, moldura
   * decorativa) não tem marca dentro e não é tocado.
   */
  const MARCA = '<!--ds-marca-de-terceiro-removida-->';
  // `<iconify-icon …></iconify-icon>` e `<span …><svg>…</svg></span>`: as duas
  // formas que a captura produz para o MESMO ícone, conforme o runtime da
  // origem tenha ou não terminado de desenhar antes do instantâneo.
  let html = corpo
    .replace(/<iconify-icon\b[^>]*>[\s\S]*?<\/iconify-icon>/gi, (bloco) => {
      const nome = daColecaoDeMarca(bloco);
      if (nome === null) return bloco;
      removidas.push(nome);
      return MARCA;
    })
    .replace(/<span\b[^>]*>[\s\S]*?<\/span>/gi, (bloco) => {
      const nome = daColecaoDeMarca(bloco);
      if (nome === null) return bloco;
      removidas.push(nome);
      return MARCA;
    });

  if (removidas.length > 0) {
    /**
     * Poda: o container que ficou SÓ com marcas some, e a marca sobe no lugar
     * dele — assim a fileira vazia vira marca, e o pai que só tinha a fileira e
     * um rótulo curto some também. É o que apaga o "OPERADO POR" órfão.
     *
     * O rótulo curto tem teto (60 caracteres) porque isso é uma ETIQUETA de
     * fileira, não conteúdo: um parágrafo de verdade nunca é levado junto.
     * A poda repete até parar de mudar, com teto de voltas — HTML torto não
     * pode virar laço infinito.
     */
    const soMarcasEEspaco = (dentro: string): boolean =>
      dentro.split(MARCA).join('').trim().length === 0;
    const soMarcasERotuloCurto = (dentro: string): boolean => {
      const semMarcas = dentro.split(MARCA).join('');
      const rotulo = /^\s*<(p|span|h[1-6])\b[^>]*>([^<]{0,60})<\/\1>\s*$/i.exec(semMarcas);
      return rotulo !== null;
    };
    /**
     * Casa o container mais interno — e o veto de aninhamento é só de BLOCO.
     *
     * Duas correções medidas moram nesta linha:
     *
     * 1. Vetar só a PRÓPRIA tag não bastava: uma `<section>` casava primeiro e
     *    engolia a fileira inteira. Como ela tinha outro conteúdo, voltava sem
     *    mudar — e `String.replace` CONSOME a região casada, então o `<div>` de
     *    dentro nunca era visitado, e nada era podado.
     * 2. Vetar TODOS, inclusive `<p>`, também não servia: o rótulo órfão É um
     *    `<p>`, então o pai que tinha rótulo + fileira nunca casava, e o
     *    "Operado por" sobrevivia sozinho — exatamente o defeito a consertar.
     *
     * Por isso o veto lista só os blocos (`div/ul/li/section/aside`): o rótulo
     * passa como conteúdo e pode ser levado junto, e cada volta do laço sobe um
     * nível na árvore.
     */
    const CONTAINERS =
      /<(div|ul|li|p|section|aside)\b[^>]*>((?:(?!<\/?(?:div|ul|li|section|aside)\b)[\s\S])*?)<\/\1>/gi;
    for (let volta = 0; volta < 6; volta++) {
      const antes = html;
      html = html.replace(CONTAINERS, (bloco, _tag: string, dentro: string) => {
        if (!dentro.includes(MARCA)) return bloco;
        return soMarcasEEspaco(dentro) || soMarcasERotuloCurto(dentro) ? MARCA : bloco;
      });
      if (html === antes) break;
    }
    html = html.split(MARCA).join('');
  }
  return { html, removidas };
};

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

/**
 * Os SELETORES que os scripts de uma peça de comportamento saem procurando.
 *
 * Isto existe porque um comportamento pode chegar à página inteiro — CSS na
 * cascata, script no fim do body, tudo copiado, nenhum aviso — e ainda assim
 * não fazer NADA. Medido no site do clube: a única peça de comportamento do kit
 * ("Revelar ao rolar", origem `ds_01KZEQ2GW3RPGGWNRZEKCBFVX9`) trouxe dois
 * scripts, um procurando `.scroll-item` e o outro `[data-counter-target]`.
 * Ocorrências dos dois no `index.html` gerado: **0 e 0**. O CSS dela também
 * casava zero, porque sai escopado na origem dela e nenhuma seção da página
 * veio daquela origem.
 *
 * Não é azar daquele site: só 5 das 55 origens da Biblioteca têm peça de
 * comportamento, e nenhum dos 12 kits usa uma dessas 5 como origem de seção.
 * Comportamento estrangeiro é o caso NORMAL — e um comportamento estrangeiro é
 * classe CSS + script que a alterna em quem a carrega. Quem não carrega a
 * classe não é alcançado por conserto de escopo nenhum.
 *
 * O que se lê aqui é só o literal: `querySelector('…')` e
 * `querySelectorAll('…')`, nas três aspas. Seletor montado por concatenação
 * escapa, e escapar é o lado certo do erro — a decisão que isto alimenta
 * degrada para "não dá para provar que morreu".
 */
export const alvosDoComportamento = (scripts: readonly string[]): string[] => {
  const achados: string[] = [];
  const padrao = /querySelector(?:All)?\(\s*(['"`])([^'"`]+)\1/g;
  for (const s of scripts) {
    for (const m of s.matchAll(padrao)) {
      const sel = (m[2] ?? '').trim();
      if (sel !== '' && !achados.includes(sel)) achados.push(sel);
    }
  }
  return achados;
};

/**
 * O comportamento ALCANÇA algum elemento desta página?
 *
 * A prova é por token, não por `querySelector` de verdade: aqui não há DOM, e
 * a montagem é determinística e sem navegador. Cada seletor é quebrado no que
 * ele exige do HTML — `.x` exige a classe `x`, `#z` exige `id="z"`, `[data-y]`
 * exige o atributo `data-y` — e basta UM desses tokens existir no documento
 * para o comportamento ser considerado vivo.
 *
 * Duas degradações deliberadas, e as duas erram para "vivo":
 *
 * - lista de seletores VAZIA devolve `true`. Script que monta o seletor por
 *   concatenação, ou que trabalha por `addEventListener` no documento, não
 *   deixa literal para ler. Não dá para provar a morte, então ninguém é
 *   acusado dela.
 * - seletor que não pede classe, id nem atributo (`'section'`, `'a'`) também
 *   conta como alcance: um seletor de tag acha alguma coisa em qualquer página.
 *
 * É a mesma disciplina de `limparEstadoRevelado`: só age com a prova na mão,
 * porque o custo do falso positivo (apagar em silêncio um comportamento que
 * funcionava) é maior que o do falso negativo (um aviso a menos).
 */
export const comportamentoAlcancaAPagina = (
  html: string,
  seletores: readonly string[],
): boolean => {
  if (seletores.length === 0) return true;

  const classes = new Set<string>();
  for (const m of html.matchAll(/\bclass\s*=\s*"([^"]*)"/gi)) {
    for (const c of (m[1] ?? '').split(/\s+/)) if (c !== '') classes.add(c);
  }
  const ids = new Set<string>();
  for (const m of html.matchAll(/\bid\s*=\s*"([^"]*)"/gi)) {
    const v = (m[1] ?? '').trim();
    if (v !== '') ids.add(v);
  }

  for (const sel of seletores) {
    const pedeClasse = [...sel.matchAll(/\.([\w-]+)/g)].map((m) => m[1] ?? '');
    const pedeId = [...sel.matchAll(/#([\w-]+)/g)].map((m) => m[1] ?? '');
    const pedeAtributo = [...sel.matchAll(/\[\s*([\w-]+)/g)].map((m) => m[1] ?? '');
    if (pedeClasse.length + pedeId.length + pedeAtributo.length === 0) return true;
    if (pedeClasse.some((c) => classes.has(c))) return true;
    if (pedeId.some((i) => ids.has(i))) return true;
    if (pedeAtributo.some((a) => new RegExp(`\b${a}\b`, 'i').test(html))) return true;
  }
  return false;
};

/**
 * Devolve a VISIBILIDADE ao que ficou esperando um revelador que não veio.
 *
 * ## O defeito, medido
 *
 * Nos 20 sites de prova: **362 trechos de texto invisíveis**, e a regra S13
 * reprovando em 31 das 40 larguras. Os elementos têm nome de revelação —
 * `gsap-fade-up`, `pc-hidden-content`, `stack-card`, `testimonial` — e estão
 * todos em opacidade ZERO.
 *
 * É primo do que `limparEstadoRevelado` já conserta, e a diferença importa. Lá o
 * elemento chegou com a classe FINAL aplicada e bastava tirá-la para a animação
 * poder acontecer. Aqui ele chegou no estado INICIAL — invisível de propósito —
 * esperando o script da origem levantar a opacidade. O script não viajou, ou
 * viajou e não alcança ninguém nesta página, e o texto fica invisível para
 * sempre.
 *
 * ## A prova é a mesma
 *
 * Não basta o elemento estar em `opacity: 0`: isso é legítimo enquanto houver
 * quem o revele. A pergunta é a que `comportamentoAlcancaAPagina` já responde —
 * *algum script que viajou alcança alguém aqui?* Sem alcance, ninguém vai
 * levantar aquela opacidade, e mantê-la é escolher a seção em branco.
 *
 * ## Por que uma regra no fim da folha, e não uma edição no HTML
 *
 * A regra da origem continua lá, intacta e legível, e o override é declarado. Um
 * `!important` seria necessário se a origem tivesse usado um — e ela usa. O
 * escopo é a origem, então nada vaza para as outras peças da página.
 *
 * Degrada para o que a peça já tinha: perde-se a animação de ENTRADA, que é uma
 * perda pequena e visível. A alternativa é texto invisível, que é uma perda
 * grande e silenciosa.
 */
export const destravarOpacidadeSemRevelador = (
  css: string,
  scripts: readonly string[],
  html: string,
): { css: string; destravadas: string[] } => {
  /**
   * A pergunta é por CLASSE, não pela página.
   *
   * A primeira versão usava `comportamentoAlcancaAPagina`, que responde "algum
   * script alcança alguém aqui?". Numa página composta de seis origens isso é
   * quase sempre SIM — basta um script de outra origem encontrar um elemento —
   * e o destravamento nunca disparava. Medido: zero regras emitidas nos 20
   * sites, com 362 textos ainda invisíveis.
   *
   * A pergunta certa é a que decide o destino daquele elemento: **alguém
   * menciona ESTA classe?** É o mesmo teste que `limparEstadoRevelado` já faz —
   * o nome tem de aparecer como string no script, porque é assim que
   * `classList.add` e `querySelectorAll` o recebem.
   */
  const todoScript = scripts.join('\n');
  /**
   * As DUAS formas contam: `classList.add('x')` cita o nome nu, e
   * `querySelectorAll('.x')` cita com o ponto. Procurar só uma delas deixa
   * passar metade — o próprio teste da suíte pegou isso.
   */
  const alguemRevela = (classe: string): boolean => {
    for (const forma of [classe, `.${classe}`]) {
      if (
        todoScript.includes(`'${forma}'`) ||
        todoScript.includes(`"${forma}"`) ||
        todoScript.includes(`\`${forma}\``)
      ) {
        return true;
      }
    }
    return false;
  };

  const classes = new Set<string>();
  for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const seletor = m[1] ?? '';
    const corpo = m[2] ?? '';
    const op = /(?:^|[;\s])opacity\s*:\s*(0|0?\.0*[0-9])(?:\s|;|!|$)/i.exec(corpo);
    if (op === null) continue;
    /**
     * `pointer-events: none` junto da opacidade zero diz HOVER, não revelação.
     *
     * É a assinatura de conteúdo que aparece quando o ponteiro chega — um
     * cartão de preço que abre as vantagens, uma legenda sobre a foto. Medido
     * num site de prova: `.pc-hidden-content{opacity:0;pointer-events:none}`
     * com `.pricing-card:hover .pc-hidden-content{opacity:1}`.
     *
     * Destravar isso não conserta nada e QUEBRA o desenho: o cartão passaria a
     * mostrar tudo de uma vez. Quem não recebe clique não está esperando script
     * nenhum — está esperando o ponteiro.
     */
    if (/pointer-events\s*:\s*none/i.test(corpo)) continue;
    // Só classe simples: seletor com estado (`:hover`) ou descendente descreve
    // uma situação, não o repouso — e mexer nele mudaria o comportamento.
    for (const c of seletor.matchAll(/(?:^|[,\s])\.((?:\\.|[\w-])+)\s*(?=,|\{|$)/g)) {
      const nome = (c[1] ?? '').replace(/\\/g, '');
      if (nome !== '') classes.add(nome);
    }
  }
  if (classes.size === 0) return { css: '', destravadas: [] };

  // Só o que EXISTE no HTML desta peça: regra para classe ausente é peso morto.
  const noHtml = new Set<string>();
  for (const m of html.matchAll(/\bclass\s*=\s*"([^"]*)"/gi)) {
    for (const c of (m[1] ?? '').split(/\s+/)) if (c !== '') noHtml.add(c);
  }
  const alvo = [...classes].filter((c) => noHtml.has(c) && !alguemRevela(c));
  if (alvo.length === 0) return { css: '', destravadas: [] };

  const seletores = alvo.map((c) => `.${c.replace(/([^\w-])/g, '\\$1')}`).join(',');
  return {
    css: `\n/* Sem revelador que alcance esta página, a opacidade inicial fica para sempre. */\n${seletores}{opacity:1 !important}\n`,
    destravadas: alvo,
  };
};

/**
 * A RAIZ da peça volta para o fluxo dentro da seção.
 *
 * ## O defeito, medido
 *
 * Um `<header class="fixed top-0">` é a coisa mais comum que existe numa nav. Na
 * origem ele flutua sobre a página e o `<body>` continua com a altura do resto
 * do site. Recortado para dentro de uma `<section>` que só tem ELE, o resultado
 * é uma seção de **zero pixel**: o menu está no DOM, tem 70px de altura própria,
 * e ocupa lugar nenhum.
 *
 * Isso reprova três regras de uma vez, e as três apareciam separadas no banco de
 * prova como se fossem defeitos diferentes:
 *
 * - **S14** — `nav (51 caracteres, 0px de altura)`: a seção tem conteúdo e não
 *   ocupa espaço.
 * - **S19** — `nav -> hero: colados (-1447px)`: a emenda entre as duas seções é
 *   NEGATIVA, porque o hero começa onde a nav deveria estar.
 * - **S18** — `nav › div (70px de conteudo em 0px de caixa)`: o filho do menu
 *   rola dentro de uma caixa de altura zero.
 *
 * O mesmo vale para `absolute`: medido num kit, `nav pos=absolute h=110` numa
 * seção de 0px.
 *
 * ## Por que é aqui, e não na peça
 *
 * O motor JÁ sabia disso pela metade: quando a nav de origem é sticky/fixed, a
 * `<section>` recebe `data-fixa-no-topo` e É ELA que vira `position:sticky` —
 * porque na composição o containing block da nav é a própria section, onde
 * sticky não tem curso nenhum. A section assumiu o papel de flutuar; faltava
 * soltar a peça, que continuava fixa e continuava sem ocupar espaço.
 *
 * Esta é a outra metade. E ela não fere a essência do componente: a hierarquia,
 * a grade, o movimento e o espaçamento interno da peça ficam exatamente como
 * estavam — o que muda é de QUEM é o `position`, e quem flutua agora é o
 * embrulho que o compositor mesmo criou.
 *
 * ## O alcance é o mínimo que resolve
 *
 * O seletor exige `[data-ds-corpo] > `, ou seja, só o elemento RAIZ da peça. As
 * camadas decorativas `fixed inset-0` de dentro do hero, os balões `absolute` de
 * um cartão e os menus suspensos continuam intocados — eles se posicionam contra
 * a peça, e a peça continua ali.
 *
 * `relative` e não `sticky`: sticky dentro do proxy teria como curso a altura do
 * próprio proxy, isto é, curso nenhum — ele se comportaria como `relative` e
 * ainda prometeria o que não entrega. Quem flutua é a section.
 */
export const soltarRaizDaSecaoNoFluxo = (css: string): { css: string; classes: string[] } => {
  const classes = new Set<string>();
  for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const seletor = m[1] ?? '';
    const corpo = m[2] ?? '';
    if (!/(?:^|[;\s])position\s*:\s*(?:fixed|absolute)\s*(?:!important)?\s*(?:;|$)/i.test(corpo)) {
      continue;
    }
    /**
     * As DUAS formas do seletor contam, e ler só uma foi um defeito já vivido.
     *
     * O CSS composto traz a regra de classe escopada como
     * `:where([data-ds-raiz="x"], [data-ds-corpo="x"]) .fixed` E como
     * `:where(...):is(.fixed)`. Uma leitura que só reconhecia `.classe{}` nu
     * mapeou ZERO classes num site inteiro — foi assim que a conferência de par
     * de cores nasceu cega.
     *
     * Só classe simples no FIM do seletor: `.a:hover`, `.a .b` e afins
     * descrevem uma situação, não o repouso.
     */
    for (const c of seletor.matchAll(/[\s>+~,(]\.((?:\\.|[\w-])+)\s*(?=[,){]|$)/g)) {
      const nome = (c[1] ?? '').replace(/\\/g, '');
      if (nome !== '') classes.add(nome);
    }
    for (const c of seletor.matchAll(/:is\(\.((?:\\.|[\w-])+)\)/g)) {
      const nome = (c[1] ?? '').replace(/\\/g, '');
      if (nome !== '') classes.add(nome);
    }
  }
  if (classes.size === 0) return { css: '', classes: [] };

  const lista = [...classes].sort();
  const seletores = lista
    .map((c) => `[data-secao] [data-ds-corpo]>.${c.replace(/([^\w-])/g, '\\$1')}`)
    .join(',');
  return {
    css: `\n/* A raiz da peça volta para o fluxo: quem flutua é a section (data-fixa-no-topo). */\n${seletores}{position:relative!important}\n`,
    classes: lista,
  };
};

/**
 * Os links da NAV passam a apontar para as seções DESTA página.
 *
 * ## O defeito
 *
 * O dono clicou nos itens do menu e nada aconteceu. É esperado e ninguém tinha
 * consertado: a nav veio de outro site, e os `href` dela apontam para as
 * âncoras e as páginas DAQUELE site — `#features` de uma seção que não existe
 * aqui, `/precos` de uma rota que não existe em lugar nenhum. Num site de uma
 * página só, tudo isso é link morto.
 *
 * ## O que decide o destino
 *
 * O compositor sabe exatamente quais seções montou, com o papel e o nome de
 * cada uma. Um item de menu escrito "Preços" tem um destino óbvio nesta página:
 * a seção de papel `pricing`. A ligação é feita pelo TEXTO do link contra duas
 * fontes — o rótulo em português do papel (`ROTULO_DE_PAPEL`) e o nome que o
 * usuário deu à seção.
 *
 * ## O que fica de fora, de propósito
 *
 * Link externo (`http`, `mailto`, `tel`) não é navegação de página: é o contato
 * do cliente e o motor já o preserva em outros pontos. Link cujo texto não casa
 * com seção nenhuma também fica — inventar um destino seria pior que um link
 * que não leva a lugar nenhum, porque levaria ao lugar ERRADO.
 *
 * ## Quando isto NÃO tem o que ligar, e por que está certo assim
 *
 * Medido num site do banco de prova: a nav trazia "Produto", "Segurança",
 * "Documentação", "Suporte" — o vocabulário do site de ORIGEM — enquanto as
 * seções da página eram `features`, `showcase`, `logos`, `stats`, `faq`. Zero
 * casamentos, e corretamente: são dois sites diferentes falando.
 *
 * A ligação acontece no fluxo real, onde o criativo escreve a copy da nav com
 * as palavras do cliente e os rótulos passam a descrever as seções que existem.
 * O banco de prova não escreve copy, então ali ela fica quieta — e ficar quieta
 * é a resposta certa, não uma falha.
 */
export const ancorarNavNasSecoes = (
  html: string,
  secoes: readonly { id: string; papel: string | null; nome: string }[],
): { html: string; ligados: number } => {
  if (secoes.length === 0) return { html, ligados: 0 };

  const semAcento = (s: string): string =>
    s
      .normalize('NFD')
      // `\p{M}` s\u00e3o as MARCAS combinantes \u2014 os acentos que o `NFD` acabou de
      // separar da letra. A faixa `\u0300-\u036f` dizia a mesma coisa e o
      // linter a recusa, com raz\u00e3o: uma classe de caracteres n\u00e3o deveria
      // misturar caractere e combinante. A propriedade nomeia o que se quer.
      .replace(/\p{M}/gu, '')
      .toLowerCase()
      .trim();

  const destino = new Map<string, string>();
  for (const s of secoes) {
    const chaves = [s.nome];
    if (s.papel !== null) {
      const rotulo = ROTULO_DE_PAPEL[s.papel as keyof typeof ROTULO_DE_PAPEL];
      if (rotulo !== undefined) chaves.push(rotulo);
      chaves.push(s.papel);
    }
    for (const k of chaves) {
      const chave = semAcento(k);
      if (chave !== '' && !destino.has(chave)) destino.set(chave, s.id);
    }
  }

  let ligados = 0;
  const saida = html.replace(
    /<a\b([^>]*)>([^<]{1,40})<\/a>/gi,
    (inteiro, attrs: string, texto: string) => {
      const href = /\bhref\s*=\s*"([^"]*)"/i.exec(attrs)?.[1] ?? '';
      // Externo, contato e âncora que já aponta para uma seção desta página.
      if (/^(https?:|mailto:|tel:|sms:)/i.test(href)) return inteiro;
      if (/^#sec_/i.test(href)) return inteiro;
      const alvo = destino.get(semAcento(texto));
      if (alvo === undefined) return inteiro;
      ligados += 1;
      const semHref = attrs.replace(/\s*\bhref\s*=\s*"[^"]*"/i, '');
      return `<a${semHref} href="#${alvo}">${texto}</a>`;
    },
  );
  return { html: saida, ligados };
};
