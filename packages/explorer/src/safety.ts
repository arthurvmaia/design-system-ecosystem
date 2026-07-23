import type { ElementDescriptor } from './descriptor.js';

/**
 * Guardas de segurança da exploração — funções puras.
 *
 * A exploração clica em coisas de verdade numa página de verdade. Um clique no
 * lugar errado compra um produto, faz logout, apaga um registro, baixa um
 * arquivo ou navega para fora. Estas funções decidem, ANTES de qualquer clique,
 * se a ação é reversível e local. Na dúvida, reprova — perder uma interação é
 * barato; disparar uma ação irreversível não é.
 */

/** Verbos de ação irreversível/perigosa, em PT e EN. Fronteiras de palavra. */
const TEXTO_PERIGOSO =
  /\b(buy|purchase|checkout|pay|order|subscribe|donate|comprar|pagar|assinar|finalizar|doar|delete|remove|discard|excluir|apagar|remover|deletar|descartar|logout|log\s?out|sign\s?out|disconnect|sair|desconectar|unsubscribe|cancel|cancelar|deactivate|desativar|reset|confirm|confirmar|send|enviar|submit|publish|publicar|upload|import|export|download|baixar|install|instalar)\b/i;

/** Rótulos de fechar/dispensar — clicáveis e seguros, mesmo casando com "cancel". */
const TEXTO_FECHAR = /\b(close|dismiss|fechar|voltar|back|ok|got it|entendi|aceitar|accept)\b/i;

/** Protocolos que nunca devem ser "clicados" como navegação. */
const PROTO_PERIGOSO = /^(mailto:|tel:|sms:|javascript:|file:|data:|blob:)/i;

/** Origem de uma URL, tolerante a relativas (que são sempre mesma origem). */
export const sameOrigin = (href: string, baseUrl: string): boolean => {
  try {
    const base = new URL(baseUrl);
    const target = new URL(href, baseUrl);
    return target.origin === base.origin;
  } catch {
    // Relativa que não parseia isolada ⇒ resolvida contra a base ⇒ mesma origem.
    return !/^[a-z]+:\/\//i.test(href);
  }
};

/** Uma âncora de navegação para fora, download, ou nova aba? */
export const navegaParaFora = (d: ElementDescriptor, baseUrl: string): boolean => {
  if (d.download || d.targetBlank) return true;
  if (d.href === null || d.href === '') return false;
  if (PROTO_PERIGOSO.test(d.href)) return true;
  // Âncora interna de fragmento (#secao) é local e segura.
  if (d.href.startsWith('#')) return false;
  return !sameOrigin(d.href, baseUrl);
};

/**
 * É um controle de formulário que, ao clicar, envia o formulário? Submit
 * explícito, ou botão sem type dentro de form (o default de `<button>` é submit).
 */
export const enviaFormulario = (d: ElementDescriptor): boolean => {
  if (d.tag === 'input' && (d.type === 'submit' || d.type === 'image')) return true;
  if (d.tag === 'button' && (d.type === 'submit' || d.type === null)) {
    // Só é submit se o texto sugerir envio; um <button> sem type usado como
    // toggle (aria-expanded, role=tab) não envia nada de útil e é seguro.
    if (d.ariaExpanded !== null || d.role === 'tab' || d.ariaHaspopup !== null) return false;
    return TEXTO_PERIGOSO.test(d.text);
  }
  return false;
};

/** Campo onde digitar/clicar tem efeito colateral (arquivo, senha, envio). */
export const ehCampoSensivel = (d: ElementDescriptor): boolean => {
  if (d.tag !== 'input') return false;
  return d.type === 'file' || d.type === 'password' || d.type === 'submit' || d.type === 'image';
};

/**
 * Veredito final: é seguro clicar neste elemento durante a exploração?
 *
 * Seguro = reversível e local. Fechar/abrir um menu, trocar de aba, expandir um
 * accordion: sim. Comprar, enviar, sair, navegar para fora, baixar: não.
 */
export const ehSeguroClicar = (
  d: ElementDescriptor,
  baseUrl: string,
): { safe: boolean; motivo?: string } => {
  if (d.disabled) return { safe: false, motivo: 'elemento desabilitado' };
  if (ehCampoSensivel(d)) return { safe: false, motivo: 'campo sensível (arquivo/senha/submit)' };
  if (navegaParaFora(d, baseUrl)) return { safe: false, motivo: 'navega para fora / download' };
  if (enviaFormulario(d)) return { safe: false, motivo: 'envia formulário' };

  // Texto perigoso vence, a menos que seja claramente um "fechar/ok".
  if (TEXTO_PERIGOSO.test(d.text) && !TEXTO_FECHAR.test(d.text)) {
    // Exceção: toggles de UI (aria-expanded / role=tab / haspopup) que por acaso
    // têm um verbo no rótulo continuam seguros — o efeito é abrir/fechar, não agir.
    const ehToggleDeUI =
      d.ariaExpanded !== null ||
      d.role === 'tab' ||
      d.ariaHaspopup !== null ||
      d.role === 'menuitem';
    if (!ehToggleDeUI)
      return { safe: false, motivo: `rótulo de ação irreversível: "${d.text.slice(0, 40)}"` };
  }

  return { safe: true };
};
