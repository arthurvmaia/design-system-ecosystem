/**
 * Instrumentação pré-carregamento.
 *
 * Este código roda DENTRO da página, via `addInitScript`, **antes de qualquer
 * script do site**. É string e não função TypeScript de propósito: não deve ser
 * typechecado contra o `lib` de Node, e é injetado como texto.
 *
 * O que ele resolve: o V1 só sabia que um elemento tinha listener (e marcava
 * isso num atributo, poluindo o HTML). Aqui a página inteira é observada
 * enquanto acontece — quem registrou listener de quê, que observers foram
 * criados, que contexto gráfico foi pedido, que shadow root nasceu, que vídeo
 * foi inserido depois, que animação começou. Sem isso, tudo o que o site monta
 * por JavaScript é invisível para a captura.
 *
 * ## Regras que este arquivo cumpre
 *
 * - **Observar sem quebrar.** Todo patch chama o original, preserva `this` e o
 *   retorno, e vive dentro de `try`. Se a instrumentação falhar, a página
 *   continua funcionando — a captura fica mais pobre, e é isso.
 * - **Nada de dado sensível.** Não lê `value` de campo, não lê cookie, não lê
 *   `localStorage`, não guarda cabeçalho de autorização, e sanitiza toda URL
 *   (querystring fora, credencial fora). Um `<input type=password>` contribui
 *   com o TIPO, nunca com o conteúdo.
 * - **Sem mutação do DOM aqui.** A marcação `data-dsx2` só é aplicada na COLETA,
 *   e sobre os elementos que interessam — não a cada `addEventListener`.
 * - **Teto em tudo.** Um site que registra cem mil listeners não deve estourar a
 *   memória do navegador; cada registro tem limite e para de crescer.
 */

/**
 * Nome do registro global. Curto e improvável de colidir. Se a página já tiver
 * um (dupla injeção), a segunda vez não faz nada.
 */
export const REGISTRO_GLOBAL = '__dsx2';

/** Atributo de endereçamento aplicado na coleta (removido do HTML capturado). */
export const ATTR_REF = 'data-dsx2';

/**
 * Tipos de evento que interessam. Um site registra `resize`, `message`,
 * `visibilitychange` e outros trinta que não dizem nada sobre componente; a
 * lista mantém o registro focado no que vira interação.
 */
const EVENTOS_DE_INTERESSE = [
  'click',
  'dblclick',
  'mousedown',
  'mouseup',
  'mouseenter',
  'mouseleave',
  'mouseover',
  'mouseout',
  'mousemove',
  'pointerdown',
  'pointerup',
  'pointerenter',
  'pointerleave',
  'pointerover',
  'pointerout',
  'pointermove',
  'pointercancel',
  'touchstart',
  'touchend',
  'touchmove',
  'touchcancel',
  'keydown',
  'keyup',
  'keypress',
  'focus',
  'blur',
  'focusin',
  'focusout',
  'input',
  'change',
  'submit',
  'scroll',
  'wheel',
  'dragstart',
  'drag',
  'dragend',
  'dragover',
  'dragenter',
  'dragleave',
  'drop',
  'animationstart',
  'animationend',
  'animationiteration',
  'transitionstart',
  'transitionend',
  'transitionrun',
];

/**
 * O script de instrumentação. Montado como template para a lista de eventos
 * viver num só lugar (aqui, em TypeScript) em vez de duplicada na string.
 */
