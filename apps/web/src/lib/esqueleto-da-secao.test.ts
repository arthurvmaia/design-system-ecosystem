import assert from 'node:assert/strict';
import { test } from 'node:test';
import type {
  ClusterDeCor,
  KitDesignSystem,
  OrigemConsolidada,
  SectionRole,
} from '@ds/shared/schemas';
import {
  CORPO_NA_PREVIA,
  escalaDoNome,
  estiloDoEsqueleto,
  formaDoPapel,
  formaEscreveONome,
  raioNaPrevia,
} from './esqueleto-da-secao.js';

/**
 * As duas metades do esqueleto, testadas separadas: a FORMA não sabe nada do
 * kit, o ESTILO não sabe nada do papel. E a regra que atravessa as duas: o que
 * não dá para afirmar sai como motivo por extenso, nunca como cinza inventado.
 */

const PAPEIS: SectionRole[] = [
  'nav',
  'hero',
  'logos',
  'features',
  'showcase',
  'stats',
  'pricing',
  'testimonials',
  'faq',
  'about',
  'team',
  'gallery',
  'catalog',
  'contact',
  'cta',
  'footer',
];

const cluster = (
  papel: ClusterDeCor['papel'],
  hex: string,
  confianca = 0.9,
  ocorrencias = 10,
): ClusterDeCor => ({
  papel,
  corCanonica: hex,
  membros: [{ literal: hex, hexOpaco: hex, ocorrencias, contexto: 'bg' }],
  confianca,
  ajuste: null,
});

const origem = (parcial: Partial<OrigemConsolidada> = {}): OrigemConsolidada => ({
  designSystemId: 'ds_a',
  tema: 'escuro',
  clusters: [cluster('background', '#101014'), cluster('heading', '#f2f2f2')],
  fontes: [],
  ...parcial,
});

const sistema = (parcial: Partial<KitDesignSystem> = {}): KitDesignSystem => ({
  versao: 1,
  geradoEm: 1,
  tema: 'escuro',
  origens: [origem()],
  limitacoes: [],
  ...parcial,
});

// ── A forma ─────────────────────────────────────────────────────────────────

test('a abertura tem título grande e um botão', () => {
  const forma = formaDoPapel('hero');
  const nome = forma.topo.find((t) => t.tipo === 'nome');
  assert.ok(nome !== undefined && nome.tipo === 'nome' && nome.escala >= 2);
  assert.ok(forma.topo.some((t) => t.tipo === 'botao'));
});

test('a grade de preços tem três colunas, cada uma com o seu botão', () => {
  const forma = formaDoPapel('pricing');
  assert.equal(forma.grade?.colunas, 3);
  assert.ok(forma.grade?.item.some((t) => t.tipo === 'botao'));
});

test('navegação e rodapé são barra, não bloco', () => {
  assert.ok(formaDoPapel('nav').barra !== null);
  assert.ok(formaDoPapel('footer').barra !== null);
  assert.equal(formaDoPapel('hero').barra, null);
});

test('o formulário de contato desenha campos', () => {
  assert.ok(formaDoPapel('contact').grade?.item.some((t) => t.tipo === 'campo'));
});

test('as perguntas frequentes empilham linhas, não colunas', () => {
  const grade = formaDoPapel('faq').grade;
  assert.equal(grade?.colunas, 1);
  assert.ok((grade?.linhas ?? 0) > 1);
});

test('seção sem papel ganha bloco genérico em vez de virar abertura', () => {
  // Chutar a forma de uma abertura porque "seção sem papel costuma ser
  // abertura" desenharia uma promessa que o gerador não fez.
  const livre = formaDoPapel(undefined);
  assert.notDeepEqual(livre, formaDoPapel('hero'));
  assert.equal(livre.grade, null);
});

test('todo papel tem forma, e nenhuma forma escreve o nome duas vezes', () => {
  for (const papel of PAPEIS) {
    const forma = formaDoPapel(papel);
    const nomes = [...forma.topo, ...(forma.grade?.item ?? []), ...(forma.barra ?? [])].filter(
      (t) => t.tipo === 'nome',
    );
    assert.ok(nomes.length <= 1, `${papel} escreve o nome ${nomes.length} vezes`);
    const temAlgo = forma.topo.length > 0 || forma.grade !== null || (forma.barra?.length ?? 0) > 0;
    assert.ok(temAlgo, `${papel} não desenha nada`);
  }
});

