import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { chromium } from 'playwright';
import { derivarLogosDaMarca } from './derivar.js';

/**
 * O recorte é a metade PROFISSIONAL da criação de marca, e é a metade que não
 * dá para pedir ao gerador: "o mesmo símbolo em fundo branco" abre um pedido
 * novo, e o modelo desenha outro símbolo.
 *
 * Estes testes medem PIXEL. Um recorte que "parece" ter funcionado é exatamente
 * o que entrega uma logo com moldura ou com metade do desenho comida.
 */

/** Um símbolo de teste: uma forma DESCENTRALIZADA sobre fundo liso. */
const simboloDeTeste = async (
  navegador: Awaited<ReturnType<typeof chromium.launch>>,
  fundo: string,
): Promise<string> => {
  const caminho = join(tmpdir(), `simbolo-${randomUUID().slice(0, 8)}.png`);
  const pagina = await navegador.newPage({ viewport: { width: 800, height: 800 } });
  // Fora do centro de propósito: o gerador quase nunca põe o símbolo no meio, e
  // é justamente isso que a recentragem tem de consertar.
  await pagina.setContent(
    `<body style="margin:0;background:${fundo}">
       <div style="position:absolute;left:80px;top:120px;width:260px;height:180px;background:#1E88E5"></div>
     </body>`,
  );
  writeFileSync(caminho, await pagina.screenshot({ type: 'png' }));
  await pagina.close();
  return caminho;
};

/** Lê pixels de um PNG carregando-o de volta num canvas. */
const amostrar = async (
  navegador: Awaited<ReturnType<typeof chromium.launch>>,
  png: Uint8Array,
  pontos: readonly (readonly [number, number])[],
): Promise<{ lado: number; cores: [number, number, number, number][] }> => {
  const pagina = await navegador.newPage({ viewport: { width: 64, height: 64 } });
  try {
    await pagina.setContent('<!doctype html><html><body></body></html>', { waitUntil: 'load' });
    const dataUri = `data:image/png;base64,${Buffer.from(png).toString('base64')}`;
    return await pagina.evaluate<
      { lado: number; cores: [number, number, number, number][] },
      { dataUri: string; pontos: readonly (readonly [number, number])[] }
    >(
      async (arg) => {
        const img = new Image();
        await new Promise<void>((ok, falha) => {
          img.onload = () => ok();
          img.onerror = () => falha(new Error('nao carregou'));
          img.src = arg.dataUri;
        });
        const c = document.createElement('canvas');
        c.width = img.naturalWidth;
        c.height = img.naturalHeight;
        const ctx = c.getContext('2d', { willReadFrequently: true });
        if (!ctx) throw new Error('sem canvas');
        ctx.drawImage(img, 0, 0);
        const cores = arg.pontos.map((p) => {
          const d = ctx.getImageData(p[0], p[1], 1, 1).data;
          return [d[0], d[1], d[2], d[3]] as [number, number, number, number];
        });
        return { lado: img.naturalWidth, cores };
      },
      { dataUri, pontos },
    );
  } finally {
    await pagina.close();
  }
};

test('PROVA: o fundo liso SAI, e o que sobra e o simbolo', async (t) => {
  const navegador = await chromium.launch({ args: ['--no-sandbox'] });
  t.after(async () => await navegador.close());

  const simbolo = await simboloDeTeste(navegador, '#7a2b2b');
  const versoes = await derivarLogosDaMarca(navegador, simbolo);
  rmSync(simbolo, { force: true });

  // Cantos e centro. O respiro de 10% garante que os cantos são fundo.
  const pontos = [
    [8, 8],
    [1015, 8],
    [8, 1015],
    [512, 512],
  ] as const;

  const t1 = await amostrar(navegador, versoes.transparente, pontos);
  assert.equal(t1.lado, 1024, 'a versão sai em 1024, e não na medida do arquivo de origem');
  for (const [i, canto] of t1.cores.slice(0, 3).entries()) {
    assert.equal(canto[3], 0, `o canto ${i} devia estar transparente, veio alfa ${canto[3]}`);
  }
  const centro = t1.cores[3];
  assert.ok(centro !== undefined && centro[3] > 200, 'o símbolo tem de estar no centro, opaco');
  assert.ok(
    centro[2] > centro[0],
    `o centro devia ser o azul do símbolo, veio rgb(${centro.slice(0, 3).join(',')})`,
  );
});

test('PROVA: a versao de fundo branco e o MESMO simbolo, sobre branco', async (t) => {
  const navegador = await chromium.launch({ args: ['--no-sandbox'] });
  t.after(async () => await navegador.close());

  const simbolo = await simboloDeTeste(navegador, '#7a2b2b');
  const versoes = await derivarLogosDaMarca(navegador, simbolo);
  rmSync(simbolo, { force: true });

  const { cores } = await amostrar(navegador, versoes.fundoBranco, [
    [8, 8],
    [512, 512],
  ] as const);
  const canto = cores[0];
  const centro = cores[1];
  assert.ok(canto !== undefined && canto[0] > 250 && canto[1] > 250 && canto[2] > 250);
  assert.equal(canto[3], 255, 'fundo branco é opaco: é o que faz a logo funcionar sobre papel');
  assert.ok(centro !== undefined && centro[2] > centro[0], 'e o símbolo continua sendo o mesmo');
});

