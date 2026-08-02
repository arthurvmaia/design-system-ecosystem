import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ComponentCategory } from './segment.js';
import {
  CATEGORIAS_DE_PECA,
  CATEGORIAS_POR_FAMILIA,
  CATEGORIA_LABEL,
  FAMILIAS,
  FAMILIA_DA_CATEGORIA,
  familiaDe,
  rotuloDaCategoria,
} from './taxonomia.js';

/**
 * A taxonomia é fonte única porque as cópias divergiram: a Biblioteca conhecia
 * 15 das 25 categorias, e um selo real do acervo aparecia como "Outros". Estes
 * testes existem para a lista não voltar a ficar incompleta em silêncio.
 */

test('toda categoria do schema tem família e rótulo', () => {
  for (const categoria of ComponentCategory.options) {
    assert.ok(FAMILIA_DA_CATEGORIA[categoria], `sem família: ${categoria}`);
    assert.ok(CATEGORIA_LABEL[categoria], `sem rótulo: ${categoria}`);
  }
});

test('nenhuma família fica vazia, e a soma cobre o schema sem repetir', () => {
  const vistas: string[] = [];
  for (const familia of FAMILIAS) {
    const lista = CATEGORIAS_POR_FAMILIA[familia];
    assert.ok(lista.length > 0, `família vazia: ${familia}`);
    vistas.push(...lista);
  }
  assert.equal(vistas.length, ComponentCategory.options.length);
  assert.equal(new Set(vistas).size, vistas.length, 'categoria em duas famílias');
});

test('as cinco categorias que as telas esqueciam têm casa', () => {
  // `gallery`, `stats`, `logo-cloud`, `team` e `timeline` existem no schema
  // desde sempre e não estavam em nenhum filtro: a peça real caía em "Outros".
  for (const categoria of ['gallery', 'stats', 'logo-cloud', 'team', 'timeline'] as const) {
    assert.equal(familiaDe(categoria), 'dobras');
    assert.notEqual(rotuloDaCategoria(categoria), categoria, `${categoria} sem tradução`);
  }
});

test('categoria fora do vocabulário não some da tela', () => {
  // A coluna é texto livre: acervo antigo pode trazer valor que o enum não tem.
  // Cair em "Sem classificar" é a verdade; sumir do filtro é perder a peça.
  assert.equal(familiaDe('inventada-em-2019'), 'sem-familia');
  assert.equal(rotuloDaCategoria('inventada-em-2019'), 'inventada-em-2019');
});

test('subcomponente só recebe categoria de peça', () => {
  // O clamp do classificador depende disto: um botão do hero é `button`, nunca
  // `hero`. Se alguém mover `button` para outra família, o clamp fica órfão.
  for (const categoria of ['button', 'card', 'badge', 'input', 'accordion', 'nav'] as const) {
    assert.equal(familiaDe(categoria), 'pecas');
  }
});

test('a lista de categorias de peça acompanha a família, com `other` como única exceção', () => {
  // O defeito que este teste trava: eram duas listas escritas à mão em arquivos
  // diferentes. Uma categoria de peça nova entrava na taxonomia, a Galeria a
  // mostrava na família certa, e o clamp do classifier continuava recusando —
  // sem erro em lugar nenhum, só a peça caindo em `other` para sempre.
  for (const c of CATEGORIAS_POR_FAMILIA.pecas) {
    assert.ok(CATEGORIAS_DE_PECA.has(c), `${c} é família peça e não está no clamp`);
  }

  const extras = [...CATEGORIAS_DE_PECA].filter(
    (c) => !CATEGORIAS_POR_FAMILIA.pecas.includes(c as never),
  );
  // `other` é a saída de emergência do subcomponente que não é nenhuma das
  // seis. Qualquer outro extra aqui é engano.
  assert.deepEqual(extras, ['other']);
});
