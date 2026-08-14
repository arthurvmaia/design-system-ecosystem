/**
 * Monta o site de um projeto pelo caminho DETERMINÍSTICO, direto do banco.
 *
 * Uso: pnpm site:gerar <prj_...> [pastaDeSaída]
 *
 * É `montarPaginaDoKit` sem a etapa criativa: nenhuma substituição de texto,
 * nenhuma seção inventada. Serve para duas coisas que valem por si:
 *
 * - **medir o efeito de uma mudança na composição** sem pagar LLM nem esperar
 *   a fila — foi assim que o grid medido, o `min-h-screen` que inchava a nav e
 *   a troca de fotos foram todos verificados;
 * - **ver o esqueleto** que o kit produz antes de escrever a copy.
 *
 * O texto sai o da origem, e isso é esperado aqui: quem o troca é o criativo do
 * job `generate`, escrito por quem enxerga a marca.
 */
import { montarPaginaDoKit } from '@ds/generator';
import { getDb, tables } from '@ds/indexer';
import {
  DEFAULT_PROJECT_BRANDING,
  ProjectLayout,
  libraryComponentBundleDir,
  normalizarProjectBranding,
} from '@ds/shared';
import { eq, inArray } from 'drizzle-orm';

const projectId = process.argv[2];
const saida = process.argv[3];
if (!projectId) {
  console.error('uso: node regerar.mjs <prj_...> [outputDir]');
  process.exit(1);
}

const db = getDb();
const projeto = db.select().from(tables.projects).where(eq(tables.projects.id, projectId)).get();
if (!projeto) throw new Error(`projeto ${projectId} não existe`);

const layout = ProjectLayout.parse(JSON.parse(projeto.layoutJson ?? '{}'));
const branding = projeto.brandingJson
  ? normalizarProjectBranding(projeto.brandingJson)
  : DEFAULT_PROJECT_BRANDING;
const midiaBruta = JSON.parse(projeto.mediaManifestJson ?? '[]');

// O kit é o que as seções do layout referenciam.
const ids = [...new Set(layout.secoes.flatMap((s) => s.componentIds ?? []))];
const comps = db
  .select()
  .from(tables.libraryComponents)
  .where(inArray(tables.libraryComponents.id, ids))
  .all();
const porId = new Map(comps.map((c) => [c.id, c]));
const components = ids.flatMap((id) => {
  const c = porId.get(id);
  return c
    ? [
        {
          id: c.id,
          name: c.name,
          category: c.category,
          kind: c.kind,
          bundlePath: libraryComponentBundleDir(c.id),
          designSystemId: c.designSystemId,
        },
      ]
    : [];
});

const kitLinha = db
  .select()
  .from(tables.kits)
  .where(eq(tables.kits.id, projeto.kitId ?? ''))
  .get();

const r = montarPaginaDoKit({
  projectId,
  titulo: projeto.name,
  kit: { id: kitLinha?.id ?? 'kit_ad_hoc', components },
  designSystem: kitLinha?.tokensJson ? JSON.parse(kitLinha.tokensJson) : null,
  layout,
  branding,
  midia: midiaBruta.map((m) => ({
    de: m.path,
    para: `midia/${m.path}`,
    secaoId: m.secaoId,
    kind: m.kind,
  })),
  ...(saida ? { outputDir: saida } : {}),
});

console.log('saída:', r.outputDir);
console.log('peças:', components.length, '| arquivos:', r.arquivos.length);
for (const a of r.avisos) console.log('  •', a);
if (r.faltando.length) console.log('  faltando:', r.faltando.join(', '));
