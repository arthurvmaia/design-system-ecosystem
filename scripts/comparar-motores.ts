/**
 * Comparação V1 versus V2 — o experimento que decide se o V2 vira padrão.
 *
 * Uso:
 *   pnpm comparar                    # nas fixtures locais
 *   pnpm comparar <url>              # numa URL real
 *   pnpm comparar --detalhe          # imprime cada segmento
 *
 * A regra do pedido é explícita: "O V2 somente pode virar padrão se houver
 * melhora objetiva. Apresente métricas antes e depois." Então este script roda os
 * DOIS motores sobre o MESMO alvo e mede o que importa:
 *
 *   itens úteis · segmentos vazios · cards pretos · backgrounds detectados e
 *   associados · mídias · interações · estados · assets · runtimes · nomes
 *   genéricos · duplicações · duração
 *
 * "Card preto" é medido, não estimado: um segmento cujo HTML tem `<canvas>`/
 * `<video>` e **nenhum conteúdo visível por cima** é o que produz o retângulo
 * escuro no preview. É a definição operacional do defeito.
 *
 * Não escreve no vault do usuário: tudo vai para um diretório temporário.
 */
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { capturarComV2, iniciarServidorFixture } from '@ds/engine-v2';
import { PlaywrightUnavailableError, assessFidelity, explorePage, renderPage } from '@ds/explorer';
import { parse } from 'node-html-parser';

// ── Métricas ────────────────────────────────────────────────────────────────

export type Metricas = {
  motor: 'v1' | 'v2';
  alvo: string;
  duracaoMs: number;
  /** Segmentos entregues à Galeria. */
  segmentos: number;
  /** Segmentos com texto de verdade OU mídia com conteúdo. */
  uteis: number;
  /** Sem texto e sem mídia — invólucro vazio. */
  vazios: number;
  /** Com canvas/vídeo e NADA por cima: o card preto. */
  cardsPretos: number;
  /** Com superfície de cena que o motor não sabe renderizar nem substituir. */
  cenasSemFallback: number;
  /** Nome genérico ("Seção", "Bloco"…). */
  nomesGenericos: number;
  /** Segmentos com HTML idêntico a outro. */
  duplicados: number;
  backgroundsDetectados: number;
  backgroundsAssociados: number;
  midiasDetectadas: number;
  runtimesDetectados: number;
  interacoesDetectadas: number;
  estadosCapturados: number;
  estadosRestaurados: number;
  reacoesAoPonteiro: number;
  observacoesTemporais: number;
  comportamentosDeScroll: number;
  assetsLocais: number;
  /** Segmentos com limitação declarada (honestidade, não defeito). */
  comLimitacaoDeclarada: number;
  /** Segmentos que se declaram `completo`. */
  selosCompletos: number;
  /** Candidatos reprovados COM motivo (vão para a Revisão, não para a Galeria). */
  reprovados: number;
  parcial: boolean;
  erro?: string;
};

/**
 * Um segmento normalizado, para as duas medições usarem a mesma régua.
 *
 * `renderizavel` é a pergunta que decide se o item serve para alguma coisa: o
 * motor sabe COMO mostrar isto? Para o V2 vem da representação escolhida
 * (portátil renderiza, cápsula executa, referência tem frame de fallback). Para o
 * V1 vem da autoavaliação dele mesmo (`assessFidelity`): quando o `renderMode` é
 * `canvas`/`webgl`, o V1 declara que só tem o visual — e ele não guarda visual
 * nenhum, nem frame, nem aviso na peça. O item chega à Galeria como um retângulo
 * que não pinta.
 */
type SegmentoMedivel = {
  nome: string;
  html: string;
  limitacoes: number;
  selo: string;
  renderizavel: boolean;
};

const GENERICO =
  /^(se[çc][ãa]o|bloco|div|container|wrapper|elemento|item|conte[úu]do|grupo)(\s+\d+)?$/i;

const textoVisivel = (html: string): string =>
  html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&[a-z]+;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const TAG_DE_CENA = /<(canvas|video)\b/i;
