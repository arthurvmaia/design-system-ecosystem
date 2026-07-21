import { Loader2 } from 'lucide-react';
import type { ReactNode } from 'react';
import { Modal } from './Modal';

/**
 * Confirmação reutilizável para ações destrutivas.
 *
 * `description` aceita nós React, então cabe o impacto ("some de 2 kits", "leva
 * junto os sites gerados") — a pessoa decide informada, não no escuro. Quando
 * `danger`, o botão de confirmar é vermelho; senão, primário.
 */
export function ConfirmPop({
  open,
  title,
  description,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  danger = true,
  busy = false,
  onConfirm,
  onClose,
}: {
  open: boolean;
  title: string;
  description?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <Modal open={open} onClose={onClose} size="sm" title={title}>
      <div className="p-6">
        <div
          className="text-[16px] font-medium"
          style={{ color: 'var(--color-fg)', fontFamily: 'var(--font-display)' }}
        >
          {title}
        </div>
        {description && (
          <div
            className="mt-2 text-[13px] leading-relaxed"
            style={{ color: 'var(--color-fg-muted)' }}
          >
            {description}
          </div>
        )}
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded-full px-4 py-2 text-[12px] transition-colors hover:text-[var(--color-fg)] disabled:opacity-40"
            style={{ color: 'var(--color-fg-muted)' }}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className="ds-btn flex items-center gap-2 rounded-full px-4 py-2 text-[12px] font-medium disabled:opacity-50"
            style={{
              backgroundColor: danger ? 'var(--color-crimson-6)' : 'var(--color-primary)',
              color: 'var(--color-bone-1)',
            }}
          >
            {busy && <Loader2 size={12} className="animate-spin" />}
            {confirmLabel}
          </button>
        </div>
      </div>
    </Modal>
  );
}
