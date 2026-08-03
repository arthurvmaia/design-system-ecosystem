import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  type MapaDeRecoloracao,
  type ReguasDeEscala,
  atributosDeProxy,
  envolverEmProxies,
  escoparCss,
  fontesDaOrigem,
  mapaDeFontes,
  mapaDeRecoloracao,
  nomesGlobaisDe,
  recolorirCss,
  reescalarCss,
  retipografarCss,
} from '@ds/composer';
import {
  type KitComponenteDeGeracao,
  KitDesignSystem,
  type ProjectBranding,
  type ProjectLayout,
  buildTypographyCss,
  ehPecaDeFundo,
  escalaDeReferencia,
  projectGeneratedVersionDir,
  projectMediaDir,
  reguasParaOrigem,
  resolverSecoes,
  separarCamadasDePagina,
} from '@ds/shared';
import { lerCssDoBundle } from './cascata.js';
import { buildBrandingCss } from './index.js';
import {
  atributosDoDocumentoDaPeca,
  envolverCamadaDePagina,
  envolverSecao,
  extrairCorpo,
  limparParaComposicao,
  reescreverRefsCss,
  reescreverRefsHtml,
} from './montagem.js';
import { removerScriptsQueCompilamCss } from './pecas.js';
import { cssResponsivoBase } from './responsivo.js';

/**
 * `montarPaginaDoKit`: TODO o determinístico da geração num lugar só.
 *
 * O que existia antes, medido nos restos: cada site do modo fila era um script
 * `_tmp-*.ts` descartável — 1371 linhas, ids de componente hardcoded, ~120
 * `troca(html, stringExata, novoTexto)` — reescrito do zero a cada projeto. O
 * escopo, a recoloração, o fundo, o responsivo, a cascata do `marca.css`: tudo
 * dependia de o agente lembrar de cada regra, e a regra esquecida não dava
 * erro, dava um site errado.
 *
 * A divisão agora é nítida:
 *
 * - **O código faz o que é mecânico**: resolver as seções, separar o fundo,
 *   compor com escopo e recoloração, vestir os proxies, copiar assets e mídia,
 *   escrever as quatro folhas na ordem da cascata, montar o documento.
 * - **O agente faz o que é criativo**, e ENTREGA como dado: os textos por
 *   seção (`substituicoes`), o HTML das seções sem peça (`htmlCriado` +
 *   `cssCriado`), a escolha de onde vai cada mídia (`midia`).
 *
 * Se algo determinístico faltar aqui, é defeito DESTE módulo — nunca trabalho
 * para um script avulso.
 */

/** O criativo de uma seção, produzido pelo agente (ou pelo modo api). */
export type SecaoCriativa = {
  /** Casa com `layout.secoes[].id`. */
  secaoId: string;
  /**
   * Trocas de texto nas peças DESTA seção: chave é o trecho exato do HTML de
   * origem, valor é o texto novo. Troca que não casa vira aviso, não silêncio.
   */
  substituicoes?: Record<string, string>;
  /**
   * HTML criado para a seção (no estilo do kit, consultando o design system
   * consolidado + a identidade do usuário). Entra DEPOIS das peças da seção,
   * ou sozinho quando a seção não tem peça.
   */
  htmlCriado?: string;
};

export type EntradaDaPagina = {
  projectId: `prj_${string}`;
  /** O <title> e o lang do documento. */
  titulo: string;
  lang?: string;
  kit: { id: string; components: readonly KitComponenteDeGeracao[] };
  /** O design system consolidado do kit (`kits.tokensJson`). Null = sem recoloração. */
  designSystem?: unknown;
  layout: ProjectLayout;
  branding: ProjectBranding;
  secoes?: readonly SecaoCriativa[];
  /** CSS das seções criadas. Vai em `assets/criadas.css`, entre styles e responsivo. */
  cssCriado?: string;
  /** Regras responsivas além da base (`cssResponsivoBase`). */
  responsivoExtra?: string;
  /**
   * Mídia a copiar: `de` relativo a `projects/<id>/media/`, `para` relativo à
   * raiz do site gerado (ex.: `midia/hero.webp`). O HTML criado referencia o
   * `para`.
   */
  midia?: readonly { de: string; para: string }[];
  /** Sobrescreve o destino (testes). Default: `generated/<iso>` do projeto. */
  outputDir?: string;
};

