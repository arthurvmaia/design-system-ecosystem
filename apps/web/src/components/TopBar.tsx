import { useLocation } from 'react-router-dom';

/**
 * Barra superior fina, com um único propósito: localizar a pessoa no fluxo.
 *
 * Nada de infraestrutura aqui — estado de servidor, chave de API e afins são
 * conversa interna do sistema, não do usuário. Quando algo falhar, é a ação
 * que falhou que explica o que houve e o que fazer, no lugar onde aconteceu.
 */
export function TopBar() {
  const location = useLocation();
  const label = pageLabel(location.pathname);

  return (
    <header
      className="ds-backdrop relative z-20 flex h-[64px] shrink-0 items-center border-b px-8"
      style={{
        borderColor: 'var(--color-border)',
        backgroundColor: 'rgba(6, 6, 6, 0.72)',
      }}
    >
      <div className="flex items-baseline gap-3">
        <span
          className="text-[12px] uppercase tracking-[0.24em]"
          style={{ color: 'var(--color-fg-muted)', fontFamily: 'var(--font-display)' }}
        >
          {label.section}
        </span>
        <span
          className="ds-interactive-text ds-text-glow text-[20px] font-medium"
          style={{ color: 'var(--color-fg)', fontFamily: 'var(--font-display)' }}
        >
          {label.title}
        </span>
      </div>
    </header>
  );
}

/** Rótulos humanos por etapa — o propósito da tela, não o número do pipeline. */
function pageLabel(pathname: string): { section: string; title: string } {
  if (pathname.startsWith('/extract')) return { section: 'Traga referências', title: 'Extrair' };
  if (pathname.startsWith('/gallery')) return { section: 'Escolha o que gostou', title: 'Galeria' };
  if (pathname.startsWith('/library')) return { section: 'Seu acervo', title: 'Biblioteca' };
  if (pathname.startsWith('/design-systems')) {
    return { section: 'Suas curadorias', title: 'Design Systems' };
  }
  if (pathname.startsWith('/projects')) return { section: 'Monte o seu site', title: 'Gerar site' };
  if (pathname.startsWith('/meus-projetos')) {
    return { section: 'Prontos para usar', title: 'Meus sites' };
  }
  if (pathname.startsWith('/revisao')) {
    return { section: 'Precisa do seu olhar', title: 'Pendências' };
  }
  if (pathname.startsWith('/settings')) return { section: 'Do seu jeito', title: 'Configurações' };
  return { section: '', title: 'Início' };
}
