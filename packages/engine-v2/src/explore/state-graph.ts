import { createHash } from 'node:crypto';
import type {
  BlockReason,
  BlockedAction,
  Confidence,
  ExecutedAction,
  SafeActionKind,
  StateEdge,
  StateGraph,
  StateNode,
} from '@ds/shared';
import { type PaginaV2, moverPara } from '../browser/page.js';
import {
  BLUR_FN,
  CENTRO_DO_REF_FN,
  FOCAR_REF_FN,
  HTML_DO_REF_FN,
  PORTAL_HTML_FN,
  chamar,
} from '../instrumentation/index.js';
import type { RawAssinaturaEstado } from '../mapper/raw.js';
import { hashBytes } from '../observe/pixel.js';
import type { Candidato } from './candidates.js';

/**
 * Grafo de estados, com restauração CONFERIDA.
 *
 * O defeito que isto corrige é o mais silencioso do V1: depois de cada interação,
 * ele fazia `mouse.move(0,0)` + `Escape` e **seguia adiante sem verificar**
 * (browser.ts:494-502). Quando o modal não fechava, o estado seguinte era medido
 * numa página contaminada — e o "estado novo" que ele registrava era, em boa
 * parte, o modal anterior ainda aberto.
 *
 * Aqui toda ação passa pelo ciclo completo, e cada etapa tem consequência:
 *
 *   conferir a base → medir antes → agir → esperar → medir depois
 *   → houve efeito? → registrar → desfazer → **CONFERIR que voltou**
 *
 * Quando a restauração falha, o motor não finge: registra `restored: false`, e
 * pede o reestabelecimento à camada de cima (que pode recarregar a página). Se
 * não houver como reestabelecer, a base é ADOTADA como nova e isso fica escrito —
 * porque medir contra uma base errada é pior que admitir a contaminação.
 */

/** Assinatura estável de um estado da página, a partir do que a coleta mede. */
export const assinaturaDoEstado = (a: RawAssinaturaEstado): string => {
  const partes = [
    a.htmlHash,
    String(a.nodeCount),
    a.htmlClasses,
    a.bodyClasses,
    a.bodyStyle,
    a.overflow,
    String(a.expandidos),
    String(a.selecionados),
    String(a.detalhesAbertos),
    a.focado,
    // Overlays: só a forma (tag+caixa+classes), não o conteúdo.
    a.overlays
      .map((o) => `${o.tag}:${o.classes}:${Math.round(o.box.w)}x${Math.round(o.box.h)}`)
      .sort()
      .join(';'),
  ];
  return createHash('sha256').update(partes.join('|')).digest('hex').slice(0, 16);
};

/**
 * A mudança entre dois estados foi REAL?
 *
 * Nem toda diferença conta. `scrollY` mudando não é troca de estado (rolar não é
 * interagir), e uma variação mínima de `nodeCount` pode ser um contador ou um
 * anúncio. O que conta: overlay novo, `aria-expanded`/`aria-selected` mudando,
 * classe do `<html>`/`<body>` mudando, overflow travado (assinatura de modal
 * aberto), ou o HTML do corpo mudando de verdade.
 */
export const houveMudanca = (
  antes: RawAssinaturaEstado,
  depois: RawAssinaturaEstado,
): { mudou: boolean; motivos: string[] } => {
  const motivos: string[] = [];
  if (depois.overlays.length > antes.overlays.length) motivos.push('overlay apareceu');
  if (depois.overlays.length < antes.overlays.length) motivos.push('overlay fechou');
  if (depois.expandidos !== antes.expandidos) motivos.push('aria-expanded mudou');
  // `<details open>` é troca de estado sem ARIA e sem mudar o tamanho do HTML: o
  // conteúdo já estava no DOM, só escondido. Sem contar isto, o accordion NATIVO
  // — o mais comum em site institucional — passava como "sem efeito".
  if (depois.detalhesAbertos !== antes.detalhesAbertos) motivos.push('<details> abriu/fechou');
  if (depois.selecionados !== antes.selecionados) motivos.push('seleção mudou');
  if (depois.htmlClasses !== antes.htmlClasses) motivos.push('classe do <html> mudou');
  if (depois.bodyClasses !== antes.bodyClasses) motivos.push('classe do <body> mudou');
  if (depois.overflow !== antes.overflow) motivos.push('overflow do corpo mudou');
  if (depois.htmlHash !== antes.htmlHash) {
    // Diferença de tamanho relevante: conteúdo entrou ou saiu, não é um contador.
    const delta = Math.abs(depois.htmlBytes - antes.htmlBytes);
    const relativo = antes.htmlBytes === 0 ? 1 : delta / antes.htmlBytes;
    if (delta > 200 || relativo > 0.01) motivos.push('HTML do corpo mudou');
  }
  return { mudou: motivos.length > 0, motivos };
};

