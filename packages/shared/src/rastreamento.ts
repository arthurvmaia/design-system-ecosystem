import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * O rastreamento de terceiro que veio dentro de uma captura.
 *
 * ## Por que isto mudou de casa
 *
 * A régua nasceu dentro de `@ds/generator/pagina.ts`, privada, e rodava na
 * MONTAGEM DA PÁGINA — quando a peça já tinha entrado no kit e o site já era do
 * cliente. Nessa hora a única saída é a regra S2 reprovar e alguém decidir, site
 * a site, o que fazer com um script que mistura analytics com comportamento.
 *
 * Para um KIT, a decisão certa é ANTERIOR: um kit é reuso, e a peça vai voltar
 * em todo site que usar aquele kit. Por isso a régua vive aqui, em `@ds/shared`,
 * onde a curadoria (que roda com o bundle EM DISCO) também a alcança.
 *
 * Uma definição só, de propósito. Duas cópias divergiriam na primeira regex
 * nova, e aí a curadoria aprovaria exatamente o que a montagem reprova.
 *
 * ## Medido no acervo
 *
 * Sobre os 290 bundles da Biblioteca: **6 misturados, 47 puros, 237 sem
 * rastreio**. As 6 misturadas são todas do MESMO site de origem, e 3 delas
 * estão no único kit que reprovava no banco de prova — em S2, exatamente por
 * isto. Recusá-las na curadoria custa 2,1% do acervo, concentrado num site só.
 */

/**
 * Marcas de RASTREAMENTO de terceiro dentro de um script.
 *
 * Não são todas as que existem — são as que aparecem em site real com folga
 * suficiente para valer a busca. O que não estiver aqui passa, e é por isso que
 * a conferência de rede na validação continua sendo obrigatória.
 */
