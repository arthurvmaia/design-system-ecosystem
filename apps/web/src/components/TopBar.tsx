import { api } from '@/lib/api';
import { useQuery } from '@tanstack/react-query';
import { useLocation } from 'react-router-dom';

/**
 * Barra superior fina. Serve dois propósitos:
 * 1. Localizar o usuário na hierarquia (breadcrumb curto).
 * 2. Mostrar o estado bruto do backend (conectado, chave da Anthropic ok, root de dados).
 *
 * A barra é vidro sobre o conteúdo que rola por baixo — por isso o fundo é preto
 * translúcido e não uma cor chapada. Os indicadores viram pílulas com borda em
 * gradiente, o mesmo tratamento que a referência dá aos badges.
 */
export function TopBar() {
  const location = useLocation();
  const health = useQuery({
    queryKey: ['health'],
    queryFn: api.health,
    refetchInterval: 15_000,
    staleTime: 10_000,
  });

  const label = pageLabel(location.pathname);

  return (
    <header
      className="ds-backdrop relative z-20 flex h-[64px] shrink-0 items-center justify-between border-b px-8"
      style={{
        borderColor: 'var(--color-border)',
        backgroundColor: 'rgba(6, 6, 6, 0.72)',
      }}
    >
      <div className="flex items-baseline gap-3">
        <span
          className="text-[11px] uppercase tracking-[0.28em]"
          style={{ color: 'var(--color-fg-subtle)', fontFamily: 'var(--font-display)' }}
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

      <div className="flex items-center gap-3">
        <StatusChip
          label="server"
          ok={health.data?.status === 'ok'}
          hint={health.data?.status === 'ok' ? 'conectado' : 'sem resposta'}
        />
        <StatusChip
          label="anthropic"
          ok={Boolean(health.data?.anthropicConfigured)}
          hint={health.data?.anthropicConfigured ? 'chave presente' : 'chave ausente'}
        />
      </div>
    </header>
  );
}

function StatusChip({ label, ok, hint }: { label: string; ok: boolean; hint: string }) {
  return (
    <div
      className="ds-glow-border ds-backdrop ds-hover-float flex items-center gap-2 rounded-full px-3 py-1.5"
      style={{
        backgroundColor: ok ? 'rgba(107, 20, 20, 0.18)' : 'rgba(255, 255, 255, 0.03)',
        borderColor: ok ? 'rgba(198, 40, 40, 0.32)' : 'var(--color-border)',
      }}
    >
      {ok ? (
        <span className="ds-signal-dot" aria-hidden />
      ) : (
        <span
          aria-hidden
          className="inline-block h-[6px] w-[6px] rounded-full"
          style={{ backgroundColor: 'var(--color-fg-subtle)' }}
        />
      )}
      <span
        className="text-[10px] uppercase tracking-[0.24em]"
        style={{ color: 'var(--color-fg-muted)', fontFamily: 'var(--font-display)' }}
      >
        {label}
      </span>
      <span className="ds-data text-[10px]" style={{ color: 'var(--color-fg-subtle)' }}>
        {hint}
      </span>
    </div>
  );
}

function pageLabel(pathname: string): { section: string; title: string } {
  if (pathname.startsWith('/extract')) return { section: '01 · Entrada', title: 'Extrair' };
  if (pathname.startsWith('/gallery')) return { section: '02 · Descoberta', title: 'Galeria' };
  if (pathname.startsWith('/library')) return { section: '03 · Curadoria', title: 'Biblioteca' };
  if (pathname.startsWith('/projects')) return { section: '04 · Saída', title: 'Projetos' };
  if (pathname.startsWith('/settings')) return { section: 'Sistema', title: 'Configurações' };
  return { section: '', title: 'Início' };
}
