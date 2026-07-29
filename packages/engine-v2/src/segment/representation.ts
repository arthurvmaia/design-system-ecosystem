import type {
  Confidence,
  MediaKind,
  RenderMode,
  RepresentationDecision,
  RepresentationType,
  RuntimeKind,
} from '@ds/shared';

/**
 * Classificador de representação — a decisão mais importante do V2, e função
 * pura.
 *
 * O V1 tinha uma forma só de preservar (HTML estático) e a aplicava a tudo. Um
 * `<canvas>` "preservado" como HTML é um retângulo vazio; foi assim que o card
 * preto nasceu. Aqui cada item vai para a forma que ele realmente suporta:
 *
 * - `componente-portatil` — DOM+CSS+assets+estados bastam. Editável.
 * - `capsula-runtime`     — precisa do runtime; roda isolado, com a MENOR unidade
 *                           funcional (nunca a página inteira).
 * - `referencia-visual`   — não há como preservar com segurança ou portabilidade;
 *                           guarda loop visual + frame de fallback + contexto, e é
 *                           apresentado como referência, jamais como editável.
 *
 * A regra de ouro: uma forma só é escolhida quando as condições dela estão
 * SATISFEITAS. Na dúvida, cai para a forma mais honesta (referência visual), e o
 * porquê fica registrado em `reasons`/`rejected`.
 */

/** Runtimes que sabemos encapsular quando os arquivos estão em mãos. */
const ENCAPSULAVEIS: ReadonlySet<RuntimeKind> = new Set<RuntimeKind>([
  'lottie',
  'three',
  'pixi',
  'canvas-2d',
  'webgl-cru',
  'shader-cru',
  'gsap',
  'anime',
  'p5',
  'matter',
  'web-animations',
]);

/**
 * Runtimes que controlam a PÁGINA, não uma cena. Encapsular um deles significaria
 * levar o site inteiro para dentro do iframe — o que o pedido proíbe
 * explicitamente ("não copie a página inteira quando apenas uma cena for
 * necessária"). Detectados, registrados, e o item volta a ser avaliado pelas
 * outras evidências.
 */
const RUNTIMES_DE_PAGINA: ReadonlySet<RuntimeKind> = new Set<RuntimeKind>([
  'lenis',
  'locomotive',
  'barba',
  'scrolltrigger',
  'aos',
  'framer-motion',
]);

/**
 * Runtimes que **desenham o conteúdo**, não que o animam.
 *
 * Esta distinção custou uma medição para aparecer. Numa página do acervo,
 * `classificarRepresentacao` marcou como `componente-portatil` uma seção com
 * três cards de ícone. Ela não é portátil: a página tem **zero `<svg>` inline**
 * e **23 `<iconify-icon>`**, e quem desenha os 23 é um script externo que busca
 * o traçado numa API. Sem ele, o bundle abre com três caixas vazias.
 *
 * O erro não era o bundle sair errado — era o app dizer que estava certo. A
 * pessoa escolhia a peça acreditando levá-la inteira.
 *
 * O mesmo vale para o Tailwind por CDN, que **compila** as classes no
 * navegador (sem ele, `class="flex gap-4"` não tem CSS por trás), e para o
 * script que pinta o fundo num canvas.
 *
 * Um runtime destes só deixa de pesar quando o motor conseguiu **materializar**
 * o que ele desenhava: ícone trazido para inline, CSS compilado capturado do
 * CSSOM. Por isso a evidência traz contadores, e não um booleano.
 */
const RUNTIMES_QUE_DESENHAM: ReadonlySet<RuntimeKind> = new Set<RuntimeKind>([
  'iconify',
  'tailwind-cdn',
  'fundo-canvas',
]);

/** O que cada um desenha, em português, para a limitação dizer algo de útil. */
const OQUE_DESENHA: Record<string, string> = {
  iconify: 'os ícones',
  'tailwind-cdn': 'o CSS das classes utilitárias',
  'fundo-canvas': 'o fundo da página',
};

