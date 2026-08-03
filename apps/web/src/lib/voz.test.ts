import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

/**
 * A voz do Orbis, travada onde ela pode ser conferida.
 *
 * O manifesto em `lib/orbis.ts` já dizia por escrito "sem travessão e sem tom de
 * máquina", e mesmo assim o travessão foi voltando: ele é confortável de
 * escrever e ninguém relê a regra antes de digitar uma frase. Um teste que
 * varre o disco é a diferença entre uma regra combinada e uma regra que vale.
 *
 * O molde é o dos testes de tema e de movimento, que já leem o front inteiro.
 *
 * ## O que fica de fora, e por quê
 *
 * Comentário de código não é texto de tela: ali o travessão é do programador
 * para o programador, e o pedido do dono era sobre a comunicação com quem usa.
 *
 * E existe um travessão que não é fala: o traço que significa "não sei este
 * número" na barra de topo e no painel da abertura. Ele é símbolo, não frase, e
 * trocá-lo por outro caractere só tornaria a ausência menos legível.
 */

const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = join(AQUI, '..');

/** Traço como SÍMBOLO de valor ausente. Não é o Orbis falando. */
const SIMBOLO_DE_AUSENCIA = [/\?\?\s*'—'/, /=\s*'—'/, />\{?\s*'—'\s*\}?</];

const arquivosDeTela = (dir: string, achados: string[] = []): string[] => {
  for (const item of readdirSync(dir, { withFileTypes: true })) {
    const caminho = join(dir, item.name);
    if (item.isDirectory()) {
      arquivosDeTela(caminho, achados);
      continue;
    }
    if (!/\.tsx?$/.test(item.name)) continue;
    if (/\.test\.tsx?$/.test(item.name)) continue;
    achados.push(caminho);
  }
  return achados;
};

/**
 * As linhas que são texto de verdade, sem as que são comentário.
 *
 * A varredura acompanha `/* *\/` e `{/* *\/}` para não confundir uma linha de
 * JSDoc no meio de um bloco com uma frase de tela.
 */
const linhasDeCodigo = (fonte: string): Array<{ n: number; texto: string }> => {
  const saida: Array<{ n: number; texto: string }> = [];
  let dentroDeBloco = false;
  fonte.split('\n').forEach((linha, i) => {
    const t = linha.trim();
    if (dentroDeBloco) {
      if (t.includes('*/')) dentroDeBloco = false;
      return;
    }
    if (t.startsWith('/*') || t.startsWith('{/*')) {
      if (!t.includes('*/')) dentroDeBloco = true;
      return;
    }
    if (t.startsWith('*') || t.startsWith('//')) return;
    saida.push({ n: i + 1, texto: linha });
  });
  return saida;
};

test('o front inteiro é lido, senão o teste não prova nada', () => {
  const arquivos = arquivosDeTela(RAIZ);
  assert.ok(arquivos.length > 60, `esperava o front inteiro, li ${arquivos.length} arquivos`);
});

test('nenhuma frase de tela usa travessão', () => {
  const ofensas: string[] = [];
  for (const arquivo of arquivosDeTela(RAIZ)) {
    const fonte = readFileSync(arquivo, 'utf8');
    if (!fonte.includes('—')) continue;
    for (const { n, texto } of linhasDeCodigo(fonte)) {
      if (!texto.includes('—')) continue;
      if (SIMBOLO_DE_AUSENCIA.some((p) => p.test(texto))) continue;
      ofensas.push(`${arquivo.replace(RAIZ, 'apps/web/src')}:${n}  ${texto.trim().slice(0, 90)}`);
    }
  }
  assert.deepEqual(
    ofensas,
    [],
    `travessão em texto de tela. Troque por vírgula, dois pontos ou ponto final:\n${ofensas.join('\n')}`,
  );
});
