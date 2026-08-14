import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { montarProjetoDeEntrega, nomeDePacote } from './projeto-de-entrega.js';

/** Uma versão gerada como o `montarPaginaDoKit` a escreve. */
const versaoFalsa = (): string => {
  const dir = mkdtempSync(join(tmpdir(), 'entrega-origem-'));
  mkdirSync(join(dir, 'assets'), { recursive: true });
  mkdirSync(join(dir, 'midia'), { recursive: true });
  writeFileSync(join(dir, 'index.html'), '<html><body>oi</body></html>');
  writeFileSync(join(dir, 'assets/styles.css'), 'body{margin:0}');
  writeFileSync(join(dir, 'assets/ajustes.css'), '/* retoques */');
  writeFileSync(join(dir, 'midia/foto.png'), 'x');
  writeFileSync(
    join(dir, 'aceite.json'),
    JSON.stringify({
      aprovado: true,
      vereditos: [
        { codigo: 'S5', titulo: 'O grid é um só', estado: 'passou', motivo: '' },
        {
          codigo: 'S2',
          titulo: 'Nada da origem sobrevive',
          estado: 'pendente',
          motivo: '1 vídeo do site de origem continua na página.',
        },
      ],
    }),
  );
  writeFileSync(join(dir, 'aceite-navegador.json'), '{}');
  writeFileSync(join(dir, 'estados-derivados.json'), '{}');
  writeFileSync(join(dir, 'ajustes.json'), '[]');
  return dir;
};

test('o entregável é um PROJETO, não uma pasta de arquivos soltos', () => {
  const origem = versaoFalsa();
  const destino = mkdtempSync(join(tmpdir(), 'entrega-destino-'));
  try {
    const raiz = montarProjetoDeEntrega({
      origem,
      destino,
      marca: 'Café da Estação',
      versao: '2026-08-14T10-30-00-000Z',
    });

    // A pasta tem NOME: quem descompacta encontra um projeto, não trinta
    // arquivos derramados na pasta de downloads.
    assert.ok(raiz.endsWith('cafe-da-estacao'), raiz);

    // O site inteiro veio.
    for (const arquivo of ['index.html', 'assets/styles.css', 'midia/foto.png']) {
      assert.ok(existsSync(join(raiz, arquivo)), `faltou ${arquivo}`);
    }
    // A folha de retoques é do SITE, é a última da cascata, e fica.
    assert.ok(existsSync(join(raiz, 'assets/ajustes.css')));

    // O que transforma o site em coisa publicável.
    for (const arquivo of [
      'README.md',
      'ENTREGA.md',
      'package.json',
      'servidor.mjs',
      'netlify.toml',
      'vercel.json',
      '.nojekyll',
      '.gitignore',
    ]) {
      assert.ok(existsSync(join(raiz, arquivo)), `faltou ${arquivo}`);
    }

    // Os instrumentos NOSSOS não viajam: medição e histórico de retoque não
    // significam nada para quem recebe, e o que interessa deles vira ENTREGA.md.
    for (const interno of [
      'aceite.json',
      'aceite-navegador.json',
      'estados-derivados.json',
      'ajustes.json',
    ]) {
      assert.ok(!existsSync(join(raiz, interno)), `${interno} não devia viajar`);
    }

    // `npm start` roda sem instalar nada: o servidor é Node puro.
    const pacote = JSON.parse(readFileSync(join(raiz, 'package.json'), 'utf8'));
    assert.equal(pacote.name, 'cafe-da-estacao');
    assert.equal(pacote.scripts.start, 'node servidor.mjs');
    assert.equal(pacote.dependencies, undefined, 'nada para instalar antes de ver o site');

    // A pendência aparece POR ESCRITO — passar em silêncio é o que o contrato
    // do app proíbe.
    const entrega = readFileSync(join(raiz, 'ENTREGA.md'), 'utf8');
    assert.match(entrega, /pendente/i);
    assert.match(entrega, /vídeo do site de origem/);
    assert.match(entrega, /S5/, 'e o que passou também');
  } finally {
    rmSync(origem, { recursive: true, force: true });
    rmSync(destino, { recursive: true, force: true });
  }
});

test('sem relatório de conferência, a entrega diz isso em vez de inventar', () => {
  const origem = mkdtempSync(join(tmpdir(), 'entrega-origem-'));
  const destino = mkdtempSync(join(tmpdir(), 'entrega-destino-'));
  try {
    writeFileSync(join(origem, 'index.html'), '<html></html>');
    const raiz = montarProjetoDeEntrega({
      origem,
      destino,
      marca: 'Marca',
      versao: '2026-08-14T10-30-00-000Z',
    });
    assert.match(readFileSync(join(raiz, 'ENTREGA.md'), 'utf8'), /não traz relatório/);
  } finally {
    rmSync(origem, { recursive: true, force: true });
    rmSync(destino, { recursive: true, force: true });
  }
});

test('o nome do pacote perde acento e espaço, e nunca sai vazio', () => {
  assert.equal(nomeDePacote('Ourivés & Cia'), 'ourives-cia');
  assert.equal(nomeDePacote('  '), 'site');
  assert.equal(nomeDePacote('São João del-Rei'), 'sao-joao-del-rei');
});
