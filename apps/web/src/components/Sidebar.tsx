import { api } from '@/lib/api';
import { cn } from '@/lib/cn';
import {
  type NavItemDef,
  PENDENCIAS_ROUTE,
  pendenciasBadge,
  primaryNav,
  secondaryNav,
} from '@/lib/nav';
import { useQuery } from '@tanstack/react-query';
import type React from 'react';
import { NavLink } from 'react-router-dom';
import { BrandMark } from './BrandMark';

const ITEM_BASE =
  'group relative flex items-center gap-3 rounded-md px-3 py-2.5 text-[13px] transition-all duration-300';
const ITEM_INATIVO =
  'text-[var(--color-fg-muted)] hover:translate-x-[2px] hover:bg-white/[0.04] hover:text-[var(--color-fg)]';
const ITEM_ATIVO = 'ds-glass-static text-[var(--color-fg)]';

/**
 * Navegação fixa. É vidro, não uma coluna pintada: o fundo é preto translúcido
 * com blur, então as manchas de luz ambiente atravessam a coluna em vez de
 * morrerem atrás dela.
 *
 * Duas zonas com pesos diferentes: as funcionalidades PRINCIPAIS (fluxo de
 * criar/organizar/gerar) na lista de cima; as AUXILIARES (Pendências e
 * Configurações — exceção e operação) no rodapé, separadas por um divisor. A
 * config das duas listas mora em `@/lib/nav`.
 */
export function Sidebar() {
  return (
    <aside
      className="ds-backdrop relative z-20 flex h-full w-[260px] shrink-0 flex-col border-r"
      style={{ borderColor: 'var(--color-border)', backgroundColor: 'rgba(6, 6, 6, 0.55)' }}
    >
      {/* Cabeçalho da marca. */}
      <div
        className="flex h-[64px] shrink-0 items-center border-b px-6"
        style={{ borderColor: 'var(--color-border)' }}
      >
        <BrandMark />
      </div>

      {/* Nav primária — as funcionalidades principais. */}
      <nav className="flex-1 overflow-y-auto py-6">
        <div className="px-3">
          <SectionLabel>Fluxo</SectionLabel>
          <ul className="mt-3 flex flex-col gap-1">
            {primaryNav.map((item) => (
              <li key={item.to}>
                <NavItem item={item} />
              </li>
            ))}
          </ul>
        </div>
      </nav>

      {/* Nav auxiliar — exceção e operação. Separada por divisor, com menos peso. */}
      <div className="px-3 pb-3">
        <div className="mx-3 mb-2 border-t" style={{ borderColor: 'var(--color-border)' }} />
        <SectionLabel>Auxiliar</SectionLabel>
        <ul className="mt-2 flex flex-col gap-1">
          {secondaryNav.map((item) => (
            <li key={item.to}>
              {item.to === PENDENCIAS_ROUTE ? (
                <PendenciasNavItem item={item} />
              ) : (
                <NavItem item={item} />
              )}
            </li>
          ))}
        </ul>
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
 * Item genérico da navegação. O ativo vira vidro e ganha a barra vermelha na
 * borda; o inativo desliza 2px sob o cursor. O `title` dá tooltip (útil se um dia
 * a coluna recolher para ícones).
 */
function NavItem({ item }: { item: NavItemDef }) {
  const Icon = item.icon;
  return (
    <NavLink
      to={item.to}
      title={item.description ?? item.label}
      className={({ isActive }) => cn(ITEM_BASE, isActive ? ITEM_ATIVO : ITEM_INATIVO)}
    >
      {({ isActive }) => (
        <>
          {isActive && <span className="ds-active-bar" aria-hidden />}
          <Icon size={16} strokeWidth={1.75} />
          <span style={{ fontFamily: 'var(--font-body)' }}>{item.label}</span>
          <BadgeInfoDaRota to={item.to} />
        </>
      )}
    </NavLink>
  );
}

/**
 * O item de Pendências: a área de exceção. Discreto quando não há nada; com selo
 * de destaque moderado (crimson) e ícone aceso quando há itens aguardando. O
 * `aria-label` anuncia a quantidade para o leitor de tela — não depende de cor.
 */
function PendenciasNavItem({ item }: { item: NavItemDef }) {
  const q = useQuery({ queryKey: ['rejeitados'], queryFn: api.listRejeitados });
  const badge = pendenciasBadge({
    total: q.data?.total,
    isError: q.isError,
    isPending: q.isPending,
  });
  const Icon = item.icon;

  return (
    <NavLink
      to={item.to}
      title={item.description ?? item.label}
      aria-label={badge.rotuloAcessivel}
      className={({ isActive }) => cn(ITEM_BASE, isActive ? ITEM_ATIVO : ITEM_INATIVO)}
    >
      {({ isActive }) => (
        <>
          {isActive && <span className="ds-active-bar" aria-hidden />}
          <Icon
            size={16}
            strokeWidth={1.75}
            style={badge.destaque ? { color: 'var(--color-signal)' } : undefined}
          />
          <span style={{ fontFamily: 'var(--font-body)' }}>{item.label}</span>
          {badge.mostrar && (
            <span
              aria-hidden
              className="ds-data ml-auto rounded-full border px-2 py-0.5 text-[10px] font-medium"
              style={{
                backgroundColor: 'rgba(198, 40, 40, 0.16)',
                borderColor: 'rgba(198, 40, 40, 0.4)',
                color: 'var(--color-crimson-3)',
              }}
            >
              {badge.valor}
            </span>
          )}
        </>
      )}
    </NavLink>
  );
}

/** Selos informativos (contagem neutra) das rotas principais. */
function BadgeInfoDaRota({ to }: { to: string }) {
  if (to === '/library') return <BadgeBiblioteca />;
  if (to === '/design-systems') return <BadgeKits />;
  if (to === '/meus-projetos') return <BadgeMeusProjetos />;
  return null;
}

function BadgeInfo({ valor }: { valor: number }) {
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
  return <BadgeInfo valor={data?.items.length ?? 0} />;
}

/** Conta os kits (Design Systems finais). Compartilha o cache com a página Kits. */
function BadgeKits() {
  const { data } = useQuery({ queryKey: ['kits'], queryFn: api.listKits });
  return <BadgeInfo valor={data?.items.length ?? 0} />;
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
  return <BadgeInfo valor={data?.total ?? 0} />;
}