export const MARCAS_DE_RASTREIO: readonly RegExp[] = [
  /\bgtag\s*\(/,
  /\bdataLayer\s*\.\s*push\b/,
  /\bGoogleAnalyticsObject\b/,
  /\bfbq\s*\(/,
  /\bttq\s*\.\s*(load|page|track)\b/,
  /\b_hjSettings\b/,
  /\bclarity\s*\(/,
  /\bsnaptr\s*\(/,
  /\b_linkedin_partner_id\b/,
  /\bG-[A-Z0-9]{8,}\b/,
  /\bAW-\d{9,}\b/,
  /\bUA-\d{4,}-\d+\b/,
  /\bGTM-[A-Z0-9]{5,}\b/,
];

/** Endereços que existem para CARREGAR o rastreador — o script é o vendedor. */
export const CARREGADORES_DE_RASTREIO: readonly string[] = [
  'googletagmanager.com',
  'google-analytics.com',
  'googleadservices.com',
  'connect.facebook.net',
  'static.hotjar.com',
  'clarity.ms',
  'snap.licdn.com',
  'analytics.tiktok.com',
];

/**
 * O que um script é, do ponto de vista de quem vai ENTREGAR o site.
 *
 * - **`puro`**: o arquivo existe só para rastrear. Sai inteiro, e o site não
 *   perde nada — ninguém escolheu aquele desenho por causa do analytics.
 * - **`misturado`**: tem rastreamento E outra coisa junta. Tirar levaria
 *   comportamento real embora; manter manda o visitante do cliente para a conta
 *   de outra empresa.
 * - **`null`**: não é rastreamento.
 */
export type EstadoDeRastreamento = 'puro' | 'misturado' | null;

/**
 * A régua do `puro`: ou o script carrega o fornecedor pelo endereço dele (aí é o
 * vendedor, não código do site), ou é pequeno o bastante para ser só o snippet
 * de inicialização e não registra evento nenhum de interface
 * (`addEventListener`).
 */
export const RASTREIO_PEQUENO = 4096;

export const rastreamentoDeTerceiro = (js: string): EstadoDeRastreamento => {
  const temMarca = MARCAS_DE_RASTREIO.some((r) => r.test(js));
  const carregaFornecedor = CARREGADORES_DE_RASTREIO.some((d) => js.includes(d));
  if (!temMarca && !carregaFornecedor) return null;
  if (carregaFornecedor) return 'puro';
  if (js.length <= RASTREIO_PEQUENO && !/\baddEventListener\s*\(/.test(js)) return 'puro';
  return 'misturado';
};

export type RastreamentoDoBundle = {
  /** O PIOR estado achado: misturado vence puro, que vence a ausência. */
  estado: EstadoDeRastreamento;
  /** Que arquivos carregam o rastreio, para o motivo poder nomeá-los. */
  arquivos: string[];
};

const VAZIO: RastreamentoDoBundle = { estado: null, arquivos: [] };

/**
 * O cache é por MTIME do `index.html` do bundle (ou do diretório, quando ele não
 * existe): recompilar um bundle muda o arquivo e invalida sozinho. Sem ele a
 * curadoria releria centenas de KB de JS a cada rodada, para 1389 segmentos.
 */
const cache = new Map<string, { mtimeMs: number; valor: RastreamentoDoBundle }>();

const lerJs = (dir: string): { nome: string; js: string }[] => {
  const out: { nome: string; js: string }[] = [];
  for (const sub of ['js', 'other']) {
    const pasta = join(dir, 'assets', sub);
    if (!existsSync(pasta)) continue;
    let nomes: string[];
    try {
      nomes = readdirSync(pasta).filter((f) => f.endsWith('.js'));
    } catch {
      continue;
    }
    for (const nome of nomes.sort()) {
      try {
        out.push({ nome: `assets/${sub}/${nome}`, js: readFileSync(join(pasta, nome), 'utf8') });
      } catch {
        // Arquivo ilegível não acusa a peça: o mesmo contrato do resto do pipeline.
      }
    }
  }
  return out;
};

/** Os `<script>` INLINE do documento — é onde mora o snippet de inicialização. */
const scriptsInline = (html: string): string[] => {
  const out: string[] = [];
  for (const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
    if (/\bsrc\s*=/i.test(m[1] ?? '')) continue;
    const corpo = m[2] ?? '';
    if (corpo.trim() !== '') out.push(corpo);
  }
  return out;
};

/**
 * O rastreamento que um bundle EM DISCO carrega.
 *
 * Olha os três lugares em que ele pode estar: `assets/js/*.js`,
 * `assets/other/*.js` e os `<script>` inline do `index.html`. Um `<script src>`
 * remoto do fornecedor conta pelo endereço — é o próprio `index.html` que o
 * declara, e por isso ele entra na varredura inline como texto.
 */
export const rastreamentoDoBundle = (dir: string): RastreamentoDoBundle => {
  const indexPath = join(dir, 'index.html');
  const alvo = existsSync(indexPath) ? indexPath : dir;
  if (!existsSync(alvo)) return VAZIO;

  let mtimeMs: number;
  try {
    mtimeMs = statSync(alvo).mtimeMs;
  } catch {
    return VAZIO;
  }
  const emCache = cache.get(dir);
  if (emCache !== undefined && emCache.mtimeMs === mtimeMs) return emCache.valor;

  let html = '';
  try {
    html = existsSync(indexPath) ? readFileSync(indexPath, 'utf8') : '';
  } catch {
    html = '';
  }

  const pedacos: { nome: string; js: string }[] = [
    ...lerJs(dir),
    ...scriptsInline(html).map((js, i) => ({ nome: `index.html #${i + 1}`, js })),
  ];
  // O `<script src>` remoto não tem corpo: quem o denuncia é o endereço escrito
  // no próprio documento. Sem esta linha, um bundle que só carrega a `gtag.js`
  // do fornecedor sairia como "sem rastreio".
  const remotos = [...html.matchAll(/<script\b[^>]*\bsrc\s*=\s*"([^"]+)"/gi)]
    .map((m) => m[1] ?? '')
    .filter((src) => CARREGADORES_DE_RASTREIO.some((d) => src.includes(d)));
  for (const src of remotos) pedacos.push({ nome: src, js: src });

  const misturados: string[] = [];
  const puros: string[] = [];
  for (const p of pedacos) {
    const e = rastreamentoDeTerceiro(p.js);
    if (e === 'misturado') misturados.push(p.nome);
    else if (e === 'puro') puros.push(p.nome);
  }
  const valor: RastreamentoDoBundle =
    misturados.length > 0
      ? { estado: 'misturado', arquivos: misturados }
      : puros.length > 0
        ? { estado: 'puro', arquivos: puros }
        : VAZIO;
  cache.set(dir, { mtimeMs, valor });
  return valor;
};
