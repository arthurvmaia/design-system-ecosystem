/**
 * Imprime o catálogo de presets e a tabela de preço — inclusive o que NÃO foi
 * medido.
 *
 * Uso: pnpm criativo:precos
 *
 * Existe porque as duas tabelas são o que impede os dois erros silenciosos do
 * motor: pedir o modelo errado (o slug `imagen-nano-banana-2` é o Nano Banana
 * **Pro**, não o 2) e gastar sem saber quanto. Uma tabela que ninguém consegue
 * ler não é conferida, e uma que não confessa os buracos parece completa.
 */
import {
  AVULSOS,
  MEDIDO_EM,
  PRESETS,
  type PresetVisual,
  TABELA,
  type Transporte,
  VALIDA_ATE,
  estimar,
  pendenciasDePreco,
} from '@ds/creative';
import { executadoDireto } from './executado-direto.js';

const TRANSPORTES: readonly Transporte[] = ['mcp', 'rest'];

const hojeISO = (): string => new Date().toISOString().slice(0, 10);

const diasEntre = (de: string, ate: string): number =>
  Math.round((Date.parse(ate) - Date.parse(de)) / 86_400_000);

const linhaDoPreset = (p: PresetVisual): string[] => {
  const linhas = [
    `  ${p.id.padEnd(18)} ${p.rotulo}${p.resolucao === null ? '' : ` · ${p.resolucao}`}`,
  ];
  for (const t of TRANSPORTES) {
    const id = p.identificador[t];
    linhas.push(`    ${t.toUpperCase().padEnd(5)} ${id ?? 'NÃO MEDIDO'}`);
  }
  linhas.push(`    proporções: MCP ${p.proporcoes.mcp.length} · REST ${p.proporcoes.rest.length}`);
  return linhas;
};

const principal = (): void => {
  const hoje = hojeISO();
  const faltam = diasEntre(hoje, VALIDA_ATE);

  console.log('');
  console.log(`Catálogo de presets — medido em ${MEDIDO_EM}`);
  console.log('');
  for (const p of PRESETS) {
    for (const l of linhaDoPreset(p)) console.log(l);
    console.log(`    ${p.paraQue}`);
    console.log('');
  }

  console.log(`Tabela de preço — medida em ${MEDIDO_EM}, válida até ${VALIDA_ATE}`);
  if (faltam < 0) {
    console.log(`  VENCIDA há ${-faltam} dia(s). O motor RECUSA produzir até alguém remedir.`);
  } else {
    console.log(`  Faltam ${faltam} dia(s) para vencer.`);
  }
  console.log('');

  for (const p of PRESETS) {
    for (const t of TRANSPORTES) {
      const r = TABELA[p.id]?.[t] ?? null;
      if (r === null) {
        /* e o rótulo diz QUAL das duas ausências é: "não medido" e "não dá para
           medir" pedem coisas diferentes de quem lê */
        const semEndpoint = p.identificador[t] === null;
        console.log(
          `  ${p.id.padEnd(18)} ${t.toUpperCase().padEnd(5)} ${semEndpoint ? 'SEM ENDPOINT' : 'NÃO MEDIDO'}`,
        );
        continue;
      }
      if (r.tipo === 'por-imagem') {
        const porRes = Object.entries(r.porResolucao)
          .map(([k, v]) => `${k} ${v}`)
          .join(' · ');
        console.log(
          `  ${p.id.padEnd(18)} ${t.toUpperCase().padEnd(5)} ${r.creditos} por imagem${
            porRes === '' ? '' : `  (${porRes})`
          }`,
        );
      } else {
        console.log(
          `  ${p.id.padEnd(18)} ${t.toUpperCase().padEnd(5)} ${r.creditosPorSegundo} por segundo  (+${r.adicionalAudio} com áudio)`,
        );
      }
    }
  }

  console.log('');
  console.log('Avulsos:');
  for (const [nome, creditos] of Object.entries(AVULSOS)) {
    console.log(`  ${nome.padEnd(18)} ${creditos}`);
  }

  console.log('');
  console.log('Exemplos, com a conta que o motor faria hoje:');
  const exemplos = [
    {
      rotulo: '2 variações de feed',
      p: {
        presetId: 'imagem-padrao',
        transporte: 'mcp' as const,
        quantidade: 2,
        resolucao: '2k',
        hoje,
      },
    },
    {
      rotulo: 'símbolo da marca',
      p: {
        presetId: 'imagem-marca',
        transporte: 'mcp' as const,
        quantidade: 1,
        resolucao: '2k',
        hoje,
      },
    },
    {
      rotulo: 'vídeo 8s com áudio',
      p: { presetId: 'video-curto', transporte: 'mcp' as const, segundos: 8, comAudio: true, hoje },
    },
    {
      rotulo: 'o mesmo feed pelo REST',
      p: { presetId: 'imagem-padrao', transporte: 'rest' as const, quantidade: 2, hoje },
    },
  ];
  for (const e of exemplos) {
    const r = estimar(e.p);
    console.log(
      `  ${e.rotulo.padEnd(26)} ${r.ok ? `${r.creditos} créditos` : `recusado — ${r.motivo}`}`,
    );
  }

  console.log('');
  /**
   * As duas ausências, SEPARADAS.
   *
   * Antes eram uma lista só, com "Pendente de medição (4)" na frente. Três
   * daquelas quatro linhas não esperam ninguém gastar: elas não têm
   * identificador REST, então não existe chamada a fazer. Somar as duas classes
   * faz a lista parecer uma fila de trabalho quando ela é, em três quartos, uma
   * limitação do transporte — e fila que ninguém consegue fazer envelhece até
   * virar paisagem.
   */
  const pendencias = pendenciasDePreco();
  const mensuraveis = pendencias.filter((p) => p.classe === 'mensuravel');
  const semEndpoint = pendencias.filter((p) => p.classe === 'sem-endpoint');

  if (pendencias.length === 0) {
    console.log('Nada pendente de medição.');
  }
  if (mensuraveis.length > 0) {
    console.log(`Dá para medir, e ninguém mediu (${mensuraveis.length}):`);
    for (const p of mensuraveis) console.log(`  ${p.presetId} / ${p.transporte.toUpperCase()}`);
    console.log('');
    console.log('  O REST não tem endpoint de simulação: medir exige uma chamada PAGA.');
    console.log('  E exige a chave REST (MAGNIFIC_API_KEY) no `.dev.vars` da frente de');
    console.log('  Lojas. A conta TEM uma; em 21/08/2026 ela não estava nesta máquina.');
    console.log('  Cuidado: o painel mostra a chave e o webhook secret lado a lado.');
  }
  if (semEndpoint.length > 0) {
    console.log('');
    console.log(`NÃO dá para medir daqui (${semEndpoint.length}):`);
    for (const p of semEndpoint) console.log(`  ${p.presetId} / ${p.transporte.toUpperCase()}`);
    console.log('');
    console.log('  Estes não têm identificador no transporte, então não existe chamada');
    console.log('  a fazer. Medir não é caro: é impossível. Não são fila de trabalho.');
  }
  console.log('');
  console.log('  Em qualquer um dos casos o motor RECUSA produzir por ali, em vez de');
  console.log('  copiar o número do outro transporte.');
  console.log('');
};

if (executadoDireto(import.meta.url)) principal();
