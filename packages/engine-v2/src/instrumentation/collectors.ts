import { ATTR_REF, REGISTRO_GLOBAL } from './init-script.js';

/**
 * Coletores in-page — o que roda via `evaluate` depois que a página carregou.
 *
 * Uma decisão de projeto vale explicar: **um único percurso do DOM produz o mapa
 * estrutural, as camadas visuais, os backgrounds e as mídias juntos**. O caro
 * aqui é `getComputedStyle` + `getBoundingClientRect` (cada um força layout);
 * fazer quatro percursos multiplicaria por quatro o custo em cima da parte mais
 * pesada. Então o percurso é um, e a saída é quádrupla.
 *
 * O contraste com o V1 é o ponto: lá o coletor descartava tudo que não fosse
 * clicável (`if (!interativo) continue`), então backgrounds, canvases, vídeos e
 * seções inteiras nunca chegavam ao Node. Aqui o critério de emissão é
 * "contribui para a composição" — o que inclui, de propósito, o que não tem
 * texto nem é clicável.
 *
 * Tudo aqui é string por dois motivos: não deve ser typechecado contra o `lib` de
 * Node, e é injetado como texto. Sem template literal dentro do código injetado,
 * para não brigar com a interpolação do TypeScript.
 */

/** Tags que nunca são pintadas e não entram em mapa nenhum. */
const TAGS_IGNORADAS = [
  'script',
  'style',
  'meta',
  'link',
  'head',
  'title',
  'noscript',
  'template',
  'base',
];

/**
 * Percurso principal. Devolve nós crus (sem hash — o hash nasce no Node, para a
 * lógica de identidade viver num só lugar, testável).
 *
 * Assinatura: `(opts) => Coleta`.
 */
