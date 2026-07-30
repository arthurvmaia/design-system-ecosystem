import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { LinhaDeBase, MedidaDeBundle } from './fidelidade.js';
import { avaliarPortao, linhasDeContexto } from './portao.js';

/**
 * O portão é a única parte da medição que roda no CI.
 *
 * Os dados moram fora do repo (`~/design-system-ecosystem`), então um runner
 * limpo não tem acervo nenhum para medir. Por isso `avaliarPortao` é pura e é
 * testada com literais: a lógica que decide passa/reprova fica coberta mesmo
 * onde os bundles não existem.
 */

const bundle = (over: Partial<MedidaDeBundle> = {}): MedidaDeBundle => ({
  dir: '/vault/ds_AAA/segments/bundles/seg_0',
  nome: 'seg Hero',
  regras: 900,
  regrasNaOrigem: 1000,
  retencao: 90,
  seletoresMortos: 0,
  instrumentacaoVazada: 0,
  scriptsDeclarados: 2,
  scriptsAusentes: 0,
  scriptsRemotos: 0,
  iconesVazios: 0,
  iconesInline: 12,
  ...over,
});

const linhaDeBase = (bundles: MedidaDeBundle[]): LinhaDeBase => ({
  gravadoEm: 1_700_000_000_000,
  bundles,
  resumo: {
    total: bundles.length,
    retencaoMedia: null,
    retencaoMinima: null,
    retencaoMaxima: null,
    comSeletorMorto: 0,
    comInstrumentacao: 0,
    comScriptAusente: 0,
    comIconeVazio: 0,
  },
});

// ── O caminho feliz ─────────────────────────────────────────────────────────

test('acervo limpo passa', () => {
  const v = avaliarPortao(linhaDeBase([bundle()]), linhaDeBase([bundle()]));
  assert.equal(v.estado, 'passou');
  assert.deepEqual(v.violacoes, []);
});

// ── As três regras absolutas ────────────────────────────────────────────────

test('A1: instrumentação vazada reprova, com o número na explicação', () => {
  const v = avaliarPortao(
    linhaDeBase([bundle()]),
    linhaDeBase([bundle({ instrumentacaoVazada: 7 })]),
  );
  assert.equal(v.estado, 'reprovou');
  assert.equal(v.violacoes.length, 1);
  assert.equal(v.violacoes[0]?.regra, 'A1-instrumentacao');
  assert.match(v.violacoes[0]?.explicacao ?? '', /7 marca/);
});

test('A2: script pedido e ausente reprova', () => {
  const v = avaliarPortao(linhaDeBase([bundle()]), linhaDeBase([bundle({ scriptsAusentes: 1 })]));
  assert.equal(v.estado, 'reprovou');
  assert.equal(v.violacoes[0]?.regra, 'A2-script-ausente');
});

test('A3: seletor morto reprova quando houve origem para descontar', () => {
  const v = avaliarPortao(
    linhaDeBase([bundle()]),
    linhaDeBase([bundle({ seletoresMortos: 3, regrasNaOrigem: 1000 })]),
  );
  assert.equal(v.estado, 'reprovou');
  assert.equal(v.violacoes[0]?.regra, 'A3-seletor-morto');
});

test('A3 NÃO reprova sem HTML de origem: seria cobrar do bundle o defeito do site', () => {
  // Sem a origem, `contarSeletoresMortos` não desconta o que já estava morto na
  // página original. Reprovar aí seria punir o bundle por herança.
  const v = avaliarPortao(
    linhaDeBase([bundle()]),
    linhaDeBase([bundle({ seletoresMortos: 3, regrasNaOrigem: null, retencao: null })]),
  );
  assert.equal(v.estado, 'passou');
});

test('as violações são somadas por bundle e por regra, sem se atropelarem', () => {
  const v = avaliarPortao(
    linhaDeBase([bundle()]),
    linhaDeBase([
      bundle({ nome: 'a', instrumentacaoVazada: 2 }),
      bundle({ nome: 'b', scriptsAusentes: 1, instrumentacaoVazada: 1 }),
      bundle({ nome: 'c' }),
    ]),
  );
  assert.equal(v.estado, 'reprovou');
  assert.equal(v.violacoes.length, 3);
  assert.equal(v.violacoes.filter((x) => x.regra === 'A1-instrumentacao').length, 2);
  assert.equal(v.violacoes.filter((x) => x.regra === 'A2-script-ausente').length, 1);
});

test('bundle NOVO também é cobrado: limpo não é privilégio de quem já estava na base', () => {
  const v = avaliarPortao(
    linhaDeBase([bundle({ dir: '/vault/ds_AAA/segments/bundles/seg_0' })]),
    linhaDeBase([
      bundle({ dir: '/vault/ds_AAA/segments/bundles/seg_0' }),
      bundle({
        dir: '/vault/ds_BBB/segments/bundles/seg_9',
        nome: 'novo',
        instrumentacaoVazada: 4,
      }),
    ]),
  );
  assert.equal(v.estado, 'reprovou');
  assert.equal(v.violacoes[0]?.bundle, 'novo');
});

// ── O terceiro estado ───────────────────────────────────────────────────────

