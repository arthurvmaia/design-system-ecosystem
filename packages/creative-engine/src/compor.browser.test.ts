import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import {
  type ArranjoDaPeca,
  DIMENSAO_DO_FORMATO,
  type FormatoCriativo,
  LIMITES_DO_PEDIDO,
  conferirVariacaoCriativa,
  rotuloDaPeca,
} from '@ds/shared';
import { chromium } from 'playwright';
import { comporPeca, contrasteDaPeca, coresDerivadas, htmlDaPeca } from './compor.js';
import { cssDaFonte } from './fonte.js';

/**
 * A composição precisa entregar as duas coisas que a régua cobra e que o
 * provedor não garante: a DIMENSÃO exata e o TEXTO literal.
 *
 * Medido na primeira geração paga deste repositório: um pedido de 1080×1080
 * voltou 736×414. O provedor devolve a proporção que ele quer.
 */

const CORES = {
  texto: '#F4F1EA',
  faixa: '#1E2F4F',
  acento: '#D0B178',
  tintaDoAcento: '#111827',
  acentoVeioDaMarca: true,
} as const;

test('a peca sai na dimensao EXATA do formato, e o texto e o que se pediu', async (t) => {
  const navegador = await chromium.launch({ args: ['--no-sandbox'] });
  t.after(async () => await navegador.close());

  const peca = await comporPeca(navegador, {
    formato: 'story-9x16',
    fundo: null,
    marca: 'Café da Estação',
    headline: 'Aberto desde as sete',
    cta: 'Venha tomar um café',
    cores: CORES,
  });

  assert.equal(peca.largura, 1080);
  assert.equal(peca.altura, 1920);
  assert.deepEqual(peca.textos, ['Café da Estação', 'Aberto desde as sete', 'Venha tomar um café']);

  // O print é um PNG de verdade, e a dimensão dele bate com a pedida.
  const b = Buffer.from(peca.png);
  assert.equal(b[0], 0x89);
  assert.equal(b.toString('latin1', 1, 4), 'PNG');
  assert.equal(b.readUInt32BE(16), 1080);
  assert.equal(b.readUInt32BE(20), 1920);
});

test('PROVA: a peca composta passa na regua, e a regua e a mesma da entrega', async (t) => {
  const navegador = await chromium.launch({ args: ['--no-sandbox'] });
  t.after(async () => await navegador.close());

  const peca = await comporPeca(navegador, {
    formato: 'feed-1x1',
    fundo: null,
    marca: 'iFood',
    headline: 'Chegou em dez minutos',
    cta: null,
    cores: CORES,
  });

  const r = conferirVariacaoCriativa({
    formato: 'feed-1x1',
    largura: peca.largura,
    altura: peca.altura,
    houvePixelGerado: false,
    headline: 'Chegou em dez minutos',
    cta: null,
    textoRenderizado: peca.textos,
    caixasDosPapeis: peca.caixas,
    marca: 'iFood',
    menorContraste: peca.menorContraste,
    hash: 'a',
    hashesIrmas: [],
    houveUpload: false,
    uploadPreservado: null,
    procedencia: { modelo: 'composicao', preset: 'imagem-padrao' },
    tipografia: { familia: null, aplicou: peca.fonteAplicada },
    fracaoDaFoto: null,
    temFoto: false,
  });

  assert.equal(
    rotuloDaPeca(r),
    'aprovada',
    JSON.stringify(r.vereditos.filter((v) => v.estado !== 'passou')),
  );
});

const encher = (n: number, semente: string): string => {
  let s = '';
  while (s.length < n) s += `${semente} `;
  return s.slice(0, n).trim();
};

test('PROVA: a headline realista NAO joga mais a marca para fora do quadro', async (t) => {
  // O caso medido, e o motivo desta correção existir. Com o corpo da letra
  // constante, esta mesma peça saía com a linha da marca terminando 601px ACIMA
  // do topo do quadro de 500px — e a régua dava "aprovada" com dez verdes,
  // porque `innerText` devolve o que está no documento, não o que está na peça.
  const navegador = await chromium.launch({ args: ['--no-sandbox'] });
  t.after(async () => await navegador.close());

  const headline =
    'Alfaiataria sob medida com tecidos italianos selecionados e prova marcada no mesmo dia, para quem precisa de um terno impecável antes do fim da semana sem abrir mão do caimento';

  const peca = await comporPeca(navegador, {
    formato: 'banner-3x1',
    fundo: null,
    marca: 'Castevani',
    headline,
    cta: 'Agendar prova',
    cores: CORES,
  });

  const marca = peca.caixas.find((c) => c.papel === 'marca');
  assert.ok(marca !== undefined, 'a marca tem de estar na peça');
  assert.ok(marca.topo >= 0, `a marca começou em ${marca.topo}px: fora do quadro`);
  assert.ok(marca.base <= 500, `a marca terminou em ${marca.base}px num quadro de 500`);

  const r = conferirVariacaoCriativa({
    formato: 'banner-3x1',
    largura: peca.largura,
    altura: peca.altura,
    houvePixelGerado: false,
    headline,
    cta: 'Agendar prova',
    textoRenderizado: peca.textos,
    caixasDosPapeis: peca.caixas,
    marca: 'Castevani',
    menorContraste: peca.menorContraste,
    hash: 'a',
    hashesIrmas: [],
    houveUpload: false,
    uploadPreservado: null,
    procedencia: { modelo: 'composicao', preset: 'imagem-padrao' },
    tipografia: { familia: null, aplicou: peca.fonteAplicada },
    fracaoDaFoto: null,
    temFoto: false,
  });
  assert.equal(
    rotuloDaPeca(r),
    'aprovada',
    JSON.stringify(r.vereditos.filter((v) => v.estado !== 'passou')),
  );
});

