import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  DEFAULT_PROJECT_BRANDING,
  LocalDeLogo,
  PresetDeCorpo,
  PresetDeTitulos,
  TOKENS_SEMANTICOS,
  TipoDeLogo,
} from '@ds/shared/schemas';
import { STATUS_LABEL, type SecaoStatus, marcaSectionStatus } from './generator-sections.js';
import {
  ROTULO_EIXO,
  ROTULO_LOCAL_DE_LOGO,
  ROTULO_PRESET_CORPO,
  ROTULO_PRESET_TITULOS,
  ROTULO_TIPO_DE_LOGO,
  ROTULO_TOKEN,
} from './marca-rotulos.js';

test('marca sem nome → não iniciado; com nome → configurado com resumo', () => {
  assert.equal(marcaSectionStatus({}).marca.status, 'nao-iniciado');
  const comNome = marcaSectionStatus({ brandName: 'Alche' });
  assert.equal(comNome.marca.status, 'configurado');
  assert.equal(comNome.marca.resumo, 'Alche');
});

test('paleta com 3+ cores → configurado', () => {
  const s = marcaSectionStatus({ primary: '#c62828', background: '#fff', foreground: '#000' });
  assert.equal(s.paleta.status, 'configurado');
  assert.match(s.paleta.resumo, /cores/);
});

test('tipografia mostra as duas famílias no resumo', () => {
  const s = marcaSectionStatus({ fontDisplay: 'Playfair Display', fontBody: 'Inter' });
  assert.equal(s.tipografia.status, 'configurado');
  assert.equal(s.tipografia.resumo, 'Playfair Display + Inter');
});

test('redes é opcional quando vazio, configurado quando há canais', () => {
  assert.equal(marcaSectionStatus({}).redes.status, 'opcional');
  const s = marcaSectionStatus({ social: { instagram: 'https://x', linkedin: 'https://y' } });
  assert.equal(s.redes.status, 'configurado');
  assert.equal(s.redes.resumo, '2 canais');
});

// ── A5: vocabulários novos e campos ricos ────────────────────────────────────

test('todo vocabulário do shared tem rótulo pt-BR (id técnico nunca vaza na tela)', () => {
  for (const t of TipoDeLogo.options) assert.ok(ROTULO_TIPO_DE_LOGO[t], `tipo de logo: ${t}`);
  for (const l of LocalDeLogo.options) assert.ok(ROTULO_LOCAL_DE_LOGO[l], `local: ${l}`);
  for (const tk of TOKENS_SEMANTICOS) assert.ok(ROTULO_TOKEN[tk], `token: ${tk}`);
  for (const p of PresetDeTitulos.options) assert.ok(ROTULO_PRESET_TITULOS[p], `preset: ${p}`);
  for (const p of PresetDeCorpo.options) assert.ok(ROTULO_PRESET_CORPO[p], `preset corpo: ${p}`);
  for (const eixo of [
    'formalidade',
    'energia',
    'proximidade',
    'objetividade',
    'sofisticacao',
    'nivelTecnico',
  ] as const) {
    assert.ok(ROTULO_EIXO[eixo], `eixo: ${eixo}`);
  }
});

test('status da Marca: campos novos enriquecem o resumo e vencem o legado', () => {
  const s = marcaSectionStatus({
    brandName: 'Acme',
    logos: [{ tipo: 'principal' }, { tipo: 'clara' }],
    identidadeVerbal: { tons: ['direto'], arquetipos: ['sabio'] },
    paleta: { cores: [{}, {}, {}, {}, {}] },
    social: { instagram: 'https://instagram.com/acme' },
    sociais: [
      { url: 'https://instagram.com/acme', visivel: true },
      { url: 'https://x.com/acme', visivel: false },
      { url: '', visivel: true },
    ],
  });
  assert.equal(s.marca.resumo, 'Acme · 2 logos');
  assert.equal(s.voz.status, 'configurado');
  assert.equal(s.voz.resumo, 'Direto · Sábio');
  assert.equal(s.paleta.resumo, '5 cores definidas');
  assert.equal(s.redes.resumo, '1 canal', 'oculta e vazia não contam');
});

test('status da voz: observação sozinha (tom legado migrado) já configura', () => {
  const s = marcaSectionStatus({
    identidadeVerbal: { tons: [], arquetipos: [], observacao: 'direto e confiante' },
  });
  assert.equal(s.voz.status, 'configurado');
  assert.equal(s.voz.resumo, 'direto e confiante');
});

// ── O default de fábrica não é escolha da pessoa ─────────────────────────────

