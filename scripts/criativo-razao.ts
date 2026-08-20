/**
 * O razão de crédito de um job criativo: ver, empenhar, debitar e liberar.
 *
 * Uso:
 *   pnpm criativo:razao ver <job_id>
 *   pnpm criativo:razao reservar <job_id> <referencia> <creditos>
 *   pnpm criativo:razao debitar  <job_id> <referencia> <creditos>
 *   pnpm criativo:razao liberar  <job_id> <referencia> "<motivo>"
 *
 * ## Por que isto é um comando, e não uma anotação mental
 *
 * O contrato manda parar ao zerar o teto, e o `fila:concluir` recusa fechar um
 * job cujo gasto passou dele. Entre uma coisa e outra existe a produção, que é
 * onde o crédito sai — e ali não havia registro nenhum: o custo aparecia só no
 * `resultado.json`, no fim, como número único e sem história.
 *
 * `reservar` é o passo que decide: ele confere ANTES de a chamada paga
 * acontecer, e recusa quando não cabe. Recusar é o resultado esperado; estourar
 * em silêncio é que seria defeito.
 *
 * ## O que ele não é
 *
 * Não é uma trava técnica. Quem produz é o agente, e nada o impede de chamar o
 * provedor direto. O que este comando garante é que, quando o caminho é
 * seguido, a conta existe, é conferível e sobrevive à sessão — e que a
 * divergência entre o registrado e o saldo real da conta apareça em vez de
 * passar batida.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  ArquivoDoRazao,
  type Lancamento,
  lerRazao,
  podeProduzir,
  reservaAberta,
} from '@ds/creative';
import { PedidoCriativo, criativoPedidoPath, criativosDir, ehJobId } from '@ds/shared';
import { executadoDireto } from './executado-direto.js';

const USO = `Uso:
  pnpm criativo:razao ver <job_id>
  pnpm criativo:razao reservar <job_id> <referencia> <creditos>
  pnpm criativo:razao debitar  <job_id> <referencia> <creditos>
  pnpm criativo:razao liberar  <job_id> <referencia> "<motivo>"`;

/**
 * Anotação no LADO ESQUERDO de propósito.
 *
 * O TypeScript só usa uma função que nunca retorna para estreitar o tipo do
 * que vem DEPOIS dela quando a anotação está na variável, não no valor. Com
 * `const morrer = (msg: string): never =>`, a chamada continua sendo só uma
 * chamada: tudo o que vem depois segue "possibly undefined", que é o oposto do
 * que este atalho existe para dizer.
 */
const morrer: (msg: string) => never = (msg) => {
  console.error(`\n  ${msg}\n`);
  process.exit(1);
};

const caminhoDoRazao = (jobId: string): string => join(criativosDir(jobId), 'razao.json');

const lerLancamentos = (jobId: string): Lancamento[] => {
  const arquivo = caminhoDoRazao(jobId);
  if (!existsSync(arquivo)) return [];
  try {
    return ArquivoDoRazao.parse(JSON.parse(readFileSync(arquivo, 'utf8'))).lancamentos;
  } catch (err) {
    return morrer(
      `O razão de ${jobId} está ilegível: ${err instanceof Error ? err.message : String(err)}. Não vou continuar por cima de um registro de dinheiro que não consigo ler.`,
    );
  }
};

/** Acrescenta um lançamento. Nunca reescreve os anteriores. */
const acrescentar = (jobId: string, novo: Lancamento): void => {
  const dir = criativosDir(jobId);
  mkdirSync(dir, { recursive: true });
  const lancamentos = [...lerLancamentos(jobId), novo];
  writeFileSync(
    caminhoDoRazao(jobId),
    JSON.stringify({ formato: 1, lancamentos }, null, 2),
    'utf8',
  );
};

const tetoDoPedido = (jobId: string): number => {
  const arquivo = criativoPedidoPath(jobId);
  if (!existsSync(arquivo)) {
    return morrer(
      `Não achei o pedido de ${jobId} (${arquivo}). Sem ele não há teto, e sem teto não há onde parar.`,
    );
  }
  const lido = PedidoCriativo.safeParse(JSON.parse(readFileSync(arquivo, 'utf8')));
  if (!lido.success) {
    return morrer(`O pedido de ${jobId} não passa no contrato: ${lido.error.issues[0]?.message}`);
  }
  return lido.data.tetoDeCreditos;
};

/** O teto desta rodada, se o dono declarou. Sem default de propósito. */
const tetoDoLote = (): number | null => {
  const bruto = process.env.ORBIS_CRIATIVO_TETO_LOTE;
  if (bruto === undefined || bruto.trim() === '') return null;
  const n = Number(bruto);
  return Number.isFinite(n) && n > 0 ? n : morrer(`ORBIS_CRIATIVO_TETO_LOTE inválido: "${bruto}".`);
};

