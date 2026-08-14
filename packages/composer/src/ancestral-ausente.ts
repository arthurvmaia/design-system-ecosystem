import type { Rule } from 'postcss';
import selectorParser from 'postcss-selector-parser';
import { analisarCss } from './analisar-css.js';

/**
 * A regra que a origem qualificou por um ancestral que o RECORTE deixou para trás.
 *
 * Medido no site gerado: no celular a seção de tratamentos saía cortada, 72px
 * fora da tela. Não era responsivo faltando — a origem tinha a regra certa:
 *
 *     @media (max-width:980px){ #platform .split-section{grid-template-columns:1fr} }
 *
 * Só que a peça foi recortada de DENTRO do `#platform`, e no site composto aquele
 * id não existe. Toda regra que a origem qualificou por ele parou de casar,
 * inclusive a do breakpoint. O que sobrou foi uma regra sem qualificador
 * (`.split-section{5fr 6fr}`), que não tem versão de celular.
 *
 * É uma CLASSE de defeito, não um caso. Quem escreve CSS qualifica justamente os
 * overrides — o layout base vai solto e o ajuste de tela vem preso a uma seção.
 * O recorte então leva o layout base e deixa o ajuste para trás, e o sintoma é
 * sempre o mesmo: **funciona no desktop, quebra no celular.**
 *
 * ## O que esta função faz
 *
 * Dentro da folha JÁ ESCOPADA por origem, o qualificador de id que não existe em
 * lugar nenhum da página composta é solto: `#platform .split-section` volta a ser
 * `.split-section`. Um id ausente não pode estar qualificando outra coisa — ele
 * não casa com nada —, então soltá-lo não rouba nenhuma regra de ninguém.
 *
 * ## Por que só id, e não classe
 *
 * Id é único por página por definição: se ele não está lá, a regra é
 * comprovadamente morta. Classe ausente tem a mesma forma mas não a mesma
 * certeza — e soltar um qualificador de classe faria a regra alcançar irmãs que
 * a origem nunca quis. O caso seguro é o id.
 *
 * ## O que muda de especificidade, e por que isso funciona aqui
 *
 * Sair de `#x .y` (1,1,0) para `.y` (0,1,0) empata com as regras soltas, e a
 * ordem passa a decidir. Isso devolve a intenção da origem porque o autor
 * escreveu o específico DEPOIS do genérico — foi assim no caso medido: a regra
 * solta estava no começo da folha e as duas do `#platform` no fim.
 *
 * O que sobra sem âncora nenhuma (`#platform:hover` viraria `:hover`, que casa
 * com a página inteira) é DESCARTADO em vez de solto: relaxar ali trocaria uma
 * regra morta por uma regra que pinta o que não devia.
 */
export type ResultadoAncestral = {
  css: string;
  /** Seletores que perderam um qualificador de id ausente. */
  relaxados: number;
  /** Seletores descartados por não sobrar âncora nenhuma. */
  descartados: number;
};

const ANCORAS = new Set(['class', 'attribute', 'tag', 'id']);