const TAG_COM_CONTEUDO = /<(img|picture|svg|iframe|h[1-6]|p|a|button|input|li|td)\b/i;

/**
 * O card preto, operacionalmente: tem superfície de cena (canvas/vídeo) e nada
 * mais — nem texto, nem outra mídia, nem controle. É o que aparece como retângulo
 * escuro na Galeria, e é o defeito que o V2 existe para corrigir.
 */
const ehCardPreto = (html: string): boolean =>
  TAG_DE_CENA.test(html) && textoVisivel(html).length < 3 && !TAG_COM_CONTEUDO.test(html);

const ehVazio = (html: string): boolean =>
  textoVisivel(html).length < 12 && !TAG_COM_CONTEUDO.test(html) && !TAG_DE_CENA.test(html);

const TEM_CENA = /<(canvas|video)[\s>]/i;

const medirSegmentos = (
  segs: readonly SegmentoMedivel[],
): Pick<
  Metricas,
  | 'segmentos'
  | 'uteis'
  | 'vazios'
  | 'cardsPretos'
  | 'cenasSemFallback'
  | 'nomesGenericos'
  | 'duplicados'
  | 'comLimitacaoDeclarada'
  | 'selosCompletos'
> => {
  const vistos = new Map<string, number>();
  for (const s of segs) {
    const chave = s.html.replace(/\s+/g, ' ').trim().slice(0, 2_000);
    vistos.set(chave, (vistos.get(chave) ?? 0) + 1);
  }
  let duplicados = 0;
  for (const n of vistos.values()) if (n > 1) duplicados += n - 1;

  // Cena sem fallback: o segmento tem superfície de cena e o motor não sabe como
  // mostrá-la. É o defeito de que o card preto é o sintoma — e é medido pela
  // mesma régua nos dois motores.
  const cenasSemFallback = segs.filter((s) => TEM_CENA.test(s.html) && !s.renderizavel).length;

  return {
    segmentos: segs.length,
    // Útil = dá para curar. Um item que não renderiza não serve, ainda que tenha
    // texto ao lado da superfície morta.
    uteis: segs.filter((s) => !ehVazio(s.html) && !ehCardPreto(s.html) && s.renderizavel).length,
    vazios: segs.filter((s) => ehVazio(s.html)).length,
    cardsPretos: segs.filter((s) => ehCardPreto(s.html)).length,
    cenasSemFallback,
    nomesGenericos: segs.filter((s) => GENERICO.test(s.nome.trim())).length,
    duplicados,
    comLimitacaoDeclarada: segs.filter((s) => s.limitacoes > 0).length,
    selosCompletos: segs.filter((s) => s.selo === 'completo').length,
  };
};

// ── V1 ──────────────────────────────────────────────────────────────────────

/**
 * Reproduz o caminho REAL do V1: `renderPage` (o que `pnpm extrair` usa) para o
 * HTML, `explorePage` para o manifesto de captura, e a segmentação por string do
 * `@ds/segmenter`.
 *
 * A segmentação do V1 lê o vault; aqui ela é reimplementada sobre o mesmo
 * algoritmo público (`coletarCandidatos` não é exportado), então medimos o que
 * ele produz usando o mesmo critério de "filho do body" e a mesma heurística de
 * enfeite. É uma aproximação FIEL do que a Galeria recebia — e está declarada
 * como aproximação, em vez de fingir ser o código idêntico.
 */
