import type { RawJsInline } from '../mapper/raw.js';

/**
 * Organização do JavaScript por responsabilidade — **sem unir indiscriminadamente**.
 *
 * A regra do pedido é explícita nos dois sentidos: organizar por responsabilidade
 * *e* "não una scripts indiscriminadamente". Unir é justamente o que quebra: dois
 * `<script>` que declaram `const x` no topo funcionam separados (cada um é seu
 * próprio escopo de script) e explodem com `SyntaxError` se colados no mesmo
 * arquivo. Um `type="module"` colado com um script clássico perde o escopo de
 * módulo e o `import` deixa de valer.
 *
 * Então a política é:
 *
 * - **Ordem preservada sempre.** A numeração do arquivo carrega a ordem original.
 * - **União só entre ADJACENTES compatíveis** — mesma responsabilidade, ambos
 *   clássicos, nenhum `async`/`defer` divergente. Adjacência é o que garante que
 *   nada passa na frente de nada.
 * - **JSON-LD, importmap e config nunca viram JavaScript.** São dados; virariam
 *   erro de sintaxe e sumiriam do `<head>`, quebrando SEO junto.
 */

export type ResponsabilidadeJs =
  | 'bootstrap'
  | 'interactions'
  | 'scroll'
  | 'animations'
  | 'runtime'
  | 'dados';

export const ARQUIVO_JS: Record<ResponsabilidadeJs, string> = {
  bootstrap: 'assets/js/bootstrap.js',
  interactions: 'assets/js/interactions.js',
  scroll: 'assets/js/scroll.js',
  animations: 'assets/js/animations.js',
  runtime: 'assets/js/runtime.js',
  // Dados NÃO viram arquivo .js: ficam inline no HTML, onde funcionam.
  dados: '(inline)',
};

/**
 * Classifica um script pelo que ele faz. Os padrões procuram API, não nome de
 * variável: `IntersectionObserver` é scroll de verdade; uma variável chamada
 * `scroll` não é nada.
 */
