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
 * - `somDaIntro`: a abertura toca uma trilha curta. Quem abre o app perto de
 *   outras pessoas precisa poder desligar isso e não ser perguntado de novo.
 */
export type Preferencias = {
  movimento: 'sistema' | 'reduzir';
  confirmarAntesDeExcluir: boolean;
  introAoAbrir: 'sempre' | 'primeira-vez';
  jaViuIntro: boolean;
  somDaIntro: boolean;
};

type Store = Preferencias & {
  definir: (patch: Partial<Preferencias>) => void;
};

export const usePreferencias = create<Store>()(
  persist(
    (set) => ({
      movimento: 'sistema',
      confirmarAntesDeExcluir: true,
      introAoAbrir: 'sempre',
      jaViuIntro: false,
      somDaIntro: true,
      definir: (patch) => set(patch),
    }),
    {
      name: 'ds-preferencias',
      /**
       * A abertura passou a rodar toda vez.
       *
       * O padrão anterior era só na primeira visita, e o efeito prático foi que
       * a abertura desapareceu depois do primeiro uso e ninguém entendeu por
       * quê. Quem já tem preferência salva vem do padrão antigo, não de uma
       * escolha, então a migração troca o valor uma vez. Quem preferir sem
       * abertura desliga em Configurações, e a escolha fica valendo.
       */
      version: 2,
      migrate: (estado, versao) => {
        const anterior = estado as Partial<Preferencias> | undefined;
        if (anterior === undefined) return anterior as unknown as Preferencias;
        const saida = { ...anterior };
        // v0 → v1: a abertura passou a rodar toda vez (ver acima).
        if (versao < 1) saida.introAoAbrir = 'sempre';
        // v1 → v2: o som ganhou controle. Quem já usava o app vinha ouvindo,
        // então o padrão de quem migra é ligado — mudar isso na calada seria
        // trocar a preferência de alguém sem ela ter pedido.
        if (versao < 2) saida.somDaIntro = true;
        return saida as Preferencias;
      },
    },
  ),
);

/** Mantém a classe global no <html> em dia com a preferência. */
export const aplicarMovimento = (movimento: Preferencias['movimento']): void => {
  document.documentElement.classList.toggle('reduz-movimento', movimento === 'reduzir');
};