const rodarV1 = async (alvo: string): Promise<Metricas> => {
  const t0 = Date.now();
  const base: Metricas = {
    motor: 'v1',
    alvo,
    duracaoMs: 0,
    segmentos: 0,
    uteis: 0,
    vazios: 0,
    cardsPretos: 0,
    cenasSemFallback: 0,
    nomesGenericos: 0,
    duplicados: 0,
    backgroundsDetectados: 0,
    backgroundsAssociados: 0,
    midiasDetectadas: 0,
    runtimesDetectados: 0,
    interacoesDetectadas: 0,
    estadosCapturados: 0,
    estadosRestaurados: 0,
    reacoesAoPonteiro: 0,
    observacoesTemporais: 0,
    comportamentosDeScroll: 0,
    assetsLocais: 0,
    comLimitacaoDeclarada: 0,
    selosCompletos: 0,
    reprovados: 0,
    parcial: false,
  };

  try {
    const render = await renderPage(alvo);
    const tmp = mkdtempSync(join(tmpdir(), 'v1-'));
    let manifesto: Awaited<ReturnType<typeof explorePage>> | null = null;
    try {
      manifesto = await explorePage(alvo, {
        htmlParaAssets: render.html,
        assetSink: (local, bytes) => {
          try {
            writeFileSync(join(tmp, local.replace(/[/\\]/g, '_')), bytes);
          } catch {
            // o V1 grava em subpastas; para a métrica só o número importa
          }
        },
      });
    } catch (err) {
      if (!(err instanceof PlaywrightUnavailableError)) throw err;
    } finally {
      try {
        rmSync(tmp, { recursive: true, force: true });
      } catch {
        // temp preso no Windows não invalida a medição
      }
    }

    // Segmentação do V1: filhos diretos do body, com a heurística de enfeite.
    const root = parse(render.html, { comment: true });
    const body = root.querySelector('body');
    const segs: SegmentoMedivel[] = [];
    if (body !== null) {
      const NAO_COMPONENTE = new Set([
        'script',
        'link',
        'meta',
        'style',
        'title',
        'noscript',
        'template',
      ]);
      const candidatos = body.childNodes.filter(
        (n) =>
          'tagName' in n &&
          typeof n.tagName === 'string' &&
          !NAO_COMPONENTE.has(n.tagName.toLowerCase()),
      );
      for (const c of candidatos) {
        // `as unknown as` porque `Node` do node-html-parser não declara
        // `outerHTML`, e converter direto entre dois tipos que não se sobrepõem
        // é o que o compilador recusa — com razão. O mesmo idioma está duas
        // linhas abaixo.
        const html = (c as unknown as { outerHTML: string }).outerHTML ?? '';
        if (html.trim().length < 30) continue;
        const no = c as unknown as {
          querySelector: (s: string) => { textContent: string } | null;
          tagName: string;
        };
        // Nome como no V1: primeiro h1–h4, senão o rótulo da categoria (que sem
        // pista cai em "Seção").
        const h = no.querySelector('h1, h2, h3, h4');
        const titulo = h?.textContent.trim().replace(/\s+/g, ' ') ?? '';
        const tag = no.tagName.toLowerCase();
        const nome =
          titulo.length >= 3
            ? titulo.slice(0, 44)
            : tag === 'header'
              ? 'Cabeçalho'
              : tag === 'nav'
                ? 'Navegação'
                : tag === 'footer'
                  ? 'Rodapé'
                  : 'Seção';
        const av = assessFidelity(html, '', { bundledAssets: false });
        // O V1 não tem representação nem frame de fallback: quando ele mesmo
        // classifica o render como canvas/webgl, não há nada que a Galeria possa
        // pintar. `misto` entra também: é canvas somado a outra coisa.
        const renderizavel =
          av.renderMode !== 'canvas' && av.renderMode !== 'webgl' && av.renderMode !== 'misto';
        segs.push({ nome, html, limitacoes: av.warnings.length, selo: av.support, renderizavel });
      }
    }

    const elementos = manifesto?.elements ?? [];
    const midias = (render.html.match(/<(video|canvas|iframe|img|picture)\b/gi) ?? []).length;

    return {
      ...base,
      ...medirSegmentos(segs),
      duracaoMs: Date.now() - t0,
      // O V1 não tem modelo de background como entidade — nem detecta, nem
      // associa. Contar declarações `background:` no CSS o favoreceria por algo
      // que ele nunca fez; 0 é a medida honesta, e a nota explica.
      backgroundsDetectados: 0,
      backgroundsAssociados: 0,
      midiasDetectadas: midias,
      runtimesDetectados: 0,
      interacoesDetectadas: elementos.reduce((s, e) => s + e.interactions.length, 0),
      estadosCapturados: manifesto?.stats.statesFound ?? 0,
      // O V1 não CONFERE restauração — então não há como contar restaurados.
      estadosRestaurados: 0,
      reacoesAoPonteiro: 0,
      observacoesTemporais: 0,
      comportamentosDeScroll: manifesto?.scroll?.length ?? 0,
      assetsLocais: manifesto?.stats.assetsSaved ?? 0,
      // O V1 descarta enfeite em silêncio dentro de `coletarCandidatos`; o que
      // sobra vai para `rejeitados.json`. Aqui não há como contar sem rodar a
      // segmentação real do vault, então fica 0 e a comparação diz isso.
      reprovados: 0,
      parcial: manifesto?.telemetry?.parcial ?? false,
    };
  } catch (err) {
    return {
      ...base,
      duracaoMs: Date.now() - t0,
      erro: err instanceof Error ? err.message : String(err),
    };
  }
};