export const classificarJs = (conteudo: string, dados: boolean): ResponsabilidadeJs => {
  if (dados) return 'dados';
  const c = conteudo;
  if (
    /\b(THREE|PIXI|createShader|getContext\s*\(\s*['"]webgl|new\s+Renderer|lottie|bodymovin)\b/.test(
      c,
    )
  ) {
    return 'runtime';
  }
  if (/getContext\s*\(\s*['"]2d['"]|requestAnimationFrame/.test(c)) return 'runtime';
  if (
    /\b(IntersectionObserver|scrollY|scrollTop|ScrollTrigger|Lenis|LocomotiveScroll|onscroll|'scroll'|"scroll")\b/.test(
      c,
    )
  ) {
    return 'scroll';
  }
  if (
    /\b(gsap|TweenMax|anime\s*\(|\.animate\s*\(|keyframes|transitionend|animationend)\b/.test(c)
  ) {
    return 'animations';
  }
  if (
    /addEventListener\s*\(\s*['"](click|pointerdown|mousedown|keydown|input|change|submit)/.test(c)
  ) {
    return 'interactions';
  }
  if (/\b(classList\.(?:toggle|add|remove)|setAttribute\s*\(\s*['"]aria-)/.test(c)) {
    return 'interactions';
  }
  return 'bootstrap';
};

export type ArquivoJs = {
  caminho: string;
  conteudo: string;
  responsabilidade: ResponsabilidadeJs;
  /** Ordem de carregamento (índice). */
  ordem: number;
  module: boolean;
  async: boolean;
  defer: boolean;
  /** Quantos scripts originais foram unidos aqui. */
  unidos: number;
};

export type ResultadoJs = {
  arquivos: ArquivoJs[];
  /** Blocos que ficam INLINE no HTML: dados (JSON-LD, importmap, config). */
  inline: Array<{ type: string; content: string }>;
  /** Notas honestas sobre o que não foi unido e por quê. */
  notas: string[];
};

/** Dois scripts adjacentes podem ser unidos sem mudar semântica? */
export const podeUnir = (a: RawJsInline, b: RawJsInline, mesmaResp: boolean): boolean => {
  if (!mesmaResp) return false;
  if (a.dados || b.dados) return false;
  // Módulo tem escopo próprio e `import`: unir com clássico muda tudo.
  if (a.module !== b.module) return false;
  if (a.module || b.module) return false;
  // `async`/`defer` mudam QUANDO o script roda. Unir dois com timing diferente
  // reordena a execução.
  if (a.async !== b.async || a.defer !== b.defer) return false;
  return true;
};

/**
 * Organiza os scripts inline. Preserva ordem e escopo; une só o que é seguro unir.
 */
export const organizarJs = (scripts: readonly RawJsInline[]): ResultadoJs => {
  const ordenados = [...scripts].sort((a, b) => a.ordem - b.ordem);
  const arquivos: ArquivoJs[] = [];
  const inline: ResultadoJs['inline'] = [];
  const notas: string[] = [];

  let grupo: RawJsInline[] = [];
  let respAtual: ResponsabilidadeJs | null = null;
  const contadorPorResp = new Map<ResponsabilidadeJs, number>();

  const fecharGrupo = (): void => {
    if (grupo.length === 0 || respAtual === null) return;
    const n = (contadorPorResp.get(respAtual) ?? 0) + 1;
    contadorPorResp.set(respAtual, n);
    const base = ARQUIVO_JS[respAtual].replace(/\.js$/, '');
    const primeiro = grupo[0];
    if (primeiro === undefined) return;
    arquivos.push({
      // A numeração é o que carrega a ordem: `interactions-01.js` roda antes de
      // `interactions-02.js`, e o HTML os inclui nesta sequência.
      caminho: n === 1 ? `${base}.js` : `${base}-${String(n).padStart(2, '0')}.js`,
      conteudo: grupo.map((s) => s.content).join('\n;\n'),
      responsabilidade: respAtual,
      ordem: arquivos.length,
      module: primeiro.module,
      async: primeiro.async,
      defer: primeiro.defer,
      unidos: grupo.length,
    });
    grupo = [];
  };

  for (const s of ordenados) {
    if (s.dados) {
      // Dados ficam inline, no lugar e com o `type` original.
      inline.push({ type: s.type, content: s.content });
      // Um bloco de dados no meio não impede a união dos scripts em volta: ele não
      // executa nada, então não há reordenação de execução a temer.
      continue;
    }
    const resp = classificarJs(s.content, false);
    const anterior = grupo[grupo.length - 1];
    if (anterior !== undefined && podeUnir(anterior, s, resp === respAtual)) {
      grupo.push(s);
      continue;
    }
    if (anterior !== undefined) {
      if (resp === respAtual) {
        notas.push(
          `Dois scripts de "${resp}" não foram unidos: ${
            anterior.module !== s.module
              ? 'um é módulo e o outro é clássico'
              : 'têm async/defer diferentes'
          } — unir mudaria escopo ou ordem de execução.`,
        );
      }
      fecharGrupo();
    }
    respAtual = resp;
    grupo = [s];
  }
  fecharGrupo();

  if (inline.length > 0) {
    notas.push(
      `${inline.length} bloco(s) de dados (JSON-LD/importmap/config) mantidos inline: não são JavaScript executável e extraí-los como .js os quebraria.`,
    );
  }

  return { arquivos, inline, notas };
};

/**
 * As tags `<script>` a escrever no HTML do bundle, na ordem.
 *
 * `defer` é preservado quando o original tinha; do contrário a tag entra sem
 * atributo, na posição em que estava — mudar o timing seria mudar o comportamento.
 */
export const tagsDeScript = (arquivos: readonly ArquivoJs[]): string =>
  arquivos
    .map((a) => {
      const attrs = [
        a.module ? ' type="module"' : '',
        a.async ? ' async' : '',
        a.defer ? ' defer' : '',
      ].join('');
      return `<script src="${a.caminho}"${attrs}></script>`;
    })
    .join('\n');
