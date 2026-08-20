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

const argumento = process.argv[2];
const saida = process.argv[3];
if (argumento === undefined || !argumento.startsWith('prj_')) {
  console.error('uso: pnpm site:gerar <prj_...> [outputDir]');
  process.exit(1);
}
/**
 * O id do projeto e MARCADO (`prj_${string}`), e a marca existe para impedir
 * passar um id de kit onde se espera um de projeto. O terminal entrega texto
 * solto: a conferencia do prefixo acima e o que autoriza a conversao — sem ela
 * seria so um `as` escondendo o problema em vez de resolve-lo.
 *
 * De quebra, a mensagem de uso deixou de citar "node regerar.mjs", que e o nome
 * de um arquivo que nao existe mais.
 */
const projectId = argumento as `prj_${string}`;

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
          // `c.id` vem do banco como `string`; `libraryComponentBundleDir`
          // exige o id MARCADO (`cmp_${string}`). A marca existe para impedir
          // passar um id de projeto onde se espera um de componente, e o banco
          // não a carrega — a conversão é o ponto onde as duas convenções se
          // encontram, e é aqui que ela fica visível.
          bundlePath: libraryComponentBundleDir(c.id as `cmp_${string}`),
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
  midia: midiaBruta.map((m: (typeof midiaBruta)[number]) => ({
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