/**
 * Traduz o motivo da política para o enum do contrato.
 *
 * A política do V1 (`ehSeguroClicar`) devolve TEXTO LIVRE em português — "envia
 * formulário", "campo sensível (arquivo/senha/submit)". O manifesto exige um
 * `BlockReason` fechado. Um `as BlockReason` faria o texto passar pelo compilador
 * e reprovar no schema em runtime, que foi exatamente o que aconteceu: a captura
 * inteira ficava inválida por causa de um rótulo.
 *
 * O fallback é `alteracao-persistente` (o motivo mais genérico e mais grave) em
 * vez de silenciar: uma ação barrada por razão desconhecida continua barrada.
 */
export const motivoParaEnum = (motivo: string): BlockReason => {
  const m = motivo.toLowerCase();
  if (/submit|envia formul/.test(m)) return 'submit';
  if (/campo sens|senha|password/.test(m)) return 'campo-sensivel';
  if (/arquivo|file/.test(m)) return 'upload';
  if (/download|baixar/.test(m)) return 'download';
  if (/fora|dom[íi]nio|navega/.test(m)) return 'navegacao-externa';
  if (/protocolo/.test(m)) return 'protocolo-externo';
  if (/popup|nova aba/.test(m)) return 'popup';
  if (/clipboard|copiar/.test(m)) return 'clipboard';
  if (/permiss/.test(m)) return 'permissao';
  if (/geoloc|localiza/.test(m)) return 'geolocalizacao';
  if (/c[âa]mera/.test(m)) return 'camera';
  if (/microfone/.test(m)) return 'microfone';
  if (/instala/.test(m)) return 'instalacao';
  if (/aplicativo/.test(m)) return 'abrir-aplicativo';
  if (/mensagem/.test(m)) return 'envio-mensagem';
  if (/compra|pagar|checkout/.test(m)) return 'compra';
  if (/pagamento/.test(m)) return 'pagamento';
  if (/exclu|apagar|deletar/.test(m)) return 'exclusao';
  if (/confirma/.test(m)) return 'confirmacao-irreversivel';
  if (/login|entrar/.test(m)) return 'login';
  if (/cadastro|signup/.test(m)) return 'cadastro';
  if (/or[çc]amento|tempo/.test(m)) return 'orcamento';
  if (/irrevers|desabilitado|reprovado|revers[íi]ve/.test(m)) return 'alteracao-persistente';
  return 'alteracao-persistente';
};

/** Rótulo em PT-BR do estado, a partir da ação e do que mudou. */
const rotularEstado = (acao: SafeActionKind, motivos: readonly string[]): string => {
  const base: Partial<Record<SafeActionKind, string>> = {
    'abrir-menu': 'menu aberto',
    'fechar-menu': 'menu fechado',
    'abrir-submenu': 'submenu aberto',
    'expandir-accordion': 'accordion expandido',
    'recolher-accordion': 'accordion recolhido',
    'trocar-tab': 'aba trocada',
    'abrir-modal': 'modal aberto',
    'fechar-modal': 'modal fechado',
    'avancar-carousel': 'carrossel avançado',
    'voltar-carousel': 'carrossel voltado',
    'abrir-tooltip': 'tooltip visível',
    'alternar-tema': 'tema alternado',
    'pausar-animacao': 'animação pausada',
    'iniciar-animacao': 'animação iniciada',
    'focar-campo': 'campo focado',
    'revelar-conteudo': 'conteúdo revelado',
    'alternar-switch': 'switch alternado',
    hover: 'sob o ponteiro',
    teclado: 'após teclado',
  };
  const r = base[acao];
  if (r !== undefined) return r;
  return motivos[0] ?? 'estado alterado';
};

