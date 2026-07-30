import assert from 'node:assert/strict';
import { test } from 'node:test';
import { coresDoValor, inventariarCores, inventariarFontes } from './inventario.js';

/**
 * A fixture reproduz o CSS REAL do acervo: utilitárias Tailwind com hex no
 * nome da classe e rgb() com alfa em var() no valor. Foi exatamente esse
 * formato que o regex do contrato não enxergava — as três cores dominantes da
 * tela não apareciam em contrato nenhum.
 */
const CSS_PELINA = `
.bg-\\[\\#0D3C1F\\]{--tw-bg-opacity:1;background-color:rgb(13 60 31 / var(--tw-bg-opacity, 1))}
.text-\\[\\#F69066\\]{color:#F69066}
.border-\\[\\#3D7F61\\]{border-color:#3D7F61}
.faixa{background:linear-gradient(90deg, #3D7F61 0%, #0D3C1F 100%)}
.cartao{box-shadow:0 10px 20px rgb(13 60 31 / 0.2)}
.logo{background-image:url("data:image/svg+xml,%3Csvg%3E%3Cpath fill='%23ff0000'/%3E%3C/svg%3E")}
.seta{fill:#F69066}
:root{--cor-da-origem:#3D7F61}
`;

test('inventaria com contexto por propriedade', () => {
  const inv = inventariarCores(CSS_PELINA);
  const de = (hex: string, ctx: string) =>
    inv.find((o) => o.hexOpaco === hex && o.contexto === ctx);

  assert.ok(de('#0d3c1f', 'bg'), 'o rgb() do Tailwind é fundo');
  assert.equal(de('#0d3c1f', 'bg')?.alfa, 'var(--tw-bg-opacity, 1)');
  assert.ok(de('#f69066', 'text'));
  assert.ok(de('#3d7f61', 'border'));
  assert.ok(de('#3d7f61', 'gradient'), 'cor dentro de gradiente conta como gradient');
  assert.ok(de('#0d3c1f', 'gradient'));
  assert.ok(de('#0d3c1f', 'shadow'));
  assert.ok(de('#f69066', 'icone'), 'fill é ícone');
  assert.ok(de('#3d7f61', 'outro'), 'declaração de custom property da origem conta');
});

test('url() é pulado INTEIRO: o hex do SVG em data-uri não aparece', () => {
  const inv = inventariarCores(CSS_PELINA);
  assert.equal(
    inv.find((o) => o.hexOpaco === '#ff0000'),
    undefined,
  );
});

test('ocorrências somam por literal+contexto', () => {
  const inv = inventariarCores('.a{color:#111}.b{color:#111}.c{background:#111}');
  assert.equal(inv.find((o) => o.contexto === 'text')?.ocorrencias, 2);
  assert.equal(inv.find((o) => o.contexto === 'bg')?.ocorrencias, 1);
});

test('CSS que não parseia devolve vazio em vez de lançar', () => {
  assert.deepEqual(inventariarCores('isto { não é css'), []);
});

test('coresDoValor acha múltiplas cores num valor só', () => {
  const cores = coresDoValor('0 0 0 1px #fff, 0 10px 20px rgb(0 0 0 / 0.5)');
  assert.equal(cores.length, 2);
  assert.equal(cores[0]?.hexOpaco, '#ffffff');
  assert.equal(cores[1]?.hexOpaco, '#000000');
});

test('fontes: genéricas ficam de fora, monospace sugere mono', () => {
  const fontes = inventariarFontes(
    `.a{font-family:'Poppins', sans-serif}.b{font-family:Poppins,Arial}.c{font-family:'JetBrains Mono', monospace}`,
  );
  const poppins = fontes.find((f) => f.familia === 'Poppins');
  assert.equal(poppins?.ocorrencias, 2);
  assert.equal(poppins?.papelSugerido, null);
  assert.equal(fontes.find((f) => f.familia === 'JetBrains Mono')?.papelSugerido, 'mono');
  assert.equal(
    fontes.find((f) => f.familia === 'sans-serif'),
    undefined,
  );
});
