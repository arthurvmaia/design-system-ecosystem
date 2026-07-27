import { type LayoutChoice, LayoutPicker } from '@/components/LayoutPicker';
import type { Blueprint } from '@/lib/api';
import { ROLE_CATS, rotulo } from '../partes';

export function StepEstrutura({
  layout,
  onLayout,
  activeSlots,
  kitCategories,
}: {
  layout: LayoutChoice;
  onLayout: (l: LayoutChoice) => void;
  activeSlots: Blueprint['slots'];
  kitCategories: Set<string>;
}) {
  return (
    <div className="space-y-5">
      <LayoutPicker value={layout} onChange={onLayout} />

      {layout.mode === 'blueprint' && activeSlots.length > 0 && (
        <div className="ds-glass-static rounded-lg p-4">
          <div className="mb-3 text-[10px] uppercase tracking-[0.2em]" style={rotulo}>
            O que vem do seu kit
          </div>
          <div className="space-y-1.5">
            {activeSlots.map((s) => {
              const cats = ROLE_CATS[s.role] ?? [];
              const doKit = cats.some((cat) => kitCategories.has(cat));
              return (
                <div key={s.role} className="flex items-center justify-between text-[12px]">
                  <span style={{ color: 'var(--color-fg)' }}>{s.label}</span>
                  <span
                    className="ds-data rounded-full px-2 py-0.5 text-[10px]"
                    style={{
                      backgroundColor: doKit ? 'rgba(107,20,20,0.24)' : 'rgba(255,255,255,0.05)',
                      color: doKit ? 'var(--color-fg)' : 'var(--color-fg-subtle)',
                    }}
                  >
                    {doKit ? 'do seu kit' : 'criado no estilo'}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