/** Mídia que é apenas um arquivo: se o arquivo estiver local, é portátil. */
const MIDIA_DE_ARQUIVO: ReadonlySet<MediaKind> = new Set<MediaKind>([
  'video',
  'gif',
  'webp-animado',
  'avif-animado',
  'apng',
  'imagem',
  'svg-estatico',
  'svg-animado',
  'audio',
]);

/** Mídia que só existe enquanto um runtime desenha. */
const MIDIA_DE_RUNTIME: ReadonlySet<MediaKind> = new Set<MediaKind>([
  'canvas-2d',
  'webgl',
  'webgl2',
  'lottie',
]);

export type EvidenciaRepresentacao = {
  /** Runtimes detectados no item. */
  runtimes: readonly RuntimeKind[];
  /** Mídias detectadas. */
  midias: readonly MediaKind[];
  /** Todos os assets de que o item depende estão locais? */
  assetsLocais: boolean;
  /** Quantos assets ficaram na origem. */
  assetsExternos: number;
  /** Scripts de que o item depende e que NÃO temos em disco. */
  scriptsNaoLocalizados: number;
  /** O item tem iframe cross-origin. */
  iframeCrossOrigin: boolean;
  /** O item tem shadow root FECHADO (não percorrível). */
  shadowFechado: boolean;
  /** Estados capturados e restaurados com sucesso. */
  estadosCapturados: number;
  /** Movimento medido no tempo (pixel diff). */
  movimentoMedido: boolean;
  /** O movimento é explicado por CSS/SMIL puro (sem JS)? */
  movimentoPorCss: boolean;
  /** Reage ao ponteiro (medido pela varredura). */
  reageAoPonteiro: boolean;
  /** Há região reativa SEM DOM interno (cena em canvas). */
  regiaoReativaSemDom: boolean;
  /** O item depende de JS de qualquer origem. */
  dependeDeJs: boolean;
  /** O bootstrap do runtime foi identificado (dá para reinicializar isolado). */
  bootstrapIdentificado: boolean;
  /**
   * Ícones de biblioteca que ficaram como casca — o SVG não pôde ser lido.
   *
   * Zero significa que o runtime de ícone já não é necessário: o desenho foi
   * materializado e viaja no HTML. Maior que zero é o caso em que o item PRECISA
   * do runtime para não sair com caixas vazias.
   */
  iconesNaoDesenhados?: number;
  /** Ícones cujo SVG foi trazido para o HTML — não dependem mais de nada. */
  iconesInline?: number;
  /**
   * O CSS que o runtime compilava foi capturado do CSSOM?
   *
   * O Tailwind por CDN injeta um `<style>` com o resultado, e o coletor lê
   * `document.styleSheets` DEPOIS de a página rodar — então normalmente sim. Só
   * quando essa captura falha é que a dependência do CDN é real.
   */
  cssCompiladoCapturado?: boolean;
};

const confiancaDe = (n: number): Confidence =>
  n >= 0.8 ? 'alta' : n >= 0.5 ? 'media' : n > 0 ? 'baixa' : 'nenhuma';

/** Modo de render primário, no vocabulário que a Galeria do V1 já entende. */
const modoDeRender = (ev: EvidenciaRepresentacao): RenderMode => {
  const fortes: RenderMode[] = [];
  if (ev.midias.includes('webgl') || ev.midias.includes('webgl2')) fortes.push('webgl');
  else if (ev.midias.includes('canvas-2d')) fortes.push('canvas');
  if (ev.midias.includes('video')) fortes.push('video');
  if (ev.midias.includes('lottie')) fortes.push('lottie');
  if (ev.midias.includes('svg-animado')) fortes.push('svg-animado');
  if (ev.iframeCrossOrigin) fortes.push('iframe');
  if (fortes.length > 1) return 'misto';
  const unico = fortes[0];
  if (unico !== undefined) return unico;
  return ev.dependeDeJs ? 'html-js' : 'html';
};

/**
 * Decide a forma de preservação.
 *
 * A ordem dos testes é a ordem das impossibilidades: primeiro o que TORNA
 * impossível ser portátil, depois o que torna impossível encapsular. O que
 * sobrar é portátil de verdade, não por omissão.
 */
