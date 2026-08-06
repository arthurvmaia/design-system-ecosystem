import {
  type EtapaDeMarketing,
  type ObjetivoDoSite,
  ROLE_CATEGORIES,
  SEQUENCIAS,
  type SectionRole,
  nomeDaEtapa,
} from '@ds/shared/schemas';

/**
 * Montagem automática de kit: a sequência argumentativa do objetivo, vestida
 * com as peças da Biblioteca que mais combinam.
 *
 * Não há modelo de linguagem aqui, de propósito: o servidor roda em modo fila
 * (API paga bloqueada por padrão) e um botão que só funciona com credencial e
 * custo não é um botão — é uma promessa quebrada. O conhecimento "o que vem em
 * que ordem" já foi curado em `SEQUENCIAS` (papel, o que a etapa FAZ, AIDA), e
 * o "combina" é medível: papel→categoria (`ROLE_CATEGORIES`), coerência de
 * origem (kit de uma origem só veste melhor que colcha de retalhos) e alcance
 * da marca (peça que a recoloração alcança serve à identidade do projeto).
 *
 * O que a régua decide, na ordem do peso:
 *   1. a peça é da categoria que o papel pede;
 *   2. é da ORIGEM PRINCIPAL do kit (a origem que cobre mais etapas vence);
 *   3. veste mais marca (taxa de recolorabilidade).
 *
 * Papel sem peça não é erro: sai declarado em `passos` com `componentId: null`
 * — a geração cria a seção no estilo do kit quando a permissão está ligada.
 */

export type PecaParaMontagem = {
  id: string;
  name: string;
  category: string;
  kind: string;
  designSystemId: string;
};

export type PassoDaMontagem = {
  papel: SectionRole;
  etapa: string;
  /** O que esta etapa faz no argumento (da sequência curada). */
  faz: string;
  componentId: string | null;
  nome: string | null;
  motivo: string;
};

export type KitAutomatico = {
  componentIds: string[];
  passos: PassoDaMontagem[];
  origemPrincipal: string | null;
  nomeSugerido: string;
  avisos: string[];
};

const candidatasDe = (
  papel: SectionRole,
  pecas: readonly PecaParaMontagem[],
): PecaParaMontagem[] => {
  const categorias = ROLE_CATEGORIES[papel] ?? [papel];
  return pecas.filter((p) => categorias.includes(p.category) || p.category === papel);
};

export const montarKitAutomatico = (
  objetivo: ObjetivoDoSite,
  pecas: readonly PecaParaMontagem[],
  marcaDe: (id: string) => number | null,
): KitAutomatico => {
  const etapas: readonly EtapaDeMarketing[] = SEQUENCIAS[objetivo];
  const avisos: string[] = [];

  // A origem principal é a que consegue COBRIR mais etapas — decidida antes de
  // escolher qualquer peça, senão a primeira escolha enviesa todas as outras.
  const cobertura = new Map<string, number>();
  for (const etapa of etapas) {
    const origens = new Set(candidatasDe(etapa.papel, pecas).map((p) => p.designSystemId));
    for (const o of origens) cobertura.set(o, (cobertura.get(o) ?? 0) + 1);
  }
  const origemPrincipal = [...cobertura.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

  const usadas = new Set<string>();
  const passos: PassoDaMontagem[] = [];

  for (const etapa of etapas) {
    const candidatas = candidatasDe(etapa.papel, pecas).filter((p) => !usadas.has(p.id));
    if (candidatas.length === 0) {
      passos.push({
        papel: etapa.papel,
        etapa: nomeDaEtapa(etapa),
        faz: etapa.faz,
        componentId: null,
        nome: null,
        motivo:
          'sem peça desta categoria na Biblioteca: a geração cria a seção no estilo do kit quando a permissão "criar seções faltantes" está ligada.',
      });
      continue;
    }
    const pontuadas = candidatas
      .map((p) => {
        const daOrigem = p.designSystemId === origemPrincipal;
        const marca = marcaDe(p.id);
        return { p, pontos: (daOrigem ? 2 : 0) + (marca ?? 0), daOrigem, marca };
      })
      .sort((a, b) => b.pontos - a.pontos);
    const melhor = pontuadas[0];
    if (melhor === undefined) continue;
    usadas.add(melhor.p.id);
    const razoes = [
      melhor.daOrigem ? 'da origem principal' : 'de outra origem (única que cobre o papel)',
      melhor.marca !== null
        ? `veste ${Math.round(melhor.marca * 100)}% da marca`
        : 'marca não medida',
    ];
    passos.push({
      papel: etapa.papel,
      etapa: nomeDaEtapa(etapa),
      faz: etapa.faz,
      componentId: melhor.p.id,
      nome: melhor.p.name,
      motivo: razoes.join('; '),
    });
  }

  const escolhidos = passos.filter((p) => p.componentId !== null);
  const origensUsadas = new Set(
    escolhidos.map((p) => pecas.find((x) => x.id === p.componentId)?.designSystemId),
  );
  if (origensUsadas.size > 1) {
    avisos.push(
      `A montagem misturou ${origensUsadas.size} origens: a origem principal não cobre todos os papéis. A recoloração aproxima, mas vale conferir a prévia.`,
    );
  }
  const semPeca = passos.filter((p) => p.componentId === null);
  if (semPeca.length > 0) {
    avisos.push(
      `${semPeca.length} etapa(s) da sequência ficaram sem peça: ${semPeca.map((p) => p.etapa).join(', ')}.`,
    );
  }

  return {
    componentIds: escolhidos.map((p) => p.componentId as string),
    passos,
    origemPrincipal,
    nomeSugerido: `Kit ${objetivo.replace(/-/g, ' ')}`,
    avisos,
  };
};
