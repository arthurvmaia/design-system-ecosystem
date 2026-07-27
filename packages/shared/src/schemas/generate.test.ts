import assert from 'node:assert/strict';
import { test } from 'node:test';
import { GENERATE_SCHEMA_VERSION, GeneratePayload } from './generate.js';
import { normalizarProjectLayout } from './layout.js';
import {
  DEFAULT_PROJECT_BRANDING,
  DEFAULT_PROJECT_CONTENT,
  PROJECT_DATA_VERSION,
  normalizarProjectBranding,
  normalizarProjectContent,
} from './project.js';

/** O payload como a rota da FILA sempre gravou (sem schemaVersion — legado). */
const payloadLegado = {
  projectId: 'prj_01ABC',
  projectName: 'Meu site',
  kitId: 'kit_01ABC',
  kit: {
    id: 'kit_01ABC',
    name: 'Kit principal',
    components: [
      {
        id: 'cmp_01ABC',
        name: 'Hero',
        category: 'hero',
        kind: 'component',
        bundlePath: 'C:/x/library/cmp_01ABC/bundle',
      },
    ],
  },
  layout: {
    mode: 'blueprint',
    blueprintId: 'saas-landing',
    disabledRoles: [],
    density: 'equilibrado',
    motion: 'sutil',
    preferDesignSystemId: null,
    creativeSeed: 0,
  },
  blueprintId: 'saas-landing',
  branding: {
    palette: { primary: '#111111', background: '#ffffff', foreground: '#000000' },
    typography: { display: 'Inter', body: 'Inter' },
  },
  content: { about: 'Sobre nós.' },
  media: [],
};

test('job legado (sem schemaVersion) entra no contrato e sai carimbado', () => {
  const parsed = GeneratePayload.parse(payloadLegado);
  assert.equal(parsed.schemaVersion, GENERATE_SCHEMA_VERSION);
  assert.equal(parsed.kit.components[0]?.bundlePath.includes('bundle'), true);
});

test('media ausente vira lista vazia; media com slotRole preservada', () => {
  const { media: _ignorada, ...semMedia } = payloadLegado;
  const parsed = GeneratePayload.parse(semMedia);
  assert.deepEqual(parsed.media, []);

  const comMedia = GeneratePayload.parse({
    ...payloadLegado,
    media: [
      {
        path: 'media/logo.png',
        mimeType: 'image/png',
        kind: 'logo',
        originalName: 'logo.png',
        slotRole: 'hero',
      },
    ],
  });
  assert.equal(comMedia.media[0]?.slotRole, 'hero');
});

test('kit vazio é rejeitado: gerar sem componentes é erro de contrato, não surpresa depois', () => {
  const invalido = { ...payloadLegado, kit: { ...payloadLegado.kit, components: [] } };
  assert.equal(GeneratePayload.safeParse(invalido).success, false);
});

test('normalizarProjectContent: corrompido vira DEFAULT (não objeto vazio silencioso)', () => {
  const corrompido = normalizarProjectContent('{isso não é json');
  assert.equal(corrompido.about, DEFAULT_PROJECT_CONTENT.about);
  assert.equal(corrompido.schemaVersion, PROJECT_DATA_VERSION);

  const legado = normalizarProjectContent(JSON.stringify({ about: 'Texto do usuário.' }));
  assert.equal(legado.about, 'Texto do usuário.');
  assert.equal(legado.schemaVersion, PROJECT_DATA_VERSION);
});

test('normalizarProjectBranding: legado parcial preserva o que existe e completa o resto', () => {
  const parcial = normalizarProjectBranding(
    JSON.stringify({ brandName: 'Acme', palette: { primary: '#ff0000' } }),
  );
  assert.equal(parcial.brandName, 'Acme');
  assert.equal(parcial.palette.primary, '#ff0000');
  assert.equal(parcial.palette.background, DEFAULT_PROJECT_BRANDING.palette.background);
  assert.equal(parcial.typography.body, DEFAULT_PROJECT_BRANDING.typography.body);
  assert.equal(parcial.schemaVersion, PROJECT_DATA_VERSION);
});

test('normalizarProjectLayout: corrompido cai no default; legado mescla sobre o default', () => {
  const corrompido = normalizarProjectLayout('###');
  assert.equal(corrompido.mode, 'blueprint');
  const legado = normalizarProjectLayout(JSON.stringify({ mode: 'criativo' }));
  assert.equal(legado.mode, 'criativo');
  assert.equal(legado.density, 'equilibrado');
});
