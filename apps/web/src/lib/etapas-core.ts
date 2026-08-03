/**
 * As etapas do wizard e o que cada uma exige para liberar a próxima.
 *
 * Fonte única dos índices. Eles viviam duplicados aqui e no `revisao-core`, e
 * dois mapas que precisam concordar acabam discordando: o botão "Corrigir" da
 * Revisão navega pelo número, então uma divergência mandaria a pessoa para a
 * etapa errada sem erro nenhum.
 *
 * Nem aqui dentro existem mais dois mapas. A lista abaixo carrega a chave e o
 * rótulo na MESMA linha, e os índices são DERIVADOS dela. Era a divisão entre um
 * array de rótulos e um `{ projeto: 0, marca: 1, ... }` digitado à mão que
 * deixava tirar uma etapa do meio e esquecer de descer os números de trás — e
 * esse esquecimento não dá erro nenhum: a etapa 3, que era Mídia, simplesmente
 * passa a ser Revisão, e o "Corrigir" leva para a tela errada em silêncio.
 *
 * O gate trava a NAVEGAÇÃO, nunca a gravação. O autosave continua salvando
 * estados incompletos (é o que permite fechar o navegador no meio e voltar
 * depois); o que ele não faz é deixar seguir adiante com o essencial em branco.
 */

const DEFINICAO = [
  { chave: 'projeto', rotulo: 'Projeto' },
  { chave: 'marca', rotulo: 'Marca' },
  { chave: 'estrutura', rotulo: 'Estrutura' },
  { chave: 'revisao', rotulo: 'Revisão' },
] as const;

/** Os rótulos, na ordem em que a barra de etapas os mostra. */
export const ETAPAS: readonly string[] = DEFINICAO.map((e) => e.rotulo);

/**
 * O índice de cada etapa pelo nome.
 *
 * Chave que não existe é erro de compilação, e é essa a rede que sobrou depois
 * que `ETAPA.midia` deixou de existir: quem ficou apontando para a etapa
 * aposentada não compila, em vez de navegar calado para o índice de outra.
 */
export const ETAPA = Object.fromEntries(DEFINICAO.map((e, i) => [e.chave, i])) as Record<
  (typeof DEFINICAO)[number]['chave'],
  number
>;

/**
 * Onde DENTRO da etapa se corrige, quando o número da etapa não basta.
 *
 * Nasceu quando a Mídia deixou de ser etapa e os produtos passaram a morar num
 * painel da Estrutura: dizer só "etapa 2" põe a pessoa na frente da lista de
 * seções, com o produto acusado três telas abaixo, dentro de um painel fechado.
 * Quem mostra a tela usa este campo para abrir o painel certo.
 */
export type FocoDaEtapa = 'deposito';

export type Pendencia = {
  etapa: number;
  /** Só quando a etapa sozinha deixaria a pessoa procurando. */
  foco?: FocoDaEtapa;
  /** O que fazer, na voz de quem lê. Nunca vazio: é o texto do botão travado. */
  mensagem: string;
};

export type DadosDasEtapas = {
  nome: string;
  kitId: string | null;
  brandName: string;
  secoes: readonly { nome: string }[];
  produtos: readonly { nome: string }[];
};

const ordinal = (i: number): string => `${i + 1}ª`;
const ordinalM = (i: number): string => `${i + 1}º`;

/**
 * O que falta nesta etapa. Lista vazia libera o avanço.
 *
 * O que NÃO entra aqui, de propósito: seção sem peça (é a forma de pedir uma
 * seção criada no estilo do kit), seção sem texto (é a forma de delegar o
 * conteúdo) e mídia (o inspetor da seção e o depósito se anunciam como
 * opcionais). Travar por essas seria confundir "não preenchido" com "escolhido
 * em branco".
 */
export const pendenciasDaEtapa = (etapa: number, d: DadosDasEtapas): Pendencia[] => {
  const p: Pendencia[] = [];
  const falta = (mensagem: string, foco?: FocoDaEtapa): void => {
    p.push({ etapa, mensagem, ...(foco !== undefined ? { foco } : {}) });
  };

  if (etapa === ETAPA.projeto) {
    if (d.nome.trim() === '') falta('Dê um nome ao projeto.');
    if (d.kitId === null) falta('Escolha o kit que vai servir de base visual.');
  }

  if (etapa === ETAPA.marca) {
    if (d.brandName.trim() === '') {
      falta('Escreva o nome da marca. Ele aparece no site inteiro.');
    }
  }

  if (etapa === ETAPA.estrutura) {
    if (d.secoes.length === 0) {
      falta('Seu site precisa de pelo menos uma seção.');
    }
    const semNome = d.secoes.findIndex((s) => s.nome.trim() === '');
    if (semNome !== -1) {
      falta(`A ${ordinal(semNome)} seção está sem nome.`);
    }

    // Produto sem nome não é só feio: `Produto.nome` exige texto, e o conteúdo
    // do projeto inteiro é validado de uma vez na leitura. Um produto em branco
    // derruba a validação e leva junto tudo o que estava escrito.
    //
    // A checagem seguiu os produtos, que perderam a etapa própria e passaram a
    // morar no depósito da Estrutura. O `foco` existe por causa do efeito
    // colateral dessa mudança: o botão travado acusa um produto enquanto a
    // pessoa olha para a lista de seções, e sem ele o produto acusado fica
    // escondido num painel fechado no fim da tela.
    const produtoSemNome = d.produtos.findIndex((x) => x.nome.trim() === '');
    if (produtoSemNome !== -1) {
      falta(`O ${ordinalM(produtoSemNome)} produto está sem nome.`, 'deposito');
    }
  }

  return p;
};

export const podeAvancar = (etapa: number, d: DadosDasEtapas): boolean =>
  pendenciasDaEtapa(etapa, d).length === 0;

/**
 * Até onde dá para navegar: a primeira etapa que ainda tem pendência.
 *
 * Um projeto salvo pela metade reabre com todas as etapas visitadas, e é este
 * teto que volta a trancar o que de fato ficou incompleto.
 */
export const maiorEtapaLiberada = (d: DadosDasEtapas): number => {
  for (let i = 0; i < ETAPAS.length; i++) {
    if (pendenciasDaEtapa(i, d).length > 0) return i;
  }
  return ETAPAS.length - 1;
};
