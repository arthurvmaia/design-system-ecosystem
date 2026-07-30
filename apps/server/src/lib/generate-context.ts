import {
  GeneratePayload,
  type KitComponenteDeGeracao,
  MediaManifest,
  libraryComponentBundleDir,
  normalizarProjectBranding,
  normalizarProjectContent,
  normalizarProjectLayout,
  resolverSecoes,
  slugDaSecao,
} from '@ds/shared';

/**
 * O construtor ÚNICO do contexto de geração.
 *
 * Fila e API divergiam aqui: a fila levava mídia/kit/bundlePath e a API levava
 * um catálogo achatado SEM mídia — o que o usuário configurava no wizard
 * chegava em um modo e sumia no outro. Agora os dois ramos de
 * `POST /:id/generate` chamam esta função e recebem o MESMO `GeneratePayload`
 * validado; qualquer campo novo entra AQUI e chega aos dois mundos ou a nenhum.
 *
 * É função PURA sobre os dados carregados (linha do projeto + kit + componentes
 * na ordem curada): sem banco, sem fs — o chamador injeta; o teste também.
 */

export type DadosParaContexto = {
  projeto: {
    id: string;
    name: string;
    contentJson: string | null;
    brandingJson: string | null;
    mediaManifestJson: string | null;
    layoutJson: string | null;
  };
  kit: {
    id: string;
    name: string;
    /**
     * O design system consolidado (`kits.tokensJson`, já parseado). Vai no
     * payload para a recoloração; null degrada para as cores de origem.
     */
    designSystem?: unknown;
  };
  /** Componentes do kit NA ORDEM curada (links resolvidos pelo chamador). */
  componentes: readonly {
    id: string;
    name: string;
    category: string;
    kind: string;
    designSystemId: string | null;
  }[];
  /** Ids que o kit referencia mas já não existem na Biblioteca. */
  ausentes?: readonly string[];
  /**
   * Sorteio da seed criativa (injetável para teste determinístico). No modo
   * criativo cada geração sorteia composição nova — comportamento preservado.
   */
  sortearSeed?: () => number;
};

export type ContextoDeGeracao = {
  payload: GeneratePayload;
  /** Avisos NÃO bloqueantes (ex.: componente do kit removido da Biblioteca). */
  avisos: string[];
};

export const montarContextoDeGeracao = (dados: DadosParaContexto): ContextoDeGeracao => {
  const avisos: string[] = [];
  for (const id of dados.ausentes ?? []) {
    avisos.push(
      `O kit referencia o componente ${id}, que não existe mais na Biblioteca — o site será composto sem ele.`,
    );
  }

  const content = normalizarProjectContent(dados.projeto.contentJson);
  const branding = normalizarProjectBranding(dados.projeto.brandingJson);
  const layout = normalizarProjectLayout(dados.projeto.layoutJson);

  let media: GeneratePayload['media'] = [];
  if (dados.projeto.mediaManifestJson) {
    try {
      const tentado = MediaManifest.safeParse(JSON.parse(dados.projeto.mediaManifestJson));
      if (tentado.success) media = tentado.data;
      else avisos.push('O manifest de mídia do projeto está ilegível — a geração segue sem mídia.');
    } catch {
      avisos.push('O manifest de mídia do projeto está ilegível — a geração segue sem mídia.');
    }
  }

  const components: KitComponenteDeGeracao[] = dados.componentes.map((cmp) => ({
    id: cmp.id as `cmp_${string}`,
    name: cmp.name,
    category: cmp.category,
    kind: cmp.kind,
    bundlePath: libraryComponentBundleDir(cmp.id as `cmp_${string}`),
    designSystemId: cmp.designSystemId,
  }));

  // Peça que saiu do kit: a seção degrada para "criada no estilo" (o resolver já
  // faz isso) — mas a pessoa fica sabendo, em vez de estranhar o site depois.
  avisos.push(...resolverSecoes(layout.secoes, components).avisos);

  // O `slotRole` de cada mídia é DERIVADO aqui, não gravado no upload.
  //
  // É o espelho legado do papel da seção, e derivar na hora de montar o payload
  // é o que faz ele se curar sozinho: renomear a seção, trocar a peça ou mudar o
  // tipo atualiza o espelho na próxima geração. Mídia apontando para uma seção
  // que a pessoa apagou perde o espelho em vez de mentir sobre onde vai.
  const secaoPorId = new Map(layout.secoes.map((s) => [s.id, s]));
  const midiaComEspelho = media.map((m) => {
    const secao = m.secaoId !== undefined ? secaoPorId.get(m.secaoId) : undefined;
    if (secao === undefined) {
      const { slotRole: _fora, ...resto } = m;
      return resto;
    }
    return { ...m, slotRole: slugDaSecao(secao, components) };
  });

  const payload = GeneratePayload.parse({
    projectId: dados.projeto.id,
    projectName: dados.projeto.name,
    kitId: dados.kit.id,
    kit: {
      id: dados.kit.id,
      name: dados.kit.name,
      components,
      designSystem: dados.kit.designSystem ?? null,
    },
    layout,
    branding,
    content,
    media: midiaComEspelho,
  });

  return { payload, avisos };
};