export const classificarRepresentacao = (ev: EvidenciaRepresentacao): RepresentationDecision => {
  const reasons: string[] = [];
  const rejected: Array<{ type: RepresentationType; why: string }> = [];
  const limitations: string[] = [];

  const runtimesDeCena = ev.runtimes.filter(
    (r) => !RUNTIMES_DE_PAGINA.has(r) && !RUNTIMES_QUE_DESENHAM.has(r),
  );
  const runtimesDePagina = ev.runtimes.filter((r) => RUNTIMES_DE_PAGINA.has(r));
  for (const r of runtimesDePagina) {
    limitations.push(
      `Depende de "${r}", que controla a página inteira: não foi encapsulado (isolar exigiria levar o site todo).`,
    );
  }

  // ── Runtimes que desenham: só pesam sobre o que não foi materializado ─────
  //
  // A ordem importa. Este teste vem ANTES de tudo porque ele muda a resposta de
  // "portátil" para "cápsula" — e "portátil" era a resposta errada que o app
  // vinha dando. Ele NÃO decide sozinho, porém: um item com iconify cujos
  // ícones foram todos trazidos para inline volta a ser candidato a portátil,
  // porque o runtime já não faz falta.
  const desenhamPendentes: RuntimeKind[] = [];
  for (const r of ev.runtimes) {
    if (!RUNTIMES_QUE_DESENHAM.has(r)) continue;
    if (r === 'iconify') {
      const pendentes = ev.iconesNaoDesenhados ?? 0;
      if (pendentes === 0) {
        if ((ev.iconesInline ?? 0) > 0) {
          reasons.push(
            `${ev.iconesInline} ícone(s) trazidos para o HTML: a biblioteca de ícones deixou de ser necessária.`,
          );
        }
        continue;
      }
      desenhamPendentes.push(r);
      limitations.push(
        `${pendentes} ícone(s) não puderam ser lidos e continuam dependendo do runtime "${r}" para aparecer.`,
      );
      continue;
    }
    if (r === 'tailwind-cdn') {
      if (ev.cssCompiladoCapturado === true) {
        reasons.push(
          'O CSS que o Tailwind por CDN compila foi capturado do CSSOM: o bundle não depende mais do CDN.',
        );
        continue;
      }
      desenhamPendentes.push(r);
      limitations.push(
        'Depende de "tailwind-cdn", que compila as classes utilitárias no navegador, e o CSS resultante não foi capturado: as classes ficam sem estilo.',
      );
      continue;
    }
    desenhamPendentes.push(r);
    limitations.push(
      `Depende de "${r}", que desenha ${OQUE_DESENHA[r] ?? 'parte do conteúdo'}: sem o script, o HTML sai sem isso.`,
    );
  }

  const temMidiaDeRuntime = ev.midias.some((m) => MIDIA_DE_RUNTIME.has(m));
  const precisaDeRuntime = runtimesDeCena.length > 0 || temMidiaDeRuntime || ev.regiaoReativaSemDom;

  // ── Barreiras absolutas: nem portátil nem cápsula ────────────────────────
  if (ev.iframeCrossOrigin) {
    reasons.push(
      'Embute iframe de outra origem — a política de origem impede percorrer e reproduzir.',
    );
    rejected.push({ type: 'componente-portatil', why: 'conteúdo cross-origin não é acessível' });
    rejected.push({ type: 'capsula-runtime', why: 'não há o que encapsular: o conteúdo é remoto' });
    limitations.push('O conteúdo do iframe vem de outra origem e não foi capturado.');
    return {
      type: 'referencia-visual',
      reasons,
      rejected,
      runtimes: [...ev.runtimes],
      renderMode: modoDeRender(ev),
      editable: false,
      confidence: 'alta',
      limitations,
    };
  }

  if (ev.shadowFechado) {
    reasons.push(
      'Usa Shadow DOM fechado — a subárvore não é percorrível por contrato do navegador.',
    );
    rejected.push({ type: 'componente-portatil', why: 'o DOM interno é inacessível' });
    limitations.push('Shadow DOM fechado: só o comportamento visual externo foi observado.');
    return {
      type: 'referencia-visual',
      reasons,
      rejected,
      runtimes: [...ev.runtimes],
      renderMode: modoDeRender(ev),
      editable: false,
      confidence: 'alta',
      limitations,
    };
  }

  // ── Precisa de runtime? Então cápsula, se der; senão, referência ─────────
  if (precisaDeRuntime) {
    const encapsulaveis = runtimesDeCena.filter((r) => ENCAPSULAVEIS.has(r));
    const podeEncapsular =
      encapsulaveis.length > 0 &&
      ev.scriptsNaoLocalizados === 0 &&
      ev.assetsLocais &&
      ev.bootstrapIdentificado;

    if (podeEncapsular) {
      reasons.push(
        `Cena dependente de runtime (${encapsulaveis.join(', ')}) com scripts e assets em disco e inicialização identificada.`,
      );
      rejected.push({
        type: 'componente-portatil',
        why: 'o visual é desenhado por runtime; HTML/CSS sozinhos não o reproduzem',
      });
      if (ev.regiaoReativaSemDom) {
        limitations.push(
          'Há região que responde ao ponteiro sem elemento DOM correspondente: a interação é da cena, não de um botão.',
        );
      }
      return {
        type: 'capsula-runtime',
        reasons,
        rejected,
        runtimes: [...ev.runtimes],
        renderMode: modoDeRender(ev),
        // A cápsula roda; o HTML dela não é para editar como componente.
        editable: false,
        confidence: confiancaDe(0.8),
        limitations,
      };
    }

    // Não deu para encapsular — diga exatamente por quê.
    if (encapsulaveis.length === 0) {
      const alvo =
        runtimesDeCena.length > 0 ? runtimesDeCena.join(', ') : 'runtime não identificado';
      reasons.push(`Runtime não encapsulável com segurança (${alvo}).`);
    }
    if (ev.scriptsNaoLocalizados > 0) {
      reasons.push(
        `${ev.scriptsNaoLocalizados} script(s) de que a cena depende não foram obtidos — a cápsula não inicializaria.`,
      );
    }
    if (!ev.assetsLocais) {
      reasons.push(
        `${ev.assetsExternos} asset(s) continuam na origem — a cápsula quebraria fora dela.`,
      );
    }
    if (!ev.bootstrapIdentificado) {
      reasons.push('A inicialização da cena não foi identificada — não há o que executar isolado.');
    }
    rejected.push({ type: 'componente-portatil', why: 'o visual depende de runtime' });
    rejected.push({ type: 'capsula-runtime', why: reasons.join('; ') });
    limitations.push(
      'Preservado como referência visual: o movimento foi gravado, o runtime não foi reproduzido.',
    );
    return {
      type: 'referencia-visual',
      reasons,
      rejected,
      runtimes: [...ev.runtimes],
      renderMode: modoDeRender(ev),
      editable: false,
      confidence: confiancaDe(0.7),
      limitations,
    };
  }

  // ── Depende de quem desenha? Então é cápsula, não portátil ───────────────
  //
  // Vem depois das barreiras (iframe, shadow fechado, runtime de cena), que são
  // impedimentos maiores, e antes do teste de portátil — que é justamente o que
  // este caso vinha respondendo errado.
  //
  // Cápsula e não referência visual: o HTML É o item, e ele reproduz assim que
  // o runtime carrega. Os `<script src>` da página viajam no bundle desde a
  // correção do documento, então o arquivo entregue funciona — com rede. É uma
  // dependência real e é isso que a ficha passa a dizer.
  if (desenhamPendentes.length > 0) {
    // `unshift` e não `push`: o motivo DECISIVO vem primeiro. A ficha da
    // Galeria mostra a primeira razão, e ela vinha exibindo uma frase positiva
    // ("o CSS do Tailwind foi capturado") num item que acabara de ser
    // rebaixado a cápsula. Verdade nas duas, mas na ordem errada — quem lê
    // entende o contrário do que a decisão diz.
    reasons.unshift(
      `O conteúdo é desenhado em tempo de execução por ${desenhamPendentes.join(', ')}: o HTML sozinho não o reproduz.`,
    );
    rejected.push({
      type: 'componente-portatil',
      why: `parte do que se vê (${desenhamPendentes.map((r) => OQUE_DESENHA[r] ?? r).join(', ')}) não está no HTML: é desenhada por script`,
    });
    limitations.push(
      'Precisa de rede na primeira carga: o runtime que desenha vem do endereço original.',
    );
    return {
      type: 'capsula-runtime',
      reasons,
      rejected,
      runtimes: [...ev.runtimes],
      renderMode: modoDeRender(ev),
      // O HTML existe e é legível, mas editá-lo não muda o que o runtime
      // desenha — prometer edição aqui seria a mesma mentira noutro lugar.
      editable: false,
      confidence: confiancaDe(0.75),
      limitations,
    };
  }

  // ── Sem runtime de cena: candidato a portátil ────────────────────────────
  const midiaDeArquivoPendente = ev.midias.some((m) => MIDIA_DE_ARQUIVO.has(m)) && !ev.assetsLocais;

  if (midiaDeArquivoPendente) {
    reasons.push(
      `Estrutura e estilo são portáteis, mas ${ev.assetsExternos} asset(s) de mídia continuam na origem.`,
    );
    limitations.push(
      'Assets de mídia ainda apontam para a origem: baixe-os para o componente sobreviver sozinho.',
    );
    // Continua PORTÁTIL — o defeito é de asset, não de forma. Marcar como
    // referência visual aqui seria rebaixar um componente que só precisa de um
    // download; a limitação fica registrada e a fidelidade de `assets` cai.
    return {
      type: 'componente-portatil',
      reasons,
      rejected: [
        { type: 'capsula-runtime', why: 'não há runtime envolvido' },
        { type: 'referencia-visual', why: 'o DOM e o CSS reproduzem o item' },
      ],
      runtimes: [...ev.runtimes],
      renderMode: modoDeRender(ev),
      editable: true,
      confidence: confiancaDe(0.6),
      limitations,
    };
  }

  if (ev.movimentoMedido && !ev.movimentoPorCss && ev.dependeDeJs && ev.estadosCapturados === 0) {
    // Move-se, o movimento não é de CSS, depende de JS e não capturamos nenhum
    // estado: não sabemos reproduzir. Honestidade acima de aparência.
    reasons.push(
      'Há movimento medido que não vem de CSS e nenhum estado foi capturado — a reprodução não é garantida.',
    );
    rejected.push({
      type: 'componente-portatil',
      why: 'o movimento observado não é explicado por CSS nem por estado capturado',
    });
    limitations.push('O movimento foi gravado como referência; o mecanismo não foi reproduzido.');
    return {
      type: 'referencia-visual',
      reasons,
      rejected,
      runtimes: [...ev.runtimes],
      renderMode: modoDeRender(ev),
      editable: false,
      confidence: confiancaDe(0.5),
      limitations,
    };
  }

  reasons.push('DOM, CSS e assets reproduzem o item.');
  if (ev.movimentoPorCss)
    reasons.push('O movimento vem de CSS/SMIL e roda por inclusão do estilo.');
  if (ev.estadosCapturados > 0) {
    reasons.push(`${ev.estadosCapturados} estado(s) capturados e restaurados.`);
  }
  if (ev.dependeDeJs && ev.estadosCapturados === 0) {
    limitations.push(
      'Depende de JavaScript e nenhum estado foi capturado: só o estado inicial é garantido.',
    );
  }
  return {
    type: 'componente-portatil',
    reasons,
    rejected: [
      { type: 'capsula-runtime', why: 'não há runtime de cena envolvido' },
      { type: 'referencia-visual', why: 'o item é reproduzível como HTML/CSS' },
    ],
    runtimes: [...ev.runtimes],
    renderMode: modoDeRender(ev),
    editable: true,
    confidence: confiancaDe(ev.estadosCapturados > 0 || !ev.dependeDeJs ? 0.85 : 0.6),
    limitations,
  };
};
