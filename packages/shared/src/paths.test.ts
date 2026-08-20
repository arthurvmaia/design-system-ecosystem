import assert from 'node:assert/strict';
import { join, sep } from 'node:path';
import { test } from 'node:test';
import {
  criativosDir,
  criativosRootDir,
  dentroDaRaiz,
  ehChaveDeSegmento,
  ehDesignSystemId,
  ehNomeDeVersao,
  ehProjectId,
  estaContido,
  podeApagarDesignSystem,
  projectDir,
  topLevelDirs,
  vaultDsDir,
  vaultSegmentBundleDir,
} from './paths.js';

/**
 * A guarda que decide se um diretório do vault some do disco.
 *
 * Dois lugares apagam — a rota `DELETE /api/design-systems/:id` e o
 * `pnpm acervo:limpar-orfas` — e antes cada um tinha a sua cópia da regra. Aqui
 * ela é uma só, e é testada onde mora.
 */

// Montado com `join` para o teste valer nos dois separadores de caminho.
const RAIZ = join(sep === '/' ? '/acervo' : 'C:', 'acervo-vault');

test('o caso normal: pasta de design system dentro do vault', () => {
  assert.equal(podeApagarDesignSystem(join(RAIZ, 'ds_01ABC'), RAIZ, 'ds_01ABC'), true);
});

test('NUNCA o próprio vault', () => {
  // O engano que levaria o acervo inteiro de uma vez.
  assert.equal(podeApagarDesignSystem(RAIZ, RAIZ, 'ds_01ABC'), false);
});

test('NUNCA fora do vault', () => {
  assert.equal(podeApagarDesignSystem(join(RAIZ, '..'), RAIZ, 'ds_01ABC'), false);
  assert.equal(podeApagarDesignSystem(join(RAIZ, '..', 'library'), RAIZ, 'ds_01ABC'), false);
});

test('NUNCA por caminho que só PARECE dentro', () => {
  // `/acervo/vault-2` começa com `/acervo/vault` como string, e não está dentro
  // dele. É o erro clássico de comparar prefixo sem o separador.
  assert.equal(podeApagarDesignSystem(`${RAIZ}-2${sep}ds_01ABC`, RAIZ, 'ds_01ABC'), false);
});

test('NUNCA subindo por .. de dentro', () => {
  assert.equal(podeApagarDesignSystem(join(RAIZ, 'ds_01ABC', '..', '..'), RAIZ, 'ds_01ABC'), false);
});

test('o id precisa ser um id de verdade', () => {
  // `String.raw` para a barra invertida ser uma barra de verdade, e não uma
  // sequência de escape — um id com separador de caminho é justamente o caso
  // que precisa reprovar.
  const ids = ['', '.', '..', '*', 'ds_', 'ds_a/b', String.raw`ds_a\b`, 'library', '../ds_x'];
  for (const id of ids) {
    assert.equal(
      podeApagarDesignSystem(join(RAIZ, 'ds_valido'), RAIZ, id),
      false,
      `passou com o id "${id}"`,
    );
  }
});

test('id válido com caminho válido é o ÚNICO caso que passa', () => {
  // As duas condições valem juntas: nem caminho bom com id ruim, nem o
  // contrário.
  assert.equal(podeApagarDesignSystem(join(RAIZ, 'ds_X'), RAIZ, 'ds_X'), true);
  assert.equal(podeApagarDesignSystem(join(RAIZ, 'ds_X'), RAIZ, '..'), false);
  assert.equal(podeApagarDesignSystem(RAIZ, RAIZ, 'ds_X'), false);
});

/**
 * A guarda de id compartilhada. As rotas validam com ela ANTES de tocar em
 * disco, e as funções de caminho recusam sozinhas — é a segunda linha de
 * defesa para a rota que esquecer a primeira.
 */

test('a guarda aceita id real (ULID) e id curto de teste', () => {
  assert.equal(ehDesignSystemId('ds_01KYQ2P1EJHZN4AF67MYACTDJ7'), true);
  assert.equal(ehDesignSystemId('ds_A'), true);
  assert.equal(ehProjectId('prj_01KYNSR6XJF16NDR92PR5Y9E1Q'), true);
  assert.equal(ehChaveDeSegmento('seg_3'), true);
});

