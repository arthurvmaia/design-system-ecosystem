import { api } from '@/lib/api';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { BarraDeFluxo } from './BarraDeFluxo';
import { Sidebar } from './Sidebar';
import { Toaster } from './Toaster';
import { TopBar } from './TopBar';

/**
 * Layout raiz da aplicação.
 *
 * O fundo mudou de ideia. Antes eram duas manchas de luz que derivavam devagar
 * mais um canvas de brasas — bonito, e errado para o que este app é: o conteúdo
 * aqui são PRÉVIAS DE SITE, que já têm movimento próprio, e um fundo que se mexe
 * disputa atenção com elas. Agora é uma grade fina que desbota nas bordas e um
 * halo parado no alto. Bancada, não lareira.
 *
 * A `key` no <main> reinicia a animação de entrada a cada troca de rota, o que
 * dá ao app a sensação de transição em vez de troca seca de conteúdo.
 */
export function Shell() {
  const location = useLocation();

  // A gaveta da navegação. Só existe abaixo de `lg`; acima, a coluna é fixa e
  // este estado não pinta nada. Fecha a cada troca de rota: gaveta que fica
  // aberta em cima da tela recém-pedida é a falha clássica do padrão.
  const [menuAberto, setMenuAberto] = useState(false);
  const rota = location.pathname;
  // biome-ignore lint/correctness/useExhaustiveDependencies: fechar a gaveta é o efeito de MUDAR de rota; `rota` é a dependência, e o setter é estável.
  useEffect(() => setMenuAberto(false), [rota]);

  // O ritmo do app vem do acervo: a mediana das durações e a curva mais comum
  // dos sites que a pessoa trouxe. O que atravessa a fronteira são NÚMEROS —
  // três custom properties — e não regra de terceiro, que furaria o isolamento
  // do PreviewFrame e quebraria layout de um jeito imprevisível. Sem acervo, o
  // servidor devolve o padrão do tema e nada muda.
  const movimento = useQuery({ queryKey: ['movimento'], queryFn: api.getMovimento });
  useEffect(() => {
    const t = movimento.data?.tokens;
    if (t === undefined || t.amostras === 0) return;
    const raiz = document.documentElement;
    raiz.style.setProperty('--orbis-duracao-rapida', `${t.rapidaMs}ms`);
    raiz.style.setProperty('--orbis-duracao-media', `${t.mediaMs}ms`);
    raiz.style.setProperty('--orbis-easing', t.easing);
  }, [movimento.data]);

  return (
    <div className="relative flex h-screen w-screen overflow-hidden">
      <div className="ds-halo" aria-hidden="true" />
      <div className="ds-grid" aria-hidden="true" />

      <Sidebar aberta={menuAberto} aoFechar={() => setMenuAberto(false)} />
      <div className="relative z-10 flex min-w-0 flex-1 flex-col">
        <TopBar aoAbrirMenu={() => setMenuAberto(true)} />
        <main key={location.pathname} className="ds-fade-in min-h-0 flex-1 overflow-y-auto">
          <Outlet />
        </main>
        {/* A navegação do polegar. Só existe onde a coluna não cabe, e fica
            FORA do <main> de propósito: dentro, ela rolaria junto com o
            conteúdo e sumiria justo quando fosse mais útil. */}
        <BarraDeFluxo />
      </div>

      {/* Pilha de toasts — fica fora do <main> com key de rota para não reiniciar
          a cada navegação. */}
      <Toaster />
    </div>
  );
}
