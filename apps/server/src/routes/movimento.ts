import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { MOVIMENTO_PADRAO, type TokensDeMovimento, tokensDeMovimento } from '@ds/composer';
import { getDb, tables } from '@ds/indexer';
import { vaultSegmentBundlesDir } from '@ds/shared';
import { Hono } from 'hono';

/**
 * O ritmo do acervo: quanto tempo as coisas levam nos sites que foram trazidos,
 * e com que curva.
 *
 * O dono pediu que as animações do app saíssem do design system que ele extrai.
 * O que atravessa a fronteira aqui são NÚMEROS, nunca regras: uma duração, uma
 * curva. Regra de terceiro no shell furaria o isolamento que o `PreviewFrame`
 * mantém de propósito, e quebraria layout de um jeito que ninguém prevê.
 *
 * A medida sai do CSS já compilado dos bundles — o mesmo material que a
 * recolorabilidade lê. Sem acervo, devolve o padrão e diz `amostras: 0`, que é
 * como a tela sabe que não há medida e não deve fingir que há.
 */
export const movimentoRoute = new Hono();

let cache: { chave: string; valor: TokensDeMovimento } | null = null;

movimentoRoute.get('/', (c) => {
  const db = getDb();
  const dss = db.select({ id: tables.designSystems.id }).from(tables.designSystems).all();
  if (dss.length === 0) return c.json({ tokens: MOVIMENTO_PADRAO });

  // A chave do cache junta id e mtime dos diretórios de bundle: recompilar
  // qualquer um invalida sozinho, e ler o CSS do acervo inteiro a cada carga de
  // página seria caro à toa.
  const partes: string[] = [];
  const folhas: string[] = [];
  for (const { id } of dss) {
    const raiz = vaultSegmentBundlesDir(id as `ds_${string}`);
    if (!existsSync(raiz)) continue;
    try {
      partes.push(`${id}:${statSync(raiz).mtimeMs}`);
      for (const pasta of readdirSync(raiz)) {
        const cssDir = join(raiz, pasta, 'assets', 'css');
        if (!existsSync(cssDir)) continue;
        for (const f of readdirSync(cssDir)) {
          if (f.endsWith('.css')) folhas.push(join(cssDir, f));
        }
      }
    } catch {
      // Diretório ilegível não derruba a medida: o que der para ler já serve.
    }
  }

  const chave = partes.join('|');
  if (cache !== null && cache.chave === chave) return c.json({ tokens: cache.valor });
  if (folhas.length === 0) return c.json({ tokens: MOVIMENTO_PADRAO });

  try {
    // Uma folha por bundle basta: dentro de um site elas repetem o mesmo CSS, e
    // ler todas multiplicaria o custo sem mudar a mediana.
    const css = [...new Set(folhas)]
      .slice(0, 40)
      .map((f) => readFileSync(f, 'utf8'))
      .join('\n');
    const valor = tokensDeMovimento(css);
    cache = { chave, valor };
    return c.json({ tokens: valor });
  } catch {
    return c.json({ tokens: MOVIMENTO_PADRAO });
  }
});
