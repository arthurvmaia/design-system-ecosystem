import { explicarPapel } from './estrutura-marketing.js';
import type { ObjetivoDoSite, SecaoDoSite } from './layout.js';

/**
 * Quantas imagens uma seção pede — e, principalmente, POR QUÊ.
 *
 * A etapa de Mídia perguntava "quantas imagens você quer aqui?" sem dizer nada.
 * A pessoa que não sabe responde chutando, e a que sabe já não precisava da
 * pergunta. O que faltava era o motivo.
 *
 * O número sai de duas fontes que se somam, e nenhuma sozinha basta:
 *
 * 1. **A etapa de marketing** sabe o que aquele tipo de seção costuma pedir:
 *    prova social vive de logo de cliente, um passo a passo pede uma imagem por
 *    passo. É conhecimento sobre a PÁGINA.
 * 2. **O contrato das peças escolhidas** sabe quantos espaços de imagem existem
 *    de verdade naquele HTML. É conhecimento sobre o COMPONENTE.
 *
 * Quando as duas falam, vale o contrato: espaço que não existe na peça não vai
 * receber imagem, por mais que a teoria peça. Mas o PORQUÊ continua vindo da
 * etapa — é ele que responde "para que serve esta imagem aqui".
 *
 * Uma seção que não pede imagem devolve `quantas: 0` com a razão dita. Zero é
 * uma resposta; silêncio é uma omissão.
 */

export type SugestaoDeMidia = {
  secaoId: string;
  /** Quantas imagens fazem sentido aqui. Zero é resposta legítima. */
  quantas: number;
  /** O que enviar, em linguagem de quem vai escolher o arquivo. */
  oQue: string;
  /** Por que esta seção pede isso. É a parte que faltava. */
  porque: string;
  /** De onde veio o número — para a tela poder ser honesta sobre a origem. */
  fonte: 'peca' | 'etapa' | 'peca-e-etapa' | 'nenhuma';
};

/** O que o app sabe dos espaços reais de uma peça (vem de `/api/kits/:id/contratos`). */
export type EspacosDaPeca = {
  id: string;
  disponivel: boolean;
  midias: Array<{ tipo: string }>;
};

/**
 * Calcula a sugestão de uma seção.
 *
 * Repare no que ela NÃO faz: não decide por ninguém e não bloqueia nada. "Deixar
 * sem" continua sendo uma resposta válida em qualquer seção — a seção sai no
 * estilo do kit, sem imagem, e o app não cobra de novo.
 */
export const sugerirMidiaDaSecao = (
  secao: SecaoDoSite,
  espacos: readonly EspacosDaPeca[],
  objetivo?: ObjetivoDoSite | null,
): SugestaoDeMidia => {
  const porId = new Map(espacos.map((e) => [e.id, e]));
  // Espaços de imagem REAIS nas peças desta seção. Peça sem contrato legível
  // não entra na conta — chutar por ela produziria um número que ninguém sabe
  // de onde veio.
  let daPeca = 0;
  let algumaPecaConhecida = false;
  for (const id of secao.componentIds) {
    const e = porId.get(id);
    if (e === undefined || !e.disponivel) continue;
    algumaPecaConhecida = true;
    daPeca += e.midias.length;
  }

  const etapa = secao.papel === undefined ? undefined : explicarPapel(secao.papel, objetivo);
  const daEtapa = etapa?.midia;

  // ── Os dois lados falam ──────────────────────────────────────────────────
  if (algumaPecaConhecida && daEtapa !== undefined) {
    return {
      secaoId: secao.id,
      // O contrato manda no número: espaço que não existe não recebe imagem.
      quantas: daPeca,
      oQue: daEtapa.oQue,
      porque:
        daPeca === 0
          ? `As peças desta seção não têm espaço de imagem. ${daEtapa.porque}, então vale considerar uma peça que aceite imagem.`
          : `${nomeDeQuantas(daPeca)} nas peças escolhidas, e ${daEtapa.porque}.`,
      fonte: 'peca-e-etapa',
    };
  }

  // ── Só a peça: sem papel declarado, o contrato é tudo que se sabe ────────
  if (algumaPecaConhecida) {
    return {
      secaoId: secao.id,
      quantas: daPeca,
      oQue: daPeca === 0 ? 'nada: as peças desta seção não mostram imagem' : 'imagens da sua marca',
      porque:
        daPeca === 0
          ? 'Nenhuma das peças desta seção tem espaço de imagem.'
          : `${nomeDeQuantas(daPeca)} nas peças escolhidas.`,
      fonte: 'peca',
    };
  }

  // ── Só a etapa: seção sem peça do kit, que será criada no estilo dele ────
  if (daEtapa !== undefined) {
    return {
      secaoId: secao.id,
      quantas: daEtapa.quantas,
      oQue: daEtapa.oQue,
      porque: `Esta seção será criada no estilo do kit, e ${daEtapa.porque}.`,
      fonte: 'etapa',
    };
  }

  // ── Nenhuma das duas ─────────────────────────────────────────────────────
  return {
    secaoId: secao.id,
    quantas: 0,
    oQue: 'o que fizer sentido para você',
    porque:
      secao.papel === undefined
        ? 'Esta seção não tem papel definido, então o app não tem como sugerir. Envie o que quiser.'
        : 'Este tipo de seção costuma funcionar sem imagem.',
    fonte: 'nenhuma',
  };
};

/** "1 espaço de imagem" / "4 espaços de imagem" — sem parênteses de plural. */
const nomeDeQuantas = (n: number): string =>
  n === 1 ? 'Há 1 espaço de imagem' : `Há ${n} espaços de imagem`;

/** A sugestão de todas as seções, na ordem da página. */
export const sugerirMidia = (
  secoes: readonly SecaoDoSite[],
  espacos: readonly EspacosDaPeca[],
  objetivo?: ObjetivoDoSite | null,
): SugestaoDeMidia[] => secoes.map((s) => sugerirMidiaDaSecao(s, espacos, objetivo));
