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
  /** Pares texto/fundo abaixo do piso de contraste. */
  contrastesAbaixoDoPiso: number;
  /** Há favicon declarado no `<head>`? */
  temFavicon: boolean;
  /** Quantas peças com movimento entraram no site. */
  pecasComMovimento: number;
};

const PISO_DE_CONTRASTE_TEXTO = 'contraste mínimo de 3:1';

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

  // S4 — o texto se lê.
  v.push(
    s.contrastesAbaixoDoPiso === 0
      ? { codigo: 'S4', titulo: 'O texto se lê', estado: 'passou', motivo: '' }
      : {
          codigo: 'S4',
          titulo: 'O texto se lê',
          estado: 'reprovou',
          motivo: `${s.contrastesAbaixoDoPiso} par(es) de texto e fundo abaixo do ${PISO_DE_CONTRASTE_TEXTO}.`,
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

  // S6 — o site se mexe.
  v.push(
    s.pecasComMovimento > 0
      ? { codigo: 'S6', titulo: 'O site se mexe', estado: 'passou', motivo: '' }
      : {
          codigo: 'S6',
          titulo: 'O site se mexe',
          estado: 'pendente',
          motivo:
            'nenhuma peça do kit carrega movimento: a página vai sair parada. Escolha uma animação na Biblioteca.',
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