test('PROVA: no TETO do schema, os quatro formatos ficam dentro do quadro', async (t) => {
  // A estimativa de linhas erra sempre para MENOS (ela assume empacotamento
  // perfeito; o navegador quebra em palavra). Este teste é o que impede a folga
  // declarada de virar folga insuficiente sem ninguém perceber.
  const navegador = await chromium.launch({ args: ['--no-sandbox'] });
  t.after(async () => await navegador.close());

  const formatos: FormatoCriativo[] = ['feed-1x1', 'story-9x16', 'reels-9x16', 'banner-3x1'];
  for (const formato of formatos) {
    const d = DIMENSAO_DO_FORMATO[formato];
    const peca = await comporPeca(navegador, {
      formato,
      fundo: null,
      marca: encher(LIMITES_DO_PEDIDO.marca, 'Marca Comprida'),
      headline: encher(LIMITES_DO_PEDIDO.headline, 'palavra headline enorme'),
      cta: encher(LIMITES_DO_PEDIDO.cta, 'chamada comprida'),
      cores: CORES,
    });
    for (const c of peca.caixas) {
      assert.ok(
        c.topo >= 0 && c.base <= d.altura && c.esquerda >= 0 && c.direita <= d.largura,
        `${formato}/${c.papel} saiu do quadro ${d.largura}×${d.altura}: (${c.esquerda},${c.topo}) a (${c.direita},${c.base})`,
      );
    }
  }
});

test('PROVA: uma palavra impartivel nao vaza pela lateral', async (t) => {
  // Marca ou headline num palavrão único não tem onde quebrar. Sem
  // `overflow-wrap`, ele sai pela direita — e a lateral era um lado que nem a
  // correção do transbordo vertical cobriria sozinha.
  const navegador = await chromium.launch({ args: ['--no-sandbox'] });
  t.after(async () => await navegador.close());

  const peca = await comporPeca(navegador, {
    formato: 'banner-3x1',
    fundo: null,
    marca: 'Pneumoultramicroscopicossilicovulcanoconioticosupercalifragilistico',
    headline: null,
    cta: null,
    cores: CORES,
  });
  const marca = peca.caixas.find((c) => c.papel === 'marca');
  assert.ok(marca !== undefined);
  assert.ok(marca.direita <= 1500, `a marca vazou até ${marca.direita}px num quadro de 1500`);
});

/** Um PNG de proporção conhecida, para servir de logotipo nos testes. */
const arquivoDeTeste = async (
  navegador: Awaited<ReturnType<typeof chromium.launch>>,
  largura: number,
  altura: number,
): Promise<string> => {
  const caminho = join(tmpdir(), `logo-${randomUUID().slice(0, 8)}.png`);
  const pagina = await navegador.newPage({ viewport: { width: largura, height: altura } });
  await pagina.setContent('<body style="background:#D0B178"></body>');
  writeFileSync(caminho, await pagina.screenshot({ type: 'png' }));
  await pagina.close();
  return caminho;
};

test('PROVA: o logotipo entra SEM deformar, e a regua mede a proporcao', async (t) => {
  // Logo esticada é a falha que o dono da marca reconhece antes de todas, e ela
  // não aparece em leitura nenhuma de texto: a altura é fixada e a largura fica
  // em `auto`, então a proporção sai certa por construção — e C3 confere.
  const navegador = await chromium.launch({ args: ['--no-sandbox'] });
  t.after(async () => await navegador.close());

  // 3:1, uma proporção de lockup horizontal — a pior para um quadro quadrado.
  const logo = await arquivoDeTeste(navegador, 600, 200);
  const peca = await comporPeca(navegador, {
    formato: 'feed-1x1',
    fundo: null,
    marca: 'Castevani',
    logotipo: logo,
    headline: 'Alfaiataria em repouso',
    cta: 'Agendar prova',
    assinatura: '@castevani',
    cores: CORES,
  });
  rmSync(logo, { force: true });

  const marca = peca.caixas.find((c) => c.papel === 'marca');
  assert.ok(marca !== undefined);
  assert.equal(marca.imagem?.larguraReal, 600);
  assert.equal(marca.imagem?.alturaReal, 200);
  assert.ok(
    marca.imagem?.tinta != null && marca.imagem?.fundoAtras != null,
    'a régua precisa da tinta e do fundo para saber se a marca SE VÊ',
  );
  const proporcao = (marca.direita - marca.esquerda) / (marca.base - marca.topo);
  assert.ok(Math.abs(proporcao - 3) < 0.06, `saiu na proporção ${proporcao.toFixed(2)}, não 3`);

  const r = conferirVariacaoCriativa({
    formato: 'feed-1x1',
    largura: peca.largura,
    altura: peca.altura,
    houvePixelGerado: false,
    headline: 'Alfaiataria em repouso',
    cta: 'Agendar prova',
    textoRenderizado: peca.textos,
    caixasDosPapeis: peca.caixas,
    marca: 'Castevani',
    menorContraste: peca.menorContraste,
    hash: 'a',
    hashesIrmas: [],
    houveUpload: false,
    uploadPreservado: null,
    procedencia: { modelo: 'composicao', preset: 'imagem-padrao' },
    tipografia: { familia: null, aplicou: peca.fonteAplicada },
    fracaoDaFoto: null,
    temFoto: false,
  });
  assert.equal(
    rotuloDaPeca(r),
    'aprovada',
    JSON.stringify(r.vereditos.filter((v) => v.estado !== 'passou')),
  );
});

