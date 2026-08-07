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
 *   escopar o `:root` para a colisão sumir sozinha. A decisão vale para colisão
 *   ENTRE origens; a marca alcança as peças porque usa o namespace `--marca-*`,
 *   que nenhuma origem declara — do lado dela não há o que colidir.
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
 * Pseudo-elementos que a sintaxe antiga escreve com UM dois-pontos só. O parser
 * os devolve como `pseudo` igual a `:hover` — distinguir aqui evita tratar
 * `:after` como pseudo-classe e emitir uma variante que nunca casa.
 */
const PSEUDO_ELEMENTOS_LEGADOS = new Set([':before', ':after', ':first-line', ':first-letter']);

/**
 * O nó pode casar com o próprio div de proxy?
 *
 * Só classe, atributo e pseudo-classe: o proxy é um `<div>`, então seletor de
 * tipo (`p.intro` nunca é o proxy) e pseudo-elemento (que mira OUTRA caixa, não
 * o elemento) desqualificam o composto inteiro. Id fica de fora por cautela:
 * o proxy não carrega o id do documento de origem.
 */
const podeSerOProxy = (n: selectorParser.Node): boolean => {
  if (n.type === 'class' || n.type === 'attribute') return true;
  if (n.type === 'pseudo') {
    const v = n.value.toLowerCase();
    return !v.startsWith('::') && !PSEUDO_ELEMENTOS_LEGADOS.has(v);
  }
  return false;
};

/**
 * A variante de auto-casamento do caso 3 (ver o comentário de `escoparSeletor`),
 * construída ANTES de o seletor original ganhar o prefixo descendente.
 *
 * `:where([raiz], [corpo])` mira os DOIS proxies porque a classe copiada pode
 * estar em qualquer um: `dark` vinha do `<html>` (proxy raiz), `text-white`
 * vinha do `<body>` (proxy corpo). O `:where()` vale zero e o `:is(<composto>)`
 * vale a especificidade do composto — a variante empata com o seletor original.
 */
