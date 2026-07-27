import { cn } from '@/lib/cn';
import { ChevronDown, X } from 'lucide-react';
import { useState } from 'react';

/** Cabeçalho padrão de cada painel da Marca: título, explicação e selo opcional. */
export function SecaoCabecalho({
  titulo,
  descricao,
  opcional,
}: {
  titulo: string;
  descricao: string;
  opcional?: boolean;
}) {
  return (
    <div className="mb-4">
      <div className="flex items-center gap-2">
        <h3 className="text-[15px] font-medium" style={{ color: 'var(--color-fg)' }}>
          {titulo}
        </h3>
        {opcional && (
          <span
            className="rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-[0.12em]"
            style={{ borderColor: 'var(--color-border)', color: 'var(--color-fg-subtle)' }}
          >
            Opcional
          </span>
        )}
      </div>
      <p className="mt-1 text-[12px] leading-relaxed" style={{ color: 'var(--color-fg-muted)' }}>
        {descricao}
      </p>
    </div>
  );
}

/** Bloco recolhível para o avançado — fechado por padrão, nada obriga a abrir. */
export function Recolhivel({
  rotulo,
  detalhe,
  children,
}: {
  rotulo: string;
  detalhe?: string;
  children: React.ReactNode;
}) {
  const [aberto, setAberto] = useState(false);
  return (
    <div className="rounded-lg border" style={{ borderColor: 'var(--color-border)' }}>
      <button
        type="button"
        onClick={() => setAberto((a) => !a)}
        aria-expanded={aberto}
        className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left text-[12px] transition-colors hover:text-[var(--color-fg)]"
        style={{ color: 'var(--color-fg-muted)' }}
      >
        <span className="min-w-0">
          {rotulo}
          {detalhe && (
            <span className="ml-2 text-[10px]" style={{ color: 'var(--color-fg-subtle)' }}>
              {detalhe}
            </span>
          )}
        </span>
        <ChevronDown
          size={13}
          className={cn('shrink-0 transition-transform', aberto && 'rotate-180')}
        />
      </button>
      {aberto && (
        <div className="border-t px-3 py-3" style={{ borderColor: 'var(--color-border)' }}>
          {children}
        </div>
      )}
    </div>
  );
}

/**
 * Lista editável de palavras: Enter ou vírgula adiciona, X (ou Backspace com o
 * campo vazio) remove. Para o vocabulário preferido/evitado da voz da marca.
 */
export function ChipsInput({
  valores,
  aoMudar,
  placeholder,
  rotulo,
}: {
  valores: string[];
  aoMudar: (valores: string[]) => void;
  placeholder?: string;
  rotulo: string;
}) {
  const [texto, setTexto] = useState('');

  const adicionar = (): void => {
    const v = texto.trim().replace(/,+$/, '');
    setTexto('');
    if (v === '' || valores.includes(v)) return;
    aoMudar([...valores, v]);
  };

  return (
    <div
      className="flex min-h-[38px] flex-wrap items-center gap-1.5 rounded-md border px-2 py-1.5"
      style={{ borderColor: 'var(--color-border)', backgroundColor: 'rgba(0,0,0,0.35)' }}
    >
      {valores.map((v) => (
        <span
          key={v}
          className="ds-tag inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px]"
          style={{ borderColor: 'var(--color-border)', color: 'var(--color-fg-muted)' }}
        >
          {v}
          <X
            size={10}
            role="button"
            aria-label={`Remover ${v}`}
            tabIndex={-1}
            className="cursor-pointer opacity-50 hover:opacity-100"
            onClick={() => aoMudar(valores.filter((x) => x !== v))}
          />
        </span>
      ))}
      <input
        type="text"
        value={texto}
        aria-label={rotulo}
        placeholder={valores.length === 0 ? placeholder : undefined}
        onChange={(e) => setTexto(e.target.value)}
        onBlur={adicionar}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ',') {
            e.preventDefault();
            adicionar();
          } else if (e.key === 'Backspace' && texto === '' && valores.length > 0) {
            aoMudar(valores.slice(0, -1));
          }
        }}
        className="min-w-[120px] flex-1 bg-transparent text-[12px] outline-none"
        style={{ color: 'var(--color-fg)' }}
      />
    </div>
  );
}