test('PROVA: logotipo que NAO carrega reprova em vez de virar buraco', async (t) => {
  // O elemento continua ocupando lugar, então nenhuma medida de geometria vê o
  // problema: a peça sai com um vazio onde deveria estar a marca.
  const navegador = await chromium.launch({ args: ['--no-sandbox'] });
  t.after(async () => await navegador.close());

  const quebrado = join(tmpdir(), `nao-e-png-${randomUUID().slice(0, 8)}.png`);
  writeFileSync(quebrado, 'isto não é uma imagem');
  const peca = await comporPeca(navegador, {
    formato: 'feed-1x1',
    fundo: null,
    marca: 'Castevani',
    logotipo: quebrado,
    headline: 'Alfaiataria em repouso',
    cta: null,
    cores: CORES,
  });
  rmSync(quebrado, { force: true });

  const r = conferirVariacaoCriativa({
    formato: 'feed-1x1',
    largura: peca.largura,
    altura: peca.altura,
    houvePixelGerado: false,
    headline: 'Alfaiataria em repouso',
    cta: null,
    textoRenderizado: peca.textos,
    caixasDosPapeis: peca.caixas,
    marca: 'Castevani',
    menorContraste: peca.menorContraste,
    hash: 'a',
    hashesIrmas: [],
    houveUpload: false,
    uploadPreservado: null,
    procedencia: { modelo: 'composicao', preset: 'imagem-padrao' },
    tipografia: { familia: null, aplicou: peca.fonteAplicada },
    fracaoDaFoto: null,
    temFoto: false,
  });
  const c3 = r.vereditos.find((v) => v.codigo === 'C3');
  assert.equal(c3?.estado, 'reprovou', JSON.stringify(peca.caixas));
  assert.match(c3?.motivo ?? '', /não carregou/);
});

test('PROVA: o logotipo SUBSTITUI o texto da marca, nao soma', async (t) => {
  const navegador = await chromium.launch({ args: ['--no-sandbox'] });
  t.after(async () => await navegador.close());

  const logo = await arquivoDeTeste(navegador, 400, 400);
  const peca = await comporPeca(navegador, {
    formato: 'feed-1x1',
    fundo: null,
    marca: 'Castevani',
    logotipo: logo,
    headline: 'Alfaiataria',
    cta: null,
    cores: CORES,
  });
  rmSync(logo, { force: true });

  const marcas = peca.caixas.filter((c) => c.papel === 'marca');
  assert.equal(marcas.length, 1, 'a marca aparece uma vez só, como logotipo OU como texto');
  assert.ok(marcas[0]?.imagem != null, 'e nesta peça ela é o logotipo');
});

test('PROVA: todo texto sai OPACO — e o contraste declarado vira verdade', async (t) => {
  // Enquanto a marca tinha `opacity:.85` sobre o trecho transparente de um
  // degradê, este arquivo declarava 11,82:1 e o pixel media 2,51:1.
  const navegador = await chromium.launch({ args: ['--no-sandbox'] });
  t.after(async () => await navegador.close());

  const peca = await comporPeca(navegador, {
    formato: 'feed-1x1',
    fundo: null,
    marca: 'Castevani',
    headline: 'Alfaiataria em repouso',
    cta: 'Agendar prova',
    cores: CORES,
  });
  for (const c of peca.caixas) {
    assert.equal(c.opacidade, 1, `"${c.papel}" saiu com opacidade ${c.opacidade}`);
  }
});