export type OpcoesGrafo = {
  candidatos: readonly Candidato[];
  /** Profundidade máxima a partir do estado inicial. */
  maxDepth?: number;
  maxStates?: number;
  maxActions?: number;
  /** Espera após a ação, para o efeito assentar (ms). */
  assentarMs?: number;
  /** Grava o HTML de um estado. Devolve o caminho relativo. */
  sinkHtml?: (nome: string, html: string) => string;
  /** Grava um frame do estado. Devolve o caminho relativo. */
  sinkFrame?: (nome: string, bytes: Uint8Array) => string;
  /**
   * Reestabelece o estado inicial de verdade (recarregar + reinstrumentar).
   * Ausente = sem recarga; a base contaminada é adotada e registrada.
   */
  reestabelecer?: () => Promise<boolean>;
  /** Teto de reestabelecimentos (recarga é caro). */
  maxReestabelecimentos?: number;
  signal?: AbortSignal;
};

export type ResultadoGrafo = {
  grafo: StateGraph;
  acoes: ExecutedAction[];
  bloqueadas: BlockedAction[];
  /** Houve contaminação não resolvida? A camada de cima registra como limitação. */
  contaminado: boolean;
  limitacoes: string[];
};

/** A página navegou e destruiu o contexto de execução no meio de uma ação? */
const ehContextoDestruido = (err: unknown): boolean =>
  err instanceof Error &&
  /Execution context was destroyed|because of a navigation|Cannot find context with specified id/i.test(
    err.message,
  );

/** Teclas seguras. `Enter` fica fora: em formulário, ele envia. */
const TECLAS_SEGURAS = ['ArrowRight', 'ArrowDown', 'Escape'] as const;

const NEUTRO = { x: 0.995, y: 0.005 };

/**
 * Executa uma ação. Devolve `false` quando não foi possível executá-la — o que é
 * diferente de "executou e não teve efeito", e as duas coisas precisam ser
 * distinguíveis no relatório.
 */
const executarAcao = async (
  page: PaginaV2,
  acao: SafeActionKind,
  ref: number,
): Promise<{ ok: boolean; motivo?: string }> => {
  if (acao === 'hover') {
    const centro = await page.evaluate<{ x: number; y: number } | null>(
      chamar(CENTRO_DO_REF_FN, ref),
    );
    if (centro === null) return { ok: false, motivo: 'elemento não visível' };
    await page.mouse.move(centro.x, centro.y, { steps: 3 });
    return { ok: true };
  }
  if (acao === 'focar-campo') {
    const ok = await page.evaluate<boolean>(chamar(FOCAR_REF_FN, ref));
    return ok ? { ok: true } : { ok: false, motivo: 'não focável' };
  }
  if (acao === 'teclado') {
    const ok = await page.evaluate<boolean>(chamar(FOCAR_REF_FN, ref));
    if (!ok) return { ok: false, motivo: 'não focável' };
    for (const t of TECLAS_SEGURAS) {
      if (t === 'Escape') continue; // Escape é restauração, não sondagem
      await page.keyboard.press(t);
    }
    return { ok: true };
  }

  // As demais implicam clique.
  const centro = await page.evaluate<{
    x: number;
    y: number;
    dentroDaViewport: boolean;
    alcancavel: boolean;
    pointerEvents: string;
  } | null>(chamar(CENTRO_DO_REF_FN, ref));
  if (centro === null) return { ok: false, motivo: 'elemento não visível' };
  if (!centro.dentroDaViewport) return { ok: false, motivo: 'fora da viewport após rolar' };
  if (centro.pointerEvents === 'none') return { ok: false, motivo: 'pointer-events: none' };
  if (!centro.alcancavel) {
    // Clicar aqui atingiria outro elemento. Melhor não clicar que clicar errado.
    return { ok: false, motivo: 'coberto por outro elemento' };
  }
  await page.mouse.click(centro.x, centro.y);
  return { ok: true };
};

/**
 * Tenta desfazer. A ordem é da menos invasiva para a mais: soltar o ponteiro,
 * soltar o foco, `Escape` (fecha overlay), clicar de novo no mesmo gatilho
 * (desfaz toggle), clicar num ponto neutro (fecha dropdown por clique fora).
 *
 * Cada passo é seguido de conferência pelo chamador — não se assume que
 * funcionou.
 */
