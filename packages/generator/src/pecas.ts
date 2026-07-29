import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { type PecaComposta, compor } from '@ds/composer';
import { lerCssDoBundle } from './cascata.js';
import { atributosDoDocumentoDaPeca, extrairCorpo, limparParaComposicao } from './montagem.js';

/**
 * Ler uma peça do disco pronta para compor — a ponte entre o bundle e o
 * `@ds/composer`.
 *
 * Existe por causa de uma regressão que a remoção da poda criou, e que quase
 * passou. Enquanto o `isolateComponent` cortava o CSS de cada componente para
 * "só o que ele usa", juntar dois componentes num site era seguro: as folhas
 * eram pequenas e quase não se encontravam. Era o que a instrução do modo fila
 * dizia, e estava certo — "componentes não colidem entre si".
 *
 * Com o CSS inteiro da página de origem viajando em cada bundle (que é o que
 * faz a peça sair igual ao original), a frase virou falsa. Dois sites feitos com
 * utilitários definem `.flex`, `.container`, `.p-6` e os tokens de `:root` cada
 * um do seu jeito. Quem carregar por último apaga o outro, e o site sai com
 * metade das peças erradas sem nenhum erro aparecer.
 *
 * O modo `api` recebeu o escopo dentro do gerador. O modo `queue` — que é o que
 * a pessoa de fato usa — monta o site à mão, seguindo o `CLAUDE.md`, e ficaria
 * sem. Esta função é o que torna a instrução de lá uma linha em vez de um
 * parágrafo de cuidados.
 */

/** O que se sabe de uma peça antes de compor. */
export type PecaDoKit = {
  /** Id do componente (`cmp_...`). Vira o namespace dos assets. */
  id: string;
  /** Diretório do bundle em disco. */
  bundlePath: string;
  /**
   * O design system de origem. É por ORIGEM que o escopo é feito, não por peça:
   * duas peças do mesmo site compartilham o CSS e precisam da mesma âncora.
   * Ausente, a peça responde por si (isola igual, com mais CSS repetido).
   */
  designSystemId?: string | null;
};

/**
 * Lê um bundle e devolve a peça pronta para `compor`.
 *
 * O corpo sai do `<body>` (bundles V2 são documentos completos), sem os avisos
 * internos da Galeria e sem os `<link>` de estilo — o CSS entra pela composição,
 * não por referência.
 */
export const lerPecaDoBundle = (peca: PecaDoKit): PecaComposta | null => {
  const indexPath = join(peca.bundlePath, 'index.html');
  if (!existsSync(indexPath)) return null;
  const documento = readFileSync(indexPath, 'utf8');
  return {
    origem: peca.designSystemId ?? peca.id,
    html: limparParaComposicao(extrairCorpo(documento)),
    css: lerCssDoBundle(peca.bundlePath).css,
    documentoAttrs: atributosDoDocumentoDaPeca(documento),
    scripts: scriptsExternosDoBundle(documento),
  };
};

/** Os `<script src>` externos que o bundle declara, na ordem do documento. */
const scriptsExternosDoBundle = (html: string): string[] => {
  const out: string[] = [];
  for (const m of html.matchAll(/<script\b[^>]*\bsrc\s*=\s*"([^"]+)"/gi)) {
    const src = m[1];
    if (src === undefined || src.length === 0) continue;
    // Só os remotos: os locais do bundle são copiados para `assets/<cmp>/` e
    // referenciados de lá, então repeti-los aqui produziria carga dupla.
    if (!/^(https?:)?\/\//i.test(src)) continue;
    if (!out.includes(src)) out.push(src);
  }
  return out;
};

/**
 * Lê e compõe as peças de um kit num passo só.
 *
 * É a chamada única que o modo `queue` faz. Devolve o CSS já escopado por
 * origem, o HTML de cada peça já vestido nos dois proxies, e os scripts
 * externos deduplicados.
 *
 * Peça sem bundle em disco entra em `faltando` em vez de derrubar a composição:
 * um site com uma seção a menos é recuperável, um erro no meio da geração não.
 */
export const comporPecasDoKit = (
  pecas: readonly PecaDoKit[],
): ReturnType<typeof compor> & { faltando: string[] } => {
  const faltando: string[] = [];
  const lidas: PecaComposta[] = [];
  for (const p of pecas) {
    const lida = lerPecaDoBundle(p);
    if (lida === null) {
      faltando.push(p.id);
      continue;
    }
    lidas.push(lida);
  }
  return { ...compor(lidas), faltando };
};
