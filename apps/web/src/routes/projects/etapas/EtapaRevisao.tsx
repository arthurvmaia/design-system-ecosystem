import type { Blueprint, MediaItem } from '@/lib/api';
import { Sparkles } from 'lucide-react';
import type { WizardBranding } from '../partes';

export function StepRevisao({
  name,
  kit,
  branding,
  activeSlots,
  mode,
  sections,
  media,
}: {
  name: string;
  kit: { name: string; components: unknown[] } | null;
  branding: WizardBranding;
  activeSlots: Blueprint['slots'];
  mode: 'blueprint' | 'criativo';
  sections: Record<string, string>;
  media: MediaItem[];
}) {
  return (
    <div className="space-y-4">
      <div className="ds-glass-static rounded-lg p-4">
        <Linha rotulo="Projeto" valor={name || '—'} />
        <Linha
          rotulo="Kit base"
          valor={kit ? `${kit.name} · ${kit.components.length} componentes` : '—'}
        />
        <Linha rotulo="Marca" valor={branding.brandName || '—'} />
        <Linha
          rotulo="Estrutura"
          valor={
            mode === 'blueprint' ? `${activeSlots.length} seções` : 'criativa (o gerador decide)'
          }
        />
        <Linha
          rotulo="Seções com texto"
          valor={String(Object.values(sections).filter((v) => v.trim()).length)}
        />
        <Linha rotulo="Mídias" valor={String(media.length)} />
      </div>
      <div
        className="flex items-start gap-2 rounded-lg p-3 text-[12px] leading-relaxed"
        style={{ backgroundColor: 'rgba(107,20,20,0.16)', color: 'var(--color-fg)' }}
      >
        <Sparkles size={14} className="mt-0.5 shrink-0" style={{ color: 'var(--color-signal)' }} />
        <span>
          Ao gerar, o site usa <strong>somente os componentes do kit</strong> como base visual e
          aplica a sua marca, o seu texto e a sua mídia. Slots sem peça no kit são criados no estilo
          dele. Nada de texto ou marca do site de origem é copiado.
        </span>
      </div>
    </div>
  );
}

function Linha({ rotulo: r, valor }: { rotulo: string; valor: string }) {
  return (
    <div
      className="flex items-center justify-between border-b py-2 text-[13px] last:border-0"
      style={{ borderColor: 'var(--color-border)' }}
    >
      <span style={{ color: 'var(--color-fg-subtle)' }}>{r}</span>
      <span style={{ color: 'var(--color-fg)' }}>{valor}</span>
    </div>
  );
}
