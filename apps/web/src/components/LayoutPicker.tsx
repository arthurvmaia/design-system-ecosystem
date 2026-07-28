import type { PlacementDoSlot } from '@ds/shared/schemas';
import { useQuery } from '@tanstack/react-query';
import { Shuffle, SlidersHorizontal } from 'lucide-react';

/**
 * Escolha de como o site é montado.
 *
 * Duas decisões, nesta ordem:
 *
 * 1. QUEM DEFINE A ESTRUTURA — você (blueprint) ou o gerador (criativo).
 * 2. QUAL estrutura, se você escolheu definir.
 *
 * Nos dois modos só entram componentes que você curou. O que muda é a
 * arquitetura da página, não o material.
 */

type Blueprint = {
  id: string;
  name: string;
  description: string;
  bestFor: string;
  slots: { role: string; label: string; required: boolean }[];
};

type Direction = { id: string; name: string; guidance: string };

export type LayoutChoice = {
  mode: 'blueprint' | 'criativo';
  blueprintId: string;
  disabledRoles: string[];
  /** Decisões por seção (seção × componente × instrução) — ver EtapaEstrutura. */
  placements: PlacementDoSlot[];
};

export function LayoutPicker({
  value,
  onChange,
}: {
  value: LayoutChoice;
  onChange: (v: LayoutChoice) => void;
}) {
  const { data } = useQuery({
    queryKey: ['blueprints'],
    queryFn: async () => {
      const res = await fetch('/api/projects/blueprints');
      if (!res.ok) throw new Error('não deu para carregar as estruturas');
      return res.json() as Promise<{ items: Blueprint[]; directions: Direction[] }>;
    },
  });

  const blueprints = data?.items ?? [];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <ModeCard
          active={value.mode === 'blueprint'}
          icon={<SlidersHorizontal size={14} />}
          title="Você escolhe a estrutura"
          description="Você monta o esqueleto da página e diz o que entra em cada seção. O site sai do jeito que você deixou, sem surpresa."
          onClick={() => onChange({ ...value, mode: 'blueprint' })}
        />
        <ModeCard
          active={value.mode === 'criativo'}
          icon={<Shuffle size={14} />}
          title="O gerador escolhe a estrutura"
          description="O gerador monta a página do jeito que achar melhor, usando só os componentes que você curou. Cada geração sai diferente."
          onClick={() => onChange({ ...value, mode: 'criativo' })}
        />
      </div>

      {value.mode === 'blueprint' && (
        <div className="ds-slide-up space-y-3">
          <div
            className="text-[10px] uppercase tracking-[0.28em]"
            style={{ color: 'var(--color-fg-subtle)', fontFamily: 'var(--font-display)' }}
          >
            Estrutura
          </div>

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {blueprints.map((b) => (
              <button
                key={b.id}
                type="button"
                onClick={() =>
                  onChange({ ...value, blueprintId: b.id, disabledRoles: [], placements: [] })
                }
                className="ds-glass rounded-lg p-3 text-left"
                style={
                  value.blueprintId === b.id ? { borderColor: 'var(--color-crimson-5)' } : undefined
                }
              >
                <div
                  className="text-[13px] font-semibold"
                  style={{ fontFamily: 'var(--font-display)' }}
                >
                  {b.name}
                </div>
                <div
                  className="mt-1 text-[11px] leading-snug"
                  style={{ color: 'var(--color-fg-muted)' }}
                >
                  {b.description}
                </div>
                <div
                  className="ds-data mt-2 text-[10px]"
                  style={{ color: 'var(--color-fg-subtle)' }}
                >
                  {b.slots.length} seções · {b.bestFor}
                </div>
              </button>
            ))}
          </div>

          {/* Ligar/desligar seções agora acontece na lista de seções da etapa
              Estrutura — uma decisão por vez, não tudo de uma vez aqui. */}
        </div>
      )}

      {value.mode === 'criativo' && (
        <div className="ds-slide-up ds-glass-static rounded-lg p-4">
          <div className="text-[12px] leading-relaxed" style={{ color: 'var(--color-fg-muted)' }}>
            A cada geração o sistema sorteia uma direção criativa e vai até o fim com ela. As
            direções são: editorial, assimétrica, densa, cinematográfica, minimalista ou narrativa.
            Se você gerar o mesmo projeto de novo, a página sai diferente.
          </div>
          <div className="ds-data mt-3 text-[10px]" style={{ color: 'var(--color-fg-subtle)' }}>
            {(data?.directions ?? []).map((d) => d.name).join(' · ')}
          </div>
        </div>
      )}
    </div>
  );
}

function ModeCard({
  active,
  icon,
  title,
  description,
  onClick,
}: {
  active: boolean;
  icon: React.ReactNode;
  title: string;
  description: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="ds-glass rounded-lg p-4 text-left"
      style={active ? { borderColor: 'var(--color-crimson-5)' } : undefined}
    >
      <div className="flex items-center gap-2">
        <span style={{ color: active ? 'var(--color-signal)' : 'var(--color-fg-subtle)' }}>
          {icon}
        </span>
        <span className="text-[13px] font-semibold" style={{ fontFamily: 'var(--font-display)' }}>
          {title}
        </span>
      </div>
      <div className="mt-2 text-[11px] leading-snug" style={{ color: 'var(--color-fg-muted)' }}>
        {description}
      </div>
    </button>
  );
}
