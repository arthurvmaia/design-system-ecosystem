import postcss, { type AtRule, type Rule } from 'postcss';
import selectorParser from 'postcss-selector-parser';

/**
 * Escopar o CSS de uma origem sem mexer na cascata dela.
 *
 * O problema começa quando o kit mistura peças de sites diferentes. Cada peça
 * traz o CSS **inteiro** da página de origem — que é o que faz a peça sair igual
 * ao original. Mas duas páginas feitas com utilitários definem `.flex`, `.p-6` e
 * `.text-white` cada uma do seu jeito, e a segunda a carregar apaga a primeira.
 * O site sai com metade das peças erradas, e nada no arquivo indica o motivo.
 *
 * A resposta é prefixar cada regra com uma âncora da origem. E aí vem a parte
 * que não é óbvia: **prefixar sobe a especificidade**.
 *
 * `.card` vale (0,1,0). `[data-ds-raiz="ds_x"] .card` vale (0,2,0). Com o CSS
 * inteiro subindo um degrau, o `assets/marca.css` — que é o que aplica a
 * identidade do usuário e vence hoje por ser o último da cascata — passa a
 * perder em todo lugar de uma vez. Sem erro nenhum: as cores do usuário
 * simplesmente não aparecem.
 *
 * Por isso a âncora entra dentro de **`:where()`**, que tem especificidade
 * ZERO por contrato. `:where([data-ds-raiz="ds_x"]) .card` continua valendo
 * (0,1,0). A origem fica isolada, a ordem interna dela sobrevive intacta, e a
 * marca continua vencendo por ser a última — sem um `!important` sequer.
 *
 * O que este arquivo NÃO faz, de propósito:
 *
 * - **Não toca em custom properties.** `--cor-x` não é global: é herdada. Basta
 *   escopar o `:root` para a colisão sumir sozinha.
 * - **Não renomeia nomes globais sem colisão.** Renomear `@keyframes girar` em
 *   toda origem produziria um diff enorme e quebraria `animation: girar` escrito
 *   em `style=""` inline, que ninguém reescreve. Só o que colide é renomeado.
 */

/** O que o escopo produziu, para o chamador declarar no manifesto. */
export type ResultadoEscopo = {
  css: string;
  /** Regras cujo seletor foi reescrito. */
  reescritas: number;
  /** Nomes globais renomeados por colisão: `@keyframes`, `@font-face`, `@layer`. */
  renomeados: Array<{ tipo: 'keyframes' | 'font-face' | 'layer'; de: string; para: string }>;
  /** O que não pôde ser feito — nunca escondido. */
  avisos: string[];
};

export type OpcoesEscopo = {
  /** Atributo-âncora que representa o `<html>` da origem. */
  raiz: string;
  /** Atributo-âncora que representa o `<body>` da origem. */
  corpo: string;
  /**
   * Nomes globais já usados por outras origens. O que colidir é renomeado com
   * o sufixo da origem; o que não colidir fica como está.
   */
  nomesUsados?: {
    keyframes?: ReadonlySet<string>;
    fontFace?: ReadonlySet<string>;
    layer?: ReadonlySet<string>;
  };
  /** Sufixo de desempate — normalmente o id da origem. */
  sufixo: string;
};

/** Seletores que miram o documento e viram a âncora correspondente. */
const ANCORA_DE = (raiz: string, corpo: string): Record<string, string> => ({
  ':root': `:where([${raiz}])`,
  html: `:where([${raiz}])`,
  body: `:where([${corpo}])`,
});

/**
 * Reescreve um seletor para dentro do escopo.
 *
 * Três casos, e cada um existe por um motivo medido:
 *
 * 1. **`:root`, `html`, `body`** viram a âncora direta. Sem isso, os tokens de
 *    `:root` de duas origens colidiriam no documento do site gerado — e é
 *    exatamente onde moram as cores.
 * 2. **`html.dark .card`** vira `:where([raiz].dark) .card`: o qualificador
 *    acompanha a âncora. Perder o `.dark` transformaria um seletor de tema em
 *    seletor global.
 * 3. **Qualquer outro** ganha a âncora do corpo à esquerda.
 *
 * `@keyframes` não passa por aqui: `from`/`to`/`50%` são passos, não seletores.
 */
