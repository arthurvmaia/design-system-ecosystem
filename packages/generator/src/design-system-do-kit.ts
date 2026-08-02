import { consolidarCores, inventariarCores, inventariarFontes } from '@ds/composer';
import {
  KIT_DESIGN_SYSTEM_VERSION,
  type KitDesignSystem,
  type OrigemConsolidada,
} from '@ds/shared';
import { lerCssDoBundle } from './cascata.js';

/**
 * A consolidação: o kit deixa de ser uma lista de ponteiros e vira UM design
 * system, no espírito do script do professor — um artefato único, derivado do
 * que foi compreendido, com o que não se sabe declarado por extenso.
 *
 * A fonte é o CSS REAL dos bundles em disco, não o `contract.tokens` de cada
 * manifesto. Não é preferência: o contrato foi auditado no kit real e estava
 * inutilizável — `papelSugerido` sempre vazio, e as três cores que dominavam a
 * tela nem apareciam, porque o regex de derivação perdia gradientes, sombras e
 * shorthands. O inventário por `walkDecls` do composer enxerga tudo isso, e
 * ler do disco significa que o acervo EXISTENTE ganha design system sem
 * nenhuma re-extração.
 *
 * A tabela sai POR ORIGEM. O mesmo `#111111` é `heading` num site claro e
 * `background` num escuro; um mapa global destruiria qualquer kit que misture
 * temas. Kit misto declara `tema: 'misto'` em vez de fingir coerência.
 */

/**
 * O que a consolidação precisa saber de uma peça: onde está o bundle e de qual
 * origem ela veio. A origem é o que agrupa — duas peças do mesmo site
 * compartilham a folha, e contá-la duas vezes inflaria o peso das cores dela.
 */
export type PecaDoKit = {
  /** Id do componente (`cmp_...`). */
  id: string;
  /** Diretório do bundle em disco. */
  bundlePath: string;
  /** O design system de origem. Ausente, a peça responde por si. */
  designSystemId?: string | null;
};

/** O timestamp entra por parâmetro para a consolidação ser determinística. */
export const consolidarDesignSystemDoKit = (
  pecas: readonly PecaDoKit[],
  agora: number = Date.now(),
): KitDesignSystem => {
  const limitacoes: string[] = [];

  // Agrupa por origem com a MESMA regra da composição: peças do mesmo
  // design system compartilham o CSS da página; consolidar duas vezes só
  // dobraria os pesos sem mudar papel nenhum.
  const porOrigem = new Map<string, PecaDoKit>();
  for (const p of pecas) {
    const origem = p.designSystemId ?? p.id;
    if (!porOrigem.has(origem)) porOrigem.set(origem, p);
  }

  const origens: OrigemConsolidada[] = [];
  for (const [origem, peca] of porOrigem) {
    const { css, faltando } = lerCssDoBundle(peca.bundlePath);
    if (faltando.length > 0) {
      limitacoes.push(
        `[${origem}] ${faltando.length} folha(s) referenciadas no bundle não existem em disco: o inventário saiu do que restou.`,
      );
    }

    if (css.trim().length === 0) {
      limitacoes.push(
        `[${origem}] O bundle não tem CSS para inventariar: a origem ficou sem clusters e as peças dela não serão recoloridas.`,
      );
      origens.push({ designSystemId: origem, tema: 'claro', clusters: [], fontes: [] });
      continue;
    }

    const consolidada = consolidarCores(inventariarCores(css));
    for (const l of consolidada.limitacoes) limitacoes.push(`[${origem}] ${l}`);

    origens.push({
      designSystemId: origem,
      tema: consolidada.tema,
      clusters: consolidada.clusters,
      // As dez mais usadas bastam para o painel; a cauda longa de uma pilha de
      // fallback não é decisão de design.
      fontes: inventariarFontes(css).slice(0, 10),
    });
  }

  const temas = new Set(origens.map((o) => o.tema));
  const tema: KitDesignSystem['tema'] = temas.size > 1 ? 'misto' : (origens[0]?.tema ?? 'claro');
  if (tema === 'misto') {
    limitacoes.push(
      'As origens deste kit divergem de tema (clara e escura juntas): os neutros de cada uma seguem o próprio tema, e vale conferir o contraste na prévia.',
    );
  }

  return {
    versao: KIT_DESIGN_SYSTEM_VERSION,
    geradoEm: agora,
    tema,
    origens,
    limitacoes,
  };
};
