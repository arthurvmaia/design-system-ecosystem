import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  PISO_DE_CONTRASTE_DA_PECA,
  type VariacaoParaAceite,
  claimsNaoAutorizados,
  conferirVariacaoCriativa,
  ressalvasDaConferencia,
  rotuloDaConferencia,
  rotuloDaPeca,
} from './regras-de-aceite-criativo.js';

/**
 * A régua da peça criativa.
 *
 * O que ela existe para impedir é o carimbo verde: uma peça que sai "aprovada"
 * sem que ninguém tenha medido a dimensão, lido o texto ou conferido o
 * contraste. É o defeito mais caro de uma conferência, porque ele não parece
 * defeito — parece que está tudo bem.
 */

/** Uma variação sobre a qual NINGUÉM mediu nada. */
const NADA_MEDIDO: VariacaoParaAceite = {
  formato: 'feed-1x1',
  largura: null,
  altura: null,
  houvePixelGerado: true,
  headline: 'Aberto desde as sete',
  cta: null,
  textoRenderizado: null,
  caixasDosPapeis: null,
  marca: 'Café da Estação',
  menorContraste: null,
  hash: null,
  hashesIrmas: [],
  houveUpload: true,
  uploadPreservado: null,
  procedencia: null,
  tipografia: null,
};

/** Uma variação inteiramente medida e correta. */
const TUDO_MEDIDO: VariacaoParaAceite = {
  formato: 'feed-1x1',
  largura: 1080,
  altura: 1080,
  houvePixelGerado: false,
  headline: 'Aberto desde as sete',
  cta: 'Venha tomar um café',
  textoRenderizado: ['Café da Estação', 'Aberto desde as sete', 'Venha tomar um café'],
  caixasDosPapeis: [
    { papel: 'marca', esquerda: 65, topo: 700, direita: 400, base: 740, opacidade: 1 },
    { papel: 'headline', esquerda: 65, topo: 760, direita: 900, base: 900, opacidade: 1 },
    { papel: 'cta', esquerda: 65, topo: 940, direita: 460, base: 1010, opacidade: 1 },
  ],
  marca: 'Café da Estação',
  menorContraste: 7.2,
  hash: 'aaa',
  hashesIrmas: ['bbb'],
  houveUpload: true,
  uploadPreservado: true,
  procedencia: { modelo: 'imagen-nano-banana-2-flash', preset: 'imagem-padrao' },
  tipografia: { familia: null, aplicou: null },
};

test('PROVA: sem medicao nenhuma, NADA fica verde', () => {
  const r = conferirVariacaoCriativa(NADA_MEDIDO);
  const verdes = r.vereditos.filter((v) => v.estado === 'passou');
  assert.equal(
    verdes.length,
    0,
    `ausencia de medida virou aprovacao em: ${verdes.map((v) => v.codigo)}`,
  );
  assert.equal(r.comPendencia, true);
});

test('tudo medido e correto: aprovada, sem ressalva', () => {
  const r = conferirVariacaoCriativa(TUDO_MEDIDO);
  assert.equal(r.aprovado, true);
  assert.equal(
    r.comPendencia,
    false,
    JSON.stringify(r.vereditos.filter((v) => v.estado !== 'passou')),
  );
  assert.equal(rotuloDaPeca(r), 'aprovada');
});

test('C1: dimensao fora do formato reprova, com os dois numeros', () => {
  const r = conferirVariacaoCriativa({ ...TUDO_MEDIDO, largura: 1024, altura: 1024 });
  const c1 = r.vereditos.find((v) => v.codigo === 'C1');
  assert.equal(c1?.estado, 'reprovou');
  assert.match(c1?.motivo ?? '', /1024×1024/);
  assert.match(c1?.motivo ?? '', /1080×1080/);
});

test('C2: o texto literal pedido tem de estar na peca', () => {
  const r = conferirVariacaoCriativa({
    ...TUDO_MEDIDO,
    textoRenderizado: ['Café da Estação', 'Aberto desde as SETE horas'],
  });
  const c2 = r.vereditos.find((v) => v.codigo === 'C2');
  assert.equal(c2?.estado, 'reprovou');
  assert.match(c2?.motivo ?? '', /Venha tomar um café/);
});

