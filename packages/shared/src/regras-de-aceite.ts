/**
 * As regras de aceite, executáveis.
 *
 * O texto delas — com a história de cada uma e o que a produziu — mora em
 * `docs/regras-de-aceite.md`. Aqui elas viram conferência, porque regra que só
 * existe em documento é regra que a primeira pressa contorna.
 *
 * São duas, cada uma antes de um ponto sem volta: a da GALERIA roda antes de a
 * peça entrar no acervo; a do SITE roda antes da entrega.
 *
 * ## O veredito tem três valores, não dois
 *
 * `passou`, `reprovou` e `pendente`, e a diferença entre os dois últimos é o que
 * faz a conferência ser útil em vez de virar um portão que todo mundo pula:
 *
 * - **reprovou** é defeito, e defeito se conserta no motor — o conserto vale para
 *   todos os sites, não só para aquele.
 * - **pendente** é limite conhecido: a cena depende de um runtime remoto
 *   proprietário, e nenhum conserto muda isso. Sobe declarado.
 *
 * Nada é descartado em silêncio e nada sobe fingindo estar bom.
 */

/** O que uma regra respondeu sobre um item. */
export type VereditoDaRegra = {
  /** `G1`, `S5`… — o mesmo código do documento, para achar a explicação. */
  codigo: string;
  titulo: string;
  estado: 'passou' | 'reprovou' | 'pendente';
  /** Uma frase que se entende sem abrir o código. Vazia quando passou. */
  motivo: string;
};

export type ResultadoDeAceite = {
  aprovado: boolean;
  /** Passa com ressalva: nada reprovou, mas há limite declarado. */
  comPendencia: boolean;
  vereditos: VereditoDaRegra[];
};

const juntar = (vereditos: VereditoDaRegra[]): ResultadoDeAceite => ({
  aprovado: !vereditos.some((v) => v.estado === 'reprovou'),
  comPendencia: vereditos.some((v) => v.estado === 'pendente'),
  vereditos,
});

// ── Galeria ─────────────────────────────────────────────────────────────────

/** O que a conferência da Galeria precisa saber sobre uma peça. */
export type PecaParaAceite = {
  categoria: string;
  kind: string;
  htmlSnippet: string;
  representacao: 'componente-portatil' | 'capsula-runtime' | 'referencia-visual' | null;
  /** Runtimes atribuídos à região, e se cada um trouxe o script que o inicia. */
  runtimes: readonly { kind: string; temScriptLocal: boolean }[];
  /** A captura mediu movimento NA REGIÃO (não no fundo da página)? */
  movimentoProprio: boolean;
  /** Classes de revelação ainda aplicadas no HTML. */
  classesDeRevelacao: readonly string[];
  /** Há observador de rolagem entre os scripts que viajam? */
  temObservadorDeRolagem: boolean;
  /** Referências locais do bundle que não existem em disco. */
  refsQuebradas: readonly string[];
  /** Assets que continuam apontando para o endereço de origem. */
  assetsNaOrigem: readonly string[];
  /**
   * O rastreamento de terceiro que o bundle carrega, medido em disco
   * (`rastreamentoDoBundle`). `null` também é resposta: não há rastreio ali.
   */
  rastreamento: 'puro' | 'misturado' | null;
  /**
   * Ids que o script da peça procura por literal e que existem no HTML dela sob
   * OUTRO nome (`alvosPerdidosDoBundle`). Lista vazia = o script acha o que
   * procura, ou o que falta não é renomeio.
   */
  alvosPerdidos: readonly { id: string; onde: string; viraram: string }[];
};

/**
 * Runtimes que só DESENHAM conteúdo. Não são tecnologia de movimento e a
 * ausência do script deles não reprova — o vocabulário do motor já os descreve
 * assim ("estes não animam nada").
 */
const RUNTIMES_QUE_SO_DESENHAM = new Set(['iconify', 'tailwind-cdn']);

/** Categorias que são pequenas por natureza: valem pelo script, não pelo HTML. */
const PEQUENAS_POR_NATUREZA = new Set(['interaction', 'cursor']);
const MIN_HTML = 200;

