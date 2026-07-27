import assert from 'node:assert/strict';
import { test } from 'node:test';
import { montarContextoDeGeracao } from './generate-context.js';

/**
 * O construtor de contexto é a garantia de que FILA e API geram do MESMO
 * material: os dois ramos da rota chamam esta função — o teste prova que ela é
 * determinística e completa (mídia incluída, ausentes viram aviso, seed
 * criativa injetável).
 */

const dadosBase = () => ({
  projeto: {
    id: 'prj_01TESTE',
    name: 'Projeto de teste',
    contentJson: JSON.stringify({ about: 'Somos nós.' }),
    brandingJson: JSON.stringify({
      palette: { primary: '#123456', background: '#ffffff', foreground: '#000000' },
      typography: { display: 'Sora', body: 'Inter' },
    }),
    mediaManifestJson: JSON.stringify([
      {
        path: 'media/video-hero.mp4',
        mimeType: 'video/mp4',
        kind: 'video',
        originalName: 'video-hero.mp4',
        slotRole: 'hero',
      },
    ]),
    layoutJson: JSON.stringify({ mode: 'blueprint', blueprintId: 'saas-landing' }),
  },
  kit: { id: 'kit_01TESTE', name: 'Kit teste' },
  componentes: [
    {
      id: 'cmp_01AAA',
      name: 'Hero',
      category: 'hero',
      kind: 'component',
      designSystemId: 'ds_01X',
    },
  ],
});

test('o contexto carrega TUDO que o wizard configurou — inclusive a mídia', () => {
  const ctx = montarContextoDeGeracao(dadosBase());
  assert.equal(ctx.payload.projectId, 'prj_01TESTE');
  assert.equal(ctx.payload.media.length, 1, 'a mídia chega ao contexto (nos DOIS modos)');
  assert.equal(ctx.payload.media[0]?.slotRole, 'hero');
  assert.ok((ctx.payload.kit.components[0]?.bundlePath ?? '').length > 0);
  assert.equal(ctx.payload.branding.palette.primary, '#123456');
  assert.equal(ctx.blueprint.id, 'saas-landing');
  assert.deepEqual(ctx.avisos, []);
});

test('fila e API recebem contexto IDÊNTICO: mesma entrada → mesmo payload', () => {
  const a = montarContextoDeGeracao(dadosBase());
  const b = montarContextoDeGeracao(dadosBase());
  assert.deepEqual(a.payload, b.payload);
});

test('componente removido da Biblioteca vira AVISO, nunca omissão silenciosa', () => {
  const ctx = montarContextoDeGeracao({ ...dadosBase(), ausentes: ['cmp_01SUMIU'] });
  assert.equal(ctx.avisos.length, 1);
  assert.ok(ctx.avisos[0]?.includes('cmp_01SUMIU'));
});

test('modo criativo re-sorteia a seed por geração — injetável e determinística no teste', () => {
  const dados = dadosBase();
  dados.projeto.layoutJson = JSON.stringify({ mode: 'criativo', creativeSeed: 1 });
  const ctx = montarContextoDeGeracao({ ...dados, sortearSeed: () => 42 });
  assert.equal(ctx.payload.layout.creativeSeed, 42);
});

test('projeto ANTIGO (JSONs nulos/corrompidos) carrega e gera com defaults', () => {
  const ctx = montarContextoDeGeracao({
    ...dadosBase(),
    projeto: {
      id: 'prj_01VELHO',
      name: 'Projeto antigo',
      contentJson: null,
      brandingJson: '{quebrado',
      mediaManifestJson: 'lixo',
      layoutJson: null,
    },
  });
  assert.equal(ctx.payload.branding.palette.background, '#ffffff');
  assert.equal(ctx.payload.content.about?.includes('empresa'), true);
  assert.deepEqual(ctx.payload.media, []);
  assert.ok(
    ctx.avisos.some((a) => a.includes('mídia')),
    'mídia ilegível é declarada',
  );
});
