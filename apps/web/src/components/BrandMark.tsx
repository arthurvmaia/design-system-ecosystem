/**
 * Marca do produto. Sem logotipo, como pedido.
 * O typemark carrega a identidade através do peso e do espaçamento.
 * O ponto vermelho é a única concessão a ornamento e serve de âncora
 * visual para a assinatura da marca no header do sidebar.
 *
 * A referência põe a marca dentro de um bloco com gradiente que inclina e pulsa
 * sob o cursor. Sem logotipo, quem recebe esse tratamento é o conjunto: o
 * typemark inteiro inclina e o ponto bate uma vez.
 */
export function BrandMark() {
  return (
    <div className="ds-logo-hover flex cursor-default items-baseline gap-2 select-none">
      <span
        className="ds-interactive-text text-[15px] font-semibold tracking-[0.14em] uppercase"
        style={{ fontFamily: 'var(--font-display)', color: 'var(--color-fg)' }}
      >
        Design System
      </span>
      <span
        className="text-[11px] font-medium tracking-[0.32em] uppercase"
        style={{ fontFamily: 'var(--font-display)', color: 'var(--color-fg-muted)' }}
      >
        Ecosystem
      </span>
      <span
        aria-hidden
        className="ds-logo-dot ds-glow ml-0.5 inline-block h-[5px] w-[5px] rounded-full"
        style={{ backgroundColor: 'var(--color-signal)' }}
      />
    </div>
  );
}
