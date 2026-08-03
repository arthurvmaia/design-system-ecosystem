import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

/**
 * O ritmo do app vem do acervo — e este teste é o que impede a regra de voltar.
 *
 * O motor já media a duração dos sites trazidos, a rota já servia e o Shell já
 * escrevia `--orbis-duracao-rapida` e `--orbis-duracao-media` no `:root`. Só que
 * NINGUÉM lia: as declarações de `transition` traziam o tempo literal, então o
 * acervo governava a CURVA do app (`--ease-ds`, consumida em dezenove pontos) e
 * não governava o RITMO, que é a metade mais perceptível.
 *
 * Uma declaração nova com `0.25s` escrito à mão não quebra nada visível e
 * desfaz isso em silêncio. Por isso a regra é travada aqui, e não só descrita
 * no comentário do CSS.
 */

const GLOBALS = join(dirname(fileURLToPath(import.meta.url)), 'globals.css');

/**
 * As três exceções, com o motivo de cada uma.
 *
 * Enfeite permanente e a cortina da abertura não são resposta a nada: ninguém
 * clicou, ninguém focou, e o tempo delas é composição visual e não a velocidade
 * com que o app reage. O ritmo do acervo não as governa.
 */
const DECORATIVAS = [
  '.ds-marca-nucleo', // o núcleo da marca gira devagar de propósito
  '.ds-btn::before', // o brilho que atravessa o botão é enfeite, não a reação
  'opacity 0.8s', // a cortina preta da abertura
];

/**
 * A declaração INTEIRA, até o `;` — nunca a linha isolada.
 *
 * O formatador quebra `transition:` com três propriedades em duas linhas, e uma
 * varredura linha a linha só enxerga a primeira. Foi exatamente assim que
 * quatro literais sobreviveram à primeira passagem desta mudança: `box-shadow
 * 0.3s` estava na continuação, invisível para quem olhava só onde a declaração
 * começa.
 */
const declaracoesDeTransicao = (css: string): { linha: number; texto: string }[] => {
  const achados: { linha: number; texto: string }[] = [];
  const re = /transition:[^;]*;/g;
  let m: RegExpExecArray | null = re.exec(css);
  while (m !== null) {
    achados.push({
      linha: css.slice(0, m.index).split('\n').length,
      texto: m[0].replace(/\s+/g, ' '),
    });
    m = re.exec(css);
  }
  return achados;
};

test('toda transição de reação e de entrada lê a duração do acervo', () => {
  const css = readFileSync(GLOBALS, 'utf8');
  const comLiteral = declaracoesDeTransicao(css).filter((d) => /\d+(\.\d+)?s|\d+ms/.test(d.texto));

  // A regra de movimento reduzido é a única que PRECISA de literal: ela zera o
  // tempo por acessibilidade e não pode depender de número medido de fora.
  const inesperadas = comLiteral.filter(({ texto }) => !texto.includes('0.01ms'));

  const contexto = (linha: number): string =>
    css
      .split('\n')
      .slice(Math.max(0, linha - 12), linha)
      .join('\n');

  for (const { linha, texto } of inesperadas) {
    const perto = contexto(linha);
    const permitida = DECORATIVAS.some((d) => perto.includes(d) || texto.includes(d));
    assert.ok(
      permitida,
      `globals.css:${linha} tem tempo literal e não é decorativa:\n  ${texto.trim()}\nUse var(--duracao-rapida) para reação ou var(--duracao-media) para entrada.`,
    );
  }
});

test('as duas variáveis de duração têm consumidor de verdade', () => {
  const css = readFileSync(GLOBALS, 'utf8');
  for (const nome of ['--duracao-rapida', '--duracao-media']) {
    const usos = css.split(`var(${nome})`).length - 1;
    assert.ok(usos > 0, `${nome} é declarada e ninguém a consome — era exatamente o defeito`);
  }
});

test('o piso das durações é o ritmo que o tema já praticava', () => {
  const css = readFileSync(GLOBALS, 'utf8');
  // Sem acervo, o app tem de se mexer como antes desta mudança. Um piso menor
  // encurtaria o tema inteiro na primeira abertura de quem não tem acervo.
  assert.match(css, /--duracao-rapida:\s*var\(--orbis-duracao-rapida,\s*250ms\)/);
  assert.match(css, /--duracao-media:\s*var\(--orbis-duracao-media,\s*350ms\)/);
});