test('PROVA: o banner 3:1 sai exato, mesmo nao sendo nativo em transporte nenhum', async (t) => {
  // 1500×500 é 3:1, e 3:1 não existe na lista de proporções do MCP nem na do
  // REST. A peça sai certa porque a JANELA é aberta na medida e o fundo entra
  // com `cover` — a composição resolve o que o provedor não oferece, em vez de
  // esticar o que ele devolveu.
  const navegador = await chromium.launch({ args: ['--no-sandbox'] });
  t.after(async () => await navegador.close());

  // Um fundo QUADRADO, que é a pior proporção possível para um banner largo.
  const quadrado = join(tmpdir(), `fundo-${randomUUID().slice(0, 8)}.png`);
  const pagina = await navegador.newPage({ viewport: { width: 400, height: 400 } });
  await pagina.setContent('<body style="background:#7a2b2b"></body>');
  writeFileSync(quadrado, await pagina.screenshot({ type: 'png' }));
  await pagina.close();

  const peca = await comporPeca(navegador, {
    formato: 'banner-3x1',
    fundo: quadrado,
    marca: 'Castevani',
    headline: 'Alfaiataria em repouso',
    cta: null,
    cores: CORES,
  });
  rmSync(quadrado, { force: true });

  assert.equal(peca.largura, 1500);
  assert.equal(peca.altura, 500);
  const b = Buffer.from(peca.png);
  assert.equal(b.readUInt32BE(16), 1500, 'o arquivo tem a largura pedida');
  assert.equal(b.readUInt32BE(20), 500, 'e a altura pedida, sem esticar o fundo quadrado');
});

test('PROVA: a grafia da marca sobrevive a composicao, sem text-transform', () => {
  // O HTML não pode conter `text-transform`: ele muda o que se vê sem mudar o
  // documento, e "iFood" viraria "IFOOD" na peça continuando "iFood" no DOM.
  const html = htmlDaPeca({
    formato: 'feed-1x1',
    fundo: null,
    marca: 'iFood',
    headline: null,
    cta: null,
    cores: CORES,
  });
  assert.ok(!html.includes('text-transform'), 'text-transform mentiria para a régua');
  assert.ok(html.includes('iFood'));
});

test('o contraste e o par que NOS escolhemos, e ele e exato', () => {
  const bom = contrasteDaPeca(CORES, false);
  assert.ok(bom !== null && bom > 3, `off-white sobre azul marinho deveria passar, deu ${bom}`);

  const ruim = contrasteDaPeca(
    {
      texto: '#F4F1EA',
      faixa: '#EDE9E0',
      acento: '#ffffff',
      tintaDoAcento: '#F4F1EA',
      acentoVeioDaMarca: false,
    },
    false,
  );
  assert.ok(ruim !== null && ruim < 3, 'quase-branco sobre quase-branco tem de reprovar');
});

test('PROVA: o acento sai da PALETA da marca quando alguma cor de apoio serve', () => {
  // O botão é o elemento de conversão de um criativo de tráfego. Enquanto o
  // pedido levava uma cor só, ele saía na dupla invertida do preto-e-branco —
  // contraste garantido, e nenhuma relação com a marca.
  const comApoio = coresDerivadas('#1E2F4F', ['#D0B178']);
  assert.equal(comApoio.acento, '#D0B178');
  assert.equal(comApoio.acentoVeioDaMarca, true);
  assert.ok((contrasteDaPeca(comApoio, true) ?? 0) >= 3, 'o par do botão continua tendo de se ler');

  // Uma cor de apoio que não se separa da faixa é RECUSADA, e a peça diz.
  const apoioInvisivel = coresDerivadas('#1E2F4F', ['#1F3050']);
  assert.equal(apoioInvisivel.acentoVeioDaMarca, false, 'botão que some no fundo não é botão');

  // Sem paleta nenhuma, o comportamento é o de antes: a dupla invertida.
  const semApoio = coresDerivadas('#1E2F4F');
  assert.equal(semApoio.acento, semApoio.texto);
  assert.equal(semApoio.acentoVeioDaMarca, false);
});

test('texto do cliente nao vira HTML', async (t) => {
  const navegador = await chromium.launch({ args: ['--no-sandbox'] });
  t.after(async () => await navegador.close());

  const peca = await comporPeca(navegador, {
    formato: 'feed-1x1',
    fundo: null,
    marca: '<script>alert(1)</script>',
    headline: null,
    cta: null,
    cores: CORES,
  });
  assert.equal(peca.textos[0], '<script>alert(1)</script>', 'o texto aparece como TEXTO');
});