test('sem linha de base, não é passou nem reprovou', () => {
  const v = avaliarPortao(null, linhaDeBase([bundle()]));
  assert.equal(v.estado, 'nao-deu-para-verificar');
  assert.match(v.resumo, /--gravar/);
});

test('acervo vazio não é acervo limpo', () => {
  // Um acervo sem bundle nenhum passaria em todas as regras absolutas por
  // vacuidade. Chamar isso de "passou" é o jeito mais fácil de um portão
  // virar enfeite.
  const v = avaliarPortao(linhaDeBase([bundle()]), linhaDeBase([]));
  assert.equal(v.estado, 'nao-deu-para-verificar');
  assert.equal(v.contexto.observacao, 'acervo vazio');
});

test('base de outro acervo passa nas absolutas, mas diz que não comparou nada', () => {
  // É a situação REAL de hoje: a base tem 23 sites que não existem mais e o
  // acervo tem 2 novos. As absolutas continuam válidas (são sobre o acervo de
  // agora); a comparação par a par não tem coorte, e isso precisa ser dito.
  const v = avaliarPortao(
    linhaDeBase([bundle({ dir: '/vault/ds_VELHO/segments/bundles/seg_0' })]),
    linhaDeBase([bundle({ dir: '/vault/ds_NOVO/segments/bundles/seg_0' })]),
  );
  assert.equal(v.estado, 'passou');
  assert.equal(v.contexto.comparaveis, 0);
  assert.match(v.contexto.observacao ?? '', /coorte/);
  assert.match(v.resumo, /outro acervo/);
});

test('reprovar vence "não deu para verificar": defeito medido é defeito', () => {
  // Com base de outro acervo E instrumentação vazada, o veredito é reprovou.
  // A falta de coorte não absolve o que foi medido diretamente.
  const v = avaliarPortao(
    linhaDeBase([bundle({ dir: '/vault/ds_VELHO/segments/bundles/seg_0' })]),
    linhaDeBase([
      bundle({ dir: '/vault/ds_NOVO/segments/bundles/seg_0', instrumentacaoVazada: 1 }),
    ]),
  );
  assert.equal(v.estado, 'reprovou');
});

// ── O contexto ──────────────────────────────────────────────────────────────

test('o contexto conta sites, não só bundles', () => {
  const v = avaliarPortao(
    linhaDeBase([
      bundle({ dir: '/vault/ds_AAA/segments/bundles/seg_0' }),
      bundle({ dir: '/vault/ds_AAA/segments/bundles/seg_1' }),
      bundle({ dir: '/vault/ds_BBB/segments/bundles/seg_0' }),
    ]),
    linhaDeBase([bundle({ dir: '/vault/ds_AAA/segments/bundles/seg_0' })]),
  );
  assert.equal(v.contexto.bundlesNaBase, 3);
  assert.equal(v.contexto.sitesNaBase, 2);
  assert.equal(v.contexto.bundlesAgora, 1);
  assert.equal(v.contexto.sitesAgora, 1);
  assert.equal(v.contexto.comparaveis, 1);
});

test('caminho do Windows com barra invertida também identifica o site', () => {
  // A medição roda em Windows; se o id do ds só fosse achado com barra normal,
  // todo contexto sairia com zero sites e ninguém notaria.
  const v = avaliarPortao(
    linhaDeBase([bundle({ dir: 'C:\\Users\\x\\vault\\ds_AAA\\segments\\bundles\\seg_0' })]),
    linhaDeBase([bundle({ dir: 'C:\\Users\\x\\vault\\ds_AAA\\segments\\bundles\\seg_0' })]),
  );
  assert.equal(v.contexto.sitesNaBase, 1);
  assert.equal(v.contexto.sitesAgora, 1);
});

test('as linhas de contexto sempre saem, inclusive a régua em uso', () => {
  const v = avaliarPortao(linhaDeBase([bundle()]), linhaDeBase([bundle()]));
  const linhas = linhasDeContexto(v.contexto);
  assert.ok(linhas.some((l) => l.includes('base:')));
  assert.ok(linhas.some((l) => l.includes('agora:')));
  assert.ok(linhas.some((l) => l.includes('comparáveis')));
  assert.ok(linhas.some((l) => l.includes('tolerância zero')));
});

test('métrica IGUAL não é regressão', () => {
  // A armadilha que fez o portão não reusar `comparar()`: lá `melhorou` é `>`
  // estrito, então um acervo idêntico volta com melhorou:false em tudo. Aqui,
  // idêntico e limpo é aprovado.
  const iguais = [bundle({ nome: 'a' }), bundle({ nome: 'b' })];
  const v = avaliarPortao(linhaDeBase(iguais), linhaDeBase(iguais));
  assert.equal(v.estado, 'passou');
});

test('retenção nula não vira zero nem reprova nada', () => {
  // A outra armadilha do `comparar()`: `retencao ?? 0` transformaria "não deu
  // para medir" numa queda de 90% para 0%, uma catástrofe inventada por
  // coerção de tipo. O portão nem olha para retenção.
  const v = avaliarPortao(
    linhaDeBase([bundle({ retencao: 90 })]),
    linhaDeBase([bundle({ retencao: null, regrasNaOrigem: null })]),
  );
  assert.equal(v.estado, 'passou');
});
