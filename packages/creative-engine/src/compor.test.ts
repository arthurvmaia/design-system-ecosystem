import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DIMENSAO_DO_FORMATO, type FormatoCriativo, LIMITES_DO_PEDIDO } from '@ds/shared';
import { escalaDaPeca, htmlDaPeca } from './compor.js';

/**
 * A escala da peça, sem navegador.
 *
 * Ela mora na suíte rápida de propósito: a decisão de tamanho é aritmética e
 * não precisa de Chromium para ser conferida — e a suíte de navegador não
 * bloqueia o CI. O que só o navegador sabe (se o bloco REALMENTE coube) está em
 * `compor.browser.test.ts`.
 */

const CORES = {
  texto: '#F4F1EA',
  faixa: '#1E2F4F',
  acento: '#F4F1EA',
  tintaDoAcento: '#111827',
  acentoVeioDaMarca: false,
} as const;

const encher = (n: number, semente: string): string => {
  let s = '';
  while (s.length < n) s += `${semente} `;
  return s.slice(0, n).trim();
};

const FORMATOS: FormatoCriativo[] = ['feed-1x1', 'story-9x16', 'reels-9x16', 'banner-3x1'];

test('PROVA: headline comprida ENCOLHE a letra, curta nao', () => {
  const curta = escalaDaPeca({
    formato: 'banner-3x1',
    marca: 'Castevani',
    headline: 'Alfaiataria',
    cta: null,
  });
  const comprida = escalaDaPeca({
    formato: 'banner-3x1',
    marca: 'Castevani',
    headline: encher(LIMITES_DO_PEDIDO.headline, 'alfaiataria sob medida'),
    cta: null,
  });

  assert.equal(curta.fator, 1, 'texto curto não tem por que encolher');
  assert.ok(
    comprida.headline < curta.headline,
    `a headline no teto do schema tem de sair menor: ${comprida.headline} vs ${curta.headline}`,
  );
});

test('PROVA: o bloco estimado cabe na caixa, em TODO formato e no teto do schema', () => {
  // O defeito era o contrário disto: o corpo era constante e o texto saía do
  // quadro. Aqui a conta se prova contra ela mesma; o navegador confere depois.
  for (const formato of FORMATOS) {
    const s = escalaDaPeca({
      formato,
      marca: encher(LIMITES_DO_PEDIDO.marca, 'Marca Comprida'),
      headline: encher(LIMITES_DO_PEDIDO.headline, 'palavra headline enorme'),
      cta: encher(LIMITES_DO_PEDIDO.cta, 'chamada comprida'),
    });
    assert.ok(
      s.alturaEstimada <= s.alturaDisponivel,
      `${formato}: estimou ${s.alturaEstimada}px numa caixa de ${s.alturaDisponivel}px`,
    );
  }
});

test('PROVA: a caixa de texto cabe no QUADRO, com folga, em todo formato', () => {
  // A caixa disponível é menor que o quadro de propósito. É essa diferença que
  // absorve o erro da estimativa, que erra sempre para menos.
  for (const formato of FORMATOS) {
    const d = DIMENSAO_DO_FORMATO[formato];
    const s = escalaDaPeca({ formato, marca: 'M', headline: 'H', cta: 'C' });
    assert.ok(
      s.alturaDisponivel + 2 * s.padY <= d.altura,
      `${formato}: a caixa mais o respiro não podem passar da altura do quadro`,
    );
    assert.ok(s.padX > 0 && s.padY > 0, `${formato}: peça sem respiro nenhum encaixota o texto`);
  }
});

test('PROVA: o respiro vertical sai da ALTURA, nao da largura', () => {
  // Em CSS, `padding` em porcentagem resolve contra a LARGURA — inclusive em
  // cima e embaixo. Os `6% 7% 7%` de antes gastavam 195px de respiro vertical
  // num banner de 500px de altura: 39% da peça antes da primeira letra.
  const banner = escalaDaPeca({ formato: 'banner-3x1', marca: 'M', headline: null, cta: null });
  assert.ok(
    2 * banner.padY < DIMENSAO_DO_FORMATO['banner-3x1'].altura * 0.25,
    `o respiro vertical do banner comeu ${2 * banner.padY}px de 500`,
  );
});

test('a escala do quadrado e a do story nao mudaram: o defeito era do formato largo', () => {
  // `min(largura, altura × 1,6)` deixa quadrado e story onde estavam — nos dois
  // a largura já é o menor termo — e corrige só a proporção que a fórmula
  // antiga não servia.
  for (const formato of ['feed-1x1', 'story-9x16'] as const) {
    const s = escalaDaPeca({ formato, marca: 'M', headline: 'H', cta: null });
    assert.equal(s.headline, Math.round(1080 * 0.062), `${formato} não deveria ter mudado`);
  }
});

test('PROVA: o HTML nao usa opacity — o contraste declarado tem de ser o do pixel', () => {
  const html = htmlDaPeca({
    formato: 'feed-1x1',
    fundo: null,
    marca: 'Castevani',
    headline: 'Alfaiataria em repouso',
    cta: 'Agendar',
    cores: CORES,
  });
  assert.ok(!html.includes('opacity'), 'opacity muda o pixel sem mudar o par de cores calculado');
});

test('PROVA: a faixa sob o texto e SOLIDA; o degrade vive fora dela', () => {
  const html = htmlDaPeca({
    formato: 'feed-1x1',
    fundo: null,
    marca: 'Castevani',
    headline: 'Alfaiataria em repouso',
    cta: null,
    cores: CORES,
  });
  // A faixa recebe a cor cheia…
  assert.match(html, /\.faixa\{[^}]*background:#1E2F4F/);
  // …e o único degradê da peça está no véu, que é um pseudoelemento ACIMA dela.
  const degrades = html.match(/linear-gradient/g) ?? [];
  assert.equal(degrades.length, 1, 'só o véu pode ser degradê');
  assert.match(html, /\.faixa::before\{[^}]*linear-gradient/);
});
