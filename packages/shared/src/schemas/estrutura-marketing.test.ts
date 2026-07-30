import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  OBJETIVOS,
  OBJETIVO_PADRAO,
  SEQUENCIAS,
  explicarPapel,
  nomeDaEtapa,
  sequenciaDe,
  sugerirSecoes,
} from './estrutura-marketing.js';
import { type ComponenteDoKitResumo, ObjetivoDoSite, ROLE_CATEGORIES } from './layout.js';
import { type EspacosDaPeca, sugerirMidia, sugerirMidiaDaSecao } from './midia-sugerida.js';

// ── As sequências ────────────────────────────────────────────────────────────

test('todo objetivo tem sequência, e toda sequência abre em nav e fecha em footer', () => {
  for (const obj of ObjetivoDoSite.options) {
    const seq = SEQUENCIAS[obj];
    assert.ok(seq.length >= 5, `${obj} tem sequência curta demais`);
    assert.equal(seq[0]?.papel, 'nav', `${obj} não abre com navegação`);
    assert.equal(seq[seq.length - 1]?.papel, 'footer', `${obj} não fecha com rodapé`);
  }
});

test('toda etapa explica o que faz — a tela precisa explicar, não rotular', () => {
  for (const obj of ObjetivoDoSite.options) {
    for (const e of SEQUENCIAS[obj]) {
      assert.ok(e.faz.trim().length > 10, `etapa ${e.papel} de ${obj} sem explicação`);
    }
  }
});

test('toda sugestão de mídia diz o porquê, não só o quanto', () => {
  // Uma quantidade sem razão é o que a etapa de Mídia já tinha, e é o que
  // fazia a pessoa chutar.
  for (const obj of ObjetivoDoSite.options) {
    for (const e of SEQUENCIAS[obj]) {
      if (e.midia === undefined) continue;
      assert.ok(e.midia.porque.trim().length > 15, `${e.papel} de ${obj} pede imagem sem motivo`);
      assert.ok(e.midia.quantas > 0);
    }
  }
});

test('todo objetivo tem rótulo e explicação para a tela', () => {
  for (const obj of ObjetivoDoSite.options) {
    assert.ok(OBJETIVOS[obj].rotulo.length > 0);
    assert.ok(OBJETIVOS[obj].explica.length > 20);
  }
});

test('as quatro sequências são de fato diferentes', () => {
  // Se duas fossem iguais, oferecer a escolha seria mentira.
  const assinaturas = ObjetivoDoSite.options.map((o) =>
    SEQUENCIAS[o].map((e) => e.papel).join('>'),
  );
  assert.equal(new Set(assinaturas).size, assinaturas.length);
});

test('sem objetivo, cai na sequência mais geral', () => {
  assert.deepEqual(sequenciaDe(null), SEQUENCIAS[OBJETIVO_PADRAO]);
  assert.deepEqual(sequenciaDe(undefined), SEQUENCIAS[OBJETIVO_PADRAO]);
});

test('nomeDaEtapa usa o nome próprio quando existe, senão o rótulo do papel', () => {
  assert.equal(
    nomeDaEtapa({
      papel: 'hero',
      nome: 'Abertura com a oferta',
      faz: 'x',
      aida: 'atencao',
      sugestao: 'x',
    }),
    'Abertura com a oferta',
  );
  assert.equal(nomeDaEtapa({ papel: 'footer', faz: 'x', aida: 'acao', sugestao: 'x' }), 'Rodapé');
});

test('explicarPapel acha o papel fora do objetivo escolhido, em vez de desistir', () => {
  // Uma seção de preço numa página de portfólio é incomum, não é inexplicável.
  const e = explicarPapel('pricing', 'mostrar-trabalho');
  assert.ok(e !== undefined);
  assert.equal(e?.papel, 'pricing');
});

test('todo papel do vocabulário sabe se explicar — nenhuma seção fica muda', () => {
  // Uma seção sem explicação no meio de uma página que explica todas as outras
  // é pior que nenhuma explicação: parece defeito.
  for (const papel of Object.keys(ROLE_CATEGORIES) as Array<keyof typeof ROLE_CATEGORIES>) {
    const e = explicarPapel(papel);
    assert.ok(e !== undefined, `o papel "${papel}" não tem explicação`);
    assert.ok(e.faz.trim().length > 10, `a explicação de "${papel}" é curta demais`);
  }
});