test('PROVA: a fonte da marca APLICA quando o arquivo entra embutido', async (t) => {
  // Um `font-family` sem o arquivo cai no fallback SEM AVISAR: a peça sai numa
  // letra que não é a da marca e nada nela diz isso. Por isso a fonte viaja
  // embutida, e por isso a aplicação é medida em vez de presumida.
  const navegador = await chromium.launch({ args: ['--no-sandbox'] });
  t.after(async () => await navegador.close());

  const css = await cssDaFonte('Sora');
  if (css === null) {
    t.skip('sem rede para buscar a fonte; o caminho offline está coberto pelo teste seguinte');
    return;
  }

  const peca = await comporPeca(navegador, {
    formato: 'feed-1x1',
    fundo: null,
    marca: 'Castevani',
    headline: 'Alfaiataria em repouso',
    cta: null,
    fonte: { familia: 'Sora', css },
    cores: CORES,
  });
  assert.equal(peca.fonteAplicada, true, 'a fonte embutida tem de carregar de verdade');

  const r = conferirVariacaoCriativa({
    formato: 'feed-1x1',
    largura: peca.largura,
    altura: peca.altura,
    houvePixelGerado: false,
    headline: 'Alfaiataria em repouso',
    cta: null,
    textoRenderizado: peca.textos,
    caixasDosPapeis: peca.caixas,
    marca: 'Castevani',
    menorContraste: peca.menorContraste,
    hash: 'a',
    hashesIrmas: [],
    houveUpload: false,
    uploadPreservado: null,
    procedencia: { modelo: 'composicao', preset: 'imagem-padrao' },
    tipografia: { familia: 'Sora', aplicou: peca.fonteAplicada },
    fracaoDaFoto: null,
    temFoto: false,
  });
  assert.equal(r.vereditos.find((v) => v.codigo === 'C11')?.estado, 'passou');
});

test('PROVA: fonte pedida que NAO carrega reprova, em vez de sair calada', async (t) => {
  // O caso real é a máquina sem rede, ou a família que o catálogo não tem. A
  // peça continua saindo — na letra da casa —, e C11 diz que ela saiu.
  const navegador = await chromium.launch({ args: ['--no-sandbox'] });
  t.after(async () => await navegador.close());

  const peca = await comporPeca(navegador, {
    formato: 'feed-1x1',
    fundo: null,
    marca: 'Castevani',
    headline: 'Alfaiataria em repouso',
    cta: null,
    // Uma família que não existe em lugar nenhum: é o que o fallback silencioso
    // faz parecer normal.
    fonte: { familia: 'Fonte Que Nao Existe Em Lugar Nenhum', css: '' },
    cores: CORES,
  });
  assert.equal(peca.fonteAplicada, false);

  const r = conferirVariacaoCriativa({
    formato: 'feed-1x1',
    largura: peca.largura,
    altura: peca.altura,
    houvePixelGerado: false,
    headline: 'Alfaiataria em repouso',
    cta: null,
    textoRenderizado: peca.textos,
    caixasDosPapeis: peca.caixas,
    marca: 'Castevani',
    menorContraste: peca.menorContraste,
    hash: 'a',
    hashesIrmas: [],
    houveUpload: false,
    uploadPreservado: null,
    procedencia: { modelo: 'composicao', preset: 'imagem-padrao' },
    tipografia: { familia: 'Fonte Que Nao Existe Em Lugar Nenhum', aplicou: peca.fonteAplicada },
    fracaoDaFoto: null,
    temFoto: false,
  });
  const c11 = r.vereditos.find((v) => v.codigo === 'C11');
  assert.equal(c11?.estado, 'reprovou');
  assert.match(c11?.motivo ?? '', /letra de reserva/);
  assert.equal(r.aprovado, false);
});

/**
 * OS ARRANJOS, medidos no pixel.
 *
 * Dar mais arranjos ao compositor é geometria e não gasta crédito. O que cada
 * arranjo novo gasta é RISCO: ele é uma chance nova de o texto não caber no
 * quadro, e uma chance nova de o texto pousar onde não se lê. Os dois se medem
 * aqui, e é isto que separa "arranjo" de "conceito".
 */

const ARRANJOS: ArranjoDaPeca[] = [
  'faixa-inferior',
  'tela-dividida',
  'veu-cheio',
  'texto-sobre-imagem',
];

/** Uma página pintada e fotografada, para servir de fundo. */
const fundoDeTeste = async (
  navegador: Awaited<ReturnType<typeof chromium.launch>>,
  corpo: string,
  largura = 1200,
  altura = 1200,
): Promise<string> => {
  const caminho = join(tmpdir(), `fundo-${randomUUID().slice(0, 8)}.png`);
  const pagina = await navegador.newPage({ viewport: { width: largura, height: altura } });
  await pagina.setContent(`<body style="margin:0">${corpo}</body>`);
  writeFileSync(caminho, await pagina.screenshot({ type: 'png' }));
  await pagina.close();
  return caminho;
};

const SO_COR = (cor: string): string =>
  `<div style="width:100%;height:100%;background:${cor}"></div>`;

