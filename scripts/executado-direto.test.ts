import assert from 'node:assert/strict';
import { join } from 'node:path';
import { test } from 'node:test';
import { pathToFileURL } from 'node:url';
import { executadoDireto } from './executado-direto.js';

/**
 * A conta que decide se um script RODA.
 *
 * Errar para mais é o que acontecia: por substring, `reextrair.test.ts` contém
 * `reextrair`, então o arquivo de teste executava o comando — imprimia o texto
 * de uso e encerrava o processo antes do primeiro `test()`. Errar para menos é
 * pior de outro jeito: o comando não faz nada e não diz por quê.
 */

/** Roda a função com um `process.argv[1]` de mentira. */
const comEntrada = <T>(entrada: string | undefined, corpo: () => T): T => {
  const antes = process.argv[1];
  if (entrada === undefined) process.argv.splice(1, 1);
  else process.argv[1] = entrada;
  try {
    return corpo();
  } finally {
    process.argv[1] = antes as string;
  }
};

const url = (p: string): string => pathToFileURL(p).href;

test('o próprio arquivo, chamado pelo Node, é o comando', () => {
  const caminho = join(process.cwd(), 'scripts', 'reextrair.ts');
  assert.equal(
    comEntrada(caminho, () => executadoDireto(url(caminho))),
    true,
  );
});

test('o arquivo de TESTE não é o comando, mesmo tendo o nome dentro', () => {
  // O caso que quebrava a suíte inteira.
  const script = join(process.cwd(), 'scripts', 'reextrair.ts');
  const teste = join(process.cwd(), 'scripts', 'reextrair.test.ts');
  assert.equal(
    comEntrada(teste, () => executadoDireto(url(script))),
    false,
  );
});

test('outro script que importa este não o transforma em comando', () => {
  const meu = join(process.cwd(), 'scripts', 'segmentar.ts');
  const quemChamou = join(process.cwd(), 'scripts', 'reextrair.ts');
  assert.equal(
    comEntrada(quemChamou, () => executadoDireto(url(meu))),
    false,
  );
});

test('sem entrada nenhuma, ninguém é o comando', () => {
  // `node --eval`, ou um runner que não passa arquivo: na dúvida, não rodar.
  const caminho = join(process.cwd(), 'scripts', 'reextrair.ts');
  assert.equal(
    comEntrada(undefined, () => executadoDireto(url(caminho))),
    false,
  );
});

test('caminho com barra invertida do Windows continua sendo o mesmo arquivo', () => {
  // `process.argv[1]` chega com `\` no Windows e a URL usa `/`. Comparar as duas
  // strings cruas daria falso sempre, e nenhum script rodaria.
  const caminho = join(process.cwd(), 'scripts', 'medir-fidelidade.ts');
  assert.ok(url(caminho).includes('/'), 'a URL normaliza os separadores');
  assert.equal(
    comEntrada(caminho, () => executadoDireto(url(caminho))),
    true,
  );
});
