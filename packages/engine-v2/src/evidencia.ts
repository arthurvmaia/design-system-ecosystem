import type { CapturedAsset, StackEntry } from '@ds/shared';
import type { FolhaExternaBundle } from './compiler/bundle.js';
import type { ScriptDecidido } from './compiler/runtime-local.js';
import type { RawJsInline } from './mapper/raw.js';

/**
 * A evidência que a segmentação e o compilador consomem e que NÃO mora no
 * manifesto — persistida para a Refinaria existir.
 *
 * O defeito estrutural que isto conserta: `segmentarPorEvidencia` é pura e
 * custa 19 a 213 ms, mas as entradas dela (`htmlPorHash`, `framePorHash` e os
 * insumos do compilador) morriam com o processo. Testar um limiar novo de
 * corte custava recapturar o acervo inteiro — 35 a 40 minutos de navegador
 * para exercitar uma função de milissegundos. Foi assim nesta própria reforma:
 * a Fase 3 precisou de QUATRO reextrações completas para provar consertos que
 * uma resegmentação offline teria provado em segundos.
 *
 * Com este arquivo ao lado do manifesto, `pnpm resegmentar` refaz o corte, os
 * segmentos E os bundles sem abrir navegador. O manifesto continua sendo a
 * medição; isto aqui é o insumo bruto que a medição consumiu.
 */
export type EvidenciaDaCaptura = {
  versao: 1;
  /** HTML capturado por hash de elemento — o DOM que a exploração viu. */
  htmlPorHash: Record<string, string>;
  /** Frames gravados por hash (caminhos relativos a capture-v2/). */
  framePorHash: Record<string, string>;
  /** Degraus de linguagem visual por hash. */
  tokensPorHash: Record<string, string[]>;
  /** URLs cujo download local deu certo. */
  assetsLocais: string[];
  scriptsNaoLocalizados: number;
  cssExternoFaltando: boolean;
  animacoesCssQueRodaram: string[];
  shadowFechados: number;

  // ── Insumos do compilador de bundles ──────────────────────────────────────
  cssInline: string;
  cssInlineOrdenado: Array<{ ordem: number; conteudo: string }>;
  cssExternos: FolhaExternaBundle[];
  assetsDeCss: CapturedAsset[];
  scriptsInline: RawJsInline[];
  scriptsDecididos: ScriptDecidido[];
  assets: CapturedAsset[];
  /** URL original → caminho local no diretório de assets da captura. */
  localPorUrl: Array<[string, string]>;
  stack: StackEntry[];
  finalUrl: string;
};