test('PROVA: C2 medida — nos QUATRO arranjos, em todo formato, no TETO do schema', async (t) => {
  // A condição para um arranjo virar conceito. Cada arranjo põe o texto numa
  // caixa diferente, e a estimativa que decide o corpo da letra erra sempre
  // para MENOS (ela assume empacotamento perfeito; o navegador quebra em
  // palavra). Só a medição diz se coube.
  const navegador = await chromium.launch({ args: ['--no-sandbox'] });
  t.after(async () => await navegador.close());

  const formatos: FormatoCriativo[] = ['feed-1x1', 'story-9x16', 'reels-9x16', 'banner-3x1'];
  const marca = encher(LIMITES_DO_PEDIDO.marca, 'Marca Comprida');
  const headline = encher(LIMITES_DO_PEDIDO.headline, 'palavra headline enorme');
  const cta = encher(LIMITES_DO_PEDIDO.cta, 'chamada comprida');

  for (const arranjo of ARRANJOS) {
    for (const formato of formatos) {
      const peca = await comporPeca(navegador, {
        formato,
        arranjo,
        fundo: null,
        marca,
        headline,
        cta,
        cores: CORES,
      });
      const r = conferirVariacaoCriativa({
        formato,
        largura: peca.largura,
        altura: peca.altura,
        houvePixelGerado: false,
        headline,
        cta,
        textoRenderizado: peca.textos,
        caixasDosPapeis: peca.caixas,
        marca,
        menorContraste: peca.menorContraste,
        hash: 'a',
        hashesIrmas: [],
        houveUpload: false,
        uploadPreservado: null,
        procedencia: { modelo: 'composicao', preset: 'imagem-padrao' },
        tipografia: { familia: null, aplicou: peca.fonteAplicada },
        fracaoDaFoto: null,
        temFoto: false,
      });
      const c2 = r.vereditos.find((v) => v.codigo === 'C2');
      assert.equal(
        c2?.estado,
        'passou',
        `${arranjo}/${formato}: ${c2?.motivo} — caixas ${JSON.stringify(peca.caixas)}`,
      );
    }
  }
});

test('PROVA: o arranjo VIAJA no resultado — é ele que separa dois conceitos', async (t) => {
  // Medir "layouts diferentes" por distância de pixel não separa as classes: os
  // pares de mesma ideia e de ideias diferentes se cruzam na escala (§4 do
  // handoff). Qual arranjo foi usado é declarado, e por isso é exato.
  const navegador = await chromium.launch({ args: ['--no-sandbox'] });
  t.after(async () => await navegador.close());

  for (const arranjo of ARRANJOS) {
    const peca = await comporPeca(navegador, {
      formato: 'banner-3x1',
      arranjo,
      fundo: null,
      marca: 'Castevani',
      headline: 'Alfaiataria em repouso',
      cta: 'Agendar prova',
      cores: CORES,
    });
    assert.equal(peca.arranjo, arranjo);
  }
});

test('PROVA: sobre FOTO o contraste e amostrado no pixel, e a foto que estoura REPROVA', async (t) => {
  // É o defeito que este arranjo poderia ter trazido de graça: o texto sai da
  // faixa sólida e o número declarado continua saindo bonito, deixando de
  // descrever a peça. Um branco puro sob tinta off-white é o caso extremo, e
  // ele TEM de reprovar.
  const navegador = await chromium.launch({ args: ['--no-sandbox'] });
  t.after(async () => await navegador.close());

  const estourado = await fundoDeTeste(navegador, SO_COR('#ffffff'));
  const peca = await comporPeca(navegador, {
    formato: 'banner-3x1',
    arranjo: 'texto-sobre-imagem',
    fundo: estourado,
    marca: 'Castevani',
    headline: 'Alfaiataria em repouso',
    cta: null,
    cores: CORES,
  });
  rmSync(estourado, { force: true });

  assert.ok(peca.contrasteAmostrado !== null, 'o pixel tinha de ter sido amostrado');
  assert.ok(
    (peca.contrasteAmostrado as number) < 3,
    `off-white sobre branco puro não pode dar ${peca.contrasteAmostrado}`,
  );

  const r = conferirVariacaoCriativa({
    formato: 'banner-3x1',
    largura: peca.largura,
    altura: peca.altura,
    houvePixelGerado: false,
    headline: 'Alfaiataria em repouso',
    cta: null,
    textoRenderizado: peca.textos,
    caixasDosPapeis: peca.caixas,
    marca: 'Castevani',
    menorContraste: peca.menorContraste,
    hash: 'a',
    hashesIrmas: [],
    houveUpload: false,
    uploadPreservado: null,
    procedencia: { modelo: 'composicao', preset: 'imagem-padrao' },
    tipografia: { familia: null, aplicou: peca.fonteAplicada },
    fracaoDaFoto: null,
    temFoto: false,
  });
  const c4 = r.vereditos.find((v) => v.codigo === 'C4');
  assert.equal(c4?.estado, 'reprovou', JSON.stringify(c4));
});

test('PROVA: o veu DERIVADO faz a MESMA foto estourada carregar o texto', async (t) => {
  // O alfa não é escolhido: é o menor que faz o pior pixel possível (branco
  // puro, para tinta clara) vencer o piso. Esta é a prova de que a derivação
  // cumpre o que promete — mesma foto, mesmo texto, só muda o arranjo.
  const navegador = await chromium.launch({ args: ['--no-sandbox'] });
  t.after(async () => await navegador.close());

  const estourado = await fundoDeTeste(navegador, SO_COR('#ffffff'));
  const peca = await comporPeca(navegador, {
    formato: 'banner-3x1',
    arranjo: 'veu-cheio',
    fundo: estourado,
    marca: 'Castevani',
    headline: 'Alfaiataria em repouso',
    cta: null,
    cores: CORES,
  });
  rmSync(estourado, { force: true });

  assert.ok(peca.contrasteAmostrado !== null, 'o pixel tinha de ter sido amostrado');
  assert.ok(
    (peca.contrasteAmostrado as number) >= 3,
    `o véu derivado prometeu o piso e entregou ${peca.contrasteAmostrado}`,
  );
});

