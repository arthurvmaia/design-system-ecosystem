import assert from 'node:assert/strict';
import { test } from 'node:test';
import { OrigemDaImagem, PedidoCriativo, TextoDaPeca } from './criativo.js';

/**
 * "O ORBIS ESCREVE": a terceira decisão, e por que ela não afrouxa nada.
 *
 * O dono pediu por extenso: *"cadê a opção que a Orbis pode gerar para ele
 * essas informações com base na marca? tem que ter, o campo de digitar é
 * opcional para o cliente"*. Ele está certo sobre o produto — exigir que o
 * cliente escreva a frase é cobrar dele o trabalho que ele contratou.
 *
 * O que estes testes protegem é a fronteira que isso NÃO pode atravessar. O
 * contrato inteiro existe porque o que está queimado no pixel de uma peça
 * publicada fala em nome da marca do cliente. Então:
 *
 * - vazio continua sendo recusado; o que passou a existir é uma DECISÃO;
 * - "pela marca" exige que a marca tenha declarado o material de onde a frase
 *   sai, senão derivar vira inventar;
 * - o que o cliente digitou vence sempre;
 * - claim continua exigindo digitação. Escrever no tom da marca é derivar;
 *   afirmar um desconto é inventar, e a chave nova não muda isso.
 */

const base = {
  marca: 'Açaí do Vale',
  tipo: 'imagem',
  formato: 'feed-1x1',
  imagem: { origem: 'gerar', descricaoParaGerar: 'tigela de açaí sobre mesa de madeira' },
  texto: { headline: 'Direto do Vale' },
  tetoDeCreditos: 10,
} as const;

// ── O texto ──────────────────────────────────────────────────────────────────

test('PROVA: vazio continua recusado — a novidade e uma DECISAO, nao um buraco', () => {
  assert.equal(TextoDaPeca.safeParse({}).success, false);
  assert.equal(TextoDaPeca.safeParse({ headline: null }).success, false);
});

test('o Orbis escreve: headline nula passa, desde que a decisao esteja declarada', () => {
  const r = TextoDaPeca.safeParse({ textoPelaMarca: true });
  assert.equal(r.success, true);
  if (!r.success) return;
  assert.equal(r.data.textoPelaMarca, true);
  assert.equal(r.data.headline, null);
});

test('as tres decisoes sao EXCLUSIVAS: duas ligadas viram pergunta, nao informacao', () => {
  /* "sem texto" + "o Orbis escreve": a peça tem texto ou não tem? */
  assert.equal(TextoDaPeca.safeParse({ semTexto: true, textoPelaMarca: true }).success, false);
  /* "o Orbis escreve" + headline digitada: qual dos dois vale? */
  assert.equal(
    TextoDaPeca.safeParse({ textoPelaMarca: true, headline: 'Direto do Vale' }).success,
    false,
  );
  /* e com CTA também, porque o CTA é texto na peça como qualquer outro */
  assert.equal(TextoDaPeca.safeParse({ textoPelaMarca: true, cta: 'Peça o seu' }).success, false);
});

test('o Orbis escreve nao se combina com copy por variacao', () => {
  assert.equal(
    TextoDaPeca.safeParse({ textoPelaMarca: true, porVariacao: [{ headline: 'a' }] }).success,
    false,
  );
});

test('o campo antigo continua inteiro: quem digita a frase segue digitando', () => {
  const r = TextoDaPeca.safeParse({ headline: 'Direto do Vale', cta: 'Peça o seu' });
  assert.equal(r.success, true);
  if (!r.success) return;
  assert.equal(r.data.textoPelaMarca, false, 'o padrão é o cliente escrever');
});

// ── A cena ───────────────────────────────────────────────────────────────────

test('o Orbis descreve: a cena pode faltar quando a decisao esta declarada', () => {
  assert.equal(OrigemDaImagem.safeParse({ origem: 'gerar', cenaPelaMarca: true }).success, true);
  /* e sem nenhuma das duas continua recusando */
  assert.equal(OrigemDaImagem.safeParse({ origem: 'gerar' }).success, false);
});

