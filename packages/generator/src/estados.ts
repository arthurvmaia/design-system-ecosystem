import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { SegmentStatesFile, type StoredState } from '@ds/shared';

/**
 * OS ESTADOS CAPTURADOS VIRAM INTERAÇÃO NO SITE GERADO.
 *
 * O dado existe desde sempre e ninguém o lia: 16 das 288 peças da Biblioteca
 * têm `bundle/states.json`, 100 estados no total, e uma busca por `states.json`
 * no repositório inteiro achava UMA ocorrência, a própria escrita. Nem o
 * `@ds/generator` nem o `@ds/composer` abriam aquele arquivo. Tudo que a
 * captura descobriu sobre "o que acontece quando se clica" morria no vault.
 *
 * ── Por que DERIVAR, e não casar por posição ──────────────────────────────
 *
 * A tentação era ligar o i-ésimo clicável da peça ao i-ésimo estado. Foi
 * medido e é indefensável: `trigger` é `click` em 100/100 estados e `label` só
 * tem quatro valores distintos, então a ordem não carrega informação nenhuma
 * sobre quem dispara o quê. Pior: 75 dos 100 estados são IDÊNTICOS ao base
 * (o cmp_01KZFN4W2W tem 26/26 idênticos) e 8 são duplicata byte a byte de
 * outro estado. Casar por posição entregaria, na esmagadora maioria dos casos,
 * exatamente os dois defeitos proibidos: clique que não faz nada (75 casos) e
 * clique que faz a coisa errada (as duplicatas).
 *
 * Então a derivação é em dois tempos: ANCORAR (achar, dentro do corpo da peça,
 * o elemento que aquele HTML de estado retrata) e DIFERENÇA DE ATRIBUTO
 * (comparar âncora × estado e ficar só com o que é semântico).
 *
 * ── A decisão que resolve quatro riscos de graça ──────────────────────────
 *
 * NADA DE HTML NOVO ENTRA NA PÁGINA. SÓ ATRIBUTO.
 *
 * Sem injeção de HTML não há URL absoluta da origem viajando (5 estados em 4
 * componentes trazem `https://ds.asimov.academy/...` cru), não há
 * instrumentação da captura (`data-dsx2`/`data-dsx-scroll`, 100/100), não há id
 * duplicado e não há script embutido. O `montarReplay` do preview
 * (`apps/server/src/routes/preview.ts`) faz `alvo.innerHTML = st.html` e está
 * ERRADO para este corpus: o `html` de estado é um SUB-ELEMENTO, nunca a raiz
 * do bundle (100/100 são `div|summary|svg|a|button|img|span|details`), então
 * aplicar o st_2 do FAQ trocaria a seção inteira por um `<summary>` solto. Ele
 * serve para entender a semântica; não para copiar.
 *
 * ── Expectativa honesta ───────────────────────────────────────────────────
 *
 * Neste acervo, entre 0 e 6 estados dos 100 chegam a ligar fio. Isso não é
 * fracasso da fatia: o material genuinamente aproveitável são ~10 estados de
 * delta semântico, e as duas travas (`ja-nativo`, `ja-tem-script`) comem a
 * maior parte deles. O que a fatia entrega hoje é correção quando a captura
 * melhorar, e o `estados-derivados.json`, que pela primeira vez põe em texto o
 * que existe naqueles 16 arquivos que ninguém lia.
 */

/** O que aconteceu com um estado capturado. */
export type VereditoDeEstado =
  | 'ligado'
  | 'sem-delta'
  | 'ambiguo'
  | 'nao-achado'
  | 'estrutura-diferente'
  | 'ja-nativo'
  | 'ja-tem-script'
  | 'sem-gatilho'
  | 'precisa-texto'
  | 'texto-da-origem'
  | 'asset-remoto'
  | 'portal'
  | 'excedeu';

export type EstadoDerivado = {
  pecaId: string;
  estadoId: string;
  rotuloDaCaptura: string;
  veredito: VereditoDeEstado;
  motivo: string;
  /** A chave única DA PÁGINA deste estado. Só quando `ligado`. */
  chave?: string;
  gatilhoAncoraId?: string;
  ancoras?: { ancoraId: string; set: Record<string, string | null> }[];
  copiaAncoraId?: string;
  /**
   * O texto do estado NA ORIGEM. Vai para o aviso e para o JSON de diagnóstico,
   * NUNCA para a página: injetar a palavra que a outra empresa escreveu é
   * exatamente o que a regra S2 reprova.
   */
  textoDaOrigem?: string;
  /**
   * Pistas do gatilho (classes e nomes de `data-*`) para a poda da fase 2.
   * É por elas que se descobre que o script da origem já liga aquele clique.
   */
  pistasDoGatilho?: string[];
};

// ───────────────────────────── Leitura do bundle ─────────────────────────────

/**
 * Lê `bundle/states.json`. Arquivo ausente devolve lista vazia sem ruído (272
 * das 288 peças não têm estado nenhum); arquivo que não valida devolve vazio
 * com a razão, porque aí houve um defeito e calar seria perder o sinal.
 */
export const lerEstadosDoBundle = (
  bundlePath: string,
): { estados: StoredState[]; aviso: string | null } => {
  const arquivo = join(bundlePath, 'states.json');
  if (!existsSync(arquivo)) return { estados: [], aviso: null };
  let cru: unknown;
  try {
    cru = JSON.parse(readFileSync(arquivo, 'utf8'));
  } catch {
    return {
      estados: [],
      aviso: 'o states.json do bundle não é JSON válido: os estados ficaram de fora.',
    };
  }
  const lido = SegmentStatesFile.safeParse(cru);
  if (!lido.success) {
    return {
      estados: [],
      aviso:
        'o states.json do bundle não bate com o schema SegmentStatesFile: os estados ficaram de fora.',
    };
  }
  return { estados: lido.data.states, aviso: null };
};