export const INIT_SCRIPT = `
(() => {
  'use strict';
  if (window.${REGISTRO_GLOBAL}) return;

  var TETO_LISTENERS = 20000;
  var TETO_REGISTROS = 4000;
  var EVENTOS = ${JSON.stringify(EVENTOS_DE_INTERESSE)};
  var INTERESSE = Object.create(null);
  for (var i = 0; i < EVENTOS.length; i++) INTERESSE[EVENTOS[i]] = true;

  /**
   * Sanitiza uma URL para log: sem querystring, sem credencial, sem fragmento.
   * A querystring é onde token, sessão e assinatura vivem, e nada aqui precisa
   * dela — o que interessa é qual recurso, não com que credencial.
   */
  var sanitizar = function (u) {
    try {
      if (typeof u !== 'string' || u.length === 0) return '';
      if (u.indexOf('data:') === 0) return 'data:' + (u.slice(5, 30) || '') + '…';
      if (u.indexOf('blob:') === 0) return 'blob:…';
      var url = new URL(u, location.href);
      url.search = '';
      url.hash = '';
      url.username = '';
      url.password = '';
      return url.href;
    } catch (e) {
      return '';
    }
  };

  var R = {
    /** Contagem por tipo de evento. */
    listenersPorTipo: Object.create(null),
    /** WeakMap elemento → { tipos: Set, opcoes: {} }. Sem tocar no DOM. */
    listeners: new WeakMap(),
    /** Elementos com listener, para a coleta saber onde olhar. */
    comListener: [],
    observers: { intersection: 0, mutation: 0, resize: 0, performance: 0 },
    /** Alvos observados por IntersectionObserver — sinal forte de reveal. */
    alvosIntersection: new WeakMap(),
    animationApis: Object.create(null),
    /** Contextos gráficos: canvas → tipo. */
    contextos: new WeakMap(),
    contextosPorTipo: Object.create(null),
    canvases: [],
    shadowRoots: { open: 0, closed: 0 },
    /** Hosts com shadow root aberto (percorríveis). */
    shadowHosts: [],
    /** Hosts com shadow root FECHADO — registrados como limitação. */
    shadowFechados: [],
    /** Nós inseridos depois do load, por tag. */
    dynamicInserts: Object.create(null),
    /** Elementos de mídia inseridos dinamicamente. */
    midiaDinamica: [],
    historyChanges: 0,
    /** Chamadas a rAF — sinal de loop de animação. */
    rafCount: 0,
    /** Quem chamou rAF (primeira linha do stack, sanitizada) — atribui o loop. */
    rafOrigens: Object.create(null),
    /** Ações barradas pela instrumentação, para o log seguro. */
    bloqueados: [],
    /** Animações CSS que começaram, por nome. */
    animacoesCss: Object.create(null),
    /** Transições que rodaram, por propriedade. */
    transicoes: Object.create(null),
    /** Globais de biblioteca vistos no window (preenchido na coleta). */
    limitacoes: [],
    /** Marcado quando algum patch falhou — a coleta declara isso. */
    falhas: [],
    /** Array de endereçamento: índice → elemento. Preenchido na coleta. */
    els: [],
    /** Início da observação, para timestamps relativos. */
    t0: Date.now(),
  };
  window.${REGISTRO_GLOBAL} = R;

  var conta = function (obj, chave) {
    if (!chave) return;
    obj[chave] = (obj[chave] || 0) + 1;
  };

  var registrarFalha = function (onde, e) {
    try {
      if (R.falhas.length < 20) R.falhas.push(onde + ': ' + (e && e.message ? e.message : 'erro'));
    } catch (x) {}
  };

  // ── addEventListener ─────────────────────────────────────────────────────
  // O patch mais importante: é o que revela que um <div> sem ARIA é um botão.
  // Guarda em WeakMap (não em atributo) para não sujar o HTML capturado.
  try {
    var origAdd = EventTarget.prototype.addEventListener;
    var totalListeners = 0;
    EventTarget.prototype.addEventListener = function (type, listener, options) {
      try {
        if (
          totalListeners < TETO_LISTENERS &&
          typeof type === 'string' &&
          INTERESSE[type] &&
          this &&
          this.nodeType === 1
        ) {
          totalListeners++;
          conta(R.listenersPorTipo, type);
          var reg = R.listeners.get(this);
          if (!reg) {
            reg = { tipos: [], passive: false, capture: false, once: false };
            R.listeners.set(this, reg);
            if (R.comListener.length < TETO_REGISTROS) R.comListener.push(this);
          }
          if (reg.tipos.indexOf(type) === -1) reg.tipos.push(type);
          if (options && typeof options === 'object') {
            if (options.passive) reg.passive = true;
            if (options.capture) reg.capture = true;
            if (options.once) reg.once = true;
          } else if (options === true) {
            reg.capture = true;
          }
        } else if (totalListeners < TETO_LISTENERS && typeof type === 'string' && INTERESSE[type]) {
          // Listener em window/document: conta, sem elemento associado. É o que
          // denuncia scroll/pointer globais (parallax de mouse, smooth scroll).
          totalListeners++;
          conta(R.listenersPorTipo, type);
        }
      } catch (e) {
        registrarFalha('addEventListener', e);
      }
      return origAdd.call(this, type, listener, options);
    };
  } catch (e) {
    registrarFalha('patch:addEventListener', e);
  }

  // ── Observers ────────────────────────────────────────────────────────────
  // IntersectionObserver é o mecanismo de reveal por scroll mais comum; saber
  // QUAIS elementos ele observa é o que permite dizer "este bloco aparece ao
  // entrar na viewport" sem depender do nome da classe.
  try {
    if (window.IntersectionObserver) {
      var IO = window.IntersectionObserver;
      var IOPatch = function (cb, opts) {
        R.observers.intersection++;
        var inst = new IO(cb, opts);
        var origObserve = inst.observe.bind(inst);
        inst.observe = function (el) {
          try {
            if (el && el.nodeType === 1) R.alvosIntersection.set(el, true);
          } catch (e) {}
          return origObserve(el);
        };
        return inst;
      };
      IOPatch.prototype = IO.prototype;
      window.IntersectionObserver = IOPatch;
    }
  } catch (e) {
    registrarFalha('patch:IntersectionObserver', e);
  }

  try {
    if (window.ResizeObserver) {
      var RO = window.ResizeObserver;
      var ROPatch = function (cb) {
        R.observers.resize++;
        return new RO(cb);
      };
      ROPatch.prototype = RO.prototype;
      window.ResizeObserver = ROPatch;
    }
  } catch (e) {
    registrarFalha('patch:ResizeObserver', e);
  }

  try {
    var MO = window.MutationObserver;
    if (MO) {
      var MOPatch = function (cb) {
        R.observers.mutation++;
        return new MO(cb);
      };
      MOPatch.prototype = MO.prototype;
      window.MutationObserver = MOPatch;
    }
  } catch (e) {
    registrarFalha('patch:MutationObserver', e);
  }

  // ── Contexto gráfico ─────────────────────────────────────────────────────
  // A pergunta que decide entre "card preto" e "cápsula de runtime": este canvas
  // é 2D ou WebGL? Só quem pede o contexto sabe, e ele pede antes de desenhar.
  try {
    var origGetContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (tipo, attrs) {
      try {
        var t = String(tipo || '').toLowerCase();
        var normal =
          t === 'webgl' || t === 'experimental-webgl'
            ? 'webgl'
            : t === 'webgl2'
              ? 'webgl2'
              : t === '2d'
                ? '2d'
                : t === 'bitmaprenderer'
                  ? 'bitmaprenderer'
                  : t;
        var anterior = R.contextos.get(this);
        if (!anterior) {
          R.contextos.set(this, normal);
          if (R.canvases.length < 200) R.canvases.push(this);
          conta(R.contextosPorTipo, normal);
        }
      } catch (e) {
        registrarFalha('getContext', e);
      }
      return origGetContext.call(this, tipo, attrs);
    };
  } catch (e) {
    registrarFalha('patch:getContext', e);
  }

  // ── Shadow DOM ───────────────────────────────────────────────────────────
  // O modo é o que importa: aberto dá para percorrer, fechado é limitação por
  // contrato do navegador e precisa aparecer como tal (não como bug).
  try {
    var origAttach = Element.prototype.attachShadow;
    Element.prototype.attachShadow = function (init) {
      var root = origAttach.call(this, init);
      try {
        if (init && init.mode === 'closed') {
          R.shadowRoots.closed++;
          if (R.shadowFechados.length < 200) R.shadowFechados.push(this);
        } else {
          R.shadowRoots.open++;
          if (R.shadowHosts.length < 400) R.shadowHosts.push(this);
        }
      } catch (e) {
        registrarFalha('attachShadow', e);
      }
      return root;
    };
  } catch (e) {
    registrarFalha('patch:attachShadow', e);
  }

  // ── Web Animations ───────────────────────────────────────────────────────
  try {
    if (Element.prototype.animate) {
      var origAnimate = Element.prototype.animate;
      Element.prototype.animate = function (keyframes, opts) {
        try {
          conta(R.animationApis, 'Element.animate');
        } catch (e) {}
        return origAnimate.call(this, keyframes, opts);
      };
    }
    if (document.getAnimations) {
      var origGetAnimations = document.getAnimations.bind(document);
      document.getAnimations = function () {
        try {
          conta(R.animationApis, 'document.getAnimations');
        } catch (e) {}
        return origGetAnimations();
      };
    }
  } catch (e) {
    registrarFalha('patch:animations', e);
  }

  // ── requestAnimationFrame ────────────────────────────────────────────────
  // Um loop de rAF é a assinatura de canvas/WebGL/física em execução. A ORIGEM
  // (arquivo que chamou) atribui o loop ao runtime certo no STACK.
  try {
    var origRaf = window.requestAnimationFrame;
    if (origRaf) {
      window.requestAnimationFrame = function (cb) {
        try {
          R.rafCount++;
          if (R.rafCount < 400) {
            var linhas = (new Error().stack || '').split('\\n');
            for (var j = 1; j < linhas.length && j < 5; j++) {
              var m = /(https?:\\/\\/[^\\s):]+)/.exec(linhas[j]);
              if (m) {
                conta(R.rafOrigens, sanitizar(m[1]));
                break;
              }
            }
          }
        } catch (e) {}
        return origRaf.call(window, cb);
      };
    }
  } catch (e) {
    registrarFalha('patch:rAF', e);
  }

  // ── Inserção dinâmica de mídia ───────────────────────────────────────────
  // Um MutationObserver PRÓPRIO (criado antes do patch de contagem, para não se
  // contar) pega o vídeo/iframe/SVG que o site injeta depois — exatamente o que
  // um único snapshot do DOM inicial perdia.
  try {
    var INTERESSANTES = { VIDEO: 1, IFRAME: 1, CANVAS: 1, SVG: 1, IMG: 1, PICTURE: 1, AUDIO: 1 };
    var moNativo = MO || window.MutationObserver;
    if (moNativo) {
      var obs = new moNativo(function (muts) {
        try {
          for (var k = 0; k < muts.length; k++) {
            var add = muts[k].addedNodes;
            for (var n = 0; n < add.length; n++) {
              var no = add[n];
              if (!no || no.nodeType !== 1) continue;
              var tag = no.tagName;
              if (INTERESSANTES[tag]) {
                conta(R.dynamicInserts, tag.toLowerCase());
                if (R.midiaDinamica.length < 300) {
                  R.midiaDinamica.push({ el: no, at: Date.now() - R.t0 });
                }
              }
              if (no.querySelectorAll) {
                var dentro = no.querySelectorAll('video,iframe,canvas,svg,audio');
                for (var q = 0; q < dentro.length && q < 20; q++) {
                  conta(R.dynamicInserts, dentro[q].tagName.toLowerCase());
                  if (R.midiaDinamica.length < 300) {
                    R.midiaDinamica.push({ el: dentro[q], at: Date.now() - R.t0 });
                  }
                }
              }
            }
          }
        } catch (e) {
          registrarFalha('mutationObserver', e);
        }
      });
      var iniciar = function () {
        try {
          obs.observe(document.documentElement || document, { childList: true, subtree: true });
        } catch (e) {
          registrarFalha('observe', e);
        }
      };
      if (document.documentElement) iniciar();
      else document.addEventListener('readystatechange', iniciar, { once: true });
    }
  } catch (e) {
    registrarFalha('patch:midiaDinamica', e);
  }

  // ── Animações CSS e transições ───────────────────────────────────────────
  // Escuta em captura, no documento: registra QUE animação rodou de fato, o que
  // é diferente de existir um @keyframes no CSS.
  try {
    var reg = function (mapa, chave) {
      return function (ev) {
        try {
          conta(mapa, ev[chave] || '?');
        } catch (e) {}
      };
    };
    origAdd.call(document, 'animationstart', reg(R.animacoesCss, 'animationName'), true);
    origAdd.call(document, 'transitionrun', reg(R.transicoes, 'propertyName'), true);
  } catch (e) {
    registrarFalha('patch:cssAnimacoes', e);
  }

  // ── History ──────────────────────────────────────────────────────────────
  try {
    var patchHist = function (nome) {
      var orig = history[nome];
      if (typeof orig !== 'function') return;
      history[nome] = function () {
        try {
          R.historyChanges++;
        } catch (e) {}
        return orig.apply(history, arguments);
      };
    };
    patchHist('pushState');
    patchHist('replaceState');
  } catch (e) {
    registrarFalha('patch:history', e);
  }

  // ── Barreiras: o que a instrumentação BLOQUEIA ───────────────────────────
  // Bloquear aqui (e não só no Playwright) fecha o caso do script que abre popup
  // ou dispara download por conta própria, sem clique nosso.
  var barrar = function (motivo, alvo) {
    try {
      if (R.bloqueados.length < 200) R.bloqueados.push({ motivo: motivo, alvo: String(alvo || '').slice(0, 120) });
    } catch (e) {}
  };

  try {
    var origOpen = window.open;
    window.open = function (u) {
      barrar('popup', sanitizar(u));
      return null;
    };
  } catch (e) {
    registrarFalha('patch:open', e);
  }

  try {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition = function () {
        barrar('geolocalizacao', 'getCurrentPosition');
      };
      navigator.geolocation.watchPosition = function () {
        barrar('geolocalizacao', 'watchPosition');
        return 0;
      };
    }
  } catch (e) {
    registrarFalha('patch:geo', e);
  }

  try {
    if (navigator.mediaDevices) {
      navigator.mediaDevices.getUserMedia = function () {
        barrar('camera', 'getUserMedia');
        return Promise.reject(new Error('bloqueado pela captura'));
      };
    }
  } catch (e) {
    registrarFalha('patch:media', e);
  }

  try {
    if (window.Notification && Notification.requestPermission) {
      Notification.requestPermission = function () {
        barrar('permissao', 'Notification');
        return Promise.resolve('denied');
      };
    }
  } catch (e) {
    registrarFalha('patch:notification', e);
  }

  try {
    if (navigator.clipboard) {
      navigator.clipboard.writeText = function () {
        barrar('clipboard', 'writeText');
        return Promise.resolve();
      };
      navigator.clipboard.readText = function () {
        barrar('clipboard', 'readText');
        return Promise.resolve('');
      };
    }
  } catch (e) {
    registrarFalha('patch:clipboard', e);
  }

  // Submit: barrado no documento, em captura, sem depender de clique nosso.
  // Um form que envia leva a página embora e a exploração acaba ali.
  try {
    origAdd.call(
      document,
      'submit',
      function (ev) {
        try {
          var f = ev.target;
          barrar('submit', f && f.getAttribute ? sanitizar(f.getAttribute('action') || '') : '');
          ev.preventDefault();
          ev.stopPropagation();
        } catch (e) {}
      },
      true,
    );
  } catch (e) {
    registrarFalha('patch:submit', e);
  }

  // beforeunload: registra a tentativa de sair. Não impede (o Playwright já
  // barra a navegação), mas explica por que um estado não foi restaurado.
  try {
    origAdd.call(
      window,
      'beforeunload',
      function () {
        barrar('navegacao-externa', 'beforeunload');
      },
      true,
    );
  } catch (e) {
    registrarFalha('patch:beforeunload', e);
  }
})();
`;

/**
 * Remove a marcação de instrumentação de um HTML capturado.
 *
 * Diferente do V1, só há UM atributo a remover (`data-dsx2`), porque os
 * listeners vivem num WeakMap em vez de num atributo por elemento. O HTML sai
 * mais próximo do original.
 */
export const limparInstrumentacao = (html: string): string =>
  html.replace(new RegExp(`\\s*${ATTR_REF}="[^"]*"`, 'gi'), '');

/** Monta uma chamada string-serializável, como no V1: `(FN)(argJson)`. */
export const chamar = (fonte: string, ...args: unknown[]): string =>
  args.length === 0
    ? `(${fonte})()`
    : `(${fonte})(${args.map((a) => JSON.stringify(a)).join(',')})`;
