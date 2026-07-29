/**
 * Escolhe quais jobs da fila processar.
 *
 * Uso: pnpm fila:escolher <arquivo-de-saida>
 *
 * Mostra a fila numerada, pergunta o que processar e grava os ids escolhidos
 * (separados por vírgula) no arquivo indicado. Arquivo vazio significa
 * "cancelado" — quem chama deve tratar isso como "não rode nada".
 *
 * Existe porque a fila é acumulativa: um job que você não processou ontem
 * continua pendente hoje. Sem esta etapa, mandar processar arrastaria os
 * antigos junto, e reprocessar extração custa tempo e limite de uso à toa.
 */
import { writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline/promises';
import { clearLote, listPendingJobs, reportarProgresso, setLote } from '@ds/shared';

type Escolha = { tipo: 'cancelar' } | { tipo: 'ok'; indices: number[] };

const linha = (comando: string, texto: string): string => `    ${comando.padEnd(9)}${texto}`;

/**
 * As dicas saem do tamanho real da fila. Exemplo fixo citando job 3 quando só
 * existem 2 confunde mais do que ajuda.
 */
const dicas = (total: number): string[] => {
  if (total === 1) {
    return [linha('1', 'processa o job 1'), linha('Enter', 'cancela, não roda nada')];
  }

  const opcoes = [linha('1', 'só o job 1')];
  if (total === 2) {
    opcoes.push(linha('2', 'só o job 2'), linha('1 2', 'os dois'));
  } else {
    opcoes.push(
      linha(`1 ${total}`, `os jobs 1 e ${total}`),
      linha(`2-${total}`, `do 2 ao ${total}`),
    );
  }
  opcoes.push(linha('todos', 'a fila inteira'), linha('Enter', 'cancela, não roda nada'));
  return opcoes;
};

/** Interpreta o que a pessoa digitou. `invalido` pede para perguntar de novo. */
const interpretar = (entrada: string, total: number): Escolha | 'invalido' => {
  const texto = entrada.trim().toLowerCase();

  if (texto === '' || texto === 'c' || texto === 'cancelar') return { tipo: 'cancelar' };
  if (texto === 't' || texto === 'todos') {
    return { tipo: 'ok', indices: Array.from({ length: total }, (_, i) => i) };
  }

  const indices = new Set<number>();
  for (const parte of texto.split(/[\s,]+/).filter(Boolean)) {
    const faixa = parte.match(/^(\d+)-(\d+)$/);
    if (faixa !== null) {
      const inicio = Number(faixa[1]);
      const fim = Number(faixa[2]);
      if (!Number.isFinite(inicio) || !Number.isFinite(fim)) return 'invalido';
      if (inicio < 1 || fim > total || inicio > fim) return 'invalido';
      for (let n = inicio; n <= fim; n++) indices.add(n - 1);
      continue;
    }
    if (!/^\d+$/.test(parte)) return 'invalido';
    const n = Number(parte);
    if (n < 1 || n > total) return 'invalido';
    indices.add(n - 1);
  }

  if (indices.size === 0) return 'invalido';
  return { tipo: 'ok', indices: [...indices].sort((a, b) => a - b) };
};

const main = async (): Promise<void> => {
  const destino = process.argv[2];
  if (destino === undefined) {
    console.error('Uso: pnpm fila:escolher <arquivo-de-saida>');
    process.exit(1);
  }

  const pendentes = listPendingJobs();

  if (pendentes.length === 0) {
    console.log('\n  Fila vazia. Nada para processar.\n');
    writeFileSync(destino, '', 'utf8');
    return;
  }

  console.log(`\n  Fila: ${pendentes.length} pendente(s)\n`);
  pendentes.forEach((job, i) => {
    const idade = Math.round((Date.now() - job.createdAt) / 60000);
    console.log(`  ${i + 1}. ${job.label}`);
    console.log(`     ${job.id} · ${job.type} · há ${idade} min`);
  });

  console.log('\n  O que processar?\n');
  for (const dica of dicas(pendentes.length)) console.log(dica);
  console.log('\n  O que você escolher roda no Claude Code, na sua assinatura.');
  console.log('  Não gasta crédito de API, mas consome o limite de uso do plano.\n');

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  let escolha: Escolha | 'invalido' = 'invalido';
  while (escolha === 'invalido') {
    escolha = interpretar(await rl.question('  > '), pendentes.length);
    if (escolha === 'invalido') {
      console.log(`  Não entendi. Números de 1 a ${pendentes.length}, todos, ou Enter para sair.`);
    }
  }
  rl.close();

  if (escolha.tipo === 'cancelar') {
    console.log('\n  Cancelado. Nada foi processado.\n');
    writeFileSync(destino, '', 'utf8');
    // Sem isto, um lote abandonado de uma rodada anterior deixaria a barra de
    // progresso presa na tela para sempre.
    clearLote();
    return;
  }

  const jobs = escolha.indices.flatMap((i) => {
    const job = pendentes[i];
    return job === undefined ? [] : [job];
  });

  console.log(`\n  Vai processar ${jobs.length} de ${pendentes.length}:\n`);
  for (const job of jobs) console.log(`    - ${job.label}`);
  console.log('');

  const ids = jobs.map((j) => j.id);

  // Registra o lote antes de devolver os ids: é o denominador que a barra de
  // progresso da web usa para saber quanto falta desta rodada.
  setLote(ids);
  // Marca o começo agora, aqui, e não lá no processamento: o primeiro marco de
  // um job de geração pode demorar minutos, e até ele chegar a tela dizia que
  // nada estava rodando — bem enquanto o trabalho corria. Um por cento é a
  // diferença entre "escolhido" e "em andamento".
  for (const id of ids) reportarProgresso(id, 1);
  writeFileSync(destino, ids.join(','), 'utf8');
};

main();
