import { useEffect } from 'react';

/**
 * Revelação no scroll.
 *
 * Observa qualquer elemento com `.ds-reveal` e adiciona `.ds-visible` quando ele
 * entra na viewport. Usa IntersectionObserver (não escuta scroll), então não
 * roda nada por frame e não trava a rolagem.
 *
 * Reobserva a cada mudança de `deps` porque as listas do app são assíncronas —
 * itens que chegam depois do primeiro render também precisam ser observados.
 */
export const useReveal = (deps: readonly unknown[] = []): void => {
  useEffect(() => {
    const alvos = document.querySelectorAll<HTMLElement>('.ds-reveal:not(.ds-visible)');
    if (alvos.length === 0) return;

    // Sem suporte ou com movimento reduzido: mostra tudo de uma vez.
    const semMovimento = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (semMovimento || typeof IntersectionObserver === 'undefined') {
      for (const el of alvos) el.classList.add('ds-visible');
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          entry.target.classList.add('ds-visible');
          observer.unobserve(entry.target);
        }
      },
      { rootMargin: '0px 0px -8% 0px', threshold: 0.05 },
    );

    for (const el of alvos) observer.observe(el);
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
};