test('PROVA: a monocromatica e a SILHUETA, nao a foto dessaturada', async (t) => {
  // É esta versão que sobrevive a bordado, carimbo e uma tinta só. Ela sai do
  // ALFA do recorte pintado de branco — se saísse de dessaturar, o símbolo
  // viraria cinza médio e a peça perderia a forma.
  const navegador = await chromium.launch({ args: ['--no-sandbox'] });
  t.after(async () => await navegador.close());

  const simbolo = await simboloDeTeste(navegador, '#7a2b2b');
  const versoes = await derivarLogosDaMarca(navegador, simbolo);
  rmSync(simbolo, { force: true });

  const { cores } = await amostrar(navegador, versoes.fundoPreto, [
    [8, 8],
    [512, 512],
  ] as const);
  const canto = cores[0];
  const centro = cores[1];
  assert.ok(canto !== undefined && canto[0] < 40, `o fundo tem de ser escuro, veio ${canto?.[0]}`);
  assert.ok(centro !== undefined && centro[0] > 240 && centro[1] > 240 && centro[2] > 240);
  assert.ok(
    Math.abs((centro[0] ?? 0) - (centro[2] ?? 0)) < 6,
    'branco de verdade: os três canais juntos, não um azul clareado',
  );
});

test('PROVA: o simbolo descentralizado sai CENTRALIZADO, com respiro', async (t) => {
  // O gerador quase nunca põe o símbolo no meio exato, e logo descentrada
  // parece defeito. A recentragem acontece DEPOIS do recorte: centralizar antes
  // centralizaria o quadro, não a forma.
  const navegador = await chromium.launch({ args: ['--no-sandbox'] });
  t.after(async () => await navegador.close());

  const simbolo = await simboloDeTeste(navegador, '#7a2b2b');
  const versoes = await derivarLogosDaMarca(navegador, simbolo);
  rmSync(simbolo, { force: true });

  // Varre uma linha e uma coluna pelo meio, e vê onde o desenho começa e acaba.
  const pagina = await navegador.newPage({ viewport: { width: 64, height: 64 } });
  await pagina.setContent('<!doctype html><html><body></body></html>', { waitUntil: 'load' });
  const caixa = await pagina.evaluate<{ x0: number; x1: number; y0: number; y1: number }, string>(
    async (dataUri) => {
      const img = new Image();
      await new Promise<void>((ok) => {
        img.onload = () => ok();
        img.src = dataUri;
      });
      const c = document.createElement('canvas');
      c.width = img.naturalWidth;
      c.height = img.naturalHeight;
      const ctx = c.getContext('2d', { willReadFrequently: true });
      if (!ctx) throw new Error('sem canvas');
      ctx.drawImage(img, 0, 0);
      const d = ctx.getImageData(0, 0, c.width, c.height).data;
      let x0 = c.width;
      let x1 = -1;
      let y0 = c.height;
      let y1 = -1;
      for (let y = 0; y < c.height; y += 1) {
        for (let x = 0; x < c.width; x += 1) {
          if ((d[(y * c.width + x) * 4 + 3] ?? 0) > 24) {
            if (x < x0) x0 = x;
            if (x > x1) x1 = x;
            if (y < y0) y0 = y;
            if (y > y1) y1 = y;
          }
        }
      }
      return { x0, x1, y0, y1 };
    },
    `data:image/png;base64,${Buffer.from(versoes.transparente).toString('base64')}`,
  );
  await pagina.close();

  const folgaEsquerda = caixa.x0;
  const folgaDireita = 1023 - caixa.x1;
  const folgaCima = caixa.y0;
  const folgaBaixo = 1023 - caixa.y1;

  assert.ok(
    Math.abs(folgaEsquerda - folgaDireita) <= 3,
    `centralizado na horizontal: ${folgaEsquerda} à esquerda e ${folgaDireita} à direita`,
  );
  assert.ok(
    Math.abs(folgaCima - folgaBaixo) <= 3,
    `centralizado na vertical: ${folgaCima} em cima e ${folgaBaixo} embaixo`,
  );
  // 10% de respiro em pelo menos um eixo: o outro cresce porque a forma não é
  // quadrada e a escala respeita a proporção.
  const menorFolga = Math.min(folgaEsquerda, folgaCima);
  assert.ok(
    menorFolga >= 100 && menorFolga <= 115,
    `o respiro devia ser ~10% de 1024, veio ${menorFolga}px`,
  );
});
