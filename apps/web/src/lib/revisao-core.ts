import {
  type BriefDaSecao,
  type PaletaDoProjeto,
  type PlacementDoSlot,
  briefVazio,
  contrasteRatio,
  distribuirTokens,
} from '@ds/shared/schemas';

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

/** Índices das etapas do wizard — mantidos aqui para o teste travar o mapa. */
export const ETAPA = {
  projeto: 0,
  marca: 1,
  estrutura: 2,
  conteudo: 3,
  midia: 4,
  revisao: 5,
} as const;

export type DadosDeRevisao = {
  nome: string;
  kitComponentes: { id: string }[] | null;
  brandName: string;
  nLogos: number;
  tons: string[];
  arquetipos: string[];
  paleta: PaletaDoProjeto;
  ctaPrincipal: string;
  briefs: Record<string, BriefDaSecao>;
  placements: PlacementDoSlot[];
  nMidias: number;
  modo: 'blueprint' | 'criativo';
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

  if (d.kitComponentes !== null) {
    const ids = new Set(d.kitComponentes.map((c) => c.id));
    for (const p of d.placements) {
      if (p.escolha === 'componente' && p.componentId !== null && !ids.has(p.componentId)) {
        aviso(
          ETAPA.estrutura,
          'Uma seção fixava um componente que saiu do kit. Ela voltou para o automático.',
        );
      }
    }
  }

  const briefsPreenchidos = Object.values(d.briefs).filter((b) => !briefVazio(b)).length;
  if (briefsPreenchidos === 0) {
    aviso(ETAPA.conteudo, 'Nenhuma seção tem conteúdo seu. O texto inteiro sai inventado no tom.');
  }
  if (d.ctaPrincipal.trim() === '') {
    aviso(ETAPA.conteudo, 'Você não definiu o CTA principal. Os botões saem com um texto padrão.');
  }
  if (d.nMidias === 0) {
    aviso(ETAPA.midia, 'Você não enviou nenhuma mídia. As seções visuais saem só com o estilo.');
  }

  return problemas;
};

export const bloqueantes = (problemas: readonly Problema[]): Problema[] =>
  problemas.filter((p) => p.nivel === 'bloqueante');
