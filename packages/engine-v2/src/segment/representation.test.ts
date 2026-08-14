import assert from 'node:assert/strict';
import { test } from 'node:test';
import { type EvidenciaRepresentacao, classificarRepresentacao } from './representation.js';

const ev = (over: Partial<EvidenciaRepresentacao> = {}): EvidenciaRepresentacao => ({
  runtimes: [],
  midias: [],
  assetsLocais: true,
  assetsExternos: 0,
  scriptsNaoLocalizados: 0,
  iframeCrossOrigin: false,
  shadowFechado: false,
  estadosCapturados: 0,
  movimentoMedido: false,
  movimentoPorCss: false,
  reageAoPonteiro: false,
  regiaoReativaSemDom: false,
  dependeDeJs: false,
  bootstrapIdentificado: false,
  ...over,
});

test('HTML/CSS puro é componente portátil e editável', () => {
  const d = classificarRepresentacao(ev());
  assert.equal(d.type, 'componente-portatil');
  assert.equal(d.editable, true);
  assert.equal(d.renderMode, 'html');
});

test('WebGL com scripts e assets em disco vira cápsula de runtime — não card preto', () => {
  const d = classificarRepresentacao(
    ev({
      runtimes: ['three'],
      midias: ['webgl'],
      bootstrapIdentificado: true,
      dependeDeJs: true,
      movimentoMedido: true,
    }),
  );
  assert.equal(d.type, 'capsula-runtime');
  assert.equal(d.editable, false, 'cápsula não é editável como componente');
  assert.equal(d.renderMode, 'webgl');
  assert.ok(d.rejected.some((r) => r.type === 'componente-portatil'));
});

test('WebGL sem o script em mãos cai para referência visual, dizendo por quê', () => {
  const d = classificarRepresentacao(
    ev({
      runtimes: ['three'],
      midias: ['webgl'],
      scriptsNaoLocalizados: 2,
      bootstrapIdentificado: true,
      dependeDeJs: true,
    }),
  );
  assert.equal(d.type, 'referencia-visual');
  assert.equal(d.editable, false);
  assert.ok(
    d.reasons.some((r) => /script/i.test(r)),
    `motivos: ${d.reasons.join(' | ')}`,
  );
});

test('WebGL sem inicialização identificada não é encapsulado', () => {
  const d = classificarRepresentacao(
    ev({
      runtimes: ['webgl-cru'],
      midias: ['webgl'],
      bootstrapIdentificado: false,
      dependeDeJs: true,
    }),
  );
  assert.equal(d.type, 'referencia-visual');
  assert.ok(d.reasons.some((r) => /inicializa/i.test(r)));
});

test('Lottie com player e JSON locais é cápsula', () => {
  const d = classificarRepresentacao(
    ev({
      runtimes: ['lottie'],
      midias: ['lottie'],
      bootstrapIdentificado: true,
      dependeDeJs: true,
    }),
  );
  assert.equal(d.type, 'capsula-runtime');
  assert.equal(d.renderMode, 'lottie');
});

test('iframe cross-origin nunca é portátil nem cápsula', () => {
  const d = classificarRepresentacao(ev({ iframeCrossOrigin: true }));
  assert.equal(d.type, 'referencia-visual');
  assert.equal(d.confidence, 'alta');
  assert.equal(d.rejected.length, 2);
  assert.ok(d.limitations.some((l) => /outra origem/i.test(l)));
});

test('Shadow DOM fechado vira referência visual, com a limitação declarada', () => {
  const d = classificarRepresentacao(ev({ shadowFechado: true }));
  assert.equal(d.type, 'referencia-visual');
  assert.ok(d.limitations.some((l) => /fechado/i.test(l)));
});

