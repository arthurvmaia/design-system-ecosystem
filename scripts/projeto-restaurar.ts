/**
 * Devolve ao índice um projeto cujos arquivos ainda estão em disco.
 *
 * Uso: pnpm projeto:restaurar <prj_id> [nome]
 *
 * Existe por um caso real: um projeto foi excluído no app ENQUANTO a geração
 * dele rodava. O `DELETE` apagou a linha do banco e as pastas de configuração,
 * mas quem estava gerando continuou escrevendo — e os sites terminaram em
 * `projects/<id>/generated/`, íntegros, invisíveis para a tela de Meus sites,
 * que lista a partir do banco.
 *
 * Isto NÃO reinventa o projeto: nome, kit e marca originais foram apagados com a
 * linha e não voltam. O que este script faz é reabrir a porta para o que
 * sobreviveu, com valores neutros, para o trabalho gerado deixar de ficar
 * inalcançável. Recusa se a pasta não existir ou se o id já estiver no banco.
 */
import { existsSync, readdirSync } from 'node:fs';
import { eq, getDb, runMigrations, tables } from '@ds/indexer';
import {
  DEFAULT_LAYOUT,
  DEFAULT_PROJECT_BRANDING,
  DEFAULT_PROJECT_CONTENT,
  ProjectLayout,
  projectDir,
  projectGeneratedDir,
} from '@ds/shared';

const [, , idBruto, nomeBruto] = process.argv;

if (idBruto === undefined || !idBruto.startsWith('prj_')) {
  console.error('Uso: pnpm projeto:restaurar <prj_id> [nome]');
  console.error('O id é o nome da pasta em ~/design-system-ecosystem/projects/.');
  process.exit(1);
}

const id = idBruto as `prj_${string}`;
const pasta = projectDir(id);

if (!existsSync(pasta)) {
  console.error(`\n  Não existe pasta para ${id}. Não há o que restaurar.\n`);
  process.exit(1);
}

runMigrations();
const db = getDb();

if (db.select().from(tables.projects).where(eq(tables.projects.id, id)).get() !== undefined) {
  console.error(`\n  ${id} já está no banco. Nada a fazer.\n`);
  process.exit(1);
}

const geradas = existsSync(projectGeneratedDir(id))
  ? readdirSync(projectGeneratedDir(id)).filter((n) => !n.startsWith('.'))
  : [];

const agora = Date.now();
db.insert(tables.projects)
  .values({
    id,
    name: nomeBruto?.trim() || 'Projeto recuperado',
    createdAt: agora,
    updatedAt: agora,
    kitId: null,
    contentJson: JSON.stringify(DEFAULT_PROJECT_CONTENT),
    brandingJson: JSON.stringify(DEFAULT_PROJECT_BRANDING),
    mediaManifestJson: '[]',
    layoutJson: JSON.stringify(ProjectLayout.parse(DEFAULT_LAYOUT)),
    // Com site em disco o projeto já nasce gerado; sem, volta como rascunho.
    status: geradas.length > 0 ? 'generated' : 'draft',
  })
  .run();

console.log(`\n  ${id} voltou para o índice.`);
if (geradas.length > 0) {
  console.log(`  ${geradas.length} versão(ões) do site reencontrada(s), em Meus sites:`);
  for (const g of geradas) console.log(`    ${g}`);
} else {
  console.log('  Nenhum site gerado na pasta, então o projeto voltou como rascunho.');
}
console.log('\n  Nome, kit e marca originais não voltam: foram apagados com a linha.\n');
