import { X } from 'lucide-react';
import { type ReactNode, useEffect } from 'react';

/**
 * Sobreposição modal genérica.
 *
 * `position: fixed` escapa do `overflow-hidden` do Shell — não precisa de portal.
 * Fecha no Esc e no clique fora; o clique dentro do painel não propaga para o
 * fundo. É a base de ConfirmPop, do modal de detalhe e do editor de kit.
 */

const LARGURA = {
  sm: 'max-w-[420px]',
  md: 'max-w-[640px]',
  lg: 'max-w-[900px]',
  xl: 'max-w-[1200px]',
} as const;

export function Modal({
  open,
  onClose,
  children,
  size = 'md',
  title,
  className,
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  size?: keyof typeof LARGURA;
  title?: string;
  className?: string;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: Esc fecha via listener global; o clique no fundo é só um atalho de mouse, não a única saída.
    <div
      className="ds-fade-in fixed inset-0 z-[90] flex items-center justify-center p-6"
      style={{ backgroundColor: 'rgba(0, 0, 0, 0.6)', backdropFilter: 'blur(6px)' }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="presentation"
    >
      {/* biome-ignore lint/a11y/useSemanticElements: dialog + aria-modal é padrão ARIA válido; <dialog> nativo exige showModal() e traz estilo default inconsistente. */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`ds-glass-static ds-scale-in relative flex max-h-[88vh] w-full flex-col overflow-hidden rounded-xl ${LARGURA[size]} ${className ?? ''}`}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Fechar"
          className="absolute top-3 right-3 z-10 rounded-full p-1.5 opacity-50 transition-all duration-300 hover:bg-white/[0.06] hover:opacity-100"
        >
          <X size={16} style={{ color: 'var(--color-fg)' }} />
        </button>
        {children}
      </div>
    </div>
  );
}
