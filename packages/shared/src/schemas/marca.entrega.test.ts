import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CODIGOS_DA_REGUA_DE_MARCA } from '../regras-de-aceite-marca.js';
import { problemasDaEntregaDeMarca } from './marca.js';

/**
 * O PORTÃO da entrega da marca.
 *
 * Ele é o que impede um job pago de fechar calado — e este arquivo existe
 * porque ele não tinha teste nenhum, o que só apareceu quando o portão pegou
 * dois defeitos reais de uma vez no job de prova e não havia nada segurando o
 * conserto.
 */

const PEDIDO = {
  nome: 'Sorriso Vivo',
  oQueFaz: 'clínica odontológica de bairro',
  familia: 'decida-por-mim',
  tom: 'acolhedora',
  evitar: '',
  corPreferida: null,
  tetoDeCreditos: 825,
  estimativa: 825,
  preset: 'imagem-marca',
};

const RESULTADO = (custoGasto: number) => ({
  pecas: [{ peca: 'logotipo', caminho: 'logotipo.png', largura: 1024, altura: 1024 }],
  cor: { hex: '#0F4C81', decidida: 'cliente', motivo: '' },
  procedencia: { modelo: 'imagen-nano-banana-2', preset: 'imagem-marca' },
  promptDoSimbolo: 'um símbolo',
  conferencia: CODIGOS_DA_REGUA_DE_MARCA.map((codigo) => ({
    codigo,
    titulo: codigo,
    estado: 'passou' as const,
    motivo: '',
  })),
  custoGasto,
});

const conferir = (opts: {
  custoGasto: number;
  gasto: number;
  tetoEmVigor?: number;
}): string[] =>
  problemasDaEntregaDeMarca({
    resultado: RESULTADO(opts.custoGasto),
    pedido: PEDIDO,
    existe: () => true,
    temApresentacao: true,
    razao: { gasto: opts.gasto, empenhado: 0 },
    tetoEmVigor: opts.tetoEmVigor,
    codigosDaRegua: [...CODIGOS_DA_REGUA_DE_MARCA],
  });

test('a entrega em ordem fecha, sem problema nenhum', () => {
  assert.deepEqual(conferir({ custoGasto: 800, gasto: 800 }), []);
});

test('PROVA: custo do resultado que NAO bate com o razao reprova', () => {
  // O caso, com endereço: `marca:montar` grava o custo lendo o razão no momento
  // em que ele roda, e naquele momento só o símbolo tinha saído. Medido no job
  // de prova: o resultado dizia 75 e o razão 1425.
  const p = conferir({ custoGasto: 75, gasto: 1425, tetoEmVigor: 1425 });
  assert.equal(p.length, 1);
  assert.match(p[0] ?? '', /custo que os lançamentos não sustentam/);
});

test('PROVA: gasto acima do teto do RETRATO reprova quando ninguem liberou mais', () => {
  const p = conferir({ custoGasto: 900, gasto: 900 });
  assert.equal(p.length, 1);
  assert.match(p[0] ?? '', /passou do teto do pedido \(825\)/);
});

test('PROVA: o teto que o dono LIBEROU depois vale, e o retrato continua intocado', () => {
  // O retrato é gravado antes da fila e é isso que o torna uma trava. Mas o dono
  // pode liberar mais, e quando libera o aumento vira lançamento no razão com
  // data e motivo. Sem isto o portão recusava a entrega de um job cujo estouro
  // tinha autorização escrita — medido no job de prova: 1425 gastos, 825 de
  // retrato, 600 liberados um a um.
  assert.deepEqual(conferir({ custoGasto: 1425, gasto: 1425, tetoEmVigor: 1425 }), []);
});