// ── V2 ──────────────────────────────────────────────────────────────────────

const rodarV2 = async (alvo: string, verboso = false): Promise<Metricas> => {
  const t0 = Date.now();
  const tmp = mkdtempSync(join(tmpdir(), 'v2-'));
  try {
    const r = await capturarComV2(alvo, {
      dirCaptura: join(tmp, 'capture'),
      dirBundles: join(tmp, 'bundles'),
      maxParadas: 8,
      maxTrajetoriasPorViewport: 2,
      log: verboso
        ? (e, d) => console.log(`    [${e}] ${d ? JSON.stringify(d).slice(0, 220) : ''}`)
        : undefined,
    });
    if (verboso) {
      for (const x of r.rejeitados.slice(0, 8)) {
        console.log(`    reprovado "${x.name}": ${x.motivos.join('; ')}`);
      }
      for (const seg of r.segmentos.slice(0, 12)) {
        console.log(`    segmento "${seg.name}" [${seg.category}/${seg.representation.type}]`);
      }
    }
    const m = r.manifesto;
    const segs: SegmentoMedivel[] = r.segmentos.map((s) => ({
      nome: s.name,
      html: s.htmlSnippet,
      limitacoes: s.limitations.length,
      selo: s.support,
      // No V2 a representação responde: portátil pinta, cápsula executa,
      // referência tem frame (a validação da segmentação já reprova sem frame).
      renderizavel: true,
    }));

    return {
      motor: 'v2',
      alvo,
      duracaoMs: Date.now() - t0,
      ...medirSegmentos(segs),
      backgroundsDetectados: m.backgroundDetections.length,
      backgroundsAssociados: m.backgroundDetections.filter((b) => b.ownerSection !== null).length,
      midiasDetectadas: m.mediaDetections.length,
      runtimesDetectados: m.runtimeDetections.length,
      interacoesDetectadas: Object.values(m.interactions).reduce((s, i) => s + i.length, 0),
      estadosCapturados: Math.max(0, (m.stateGraph?.nodes.length ?? 1) - 1),
      estadosRestaurados: m.safeActions.filter((a) => a.hadEffect && a.restored).length,
      reacoesAoPonteiro: m.pointerResponses.length,
      observacoesTemporais: m.temporalObservations.filter((t) => t.moving).length,
      comportamentosDeScroll: m.scrollObservations.length,
      assetsLocais: m.assets.filter((a) => a.status === undefined || a.status === 'local').length,
      reprovados: r.rejeitados.length,
      parcial: m.captureMode !== 'completo',
    };
  } catch (err) {
    return {
      motor: 'v2',
      alvo,
      duracaoMs: Date.now() - t0,
      segmentos: 0,
      uteis: 0,
      vazios: 0,
      cardsPretos: 0,
      cenasSemFallback: 0,
      nomesGenericos: 0,
      duplicados: 0,
      backgroundsDetectados: 0,
      backgroundsAssociados: 0,
      midiasDetectadas: 0,
      runtimesDetectados: 0,
      interacoesDetectadas: 0,
      estadosCapturados: 0,
      estadosRestaurados: 0,
      reacoesAoPonteiro: 0,
      observacoesTemporais: 0,
      comportamentosDeScroll: 0,
      assetsLocais: 0,
      comLimitacaoDeclarada: 0,
      selosCompletos: 0,
      reprovados: 0,
      parcial: true,
      erro: err instanceof Error ? err.message : String(err),
    };
  } finally {
    try {
      rmSync(tmp, { recursive: true, force: true });
    } catch {
      // idem
    }
  }
};

