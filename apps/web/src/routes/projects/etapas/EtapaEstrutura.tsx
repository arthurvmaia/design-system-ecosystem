import { type LayoutChoice, LayoutPicker } from '@/components/LayoutPicker';
import { Select } from '@/components/seletores';
import type { Blueprint, KitComponentRef } from '@/lib/api';
import { cn } from '@/lib/cn';
import {
  type PlacementDoSlot,
  ROLE_CATEGORIES,
  type SectionRole,
  resolverPlacements,
} from '@ds/shared/schemas';
import { ChevronDown, Power } from 'lucide-react';
import { useState } from 'react';
import { rotulo } from '../partes';

const CRIAR = '__criar__';

/**
 * Estrutura com UMA decisão por vez:
 * 1. como compor (guiada × inteligente);
 * 2. qual modelo de página;
 * 3. um RESUMO simples das seções — cada linha diz o que a ocupa;
 * 4. ajustar uma seção SÓ quando a pessoa quiser (acordeão), inclusive
 *    ligar/desligar as opcionais.
 *
 * Nada de expor todos os controles de todas as seções de uma vez, e nenhum
 * termo interno: aqui existem "seções", "do seu kit" e "criada no estilo".
 */
export function StepEstrutura({
  layout,
  onLayout,
  todosSlots,
  components,
}: {
  layout: LayoutChoice;
  onLayout: (l: LayoutChoice) => void;
  todosSlots: Blueprint['slots'];
  components: KitComponentRef[];
}) {
  const [aberta, setAberta] = useState<string | null>(null);

  const ativos = todosSlots
    .filter((s) => s.required || !layout.disabledRoles.includes(s.role))
    .map((s) => ({ ...s, role: s.role as SectionRole }));
  const resolvidos = new Map(
    resolverPlacements(ativos, layout.placements, components).map((r) => [r.role as string, r]),
  );

  const doKit = [...resolvidos.values()].filter((r) => r.componente !== null).length;
  const criadas = resolvidos.size - doKit;
  const emUso = new Set(
    [...resolvidos.values()]
      .map((r) => r.componente?.id)
      .filter((id): id is string => id !== undefined),
  );
  const sobrando = components.filter((c) => !emUso.has(c.id));

  const mudarPlacement = (role: SectionRole, patch: Partial<PlacementDoSlot>): void => {
    const existente = layout.placements.find((p) => p.role === role);
    const base: PlacementDoSlot = existente ?? { role, escolha: 'automatica', componentId: null };
    const novo = { ...base, ...patch };
    const semObs = novo.observacao === undefined || novo.observacao.trim() === '';
    const placements =
      novo.escolha === 'automatica' && semObs
        ? layout.placements.filter((p) => p.role !== role)
        : [...layout.placements.filter((p) => p.role !== role), novo];
    onLayout({ ...layout, placements });
  };

  const alternarSecao = (role: string, desligada: boolean): void => {
    onLayout({
      ...layout,
      disabledRoles: desligada
        ? layout.disabledRoles.filter((r) => r !== role)
        : [...layout.disabledRoles, role],
      placements: desligada ? layout.placements : layout.placements.filter((p) => p.role !== role),
    });
  };

  return (
    <div className="space-y-6">
      <LayoutPicker value={layout} onChange={onLayout} />

      {layout.mode === 'blueprint' && todosSlots.length > 0 && (
        <div>
          <div className="mb-1 flex items-baseline justify-between gap-3">
            <div className="text-[11px] uppercase tracking-[0.2em]" style={rotulo}>
              As seções do seu site
            </div>
            <output className="text-[12px]" style={{ color: 'var(--color-fg-subtle)' }}>
              {resolvidos.size} seções · {doKit} do seu kit · {criadas}{' '}
              {criadas === 1 ? 'criada' : 'criadas'} no estilo
            </output>
          </div>
          <p
            className="mb-3 text-[13px] leading-relaxed"
            style={{ color: 'var(--color-fg-muted)' }}
          >
            Cada seção já tem uma sugestão. Toque em uma para trocar a peça, dar uma instrução ou
            desligá-la — o seu kit pode ter menos peças que seções: uma peça pode se repetir, e o
            que faltar é criado no estilo do kit.
          </p>

          <div className="space-y-1.5">
            {todosSlots.map((s) => {
              const desligada = !s.required && layout.disabledRoles.includes(s.role);
              const r = resolvidos.get(s.role);
              const placement = layout.placements.find((p) => p.role === s.role);
              const expandida = aberta === s.role && !desligada;
              const cats = ROLE_CATEGORIES[s.role as SectionRole] ?? [];

              if (desligada) {
                return (
                  <div
                    key={s.role}
                    className="flex items-center justify-between rounded-md border border-dashed px-3.5 py-2.5"
                    style={{ borderColor: 'var(--color-border)', opacity: 0.6 }}
                  >
                    <span className="text-[13px]" style={{ color: 'var(--color-fg-subtle)' }}>
                      {s.label} — desligada
                    </span>
                    <button
                      type="button"
                      onClick={() => alternarSecao(s.role, true)}
                      className="flex items-center gap-1.5 rounded-full border px-3 py-1 text-[12px] transition-colors hover:border-[var(--color-signal)]"
                      style={{
                        borderColor: 'var(--color-border-strong)',
                        color: 'var(--color-fg-muted)',
                      }}
                    >
                      <Power size={11} />
                      Ligar
                    </button>
                  </div>
                );
              }

              const resumo =
                r?.componente != null
                  ? r.origem === 'escolhido'
                    ? `${r.componente.name} — escolhida por você`
                    : r.componente.name
                  : 'criada no estilo do kit';

              return (
                <div
                  key={s.role}
                  className="overflow-hidden rounded-md border"
                  style={{
                    borderColor: expandida ? 'var(--color-border-strong)' : 'var(--color-border)',
                  }}
                >
                  <button
                    type="button"
                    onClick={() => setAberta(expandida ? null : s.role)}
                    aria-expanded={expandida}
                    className="flex w-full items-center gap-3 px-3.5 py-3 text-left transition-colors hover:bg-white/[0.03]"
                  >
                    <span
                      className="w-[130px] shrink-0 text-[14px]"
                      style={{ color: 'var(--color-fg)' }}
                    >
                      {s.label}
                      {s.required && (
                        <span
                          className="ml-1"
                          style={{ color: 'var(--color-fg-subtle)' }}
                          title="Esta seção faz parte do modelo escolhido"
                        >
                          *
                        </span>
                      )}
                    </span>
                    <span
                      className="min-w-0 flex-1 truncate text-[13px]"
                      style={{
                        color:
                          r?.componente != null
                            ? 'var(--color-fg-muted)'
                            : 'var(--color-fg-subtle)',
                      }}
                    >
                      {resumo}
                    </span>
                    <span
                      className="ds-tag shrink-0 rounded-full px-2 py-0.5 text-[10px] uppercase tracking-[0.08em]"
                      style={{
                        backgroundColor:
                          r?.componente != null ? 'rgba(107,20,20,0.24)' : 'rgba(255,255,255,0.05)',
                        color: r?.componente != null ? 'var(--color-fg)' : 'var(--color-fg-subtle)',
                      }}
                    >
                      {r?.componente != null ? 'do seu kit' : 'no estilo'}
                    </span>
                    <ChevronDown
                      size={14}
                      className={cn('shrink-0 transition-transform', expandida && 'rotate-180')}
                      style={{ color: 'var(--color-fg-subtle)' }}
                    />
                  </button>

                  {expandida && (
                    <div
                      className="space-y-3 border-t px-3.5 py-3.5"
                      style={{ borderColor: 'var(--color-border)' }}
                    >
                      <div>
                        <span
                          className="mb-1.5 block text-[11px] uppercase tracking-[0.16em]"
                          style={rotulo}
                        >
                          O que ocupa esta seção
                        </span>
                        <Select
                          opcoes={[
                            {
                              valor: '',
                              rotulo:
                                r?.origem !== 'escolhido' && r?.componente != null
                                  ? `Automático — ${r.componente.name}`
                                  : 'Automático — criada no estilo do kit',
                              descricao: 'A sugestão pode mudar se o kit mudar.',
                            },
                            ...components.map((c) => ({
                              valor: c.id,
                              rotulo: c.name,
                              grupo: cats.includes(c.category)
                                ? 'Encaixa neste papel'
                                : 'Outras peças do kit',
                            })),
                            {
                              valor: CRIAR,
                              rotulo: 'Criar no estilo do kit',
                              descricao: 'Uma seção nova com as cores, fontes e o clima do kit.',
                            },
                          ]}
                          valor={
                            placement?.escolha === 'componente' && placement.componentId !== null
                              ? placement.componentId
                              : placement?.escolha === 'criar'
                                ? CRIAR
                                : ''
                          }
                          rotulo={`O que ocupa a seção ${s.label}`}
                          aoMudar={(v) =>
                            mudarPlacement(
                              s.role as SectionRole,
                              v === ''
                                ? { escolha: 'automatica', componentId: null }
                                : v === CRIAR
                                  ? { escolha: 'criar', componentId: null }
                                  : { escolha: 'componente', componentId: v },
                            )
                          }
                        />
                      </div>
                      <label className="block">
                        <span
                          className="mb-1.5 block text-[11px] uppercase tracking-[0.16em]"
                          style={rotulo}
                        >
                          Alguma instrução? (opcional)
                        </span>
                        <input
                          type="text"
                          value={placement?.observacao ?? ''}
                          onChange={(e) =>
                            mudarPlacement(s.role as SectionRole, { observacao: e.target.value })
                          }
                          placeholder="ex.: 3 colunas, fundo escuro, sem foto"
                          className="w-full rounded-md border bg-transparent px-3 py-2 text-[13px] outline-none focus:border-[var(--color-signal)]"
                          style={{ borderColor: 'var(--color-border)', color: 'var(--color-fg)' }}
                        />
                      </label>
                      {!s.required && (
                        <button
                          type="button"
                          onClick={() => alternarSecao(s.role, false)}
                          className="flex items-center gap-1.5 text-[12px] underline"
                          style={{ color: 'var(--color-fg-muted)' }}
                        >
                          <Power size={11} />
                          Desligar esta seção
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {sobrando.length > 0 && (
            <div className="mt-4">
              <div className="mb-1.5 text-[11px] uppercase tracking-[0.2em]" style={rotulo}>
                Peças do kit ainda sem seção
              </div>
              <div className="flex flex-wrap gap-1.5">
                {sobrando.map((c) => (
                  <span
                    key={c.id}
                    className="ds-tag rounded-full border px-2.5 py-1 text-[12px]"
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
