import type { AjusteDeCor, ClusterDeCor, PapelDeCor } from '@ds/shared';
import { CONFIANCA_MINIMA_PARA_RECOLORIR } from '@ds/shared';
import postcss from 'postcss';
import { coresDoValor } from './inventario.js';

/**
 * Recoloração: troca literais de cor por nomes que a marca controla.
 *
 * O defeito que isto conserta foi medido no primeiro site gerado de verdade:
 * o `marca.css` declarava 17 tokens (`--marca-*`) e as peças usavam ZERO — o
 * CSS de origem é utilitária Tailwind com a cor LITERAL dentro da regra
 * (`.bg-\[\#0D3C1F\]{background-color:rgb(13 60 31/var(--tw-bg-opacity,1))}`).
 * Vencer a cascata não adianta quando não existe variável para redefinir. A
 * saída é criar a variável NO PONTO DE USO:
 *
 *   `#0d3c1f`                     → `var(--marca-primary, #0d3c1f)`
 *   `rgb(13 60 31 / var(--x,1))`  → `rgb(from var(--marca-primary, #0d3c1f) r g b / var(--x,1))`
 *
 * Duas propriedades desse desenho carregam o contrato inteiro:
 *
 * - **O fallback é SEMPRE o literal original.** Marca ausente, token não
 *   atribuído, kit antigo: a peça degrada para a aparência de origem, nunca
 *   para quebrado.
 * - **Esta função NUNCA declara `--marca-*`, só consome.** É o que garante que
 *   o `:root` do `marca.css` alcança as peças por herança limpa: a origem não
 *   declara nada nesse namespace, então não há proxy no caminho para
 *   interceptar (o defeito de herança que o escopo tem com `--primary` não
 *   existe aqui POR CONSTRUÇÃO). Há teste para o invariante.
 *
 * E uma restrição herdada do inventário: a substituição anda pelos valores das
 * declarações com o MESMO tokenizador que os inventariou (`coresDoValor`), que
 * pula `url(...)` inteiro — um `#0d3c1f` dentro de um SVG em data-uri não é
 * cor da página e não pode ser tocado.
 */

/**
 * O destino de uma cor: o papel que ela assume e, quando o papel foi HERDADO
 * de um vizinho de matiz, a relação a preservar (ver `AjusteDeCor`).
 */
export type DestinoDaCor = { papel: PapelDeCor; ajuste: AjusteDeCor | null };

export type MapaDeRecoloracao = ReadonlyMap<string /* hexOpaco */, DestinoDaCor>;

export type ResultadoRecoloracao = {
  css: string;
  /** Quantas ocorrências viraram var(). */
  reescritas: number;
  /** Quantas ficaram como estavam (sem papel, sem confiança, ou já var()). */
  mantidas: number;
  avisos: string[];
};

/**
 * O mapa hexOpaco → papel de uma origem consolidada.
 *
 * Só entram clusters com papel E confiança acima do limiar compartilhado
 * (`CONFIANCA_MINIMA_PARA_RECOLORIR` mora no schema, ao lado do tipo, porque o
 * painel do kit mostra "este cluster será recolorido" com a MESMA régua).
 */
export const mapaDeRecoloracao = (clusters: readonly ClusterDeCor[]): MapaDeRecoloracao => {
  const mapa = new Map<string, DestinoDaCor>();
  for (const c of clusters) {
    if (c.papel === null || c.confianca < CONFIANCA_MINIMA_PARA_RECOLORIR) continue;
    const destino: DestinoDaCor = { papel: c.papel, ajuste: c.ajuste };
    for (const m of c.membros) {
      // Primeiro papel vence: um hex não pode servir a dois papéis, e a ordem
      // dos clusters já é a de peso.
      if (!mapa.has(m.hexOpaco)) mapa.set(m.hexOpaco, destino);
    }
  }
  return mapa;
};

/** `+ 0.12` ou `- 0.12`: `calc(l + -0.12)` não é CSS válido. */
const somaEmCalc = (n: number): string =>
  n < 0 ? `- ${Math.abs(n).toFixed(3)}` : `+ ${n.toFixed(3)}`;

/** A expressão recolorida de UM literal, dado o papel. */
const reescrever = (hexOpaco: string, alfa: string | undefined, destino: DestinoDaCor): string => {
  const fonte = `var(--marca-${destino.papel}, ${hexOpaco})`;
  const { ajuste } = destino;

  if (ajuste !== null) {
    // Cor DERIVADA: o papel foi herdado de um vizinho de matiz, e o que a
    // separa dele tem de sobreviver à troca. Em OKLCH isso é literal — a
    // luminância se desloca pelo mesmo tanto e o croma escala pela mesma
    // razão, agora em torno da cor da marca. É assim que um hover mais escuro
    // continua mais escuro depois de virar amarelo.
    const canais = `calc(l ${somaEmCalc(ajuste.deltaL)}) calc(c * ${ajuste.ratioC.toFixed(3)}) h`;
    return alfa === undefined
      ? `oklch(from ${fonte} ${canais})`
      : `oklch(from ${fonte} ${canais} / ${alfa})`;
  }

  return alfa === undefined
    ? fonte
    : // Sintaxe de cor relativa: preserva o alfa como expressão (pode ser um
      // var() do Tailwind) enquanto os canais vêm do token da marca. O
      // fallback dentro do var() mantém a degradação para o literal original.
      `rgb(from ${fonte} r g b / ${alfa})`;
};

export const recolorirCss = (css: string, mapa: MapaDeRecoloracao): ResultadoRecoloracao => {
  if (mapa.size === 0) {
    return { css, reescritas: 0, mantidas: 0, avisos: [] };
  }

  let raiz: postcss.Root;
  try {
    raiz = postcss.parse(css);
  } catch {
    return {
      css,
      reescritas: 0,
      mantidas: 0,
      avisos: ['CSS não parseou: a origem ficou com as cores originais.'],
    };
  }

  let reescritas = 0;
  let mantidas = 0;

  raiz.walkDecls((decl) => {
    // Idempotência: um valor que já consome --marca-* não é tocado de novo.
    // Sem esta guarda, recolorir duas vezes embrulharia o var() num var().
    if (decl.value.includes('--marca-')) {
      mantidas += coresDoValor(decl.value).length;
      return;
    }
    const cores = coresDoValor(decl.value);
    if (cores.length === 0) return;

    let valor = decl.value;
    for (const cor of cores) {
      const destino = mapa.get(cor.hexOpaco);
      if (destino === undefined) {
        mantidas++;
        continue;
      }
      const nova = reescrever(cor.hexOpaco, cor.alfa, destino);
      // Replace de UMA ocorrência do literal exato. O literal veio do próprio
      // valor, então ele existe; se o mesmo literal aparece duas vezes no
      // valor, o laço o encontra de novo na próxima cor da lista.
      const idx = valor.indexOf(cor.literal);
      if (idx >= 0) {
        valor = valor.slice(0, idx) + nova + valor.slice(idx + cor.literal.length);
        reescritas++;
      } else {
        mantidas++;
      }
    }
    decl.value = valor;
  });

  return { css: raiz.toString(), reescritas, mantidas, avisos: [] };
};
