import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { chromium } from 'playwright';
import { derivarLogosDaMarca } from './derivar.js';
import { lerIco } from './ico.js';
import { LADOS_DO_FAVICON, LADOS_DO_ICO, derivarPacoteDaMarca } from './pacote.js';

/**
 * As peças que saem do símbolo por CÁLCULO.
 *
 * É a fatia do brandbook que a referência mostra em cinco páginas e que custa
 * zero. Pedir cada uma ao gerador custaria 75 e devolveria um desenho NOVO a
 * cada vez — a queixa que originou este motor.
 */

const dimensaoDePng = (png: Uint8Array): { largura: number; altura: number } => {
  const b = Buffer.from(png);
  return { largura: b.readUInt32BE(16), altura: b.readUInt32BE(20) };
};

const simboloDeTeste = async (
  navegador: Awaited<ReturnType<typeof chromium.launch>>,
): Promise<string> => {
  const caminho = join(tmpdir(), `sim-${randomUUID().slice(0, 8)}.png`);
  const pagina = await navegador.newPage({ viewport: { width: 800, height: 800 } });
  await pagina.setContent(
    '<body style="margin:0;background:#f2ede4"><div style="position:absolute;left:90px;top:130px;width:300px;height:300px;border-radius:50%;border:44px solid #0F4C81"></div></body>',
  );
  writeFileSync(caminho, await pagina.screenshot({ type: 'png' }));
  await pagina.close();
  return caminho;
};

test('PROVA: o pacote inteiro sai do MESMO simbolo, sem gastar credito', async (t) => {
  const navegador = await chromium.launch({ args: ['--no-sandbox'] });
  t.after(async () => await navegador.close());

  const origem = await simboloDeTeste(navegador);
  const versoes = await derivarLogosDaMarca(navegador, origem);
  const transparente = join(tmpdir(), `t-${randomUUID().slice(0, 8)}.png`);
  writeFileSync(transparente, versoes.transparente);

  const pacote = await derivarPacoteDaMarca(navegador, {
    simbolo: transparente,
    nome: 'Sorriso Vivo',
    cor: '#0F4C81',
    fonteCss: '',
    familia: null,
  });
  rmSync(origem, { force: true });
  rmSync(transparente, { force: true });

  // Os cinco favicons, cada um no lado pedido.
  for (const lado of LADOS_DO_FAVICON) {
    const png = pacote.pngs[`favicon-${lado}`];
    assert.ok(png !== undefined, `faltou o favicon de ${lado}`);
    const d = dimensaoDePng(png);
    assert.equal(d.largura, lado, `favicon-${lado} saiu com ${d.largura}px de largura`);
    assert.equal(d.altura, lado);
  }

  // E o container leva só os três pequenos: os grandes são referenciados como
  // PNG, e enfiá-los aqui inflaria o arquivo que TODA página carrega.
  assert.deepEqual(
    lerIco(pacote.ico).map((d) => d.lado),
    [...LADOS_DO_ICO],
  );

  for (const peca of ['lockup-horizontal', 'lockup-vertical', 'nome-por-extenso']) {
    assert.ok(pacote.pngs[peca] !== undefined, `faltou ${peca}`);
  }
});

test('PROVA: o lockup horizontal e MAIS LARGO que alto, e o vertical nao', async (t) => {
  // É a diferença entre as duas peças, e ela é geometria: a horizontal existe
  // para barra de topo e assinatura de e-mail, a vertical para espaço estreito.
  // Sem isso, entregar as duas seria entregar a mesma coisa duas vezes.
  const navegador = await chromium.launch({ args: ['--no-sandbox'] });
  t.after(async () => await navegador.close());

  const origem = await simboloDeTeste(navegador);
  const versoes = await derivarLogosDaMarca(navegador, origem);
  const transparente = join(tmpdir(), `t-${randomUUID().slice(0, 8)}.png`);
  writeFileSync(transparente, versoes.transparente);

  const pacote = await derivarPacoteDaMarca(navegador, {
    simbolo: transparente,
    nome: 'Sorriso Vivo',
    cor: '#0F4C81',
    fonteCss: '',
    familia: null,
  });
  rmSync(origem, { force: true });
  rmSync(transparente, { force: true });

  const h = dimensaoDePng(pacote.pngs['lockup-horizontal'] as Uint8Array);
  const v = dimensaoDePng(pacote.pngs['lockup-vertical'] as Uint8Array);
  assert.ok(h.largura > h.altura, `o horizontal saiu ${h.largura}×${h.altura}`);
  assert.ok(
    h.largura / h.altura > v.largura / v.altura,
    `o horizontal (${(h.largura / h.altura).toFixed(2)}) tem de ser mais largo que o vertical (${(v.largura / v.altura).toFixed(2)})`,
  );
});

test('PROVA: o nome sai como TEXTO, e a regua consegue le-lo', async (t) => {
  // Modelo de imagem erra letra, e a grafia da marca é a única coisa deste
  // contrato que não admite interpretação. Escrito em tipografia ele sai exato,
  // e a conferência lê o documento em vez de precisar de OCR.
  const navegador = await chromium.launch({ args: ['--no-sandbox'] });
  t.after(async () => await navegador.close());

  const { htmlDaPecaDaMarca } = await import('./pacote-navegador.js');
  const html = htmlDaPecaDaMarca({
    simbolo: 'data:image/png;base64,',
    nome: 'iFood',
    cor: '#0F4C81',
    fonteCss: '',
    familia: null,
    peca: 'lockup-horizontal',
    lado: 512,
    fundo: null,
  });
  assert.ok(!html.includes('text-transform'), 'text-transform mentiria sobre a grafia');
  assert.match(html, /data-papel="nome"/, 'a régua precisa achar o papel do nome');
  assert.ok(html.includes('iFood'), 'e a grafia exata está no documento');
});
