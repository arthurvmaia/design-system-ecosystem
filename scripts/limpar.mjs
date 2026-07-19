/**
 * Apaga os artefatos de build da pasta de onde o script for chamado.
 *
 * Existe porque `rm -rf` nao existe no Windows, que e onde este projeto roda.
 * Cada package aponta o seu script `clean` para ca:
 *
 *   "clean": "node ../../scripts/limpar.mjs"
 */
import { readdirSync, rmSync } from 'node:fs';

const alvos = ['dist', '.turbo'];

for (const arquivo of readdirSync(process.cwd())) {
  if (arquivo.endsWith('.tsbuildinfo')) alvos.push(arquivo);
}

for (const alvo of alvos) {
  rmSync(alvo, { recursive: true, force: true });
}
