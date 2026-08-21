import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { NUCLEO, caminhosDaPeca, espelhoEsperado, espelhosDefasados } from './motor-espelhar.js';

/**
 * O espelho não é uma duplicação: é uma cópia VERIFICADA.
 *
 * A diferença está inteira neste arquivo. Duas cópias que ninguém compara
 * divergem no primeiro conserto feito de um lado só, e a divergência aparece
 * tarde e para o cliente — como "a logo da loja não é a mesma do site", ou como
 * uma conta de crédito que ninguém sabe explicar.
 */

test('PROVA: a frente de Lojas usa o MESMO núcleo que o motor', () => {
  assert.deepEqual(
    espelhosDefasados(),
    [],
    'Espelho defasado na frente de Lojas. Edite o original no motor e rode `pnpm motor:espelhar`.',
  );
});

test('cada espelho avisa, no proprio arquivo, que ele nao e o original', () => {
  for (const peca of NUCLEO) {
    const atual = readFileSync(caminhosDaPeca(peca).espelho, 'utf8');
    assert.match(atual, /NÃO EDITE AQUI/, peca.espelho);
    assert.match(atual, /pnpm motor:espelhar/, peca.espelho);
    /* e o endereço do ORIGINAL daquele arquivo, não o do pacote: quem abre o
       espelho está procurando onde consertar, e "o motor criativo" não é um
       endereço */
    assert.ok(
      atual.includes(`packages/creative-engine/src/${peca.origem}`),
      `${peca.espelho} tem de nomear o original ${peca.origem}`,
    );
  }
});

/**
 * As reescritas são a parte que pode quebrar CALADA.
 *
 * O cabeçalho some no olho de quem revisa; um import que ficou apontando para
 * `../catalogo/presets.js` não existe no destino e só quebra na frente que não
 * tem CI. Então o espelho é conferido pelo que ele NÃO pode conter.
 */
test('nenhum espelho ficou com import de um caminho que so existe no motor', () => {
  for (const peca of NUCLEO) {
    const atual = readFileSync(caminhosDaPeca(peca).espelho, 'utf8');
    assert.doesNotMatch(
      atual,
      /from '\.\.\//,
      `${peca.espelho} importa de fora da pasta dele, e essa pasta não existe na loja`,
    );
  }
});

/**
 * E o núcleo só aceita código que não puxa nada atrás dele.
 *
 * `node:fs`, `playwright` e `@ds/shared` não existem no workerd da Cloudflare.
 * Espelhar um arquivo que os use entrega um espelho que compila aqui e explode
 * lá — e a explosão chega em produção, porque a frente de Lojas está fora do CI
 * deste repositório.
 */
test('o nucleo e portavel: nada de node, playwright ou workspace', () => {
  for (const peca of NUCLEO) {
    const fonte = readFileSync(caminhosDaPeca(peca).origem, 'utf8');
    for (const proibido of [/from 'node:/, /from 'playwright'/, /from '@ds\//]) {
      assert.doesNotMatch(fonte, proibido, `${peca.origem} não é portável para a frente de Lojas`);
    }
  }
});

test('a reescrita do vizinho aconteceu de verdade, e nao por acaso', () => {
  const precos = NUCLEO.find((p) => p.espelho.endsWith('motor/precos.ts'));
  assert.ok(precos, 'a tabela de preço saiu do núcleo');
  const fonte = readFileSync(caminhosDaPeca(precos).origem, 'utf8');
  /* a origem importa o vizinho pelo caminho do motor... */
  assert.match(fonte, /from '\.\.\/catalogo\/presets\.js'/);
  /* ...e o espelho, pelo caminho da loja */
  assert.match(espelhoEsperado(precos, fonte), /from '\.\/presets'/);
});
