import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  ARRANJO,
  ARRANJOS_EM_ORDEM,
  type ArranjoDaPeca,
  DIMENSAO_DO_FORMATO,
  type FormatoCriativo,
  LIMITES_DO_PEDIDO,
} from '@ds/shared';
import { alfaDoVeu, escalaDaPeca, htmlDaPeca } from './compor.js';

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

/**
 * O ARRANJO — e por que ele muda a ESCALA, e não só o desenho.
 *
 * Dar mais arranjos ao compositor é geometria e não custa crédito nenhum. O que
 * custa é o que vem junto: cada arranjo põe o texto numa caixa diferente, e uma
 * caixa mais estreita quebra a mesma headline em mais linhas. Trocar de arranjo
 * sem trocar a conta seria trocar de chance de estourar o quadro sem nada dizer.
 */

const ARRANJOS: ArranjoDaPeca[] = [
  'faixa-inferior',
  'tela-dividida',
  'veu-cheio',
  'texto-sobre-imagem',
];

test('PROVA: em TODO arranjo e TODO formato, o bloco estimado cabe na caixa', () => {
  for (const arranjo of ARRANJOS) {
    for (const formato of FORMATOS) {
      const s = escalaDaPeca({
        formato,
        arranjo,
        marca: encher(LIMITES_DO_PEDIDO.marca, 'Marca Comprida'),
        headline: encher(LIMITES_DO_PEDIDO.headline, 'palavra headline enorme'),
        cta: encher(LIMITES_DO_PEDIDO.cta, 'chamada comprida'),
      });
      assert.ok(
        s.alturaEstimada <= s.alturaDisponivel,
        `${arranjo}/${formato}: estimou ${s.alturaEstimada}px numa caixa de ${s.alturaDisponivel}px`,
      );
      assert.ok(
        s.larguraDisponivel > 0 && s.alturaDisponivel > 0,
        `${arranjo}/${formato}: caixa sem área`,
      );
    }
  }
});

test('PROVA: a caixa de todo arranjo cabe no QUADRO', () => {
  for (const arranjo of ARRANJOS) {
    for (const formato of FORMATOS) {
      const d = DIMENSAO_DO_FORMATO[formato];
      const s = escalaDaPeca({ formato, arranjo, marca: 'M', headline: 'H', cta: 'C' });
      assert.ok(
        s.alturaDisponivel + 2 * s.padY <= d.altura,
        `${arranjo}/${formato}: a caixa mais o respiro passam da altura do quadro`,
      );
      assert.ok(
        s.larguraDisponivel <= d.largura,
        `${arranjo}/${formato}: a caixa é mais larga que o quadro`,
      );
    }
  }
});

test('PROVA: a coluna da tela dividida encolhe a letra MAIS que a faixa cheia', () => {
  // É a prova de que a escala olha para o arranjo. A mesma headline, o mesmo
  // formato: só muda a largura em que ela quebra — e ela quebra em metade.
  const texto = encher(LIMITES_DO_PEDIDO.headline, 'alfaiataria sob medida');
  const cheia = escalaDaPeca({
    formato: 'banner-3x1',
    arranjo: 'faixa-inferior',
    marca: 'Castevani',
    headline: texto,
    cta: 'Agendar',
  });
  const coluna = escalaDaPeca({
    formato: 'banner-3x1',
    arranjo: 'tela-dividida',
    marca: 'Castevani',
    headline: texto,
    cta: 'Agendar',
  });
  assert.ok(
    coluna.larguraDisponivel < cheia.larguraDisponivel,
    'a coluna tem de ser mais estreita que a faixa cheia',
  );
  assert.ok(
    coluna.headline < cheia.headline,
    `a mesma headline numa coluna estreita tem de sair menor: ${coluna.headline} vs ${cheia.headline}`,
  );
});

test('o arranjo AUSENTE continua sendo o de sempre: nada muda sozinho', () => {
  const semDizer = escalaDaPeca({ formato: 'banner-3x1', marca: 'M', headline: 'H', cta: 'C' });
  const dizendo = escalaDaPeca({
    formato: 'banner-3x1',
    arranjo: 'faixa-inferior',
    marca: 'M',
    headline: 'H',
    cta: 'C',
  });
  assert.deepEqual(semDizer, dizendo);
  assert.equal(semDizer.arranjo, 'faixa-inferior');
});

