import type { Blueprint } from '@/lib/api';
import { Campo, INPUT, type WizardBranding, inputStyle, rotulo } from '../partes';

export function StepConteudo({
  slots,
  mode,
  sections,
  onSection,
  branding,
  setB,
}: {
  slots: Blueprint['slots'];
  mode: 'blueprint' | 'criativo';
  sections: Record<string, string>;
  onSection: (role: string, v: string) => void;
  branding: WizardBranding;
  setB: (p: Partial<WizardBranding>) => void;
}) {
  return (
    <div className="space-y-6">
      {mode === 'blueprint' ? (
        <div className="space-y-3">
          <div className="text-[10px] uppercase tracking-[0.2em]" style={rotulo}>
            Texto por seção
          </div>
          {slots.map((s) => (
            <Campo key={s.role} label={s.label}>
              <textarea
                rows={2}
                value={sections[s.role] ?? ''}
                onChange={(e) => onSection(s.role, e.target.value)}
                placeholder={s.hint}
                className={`${INPUT} resize-none`}
                style={inputStyle}
              />
            </Campo>
          ))}
        </div>
      ) : (
        <div
          className="ds-glass-static rounded-lg p-4 text-[12px]"
          style={{ color: 'var(--color-fg-muted)' }}
        >
          No modo criativo o gerador decide as seções. Use o campo abaixo para descrever a mensagem
          central e deixe a estrutura com ele.
          <textarea
            rows={3}
            value={sections.hero ?? ''}
            onChange={(e) => onSection('hero', e.target.value)}
            placeholder="mensagem central do site"
            className={`${INPUT} mt-3 resize-none`}
            style={inputStyle}
          />
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-3">
          <div className="text-[10px] uppercase tracking-[0.2em]" style={rotulo}>
            Contato
          </div>
          <MiniInput
            label="E-mail"
            value={branding.contact.email}
            onChange={(v) => setB({ contact: { ...branding.contact, email: v } })}
          />
          <MiniInput
            label="Telefone"
            value={branding.contact.phone}
            onChange={(v) => setB({ contact: { ...branding.contact, phone: v } })}
          />
          <MiniInput
            label="WhatsApp"
            value={branding.contact.whatsapp}
            onChange={(v) => setB({ contact: { ...branding.contact, whatsapp: v } })}
          />
          <MiniInput
            label="Endereço"
            value={branding.contact.address}
            onChange={(v) => setB({ contact: { ...branding.contact, address: v } })}
          />
        </div>
        <div className="space-y-3">
          <div className="text-[10px] uppercase tracking-[0.2em]" style={rotulo}>
            CTA principal
          </div>
          <MiniInput
            label="Texto do botão"
            value={branding.mainCta.label}
            onChange={(v) => setB({ mainCta: { ...branding.mainCta, label: v } })}
          />
          <MiniInput
            label="Link"
            value={branding.mainCta.href}
            onChange={(v) => setB({ mainCta: { ...branding.mainCta, href: v } })}
          />
          <p
            className="pt-1 text-[11px] leading-relaxed"
            style={{ color: 'var(--color-fg-subtle)' }}
          >
            As redes sociais agora ficam em Marca → Redes sociais.
          </p>
        </div>
      </div>
    </div>
  );
}

function MiniInput({
  label,
  value,
  onChange,
}: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="block">
      <span className="ds-data mb-1 block text-[10px]" style={{ color: 'var(--color-fg-subtle)' }}>
        {label}
      </span>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-md border px-2.5 py-1.5 text-[12px] outline-none focus:border-[var(--color-signal)]"
        style={inputStyle}
      />
    </label>
  );
}
