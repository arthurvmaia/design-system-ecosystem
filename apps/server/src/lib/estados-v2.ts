/**
 * Resolve as referências de blob dos estados do motor V2.
 *
 * O V2 grava o HTML de cada estado UMA vez, em `vault/<ds>/capture-v2/states/`,
 * e o `segments/states/<segId>.json` só referencia (`htmlRef`/`portalHtmlRef`,
 * relativos a `capture-v2/`). Este módulo é o único ponto que transforma a
 * referência em conteúdo — usado pelo preview (para servir) e pelo validador
 * (para o `previewHash` refletir o blob: muda o blob, muda o hash, revalida).
 *
 * Estados do V1 (html inline) passam intocados: a resolução só acontece quando
 * o campo inline está vazio e existe referência.
 */
import { readFileSync } from 'node:fs';
import { resolve, sep } from 'node:path';
import { type DesignSystemId, type StoredState, vaultCaptureV2Dir } from '@ds/shared';

/**
 * Lê um blob referenciado, contendo o caminho dentro de `capture-v2/`.
 *
 * A referência vem de JSON em disco — um manifesto adulterado não pode virar
 * leitura arbitrária de arquivo, então o caminho resolvido é conferido contra a
 * própria pasta antes de qualquer `readFileSync`.
 */
const lerBlob = (dsId: DesignSystemId, ref: string | undefined): string | undefined => {
  if (ref === undefined || ref === '') return undefined;
  const base = resolve(vaultCaptureV2Dir(dsId));
  const alvo = resolve(base, ref);
  if (alvo !== base && !alvo.startsWith(base + sep)) return undefined;
  try {
    return readFileSync(alvo, 'utf8');
  } catch {
    return undefined;
  }
};

/** Um estado com as referências resolvidas — pronto para o runtime de replay. */
export const resolverEstadoV2 = (dsId: DesignSystemId, s: StoredState): StoredState => {
  const html = s.html !== '' ? s.html : (lerBlob(dsId, s.htmlRef) ?? '');
  const portalHtml = s.portalHtml ?? lerBlob(dsId, s.portalHtmlRef);
  return { ...s, html, portalHtml };
};

export const resolverEstadosV2 = (dsId: DesignSystemId, states: StoredState[]): StoredState[] =>
  states.map((s) => resolverEstadoV2(dsId, s));
