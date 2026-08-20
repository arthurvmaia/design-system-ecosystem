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
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import {
  ArquivoDoRazao,
  type Lancamento,
  lerRazao,
  podeProduzir,
  reservaAberta,
} from '@ds/creative';
import {
  PedidoCriativo,
  PedidoDeMarca,
  criativoPedidoPath,
  criativosDir,
  ehJobId,
  marcaDir,
  marcaPedidoPath,
} from '@ds/shared';
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

const caminhoDoRazao = (jobId: string): string => join(casaDoJob(jobId).dir, 'razao.json');

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

/**
 * Quanto tempo uma trava pode ficar de pé antes de ser considerada abandonada.
 *
 * Um lançamento é ler, somar um item e gravar: milissegundos. Trinta segundos é
 * ordens de grandeza acima disso, então uma trava mais velha que isto é de um
 * processo que morreu — e deixar o razão travado para sempre por causa de um
 * Ctrl+C seria trocar um problema raro por um garantido.
 */
const VALIDADE_DA_TRAVA_MS = 30_000;

/**
 * A seção crítica do razão.
 *
 * Acrescentar é READ-MODIFY-WRITE: lê os lançamentos, junta o novo e regrava o
 * arquivo inteiro. Dois processos fazendo isso ao mesmo tempo perdem um
 * lançamento — e o que se perde pode ser um DÉBITO, o que faz o razão declarar
 * menos gasto do que houve. É a única classe de erro aqui que produz um número
 * errado em vez de um erro visível.
 *
 * A trava é um arquivo criado com `wx`, que é atômico no sistema de arquivos.
 * Quem não conseguir criar espera; quem esperar demais reclama alto, em vez de
 * seguir e sobrescrever.
 */
const comTrava = <T>(jobId: string, acao: () => T): T => {
  const trava = `${caminhoDoRazao(jobId)}.trava`;
  let tenho = false;
  for (let tentativa = 0; tentativa < 3 && !tenho; tentativa += 1) {
    try {
      writeFileSync(trava, String(process.pid), { encoding: 'utf8', flag: 'wx' });
      tenho = true;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'EEXIST') throw err;
      // Trava de um processo que morreu não pode travar o razão para sempre.
      try {
        const idade = Date.now() - statSync(trava).mtimeMs;
        if (idade > VALIDADE_DA_TRAVA_MS) rmSync(trava, { force: true });
      } catch {
        // Sumiu entre o `wx` e o `stat`: a próxima volta pega.
      }
    }
  }
  if (!tenho) {
    return morrer(
      [
        `O razão de ${jobId} está travado por outro processo (${trava}).`,
        'Dois lançamentos ao mesmo tempo perderiam um dos dois, e o perdido pode ser um débito.',
        'Espere o outro terminar. Se não houver outro, apague o arquivo de trava.',
      ].join('\n  '),
    );
  }
  try {
    return acao();
  } finally {
    rmSync(trava, { force: true });
  }
};

/**
 * Acrescenta um lançamento. Nunca reescreve os anteriores.
 *
 * A gravação é em arquivo temporário seguido de `rename`, que é atômico: um
 * `writeFileSync` direto interrompido no meio deixa um JSON truncado, e
 * `lerLancamentos` se recusa (com razão) a continuar por cima de um registro de
 * dinheiro ilegível — o que travaria o job para sempre, com a arte já paga.
 */
const acrescentar = (jobId: string, novo: Lancamento): void =>
  comTrava(jobId, () => {
    const dir = casaDoJob(jobId).dir;
    mkdirSync(dir, { recursive: true });
    const lancamentos = [...lerLancamentos(jobId), novo];
    const destino = caminhoDoRazao(jobId);
    const temporario = `${destino}.novo`;
    writeFileSync(temporario, JSON.stringify({ formato: 1, lancamentos }, null, 2), 'utf8');
    renameSync(temporario, destino);
  });

/**
 * A CASA de um job: onde mora o pedido dele, e portanto o razão.
 *
 * O razão serve as duas frentes que gastam crédito. A peça criativa mora em
 * `criativos/<job>/` e a marca em `marcas/<job>/`, e são pastas diferentes de
 * propósito: uma marca não é peça — ela não tem canal, não vence, e é INSUMO do
 * site e da loja, então a faxina de criativos não pode levá-la junto.
 *
 * Um razão por frente seria duas contabilidades para o mesmo saldo, e a segunda
 * nasceria sem trava e sem teto. Aqui a conta é uma só, e ela descobre onde o
 * job vive pelo pedido que existe.
 */
const casaDoJob = (jobId: string): { readonly dir: string; readonly pedido: string } => {
  const comoCriativo = { dir: criativosDir(jobId), pedido: criativoPedidoPath(jobId) };
  if (existsSync(comoCriativo.pedido)) return comoCriativo;
  const comoMarca = { dir: marcaDir(jobId), pedido: marcaPedidoPath(jobId) };
  if (existsSync(comoMarca.pedido)) return comoMarca;
  return morrer(
    [
      `Não achei o pedido de ${jobId}.`,
      `Procurei em ${comoCriativo.pedido}`,
      `e em ${comoMarca.pedido}.`,
      'Sem pedido não há teto, e sem teto não há onde parar.',
    ].join('\n  '),
  );
};

const tetoDoPedido = (jobId: string): number => {
  const arquivo = casaDoJob(jobId).pedido;
  const cru: unknown = JSON.parse(readFileSync(arquivo, 'utf8'));
  // Os dois contratos declaram `tetoDeCreditos`, e é só ele que interessa aqui.
  // Qual dos dois validar não muda a conta, e adivinhar pela pasta traria um
  // ramo a mais que reprovaria pedido legítimo da outra frente.
  const comoCriativo = PedidoCriativo.safeParse(cru);
  if (comoCriativo.success) return comoCriativo.data.tetoDeCreditos;
  const comoMarca = PedidoDeMarca.safeParse(cru);
  if (comoMarca.success) return comoMarca.data.tetoDeCreditos;
  return morrer(
    `O pedido de ${jobId} não passa em nenhum dos dois contratos: ${comoCriativo.error.issues[0]?.message}`,
  );
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