test('a legenda por cima só aparece onde o esqueleto não escreve o nome', () => {
  assert.equal(formaEscreveONome(formaDoPapel('hero')), true);
  assert.equal(formaEscreveONome(formaDoPapel('nav')), false);
});

// ── O estilo ────────────────────────────────────────────────────────────────

test('sem design system consolidado, o motivo sai por extenso', () => {
  const leitura = estiloDoEsqueleto(null);
  assert.equal(leitura.ok, false);
  assert.ok(leitura.ok === false && leitura.porque.length > 0);
});

test('kit sem origem nenhuma não vira bloco cinza genérico', () => {
  const leitura = estiloDoEsqueleto(sistema({ origens: [] }));
  assert.equal(leitura.ok, false);
});

test('sem papel de fundo e de texto, o esqueleto se recusa a chutar', () => {
  // Desenhar assim mesmo diria "o seu kit é assim" sobre um kit que ninguém leu.
  const so = sistema({ origens: [origem({ clusters: [cluster('primary', '#ff0000')] })] });
  const leitura = estiloDoEsqueleto(so);
  assert.equal(leitura.ok, false);
});

test('fundo e texto bastam para desenhar', () => {
  const leitura = estiloDoEsqueleto(sistema());
  assert.equal(leitura.ok, true);
  if (leitura.ok) {
    assert.equal(leitura.estilo.fundo, '#101014');
    assert.equal(leitura.estilo.texto, '#f2f2f2');
    // Sem cor de ação, o botão herda a cor do texto em vez de sumir.
    assert.equal(leitura.estilo.destaque, '#f2f2f2');
    assert.equal(leitura.estilo.borda, null);
  }
});

test('surface serve de fundo e body serve de texto quando os primeiros faltam', () => {
  const leitura = estiloDoEsqueleto(
    sistema({
      origens: [origem({ clusters: [cluster('surface', '#1a1a1a'), cluster('body', '#dddddd')] })],
    }),
  );
  assert.equal(leitura.ok, true);
  if (leitura.ok) {
    assert.equal(leitura.estilo.fundo, '#1a1a1a');
    assert.equal(leitura.estilo.texto, '#dddddd');
  }
});

test('entre duas cores do mesmo papel vence a de maior confiança', () => {
  const leitura = estiloDoEsqueleto(
    sistema({
      origens: [
        origem({
          clusters: [
            cluster('background', '#101014'),
            cluster('heading', '#f2f2f2'),
            cluster('primary', '#333333', 0.4, 99),
            cluster('primary', '#22d3ee', 0.95, 3),
          ],
        }),
      ],
    }),
  );
  assert.equal(leitura.ok && leitura.estilo.destaque, '#22d3ee');
});

test('cluster de baixa confiança ainda desenha: aqui nada é entregue', () => {
  // O limiar de recoloração existe porque recolorir na dúvida estraga o site
  // entregue. O esqueleto é um esboço de 250px, e descartar o papel duvidoso
  // deixaria sem prévia justamente o kit mais difícil.
  const leitura = estiloDoEsqueleto(
    sistema({
      origens: [
        origem({
          clusters: [cluster('background', '#ffffff', 0.2), cluster('body', '#222222', 0.2)],
        }),
      ],
    }),
  );
  assert.equal(leitura.ok, true);
});

test('a fonte de título prefere a marcada como display', () => {
  const leitura = estiloDoEsqueleto(
    sistema({
      origens: [
        origem({
          fontes: [
            { familia: 'Inter', papelSugerido: 'body', ocorrencias: 40 },
            { familia: 'Playfair Display', papelSugerido: 'display', ocorrencias: 4 },
            { familia: 'JetBrains Mono', papelSugerido: 'mono', ocorrencias: 90 },
          ],
        }),
      ],
    }),
  );
  assert.equal(leitura.ok && leitura.estilo.fonteTitulo, 'Playfair Display');
  assert.equal(leitura.ok && leitura.estilo.fonteTexto, 'Inter');
});

