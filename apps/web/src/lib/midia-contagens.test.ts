import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  contagemUnificada,
  contarEspacos,
  fraseComEspacosSeparados,
  rotuloDeEspacos,
  seloDeEspacos,
} from './midia-contagens.js';

test('contarEspacos separa imagem de vídeo e ignora contrato indisponível', () => {
  const contagem = contarEspacos([
    { disponivel: true, midias: [{ tipo: 'imagem' }, { tipo: 'video' }] },
    { disponivel: true, midias: [{ tipo: 'imagem' }] },
    // Contrato ilegível não entra na conta: o número precisa ter origem.
    { disponivel: false, midias: [{ tipo: 'imagem' }, { tipo: 'imagem' }] },
  ]);
  assert.deepEqual(contagem, { imagens: 2, videos: 1 });
});

test('tipo desconhecido conta como imagem, o mesmo lado da conta antiga', () => {
  const contagem = contarEspacos([{ disponivel: true, midias: [{ tipo: 'img' }] }]);
  assert.deepEqual(contagem, { imagens: 1, videos: 0 });
});

test('rotuloDeEspacos no formato da frase: "N de imagem, M de vídeo"', () => {
  assert.equal(rotuloDeEspacos({ imagens: 2, videos: 1 }), '2 de imagem, 1 de vídeo');
  assert.equal(rotuloDeEspacos({ imagens: 1, videos: 0 }), '1 de imagem');
  assert.equal(rotuloDeEspacos({ imagens: 0, videos: 2 }), '2 de vídeo');
  assert.equal(rotuloDeEspacos({ imagens: 0, videos: 0 }), null);
});

test('seloDeEspacos flexiona singular e plural sem parênteses', () => {
  assert.equal(seloDeEspacos({ imagens: 1, videos: 1 }), '1 imagem · 1 vídeo');
  assert.equal(seloDeEspacos({ imagens: 3, videos: 2 }), '3 imagens · 2 vídeos');
  assert.equal(seloDeEspacos({ imagens: 2, videos: 0 }), '2 imagens');
  assert.equal(seloDeEspacos({ imagens: 0, videos: 0 }), null);
});

test('a frase da seção passa a separar imagem de vídeo quando há vídeo', () => {
  const doShared = 'Há 3 espaços de imagem nas peças escolhidas, e prova social vive de logo.';
  assert.equal(
    fraseComEspacosSeparados(doShared, { imagens: 2, videos: 1 }),
    'Há 2 de imagem, 1 de vídeo nas peças escolhidas, e prova social vive de logo.',
  );
});

test('o prefixo no singular do shared também é reconhecido', () => {
  assert.equal(
    fraseComEspacosSeparados('Há 1 espaço de imagem nas peças escolhidas.', {
      imagens: 0,
      videos: 1,
    }),
    'Há 1 de vídeo nas peças escolhidas.',
  );
});

test('sem vídeo a frase do shared sai intacta: as contas coincidem', () => {
  const doShared = 'Há 2 espaços de imagem nas peças escolhidas.';
  assert.equal(fraseComEspacosSeparados(doShared, { imagens: 2, videos: 0 }), doShared);
});

test('frase sem o prefixo conhecido degrada para o comportamento atual', () => {
  const semPrefixo = 'Esta seção será criada no estilo do kit, e a abertura promete.';
  assert.equal(fraseComEspacosSeparados(semPrefixo, { imagens: 1, videos: 1 }), semPrefixo);
});

test('contagemUnificada usa o contrato quando a peça é conhecida', () => {
  const r = contagemUnificada(
    { quantas: 3, porque: 'Há 3 espaços de imagem nas peças escolhidas.', fonte: 'peca-e-etapa' },
    { imagens: 2, videos: 1 },
  );
  assert.equal(r.selo, '2 imagens · 1 vídeo');
  assert.equal(r.porque, 'Há 2 de imagem, 1 de vídeo nas peças escolhidas.');
});

test('contagemUnificada sem peça conhecida fica com a conta da etapa, só de imagem', () => {
  const r = contagemUnificada(
    { quantas: 4, porque: 'Esta seção será criada no estilo do kit.', fonte: 'etapa' },
    { imagens: 0, videos: 0 },
  );
  assert.equal(r.selo, '4 imagens');
  assert.equal(r.porque, 'Esta seção será criada no estilo do kit.');
});

test('contagemUnificada com zero espaços não inventa selo', () => {
  const r = contagemUnificada(
    { quantas: 0, porque: 'Nenhuma das peças desta seção tem espaço de imagem.', fonte: 'peca' },
    { imagens: 0, videos: 0 },
  );
  assert.equal(r.selo, null);
});