export const COLETAR_MAPA_FN = `
(opts) => {
  var IGNORADAS = ${JSON.stringify(TAGS_IGNORADAS)};
  var ignorada = Object.create(null);
  for (var z = 0; z < IGNORADAS.length; z++) ignorada[IGNORADAS[z]] = true;

  var R = window['${REGISTRO_GLOBAL}'] || {};
  var MAX = opts && opts.maxNos ? opts.maxNos : 3000;
  var vw = window.innerWidth || 1;
  var vh = window.innerHeight || 1;
  var areaViewport = vw * vh;
  var scrollX = window.scrollX || 0;
  var scrollY = window.scrollY || 0;
  var docH = Math.max(
    document.documentElement ? document.documentElement.scrollHeight : 0,
    document.body ? document.body.scrollHeight : 0,
    vh
  );

  var sanitizar = function (u) {
    try {
      if (typeof u !== 'string' || !u) return '';
      if (u.indexOf('data:') === 0) return 'data:' + u.slice(5, 24) + '…';
      if (u.indexOf('blob:') === 0) return 'blob:…';
      var url = new URL(u, location.href);
      url.search = ''; url.hash = ''; url.username = ''; url.password = '';
      return url.href;
    } catch (e) { return ''; }
  };

  /** Extrai as URLs de um valor CSS que pode ter várias camadas. */
  var urlsDe = function (valor) {
    var out = [];
    if (!valor || valor === 'none') return out;
    var re = /url\\((['"]?)([^'")]+)\\1\\)/g;
    var m;
    while ((m = re.exec(valor)) !== null) {
      var s = sanitizar(m[2]);
      if (s && out.indexOf(s) === -1) out.push(s);
    }
    return out;
  };

  /** Um valor de background que PINTA algo (cor transparente não conta). */
  var pintaFundo = function (cs) {
    var cor = cs.backgroundColor || '';
    var temCor = cor && cor !== 'transparent' && cor !== 'rgba(0, 0, 0, 0)';
    var img = cs.backgroundImage || 'none';
    return { temCor: !!temCor, cor: cor, img: img !== 'none' ? img : '' };
  };

  /**
   * Este elemento cria contexto de empilhamento? A lista segue a especificação:
   * é o que decide quem cobre quem, e é o que o V1 nunca consultou (por isso um
   * overlay podia ir para a seção errada).
   */
  var criaContexto = function (cs, el) {
    if (cs.position === 'fixed' || cs.position === 'sticky') return true;
    if (cs.position !== 'static' && cs.zIndex !== 'auto') return true;
    if (parseFloat(cs.opacity) < 1) return true;
    if (cs.transform && cs.transform !== 'none') return true;
    if (cs.filter && cs.filter !== 'none') return true;
    if (cs.backdropFilter && cs.backdropFilter !== 'none') return true;
    if (cs.mixBlendMode && cs.mixBlendMode !== 'normal') return true;
    if (cs.isolation === 'isolate') return true;
    if (cs.perspective && cs.perspective !== 'none') return true;
    if (cs.clipPath && cs.clipPath !== 'none') return true;
    if (cs.mask && cs.mask !== 'none' && cs.mask !== 'match-source') return true;
    if (cs.contain && /paint|layout|strict|content/.test(cs.contain)) return true;
    if (cs.willChange && /transform|opacity|filter/.test(cs.willChange)) return true;
    try { if (el.parentElement) { var p = getComputedStyle(el.parentElement); if (p.display === 'flex' || p.display === 'grid') { if (cs.zIndex !== 'auto') return true; } } } catch (e) {}
    return false;
  };

  /** Papel estrutural — semântica primeiro, mídia depois, geometria por último. */
  var papelDe = function (el, tag, cs, rect, temTexto) {
    if (tag === 'header') return 'header';
    if (tag === 'nav') return 'nav';
    if (tag === 'main') return 'main';
    if (tag === 'footer') return 'footer';
    if (tag === 'aside') return 'aside';
    if (tag === 'article') return 'article';
    if (tag === 'form') return 'form';
    if (tag === 'section') return 'section';
    if (tag === 'ul' || tag === 'ol' || tag === 'dl') return 'list';
    if (tag === 'li' || tag === 'dt' || tag === 'dd') return 'listitem';
    if (tag === 'canvas') return 'canvas';
    if (tag === 'video') return 'video';
    if (tag === 'svg') return 'svg';
    if (tag === 'iframe') return 'iframe';
    if (tag === 'img' || tag === 'picture') return 'image';
    if (tag === 'button') return 'button';
    if (tag === 'a') return 'link';
    if (/^h[1-6]$/.test(tag)) return 'heading';
    var role = el.getAttribute('role');
    if (role === 'banner') return 'header';
    if (role === 'navigation') return 'nav';
    if (role === 'main') return 'main';
    if (role === 'contentinfo') return 'footer';
    if (role === 'region') return 'section';
    if (role === 'button') return 'button';
    if (role === 'link') return 'link';
    if (role === 'list') return 'list';
    if (role === 'listitem') return 'listitem';
    if (role === 'article') return 'article';
    if (el.shadowRoot) return 'shadow-host';
    // Geometria: faixa de largura quase total e altura relevante é seção, mesmo
    // sendo <div>. É o caso mais comum em site moderno (nada é <section>).
    //
    // MAS só no fluxo. Uma camada \`position:absolute; inset:0\` cobre a seção
    // inteira e tem exatamente a mesma geometria dela — promovê-la a "seção" faz
    // o fundo virar um segmento próprio, sem texto e sem nome, que é o "Bloco"
    // vazio da Galeria. Fora do fluxo e sem texto é CAMADA, não seção.
    var noFluxo = cs.position === 'static' || cs.position === 'relative' || cs.position === 'sticky';
    var larguraCheia = rect.width >= vw * 0.9;
    if (noFluxo && larguraCheia && rect.height >= vh * 0.25) return 'section';
    if (noFluxo && larguraCheia && rect.height >= 60 && temTexto) return 'section';
    // Card: caixa com borda/sombra/fundo próprio e conteúdo dentro.
    var temMoldura =
      (cs.borderRadius && cs.borderRadius !== '0px') ||
      (cs.boxShadow && cs.boxShadow !== 'none') ||
      (cs.borderStyle && cs.borderStyle !== 'none');
    if (temMoldura && temTexto && rect.width < vw * 0.7 && rect.height >= 60) return 'card';
    if (temTexto) return 'text';
    if (rect.width >= 8 && rect.height >= 8) return 'decoration';
    return 'unknown';
  };

  /** Papel da CAMADA — o que ela faz na composição visual da seção. */
  var papelDaCamada = function (tag, cs, rect, fundo, temTexto, temMidia, zNum) {
    if (cs.position === 'fixed') return 'fixed';
    if (cs.position === 'sticky') return 'sticky';
    // Mídia fora do fluxo que cobre a área é FUNDO, não conteúdo: é o vídeo de
    // fundo com \`object-fit:cover\` atrás do texto do CTA. Chamá-lo de "media"
    // fazia \`asBackground\` sair falso e o nome perder o "de fundo".
    if (temMidia) {
      var foraDoFluxoMidia = cs.position === 'absolute';
      var cobreMidia = rect.width >= vw * 0.6 && rect.height >= vh * 0.3;
      if (foraDoFluxoMidia && cobreMidia && zNum <= 0) return 'background';
      return 'media';
    }
    // Cobre área e está atrás (z negativo, ou primeiro filho absoluto sem texto).
    var cobre = rect.width >= vw * 0.6 && rect.height >= vh * 0.3;
    var foraDoFluxo = cs.position === 'absolute';
    if (foraDoFluxo && cobre && !temTexto) {
      // Véu de leitura: fundo semitransparente ou gradiente por cima.
      var semi = /rgba\\(/.test(cs.backgroundColor || '') && parseFloat(cs.opacity) <= 1;
      var gradiente = /gradient/.test(fundo.img);
      if (zNum > 0 && (semi || gradiente)) return 'overlay';
      return 'background';
    }
    if (foraDoFluxo && !temTexto && !temMidia) return 'decoration';
    if ((fundo.temCor || fundo.img) && cobre && !temTexto) return 'background';
    if (temTexto) return 'content';
    return 'decoration';
  };

  /** Assinatura estrutural: cadeia de tags dos filhos diretos (limitada). */
  var assinatura = function (el) {
    var out = [];
    var c = el.children;
    for (var i = 0; i < c.length && i < 12; i++) out.push(c[i].tagName.toLowerCase());
    return out.join(',');
  };

  /** Índice entre irmãos do MESMO tipo — mais estável que nth-child. */
  var indiceEntreIguais = function (el) {
    var p = el.parentElement;
    if (!p) return 0;
    var n = 0;
    var c = p.children;
    for (var i = 0; i < c.length; i++) {
      if (c[i] === el) return n;
      if (c[i].tagName === el.tagName) n++;
    }
    return n;
  };

  var SEMANTICAS = { SECTION:1, ARTICLE:1, HEADER:1, FOOTER:1, NAV:1, MAIN:1, ASIDE:1, FORM:1 };
  var ancestralSemantico = function (el) {
    var n = el.parentElement;
    var hops = 0;
    while (n && hops < 24) {
      if (SEMANTICAS[n.tagName]) return n.tagName.toLowerCase();
      n = n.parentElement;
      hops++;
    }
    return null;
  };

  /** Texto próprio (sem descendentes), aparado. */
  var textoProprio = function (el) {
    var s = '';
    var c = el.childNodes;
    for (var i = 0; i < c.length; i++) {
      if (c[i].nodeType === 3) s += c[i].nodeValue || '';
    }
    return s.replace(/\\s+/g, ' ').trim();
  };

  /**
   * Atributos ARIA e data-*. Nunca lê \`value\`: um campo contribui com o TIPO,
   * jamais com o que foi digitado.
   */
  var atributosDe = function (el) {
    var aria = {};
    var data = {};
    var attrs = el.attributes;
    for (var i = 0; i < attrs.length; i++) {
      var nome = attrs[i].name;
      if (nome === 'value') continue;
      if (nome === '${ATTR_REF}') continue;
      var val = attrs[i].value;
      if (val && val.length > 200) val = '';
      if (nome.indexOf('aria-') === 0 || nome === 'role') aria[nome] = val;
      else if (nome.indexOf('data-') === 0) data[nome] = val;
    }
    return { aria: aria, data: data };
  };

  /** Pseudo-elementos que pintam algo. */
  var pseudosDe = function (el) {
    var out = [];
    var detalhes = [];
    var nomes = ['::before', '::after'];
    for (var i = 0; i < nomes.length; i++) {
      try {
        var pcs = getComputedStyle(el, nomes[i]);
        if (!pcs) continue;
        var content = pcs.content;
        if (!content || content === 'none' || content === 'normal') {
          // Sem content, o pseudo não existe — nem que tenha background.
          continue;
        }
        var pf = pintaFundo(pcs);
        var temGeometria =
          (pcs.width && pcs.width !== 'auto' && pcs.width !== '0px') ||
          (pcs.height && pcs.height !== 'auto' && pcs.height !== '0px');
        var pinta = pf.temCor || pf.img || (pcs.borderStyle && pcs.borderStyle !== 'none');
        if (!pinta && !temGeometria && content === '""') continue;
        var chave = nomes[i] === '::before' ? 'before' : 'after';
        out.push(chave);
        detalhes.push({
          pseudo: chave,
          content: String(content).slice(0, 40),
          cor: pf.cor,
          img: pf.img.slice(0, 400),
          urls: urlsDe(pf.img),
          position: pcs.position,
          inset: [pcs.top, pcs.right, pcs.bottom, pcs.left].join(' '),
          transform: pcs.transform,
          animation: pcs.animationName,
          mask: pcs.maskImage || pcs.webkitMaskImage || 'none',
          filter: pcs.filter,
          zIndex: pcs.zIndex
        });
      } catch (e) {}
    }
    return { pseudo: out, detalhes: detalhes };
  };

  /** Variáveis CSS citadas num valor, já resolvidas contra o elemento. */
  var variaveisDe = function (el, cs, valores) {
    var out = {};
    var re = /var\\(\\s*(--[\\w-]+)/g;
    for (var i = 0; i < valores.length; i++) {
      var v = valores[i];
      if (!v) continue;
      var m;
      re.lastIndex = 0;
      while ((m = re.exec(v)) !== null) {
        try {
          var resolvido = cs.getPropertyValue(m[1]);
          if (resolvido) out[m[1]] = resolvido.trim().slice(0, 200);
        } catch (e) {}
      }
    }
    return out;
  };

  // ── Percurso ─────────────────────────────────────────────────────────────
  var nos = [];
  var refs = [];
  var backgrounds = [];
  var midias = [];
  var idx = 0;

  /** Enfileira os realms a percorrer: documento, shadow roots abertos, iframes. */
  var raizes = [{ raiz: document.documentElement || document.body, realm: 'document', host: null }];
  try {
    var hosts = R.shadowHosts || [];
    for (var h = 0; h < hosts.length && h < 200; h++) {
      if (hosts[h] && hosts[h].shadowRoot) {
        raizes.push({ raiz: hosts[h].shadowRoot, realm: 'shadow-open', host: hosts[h] });
      }
    }
  } catch (e) {}

  var visitar = function (raiz, realm) {
    if (!raiz) return;
    var lista;
    try {
      lista = raiz.querySelectorAll ? raiz.querySelectorAll('*') : [];
    } catch (e) { return; }
    for (var i = 0; i < lista.length; i++) {
      if (nos.length >= MAX) break;
      var el = lista[i];
      var tag = el.tagName ? el.tagName.toLowerCase() : '';
      if (!tag || ignorada[tag]) continue;

      var cs;
      try { cs = getComputedStyle(el); } catch (e) { continue; }
      if (!cs) continue;
      // display:none nunca pinta. visibility:hidden ocupa espaço, mas também não
      // pinta — e overlay oculto que aparece por interação é descoberto pelo grafo
      // de estados, não aqui.
      if (cs.display === 'none') continue;

      var rect;
      try { rect = el.getBoundingClientRect(); } catch (e) { continue; }

      var proprio = textoProprio(el);
      var textoSub = (el.textContent || '').replace(/\\s+/g, ' ').trim();
      var temTexto = textoSub.length > 0;
      var fundo = pintaFundo(cs);
      var mask = cs.maskImage || cs.webkitMaskImage || 'none';
      var borderImage = cs.borderImageSource || 'none';
      var ps = pseudosDe(el);
      var temMidiaTag = tag === 'video' || tag === 'canvas' || tag === 'img' || tag === 'picture' || tag === 'iframe' || tag === 'svg' || tag === 'audio';

      // Critério de emissão: contribui para a composição. Inclui de propósito o
      // que não tem texto e não é clicável — foi essa exclusão que fez o V1
      // perder backgrounds, canvases e seções inteiras.
      var area = Math.max(0, rect.width) * Math.max(0, rect.height);
      var areaShare = areaViewport > 0 ? Math.min(1, area / areaViewport) : 0;
      var temListener = false;
      try { temListener = !!(R.listeners && R.listeners.get(el)); } catch (e) {}
      var contexto = criaContexto(cs, el);
      var interessa =
        temMidiaTag ||
        fundo.temCor || !!fundo.img ||
        mask !== 'none' || borderImage !== 'none' ||
        ps.pseudo.length > 0 ||
        proprio.length > 0 ||
        temListener ||
        contexto ||
        SEMANTICAS[el.tagName] === 1 ||
        /^h[1-6]$/.test(tag) || tag === 'button' || tag === 'a' || tag === 'input' ||
        tag === 'select' || tag === 'textarea' || tag === 'summary' || tag === 'details' ||
        el.getAttribute('role') !== null ||
        areaShare >= 0.02 ||
        !!el.shadowRoot;
      if (!interessa) continue;

      el.setAttribute('${ATTR_REF}', String(idx));
      refs.push(el);

      var attrs = atributosDe(el);
      var classes = (el.getAttribute('class') || '').split(/\\s+/).filter(Boolean);
      var zNum = cs.zIndex === 'auto' ? 0 : (parseInt(cs.zIndex, 10) || 0);
      var visivel =
        cs.visibility !== 'hidden' &&
        parseFloat(cs.opacity) > 0.01 &&
        rect.width > 0 && rect.height > 0;

      var papel = papelDe(el, tag, cs, rect, temTexto);
      var camada = papelDaCamada(tag, cs, rect, fundo, temTexto, temMidiaTag, zNum);

      var midiaTags = [];
      try {
        var dentro = el.querySelectorAll('video,canvas,img,picture,iframe,svg,audio');
        for (var d = 0; d < dentro.length && d < 12; d++) {
          var t = dentro[d].tagName.toLowerCase();
          if (midiaTags.indexOf(t) === -1) midiaTags.push(t);
        }
      } catch (e) {}

      nos.push({
        ref: idx,
        realm: realm,
        parentRef: null, // resolvido abaixo, por ref do ancestral
        tag: tag,
        role: el.getAttribute('role'),
        aria: attrs.aria,
        dataAttrs: attrs.data,
        id: el.getAttribute('id') || null,
        classes: classes,
        text: textoSub.slice(0, 120),
        ownText: proprio.slice(0, 200),
        subtreeTextLength: textoSub.length,
        semanticAncestor: ancestralSemantico(el),
        siblingIndex: indiceEntreIguais(el),
        structuralSignature: assinatura(el),
        // Campos de SEGURANÇA. Sem eles a política do V1 (\`navegaParaFora\`,
        // \`ehCampoSensivel\`) não tem o que avaliar, e um link para outro domínio
        // ou um <input type=file> passaria como clicável. NÃO sanitizamos o href
        // aqui: a decisão de mesma-origem precisa da URL como está no DOM.
        href: el.getAttribute ? el.getAttribute('href') : null,
        tipo: el.getAttribute ? el.getAttribute('type') : null,
        tabindex: el.getAttribute && el.getAttribute('tabindex') !== null ? Number(el.getAttribute('tabindex')) : null,
        download: el.hasAttribute ? el.hasAttribute('download') : false,
        targetBlank: el.getAttribute ? el.getAttribute('target') === '_blank' : false,
        desabilitado: (el.hasAttribute && el.hasAttribute('disabled')) || el.getAttribute('aria-disabled') === 'true',
        papel: papel,
        camada: camada,
        visivel: visivel,
        areaShare: areaShare,
        box: { x: rect.x, y: rect.y, w: rect.width, h: rect.height },
        pageBox: { x: rect.x + scrollX, y: rect.y + scrollY, w: rect.width, h: rect.height },
        normalizedBox: { x: rect.x / vw, y: rect.y / vh, w: rect.width / vw, h: rect.height / vh },
        midiaTags: midiaTags,
        listeners: (function () { try { var r = R.listeners && R.listeners.get(el); return r ? r.tipos.slice(0, 12) : []; } catch (e) { return []; } })(),
        cursor: cs.cursor,
        observadoPorIntersection: (function () { try { return !!(R.alvosIntersection && R.alvosIntersection.get(el)); } catch (e) { return false; } })(),
        temShadow: !!el.shadowRoot,
        stacking: {
          zIndex: cs.zIndex,
          createsContext: contexto,
          position: cs.position,
          opacity: parseFloat(cs.opacity) || 0,
          transform: cs.transform,
          filter: cs.filter,
          backdropFilter: cs.backdropFilter || 'none',
          mixBlendMode: cs.mixBlendMode || 'normal',
          isolation: cs.isolation || 'auto',
          mask: mask,
          clipPath: cs.clipPath || 'none',
          overflow: cs.overflow,
          pointerEvents: cs.pointerEvents
        },
        pseudo: ps.pseudo,
        animationName: cs.animationName,
        animationDuration: cs.animationDuration,
        transitionProperty: cs.transitionProperty,
        transitionDuration: cs.transitionDuration
      });

      // ── Backgrounds deste elemento ──────────────────────────────────────
      var camadasFundo = [];
      if (fundo.temCor) {
        camadasFundo.push({ source: 'css-color', valor: fundo.cor, urls: [] });
      }
      if (fundo.img) {
        var partes = fundo.img.split(/,(?![^(]*\\))/);
        var temGradiente = /gradient\\(/.test(fundo.img);
        var urls = urlsDe(fundo.img);
        var src =
          partes.length > 1 ? 'css-multiple'
          : /image-set\\(/.test(fundo.img) ? 'css-image-set'
          : /cross-fade\\(/.test(fundo.img) ? 'css-cross-fade'
          : temGradiente ? 'css-gradient'
          : 'css-image';
        camadasFundo.push({ source: src, valor: fundo.img.slice(0, 600), urls: urls });
      }
      if (mask !== 'none') camadasFundo.push({ source: 'mask-image', valor: mask.slice(0, 400), urls: urlsDe(mask) });
      if (borderImage !== 'none') camadasFundo.push({ source: 'border-image', valor: borderImage.slice(0, 400), urls: urlsDe(borderImage) });
      for (var pd = 0; pd < ps.detalhes.length; pd++) {
        var det = ps.detalhes[pd];
        if (det.img || det.cor || det.mask !== 'none') {
          camadasFundo.push({
            source: det.pseudo === 'before' ? 'pseudo-before' : 'pseudo-after',
            valor: (det.img || det.cor || det.mask).slice(0, 400),
            urls: det.urls.concat(urlsDe(det.mask)),
            animation: det.animation
          });
        }
      }
      if (tag === 'video' && camada === 'background') camadasFundo.push({ source: 'video-element', valor: '', urls: [] });
      if (tag === 'canvas' && camada === 'background') camadasFundo.push({ source: 'canvas-element', valor: '', urls: [] });
      if (tag === 'img' && camada === 'background') camadasFundo.push({ source: 'img-element', valor: '', urls: [] });

      for (var cf = 0; cf < camadasFundo.length; cf++) {
        var c = camadasFundo[cf];
        var animacaoDoFundo = c.animation || cs.animationName;
        backgrounds.push({
          ref: idx,
          source: c.source,
          cssValue: c.valor,
          assetUrls: c.urls,
          variables: variaveisDe(el, cs, [fundo.img, fundo.cor, mask]),
          declaraAnimacao: !!(animacaoDoFundo && animacaoDoFundo !== 'none'),
          cobreSecao: rect.width >= vw * 0.8 && rect.height >= vh * 0.4,
          camada: camada,
          zIndex: cs.zIndex
        });
      }

      // ── Mídia deste elemento ────────────────────────────────────────────
      if (temMidiaTag) {
        var m = { ref: idx, tag: tag, asBackground: camada === 'background' };
        if (tag === 'video') {
          var fontes = [];
          try {
            var srcs = el.querySelectorAll('source');
            for (var s = 0; s < srcs.length && s < 8; s++) {
              var sv = sanitizar(srcs[s].getAttribute('src') || srcs[s].getAttribute('srcset') || '');
              if (sv) fontes.push(sv);
            }
          } catch (e) {}
          m.kind = 'video';
          m.src = sanitizar(el.currentSrc || el.getAttribute('src') || '');
          m.sources = fontes;
          m.poster = sanitizar(el.getAttribute('poster') || '');
          m.playback = {
            autoplay: el.hasAttribute('autoplay'),
            muted: !!el.muted,
            loop: !!el.loop,
            controls: !!el.controls,
            playsInline: el.hasAttribute('playsinline'),
            rate: el.playbackRate || 1,
            objectFit: cs.objectFit,
            objectPosition: cs.objectPosition
          };
          m.intrinsic = { width: el.videoWidth || 0, height: el.videoHeight || 0 };
          m.readyState = el.readyState;
          m.paused = !!el.paused;
        } else if (tag === 'canvas') {
          var ctx = '';
          try { ctx = (R.contextos && R.contextos.get(el)) || ''; } catch (e) {}
          m.kind = ctx === 'webgl' ? 'webgl' : ctx === 'webgl2' ? 'webgl2' : ctx === '2d' ? 'canvas-2d' : 'canvas-2d';
          m.contextoDetectado = ctx;
          m.intrinsic = { width: el.width || 0, height: el.height || 0 };
        } else if (tag === 'img' || tag === 'picture') {
          var alvo = tag === 'picture' ? (el.querySelector('img') || el) : el;
          var href = sanitizar(alvo.currentSrc || alvo.getAttribute('src') || '');
          var ext = (href.split('?')[0].split('#')[0].match(/\\.([a-z0-9]+)$/i) || [])[1] || '';
          m.kind = ext === 'gif' ? 'gif' : ext === 'webp' ? 'webp-animado' : ext === 'avif' ? 'avif-animado' : ext === 'apng' ? 'apng' : ext === 'svg' ? 'svg-estatico' : 'imagem';
          m.src = href;
          m.formatoPorExtensao = ext;
          var ss = [];
          try {
            var cands = el.querySelectorAll ? el.querySelectorAll('source') : [];
            for (var q = 0; q < cands.length && q < 8; q++) {
              var sv2 = sanitizar(cands[q].getAttribute('srcset') || cands[q].getAttribute('src') || '');
              if (sv2) ss.push(sv2);
            }
          } catch (e) {}
          m.sources = ss;
          m.intrinsic = { width: alvo.naturalWidth || 0, height: alvo.naturalHeight || 0 };
        } else if (tag === 'svg') {
          var temSmil = false;
          try { temSmil = !!el.querySelector('animate,animateTransform,animateMotion,set'); } catch (e) {}
          m.kind = temSmil ? 'svg-animado' : 'svg-estatico';
          m.temSmil = temSmil;
          m.markupBytes = (el.outerHTML || '').length;
        } else if (tag === 'iframe') {
          var iurl = sanitizar(el.getAttribute('src') || '');
          var mesmaOrigem = false;
          try { mesmaOrigem = !!el.contentDocument; } catch (e) { mesmaOrigem = false; }
          m.kind = 'iframe';
          m.src = iurl;
          m.mesmaOrigem = mesmaOrigem;
        } else if (tag === 'audio') {
          m.kind = 'audio';
          m.src = sanitizar(el.getAttribute('src') || '');
        }
        midias.push(m);
      }

      // O endereço do PRÓXIMO nó. Sem este incremento, todo elemento recebe
      // \`data-dsx2="0"\`, o mapa ref→nó colapsa num único par e a busca de HTML
      // por ref devolve sempre o mesmo elemento.
      idx++;
    }
  };

  for (var r = 0; r < raizes.length; r++) visitar(raizes[r].raiz, raizes[r].realm);

  // Resolve o pai de cada nó pelo ref do ancestral mais próximo já marcado.
  for (var n = 0; n < nos.length; n++) {
    var el2 = refs[nos[n].ref];
    var p = el2 ? el2.parentElement : null;
    var hops = 0;
    while (p && hops < 60) {
      var pr = p.getAttribute ? p.getAttribute('${ATTR_REF}') : null;
      if (pr !== null) { nos[n].parentRef = parseInt(pr, 10); break; }
      p = p.parentElement;
      hops++;
    }
  }
  // Profundidade a partir do encadeamento de pais.
  var porRef = Object.create(null);
  for (var i2 = 0; i2 < nos.length; i2++) porRef[nos[i2].ref] = nos[i2];
  for (var i3 = 0; i3 < nos.length; i3++) {
    var d2 = 0;
    var cur = nos[i3];
    var guard = 0;
    while (cur && cur.parentRef !== null && guard < 80) { d2++; cur = porRef[cur.parentRef]; guard++; }
    nos[i3].depth = d2;
  }

  // Guarda o array de endereçamento para as fases seguintes.
  try { R.els = refs; } catch (e) {}

  return {
    nos: nos,
    backgrounds: backgrounds,
    midias: midias,
    viewport: { width: vw, height: vh, deviceScaleFactor: window.devicePixelRatio || 1 },
    scroll: { x: scrollX, y: scrollY },
    pageHeight: docH,
    truncado: nos.length >= MAX
  };
}
`;

