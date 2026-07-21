/**
 * Teste de generalização da segmentação.
 *
 * Uso: pnpm testar:segmentacao "<pasta com um subdiretorio por site>"
 *
 * Roda o segmentador de verdade contra uma pasta de sites reais — o Banco de
 * Referências serve bem, porque tem de HTML semântico exemplar a página 100%
 * `div`. É o teste que importa: o app precisa funcionar em qualquer página que
 * alguém resolva extrair, não só nas que vêm com `<!-- rótulos -->`.
 *
 * Reprova por dois defeitos, e só por estes dois:
 *
 *   lixo  — fragmento vazio demais para curar (o `<p>` de 238 bytes)
 *   blob  — um segmento sozinho carregando a página inteira
 *
 * A CONTAGEM de segmentos não entra no critério de propósito. Uma página que
 * demonstra duas sidebars deve dar dois segmentos mesmo; exigir um mínimo
 * reprovava o acerto.
 */
import { copyFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { segmentDesignSystem } from '@ds/segmenter';

const BANCO = process.argv[2];
if (!BANCO) throw new Error('uso: pnpm testar:segmentacao "<pasta>"');

// Root isolado: o teste escreve dezenas de vaults descartáveis e não pode
// encostar no acervo de verdade.
const raizTmp = process.env.DS_ECOSYSTEM_ROOT;
if (!raizTmp) throw new Error('defina DS_ECOSYSTEM_ROOT para uma pasta descartável');

const pastas = readdirSync(BANCO, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name);

let totalOk = 0;
let totalRuim = 0;

for (const [i, pasta] of pastas.entries()) {
  const src = join(BANCO, pasta, 'index.html');
  if (!existsSync(src)) continue;

  const dsId = `ds_teste${String(i).padStart(2, '0')}` as `ds_${string}`;
  const dir = join(raizTmp, 'vault', dsId, 'extracted');
  mkdirSync(dir, { recursive: true });
  copyFileSync(src, join(dir, 'design-system.html'));

  try {
    const { segments } = segmentDesignSystem(dsId);
    const tam = segments.map((s) => s.htmlSnippet.length);
    const total = tam.reduce((a, b) => a + b, 0);
    const media = tam.length ? Math.round(total / tam.length) : 0;

    // Dois defeitos, e so estes dois. Contagem de segmentos NAO entra: uma
    // pagina que demonstra duas sidebars deve dar dois segmentos mesmo, e
    // exigir um minimo reprovava o acerto.
    //
    //   lixo  - fragmento vazio demais para curar
    //   blob  - um segmento sozinho carregando a pagina inteira
    // Os itens de sistema (tipografia, botões, cards, interações) são resumos
    // sintetizados, não fatias do DOM — um resumo de animações pode ser
    // legitimamente curto ("@keyframes: fadeIn, marqueeScroll") e não é lixo.
    // A métrica só faz sentido sobre o que veio da página.
    const daPagina = segments.filter(
      (s) => !['typography', 'button', 'card', 'interaction'].includes(s.category),
    );
    const lixo = daPagina.filter((s) => s.htmlSnippet.length < 200).length;
    const maior = tam.length ? Math.max(...tam) : 0;
    const blob = segments.length > 1 && total > 0 && maior / total > 0.85;

    const bom = lixo === 0 && !blob;
    if (bom) totalOk++;
    else totalRuim++;

    console.log(
      `${bom ? 'OK  ' : 'RUIM'} ${pasta.padEnd(26)} ${String(segments.length).padStart(3)} seg  ` +
        `media ${String(media).padStart(6)}b  lixo(<200b): ${lixo}  maior: ${Math.round((maior / (total || 1)) * 100)}%`,
    );
    if (!bom) {
      for (const s of segments.slice(0, 8)) {
        console.log(
          `        - ${s.name.padEnd(22)} ${s.category.padEnd(11)} ${s.htmlSnippet.length}b`,
        );
      }
    }
  } catch (e) {
    totalRuim++;
    console.log(`ERRO ${pasta.padEnd(26)} ${(e as Error).message.slice(0, 70)}`);
  }
}

console.log(`\n=== ${totalOk} ok / ${totalRuim} ruim ===`);
process.exit(totalRuim > 0 ? 1 : 0);
