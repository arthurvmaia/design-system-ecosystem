import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

/**
 * A regra que estes testes guardam: mídia automática CONDIZ com o nicho.
 * O defeito real que os motivou: "streetwear" não casava com receita nenhuma,
 * caía num sorteio por hash e a marca saía com um verde de outro segmento e
 * imagens de gradiente com "mídia de teste N" — qualquer mídia, igual para
 * pousada e loja de roupa.
 */

// O módulo grava em projectMediaDir(projectId), que resolve sob DS_ECOSYSTEM_ROOT.
// Raiz descartável ANTES do import para nada tocar o acervo real.
const raiz = mkdtempSync(join(tmpdir(), 'marca-automatica-'));
process.env.DS_ECOSYSTEM_ROOT = raiz;
// Sem chave: os testes NUNCA saem para a rede — o caminho testado é o desenho.
process.env.PEXELS_API_KEY = '';

const { cenaParaNicho, criarMarcaAutomatica, criarMidiasDasSecoes } = await import(
  './marca-automatica.js'
);

const lerSvgs = (projectId: string): string[] => {
  const dir = join(raiz, 'projects', projectId, 'media');
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith('.svg'))
    .map((f) => readFileSync(join(dir, f), 'utf8'));
};

test('streetwear casa com a receita de moda: cena de roupa e paleta sem verde alheio', async () => {
  const r = await criarMarcaAutomatica('prj_teststreet', {
    nicho: 'streetwear',
    nomeDaMarca: 'asteric',
    secoes: [
      { id: 'sec-1', nome: 'Vitrine', papel: 'catalog', quantas: 4, oQue: 'uma foto por produto' },
    ],
  });
  assert.equal(r.branding.brandName, 'asteric');
  assert.equal(r.branding.nicho, 'streetwear', 'o nicho persiste no branding');
  assert.notEqual(r.branding.accent, '#3de6c8', 'o verde da receita sorteada morreu');
  const svgs = lerSvgs('prj_teststreet').filter((s) => s.includes('data-cena="moda"'));
  assert.ok(svgs.length >= 4, 'as imagens da vitrine desenham a cena de moda');
  for (const svg of svgs) {
    assert.ok(!svg.includes('mídia de teste'), 'sem marca d’água genérica');
  }
});

test('cenaParaNicho: casa com acento e variação; desconhecido é genérico declarado', () => {
  assert.equal(cenaParaNicho('loja de roupas urbanas'), 'moda');
  assert.equal(cenaParaNicho('Confeitaria da Vó'), 'cafe');
  assert.equal(cenaParaNicho('pousada na serra'), 'hotel');
  assert.equal(cenaParaNicho('venda de drones agrícolas'), 'generica');
  assert.equal(cenaParaNicho(null), 'generica');
});

test('nicho desconhecido: cores coerentes de receita, mas cena NUNCA mente', async () => {
  const r = await criarMarcaAutomatica('prj_testdrone', {
    nicho: 'venda de drones agrícolas',
    secoes: [{ id: 'sec-1', nome: 'Hero', papel: 'hero', quantas: 1, oQue: 'imagem de abertura' }],
  });
  assert.equal(r.branding.nicho, 'venda de drones agrícolas');
  const svgs = lerSvgs('prj_testdrone');
  assert.ok(
    svgs.some((s) => s.includes('data-cena="generica"')),
    'sem casamento, a cena é a genérica — não a de outro nicho',
  );
});

test('seção de prova social ganha retrato, não produto', async () => {
  const r = await criarMarcaAutomatica('prj_testprova', {
    nicho: 'streetwear',
    secoes: [
      { id: 'sec-p', nome: 'Prova', papel: 'testimonials', quantas: 3, oQue: 'rostos de clientes' },
    ],
  });
  assert.equal(r.branding.nicho, 'streetwear');
  const svgs = lerSvgs('prj_testprova').filter((s) => s.includes('data-cena="retrato"'));
  assert.equal(svgs.length, 3, 'os três depoimentos saem como retrato');
});

test('criarMidiasDasSecoes leva o nicho salvo: a cena segue a marca do projeto', async () => {
  const criadas = await criarMidiasDasSecoes(
    'prj_testsecoes',
    {
      nome: 'asteric',
      display: 'Montserrat, sans-serif',
      body: 'Inter, sans-serif',
      cores: ['#0b0b0d', '#151519', '#f5f5f5', '#b8b8bd', '#e02431', '#ffffff', '#ff8a3d'],
    },
    [{ id: 'sec-1', nome: 'Benefícios', papel: 'showcase', quantas: 2, oQue: 'produto em uso' }],
    'streetwear',
  );
  assert.equal(criadas.length, 2);
  const svgs = lerSvgs('prj_testsecoes');
  assert.ok(
    svgs.filter((s) => s.includes('data-cena="moda"')).length >= 2,
    'as imagens seguem o nicho do projeto',
  );
});

test.after(() => {
  rmSync(raiz, { recursive: true, force: true });
});