// ── A estrutura sugerida ─────────────────────────────────────────────────────

let n = 0;
const id = () => `sec_${++n}`;
const cmp = (over: Partial<ComponenteDoKitResumo>): ComponenteDoKitResumo => ({
  id: `cmp_${Math.random().toString(36).slice(2, 8)}`,
  name: 'Peça',
  category: 'card',
  ...over,
});

test('o objetivo muda a estrutura sugerida — é o ponto da escolha', () => {
  n = 0;
  const kit = [cmp({ category: 'hero' }), cmp({ category: 'card' })];
  n = 0;
  const contato = sugerirSecoes(kit, id, 'captar-contato').map((s) => s.papel);
  n = 0;
  const produto = sugerirSecoes(kit, id, 'vender-produto').map((s) => s.papel);
  assert.notDeepEqual(contato, produto);
});

test('a sugestão é determinística: mesmo kit e mesmo objetivo, mesma página', () => {
  const kit = [cmp({ id: 'cmp_a', category: 'hero' }), cmp({ id: 'cmp_b', category: 'form' })];
  n = 0;
  const um = sugerirSecoes(kit, id, 'apresentar-servico');
  n = 0;
  const dois = sugerirSecoes(kit, id, 'apresentar-servico');
  assert.deepEqual(um, dois);
});

test('cada seção nasce numerada com o nome da etapa: "Seção 2 · Abertura com a oferta"', () => {
  n = 0;
  const secoes = sugerirSecoes([], id, 'vender-produto');
  const hero = secoes.find((s) => s.papel === 'hero');
  assert.equal(hero?.nome, 'Seção 2 · Abertura com a oferta');
  assert.equal(secoes[0]?.nome, 'Seção 1 · Navegação');
});

test('a sugestão NÃO aloca peça nenhuma: alocar é trabalho de quem monta', () => {
  // Era o contrário, e era atropelo por decisão de quem usa: a sugestão
  // chegava preenchida e a montagem virava conferência. O kit fica à
  // disposição na tela ("peças ainda sem seção"); a estrutura nasce vazia.
  n = 0;
  const kit = [cmp({ id: 'cmp_a', category: 'hero' }), cmp({ id: 'cmp_b', category: 'form' })];
  const secoes = sugerirSecoes(kit, id, 'captar-contato');
  assert.ok(secoes.every((s) => s.componentIds.length === 0));
  // E nenhuma seção extra é inventada para acomodar peça que sobrou.
  assert.equal(secoes.length, SEQUENCIAS['captar-contato'].length);
});

test('kit vazio ainda propõe a página inteira: a tela não abre em branco', () => {
  n = 0;
  const secoes = sugerirSecoes([], id, 'captar-contato');
  assert.equal(secoes.length, SEQUENCIAS['captar-contato'].length);
  assert.ok(secoes.every((s) => s.componentIds.length === 0));
});

test('todo papel da sequência sabe que categoria aceita (ou aceita nenhuma, de propósito)', () => {
  for (const obj of ObjetivoDoSite.options) {
    for (const e of SEQUENCIAS[obj]) {
      assert.ok(ROLE_CATEGORIES[e.papel] !== undefined, `papel ${e.papel} fora de ROLE_CATEGORIES`);
    }
  }
});

test('toda etapa diz que TIPO de peça cai bem ali, sem olhar kit nenhum', () => {
  // É a observação que a tela mostra numa seção vazia: "aqui vai uma barra de
  // navegação", "aqui cai bem a foto do produto". Etapa sem sugestão deixaria
  // a pessoa escolhendo às cegas.
  for (const obj of ObjetivoDoSite.options) {
    for (const e of SEQUENCIAS[obj]) {
      assert.ok(e.sugestao.trim().length > 15, `${e.papel} de ${obj} sem sugestão de peça`);
    }
  }
  for (const papel of Object.keys(ROLE_CATEGORIES) as Array<keyof typeof ROLE_CATEGORIES>) {
    const e = explicarPapel(papel);
    assert.ok(e !== undefined && e.sugestao.trim().length > 15, `avulso ${papel} sem sugestão`);
  }
});

