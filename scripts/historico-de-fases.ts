/**
 * O custo REAL de cada fase nas capturas que já estão no acervo.
 *
 * A reserva de orçamento do motor prometia 48% do total às fases seguintes ao
 * percurso, e o acervo mediu o que elas custam de verdade: 15% a 20% disso.
 * Eram 150 a 210 segundos por captura prometidos a ninguém, enquanto a única
 * fase que precisava deles era cortada, ao milissegundo da fórmula, em 5 de 7
 * capturas. Este módulo lê a telemetria gravada nos manifests e devolve o p95
 * por fase — a promessa passa a ser o custo medido, com a folga aplicada pelo
 * próprio motor.
 *
 * Sem acervo (primeira captura da máquina), devolve undefined e o motor usa a
 * fração fixa: ninguém fica sem reserva.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { getRoot } from '@ds/shared';

/** p95 por interpolação simples. Vazio → undefined. */
export const p95 = (valores: readonly number[]): number | undefined => {
  if (valores.length === 0) return undefined;
  const ordenados = [...valores].sort((a, b) => a - b);
  const pos = Math.min(ordenados.length - 1, Math.ceil(ordenados.length * 0.95) - 1);
  return ordenados[Math.max(0, pos)];
};

type FaseMedida = { nome: string; ms: number; abortada?: boolean };

/**
 * Junta as fases de uma lista de relatórios de telemetria em p95 por fase.
 *
 * Fase ABORTADA não conta: o custo dela é o teto que a cortou, não o custo
 * real — usar esse número como histórico congelaria o corte para sempre.
 */
export const consolidarFases = (
  relatorios: ReadonlyArray<readonly FaseMedida[]>,
): Record<string, number> => {
  const porFase = new Map<string, number[]>();
  for (const fases of relatorios) {
    for (const f of fases) {
      if (f.abortada === true) continue;
      const lista = porFase.get(f.nome);
      if (lista === undefined) porFase.set(f.nome, [f.ms]);
      else lista.push(f.ms);
    }
  }
  const out: Record<string, number> = {};
  for (const [nome, valores] of porFase) {
    const v = p95(valores);
    if (v !== undefined) out[nome] = v;
  }
  return out;
};

/** Lê o histórico do acervo desta máquina. undefined quando não há acervo. */
export const historicoDeFasesDoAcervo = (): Record<string, number> | undefined => {
  const vault = join(getRoot(), 'vault');
  if (!existsSync(vault)) return undefined;
  const relatorios: FaseMedida[][] = [];
  for (const nome of readdirSync(vault)) {
    if (!nome.startsWith('ds_')) continue;
    const manifest = join(vault, nome, 'capture-v2', 'manifest.json');
    if (!existsSync(manifest)) continue;
    try {
      const raw = JSON.parse(readFileSync(manifest, 'utf8')) as {
        telemetry?: { fases?: FaseMedida[] };
      };
      if (Array.isArray(raw.telemetry?.fases)) relatorios.push(raw.telemetry.fases);
    } catch {
      // manifesto ilegível não derruba a conta dos outros
    }
  }
  if (relatorios.length === 0) return undefined;
  return consolidarFases(relatorios);
};