const mostrar = (jobId: string): void => {
  const lancamentos = lerLancamentos(jobId);
  const r = lerRazao(lancamentos);
  const teto = tetoDoPedido(jobId);
  console.log('');
  console.log(`  Razão de ${jobId}`);
  console.log(`    teto do pedido : ${teto}`);
  console.log(`    gasto          : ${r.gasto}`);
  console.log(`    em voo         : ${r.empenhado}`);
  console.log(`    comprometido   : ${r.comprometido}  (resta ${teto - r.comprometido})`);
  if (lancamentos.length === 0) {
    console.log('    (nenhum lançamento ainda)');
  } else {
    console.log('');
    for (const l of lancamentos) {
      const quando = new Date(l.em).toISOString().replace('T', ' ').slice(0, 19);
      console.log(
        `    ${quando}  ${l.tipo.padEnd(9)} ${l.referencia.padEnd(14)} ${String(l.creditos).padStart(6)}${l.motivo === null ? '' : `  ${l.motivo}`}`,
      );
    }
  }
  console.log('');
};

const principal = (): void => {
  const [, , verbo, jobId, referencia, quarto] = process.argv;

  if (verbo === undefined || jobId === undefined) return void morrer(USO);
  if (!ehJobId(jobId)) return void morrer(`"${jobId}" não tem forma de id de job.`);

  if (verbo === 'ver') {
    mostrar(jobId);
    return;
  }

  if (referencia === undefined || referencia.trim() === '') {
    return void morrer(`Falta a referência (qual variação ou tentativa).\n\n${USO}`);
  }

  const agora = Date.now();

  if (verbo === 'liberar') {
    const motivo = (quarto ?? '').trim();
    if (motivo === '') {
      return void morrer(
        'Liberar exige motivo: uma reserva que some sem explicação é dinheiro que ninguém sabe se saiu.',
      );
    }
    const anterior = lerLancamentos(jobId).find(
      (l) => l.referencia === referencia && l.tipo === 'reserva',
    );
    if (anterior === undefined) {
      return void morrer(`Não há reserva para "${referencia}" em ${jobId}.`);
    }
    acrescentar(jobId, {
      tipo: 'liberacao',
      referencia,
      creditos: anterior.creditos,
      em: agora,
      motivo,
    });
    console.log(`\n  Liberados ${anterior.creditos} de "${referencia}": ${motivo}\n`);
    mostrar(jobId);
    return;
  }

  const creditos = Number(quarto);
  if (!Number.isFinite(creditos) || creditos <= 0) {
    return void morrer(`Créditos inválidos: "${quarto}".`);
  }

  if (verbo === 'reservar') {
    const lancamentos = lerLancamentos(jobId);
    // Reservar em cima de reserva aberta é dinheiro em voo que ninguém
    // consegue parear depois: qual desfecho fecha qual reserva?
    const aberta = reservaAberta(lancamentos, referencia);
    if (aberta !== null) {
      return void morrer(
        `Já há ${aberta} crédito(s) empenhado(s) para "${referencia}" sem desfecho. Debite (se o provedor cobrou) ou libere (se não cobrou) antes de empenhar de novo.`,
      );
    }
    const v = podeProduzir({
      lancamentos,
      custo: creditos,
      tetoDoPedido: tetoDoPedido(jobId),
      tetoDoLote: tetoDoLote(),
      // O saldo real da conta do provedor não é lido aqui: quem o alcança é o
      // agente, pelo MCP. Ele confere antes e depois do lote, e a divergência
      // vira achado. Fingir que este comando sabe seria pior que não saber.
      saldoReal: null,
    });
    if (!v.pode) return void morrer(v.motivo);

    acrescentar(jobId, { tipo: 'reserva', referencia, creditos, em: agora, motivo: null });
    console.log(`\n  Empenhados ${creditos} para "${referencia}". Pode produzir.\n`);
    mostrar(jobId);
    return;
  }

  if (verbo === 'debitar') {
    // Débito sem reserva aberta é gasto que ninguém empenhou — e, com retry de
    // terminal, é o jeito mais fácil de inventar um gasto que não houve.
    if (reservaAberta(lerLancamentos(jobId), referencia) === null) {
      return void morrer(
        `Não há reserva aberta para "${referencia}". Empenhe antes de debitar: debitar sem empenho é registrar um gasto que ninguém conferiu contra o teto.`,
      );
    }
    acrescentar(jobId, { tipo: 'debito', referencia, creditos, em: agora, motivo: null });
    console.log(`\n  Debitados ${creditos} de "${referencia}".\n`);
    mostrar(jobId);
    return;
  }

  return void morrer(`Verbo desconhecido: "${verbo}".\n\n${USO}`);
};

if (executadoDireto(import.meta.url)) principal();
