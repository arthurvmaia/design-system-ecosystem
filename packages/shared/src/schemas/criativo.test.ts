import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  AutorizacoesDeClaim,
  DIMENSAO_DO_FORMATO,
  OrigemDaImagem,
  PedidoCriativo,
  ResultadoCriativo,
  TextoDaPeca,
  VariacaoCriativa,
  claimsAutorizados,
} from './criativo.js';

/**
 * O que estes testes protegem é o CRITÉRIO do contrato, não a conta: fato
 * trava, direção se assume e se registra. Cada afrouxamento aqui tem um custo
 * conhecido — grafia errada na peça, material real trocado por inventado,
 * claim jurídico que ninguém autorizou, job que estoura o saldo em silêncio.
 */

/** Um pedido válido mínimo, para os testes variarem só o que interessa. */
const pedidoBase = {
  marca: 'Açaí do Vale',
  tipo: 'imagem',
  formato: 'feed-1x1',
  imagem: { origem: 'gerar', descricaoParaGerar: 'tigela de açaí sobre mesa de madeira' },
  texto: { headline: 'Direto do Vale' },
  tetoDeCreditos: 10,
} as const;

// ── O que trava sem confirmação ──────────────────────────────────────────────

test('PROVA: pedido sem teto de créditos não passa — parar exige saber onde é o zero', () => {
  const { tetoDeCreditos: _ignorado, ...semTeto } = pedidoBase;
  assert.equal(PedidoCriativo.safeParse(semTeto).success, false);
});

test('PROVA: teto zero ou negativo não passa — teto que não limita não é teto', () => {
  assert.equal(PedidoCriativo.safeParse({ ...pedidoBase, tetoDeCreditos: 0 }).success, false);
  assert.equal(PedidoCriativo.safeParse({ ...pedidoBase, tetoDeCreditos: -5 }).success, false);
});

test('PROVA: pedido sem marca não passa — a grafia exata é o que aparece na peça', () => {
  const { marca: _ignorada, ...semMarca } = pedidoBase;
  assert.equal(PedidoCriativo.safeParse(semMarca).success, false);
  assert.equal(PedidoCriativo.safeParse({ ...pedidoBase, marca: '' }).success, false);
});

test('PROVA: texto vazio sem declarar "sem texto" não passa — vazio não é escolha', () => {
  assert.equal(TextoDaPeca.safeParse({}).success, false);
  assert.equal(TextoDaPeca.safeParse({ semTexto: false }).success, false);
});

test('PROVA: "sem texto" declarado passa, e "sem texto" com headline é ambíguo e reprova', () => {
  assert.equal(TextoDaPeca.safeParse({ semTexto: true }).success, true);
  assert.equal(TextoDaPeca.safeParse({ semTexto: true, headline: 'Promoção' }).success, false);
});

test('PROVA: headline literal passa, com CTA opcional — nem toda peça tem botão', () => {
  assert.equal(TextoDaPeca.safeParse({ headline: 'Direto do Vale' }).success, true);
  assert.equal(
    TextoDaPeca.safeParse({ headline: 'Direto do Vale', cta: 'Peça agora' }).success,
    true,
  );
});

// ── Defaults: o que se assume e se registra ──────────────────────────────────

test('PROVA: variações assume 2 quando não vem — o padrão da espec', () => {
  const pedido = PedidoCriativo.parse(pedidoBase);
  assert.equal(pedido.variacoes, 2);
});

test('PROVA: restrições e claims nascem vazios — na ausência de digitação, a peça não afirma nada', () => {
  const pedido = PedidoCriativo.parse(pedidoBase);
  assert.equal(pedido.restricoes, '');
  assert.deepEqual(claimsAutorizados(pedido.autorizacoesDeClaim), []);
});

// ── A regra do upload vencer a geração ───────────────────────────────────────

test('PROVA: origem "gerar" com arquivo presente reprova — o upload vence a geração', () => {
  // A regra da espec: se há imagem fornecida, gerar seria trocar material real
  // por material inventado. O parse recusa em vez de deixar o handler decidir.
  const r = OrigemDaImagem.safeParse({
    origem: 'gerar',
    caminhoDoUpload: 'foto-do-produto.jpg',
    descricaoParaGerar: 'uma foto parecida, mas melhor',
  });
  assert.equal(r.success, false);
});

