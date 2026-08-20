import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  AutorizacoesDeClaim,
  CODIGOS_DA_REGUA,
  DIMENSAO_DO_FORMATO,
  OrigemDaImagem,
  PedidoCriativo,
  ResultadoCriativo,
  TextoDaPeca,
  VariacaoCriativa,
  claimsAutorizados,
  problemasDaEntregaCriativa,
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

// ── O portao da entrega ──────────────────────────────────────────────────────

/**
 * Estes testes nasceram de um buraco REAL: o ila:concluir validava extract
 * e generate e deixava o criativo — o job que gasta dinheiro — passar direto
 * para o inishJob. Descoberto ao exercitar o fluxo de ponta a ponta pela
 * primeira vez.
 */
/**
 * A folha de conferência que acompanha uma peça aprovada.
 *
 * Ela passou a ser exigida: "aprovada" afirma que alguém mediu, e sem a folha
 * ninguém consegue dizer O QUE foi medido. Um carimbo verde que não se audita é
 * pior que peça reprovada com motivo, porque a reprovada avisa e esta não.
 */
/**
 * Uma folha de conferência COMPLETA, com um veredito trocado quando se quer.
 *
 * O portão cobra a régua inteira: uma folha com uma regra só passava por
 * auditável enquanto a ausência das outras dez não aparecia em lugar nenhum.
 * Então as fixtures daqui também são completas — usar folha parcial nos testes
 * seria testar um portão que não é o que roda.
 */
const folhaCom = (
  trocas: Partial<
    Record<(typeof CODIGOS_DA_REGUA)[number], { estado: string; motivo: string }>
  > = {},
) =>
  CODIGOS_DA_REGUA.map((codigo) => ({
    codigo,
    titulo: `regra ${codigo}`,
    estado: trocas[codigo]?.estado ?? 'passou',
    motivo: trocas[codigo]?.motivo ?? '',
  }));

const folhaLimpa = folhaCom();

const entregaBoa = {
  variacoes: [
    {
      caminho: '02_exportados/peca-1.png',
      estado: 'aprovada',
      motivo: null,
      conferencia: folhaLimpa,
    },
  ],
  custoGasto: 150,
};

const pedidoBom = {
  marca: 'Orbis',
  tipo: 'imagem',
  formato: 'feed-1x1',
  imagem: { origem: 'gerar', descricaoParaGerar: 'uma esfera escura' },
  texto: { semTexto: true },
  variacoes: 1,
  tetoDeCreditos: 500,
};

const sempreExiste = () => true;

test('entrega inteira nao tem o que impedir', () => {
  const p = problemasDaEntregaCriativa({
    resultado: entregaBoa,
    pedido: pedidoBom,
    existe: sempreExiste,
  });
  assert.deepEqual(p, []);
});

test('aprovada cujo arquivo nao existe em disco NAO fecha', () => {
  // O schema garante que o caminho foi preenchido, nao que ele aponta para algo.
  // Botao de download que baixa 404 e pior que peca reprovada com motivo.
  const p = problemasDaEntregaCriativa({
    resultado: entregaBoa,
    pedido: pedidoBom,
    existe: () => false,
  });
  assert.equal(p.length, 1);
  assert.match(p.join('\n'), /não teria o que baixar/);
});

test('PROVA: aprovada SEM folha de conferencia nao fecha', () => {
  // O carimbo verde que ninguém consegue auditar. Enquanto a folha era
  // opcional, bastava escrever "aprovada" no arquivo para o job fechar.
  const p = problemasDaEntregaCriativa({
    resultado: {
      variacoes: [{ caminho: 'peca-1.png', estado: 'aprovada', motivo: null }],
      custoGasto: 10,
    },
    pedido: pedidoBom,
    existe: sempreExiste,
  });
  assert.equal(p.length, 1);
  assert.match(p.join('\n'), /sem folha de conferência/);
});

test('PROVA: aprovada com regra REPROVADA na folha nao fecha', () => {
  // O veredito contradizendo a própria medição é pior que não medir: alguém
  // olhou, viu que estava errado, e carimbou verde mesmo assim.
  const p = problemasDaEntregaCriativa({
    resultado: {
      variacoes: [
        {
          caminho: 'peca-1.png',
          estado: 'aprovada',
          motivo: null,
          conferencia: folhaCom({ C1: { estado: 'reprovou', motivo: 'saiu 1024×1024' } }),
        },
      ],
      custoGasto: 10,
    },
    pedido: pedidoBom,
    existe: sempreExiste,
  });
  assert.equal(p.length, 1);
  assert.match(p.join('\n'), /contradiz a medição/);
});

