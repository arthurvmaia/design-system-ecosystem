import { type LayoutChoice, LayoutPicker } from '@/components/LayoutPicker';
import { Select } from '@/components/seletores';
import type { Blueprint, KitComponentRef } from '@/lib/api';
import {
  type PlacementDoSlot,
  ROLE_CATEGORIES,
  type SectionRole,
  resolverPlacements,
} from '@ds/shared/schemas';
import { rotulo } from '../partes';

const CRIAR = '__criar__';

/**
 * Estrutura da página como decisões EXPLÍCITAS: para cada seção ativa, o que a
 * ocupa — a sugestão automática, um componente fixado do kit ou uma criação no
 * estilo. Nada acontece por baixo dos panos: o painel mostra o que está em uso
 * e o que sobrou do kit. Tudo por seletores próprios (teclado completo).
 */
export function StepEstrutura({
  layout,
  onLayout,
  activeSlots,
  components,
}: {
  layout: LayoutChoice;
  onLayout: (l: LayoutChoice) => void;
  activeSlots: Blueprint['slots'];
  components: KitComponentRef[];
}) {
  const slots = activeSlots.map((s) => ({ ...s, role: s.role as SectionRole }));
  const resolvidos = resolverPlacements(slots, layout.placements, components);
  const porRole = new Map(resolvidos.map((r) => [r.role, r]));

  const emUso = new Set(
    resolvidos.map((r) => r.componente?.id).filter((id): id is string => id !== undefined),
  );
  const sobrando = components.filter((c) => !emUso.has(c.id));
  const doKit = resolvidos.filter((r) => r.componente !== null).length;
  const criados = resolvidos.length - doKit;

  const mudarPlacement = (role: SectionRole, patch: Partial<PlacementDoSlot>): void => {
    const existente = layout.placements.find((p) => p.role === role);
    const base: PlacementDoSlot = existente ?? {
      role,
      escolha: 'automatica',
      componentId: null,
    };
    const novo = { ...base, ...patch };
    const semObs = novo.observacao === undefined || novo.observacao.trim() === '';
    // voltar tudo ao automático limpa a entrada — o JSON não acumula ruído
    const placements =
      novo.escolha === 'automatica' && semObs
        ? layout.placements.filter((p) => p.role !== role)
        : [...layout.placements.filter((p) => p.role !== role), novo];
    onLayout({ ...layout, placements });
  };

  return (
    <div className="space-y-5">
      <LayoutPicker value={layout} onChange={onLayout} />

      {layout.mode === 'blueprint' && slots.length > 0 && (
        <div className="ds-glass-static rounded-lg p-4">
          <div className="mb-1 flex items-center justify-between gap-3">
            <div className="text-[10px] uppercase tracking-[0.2em]" style={rotulo}>
              O que ocupa cada seção
            </div>
            <output className="ds-data text-[10px]" style={{ color: 'var(--color-fg-subtle)' }}>
              {doKit} do kit · {criados} {criados === 1 ? 'criada' : 'criadas'} no estilo
            </output>
          </div>
          <p
            className="mb-3 text-[11px] leading-relaxed"
            style={{ color: 'var(--color-fg-muted)' }}
          >
            O automático distribui o kit pelas seções. Fixe um componente quando quiser mandar, ou
            peça uma seção criada no estilo do kit.
          </p>

          <div className="space-y-2">
            {slots.map((s) => {
              const r = porRole.get(s.role);
              const placement = layout.placements.find((p) => p.role === s.role);
              const cats = ROLE_CATEGORIES[s.role] ?? [];
              const valor =
                placement?.escolha === 'componente' && placement.componentId !== null
                  ? placement.componentId
                  : placement?.escolha === 'criar'
                    ? CRIAR
                    : '';
              const rotuloAuto =
                r?.origem !== 'escolhido' && r?.componente !== null && r !== undefined
                  ? `Automático — ${r.componente.name}`
                  : 'Automático — criada no estilo do kit';
              const opcoes = [
                {
                  valor: '',
                  rotulo: rotuloAuto,
                  descricao: 'A sugestão pode mudar se o kit mudar.',
                },
                ...components.map((c) => ({
                  valor: c.id,
                  rotulo: c.name,
                  grupo: cats.includes(c.category) ? 'Encaixa neste papel' : 'Outros do kit',
                })),
                {
                  valor: CRIAR,
                  rotulo: 'Criar no estilo do kit',
                  descricao: 'Uma seção nova com as cores, fontes e densidade do kit.',
                },
              ];
              return (
                <div
                  key={s.role}
                  className="grid items-center gap-2 rounded-md border p-2 sm:grid-cols-[150px_1fr_1fr]"
                  style={{ borderColor: 'var(--color-border)' }}
                >
                  <span className="text-[12px]" style={{ color: 'var(--color-fg)' }}>
                    {s.label}
                    {r?.origem === 'escolhido' && (
                      <span
                        className="ds-data ml-1.5 rounded-full px-1.5 py-0.5 text-[9px]"
                        style={{
                          backgroundColor: 'rgba(107,20,20,0.24)',
                          color: 'var(--color-fg)',
                        }}
                      >
                        fixado
                      </span>
                    )}
                  </span>
                  <Select
                    opcoes={opcoes}
                    valor={valor}
                    rotulo={`O que ocupa a seção ${s.label}`}
                    aoMudar={(v) =>
                      mudarPlacement(
                        s.role,
                        v === ''
                          ? { escolha: 'automatica', componentId: null }
                          : v === CRIAR
                            ? { escolha: 'criar', componentId: null }
                            : { escolha: 'componente', componentId: v },
                      )
                    }
                  />
                  <input
                    type="text"
                    value={placement?.observacao ?? ''}
                    onChange={(e) => mudarPlacement(s.role, { observacao: e.target.value })}
                    placeholder="instrução opcional (ex.: 3 colunas)"
                    aria-label={`Instrução para a seção ${s.label}`}
                    className="w-full rounded-md border bg-transparent px-2.5 py-1.5 text-[11px] outline-none focus:border-[var(--color-signal)]"
                    style={{ borderColor: 'var(--color-border)', color: 'var(--color-fg)' }}
                  />
                </div>
              );
            })}
          </div>

          {sobrando.length > 0 && (
            <div className="mt-3 border-t pt-3" style={{ borderColor: 'var(--color-border)' }}>
              <div className="mb-1.5 text-[10px] uppercase tracking-[0.2em]" style={rotulo}>
                Do kit, ainda sem seção
              </div>
              <div className="flex flex-wrap gap-1.5">
                {sobrando.map((c) => (
                  <span
                    key={c.id}
                    className="ds-tag rounded-full border px-2.5 py-1 text-[11px]"
                    style={{ borderColor: 'var(--color-border)', color: 'var(--color-fg-muted)' }}
                  >
                    {c.name}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
