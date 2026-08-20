import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { conferirMarca } from '@ds/shared';
import { chromium } from 'playwright';
import { medirMarca, paraARegua } from './conferir.js';
import { derivarLogosDaMarca } from './derivar.js';

/**
 * A régua da marca, contra os arquivos que o motor realmente produz.
 *
 * Uma peça criativa errada vira lixo de uma campanha. Uma marca errada é
 * carregada por tudo o que a empresa faz depois, e o erro só é notado quando já
 * está em todos os lugares. Por isso estes testes medem PIXEL, e não confiam em
 * nenhuma declaração do que produziu.
 */

/** Um símbolo de teste sobre fundo liso, fora do centro. */
const simbolo = async (
  navegador: Awaited<ReturnType<typeof chromium.launch>>,
  corpo: string,
): Promise<string> => {
  const caminho = join(tmpdir(), `sim-${randomUUID().slice(0, 8)}.png`);
  const pagina = await navegador.newPage({ viewport: { width: 800, height: 800 } });
  await pagina.setContent(`<body style="margin:0;background:#f2ede4">${corpo}</body>`);
  writeFileSync(caminho, await pagina.screenshot({ type: 'png' }));
  await pagina.close();
  return caminho;
};

/** Deriva e grava as três versões numa pasta temporária. */
const marcaEmDisco = async (
  navegador: Awaited<ReturnType<typeof chromium.launch>>,
  origem: string,
): Promise<{ dir: string; arquivos: Record<string, string> }> => {
  const dir = join(tmpdir(), `marca-${randomUUID().slice(0, 8)}`);
  mkdirSync(dir, { recursive: true });
  const versoes = await derivarLogosDaMarca(navegador, origem);
  const arquivos: Record<string, string> = {
    logotipo: join(dir, 'logotipo.png'),
    'logotipo-fundo-branco': join(dir, 'logotipo-fundo-branco.png'),
    'logotipo-fundo-preto': join(dir, 'logotipo-fundo-preto.png'),
  };
  writeFileSync(arquivos.logotipo as string, versoes.transparente);
  writeFileSync(arquivos['logotipo-fundo-branco'] as string, versoes.fundoBranco);
  writeFileSync(arquivos['logotipo-fundo-preto'] as string, versoes.fundoPreto);
  return { dir, arquivos };
};

const DESENHO =
  '<div style="position:absolute;left:90px;top:130px;width:300px;height:300px;border-radius:50%;border:44px solid #0F4C81"></div>';

test('PROVA: a marca que o motor produz PASSA na regua da marca', async (t) => {
  const navegador = await chromium.launch({ args: ['--no-sandbox'] });
  t.after(async () => await navegador.close());

  const origem = await simbolo(navegador, DESENHO);
  const { dir, arquivos } = await marcaEmDisco(navegador, origem);
  const medidas = await medirMarca(navegador, arquivos);
  rmSync(origem, { force: true });
  rmSync(dir, { recursive: true, force: true });

  const r = conferirMarca({
    ...paraARegua(medidas),
    cor: '#0F4C81',
    promptDoSimbolo: 'um círculo aberto, azul, sobre fundo liso',
    procedencia: { modelo: 'teste', preset: 'imagem-marca' },
    decisaoDaCor: { por: 'cliente', motivo: '' },
  });
  assert.equal(
    r.aprovado,
    true,
    JSON.stringify(
      r.vereditos.filter((v) => v.estado !== 'passou'),
      null,
      2,
    ),
  );
  assert.equal(r.comPendencia, false);
});

test('PROVA: as tres versoes sao o MESMO simbolo, e a distancia diz isso', async (t) => {
  // A queixa que originou tudo: pedir "o mesmo símbolo em fundo branco" ao
  // gerador abre um pedido NOVO e a marca chega em três modelos diferentes.
  const navegador = await chromium.launch({ args: ['--no-sandbox'] });
  t.after(async () => await navegador.close());

  const origem = await simbolo(navegador, DESENHO);
  const { dir, arquivos } = await marcaEmDisco(navegador, origem);
  const medidas = await medirMarca(navegador, arquivos);
  rmSync(origem, { force: true });
  rmSync(dir, { recursive: true, force: true });

  assert.ok(medidas.distanciaEntreVersoes !== null);
  assert.ok(
    medidas.distanciaEntreVersoes < 0.1,
    `versões derivadas do mesmo arquivo deviam ser quase idênticas, deu ${medidas.distanciaEntreVersoes}`,
  );
});

test('PROVA: versoes de DESENHOS diferentes reprovam em M4', async (t) => {
  // O caso que a regra existe para pegar: alguém gera três vezes em vez de
  // derivar, e recebe três marcas parecidas em vez de uma marca em três roupas.
  const navegador = await chromium.launch({ args: ['--no-sandbox'] });
  t.after(async () => await navegador.close());

  const um = await simbolo(navegador, DESENHO);
  const outro = await simbolo(
    navegador,
    '<div style="position:absolute;left:200px;top:200px;width:380px;height:200px;background:#0F4C81"></div>',
  );
  const a = await marcaEmDisco(navegador, um);
  const b = await marcaEmDisco(navegador, outro);

  // Uma "marca" montada com o transparente de um e as outras duas do outro.
  const misturada = {
    logotipo: a.arquivos.logotipo as string,
    'logotipo-fundo-branco': b.arquivos['logotipo-fundo-branco'] as string,
    'logotipo-fundo-preto': b.arquivos['logotipo-fundo-preto'] as string,
  };
  const medidas = await medirMarca(navegador, misturada);
  const r = conferirMarca({
    ...paraARegua(medidas),
    cor: '#0F4C81',
    promptDoSimbolo: 'p',
    procedencia: { modelo: 'teste', preset: 'imagem-marca' },
    decisaoDaCor: { por: 'cliente', motivo: '' },
  });
  rmSync(um, { force: true });
  rmSync(outro, { force: true });
  rmSync(a.dir, { recursive: true, force: true });
  rmSync(b.dir, { recursive: true, force: true });

  const m4 = r.vereditos.find((v) => v.codigo === 'M4');
  assert.equal(m4?.estado, 'reprovou', `distância medida: ${medidas.distanciaEntreVersoes}`);
  assert.equal(r.aprovado, false);
});

