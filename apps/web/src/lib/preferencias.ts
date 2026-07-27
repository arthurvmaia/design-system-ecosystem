import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/**
 * Preferências REAIS da pessoa, persistidas no navegador. Nada decorativo:
 * cada opção aqui muda o comportamento de verdade.
 *
 * - `movimento`: 'sistema' segue a preferência do aparelho; 'reduzir' desliga
 *   as animações do app SEMPRE (classe `reduz-movimento` no <html>, que o CSS
 *   global respeita como se fosse prefers-reduced-motion).
 * - `confirmarAntesDeExcluir`: com false, exclusões pedem só um clique.
 * - `introAoAbrir`: a cortina de abertura roda sempre ou só uma vez.
 */
export type Preferencias = {
  movimento: 'sistema' | 'reduzir';
  confirmarAntesDeExcluir: boolean;
  introAoAbrir: 'sempre' | 'primeira-vez';
  jaViuIntro: boolean;
};

type Store = Preferencias & {
  definir: (patch: Partial<Preferencias>) => void;
};

export const usePreferencias = create<Store>()(
  persist(
    (set) => ({
      movimento: 'sistema',
      confirmarAntesDeExcluir: true,
      introAoAbrir: 'primeira-vez',
      jaViuIntro: false,
      definir: (patch) => set(patch),
    }),
    { name: 'ds-preferencias' },
  ),
);

/** O movimento deve ser reduzido AGORA? (preferência manual OU do sistema) */
export const movimentoReduzido = (): boolean => {
  if (usePreferencias.getState().movimento === 'reduzir') return true;
  return (
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true
  );
};

/** Mantém a classe global no <html> em dia com a preferência. */
export const aplicarMovimento = (movimento: Preferencias['movimento']): void => {
  document.documentElement.classList.toggle('reduz-movimento', movimento === 'reduzir');
};