test('PROVA C2: texto FORA do quadro reprova, mesmo estando no documento', () => {
  // O caso medido em Chromium: `banner-3x1` com headline de 176 caracteres. A
  // faixa cresceu para cima e a linha da marca terminou 601px ACIMA do topo do
  // quadro. `innerText` continuou devolvendo "Castevani", as dez regras ficaram
  // verdes, e a peça saiu sem marca nenhuma visível.
  const r = conferirVariacaoCriativa({
    ...TUDO_MEDIDO,
    formato: 'banner-3x1',
    largura: 1500,
    altura: 500,
    caixasDosPapeis: [
      { papel: 'marca', esquerda: 105, topo: -648, direita: 400, base: -601, opacidade: 1 },
      { papel: 'headline', esquerda: 105, topo: -564, direita: 1300, base: 269, opacidade: 1 },
      { papel: 'cta', esquerda: 105, topo: 307, direita: 480, base: 395, opacidade: 1 },
    ],
  });
  const c2 = r.vereditos.find((v) => v.codigo === 'C2');
  assert.equal(c2?.estado, 'reprovou');
  assert.match(c2?.motivo ?? '', /marca/, 'a régua tem de dizer QUAL papel ficou de fora');
  assert.match(c2?.motivo ?? '', /1500×500/);
  assert.equal(r.aprovado, false);
});

test('C2: texto que passa da borda de baixo ou da direita tambem reprova', () => {
  const embaixo = conferirVariacaoCriativa({
    ...TUDO_MEDIDO,
    caixasDosPapeis: [
      { papel: 'cta', esquerda: 65, topo: 1000, direita: 460, base: 1120, opacidade: 1 },
    ],
  });
  assert.equal(embaixo.vereditos.find((v) => v.codigo === 'C2')?.estado, 'reprovou');

  const naDireita = conferirVariacaoCriativa({
    ...TUDO_MEDIDO,
    caixasDosPapeis: [
      { papel: 'marca', esquerda: 65, topo: 700, direita: 1240, base: 740, opacidade: 1 },
    ],
  });
  assert.equal(naDireita.vereditos.find((v) => v.codigo === 'C2')?.estado, 'reprovou');
});

test('PROVA C2: sem a geometria medida, C2 fica PENDENTE — nunca verde', () => {
  // Era exatamente aqui que a régua mentia: ela lia o texto, achava tudo, e
  // dava verde sem nunca ter perguntado onde aquele texto estava.
  const r = conferirVariacaoCriativa({ ...TUDO_MEDIDO, caixasDosPapeis: null });
  const c2 = r.vereditos.find((v) => v.codigo === 'C2');
  assert.equal(c2?.estado, 'pendente');
  assert.match(c2?.motivo ?? '', /ONDE/);
  assert.equal(rotuloDaPeca(r), 'aprovada com ressalva');
});

test('PROVA C3: text-transform uppercase reprova a grafia da marca', () => {
  // O caso concreto: "iFood" vira "IFOOD" na tela e continua "iFood" no
  // documento. A grafia da marca é FATO, e maiúscula decidida pelo CSS não é
  // a grafia que o cliente digitou.
  const r = conferirVariacaoCriativa({
    ...TUDO_MEDIDO,
    marca: 'iFood',
    textoRenderizado: ['IFOOD', 'Aberto desde as sete', 'Venha tomar um café'],
  });
  const c3 = r.vereditos.find((v) => v.codigo === 'C3');
  assert.equal(c3?.estado, 'reprovou');
  assert.match(c3?.motivo ?? '', /text-transform/);
});

test('C4: contraste abaixo do piso reprova com o numero', () => {
  const r = conferirVariacaoCriativa({ ...TUDO_MEDIDO, menorContraste: 2.4 });
  const c4 = r.vereditos.find((v) => v.codigo === 'C4');
  assert.equal(c4?.estado, 'reprovou');
  assert.match(c4?.motivo ?? '', /2\.40/);
  assert.match(c4?.motivo ?? '', new RegExp(String(PISO_DE_CONTRASTE_DA_PECA)));
});

test('PROVA C4: texto translucido invalida o contraste DECLARADO', () => {
  // O número saía do par de cores escolhidas — 11,82:1 —, e a marca era
  // desenhada com `opacity:.85` sobre o trecho transparente de um degradê. O
  // pixel real media 2,51:1. A régua não amostra pixel, então ela confere a
  // CONDIÇÃO que torna o número verdadeiro.
  const r = conferirVariacaoCriativa({
    ...TUDO_MEDIDO,
    menorContraste: 11.82,
    caixasDosPapeis: [
      { papel: 'marca', esquerda: 65, topo: 700, direita: 400, base: 740, opacidade: 0.85 },
    ],
  });
  const c4 = r.vereditos.find((v) => v.codigo === 'C4');
  assert.equal(c4?.estado, 'reprovou');
  assert.match(c4?.motivo ?? '', /0\.85/);
  assert.match(c4?.motivo ?? '', /11\.82/, 'o motivo cita o número que deixou de valer');
});