/**
 * Coleta o que a instrumentação acumulou + os sinais de runtime.
 *
 * A detecção de runtime é por EVIDÊNCIA: global exposto no `window`, `<script
 * src>` com o nome, contexto gráfico criado, API chamada. A regra do pedido é
 * "não invente tecnologias", então cada achado carrega de onde veio.
 *
 * Assinatura: `() => Instrumentacao`.
 */
export const COLETAR_INSTRUMENTACAO_FN = `
() => {
  var R = window['${REGISTRO_GLOBAL}'] || {};

  var sanitizar = function (u) {
    try {
      if (typeof u !== 'string' || !u) return '';
      var url = new URL(u, location.href);
      url.search = ''; url.hash = ''; url.username = ''; url.password = '';
      return url.href;
    } catch (e) { return ''; }
  };

  /**
   * Globais que denunciam biblioteca. A checagem é de EXISTÊNCIA no window — o
   * bundler pode ter renomeado tudo internamente, mas quem expõe global expõe
   * com o nome conhecido.
   */
  var GLOBAIS = [
    ['three', 'THREE'], ['three', '__THREE__'],
    ['pixi', 'PIXI'],
    ['gsap', 'gsap'], ['gsap', 'TweenMax'], ['gsap', 'TweenLite'],
    ['scrolltrigger', 'ScrollTrigger'],
    ['lottie', 'lottie'], ['lottie', 'bodymovin'],
    ['lenis', 'Lenis'],
    ['locomotive', 'LocomotiveScroll'],
    ['swiper', 'Swiper'],
    ['splide', 'Splide'],
    ['barba', 'barba'],
    ['matter', 'Matter'],
    ['p5', 'p5'],
    ['anime', 'anime'],
    ['aos', 'AOS'],
    ['framer-motion', 'FramerMotion']
  ];

  var runtimes = [];
  var vistos = Object.create(null);
  var registrar = function (kind, label, evidencia, version) {
    var chave = kind + '|' + label;
    if (vistos[chave]) {
      var atual = vistos[chave];
      if (atual.evidence.indexOf(evidencia) === -1) atual.evidence.push(evidencia);
      return;
    }
    var reg = { kind: kind, label: label, evidence: [evidencia], scripts: [], version: version || '' };
    vistos[chave] = reg;
    runtimes.push(reg);
  };

  for (var i = 0; i < GLOBAIS.length; i++) {
    var kind = GLOBAIS[i][0];
    var nome = GLOBAIS[i][1];
    try {
      var g = window[nome];
      if (g !== undefined && g !== null) {
        var ver = '';
        try {
          ver = (g.REVISION || g.VERSION || g.version || '') + '';
          if (ver.length > 20) ver = '';
        } catch (e) {}
        registrar(kind, nome, 'global window.' + nome, ver);
      }
    } catch (e) {}
  }

  // Scripts: nome do arquivo é evidência secundária (o global é mais forte).
  var PADROES = [
    ['three', /three(\\.min)?\\.(m?js)/i], ['three', /\\bthree\\b/i],
    ['pixi', /pixi/i],
    ['gsap', /gsap|TweenMax|TimelineMax/i],
    ['scrolltrigger', /scrolltrigger/i],
    ['lottie', /lottie|bodymovin|dotlottie/i],
    ['lenis', /lenis/i],
    ['locomotive', /locomotive-scroll/i],
    ['swiper', /swiper/i],
    ['embla', /embla/i],
    ['splide', /splide/i],
    ['barba', /barba/i],
    ['matter', /matter(\\.min)?\\.js/i],
    ['p5', /p5(\\.min)?\\.js/i],
    ['anime', /anime(\\.min)?\\.js/i],
    ['aos', /\\baos\\b/i],
    ['framer-motion', /framer-motion/i]
  ];
  var scripts = [];
  try {
    var tags = document.querySelectorAll('script[src]');
    for (var s = 0; s < tags.length && s < 200; s++) {
      var src = sanitizar(tags[s].getAttribute('src') || '');
      if (!src) continue;
      scripts.push(src);
      for (var p = 0; p < PADROES.length; p++) {
        if (PADROES[p][1].test(src)) registrar(PADROES[p][0], PADROES[p][0], 'script src ' + src);
      }
    }
  } catch (e) {}
  // Liga cada runtime aos scripts que casam com ele.
  for (var rr = 0; rr < runtimes.length; rr++) {
    for (var ss = 0; ss < scripts.length; ss++) {
      for (var pp = 0; pp < PADROES.length; pp++) {
        if (PADROES[pp][0] === runtimes[rr].kind && PADROES[pp][1].test(scripts[ss])) {
          if (runtimes[rr].scripts.indexOf(scripts[ss]) === -1) runtimes[rr].scripts.push(scripts[ss]);
        }
      }
    }
  }

  // Contexto gráfico criado é evidência DIRETA — mais forte que nome de arquivo.
  var ctxs = R.contextosPorTipo || {};
  if (ctxs['webgl'] || ctxs['webgl2']) {
    registrar(ctxs['webgl2'] ? 'webgl-cru' : 'webgl-cru', 'WebGL', 'contexto ' + (ctxs['webgl2'] ? 'webgl2' : 'webgl') + ' criado');
  }
  if (ctxs['2d']) registrar('canvas-2d', 'canvas 2D', 'contexto 2d criado');

  // Lottie sem global: elemento próprio ou JSON de animação carregado.
  try {
    if (document.querySelector('lottie-player,dotlottie-player,[data-animation-path],[data-lottie]')) {
      registrar('lottie', 'Lottie', 'elemento <lottie-player>/atributo de animação');
    }
  } catch (e) {}

  // Web Animations em uso de fato.
  var apis = [];
  try { for (var a in (R.animationApis || {})) apis.push(a); } catch (e) {}
  if (apis.length > 0) registrar('web-animations', 'Web Animations API', apis.join(', '));

  // Loop de rAF: atribui ao arquivo que o chamou.
  var rafOrigens = [];
  try {
    var ro = R.rafOrigens || {};
    for (var o in ro) rafOrigens.push({ url: o, chamadas: ro[o] });
    rafOrigens.sort(function (x, y) { return y.chamadas - x.chamadas; });
    rafOrigens = rafOrigens.slice(0, 10);
  } catch (e) {}

  var mapaSimples = function (m) {
    var out = {};
    try { for (var k in (m || {})) out[k] = m[k]; } catch (e) {}
    return out;
  };

  return {
    listenersPorTipo: mapaSimples(R.listenersPorTipo),
    observers: R.observers || { intersection: 0, mutation: 0, resize: 0 },
    animationApis: apis,
    graphicsContexts: mapaSimples(R.contextosPorTipo),
    shadowRoots: R.shadowRoots || { open: 0, closed: 0 },
    shadowFechados: (R.shadowFechados || []).length,
    dynamicInserts: mapaSimples(R.dynamicInserts),
    midiaDinamicaCount: (R.midiaDinamica || []).length,
    historyChanges: R.historyChanges || 0,
    rafCount: R.rafCount || 0,
    rafOrigens: rafOrigens,
    animacoesCss: mapaSimples(R.animacoesCss),
    transicoes: mapaSimples(R.transicoes),
    bloqueados: (R.bloqueados || []).slice(0, 100),
    falhas: (R.falhas || []).slice(0, 20),
    runtimes: runtimes,
    scripts: scripts.slice(0, 100)
  };
}
`;

