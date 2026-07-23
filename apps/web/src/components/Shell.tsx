import { Outlet, useLocation } from 'react-router-dom';
import { AmbientEmbers } from './AmbientEmbers';
import { Sidebar } from './Sidebar';
import { Toaster } from './Toaster';
import { TopBar } from './TopBar';

/**
 * Layout raiz da aplicação.
 *
 * Sidebar fixa à esquerda, topbar fina, área principal rolável. As duas manchas
 * de luz ambiente ficam fixas atrás de tudo — são o fundo vivo sobre o qual os
 * painéis de vidro se apoiam.
 *
 * A `key` no <main> reinicia a animação de entrada a cada troca de rota, o que
 * dá ao app a sensação de transição em vez de troca seca de conteúdo.
 */
export function Shell() {
  const location = useLocation();

  return (
    <div className="relative flex h-screen w-screen overflow-hidden">
      <div className="ds-ambient ds-ambient-1" aria-hidden="true" />
      <div className="ds-ambient ds-ambient-2" aria-hidden="true" />
      <AmbientEmbers />

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
