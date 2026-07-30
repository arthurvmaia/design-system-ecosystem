import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { type MapaDeRecoloracao, type PecaComposta, compor, mapaDeRecoloracao } from '@ds/composer';
import type { KitDesignSystem } from '@ds/shared';
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
  /**
   * Não recolorir esta peça: ela mantém as cores do site de origem.
   *
   * O default é recolorir, MENOS para peça de fundo/efeito (`category:
   * 'background'` ou `kind: 'effect'`, decisão de quem monta a lista): um fundo
   * de neon foi escolhido PELA cor dele, e trocá-la pela paleta da marca
   * destruiria justamente o que a pessoa quis.
   *
   * Como o CSS é por origem e deduplicado, o opt-out é implementado com uma
   * origem-apelido (`<origem>::original`): a peça ganha escopo próprio com o
   * CSS sem recoloração. O custo — o CSS daquela origem em dobro QUANDO a mesma
   * origem também tem peças recoloridas — é declarado nos avisos.
   */
  manterCoresOriginais?: boolean;
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
  const origemBase = peca.designSystemId ?? peca.id;
  const semCompilador = removerScriptsQueCompilamCss(
    limparParaComposicao(extrairCorpo(documento)),
    peca.bundlePath,
  );
  return {
    // A origem-apelido `::original` dá à peça que não recolore um escopo
    // próprio, com o mesmo CSS sem transformação. Ver `manterCoresOriginais`.
    origem: peca.manterCoresOriginais === true ? `${origemBase}::original` : origemBase,
    html: semCompilador.corpo,
    css: lerCssDoBundle(peca.bundlePath).css,
    documentoAttrs: atributosDoDocumentoDaPeca(documento),
    scripts: scriptsExternosDoBundle(documento),
  };
};

/**
 * Remove do corpo da peça os `<script>` locais que COMPILAM CSS em runtime.
 *
 * O caso medido: o runtime do Tailwind CDN (407 KB) foi localizado para dentro
 * dos bundles pelo motor, e o corpo da peça o carrega como
 * `<script src="js/<hash>.js">`. No site COMPOSTO ele roda de novo, varre os
 * nomes de classe e injeta um `<style>` com as utilitárias recompiladas — com
 * os literais de cor ORIGINAIS, por cima da recoloração e do `marca.css`. A
 * página inteira volta às cores do site de origem sem nenhum erro aparecer.
 *
 * O CSS que ele compilaria JÁ ESTÁ nos arquivos do bundle (o coletor capturou
 * o CSSOM depois da página rodar; é o motivo de o bundle levar o CSS inteiro).
 * No site gerado, esse script é duplicação — e destrutiva.
 *
 * A detecção é por CONTEÚDO (`tailwindcss` no arquivo), não por nome: o hash
 * do arquivo muda por captura. Falso positivo exigiria um script de site que
 * cite "tailwindcss" no código — e ser removido do site GERADO (o bundle em si
 * não muda) é degradação aceitável, declarada no aviso.
 */
export const removerScriptsQueCompilamCss = (
  corpo: string,
  bundlePath: string,
): { corpo: string; removidos: string[] } => {
  const removidos: string[] = [];
  const saida = corpo.replace(
    /<script\b[^>]*\bsrc\s*=\s*"([^"]+)"[^>]*>\s*<\/script>/gi,
    (tag, src: string) => {
      if (/^(https?:)?\/\//i.test(src)) return tag; // remotos: outra regra cuida
      if (src.split(/[\/]/).includes('..')) return tag;
      try {
        const conteudo = readFileSync(join(bundlePath, src), 'utf8');
        if (/tailwindcss/i.test(conteudo)) {
          removidos.push(src);
          return `<!-- script de compilação de CSS removido na composição: ${src} -->`;
        }
      } catch {
        // arquivo ausente: o aviso de asset faltando já cobre
      }
      return tag;
    },
  );
  return { corpo: saida, removidos };
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
  opcoes?: {
    /**
     * O design system consolidado do kit (`kits.tokensJson`). Com ele, o CSS
     * de cada origem é recolorido: os literais dos clusters confiantes viram
     * `var(--marca-<papel>, literal)` e a paleta do usuário passa a mandar.
     * Sem ele, comportamento de sempre — as peças saem com as cores de origem,
     * e o aviso diz isso.
     */
    designSystem?: KitDesignSystem | null;
  },
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

  const ds = opcoes?.designSystem ?? null;
  let recoloracaoPorOrigem: Map<string, MapaDeRecoloracao> | undefined;
  const avisosExtras: string[] = [];
  if (ds !== null) {
    recoloracaoPorOrigem = new Map();
    for (const origem of ds.origens) {
      const mapa = mapaDeRecoloracao(origem.clusters);
      if (mapa.size > 0) recoloracaoPorOrigem.set(origem.designSystemId, mapa);
    }
    // As origens-apelido `::original` ficam FORA do mapa de propósito: é assim
    // que a peça com `manterCoresOriginais` escapa da recoloração mesmo
    // dividindo o site com peças recoloridas da mesma origem.
    const comOptOut = new Set(
      lidas.filter((l) => l.origem.endsWith('::original')).map((l) => l.origem),
    );
    for (const o of comOptOut) {
      const base = o.slice(0, -'::original'.length);
      if (recoloracaoPorOrigem.has(base)) {
        avisosExtras.push(
          `A origem ${base} aparece recolorida e no original ao mesmo tempo: o CSS dela viaja em dobro, um escopo para cada forma.`,
        );
      }
    }
  } else {
    avisosExtras.push(
      'Sem design system consolidado do kit: nenhuma peça foi recolorida, todas saem com as cores do site de origem.',
    );
  }

  const composto = compor(lidas, { recoloracaoPorOrigem });
  return { ...composto, avisos: [...composto.avisos, ...avisosExtras], faltando };
};