test('cena digitada e "o Orbis descreve" juntos sao ambiguos', () => {
  assert.equal(
    OrigemDaImagem.safeParse({ origem: 'gerar', descricaoParaGerar: 'x', cenaPelaMarca: true })
      .success,
    false,
  );
});

/**
 * A regra mais antiga da casa, e a chave nova não abre exceção nela: material
 * do cliente não se reinterpreta. Em `upload` não há cena a descrever.
 */
test('PROVA: upload com "o Orbis descreve" nao passa — o upload vence sempre', () => {
  assert.equal(
    OrigemDaImagem.safeParse({ origem: 'upload', caminhoDoUpload: 'foto.png', cenaPelaMarca: true })
      .success,
    false,
  );
});

// ── A fronteira: derivar não é inventar ──────────────────────────────────────

/**
 * Sem `tom`, "escrever no tom da marca" não tem tom nenhum de onde sair — o que
 * sobraria é o nome do cliente e a imaginação de quem escreve, que é exatamente
 * o material que este contrato existe para recusar.
 */
test('PROVA: o Orbis escreve SEM tom declarado nao passa — derivar exige de onde', () => {
  const r = PedidoCriativo.safeParse({
    ...base,
    texto: { textoPelaMarca: true },
  });
  assert.equal(r.success, false);
  if (r.success) return;
  const erro = r.error.issues[0];
  assert.deepEqual(erro?.path, ['direcao', 'tom'], 'a recusa aponta o campo que FALTA');
  assert.match(String(erro?.message), /inventada, não derivada/);
});

test('com tom declarado, o Orbis escreve passa', () => {
  const r = PedidoCriativo.safeParse({
    ...base,
    texto: { textoPelaMarca: true },
    direcao: { tom: 'direto, sem firula, de quem conhece o cliente pelo nome' },
  });
  assert.equal(r.success, true);
});

test('PROVA: o Orbis descreve SEM estilo visual declarado nao passa', () => {
  const r = PedidoCriativo.safeParse({
    ...base,
    imagem: { origem: 'gerar', cenaPelaMarca: true },
  });
  assert.equal(r.success, false);
  if (r.success) return;
  assert.deepEqual(r.error.issues[0]?.path, ['direcao', 'estiloVisual']);
});

test('com estilo visual declarado, o Orbis descreve passa', () => {
  assert.equal(
    PedidoCriativo.safeParse({
      ...base,
      imagem: { origem: 'gerar', cenaPelaMarca: true },
      direcao: { estiloVisual: 'luz natural de manhã, madeira crua, fundo desfocado' },
    }).success,
    true,
  );
});

/**
 * E o que a chave nova NÃO autoriza.
 *
 * Um pedido pode delegar a frase ao Orbis e continuar sem claim nenhum
 * autorizado — que é o estado padrão. Delegar a escrita não é autorizar
 * afirmação: preço, desconto, prazo, frete, depoimento e certificação seguem
 * exigindo que o cliente tenha digitado.
 */
test('PROVA: delegar a escrita NAO autoriza claim nenhum', () => {
  const r = PedidoCriativo.safeParse({
    ...base,
    texto: { textoPelaMarca: true },
    direcao: { tom: 'direto, sem firula' },
  });
  assert.equal(r.success, true);
  if (!r.success) return;
  const claims = r.data.autorizacoesDeClaim;
  assert.deepEqual(
    Object.values(claims).filter(Boolean),
    [],
    'nenhum claim pode nascer ligado por delegar a escrita',
  );
});

/**
 * O PADRÃO é o cliente escrever. Um pedido montado fora da tela — e o payload é
 * a fonte da verdade, não a UI — não pode virar "o Orbis escreve" por omissão.
 */
test('PROVA: por omissao, ninguem delega nada', () => {
  const r = PedidoCriativo.safeParse(base);
  assert.equal(r.success, true);
  if (!r.success) return;
  assert.equal(r.data.texto.textoPelaMarca, false);
  assert.equal(r.data.imagem.cenaPelaMarca, false);
});
