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
 * com blur, então a grade e o halo atravessam a coluna em vez de morrerem atrás
 * dela.
 *
 * Duas zonas com pesos diferentes: as funcionalidades PRINCIPAIS (fluxo de
 * criar/organizar/gerar) na lista de cima; as AUXILIARES (Pendências e
 * Configurações — exceção e operação) no rodapé, separadas por um divisor. A
 * config das duas listas mora em `@/lib/nav`.
 *
 * O fluxo é NUMERADO. É a mudança que mais muda a leitura da coluna: uma lista
 * de links diz "escolha um lugar"; uma lista numerada diz "este é o caminho, e
 * você está no passo 3". O trabalho aqui tem ordem — extrair, escolher, curar,
 * montar, gerar — e a numeração torna essa ordem visível sem uma linha de texto
 * explicando.
 */
export function Sidebar() {
  return (
    // z-10, o MESMO da coluna de conteúdo, e não mais que ela. Empate resolve
    // pela ordem do documento, e o conteúdo vem depois: é o que faz um modal
    // aberto numa tela cobrir a barra. Com z-20 aqui, o `z-[90]` do modal não
    // adiantava nada — ele mora dentro da coluna, e índice de filho não escapa
    // do contexto de empilhamento do pai. O modal do painel de peças aparecia
    // com o título cortado atrás da barra.
    <aside
      className="ds-backdrop relative z-10 flex h-full w-[260px] shrink-0 flex-col border-r"
      style={{ borderColor: 'var(--color-border)', backgroundColor: 'rgba(0, 0, 0, 0.6)' }}
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
            {primaryNav.map((item, i) => (
              <li key={item.to}>
                <NavItem item={item} passo={i + 1} />
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
  return <div className="ds-label px-3">{children}</div>;
}

/**
 * Item genérico da navegação. O ativo vira vidro e ganha a barra ciano na borda;
 * o inativo desliza 2px sob o cursor. O `title` dá tooltip (útil se um dia a
 * coluna recolher para ícones).
 *
 * `passo` só é passado pelo fluxo principal: o número é a posição no caminho.
 * Os itens auxiliares não recebem, porque não são etapa de nada — e numerá-los
 * sugeriria uma ordem que não existe.
 */
function NavItem({ item, passo }: { item: NavItemDef; passo?: number }) {
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
          {passo !== undefined && (
            <span
              aria-hidden
              className="ds-data w-[16px] shrink-0 text-[10px]"
              style={{ color: isActive ? 'var(--color-ion-4)' : 'var(--color-fg-subtle)' }}
            >
              {String(passo).padStart(2, '0')}
            </span>
          )}
          <Icon size={15} strokeWidth={1.75} />
          <span className="min-w-0 truncate" style={{ fontFamily: 'var(--font-body)' }}>
            {item.label}
          </span>
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
              className="ds-data ml-auto rounded-none border px-2 py-0.5 text-[10px] font-medium"
              style={{
                backgroundColor: 'rgba(245,158,11,0.16)',
                borderColor: 'rgba(245,158,11,0.45)',
                color: 'var(--color-ion-3)',
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
      className="ds-data ds-tag ml-auto rounded-none border px-2 py-0.5 text-[10px] font-medium"
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
