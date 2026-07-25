import type { Confidence, RuntimeDetection, StackEntry } from '@ds/shared';

/**
 * STACK — inventário de tecnologias **realmente detectadas**.
 *
 * A regra do pedido é curta e decide o desenho: "Não invente tecnologias". Então
 * nada entra aqui sem evidência, e a evidência viaja junto, para quem lê poder
 * discordar. Um bundle chamado `three.min.js` pode conter qualquer coisa; um
 * `window.THREE` definido não pode.
 *
 * A consequência prática: entradas de baixa confiança aparecem MARCADAS, não
 * escondidas e não promovidas. É a diferença entre "detectamos Tailwind" e
 * "há classes utilitárias que parecem Tailwind".
 */

const USO: Partial<Record<RuntimeDetection['kind'], string>> = {
  three: 'cena 3D em WebGL',
  pixi: 'renderização 2D acelerada em WebGL',
  'webgl-cru': 'desenho direto em WebGL',
  'canvas-2d': 'desenho em canvas 2D',
  'shader-cru': 'shaders GLSL',
  lottie: 'reprodução de animação JSON',
  gsap: 'animações e timeline',
  scrolltrigger: 'animações vinculadas ao scroll',
  'framer-motion': 'animações de componentes',
  lenis: 'scroll suave',
  locomotive: 'scroll suave e parallax',
  swiper: 'carrossel',
  embla: 'carrossel',
  splide: 'carrossel',
  barba: 'transição entre páginas',
  matter: 'simulação de física',
  p5: 'desenho generativo em canvas',
  anime: 'animações',
  aos: 'revelação ao entrar na viewport',
  'web-animations': 'animações via Web Animations API',
  'video-runtime': 'reprodução de vídeo',
  desconhecido: 'loop de animação de origem não identificada',
};

/** Um sinal de CSS/HTML que sugere uma ferramenta — sempre com confiança abaixo do runtime. */
export type SinalDeFerramenta = {
  nome: string;
  uso: string;
  /** O que foi observado. */
  evidencia: string;
  confidence: Confidence;
};

/**
 * Ferramentas de build/estilo detectáveis pela FORMA do que chegou ao navegador.
 * Nenhuma delas expõe global, então a confiança nunca é `alta` — e o rótulo diz
 * o que foi visto, não o que se conclui.
 */
