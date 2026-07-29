/**
 * Recolhe as pastas do vault que não pertencem a nenhum design system do app.
 *
 * Uso:
 *   pnpm acervo:limpar-orfas          # lista o que faria (não apaga nada)
 *   pnpm acervo:limpar-orfas --apagar # apaga de verdade
 *
 * Elas nascem de um vazamento que já foi fechado: apagar um design system na
 * tela removia a linha do banco e deixava a captura inteira no disco. Medido
 * quando o buraco apareceu: **30 das 32 pastas eram órfãs**, num vault de
 * 851 MB.
 *
 * Uma pasta que o app não mostra e não sabe abrir não é backup — é espaço
 * ocupado sem dono. Mas apagar arquivo de alguém é definitivo, então o padrão
 * aqui é **listar**: quem lê decide, e só então passa `--apagar`.
 *
 * O que NUNCA é tocado: as peças da Biblioteca (`library/<cmp>/`). Elas são
 * cópias autônomas e sobrevivem à exclusão da extração de origem — é para isso
 * que a promoção copia em vez de referenciar.
 */
import { existsSync, readdirSync, rmSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { getDb, runMigrations, tables } from '@ds/indexer';
import { podeApagarDesignSystem, vaultDir } from '@ds/shared';
import { executadoDireto } from './executado-direto.js';

/** Tamanho de um diretório, em bytes. Recursivo e tolerante a erro de leitura. */
export const tamanhoDe = (dir: string): number => {
  let total = 0;
  const pilha = [dir];
  while (pilha.length > 0) {
    const atual = pilha.pop();
    if (atual === undefined) continue;
    let itens: string[];
    try {
      itens = readdirSync(atual);
    } catch {
      continue;
    }
    for (const nome of itens) {
      const p = join(atual, nome);
      try {
        const st = statSync(p);
        if (st.isDirectory()) pilha.push(p);
        else total += st.size;
      } catch {
        // arquivo sumiu no meio da varredura: não é motivo para parar a conta
      }
    }
  }
  return total;
};

const emMb = (bytes: number): string => `${(bytes / 1024 / 1024).toFixed(1)} MB`;

export type Orfa = { id: string; dir: string; bytes: number };

/**
 * Quais nomes de pasta não têm dono. Função PURA, de propósito.
 *
 * A decisão de "o que não pertence a ninguém" precede a de "o que apagar", e é
 * ela que erra primeiro se errar. Separada da leitura do disco e do banco, ela
 * pode ser testada com uma lista na mão — que é o único jeito de conferir os
 * casos que ninguém quer descobrir em produção.
 */
export const orfasEntre = (pastas: readonly string[], idsNoBanco: ReadonlySet<string>): string[] =>
  pastas.filter((n) => n.startsWith('ds_') && !idsNoBanco.has(n));

/**
 * A guarda de caminho — a última coisa entre um engano e os arquivos de alguém.
 *
 * Ela vive em `@ds/shared`, não aqui, porque DOIS lugares apagam: este comando e
 * a rota de exclusão do servidor. Cada um tinha a sua versão escrita à mão, e
 * duas guardas que precisam concordar acabam discordando — só que aqui a que
 * discordar primeiro leva arquivo junto.
 */
export const podeApagar = podeApagarDesignSystem;

/** As pastas do vault sem linha correspondente no banco. */
export const acharOrfas = (): Orfa[] => {
  const raiz = vaultDir();
  if (!existsSync(raiz)) return [];
  const noBanco = new Set(
    getDb()
      .select()
      .from(tables.designSystems)
      .all()
      .map((l) => l.id),
  );
  return orfasEntre(readdirSync(raiz), noBanco)
    .map((id) => {
      const dir = join(raiz, id);
      return { id, dir, bytes: tamanhoDe(dir) };
    })
    .sort((a, b) => b.bytes - a.bytes);
};

/**
 * Apaga uma órfã, com a mesma guarda de caminho da rota de exclusão: só some do
 * disco o que está DENTRO do vault e tem nome de design system.
 */
export const apagarOrfa = (orfa: Orfa): boolean => {
  if (!podeApagar(orfa.dir, vaultDir(), orfa.id)) return false;
  try {
    rmSync(resolve(orfa.dir), { recursive: true, force: true });
    return true;
  } catch {
    return false;
  }
};

const principal = (): void => {
  runMigrations();
  const apagar = process.argv.includes('--apagar');
  const orfas = acharOrfas();

  if (orfas.length === 0) {
    console.log('\n  Nenhuma pasta órfã: o vault tem só o que o app mostra.\n');
    return;
  }

  const total = orfas.reduce((n, o) => n + o.bytes, 0);
  console.log(`\n  ${orfas.length} pasta(s) sem design system no app, somando ${emMb(total)}:\n`);
  for (const o of orfas.slice(0, 12)) {
    console.log(`    ${emMb(o.bytes).padStart(9)}  ${o.id}`);
  }
  if (orfas.length > 12) console.log(`    e mais ${orfas.length - 12}`);
  console.log('');

  if (!apagar) {
    console.log('  Nada foi apagado. Para remover de vez:');
    console.log('    pnpm acervo:limpar-orfas --apagar');
    console.log('');
    console.log('  As peças que você curou na Biblioteca NÃO estão aqui: elas são');
    console.log('  cópias próprias e não dependem destas pastas.');
    console.log('');
    return;
  }

  let removidas = 0;
  let liberado = 0;
  for (const o of orfas) {
    if (apagarOrfa(o)) {
      removidas++;
      liberado += o.bytes;
    } else {
      console.log(`    não deu para apagar: ${o.id}`);
    }
  }
  console.log(`  ${removidas} pasta(s) removida(s), ${emMb(liberado)} liberados.\n`);
};

if (executadoDireto(import.meta.url)) principal();