/**
 * Assinatura do estado da PÁGINA — para o grafo de estados deduplicar e para a
 * restauração ser CONFERIDA em vez de presumida.
 *
 * O V1 comparava o snapshot de um elemento; aqui a assinatura cobre o documento
 * (classes do `<html>`/`<body>`, contagem de nós, overlays visíveis, foco, scroll)
 * porque abrir um modal muda o `<body>`, não o botão.
 *
 * Assinatura: `() => AssinaturaEstado`.
 */
export const ASSINATURA_ESTADO_FN = `
() => {
  var hash = function (s) {
    var h = 2166136261 ^ s.length;
    var lim = Math.min(s.length, 200000);
    for (var i = 0; i < lim; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return (h >>> 0).toString(16);
  };

  var overlaysVisiveis = [];
  try {
    var cand = document.querySelectorAll(
      '[role="dialog"],[aria-modal="true"],[data-state="open"],dialog[open],[class*="modal"],[class*="overlay"],[class*="drawer"],[class*="popover"],[class*="dropdown"],[class*="tooltip"],[class*="lightbox"]'
    );
    for (var i = 0; i < cand.length && overlaysVisiveis.length < 40; i++) {
      var o = cand[i];
      var tag = o.tagName.toLowerCase();
      if (tag === 'button' || tag === 'a' || tag === 'input' || tag === 'label') continue;
      var cs = getComputedStyle(o);
      if (cs.display === 'none' || cs.visibility === 'hidden' || parseFloat(cs.opacity) <= 0.01) continue;
      var r = o.getBoundingClientRect();
      if (r.width < 40 || r.height < 24) continue;
      overlaysVisiveis.push({
        ref: o.getAttribute('${ATTR_REF}'),
        tag: tag,
        classes: (o.getAttribute('class') || '').slice(0, 120),
        box: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }
      });
    }
  } catch (e) {}

  var expandidos = 0;
  var selecionados = 0;
  var detalhesAbertos = 0;
  try {
    expandidos = document.querySelectorAll('[aria-expanded="true"]').length;
    selecionados = document.querySelectorAll('[aria-selected="true"],[aria-current],[data-state="active"]').length;
    // \`<details open>\` muda de estado sem tocar em ARIA e sem alterar o tamanho
    // do HTML — o conteúdo já estava lá, apenas escondido.
    detalhesAbertos = document.querySelectorAll('details[open]').length;
  } catch (e) {}

  var ativo = '';
  try {
    var ae = document.activeElement;
    if (ae && ae !== document.body) {
      ae = ae;
      ativo = ae.tagName.toLowerCase() + '#' + (ae.getAttribute('${ATTR_REF}') || '');
    }
  } catch (e) {}

  var corpoHtml = '';
  try { corpoHtml = document.body ? document.body.innerHTML : ''; } catch (e) {}

  return {
    htmlHash: hash(corpoHtml),
    htmlBytes: corpoHtml.length,
    nodeCount: document.querySelectorAll('*').length,
    htmlClasses: (document.documentElement ? document.documentElement.getAttribute('class') : '') || '',
    bodyClasses: (document.body ? document.body.getAttribute('class') : '') || '',
    bodyStyle: (document.body ? document.body.getAttribute('style') : '') || '',
    overflow: (function () { try { return getComputedStyle(document.body).overflow; } catch (e) { return ''; } })(),
    overlays: overlaysVisiveis,
    expandidos: expandidos,
    selecionados: selecionados,
    detalhesAbertos: detalhesAbertos,
    focado: ativo,
    scrollY: window.scrollY || 0,
    scrollX: window.scrollX || 0
  };
}
`;

