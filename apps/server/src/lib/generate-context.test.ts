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
        secaoId: 'sec_abertura',
      },
    ]),
    layoutJson: JSON.stringify({
      secoes: [
        { id: 'sec_abertura', nome: 'Abertura', papel: 'hero', componentIds: ['cmp_01AAA'] },
        { id: 'sec_fim', nome: 'Rodapé', papel: 'footer', componentIds: [] },
      ],
    }),
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
  assert.equal(ctx.payload.layout.secoes.length, 2, 'a estrutura montada pelo usuário viaja junto');
  assert.deepEqual(ctx.avisos, []);
});

test('o slotRole é DERIVADO da seção, não do que foi gravado no upload', () => {
  // O espelho se cura sozinho: trocar a peça ou o tipo da seção atualiza o
  // slotRole na próxima geração, em vez de deixar um valor velho apontando para
  // um lugar que já não existe.
  const dados = dadosBase();
  dados.projeto.layoutJson = JSON.stringify({
    secoes: [{ id: 'sec_abertura', nome: 'Abertura', papel: 'pricing', componentIds: [] }],
  });
  const ctx = montarContextoDeGeracao(dados);
  assert.equal(ctx.payload.media[0]?.slotRole, 'pricing');
});

test('mídia de uma seção apagada perde o espelho em vez de mentir', () => {
  const dados = dadosBase();
  dados.projeto.layoutJson = JSON.stringify({ secoes: [] });
  const ctx = montarContextoDeGeracao(dados);
  assert.equal(ctx.payload.media[0]?.slotRole, undefined);
  assert.equal(ctx.payload.media[0]?.secaoId, 'sec_abertura', 'a âncora original é preservada');
});

test('peça que saiu do kit vira aviso nominal na geração', () => {
  const dados = dadosBase();
  dados.projeto.layoutJson = JSON.stringify({
    secoes: [{ id: 'sec_1', nome: 'Abertura', componentIds: ['cmp_SUMIU'] }],
  });
  const ctx = montarContextoDeGeracao(dados);
  assert.ok(ctx.avisos.some((a) => a.includes('Abertura')));
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
  assert.deepEqual(
    ctx.payload.layout.secoes,
    [],
    'sem estrutura, o layout entra vazio e não quebra',
  );
  assert.ok(
    ctx.avisos.some((a) => a.includes('mídia')),
    'mídia ilegível é declarada',
  );
});
