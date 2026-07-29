import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
/**
 * Gera as variantes do mascote a partir do arquivo original.
 *
 * Uso: pnpm mascote <caminho-do-png>
 *
 * O original tem 2048×2048 e 4,2 MB — pesado demais para embarcar cru numa
 * interface que o carrega em cinco lugares. Este comando produz as versões que a
 * web usa de fato e grava em `apps/web/public/`.
 *
 * Por que o navegador e não uma biblioteca de imagem: o Playwright já instala um
 * Chromium neste projeto, e o Chromium redimensiona melhor do que qualquer coisa
 * que eu escreveria aqui. Acrescentar `sharp` só para isso traria binário nativo,
 * compilação por plataforma e uma dependência a manter — para um comando que roda
 * uma vez por mascote.
 *
 * A imagem entra na página como `data:` URI de propósito: um `file://` dentro de
 * outra página `file://` deixa o canvas "manchado" e o `toDataURL` passa a lançar
 * SecurityError. Com data URI não existe origem para conflitar.
 */
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

type Chromium = {
  launch: (o: { headless: boolean }) => Promise<{
    newPage: () => Promise<{
      evaluate: <T>(
        fn: (a: readonly [string, number]) => Promise<T>,
        arg: readonly [string, number],
      ) => Promise<T>;
    }>;
    close: () => Promise<void>;
  }>;
};

/** As medidas que a interface pede, e onde cada uma é usada. */
const TAMANHOS = [
  { px: 512, arquivo: 'mascote-512.png', onde: 'telas vazias, em alta densidade' },
  { px: 128, arquivo: 'mascote-128.png', onde: 'estados de trabalho e marca' },
  { px: 64, arquivo: 'mascote-64.png', onde: 'favicon' },
] as const;

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DESTINO = join(RAIZ, 'apps', 'web', 'public');

const main = async (): Promise<void> => {
  const origem = process.argv[2];
  if (origem === undefined) {
    console.error('\n  Uso: pnpm mascote <caminho-do-png>\n');
    process.exit(1);
  }
  if (!existsSync(origem)) {
    console.error(`\n  Não achei o arquivo: ${origem}\n`);
    process.exit(1);
  }

  const bytes = readFileSync(origem);
  const dataUri = `data:image/png;base64,${bytes.toString('base64')}`;
  console.log(`\n  Original: ${(bytes.length / 1024 / 1024).toFixed(1)} MB`);

  // O Playwright é dependência do `@ds/engine-v2`, não da raiz — resolver a
  // partir de lá evita declarar a mesma dependência duas vezes só para um
  // comando que roda uma vez por mascote.
  const exigir = createRequire(join(RAIZ, 'packages', 'engine-v2', 'package.json'));
  const { chromium } = exigir('playwright') as { chromium: Chromium };
  const navegador = await chromium.launch({ headless: true });
  const pagina = await navegador.newPage();

  mkdirSync(DESTINO, { recursive: true });
  let somaKb = 0;

  for (const { px, arquivo, onde } of TAMANHOS) {
    const base64 = await pagina.evaluate(
      async ([uri, lado]) => {
        const img = new Image();
        img.src = uri as string;
        await img.decode();
        const c = document.createElement('canvas');
        c.width = lado as number;
        c.height = lado as number;
        const ctx = c.getContext('2d');
        if (ctx === null) throw new Error('sem contexto 2d');
        // `high` é o que faz o Chromium usar reamostragem de qualidade em vez do
        // vizinho mais próximo — num desenho de anéis finos a diferença aparece.
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, lado as number, lado as number);

        // O original é LUZ SOBRE PRETO, sem transparência. Num favicon isso vira
        // um quadrado preto, e sobre um painel de vidro vira uma mancha.
        //
        // Como o desenho é luz, o próprio brilho é a máscara: o alfa de cada
        // pixel passa a ser o canal mais forte dele. Onde era preto (0,0,0) o
        // alfa vai a zero e some; onde havia glow ciano, o alfa acompanha a
        // intensidade e a borda sai suave, sem serrilhado de recorte.
        const d = ctx.getImageData(0, 0, c.width, c.height);
        const px = d.data;
        for (let i = 0; i < px.length; i += 4) {
          const r = px[i] ?? 0;
          const g = px[i + 1] ?? 0;
          const b = px[i + 2] ?? 0;
          px[i + 3] = Math.max(r, g, b);
        }
        ctx.putImageData(d, 0, 0);

        return c.toDataURL('image/png').split(',')[1] ?? '';
      },
      [dataUri, px] as const,
    );

    const saida = Buffer.from(base64, 'base64');
    writeFileSync(join(DESTINO, arquivo), saida);
    somaKb += saida.length / 1024;
    console.log(
      `  ${arquivo.padEnd(18)} ${String(Math.round(saida.length / 1024)).padStart(5)} KB   ${onde}`,
    );
  }

  await navegador.close();
  console.log(`\n  Total embarcado: ${Math.round(somaKb)} KB\n`);
  console.log('  O original NÃO é versionado: só estas variantes entram no repositório.\n');
};

main();
