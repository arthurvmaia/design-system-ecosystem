import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { iniciarServidorFixture } from './fixture-server.js';

/**
 * O servidor de fixtures só serve o que existe — e diz quando não existe.
 *
 * Estes testes existem por um defeito medido: `engine.browser.test.ts` montava
 * a raiz das fixtures com `process.cwd()`, e o `pnpm test:navegador` chamado de
 * dentro do pacote apontava para uma pasta inexistente. O servidor subia
 * calado, respondia 404 para tudo, a captura rodava contra uma página vazia e
 * só as asserções de CONTEÚDO quebravam — 28 falhas que pareciam defeito do
 * motor V2 e eram o diretório de trabalho.
 *
 * Por isso são dois testes e não um: o primeiro trava a guarda, o segundo trava
 * a forma certa de chegar até as fixtures.
 */

const RAIZ_DO_REPO = join(dirname(fileURLToPath(import.meta.url)), '../../../..');

test('raiz que não existe falha na hora, com o caminho na mensagem', async () => {
  const inexistente = join(RAIZ_DO_REPO, 'fixtures-que-nao-existem');
  await assert.rejects(
    () => iniciarServidorFixture(inexistente),
    (erro: unknown) => {
      assert.ok(erro instanceof Error);
      assert.match(erro.message, /não existe/);
      // O caminho resolvido tem de aparecer: sem ele, quem lê o erro não sabe
      // de onde o servidor achou que as fixtures viriam, que é a única
      // informação que resolve o problema.
      assert.ok(erro.message.includes('fixtures-que-nao-existem'));
      return true;
    },
  );
});

test('a raiz derivada de import.meta.url acha as fixtures do repositório', async () => {
  // Não usa cwd de propósito: é exatamente o que estava errado.
  const servidor = await iniciarServidorFixture(join(RAIZ_DO_REPO, 'fixtures'));
  try {
    const resposta = await fetch(`${servidor.url}/test-pages/kitchen-sink.html`);
    assert.equal(resposta.status, 200, 'a fixture tem de ser servida, não 404');
    const html = await resposta.text();
    assert.ok(html.length > 0, 'a fixture não pode vir vazia');
  } finally {
    await servidor.fechar();
  }
});