export type ResultadoDaPagina = {
  outputDir: string;
  arquivos: string[];
  avisos: string[];
  /** Peças pedidas no layout cujo bundle não está em disco. */
  faltando: string[];
  recoloracao: { origens: number; reescritas: number; mantidas: number };
  /** Quantas declarações de fonte passaram a consumir o token da marca. */
  retipografia: { reescritas: number };
  /**
   * Tamanhos e respiros que passaram a consumir a régua da marca, e quantos
   * ficaram com o valor da origem (unidade relativa, expressão fluida, valor
   * fora de qualquer degrau). `mantidas` alto não é defeito: é o quanto daquela
   * folha o alinhamento não alcança, e é a única forma de saber disso.
   */
  reescala: { reescritas: number; mantidas: number };
};

/** Troca cada chave pelo valor, uma vez; o que não casar vira aviso. */
const aplicarSubstituicoes = (
  html: string,
  substituicoes: Record<string, string> | undefined,
  avisos: string[],
  rotulo: string,
): string => {
  if (substituicoes === undefined) return html;
  let saida = html;
  for (const [de, para] of Object.entries(substituicoes)) {
    const idx = saida.indexOf(de);
    if (idx < 0) {
      avisos.push(
        `[${rotulo}] uma substituição não casou (o HTML de origem não contém o trecho que começa com "${de.slice(0, 60)}").`,
      );
      continue;
    }
    saida = saida.slice(0, idx) + para + saida.slice(idx + de.length);
  }
  return saida;
};

/** Os `<script src>` remotos de um documento de bundle, na ordem. */
const scriptsRemotosDe = (html: string): string[] => {
  const out: string[] = [];
  for (const m of html.matchAll(/<script\b[^>]*\bsrc\s*=\s*"([^"]+)"/gi)) {
    const src = m[1];
    if (src === undefined || !/^(https?:)?\/\//i.test(src)) continue;
    if (!out.includes(src)) out.push(src);
  }
  return out;
};