test('PROVA: recorte que NAO pegou reprova em M2, e o defeito e invisivel no branco', async (t) => {
  // Fundo que não é liso: o recorte não separa nada e a logo sai com o
  // retângulo do fundo em volta. Sobre branco isso não aparece, que é onde
  // quase todo mundo abre um PNG.
  const navegador = await chromium.launch({ args: ['--no-sandbox'] });
  t.after(async () => await navegador.close());

  // Um PNG opaco de ponta a ponta, como sairia de um recorte que falhou.
  const dir = join(tmpdir(), `marca-${randomUUID().slice(0, 8)}`);
  mkdirSync(dir, { recursive: true });
  const opaco = join(dir, 'logotipo.png');
  const pagina = await navegador.newPage({ viewport: { width: 1024, height: 1024 } });
  await pagina.setContent(`<body style="margin:0;background:#f2ede4">${DESENHO}</body>`);
  writeFileSync(opaco, await pagina.screenshot({ type: 'png' }));
  await pagina.close();

  const medidas = await medirMarca(navegador, { logotipo: opaco });
  rmSync(dir, { recursive: true, force: true });

  const r = conferirMarca({
    ...paraARegua(medidas),
    cor: '#0F4C81',
    promptDoSimbolo: 'p',
    procedencia: { modelo: 'teste', preset: 'imagem-marca' },
    decisaoDaCor: { por: 'cliente', motivo: '' },
  });
  const m2 = r.vereditos.find((v) => v.codigo === 'M2');
  assert.equal(m2?.estado, 'reprovou');
  assert.match(m2?.motivo ?? '', /não há um pixel sequer vazado/);
});

test('PROVA: cor que some no branco reprova em M5', () => {
  // Uma peça de campanha ilegível se refaz. Um logotipo ilegível vai para a
  // fachada. E a marca ENTREGA um `logotipo-fundo-branco`: cor que não se lê
  // ali torna aquele arquivo inútil.
  const r = conferirMarca({
    pecas: null,
    distanciaEntreVersoes: null,
    cor: '#F2EDE4',
    promptDoSimbolo: 'p',
    procedencia: { modelo: 'teste', preset: 'imagem-marca' },
    decisaoDaCor: { por: 'cliente', motivo: '' },
  });
  const m5 = r.vereditos.find((v) => v.codigo === 'M5');
  assert.equal(m5?.estado, 'reprovou');
  assert.match(m5?.motivo ?? '', /sairia ilegível/);
});

test('PROVA: M5 e uma regra que DISPARA, e nao decoracao', () => {
  // A primeira versão pedia 3:1 contra branco OU contra preto, e nenhuma cor
  // perde das duas ao mesmo tempo: a conta não permite. Era uma regra que não
  // podia disparar, que é o mesmo que não existir. Este teste é o que garante
  // que ela continua tendo um lado de cada.
  const com = (cor: string) =>
    conferirMarca({
      pecas: null,
      distanciaEntreVersoes: null,
      cor,
      promptDoSimbolo: 'p',
      procedencia: { modelo: 'teste', preset: 'imagem-marca' },
      decisaoDaCor: { por: 'cliente', motivo: '' },
    }).vereditos.find((v) => v.codigo === 'M5')?.estado;

  assert.equal(com('#0F4C81'), 'passou', 'azul profundo se lê sobre branco');
  assert.equal(com('#F2EDE4'), 'reprovou', 'quase-branco não');
});
test('PROVA: sem medicao nenhuma, NADA fica verde na regua da marca', () => {
  const r = conferirMarca({
    pecas: null,
    distanciaEntreVersoes: null,
    cor: null,
    promptDoSimbolo: null,
    procedencia: null,
    decisaoDaCor: null,
  });
  const verdes = r.vereditos.filter((v) => v.estado === 'passou');
  assert.equal(verdes.length, 0, `virou verde sem medida: ${verdes.map((v) => v.codigo)}`);
  assert.equal(r.comPendencia, true);
});

test('PROVA: o Orbis escolher a cor e legitimo; escolher em SILENCIO nao e', () => {
  // Aqui escolher cor pelo cliente é o que se está pedindo. O que não pode é a
  // escolha não ter motivo escrito ao lado.
  const base = {
    pecas: null,
    distanciaEntreVersoes: null,
    cor: '#0F4C81',
    promptDoSimbolo: 'p',
    procedencia: { modelo: 'teste', preset: 'imagem-marca' },
  } as const;

  const comMotivo = conferirMarca({
    ...base,
    decisaoDaCor: {
      por: 'orbis',
      motivo: 'azul profundo: o setor usa azul e este ainda se lê sobre branco',
    },
  });
  assert.equal(comMotivo.vereditos.find((v) => v.codigo === 'M6')?.estado, 'passou');

  const emSilencio = conferirMarca({ ...base, decisaoDaCor: { por: 'orbis', motivo: '' } });
  assert.equal(emSilencio.vereditos.find((v) => v.codigo === 'M6')?.estado, 'reprovou');
});