test('paleta intocada pelo wizard é `padrao`, não `configurado`', () => {
  // Exatamente o que Wizard.tsx semeia quando o projeto nasce.
  const s = marcaSectionStatus({
    paleta: {
      cores: [
        { id: 'primaria', nome: 'Primária', hex: DEFAULT_PROJECT_BRANDING.palette.primary },
        { id: 'fundo', nome: 'Fundo', hex: DEFAULT_PROJECT_BRANDING.palette.background },
        { id: 'texto', nome: 'Texto', hex: DEFAULT_PROJECT_BRANDING.palette.foreground },
      ],
    },
  });
  assert.equal(s.paleta.status, 'padrao', 'três cores de fábrica não são três cores escolhidas');
});

test('trocar uma cor de fábrica já tira a paleta do padrão', () => {
  const s = marcaSectionStatus({
    paleta: {
      cores: [
        { id: 'primaria', nome: 'Primária', hex: '#c62828' },
        { id: 'fundo', nome: 'Fundo', hex: DEFAULT_PROJECT_BRANDING.palette.background },
        { id: 'texto', nome: 'Texto', hex: DEFAULT_PROJECT_BRANDING.palette.foreground },
      ],
    },
  });
  assert.equal(s.paleta.status, 'configurado');
});

test('tipografia no Inter+Inter de fábrica é `padrao`', () => {
  const s = marcaSectionStatus({
    fontDisplay: DEFAULT_PROJECT_BRANDING.typography.display,
    fontBody: DEFAULT_PROJECT_BRANDING.typography.body,
  });
  assert.equal(s.tipografia.status, 'padrao');
  assert.match(s.tipografia.resumo, /Inter \+ Inter/);
});

// ── Meio caminho tem nome próprio ────────────────────────────────────────────

test('uma fonte só, ou poucas cores, é `parcial` e diz o que falta', () => {
  const semCorpo = marcaSectionStatus({ fontDisplay: 'Playfair Display' });
  assert.equal(semCorpo.tipografia.status, 'parcial');
  assert.match(semCorpo.tipografia.resumo, /corpo/);

  const duasCores = marcaSectionStatus({ primary: '#c62828', background: '#eeeeee' });
  assert.equal(duasCores.paleta.status, 'parcial');
  assert.equal(duasCores.paleta.resumo, '2 de 3 cores');
});

test('chamada sem canal, e canal sem chamada, são os dois `parcial`', () => {
  const soCta = marcaSectionStatus({ mainCta: { label: 'Fale comigo', href: '#' } });
  assert.equal(soCta.contato.status, 'parcial');
  assert.match(soCta.contato.resumo, /sem canal/);

  const soCanal = marcaSectionStatus({
    contact: { email: 'a@b.c', phone: '', whatsapp: '', address: '' },
  });
  assert.equal(soCanal.contato.status, 'parcial');
  assert.match(soCanal.contato.resumo, /sem chamada/);

  const ambos = marcaSectionStatus({
    mainCta: { label: 'Fale comigo', href: '#' },
    contact: { email: 'a@b.c', phone: '', whatsapp: '', address: '' },
  });
  assert.equal(ambos.contato.status, 'configurado');
});

// ── A regressão que motivou tudo isto ────────────────────────────────────────

test('nenhum instrumento promete herança de kit que o gerador não entrega', () => {
  // `buildBrandingCss` recebe só o branding: o kit nunca é consultado. Qualquer
  // resumo que diga "herdado do kit" está prometendo o que não acontece.
  const vazio = marcaSectionStatus({});
  const cheio = marcaSectionStatus({
    brandName: 'Acme',
    primary: '#c62828',
    background: '#ffffff',
    foreground: '#111111',
    fontDisplay: 'Playfair Display',
    fontBody: 'Lora',
    mainCta: { label: 'Fale comigo', href: '#' },
    contact: { email: 'a@b.c', phone: '', whatsapp: '', address: '' },
    social: { instagram: 'https://x' },
  });
  for (const estado of [vazio, cheio]) {
    for (const [id, info] of Object.entries(estado)) {
      assert.doesNotMatch(info.resumo, /herdad/i, `${id} promete herança`);
      assert.ok(info.resumo.trim() !== '', `${id} ficou sem resumo para a tela mostrar`);
    }
  }
});

test('todo status tem rótulo textual (o ponto não pode falar só por cor)', () => {
  const estados: SecaoStatus[] = ['nao-iniciado', 'parcial', 'padrao', 'configurado', 'opcional'];
  for (const e of estados) {
    assert.ok((STATUS_LABEL[e] ?? '').trim() !== '', `sem rótulo para ${e}`);
  }
});