test('PROVA: o TERCO e medido, nao escolhido — o bloco vai para onde o texto se le', async (t) => {
  // "O terço vazio" não é uma posição fixa: depende da foto. As duas metades
  // provam que a escolha é MEDIDA e não um padrão: `inicio` é o valor inicial
  // do atributo, então achar `inicio` sozinho não provaria nada — o segundo
  // caso é o que mostra o bloco se mudando de lado.
  const navegador = await chromium.launch({ args: ['--no-sandbox'] });
  t.after(async () => await navegador.close());

  const metades = (esquerda: string, direita: string): string =>
    `<div style="display:flex;width:100%;height:100%">
       <div style="flex:1;background:${esquerda}"></div>
       <div style="flex:1;background:${direita}"></div>
     </div>`;

  for (const [onde, esquerda, direita] of [
    ['inicio', '#050505', '#ffffff'],
    ['fim', '#ffffff', '#050505'],
  ] as const) {
    const fundo = await fundoDeTeste(navegador, metades(esquerda, direita), 1500, 500);
    const peca = await comporPeca(navegador, {
      formato: 'banner-3x1',
      arranjo: 'texto-sobre-imagem',
      fundo,
      marca: 'Castevani',
      headline: 'Alfaiataria em repouso',
      cta: null,
      cores: CORES,
    });
    rmSync(fundo, { force: true });

    assert.equal(
      peca.terco,
      onde,
      `o lado escuro era "${onde}" e o bloco foi para "${peca.terco}"`,
    );
    assert.ok(
      (peca.contrasteAmostrado as number) >= 3,
      `sobre o lado escuro a tinta clara tem de se ler: deu ${peca.contrasteAmostrado}`,
    );
  }
});

test('PROVA: sobre a foto, o logotipo deixa de ficar PENDENTE — o fundo dele e amostrado', async (t) => {
  // `fundoAtrasDe` sobe pelos ancestrais procurando cor de fundo opaca, e sobre
  // uma foto não existe nenhuma: C3 sairia pendente para sempre em três dos
  // quatro arranjos. O pixel medido responde a mesma pergunta de verdade.
  const navegador = await chromium.launch({ args: ['--no-sandbox'] });
  t.after(async () => await navegador.close());

  const escuro = await fundoDeTeste(navegador, SO_COR('#101010'));
  const logo = await arquivoDeTeste(navegador, 600, 200);
  const peca = await comporPeca(navegador, {
    formato: 'banner-3x1',
    arranjo: 'veu-cheio',
    fundo: escuro,
    marca: 'Castevani',
    logotipo: logo,
    headline: 'Alfaiataria em repouso',
    cta: null,
    cores: CORES,
  });
  rmSync(escuro, { force: true });
  rmSync(logo, { force: true });

  const marca = peca.caixas.find((c) => c.papel === 'marca');
  assert.ok(marca?.imagem != null, 'a marca é o logotipo nesta peça');
  assert.ok(
    marca?.imagem?.fundoAtras != null,
    'sem o fundo amostrado, C3 fica pendente para sempre sobre foto',
  );

  const r = conferirVariacaoCriativa({
    formato: 'banner-3x1',
    largura: peca.largura,
    altura: peca.altura,
    houvePixelGerado: false,
    headline: 'Alfaiataria em repouso',
    cta: null,
    textoRenderizado: peca.textos,
    caixasDosPapeis: peca.caixas,
    marca: 'Castevani',
    menorContraste: peca.menorContraste,
    hash: 'a',
    hashesIrmas: [],
    houveUpload: false,
    uploadPreservado: null,
    procedencia: { modelo: 'composicao', preset: 'imagem-padrao' },
    tipografia: { familia: null, aplicou: peca.fonteAplicada },
    fracaoDaFoto: null,
    temFoto: false,
  });
  const c3 = r.vereditos.find((v) => v.codigo === 'C3');
  assert.notEqual(c3?.estado, 'pendente', JSON.stringify(c3));
});