export const escoparSeletor = (seletor: string, opts: { raiz: string; corpo: string }): string => {
  const ancoras = ANCORA_DE(opts.raiz, opts.corpo);

  /** `html`, `body` ou `:root`? Devolve o nome canônico, ou null. */
  const nomeDeDocumento = (n: selectorParser.Node): string | null => {
    if (n.type === 'pseudo' && n.value === ':root') return ':root';
    if (n.type === 'tag' && (n.value === 'html' || n.value === 'body')) return n.value;
    return null;
  };

  const transform = selectorParser((raizSel) => {
    raizSel.each((sel) => {
      // 1. Troca TODA âncora de documento, em qualquer posição.
      //
      // Trocar só a primeira deixava `html.dark body .card` virar
      // `:where([raiz].dark) body .card` — com um `<body>` literal que não
      // existe dentro dos proxies. A regra ficava íntegra e não casava com
      // nada: o pior tipo de falha, porque nada some do arquivo.
      let trocouAlguma = false;
      for (const n of [...sel.nodes]) {
        const nome = nomeDeDocumento(n);
        if (nome === null) continue;
        const ancora = ancoras[nome] ?? `:where([${opts.corpo}])`;
        // Os qualificadores colados (classe, atributo, pseudo) entram DENTRO
        // do `:where`, junto da âncora — é o que preserva `html.dark`,
        // `body[data-tema]` e afins como seletores de tema.
        const colados: string[] = [];
        let seguinte = n.next();
        while (
          seguinte !== undefined &&
          (seguinte.type === 'class' ||
            seguinte.type === 'attribute' ||
            seguinte.type === 'pseudo' ||
            seguinte.type === 'id')
        ) {
          colados.push(String(seguinte));
          const proximo = seguinte.next();
          seguinte.remove();
          seguinte = proximo;
        }
        const dentro = ancora.replace(/\)$/, `${colados.join('')})`);
        n.replaceWith(selectorParser.string({ value: dentro }));
        trocouAlguma = true;
      }
      if (trocouAlguma) return;

      // 2. Seletor sem âncora de documento: prefixa com a do corpo.
      sel.prepend(selectorParser.combinator({ value: ' ' }));
      sel.prepend(selectorParser.string({ value: `:where([${opts.corpo}])` }));
    });
  });
  try {
    return transform.processSync(seletor);
  } catch {
    // Seletor que o parser não entende fica como estava: escopar errado é pior
    // que não escopar, porque produz uma regra que não casa com nada.
    return seletor;
  }
};

/** Renomeia usos de um nome de animação dentro de uma declaração. */
const trocarNomeDeAnimacao = (valor: string, de: string, para: string): string =>
  valor.replace(
    new RegExp(`(^|[\\s,])${de.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|[\\s,])`, 'g'),
    `$1${para}$2`,
  );

/**
 * Escopa uma folha inteira.
 *
 * Não recebe o HTML nem devolve HTML: quem monta os proxies (`data-ds-raiz` e
 * `data-ds-corpo`) é o compositor, e separá-los deixa esta parte testável sem
 * DOM nenhum.
 */
