import { api } from '@/lib/api';
import { cn } from '@/lib/cn';
import { useUiStore } from '@/lib/store';
import { useQuery } from '@tanstack/react-query';
import {
  AlertTriangle,
  Compass,
  Layers,
  Library,
  Package,
  Settings,
  UploadCloud,
  Wand2,
} from 'lucide-react';
import type React from 'react';
import { NavLink } from 'react-router-dom';
import { BrandMark } from './BrandMark';

const primaryNav = [
  { to: '/extract', label: 'Extrair', icon: UploadCloud, description: 'Nova extração' },
  { to: '/gallery', label: 'Galeria', icon: Compass, description: 'Triagem de candidatos' },
  {
    to: '/revisao',
    label: 'Revisão',
    icon: AlertTriangle,
    description: 'O que não foi interpretado',
  },
  { to: '/library', label: 'Biblioteca', icon: Library, description: 'Acervo curado' },
  { to: '/design-systems', label: 'Design Systems', icon: Layers, description: 'Kits finais' },
  { to: '/projects', label: 'Gerar site', icon: Wand2, description: 'A partir de um kit' },
  {
    to: '/meus-projetos',
    label: 'Meus sites',
    icon: Package,
    description: 'Prontos para baixar',
  },
] as const;

const secondaryNav = [
  { to: '/settings', label: 'Configurações', icon: Settings, description: null },
] as const;

/**
 * Navegação fixa. É vidro, não uma coluna pintada: o fundo é preto translúcido
 * com blur, então as manchas de luz ambiente atravessam a coluna em vez de
 * morrerem atrás dela.
 */
export function Sidebar() {
  const runningTasks = useUiStore((s) => s.runningTasks);

  return (
    <aside
      className="ds-backdrop relative z-20 flex h-full w-[260px] shrink-0 flex-col border-r"
      style={{
        borderColor: 'var(--color-border)',
        backgroundColor: 'rgba(6, 6, 6, 0.55)',
      }}
    >
      {/* Cabeçalho da marca. */}
      <div
        className="flex h-[64px] shrink-0 items-center border-b px-6"
        style={{ borderColor: 'var(--color-border)' }}
      >
        <BrandMark />
      </div>

      {/* Nav primária. */}
      <nav className="flex-1 overflow-y-auto py-6">
        <div className="px-3">
          <SectionLabel>Fluxo</SectionLabel>
          <ul className="mt-3 flex flex-col gap-1">
            {primaryNav.map((item) => (
              <li key={item.to}>
                <NavItem to={item.to} icon={item.icon} label={item.label} />
              </li>
            ))}
          </ul>
        </div>
      </nav>

      {/* Nav secundária. */}
      <div className="px-3 pb-3">
        <ul className="flex flex-col gap-1">
          {secondaryNav.map((item) => (
            <li key={item.to}>
              <NavItem to={item.to} icon={item.icon} label={item.label} />
            </li>
          ))}
        </ul>
      </div>

      {/* Barra de status. Aparece só quando há trabalho rodando. */}
      <div
        className="flex h-[42px] shrink-0 items-center gap-3 border-t px-6 text-[11px] uppercase tracking-[0.16em]"
        style={{
          borderColor: 'var(--color-border)',
          color: 'var(--color-fg-muted)',
          fontFamily: 'var(--font-display)',
        }}
      >
        {runningTasks > 0 ? (
          <>
            <span className="ds-signal-dot" aria-hidden />
            <span>
              {runningTasks} {runningTasks === 1 ? 'tarefa' : 'tarefas'} em curso
            </span>
          </>
        ) : (
          <>
            <span
              aria-hidden
              className="inline-block h-[5px] w-[5px] rounded-full"
              style={{ backgroundColor: 'var(--color-fg-subtle)' }}
            />
            <span>Ocioso</span>
          </>
        )}
      </div>
    </aside>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="px-3 text-[10px] font-medium uppercase tracking-[0.28em]"
      style={{ color: 'var(--color-fg-subtle)', fontFamily: 'var(--font-display)' }}
    >
      {children}
    </div>
  );
}

/**
 * O item ativo vira vidro e ganha a barra vermelha na borda. O inativo desliza
 * 2px para a direita sob o cursor — numa lista vertical estreita, o empurrão
 * lateral lê melhor que o `scale` que a referência usa nos cards.
 */
function NavItem({
  to,
  icon: Icon,
  label,
}: {
  to: string;
  icon: typeof UploadCloud;
  label: string;
}) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        cn(
          'group relative flex items-center gap-3 rounded-md px-3 py-2.5 text-[13px]',
          'transition-all duration-300',
          isActive
            ? 'ds-glass-static text-[var(--color-fg)]'
            : 'text-[var(--color-fg-muted)] hover:translate-x-[2px] hover:bg-white/[0.04] hover:text-[var(--color-fg)]',
        )
      }
    >
      {({ isActive }) => (
        <>
          {isActive && <span className="ds-active-bar" aria-hidden />}
          <Icon size={16} strokeWidth={1.75} />
          <span style={{ fontFamily: 'var(--font-body)' }}>{label}</span>
          {label === 'Revisão' && <BadgeRevisao />}
          {label === 'Biblioteca' && <BadgeBiblioteca />}
          {label === 'Design Systems' && <BadgeKits />}
          {label === 'Meus sites' && <BadgeMeusProjetos />}
        </>
      )}
    </NavLink>
  );
}

function Badge({ valor }: { valor: number }) {
  if (valor === 0) return null;
  return (
    <span
      className="ds-data ds-tag ml-auto rounded-full border px-2 py-0.5 text-[10px] font-medium"
      style={{
        backgroundColor: 'rgba(255, 255, 255, 0.04)',
        borderColor: 'var(--color-border)',
        color: 'var(--color-fg-subtle)',
      }}
    >
      {valor}
    </span>
  );
}

function BadgeBiblioteca() {
  const { data } = useQuery({
    queryKey: ['library'],
    queryFn: async () => {
      const res = await fetch('/api/library');
      if (!res.ok) throw new Error('falha');
      return res.json() as Promise<{ items: unknown[] }>;
    },
  });
  return <Badge valor={data?.items.length ?? 0} />;
}

/** Conta os kits (Design Systems finais). Compartilha o cache com a página Kits. */
function BadgeKits() {
  const { data } = useQuery({ queryKey: ['kits'], queryFn: api.listKits });
  return <Badge valor={data?.items.length ?? 0} />;
}

/** Quantos candidatos ficaram de fora da Galeria e esperam revisão. */
function BadgeRevisao() {
  const { data } = useQuery({ queryKey: ['rejeitados'], queryFn: api.listRejeitados });
  return <Badge valor={data?.total ?? 0} />;
}

/** Conta quantos projetos já têm site gerado em disco. */
function BadgeMeusProjetos() {
  const { data } = useQuery({
    queryKey: ['meus-projetos-contagem'],
    queryFn: async () => {
      const res = await fetch('/api/meus-projetos/contagem');
      if (!res.ok) throw new Error('falha');
      return res.json() as Promise<{ total: number }>;
    },
    refetchInterval: 10_000,
  });
  return <Badge valor={data?.total ?? 0} />;
}
