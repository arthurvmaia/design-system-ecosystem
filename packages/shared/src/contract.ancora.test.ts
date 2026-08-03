import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { ancorarContratoDoBundle, derivarContrato } from './contract.js';
import { ComponentContract, SlotDeMidia } from './schemas/component-contract.js';
import type { AncoraDeRolagem } from './schemas/component-contract.js';
import type {
  AncoraDeMidia,
  ComportamentoParaAncora,
  MidiaParaAncora,
} from './schemas/midia-posicional.js';

/**
 * A âncora de rolagem viajando para dentro do contrato.
 *
 * O cruzamento em si (mídia × comportamento) é medido em `midia-posicional.ts` e
 * tem teste próprio. O que se prova aqui é a viagem: de quem é a âncora dentro do
 * contrato, e o que o contrato diz quando ninguém mediu — que é diferente de
 * dizer "medi e não tem".
 */

const HERO_HTML = `
<section class="hero">
  <img class="hero__foto parallax" src="https://origem.example/img/montanha.jpg" width="1600" height="900" />
  <div class="hero__conteudo">
    <h1>Manchete</h1>
    <img class="selo" src="https://origem.example/img/selo.png" />
  </div>
</section>
`;

const FOTO: MidiaParaAncora = {
  id: 'md_1',
  kind: 'imagem',
  fingerprint: { id: null, stableClasses: ['hero__foto', 'parallax'] },
};

const SELO: MidiaParaAncora = {
  id: 'md_2',
  kind: 'imagem',
  fingerprint: { id: null, stableClasses: ['selo'] },
};

const PARALLAX_DA_FOTO: ComportamentoParaAncora = {
  kind: 'parallax',
  start: 0.2,
  end: 0.6,
  scrub: true,
  pin: false,
  target: { id: null, classes: ['hero__foto', 'parallax'] },
};

const derivarHero = (medida?: {
  midias: MidiaParaAncora[];
  comportamentos: ComportamentoParaAncora[];
}) =>
  derivarContrato({
    html: HERO_HTML,
    css: { 'assets/css/layout.css': '.hero{position:relative}' },
    origem: 'bundle-v2',
    ...(medida === undefined
      ? {}
      : { midiasDaCaptura: medida.midias, comportamentosDeScroll: medida.comportamentos }),
  });

test('a mídia sob efeito de rolagem sai do contrato com a âncora medida', () => {
  const contrato = derivarHero({
    midias: [FOTO, SELO],
    comportamentos: [PARALLAX_DA_FOTO],
  });
  ComponentContract.parse(contrato);

  const foto = contrato.slots.midias.find((m) => m.seletor.endsWith('*:nth-child(1)'));
  assert.deepEqual(foto?.ancoras, [
    {
      midiaId: 'md_1',
      efeito: 'parallax',
      de: 0.2,
      ate: 0.6,
      acompanhaRolagem: true,
    },
  ]);
});

test('a mídia que NÃO se move sai com lista vazia, e não com "não sei"', () => {
  // A distinção é o campo inteiro: `[]` é "conferi e esta não está presa";
  // `null` seria "ninguém olhou". Guardar as duas no mesmo valor faria ausência
  // de medição ler como aprovação.
  const contrato = derivarHero({ midias: [FOTO, SELO], comportamentos: [PARALLAX_DA_FOTO] });
  const selo = contrato.slots.midias.find((m) => m.seletor.includes('nth-child(2) > '));
  assert.deepEqual(selo?.ancoras, []);
});

test('sem a medição da captura, toda âncora fica em null (ninguém mediu)', () => {
  const contrato = derivarHero();
  assert.ok(contrato.slots.midias.length >= 2);
  for (const m of contrato.slots.midias) assert.equal(m.ancoras, null);
});

test('só um lado da medida não afirma nada: os dois campos andam juntos', () => {
  const soMidias = derivarContrato({
    html: HERO_HTML,
    css: {},
    origem: 'bundle-v2',
    midiasDaCaptura: [FOTO],
  });
  for (const m of soMidias.slots.midias) assert.equal(m.ancoras, null);

  const soComportamentos = derivarContrato({
    html: HERO_HTML,
    css: {},
    origem: 'bundle-v2',
    comportamentosDeScroll: [PARALLAX_DA_FOTO],
  });
  for (const m of soComportamentos.slots.midias) assert.equal(m.ancoras, null);
});