test('PROVA C4: contraste NaN nao passa por baixo do piso', () => {
  // `NaN < 3` é `false`. Sem uma conferência explícita de finitude, cor que a
  // conta não consegue ler saía verde no lugar de pendente.
  const r = conferirVariacaoCriativa({ ...TUDO_MEDIDO, menorContraste: Number.NaN });
  const c4 = r.vereditos.find((v) => v.codigo === 'C4');
  assert.equal(c4?.estado, 'pendente');
  assert.match(c4?.motivo ?? '', /NaN/);
});

test('C4: sem geometria medida, o contraste declarado fica PENDENTE', () => {
  const r = conferirVariacaoCriativa({ ...TUDO_MEDIDO, caixasDosPapeis: null });
  assert.equal(r.vereditos.find((v) => v.codigo === 'C4')?.estado, 'pendente');
});

test('C5: perder o upload do cliente reprova', () => {
  const r = conferirVariacaoCriativa({ ...TUDO_MEDIDO, uploadPreservado: false });
  const c5 = r.vereditos.find((v) => v.codigo === 'C5');
  assert.equal(c5?.estado, 'reprovou');
  assert.match(c5?.motivo ?? '', /vence/);
});

test('C5: "nao houve upload" e "ninguem conferiu" sao coisas DIFERENTES', () => {
  // Enquanto os dois eram o mesmo `null`, a segunda ficava verde — e a régua
  // dava aprovação para o que ninguém tinha olhado.
  const semUpload = conferirVariacaoCriativa({
    ...TUDO_MEDIDO,
    houveUpload: false,
    uploadPreservado: null,
  });
  assert.equal(semUpload.vereditos.find((v) => v.codigo === 'C5')?.estado, 'passou');

  const naoConferido = conferirVariacaoCriativa({
    ...TUDO_MEDIDO,
    houveUpload: true,
    uploadPreservado: null,
  });
  assert.equal(naoConferido.vereditos.find((v) => v.codigo === 'C5')?.estado, 'pendente');
});

test('PROVA C6: duas variacoes identicas cobraram duas e entregaram uma', () => {
  const r = conferirVariacaoCriativa({ ...TUDO_MEDIDO, hash: 'aaa', hashesIrmas: ['aaa'] });
  const c6 = r.vereditos.find((v) => v.codigo === 'C6');
  assert.equal(c6?.estado, 'reprovou');
  assert.match(c6?.motivo ?? '', /cobrou duas/);
});

test('PROVA C7 e C8: com pixel gerado eles sao PENDENTES, nunca verdes', () => {
  const r = conferirVariacaoCriativa({ ...TUDO_MEDIDO, houvePixelGerado: true });
  for (const codigo of ['C7', 'C8']) {
    const v = r.vereditos.find((x) => x.codigo === codigo);
    assert.equal(v?.estado, 'pendente', `${codigo} nao pode ficar verde sem alguem olhar o pixel`);
  }
  assert.equal(rotuloDaPeca(r), 'aprovada com ressalva', 'a peca sai com a ressalva no nome');
});

test('sem pixel gerado, C7 e C8 passam: nao ha o que inventar', () => {
  const r = conferirVariacaoCriativa({ ...TUDO_MEDIDO, houvePixelGerado: false });
  assert.equal(r.vereditos.find((v) => v.codigo === 'C7')?.estado, 'passou');
  assert.equal(r.vereditos.find((v) => v.codigo === 'C8')?.estado, 'passou');
});

test('C9: peca sem procedencia nao e reproduzivel nem auditavel', () => {
  const r = conferirVariacaoCriativa({ ...TUDO_MEDIDO, procedencia: null });
  assert.equal(r.vereditos.find((v) => v.codigo === 'C9')?.estado, 'pendente');
});