/** O seletor sem os ids ausentes, ou `null` quando não sobra o que casar. */
const soltarNoSeletor = (
  seletor: string,
  presentes: ReadonlySet<string>,
): { seletor: string | null; mudou: boolean } => {
  let mudou = false;
  let descartou = false;
  const saida: string[] = [];
  try {
    selectorParser((raiz) => {
      raiz.each((sel) => {
        // Os nós entre combinadores formam um COMPOSTO — é nele que o id vive
        // junto do que ele qualifica.
        const compostos: selectorParser.Node[][] = [[]];
        const combinadores: string[] = [];
        for (const n of sel.nodes) {
          if (n.type === 'combinator') {
            compostos.push([]);
            combinadores.push(String(n));
            continue;
          }
          compostos[compostos.length - 1]?.push(n);
        }
        /**
         * Três destinos por composto, e a diferença entre os dois últimos é o
         * que separa consertar de estragar:
         *
         * - texto: fica como está, ou sem o id.
         * - `undefined`: o composto ERA só o id (`#platform`). Ele sai de cena e
         *   o resto do seletor continua — é o caso do ancestral perdido.
         * - `null`: sobrou algo que não ancora nada (`#platform:hover` viraria
         *   `:hover`, que casa com a página inteira). O seletor inteiro é
         *   descartado: melhor uma regra morta que uma regra solta.
         */
        const resultado = compostos.map((grupo): string | undefined | null => {
          const ausentes = grupo.filter((n) => n.type === 'id' && !presentes.has(n.value));
          if (ausentes.length === 0)
            return grupo
              .map((n) => String(n))
              .join('')
              .trim();
          mudou = true;
          const resto = grupo.filter((n) => !ausentes.includes(n));
          /**
           * O SUJEITO morto mata a regra — soltá-lo re-mira no ancestral.
           *
           * `#scroll-progress{transform:scaleX(0)}` (a barra de progresso de
           * 2px, que ficou fora do recorte) já escopado virou
           * `:where([data-ds-corpo="…"]){transform:scaleX(0)}` — e achatou para
           * LARGURA ZERO o corpo de TODAS as peças daquela origem. Medido no
           * kit Educação e curso: 4 seções invisíveis somando 4203px, 46% da
           * altura da página, e mais 4 kits com a mesma origem.
           *
           * O composto que era só o id ausente pode sair de cena quando é
           * ANCESTRAL (`#platform .card` → `.card`: o filho continua o
           * sujeito); quando é o ÚLTIMO composto, ele É o sujeito, e regra sem
           * sujeito não re-mira — morre, exatamente como a filosofia deste
           * arquivo já dizia: melhor uma regra morta que uma regra solta.
           */
          if (resto.length === 0) {
            return grupo === compostos[compostos.length - 1] ? null : undefined;
          }
          if (!resto.some((n) => ANCORAS.has(n.type))) return null;
          return resto
            .map((n) => String(n))
            .join('')
            .trim();
        });
        if (resultado.some((r) => r === null)) {
          descartou = true;
          return;
        }
        // O combinador à esquerda sai junto com o composto que sumiu; o primeiro
        // composto não tem combinador à esquerda, então o do lado direito é que
        // é descartado com ele.
        const pedacos: string[] = [];
        for (let i = 0; i < resultado.length; i++) {
          const r = resultado[i];
          // O `null` já saiu pelo retorno acima; a comparação existe para o
          // compilador enxergar o mesmo que a leitura enxerga.
          if (r === undefined || r === null) continue;
          if (pedacos.length > 0) pedacos.push(combinadores[i - 1] ?? ' ');
          pedacos.push(r);
        }
        const texto = pedacos.join('').trim();
        if (texto === '') {
          descartou = true;
          return;
        }
        saida.push(texto);
      });
    }).processSync(seletor);
  } catch {
    // Seletor que o parser não entende fica como estava: mexer no escuro é pior
    // que não mexer.
    return { seletor, mudou: false };
  }
  if (descartou && saida.length === 0) return { seletor: null, mudou: true };
  if (!mudou) return { seletor, mudou: false };
  return { seletor: saida.join(', '), mudou: true };
};

/**
 * Solta, na folha inteira, os qualificadores de id que a página composta não tem.
 *
 * `idsPresentes` sai do HTML já montado — é a única fonte que sabe o que sobrou
 * depois do recorte.
 */
export const soltarAncestraisAusentes = (
  css: string,
  idsPresentes: ReadonlySet<string>,
): ResultadoAncestral => {
  const analise = analisarCss(css);
  if ('erro' in analise) return { css, relaxados: 0, descartados: 0 };
  let relaxados = 0;
  let descartados = 0;
  analise.raiz.walkRules((regra: Rule) => {
    if (!regra.selector.includes('#')) return;
    const pai = regra.parent;
    if (pai !== undefined && pai.type === 'atrule') {
      const nome = (pai as { name: string }).name;
      if (/^(-\w+-)?keyframes$/i.test(nome)) return;
    }
    const novos: string[] = [];
    let mudouAlguma = false;
    for (const s of regra.selectors) {
      const r = soltarNoSeletor(s, idsPresentes);
      if (r.mudou) mudouAlguma = true;
      if (r.seletor === null) {
        descartados += 1;
        continue;
      }
      novos.push(r.seletor);
    }
    if (!mudouAlguma) return;
    if (novos.length === 0) {
      regra.remove();
      return;
    }
    regra.selector = novos.join(', ');
    relaxados += 1;
  });
  return { css: analise.raiz.toString(), relaxados, descartados };
};