test('PROVA: acima do teto EM VIGOR ainda reprova, e a frase diz os dois numeros', () => {
  // Liberar mais não é liberar tudo: o teto novo é um teto.
  const p = conferir({ custoGasto: 1500, gasto: 1500, tetoEmVigor: 1425 });
  assert.equal(p.length, 1);
  assert.match(p[0] ?? '', /teto em vigor \(1425 = 825 do retrato \+ 600 liberado/);
});

test('PROVA: folha INCOMPLETA reprova — regra que some e regra que ninguem rodou', () => {
  const p = problemasDaEntregaDeMarca({
    resultado: { ...RESULTADO(0), conferencia: [RESULTADO(0).conferencia[0]] },
    pedido: PEDIDO,
    existe: () => true,
    temApresentacao: true,
    codigosDaRegua: [...CODIGOS_DA_REGUA_DE_MARCA],
  });
  assert.equal(p.length, 1);
  assert.match(p[0] ?? '', /folha INCOMPLETA/);
});

test('PROVA: sem apresentacao nao fecha — marca sem apresentacao nao e marca pronta', () => {
  const p = problemasDaEntregaDeMarca({
    resultado: RESULTADO(0),
    pedido: PEDIDO,
    existe: () => true,
    temApresentacao: false,
    codigosDaRegua: [...CODIGOS_DA_REGUA_DE_MARCA],
  });
  assert.equal(p.length, 1);
  assert.match(p[0] ?? '', /não há apresentação em PDF/);
});

/**
 * O portão parou de acreditar na FOLHA nas perguntas que ele mesmo responde.
 *
 * Quem escreve `conferencia` é o mesmo comando que produziu a marca, então até
 * aqui o portão conferia o que o produtor DISSE. Um resultado com doze `passou`
 * digitados à mão passava inteiro — e, o caso realista, um comando com defeito
 * que gravasse `passou` numa regra que não chegou a avaliar passava igual.
 *
 * Duas perguntas dão para refazer sem abrir navegador: a MEDIDA do arquivo e a
 * EXISTÊNCIA da capa de cada coleção. Onde o disco responde, ele vence.
 */
test('PROVA: medida DECLARADA que nao bate com o arquivo reprova', () => {
  const p = problemasDaEntregaDeMarca({
    resultado: RESULTADO(800),
    pedido: PEDIDO,
    existe: () => true,
    // O arquivo tem 200 px e o resultado declara 1024: é assim que um logotipo
    // pequeno passa por logotipo de fachada, com M1 verde ao lado.
    medirImagem: () => ({ largura: 200, altura: 200 }),
    temApresentacao: true,
    razao: { gasto: 800, empenhado: 0 },
    codigosDaRegua: [...CODIGOS_DA_REGUA_DE_MARCA],
  });
  assert.equal(p.length, 1, p.join(' | '));
  assert.match(p[0] ?? '', /mede 200x200 em disco e o resultado declara 1024x1024/);
});

test('sem medidor, o portao faz o resto e nao inventa acusacao', () => {
  // Degradação honesta: quem não fornece o medidor perde ESTA conferência, e
  // só ela. Acusar sem ter olhado seria pior do que não olhar.
  assert.deepEqual(
    problemasDaEntregaDeMarca({
      resultado: RESULTADO(800),
      pedido: PEDIDO,
      existe: () => true,
      temApresentacao: true,
      razao: { gasto: 800, empenhado: 0 },
      codigosDaRegua: [...CODIGOS_DA_REGUA_DE_MARCA],
    }),
    [],
  );
});

test('arquivo que o medidor nao entende NAO vira problema', () => {
  // `null` é "não consegui medir", e é o que o SVG do logotipo devolve.
  assert.deepEqual(
    problemasDaEntregaDeMarca({
      resultado: RESULTADO(800),
      pedido: PEDIDO,
      existe: () => true,
      medirImagem: () => null,
      temApresentacao: true,
      razao: { gasto: 800, empenhado: 0 },
      codigosDaRegua: [...CODIGOS_DA_REGUA_DE_MARCA],
    }),
    [],
  );
});

test('PROVA: colecao decidida sem capa em disco reprova, e a folha verde vira acusacao', () => {
  const p = problemasDaEntregaDeMarca({
    resultado: {
      ...RESULTADO(800),
      colecoes: {
        nomes: ['Prevenção', 'Estética'],
        formato: 'quadrada',
        decididoPor: 'orbis',
      },
    },
    pedido: PEDIDO,
    // Só a de Prevenção existe. O acento e o espaço passam pelo slug do
    // contrato: é o MESMO nome que o recorte gravou.
    existe: (caminho) => caminho !== 'colecoes/estetica.png',
    temApresentacao: true,
    razao: { gasto: 800, empenhado: 0 },
    codigosDaRegua: [...CODIGOS_DA_REGUA_DE_MARCA],
  });
  assert.equal(p.length, 2, p.join(' | '));
  assert.match(p[0] ?? '', /coleção decidida e sem capa em disco: Estética/);
  // A contradição é dita à parte: "falta a capa" é um fato, "a folha jurou que
  // não faltava" é outro, e o segundo é o que desqualifica o resto da folha.
  assert.match(p[1] ?? '', /a folha diz que M12 PASSOU e o disco diz outra coisa/);
});

test('marca sem vitrine passa: nao ter colecao e uma resposta', () => {
  assert.deepEqual(
    problemasDaEntregaDeMarca({
      resultado: { ...RESULTADO(800), colecoes: null },
      pedido: PEDIDO,
      existe: () => true,
      temApresentacao: true,
      razao: { gasto: 800, empenhado: 0 },
      codigosDaRegua: [...CODIGOS_DA_REGUA_DE_MARCA],
    }),
    [],
  );
});
