/**
 * `pnpm kits:provar` — TODO kit gera um site de teste, e o site é conferido.
 *
 * ## Por que isto existe
 *
 * Um kit é uma promessa: "estas peças montam um site". Até aqui, a promessa só
 * era conferida quando um cliente pedia o site — e o defeito aparecia no pior
 * lugar. Kit não validado é kit que só falha na frente de quem paga.
 *
 * O dono pediu por extenso: *"testar todos os kits novos gerados para ver se
 * estão funcionando e tudo certo (…) a ideia é mais ver se os kits estão
 * realmente validados e passando em todos testes e regras, pois se não,
 * deve-se arrumar"*. E deu liberdade sobre a marca destes testes: ela é
 * material de prova, não entrega.
 *
 * ## O que ele faz, por kit
 *
 * 1. inventa uma marca do nicho do kit (a marca automática já sabe fazer isso);
 * 2. monta um projeto a partir do kit e gera o site pelo caminho determinístico;
 * 3. confere no navegador em 1440 e 390, **sem `--corrigir`** — corrigir aqui
 *    mascararia justamente o defeito que se quer ver;
 * 4. junta as regras do arquivo (`aceite.json`) com as do navegador.
 *
 * ## Duas decisões que valem saber
 *
 * **Sai != 0 quando algum kit reprova.** Um banco de prova que sempre sai zero
 * não prova nada — vira enfeite, como a regra alimentada por constante que este
 * projeto já teve.
 *
 * **Os projetos de teste são APAGADOS no fim.** Eles nascem só para provar, e
 * deixá-los encheria "Meus sites" de site de mentira até ninguém achar o de
 * verdade. `--manter` guarda, para quando se quer abrir e olhar.
 */

import { config as carregarEnv } from 'dotenv';

// O `.env` do servidor ANTES de qualquer import que o leia: a marca automática
// busca foto com a chave que mora lá, e sem ela cai no desenho em silêncio.
carregarEnv({
  path: new URL('../apps/server/.env', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'),
});

import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getDb, tables } from '@ds/indexer';
import { type ResultadoDeAceite, projectDir } from '@ds/shared';
import { asc, eq } from 'drizzle-orm';
import { executadoDireto } from './executado-direto.js';
import { maisNovoPorNome } from './kits-escolha.js';

/** Uma linha do placar: um kit e o que aconteceu com ele. */
type ProvaDeKit = {
  kit: string;
  projectId: string | null;
  pasta: string | null;
  /** Código da regra → estado, juntando arquivo e navegador. */
  regras: Record<string, string>;
  reprovou: string[];
  pendente: string[];
  erro: string | null;
};

/**
 * O nicho que a marca automática vai receber, derivado do NOME do kit.
 *
 * Os kits nascem nomeados pelo nicho (`montar-kits.ts` os monta assim), então o
 * próprio nome é o melhor palpite disponível — e é bem melhor que uma constante:
 * um kit de clínica recebe marca de clínica, e o teste exercita a combinação
 * que o kit existe para servir.
 */
const nichoDoKit = (nome: string): string => nome.split('·')[0]?.trim() ?? nome.trim();

/** Um nome de marca estável por kit: repetir a prova dá o mesmo nome. */
const marcaDoKit = (nome: string): string => `Prova ${nichoDoKit(nome)}`;

/**
 * Roda um script do repo em processo separado, SEM shell.
 *
 * Sem shell de propósito, e isto custou uma rodada para descobrir: com
 * `shell: true` no Windows, um nome de kit como "Portfólio e estúdio" chega
 * partido em três argumentos, e o script filho morre com um erro de módulo que
 * não diz nada sobre a causa. Chamando o próprio node com `--import tsx`, os
 * argumentos viajam como array e nome com espaço e acento atravessa inteiro.
 */