test('pendente na folha NAO impede fechar: e ressalva declarada, nao defeito', () => {
  const p = problemasDaEntregaCriativa({
    resultado: {
      variacoes: [
        {
          caminho: 'peca-1.png',
          estado: 'aprovada',
          motivo: null,
          conferencia: folhaCom({ C7: { estado: 'pendente', motivo: 'exige OCR' } }),
        },
      ],
      custoGasto: 10,
    },
    pedido: pedidoBom,
    existe: sempreExiste,
  });
  assert.deepEqual(p, []);
});

test('PROVA: o portao mede o ARQUIVO, e nao acredita na folha', () => {
  // A folha diz que a dimensão está certa. O arquivo diz outra coisa. Quem
  // decide é o arquivo — senão uma folha escrita à mão, ou um arquivo trocado
  // depois de conferido, passaria com o carimbo de alguém.
  const p = problemasDaEntregaCriativa({
    resultado: entregaBoa,
    pedido: pedidoBom,
    existe: sempreExiste,
    dimensaoDe: () => ({ largura: 1024, altura: 1024 }),
  });
  assert.equal(p.length, 1);
  assert.match(p.join('\n'), /1024×1024/);
  assert.match(p.join('\n'), /1080×1080/);
});

test('quando a medida bate, o portao segue', () => {
  const p = problemasDaEntregaCriativa({
    resultado: entregaBoa,
    pedido: pedidoBom,
    existe: sempreExiste,
    dimensaoDe: () => ({ largura: 1080, altura: 1080 }),
  });
  assert.deepEqual(p, []);
});

test('PROVA: aprovada que nao da para medir NAO fecha', () => {
  // "Não consegui medir" virava `continue`, em silêncio — o caminho pelo qual
  // um `.mp4` entregue como aprovado nunca tinha a dimensão conferida, e uma
  // imagem parada entregue como vídeo saía limpa.
  const p = problemasDaEntregaCriativa({
    resultado: entregaBoa,
    pedido: pedidoBom,
    existe: sempreExiste,
    dimensaoDe: () => null,
  });
  assert.equal(p.length, 1);
  assert.match(p.join('\n'), /não consigo medir/);
});

test('reprovada com arquivo ausente nao acusa: ela nao promete download', () => {
  const p = problemasDaEntregaCriativa({
    resultado: {
      variacoes: [{ caminho: null, estado: 'falhou', motivo: 'saldo zerou' }],
      custoGasto: 0,
    },
    pedido: pedidoBom,
    existe: () => false,
  });
  assert.deepEqual(p, []);
});

test('gasto acima do teto do PEDIDO nao fecha', () => {
  const p = problemasDaEntregaCriativa({
    resultado: { ...entregaBoa, custoGasto: 501 },
    pedido: pedidoBom,
    existe: sempreExiste,
  });
  assert.equal(p.length, 1);
  // O gasto E o teto aparecem na mensagem: "estourou" sem os dois números não
  // diz quanto faltou nem de quanto era o combinado.
  assert.match(p.join('\n'), /501/);
  assert.match(p.join('\n'), /500/);
  // Exatamente no teto passa: parar AO zerar e o contrato, nao antes dele.
  assert.deepEqual(
    problemasDaEntregaCriativa({
      resultado: { ...entregaBoa, custoGasto: 500 },
      pedido: pedidoBom,
      existe: sempreExiste,
    }),
    [],
  );
});

test('resultado fora do schema vira lista de problemas, nao excecao', () => {
  const p = problemasDaEntregaCriativa({
    resultado: { variacoes: [{ caminho: null, estado: 'aprovada', motivo: null }], custoGasto: 10 },
    pedido: pedidoBom,
    existe: sempreExiste,
  });
  assert.ok(p.length > 0, 'aprovada sem arquivo reprova no proprio schema');
  assert.ok(
    p.every((m) => m.startsWith('resultado.json')),
    'e a mensagem diz de onde veio',
  );
});

test('resultado que nao e objeto nenhum tambem e recusado sem estourar', () => {
  for (const lixo of [null, 'texto', 42, []]) {
    const p = problemasDaEntregaCriativa({
      resultado: lixo,
      pedido: pedidoBom,
      existe: sempreExiste,
    });
    assert.ok(p.length > 0, `a entrada ${JSON.stringify(lixo)} tinha de reprovar`);
  }
});