test('PROVA C12: a peca que o dono reprovou de OLHO agora reprova na regua', async (t) => {
  // O caso, com endereço: no banner real da marca de prova a faixa saiu com 52%
  // da peça e a foto com 48%. O dono disse que estava péssimo e as onze regras
  // estavam verdes, porque nenhuma perguntava o que sobrou da imagem.
  //
  // Aqui a faixa é forçada a ficar grande com uma headline comprida, e a regra
  // tem de pegar. Sem C12, esta mesma peça sai "aprovada".
  const navegador = await chromium.launch({ args: ['--no-sandbox'] });
  t.after(async () => await navegador.close());

  const fundo = await fundoDeTeste(navegador, SO_COR('#3a5a80'), 1500, 500);
  const headline = encher(LIMITES_DO_PEDIDO.headline, 'alfaiataria sob medida');
  const peca = await comporPeca(navegador, {
    formato: 'banner-3x1',
    arranjo: 'faixa-inferior',
    fundo,
    marca: 'Castevani',
    headline,
    cta: 'Agendar prova',
    cores: CORES,
  });
  rmSync(fundo, { force: true });

  assert.ok(peca.fracaoDaFoto !== null, 'a peça tem foto, então a fração tem de ser medida');
  assert.ok(
    (peca.fracaoDaFoto as number) < 0.5,
    `esta peça deveria ter a foto como MENOR parte; deu ${peca.fracaoDaFoto}`,
  );

  const r = conferirVariacaoCriativa({
    formato: 'banner-3x1',
    largura: peca.largura,
    altura: peca.altura,
    houvePixelGerado: true,
    headline,
    cta: 'Agendar prova',
    textoRenderizado: peca.textos,
    caixasDosPapeis: peca.caixas,
    marca: 'Castevani',
    menorContraste: peca.menorContraste,
    hash: 'a',
    hashesIrmas: [],
    houveUpload: false,
    uploadPreservado: null,
    procedencia: { modelo: 'composicao', preset: 'imagem-padrao' },
    tipografia: { familia: null, aplicou: peca.fonteAplicada },
    fracaoDaFoto: peca.fracaoDaFoto,
    temFoto: true,
  });
  const c12 = r.vereditos.find((v) => v.codigo === 'C12');
  assert.equal(c12?.estado, 'reprovou', JSON.stringify(c12));
  assert.equal(rotuloDaPeca(r), 'reprovada');

  // E as OUTRAS onze continuam verdes na mesma peça: é isso que prova que a
  // régua tinha um buraco, e não que ela estava toda errada.
  const outras = r.vereditos.filter((v) => v.codigo !== 'C12' && v.estado === 'reprovou');
  assert.deepEqual(outras, [], 'nenhuma outra regra pega este defeito');
});

test('PROVA C12: com a copy real, a faixa vira LINHA e a foto volta a ser a peca', async (t) => {
  // A mesma peça com uma headline de tamanho realista. A disposição em linha é
  // derivada — ninguém a pede —, e é ela que devolve a peça para a foto.
  const navegador = await chromium.launch({ args: ['--no-sandbox'] });
  t.after(async () => await navegador.close());

  const fundo = await fundoDeTeste(navegador, SO_COR('#3a5a80'), 1500, 500);
  const peca = await comporPeca(navegador, {
    formato: 'banner-3x1',
    arranjo: 'faixa-inferior',
    fundo,
    marca: 'Castevani',
    headline: 'Você entende o tratamento antes de ele começar',
    cta: 'Agendar avaliação',
    cores: CORES,
  });
  rmSync(fundo, { force: true });

  assert.ok(
    (peca.fracaoDaFoto as number) >= 0.5,
    `a foto tem de voltar a ser a maior parte; deu ${peca.fracaoDaFoto}`,
  );
});

test('peca SEM foto nao deve nada a C12: a faixa e a peca, por decisao', () => {
  const r = conferirVariacaoCriativa({
    formato: 'feed-1x1',
    largura: 1080,
    altura: 1080,
    houvePixelGerado: false,
    headline: null,
    cta: null,
    textoRenderizado: [],
    caixasDosPapeis: [],
    marca: 'Castevani',
    menorContraste: 10,
    hash: 'a',
    hashesIrmas: [],
    houveUpload: false,
    uploadPreservado: null,
    procedencia: { modelo: 'composicao', preset: 'imagem-padrao' },
    tipografia: { familia: null, aplicou: null },
    fracaoDaFoto: null,
    temFoto: false,
  });
  assert.equal(r.vereditos.find((v) => v.codigo === 'C12')?.estado, 'passou');
});

test('PROVA C12: peca COM foto que ninguem mediu fica PENDENTE, nunca verde', () => {
  // É a distinção que o `temFoto` existe para fazer: `fracaoDaFoto: null`
  // significaria "não há foto" e "ninguém mediu" ao mesmo tempo, e a régua daria
  // verde para a segunda — que é exatamente o caso que ela existe para pegar.
  const r = conferirVariacaoCriativa({
    formato: 'banner-3x1',
    largura: 1500,
    altura: 500,
    houvePixelGerado: true,
    headline: null,
    cta: null,
    textoRenderizado: [],
    caixasDosPapeis: [],
    marca: 'Castevani',
    menorContraste: 10,
    hash: 'a',
    hashesIrmas: [],
    houveUpload: false,
    uploadPreservado: null,
    procedencia: { modelo: 'composicao', preset: 'imagem-padrao' },
    tipografia: { familia: null, aplicou: null },
    fracaoDaFoto: null,
    temFoto: true,
  });
  assert.equal(r.vereditos.find((v) => v.codigo === 'C12')?.estado, 'pendente');
});
