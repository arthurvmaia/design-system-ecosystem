import assert from 'node:assert/strict';
import { test } from 'node:test';
import { divergenciasDaFolha } from './conferir.js';

/**
 * O confronto entre a FOLHA e a medição refeita.
 *
 * A folha é escrita pelo comando que produziu a marca, então ela sozinha não
 * prova nada: um `passou` gravado por um comando com defeito é indistinguível
 * de um verdadeiro. O `fila:concluir` refaz a régua sobre os arquivos, por quem
 * não produziu nada, e esta função julga o confronto.
 */
const v = (codigo: string, estado: string, motivo = 'porque sim') => ({ codigo, estado, motivo });

test('folha verde que a medicao REPROVA e o unico caso que acusa', () => {
  const d = divergenciasDaFolha(
    [v('M2', 'reprovou', 'a transparente tem fundo opaco')],
    [{ codigo: 'M2', estado: 'passou' }],
  );
  assert.equal(d.length, 1);
  assert.match(d[0] ?? '', /M2 passou na folha e REPROVA/);
  assert.match(d[0] ?? '', /a transparente tem fundo opaco/);
});

test('refeita PENDENTE nao acusa: nao medir nao e acusar', () => {
  // É o caso das regras da apresentação no fechamento — os dados delas não
  // existem ali, e chamar isso de reprovação seria inventar defeito.
  assert.deepEqual(
    divergenciasDaFolha([v('M7', 'pendente')], [{ codigo: 'M7', estado: 'passou' }]),
    [],
  );
});

test('folha que JA reprova nao vira divergencia: o portao ja recusa por ela', () => {
  assert.deepEqual(
    divergenciasDaFolha([v('M3', 'reprovou')], [{ codigo: 'M3', estado: 'reprovou' }]),
    [],
  );
});

test('folha conservadora nao e defeito', () => {
  // A medição aprova e a folha ficou em pendente. Ser cauteloso não é errar.
  assert.deepEqual(
    divergenciasDaFolha([v('M5', 'passou')], [{ codigo: 'M5', estado: 'pendente' }]),
    [],
  );
});

test('regra que a folha nem cita nao acusa aqui', () => {
  // Folha incompleta é problema, e quem o levanta é `problemasDaEntregaDeMarca`
  // ("regra que some da folha é regra que ninguém rodou"). Duas acusações para
  // o mesmo fato só fariam quem lê procurar dois consertos.
  assert.deepEqual(divergenciasDaFolha([v('M4', 'reprovou')], []), []);
});

test('varias divergencias saem todas, e cada uma diz o proprio motivo', () => {
  const d = divergenciasDaFolha(
    [
      v('M2', 'reprovou', 'fundo opaco'),
      v('M3', 'reprovou', 'meio-tom demais'),
      v('M5', 'passou'),
      v('M7', 'pendente'),
    ],
    [
      { codigo: 'M2', estado: 'passou' },
      { codigo: 'M3', estado: 'passou' },
      { codigo: 'M5', estado: 'passou' },
      { codigo: 'M7', estado: 'passou' },
    ],
  );
  assert.equal(d.length, 2, d.join(' | '));
  assert.match(d[0] ?? '', /fundo opaco/);
  assert.match(d[1] ?? '', /meio-tom demais/);
});