test('runtime que controla a PÁGINA não arrasta o site para dentro da cápsula', () => {
  const d = classificarRepresentacao(
    ev({
      runtimes: ['lenis', 'scrolltrigger'],
      dependeDeJs: true,
      movimentoMedido: true,
      movimentoPorCss: true,
    }),
  );
  assert.notEqual(d.type, 'capsula-runtime');
  assert.ok(
    d.limitations.some((l) => /p[áa]gina inteira/i.test(l)),
    `limitações: ${d.limitations.join(' | ')}`,
  );
});

test('vídeo com arquivo local é portátil — vídeo é só HTML', () => {
  const d = classificarRepresentacao(ev({ midias: ['video'], assetsLocais: true }));
  assert.equal(d.type, 'componente-portatil');
  assert.equal(d.renderMode, 'video');
  assert.equal(d.editable, true);
});

test('vídeo ainda na origem continua portátil, mas com a limitação de asset', () => {
  const d = classificarRepresentacao(
    ev({ midias: ['video'], assetsLocais: false, assetsExternos: 1 }),
  );
  assert.equal(d.type, 'componente-portatil');
  assert.ok(d.limitations.some((l) => /origem/i.test(l)));
});

test('GIF e WebP animado local são portáteis', () => {
  for (const m of ['gif', 'webp-animado', 'avif-animado'] as const) {
    const d = classificarRepresentacao(ev({ midias: [m] }));
    assert.equal(d.type, 'componente-portatil', `${m} deveria ser portátil`);
  }
});

test('SVG animado por SMIL é portátil (roda por inclusão)', () => {
  const d = classificarRepresentacao(
    ev({ midias: ['svg-animado'], movimentoMedido: true, movimentoPorCss: true }),
  );
  assert.equal(d.type, 'componente-portatil');
  assert.equal(d.renderMode, 'svg-animado');
});

test('movimento de JS sem estado capturado não se passa por portátil', () => {
  const d = classificarRepresentacao(
    ev({ movimentoMedido: true, movimentoPorCss: false, dependeDeJs: true, estadosCapturados: 0 }),
  );
  assert.equal(d.type, 'referencia-visual');
  assert.ok(d.limitations.some((l) => /mecanismo n[ãa]o foi reproduzido/i.test(l)));
});

test('movimento de JS COM estado capturado volta a ser portátil', () => {
  const d = classificarRepresentacao(
    ev({ movimentoMedido: true, dependeDeJs: true, estadosCapturados: 3 }),
  );
  assert.equal(d.type, 'componente-portatil');
  assert.equal(d.confidence, 'alta');
});

test('região reativa sem DOM exige runtime e registra a limitação certa', () => {
  const d = classificarRepresentacao(
    ev({
      regiaoReativaSemDom: true,
      runtimes: ['canvas-2d'],
      midias: ['canvas-2d'],
      bootstrapIdentificado: true,
      dependeDeJs: true,
      reageAoPonteiro: true,
    }),
  );
  assert.equal(d.type, 'capsula-runtime');
  assert.ok(
    d.limitations.some((l) => /sem elemento DOM/i.test(l)),
    'a cena reage, mas não há botão — isso precisa estar dito',
  );
});

test('toda decisão traz motivo — nada é escolhido por omissão', () => {
  const casos = [
    ev(),
    ev({ runtimes: ['three'], midias: ['webgl'], bootstrapIdentificado: true }),
    ev({ iframeCrossOrigin: true }),
    ev({ shadowFechado: true }),
    ev({ midias: ['video'], assetsLocais: false, assetsExternos: 2 }),
  ];
  for (const c of casos) {
    const d = classificarRepresentacao(c);
    assert.ok(d.reasons.length > 0, 'decisão sem motivo');
  }
});

// ── Runtimes que DESENHAM ────────────────────────────────────────────────────
// O caso que originou esta família de testes: uma seção com três cards de ícone
// era classificada como portátil, e abria com três caixas vazias. A página tem
// zero <svg> inline e 23 <iconify-icon> — o desenho vinha todo de um script.