test('a guarda reprova travessia, separador e prefixo errado', () => {
  // `ds_../../../etc` é o caso comprovado: o roteador decodifica %2F DEPOIS do
  // roteamento, então a rota recebe um "id" com barra dentro.
  const ruins = ['ds_../../../etc', 'ds_a/b', String.raw`ds_a\b`, 'ds_', 'ds_a.b', '', '..'];
  for (const id of ruins) {
    assert.equal(ehDesignSystemId(id), false, `passou com o id "${id}"`);
  }
  assert.equal(ehProjectId('ds_A'), false);
  assert.equal(ehDesignSystemId('prj_A'), false);
});

test('as funções de caminho recusam id fora da regra', () => {
  assert.throws(() => vaultDsDir('ds_../../../etc' as `ds_${string}`));
  assert.throws(() => projectDir('prj_..' as `prj_${string}`));
  assert.throws(() => vaultSegmentBundleDir('ds_A', 'seg_../fora'));
  // O caso bom continua passando, com o id no fim do caminho.
  assert.ok(vaultDsDir('ds_A').endsWith(`${sep}ds_A`));
});

test('criativos: o id do job vira pasta, e id torto não vira caminho', () => {
  // A pasta de saída do job `criativo` é indexada pelo id do JOB, que chega
  // por URL na rota de download — a mesma guarda dos vizinhos vale aqui.
  assert.ok(criativosDir('job_abc123').endsWith(join('criativos', 'job_abc123')));
  assert.throws(() => criativosDir('job_../../etc'));
  assert.throws(() => criativosDir('ds_abc123'));
});

/**
 * A guarda de contenção, agora num idioma só.
 *
 * O caso que a motivou é o primeiro daqui: a rota de criativos conferia com
 * `alvo.startsWith(raiz)` — comparação de TEXTO, sem separador —, e as três
 * rotas vizinhas conferiam com `relative()`. As duas contas discordam
 * exatamente quando duas pastas irmãs compartilham prefixo, que é o caso comum
 * de um id sequencial.
 */

const DENTRO = join(sep === '/' ? '/acervo' : 'C:', 'criativos', 'job_ab');

test('PROVA: irmao com prefixo comum nao passa por dentro da raiz', () => {
  // `criativos/job_ab` e `criativos/job_abc` são pastas DIFERENTES cujos
  // caminhos começam igual. O `startsWith` de texto aprovava a segunda.
  const irmao = join(sep === '/' ? '/acervo' : 'C:', 'criativos', 'job_abc', 'segredo.png');
  assert.equal(estaContido(DENTRO, irmao), false);
  assert.equal(dentroDaRaiz(DENTRO, join('..', 'job_abc', 'segredo.png')), null);
});

test('o caso bom: arquivo declarado dentro da pasta do job', () => {
  const alvo = dentroDaRaiz(DENTRO, join('variacoes', 'v1.png'));
  assert.notEqual(alvo, null);
  assert.ok((alvo as string).endsWith(join('job_ab', 'variacoes', 'v1.png')));
});

test('recusa o que já se sabe errado antes de resolver', () => {
  assert.equal(dentroDaRaiz(DENTRO, ''), null);
  assert.equal(dentroDaRaiz(DENTRO, '..'), null);
  assert.equal(dentroDaRaiz(DENTRO, join('a', '..', '..', 'b')), null);
  // Barra invertida é separador no Windows: uma conta feita só com `/` deixaria passar.
  assert.equal(dentroDaRaiz(DENTRO, 'a\\..\\..\\b'), null);
  assert.equal(dentroDaRaiz(DENTRO, sep === '/' ? '/etc/passwd' : 'C:\\Windows\\win.ini'), null);
});

test('a propria raiz nao esta dentro de si mesma: diretorio nao e arquivo', () => {
  assert.equal(estaContido(DENTRO, DENTRO), false);
  assert.equal(dentroDaRaiz(DENTRO, '.'), null);
});

test('nome de versão gerada: só nome simples de pasta', () => {
  assert.equal(ehNomeDeVersao('2026-07-29T02-16-11-833Z'), true);
  assert.equal(ehNomeDeVersao('..'), false);
  assert.equal(ehNomeDeVersao('a/b'), false);
  assert.equal(ehNomeDeVersao('.oculto'), false);
});

test('PROVA: a raiz dos criativos nasce no bootstrap', () => {
  // Sem ela em topLevelDirs, a rota de download le de uma pasta que o
  // bootstrap nunca criou — e quem lista jobs redigita o caminho fora da
  // camada, que e o que este arquivo proibe.
  assert.ok(topLevelDirs().includes(criativosRootDir()));
  assert.ok(criativosDir('job_abc123').startsWith(criativosRootDir()));
});