test('PROVA: upload exige o arquivo e gerar exige a descrição', () => {
  assert.equal(OrigemDaImagem.safeParse({ origem: 'upload' }).success, false);
  assert.equal(OrigemDaImagem.safeParse({ origem: 'gerar' }).success, false);
  assert.equal(
    OrigemDaImagem.safeParse({ origem: 'upload', caminhoDoUpload: 'foto.jpg' }).success,
    true,
  );
});

// ── Claims: só entra o que o cliente digitou ─────────────────────────────────

test('PROVA: tipo de claim que o contrato não conhece não passa', () => {
  // "Garantia" não está no contrato. Passar despercebido seria a peça afirmar
  // algo que ninguém revisou — o strictObject reprova e força a decisão.
  const r = AutorizacoesDeClaim.safeParse({ garantia: '10 anos de garantia' });
  assert.equal(r.success, false);
});

test('PROVA: claim vazio não conta como digitado', () => {
  assert.equal(AutorizacoesDeClaim.safeParse({ preco: '' }).success, false);
});

test('PROVA: claimsAutorizados devolve só o que tem texto, com o texto literal', () => {
  const autorizacoes = AutorizacoesDeClaim.parse({ preco: 'R$ 49,90', frete: 'frete grátis' });
  assert.deepEqual(claimsAutorizados(autorizacoes), [
    { tipo: 'preco', texto: 'R$ 49,90' },
    { tipo: 'frete', texto: 'frete grátis' },
  ]);
});

// ── Formato: a dimensão sai do contrato, não de tabela paralela ──────────────

test('PROVA: todo formato tem dimensão, e as medidas são as da espec', () => {
  assert.deepEqual(DIMENSAO_DO_FORMATO['feed-1x1'], { largura: 1080, altura: 1080 });
  assert.deepEqual(DIMENSAO_DO_FORMATO['story-9x16'], { largura: 1080, altura: 1920 });
  assert.deepEqual(DIMENSAO_DO_FORMATO['reels-9x16'], { largura: 1080, altura: 1920 });
  // 3:1 de verdade — se alguém mudar a base, a proporção denuncia.
  const banner = DIMENSAO_DO_FORMATO['banner-3x1'];
  assert.equal(banner.largura / banner.altura, 3);
});

test('PROVA: formato fora da lista não passa — peça fora de medida não entra no lugar', () => {
  assert.equal(PedidoCriativo.safeParse({ ...pedidoBase, formato: 'feed-4x5' }).success, false);
});

// ── O resultado ──────────────────────────────────────────────────────────────

test('PROVA: variação aprovada sem arquivo não passa — download sem o que baixar', () => {
  assert.equal(VariacaoCriativa.safeParse({ estado: 'aprovada' }).success, false);
  assert.equal(
    VariacaoCriativa.safeParse({ estado: 'aprovada', caminho: 'variacao-1.png' }).success,
    true,
  );
});

test('PROVA: reprovada ou falhou sem motivo não passa — o Orbis diz o que falhou', () => {
  assert.equal(
    VariacaoCriativa.safeParse({ estado: 'reprovada', caminho: 'variacao-2.png' }).success,
    false,
  );
  assert.equal(VariacaoCriativa.safeParse({ estado: 'falhou' }).success, false);
  assert.equal(
    VariacaoCriativa.safeParse({ estado: 'falhou', motivo: 'saldo zerou na terceira' }).success,
    true,
  );
});

test('PROVA: o resultado carrega a conta — custo gasto nunca negativo', () => {
  const ok = ResultadoCriativo.safeParse({
    variacoes: [{ estado: 'aprovada', caminho: 'variacao-1.png' }],
    custoGasto: 4.5,
  });
  assert.equal(ok.success, true);
  assert.equal(ResultadoCriativo.safeParse({ variacoes: [], custoGasto: -1 }).success, false);
});

test('PROVA: upload com descricao de geracao e o espelho ambiguo, e reprova', () => {
  // A regra "so gera quando nao houver imagem" so e inviolavel se valer nos
  // DOIS sentidos. Payload montado fora da tela pode chegar com upload E
  // descricao — e o handler nao pode ser quem decide qual vale.
  const r = OrigemDaImagem.safeParse({
    origem: 'upload',
    caminhoDoUpload: 'media/foto.jpg',
    descricaoParaGerar: 'um estudio moderno',
  });
  assert.equal(r.success, false);
  assert.ok(
    !r.success && r.error.issues.some((i) => i.path.join('.') === 'descricaoParaGerar'),
    'a issue aponta o campo ambiguo',
  );
});
