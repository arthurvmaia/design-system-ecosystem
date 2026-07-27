import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { derivarContrato, lerOuDerivarContrato } from './contract.js';
import { CONTRACT_VERSION, ComponentContract } from './schemas/component-contract.js';

/**
 * Fixtures REAIS na forma que o compilador V2 produz: um hero com vídeo de
 * fundo (o caso canônico do de-para de mídia) e um bundle V1 legado
 * (raw.html + styles.css, sem manifest). Nada aqui depende de rede ou de
 * captura ao vivo — a derivação é pura e determinística.
 */

const HERO_VIDEO_HTML = `
<section class="hero hero--video">
  <video src="https://origem.example/media/bg.mp4" poster="https://origem.example/media/poster.jpg" autoplay loop muted playsinline width="1920" height="1080"></video>
  <div class="hero__conteudo">
    <p class="hero__eyebrow">Plataforma completa</p>
    <h1 class="hero__titulo">Construa produtos com confiança</h1>
    <p class="hero__sub">Da ideia ao lançamento em semanas, não meses. Ferramentas para todo o ciclo.</p>
    <a class="btn btn--primario" href="https://origem.example/signup">Começar agora</a>
    <a class="hero__link" href="https://origem.example/docs">Documentação</a>
  </div>
</section>
`;

const HERO_VIDEO_CSS = {
  'assets/css/tokens.css': `:root{--brand-primary:#7c3aed;--brand-bg:#0b0b0e;--texto:#f5f5f4;--fonte-display:"Clash Display",sans-serif}`,
  'assets/css/layout.css':
    '.hero{position:relative;min-height:100vh}.hero video{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}',
  'assets/css/components.css': `.btn--primario{background:var(--brand-primary);color:#fff}.hero__titulo{font-family:var(--fonte-display)}body{font-family:Inter,sans-serif;color:var(--texto)}h1{font-family:"Clash Display",sans-serif}`,
  'assets/css/animations.css':
    '@keyframes subir{from{opacity:0;transform:translateY(24px)}to{opacity:1;transform:none}}.hero__conteudo{animation:subir .8s ease-out}',
};

const CARDS_HTML = `
<section class="planos">
  <h2>Planos para cada fase</h2>
  <div class="grade">
    <article class="card"><h3>Início</h3><p>Para experimentar sem custo.</p><a class="btn" href="/a">Assinar</a></article>
    <article class="card"><h3>Pro</h3><p>Para times em crescimento.</p><a class="btn" href="/b">Assinar</a></article>
    <article class="card"><h3>Escala</h3><p>Para operações grandes.</p><a class="btn" href="/c">Assinar</a></article>
    <article class="card"><h3>Enterprise</h3><p>Sob medida, com suporte.</p><a class="btn" href="/d">Assinar</a></article>
  </div>
</section>
`;

test('hero com vídeo de fundo: slots, exibição e obrigatoriedade derivados do original', () => {
  const contrato = derivarContrato({
    html: HERO_VIDEO_HTML,
    css: HERO_VIDEO_CSS,
    jsFiles: ['assets/js/animations.js'],
    assets: [
      {
        originalUrl: 'https://origem.example/media/bg.mp4',
        localPath: 'video/abc123.mp4',
        kind: 'video',
      },
    ],
    origem: 'bundle-v2',
  });

  // Schema fecha e a versão é a corrente.
  ComponentContract.parse(contrato);
  assert.equal(contrato.contractVersion, CONTRACT_VERSION);

  // O vídeo de fundo: propriedades de exibição MEDIDAS do original.
  const video = contrato.slots.midias.find((m) => m.tipo === 'video');
  assert.ok(video, 'slot de vídeo existe');
  assert.equal(video.exibicao.autoplay, true);
  assert.equal(video.exibicao.loop, true);
  assert.equal(video.exibicao.muted, true);
  assert.equal(video.exibicao.posterUrl, 'https://origem.example/media/poster.jpg');
  assert.ok(Math.abs((video.exibicao.proporcao ?? 0) - 16 / 9) < 0.01, 'proporção ~16:9');
  assert.equal(video.obrigatorio, true, 'vídeo autoplay+muted é o fundo da dobra');
  assert.equal(video.localPath, 'video/abc123.mp4', 'ponte para o asset local via manifest');

  // Textos com papel e medida.
  const titulo = contrato.slots.textos.find((t) => t.papel === 'titulo');
  assert.ok(titulo);
  assert.equal(titulo.textoOriginal, 'Construa produtos com confiança');
  assert.ok(titulo.maxSugerido >= titulo.comprimento);
  const eyebrow = contrato.slots.textos.find((t) => t.papel === 'eyebrow');
  assert.ok(eyebrow, 'texto curto antes do título vira eyebrow');
  assert.equal(eyebrow.textoOriginal, 'Plataforma completa');

  // Links: CTA distinguido de navegação comum; textos de link NÃO duplicam slot.
  const cta = contrato.slots.links.find((l) => l.ehCta);
  assert.ok(cta);
  assert.equal(cta.label, 'Começar agora');
  assert.ok(
    !contrato.slots.textos.some((t) => t.textoOriginal === 'Começar agora'),
    'rótulo de link não vira slot de texto',
  );

  // Tokens tematizáveis: cores das custom properties + fonte display/body.
  const primary = contrato.tokens.cores.find((c) => c.varName === '--brand-primary');
  assert.ok(primary);
  assert.equal(primary.papelSugerido, 'primary');
  const display = contrato.tokens.fontes.find((f) => f.familia === 'Clash Display');
  assert.ok(display);
  assert.equal(display.papelSugerido, 'display');
  const body = contrato.tokens.fontes.find((f) => f.familia === 'Inter');
  assert.ok(body);
  assert.equal(body.papelSugerido, 'body');

  // Esqueleto declara animação presente; contrato de conteúdo coerente.
  assert.equal(contrato.esqueleto.temAnimacoes, true);
  assert.equal(contrato.conteudo.aceitaTitulo, true);
  assert.equal(contrato.conteudo.aceitaCta, true);
  assert.equal(contrato.conteudo.aceitaMidia, true);
});

