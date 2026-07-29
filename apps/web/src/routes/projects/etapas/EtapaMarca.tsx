import {
  type MarcaSubId,
  STATUS_LABEL,
  type SecaoStatus,
  marcaSectionStatus,
} from '@/lib/generator-sections';
import { useState } from 'react';
import type { WizardBranding } from '../partes';
import { PainelContato } from './marca/PainelContato';
import { PainelMarca } from './marca/PainelMarca';
import { PainelPaleta } from './marca/PainelPaleta';
import { PainelRedes } from './marca/PainelRedes';
import { PainelTipografia } from './marca/PainelTipografia';
import { PainelVoz } from './marca/PainelVoz';

type MarcaSecaoDef = { id: MarcaSubId; label: string; peso: 'recomendado' | 'opcional' };
const MARCA_SECOES: MarcaSecaoDef[] = [
  { id: 'marca', label: 'Marca', peso: 'recomendado' },
  { id: 'voz', label: 'Voz da marca', peso: 'recomendado' },
  { id: 'paleta', label: 'Paleta', peso: 'recomendado' },
  { id: 'tipografia', label: 'Tipografia', peso: 'recomendado' },
  { id: 'contato', label: 'Contato e chamada', peso: 'recomendado' },
  { id: 'redes', label: 'Redes sociais', peso: 'opcional' },
];

/**
 * A etapa "Marca" em subseções independentes: uma navegação interna abre um
 * formulário por vez (Marca, Voz, Paleta, Tipografia, Redes) em vez de empilhar
 * tudo numa tela só. Cada item mostra status e um resumo do que já foi
 * preenchido. É a defesa direta contra a tela carregada.
 */
export function StepMarca({
  branding,
  setB,
  projectId,
}: {
  branding: WizardBranding;
  setB: (p: Partial<WizardBranding>) => void;
  projectId: string | null;
}) {
  const [sub, setSub] = useState<MarcaSubId>('marca');
  const status = marcaSectionStatus(branding);

  return (
    <div className="flex flex-col gap-5 md:flex-row">
      <nav
        aria-label="Seções da marca"
        className="flex gap-1.5 overflow-x-auto pb-1 md:w-[188px] md:flex-col md:overflow-visible md:pb-0"
      >
        {MARCA_SECOES.map((s) => {
          const info = status[s.id];
          const ativo = sub === s.id;
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => setSub(s.id)}
              aria-current={ativo ? 'page' : undefined}
              className={`flex shrink-0 items-center gap-2.5 rounded-md px-3 py-2 text-left text-[13px] transition-all duration-200 ${ativo ? 'ds-glass-static text-[var(--color-fg)]' : 'text-[var(--color-fg-muted)] hover:bg-white/[0.04] hover:text-[var(--color-fg)]'}`}
            >
              <StatusDot status={info.status} />
              <span className="min-w-0">
                <span className="block text-[14px]">{s.label}</span>
                <span
                  className="block max-w-[132px] truncate text-[11px]"
                  style={{ color: 'var(--color-fg-subtle)' }}
                >
                  {info.status === 'configurado'
                    ? info.resumo
                    : s.peso === 'opcional'
                      ? 'Opcional'
                      : 'Recomendado'}
                </span>
              </span>
            </button>
          );
        })}
      </nav>

      <div className="min-w-0 flex-1">
        {sub === 'marca' && <PainelMarca branding={branding} setB={setB} projectId={projectId} />}
        {sub === 'voz' && <PainelVoz branding={branding} setB={setB} />}
        {sub === 'paleta' && <PainelPaleta branding={branding} setB={setB} />}
        {sub === 'tipografia' && <PainelTipografia branding={branding} setB={setB} />}
        {sub === 'contato' && <PainelContato branding={branding} setB={setB} />}
        {sub === 'redes' && <PainelRedes branding={branding} setB={setB} />}
      </div>
    </div>
  );
}

/** Ponto de status: não depende só de cor — tem título/aria com o rótulo textual. */
function StatusDot({ status }: { status: SecaoStatus }) {
  const cor =
    status === 'configurado'
      ? 'var(--color-signal)'
      : status === 'opcional'
        ? 'var(--color-fg-subtle)'
        : 'var(--color-border-strong)';
  return (
    <span
      title={STATUS_LABEL[status]}
      aria-label={STATUS_LABEL[status]}
      className="inline-block h-[7px] w-[7px] shrink-0 rounded-full"
      style={{
        backgroundColor: cor,
        boxShadow: status === 'configurado' ? '0 0 8px rgba(56,189,248,0.6)' : undefined,
      }}
    />
  );
}