export const montarPaginaDoKit = (entrada: EntradaDaPagina): ResultadoDaPagina => {
  const avisos: string[] = [];
  const faltando: string[] = [];
  const arquivos: string[] = [];

  // ── O design system, validado sem confiança cega ──────────────────────────
  // O campo chega como `unknown` porque atravessa JSON (payload do job, coluna
  // do banco). Schema de versão futura degrada para "sem recoloração", dito.
  let ds: KitDesignSystem | null = null;
  if (entrada.designSystem != null) {
    const parse = KitDesignSystem.safeParse(entrada.designSystem);
    if (parse.success) ds = parse.data;
    else avisos.push('O design system do kit não validou no schema: sigo sem recoloração.');
  }
  if (ds === null) {
    avisos.push('Sem design system consolidado: as peças saem com as cores do site de origem.');
  }
  const mapasPorOrigem = new Map<string, MapaDeRecoloracao>();
  for (const origem of ds?.origens ?? []) {
    const mapa = mapaDeRecoloracao(origem.clusters);
    if (mapa.size > 0) mapasPorOrigem.set(origem.designSystemId, mapa);
  }

  /**
   * ── A escala, quando a marca rege ────────────────────────────────────────
   *
   * Uma régua só para o site inteiro. Sem isto, um kit que junta o hero de um
   * site com os preços de outro sai com título de 64px em cima e de 40px
   * embaixo — não porque alguém escolheu, mas porque dois designers
   * escolheram, em sites diferentes, e ninguém conciliou.
   *
   * O regime `de-cada-origem` não é um segundo caminho de código: é ESTE
   * caminho desligado. Sem régua, `reescalarCss` não é chamado e o literal da
   * origem continua valendo, que é exatamente o comportamento anterior.
   */
  const regeAMarca = entrada.branding.escalaDoSite !== 'de-cada-origem';
  const referencia = regeAMarca
    ? escalaDeReferencia(ds?.origens ?? [], entrada.layout.preferDesignSystemId)
    : null;
  const reguasPorOrigem = new Map<string, ReguasDeEscala>();
  if (referencia !== null) {
    for (const origem of ds?.origens ?? []) {
      const reguas = reguasParaOrigem(origem.escala, referencia.escala);
      if (
        reguas.tipografia.porValor.size > 0 ||
        reguas.espaco.porValor.size > 0 ||
        reguas.raio.porValor.size > 0
      ) {
        reguasPorOrigem.set(origem.designSystemId, reguas);
      }
    }
  }
  if (regeAMarca && referencia === null && (ds?.origens.length ?? 0) > 0) {
    avisos.push(
      'Nenhuma origem do kit tem escala medida: os tamanhos e respiros saem como no site de origem. Recapture para o motor medir a régua.',
    );
  }

  // ── Estrutura: seções do usuário, fundo separado ──────────────────────────
  const resolvidas = resolverSecoes(entrada.layout.secoes, [...entrada.kit.components]);
  avisos.push(...resolvidas.avisos);
  const separado = separarCamadasDePagina(resolvidas.secoes);
  avisos.push(...separado.avisos);

  const outputDir =
    entrada.outputDir ??
    projectGeneratedVersionDir(entrada.projectId, new Date().toISOString().replace(/[:.]/g, '-'));
  mkdirSync(join(outputDir, 'assets'), { recursive: true });

  const porId = new Map(entrada.kit.components.map((c) => [c.id, c]));
  const criativoPorSecao = new Map((entrada.secoes ?? []).map((s) => [s.secaoId, s]));

  // Estado da composição, compartilhado entre seções e camadas: uma origem
  // entra com CSS uma vez só, e os nomes globais (keyframes) acumulam.
  const origensComCss = new Set<string>();
  const nomesUsados = {
    keyframes: new Set<string>(),
    fontFace: new Set<string>(),
    layer: new Set<string>(),
  };
  let concatCss = '';
  const scriptsRemotos: string[] = [];
  const recoloracaoTotais = { origens: 0, reescritas: 0, mantidas: 0 };
  const retipografiaTotais = { reescritas: 0 };
  const reescalaTotais = { reescritas: 0, mantidas: 0 };

  /**
   * Processa UMA peça: CSS da origem (recolorido → escopado, uma vez), corpo
   * vestido nos proxies, assets copiados e referências reescritas.
   */
  const processarPeca = (
    cmpId: string,
    substituicoes: Record<string, string> | undefined,
    rotulo: string,
  ): string | null => {
    const cmp = porId.get(cmpId);
    if (cmp === undefined) {
      avisos.push(`[${rotulo}] a peça ${cmpId} não está no kit do payload: ficou de fora.`);
      return null;
    }
    const indexPath = join(cmp.bundlePath, 'index.html');
    if (!existsSync(indexPath)) {
      faltando.push(cmpId);
      avisos.push(`[${rotulo}] a peça ${cmpId} não tem bundle em disco: ficou de fora.`);
      return null;
    }
    const documento = readFileSync(indexPath, 'utf8');

    // Fundo/efeito mantém as cores originais: a peça foi escolhida PELA cor.
    // A origem-apelido dá a ela um escopo próprio sem recoloração.
    const manterCores = ehPecaDeFundo(cmp);
    const origemBase = cmp.designSystemId ?? cmp.id;
    const origem = manterCores ? `${origemBase}::original` : origemBase;

    if (!origensComCss.has(origem)) {
      origensComCss.add(origem);
      const leitura = lerCssDoBundle(cmp.bundlePath);
      if (leitura.faltando.length > 0) {
        avisos.push(
          `[${rotulo}] ${leitura.faltando.length} folha(s) do bundle de ${cmpId} não existem em disco.`,
        );
      }
      let css = leitura.css;
      const mapa = manterCores ? undefined : mapasPorOrigem.get(origemBase);
      if (mapa !== undefined && css.trim().length > 0) {
        const rec = recolorirCss(css, mapa);
        css = rec.css;
        recoloracaoTotais.origens += 1;
        recoloracaoTotais.reescritas += rec.reescritas;
        recoloracaoTotais.mantidas += rec.mantidas;
        avisos.push(...rec.avisos.map((a) => `[${origemBase}] ${a}`));
      }
      /**
       * A retipografia, logo depois da recoloração e ANTES do escopo — pela
       * mesma razão que a recoloração vem antes: as duas reescrevem VALOR, e o
       * escopo reescreve SELETOR. Rodando nessa ordem, cada transformação fica
       * cega para a outra.
       *
       * `manterCores` também segura esta: quem pediu a peça pela aparência de
       * origem quis a aparência inteira, letra incluída.
       */
      if (!manterCores && css.trim().length > 0) {
        const fontes = fontesDaOrigem(css);
        const ret = retipografarCss(css, mapaDeFontes(fontes));
        css = ret.css;
        retipografiaTotais.reescritas += ret.reescritas;
        if (fontes.display === null && fontes.body === null) {
          avisos.push(
            `[${origemBase}] não deu para dizer qual fonte é de título e qual é de texto, então a tipografia desta origem fica como está.`,
          );
        }
      }

      /**
       * A reescala fecha a trinca de reescrita de VALOR, e vem por último das
       * três de propósito: ela lê `font-size`, que a retipografia não toca (a
       * retipografia mexe em `font-family`), então as duas são cegas uma para a
       * outra em qualquer ordem — mas manter a ordem cor → letra → tamanho faz o
       * placar e os avisos saírem na mesma sequência em que a pessoa pensa a
       * marca.
       *
       * `manterCores` segura esta também, pela terceira vez e pelo mesmo motivo:
       * quem escolheu a peça pela aparência de origem quis a aparência inteira,
       * e proporção é aparência.
       */
      const reguas = manterCores ? undefined : reguasPorOrigem.get(origemBase);
      if (reguas !== undefined && css.trim().length > 0) {
        const esc = reescalarCss(css, reguas);
        css = esc.css;
        reescalaTotais.reescritas += esc.reescritas;
        reescalaTotais.mantidas += esc.mantidas;
      }

      if (css.trim().length > 0) {
        const proxies = atributosDeProxy(origem);
        const escopo = escoparCss(css, {
          raiz: `${proxies.raiz}="${origem}"`,
          corpo: `${proxies.corpo}="${origem}"`,
          sufixo: origem,
          nomesUsados,
        });
        avisos.push(...escopo.avisos.map((a) => `[${origem}] ${a}`));
        const declarados = nomesGlobaisDe(escopo.css);
        for (const n of declarados.keyframes) nomesUsados.keyframes.add(n);
        for (const n of declarados.fontFace) nomesUsados.fontFace.add(n);
        for (const n of declarados.layer) nomesUsados.layer.add(n);
        // As referências de asset do CSS apontam para a pasta da peça que
        // trouxe a folha — as peças da mesma origem compartilham os arquivos.
        concatCss += `\n/* origem ${origem} — primeira peça: ${cmpId} */\n${reescreverRefsCss(escopo.css, cmpId)}`;
      }
    }

    // O compilador de CSS localizado (Tailwind CDN) NÃO vai para o site
    // composto: ele recompilaria as utilitárias com os literais de origem por
    // cima da recoloração. Ver removerScriptsQueCompilamCss.
    const semCompilador = removerScriptsQueCompilamCss(
      limparParaComposicao(extrairCorpo(documento)),
      cmp.bundlePath,
    );
    for (const src of semCompilador.removidos) {
      avisos.push(
        `[${rotulo}] o script ${src} compila CSS em runtime e foi removido do site composto: o CSS compilado já viaja nos arquivos do bundle.`,
      );
    }
    let corpo = semCompilador.corpo;
    corpo = aplicarSubstituicoes(corpo, substituicoes, avisos, rotulo);
    corpo = envolverEmProxies({
      origem,
      html: corpo,
      css: '',
      documentoAttrs: atributosDoDocumentoDaPeca(documento),
    });

    // Assets do bundle → assets/<cmpId>/ (menos o css, que entrou na folha).
    const assetsDir = join(cmp.bundlePath, 'assets');
    if (existsSync(assetsDir)) {
      const destino = join(outputDir, 'assets', cmpId);
      for (const entry of readdirSync(assetsDir)) {
        if (entry === 'css') continue;
        cpSync(join(assetsDir, entry), join(destino, entry), { recursive: true });
      }
      corpo = reescreverRefsHtml(corpo, cmpId);
    }
    // Frames da referência visual também moram no bundle e viajam junto.
    const framesDir = join(cmp.bundlePath, 'frames');
    if (existsSync(framesDir)) {
      cpSync(framesDir, join(outputDir, 'assets', cmpId, 'frames'), { recursive: true });
      corpo = corpo.replaceAll('src="frames/', `src="assets/${cmpId}/frames/`);
    }

    for (const s of scriptsRemotosDe(documento)) {
      if (!scriptsRemotos.includes(s)) scriptsRemotos.push(s);
    }
    return corpo;
  };

  // ── As camadas de fundo, antes das seções ─────────────────────────────────
  let camadasHtml = '';
  if (separado.camadas.length > 0) {
    const corpos = separado.camadas
      .map((c) => processarPeca(c.id, undefined, 'fundo da página'))
      .filter((c): c is string => c !== null);
    if (corpos.length > 0) {
      camadasHtml = `\n${envolverCamadaDePagina(corpos.join('\n'), {
        componentIds: separado.camadas.map((c) => c.id),
      })}\n`;
      avisos.push(
        'Fundo por peça de referência visual é imagem estática do frame de origem: cobre a tela, mas não anima e não recolore.',
      );
    }
  }

  // ── As seções, na ordem do usuário ────────────────────────────────────────
  let bodyHtml = '';
  for (const secao of separado.secoes) {
    const criativo = criativoPorSecao.get(secao.id);
    const partes: string[] = [];
    const usados: string[] = [];
    for (const peca of secao.pecas) {
      const corpo = processarPeca(peca.id, criativo?.substituicoes, secao.nome || secao.slug);
      if (corpo === null) continue;
      partes.push(corpo);
      usados.push(peca.id);
    }
    if (criativo?.htmlCriado !== undefined && criativo.htmlCriado.trim().length > 0) {
      partes.push(criativo.htmlCriado);
    }
    if (partes.length === 0) {
      avisos.push(
        `A seção "${secao.nome || secao.slug}" saiu vazia: sem peça em disco e sem HTML criado. Ela foi mantida para o problema aparecer na prévia, não sumir.`,
      );
      partes.push(`<!-- seção "${secao.nome}" sem conteúdo -->`);
    }
    bodyHtml += `\n${envolverSecao(partes.join('\n'), {
      role: secao.slug,
      secaoId: secao.id,
      componentIds: usados,
      criouAlgo: criativo?.htmlCriado !== undefined || usados.length < secao.pecas.length,
    })}\n`;
  }

  // ── Mídia do projeto ──────────────────────────────────────────────────────
  for (const m of entrada.midia ?? []) {
    // Nada de sair da pasta de mídia nem da pasta do site: os dois lados vêm
    // de dado externo (o agente escreve o entrada.json à mão).
    if (m.de.split(/[\\/]/).includes('..') || m.para.split(/[\\/]/).includes('..')) {
      avisos.push(`Mídia com travessia de caminho ignorada: ${m.de} -> ${m.para}`);
      continue;
    }
    const origem = join(projectMediaDir(entrada.projectId), m.de);
    if (!existsSync(origem)) {
      avisos.push(`Mídia não encontrada no projeto: ${m.de}`);
      continue;
    }
    const destino = join(outputDir, m.para);
    mkdirSync(join(destino, '..'), { recursive: true });
    cpSync(origem, destino);
    arquivos.push(m.para);
  }

  // ── As quatro folhas, na ordem da cascata ─────────────────────────────────
  // ESQUELETO (peças, escopado e recolorido) → CRIADAS (as seções do agente)
  // → RESPONSIVO (vence larguras fixas só no mobile) → MARCA (a identidade por
  // último, vencendo sem !important — e agora com o que vencer, porque a
  // recoloração criou os pontos de consumo).
  const escrever = (rel: string, conteudo: string): void => {
    writeFileSync(join(outputDir, rel), conteudo, 'utf8');
    arquivos.push(rel);
  };
  escrever('assets/styles.css', concatCss);
  escrever('assets/criadas.css', entrada.cssCriado ?? '/* nenhuma seção criada */');
  escrever(
    'assets/responsivo.css',
    entrada.responsivoExtra === undefined
      ? cssResponsivoBase()
      : `${cssResponsivoBase()}\n\n/* deste site */\n${entrada.responsivoExtra}`,
  );
  // A régua da referência vira `--marca-passo-N` e `--marca-espaco-N` aqui, e é
  // o que as peças reescritas acima consomem. Sem referência, `buildBrandingCss`
  // sai idêntico ao de antes: nenhum token novo, nenhuma mudança de aparência.
  escrever('assets/marca.css', buildBrandingCss(entrada.branding, referencia?.escala));

  const fontImportUrl = buildTypographyCss(entrada.branding.typography).importUrl;
  const fontLinks = fontImportUrl
    ? `<link rel="preconnect" href="https://fonts.googleapis.com"/>\n<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin/>\n<link rel="stylesheet" href="${fontImportUrl}"/>\n`
    : '';
  const scriptsHtml = scriptsRemotos.map((s) => `<script src="${s}"></script>`).join('\n');

  const finalHtml = `<!doctype html>
<html lang="${entrada.lang ?? 'pt-BR'}">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1.0"/>
<title>${entrada.titulo}</title>
${fontLinks}<link rel="stylesheet" href="assets/styles.css"/>
<link rel="stylesheet" href="assets/criadas.css"/>
<link rel="stylesheet" href="assets/responsivo.css"/>
<link rel="stylesheet" href="assets/marca.css"/>
</head>
<body>${camadasHtml}${bodyHtml}
${scriptsHtml}
</body>
</html>`;
  escrever('index.html', finalHtml);

  return {
    outputDir,
    arquivos,
    avisos,
    faltando,
    recoloracao: recoloracaoTotais,
    retipografia: retipografiaTotais,
    reescala: reescalaTotais,
  };
};
