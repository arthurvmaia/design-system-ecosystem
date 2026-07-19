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
      if (!res.ok) throw new Error('falha ao carregar estruturas');
      return res.json() as Promise<{ items: Blueprint[]; directions: Direction[] }>;
    },
  });

  const blueprints = data?.items ?? [];
  const selecionado = blueprints.find((b) => b.id === value.blueprintId);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <ModeCard
          active={value.mode === 'blueprint'}
          icon={<SlidersHorizontal size={14} />}
          title="Eu defino a estrutura"
          description="Você escolhe o esqueleto da página. O gerador só decide qual componente ocupa cada posição. Resultado previsível."
          onClick={() => onChange({ ...value, mode: 'blueprint' })}
        />
        <ModeCard
          active={value.mode === 'criativo'}
          icon={<Shuffle size={14} />}
          title="Use sua criatividade"
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
                onClick={() => onChange({ ...value, blueprintId: b.id, disabledRoles: [] })}
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

          {selecionado && (
            <div className="ds-glass-static rounded-lg p-3">
              <div
                className="mb-2 text-[10px] uppercase tracking-[0.28em]"
                style={{ color: 'var(--color-fg-subtle)', fontFamily: 'var(--font-display)' }}
              >
                Seções — clique para ligar ou desligar
              </div>
              <div className="flex flex-wrap gap-1.5">
                {selecionado.slots.map((s) => {
                  const desligado = value.disabledRoles.includes(s.role);
                  return (
                    <button
                      key={s.role}
                      type="button"
                      disabled={s.required}
                      onClick={() =>
                        onChange({
                          ...value,
                          disabledRoles: desligado
                            ? value.disabledRoles.filter((r) => r !== s.role)
                            : [...value.disabledRoles, s.role],
                        })
                      }
                      className="ds-tag rounded-full border px-2.5 py-1 text-[11px] transition-all disabled:cursor-default"
                      style={{
                        borderColor: desligado ? 'var(--color-border)' : 'var(--color-crimson-7)',
                        backgroundColor: desligado ? 'transparent' : 'rgba(107,20,20,0.22)',
                        color: desligado ? 'var(--color-fg-subtle)' : 'var(--color-fg)',
                        opacity: s.required ? 0.75 : 1,
                      }}
                      title={s.required ? 'Obrigatória nesta estrutura' : undefined}
                    >
                      {s.label}
                      {s.required && ' *'}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {value.mode === 'criativo' && (
        <div className="ds-slide-up ds-glass-static rounded-lg p-4">
          <div className="text-[12px] leading-relaxed" style={{ color: 'var(--color-fg-muted)' }}>
            A cada geração o sistema sorteia uma direção criativa — editorial, assimétrica, densa,
            cinematográfica, minimalista ou narrativa — e se compromete com ela. Gerar o mesmo
            projeto de novo produz uma página diferente.
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
