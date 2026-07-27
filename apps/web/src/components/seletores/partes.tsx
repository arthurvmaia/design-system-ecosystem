import { cn } from '@/lib/cn';
import { type OpcaoDeSeletor, moverAtivo } from '@/lib/seletor-core';
import { Check } from 'lucide-react';
import { useEffect, useRef } from 'react';

/**
 * Partes compartilhadas dos seletores: a LISTA de opções (listbox) e o estilo
 * do gatilho. Uma lista só para Select/Combobox/MultiSelect — mesmo visual,
 * mesmos estados (ativa, selecionada, desabilitada, vazia), mesma rolagem da
 * ativa para dentro da vista.
 */

/** Índice ativo inicial ao ABRIR: o selecionado, senão a primeira habilitada. */
export const aoAbrirLista = (
  opcoes: readonly OpcaoDeSeletor[],
  valor: string | null,
  tecla?: 'ArrowDown' | 'ArrowUp',
): number | null => {
  const doValor = valor === null ? -1 : opcoes.findIndex((o) => o.valor === valor);
  if (doValor >= 0 && !opcoes[doValor]?.desabilitada) return doValor;
  return moverAtivo(opcoes, null, tecla ?? 'ArrowDown');
};

export const classeGatilho = (invalido: boolean, desabilitado: boolean): string =>
  cn(
    'flex w-full items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left text-[13px] transition-colors',
    'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-primary)]',
    invalido
      ? 'border-[var(--color-crimson-6)]'
      : 'border-[var(--color-border)] hover:border-[var(--color-border-strong)]',
    desabilitado && 'cursor-not-allowed opacity-50',
  );

export function ListaDeOpcoes({
  idBase,
  opcoes,
  ativo,
  selecionados,
  aoPassarMouse,
  aoEscolher,
  multi = false,
  mensagemVazia = 'Nenhuma opção disponível.',
}: {
  idBase: string;
  opcoes: readonly OpcaoDeSeletor[];
  ativo: number | null;
  selecionados: readonly string[];
  aoPassarMouse: (i: number) => void;
  aoEscolher: (i: number) => void;
  multi?: boolean;
  mensagemVazia?: string;
}) {
  const listaRef = useRef<HTMLUListElement>(null);

  // A opção ATIVA acompanha a rolagem — navegação por teclado numa lista longa
  // sem isto deixa a ativa fora da vista.
  useEffect(() => {
    if (ativo === null) return;
    const el = document.getElementById(`${idBase}-opcao-${ativo}`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [ativo, idBase]);

  if (opcoes.length === 0) {
    return (
      <p className="px-3 py-4 text-center text-[12px]" style={{ color: 'var(--color-fg-subtle)' }}>
        {mensagemVazia}
      </p>
    );
  }

  let grupoAtual: string | undefined;

  return (
    <ul
      ref={listaRef}
      id={`${idBase}-lista`}
      role="listbox"
      aria-multiselectable={multi || undefined}
      className="max-h-[inherit] overflow-y-auto py-1"
    >
      {opcoes.map((o, i) => {
        const cabecalho = o.grupo !== undefined && o.grupo !== grupoAtual ? o.grupo : null;
        grupoAtual = o.grupo ?? grupoAtual;
        const selecionada = selecionados.includes(o.valor);
        return (
          <li key={o.valor} role="presentation">
            {cabecalho !== null && (
              <div
                className="ds-data px-3 pt-2 pb-1 text-[10px] uppercase tracking-[0.14em]"
                style={{ color: 'var(--color-fg-subtle)' }}
              >
                {cabecalho}
              </div>
            )}
            {/* biome-ignore lint/a11y/useKeyWithClickEvents: o teclado vive no gatilho (aria-activedescendant) — padrão combobox */}
            <div
              id={`${idBase}-opcao-${i}`}
              role="option"
              aria-selected={selecionada}
              aria-disabled={o.desabilitada || undefined}
              onPointerEnter={() => !o.desabilitada && aoPassarMouse(i)}
              onClick={() => !o.desabilitada && aoEscolher(i)}
              className={cn(
                'mx-1 flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-[13px]',
                i === ativo && 'bg-white/[0.07]',
                o.desabilitada && 'cursor-not-allowed opacity-40',
              )}
              style={{ color: 'var(--color-fg)' }}
            >
              <span
                className={cn(
                  'flex size-4 shrink-0 items-center justify-center rounded',
                  multi && 'border',
                  multi && (selecionada ? 'border-transparent' : 'border-[var(--color-border)]'),
                )}
                style={
                  multi && selecionada ? { backgroundColor: 'var(--color-primary)' } : undefined
                }
                aria-hidden
              >
                {selecionada && <Check size={12} className={multi ? 'text-white' : undefined} />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate">{o.rotulo}</span>
                {o.descricao !== undefined && (
                  <span
                    className="block truncate text-[11px]"
                    style={{ color: 'var(--color-fg-subtle)' }}
                  >
                    {o.descricao}
                  </span>
                )}
              </span>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