export const escoparCss = (css: string, opts: OpcoesEscopo): ResultadoEscopo => {
  const avisos: string[] = [];
  const renomeados: ResultadoEscopo['renomeados'] = [];
  let reescritas = 0;

  let raizAst: postcss.Root;
  try {
    raizAst = postcss.parse(css);
  } catch (err) {
    // CSS que não faz parse não é escopado, e isso é dito. Devolver a folha
    // crua mantém o site funcionando (com o risco de colisão declarado) em vez
    // de descartar todo o estilo de uma origem por um caractere.
    return {
      css,
      reescritas: 0,
      renomeados: [],
      avisos: [
        `CSS não pôde ser analisado e seguiu SEM escopo: ${err instanceof Error ? err.message : String(err)}. Estilos desta origem podem colidir com os de outra.`,
      ],
    };
  }

  // ── Nomes globais: renomear só o que colide ──────────────────────────────
  const mapaKeyframes = new Map<string, string>();
  const usadosKf = opts.nomesUsados?.keyframes ?? new Set<string>();
  const usadosLayer = opts.nomesUsados?.layer ?? new Set<string>();

  raizAst.walkAtRules((at: AtRule) => {
    if (/^(-\w+-)?keyframes$/i.test(at.name)) {
      const nome = at.params.trim();
      if (nome.length === 0 || !usadosKf.has(nome)) return;
      const novo = `${nome}--${opts.sufixo}`;
      mapaKeyframes.set(nome, novo);
      at.params = novo;
      renomeados.push({ tipo: 'keyframes', de: nome, para: novo });
      return;
    }
    if (at.name.toLowerCase() === 'layer') {
      const nomes = at.params
        .split(',')
        .map((n) => n.trim())
        .filter((n) => n.length > 0);
      if (nomes.length === 0) return;
      const trocados = nomes.map((n) => {
        if (!usadosLayer.has(n)) return n;
        const novo = `${n}--${opts.sufixo}`;
        renomeados.push({ tipo: 'layer', de: n, para: novo });
        return novo;
      });
      at.params = trocados.join(', ');
    }
  });

  // Os usos: `animation-name`, e o atalho `animation`.
  if (mapaKeyframes.size > 0) {
    raizAst.walkDecls(/^animation(-name)?$/i, (decl) => {
      let v = decl.value;
      for (const [de, para] of mapaKeyframes) v = trocarNomeDeAnimacao(v, de, para);
      decl.value = v;
    });
  }

  // ── Seletores ────────────────────────────────────────────────────────────
  raizAst.walkRules((regra: Rule) => {
    // Passos de `@keyframes` (`from`, `to`, `40%`) não são seletores.
    const pai = regra.parent;
    if (pai !== undefined && pai.type === 'atrule') {
      const nome = (pai as AtRule).name;
      if (/^(-\w+-)?keyframes$/i.test(nome)) return;
      // `@font-face`, `@page`, `@property` também não têm seletor de elemento.
      if (/^(font-face|page|property|counter-style|viewport)$/i.test(nome)) return;
    }
    const antes = regra.selector;
    const depois = regra.selectors
      .map((s) => escoparSeletor(s, { raiz: opts.raiz, corpo: opts.corpo }))
      .join(', ');
    if (depois !== antes) {
      regra.selector = depois;
      reescritas++;
    }
  });

  return { css: raizAst.toString(), reescritas, renomeados, avisos };
};

/**
 * Nomes globais declarados numa folha — o que o compositor precisa saber ANTES
 * de escopar a próxima origem, para descobrir o que colide.
 */
export const nomesGlobaisDe = (
  css: string,
): { keyframes: Set<string>; fontFace: Set<string>; layer: Set<string> } => {
  const keyframes = new Set<string>();
  const fontFace = new Set<string>();
  const layer = new Set<string>();
  let raizAst: postcss.Root;
  try {
    raizAst = postcss.parse(css);
  } catch {
    return { keyframes, fontFace, layer };
  }
  raizAst.walkAtRules((at) => {
    if (/^(-\w+-)?keyframes$/i.test(at.name)) {
      const n = at.params.trim();
      if (n.length > 0) keyframes.add(n);
      return;
    }
    if (at.name.toLowerCase() === 'font-face') {
      const fam = at.nodes?.find(
        (d) => d.type === 'decl' && d.prop.toLowerCase() === 'font-family',
      );
      if (fam !== undefined && fam.type === 'decl') {
        fontFace.add(fam.value.trim().replace(/^["']|["']$/g, ''));
      }
      return;
    }
    if (at.name.toLowerCase() === 'layer') {
      for (const n of at.params.split(',')) {
        const t = n.trim();
        if (t.length > 0) layer.add(t);
      }
    }
  });
  return { keyframes, fontFace, layer };
};