// ─────────────────────────── Tokenizador de tags ─────────────────────────────

/**
 * O repositório não tem parser de HTML (nem `cheerio`, nem `parse5`) e não é
 * hora de ganhar um: tudo aqui é string, e o tokenizador mora no módulo, no
 * mesmo estilo de `extrairCamadasDeFundo` (`montagem.ts`).
 */
const VAZIOS = new Set([
  'area',
  'base',
  'br',
  'col',
  'embed',
  'hr',
  'img',
  'input',
  'link',
  'meta',
  'param',
  'source',
  'track',
  'wbr',
]);

/** Tags cujo miolo NÃO é marcação: entrar nelas é ler `<` de JavaScript como tag. */
const OPACAS = new Set(['script', 'style', 'textarea', 'template']);

export type Elemento = {
  nome: string;
  /** Índice do `<` da tag de abertura. */
  inicio: number;
  /** Índice logo depois do `>` da tag de abertura. */
  fimTagAberta: number;
  /** Índice onde o conteúdo termina (antes da tag de fechamento). */
  fimConteudo: number;
  /** Índice logo depois do `</tag>` (ou da própria tag, quando vazia). */
  fim: number;
  tagAberta: string;
  pai: number | null;
};

const TAG = /<(\/?)([a-zA-Z][\w:.-]*)((?:"[^"]*"|'[^']*'|[^>"'])*)>/g;

/** Quebra o HTML numa lista de elementos em ordem de documento. */
export const analisar = (html: string): Elemento[] => {
  const els: Elemento[] = [];
  const pilha: number[] = [];
  const re = new RegExp(TAG.source, 'g');
  let m = re.exec(html);
  while (m !== null) {
    const fechando = m[1] === '/';
    const nome = (m[2] ?? '').toLowerCase();
    const attrs = m[3] ?? '';
    if (fechando) {
      for (let i = pilha.length - 1; i >= 0; i -= 1) {
        const idx = pilha[i];
        if (idx === undefined) continue;
        const alvo = els[idx];
        if (alvo !== undefined && alvo.nome === nome) {
          alvo.fimConteudo = m.index;
          alvo.fim = m.index + m[0].length;
          pilha.length = i;
          break;
        }
      }
      m = re.exec(html);
      continue;
    }
    const fimTagAberta = m.index + m[0].length;
    const pai = pilha.length > 0 ? (pilha[pilha.length - 1] ?? null) : null;
    const el: Elemento = {
      nome,
      inicio: m.index,
      fimTagAberta,
      fimConteudo: fimTagAberta,
      fim: fimTagAberta,
      tagAberta: m[0],
      pai,
    };
    els.push(el);
    if (VAZIOS.has(nome) || /\/\s*$/.test(attrs)) {
      m = re.exec(html);
      continue;
    }
    if (OPACAS.has(nome)) {
      const alvo = `</${nome}`;
      const onde = html.toLowerCase().indexOf(alvo, fimTagAberta);
      if (onde < 0) {
        el.fimConteudo = html.length;
        el.fim = html.length;
        break;
      }
      const fecha = html.indexOf('>', onde);
      el.fimConteudo = onde;
      el.fim = fecha < 0 ? html.length : fecha + 1;
      re.lastIndex = el.fim;
      m = re.exec(html);
      continue;
    }
    pilha.push(els.length - 1);
    m = re.exec(html);
  }
  // Elemento que nunca fechou vai até o fim do trecho: melhor um limite largo
  // que um elemento de largura zero, que sumiria da comparação.
  for (const idx of pilha) {
    const el = els[idx];
    if (el !== undefined && el.fim === el.fimTagAberta) {
      el.fimConteudo = html.length;
      el.fim = html.length;
    }
  }
  return els;
};

const ATTR = /([a-zA-Z_:][\w:.-]*)\s*(?:=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g;

/** Lê os atributos de uma tag de abertura. Nome em minúsculas. */
export const atributosDe = (tagAberta: string): Map<string, string> => {
  const dentro = tagAberta.replace(/^<[a-zA-Z][\w:.-]*/, '').replace(/\/?>$/, '');
  const mapa = new Map<string, string>();
  const re = new RegExp(ATTR.source, 'g');
  let m = re.exec(dentro);
  while (m !== null) {
    const nome = (m[1] ?? '').toLowerCase();
    if (nome.length > 0 && !mapa.has(nome)) mapa.set(nome, m[2] ?? m[3] ?? m[4] ?? '');
    m = re.exec(dentro);
  }
  return mapa;
};

const normalizarEspaco = (s: string): string => s.replace(/\s+/g, ' ').trim();

const semTags = (s: string): string => normalizarEspaco(s.replace(/<[^>]*>/g, ' '));

const textoInternoDe = (html: string, el: Elemento): string =>
  semTags(html.slice(el.fimTagAberta, el.fimConteudo));

/** O texto que é FILHO DIRETO deste elemento (sem o dos descendentes). */
const textoDireto = (html: string, els: readonly Elemento[], i: number): string => {
  const el = els[i];
  if (el === undefined) return '';
  let saida = '';
  let cursor = el.fimTagAberta;
  for (let j = i + 1; j < els.length; j += 1) {
    const f = els[j];
    if (f === undefined || f.inicio >= el.fimConteudo) break;
    if (f.pai !== i) continue;
    saida += html.slice(cursor, f.inicio);
    cursor = f.fim;
  }
  saida += html.slice(cursor, el.fimConteudo);
  return semTags(saida);
};

// ──────────────────────────── Limpeza do estado ──────────────────────────────

/**
 * Limpa o HTML de estado ANTES de qualquer comparação.
 *
 * Cada passo tem um caso medido: `<script>` embutido (risco 6), `on*=`
 * (`onmouseover`/`onmouseout` em 2 estados do cmp_01KZFN65MJ), e a
 * instrumentação da captura `data-dsx*`, que aparece em 100/100 estados e que o
 * `index.html` do bundle JÁ teve limpa. Sem o passo 3, todo estado pareceria
 * diferente da âncora por causa de um número de instrumentação.
 */
export const limparHtmlDeEstado = (html: string): string =>
  html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, '')
    .replace(/<script\b[^>]*\/>/gi, '')
    .replace(/\son[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/\sdata-dsx[\w-]*\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/\sdata-dsx[\w-]*(?=[\s>])/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/>\s+</g, '><')
    .trim();

// ──────────────────────────────── Ancoragem ─────────────────────────────────

/**
 * Atributos que NÃO entram na impressão digital, porque são justamente o que o
 * estado muda: comparar por eles faria a âncora nunca casar consigo mesma.
 */
const INSTAVEIS = new Set([
  'style',
  'class',
  'open',
  'hidden',
  'selected',
  'checked',
  'src',
  'srcset',
  'poster',
  'width',
  'height',
]);

const instavel = (nome: string): boolean =>
  INSTAVEIS.has(nome) || nome.startsWith('aria-') || nome.startsWith('data-');

/**
 * A identidade de um elemento para efeito de ancoragem: a tag, os atributos
 * ESTÁVEIS e o texto interno (120 caracteres bastam; textos longos só engordam
 * a chave sem separar nada que os 120 primeiros já não separem).
 */
export const impressaoDigital = (tagAberta: string, textoInterno: string): string => {
  const nome = /^<([a-zA-Z][\w:.-]*)/.exec(tagAberta)?.[1]?.toLowerCase() ?? '';
  const estaveis = [...atributosDe(tagAberta)]
    .filter(([k]) => !instavel(k))
    .map(([k, v]) => `${k}=${normalizarEspaco(v)}`)
    .sort();
  return `${nome}|${estaveis.join('|')}|${normalizarEspaco(textoInterno).slice(0, 120)}`;
};

/** A sequência de tags da subárvore de `i`, na ordem do documento. */
const sequenciaDeTags = (els: readonly Elemento[], i: number): string => {
  const raiz = els[i];
  if (raiz === undefined) return '';
  const nomes: string[] = [raiz.nome];
  for (let j = i + 1; j < els.length; j += 1) {
    const el = els[j];
    if (el === undefined || el.inicio >= raiz.fim) break;
    nomes.push(el.nome);
  }
  return nomes.join('>');
};

/**
 * A segunda passada da ancoragem: SEM o texto.
 *
 * O texto é o discriminador mais forte que existe, mas não pode ser exigido
 * justamente quando o estado é SOBRE o texto ("Ver mais" virando "Ver menos"):
 * ali a primeira passada acha zero âncoras e o estado sairia como `nao-achado`
 * por um motivo que não é verdade. Esta passada troca o texto pela FORMA da
 * subárvore, e continua exigindo unicidade: duas formas iguais viram `ambiguo`,
 * como antes.
 */
const impressaoSemTexto = (els: readonly Elemento[], i: number): string => {
  const el = els[i];
  if (el === undefined) return '';
  const estaveis = [...atributosDe(el.tagAberta)]
    .filter(([k]) => !instavel(k))
    .map(([k, v]) => `${k}=${normalizarEspaco(v)}`)
    .sort();
  return `${el.nome}|${estaveis.join('|')}|${sequenciaDeTags(els, i)}`;
};

/** Todos os elementos do corpo cuja impressão digital bate. Devolve os offsets. */
export const acharAncoras = (corpo: string, impressao: string): number[] => {
  const els = analisar(corpo);
  const achados: number[] = [];
  for (const el of els) {
    const interno = semTags(corpo.slice(el.fimTagAberta, el.fimConteudo));
    if (impressaoDigital(el.tagAberta, interno) === impressao) achados.push(el.inicio);
  }
  return achados;
};

// ───────────────────────────── Diferença e ruído ─────────────────────────────

/**
 * `id` é maquinaria, e é ela que o script local da origem usa
 * (`getElementById('active-card')` no carrossel): mexer nisso é quebrar a peça.
 * `href`, `name` e `for` amarram navegação e formulário. `on*` e `data-dsx*`
 * não voltam nunca — foi para tirá-los que existe a limpeza.
 */
const PROIBIDOS = /^(?:id|name|for|href|on[a-z]+|data-dsx[\w-]*|data-ds-[\w-]*)$/i;

const PERMITIDOS = new Set([
  'class',
  'style',
  'open',
  'hidden',
  'selected',
  'checked',
  'disabled',
  'value',
  'src',
  'srcset',
  'poster',
]);

const permitido = (nome: string): boolean =>
  !PROIBIDOS.test(nome) &&
  (PERMITIDOS.has(nome) || nome.startsWith('aria-') || nome.startsWith('data-'));

/** Diferença de atributos entre duas tags de abertura, já pela lista branca. */
export const diferencaDeAtributos = (
  base: string,
  estado: string,
): Record<string, string | null> => {
  const a = atributosDe(base);
  const b = atributosDe(estado);
  const saida: Record<string, string | null> = {};
  for (const [k, v] of b) {
    if (!permitido(k)) continue;
    if (a.get(k) !== v) saida[k] = v;
  }
  for (const [k] of a) {
    if (!permitido(k)) continue;
    if (!b.has(k)) saida[k] = null;
  }
  return saida;
};

const COR = /^(?:#[0-9a-f]{3,8}|rgba?\([^)]*\)|hsla?\([^)]*\))$/i;

/** Canonical de cor, para `#e8e6e3` e `rgb(232, 230, 227)` não virarem delta. */
const normalizarCor = (valor: string): string | null => {
  const v = valor.trim().toLowerCase();
  if (!COR.test(v)) return null;
  if (v.startsWith('#')) {
    const h = v.slice(1);
    const exp = h.length === 3 || h.length === 4 ? [...h].map((c) => c + c).join('') : h;
    const n = (i: number): number => Number.parseInt(exp.slice(i * 2, i * 2 + 2), 16);
    const alfa = exp.length === 8 ? n(3) / 255 : 1;
    return `${n(0)},${n(1)},${n(2)},${alfa.toFixed(3)}`;
  }
  const partes = v
    .slice(v.indexOf('(') + 1, v.lastIndexOf(')'))
    .split(/[,\s/]+/)
    .filter((p) => p.length > 0);
  if (partes.length < 3) return null;
  const alfa = partes[3] === undefined ? 1 : Number.parseFloat(partes[3]);
  return `${partes[0]},${partes[1]},${partes[2]},${(Number.isNaN(alfa) ? 1 : alfa).toFixed(3)}`;
};

const NUMERO = /-?\d+(?:\.\d+)?/;

/**
 * N2 subpixel: `width="24"` → `"25"` e `width:18px` → `19px` são a captura
 * fotografando um `group-hover:scale-110` no meio do caminho, não uma decisão
 * de desenho. Menos de 2px OU menos de 5% é ruído.
 */
const subpixel = (antes: string, depois: string): boolean => {
  const a = NUMERO.exec(antes.trim());
  const b = NUMERO.exec(depois.trim());
  if (a === null || b === null) return false;
  const so = (s: string, m: RegExpExecArray): boolean =>
    s.trim().replace(m[0], '#') === '#' ||
    s.trim().replace(m[0], '#') === '#px' ||
    s.trim().replace(m[0], '#') === '#rem' ||
    s.trim().replace(m[0], '#') === '#%' ||
    s.trim().replace(m[0], '#') === '#em';
  if (!so(antes, a) || !so(depois, b)) return false;
  const x = Number.parseFloat(a[0]);
  const y = Number.parseFloat(b[0]);
  const d = Math.abs(x - y);
  return (
    d < 2 ||
    (Math.max(Math.abs(x), Math.abs(y)) > 0 && d / Math.max(Math.abs(x), Math.abs(y)) < 0.05)
  );
};

/**
 * N3 coordenada de mouse: `radial-gradient(400px at 32px 99.5px ...)` virando
 * `... at 157px 153.5px` é onde o ponteiro estava no instante do print. Se a
 * ÚNICA diferença são os números dentro de um `gradient(...)`, é ruído.
 */
const gradienteSoMudouPosicao = (antes: string, depois: string): boolean => {
  if (!antes.includes('gradient(') || !depois.includes('gradient(')) return false;
  const semNumeros = (s: string): string => s.replace(/-?\d+(?:\.\d+)?/g, '#');
  return semNumeros(antes) === semNumeros(depois);
};

/**
 * N5 asset equivalente: o motor V2 grava no estado a URL ABSOLUTA da origem
 * (`.../59aa4679bd568a7f_7a47....png`) enquanto o corpo já referencia o mesmo
 * arquivo local (`assets/image/59aa4679bd568a7f.png`). É o MESMO asset, e o
 * prefixo hexadecimal antes do primeiro `_` prova isso.
 */
const mesmoAsset = (antes: string, depois: string): boolean => {
  const chave = (u: string): string => {
    const base = (u.split(/[?#]/)[0] ?? '').split('/').pop() ?? '';
    const semExt = base.replace(/\.[a-z0-9]+$/i, '');
    return (semExt.split('_')[0] ?? semExt).toLowerCase();
  };
  const a = chave(antes);
  const b = chave(depois);
  return a.length >= 8 && a === b;
};

/**
 * N6 glitch de texto: `>Aerea<` virando `>AereN<` é datamosh do frame errado,
 * não conteúdo novo. Menos de 25% dos caracteres e menos de 3 de diferença de
 * comprimento.
 */
const glitchDeTexto = (antes: string, depois: string): boolean => {
  if (antes === depois) return true;
  if (Math.abs(antes.length - depois.length) >= 3) return false;
  const n = Math.max(antes.length, depois.length);
  if (n === 0) return true;
  let diferentes = 0;
  for (let i = 0; i < n; i += 1) if (antes[i] !== depois[i]) diferentes += 1;
  return diferentes / n < 0.25;
};

/** Declarações de um `style=""`, na ordem. */
const declaracoes = (style: string): Map<string, string> => {
  const mapa = new Map<string, string>();
  for (const parte of style.split(';')) {
    const i = parte.indexOf(':');
    if (i < 0) continue;
    const chave = parte.slice(0, i).trim().toLowerCase();
    if (chave.length === 0) continue;
    mapa.set(chave, parte.slice(i + 1).trim());
  }
  return mapa;
};

/**
 * O filtro de ruído, por atributo. `'#texto'` é o sentinela do texto direto,
 * que não é atributo mas passa pela mesma régua (N6).
 */
export const ehRuido = (attr: string, antes: string | null, depois: string | null): boolean => {
  if (antes === depois) return true;
  if (attr === '#texto') return glitchDeTexto(antes ?? '', depois ?? '');
  if (antes === null || depois === null) return false;
  if (normalizarEspaco(antes) === normalizarEspaco(depois)) return true;
  if (attr === 'class') {
    const conjunto = (s: string): string =>
      [...new Set(s.split(/\s+/).filter((c) => c.length > 0))].sort().join(' ');
    return conjunto(antes) === conjunto(depois);
  }
  if (attr === 'src' || attr === 'srcset' || attr === 'poster') return mesmoAsset(antes, depois);
  if (attr === 'width' || attr === 'height' || attr === 'value') return subpixel(antes, depois);
  if (attr === 'style') {
    const a = declaracoes(antes);
    const b = declaracoes(depois);
    if (a.size !== b.size) return false;
    for (const [k, vb] of b) {
      const va = a.get(k);
      if (va === undefined) return false;
      if (va === vb) continue;
      const ca = normalizarCor(va);
      const cb = normalizarCor(vb);
      if (ca !== null && cb !== null && ca === cb) continue;
      if (subpixel(va, vb)) continue;
      if (gradienteSoMudouPosicao(va, vb)) continue;
      return false;
    }
    return true;
  }
  const ca = normalizarCor(antes);
  const cb = normalizarCor(depois);
  if (ca !== null && cb !== null) return ca === cb;
  return false;
};

// ──────────────────────────────── O gatilho ─────────────────────────────────

/**
 * Um `<a href="/x">` ou `<a href="#hero">` NÃO vira gatilho. Com
 * `preventDefault` a navegação quebra; sem ele o clique faz duas coisas. Foi o
 * caso do cmp_01KZFN65MJ (`href="#hero"`), que de todo modo é artefato de hover.
 */
const ehClicavel = (el: Elemento): boolean => {
  const attrs = atributosDe(el.tagAberta);
  if (el.nome === 'button' || el.nome === 'summary') return true;
  if ((attrs.get('role') ?? '').toLowerCase() === 'button') return true;
  if (el.nome === 'input') {
    const t = (attrs.get('type') ?? 'text').toLowerCase();
    return t === 'button' || t === 'submit' || t === 'checkbox' || t === 'radio';
  }
  if (el.nome === 'label') return attrs.has('for');
  if (el.nome === 'a') {
    const href = (attrs.get('href') ?? '').trim();
    return href === '' || href === '#' || href.toLowerCase().startsWith('javascript:');
  }
  return false;
};

/** Classes e nomes de `data-*` do gatilho: as pistas da poda da fase 2. */
const pistasDe = (el: Elemento): string[] => {
  const attrs = atributosDe(el.tagAberta);
  const pistas = (attrs.get('class') ?? '').split(/\s+/).filter((c) => c.length > 2);
  for (const [k] of attrs) if (k.startsWith('data-') && !PROIBIDOS.test(k)) pistas.push(k);
  return [...new Set(pistas)];
};

// ─────────────────────────────── A derivação ────────────────────────────────

/** Teto de estados ligados por peça. Acima disso é ruído, não interação. */
const TETO_POR_PECA = 12;

/** Mais que isto de elementos alterados é redesenho, não delta de estado. */
const TETO_DE_ELEMENTOS = 8;

const escaparAttr = (s: string): string =>
  s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const escaparTexto = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export type CopiaDeEstado = { rotulo?: string; texto?: string };

export const derivarEstados = (args: {
  pecaId: string;
  corpo: string;
  estados: readonly StoredState[];
  copiaPorEstado: ReadonlyMap<string, CopiaDeEstado>;
  nomesDaOrigem: readonly string[];
  /** Contador da PÁGINA. Nunca um `id`: id é maquinaria e é da peça. */
  proximaAncora: () => string;
}): { corpo: string; templates: string; derivados: EstadoDerivado[] } => {
  const derivados: EstadoDerivado[] = [];
  const els = analisar(args.corpo);
  const chaveDoElemento = new Map<number, string>();
  const marcas: { pos: number; texto: string }[] = [];
  const templates: string[] = [];
  let ligados = 0;

  /** Dá (ou reusa) a alça deste elemento. */
  const alcaDe = (i: number): string => {
    const jaTem = chaveDoElemento.get(i);
    if (jaTem !== undefined) return jaTem;
    const nova = args.proximaAncora();
    chaveDoElemento.set(i, nova);
    const el = els[i];
    if (el !== undefined) {
      const antesDoFecha =
        args.corpo[el.fimTagAberta - 2] === '/' ? el.fimTagAberta - 2 : el.fimTagAberta - 1;
      marcas.push({ pos: antesDoFecha, texto: ` data-orbis-ancora="${nova}"` });
    }
    return nova;
  };

  const registrar = (
    estado: StoredState,
    veredito: VereditoDeEstado,
    motivo: string,
    extra?: Partial<EstadoDerivado>,
  ): void => {
    derivados.push({
      pecaId: args.pecaId,
      estadoId: estado.id,
      rotuloDaCaptura: estado.label,
      veredito,
      motivo,
      ...extra,
    });
  };

  for (const estado of args.estados) {
    if (estado.htmlRef !== undefined || estado.portalHtmlRef !== undefined) {
      registrar(
        estado,
        'nao-achado',
        'o estado aponta para um blob externo (htmlRef) que o bundle não resolveu: não há HTML para comparar.',
      );
      continue;
    }
    if (
      estado.hasPortal === true ||
      estado.method === 'portal' ||
      estado.portalHtml !== undefined
    ) {
      // Medido no acervo: 28/100 estados declaram portal, e o caso examinado
      // não é modal — são três camadas de fundo soltas, duas delas JÁ presentes
      // no index.html dentro de `data-ds-camadas-de-fundo`, e uma
      // `position:fixed` de viewport inteira. Injetar duplicaria camada fixa
      // sobre a página do cliente.
      registrar(
        estado,
        'portal',
        'o estado abre conteúdo em portal (fora da peça). Esta fatia declara e não consome: injetar camada fixa duplicaria o que a peça já traz.',
      );
      continue;
    }

    const limpo = limparHtmlDeEstado(estado.html);
    const elsEstado = analisar(limpo);
    const raiz = elsEstado[0];
    if (raiz === undefined) {
      registrar(estado, 'nao-achado', 'o HTML do estado ficou vazio depois da limpeza.');
      continue;
    }

    const impressao = impressaoDigital(raiz.tagAberta, textoInternoDe(limpo, raiz));
    const candidatos: number[] = [];
    for (let i = 0; i < els.length; i += 1) {
      const el = els[i];
      if (el === undefined || el.nome !== raiz.nome) continue;
      if (impressaoDigital(el.tagAberta, textoInternoDe(args.corpo, el)) === impressao)
        candidatos.push(i);
    }
    if (candidatos.length === 0) {
      // Segunda passada: a forma da subárvore no lugar do texto. É o único
      // caminho para um estado que MUDA o texto ("Ver mais" → "Ver menos") ser
      // ancorado, e continua exigindo unicidade.
      const forma = impressaoSemTexto(elsEstado, 0);
      for (let i = 0; i < els.length; i += 1) {
        const el = els[i];
        if (el === undefined || el.nome !== raiz.nome) continue;
        if (impressaoSemTexto(els, i) === forma) candidatos.push(i);
      }
    }
    if (candidatos.length === 0) {
      registrar(
        estado,
        'nao-achado',
        'o elemento que este estado retrata não existe neste corpo (a peça foi recortada, ou o texto foi trocado pelo criativo).',
      );
      continue;
    }
    if (candidatos.length > 1) {
      // Os 4 chevrons `<svg>` do FAQ existem 5 vezes idênticos: escolher o
      // primeiro é chute, e chute aqui é clique que faz a coisa errada.
      registrar(
        estado,
        'ambiguo',
        `${candidatos.length} elementos deste corpo são idênticos ao do estado: escolher um deles seria chute.`,
      );
      continue;
    }
    const iAncora = candidatos[0] as number;
    const ancora = els[iAncora] as Elemento;

    // Subárvore da âncora × subárvore do estado, elemento a elemento.
    const subAncora: number[] = [];
    for (let j = iAncora; j < els.length; j += 1) {
      const el = els[j];
      if (el === undefined) break;
      if (j > iAncora && el.inicio >= ancora.fim) break;
      subAncora.push(j);
    }
    if (subAncora.length !== elsEstado.length) {
      registrar(
        estado,
        'estrutura-diferente',
        `o estado tem ${elsEstado.length} elemento(s) e a âncora tem ${subAncora.length}: é redesenho, não variação.`,
      );
      continue;
    }

    const mudancas: { indice: number; set: Record<string, string | null> }[] = [];
    let textoNovo: { indice: number; antes: string; depois: string } | null = null;
    let assetRemoto: string | null = null;
    let srcJaTrocado = false;
    let estruturaDiferente: string | null = null;

    for (let k = 0; k < subAncora.length; k += 1) {
      const iA = subAncora[k] as number;
      const elA = els[iA] as Elemento;
      const elE = elsEstado[k] as Elemento;
      if (elA.nome !== elE.nome) {
        estruturaDiferente = `na posição ${k} a âncora tem <${elA.nome}> e o estado tem <${elE.nome}>.`;
        break;
      }
      const bruto = diferencaDeAtributos(elA.tagAberta, elE.tagAberta);
      const set: Record<string, string | null> = {};
      const attrsA = atributosDe(elA.tagAberta);
      for (const [attr, valor] of Object.entries(bruto)) {
        const antes = attrsA.get(attr) ?? null;
        if (ehRuido(attr, antes, valor)) continue;
        if (attr === 'src' || attr === 'srcset' || attr === 'poster') {
          // Camada extra: se a foto da origem JÁ foi trocada pela do projeto
          // (a troca roda imediatamente antes deste ponto), repor a foto da
          // outra empresa num clique fura a S2 por um caminho novo.
          if (antes !== null && !antes.startsWith('assets/')) {
            srcJaTrocado = true;
            continue;
          }
          if (valor !== null && /https?:\/\//i.test(valor)) {
            assetRemoto = valor;
            break;
          }
        }
        set[attr] = valor;
      }
      if (assetRemoto !== null) break;
      const tA = textoDireto(args.corpo, els, iA);
      const tE = textoDireto(limpo, elsEstado, k);
      if (!ehRuido('#texto', tA, tE)) {
        const temFilho = elsEstado.some((f) => f.pai === k);
        if (temFilho) {
          estruturaDiferente =
            'o texto muda num elemento que tem filhos: trocar o texto ali apagaria a estrutura da peça.';
          break;
        }
        textoNovo = { indice: iA, antes: tA, depois: tE };
      }
      if (Object.keys(set).length > 0) mudancas.push({ indice: iA, set });
    }

    if (estruturaDiferente !== null) {
      registrar(estado, 'estrutura-diferente', estruturaDiferente);
      continue;
    }
    if (assetRemoto !== null) {
      const dominio = /https?:\/\/([^/]+)/i.exec(assetRemoto)?.[1] ?? assetRemoto;
      registrar(
        estado,
        'asset-remoto',
        `o estado quer carregar uma imagem de ${dominio}, que é servidor de outra empresa e não casa com nenhum asset local da peça.`,
      );
      continue;
    }
    if (mudancas.length > TETO_DE_ELEMENTOS) {
      registrar(
        estado,
        'estrutura-diferente',
        `${mudancas.length} elementos mudam de uma vez (o teto é ${TETO_DE_ELEMENTOS}): isso é redesenho, não delta de estado.`,
      );
      continue;
    }
    if (mudancas.length === 0 && textoNovo === null) {
      const nota = srcJaTrocado
        ? ' (a única diferença era uma foto da origem que já foi trocada pela mídia do projeto)'
        : '';
      registrar(
        estado,
        'sem-delta',
        `a diferença era só ruído da captura${nota}: não carrega informação.`,
      );
      continue;
    }

    // Trava nativa: `<details>` + delta só de `open` é a maior família
    // informativa do acervo, e o navegador JÁ alterna isso sozinho. Ligar um
    // handler por cima abre e fecha no mesmo clique.
    if (textoNovo === null && ehNativo(ancora, mudancas)) {
      registrar(
        estado,
        'ja-nativo',
        `<${ancora.nome}> já alterna isso sozinho no navegador: ligar um clique por cima abriria e fecharia na mesma ação.`,
      );
      continue;
    }

    const copia = args.copiaPorEstado.get(estado.id);
    if (textoNovo !== null) {
      const texto = copia?.texto?.trim();
      if (texto === undefined || texto.length === 0) {
        registrar(
          estado,
          'precisa-texto',
          'o estado muda TEXTO e o criativo não escreveu o texto novo. O texto da origem não viaja.',
          { textoDaOrigem: textoNovo.depois },
        );
        continue;
      }
      const daOrigem = args.nomesDaOrigem.find((n) =>
        texto.toLowerCase().includes(n.toLowerCase()),
      );
      if (daOrigem !== undefined) {
        registrar(
          estado,
          'texto-da-origem',
          `o texto que o criativo escreveu para este estado traz "${daOrigem}", que é o nome da empresa de origem.`,
          { textoDaOrigem: textoNovo.depois },
        );
        continue;
      }
    }

    // Gatilho: a própria âncora → o primeiro descendente clicável → o ancestral
    // clicável mais próximo, sem sair da peça.
    let iGatilho: number | null = ehClicavel(ancora) ? iAncora : null;
    if (iGatilho === null) {
      for (const j of subAncora) {
        const el = els[j];
        if (el !== undefined && ehClicavel(el)) {
          iGatilho = j;
          break;
        }
      }
    }
    if (iGatilho === null) {
      let pai = ancora.pai;
      while (pai !== null) {
        const el = els[pai];
        if (el === undefined) break;
        if (ehClicavel(el)) {
          iGatilho = pai;
          break;
        }
        pai = el.pai;
      }
    }
    if (iGatilho === null) {
      registrar(
        estado,
        'sem-gatilho',
        'não há elemento clicável seguro nesta peça para disparar o estado (link de navegação não serve: ou quebra o link, ou faz duas coisas).',
      );
      continue;
    }
    if (ligados >= TETO_POR_PECA) {
      registrar(estado, 'excedeu', `esta peça já ligou ${TETO_POR_PECA} estados, que é o teto.`);
      continue;
    }

    // A rede final, inegociável: nenhuma string emitida por esta fatia pode
    // conter `://`. É o que preserva a S8 mesmo se um filtro acima falhar.
    const emitido =
      JSON.stringify(mudancas.map((m) => m.set)) + (copia?.texto ?? '') + (copia?.rotulo ?? '');
    if (/https?:\/\//i.test(emitido) || emitido.includes('://')) {
      registrar(
        estado,
        'asset-remoto',
        'algo que este estado emitiria carrega um endereço absoluto (`://`). A rede final derrubou o estado inteiro.',
      );
      continue;
    }

    const chave = args.proximaAncora();
    const ancoras = mudancas.map((m) => ({ ancoraId: alcaDe(m.indice), set: m.set }));
    const copiaAncoraId = textoNovo === null ? undefined : alcaDe(textoNovo.indice);
    const elGatilho = els[iGatilho] as Elemento;
    const gatilhoAncoraId = alcaDe(iGatilho);
    const antesDoFecha =
      args.corpo[elGatilho.fimTagAberta - 2] === '/'
        ? elGatilho.fimTagAberta - 2
        : elGatilho.fimTagAberta - 1;
    marcas.push({ pos: antesDoFecha, texto: ` data-orbis-gatilho="${chave}"` });

    const rotulo = copia?.rotulo?.trim() ?? estado.label;
    templates.push(
      [
        `<template data-orbis-estado="${chave}"`,
        ` data-orbis-captura="${escaparAttr(estado.id)}"`,
        ` data-orbis-attrs="${escaparAttr(JSON.stringify(ancoras.map((a) => ({ a: a.ancoraId, set: a.set }))))}"`,
        copiaAncoraId === undefined ? '' : ` data-orbis-copia="${copiaAncoraId}"`,
        ` data-orbis-rotulo="${escaparAttr(rotulo)}"`,
        `>${textoNovo === null ? '' : escaparTexto(copia?.texto ?? '')}</template>`,
      ].join(''),
    );
    ligados += 1;
    registrar(estado, 'ligado', `o clique alterna ${ancoras.length} elemento(s) desta peça.`, {
      chave,
      gatilhoAncoraId,
      ancoras,
      copiaAncoraId,
      pistasDoGatilho: pistasDe(elGatilho),
    });
  }

  // As marcas entram de trás para frente, para um offset não deslocar o outro.
  let corpo = args.corpo;
  for (const marca of [...marcas].sort((a, b) => b.pos - a.pos)) {
    corpo = corpo.slice(0, marca.pos) + marca.texto + corpo.slice(marca.pos);
  }
  return { corpo, templates: templates.join('\n'), derivados };
};

/** As famílias que o navegador alterna sem ajuda nenhuma. */
const ehNativo = (
  ancora: Elemento,
  mudancas: readonly { indice: number; set: Record<string, string | null> }[],
): boolean => {
  const chaves = new Set(mudancas.flatMap((m) => Object.keys(m.set)));
  if (chaves.size !== 1) return false;
  const so = [...chaves][0];
  if ((ancora.nome === 'details' || ancora.nome === 'dialog') && so === 'open') return true;
  if (ancora.nome === 'summary' && so === 'open') return true;
  if (ancora.nome === 'input' && so === 'checked') return true;
  if (ancora.nome === 'option' && so === 'selected') return true;
  return false;
};

// ───────────────────────────── Poda da fase 2 ───────────────────────────────

const escaparRegex = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * O script da origem viaja para o fim do body (contrato de `scriptsLocais`,
 * escrito depois do defeito dos "dois listeners no botão do menu mobile"). Se
 * ele já liga aquele clique, o fio da fatia é o SEGUNDO listener e o resultado
 * é abrir e fechar na mesma ação. Some o gatilho, some o template.
 */
export const podarEstadosJaVivos = (args: {
  html: string;
  derivados: readonly EstadoDerivado[];
  scriptsLocais: readonly string[];
}): { html: string; derivados: EstadoDerivado[]; podados: string[] } => {
  const juntos = args.scriptsLocais.join('\n');
  const temClique =
    /addEventListener\s*\(\s*['"]click['"]/.test(juntos) || /\bonclick\b/.test(juntos);
  const podados: string[] = [];
  let html = args.html;
  const derivados = args.derivados.map((d) => {
    if (d.veredito !== 'ligado' || d.chave === undefined) return d;
    if (!temClique) return d;
    const casou = (d.pistasDoGatilho ?? []).find((p) =>
      new RegExp(`['".\\[#\\s]${escaparRegex(p)}['"\\]\\s.,:)]`).test(juntos),
    );
    if (casou === undefined) return d;
    podados.push(d.estadoId);
    html = html
      .replace(new RegExp(`\\sdata-orbis-gatilho="${escaparRegex(d.chave)}"`, 'g'), '')
      .replace(
        new RegExp(
          `<template data-orbis-estado="${escaparRegex(d.chave)}"[\\s\\S]*?</template>`,
          'g',
        ),
        '',
      );
    return {
      ...d,
      veredito: 'ja-tem-script' as const,
      motivo: `o script da origem já liga o clique deste gatilho (casou por "${casou}"): um segundo listener abriria e fecharia na mesma ação.`,
      chave: undefined,
    };
  });
  return { html, derivados, podados };
};

// ───────────────────────────── O que a página ganha ─────────────────────────

export const CSS_DO_ALTERNADOR = `/* Os estados capturados da origem, ligados por atributo.
   Nada de HTML novo entra na página: o alternador só troca atributos em
   elementos que já existem. Por isso esta folha é do tamanho que é. */
[data-orbis-gatilho]{cursor:pointer}
[data-orbis-gatilho]:focus-visible{outline:2px solid currentColor;outline-offset:2px}
`;

export const SCRIPT_DO_ALTERNADOR = `<script>(function(){
  var tpls=document.querySelectorAll('template[data-orbis-estado]');
  if(!tpls.length){return;}
  Array.prototype.forEach.call(tpls,function(tpl){
    var chave=tpl.getAttribute('data-orbis-estado');
    var gatilho=document.querySelector('[data-orbis-gatilho="'+chave+'"]');
    if(!gatilho){return;}
    var attrs=[];
    try{attrs=JSON.parse(tpl.getAttribute('data-orbis-attrs')||'[]');}catch(e){return;}
    var copia=tpl.getAttribute('data-orbis-copia');
    var texto=tpl.content?tpl.content.textContent:tpl.textContent;
    var ligado=false,guardado=null;
    gatilho.setAttribute('aria-expanded','false');
    gatilho.addEventListener('click',function(ev){
      if(gatilho.tagName==='A'){ev.preventDefault();}
      var alvos=[];
      for(var i=0;i<attrs.length;i++){
        var el=document.querySelector('[data-orbis-ancora="'+attrs[i].a+'"]');
        if(el){alvos.push({el:el,set:attrs[i].set});}
      }
      var elCopia=copia?document.querySelector('[data-orbis-ancora="'+copia+'"]'):null;
      if(!ligado){
        guardado={attrs:[],texto:elCopia?elCopia.textContent:null};
        for(var j=0;j<alvos.length;j++){
          var antes={};
          for(var k in alvos[j].set){antes[k]=alvos[j].el.getAttribute(k);}
          guardado.attrs.push(antes);
          for(var k2 in alvos[j].set){
            var v=alvos[j].set[k2];
            if(v===null){alvos[j].el.removeAttribute(k2);}else{alvos[j].el.setAttribute(k2,v);}
          }
        }
        if(elCopia&&texto){elCopia.textContent=texto;}
        ligado=true;
      }else{
        for(var m=0;m<alvos.length;m++){
          var g=guardado&&guardado.attrs[m]?guardado.attrs[m]:{};
          for(var k3 in g){if(g[k3]===null){alvos[m].el.removeAttribute(k3);}else{alvos[m].el.setAttribute(k3,g[k3]);}}
        }
        if(elCopia&&guardado&&guardado.texto!==null){elCopia.textContent=guardado.texto;}
        ligado=false;
      }
      gatilho.setAttribute('aria-expanded',ligado?'true':'false');
    });
  });
})();</script>`;

/** O rótulo de tela de cada veredito. Sem travessão: há teste de voz. */
const FRASE: Record<VereditoDeEstado, string> = {
  ligado: 'ligado',
  'sem-delta': 'sem diferença que valha',
  ambiguo: 'ambíguo',
  'nao-achado': 'elemento não achado',
  'estrutura-diferente': 'estrutura diferente',
  'ja-nativo': 'o navegador já faz',
  'ja-tem-script': 'o script da origem já faz',
  'sem-gatilho': 'sem gatilho seguro',
  'precisa-texto': 'falta o texto novo',
  'texto-da-origem': 'o texto trazia a empresa de origem',
  'asset-remoto': 'endereço de outra empresa',
  portal: 'estado de portal',
  excedeu: 'acima do teto',
};

/**
 * Os avisos que valem voz. `sem-delta` e `ja-nativo` são a rotina deste acervo
 * (83 e 4 dos 100 estados medidos) e ficam só no JSON: repeti-los na tela
 * afogaria o que importa.
 */
export const avisosDosEstados = (derivados: readonly EstadoDerivado[]): string[] => {
  const avisos: string[] = [];
  const ligados = derivados.filter((d) => d.veredito === 'ligado');
  if (ligados.length > 0) {
    avisos.push(
      `${ligados.length} estado(s) capturado(s) da origem viraram interação no site: o clique troca atributos em elementos que já existem, sem HTML novo.`,
    );
  }
  for (const d of derivados) {
    if (d.veredito === 'ligado' || d.veredito === 'sem-delta' || d.veredito === 'ja-nativo')
      continue;
    avisos.push(
      `o estado "${d.rotuloDaCaptura}" (${d.estadoId}) ficou de fora [${FRASE[d.veredito]}]: ${d.motivo}`,
    );
  }
  return avisos;
};