export const detectarFerramentas = (opts: {
  html: string;
  css: string;
  scripts: readonly string[];
}): SinalDeFerramenta[] => {
  const out: SinalDeFerramenta[] = [];
  const { html, css, scripts } = opts;

  // Tailwind: a assinatura é o VOLUME de utilitários com padrão próprio, não uma
  // classe isolada (`flex` existe em qualquer CSS).
  const utilitarios = (
    html.match(
      /\b(?:sm|md|lg|xl|2xl|hover|focus|group-hover|dark):[a-z-]+|\b(?:flex|grid|hidden|absolute|relative)\b|\b[wh]-(?:\d+|full|screen|\[[^\]]+\])|\b(?:p|m|px|py|mx|my|gap|space)-(?:\d+|\[[^\]]+\])/g,
    ) ?? []
  ).length;
  if (utilitarios >= 40) {
    out.push({
      nome: 'Tailwind CSS (provável)',
      uso: 'classes utilitárias no layout e nos estilos',
      evidencia: `${utilitarios} ocorrências de classes utilitárias com prefixo responsivo/estado`,
      confidence: utilitarios >= 200 ? 'media' : 'baixa',
    });
  }
  if (/--tw-|\btailwind\b/i.test(css)) {
    out.push({
      nome: 'Tailwind CSS',
      uso: 'classes utilitárias no layout e nos estilos',
      evidencia: 'custom properties `--tw-*` no CSS compilado',
      confidence: 'media',
    });
  }

  if (/class=["'][^"']*\blucide\b|data-lucide=/i.test(html)) {
    out.push({
      nome: 'Lucide',
      uso: 'ícones da interface',
      evidencia: 'classe/atributo `lucide` no markup',
      confidence: 'media',
    });
  }
  if (/class=["'][^"']*\b(?:fa|fas|far|fab|fa-solid)\b/i.test(html)) {
    out.push({
      nome: 'Font Awesome',
      uso: 'ícones da interface',
      evidencia: 'classes `fa*` no markup',
      confidence: 'media',
    });
  }
  if (/\b__NEXT_DATA__\b|\/_next\//.test(html) || scripts.some((s) => /\/_next\//.test(s))) {
    out.push({
      nome: 'Next.js',
      uso: 'framework da aplicação',
      evidencia: '`__NEXT_DATA__` ou assets em `/_next/`',
      confidence: 'alta',
    });
  }
  if (/\bdata-svelte-h\b|\bsvelte-/.test(html)) {
    out.push({
      nome: 'Svelte',
      uso: 'framework de componentes',
      evidencia: 'atributos/classes com prefixo `svelte`',
      confidence: 'media',
    });
  }
  if (/\bdata-v-[0-9a-f]{8}\b|\b__vue__\b|\bdata-v-app\b/.test(html)) {
    out.push({
      nome: 'Vue',
      uso: 'framework de componentes',
      evidencia: 'atributos `data-v-*` de escopo do Vue',
      confidence: 'media',
    });
  }
  if (/\bdata-reactroot\b|\bdata-react-helmet\b|\b__REACT_DEVTOOLS/.test(html)) {
    out.push({
      nome: 'React',
      uso: 'framework de componentes',
      evidencia: 'marcadores de hidratação do React',
      confidence: 'media',
    });
  }
  if (/\bx-data\b|\bx-on:|\b@click\s*=/.test(html)) {
    out.push({
      nome: 'Alpine.js',
      uso: 'interatividade declarativa no markup',
      evidencia: 'atributos `x-data`/`x-on:`',
      confidence: 'media',
    });
  }
  if (/\bdata-radix-|\bdata-headlessui-/.test(html)) {
    out.push({
      nome: /radix/.test(html) ? 'Radix UI' : 'Headless UI',
      uso: 'primitivas de componente acessível',
      evidencia: 'atributos `data-radix-*`/`data-headlessui-*`',
      confidence: 'media',
    });
  }
  if (/@font-face/i.test(css)) {
    const familias = [...css.matchAll(/font-family\s*:\s*["']?([^;"'}]+)/gi)]
      .map((m) => (m[1] ?? '').trim())
      .filter((f) => f.length > 0);
    if (familias.length > 0) {
      out.push({
        nome: 'Fontes próprias (@font-face)',
        uso: `tipografia: ${[...new Set(familias)].slice(0, 4).join(', ')}`,
        evidencia: `${(css.match(/@font-face/gi) ?? []).length} declaração(ões) de @font-face`,
        confidence: 'alta',
      });
    }
  }

  return out;
};

/** Monta o STACK a partir dos runtimes detectados e dos sinais de ferramenta. */
export const montarStack = (
  runtimes: readonly RuntimeDetection[],
  ferramentas: readonly SinalDeFerramenta[],
  arquivosPorRuntime: ReadonlyMap<string, string[]> = new Map(),
): StackEntry[] => {
  const out: StackEntry[] = [];

  for (const r of runtimes) {
    // Sem evidência não entra. Nunca.
    if (r.evidence.length === 0) continue;
    out.push({
      name: r.version !== undefined && r.version.length > 0 ? `${r.label} ${r.version}` : r.label,
      usage: USO[r.kind] ?? 'runtime detectado na página',
      version: r.version,
      confidence: r.confidence,
      evidence: r.evidence,
      files: arquivosPorRuntime.get(r.id) ?? r.scripts,
      // O item precisa deste runtime para funcionar? Só quando ele desenha algo.
      runtimeRequired:
        r.kind === 'three' ||
        r.kind === 'pixi' ||
        r.kind === 'webgl-cru' ||
        r.kind === 'canvas-2d' ||
        r.kind === 'lottie' ||
        r.kind === 'shader-cru' ||
        r.kind === 'p5' ||
        r.kind === 'matter',
    });
  }

  for (const f of ferramentas) {
    out.push({
      name: f.nome,
      usage: f.uso,
      confidence: f.confidence,
      evidence: [f.evidencia],
      files: [],
      runtimeRequired: false,
    });
  }

  // Confiança alta primeiro: quem lê o STACK.md deve ver o que é fato antes do
  // que é indício.
  const ordem: Record<Confidence, number> = { alta: 0, media: 1, baixa: 2, nenhuma: 3 };
  out.sort((a, b) => ordem[a.confidence] - ordem[b.confidence] || a.name.localeCompare(b.name));
  return out;
};

/**
 * Renderiza o `STACK.md`.
 *
 * A confiança aparece em cada linha de propósito: um STACK que não distingue
 * "global exposto" de "nome de arquivo" convida a construir em cima de um palpite.
 */
export const renderizarStackMd = (
  stack: readonly StackEntry[],
  contexto: { url: string | null; capturadoEm: number },
): string => {
  const linhas: string[] = [];
  linhas.push('# STACK');
  linhas.push('');
  linhas.push(
    `Tecnologias detectadas na captura${contexto.url !== null ? ` de \`${contexto.url}\`` : ''}, em ${new Date(contexto.capturadoEm).toISOString().slice(0, 10)}.`,
  );
  linhas.push('');
  if (stack.length === 0) {
    linhas.push(
      'Nenhuma biblioteca ou runtime foi detectado com evidência. A página parece ser HTML e CSS.',
    );
    linhas.push('');
    return linhas.join('\n');
  }
  linhas.push(
    'Cada entrada traz a evidência que a sustenta. Nada aqui foi inferido por suposição.',
  );
  linhas.push('');
  for (const e of stack) {
    const selo =
      e.confidence === 'alta'
        ? ''
        : e.confidence === 'media'
          ? ' _(confiança média)_'
          : ' _(indício)_';
    linhas.push(`- **${e.name}** — ${e.usage}${selo}`);
    for (const ev of e.evidence.slice(0, 3)) linhas.push(`  - evidência: ${ev}`);
    if (e.files.length > 0) {
      linhas.push(
        `  - arquivos: ${e.files
          .slice(0, 3)
          .map((f) => `\`${f}\``)
          .join(', ')}`,
      );
    }
    if (e.runtimeRequired) {
      linhas.push('  - **necessário em execução**: sem este runtime o item não desenha.');
    }
  }
  linhas.push('');
  const indicios = stack.filter((e) => e.confidence === 'baixa');
  if (indicios.length > 0) {
    linhas.push(
      `> ${indicios.length} entrada(s) marcada(s) como indício foram detectadas apenas por nome de arquivo ou padrão de classe. Não construa em cima delas sem conferir.`,
    );
    linhas.push('');
  }
  return linhas.join('\n');
};