test('fallback de sistema não vira a tipografia do kit', () => {
  // Kit consolidado antes do filtro na origem ainda traz `Apple Color Emoji`,
  // e por ocorrências ela ganharia: o nome da seção sairia em fonte de emoji.
  const leitura = estiloDoEsqueleto(
    sistema({
      origens: [
        origem({
          fontes: [
            { familia: 'Apple Color Emoji', papelSugerido: null, ocorrencias: 200 },
            { familia: 'Geist', papelSugerido: null, ocorrencias: 12 },
          ],
        }),
      ],
    }),
  );
  assert.equal(leitura.ok && leitura.estilo.fonteTitulo, 'Geist');
});

test('kit sem fonte legível fica sem fonte, e não com uma inventada', () => {
  const leitura = estiloDoEsqueleto(sistema());
  assert.equal(leitura.ok && leitura.estilo.fonteTitulo, null);
  assert.equal(leitura.ok && leitura.estilo.fonteTexto, null);
});

test('kit de tema misto declara que o esqueleto saiu de uma origem só', () => {
  const leitura = estiloDoEsqueleto(
    sistema({
      tema: 'misto',
      origens: [origem(), origem({ designSystemId: 'ds_b', tema: 'claro' })],
    }),
  );
  assert.ok(leitura.ok && leitura.estilo.aviso !== null);
});

test('kit de uma origem só não inventa aviso', () => {
  const leitura = estiloDoEsqueleto(sistema());
  assert.equal(leitura.ok && leitura.estilo.aviso, null);
});

test('manda a origem mais bem consolidada, não a primeira da lista', () => {
  const magra = origem({
    designSystemId: 'ds_magra',
    clusters: [cluster('background', '#000000')],
  });
  const cheia = origem({
    designSystemId: 'ds_cheia',
    clusters: [
      cluster('background', '#111111'),
      cluster('heading', '#eeeeee'),
      cluster('border', '#333333'),
    ],
  });
  const leitura = estiloDoEsqueleto(sistema({ origens: [magra, cheia] }));
  assert.equal(leitura.ok && leitura.estilo.origemId, 'ds_cheia');
  assert.equal(leitura.ok && leitura.estilo.borda, '#333333');
});

test('escala e raio saem da captura quando ela mediu, e ficam nulos quando não', () => {
  const medida = estiloDoEsqueleto(
    sistema({
      origens: [
        origem({
          escala: {
            degraus: [14, 16, 48],
            corpo: 16,
            display: 48,
            espacos: [],
            raios: [8, 12, 12],
          },
        }),
      ],
    }),
  );
  assert.equal(medida.ok && medida.estilo.destaqueTipografico, 3);
  assert.equal(medida.ok && medida.estilo.raio, 12);

  const semMedida = estiloDoEsqueleto(sistema());
  assert.equal(semMedida.ok && semMedida.estilo.destaqueTipografico, null);
  assert.equal(semMedida.ok && semMedida.estilo.raio, null);
});

// ── Do estilo para os pixels ────────────────────────────────────────────────

test('o degrau medido do site manda no tamanho do título', () => {
  assert.equal(escalaDoNome(2.4, 3), 3);
  // Tipografia plana desenha título discreto: é o site, não o desenho genérico.
  assert.equal(escalaDoNome(2.4, 1.3), 1.3);
});

test('título medido absurdo é limitado para caber na coluna', () => {
  assert.equal(escalaDoNome(2.4, 9), 4);
});

test('rótulo pequeno ignora o degrau de destaque do site', () => {
  assert.equal(escalaDoNome(1.5, 3), 1.5);
});

test('sem medida, a forma decide', () => {
  assert.equal(escalaDoNome(2.4, null), 2.4);
});

test('o raio encolhe na mesma proporção do texto', () => {
  assert.equal(raioNaPrevia(16, 16), CORPO_NA_PREVIA);
  assert.equal(raioNaPrevia(null, 16), 2);
  // Corpo não medido cai no 16px que a web assume, em vez de dividir por zero.
  assert.equal(raioNaPrevia(16, null), CORPO_NA_PREVIA);
  assert.equal(raioNaPrevia(16, 0), CORPO_NA_PREVIA);
});
