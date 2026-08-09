/**
 * Classificação de SVG — função pura.
 *
 * Vem da seção 20 do pedido, e resolve um problema real: transformar todo SVG em
 * `<img>` quebra os ícones que herdam cor (`currentColor`), e manter todo SVG
 * inline incha o HTML com ilustrações de 40 KB que deveriam ser arquivo.
 *
 * Três categorias:
 *
 * - **A — ícone de biblioteca conhecida.** Registra nome e biblioteca. Só usa
 *   referência semântica (`<i data-lucide="x">`) se o runtime estiver REALMENTE
 *   disponível no bundle — a regra do pedido é explícita: não presuma que o
 *   Lucide está instalado. Sem runtime, mantém o SVG e registra a origem.
 * - **B — herda cor/estilo.** `currentColor`, `stroke="currentColor"`, cor por
 *   classe, mudança por hover/tema. **Fica inline.** Virar `<img>` congelaria a
 *   cor e mataria o hover.
 * - **C — cores fixas e independente.** Vira asset local, preservando `viewBox`,
 *   dimensões, filtros, máscaras, ids e acessibilidade.
 *
 * Na dúvida entre B e C, **B** — inline nunca quebra, `<img>` pode.
 */

export type CategoriaSvg = 'A-icone-conhecido' | 'B-herda-cor' | 'C-asset-fixo';

export type ClassificacaoSvg = {
  categoria: CategoriaSvg;
  /** Por que caiu nesta categoria. */
  motivos: string[];
  /** Biblioteca reconhecida, quando categoria A. */
  biblioteca?: string;
  /** Nome do ícone, quando reconhecível. */
  icone?: string;
  /** Fica inline no HTML do bundle? */
  inline: boolean;
  /** Usa `<use href="#id">` — depende de um sprite presente. */
  usaSprite: boolean;
  /** Ids de fragmento referenciados (para o sprite viajar junto). */
  fragmentos: string[];
  /** Tem `<animate>`/SMIL — animação que só roda com o SVG inline ou embutido. */
  animado: boolean;
  /** Precisa preservar filtros/máscaras (ids internos não podem colidir). */
  temIdsInternos: boolean;
  /** Rótulo acessível encontrado (title/aria-label), para não se perder. */
  rotuloAcessivel?: string;
};

/**
 * Bibliotecas de ícone reconhecíveis pela ASSINATURA do markup, não pelo nome do
 * arquivo — que raramente sobrevive ao build.
 *
 * Lucide/Feather: `stroke-width="2"`, `stroke-linecap="round"`, viewBox 24, sem
 * `fill` (ou `fill="none"`). Bootstrap Icons: viewBox 16 com `fill="currentColor"`.
 * Heroicons: viewBox 24 com `stroke-width="1.5"`, ou 20/24 sólido.
 */