export const conferirPecaDaGaleria = (p: PecaParaAceite): ResultadoDeAceite => {
  const v: VereditoDaRegra[] = [];

  // G1 — a tecnologia da origem viaja junto.
  const semScript = p.runtimes.filter(
    (r) => !RUNTIMES_QUE_SO_DESENHAM.has(r.kind) && !r.temScriptLocal,
  );
  v.push(
    semScript.length === 0
      ? { codigo: 'G1', titulo: 'A tecnologia da origem viaja junto', estado: 'passou', motivo: '' }
      : {
          codigo: 'G1',
          titulo: 'A tecnologia da origem viaja junto',
          // Pendência, e não reprovação: runtime sem script identificado pode ser
          // proprietário e remoto, e aí nenhum conserto muda. Quem lê decide.
          estado: 'pendente',
          motivo: `${semScript.map((r) => r.kind).join(', ')}: a peça usa esta tecnologia e o script que a inicia não veio junto. Fora da origem ela não desenha.`,
        },
  );

  // G2 — movimento medido é movimento entregue.
  const congeladaComMovimento = p.movimentoProprio && p.representacao === 'referencia-visual';
  v.push(
    congeladaComMovimento
      ? {
          codigo: 'G2',
          titulo: 'Movimento medido é movimento entregue',
          estado: 'reprovou',
          motivo:
            'a região se mexe no site e a peça saiu como foto congelada: na Galeria ela vai parecer estática, e o site é a fonte da verdade.',
        }
      : {
          codigo: 'G2',
          titulo: 'Movimento medido é movimento entregue',
          estado: 'passou',
          motivo: '',
        },
  );

  // G3 — nada de estado congelado.
  const congelado = p.temObservadorDeRolagem && p.classesDeRevelacao.length > 0;
  v.push(
    congelado
      ? {
          codigo: 'G3',
          titulo: 'Nada de estado congelado',
          estado: 'reprovou',
          motivo: `${p.classesDeRevelacao.length} elemento(s) chegaram com a classe de revelação já aplicada (${[...new Set(p.classesDeRevelacao)].join(', ')}): o observador viaja junto e não tem o que revelar.`,
        }
      : { codigo: 'G3', titulo: 'Nada de estado congelado', estado: 'passou', motivo: '' },
  );

  // G4 — a peça sobrevive fora da origem.
  const foraDeCasa = [...p.refsQuebradas, ...p.assetsNaOrigem];
  v.push(
    foraDeCasa.length === 0
      ? { codigo: 'G4', titulo: 'A peça sobrevive fora da origem', estado: 'passou', motivo: '' }
      : {
          codigo: 'G4',
          titulo: 'A peça sobrevive fora da origem',
          estado: 'reprovou',
          motivo: `${foraDeCasa.length} referência(s) não estão no bundle (${foraDeCasa.slice(0, 3).join(', ')}): a peça perde o conteúdo no dia em que aquele endereço mudar.`,
        },
  );

  // G5 — há componente ali.
  const curta = !PEQUENAS_POR_NATUREZA.has(p.categoria) && p.htmlSnippet.trim().length < MIN_HTML;
  v.push(
    curta
      ? {
          codigo: 'G5',
          titulo: 'Há componente ali',
          estado: 'reprovou',
          motivo: `HTML de ${p.htmlSnippet.trim().length} caracteres: é sobra de recorte, não componente.`,
        }
      : { codigo: 'G5', titulo: 'Há componente ali', estado: 'passou', motivo: '' },
  );

  /**
   * G6 — o que a peça diz que é, ela é.
   *
   * A primeira versão desta regra exigia `kind: 'animation'` de TODA peça com
   * movimento, e o acervo mostrou o erro na hora: 162 reprovações. Um card com
   * fade-in continua sendo um card — o movimento é adjetivo dele, não a
   * identidade. Forçar a reclassificação teria enchido a Galeria de "animações"
   * que são, na verdade, cartões e rodapés.
   *
   * O que o dono pediu era outra coisa: que a ANIMAÇÃO EM SI — o efeito, o
   * comportamento, o ponteiro — fosse classificável, para poder ser escolhida.
   * Isso é sobre as categorias de comportamento, e sobre não promover movimento
   * a imagem congelada.
   */
  const comportamentoMalRotulado = PEQUENAS_POR_NATUREZA.has(p.categoria) && p.kind !== 'animation';
  const movimentoViradoImagem = p.movimentoProprio && p.kind === 'asset';
  /**
   * Ponteiro é PEQUENO. Um `cursor` com quilobytes de HTML não é ponteiro — é
   * outra coisa que foi rotulada assim por engano.
   *
   * Medido: a deteccao casou com `cursor-glow`, classe de brilho no hover de um
   * cartão, e promoveu o artigo inteiro. Na composição ele foi para o embrulho
   * fixo do comportamento e cobriu a página com um cartão de 400 px. A captura
   * agora exige tamanho pequeno; esta regra protege o que entrou antes dela.
   */
  const ponteiroGrandeDemais = p.categoria === 'cursor' && p.htmlSnippet.trim().length > 1500;
  const motivoG6 = ponteiroGrandeDemais
    ? `um ponteiro com ${p.htmlSnippet.trim().length} caracteres de HTML não é um ponteiro: a classificação pegou outro elemento, e na página ele cobriria o conteúdo.`
    : movimentoViradoImagem
      ? 'a peça se mexe e foi promovida como imagem congelada do site de origem: ela não aceita a copy nem a cor da marca.'
      : `peça de ${p.categoria} precisa ser classificada como animação para poder ser escolhida como comportamento da página.`;
  v.push(
    comportamentoMalRotulado || movimentoViradoImagem || ponteiroGrandeDemais
      ? {
          codigo: 'G6',
          titulo: 'O que a peça diz que é, ela é',
          estado: 'reprovou',
          motivo: motivoG6,
        }
      : { codigo: 'G6', titulo: 'O que a peça diz que é, ela é', estado: 'passou', motivo: '' },
  );

  /**
   * G7 — a peça não engole as vizinhas.
   *
   * Achado no acervo: um segmento de `card` do open-design.ai tinha 8,6 KB e
   * continha DENTRO dele o cabeçalho e a navegação do site. O corte pegou a
   * seção errada, e ninguém notaria até o site gerado sair com uma segunda
   * barra de navegação no meio de uma faixa de cartões.
   *
   * `<nav>` é o sinal mais limpo: ele é marco de PÁGINA. Um cartão, uma faixa de
   * recursos ou uma tabela de preços não têm navegação própria — se têm uma
   * dentro, ela é da página e veio junto por engano.
   *
   * As categorias que legitimamente carregam navegação (`nav`, `header`,
   * `footer`) ficam de fora, e `hero` também: hero com a barra em cima é desenho
   * comum, e naquele caso os dois são a mesma dobra.
   */
  const CARREGAM_NAVEGACAO = new Set(['nav', 'header', 'footer', 'hero', 'other']);
  const engoliuNavegacao = !CARREGAM_NAVEGACAO.has(p.categoria) && /<nav[\s>]/i.test(p.htmlSnippet);
  v.push(
    engoliuNavegacao
      ? {
          codigo: 'G7',
          titulo: 'A peça não engole as vizinhas',
          estado: 'reprovou',
          motivo: `uma peça de ${p.categoria} contém a navegação da página inteira: o corte pegou a seção errada, e o site gerado sairia com uma segunda barra de menu no meio do conteúdo.`,
        }
      : { codigo: 'G7', titulo: 'A peça não engole as vizinhas', estado: 'passou', motivo: '' },
  );

  /**
   * G8 — o rastreamento da origem não viaja.
   *
   * A régua já existia, mas rodava na MONTAGEM DA PÁGINA (S2), quando a peça já
   * estava no kit e o site já era do cliente. Ali sobra uma escolha ruim: tirar
   * o script leva o comportamento embora, manter manda o visitante do cliente
   * para a conta de analytics de outra empresa. Nos dois casos alguém precisa
   * DECIDIR, e num kit essa decisão se repete em todo site que o usar.
   *
   * Então ela desce para a Galeria, onde a decisão é barata: a peça não entra.
   *
   * Só `misturado` reprova. O `puro` passa porque o motor o tira sozinho na
   * montagem, e ninguém escolheu aquele desenho por causa do analytics.
   *
   * Medido nos 290 bundles da Biblioteca: 6 misturados, 47 puros, 237 sem
   * rastreio. As 6 são do MESMO site de origem e 3 delas estavam no único kit
   * que reprovava no banco de prova — em S2, exatamente por isto. O custo da
   * regra é 2,1% do acervo, concentrado num site só.
   */
  v.push(
    p.rastreamento === 'misturado'
      ? {
          codigo: 'G8',
          titulo: 'O rastreamento da origem não viaja',
          estado: 'reprovou',
          motivo:
            'o script desta peça mistura rastreamento de terceiro com comportamento: tirá-lo leva o comportamento embora e mantê-lo conta o visitante do cliente na conta de outra empresa. Isso obriga uma decisão humana em todo site que usar a peça, e um kit é reuso.',
        }
      : {
          codigo: 'G8',
          titulo: 'O rastreamento da origem não viaja',
          estado: 'passou',
          motivo: '',
        },
  );

  /**
   * G9 — o script da peça encontra o que procura.
   *
   * O dono reprovou uma linha do tempo que, na origem, se preenche conforme a
   * página rola: `drawCurve()` mede os cards e monta o traçado, `updateScroll()`
   * anda o `stroke-dashoffset`. No site gerado ela saía parada e ligando nada.
   *
   * A causa era o compilador prefixar TODOS os ids internos de um SVG sem
   * reescrever o JavaScript que os procura. `getElementById` volta `null`, o
   * script bate no próprio guarda e desiste na primeira linha — sem erro no
   * console, sem nada na tela além de um desenho congelado.
   *
   * O compilador já foi corrigido, e a regra continua valendo por um motivo
   * medido: **conserto de motor não alcança o que já está em disco.** Depois de
   * corrigir e recompilar, a Biblioteca tinha as DUAS cópias da peça — a antiga
   * quebrada e a nova boa — e o montador escolheu a antiga. O motor certo, o
   * site quebrado do mesmo jeito.
   *
   * Reprova, não fica pendente: a peça não faz o que o nome dela promete, e
   * existe cópia boa da mesma peça no acervo.
   */
  const perdidos = p.alvosPerdidos;
  v.push(
    perdidos.length > 0
      ? {
          codigo: 'G9',
          titulo: 'O script da peça encontra o que procura',
          estado: 'reprovou',
          motivo: `o script procura ${perdidos.length} elemento(s) que não existem no HTML desta peça (${perdidos
            .slice(0, 3)
            .map((a) => `#${a.id} em ${a.onde}`)
            .join(
              '; ',
            )}). Ele desiste na primeira linha e o que ele desenharia fica congelado — sem erro no console.`,
        }
      : {
          codigo: 'G9',
          titulo: 'O script da peça encontra o que procura',
          estado: 'passou',
          motivo: '',
        },
  );

  return juntar(v);
};

// ── Site gerado ─────────────────────────────────────────────────────────────

/** O que a conferência do site precisa saber. */
export type SiteParaAceite = {
  html: string;
  /** Nome da marca do projeto, para conferir o título da aba. */
  nomeDaMarca: string;
  /** Referências locais do site que não existem em disco. */
  refsQuebradas: readonly string[];
  /** Fotos da origem que continuaram na página (sem substituta). */
  fotosDaOrigemMantidas: number;
  /** Vídeos da origem que continuaram na página. */
  videosDaOrigemMantidos: number;
  /**
   * Nomes da empresa de ORIGEM que sobraram no que a pessoa lê — texto da
   * página e atributos visíveis (`alt`, `title`, `placeholder`…).
   */
  nomesDaOrigemNoTexto: readonly string[];
  /**
   * Scripts de rastreamento da ORIGEM que continuaram na página — os que
   * misturam analytics com comportamento e não puderam sair inteiros.
   */
  rastreadoresDaOrigem: number;
  /** A moldura foi aplicada a partir da geometria medida? */
  gridMedido: boolean;
  /** Seções que saíram sem conteúdo nenhum. */
  secoesVazias: readonly string[];
  /** Há favicon declarado no `<head>`? */
  temFavicon: boolean;
  /** Quantas peças com movimento entraram no site. */
  pecasComMovimento: number;
  /**
   * Comportamentos que chegaram à página E alcançam algum elemento dela.
   *
   * A distinção entre este campo e `comportamentosMortos` é a razão de a S6
   * existir de novo: um comportamento pode viajar inteiro — CSS na cascata,
   * script no fim do body — e não tocar em nada.
   */
  comportamentosVivos: number;
  /** Comportamentos que viajaram e não alcançam nada (nome + origem). */
  comportamentosMortos: readonly string[];
  /**
   * A página tem alguma coisa que reage à ROLAGEM: comportamento vivo, classe
   * de revelação devolvida ao estado inicial, ou a camada de movimento do
   * próprio compositor.
   */
  movimentoAoRolar: boolean;
};

export const conferirSiteGerado = (s: SiteParaAceite): ResultadoDeAceite => {
  const v: VereditoDaRegra[] = [];

  /**
   * S2 — nada da origem sobrevive. Nem mídia, nem NOME.
   *
   * O documento sempre disse "nem nome, nem texto, nem foto, nem vídeo", mas a
   * conferência só olhava foto e vídeo. Foi assim que um site de clínica saiu
   * com "CANVAS" em letras gigantes no rodapé e "© 2024 CANVAS SYSTEMS"
   * embaixo, com S2 marcando "passou".
   *
   * Os dois casos não pesam igual, e por isso o veredito escolhe o pior:
   *
   * - **Mídia é pendência.** Apagar a foto abriria buraco e quebraria S1; ela
   *   fica até existir substituta, e o aviso diz o que resolver.
   * - **Nome é reprovação.** Não abre buraco nenhum — sai trocado pelo da marca,
   *   e o motor sabe fazer isso. Nome de outra empresa no site do cliente é
   *   defeito, e defeito se conserta.
   * - **Rastreador é reprovação, e a mais séria.** Um site gerado carregava a
   *   `gtag.js` e o `gtag('config','G-…')` da empresa de origem, vindos dentro
   *   dos bundles capturados: cada visitante do cliente virava evento na conta
   *   de outra empresa. Os que são só rastreamento o motor tira sozinho; chegam
   *   aqui só os que vêm misturados com comportamento de verdade, e esses
   *   precisam de decisão humana antes de a página sair.
   */
  const daOrigem = s.fotosDaOrigemMantidas + s.videosDaOrigemMantidos;
  const midia = `${s.fotosDaOrigemMantidas} foto(s) e ${s.videosDaOrigemMantidos} vídeo(s) do site de origem continuam na página: gere ou envie a mídia da marca para esta seção.`;
  const nomes = `o nome da empresa de origem aparece no texto da página (${s.nomesDaOrigemNoTexto.slice(0, 3).join(', ')}): o site do cliente está entregando a marca de outra empresa. Confira se o projeto tem nome de marca preenchido.`;
  const rastreio = `${s.rastreadoresDaOrigem} script(s) de rastreamento da empresa de origem continuam na página: o visitante deste site está sendo contado na conta de analytics de outra empresa. Eles misturam rastreamento com comportamento — separe no motor antes de entregar.`;
  const graves = [
    ...(s.rastreadoresDaOrigem > 0 ? [rastreio] : []),
    ...(s.nomesDaOrigemNoTexto.length > 0 ? [nomes] : []),
  ];
  v.push(
    graves.length > 0
      ? {
          codigo: 'S2',
          titulo: 'Nada da origem sobrevive',
          estado: 'reprovou',
          motivo: daOrigem === 0 ? graves.join(' E ') : `${graves.join(' E ')} E ${midia}`,
        }
      : daOrigem === 0
        ? { codigo: 'S2', titulo: 'Nada da origem sobrevive', estado: 'passou', motivo: '' }
        : {
            codigo: 'S2',
            titulo: 'Nada da origem sobrevive',
            estado: 'pendente',
            motivo: midia,
          },
  );

  // S5 — o grid é um só.
  v.push(
    s.gridMedido
      ? { codigo: 'S5', titulo: 'O grid é um só', estado: 'passou', motivo: '' }
      : {
          codigo: 'S5',
          titulo: 'O grid é um só',
          estado: 'pendente',
          motivo:
            'nenhuma origem tinha geometria medida na captura: as seções ficam como a peça veio, e o conteúdo pode encostar na borda. Reextraia as origens deste kit.',
        },
  );

  /**
   * S6 — o site se mexe. E agora ela olha a PÁGINA, não o inventário do kit.
   *
   * A versão anterior era `pecasComMovimento > 0`, alimentado por
   * `kit.components.filter(kind === 'animation').length` — o inventário do kit.
   * Medido no site de um clube: S6 deu `passou` com a página literalmente
   * parada ao rolar. O único comportamento do kit ("Revelar ao rolar") tinha
   * origem que nenhuma seção usava; o CSS dele saiu escopado numa origem
   * ausente e os scripts procuravam `.scroll-item` e `[data-counter-target]`,
   * com 0 e 0 ocorrências no `index.html`. Movimento real que sobrou na página
   * inteira: dois `animate-pulse` e transições de hover.
   *
   * É o mesmo defeito que a S4 já tinha e este arquivo já documenta: regra
   * alimentada por constante é pior que regra ausente, porque carimba verde.
   *
   * A ordem dos ramos é a ordem da prova:
   * 1. algo REAGE À ROLAGEM na página — comportamento vivo ou a camada do
   *    compositor → passou, e nada mais precisa ser dito;
   * 2. comportamento morto na página → REPROVOU. Não é pendência: o site sai
   *    com peso de JS e CSS que não faz nada e com o carimbo de que se mexe;
   * 3. nenhuma peça com movimento no kit → pendência (o texto de sempre);
   * 4. há peça animada, mas nada reage à rolagem → pendência, dito por extenso.
   */
  const mortos = s.comportamentosMortos;
  // Comportamento VIVO já é reação à rolagem; o campo entra na conta em vez de
  // ficar declarado e nunca lido, que é como um contrato apodrece calado.
  const reageARolagem = s.movimentoAoRolar || s.comportamentosVivos > 0;
  v.push(
    reageARolagem
      ? { codigo: 'S6', titulo: 'O site se mexe', estado: 'passou', motivo: '' }
      : mortos.length > 0
        ? {
            codigo: 'S6',
            titulo: 'O site se mexe',
            estado: 'reprovou',
            motivo: `${mortos.length} comportamento(s) do kit viajaram e não alcançam elemento nenhum (${mortos.slice(0, 3).join(', ')}): a origem deles não está na página e as classes que eles animam não existem nas seções. O site sai parado ao rolar com o carimbo de que se mexe.`,
          }
        : s.pecasComMovimento === 0
          ? {
              codigo: 'S6',
              titulo: 'O site se mexe',
              estado: 'pendente',
              motivo:
                'nenhuma peça do kit carrega movimento: a página vai sair parada. Escolha uma animação na Biblioteca.',
            }
          : {
              codigo: 'S6',
              titulo: 'O site se mexe',
              estado: 'pendente',
              motivo:
                'as peças animadas do kit só se mexem ao carregar e ao passar o mouse; nada reage à rolagem.',
            },
  );

  // S7 — a marca aparece onde se espera.
  const titulo = /<title>([\s\S]*?)<\/title>/i.exec(s.html)?.[1]?.trim() ?? '';
  const tituloSoDaMarca =
    s.nomeDaMarca.trim() !== '' && titulo.toLowerCase() === s.nomeDaMarca.trim().toLowerCase();
  const problemasDeMarca: string[] = [];
  if (!s.temFavicon) problemasDeMarca.push('sem favicon');
  if (!tituloSoDaMarca) problemasDeMarca.push(`título da aba é "${titulo}"`);
  v.push(
    problemasDeMarca.length === 0
      ? { codigo: 'S7', titulo: 'A marca aparece onde se espera', estado: 'passou', motivo: '' }
      : {
          codigo: 'S7',
          titulo: 'A marca aparece onde se espera',
          estado: 'reprovou',
          motivo: `${problemasDeMarca.join('; ')}. O título da aba é o nome da marca e nada mais.`,
        },
  );

  // S8 — o site sobrevive sozinho.
  v.push(
    s.refsQuebradas.length === 0
      ? { codigo: 'S8', titulo: 'O site sobrevive sozinho', estado: 'passou', motivo: '' }
      : {
          codigo: 'S8',
          titulo: 'O site sobrevive sozinho',
          estado: 'reprovou',
          motivo: `${s.refsQuebradas.length} referência(s) apontam para arquivo que não foi copiado (${s.refsQuebradas.slice(0, 3).join(', ')}): apagar a peça de origem quebra este site.`,
        },
  );

  // S9 — nenhuma seção vazia.
  v.push(
    s.secoesVazias.length === 0
      ? { codigo: 'S9', titulo: 'Nenhuma seção vazia', estado: 'passou', motivo: '' }
      : {
          codigo: 'S9',
          titulo: 'Nenhuma seção vazia',
          estado: 'pendente',
          motivo: `${s.secoesVazias.length} seção(ões) sem peça e sem HTML criado: ${s.secoesVazias.slice(0, 3).join(', ')}.`,
        },
  );

  return juntar(v);
};

// ── Site RENDERIZADO ────────────────────────────────────────────────────────

/**
 * O que só existe depois de desenhar.
 *
 * A S4 ("o texto se lê") morava no aceite da montagem e recebia
 * `contrastesAbaixoDoPiso: 0` — a constante, cravada no código, porque medir
 * contraste exige navegador e a montagem é determinística e sem rede. Ela passou
 * verde em todo site gerado sem nunca ter olhado um par de cores, e foi por essa
 * porta que saíram um hero ilegível, uma barra de menu clara sobre página escura
 * e um cartão escuro com texto escuro. O dono viu os três em print; a máquina,
 * nenhum.
 *
 * Regra alimentada por constante é pior que regra ausente: ela ocupa o lugar da
 * conferência e ainda dá o carimbo. Por isso a S4 saiu de lá e vive aqui, junto
 * das outras que dependem de layout resolvido — e quem não roda esta passagem
 * simplesmente não tem veredito sobre elas, em vez de ter um veredito falso.
 */
export type SiteNoNavegador = {
  /** Largura em que a medição foi feita, para o motivo dizer onde dói. */
  largura: number;
  /**
   * Pares texto/fundo abaixo do piso, já resolvidos: a cor que o navegador
   * calculou, contra o primeiro ancestral com fundo opaco.
   */
  contrastesAbaixoDoPiso: readonly { texto: string; contraste: number; onde: string }[];
  /**
   * Texto que está na página com opacidade quase zero — quase sempre uma
   * revelação por rolagem que nunca disparou.
   */
  textoApagado: readonly { texto: string; opacidade: number; onde: string }[];
  /** `<img>` que não carregou: slot de mídia que ficou como bloco vazio. */
  slotsDeMidiaVazios: readonly string[];
  /** Elementos que passam da borda da tela sem estar dentro de um recorte. */
  transbordam: readonly string[];
  /** Seções que têm conteúdo e saíram com altura zero. */
  secoesColapsadas: readonly string[];
  /**
   * Botão, link ou campo menor que 44px no CELULAR — mira que o dedo erra.
   *
   * Opcional porque o veredito de um site conferido antes desta regra existir
   * continua válido: ausente significa "não medido", e não "zero achados".
   */
  alvosDeToquePequenos?: readonly string[];
  /** Texto abaixo de 12px no celular: nenhuma outra regra lia tamanho de letra. */
  textoMiudo?: readonly string[];
  /**
   * Mídia de conteúdo desenhada pequena demais para se ver.
   *
   * As quatro medidas abaixo nasceram do dono OLHANDO os sites de prova e
   * apontando o que a régua não via. Todas opcionais pelo mesmo motivo das duas
   * de cima: ausente é "não medido", nunca "zero achados".
   */
  imagensMinusculas?: readonly string[];
  /** Blocos que rolam DENTRO da página, criando uma segunda barra. */
  rolagemAninhada?: readonly string[];
  /** Vãos vazios grandes entre uma seção e a próxima. */
  respiroMorto?: readonly string[];
  /** Altura total da página, em px. */
  alturaTotal?: number;
  /** Altura somada do que é texto e mídia de verdade, em px. */
  alturaUtil?: number;
};

/** 3:1 é o piso de texto grande do WCAG; abaixo disso não se lê com folga. */
export const PISO_DE_CONTRASTE = 3;

export const conferirSiteNoNavegador = (m: SiteNoNavegador): ResultadoDeAceite => {
  const v: VereditoDaRegra[] = [];

  // S4 — o texto se lê. Agora com o número medido, não com zero.
  const piores = [...m.contrastesAbaixoDoPiso]
    .sort((a, b) => a.contraste - b.contraste)
    .slice(0, 3)
    .map((c) => `"${c.texto.slice(0, 28)}" em ${c.onde} (${c.contraste.toFixed(1)}:1)`);
  v.push(
    m.contrastesAbaixoDoPiso.length === 0
      ? { codigo: 'S4', titulo: 'O texto se lê', estado: 'passou', motivo: '' }
      : {
          codigo: 'S4',
          titulo: 'O texto se lê',
          estado: 'reprovou',
          motivo: `${m.contrastesAbaixoDoPiso.length} trecho(s) abaixo do ${PISO_DE_CONTRASTE}:1 em ${m.largura}px: ${piores.join('; ')}.`,
        },
  );

  /**
   * S13 — nenhum texto fica apagado.
   *
   * O hero de um site saiu ilegível e a conferência deu verde: o texto estava
   * lá, ocupando espaço, com opacidade perto de zero porque a revelação por
   * rolagem não disparou. Eu chegara a PULAR esses elementos na medição, como se
   * fossem decoração — e assim a máquina concordava com um site que ninguém
   * conseguia ler.
   *
   * Quem escreve `opacity:0` conta com um observador. Quando ele não vem, o
   * defeito não é de contraste: é conteúdo que não apareceu.
   */
  const apagadosPiores = [...m.textoApagado]
    .sort((a, b) => a.opacidade - b.opacidade)
    .slice(0, 3)
    .map((t) => `"${t.texto.slice(0, 28)}" em ${t.onde} (${(t.opacidade * 100).toFixed(0)}%)`);
  v.push(
    m.textoApagado.length === 0
      ? { codigo: 'S13', titulo: 'Nenhum texto fica apagado', estado: 'passou', motivo: '' }
      : {
          codigo: 'S13',
          titulo: 'Nenhum texto fica apagado',
          estado: 'reprovou',
          motivo: `${m.textoApagado.length} trecho(s) com opacidade quase zero em ${m.largura}px: ${apagadosPiores.join('; ')}. Quase sempre é a revelação por rolagem que não disparou.`,
        },
  );

  /**
   * S11 — todo slot de mídia foi preenchido.
   *
   * Uma faixa de dezesseis cartões saiu com blocos de cor no lugar das fotos: a
   * peça pedia imagem, o projeto não tinha, e ninguém reclamou. Bloco vazio não
   * é "quase pronto" — é a seção anunciando que não tinha o que mostrar.
   */
  v.push(
    m.slotsDeMidiaVazios.length === 0
      ? { codigo: 'S11', titulo: 'Todo slot de mídia foi preenchido', estado: 'passou', motivo: '' }
      : {
          codigo: 'S11',
          titulo: 'Todo slot de mídia foi preenchido',
          estado: 'reprovou',
          motivo: `${m.slotsDeMidiaVazios.length} imagem(ns) não carregaram e saíram como bloco vazio (${m.slotsDeMidiaVazios.slice(0, 3).join(', ')}): gere ou envie a mídia, ou tire a seção que a pede.`,
        },
  );

  /**
   * S12 — nada transborda a tela.
   *
   * No celular, uma seção saía 72px fora da tela. Não havia rolagem horizontal
   * (o corte escondia), então nada parecia errado até alguém olhar o print.
   */
  v.push(
    m.transbordam.length === 0
      ? { codigo: 'S12', titulo: 'Nada transborda a tela', estado: 'passou', motivo: '' }
      : {
          codigo: 'S12',
          titulo: 'Nada transborda a tela',
          estado: 'reprovou',
          motivo: `${m.transbordam.length} elemento(s) passam da borda em ${m.largura}px (${m.transbordam.slice(0, 3).join(', ')}): no celular o conteúdo sai cortado.`,
        },
  );

  /**
   * S14 — nenhuma seção colapsa.
   *
   * Seis das oito seções de um site saíram com altura zero: o texto estava no
   * DOM, a seção existia, e a página tinha um buraco no lugar dela. É o que
   * acontece quando a peça vem de um site cujo layout inteiro é orquestrado por
   * rolagem — lá os blocos são tirados do fluxo e posicionados por script;
   * recortados, não têm altura própria nenhuma.
   *
   * Nenhuma das outras regras pega isso: o texto se lê, nada está apagado, nada
   * transborda. Só que ninguém vê. Reprova, e o conserto costuma ser trocar a
   * peça — aquela origem não empresta pedaço.
   */
  v.push(
    m.secoesColapsadas.length === 0
      ? { codigo: 'S14', titulo: 'Nenhuma seção colapsa', estado: 'passou', motivo: '' }
      : {
          codigo: 'S14',
          titulo: 'Nenhuma seção colapsa',
          estado: 'reprovou',
          motivo: `${m.secoesColapsadas.length} seção(ões) têm conteúdo e não ocupam espaço nenhum em ${m.largura}px (${m.secoesColapsadas.slice(0, 3).join('; ')}): a peça veio de um site cujo layout é orquestrado por rolagem e não sobrevive ao recorte. Troque a peça.`,
        },
  );

  /**
   * S15 — o dedo acerta o que ele mira.
   *
   * O CSS responsivo do compositor já escrevia `min-height: 44px` para link,
   * botão e campo, e a intenção estava documentada lá. Só que ela não é
   * `!important` e NUNCA foi conferida: uma regra mais específica da peça
   * capturada a sobrepõe em silêncio, e ela define só altura — um botão de
   * ícone sai alto e estreito e passa.
   *
   * Intenção escrita sem verificação é a mesma doença da regra alimentada por
   * constante: parece garantia e não é.
   */
  const alvos = m.alvosDeToquePequenos;
  if (alvos !== undefined) {
    v.push(
      alvos.length === 0
        ? { codigo: 'S15', titulo: 'O dedo acerta os alvos', estado: 'passou', motivo: '' }
        : {
            codigo: 'S15',
            titulo: 'O dedo acerta os alvos',
            estado: 'reprovou',
            motivo: `${alvos.length} alvo(s) de toque menores que 44px em ${m.largura}px (${alvos.slice(0, 3).join('; ')}): no celular, errar o toque deixa de ser acidente e vira regra.`,
          },
    );
  }

  /**
   * S16 — a letra tem tamanho de leitura.
   *
   * Nenhuma regra lia `font-size`. S4 compara cores e S13 mede opacidade, e as
   * duas dão verde para um texto de 8px com contraste perfeito — que no celular
   * é ilegível na prática e não aparecia em medição nenhuma.
   *
   * O piso é 12px e não 16: rótulo em caixa alta, crédito de foto e nota de
   * rodapé vivem legitimamente entre 12 e 14. Abaixo de 12 não há uso honesto.
   */
  const miudo = m.textoMiudo;
  if (miudo !== undefined) {
    v.push(
      miudo.length === 0
        ? { codigo: 'S16', titulo: 'A letra se lê no celular', estado: 'passou', motivo: '' }
        : {
            codigo: 'S16',
            titulo: 'A letra se lê no celular',
            estado: 'reprovou',
            motivo: `${miudo.length} trecho(s) abaixo de 12px em ${m.largura}px (${miudo.slice(0, 3).join('; ')}): contraste perfeito não salva letra que não dá para ler.`,
          },
    );
  }

  /**
   * S17 — a mídia entregue se vê.
   *
   * A S11 confere o slot VAZIO. O dono fotografou o oposto: uma foto de
   * conteúdo desenhada com 48px no meio do hero, dentro de uma vaga larga. A
   * vaga foi preenchida e o resultado é pior que vazio — ocupa o lugar e não
   * mostra nada. Ícone, logo e avatar ficam de fora: são pequenos por natureza.
   */
  const minusculas = m.imagensMinusculas;
  if (minusculas !== undefined) {
    v.push(
      minusculas.length === 0
        ? { codigo: 'S17', titulo: 'A mídia entregue se vê', estado: 'passou', motivo: '' }
        : {
            codigo: 'S17',
            titulo: 'A mídia entregue se vê',
            estado: 'reprovou',
            motivo: `${minusculas.length} mídia(s) de conteúdo desenhadas pequenas demais em ${m.largura}px (${minusculas.slice(0, 3).join('; ')}): a vaga foi preenchida e ninguém enxerga o que há ali.`,
          },
    );
  }

  /**
   * S18 — uma barra de rolagem só.
   *
   * A página rola; um bloco dentro dela também. Vem de marcação da ORIGEM que
   * viajou (`overflow-y:auto` no corpo da peça): lá aquele bloco era a página
   * inteira, aqui é uma seção. Rolagem aninhada esconde conteúdo e sequestra a
   * roda do mouse — quem rola a página para de rolar quando o ponteiro entra
   * ali.
   */
  const aninhada = m.rolagemAninhada;
  if (aninhada !== undefined) {
    v.push(
      aninhada.length === 0
        ? { codigo: 'S18', titulo: 'Uma barra de rolagem só', estado: 'passou', motivo: '' }
        : {
            codigo: 'S18',
            titulo: 'Uma barra de rolagem só',
            estado: 'reprovou',
            motivo: `${aninhada.length} bloco(s) rolam dentro da página em ${m.largura}px (${aninhada.slice(0, 2).join('; ')}): é marcação da origem, onde aquele bloco era a página inteira.`,
          },
    );
  }

  /**
   * S19 — o respiro entre seções é de gente.
   *
   * Dois limites, e o dono apontou os DOIS em sites diferentes: "muito espaço
   * em branco de um componente para o outro" e, no seguinte, "componentes
   * colado um com outro". Cada peça traz o respiro da própria origem —
   * empilhadas, ora somam ora se anulam, e nenhuma das duas é escolha de
   * ninguém.
   */
  const respiro = m.respiroMorto;
  if (respiro !== undefined) {
    v.push(
      respiro.length === 0
        ? {
            codigo: 'S19',
            titulo: 'O respiro entre seções é de gente',
            estado: 'passou',
            motivo: '',
          }
        : {
            codigo: 'S19',
            titulo: 'O respiro entre seções é de gente',
            estado: 'reprovou',
            motivo: `${respiro.length} emenda(s) entre seções fora de proporção em ${m.largura}px (${respiro.slice(0, 3).join('; ')}).`,
          },
    );
  }

  /**
   * S20 — a página não é mais alta que o conteúdo dela.
   *
   * "O scroll desce muito lento" é altura: a pessoa rola por vazio. A medida é
   * a fração da altura total que é texto e mídia de verdade. Abaixo de 20% não
   * há leitura possível do porquê — é vão.
   *
   * O piso é baixo de propósito: página com respiro generoso é escolha de
   * desenho, e esta regra existe para o caso PATOLÓGICO, não para ter gosto.
   */
  const total = m.alturaTotal;
  const util = m.alturaUtil;
  if (total !== undefined && util !== undefined && total > 0) {
    const fracao = util / total;
    v.push(
      fracao >= 0.2
        ? {
            codigo: 'S20',
            titulo: 'A página não é mais alta que o conteúdo dela',
            estado: 'passou',
            motivo: '',
          }
        : {
            codigo: 'S20',
            titulo: 'A página não é mais alta que o conteúdo dela',
            estado: 'reprovou',
            motivo: `só ${(fracao * 100).toFixed(0)}% dos ${total}px de altura são texto ou mídia em ${m.largura}px: a maior parte do que se rola é vão.`,
          },
    );
  }

  return juntar(v);
};