const tentarDesfazer = async (
  page: PaginaV2,
  acao: SafeActionKind,
  ref: number,
  conferir: () => Promise<boolean>,
): Promise<{ restaurado: boolean; evidencias: string[] }> => {
  const evidencias: string[] = [];

  await moverPara(page, NEUTRO, { passos: 1 });
  evidencias.push('ponteiro solto');
  if (await conferir()) return { restaurado: true, evidencias };

  await page.evaluate(chamar(BLUR_FN));
  evidencias.push('foco solto');
  if (await conferir()) return { restaurado: true, evidencias };

  try {
    await page.keyboard.press('Escape');
    evidencias.push('Escape');
  } catch {
    // sem overlay para fechar
  }
  if (await conferir()) return { restaurado: true, evidencias };

  // Toggle: clicar de novo no mesmo gatilho costuma desfazer.
  if (acao !== 'hover' && acao !== 'focar-campo' && acao !== 'teclado') {
    const r = await executarAcao(page, acao, ref);
    if (r.ok) {
      evidencias.push('gatilho acionado de novo');
      if (await conferir()) return { restaurado: true, evidencias };
    }
  }

  // Clique fora: fecha dropdown/popover que só reage a isso.
  const vp = page.viewport();
  await page.mouse.click(Math.round(vp.width * 0.99), Math.round(vp.height * 0.99));
  evidencias.push('clique fora');
  if (await conferir()) return { restaurado: true, evidencias };

  return { restaurado: false, evidencias };
};

const confiancaDoEstado = (motivos: readonly string[]): Confidence => {
  const forte = motivos.some((m) =>
    /overlay apareceu|aria-expanded|seleção|overflow do corpo/.test(m),
  );
  if (forte) return 'alta';
  return motivos.length > 1 ? 'media' : 'baixa';
};

/**
 * Constrói o grafo.
 *
 * Em largura, não em profundidade: a largura encontra os estados de primeiro
 * nível (que é onde está quase todo o valor: menu, aba, accordion, modal) antes
 * de gastar orçamento descendo num submenu. E, ao descer, o caminho é **reencenado
 * a partir da raiz** — sem isso, "abrir submenu" seria executado numa página onde
 * o menu já não está aberto, e o resultado seria um estado inventado.
 */
