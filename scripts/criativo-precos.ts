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

  const naoMedidos: string[] = [];
  for (const p of PRESETS) {
    for (const t of TRANSPORTES) {
      const r = TABELA[p.id]?.[t] ?? null;
      if (r === null) {
        naoMedidos.push(`${p.id} / ${t.toUpperCase()}`);
        console.log(`  ${p.id.padEnd(18)} ${t.toUpperCase().padEnd(5)} NÃO MEDIDO`);
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
  if (naoMedidos.length === 0) {
    console.log('Nada pendente de medição.');
  } else {
    console.log(`Pendente de medição (${naoMedidos.length}):`);
    for (const n of naoMedidos) console.log(`  ${n}`);
    console.log('');
    console.log('  O REST não tem endpoint de simulação de custo: medi-lo exige gastar.');
    console.log('  Até lá, o motor recusa produzir por ele em vez de copiar o número do MCP.');
  }
  console.log('');
};

if (executadoDireto(import.meta.url)) principal();
