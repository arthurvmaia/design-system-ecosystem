/**
 * Instrumentação in-page.
 *
 * Este código roda DENTRO da página, no navegador — por isso é string, não
 * função TypeScript: não deve ser typechecado contra o `lib` de Node, e é
 * injetado via `addInitScript`/`evaluate`. O julgamento (é seguro? é
 * interativo?) fica nos módulos puros; aqui só coletamos dados crus e
 * serializáveis, no formato do `ElementDescriptor` e do `StateSnapshot`.
 *
 * Mutações que fazemos no DOM (`data-dsx-*`) são de rastreio e são removidas do
 * HTML capturado por `stripInstrumentation`.
 */

/**
 * Init script (document_start): embrulha addEventListener para saber quais
 * elementos têm listeners e de que tipo. Marca no atributo `data-dsx-listen`.
 */
export const INIT_LISTENER_TRACKER = `
(() => {
  if (window.__dsxPatched) return;
  window.__dsxPatched = true;
  const orig = EventTarget.prototype.addEventListener;
  EventTarget.prototype.addEventListener = function (type, listener, options) {
    try {
      if (this && this.nodeType === 1 && typeof type === 'string') {
        const prev = this.getAttribute('data-dsx-listen');
        const set = new Set(prev ? prev.split(' ') : []);
        set.add(type);
        this.setAttribute('data-dsx-listen', Array.from(set).join(' '));
      }
    } catch (e) {}
    return orig.call(this, type, listener, options);
  };
})();
`;

/**
 * Coletor de descritores. Expressão `(maxEls) => ElementDescriptor[]`. Atribui um
 * `data-dsx-ref` a cada elemento retornado, para endereçá-lo depois por
 * `[data-dsx-ref="i"]`.
 */
export const COLLECT_DESCRIPTORS_FN = `
(maxEls) => {
  const out = [];
  const seen = document.querySelectorAll('*');
  let idx = 0;
  for (const el of seen) {
    if (out.length >= maxEls) break;
    const tag = el.tagName.toLowerCase();
    if (tag === 'script' || tag === 'style' || tag === 'meta' || tag === 'link' || tag === 'head') continue;
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') continue;
    const rect = el.getBoundingClientRect();
    const listen = (el.getAttribute('data-dsx-listen') || '').split(' ').filter(Boolean);
    const cursor = cs.cursor;
    const role = el.getAttribute('role');
    const tabAttr = el.getAttribute('tabindex');
    const dataAttrs = {};
    for (const a of el.attributes) {
      if (a.name.startsWith('data-') && !a.name.startsWith('data-dsx')) dataAttrs[a.name] = a.value;
    }
    const interativo =
      ['a','button','input','select','textarea','summary','details','label'].includes(tag) ||
      (role && ['button','link','tab','menuitem','switch','checkbox','radio','combobox','option'].includes(role)) ||
      (tabAttr !== null && Number(tabAttr) >= 0) ||
      el.hasAttribute('aria-expanded') || el.hasAttribute('aria-haspopup') ||
      (cursor === 'pointer') ||
      listen.length > 0 ||
      Object.keys(dataAttrs).some((k) => /toggle|tab|accordion|modal|dropdown|menu|carousel|slide|open|state/i.test(k));
    if (!interativo) continue;
    if (rect.width < 4 || rect.height < 4) continue;
    el.setAttribute('data-dsx-ref', String(idx));
    out.push({
      ref: String(idx),
      tag,
      role: role,
      type: el.getAttribute('type'),
      href: el.getAttribute('href'),
      text: (el.textContent || '').trim().replace(/\\s+/g, ' ').slice(0, 120),
      ariaLabel: el.getAttribute('aria-label'),
      classes: (el.getAttribute('class') || '').split(/\\s+/).filter(Boolean),
      id: el.getAttribute('id'),
      tabindex: tabAttr === null ? null : Number(tabAttr),
      cursor,
      hasListeners: listen.length > 0,
      listenerTypes: listen,
      disabled: el.hasAttribute('disabled') || el.getAttribute('aria-disabled') === 'true',
      ariaExpanded: el.getAttribute('aria-expanded'),
      ariaHaspopup: el.getAttribute('aria-haspopup'),
      ariaControls: el.getAttribute('aria-controls'),
      download: el.hasAttribute('download'),
      targetBlank: el.getAttribute('target') === '_blank',
      box: { x: rect.x, y: rect.y, w: rect.width, h: rect.height },
      inViewport: rect.top < innerHeight && rect.bottom > 0,
      dataAttrs,
    });
    idx++;
  }
  return out;
}
`;

