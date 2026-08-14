/**
 * Recompõe a prévia de um kit direto do disco, sem passar pelo servidor.
 *
 * Existe para diagnóstico e verificação: depois de um conserto no compositor,
 * `pnpm tsx scripts/recompor-previa-kit.ts <kit_id>` produz o MESMO artefato
 * que a rota da prévia produziria (mesmo `montarPrevia`), pronto para abrir
 * no navegador ou servir estático — sem esperar o watch do servidor.
 */
import { montarPrevia } from '../apps/server/src/lib/previa-do-kit.js';

const kitId = process.argv[2];
if (kitId === undefined || !/^kit_[A-Za-z0-9]+$/.test(kitId)) {
  console.error('uso: pnpm tsx scripts/recompor-previa-kit.ts <kit_id>');
  process.exit(1);
}

const r = montarPrevia({ kitId });
if (!r.ok) {
  console.error('falhou:', r.motivo);
  process.exit(1);
}
console.log('prévia recomposta em', r.dir);
console.log('avisos:', r.avisos.length);
for (const a of r.avisos) console.log(' -', a);