export const construirGrafoDeEstados = async (
  page: PaginaV2,
  lerAssinatura: () => Promise<RawAssinaturaEstado>,
  opts: OpcoesGrafo,
): Promise<ResultadoGrafo> => {
  const maxDepth = opts.maxDepth ?? 2;
  const maxStates = opts.maxStates ?? 40;
  const maxActions = opts.maxActions ?? 120;
  const assentar = opts.assentarMs ?? 350;
  const maxReest = opts.maxReestabelecimentos ?? 2;

  const nodes: StateNode[] = [];
  const edges: StateEdge[] = [];
  const acoes: ExecutedAction[] = [];
  const bloqueadas: BlockedAction[] = [];
  const limitacoes: string[] = [];
  const porAssinatura = new Map<string, string>();

  let ciclos = 0;
  let dedup = 0;
  let truncado = false;
  let contaminado = false;
  let reestabelecimentos = 0;

  /**
   * Lido por função, não inline: `signal.aborted` é um getter que muda com o
   * tempo, e o TypeScript estreitaria o resultado do optional chaining entre
   * statements como se fosse constante, dando os `if` seguintes por mortos.
   */
  const abortado = (): boolean => opts.signal?.aborted === true;

  const raizBruta = await lerAssinatura();
  const raizSig = assinaturaDoEstado(raizBruta);
  const raiz: StateNode = {
    id: 'st_0',
    signature: raizSig,
    label: 'estado inicial',
    depth: 0,
    parent: null,
    scope: null,
    layersAdded: [],
    assets: [],
    confidence: 'alta',
  };
  nodes.push(raiz);
  porAssinatura.set(raizSig, raiz.id);

  // As ações barradas pela política, registradas antes de qualquer execução: o
  // log de segurança não depende de a exploração chegar até elas.
  for (const c of opts.candidatos) {
    for (const b of c.barradas) {
      bloqueadas.push({
        reason: motivoParaEnum(b.motivo),
        target: `${c.descriptor.tag}${c.descriptor.text ? ` "${c.descriptor.text.slice(0, 40)}"` : ''}`,
        detail: b.motivo,
      });
    }
  }

  /** Fila em largura: (estado de origem, caminho de ações para reencená-lo). */
  type Item = { estadoId: string; caminho: Array<{ ref: number; acao: SafeActionKind }> };
  const fila: Item[] = [{ estadoId: raiz.id, caminho: [] }];

  const conferirBase = async (esperada: string): Promise<boolean> => {
    const atual = assinaturaDoEstado(await lerAssinatura());
    return atual === esperada;
  };

  /** Reencena um caminho a partir da raiz. Devolve se chegou onde queria. */
  const reencenar = async (caminho: Item['caminho']): Promise<boolean> => {
    for (const passo of caminho) {
      const r = await executarAcao(page, passo.acao, passo.ref);
      if (!r.ok) return false;
      await page.esperar(assentar);
    }
    return true;
  };

  let acoesFeitas = 0;

  while (fila.length > 0) {
    if (abortado()) {
      truncado = true;
      break;
    }
    const item = fila.shift();
    if (item === undefined) break;
    const estadoAtual = nodes.find((n) => n.id === item.estadoId);
    if (estadoAtual === undefined) continue;
    if (estadoAtual.depth >= maxDepth) continue;

    for (const cand of opts.candidatos) {
      if (abortado()) {
        truncado = true;
        break;
      }
      if (acoesFeitas >= maxActions) {
        truncado = true;
        break;
      }
      if (nodes.length >= maxStates) {
        truncado = true;
        break;
      }
      // Só as ações que produzem estado. `hover` puro é reação, não estado — quem
      // registra hover é a varredura de ponteiro.
      const acoesUteis = cand.acoes.filter((a) => a !== 'hover');
      if (acoesUteis.length === 0) continue;

      for (const acao of acoesUteis) {
        if (acoesFeitas >= maxActions || nodes.length >= maxStates) {
          truncado = true;
          break;
        }
        if (abortado()) {
          truncado = true;
          break;
        }

        try {
          // ── Conferir a base ─────────────────────────────────────────────────
          // Sem isto, o estado seguinte é medido contra o anterior contaminado —
          // o defeito exato do V1.
          if (!(await conferirBase(estadoAtual.signature))) {
            let recuperou = false;
            if (opts.reestabelecer !== undefined && reestabelecimentos < maxReest) {
              reestabelecimentos++;
              recuperou = await opts.reestabelecer();
              if (recuperou && item.caminho.length > 0) {
                recuperou = await reencenar(item.caminho);
              }
            }
            if (!recuperou) {
              contaminado = true;
              limitacoes.push(
                `A exploração não pôde voltar ao estado "${estadoAtual.label}" antes de "${acao}": as ações seguintes foram medidas contra o estado encontrado, não contra o original.`,
              );
              // Adota a base atual, para não medir contra uma referência falsa.
              estadoAtual.signature = assinaturaDoEstado(await lerAssinatura());
            }
          }

          const ref = Number(cand.descriptor.ref);
          const antes = await lerAssinatura();
          const antesSig = assinaturaDoEstado(antes);

          const t0 = Date.now();
          const exec = await executarAcao(page, acao, ref);
          acoesFeitas++;
          if (!exec.ok) {
            acoes.push({
              id: `ac_${acoes.length + 1}`,
              kind: acao,
              target: cand.hash,
              fromState: estadoAtual.id,
              toState: estadoAtual.id,
              hadEffect: false,
              restored: true,
              restoreEvidence: [`ação não executada: ${exec.motivo ?? 'motivo desconhecido'}`],
              latencyMs: Date.now() - t0,
              assetsLoaded: [],
              requests: [],
            });
            continue;
          }
          await page.esperar(assentar);

          const depois = await lerAssinatura();
          const depoisSig = assinaturaDoEstado(depois);
          const mudanca = houveMudanca(antes, depois);
          const latencia = Date.now() - t0;

          let destinoId = estadoAtual.id;
          if (mudanca.mudou && depoisSig !== antesSig) {
            const existente = porAssinatura.get(depoisSig);
            if (existente !== undefined) {
              // Já conhecíamos este estado. Se é um ancestral, é ciclo.
              dedup++;
              destinoId = existente;
              // Voltar a um ANCESTRAL é ciclo (abrir→fechar→abrir); voltar a um
              // estado irmão é só dedup. A distinção importa para o relatório: um
              // ciclo alto significa que a exploração está girando.
              let anc: StateNode | undefined = estadoAtual;
              let guarda = 0;
              while (anc !== undefined && guarda < 20) {
                if (anc.id === existente) {
                  ciclos++;
                  break;
                }
                const paiId: string | null = anc.parent;
                anc = paiId === null ? undefined : nodes.find((n) => n.id === paiId);
                guarda++;
              }
            } else {
              const id = `st_${nodes.length}`;
              const label = rotularEstado(acao, mudanca.motivos);
              let htmlRef: string | undefined;
              let portalRef: string | undefined;
              let frameRef: string | undefined;
              if (opts.sinkHtml !== undefined) {
                try {
                  const html = await page.evaluate<string>(chamar(HTML_DO_REF_FN, ref));
                  if (html.length > 0) htmlRef = opts.sinkHtml(`${id}-escopo.html`, html);
                  const portal = await page.evaluate<string>(chamar(PORTAL_HTML_FN, ref));
                  if (portal.length > 0) portalRef = opts.sinkHtml(`${id}-portal.html`, portal);
                } catch {
                  // elemento saiu do DOM ao mudar de estado: o estado vale sem o HTML
                }
              }
              if (opts.sinkFrame !== undefined) {
                try {
                  const bytes = await page.screenshot();
                  frameRef = opts.sinkFrame(`${id}-${hashBytes(bytes).slice(0, 8)}.png`, bytes);
                } catch {
                  // sem frame: o estado continua registrado
                }
              }
              const node: StateNode = {
                id,
                signature: depoisSig,
                label,
                depth: estadoAtual.depth + 1,
                parent: estadoAtual.id,
                scope: cand.hash,
                htmlRef,
                portalHtmlRef: portalRef,
                frameRef,
                layersAdded: depois.overlays
                  .filter((o) => o.ref !== null)
                  .map((o) => String(o.ref))
                  .slice(0, 20),
                assets: [],
                confidence: confiancaDoEstado(mudanca.motivos),
              };
              nodes.push(node);
              porAssinatura.set(depoisSig, id);
              destinoId = id;
              if (node.depth < maxDepth) {
                fila.push({
                  estadoId: id,
                  caminho: [...item.caminho, { ref, acao }],
                });
              }
            }
          }

          // ── Desfazer e CONFERIR ────────────────────────────────────────────
          const desfeito = await tentarDesfazer(page, acao, ref, () => conferirBase(antesSig));
          if (!desfeito.restaurado) {
            let recuperou = false;
            if (opts.reestabelecer !== undefined && reestabelecimentos < maxReest) {
              reestabelecimentos++;
              recuperou = await opts.reestabelecer();
              if (recuperou) {
                desfeito.evidencias.push('página reestabelecida');
                if (item.caminho.length > 0) recuperou = await reencenar(item.caminho);
              }
            }
            if (!recuperou) {
              contaminado = true;
              limitacoes.push(
                `A ação "${acao}" não pôde ser desfeita (${desfeito.evidencias.join(' → ')}). O estado seguinte pode ter sido medido contaminado.`,
              );
            } else {
              desfeito.restaurado = true;
            }
          }

          const idAcao = `ac_${acoes.length + 1}`;
          acoes.push({
            id: idAcao,
            kind: acao,
            target: cand.hash,
            fromState: estadoAtual.id,
            toState: destinoId,
            hadEffect: mudanca.mudou,
            restored: desfeito.restaurado,
            restoreEvidence: desfeito.evidencias,
            latencyMs: latencia,
            assetsLoaded: [],
            requests: [],
          });

          if (destinoId !== estadoAtual.id) {
            edges.push({
              from: estadoAtual.id,
              to: destinoId,
              actionId: idAcao,
              kind: acao,
              // Reversível só quando desfazer FOI conferido. É a diferença entre
              // "achamos que fecha" e "vimos fechar".
              reversible: desfeito.restaurado,
            });
          }
        } catch (err) {
          // Uma ação navegou/destruiu o contexto apesar da política (SPA que
          // intercepta, script do site, corrida). O GRAFO não pode levar a
          // captura junto: registra, tenta reestabelecer a página e segue —
          // sem recuperação, devolve o que já foi medido.
          if (!ehContextoDestruido(err)) throw err;
          contaminado = true;
          limitacoes.push(
            `A ação "${acao}" em "${cand.hash.slice(0, 10)}" navegou para outro documento; o grafo seguiu sem ela.`,
          );
          bloqueadas.push({
            reason: 'navegacao-externa',
            target: `${cand.descriptor.tag}${cand.descriptor.text ? ` "${cand.descriptor.text.slice(0, 40)}"` : ''}`,
            detail: 'navegou durante a exploração — contexto destruído',
          });
          let recuperou = false;
          if (opts.reestabelecer !== undefined && reestabelecimentos < maxReest) {
            reestabelecimentos++;
            recuperou = await opts.reestabelecer().catch(() => false);
          }
          if (!recuperou) {
            truncado = true;
            fila.length = 0;
            break;
          }
        }
      }
    }
  }

  return {
    grafo: {
      rootId: raiz.id,
      nodes,
      edges,
      limits: { maxDepth, maxStates, maxActions },
      cycles: ciclos,
      deduped: dedup,
      truncated: truncado,
    },
    acoes,
    bloqueadas,
    contaminado,
    limitacoes: [...new Set(limitacoes)],
  };
};