test('classe espalhada em dois elementos não vira âncora do vizinho', () => {
  // `hero__foto` no pai e `parallax` no filho não são o mesmo elemento. Casar por
  // interseção parcial produziria âncora de dono errado, que é pior que âncora
  // nenhuma — é a mesma regra que a Galeria já segue.
  const contrato = derivarContrato({
    html: '<div class="hero__foto"><img class="parallax" src="a.jpg" /></div>',
    css: {},
    origem: 'bundle-v2',
    midiasDaCaptura: [FOTO],
    comportamentosDeScroll: [PARALLAX_DA_FOTO],
  });
  assert.deepEqual(contrato.slots.midias[0]?.ancoras, []);
});

test('fundo declarado no CSS continua null mesmo com a captura medida', () => {
  // O seletor é de CSS e pode valer para vários elementos: não dá para afirmar de
  // qual deles é a âncora, então o contrato não afirma.
  const contrato = derivarContrato({
    html: '<section class="capa"></section>',
    css: { 'assets/css/layout.css': '.capa{background-image:url(image/fundo.jpg)}' },
    origem: 'bundle-v2',
    midiasDaCaptura: [
      { id: 'md_3', kind: 'imagem', fingerprint: { id: null, stableClasses: ['capa'] } },
    ],
    comportamentosDeScroll: [{ ...PARALLAX_DA_FOTO, target: { id: null, classes: ['capa'] } }],
  });
  const fundo = contrato.slots.midias.find((m) => m.tipo === 'background-image');
  assert.equal(fundo?.ancoras, null);
});

test('contrato gravado antes deste campo continua válido e declara null', () => {
  const antigo = {
    id: 'midia-1',
    seletor: ':scope > *:nth-child(1)',
    tipo: 'imagem',
    urlOriginal: 'https://origem.example/img/montanha.jpg',
  };
  assert.equal(SlotDeMidia.parse(antigo).ancoras, null);
});

test('a âncora do contrato é a MESMA forma da medida, sem adaptador no meio', () => {
  // Vocabulário duplicado é vocabulário que diverge: quem tem uma `AncoraDeMidia`
  // na mão pode gravá-la no slot, e quem lê o slot pode passá-la para
  // `explicarAncora` sem traduzir nada.
  const daMedida: AncoraDeMidia = {
    midiaId: 'md_1',
    efeito: 'sticky',
    de: 0,
    ate: 1,
    acompanhaRolagem: true,
  };
  const noContrato: AncoraDeRolagem = daMedida;
  assert.deepEqual(noContrato, daMedida);
});

test('ancorarContratoDoBundle: reancora o contrato GRAVADO, sem re-derivar', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ancora-bundle-'));
  try {
    mkdirSync(dir, { recursive: true });
    const gravado = derivarHero();
    writeFileSync(
      join(dir, 'manifest.json'),
      JSON.stringify({ compilerVersion: 1, contract: gravado }, null, 2),
    );
    // O documento do compilador: o corpo é o MESMO html de que o contrato saiu.
    writeFileSync(
      join(dir, 'index.html'),
      `<!doctype html><html><head><title>x</title></head><body>${HERO_HTML}<script src="a.js"></script></body></html>`,
    );

    const ancorado = ancorarContratoDoBundle(dir, {
      midias: [FOTO, SELO],
      comportamentos: [PARALLAX_DA_FOTO],
    });
    assert.ok(ancorado !== null);
    // Os slots são os do contrato gravado: mesmos ids, mesmos seletores.
    assert.deepEqual(
      ancorado.slots.midias.map((m) => m.id),
      gravado.slots.midias.map((m) => m.id),
    );
    const comAncora = ancorado.slots.midias.filter((m) => (m.ancoras?.length ?? 0) > 0);
    assert.equal(comAncora.length, 1);
    assert.equal(comAncora[0]?.ancoras?.[0]?.efeito, 'parallax');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('ancorarContratoDoBundle: sem contrato gravado não inventa contrato', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ancora-vazio-'));
  try {
    writeFileSync(join(dir, 'index.html'), '<html><body><img src="a.jpg" /></body></html>');
    assert.equal(ancorarContratoDoBundle(dir, { midias: [FOTO], comportamentos: [] }), null);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