/**
 * Mede os alvos rastreados — os valores computados que denunciam reação.
 *
 * Usado antes/depois de cada movimento de ponteiro e de cada ação. Só lê o que
 * muda visualmente; ler tudo custaria um layout por propriedade.
 *
 * Assinatura: `(refs) => Record<ref, Medida>`.
 */
export const MEDIR_ALVOS_FN = `
(refs) => {
  var R = window['${REGISTRO_GLOBAL}'] || {};
  var els = R.els || [];
  var out = {};
  for (var i = 0; i < refs.length; i++) {
    var ref = refs[i];
    var el = els[ref];
    if (!el) {
      try { el = document.querySelector('[${ATTR_REF}="' + ref + '"]'); } catch (e) { el = null; }
    }
    if (!el) continue;
    var cs;
    try { cs = getComputedStyle(el); } catch (e) { continue; }
    var r;
    try { r = el.getBoundingClientRect(); } catch (e) { continue; }
    var animacoes = 0;
    try { animacoes = el.getAnimations ? el.getAnimations().length : 0; } catch (e) {}
    out[ref] = {
      transform: cs.transform,
      opacity: cs.opacity,
      filter: cs.filter,
      backgroundColor: cs.backgroundColor,
      backgroundImage: (cs.backgroundImage || '').slice(0, 200),
      backgroundPosition: cs.backgroundPosition,
      color: cs.color,
      boxShadow: (cs.boxShadow || '').slice(0, 160),
      borderColor: cs.borderColor,
      classes: (el.getAttribute('class') || '').slice(0, 200),
      childCount: el.childElementCount,
      textLen: (el.textContent || '').length,
      box: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
      visivel: cs.visibility !== 'hidden' && parseFloat(cs.opacity) > 0.01,
      animacoes: animacoes,
      cursor: cs.cursor
    };
  }
  return out;
}
`;