test('PROVA C10: texto corrompido reprova, mesmo com C2 e C3 concordando', () => {
  // O caso que só apareceu ao OLHAR a peça: o CTA saiu "Ver a cole��o". C2 e
  // C3 comparam o renderizado com o pedido — se os dois vierem corrompidos, os
  // dois concordam e passam. Só um teste sobre o caractere de substituição pega
  // a classe inteira, venha a corrupção de onde vier.
  const r = conferirVariacaoCriativa({
    ...TUDO_MEDIDO,
    headline: 'Ver a cole��o',
    cta: null,
    textoRenderizado: ['Café da Estação', 'Ver a cole��o'],
  });
  const c2 = r.vereditos.find((v) => v.codigo === 'C2');
  const c10 = r.vereditos.find((v) => v.codigo === 'C10');
  assert.equal(c2?.estado, 'passou', 'C2 concorda: o pedido e a peça dizem a mesma coisa errada');
  assert.equal(c10?.estado, 'reprovou', 'e C10 é quem percebe que a coisa está errada');
  assert.match(c10?.motivo ?? '', /codificação/);
  assert.equal(r.aprovado, false);
});

test('C10 passa quando os acentos chegaram inteiros', () => {
  const r = conferirVariacaoCriativa(TUDO_MEDIDO);
  assert.equal(r.vereditos.find((v) => v.codigo === 'C10')?.estado, 'passou');
});

test('reprovada vence ressalva no rotulo', () => {
  const r = conferirVariacaoCriativa({ ...NADA_MEDIDO, largura: 10, altura: 10 });
  assert.equal(rotuloDaPeca(r), 'reprovada');
});

test('PROVA: o rotulo se deriva da FOLHA — a ressalva nao se perde no disco', () => {
  // O `estado` gravado só conhece três palavras, então "aprovada com ressalva"
  // colapsava em "aprovada" ao encostar no arquivo, e a tela dizia "3 de 3
  // aprovadas" sobre peças cujo C7 e C8 estavam explicitamente pendentes.
  const comPendencia = conferirVariacaoCriativa({ ...TUDO_MEDIDO, houvePixelGerado: true });
  assert.equal(rotuloDaConferencia(comPendencia.vereditos), 'aprovada com ressalva');
  assert.deepEqual(
    ressalvasDaConferencia(comPendencia.vereditos).map((v) => v.codigo),
    ['C7', 'C8'],
    'a tela precisa dizer QUAL pendência, não que existe uma',
  );

  const limpa = conferirVariacaoCriativa(TUDO_MEDIDO);
  assert.equal(rotuloDaConferencia(limpa.vereditos), 'aprovada');
  assert.deepEqual(ressalvasDaConferencia(limpa.vereditos), []);

  const reprovada = conferirVariacaoCriativa({ ...TUDO_MEDIDO, largura: 10, altura: 10 });
  assert.equal(rotuloDaConferencia(reprovada.vereditos), 'reprovada');
});

test('PROVA: peca SEM folha nao e peca aprovada', () => {
  // Peça anterior à régua. Chamar isso de "aprovada" seria dar o carimbo verde
  // pela ausência de medição, que é o defeito que esta régua inteira existe
  // para não cometer.
  assert.equal(rotuloDaConferencia(null), 'sem folha');
  assert.equal(rotuloDaConferencia(undefined), 'sem folha');
  assert.equal(rotuloDaConferencia([]), 'sem folha');
});

test('o rotulo derivado da folha e o mesmo que `rotuloDaPeca` calcula', () => {
  // Duas portas para a mesma verdade: se elas divergirem, a tela e o manifesto
  // passam a dizer coisas diferentes sobre a mesma peça.
  for (const v of [
    TUDO_MEDIDO,
    { ...TUDO_MEDIDO, houvePixelGerado: true },
    { ...TUDO_MEDIDO, largura: 10, altura: 10 },
    { ...TUDO_MEDIDO, caixasDosPapeis: null },
  ]) {
    const r = conferirVariacaoCriativa(v);
    assert.equal(rotuloDaConferencia(r.vereditos), rotuloDaPeca(r));
  }
});

test('PROVA: claim nao autorizado e barrado ANTES de gastar', () => {
  // Conferir isto depois da geração só serve para reprovar algo já pago.
  const achados = claimsNaoAutorizados({
    textos: ['Tudo por R$ 19,90', 'Frete grátis para todo o Brasil'],
    autorizacoes: {},
  });
  assert.equal(achados.length, 2);
  assert.match(achados.join(' '), /preço/);
  assert.match(achados.join(' '), /frete/);
});

test('o claim que o cliente DIGITOU pode aparecer', () => {
  const achados = claimsNaoAutorizados({
    textos: ['Tudo por R$ 19,90'],
    autorizacoes: { preco: 'R$ 19,90' },
  });
  assert.deepEqual(achados, []);
});

test('descricao de cena com numero nao vira claim', () => {
  const achados = claimsNaoAutorizados({
    textos: ['três pães na cesta, luz da manhã'],
    autorizacoes: {},
  });
  assert.deepEqual(achados, []);
});
