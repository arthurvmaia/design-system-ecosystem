/**
 * Explora uma URL com o motor de captura e grava o manifesto rico no vault.
 *
 * Uso: pnpm explorar <url> [ds_id]
 *
 * Serve aos dois modos. No modo `queue` é a ferramenta que o operador roda para
 * capturar estados e assets antes de segmentar; no modo `api` a mesma função
 * (`explorePage`) é chamada de dentro do servidor.
 *
 * Sem Playwright instalado, degrada para captura estática (sem descoberta de
 * estados) e avisa — não trava. Para a captura completa:
 *   pnpm --filter @ds/explorer exec playwright install chromium
 *
 * NÃO dispara trabalho sozinho e NÃO chama a API da Anthropic: é só captura de
 * navegador sob demanda, iniciada por uma pessoa.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { explorePage } from '@ds/explorer';
import {
  newDesignSystemId,
  vaultCaptureAssetsDir,
  vaultCaptureManifest,
  vaultExtractedDir,
} from '@ds/shared';

const main = async (): Promise<void> => {
  const [, , url, dsArg] = process.argv;

  if (url === undefined) {
    console.error('Uso: pnpm explorar <url> [ds_id]');
    process.exit(1);
  }

  const dsId = dsArg?.startsWith('ds_') ? (dsArg as `ds_${string}`) : newDesignSystemId();
  const assetsDir = vaultCaptureAssetsDir(dsId);
  mkdirSync(assetsDir, { recursive: true });

  const started = Date.now();
  console.log(`Explorando ${url}\n  → captura ${dsId}\n`);

  const extractedDir = vaultExtractedDir(dsId);
  mkdirSync(extractedDir, { recursive: true });

  const manifest = await explorePage(url, {
    log: (evento, dados) => console.log(`  [${evento}] ${dados ? JSON.stringify(dados) : ''}`),
    assetSink: (localPath, bytes) => {
      const full = join(assetsDir, localPath);
      mkdirSync(dirname(full), { recursive: true });
      writeFileSync(full, bytes);
    },
    // Grava o DOM renderizado como design-system.html — a melhor fonte para o
    // segmenter (roda `pnpm segmentar <ds_id>` em seguida).
    onRenderedHtml: (html) => writeFileSync(join(extractedDir, 'design-system.html'), html, 'utf8'),
  });

  const manifestPath = vaultCaptureManifest(dsId);
  mkdirSync(dirname(manifestPath), { recursive: true });
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');

  console.log(
    `\nCaptura (${manifest.strategy}) em ${((Date.now() - started) / 1000).toFixed(1)}s:` +
      `\n  ${manifest.elements.length} elementos interativos` +
      `\n  ${manifest.stats.statesFound} estados descobertos` +
      `\n  ${manifest.assets.length} assets salvos (${(manifest.stats.assetsBytes / 1024).toFixed(0)} KB)`,
  );
  for (const w of manifest.warnings) console.log(`  aviso: ${w}`);
  console.log(`\nManifesto: ${manifestPath}`);
};

main().catch((err) => {
  console.error(`\nFalha na exploração: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