test('grupo repetido: contagem medida e slots do item-modelo ligados', () => {
  const contrato = derivarContrato({
    html: CARDS_HTML,
    css: { 'styles.css': '.card{border:1px solid #333}' },
    origem: 'bundle-v2',
  });
  const grupo = contrato.slots.grupos[0];
  assert.ok(grupo, 'grade de 4 cards vira grupo');
  assert.equal(grupo.contagemOriginal, 4);
  assert.ok(grupo.minItens >= 1 && grupo.maxItens >= 4);
  assert.ok(grupo.slotsDoItem.length > 0, 'slots do item-modelo ligados ao grupo');
  assert.ok(contrato.conteudo.grupos[grupo.id], 'grupo entra no contrato de conteúdo');
});

test('determinismo: a mesma entrada produz o MESMO contrato, byte a byte', () => {
  const entrada = {
    html: HERO_VIDEO_HTML,
    css: HERO_VIDEO_CSS,
    jsFiles: ['assets/js/animations.js'],
    origem: 'bundle-v2' as const,
  };
  const a = JSON.stringify(derivarContrato(entrada));
  const b = JSON.stringify(derivarContrato(entrada));
  assert.equal(a, b);
});

test('background-image no CSS vira slot com o seletor CSS dono do fundo', () => {
  const contrato = derivarContrato({
    html: '<section class="capa"><h2>Sobre nós</h2></section>',
    css: {
      'styles.css':
        '.capa{background:linear-gradient(rgba(0,0,0,.6),rgba(0,0,0,.6)),url("https://origem.example/capa.jpg") center/cover}',
    },
    origem: 'bundle-legado',
  });
  const bg = contrato.slots.midias.find((m) => m.tipo === 'background-image');
  assert.ok(bg);
  assert.equal(bg.seletor, '.capa');
  assert.equal(bg.urlOriginal, 'https://origem.example/capa.jpg');
  assert.equal(bg.exibicao.overlay, true, 'gradiente sobre a url = overlay medido');
});

test('bundle V1 legado (raw.html + styles.css, sem manifest): deriva sob demanda', () => {
  const dir = mkdtempSync(join(tmpdir(), 'contrato-v1-'));
  try {
    writeFileSync(
      join(dir, 'raw.html'),
      '<div class="cta-final"><h2>Pronto para começar?</h2><a class="botao-cta" href="/x">Fale conosco</a></div>',
      'utf8',
    );
    writeFileSync(
      join(dir, 'styles.css'),
      '.cta-final{background:#111}.botao-cta{color:#fff}',
      'utf8',
    );
    const contrato = lerOuDerivarContrato(dir);
    assert.ok(contrato, 'legado sem manifest deriva do que existe');
    assert.equal(contrato.derivadoDe, 'bundle-legado');
    assert.ok(contrato.slots.textos.some((t) => t.papel === 'titulo'));
    assert.ok(contrato.slots.links.some((l) => l.ehCta));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('manifest com contract na versão corrente é usado como está; versão antiga re-deriva', () => {
  const dir = mkdtempSync(join(tmpdir(), 'contrato-v2-'));
  try {
    writeFileSync(
      join(dir, 'index.html'),
      '<html><body><h2>Título novo</h2></body></html>',
      'utf8',
    );
    const gravado = derivarContrato({
      html: '<h2>Título gravado</h2>',
      css: {},
      origem: 'bundle-v2',
    });
    writeFileSync(
      join(dir, 'manifest.json'),
      JSON.stringify({ contract: gravado, dependencies: { assets: [] } }),
      'utf8',
    );
    const lido = lerOuDerivarContrato(dir);
    assert.ok(lido);
    assert.equal(lido.slots.textos[0]?.textoOriginal, 'Título gravado', 'usa o gravado');

    // Versão antiga: re-deriva do HTML em disco em vez de confiar no gravado.
    writeFileSync(
      join(dir, 'manifest.json'),
      JSON.stringify({ contract: { ...gravado, contractVersion: 0 } }),
      'utf8',
    );
    const rederivado = lerOuDerivarContrato(dir);
    assert.ok(rederivado);
    assert.equal(rederivado.slots.textos[0]?.textoOriginal, 'Título novo', 're-deriva o defasado');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('manifest antigo SEM contract continua válido: derivação não exige o campo', () => {
  const dir = mkdtempSync(join(tmpdir(), 'contrato-sem-'));
  try {
    mkdirSync(join(dir, 'assets', 'css'), { recursive: true });
    writeFileSync(
      join(dir, 'index.html'),
      '<html><body><p>Um bloco de texto real.</p></body></html>',
      'utf8',
    );
    writeFileSync(join(dir, 'assets', 'css', 'tokens.css'), ':root{--cor:#123456}', 'utf8');
    writeFileSync(join(dir, 'manifest.json'), JSON.stringify({ compilerVersion: 1 }), 'utf8');
    const contrato = lerOuDerivarContrato(dir);
    assert.ok(contrato);
    assert.equal(contrato.derivadoDe, 'bundle-v2');
    assert.ok(contrato.tokens.cores.some((c) => c.varName === '--cor'));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
