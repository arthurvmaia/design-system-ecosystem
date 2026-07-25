/**
 * Qual motor de extração roda.
 *
 * Existe para a migração V1 → V2 ser reversível sem editar código: o V2 substitui
 * o núcleo de descoberta/exploração/segmentação, e um site que o V2 processe pior
 * que o V1 precisa de um caminho de volta imediato enquanto a causa é
 * investigada.
 *
 * Fica em `@ds/shared` (e não dentro de um dos motores) porque quem consulta a
 * flag são os dois lados: os scripts da fila, o servidor e os testes de
 * comparação. Nenhum motor deve depender do outro para saber quem está no ar.
 *
 * `v2` é o padrão. `EXTRACTION_ENGINE=v1` volta ao motor legado.
 */

export type ExtractionEngine = 'v1' | 'v2';

/** O padrão do projeto. Mudou para `v2` quando o V2 passou os critérios de aceite. */
export const DEFAULT_ENGINE: ExtractionEngine = 'v2';

/**
 * Lê `EXTRACTION_ENGINE`. Valor desconhecido cai no padrão em vez de derrubar o
 * processo: uma variável digitada errada não deve impedir uma extração.
 */
export const resolveEngine = (raw = process.env.EXTRACTION_ENGINE): ExtractionEngine => {
  const v = (raw ?? '').trim().toLowerCase();
  if (v === 'v1' || v === '1' || v === 'legado' || v === 'legacy') return 'v1';
  if (v === 'v2' || v === '2') return 'v2';
  return DEFAULT_ENGINE;
};

/** Frase para o log, para ficar claro nos relatórios qual motor produziu o quê. */
export const rotuloEngine = (e: ExtractionEngine): string =>
  e === 'v2' ? 'motor V2 (composição)' : 'motor V1 (legado)';
