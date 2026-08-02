import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { montarPaginaDoKit } from '@ds/generator';
import { getDb, tables } from '@ds/indexer';
import {
  DEFAULT_LAYOUT,
  DEFAULT_PROJECT_BRANDING,
  ProjectLayout,
  getRoot,
  libraryComponentBundleDir,
  normalizarProjectBranding,
} from '@ds/shared';
import { asc, eq, inArray } from 'drizzle-orm';

/**
 * A prévia do kit MONTADO — as peças juntas, já vestidas com a marca.
 *
 * ## Por que ela precisa existir
 *
 * O app sabia mostrar cada peça sozinha (a Galeria, o Confronto) e sabia
 * resumir o que o kit consolidou (a Fórmula). Não sabia mostrar a única coisa
 * que decide se o kit presta: **as peças juntas**. Uma abertura de um site e
 * uma tabela de preços de outro podem ser lindas separadas e brigar lado a
 * lado — e até aqui isso só aparecia depois de gerar o site inteiro.
 *
 * ## Por que reusa o montador de verdade
 *
 * `montarPaginaDoKit` é o mesmo caminho da geração final: escopo por origem,
 * recoloração, retipografia, proxies, a cascata das quatro folhas. Uma prévia
 * "aproximada", escrita à parte, mentiria exatamente onde mais dói — no
 * conflito entre origens, que é o que a pessoa está tentando enxergar.
 *
 * O que se vê aqui é o que sai. Se as fontes brigam, brigam aqui.
 *
 * ## O layout sintético
 *
 * A prévia não tem estrutura de marketing: é uma seção por peça, na ordem do
 * kit. Não é o site — é o mostruário. A estrutura de verdade a pessoa desenha
 * depois, na tela de gerar site, e ali a ordem tem argumento.
 */

export type EntradaDaPrevia = {
  kitId: string;
  /**
   * A seleção a prever. Ausente = as peças salvas do kit.
   *
   * Existe para a tela poder mostrar o resultado ANTES de salvar: quem está
   * escolhendo precisa ver o efeito da escolha, não o efeito da escolha
   * anterior.
   */
  componentIds?: readonly string[];
  /** De qual projeto vem a marca. Ausente = a marca padrão, neutra. */
  projectId?: string;
};

export type ResultadoDaPrevia =
  | { ok: true; dir: string; avisos: string[]; faltando: string[] }
  | { ok: false; motivo: string };

/** Onde a prévia de cada kit é montada. Fora do vault: é descartável. */
const dirDaPrevia = (kitId: string): string => join(getRoot(), 'cache', 'previa-kit', kitId);

/**
 * Monta a prévia e devolve o diretório servível.
 *
 * Refaz a cada chamada, sem cache. Medido: 2 a 9 peças montam em menos de um
 * segundo, e cache aqui traria a pergunta difícil (invalidar por seleção, por
 * marca, por bundle em disco) para economizar o que não dói.
 */
export const montarPrevia = (entrada: EntradaDaPrevia): ResultadoDaPrevia => {
  const db = getDb();

  const kit = db.select().from(tables.kits).where(eq(tables.kits.id, entrada.kitId)).get();
  if (!kit) return { ok: false, motivo: 'Este kit não existe mais.' };

  const ids =
    entrada.componentIds ??
    db
      .select({ id: tables.kitComponents.componentId })
      .from(tables.kitComponents)
      .where(eq(tables.kitComponents.kitId, entrada.kitId))
      .orderBy(asc(tables.kitComponents.position))
      .all()
      .map((l) => l.id);

  if (ids.length === 0) {
    return { ok: false, motivo: 'Kit vazio: escolha peças na Biblioteca para ver a prévia.' };
  }

  const componentes = db
    .select()
    .from(tables.libraryComponents)
    .where(inArray(tables.libraryComponents.id, [...ids]))
    .all();
  const porId = new Map(componentes.map((c) => [c.id, c]));

  // A ordem pedida manda; peça que sumiu do disco entre a escolha e a montagem
  // simplesmente não entra, e o montador declara a ausência nos avisos.
  const doKit = ids.flatMap((id) => {
    const c = porId.get(id);
    if (c === undefined) return [];
    return [
      {
        id: c.id,
        name: c.name,
        category: c.category,
        kind: c.kind,
        bundlePath: libraryComponentBundleDir(c.id as `cmp_${string}`),
        designSystemId: c.designSystemId,
      },
    ];
  });
  if (doKit.length === 0) {
    return { ok: false, motivo: 'Nenhuma das peças deste kit está em disco.' };
  }

  const projeto =
    entrada.projectId !== undefined
      ? db.select().from(tables.projects).where(eq(tables.projects.id, entrada.projectId)).get()
      : undefined;
  const branding =
    projeto !== undefined
      ? normalizarProjectBranding(projeto.brandingJson)
      : DEFAULT_PROJECT_BRANDING;

  // Uma seção por peça: a prévia é mostruário, não site.
  const layout = ProjectLayout.parse({
    ...DEFAULT_LAYOUT,
    secoes: doKit.map((c) => ({ id: `previa-${c.id}`, nome: c.name, componentIds: [c.id] })),
  });

  const dir = dirDaPrevia(entrada.kitId);
  // Limpa antes: sobra de uma montagem anterior serviria arquivo de uma peça
  // que já não está no kit.
  if (existsSync(dir)) rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });

  try {
    const r = montarPaginaDoKit({
      // A prévia não pertence a projeto nenhum, mas o montador pede um id para
      // resolver a pasta de mídia. O `outputDir` explícito manda, então este id
      // só é usado para procurar mídia que a prévia não tem.
      projectId: (projeto?.id ?? 'prj_previa') as `prj_${string}`,
      titulo: `Prévia — ${kit.name}`,
      kit: { id: kit.id, components: doKit },
      designSystem: kit.tokensJson === null ? null : JSON.parse(kit.tokensJson),
      layout,
      branding,
      outputDir: dir,
    });
    return { ok: true, dir: r.outputDir, avisos: r.avisos, faltando: r.faltando };
  } catch (err) {
    return {
      ok: false,
      motivo: `Não consegui montar a prévia: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
};

export { dirDaPrevia };