test('ícone que ficou como casca torna o item cápsula, não portátil', () => {
  const d = classificarRepresentacao(ev({ runtimes: ['iconify'], iconesNaoDesenhados: 23 }));
  assert.equal(d.type, 'capsula-runtime');
  assert.equal(d.editable, false);
  assert.ok(
    d.rejected.some((r) => r.type === 'componente-portatil'),
    'a rejeição de portátil precisa estar registrada, não subentendida',
  );
  assert.ok(
    d.limitations.some((l) => l.includes('23')),
    'a limitação diz QUANTOS ícones ficaram pendentes',
  );
});

test('ícone trazido para inline devolve o item a portátil: o runtime não faz mais falta', () => {
  const d = classificarRepresentacao(
    ev({ runtimes: ['iconify'], iconesNaoDesenhados: 0, iconesInline: 23 }),
  );
  assert.equal(d.type, 'componente-portatil');
  assert.equal(d.editable, true);
  assert.ok(d.reasons.some((r) => r.includes('23')));
});

test('Tailwind por CDN sem o CSS capturado é cápsula: as classes ficariam sem estilo', () => {
  const d = classificarRepresentacao(
    ev({ runtimes: ['tailwind-cdn'], cssCompiladoCapturado: false }),
  );
  assert.equal(d.type, 'capsula-runtime');
  assert.ok(d.limitations.some((l) => l.includes('utilitárias')));
});

test('Tailwind por CDN com o CSS capturado do CSSOM não impede portátil', () => {
  const d = classificarRepresentacao(
    ev({ runtimes: ['tailwind-cdn'], cssCompiladoCapturado: true }),
  );
  assert.equal(d.type, 'componente-portatil');
});

test('fundo desenhado em canvas é dependência declarada, com o que ele desenha por extenso', () => {
  // A peça que TEM o canvas depende dele de verdade. A que só o tem atrás, não
  // — ver "fundo-canvas sem canvas na peça" mais abaixo, que é o caso que este
  // teste afirmava por engano antes de o acervo mostrar o contrário.
  const d = classificarRepresentacao(ev({ runtimes: ['fundo-canvas'], midias: ['webgl'] }));
  // Não é portátil: com o canvas dentro, o HTML sozinho não reproduz o que se
  // vê. Qual das duas formas não-portáteis sai daqui depende de dar para
  // encapsular — sem bootstrap identificado, é referência visual, e isso é a
  // resposta honesta.
  assert.notEqual(d.type, 'componente-portatil');
  assert.equal(d.editable, false);
  assert.ok(d.limitations.some((l) => l.includes('o fundo da página')));
});

test('a dependência de rede é dita: o runtime vem do endereço original', () => {
  const d = classificarRepresentacao(ev({ runtimes: ['iconify'], iconesNaoDesenhados: 1 }));
  assert.ok(d.limitations.some((l) => l.toLowerCase().includes('rede')));
});

test('barreira maior vence: iframe cross-origin continua sendo referência visual', () => {
  const d = classificarRepresentacao(
    ev({ runtimes: ['iconify'], iconesNaoDesenhados: 5, iframeCrossOrigin: true }),
  );
  assert.equal(d.type, 'referencia-visual');
});

test('runtime que desenha não é contado como runtime de cena', () => {
  // Sem esta separação, `iconify` cairia no ramo de cena e seria testado contra
  // ENCAPSULAVEIS/bootstrap — e sairia como referência visual, que é pior ainda:
  // trocaria um componente legível por uma imagem.
  const d = classificarRepresentacao(ev({ runtimes: ['iconify'], iconesNaoDesenhados: 2 }));
  assert.equal(d.type, 'capsula-runtime');
  assert.notEqual(d.type, 'referencia-visual');
});

