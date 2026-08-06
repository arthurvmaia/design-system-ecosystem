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

/** Mediana. Vazio → undefined. */
export const mediana = (valores: readonly number[]): number | undefined => {
  if (valores.length === 0) return undefined;
  const ordenados = [...valores].sort((a, b) => a - b);
  return ordenados[Math.floor((ordenados.length - 1) / 2)];
};

type FaseMedida = { nome: string; ms: number; abortada?: boolean };

/**
 * Junta as fases de uma lista de relatórios de telemetria em MEDIANA por fase.
 *
 * Era p95, e o p95 realimentava: cada rodada com um site pesado engordava o
 * histórico, o histórico engordava a reserva (×1,5 por cima), e a reserva
 * esfomeava o percurso de TODOS os sites — medido: a reserva foi de 125 s para
 * 217 s em um dia de rodadas, e o teto do percurso caiu para 153 s, PIOR que
 * os 169 s da fórmula antiga. A mediana é o custo TÍPICO; a folga de metade no
 * motor já cobre o site acima do típico, e o teto absoluto pela fração (no
 * motor) garante que o histórico nunca reserva mais do que a regra antiga.
 *
 * Fase ABORTADA não entra na mediana: o custo dela é o teto que a cortou, não
 * o custo real — usar esse número como amostra congelaria o corte para sempre.
 * Mas ela vira PISO: uma fase cortada em 33 s custou PELO MENOS 33 s, e jogar
 * essa evidência fora deixava a mediana magra (só os sites leves opinavam), a
 * reserva encolhia e a fase passava fome de novo na rodada seguinte — o mesmo
 * ciclo da p95, com o sinal trocado. Medido no acervo: retratos cortado em
 * TODA rodada do site WebGL enquanto a captura terminava com 43 s sem dono.
 */
export const consolidarFases = (
  relatorios: ReadonlyArray<readonly FaseMedida[]>,
): Record<string, number> => {
  const porFase = new Map<string, number[]>();
  const pisoDeCorte = new Map<string, number>();
  for (const fases of relatorios) {
    for (const f of fases) {
      if (f.abortada === true) {
        pisoDeCorte.set(f.nome, Math.max(pisoDeCorte.get(f.nome) ?? 0, f.ms));
        continue;
      }
      const lista = porFase.get(f.nome);
      if (lista === undefined) porFase.set(f.nome, [f.ms]);
      else lista.push(f.ms);
    }
  }
  const out: Record<string, number> = {};
  for (const [nome, valores] of porFase) {
    const v = mediana(valores);
    if (v !== undefined) out[nome] = Math.max(v, pisoDeCorte.get(nome) ?? 0);
  }
  // Fase que SÓ aparece cortada: o piso é a única evidência que existe.
  for (const [nome, piso] of pisoDeCorte) {
    if (out[nome] === undefined) out[nome] = piso;
  }
  return out;
};

/**
 * Sobrepõe ao histórico do acervo o que ESTE site gastou na última captura.
 *
 * A mediana do acervo é o custo TÍPICO — e a recaptura de um site pesado não é
 * o caso típico: medido no site WebGL, retratos e estados custam o dobro da
 * mediana, a reserva ficava magra, o percurso comia o tempo livre inteiro e as
 * fases finais saíam cortadas rodada após rodada, com 40 s sobrando no fim.
 * Quem recaptura SABE quanto este site custou da última vez; ignorar isso era
 * reservar pelo site médio para pagar a conta do site caro. Fase abortada do
 * site entra como piso, pela mesma doutrina do `consolidarFases`.
 */
export const comPisoDoSite = (
  historico: Record<string, number> | undefined,
  dsId: string,
): Record<string, number> | undefined => {
  const manifest = join(getRoot(), 'vault', dsId, 'capture-v2', 'manifest.json');
  if (!existsSync(manifest)) return historico;
  let fases: FaseMedida[];
  try {
    const raw = JSON.parse(readFileSync(manifest, 'utf8')) as {
      telemetry?: { fases?: FaseMedida[] };
    };
    if (!Array.isArray(raw.telemetry?.fases)) return historico;
    fases = raw.telemetry.fases;
  } catch {
    return historico;
  }
  const out: Record<string, number> = { ...(historico ?? {}) };
  for (const f of fases) {
    if (typeof f.ms !== 'number' || f.ms <= 0) continue;
    out[f.nome] = Math.max(out[f.nome] ?? 0, f.ms);
  }
  return Object.keys(out).length > 0 ? out : historico;
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