/**
 * Quem está sob um ponto normalizado — inclui o caminho de shadow roots abertos.
 *
 * `elementsFromPoint` para no shadow host; `composedPath`/`shadowRoot.elementFromPoint`
 * atravessa. Sem isso, todo componente em Web Component viraria "o host" e a
 * interação real ficaria invisível.
 *
 * Assinatura: `(x, y) => AlvoNoPonto | null`.
 */
export const ALVO_NO_PONTO_FN = `
(x, y) => {
  var px = Math.round(x * (window.innerWidth || 1));
  var py = Math.round(y * (window.innerHeight || 1));
  var el = null;
  try { el = document.elementFromPoint(px, py); } catch (e) { return null; }
  if (!el) return null;
  // Desce por shadow roots abertos até o alvo mais profundo.
  var guard = 0;
  while (el && el.shadowRoot && guard < 8) {
    var dentro = null;
    try { dentro = el.shadowRoot.elementFromPoint(px, py); } catch (e) { dentro = null; }
    if (!dentro || dentro === el) break;
    el = dentro;
    guard++;
  }
  var cs;
  try { cs = getComputedStyle(el); } catch (e) { return null; }
  var r = el.getBoundingClientRect();
  var refAttr = el.getAttribute ? el.getAttribute('${ATTR_REF}') : null;
  // Sobe até um ancestral marcado, para o ponto sempre ter endereço mesmo caindo
  // num <span> não emitido.
  var refPai = null;
  var n = el.parentElement;
  var h = 0;
  while (refAttr === null && n && h < 30) {
    var a = n.getAttribute ? n.getAttribute('${ATTR_REF}') : null;
    if (a !== null) { refPai = parseInt(a, 10); break; }
    n = n.parentElement;
    h++;
  }
  return {
    ref: refAttr === null ? null : parseInt(refAttr, 10),
    refAncestral: refPai,
    tag: el.tagName ? el.tagName.toLowerCase() : '',
    cursor: cs.cursor,
    pointerEvents: cs.pointerEvents,
    emShadow: !!(el.getRootNode && el.getRootNode() !== document),
    box: { x: r.x, y: r.y, w: r.width, h: r.height },
    normalizedBox: {
      x: r.x / (window.innerWidth || 1),
      y: r.y / (window.innerHeight || 1),
      w: r.width / (window.innerWidth || 1),
      h: r.height / (window.innerHeight || 1)
    }
  };
}
`;

/**
 * Sonda um ponto: identifica o alvo E o mede, numa só chamada.
 *
 * Por que combinado: a varredura passa por centenas de pontos, e cada
 * `evaluate` é um round-trip com o navegador. Identificar num e medir noutro
 * dobraria o custo da fase mais longa da captura — e o par
 * (identificar, medir) só faz sentido junto, porque a medida tem de ser a do
 * elemento que estava sob o ponteiro naquele instante.
 *
 * Assinatura: `(x, y) => Sonda | null`.
 */
export const SONDAR_PONTO_FN = `
(x, y) => {
  var vw = window.innerWidth || 1;
  var vh = window.innerHeight || 1;
  var px = Math.round(x * vw);
  var py = Math.round(y * vh);
  var el = null;
  try { el = document.elementFromPoint(px, py); } catch (e) { return null; }
  if (!el) return null;
  var guard = 0;
  while (el && el.shadowRoot && guard < 8) {
    var dentro = null;
    try { dentro = el.shadowRoot.elementFromPoint(px, py); } catch (e) { dentro = null; }
    if (!dentro || dentro === el) break;
    el = dentro;
    guard++;
  }
  var cs;
  try { cs = getComputedStyle(el); } catch (e) { return null; }
  var r = el.getBoundingClientRect();
  var refAttr = el.getAttribute ? el.getAttribute('${ATTR_REF}') : null;
  var refPai = null;
  var n = el.parentElement;
  var h = 0;
  while (refAttr === null && n && h < 30) {
    var a = n.getAttribute ? n.getAttribute('${ATTR_REF}') : null;
    if (a !== null) { refPai = parseInt(a, 10); break; }
    n = n.parentElement;
    h++;
  }
  var animacoes = 0;
  try { animacoes = el.getAnimations ? el.getAnimations().length : 0; } catch (e) {}
  var tag = el.tagName ? el.tagName.toLowerCase() : '';
  return {
    ref: refAttr === null ? null : parseInt(refAttr, 10),
    refAncestral: refPai,
    tag: tag,
    // Sem DOM interno: canvas e vídeo desenham pixels, não filhos. É o caso em
    // que uma região reativa NÃO corresponde a um elemento clicável.
    semDomInterno: tag === 'canvas' || tag === 'video' || (tag === 'svg' && el.children.length === 0),
    cursor: cs.cursor,
    pointerEvents: cs.pointerEvents,
    medida: {
      transform: cs.transform,
      opacity: cs.opacity,
      filter: cs.filter,
      backgroundColor: cs.backgroundColor,
      backgroundImage: (cs.backgroundImage || '').slice(0, 200),
      backgroundPosition: cs.backgroundPosition,
      color: cs.color,
      boxShadow: (cs.boxShadow || '').slice(0, 160),
      borderColor: cs.borderColor,
      classes: (el.getAttribute('class') || '').slice(0, 200),
      childCount: el.childElementCount,
      textLen: (el.textContent || '').length,
      box: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
      visivel: cs.visibility !== 'hidden' && parseFloat(cs.opacity) > 0.01,
      animacoes: animacoes,
      cursor: cs.cursor
    },
    box: { x: r.x, y: r.y, w: r.width, h: r.height },
    normalizedBox: { x: r.x / vw, y: r.y / vh, w: r.width / vw, h: r.height / vh }
  };
}
`;