const rodar = (args: readonly string[], cwd: string): { ok: boolean; saida: string } => {
  const r = spawnSync(process.execPath, ['--import', 'tsx', ...args], {
    cwd,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  return { ok: r.status === 0, saida: `${r.stdout ?? ''}${r.stderr ?? ''}` };
};

/** O `prj_...` que o `projeto:de-kit` imprime na última linha. */
const idNaSaida = (texto: string): string | null => /\b(prj_[A-Z0-9]+)\b/.exec(texto)?.[1] ?? null;

/** Junta os vereditos de um `ResultadoDeAceite` no mapa código→estado. */
const juntar = (destino: Record<string, string>, r: ResultadoDeAceite | null): void => {
  for (const v of r?.vereditos ?? []) {
    // Reprovação nunca é sobrescrita por um "passou" da outra fonte: o pior
    // veredito sobre a mesma regra é o que vale.
    if (destino[v.codigo] === 'reprovou') continue;
    destino[v.codigo] = v.estado;
  }
};

const lerJson = <T>(caminho: string): T | null => {
  if (!existsSync(caminho)) return null;
  try {
    return JSON.parse(readFileSync(caminho, 'utf8')) as T;
  } catch {
    return null;
  }
};

export const provarKits = async (opcoes: {
  raizDoRepo: string;
  manter: boolean;
  apenas: string | null;
}): Promise<ProvaDeKit[]> => {
  const db = getDb();
  const todos = db
    .select({ id: tables.kits.id, name: tables.kits.name, createdAt: tables.kits.createdAt })
    .from(tables.kits)
    .orderBy(asc(tables.kits.name))
    .all();

  const kits = maisNovoPorNome(todos);
  if (todos.length > kits.length) {
    console.log(
      `  ${todos.length - kits.length} kit(s) superado(s) ficam de fora: mesmo nome, versao mais antiga.`,
    );
  }

  const filtro = opcoes.apenas === null ? null : opcoes.apenas.toLowerCase();
  const escolhidos =
    filtro === null ? kits : kits.filter((k) => k.name.toLowerCase().includes(filtro));

  const saidas = mkdtempSync(join(tmpdir(), 'kits-provar-'));
  const provas: ProvaDeKit[] = [];

  for (const kit of escolhidos) {
    const prova: ProvaDeKit = {
      kit: kit.name,
      projectId: null,
      pasta: null,
      regras: {},
      reprovou: [],
      pendente: [],
      erro: null,
    };
    provas.push(prova);
    console.log(`\n  ── ${kit.name} ──`);

    const criado = rodar(
      [
        'scripts/projeto-de-kit.ts',
        kit.name,
        marcaDoKit(kit.name),
        nichoDoKit(kit.name).toLowerCase(),
      ],
      opcoes.raizDoRepo,
    );
    const projectId = idNaSaida(criado.saida);
    if (projectId === null) {
      prova.erro = `não consegui criar o projeto: ${criado.saida.trim().split('\n').slice(-3).join(' ')}`;
      console.log(`  ✗ ${prova.erro}`);
      continue;
    }
    prova.projectId = projectId;

    const pasta = join(saidas, projectId);
    const gerado = rodar(['scripts/site-gerar.ts', projectId, pasta], opcoes.raizDoRepo);
    if (!gerado.ok || !existsSync(join(pasta, 'index.html'))) {
      prova.erro = `não consegui gerar o site: ${gerado.saida.trim().split('\n').slice(-3).join(' ')}`;
      console.log(`  ✗ ${prova.erro}`);
      if (!opcoes.manter) limpar(projectId);
      continue;
    }
    prova.pasta = pasta;

    // A conferência de navegador escreve o veredito ao lado do site; rodá-la
    // SEM `--corrigir` é o ponto do banco de prova.
    rodar(['scripts/conferir-site.ts', pasta], opcoes.raizDoRepo);

    juntar(prova.regras, lerJson<ResultadoDeAceite>(join(pasta, 'aceite.json')));
    const navegador = lerJson<{ larguras: { aceite: ResultadoDeAceite }[] }>(
      join(pasta, 'aceite-navegador.json'),
    );
    for (const l of navegador?.larguras ?? []) juntar(prova.regras, l.aceite);

    for (const [codigo, estado] of Object.entries(prova.regras)) {
      if (estado === 'reprovou') prova.reprovou.push(codigo);
      else if (estado === 'pendente') prova.pendente.push(codigo);
    }
    const selo = prova.reprovou.length > 0 ? '✗' : '✓';
    console.log(
      `  ${selo} ${Object.keys(prova.regras).length} regra(s) · reprovou: ${prova.reprovou.join(', ') || 'nenhuma'} · pendente: ${prova.pendente.join(', ') || 'nenhuma'}`,
    );

    if (!opcoes.manter) limpar(projectId);
  }

  if (!opcoes.manter) rmSync(saidas, { recursive: true, force: true });
  else console.log(`\n  Os sites de prova ficaram em ${saidas}`);
  return provas;
};

/** Apaga o projeto de prova: a pasta e a linha, como a tela faz. */
const limpar = (projectId: string): void => {
  const dir = projectDir(projectId as Parameters<typeof projectDir>[0]);
  if (existsSync(dir)) rmSync(dir, { recursive: true, force: true });
  getDb().delete(tables.projects).where(eq(tables.projects.id, projectId)).run();
};

const principal = async (): Promise<void> => {
  const argv = process.argv.slice(2);
  const manter = argv.includes('--manter');
  const apenasIdx = argv.indexOf('--apenas');
  const apenas = apenasIdx >= 0 ? (argv[apenasIdx + 1] ?? null) : null;
  const raizDoRepo = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');

  console.log('\n  Banco de prova dos kits: cada kit gera um site e é conferido.\n');
  const provas = await provarKits({ raizDoRepo, manter, apenas });

  const reprovados = provas.filter((p) => p.reprovou.length > 0 || p.erro !== null);
  console.log('\n  ── Placar ──');
  for (const p of provas) {
    const estado =
      p.erro !== null
        ? `ERRO: ${p.erro}`
        : p.reprovou.length > 0
          ? `reprovou ${p.reprovou.join(', ')}`
          : p.pendente.length > 0
            ? `passou, com pendência em ${p.pendente.join(', ')}`
            : 'passou';
    console.log(`  ${p.reprovou.length > 0 || p.erro ? '✗' : '✓'} ${p.kit}: ${estado}`);
  }

  if (reprovados.length > 0) {
    console.log(
      `\n  ${reprovados.length} de ${provas.length} kit(s) NÃO passaram. Kit que reprova é defeito de motor ou de curadoria: conserte lá, não no site de prova.\n`,
    );
    process.exit(1);
  }
  console.log(`\n  ${provas.length} kit(s), todos passaram.\n`);
};

if (executadoDireto(import.meta.url)) void principal();
