import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  ARQUETIPOS,
  TONS_DE_VOZ,
  conflitoDeArquetipos,
  contrasteRatio,
  derivarDiretrizes,
  derivarEscala,
  distribuirLogos,
  distribuirTokens,
  luminancia,
} from './brand.js';
import { normalizarProjectBranding } from './project.js';

test('catálogos completos: 18 tons e 12 arquétipos com descrição e exemplo', () => {
  assert.equal(TONS_DE_VOZ.length, 18);
  assert.equal(ARQUETIPOS.length, 12);
  for (const a of ARQUETIPOS) {
    assert.ok(a.descricao.length > 10 && a.exemplo.length > 5, a.id);
  }
});

test('diretrizes: combinações DIFERENTES produzem diretrizes DIFERENTES — e é determinístico', () => {
  const tecnicoSabio = derivarDiretrizes({
    tons: ['tecnico', 'direto'],
    arquetipos: ['sabio'],
    vocabularioPreferido: [],
    vocabularioEvitar: [],
  });
  const divertidoBobo = derivarDiretrizes({
    tons: ['divertido', 'proximo'],
    arquetipos: ['bobo-da-corte'],
    vocabularioPreferido: [],
    vocabularioEvitar: [],
  });
  assert.notDeepEqual(tecnicoSabio.eixos, divertidoBobo.eixos);
  assert.notDeepEqual(tecnicoSabio.orientacoes, divertidoBobo.orientacoes);
  assert.ok(tecnicoSabio.eixos.nivelTecnico > divertidoBobo.eixos.nivelTecnico);
  assert.ok(divertidoBobo.eixos.proximidade > tecnicoSabio.eixos.proximidade);

  // Determinismo byte a byte.
  const denovo = derivarDiretrizes({
    tons: ['tecnico', 'direto'],
    arquetipos: ['sabio'],
    vocabularioPreferido: [],
    vocabularioEvitar: [],
  });
  assert.deepEqual(tecnicoSabio, denovo);
});

test('o PRINCIPAL pesa mais: trocar a ordem do mesmo conjunto muda as diretrizes', () => {
  const a = derivarDiretrizes({
    tons: ['institucional', 'divertido'],
    arquetipos: [],
    vocabularioPreferido: [],
    vocabularioEvitar: [],
  });
  const b = derivarDiretrizes({
    tons: ['divertido', 'institucional'],
    arquetipos: [],
    vocabularioPreferido: [],
    vocabularioEvitar: [],
  });
  assert.notDeepEqual(a.eixos, b.eixos, 'principal invertido → eixos diferentes');
  assert.ok(a.eixos.formalidade > b.eixos.formalidade);
});

test('eixos ajustados manualmente SOBREPÕEM os derivados (transparente e editável)', () => {
  const d = derivarDiretrizes({
    tons: ['institucional'],
    arquetipos: [],
    eixos: {
      formalidade: 0,
      energia: 4,
      proximidade: 2,
      objetividade: 2,
      sofisticacao: 2,
      nivelTecnico: 2,
    },
    vocabularioPreferido: [],
    vocabularioEvitar: [],
  });
  assert.equal(d.eixos.formalidade, 0, 'o ajuste manual vence o derivado');
});

test('arquétipos em tensão geram AVISO com os nomes — nunca bloqueio', () => {
  const aviso = conflitoDeArquetipos(['inocente', 'fora-da-lei']);
  assert.ok(aviso?.includes('Inocente') && aviso.includes('Fora da lei'));
  assert.equal(conflitoDeArquetipos(['sabio', 'criador']), null);
});

test('distribuirLogos: com UM logo, todos os locais recebem — nada quebra', () => {
  const dist = distribuirLogos([{ tipo: 'principal', path: 'media/logo.png' }]);
  for (const local of ['cabecalho-claro', 'favicon', 'rodape', 'social'] as const) {
    assert.equal(dist[local]?.path, 'media/logo.png', local);
  }
});

test('distribuirLogos: variações específicas vencem nos locais certos', () => {
  const dist = distribuirLogos([
    { tipo: 'principal', path: 'p.png' },
    { tipo: 'clara', path: 'clara.png' },
    { tipo: 'escura', path: 'escura.png' },
    { tipo: 'simbolo', path: 'simbolo.png' },
    { tipo: 'favicon', path: 'fav.ico' },
  ]);
  assert.equal(dist['cabecalho-escuro']?.path, 'clara.png', 'fundo escuro pede logo clara');
  assert.equal(dist['cabecalho-claro']?.path, 'escura.png');
  assert.equal(dist['menu-mobile']?.path, 'simbolo.png');
  assert.equal(dist.favicon?.path, 'fav.ico');
  assert.equal(dist.hero?.path, 'p.png');
});

