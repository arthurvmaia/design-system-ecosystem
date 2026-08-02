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
const bundleComScript = (conteudoDoJs: string): { dir: string; src: string } => {
  const dir = mkdtempSync(join(tmpdir(), 'bundle-'));
  mkdirSync(join(dir, 'assets', 'js'), { recursive: true });
  const src = 'assets/js/abc123.js';
  writeFileSync(join(dir, src), conteudoDoJs, 'utf8');
  return { dir, src };
};

test('o compilador de CSS em runtime sai do corpo, e o aviso diz qual era', () => {
  // O caso medido: o runtime do Tailwind CDN viajou para dentro do bundle. No
  // site composto ele recompila as utilitárias com os literais de cor ORIGINAIS,
  // por cima da recoloração, e a página volta às cores do site de origem sem
  // nenhum erro aparecer.
  const { dir, src } = bundleComScript('/* tailwindcss v3.4 */ console.log(1)');
  const r = removerScriptsQueCompilamCss(`<div>oi</div><script src="${src}"></script>`, dir);

  assert.ok(!r.corpo.includes('<script'), 'o script devia ter saído do corpo');
  // No lugar dele fica um comentário nomeando o arquivo: quem for depurar o
  // site gerado precisa saber que sumiu algo, e qual.
  assert.ok(r.corpo.includes(`removido na composição: ${src}`));
  assert.deepEqual(r.removidos, [src]);
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