test('PROVA: cada arranjo DECLARA qual é, e nenhum sai com a mesma composição', () => {
  // A procedência é o que separa dois conceitos. Medir "layouts diferentes" por
  // distância de pixel foi tentado com as artes e não separa as classes: os
  // pares de mesma ideia e de ideias diferentes se cruzam na escala.
  const html = (arranjo: ArranjoDaPeca): string =>
    htmlDaPeca({
      formato: 'banner-3x1',
      arranjo,
      fundo: null,
      marca: 'Castevani',
      headline: 'Alfaiataria em repouso',
      cta: 'Agendar',
      cores: CORES,
    });
  const vistos = new Set<string>();
  for (const arranjo of ARRANJOS) {
    const saida = html(arranjo);
    assert.match(saida, new RegExp(`data-arranjo="${arranjo}"`), `${arranjo} não se declara`);
    const regras = saida.slice(saida.indexOf('.peca{'), saida.indexOf('.marca,'));
    assert.ok(!vistos.has(regras), `${arranjo} saiu com a mesma composição de outro arranjo`);
    vistos.add(regras);
  }
});

test('PROVA: o véu do `veu-cheio` usa o alfa DERIVADO, e não um escolhido', () => {
  const html = htmlDaPeca({
    formato: 'banner-3x1',
    arranjo: 'veu-cheio',
    fundo: null,
    marca: 'Castevani',
    headline: 'Alfaiataria em repouso',
    cta: null,
    cores: CORES,
  });
  const esperado = alfaDoVeu(CORES);
  // `includes` e nao regex de proposito: dentro de um template literal, uma
  // barra invertida seguida de "(" e escape DESCONHECIDO — o JS a descarta e a
  // regex passa a casar qualquer caractere no lugar do parentese. E a mesma
  // armadilha que ja fez a regex de cor virar /d+/ e ficar casando com nada.
  assert.ok(html.includes(`rgba(30,47,79,${esperado})`), html.slice(0, 600));
});

test('PROVA: sem foto, TODO arranjo pousa em cor sólida — e o contraste segue exato', () => {
  // É o que faz a peça sem imagem não precisar de amostragem nenhuma: o
  // substrato volta a ser uma cor que nós escolhemos, em qualquer arranjo.
  for (const arranjo of ARRANJOS) {
    const html = htmlDaPeca({
      formato: 'feed-1x1',
      arranjo,
      fundo: null,
      marca: 'Castevani',
      headline: 'Alfaiataria',
      cta: null,
      cores: CORES,
    });
    assert.match(html, /\.peca\{background:#1E2F4F\}/, `${arranjo} não caiu na cor da faixa`);
    assert.ok(!html.includes('background-image'), `${arranjo} pintou imagem que não existe`);
  }
});

test('PROVA: a ordem de preferência ALTERNA o substrato', () => {
  // Quem tira dois conceitos da lista tira os dois primeiros. Se os dois
  // primeiros pousassem em cor sólida, a página do brandbook mostraria duas
  // variações de uma abordagem — a queixa que os arranjos vieram resolver, com
  // outra roupa. Este teste é o que impede a ordem de voltar a agrupar.
  const substratos = ARRANJOS_EM_ORDEM.map((a) => ARRANJO[a].substrato);
  for (let i = 1; i < substratos.length; i += 1) {
    assert.notEqual(
      substratos[i] === 'cor-solida',
      substratos[i - 1] === 'cor-solida',
      `${ARRANJOS_EM_ORDEM[i - 1]} e ${ARRANJOS_EM_ORDEM[i]} pousam no mesmo tipo de substrato`,
    );
  }
  // E o único sem garantia nenhuma fica por último: ele é o que pode reprovar
  // por causa do material, e não da conta.
  assert.equal(ARRANJOS_EM_ORDEM[ARRANJOS_EM_ORDEM.length - 1], 'texto-sobre-imagem');
});

test('a lista de arranjos e a de PREFERENCIA sao a mesma populacao', () => {
  // Arranjo novo que entre no contrato e não na ordem seria um arranjo que
  // ninguém tenta: `marca:apresentar` percorre a ordem, não o objeto.
  assert.deepEqual([...ARRANJOS_EM_ORDEM].sort(), Object.keys(ARRANJO).sort());
});
