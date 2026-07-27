import type { Blueprint } from '@/lib/api';
import { ROTEIRO_POR_SECAO } from '@/lib/conteudo-roteiro';
import type { BriefDaSecao, SectionRole } from '@ds/shared/schemas';
import { briefVazio } from '@ds/shared/schemas';
import { Sparkles } from 'lucide-react';
import { Campo, INPUT, type WizardBranding, inputStyle, rotulo } from '../partes';

const BRIEF_NOVO: BriefDaSecao = { pontos: [], provas: [], iaDecide: false };

/**
 * Conteúdo GUIADO por seção: cada papel pergunta o que precisa (mensagem,
 * pontos, provas, chamada) em vez de um textão genérico. Seções que não pedem
 * conteúdo dizem isso na cara — nada de campo vazio sem explicação.
 */
export function StepConteudo({
  slots,
  mode,
  briefs,
  onBrief,
  branding,
  setB,
}: {
  slots: Blueprint['slots'];
  mode: 'blueprint' | 'criativo';
  briefs: Record<string, BriefDaSecao>;
  onBrief: (role: string, b: BriefDaSecao) => void;
  branding: WizardBranding;
  setB: (p: Partial<WizardBranding>) => void;
}) {
  const briefDe = (role: string): BriefDaSecao => briefs[role] ?? BRIEF_NOVO;
  const mudar = (role: string, patch: Partial<BriefDaSecao>): void =>
    onBrief(role, { ...briefDe(role), ...patch });

  return (
    <div className="space-y-6">
      {mode === 'blueprint' ? (
        <div className="space-y-3">
          <div className="text-[10px] uppercase tracking-[0.2em]" style={rotulo}>
            O que cada seção diz
          </div>
          {slots.map((s) => {
            const roteiro = ROTEIRO_POR_SECAO[s.role as SectionRole] ?? null;
            const brief = briefDe(s.role);
            const preenchida = !briefVazio(brief);
            return (
              <div
                key={s.role}
                className="rounded-lg border p-3"
                style={{ borderColor: 'var(--color-border)' }}
              >
                <div className="mb-2 flex items-center gap-2">
                  <span className="text-[14px] font-medium" style={{ color: 'var(--color-fg)' }}>
                    {s.label}
                  </span>
                  {brief.iaDecide ? (
                    <span
                      className="flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] uppercase tracking-[0.08em]"
                      style={{ backgroundColor: 'rgba(107,20,20,0.24)', color: 'var(--color-fg)' }}
                    >
                      <Sparkles size={9} />
                      com a IA
                    </span>
                  ) : (
                    preenchida && (
                      <span
                        className="rounded-full px-2 py-0.5 text-[10px] uppercase tracking-[0.08em]"
                        style={{
                          backgroundColor: 'rgba(107,20,20,0.24)',
                          color: 'var(--color-fg)',
                        }}
                      >
                        preenchida
                      </span>
                    )
                  )}
                  {roteiro !== null && (
                    <button
                      type="button"
                      onClick={() => mudar(s.role, { iaDecide: !brief.iaDecide })}
                      className="ml-auto flex items-center gap-1.5 rounded-full border px-3 py-1 text-[12px] transition-colors hover:border-[var(--color-signal)]"
                      style={{
                        borderColor: brief.iaDecide
                          ? 'var(--color-crimson-5)'
                          : 'var(--color-border-strong)',
                        color: brief.iaDecide ? 'var(--color-fg)' : 'var(--color-fg-muted)',
                      }}
                    >
                      <Sparkles size={11} />
                      {brief.iaDecide ? 'Escrever eu mesmo' : 'Deixar a IA decidir'}
                    </button>
                  )}
                </div>
                {roteiro !== null && brief.iaDecide ? (
                  <p
                    className="rounded-md px-3 py-2.5 text-[13px] leading-relaxed"
                    style={{
                      backgroundColor: 'rgba(107,20,20,0.10)',
                      color: 'var(--color-fg-muted)',
                    }}
                  >
                    A IA escreve esta seção com a sua marca, a sua voz e o que você já contou nas
                    outras etapas. Ela não inventa fatos, números nem clientes — sem informação, o
                    texto sai seguro e fácil de editar depois. O que você já escreveu aqui fica
                    guardado.
                  </p>
                ) : roteiro === null ? (
                  <p className="text-[12px]" style={{ color: 'var(--color-fg-subtle)' }}>
                    Esta seção usa a marca, o contato e as redes — nada a preencher aqui.
                  </p>
                ) : (
                  <div className="space-y-2.5">
                    {roteiro.campos.map((campo) => {
                      const dica = roteiro.dica[campo];
                      if (dica === undefined) return null;
                      if (campo === 'mensagem' || campo === 'cta') {
                        return (
                          <Campo key={campo} label={dica.label}>
                            {campo === 'mensagem' ? (
                              <textarea
                                rows={2}
                                value={brief.mensagem ?? ''}
                                onChange={(e) =>
                                  mudar(s.role, { mensagem: e.target.value || undefined })
                                }
                                placeholder={dica.placeholder}
                                className={`${INPUT} resize-none`}
                                style={inputStyle}
                              />
                            ) : (
                              <input
                                type="text"
                                value={brief.cta ?? ''}
                                onChange={(e) =>
                                  mudar(s.role, { cta: e.target.value || undefined })
                                }
                                placeholder={dica.placeholder}
                                className={INPUT}
                                style={inputStyle}
                              />
                            )}
                          </Campo>
                        );
                      }
                      const valores = campo === 'pontos' ? brief.pontos : brief.provas;
                      return (
                        <Campo key={campo} label={dica.label}>
                          <textarea
                            rows={3}
                            value={valores.join('\n')}
                            onChange={(e) => mudar(s.role, { [campo]: e.target.value.split('\n') })}
                            placeholder={dica.placeholder}
                            className={`${INPUT} resize-none`}
                            style={inputStyle}
                          />
                        </Campo>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div
          className="ds-glass-static rounded-lg p-4 text-[12px]"
          style={{ color: 'var(--color-fg-muted)' }}
        >
          Na composição inteligente o gerador decide as seções. Descreva a mensagem central e deixe
          a estrutura com ele.
          <textarea
            rows={3}
            value={briefDe('hero').mensagem ?? ''}
            onChange={(e) => mudar('hero', { mensagem: e.target.value || undefined })}
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
