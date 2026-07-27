import { cn } from '@/lib/cn';
import { type LucideIcon, MoreHorizontal } from 'lucide-react';
import { type ReactNode, useCallback, useEffect, useId, useRef, useState } from 'react';
import { Flutuante } from './Flutuante';

export type ItemDeMenu = {
  id: string;
  rotulo: string;
  icone?: LucideIcon;
  desabilitado?: boolean;
  /** Ação destrutiva ganha a cor de perigo e confirmação fica no chamador. */
  destrutivo?: boolean;
  aoEscolher: () => void;
};

/**
 * Menu de ações (padrão ARIA de menu): foco REAL viaja pelos itens (roving),
 * ↓/↑ com loop, Home/End, Esc fecha e devolve o foco ao gatilho, Enter/Espaço
 * disparam. Diferente do listbox dos selects, aqui cada item é um botão focável.
 */
export function MenuAcoes({
  itens,
  rotulo = 'Mais ações',
  gatilho,
  className,
}: {
  itens: ItemDeMenu[];
  rotulo?: string;
  /** Conteúdo do gatilho; o padrão é o ícone de reticências. */
  gatilho?: ReactNode;
  className?: string;
}) {
  const id = useId();
  const gatilhoRef = useRef<HTMLButtonElement>(null);
  const [aberto, setAberto] = useState(false);
  const [foco, setFoco] = useState(0);

  const fechar = useCallback((devolverFoco = true) => {
    setAberto(false);
    if (devolverFoco) gatilhoRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!aberto) return;
    document.getElementById(`${id}-item-${foco}`)?.focus();
  }, [aberto, foco, id]);

  const habilitados = itens.flatMap((it, i) => (it.desabilitado ? [] : [i]));

  const mover = (delta: 1 | -1): void => {
    if (habilitados.length === 0) return;
    const pos = habilitados.indexOf(foco);
    const proxima = (pos + delta + habilitados.length) % habilitados.length;
    setFoco(habilitados[proxima] as number);
  };

  const aoTeclarNoMenu = (e: React.KeyboardEvent): void => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      mover(1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      mover(-1);
    } else if (e.key === 'Home') {
      e.preventDefault();
      if (habilitados[0] !== undefined) setFoco(habilitados[0]);
    } else if (e.key === 'End') {
      e.preventDefault();
      const ultimo = habilitados[habilitados.length - 1];
      if (ultimo !== undefined) setFoco(ultimo);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      fechar();
    } else if (e.key === 'Tab') {
      fechar(false);
    }
  };

  return (
    <div className={cn('relative inline-block', className)}>
      <button
        ref={gatilhoRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={aberto}
        aria-controls={`${id}-menu`}
        aria-label={rotulo}
        onClick={() => {
          if (aberto) {
            fechar();
          } else {
            setAberto(true);
            setFoco(habilitados[0] ?? 0);
          }
        }}
        onKeyDown={(e) => {
          if (!aberto && ['ArrowDown', 'Enter', ' '].includes(e.key)) {
            e.preventDefault();
            setAberto(true);
            setFoco(habilitados[0] ?? 0);
          }
        }}
        className="rounded-lg border p-2 transition-colors hover:border-[var(--color-border-strong)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-primary)]"
        style={{ borderColor: 'var(--color-border)', color: 'var(--color-fg-muted)' }}
      >
        {gatilho ?? <MoreHorizontal size={14} />}
      </button>
      <Flutuante
        aberto={aberto}
        gatilhoRef={gatilhoRef}
        aoFechar={() => fechar(false)}
        larguraDoGatilho={false}
      >
        <div
          id={`${id}-menu`}
          role="menu"
          aria-label={rotulo}
          onKeyDown={aoTeclarNoMenu}
          className="min-w-44 py-1"
        >
          {itens.map((it, i) => {
            const Icone = it.icone;
            return (
              <button
                key={it.id}
                id={`${id}-item-${i}`}
                type="button"
                role="menuitem"
                disabled={it.desabilitado}
                tabIndex={i === foco ? 0 : -1}
                onClick={() => {
                  fechar();
                  it.aoEscolher();
                }}
                className={cn(
                  'mx-1 flex w-[calc(100%-8px)] items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px]',
                  'hover:bg-white/[0.07] focus-visible:bg-white/[0.07] focus-visible:outline-none',
                  it.desabilitado && 'cursor-not-allowed opacity-40',
                )}
                style={{
                  color: it.destrutivo ? 'var(--color-crimson-5)' : 'var(--color-fg)',
                }}
              >
                {Icone !== undefined && <Icone size={13} className="shrink-0 opacity-70" />}
                {it.rotulo}
              </button>
            );
          })}
        </div>
      </Flutuante>
    </div>
  );
}
