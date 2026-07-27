import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { type HTMLElement, parse } from 'node-html-parser';
import {
  CONTRACT_VERSION,
  type ComponentContract,
  type CorTematizavel,
  type FonteTematizavel,
  type GrupoRepetido,
  type PapelDeTexto,
  type SlotDeLink,
  type SlotDeMidia,
  type SlotDeTexto,
} from './schemas/component-contract.js';
import { ComponentContract as ComponentContractSchema } from './schemas/component-contract.js';

/**
 * Derivação do contrato de esqueleto/slots/tokens de um componente.
 *
 * FUNÇÃO PURA sobre strings (HTML fiel + CSS por arquivo + ponte de assets do
 * manifest): nada aqui reescreve o bundle. A mesma entrada produz sempre o
 * mesmo contrato — os ids e seletores são estruturais e determinísticos, e é
 * isso que permite a geração aplicar conteúdo por DOM em vez de replace cego.
 *
 * As decisões de heurística estão marcadas e viram `avisos` quando a medição
 * não foi possível — o contrato declara o que NÃO sabe em vez de chutar.
 */

export type EntradaContrato = {
  /** HTML fiel do componente (fragmento — o corpo do bundle, sem documento). */
  html: string;
  /** CSS por arquivo (nome → conteúdo). No legado, um único `styles.css`. */
  css: Readonly<Record<string, string>>;
  /** Arquivos JS presentes no bundle (nomes relativos). */
  jsFiles?: readonly string[];
  /** Ponte URL absoluta → arquivo local, vinda do manifest do bundle. */
  assets?: readonly { originalUrl: string; localPath: string; kind?: string }[];
  /** Origem da derivação, para a proveniência do contrato. */
  origem: 'bundle-v2' | 'bundle-legado';
};

// ── Utilidades ───────────────────────────────────────────────────────────────

const TAGS_IGNORADAS = new Set(['script', 'style', 'template', 'noscript']);
const TAGS_INLINE = new Set(['b', 'i', 'em', 'strong', 'span', 'br', 'small', 'u', 's', 'mark']);

const normalizar = (t: string): string => t.replace(/\s+/g, ' ').trim();

/** Seletor estrutural determinístico: `:scope > *:nth-child(i) > …`. */
const seletorDe = (caminho: readonly number[]): string =>
  caminho.length === 0
    ? ':scope'
    : `:scope > ${caminho.map((i) => `*:nth-child(${i + 1})`).join(' > ')}`;