test('distribuirTokens: tema escuro e claro saem da paleta, com contraste real', () => {
  const escura = distribuirTokens({
    cores: [
      { id: 'a', nome: 'Obsidian', hex: '#0b0b0e' },
      { id: 'b', nome: 'Bone', hex: '#f5f5f4' },
      { id: 'c', nome: 'Crimson', hex: '#c62828' },
    ],
    atribuicoes: {},
  });
  assert.equal(escura.background, '#0b0b0e', 'maioria escura → fundo escuro');
  assert.equal(escura.body, '#f5f5f4');
  assert.equal(escura.primary, '#c62828');
  assert.ok(contrasteRatio(escura.background ?? '#000', escura.body ?? '#000') >= 7);
  assert.ok(escura['primary-hover'] !== escura.primary, 'hover derivado difere');
  assert.ok(contrasteRatio(escura.primary ?? '#000', escura['primary-foreground'] ?? '#000') >= 3);

  const clara = distribuirTokens({
    cores: [
      { id: 'a', nome: 'Branco', hex: '#ffffff' },
      { id: 'b', nome: 'Grafite', hex: '#1a1a1a' },
      { id: 'c', nome: 'Azul', hex: '#1d4ed8' },
      { id: 'd', nome: 'Gelo', hex: '#e8eef7' },
    ],
    atribuicoes: {},
  });
  assert.equal(clara.background, '#ffffff', 'maioria clara → fundo claro');
  assert.equal(clara.body, '#1a1a1a');
});

test('atribuição manual vence a automática; estados só entram atribuídos', () => {
  const t = distribuirTokens({
    cores: [
      { id: 'a', nome: 'Fundo', hex: '#101014' },
      { id: 'b', nome: 'Texto', hex: '#fafafa' },
      { id: 'c', nome: 'Verde', hex: '#16a34a' },
    ],
    atribuicoes: { success: 'c', primary: 'b' },
  });
  assert.equal(t.success, '#16a34a', 'success só existe porque foi atribuído');
  assert.equal(t.primary, '#fafafa', 'manual vence a automática');
  const sem = distribuirTokens({
    cores: [
      { id: 'a', nome: 'Fundo', hex: '#101014' },
      { id: 'b', nome: 'Texto', hex: '#fafafa' },
    ],
    atribuicoes: {},
  });
  assert.equal(sem.success, undefined, 'sem atribuição, não inventamos verde');
});

test('derivarEscala: H1>H2>…>H6, presets diferentes → escalas diferentes, ajuste vence', () => {
  const eq = derivarEscala({
    display: 'Sora',
    body: 'Inter',
    presetTitulos: 'equilibrada',
    presetCorpo: 'confortavel',
  });
  const tamanhos = eq.headings.map((h) => Number.parseFloat(h));
  for (let i = 1; i < tamanhos.length; i++) {
    assert.ok((tamanhos[i - 1] as number) > (tamanhos[i] as number), 'escala decrescente');
  }
  const imp = derivarEscala({
    display: 'Sora',
    body: 'Inter',
    presetTitulos: 'impactante',
    presetCorpo: 'confortavel',
  });
  assert.ok(Number.parseFloat(imp.headings[0]) > Number.parseFloat(eq.headings[0]));

  const ajustada = derivarEscala({
    display: 'Sora',
    body: 'Inter',
    presetTitulos: 'equilibrada',
    presetCorpo: 'confortavel',
    ajusteTitulos: { peso: 900, escala: 1.1 },
  });
  assert.equal(ajustada.pesoTitulos, 900);
  assert.ok(Number.parseFloat(ajustada.headings[0]) < Number.parseFloat(eq.headings[0]));
});

test('normalização de legado: tone/logoPath/palette/typography migram SEM sobrescrever o novo', () => {
  const legado = normalizarProjectBranding(
    JSON.stringify({
      brandName: 'Acme',
      tone: 'informal e direto',
      logoPath: 'media/logo-antigo.png',
      palette: {
        primary: '#c62828',
        background: '#0b0b0e',
        foreground: '#f5f5f4',
        accent: '#7c3aed',
      },
      typography: { display: 'Sora', body: 'Inter' },
      social: { instagram: 'https://instagram.com/acme' },
    }),
  );
  assert.equal(legado.identidadeVerbal?.observacao, 'informal e direto');
  assert.equal(legado.logos?.[0]?.tipo, 'principal');
  assert.equal(legado.logos?.[0]?.path, 'media/logo-antigo.png');
  assert.ok((legado.paleta?.cores.length ?? 0) >= 4);
  assert.equal(legado.paleta?.atribuicoes.primary, 'primaria');
  assert.equal(legado.tipografia?.display, 'Sora');
  assert.equal(legado.sociais?.[0]?.plataforma, 'instagram');
  // Os campos legados seguem presentes (nada é destruído).
  assert.equal(legado.tone, 'informal e direto');
  assert.equal(legado.logoPath, 'media/logo-antigo.png');

  // Campo novo já preenchido NÃO é sobrescrito pelo legado.
  const misto = normalizarProjectBranding(
    JSON.stringify({
      tone: 'legado',
      identidadeVerbal: {
        tons: ['direto'],
        arquetipos: [],
        vocabularioPreferido: [],
        vocabularioEvitar: [],
        observacao: 'novo',
      },
      palette: { primary: '#c62828', background: '#0b0b0e', foreground: '#f5f5f4' },
      typography: { display: 'Sora', body: 'Inter' },
    }),
  );
  assert.equal(misto.identidadeVerbal?.observacao, 'novo');
});

