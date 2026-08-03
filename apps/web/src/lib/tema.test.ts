import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

/**
 * Guarda do tema.
 *
 * Cor em interface é string, e string não é verificada nem pelo `tsc` nem pelo
 * `biome`: um `var(--color-crimson-4)` esquecido depois do redesenho compila,
 * passa no lint e só aparece como um respingo vermelho no meio do ciano, meses
 * depois, na tela de alguém. Este teste é o único lugar que pega isso.
 */

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');

const arquivosDaInterface = (dir: string): string[] => {
  const out: string[] = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...arquivosDaInterface(p));
    else if (/\.(tsx?|css)$/.test(e.name) && !e.name.endsWith('.test.ts')) out.push(p);
  }
  return out;
};

const ARQUIVOS = arquivosDaInterface(RAIZ);

const relativo = (p: string): string => p.slice(RAIZ.length + 1).replace(/\\/g, '/');

test('a interface tem arquivos para varrer (o teste não pode passar por vazio)', () => {
  assert.ok(ARQUIVOS.length > 30, `achei só ${ARQUIVOS.length} arquivos — a varredura quebrou`);
});

test('nenhum token do tema antigo sobrou', () => {
  const proibidos = ['--color-crimson', '--color-obsidian', 'ds-gradient-crimson'];
  const achados: string[] = [];
  for (const arq of ARQUIVOS) {
    const texto = readFileSync(arq, 'utf8');
    for (const termo of proibidos) {
      if (texto.includes(termo)) achados.push(`${relativo(arq)} → ${termo}`);
    }
  }
  assert.deepEqual(achados, [], `tokens do tema antigo ainda vivos:\n  ${achados.join('\n  ')}`);
});

test('nenhum vermelho de marca escrito à mão sobrou', () => {
  // Os RGB da paleta carmim antiga. Vermelho ainda existe no tema, mas só como
  // sinal semântico (`--color-danger`, #ef4444) — nunca mais como identidade.
  const carmim = /rgba?\(\s*(198|107|224|138|168)\s*,\s*(40|20|53|26|31)\s*,/;
  const achados: string[] = [];
  for (const arq of ARQUIVOS) {
    readFileSync(arq, 'utf8')
      .split('\n')
      .forEach((linha, i) => {
        if (carmim.test(linha)) achados.push(`${relativo(arq)}:${i + 1}`);
      });
  }
  assert.deepEqual(achados, [], `carmim escrito à mão:\n  ${achados.join('\n  ')}`);
});

/**
 * Identificadores `ds-*` que NÃO são classe de CSS e por isso não têm regra.
 * A lista é explícita de propósito: sem ela, a varredura vira ruído e alguém
 * acaba desligando o teste inteiro para calar três falsos positivos.
 */
const NAO_SAO_CLASSE = new Set([
  'ds-preview-altura', // tipo da mensagem que o iframe manda por postMessage
  'ds-flutuante-ativo', // id do elemento flutuante dos seletores
  'ds-impacto', // chave de cache do react-query
  // O harness de reprodução de estados vive DENTRO do documento de prévia, que
  // é servido pelo `apps/server` e tem folha própria. A fórmula do kit alcança
  // esses três por dentro do iframe para montar os estados lado a lado, e
  // procurá-los no `globals.css` do shell seria procurar no arquivo errado.
  'ds-rp-alvo', // id do nó que recebe o HTML do estado
  'ds-rp-bar', // id da barra de botões de estado
  'ds-rp-btn', // classe dos botões, servida pelo documento de prévia
]);

test('as classes que a interface usa existem no CSS', () => {
  // O outro lado do mesmo buraco: apagar uma classe `ds-*` do CSS não quebra
  // build nenhum — o elemento só perde o estilo, calado. Foi assim que a
  // reescrita do tema deixou o Shell apontando para `.ds-ambient`, que já não
  // existia.
  const css = readFileSync(join(RAIZ, 'styles', 'globals.css'), 'utf8');
  const usadas = new Set<string>();
  for (const arq of ARQUIVOS.filter((a) => a.endsWith('.tsx'))) {
    for (const m of readFileSync(arq, 'utf8').matchAll(/\bds-[a-z0-9-]+/g)) {
      if (!NAO_SAO_CLASSE.has(m[0])) usadas.add(m[0]);
    }
  }
  const orfas = [...usadas].filter((c) => !css.includes(`.${c}`)).sort();
  assert.deepEqual(orfas, [], `classes usadas na interface e ausentes do CSS: ${orfas.join(', ')}`);
});

test('o bloco de movimento reduzido é espelhado nos dois lugares', () => {
  // A redução vive em dois blocos que precisam concordar: o do sistema
  // (`prefers-reduced-motion`) e o da escolha manual (`:root.reduz-movimento`).
  // Quem acrescenta um hover novo em um e esquece o outro só descobre quando
  // alguém que pediu menos movimento continua vendo a tela pular.
  const css = readFileSync(join(RAIZ, 'styles', 'globals.css'), 'utf8');
  const doSistema = css.slice(css.indexOf('@media (prefers-reduced-motion'));
  const corte = doSistema.indexOf(':root.reduz-movimento');
  const bloqueiaNoSistema = doSistema.slice(0, corte);
  const bloqueiaNoManual = doSistema.slice(corte);

  for (const alvo of ['.ds-reveal', '.ds-beam::after', '.intro-scan', ':hover']) {
    assert.ok(bloqueiaNoSistema.includes(alvo), `"${alvo}" falta no bloco do sistema`);
    assert.ok(bloqueiaNoManual.includes(alvo), `"${alvo}" falta no bloco da escolha manual`);
  }
});