// ── O fundo da página que passa por baixo ────────────────────────────────────
//
// Defeito medido no acervo, e o mais caro dos encontrados até aqui: das 12
// peças de uma captura, SETE viraram `capsula-runtime` por causa de um único
// canvas de fundo. Ele é `position: fixed` e cobre a página inteira, então o
// motor o associa a toda seção que ele atravessa — corretamente, porque para
// desenhar aquela dobra ele conta.
//
// O preço era alto e silencioso: cápsula significa `editable: false`, prévia da
// PÁGINA INTEIRA no lugar da peça, e o print da dobra com a logo da outra
// empresa dentro. Seis peças de HTML perfeitamente portátil ficavam assim.

test('fundo-canvas sem canvas na peça é LIMITAÇÃO, não rebaixamento', () => {
  const d = classificarRepresentacao(
    ev({ runtimes: ['fundo-canvas'], midias: ['imagem', 'svg-estatico'] }),
  );
  assert.equal(d.type, 'componente-portatil');
  assert.equal(d.editable, true);
  // E a perda é DITA: a peça sai sem o fundo animado, e quem lê fica sabendo.
  assert.ok(
    d.limitations.some((l) => /fundo animado da página não vem junto/.test(l)),
    `não declarou a perda: ${d.limitations.join(' | ')}`,
  );
});

test('a peça que É o fundo continua cápsula', () => {
  // O contrapeso do teste acima. Quem tem canvas próprio depende do runtime de
  // verdade: ali o HTML sozinho não reproduz nada, e chamar de portátil seria
  // prometer o que não se entrega.
  const d = classificarRepresentacao(
    ev({
      runtimes: ['fundo-canvas', 'webgl-cru'],
      midias: ['webgl'],
      bootstrapIdentificado: true,
      assetsLocais: true,
    }),
  );
  assert.notEqual(d.type, 'componente-portatil');
  assert.equal(d.editable, false);
});

test('os outros runtimes que desenham continuam pesando', () => {
  // A correção é sobre o FUNDO da página, que passa por baixo. Iconify desenha
  // DENTRO da peça: um ícone que não veio é um buraco no conteúdo dela.
  const d = classificarRepresentacao(
    ev({ runtimes: ['iconify'], midias: ['imagem'], iconesNaoDesenhados: 3 }),
  );
  assert.notEqual(d.type, 'componente-portatil');
});

test('movimento que é da PÁGINA não condena a peça a virar foto', () => {
  // O caso medido: o cartão de gráfico do cogni. Oito observações temporais,
  // todas com `domStable: true` e "pintura fora do DOM" — era o canvas de
  // página inteira pintando ATRÁS. A observação foi atribuída à seção porque
  // ela ocupa 60% da dobra. O cartão virou PNG por causa do fundo de outro, e o
  // bundle anterior da mesma seção era portátil e trazia o gráfico inteiro.
  const comum = {
    movimentoMedido: true,
    movimentoPorCss: false,
    dependeDeJs: true,
    estadosCapturados: 0,
  } as const;

  const semDistincao = classificarRepresentacao(ev(comum));
  assert.equal(
    semDistincao.type,
    'referencia-visual',
    'sem a distinção, congela — e deve congelar',
  );

  const comDistincao = classificarRepresentacao(ev({ ...comum, movimentoEhDaPagina: true }));
  assert.equal(comDistincao.type, 'componente-portatil', 'o DOM e o CSS reproduzem a peça');
  assert.ok(comDistincao.editable, 'e ela volta a ser editável');
});

test('movimento PRÓPRIO e inexplicado continua virando referência visual', () => {
  // O outro lado da régua: a regra existe para o caso honesto, e ele continua
  // valendo. Aqui o DOM se mexeu de verdade e ninguém sabe reproduzir.
  const r = classificarRepresentacao(
    ev({
      movimentoMedido: true,
      movimentoPorCss: false,
      movimentoEhDaPagina: false,
      dependeDeJs: true,
      estadosCapturados: 0,
    }),
  );
  assert.equal(r.type, 'referencia-visual');
  assert.ok(
    r.reasons.some((x) => x.includes('a reprodução não é garantida')),
    'e o motivo continua dito',
  );
});