test('a ordem AIDA nunca anda para trás dentro de uma sequência', () => {
  // Atenção → Interesse → Desejo → Ação. Uma sequência que pede a Ação e
  // depois volta a construir Interesse quebra o argumento que ela mesma
  // propõe; este teste congela a espinha.
  const ordem = { atencao: 0, interesse: 1, desejo: 2, acao: 3 } as const;
  for (const obj of ObjetivoDoSite.options) {
    let anterior = 0;
    for (const e of SEQUENCIAS[obj]) {
      assert.ok(
        ordem[e.aida] >= anterior,
        `${obj}: a etapa ${e.papel} (${e.aida}) regride no AIDA`,
      );
      anterior = ordem[e.aida];
    }
  }
});

// ── A sugestão de mídia ──────────────────────────────────────────────────────

const secao = (over: Partial<Parameters<typeof sugerirMidiaDaSecao>[0]> = {}) => ({
  id: 'sec_1',
  nome: 'Prova social',
  papel: 'logos' as const,
  componentIds: [],
  ...over,
});

const espaco = (id: string, midias: number): EspacosDaPeca => ({
  id,
  disponivel: true,
  midias: Array.from({ length: midias }, () => ({ tipo: 'img' })),
});

test('o contrato da peça manda no NÚMERO; a etapa manda no PORQUÊ', () => {
  const s = sugerirMidiaDaSecao(
    secao({ componentIds: ['cmp_a'] }),
    [espaco('cmp_a', 4)],
    'captar-contato',
  );
  assert.equal(s.quantas, 4);
  assert.equal(s.fonte, 'peca-e-etapa');
  assert.ok(s.porque.includes('4'));
  assert.ok(s.porque.includes('marca'), `o porquê da etapa precisa estar lá: ${s.porque}`);
});

test('peça sem espaço de imagem: o número é zero, e o app diz o que isso significa', () => {
  const s = sugerirMidiaDaSecao(
    secao({ componentIds: ['cmp_a'] }),
    [espaco('cmp_a', 0)],
    'captar-contato',
  );
  assert.equal(s.quantas, 0);
  assert.ok(s.porque.includes('não têm espaço de imagem'));
});

test('seção sem peça do kit usa a expectativa da etapa: ela será criada no estilo', () => {
  const s = sugerirMidiaDaSecao(secao(), [], 'captar-contato');
  assert.equal(s.fonte, 'etapa');
  assert.equal(s.quantas, 4);
  assert.ok(s.porque.includes('criada no estilo do kit'));
});

test('peça sem contrato legível não entra na conta em vez de virar chute', () => {
  const s = sugerirMidiaDaSecao(secao({ componentIds: ['cmp_a'] }), [
    { id: 'cmp_a', disponivel: false, midias: [] },
  ]);
  assert.equal(s.fonte, 'etapa', 'cai na etapa, que é o que ainda se sabe');
});

test('seção sem papel e sem peça conhecida devolve zero COM razão, não silêncio', () => {
  const s = sugerirMidiaDaSecao(secao({ papel: undefined }), []);
  assert.equal(s.quantas, 0);
  assert.equal(s.fonte, 'nenhuma');
  assert.ok(s.porque.includes('Envie o que quiser'));
});

test('seção cujo tipo não pede imagem diz isso, em vez de omitir', () => {
  const s = sugerirMidiaDaSecao(secao({ papel: 'faq' }), []);
  assert.equal(s.quantas, 0);
  assert.ok(s.porque.includes('sem imagem'));
});

test('sugerirMidia devolve uma linha por seção, na ordem da página', () => {
  const secoes = [secao({ id: 'a' }), secao({ id: 'b', papel: 'faq' })];
  const r = sugerirMidia(secoes, []);
  assert.deepEqual(
    r.map((x) => x.secaoId),
    ['a', 'b'],
  );
});

test('duas peças na mesma seção somam os espaços', () => {
  const s = sugerirMidiaDaSecao(secao({ componentIds: ['cmp_a', 'cmp_b'] }), [
    espaco('cmp_a', 2),
    espaco('cmp_b', 3),
  ]);
  assert.equal(s.quantas, 5);
});