const ASSINATURAS: Array<{ lib: string; teste: (svg: string) => boolean }> = [
  {
    lib: 'lucide',
    teste: (s) =>
      /class=["'][^"']*\blucide\b/i.test(s) ||
      /data-lucide=/i.test(s) ||
      (/viewBox=["']0 0 24 24["']/i.test(s) &&
        /stroke-linecap=["']round["']/i.test(s) &&
        /stroke-linejoin=["']round["']/i.test(s) &&
        /stroke-width=["']2["']/i.test(s) &&
        /fill=["']none["']/i.test(s)),
  },
  {
    lib: 'feather',
    teste: (s) => /class=["'][^"']*\bfeather\b/i.test(s),
  },
  {
    lib: 'heroicons',
    teste: (s) => /viewBox=["']0 0 24 24["']/i.test(s) && /stroke-width=["']1\.5["']/i.test(s),
  },
  {
    lib: 'bootstrap-icons',
    teste: (s) =>
      /class=["'][^"']*\bbi\b/i.test(s) ||
      (/viewBox=["']0 0 16 16["']/i.test(s) && /fill=["']currentColor["']/i.test(s)),
  },
  {
    lib: 'font-awesome',
    teste: (s) => /class=["'][^"']*\b(fa|fas|far|fab|fa-solid|fa-regular)\b/i.test(s),
  },
  {
    lib: 'material-symbols',
    teste: (s) => /class=["'][^"']*material-(symbols|icons)/i.test(s),
  },
  {
    lib: 'tabler',
    teste: (s) => /class=["'][^"']*\btabler-icon\b/i.test(s) || /icon-tabler/i.test(s),
  },
];

/** Nome do ícone, quando o markup o declara. */
const nomeDoIcone = (svg: string): string | undefined => {
  const data = svg.match(/data-lucide=["']([\w-]+)["']/i)?.[1];
  if (data) return data;
  const cls = svg.match(/class=["'][^"']*(?:lucide|tabler-icon|bi)-([\w-]+)/i)?.[1];
  if (cls) return cls;
  const titulo = svg.match(/<title[^>]*>([^<]{1,40})<\/title>/i)?.[1];
  return titulo?.trim() || undefined;
};

/** Herança de cor/estilo: o que obriga o SVG a ficar inline. */
const HERDA_COR: RegExp[] = [
  /fill=["']currentColor["']/i,
  /stroke=["']currentColor["']/i,
  /fill=["']inherit["']/i,
  /stroke=["']inherit["']/i,
  // Sem fill nem stroke declarados no elemento raiz: herda do CSS.
  /style=["'][^"']*(?:fill|stroke)\s*:\s*(?:currentColor|inherit|var\()/i,
  // `var(--x)` em qualquer lugar: a cor vem do tema.
  /(?:fill|stroke)=["']var\(/i,
];

/** Classes que indicam cor/tamanho controlados por CSS externo. */
const CLASSE_CONTROLA_ESTILO =
  /\b(text-|fill-|stroke-|w-|h-|size-|group-hover:|hover:|dark:|currentColor)/i;

const contarIdsInternos = (svg: string): string[] => {
  const ids: string[] = [];
  for (const m of svg.matchAll(/\bid=["']([^"']+)["']/g)) {
    const id = m[1];
    if (id !== undefined) ids.push(id);
  }
  return ids;
};

const fragmentosUsados = (svg: string): string[] => {
  const out = new Set<string>();
  for (const m of svg.matchAll(/(?:xlink:href|href)=["']#([^"']+)["']/g)) {
    const id = m[1];
    if (id !== undefined) out.add(id);
  }
  // `url(#id)` de filtro/máscara/gradiente também é fragmento e precisa viajar.
  for (const m of svg.matchAll(/url\(["']?#([^"')]+)["']?\)/g)) {
    const id = m[1];
    if (id !== undefined) out.add(id);
  }
  return [...out];
};

export type ContextoSvg = {
  /**
   * O runtime da biblioteca de ícones está no bundle (script embutido e
   * inicialização identificada)? Sem isto, categoria A NÃO usa referência
   * semântica — a regra é "não presuma que já está instalado".
   */
  runtimeDeIconesDisponivel?: boolean;
  /** O SVG está dentro de um elemento cuja cor muda por hover/tema. */
  corMudaPorEstado?: boolean;
  /** Bytes do markup — ilustração grande é candidata natural a asset. */
  bytes?: number;
};

/** Acima disto, um SVG inline pesa no HTML e é melhor como arquivo (se puder). */
const BYTES_PARA_VIRAR_ASSET = 2_500;

export const classificarSvg = (svg: string, ctx: ContextoSvg = {}): ClassificacaoSvg => {
  const motivos: string[] = [];
  const fragmentos = fragmentosUsados(svg);
  const idsInternos = contarIdsInternos(svg);
  const animado = /<(animate|animateTransform|animateMotion|set)\b/i.test(svg);
  const usaSprite = /(?:xlink:href|href)=["']#/.test(svg);
  const rotuloAcessivel =
    svg.match(/aria-label=["']([^"']{1,80})["']/i)?.[1] ??
    svg.match(/<title[^>]*>([^<]{1,80})<\/title>/i)?.[1];

  const base = {
    fragmentos,
    animado,
    usaSprite,
    temIdsInternos: idsInternos.length > 0,
    rotuloAcessivel: rotuloAcessivel?.trim() || undefined,
  };

  // ── Animado ou dependente de sprite: inline, sem discussão ───────────────
  if (animado) {
    motivos.push('Tem <animate>/SMIL: a animação só roda com o SVG no documento.');
  }
  if (usaSprite) {
    motivos.push(
      `Usa <use href="#…"> (${fragmentos.join(', ') || 'fragmento'}): depende do sprite estar presente.`,
    );
  }

  // ── Categoria A: biblioteca conhecida ────────────────────────────────────
  const assinatura = ASSINATURAS.find((a) => a.teste(svg));
  if (assinatura !== undefined) {
    const icone = nomeDoIcone(svg);
    motivos.push(`Assinatura de ${assinatura.lib}${icone ? ` (ícone "${icone}")` : ''}.`);
    if (ctx.runtimeDeIconesDisponivel === true) {
      motivos.push('Runtime da biblioteca presente no bundle: referência semântica é segura.');
    } else {
      motivos.push(
        'Runtime da biblioteca NÃO está no bundle: o SVG fica inline como fallback (não presumimos a instalação).',
      );
    }
    return {
      ...base,
      categoria: 'A-icone-conhecido',
      biblioteca: assinatura.lib,
      icone,
      // Ícone de biblioteca é quase sempre `currentColor` — e mesmo com runtime
      // disponível o fallback inline é o que garante que a peça não apareça vazia.
      inline: true,
      motivos,
    };
  }

  // ── Categoria B: herda cor/estilo ────────────────────────────────────────
  const herda = HERDA_COR.some((re) => re.test(svg));
  const semPintura = !/\b(fill|stroke)=/i.test(svg);
  const classeControla = CLASSE_CONTROLA_ESTILO.test(
    svg.match(/class=["']([^"']*)["']/i)?.[1] ?? '',
  );

  if (
    herda ||
    semPintura ||
    classeControla ||
    ctx.corMudaPorEstado === true ||
    animado ||
    usaSprite
  ) {
    if (herda) motivos.push('Usa currentColor/inherit/var(): a cor vem de fora.');
    if (semPintura) motivos.push('Não declara fill nem stroke: a pintura vem do CSS.');
    if (classeControla) motivos.push('As classes controlam cor/tamanho pelo CSS.');
    if (ctx.corMudaPorEstado === true) motivos.push('A cor muda por hover/tema.');
    return { ...base, categoria: 'B-herda-cor', inline: true, motivos };
  }

  // ── Categoria C: cores fixas e independente ──────────────────────────────
  const grande = (ctx.bytes ?? svg.length) >= BYTES_PARA_VIRAR_ASSET;
  motivos.push('Cores fixas e sem herança de estilo: pode virar arquivo.');
  if (grande) motivos.push(`Markup grande (${ctx.bytes ?? svg.length} bytes): melhor como asset.`);
  else {
    motivos.push('Markup pequeno: mantido inline para evitar uma requisição por ícone.');
  }
  return {
    ...base,
    categoria: 'C-asset-fixo',
    // Pequeno e fixo continua inline: virar arquivo custa uma requisição e não
    // ganha nada. A categoria diz que PODERIA ser asset; `inline` diz o que fazemos.
    inline: !grande,
    motivos,
  };
};

/**
 * Prefixa os ids internos de um SVG para ele poder conviver com outros no mesmo
 * documento sem colisão de `url(#gradiente)`.
 *
 * Sem isto, dois SVGs com um gradiente chamado `a` no mesmo bundle fazem o
 * segundo herdar o do primeiro — um bug visual silencioso e difícil de achar.
 * Reescreve declaração e referência juntas, para não quebrar o par.
 *
 * ## Só os ids que são REFERENCIADOS dentro do SVG
 *
 * A colisão que esta função existe para impedir acontece por `url(#id)` e
 * `href="#id"` — gradiente, filtro, máscara, clipPath, sprite. Um id que
 * ninguém referencia assim não participa dela, e renomeá-lo não protege nada.
 *
 * Protege nada e QUEBRA: o script da peça procura o elemento por
 * `getElementById('pipeline-svg')`, recebe `null` e desiste na primeira linha.
 * O desenho congela na geometria que tinha na captura, e não há erro em lugar
 * nenhum — o script simplesmente volta.
 *
 * Medido na peça que o dono reprovou (a linha do tempo que se preenche ao
 * rolar): cinco ids prefixados, e só DOIS eram referenciados — `glow-grad` e
 * `glow-line`. Os outros três (`pipeline-svg`, `pipeline-path-base`,
 * `pipeline-path-glow`) foram renomeados à toa, e eram exatamente os três que o
 * `pipeline.js` procurava. No acervo, 4 bundles de 607 estavam nesse estado —
 * a linha do tempo e um gráfico, o gráfico sem ninguém ter notado.
 */
export const isolarIdsSvg = (svg: string, prefixo: string): string => {
  const referenciados = new Set(fragmentosUsados(svg));
  const ids = contarIdsInternos(svg).filter((id) => referenciados.has(id));
  if (ids.length === 0) return svg;
  let out = svg;
  for (const id of ids) {
    const esc = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    out = out
      .replace(new RegExp(`\\bid=(["'])${esc}\\1`, 'g'), `id="${prefixo}-${id}"`)
      .replace(new RegExp(`url\\((["']?)#${esc}\\1\\)`, 'g'), `url(#${prefixo}-${id})`)
      .replace(new RegExp(`\\b(xlink:href|href)=(["'])#${esc}\\2`, 'g'), `$1="#${prefixo}-${id}"`);
  }
  return out;
};
