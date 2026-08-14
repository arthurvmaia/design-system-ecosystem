import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { removerScriptsQueCompilamCss } from './pecas.js';

/**
 * O que este arquivo testava e não testa mais.
 *
 * Havia aqui 10 testes de `lerPecaDoBundle`/`comporPecasDoKit` — uma segunda
 * implementação da composição, sem chamada de produção nenhuma. As duas funções
 * saíram; os invariantes que elas provavam (escopo por origem, proxies,
 * keyframes renomeados, especificidade zero, opt-out de recoloração) continuam
 * provados onde o código vivo está: `@ds/composer` e `pagina.test.ts`.
 *
 * Sobrou o que só existe aqui.
 */

/** Um bundle mínimo em disco, com um script local de conteúdo controlado. */
const bundleComScript = (
  conteudoDoJs: string,
  opts?: { cssCompilado?: boolean },
): { dir: string; src: string } => {
  const dir = mkdtempSync(join(tmpdir(), 'bundle-'));
  mkdirSync(join(dir, 'assets', 'js'), { recursive: true });
  const src = 'assets/js/abc123.js';
  writeFileSync(join(dir, src), conteudoDoJs, 'utf8');
  if (opts?.cssCompilado === true) {
    // A marca que prova que o coletor capturou o CSSOM compilado.
    writeFileSync(join(dir, 'styles.css'), '.x{--tw-bg-opacity:1;color:red}', 'utf8');
  }
  return { dir, src };
};

test('o compilador de CSS em runtime sai do corpo quando o bundle PROVA ter o CSS compilado', () => {
  // O caso medido: o runtime do Tailwind CDN viajou para dentro do bundle. No
  // site composto ele recompila as utilitárias com os literais de cor ORIGINAIS,
  // por cima da recoloração, e a página volta às cores do site de origem sem
  // nenhum erro aparecer.
  const { dir, src } = bundleComScript('/* tailwindcss v3.4 */ console.log(1)', {
    cssCompilado: true,
  });
  const r = removerScriptsQueCompilamCss(`<div>oi</div><script src="${src}"></script>`, dir);

  assert.ok(!r.corpo.includes(`src="${src}"`), 'o script devia ter saído do corpo');
  // No lugar dele ficam o comentário nomeando o arquivo E o stub do global
  // `tailwind`: o script de configuração da página (`tailwind.config = {…}`)
  // mora em outro arquivo local e morreria em ReferenceError sem ele.
  assert.ok(r.corpo.includes(`removido na composição: ${src}`));
  assert.ok(
    r.corpo.includes('window.tailwind=window.tailwind||{config:{}}'),
    'o stub segura o script de configuração que referencia o global',
  );
  assert.deepEqual(r.removidos, [src]);
  assert.deepEqual(r.mantidos, []);
});

test('sem CSS compilado no bundle, o compilador FICA e é declarado em `mantidos`', () => {
  // Peça promovida antes de o coletor capturar o CSSOM: remover o script seria
  // remover o único estilo que ela tem. A frase antiga do aviso ("o CSS já
  // viaja no bundle") era texto fixo, não verificação — agora é verificada.
  const { dir, src } = bundleComScript('/* tailwindcss v3.4 */ console.log(1)');
  const r = removerScriptsQueCompilamCss(`<script src="${src}"></script>`, dir);

  assert.ok(r.corpo.includes(`src="${src}"`), 'o único estilo da peça não pode sumir');
  assert.deepEqual(r.removidos, []);
  assert.deepEqual(r.mantidos, [src]);
});

test('script local que não compila CSS fica onde está', () => {
  const { dir, src } = bundleComScript('document.querySelector("#x").focus()');
  const r = removerScriptsQueCompilamCss(`<script src="${src}"></script>`, dir);

  assert.ok(r.corpo.includes(src), 'um script comum do site não pode ser removido');
  assert.deepEqual(r.removidos, []);
});

test('script REMOTO não é lido do disco nem removido', () => {
  // A detecção é por conteúdo do arquivo local; sem arquivo, não há o que ler,
  // e sumir com um script remoto por precaução mataria ícone e animação.
  const { dir } = bundleComScript('irrelevante');
  const remoto = 'https://cdn.tailwindcss.com/3.4.0';
  const r = removerScriptsQueCompilamCss(`<script src="${remoto}"></script>`, dir);

  assert.ok(r.corpo.includes(remoto));
  assert.deepEqual(r.removidos, []);
});

test('corpo sem script nenhum passa intacto', () => {
  const { dir } = bundleComScript('x');
  const r = removerScriptsQueCompilamCss('<section><h1>oi</h1></section>', dir);

  assert.equal(r.corpo, '<section><h1>oi</h1></section>');
  assert.deepEqual(r.removidos, []);
});
