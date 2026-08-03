import { FAMILIA_EXPLICA, familiaDe, rotuloDaCategoria } from '@ds/shared/schemas';

/**
 * O que esta peça é, em português, para quem nunca leu a taxonomia.
 *
 * A Galeria mostra nome, categoria e selos, e cada um deles é exato para quem
 * já sabe o vocabulário. Para quem não sabe, "Colagem" e "dobras" não dizem se
 * aquilo é uma faixa inteira de página ou um botão. Esta função responde à
 * pergunta que a pessoa realmente faz ao olhar um card: o que é isto, e para
 * que serve.
 *
 * ## Por que não é uma descrição gerada por LLM
 *
 * Porque uma existiria só nas peças classificadas de hoje em diante, custaria
 * uma chamada por peça, e poderia inventar. Tudo o que está aqui já foi MEDIDO
 * na captura: a categoria, a família, o tipo, o que a peça depende para
 * funcionar, o que ela responde ao ponteiro, o tamanho que ela tinha na tela.
 * A explicação é uma leitura desses fatos em voz alta, e por isso vale para as
 * 188 peças que já estão no acervo, sem reprocessar nenhuma.
 *
 * ## A regra do tom
 *
 * Frase curta, sem travessão, sem adjetivo de propaganda. Quando algo não foi
 * medido, o silêncio é a resposta: inventar "provavelmente é um cabeçalho"
 * seria pior que não dizer nada.
 */

export type PecaParaExplicar = {
  category: string;
  kind?: string | null;
  /** Nível de suporte medido: `completo`, `parcial`, `visual`, `externo`… */
  support?: string | null;
  /** Largura x altura que a peça tinha na captura. */
  dimensions?: { width?: number; height?: number } | null;
  /** Quantos filhos a peça tem (subcomponentes extraídos de dentro dela). */
  filhos?: number;
  /** A peça reage ao ponteiro, anima, ou depende de script? */
  interacoes?: readonly string[];
};

const EXPLICA_TIPO: Record<string, string> = {
  component: 'É uma peça de montar: entra dentro de uma seção, junto de outras.',
  layout: 'É uma faixa inteira da página, do jeito que ela estava no site de origem.',
  animation: 'É movimento: existe para animar, não para carregar conteúdo.',
  effect: 'É um efeito de fundo ou de camada, e vive atrás do que a pessoa lê.',
  asset: 'É um arquivo solto que veio junto, como uma imagem ou um ícone.',
};

const EXPLICA_SUPORTE: Record<string, string> = {
  completo: 'Ela veio inteira: o que o senhor vê aqui é o que vai para o site, sem nada faltando.',
  parcial: 'Veio quase inteira. Alguma parte não pôde ser reproduzida e o laudo diz qual.',
  visual:
    'Ela veio como retrato: aparece igual, mas não se mexe nem responde ao toque, porque o que a fazia funcionar não pôde vir junto.',
  externo:
    'Ela depende de um programa que mora fora do site e não veio na captura. Aparece, mas pode não se comportar igual.',
  'nao-suportado': 'Esta eu não consegui reproduzir. Ela está aqui como registro do que existia.',
};

/** Uma frase por fato medido. A ordem é a da pergunta: o que é, o que faz, o que esperar. */
export const explicarPeca = (peca: PecaParaExplicar): string[] => {
  const frases: string[] = [];

  const familia = familiaDe(peca.category);
  const categoria = rotuloDaCategoria(peca.category);
  frases.push(`É ${artigo(categoria)} ${categoria.toLowerCase()}. ${FAMILIA_EXPLICA[familia]}.`);

  const tipo = peca.kind === null || peca.kind === undefined ? '' : (EXPLICA_TIPO[peca.kind] ?? '');
  if (tipo !== '') frases.push(tipo);

  if (peca.filhos !== undefined && peca.filhos > 0) {
    frases.push(
      peca.filhos === 1
        ? 'Tem 1 peça menor guardada dentro dela, que o senhor pode usar separada.'
        : `Tem ${peca.filhos} peças menores guardadas dentro dela, que o senhor pode usar separadas.`,
    );
  }

  const interacoes = peca.interacoes ?? [];
  if (interacoes.length > 0) frases.push(fraseDeInteracao(interacoes));

  const largura = peca.dimensions?.width;
  const altura = peca.dimensions?.height;
  if (typeof largura === 'number' && typeof altura === 'number' && largura > 0 && altura > 0) {
    frases.push(
      `No site de origem ela ocupava ${Math.round(largura)} por ${Math.round(altura)} pixels.`,
    );
  }

  const suporte =
    peca.support === null || peca.support === undefined
      ? ''
      : (EXPLICA_SUPORTE[peca.support] ?? '');
  if (suporte !== '') frases.push(suporte);
  else frases.push('Esta peça ainda não foi medida, então não prometo como ela vai se comportar.');

  return frases;
};

/** "um" ou "uma" conforme o rótulo, para a frase não sair torta. */
const artigo = (rotulo: string): string => (/a$|ão$|em$/i.test(rotulo.trim()) ? 'uma' : 'um');

/**
 * O que a peça faz quando alguém mexe nela.
 *
 * As chaves vêm da captura (`fidelity.interactions`), e o vocabulário delas é
 * técnico. Aqui viram o que a pessoa veria acontecer na tela.
 */
const fraseDeInteracao = (interacoes: readonly string[]): string => {
  const tem = (p: RegExp) => interacoes.some((i) => p.test(i));
  const partes: string[] = [];
  if (tem(/hover|ponteiro|pointer/i)) partes.push('muda quando o ponteiro passa por cima');
  if (tem(/scroll|rolagem/i)) partes.push('reage à rolagem da página');
  if (tem(/anima|motion|movimento/i)) partes.push('tem movimento próprio');
  if (tem(/click|clique|toggle|alternar/i)) partes.push('responde ao clique');
  if (partes.length === 0) return 'Ela tem comportamento medido na captura.';
  return `Ela ${listar(partes)}.`;
};

/** "a, b e c" sem vírgula antes do "e". */
const listar = (itens: readonly string[]): string =>
  itens.length <= 1
    ? (itens[0] ?? '')
    : `${itens.slice(0, -1).join(', ')} e ${itens[itens.length - 1]}`;