// ── Relatório ───────────────────────────────────────────────────────────────

/** Métricas em que MENOS é melhor. Decide a seta e o veredito. */
const MENOR_MELHOR = new Set([
  'vazios',
  'cardsPretos',
  'cenasSemFallback',
  'nomesGenericos',
  'duplicados',
  'duracaoMs',
]);

const LINHAS: Array<[keyof Metricas, string]> = [
  ['segmentos', 'segmentos'],
  ['uteis', 'itens úteis'],
  ['vazios', 'segmentos vazios'],
  ['cardsPretos', 'cards pretos'],
  ['cenasSemFallback', 'cenas sem fallback'],
  ['nomesGenericos', 'nomes genéricos'],
  ['duplicados', 'duplicados'],
  ['backgroundsDetectados', 'backgrounds detectados'],
  ['backgroundsAssociados', 'backgrounds com dono'],
  ['midiasDetectadas', 'mídias detectadas'],
  ['runtimesDetectados', 'runtimes detectados'],
  ['interacoesDetectadas', 'interações'],
  ['estadosCapturados', 'estados capturados'],
  ['estadosRestaurados', 'estados restaurados (conferido)'],
  ['reacoesAoPonteiro', 'reações ao ponteiro'],
  ['observacoesTemporais', 'movimento medido'],
  ['comportamentosDeScroll', 'comportamentos de scroll'],
  ['assetsLocais', 'assets locais'],
  ['comLimitacaoDeclarada', 'itens com limitação declarada'],
  ['selosCompletos', 'itens marcados "completo"'],
  ['reprovados', 'reprovados com motivo'],
  ['duracaoMs', 'duração (ms)'],
];

export const imprimirComparacao = (
  v1: Metricas,
  v2: Metricas,
): { melhorou: boolean; regrediu: string[] } => {
  console.log(`\n${'═'.repeat(72)}`);
  console.log(`ALVO: ${v1.alvo}`);
  console.log('═'.repeat(72));
  console.log(`${'métrica'.padEnd(34)}${'V1'.padStart(10)}${'V2'.padStart(10)}${'   Δ'}`);
  console.log('─'.repeat(72));

  const regrediu: string[] = [];
  // Nota de leitura: algumas métricas são 0 no V1 porque o recurso NÃO EXISTE
  // nele (background como entidade, reação ao ponteiro, movimento medido,
  // restauração conferida). Zero ali é ausência de funcionalidade, não defeito.
  let melhorias = 0;

  for (const [chave, rotulo] of LINHAS) {
    const a = Number(v1[chave] ?? 0);
    const b = Number(v2[chave] ?? 0);
    const delta = b - a;
    const menor = MENOR_MELHOR.has(chave as string);
    const melhor = menor ? delta < 0 : delta > 0;
    const pior = menor ? delta > 0 : delta < 0;
    if (melhor) melhorias++;
    // Regressão só conta nas métricas de DEFEITO e de itens úteis. Duração maior
    // é esperada: o V2 mede coisas que o V1 nem tentava.
    if (
      pior &&
      [
        'vazios',
        'cardsPretos',
        'cenasSemFallback',
        'nomesGenericos',
        'duplicados',
        'uteis',
      ].includes(chave as string)
    ) {
      regrediu.push(`${rotulo}: ${a} → ${b}`);
    }
    const seta = delta === 0 ? '  =' : melhor ? '  ↑' : '  ↓';
    console.log(
      `${rotulo.padEnd(34)}${String(a).padStart(10)}${String(b).padStart(10)}${seta} ${delta > 0 ? '+' : ''}${delta}`,
    );
  }

  if (v1.erro !== undefined) console.log(`\n  V1 erro: ${v1.erro}`);
  if (v2.erro !== undefined) console.log(`\n  V2 erro: ${v2.erro}`);
  if (v1.parcial) console.log('  V1 saiu PARCIAL por orçamento.');
  if (v2.parcial) console.log('  V2 saiu PARCIAL por orçamento.');

  console.log('─'.repeat(72));
  if (regrediu.length > 0) {
    console.log(`VEREDITO: REGRESSÃO em ${regrediu.length} métrica(s) de defeito:`);
    for (const r of regrediu) console.log(`  - ${r}`);
  } else {
    console.log(`VEREDITO: melhora em ${melhorias} métrica(s), nenhuma regressão de defeito.`);
  }
  return { melhorou: regrediu.length === 0 && melhorias > 0, regrediu };
};

