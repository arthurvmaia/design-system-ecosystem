import { useToasts } from '@/lib/toast';
import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react';

const ICONE = { ok: CheckCircle2, erro: AlertCircle, info: Info } as const;
const COR = {
  ok: 'var(--color-primary)',
  erro: 'var(--color-ion-3)',
  info: 'var(--color-fg-muted)',
} as const;

/**
 * Pilha de toasts no canto inferior direito. `aria-live` para leitores de tela
 * anunciarem o feedback sem roubar o foco.
 */
export function Toaster() {
  const list = useToasts((s) => s.list);
  const dismiss = useToasts((s) => s.dismiss);

  if (list.length === 0) return null;

  return (
    // Acima de TUDO (modal 90, seletores flutuantes 120): um aviso de sucesso
    // ou erro não pode ficar escondido atrás do diálogo que o disparou.
    <div
      aria-live="polite"
      className="fixed right-5 bottom-5 z-[130] flex w-[320px] flex-col gap-2"
    >
      {list.map((t) => {
        const Icone = ICONE[t.kind];
        return (
          <div
            key={t.id}
            className="ds-glass-static ds-scale-in flex items-start gap-2.5 rounded-lg border p-3"
            style={{ borderColor: 'var(--color-border)' }}
          >
            <Icone size={15} className="mt-px shrink-0" style={{ color: COR[t.kind] }} />
            <div
              className="min-w-0 flex-1 text-[12px] leading-snug"
              style={{ color: 'var(--color-fg)' }}
            >
              {t.texto}
            </div>
            <button
              type="button"
              onClick={() => dismiss(t.id)}
              aria-label="Fechar aviso"
              className="shrink-0 opacity-40 transition-opacity hover:opacity-100"
            >
              <X size={13} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