/**
 * Snapshot de um elemento por ref. Expressão `(ref) => StateSnapshot | null`.
 * Inclui o HTML de overlays visíveis (portal) para detectar modal/menu/tooltip.
 */
export const SNAPSHOT_FN = `
(ref) => {
  const el = document.querySelector('[data-dsx-ref="' + ref + '"]');
  if (!el) return null;
  const cs = getComputedStyle(el);
  const rect = el.getBoundingClientRect();
  const KEYS = ['display','visibility','opacity','transform','height','maxHeight','width','backgroundColor','backgroundImage','color','clipPath','pointerEvents'];
  const computed = {};
  for (const k of KEYS) computed[k] = cs[k];
  const attrs = {};
  for (const a of el.attributes) {
    if (a.name.startsWith('data-dsx')) continue;
    if (/^(class|style|hidden|open|checked|selected)$/.test(a.name) || a.name.startsWith('aria-') || a.name.startsWith('data-')) {
      attrs[a.name] = a.value;
    }
  }
  const overlays = document.querySelectorAll('[role="dialog"],[aria-modal="true"],.modal,.tooltip,.dropdown,[data-portal],[data-radix-popper-content-wrapper],[data-state="open"]');
  let portalHtml = '';
  for (const o of overlays) {
    const ocs = getComputedStyle(o);
    if (ocs.display !== 'none' && ocs.visibility !== 'hidden' && Number(ocs.opacity) > 0.01) {
      portalHtml += o.outerHTML.slice(0, 4000);
    }
  }
  // Assinatura da subárvore: um hash barato do outerHTML (com o tamanho dobrado
  // dentro). É o que faz um reveal em FILHO (hover que muda a classe de um filho,
  // clique que injeta conteúdo) contar como estado novo — o próprio elemento
  // pode não mudar, mas a subárvore muda.
  const raw = el.outerHTML;
  let hh = 2166136261 ^ raw.length;
  const lim = Math.min(raw.length, 12000);
  for (let i = 0; i < lim; i++) { hh ^= raw.charCodeAt(i); hh = Math.imul(hh, 16777619); }
  return {
    classes: (el.getAttribute('class') || '').split(/\\s+/).filter(Boolean),
    attrs,
    computed,
    box: { w: rect.width, h: rect.height },
    childCount: el.childElementCount,
    textLen: (el.textContent || '').length,
    visible: cs.display !== 'none' && cs.visibility !== 'hidden' && Number(cs.opacity) > 0.01,
    portalHtml,
    htmlSig: (hh >>> 0).toString(16),
  };
}
`;

/** HTML externo do elemento por ref (para gravar o estado). `(ref) => string`. */
export const OUTER_HTML_FN = `
(ref) => {
  const el = document.querySelector('[data-dsx-ref="' + ref + '"]');
  return el ? el.outerHTML : '';
}
`;

/** Remove os atributos de instrumentação de um HTML capturado. */
export const stripInstrumentation = (html: string): string =>
  html.replace(/\s*data-dsx-(?:ref|listen)="[^"]*"/gi, '');

/** Monta uma chamada string-serializável: `(FN)(argJson)`. */
export const buildCall = (fnSource: string, arg?: unknown): string =>
  arg === undefined ? `(${fnSource})()` : `(${fnSource})(${JSON.stringify(arg)})`;
