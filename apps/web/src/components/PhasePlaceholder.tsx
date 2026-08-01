import type { ReactNode } from 'react';

/**
 * Placeholder de página. Usado nas rotas que ainda não têm implementação
 * (a maioria na Fase 0). Comunica o estado real do trabalho: nome da fase,
 * o que já está pronto, o que virá. Nada de "coming soon" vago.
 *
 * A entrada é escalonada: rótulo, título, intenção e colunas chegam em sequência
 * com 50ms de intervalo. É o mesmo `delay-100..600` da referência — o que faz a
 * página parecer montada e não despejada.
 */
export function PhasePlaceholder({
  phase,
  title,
  intent,
  ready,
  next,
  children,
}: {
  phase: string;
  title: string;
  intent: string;
  ready: readonly string[];
  next: readonly string[];
  children?: ReactNode;
}) {
  return (
    <div className="mx-auto max-w-[880px] px-8 py-16">
      <div
        className="ds-slide-up text-[11px] uppercase tracking-[0.32em]"
        style={{ color: 'var(--color-signal)', fontFamily: 'var(--font-display)' }}
      >
        {phase}
      </div>
      <h1
        className="ds-slide-up ds-d1 ds-text-glow mt-3 text-[42px] font-medium leading-[1.05] tracking-tight"
        style={{ color: 'var(--color-fg)', fontFamily: 'var(--font-display)' }}
      >
        {title}
      </h1>
      <p
        className="ds-slide-up ds-d2 mt-4 max-w-[62ch] text-[15px] leading-[1.6]"
        style={{ color: 'var(--color-fg-muted)' }}
      >
        {intent}
      </p>

      <div className="mt-14 grid grid-cols-1 gap-6 md:grid-cols-2">
        <StatusColumn label="Já disponível" tone="ready" items={ready} delay="ds-d3" />
        <StatusColumn label="A construir" tone="next" items={next} delay="ds-d4" />
      </div>

      {children ? <div className="ds-slide-up ds-d5 mt-14">{children}</div> : null}
    </div>
  );
}

function StatusColumn({
  label,
  tone,
  items,
  delay,
}: {
  label: string;
  tone: 'ready' | 'next';
  items: readonly string[];
  delay: string;
}) {
  // A animação de entrada fica no invólucro e o cartão no filho, de propósito:
  // `ds-slide-up` usa fill-mode both, então ela continua aplicando o transform
  // final depois de terminar — e animação ganha de :hover na cascata. Nas duas
  // no mesmo elemento, a inclinação do cartão nunca aconteceria.
  return (
    <div className={`ds-slide-up ${delay}`}>
      <div className="ds-glass-static ds-card rounded-xl p-6">
        <div className="ds-card-content">
          <div
            className="text-[10px] uppercase tracking-[0.28em]"
            style={{ color: 'var(--color-fg-subtle)', fontFamily: 'var(--font-display)' }}
          >
            {label}
          </div>
          <ul className="mt-4 space-y-3">
            {items.map((item) => (
              <li key={item} className="flex items-start gap-3">
                <span
                  aria-hidden
                  className="mt-[9px] h-[3px] w-[10px] shrink-0 rounded-none"
                  style={{
                    backgroundColor:
                      tone === 'ready' ? 'var(--color-signal)' : 'var(--color-border-strong)',
                    boxShadow: tone === 'ready' ? '0 0 10px rgba(16,185,129,0.5)' : undefined,
                  }}
                />
                <span className="text-[14px] leading-[1.5]" style={{ color: 'var(--color-fg)' }}>
                  {item}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
