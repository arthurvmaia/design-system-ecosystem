import { z } from 'zod';

/**
 * Contrato do acervo portátil (EXPORTAR-ACERVO.bat / IMPORTAR-ACERVO.bat).
 *
 * O banco guarda caminhos ABSOLUTOS da máquina de origem (`vault_path`,
 * `bundle_path`, `preview_path`, `dep_path`...). Levar o acervo para outra
 * máquina exige reescrever esses prefixos para a raiz de destino — este módulo
 * define o manifesto que viaja dentro do zip e os pares de substituição que o
 * importador aplica no banco e nos JSONs.
 */

export const FORMATO_ACERVO = 'ds-acervo/1';

/**
 * Itens de topo que entram no zip. Cache, workspace e fila ficam de fora de
 * propósito: são regeneráveis ou transitórios, e a fila de uma máquina não
 * significa nada na outra.
 */
export const ITENS_ACERVO = [
  'vault',
  'library',
  'projects',
  'ecosystem.db',
  'ecosystem.config.json',
] as const;

export const ManifestoAcervo = z.object({
  formato: z.literal(FORMATO_ACERVO),
  exportadoEm: z.string(),
  raizOrigem: z.string().min(1),
  plataforma: z.string(),
  contagens: z.object({
    designSystems: z.number().int().nonnegative(),
    componentes: z.number().int().nonnegative(),
    kits: z.number().int().nonnegative(),
    sites: z.number().int().nonnegative(),
  }),
});
export type ManifestoAcervo = z.infer<typeof ManifestoAcervo>;

/** Um par de substituição: toda ocorrência de `de` vira `para`. */
export type ParDeSubstituicao = { de: string; para: string };

/**
 * Pares de substituição de raiz, cobrindo as três formas em que um caminho
 * absoluto aparece num banco ou JSON:
 *
 *  - crua           `C:\Users\a\design-system-ecosystem`
 *  - JSON-escapada  `C:\\Users\\a\\design-system-ecosystem` (dentro de colunas
 *                   que guardam JSON serializado como texto)
 *  - barras normais `C:/Users/a/design-system-ecosystem` (código que
 *                   normalizou o separador)
 *
 * Em raízes POSIX as três formas coincidem; os pares são deduplicados por
 * `de`, então lá sobra um único par. As formas não colidem entre si: a agulha
 * crua não casa com texto escapado (as barras dobradas deslocam os
 * caracteres) e vice-versa, então a ordem de aplicação não importa.
 */
export const paresDeSubstituicao = (
  raizOrigem: string,
  raizDestino: string,
): ParDeSubstituicao[] => {
  const candidatos: ParDeSubstituicao[] = [
    { de: raizOrigem, para: raizDestino },
    {
      de: raizOrigem.replaceAll('\\', '\\\\'),
      para: raizDestino.replaceAll('\\', '\\\\'),
    },
    {
      de: raizOrigem.replaceAll('\\', '/'),
      para: raizDestino.replaceAll('\\', '/'),
    },
  ];
  const vistos = new Set<string>();
  return candidatos.filter((par) => {
    if (vistos.has(par.de)) return false;
    vistos.add(par.de);
    return true;
  });
};

/** Aplica todos os pares a um texto, substituindo todas as ocorrências. */
export const substituirRaiz = (texto: string, pares: ParDeSubstituicao[]): string => {
  let saida = texto;
  for (const { de, para } of pares) {
    saida = saida.split(de).join(para);
  }
  return saida;
};

/**
 * Escapa uma agulha para uso em LIKE '%...%' ESCAPE '!': `%` e `_` são
 * curingas do LIKE e um nome de usuário com `_` (joao_silva) geraria falso
 * positivo na verificação pós-reescrita.
 */
export const escaparParaLike = (agulha: string): string =>
  agulha.replaceAll('!', '!!').replaceAll('%', '!%').replaceAll('_', '!_');