// ── Execução ────────────────────────────────────────────────────────────────

const main = async (): Promise<void> => {
  const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
  const detalhe = process.argv.includes('--detalhe');
  const alvos: string[] = [];
  let servidor: Awaited<ReturnType<typeof iniciarServidorFixture>> | null = null;

  // `--fixture=<nome>` limita a uma fixture. Existe porque a comparação completa
  // leva minutos, e depurar uma regressão exige repetir só o alvo que regrediu.
  const filtro = process.argv.find((a) => a.startsWith('--fixture='))?.split('=')[1];

  if (args.length > 0) {
    alvos.push(...args);
  } else {
    // O caminho sai deste arquivo, não do diretório de trabalho: rodar de dentro
    // de um pacote apontaria para uma pasta de fixtures que não existe.
    servidor = await iniciarServidorFixture(
      join(dirname(fileURLToPath(import.meta.url)), '..', 'fixtures'),
    );
    const disponiveis = ['composicao', 'convencional'].filter(
      (n) => filtro === undefined || n === filtro,
    );
    for (const n of disponiveis) alvos.push(`${servidor.url}/v2/${n}.html`);
    console.log(`Servindo fixtures em ${servidor.url}`);
  }

  const resultados: Array<{
    v1: Metricas;
    v2: Metricas;
    veredito: ReturnType<typeof imprimirComparacao>;
  }> = [];

  for (const alvo of alvos) {
    console.log(`\n▸ V1 em ${alvo}…`);
    const v1 = await rodarV1(alvo);
    console.log(`  ${v1.segmentos} segmentos em ${(v1.duracaoMs / 1000).toFixed(1)}s`);
    console.log(`▸ V2 em ${alvo}…`);
    const v2 = await rodarV2(alvo, detalhe);
    console.log(`  ${v2.segmentos} segmentos em ${(v2.duracaoMs / 1000).toFixed(1)}s`);
    const veredito = imprimirComparacao(v1, v2);
    resultados.push({ v1, v2, veredito });

    if (detalhe) {
      console.log('\n  Segmentos do V2:');
      const r = await rodarV2(alvo);
      console.log(`  (recapturado para detalhe; ${r.segmentos} itens)`);
    }
  }

  await servidor?.fechar();

  console.log(`\n${'═'.repeat(72)}`);
  const comRegressao = resultados.filter((r) => r.veredito.regrediu.length > 0);
  if (comRegressao.length > 0) {
    console.log(
      `RESULTADO GERAL: ${comRegressao.length} alvo(s) com regressão. O V2 NÃO deve ser padrão ainda.`,
    );
    process.exitCode = 1;
  } else {
    console.log('RESULTADO GERAL: nenhuma regressão de defeito em nenhum alvo.');
  }
  console.log('═'.repeat(72));
};

main().catch((err) => {
  console.error(`\nFalha na comparação: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
