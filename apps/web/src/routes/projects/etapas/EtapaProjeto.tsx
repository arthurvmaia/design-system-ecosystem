import { Campo, INPUT, inputStyle, rotulo } from '../partes';

export function StepProjeto({
  name,
  onName,
  kitId,
  onKit,
  kits,
}: {
  name: string;
  onName: (v: string) => void;
  kitId: string | null;
  onKit: (id: string) => void;
  kits: Array<{ id: string; name: string; components: unknown[] }>;
}) {
  return (
    <div className="space-y-5">
      <Campo label="Nome do projeto">
        <input
          type="text"
          value={name}
          onChange={(e) => onName(e.target.value)}
          placeholder="Ex: Landing do Cliente X"
          className={INPUT}
          style={inputStyle}
        />
      </Campo>
      <div>
        <div className="mb-2 text-[10px] uppercase tracking-[0.2em]" style={rotulo}>
          Kit base <span style={{ color: 'var(--color-ion-3)' }}>*</span>
        </div>
        {kits.length === 0 ? (
          <div className="text-[12px]" style={{ color: 'var(--color-fg-subtle)' }}>
            Nenhum kit disponível. Monte um em Design Systems.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {kits.map((k) => (
              <button
                key={k.id}
                type="button"
                onClick={() => onKit(k.id)}
                className="ds-glass rounded-lg p-3 text-left"
                style={kitId === k.id ? { borderColor: 'var(--color-ion-5)' } : undefined}
              >
                <div className="text-[13px] font-medium" style={{ color: 'var(--color-fg)' }}>
                  {k.name}
                </div>
                <div
                  className="ds-data mt-1 text-[10px]"
                  style={{ color: 'var(--color-fg-subtle)' }}
                >
                  {k.components.length} componentes
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