/** HTML de um ref (para gravar o estado). `(ref) => string`. */
export const HTML_DO_REF_FN = `
(ref) => {
  var R = window['${REGISTRO_GLOBAL}'] || {};
  var el = (R.els || [])[ref];
  if (!el) { try { el = document.querySelector('[${ATTR_REF}="' + ref + '"]'); } catch (e) { el = null; } }
  if (!el) return '';
  try {
    // Ícone de biblioteca é um web component: o SVG mora no shadow root e NÃO
    // sai no outerHTML. Sem isto o bundle recebe a casca vazia
    // (<iconify-icon></iconify-icon>) e o componente aparece sem ícone — foi o
    // que aconteceu com os cards de estatística. O SVG JÁ ESTÁ RENDERIZADO
    // aqui, então basta trazê-lo para a luz: assim o ícone sobrevive sem o
    // runtime da biblioteca e sem rede, que é o ponto do bundle offline.
    //
    // Trabalha sobre um CLONE: mexer no DOM vivo estragaria as capturas
    // seguintes, que leem a mesma página.
    var clone = el.cloneNode(true);
    var origens = [el];
    var copias = [clone];
    var todosO = el.querySelectorAll('*');
    var todosC = clone.querySelectorAll('*');
    for (var k = 0; k < todosO.length; k++) origens.push(todosO[k]);
    for (var k2 = 0; k2 < todosC.length; k2++) copias.push(todosC[k2]);
    var n = Math.min(origens.length, copias.length);
    for (var i = 0; i < n; i++) {
      var o = origens[i];
      var raiz = o.shadowRoot; // fechado devolve null: nada a fazer
      if (!raiz) continue;
      var svg = raiz.querySelector('svg');
      if (!svg) continue;
      var c = copias[i];
      var cs = getComputedStyle(o);
      var g = svg.cloneNode(true);
      // Tamanho em PIXELS medidos: porcentagem depende do bloco de contenção,
      // que um elemento sem o runtime dele não estabelece.
      var caixa = o.getBoundingClientRect();
      var larg = Math.round(caixa.width) || Number.parseFloat(cs.width) || 24;
      var alt = Math.round(caixa.height) || Number.parseFloat(cs.height) || 24;
      g.setAttribute('width', String(larg));
      g.setAttribute('height', String(alt));

      // TROCA A TAG por um <span>, em vez de só preencher o elemento.
      //
      // Guardar o SVG dentro do próprio <iconify-icon> não bastava: o preview
      // carrega o head do site, o script da biblioteca roda, o elemento é
      // promovido a custom element e ganha um shadow root SEM <slot> — e um
      // shadow root sem slot ESCONDE os filhos da luz. Medido: o host ficava
      // 24x24, o SVG dentro dele ia a 0x0 e o ícone sumia, mesmo estando no
      // HTML. Como <span> não pode ser promovido, o ícone fica.
      var s = document.createElement('span');
      var classe = c.getAttribute('class');
      if (classe) s.setAttribute('class', classe);
      var rotulo = o.getAttribute('icon') || o.getAttribute('aria-label');
      if (rotulo) s.setAttribute('data-ds-icone-origem', rotulo);
      s.setAttribute(
        'style',
        (c.getAttribute('style') || '') +
          ';display:' +
          (cs.display === 'inline' ? 'inline-block' : cs.display) +
          ';width:' + larg + 'px;height:' + alt + 'px;color:' + cs.color
      );
      s.setAttribute('data-ds-icone', 'inline');
      s.appendChild(g);
      if (c === clone) clone = s;
      else if (c.parentNode) c.parentNode.replaceChild(s, c);
      copias[i] = s;
    }
    return clone.outerHTML;
  } catch (e) {
    return el.outerHTML;
  }
}
`;

/**
 * HTML dos overlays visíveis que estão FORA de um ref — o conteúdo em portal.
 * `(ref) => string`.
 */
export const PORTAL_HTML_FN = `
(ref) => {
  var R = window['${REGISTRO_GLOBAL}'] || {};
  var base = (R.els || [])[ref] || null;
  if (!base) { try { base = document.querySelector('[${ATTR_REF}="' + ref + '"]'); } catch (e) {} }
  var out = '';
  var vistos = {};
  try {
    var cand = document.querySelectorAll(
      '[role="dialog"],[aria-modal="true"],[data-portal],[data-radix-popper-content-wrapper],[data-state="open"],dialog[open],[class*="modal"],[class*="overlay"],[class*="drawer"],[class*="lightbox"],[class*="popover"],[class*="dropdown"],[class*="tooltip"]'
    );
    for (var i = 0; i < cand.length; i++) {
      var o = cand[i];
      var tag = o.tagName.toLowerCase();
      if (tag === 'button' || tag === 'a' || tag === 'input' || tag === 'label') continue;
      if (base && (o === base || base.contains(o))) continue;
      var cs = getComputedStyle(o);
      if (cs.display === 'none' || cs.visibility === 'hidden' || parseFloat(cs.opacity) <= 0.01) continue;
      var r = o.getBoundingClientRect();
      var posicionado = cs.position === 'fixed' || cs.position === 'absolute';
      var ehDialog = o.getAttribute('role') === 'dialog' || o.getAttribute('aria-modal') === 'true' || tag === 'dialog';
      if (!((posicionado && r.width >= 80 && r.height >= 50) || ehDialog)) continue;
      var html = o.outerHTML.slice(0, 20000);
      if (vistos[html]) continue;
      vistos[html] = 1;
      out += html;
      if (out.length > 60000) break;
    }
  } catch (e) {}
  return out;
}
`;

/**
 * Traz um ref para a viewport e devolve o centro clicável dele.
 *
 * `scrollIntoView` com `block: 'center'` em vez de `nearest`: um elemento
 * encostado na borda passa no teste de "está visível" mas o clique cai num
 * header sticky ou num banner de cookies. O centro é a posição em que o clique
 * de fato chega no elemento.
 *
 * Devolve `null` quando o elemento não é clicável (sumiu, tem `pointer-events:
 * none`, ou está coberto por outro). Descobrir isso ANTES de clicar evita
 * contabilizar como "ação sem efeito" o que foi um clique no elemento errado.
 *
 * Assinatura: `(ref) => Centro | null`.
 */
export const CENTRO_DO_REF_FN = `
(ref) => {
  var R = window['${REGISTRO_GLOBAL}'] || {};
  var el = (R.els || [])[ref];
  if (!el) { try { el = document.querySelector('[${ATTR_REF}="' + ref + '"]'); } catch (e) { el = null; } }
  if (!el || !el.getBoundingClientRect) return null;
  try { el.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' }); } catch (e) {}
  var r = el.getBoundingClientRect();
  if (r.width < 1 || r.height < 1) return null;
  var cs = getComputedStyle(el);
  if (cs.display === 'none' || cs.visibility === 'hidden') return null;
  var cx = Math.round(r.x + r.width / 2);
  var cy = Math.round(r.y + r.height / 2);
  var dentroDaViewport = cx >= 0 && cy >= 0 && cx < window.innerWidth && cy < window.innerHeight;
  // Quem realmente recebe o clique naquele ponto?
  var noTopo = null;
  try { noTopo = document.elementFromPoint(cx, cy); } catch (e) {}
  var alcancavel = !!noTopo && (noTopo === el || el.contains(noTopo) || noTopo.contains(el));
  return {
    x: cx,
    y: cy,
    box: { x: r.x, y: r.y, w: r.width, h: r.height },
    dentroDaViewport: dentroDaViewport,
    alcancavel: alcancavel,
    pointerEvents: cs.pointerEvents,
    scrollY: window.scrollY || 0
  };
}
`;

/** Foca um ref sem preencher nada. `(ref) => boolean`. */
export const FOCAR_REF_FN = `
(ref) => {
  var R = window['${REGISTRO_GLOBAL}'] || {};
  var el = (R.els || [])[ref];
  if (!el) { try { el = document.querySelector('[${ATTR_REF}="' + ref + '"]'); } catch (e) { el = null; } }
  if (!el || typeof el.focus !== 'function') return false;
  try { el.focus({ preventScroll: true }); return document.activeElement === el; } catch (e) { return false; }
}
`;

/** Solta o foco — parte da restauração de estado. `() => void`. */
export const BLUR_FN = `
() => {
  try {
    var ae = document.activeElement;
    if (ae && ae !== document.body && typeof ae.blur === 'function') ae.blur();
  } catch (e) {}
  return true;
}
`;

/** Rola para uma posição absoluta e devolve onde parou. `(y) => {...}`. */
/**
 * Rola até um elemento pelo ref de instrumentação e centraliza na viewport.
 * `(ref) => boolean` — false quando o elemento não existe mais.
 */
/**
 * Prepara a tela para o retrato de uma camada de FUNDO.
 *
 * Uma camada que atravessa a página não tem retrato próprio: fotografada
 * sozinha, é um retângulo transparente; fotografada junto, some no meio do
 * conteúdo. A saída é fotografar a página com o conteúdo ESMAECIDO — o fundo
 * fica evidente e o contexto continua legível, que é como alguém apontaria "olha
 * o fundo" numa captura de tela.
 *
 * Recebe os refs das camadas. Devolve `true` se preparou algo.
 * `(refs) => boolean`
 */
export const DESTACAR_FUNDO_FN = `
(refs) => {
  var R = window['${REGISTRO_GLOBAL}'] || {};
  var alvos = [];
  for (var i = 0; i < refs.length; i++) {
    var el = (R.els || [])[refs[i]];
    if (!el) { try { el = document.querySelector('[${ATTR_REF}="' + refs[i] + '"]'); } catch (e) {} }
    if (el) alvos.push(el);
  }
  if (alvos.length === 0) return false;
  // Marca a camada E a linhagem dela até o body. O seletor de esmaecimento age
  // sobre os filhos diretos do body; sem marcar os ancestrais, uma camada
  // aninhada era apagada junto com o ramo em que vive, e os retratos dos dois
  // grupos saíam idênticos (mesmo hash de bytes, medido).
  for (var j = 0; j < alvos.length; j++) {
    var no = alvos[j];
    var saltos = 0;
    while (no && no !== document.body && saltos < 30) {
      no.setAttribute('data-dsx2-fundo', '1');
      no = no.parentElement;
      saltos++;
    }
  }
  var st = document.createElement('style');
  st.id = 'dsx2-destaque-fundo';
  st.textContent =
    'body > *:not([data-dsx2-fundo]):not(script):not(style){opacity:.12 !important;filter:grayscale(.6) !important}' +
    '[data-dsx2-fundo]{opacity:1 !important;filter:none !important}';
  document.head.appendChild(st);
  return true;
}`;

