import { Outlet, useLocation } from 'react-router-dom';
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

  return (
    <div className="relative flex h-screen w-screen overflow-hidden">
      <div className="ds-halo" aria-hidden="true" />
      <div className="ds-grid" aria-hidden="true" />

      <Sidebar />
      <div className="relative z-10 flex min-w-0 flex-1 flex-col">
        <TopBar />
        <main key={location.pathname} className="ds-fade-in flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>

      {/* Pilha de toasts — fica fora do <main> com key de rota para não reiniciar
          a cada navegação. */}
      <Toaster />
    </div>
  );
}
