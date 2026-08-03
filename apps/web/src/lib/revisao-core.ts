import { type PaletaDoProjeto, contrasteRatio, distribuirTokens } from '@ds/shared/schemas';
import { type PecaForaDaMarca, frasesDeAlcanceDoKit } from './alcance-da-marca.js';
import { ETAPA } from './etapas-core.js';

/**
 * Validação PURA da revisão final do wizard: separa o que IMPEDE a geração
 * (bloqueante) do que só merece atenção (aviso), e aponta a etapa exata onde
 * se corrige — o botão "Corrigir" navega direto, sem caça ao tesouro.
 */

export type NivelDeProblema = 'bloqueante' | 'aviso';

export type Problema = {
  nivel: NivelDeProblema;
  /** Índice da etapa do wizard onde isso se corrige. */
  etapa: number;
  mensagem: string;
};

// Os índices das etapas vêm de `etapas-core`: eram duplicados aqui, e o botão
// "Corrigir" navega pelo número, então uma divergência levava para a etapa
// errada em silêncio. Lá eles são derivados da lista de etapas, então tirar uma
// etapa do meio (foi o caso da Mídia) não deixa número velho para trás aqui.
export { ETAPA } from './etapas-core.js';

export type DadosDeRevisao = {
  nome: string;
  kitComponentes: { id: string }[] | null;
  brandName: string;
  nLogos: number;
  tons: string[];
  arquetipos: string[];
  paleta: PaletaDoProjeto;
  ctaPrincipal: string;
  secoes: readonly { nome: string; componentIds: string[]; instrucao?: string }[];
  nMidias: number;
  /**
   * As peças do kit que não vestem a paleta da marca inteira, com a medida de
   * cada uma.
   *
   * A recoloração ignora palavra de cor, função dinâmica e cor dentro de imagem,
   * decisões certas todas elas. O que faltava era dizer isso ANTES de gerar: a
   * pessoa montava o kit, escolhia a paleta, gerava, e só então descobria que
   * metade do site saiu com as cores do site de origem.
   *
   * Este campo era `pecasComCoresFixas: string[]`, só com os nomes, e só com as
   * peças abaixo de 35% de alcance. A lista chegava pronta do wizard, que fazia
   * o corte lá dentro com o número digitado à mão. Agora chega a MEDIDA e o
   * corte mora num lugar só (`alcance-da-marca`), com a faixa do meio incluída:
   * uma peça de 40% também sai com a cara da origem e passava calada.
   */
  pecasForaDaMarca?: readonly PecaForaDaMarca[];
};

export const validarProjeto = (d: DadosDeRevisao): Problema[] => {
  const problemas: Problema[] = [];
  const bloq = (etapa: number, mensagem: string): void => {
    problemas.push({ nivel: 'bloqueante', etapa, mensagem });
  };
  const aviso = (etapa: number, mensagem: string): void => {
    problemas.push({ nivel: 'aviso', etapa, mensagem });
  };

  // ── Bloqueantes: sem isso o site não tem como nascer certo ──
  if (d.nome.trim() === '') bloq(ETAPA.projeto, 'O projeto está sem nome.');
  if (d.kitComponentes === null) {
    bloq(
      ETAPA.projeto,
      'Você ainda não escolheu um kit. O site é montado com os componentes dele.',
    );
  } else if (d.kitComponentes.length === 0) {
    bloq(ETAPA.projeto, 'O kit escolhido está vazio. Adicione componentes a ele.');
  }

  // ── Avisos: geram, mas com resultado visivelmente pior ──
  if (d.brandName.trim() === '') {
    aviso(ETAPA.marca, 'A marca está sem nome. O site sai com um espaço vazio no lugar.');
  }
  if (d.nLogos === 0) {
    aviso(ETAPA.marca, 'Você não enviou nenhuma logo. O site usa o nome da marca escrito.');
  }
  if (d.tons.length === 0 && d.arquetipos.length === 0) {
    aviso(ETAPA.marca, 'A voz da marca está vazia. O texto sai num tom genérico.');
  }
  const tokens = distribuirTokens(d.paleta);
  if (
    tokens.background !== undefined &&
    tokens.body !== undefined &&
    contrasteRatio(tokens.background, tokens.body) < 4.5
  ) {
    aviso(ETAPA.marca, 'O texto e o fundo da paleta têm pouco contraste. Fica difícil de ler.');
  }

  if (d.kitComponentes !== null && !d.kitComponentes.some((c) => c.id === '__carregando__')) {
    const ids = new Set(d.kitComponentes.map((c) => c.id));
    const orfas = d.secoes.filter((s) => s.componentIds.some((id) => !ids.has(id)));
    for (const s of orfas) {
      const nome = s.nome.trim() === '' ? 'Uma seção' : `A seção "${s.nome.trim()}"`;
      aviso(ETAPA.estrutura, `${nome} usa uma peça que saiu do kit. Ela sai criada no estilo.`);
    }
  }

  const comTexto = d.secoes.filter((s) => (s.instrucao ?? '').trim() !== '').length;
  if (d.secoes.length > 0 && comTexto === 0) {
    aviso(
      ETAPA.estrutura,
      'Nenhuma seção tem texto seu. Escrevo tudo no tom da marca, sem citar fato nenhum.',
    );
  }
  if (d.ctaPrincipal.trim() === '') {
    aviso(ETAPA.marca, 'Você não definiu a chamada principal. Os botões saem com um texto padrão.');
  }
  if (d.nMidias === 0) {
    // Aponta para a Estrutura porque é lá que a mídia se resolve desde que a
    // Mídia deixou de ser etapa: a de cada seção no inspetor da própria seção, e
    // a que não é de seção nenhuma no depósito da mesma tela. Se este aviso
    // tivesse ficado com o índice antigo, ele não daria erro nenhum — o número 3
    // continuou existindo, só que com a Revisão dentro, e "Corrigir" mandaria a
    // pessoa para a tela em que ela já está.
    aviso(
      ETAPA.estrutura,
      'Você não enviou nenhuma mídia. As seções visuais saem só com o estilo.',
    );
  }

  // Dito antes de gerar, e não descoberto depois: é a diferença entre uma
  // limitação declarada e uma surpresa. Uma frase por FAIXA de alcance, e todas
  // apontam para a etapa Projeto, que é onde se troca o kit.
  for (const frase of frasesDeAlcanceDoKit(d.pecasForaDaMarca ?? [])) {
    aviso(ETAPA.projeto, frase);
  }

  return problemas;
};

export const bloqueantes = (problemas: readonly Problema[]): Problema[] =>
  problemas.filter((p) => p.nivel === 'bloqueante');