test('luminancia e contrasteRatio: sanidade WCAG', () => {
  assert.ok(luminancia('#ffffff') > 0.99);
  assert.ok(luminancia('#000000') < 0.01);
  assert.ok(Math.abs(contrasteRatio('#000000', '#ffffff') - 21) < 0.1);
  assert.ok(Math.abs(contrasteRatio('#777777', '#777777') - 1) < 0.01);
});

/**
 * O token de LINK nasce legível — porque link que não se lê não é link.
 *
 * Medido no site do clube: a primária é o azul do escudo (`#0050c4`) e o fundo
 * é o marinho do app (`#0b1530`). `link` era a primária crua, dando 2,5:1, e
 * **19 dos 27 trechos reprovados na conferência eram `<a>`** — o menu inteiro,
 * o rodapé inteiro e os contatos.
 *
 * O que o teste trava: `link` passa do piso sobre a página E sobre as duas
 * superfícies dela, sem mexer em `primary`, que continua a cor do dono.
 */
test('link nasce legível sobre a página e as superfícies; primary fica intacta', () => {
  const t = distribuirTokens({
    cores: [
      { id: 'a', nome: 'Marinho', hex: '#0b1530' },
      { id: 'b', nome: 'Azul do escudo', hex: '#0050c4' },
      { id: 'c', nome: 'Branco', hex: '#ffffff' },
    ],
    atribuicoes: {},
  });
  const fundo = t.background as string;
  assert.equal(t.primary, '#0050c4', 'a primária é a cor do dono, crua');
  for (const chao of [t.background, t.surface, t['surface-elevated']] as string[]) {
    assert.ok(
      contrasteRatio(t.link as string, chao) >= 3,
      `link ${t.link} não se lê sobre ${chao}`,
    );
  }
  // Matiz preservado: o link continua sendo o azul da marca, só que legível.
  assert.notEqual(t.link, t.primary);
  assert.ok(luminancia(t.link as string) > luminancia(fundo), 'clareou, porque o fundo é escuro');
});

test('paleta que já se lê não é mexida: link continua a primária', () => {
  // Tema CLARO de verdade (maioria das cores clara), com uma primária escura
  // que já passa do piso sobre o branco: não há defeito para consertar.
  const t = distribuirTokens({
    cores: [
      { id: 'a', nome: 'Branco', hex: '#ffffff' },
      { id: 'b', nome: 'Azul', hex: '#1746a2' },
      { id: 'c', nome: 'Marinho', hex: '#10245c' },
      { id: 'd', nome: 'Cinza claro', hex: '#f7f7f7' },
    ],
    atribuicoes: {},
  });
  assert.equal(t.primary, '#1746a2');
  assert.equal(t.link, t.primary, 'sem defeito para consertar, nada é ajustado');
});

/**
 * A correção do link vale TAMBÉM sobre atribuição manual — e é a única que vale.
 *
 * É exatamente o caso do clube: a marca atribuiu `link → principal` na mão, e
 * `principal` é o azul do escudo sobre o marinho do app. `link` é o único token
 * cuja função inteira é ser texto, então escolher a cor dele é escolher a
 * identidade do link, não escolher que ele suma.
 */
test('link atribuído À MÃO também é conferido; os outros tokens manuais não', () => {
  const t = distribuirTokens({
    cores: [
      { id: 'fundo', nome: 'Marinho', hex: '#0b1530' },
      { id: 'superficie', nome: 'Superfície', hex: '#16244a' },
      { id: 'titulo', nome: 'Branco', hex: '#ffffff' },
      { id: 'principal', nome: 'Azul do escudo', hex: '#0050c4' },
    ],
    atribuicoes: {
      background: 'fundo',
      surface: 'superficie',
      heading: 'titulo',
      primary: 'principal',
      link: 'principal',
    },
  });
  assert.equal(t.primary, '#0050c4', 'primary manual é respeitada crua: ali a cor preenche');
  assert.equal(t.surface, '#16244a', 'os outros tokens manuais não são tocados');
  assert.notEqual(t.link, '#0050c4', 'o link manual foi levado até o piso');
  for (const chao of ['#0b1530', '#16244a']) {
    assert.ok(contrasteRatio(t.link as string, chao) >= 3, `link não se lê sobre ${chao}`);
  }
});
