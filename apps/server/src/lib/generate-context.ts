import {
  BUILTIN_BLUEPRINTS,
  GeneratePayload,
  type KitComponenteDeGeracao,
  type LayoutBlueprint,
  MediaManifest,
  getBlueprint,
  libraryComponentBundleDir,
  normalizarProjectBranding,
  normalizarProjectContent,
  normalizarProjectLayout,
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
  kit: { id: string; name: string };
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
  blueprint: LayoutBlueprint;
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
  if (layout.mode === 'criativo') {
    layout.creativeSeed = (dados.sortearSeed ?? (() => Math.floor(Math.random() * 1_000_000)))();
  }

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

  const blueprint = getBlueprint(layout.blueprintId) ?? (BUILTIN_BLUEPRINTS[0] as LayoutBlueprint);

  const components: KitComponenteDeGeracao[] = dados.componentes.map((cmp) => ({
    id: cmp.id as `cmp_${string}`,
    name: cmp.name,
    category: cmp.category,
    kind: cmp.kind,
    bundlePath: libraryComponentBundleDir(cmp.id as `cmp_${string}`),
    designSystemId: cmp.designSystemId,
  }));

  // Escolha fixada apontando para componente que saiu do kit: degrada para a
  // sugestão automática (o resolver já faz isso) — mas a pessoa fica sabendo.
  for (const p of layout.placements) {
    if (
      p.escolha === 'componente' &&
      p.componentId !== null &&
      !components.some((c) => c.id === p.componentId)
    ) {
      avisos.push(
        `A seção "${p.role}" fixava um componente que não está mais no kit — a escolha voltou para o automático.`,
      );
    }
  }

  const payload = GeneratePayload.parse({
    projectId: dados.projeto.id,
    projectName: dados.projeto.name,
    kitId: dados.kit.id,
    kit: { id: dados.kit.id, name: dados.kit.name, components },
    layout,
    blueprintId: blueprint.id,
    branding,
    content,
    media,
  });

  return { payload, blueprint, avisos };
};