const varianteDeAutoCasamento = (
  sel: selectorParser.Selector,
  opts: { raiz: string; corpo: string },
): string | null => {
  const nodes = [...sel.nodes];
  const idxCombinador = nodes.findIndex((n) => n.type === 'combinator');
  const composto = idxCombinador === -1 ? nodes : nodes.slice(0, idxCombinador);
  const resto = idxCombinador === -1 ? [] : nodes.slice(idxCombinador);
  if (composto.length === 0) return null;
  if (!composto.every(podeSerOProxy)) return null;
  // `trim` tira só o respiro à esquerda que o parser guarda no primeiro nó;
  // dentro de um composto não existe espaço (espaço seria combinador).
  const compostoStr = composto
    .map((n) => String(n))
    .join('')
    .trim();
  const restoStr = resto.map((n) => String(n)).join('');
  return `:where([${opts.raiz}], [${opts.corpo}]):is(${compostoStr})${restoStr}`;
};

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
 * 3. **Qualquer outro** ganha a âncora do corpo à esquerda — e, quando o
 *    primeiro composto pode ser o PRÓPRIO proxy, uma segunda variante em lista.
 *
 * A segunda variante do caso 3 existe por um defeito medido num site gerado:
 * `envolverEmProxies` copia as classes do `<html>`/`<body>` de origem para os
 * próprios divs proxy (`<div data-ds-corpo="x" class="bg-black text-white">`),
 * mas o prefixo DESCENDENTE `:where([corpo]) .text-white` nunca casa com o
 * elemento que CARREGA a classe — só com descendentes dele. O rodapé de um site
 * escuro perdeu o `text-white` e ficou ilegível, e o remendo acabou escrito à
 * mão no marca.css. Por isso `.text-white` sai como
 * `:where([corpo]) .text-white, :where([raiz], [corpo]):is(.text-white)`.
 * O mesmo vale para o composto como ANCESTRAL: em `.dark .card`, o `.dark`
 * copiado para o proxy raiz também era regra morta, porque o descendente exigia
 * um `.dark` DENTRO do corpo — a variante `:where([raiz], [corpo]):is(.dark)
 * .card` devolve o tema.
 *
 * A variante NÃO sobe a especificidade, por construção: `:where()` vale ZERO e
 * `:is(<composto>)` vale exatamente a especificidade do composto — o contrato
 * "o escopo não sobe especificidade", que é o que deixa o marca.css vencer a
 * cascata sem `!important`, continua verdadeiro nas duas variantes.
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

  // As variantes de auto-casamento saem em LISTA, depois do seletor escopado.
  // Elas são acumuladas aqui (e não inseridas na AST durante o `each`) para a
  // iteração não visitar o que ela mesma acabou de criar.
  const variantes: string[] = [];

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

      // 2. Seletor sem âncora de documento: prefixa com a do corpo — e, quando
      // o primeiro composto pode ser o próprio proxy, guarda a variante de
      // auto-casamento (construída ANTES do prefixo, sobre o seletor original).
      const variante = varianteDeAutoCasamento(sel, opts);
      sel.prepend(selectorParser.combinator({ value: ' ' }));
      sel.prepend(selectorParser.string({ value: `:where([${opts.corpo}])` }));
      if (variante !== null) variantes.push(variante);
    });
  });
  try {
    const escopado = transform.processSync(seletor);
    return variantes.length === 0 ? escopado : `${escopado}, ${variantes.join(', ')}`;
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
 * Renomeia uma família dentro de uma PILHA de fontes, preservando o resto.
 *
 * `font-family` não é um nome, é uma lista de tentativas:
 * `"Inter", system-ui, sans-serif`. Trocar a folha inteira por replace de texto
 * atingiria `system-ui` de outra origem e, pior, o `Inter` que aparece dentro de
 * `url(...)` num `src`. Aqui a pilha é quebrada por vírgula e só o item que É a
 * família muda.
 *
 * A comparação ignora aspas porque a mesma família aparece escrita das três
 * formas na mesma folha (`Inter`, `'Inter'`, `"Inter"`), e ignora caixa porque
 * nome de fonte não diferencia maiúscula em CSS. O item reescrito sai sempre
 * entre aspas duplas: o sufixo carrega `_`, e nome não citado com caractere
 * incomum é um convite a bug de parser.
 */
const trocarFamilia = (valor: string, mapa: ReadonlyMap<string, string>): string => {
  if (mapa.size === 0) return valor;
  const semAspas = (s: string): string => s.trim().replace(/^["']|["']$/g, '');
  return valor
    .split(',')
    .map((parte) => {
      const nome = semAspas(parte);
      const novo = mapa.get(nome.toLowerCase());
      if (novo === undefined) return parte;
      // O espaço da esquerda é preservado para a lista não colar depois da vírgula.
      const espacoEsquerda = parte.match(/^\s*/)?.[0] ?? '';
      return `${espacoEsquerda}"${novo}"`;
    })
    .join(',');
};

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
  /**
   * O sufixo virado IDENTIFICADOR CSS.
   *
   * O mesmo texto serve para duas coisas de gramáticas diferentes: valor de
   * atributo (`[data-ds-corpo="…"]`), onde quase tudo passa, e nome global
   * (`@keyframes girar--<sufixo>`), que é `<custom-ident>` e só aceita letra,
   * dígito, hífen, sublinhado e escape.
   *
   * Um apelido de origem com dois-pontos (`ds_a::original`) produzia
   * `@keyframes girar--ds_a::original`: o navegador não parseia o nome,
   * DESCARTA a at-rule inteira, e a animação da peça some sem erro nenhum
   * visível. O saneamento fica aqui, e não em quem chama, porque é aqui que se
   * sabe que o texto vai virar identificador.
   */
  const sufixoIdent = opts.sufixo.replace(/[^\w-]/g, '_');
  const mapaKeyframes = new Map<string, string>();
  /** Chave em minúsculas: nome de fonte não diferencia caixa em CSS. */
  const mapaFontes = new Map<string, string>();
  const usadosKf = opts.nomesUsados?.keyframes ?? new Set<string>();
  const usadosLayer = opts.nomesUsados?.layer ?? new Set<string>();
  const usadosFonte = new Set(
    [...(opts.nomesUsados?.fontFace ?? new Set<string>())].map((n) => n.toLowerCase()),
  );

  raizAst.walkAtRules((at: AtRule) => {
    /**
     * `@font-face` é global e não tem seletor para escopar — duas origens que
     * declaram `Inter` apontando para arquivos diferentes colidem no documento
     * final, e a última a carregar vence para as duas.
     *
     * Medido no acervo: as duas capturas declaram `Inter`, com `src` diferente.
     * Não era hipótese.
     */
    if (at.name.toLowerCase() === 'font-face') {
      const decl = at.nodes?.find(
        (d) => d.type === 'decl' && d.prop.toLowerCase() === 'font-family',
      );
      if (decl === undefined || decl.type !== 'decl') return;
      const nome = decl.value.trim().replace(/^["']|["']$/g, '');
      if (nome.length === 0 || !usadosFonte.has(nome.toLowerCase())) return;
      const novo = `${nome}--${sufixoIdent}`;
      mapaFontes.set(nome.toLowerCase(), novo);
      decl.value = `"${novo}"`;
      renomeados.push({ tipo: 'font-face', de: nome, para: novo });
      return;
    }
    if (/^(-\w+-)?keyframes$/i.test(at.name)) {
      const nome = at.params.trim();
      if (nome.length === 0 || !usadosKf.has(nome)) return;
      const novo = `${nome}--${sufixoIdent}`;
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
        const novo = `${n}--${sufixoIdent}`;
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

  // Os usos da fonte renomeada. O `@font-face` que acabou de mudar de nome
  // ficaria órfão sem isto: a declaração existiria e ninguém a pediria, e a
  // peça cairia na fonte de fallback sem erro nenhum aparecer.
  //
  // `font-family` e o atalho `font` — e NÃO `src`, que é o outro lugar onde o
  // nome aparece dentro de `local(...)` mas aponta para a fonte instalada no
  // computador de quem visita, não para esta declaração.
  if (mapaFontes.size > 0) {
    raizAst.walkDecls(/^font(-family)?$/i, (decl) => {
      // Dentro do próprio `@font-face` o `font-family` É a declaração do nome,
      // já reescrita acima. Reescrever de novo daria sufixo em cima de sufixo.
      const pai = decl.parent;
      if (pai !== undefined && pai.type === 'atrule') {
        if ((pai as AtRule).name.toLowerCase() === 'font-face') return;
      }
      decl.value = trocarFamilia(decl.value, mapaFontes);
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