/** Desfaz o preparo do retrato de fundo. `() => void` */
export const LIMPAR_DESTAQUE_FN = `
() => {
  var st = document.getElementById('dsx2-destaque-fundo');
  if (st && st.parentNode) st.parentNode.removeChild(st);
  var m = document.querySelectorAll('[data-dsx2-fundo]');
  for (var i = 0; i < m.length; i++) m[i].removeAttribute('data-dsx2-fundo');
}`;

export const ROLAR_ATE_REF_FN = `
(ref) => {
  var el = document.querySelector('[${ATTR_REF}="' + ref + '"]');
  if (!el) return false;
  el.scrollIntoView({ block: 'center', behavior: 'instant' });
  return true;
}`;

export const ROLAR_PARA_FN = `
(y) => {
  window.scrollTo({ top: y, left: 0, behavior: 'instant' });
  return {
    scrollY: window.scrollY || 0,
    pageHeight: Math.max(
      document.documentElement ? document.documentElement.scrollHeight : 0,
      document.body ? document.body.scrollHeight : 0,
      window.innerHeight || 0
    ),
    viewportHeight: window.innerHeight || 0
  };
}
`;

/**
 * Folhas de estilo NA ORDEM DO DOCUMENTO — a ordem é a cascata.
 *
 * O coletor antigo listava todo <style> primeiro e todo <link> depois, e a
 * precedência real entre as folhas se perdia. Aqui o percurso é por
 * `document.styleSheets`, que já vem em ordem de documento, e cada folha sai
 * com `ordem` e `origem`:
 *
 * - `style`   — <style> com texto: o conteúdo é o próprio `textContent`.
 * - `cssom`   — <style> vazio (CSS-in-JS): as regras só existem no CSSOM.
 * - `link`    — folha externa: SÓ o href (ler `cssRules` de folha
 *               cross-origin lança SecurityError; o download é da fase de assets).
 * - `adopted` — `document.adoptedStyleSheets`, que nunca aparece em
 *               `document.styleSheets`.
 * - `shadow`  — <style> e adoptedStyleSheets de shadow roots ABERTOS, com
 *               comentário demarcador do host: preservar é mais honesto que
 *               perder, mas o escopo real é o do root, não o do documento.
 *
 * Assinatura: `() => RawCss[]`.
 */
export const COLETAR_CSS_FN = `
() => {
  var out = [];
  var ordem = 0;
  var TETO_REGRAS = 4000;
  var totalRegras = 0;

  /** Serializa cssRules respeitando o teto GLOBAL. Pode lançar (cross-origin). */
  var serializarRegras = function (folha) {
    var texto = '';
    var regras = folha.cssRules;
    for (var i = 0; i < regras.length; i++) {
      if (totalRegras >= TETO_REGRAS) break;
      texto += regras[i].cssText + '\\n';
      totalRegras++;
    }
    return texto;
  };

  // ── Folhas do documento, na ordem da cascata ─────────────────────────────
  try {
    var folhas = document.styleSheets;
    for (var i = 0; i < folhas.length; i++) {
      var ss = folhas[i];
      var dono = ss.ownerNode;
      var tag = dono && dono.tagName ? dono.tagName.toUpperCase() : '';
      if (tag === 'STYLE') {
        var textoDono = dono.textContent || '';
        if (textoDono.length > 0) {
          out.push({ ordem: ordem++, origem: 'style', href: null, inline: true, content: textoDono });
          continue;
        }
        // <style> vazio é CSS-in-JS: as regras só existem no CSSOM.
        var texto = '';
        try { texto = serializarRegras(ss); } catch (e) { continue; }
        if (texto) out.push({ ordem: ordem++, origem: 'cssom', href: null, inline: true, content: texto, viaCssom: true });
      } else if (tag === 'LINK') {
        var href = ss.href || dono.href || '';
        if (href) out.push({ ordem: ordem++, origem: 'link', href: href, inline: false });
      }
    }
  } catch (e) {}

  // <link rel=stylesheet> que ainda não carregou (ou falhou) não aparece em
  // document.styleSheets — o href não pode se perder por isso.
  try {
    var jaVistos = {};
    for (var v = 0; v < out.length; v++) { if (out[v].href) jaVistos[out[v].href] = 1; }
    var links = document.querySelectorAll('link[rel="stylesheet"]');
    for (var j = 0; j < links.length; j++) {
      var h = links[j].href;
      if (h && !jaVistos[h]) { jaVistos[h] = 1; out.push({ ordem: ordem++, origem: 'link', href: h, inline: false }); }
    }
  } catch (e) {}

  // ── adoptedStyleSheets do documento ──────────────────────────────────────
  try {
    var adotadas = document.adoptedStyleSheets || [];
    for (var a = 0; a < adotadas.length; a++) {
      var textoA = '';
      try { textoA = serializarRegras(adotadas[a]); } catch (e) { continue; }
      if (textoA) out.push({ ordem: ordem++, origem: 'adopted', href: null, inline: true, content: textoA, viaCssom: true });
    }
  } catch (e) {}

  // ── Shadow roots ABERTOS ─────────────────────────────────────────────────
  // Walk por elementos com shadowRoot (pega também os declarativos, que a
  // instrumentação de attachShadow não vê), descendo em roots aninhados.
  try {
    var fila = [document];
    var raizes = 0;
    while (fila.length > 0 && raizes < 200) {
      var escopo = fila.shift();
      var els;
      try { els = escopo.querySelectorAll('*'); } catch (e) { continue; }
      for (var n = 0; n < els.length && raizes < 200; n++) {
        var raiz = els[n].shadowRoot;
        if (!raiz) continue;
        raizes++;
        fila.push(raiz);
        var tagHost = els[n].tagName ? els[n].tagName.toLowerCase() : '?';
        var demarcador = '/* shadow-root de <' + tagHost + '> */\\n';
        try {
          var estilos = raiz.querySelectorAll('style');
          for (var s = 0; s < estilos.length; s++) {
            var conteudo = estilos[s].textContent || '';
            if (!conteudo) {
              try { conteudo = estilos[s].sheet ? serializarRegras(estilos[s].sheet) : ''; } catch (e) { conteudo = ''; }
            }
            if (conteudo) out.push({ ordem: ordem++, origem: 'shadow', href: null, inline: true, content: demarcador + conteudo });
          }
        } catch (e) {}
        try {
          var adotadasRaiz = raiz.adoptedStyleSheets || [];
          for (var r = 0; r < adotadasRaiz.length; r++) {
            var textoR = '';
            try { textoR = serializarRegras(adotadasRaiz[r]); } catch (e) { continue; }
            if (textoR) out.push({ ordem: ordem++, origem: 'shadow', href: null, inline: true, content: demarcador + textoR, viaCssom: true });
          }
        } catch (e) {}
      }
    }
  } catch (e) {}

  return out;
}
`;

/** Scripts inline com código real (JSON-LD e config não são script executável). */
export const COLETAR_JS_INLINE_FN = `
() => {
  var out = [];
  try {
    var tags = document.querySelectorAll('script:not([src])');
    for (var i = 0; i < tags.length && i < 200; i++) {
      var t = tags[i];
      var tipo = (t.getAttribute('type') || '').toLowerCase();
      var conteudo = t.textContent || '';
      if (conteudo.trim().length === 0) continue;
      out.push({
        type: tipo,
        module: tipo === 'module',
        // JSON-LD/importmap/speculationrules são DADOS. Marcados aqui para o
        // compilador nunca os tratar como JavaScript executável.
        dados: tipo === 'application/ld+json' || tipo === 'importmap' || tipo === 'application/json' || tipo === 'speculationrules',
        bytes: conteudo.length,
        content: conteudo.slice(0, 200000),
        async: t.hasAttribute('async'),
        defer: t.hasAttribute('defer'),
        ordem: i
      });
    }
  } catch (e) {}
  return out;
}
`;
