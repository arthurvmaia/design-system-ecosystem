import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  COPY_VERSION,
  type PedidoDeCopy,
  executarPlano,
  montarPlanoEditorial,
  validarCopy,
} from './editorial.js';

const DIRETRIZES = {
  eixos: {
    formalidade: 2,
    energia: 2,
    proximidade: 2,
    objetividade: 2,
    sofisticacao: 2,
    nivelTecnico: 2,
  },
  orientacoes: ['Tom principal: Vai ao ponto.'],
  vocabularioPreferido: ['clareza'],
  vocabularioEvitar: ['revolucionário'],
};

test('montarPlanoEditorial é determinístico e só pede o que o brief tem', () => {
  const dados = {
    briefs: {
      hero: { mensagem: 'Resolvemos X', pontos: [], provas: [], cta: 'Começar', iaDecide: false },
      stats: { pontos: [], provas: ['98% de satisfação'], iaDecide: false },
      faq: { pontos: [], provas: [], iaDecide: false }, // vazio → nenhum pedido
    },
    diretrizes: DIRETRIZES,
  };
  const a = montarPlanoEditorial(dados);
  const b = montarPlanoEditorial(dados);
  assert.deepEqual(a, b, 'mesmo insumo, mesmo plano');
  assert.equal(a.copyVersion, COPY_VERSION);

  const papeis = a.pedidos.map((p) => `${p.role}:${p.papel}`);
  assert.deepEqual(papeis, ['hero:titulo', 'hero:paragrafo', 'hero:cta', 'stats:itens']);
  // a voz viaja em todo pedido
  for (const p of a.pedidos) assert.match(p.orientacao, /Vai ao ponto/);
  assert.match(a.pedidos[0]?.orientacao ?? '', /NUNCA use: revolucionário/);
  // cta tem limite duro
  assert.equal(a.pedidos[2]?.limite, 40);
});

test('seção delegada à IA sem material gera pedidos SEGUROS (sem inventar fatos)', () => {
  const plano = montarPlanoEditorial({
    briefs: { about: { pontos: [], provas: [], iaDecide: true } },
    diretrizes: DIRETRIZES,
  });
  const papeis = plano.pedidos.map((p) => `${p.role}:${p.papel}`);
  assert.deepEqual(papeis, ['about:titulo', 'about:paragrafo']);
  for (const p of plano.pedidos) {
    assert.match(p.orientacao, /NÃO invente fatos/, 'a trava de segurança viaja no pedido');
    assert.match(p.orientacao, /Vai ao ponto/, 'a voz da marca também');
  }
  // Delegada COM material: os pedidos normais bastam — nada duplicado.
  const comMaterial = montarPlanoEditorial({
    briefs: {
      hero: { mensagem: 'Resolvemos X', pontos: [], provas: [], iaDecide: true },
    },
    diretrizes: DIRETRIZES,
  });
  assert.deepEqual(
    comMaterial.pedidos.map((p) => p.papel),
    ['titulo', 'paragrafo'],
  );
});

test('validarCopy: vazio, limite e vocabulário proibido', () => {
  assert.deepEqual(validarCopy('Texto ok', { vocabularioEvitar: [] }), []);
  assert.ok(validarCopy('  ', { vocabularioEvitar: [] }).length > 0);
  assert.ok(validarCopy('x'.repeat(50), { limite: 40, vocabularioEvitar: [] }).length > 0);
  assert.ok(
    validarCopy('O produto Revolucionário', { vocabularioEvitar: ['revolucionário'] }).length > 0,
    'proibida é case-insensitive',
  );
});

test('executarPlano com modelo simulado: reprova, corrige na segunda, e o irrecuperável fica listado', async () => {
  const plano = montarPlanoEditorial({
    briefs: {
      hero: {
        mensagem: 'Resolvemos X',
        pontos: [],
        provas: [],
        cta: 'Começar agora',
        iaDecide: false,
      },
    },
    diretrizes: DIRETRIZES,
  });

  const chamadas: string[] = [];
  const modelo = (pedido: PedidoDeCopy): string => {
    chamadas.push(`${pedido.papel}${pedido.orientacao.includes('CORRIJA') ? ':correcao' : ''}`);
    // primeiro título sai com palavra proibida; a correção sai limpa
    if (pedido.papel === 'titulo') {
      return pedido.orientacao.includes('CORRIJA')
        ? 'Resolvemos X de verdade'
        : 'Um revolucionário X';
    }
    // o cta SEMPRE estoura o limite — irrecuperável
    if (pedido.papel === 'cta')
      return 'Uma chamada longuíssima que nunca caberia num botão de verdade';
    return 'Parágrafo direto sobre X.';
  };

  const r = await executarPlano(plano, modelo, { vocabularioEvitar: ['revolucionário'] });

  assert.equal(r.secoes.hero?.titulo, 'Resolvemos X de verdade', 'a correção venceu');
  assert.ok(chamadas.includes('titulo:correcao'), 'houve exatamente a rodada de correção');
  assert.equal(r.problemas.length, 1, 'só o cta ficou irrecuperável');
  assert.equal(r.problemas[0]?.papel, 'cta');
  assert.match(r.problemas[0]?.problemas.join(' ') ?? '', /limite/);
});