const ehCor = (valor: string): boolean =>
  /^(#[0-9a-f]{3,8}|rgba?\(|hsla?\(|oklch\(|oklab\(|color\()/i.test(valor.trim());

/** Primeira família não genérica de uma pilha de font-family. */
const familiaPrincipal = (pilha: string): string | null => {
  const GENERICAS = new Set([
    'serif',
    'sans-serif',
    'monospace',
    'cursive',
    'fantasy',
    'system-ui',
    'ui-sans-serif',
    'ui-serif',
    'ui-monospace',
    'inherit',
    'initial',
    'unset',
  ]);
  for (const parte of pilha.split(',')) {
    const nome = parte.trim().replace(/^['"]|['"]$/g, '');
    if (nome.length > 0 && !GENERICAS.has(nome.toLowerCase())) return nome;
  }
  return null;
};

/** Papel semântico sugerido para uma custom property de cor, pelo nome. */
const papelPorNome = (nome: string): string | undefined => {
  const n = nome.toLowerCase();
  if (/heading|title/.test(n)) return 'heading';
  if (/\b(bg|background)\b|-bg\b|bg-/.test(n)) return 'background';
  if (/surface|card|panel/.test(n)) return 'surface';
  if (/primary|brand|accent-strong/.test(n)) return 'primary';
  if (/secondary/.test(n)) return 'secondary';
  if (/accent|highlight/.test(n)) return 'accent';
  if (/border|stroke|divider/.test(n)) return 'border';
  if (/muted|subtle|dim/.test(n)) return 'muted';
  if (/link/.test(n)) return 'link';
  if (/text|fg|foreground|body|ink/.test(n)) return 'body';
  return undefined;
};

// ── Derivação ────────────────────────────────────────────────────────────────

type Colecao = {
  textos: SlotDeTexto[];
  midias: SlotDeMidia[];
  links: SlotDeLink[];
  grupos: GrupoRepetido[];
  avisos: string[];
};

const dentroDeLink = (el: HTMLElement): boolean => {
  let p: HTMLElement | null = el;
  while (p !== null) {
    const tag = p.tagName?.toLowerCase() ?? '';
    if (tag === 'a' || tag === 'button') return true;
    p = p.parentNode as HTMLElement | null;
  }
  return false;
};

/** Texto dos nós-texto e filhos inline — o que `textContent` daria sem blocos. */
const textoProprio = (el: HTMLElement): string => {
  let saida = '';
  for (const filho of el.childNodes) {
    const comoEl = filho as HTMLElement;
    const tag = comoEl.tagName?.toLowerCase();
    if (tag === undefined) saida += filho.rawText ?? '';
    else if (TAGS_INLINE.has(tag)) saida += comoEl.text ?? '';
  }
  return normalizar(saida);
};

const soFilhosInline = (el: HTMLElement): boolean =>
  el.childNodes.every((filho) => {
    const tag = (filho as HTMLElement).tagName?.toLowerCase();
    return tag === undefined || TAGS_INLINE.has(tag);
  });

const papelDoTexto = (tag: string, texto: string, antesDoPrimeiroTitulo: boolean): PapelDeTexto => {
  if (tag === 'h1' || tag === 'h2') return 'titulo';
  if (/^h[3-6]$/.test(tag)) return 'subtitulo';
  if (tag === 'blockquote' || tag === 'q') return 'citacao';
  if (tag === 'li') return 'item';
  if (tag === 'label' || tag === 'figcaption' || tag === 'small') return 'rotulo';
  // Eyebrow: texto curto que antecede o primeiro título do componente.
  if (
    antesDoPrimeiroTitulo &&
    texto.length <= 48 &&
    (tag === 'p' || tag === 'span' || tag === 'div')
  ) {
    return 'eyebrow';
  }
  if (tag === 'p' || tag === 'div') return 'paragrafo';
  return 'rotulo';
};

const EH_CTA = /\b(btn|button|cta|action)\b/i;

const coletarDoElemento = (
  el: HTMLElement,
  caminho: readonly number[],
  estado: { viuTitulo: boolean; n: { t: number; m: number; l: number; g: number } },
  col: Colecao,
): void => {
  const tag = el.tagName?.toLowerCase() ?? '';
  if (TAGS_IGNORADAS.has(tag) || tag === 'svg') return;
  const seletor = seletorDe(caminho);

  // ── Links e CTAs ──
  if (tag === 'a' || tag === 'button') {
    const label = normalizar(el.text ?? '');
    const href = el.getAttribute('href') ?? '';
    if (label.length > 0) {
      estado.n.l++;
      const classes = `${el.getAttribute('class') ?? ''} ${el.getAttribute('id') ?? ''}`;
      col.links.push({
        id: `link-${estado.n.l}`,
        seletor,
        label,
        hrefOriginal: href,
        ehCta: tag === 'button' || EH_CTA.test(classes) || el.getAttribute('role') === 'button',
      });
    }
  }

  // ── Mídia ──
  if (tag === 'img') {
    const src = el.getAttribute('src') ?? '';
    const alt = el.getAttribute('alt') ?? '';
    const cls = el.getAttribute('class') ?? '';
    const w = Number(el.getAttribute('width'));
    const h = Number(el.getAttribute('height'));
    estado.n.m++;
    const ehSvgDoBundle = src.replace(/\\/g, '/').startsWith('assets/svg/');
    col.midias.push({
      id: `midia-${estado.n.m}`,
      seletor,
      tipo: ehSvgDoBundle ? 'icone' : 'imagem',
      urlOriginal: src.length > 0 ? src : undefined,
      exibicao: {
        ...(Number.isFinite(w) && Number.isFinite(h) && w > 0 && h > 0
          ? { proporcao: Number((w / h).toFixed(3)) }
          : {}),
      },
      obrigatorio: false,
      pareceLogo: /logo/i.test(`${src} ${alt} ${cls} ${el.getAttribute('id') ?? ''}`),
    });
  }
  if (tag === 'video') {
    const src = el.getAttribute('src') ?? el.querySelector('source')?.getAttribute('src') ?? '';
    const w = Number(el.getAttribute('width'));
    const h = Number(el.getAttribute('height'));
    estado.n.m++;
    col.midias.push({
      id: `midia-${estado.n.m}`,
      seletor,
      tipo: 'video',
      urlOriginal: src.length > 0 ? src : undefined,
      exibicao: {
        autoplay: el.hasAttribute('autoplay'),
        loop: el.hasAttribute('loop'),
        muted: el.hasAttribute('muted'),
        controls: el.hasAttribute('controls'),
        ...(el.getAttribute('poster') ? { posterUrl: el.getAttribute('poster') as string } : {}),
        ...(Number.isFinite(w) && Number.isFinite(h) && w > 0 && h > 0
          ? { proporcao: Number((w / h).toFixed(3)) }
          : {}),
      },
      // Vídeo de fundo (autoplay+muted) é a alma visual da dobra.
      obrigatorio: el.hasAttribute('autoplay') && el.hasAttribute('muted'),
      pareceLogo: false,
    });
  }
  // background-image inline no style do elemento.
  const style = el.getAttribute('style') ?? '';
  const bgInline = /background(?:-image)?\s*:\s*[^;]*url\(\s*['"]?([^'")]+)/i.exec(style);
  if (bgInline?.[1] !== undefined) {
    estado.n.m++;
    col.midias.push({
      id: `midia-${estado.n.m}`,
      seletor,
      tipo: 'background-image',
      urlOriginal: bgInline[1],
      exibicao: { overlay: /gradient\(/i.test(style) },
      obrigatorio: caminho.length <= 1,
      pareceLogo: false,
    });
  }

  // ── Texto ──
  if (tag !== 'a' && tag !== 'button' && !dentroDeLink(el)) {
    const texto = soFilhosInline(el) ? normalizar(el.text ?? '') : textoProprio(el);
    if (texto.length >= 2) {
      estado.n.t++;
      const papel = papelDoTexto(tag, texto, !estado.viuTitulo);
      if (papel === 'titulo') estado.viuTitulo = true;
      col.textos.push({
        id: `texto-${estado.n.t}`,
        seletor,
        papel,
        textoOriginal: texto,
        comprimento: texto.length,
        maxSugerido: Math.max(24, Math.ceil(texto.length * 1.4)),
      });
    }
  }
  if (/^h[12]$/.test(tag)) estado.viuTitulo = true;

  // ── Grupos repetidos ──
  const filhos = el.childNodes.filter(
    (f): f is HTMLElement => (f as HTMLElement).tagName !== undefined,
  );
  if (filhos.length >= 3) {
    const primeiro = filhos[0];
    if (primeiro !== undefined) {
      const assinatura = (e: HTMLElement): string =>
        `${e.tagName?.toLowerCase()}|${normalizar(e.getAttribute('class') ?? '')}`;
      const assinaturaBase = assinatura(primeiro);
      const iguais = filhos.every((f) => assinatura(f) === assinaturaBase);
      const tagFilho = primeiro.tagName?.toLowerCase() ?? '';
      if (iguais && !TAGS_INLINE.has(tagFilho) && tagFilho !== 'br') {
        estado.n.g++;
        col.grupos.push({
          id: `grupo-${estado.n.g}`,
          seletorContainer: seletor,
          seletorItem: ':scope > *:nth-child(1)',
          contagemOriginal: filhos.length,
          // O layout foi medido para N itens: encolher é seguro; crescer meia
          // leva é tolerável em grades. Decisão registrada, não medida.
          minItens: 1,
          maxItens: filhos.length + Math.ceil(filhos.length / 2),
          slotsDoItem: [],
        });
      }
    }
  }

  // Recursão pelos filhos-elemento (índice = posição entre TODOS os elementos).
  filhos.forEach((filho, i) => {
    coletarDoElemento(filho, [...caminho, i], estado, col);
  });
};

/** Slots de background-image declarados no CSS (seletor CSS = dono do fundo). */
const coletarBackgroundsDoCss = (css: string, col: Colecao, estado: { n: { m: number } }): void => {
  const blocos = css.matchAll(/([^{}]+)\{([^{}]*)\}/g);
  for (const bloco of blocos) {
    const seletorCss = normalizar(bloco[1] ?? '');
    const corpo = bloco[2] ?? '';
    if (seletorCss.startsWith('@') || seletorCss.length === 0) continue;
    const m = /background(?:-image)?\s*:\s*([^;]*url\(\s*['"]?([^'")]+)[^;]*)/i.exec(corpo);
    if (m?.[2] === undefined) continue;
    if (m[2].startsWith('data:')) continue;
    estado.n.m++;
    col.midias.push({
      id: `midia-${estado.n.m}`,
      seletor: seletorCss,
      tipo: 'background-image',
      urlOriginal: m[2],
      exibicao: { overlay: /gradient\(/i.test(m[1] ?? '') },
      obrigatorio: false,
      pareceLogo: false,
    });
  }
};

const derivarTokens = (
  cssTodo: string,
): { cores: CorTematizavel[]; fontes: FonteTematizavel[] } => {
  const cores: CorTematizavel[] = [];
  const vistas = new Set<string>();
  for (const m of cssTodo.matchAll(/(--[\w-]+)\s*:\s*([^;{}]+)[;}]/g)) {
    const nome = m[1] ?? '';
    const valor = normalizar(m[2] ?? '');
    if (!ehCor(valor) || vistas.has(nome)) continue;
    vistas.add(nome);
    const usos = cssTodo.split(`var(${nome}`).length - 1;
    cores.push({
      varName: nome,
      valor,
      ocorrencias: Math.max(1, usos),
      papelSugerido: papelPorNome(nome),
    });
  }
  // Cores literais mais usadas (fora de custom property): matéria-prima para a
  // camada de override do gerador quando a origem não tematizou nada.
  const literais = new Map<string, number>();
  for (const m of cssTodo.matchAll(
    /(?:^|;|\{)\s*(?:color|background(?:-color)?|border(?:-color)?)\s*:\s*([^;{}]+)/gi,
  )) {
    const valor = normalizar(m[1] ?? '');
    if (!ehCor(valor) || valor.includes('var(')) continue;
    literais.set(valor, (literais.get(valor) ?? 0) + 1);
  }
  const topo = [...literais.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12);
  for (const [valor, ocorrencias] of topo) {
    cores.push({ valor, ocorrencias });
  }

  const fontes: FonteTematizavel[] = [];
  const familias = new Map<string, { emTitulo: boolean; emCorpo: boolean; deVar: boolean }>();
  for (const m of cssTodo.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const seletor = (m[1] ?? '').toLowerCase();
    const corpo = m[2] ?? '';
    const ff = /font-family\s*:\s*([^;}]+)/i.exec(corpo);
    if (ff?.[1] === undefined) continue;
    const deVar = ff[1].includes('var(');
    const familia = familiaPrincipal(ff[1]);
    if (familia === null) continue;
    const atual = familias.get(familia) ?? { emTitulo: false, emCorpo: false, deVar: false };
    if (/h1|h2|h3|title|heading|display/.test(seletor)) atual.emTitulo = true;
    if (/\bbody\b|\bhtml\b|\bp\b|paragraph/.test(seletor)) atual.emCorpo = true;
    atual.deVar = atual.deVar || deVar;
    familias.set(familia, atual);
  }
  // Custom properties de fonte também contam como tematizáveis.
  for (const m of cssTodo.matchAll(/--[\w-]*font[\w-]*\s*:\s*([^;{}]+)[;}]/gi)) {
    const familia = familiaPrincipal(m[1] ?? '');
    if (familia === null) continue;
    const atual = familias.get(familia) ?? { emTitulo: false, emCorpo: false, deVar: false };
    atual.deVar = true;
    familias.set(familia, atual);
  }
  for (const [familia, uso] of familias) {
    const ehMono = /mono|code|courier/i.test(familia);
    fontes.push({
      familia,
      papelSugerido: ehMono ? 'mono' : uso.emTitulo && !uso.emCorpo ? 'display' : 'body',
      origem: uso.deVar ? 'custom-property' : 'declaracao',
    });
  }
  return { cores, fontes };
};

/** Liga os slots que vivem dentro do item-modelo de cada grupo. */
const ligarSlotsAosGrupos = (col: Colecao): void => {
  for (const grupo of col.grupos) {
    const prefixoItem = `${grupo.seletorContainer} > *:nth-child(1)`;
    const idsDoItem: string[] = [];
    for (const lista of [col.textos, col.midias, col.links] as const) {
      for (const slot of lista) {
        if (slot.seletor.startsWith(prefixoItem)) idsDoItem.push(slot.id);
      }
    }
    grupo.slotsDoItem = idsDoItem;
  }
};

export const derivarContrato = (entrada: EntradaContrato): ComponentContract => {
  const col: Colecao = { textos: [], midias: [], links: [], grupos: [], avisos: [] };
  const estado = { viuTitulo: false, n: { t: 0, m: 0, l: 0, g: 0 } };

  let raiz: HTMLElement | null = null;
  try {
    raiz = parse(entrada.html, { comment: false });
  } catch {
    col.avisos.push('O HTML do componente não pôde ser analisado; slots não derivados.');
  }
  if (raiz !== null) {
    const filhos = raiz.childNodes.filter(
      (f): f is HTMLElement => (f as HTMLElement).tagName !== undefined,
    );
    filhos.forEach((filho, i) => coletarDoElemento(filho, [i], estado, col));
  }

  const cssTodo = Object.values(entrada.css).join('\n');
  coletarBackgroundsDoCss(cssTodo, col, estado);
  ligarSlotsAosGrupos(col);

  // Resolve URLs originais para os arquivos locais do vault, quando a ponte existe.
  if (entrada.assets !== undefined && entrada.assets.length > 0) {
    const porUrl = new Map(entrada.assets.map((a) => [a.originalUrl, a.localPath]));
    for (const midia of col.midias) {
      if (midia.urlOriginal !== undefined) {
        const local = porUrl.get(midia.urlOriginal);
        if (local !== undefined) midia.localPath = local;
      }
    }
  }

  const tokens = derivarTokens(cssTodo);
  if (tokens.cores.length === 0) {
    col.avisos.push('Nenhuma cor tematizável encontrada no CSS — o override será por camada.');
  }

  const cssFiles = Object.entries(entrada.css)
    .filter(([, conteudo]) => conteudo.trim().length > 0)
    .map(([nome]) => nome);
  const jsFiles = [...(entrada.jsFiles ?? [])];
  const temAnimacoes =
    /@keyframes\s/i.test(cssTodo) || cssFiles.some((f) => f.includes('animations'));
  const temInteracoes =
    jsFiles.some((f) => /interactions|scroll|animations|runtime|bootstrap/.test(f)) ||
    /:hover\b/.test(cssTodo);

  const limites: Record<string, number> = {};
  for (const t of col.textos) {
    const atual = limites[t.papel];
    limites[t.papel] = atual === undefined ? t.maxSugerido : Math.max(atual, t.maxSugerido);
  }
  const grupos: Record<string, { min: number; max: number }> = {};
  for (const g of col.grupos) grupos[g.id] = { min: g.minItens, max: g.maxItens };

  const contrato: ComponentContract = {
    contractVersion: CONTRACT_VERSION,
    derivadoDe: entrada.origem,
    esqueleto: { cssFiles, jsFiles, temAnimacoes, temInteracoes },
    slots: { textos: col.textos, midias: col.midias, links: col.links, grupos: col.grupos },
    tokens,
    conteudo: {
      aceitaTitulo: col.textos.some((t) => t.papel === 'titulo'),
      aceitaSubtitulo: col.textos.some((t) => t.papel === 'subtitulo'),
      aceitaParagrafo: col.textos.some((t) => t.papel === 'paragrafo'),
      aceitaEyebrow: col.textos.some((t) => t.papel === 'eyebrow'),
      aceitaCta: col.links.some((l) => l.ehCta),
      aceitaMidia: col.midias.length > 0,
      limites,
      grupos,
    },
    avisos: col.avisos,
  };
  return ComponentContractSchema.parse(contrato);
};

// ── Leitura sob demanda (bundles existentes, V2 sem contrato e V1 legado) ────

/** Extrai o corpo de um documento completo; um fragmento passa intocado. */
const corpoDe = (html: string): string => {
  const m = /<body[^>]*>([\s\S]*?)<\/body>/i.exec(html);
  const corpo = m?.[1] ?? html;
  // Scripts não carregam slot e o texto deles poluiria a derivação.
  return corpo.replace(/<script[\s\S]*?<\/script>/gi, '');
};

/**
 * Lê o contrato de um bundle em disco: usa o gravado no `manifest.json` quando
 * está na versão atual; senão DERIVA na hora (sem gravar nada — o bundle é
 * imutável para quem lê). Cobre V2 novo (contract no manifest), V2 antigo
 * (manifest sem contract) e V1 legado (raw.html + styles.css, sem manifest).
 */
export const lerOuDerivarContrato = (bundleDir: string): ComponentContract | null => {
  const manifestPath = join(bundleDir, 'manifest.json');
  let manifest: {
    contract?: unknown;
    dependencies?: { assets?: { originalUrl?: unknown; localPath?: unknown; kind?: unknown }[] };
  } | null = null;
  if (existsSync(manifestPath)) {
    try {
      manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    } catch {
      manifest = null;
    }
  }

  if (manifest?.contract !== undefined) {
    const pronto = ComponentContractSchema.safeParse(manifest.contract);
    if (pronto.success && pronto.data.contractVersion === CONTRACT_VERSION) return pronto.data;
  }

  // Deriva do que existe em disco.
  const htmlPath = ['raw.html', 'index.html']
    .map((f) => join(bundleDir, f))
    .find((p) => existsSync(p));
  if (htmlPath === undefined) return null;
  const html = corpoDe(readFileSync(htmlPath, 'utf8'));

  const css: Record<string, string> = {};
  const cssDir = join(bundleDir, 'assets', 'css');
  if (existsSync(cssDir)) {
    for (const f of readdirSync(cssDir).filter((f) => f.endsWith('.css'))) {
      css[`assets/css/${f}`] = readFileSync(join(cssDir, f), 'utf8');
    }
  }
  if (Object.keys(css).length === 0 && existsSync(join(bundleDir, 'styles.css'))) {
    css['styles.css'] = readFileSync(join(bundleDir, 'styles.css'), 'utf8');
  }

  const jsFiles: string[] = [];
  const jsDir = join(bundleDir, 'assets', 'js');
  if (existsSync(jsDir)) {
    for (const f of readdirSync(jsDir).filter((f) => f.endsWith('.js'))) {
      jsFiles.push(`assets/js/${f}`);
    }
  }

  const assets = (manifest?.dependencies?.assets ?? [])
    .filter(
      (a): a is { originalUrl: string; localPath: string; kind?: string } =>
        typeof a?.originalUrl === 'string' && typeof a?.localPath === 'string',
    )
    .map((a) => ({ originalUrl: a.originalUrl, localPath: a.localPath, kind: a.kind }));

  return derivarContrato({
    html,
    css,
    jsFiles,
    assets,
    origem: manifest === null ? 'bundle-legado' : 'bundle-v2',
  });
};
