import { cn } from '@/lib/cn';
import {
  type OpcaoDeSeletor,
  alternarMulti,
  moverAtivo,
  promoverPrincipal,
} from '@/lib/seletor-core';
import { ChevronDown, Star, X } from 'lucide-react';
import { useCallback, useId, useRef, useState } from 'react';
import { Flutuante } from './Flutuante';
import { ListaDeOpcoes, classeGatilho } from './partes';

/**
 * MultiSelect com chips, limite e item PRINCIPAL (o primeiro da seleção).
 * Para tons de voz, arquétipos e papéis: escolher vários, com um dominante.
 *
 * Teclado: tudo do Select, mais Backspace no gatilho removendo o último chip.
 * A lista fica aberta ao alternar (seleção múltipla fecha por Esc/clique fora)
 * e o limite recusa com mensagem visível — nunca em silêncio.
 */
export function MultiSelect({
  opcoes,
  valores,
  aoMudar,
  limite,
  comPrincipal = false,
  placeholder = 'Selecionar…',
  rotulo,
  desabilitado = false,
  className,
}: {
  opcoes: OpcaoDeSeletor[];
  valores: string[];
  aoMudar: (valores: string[]) => void;
  limite?: number;
  /** O primeiro selecionado é o PRINCIPAL, com destaque e promoção por clique. */
  comPrincipal?: boolean;
  placeholder?: string;
  rotulo?: string;
  desabilitado?: boolean;
  className?: string;
}) {
  const id = useId();
  const gatilhoRef = useRef<HTMLButtonElement>(null);
  const [aberto, setAberto] = useState(false);
  const [ativo, setAtivo] = useState<number | null>(null);
  const [recusa, setRecusa] = useState(false);

  const fechar = useCallback((devolverFoco = true) => {
    setAberto(false);
    setAtivo(null);
    setRecusa(false);
    if (devolverFoco) gatilhoRef.current?.focus();
  }, []);

  const alternar = (indice: number): void => {
    const opcao = opcoes[indice];
    if (opcao === undefined || opcao.desabilitada) return;
    const r = alternarMulti(valores, opcao.valor, limite);
    setRecusa(r.recusadoPorLimite);
    if (!r.recusadoPorLimite) aoMudar(r.selecao);
  };

  const aoTeclar = (e: React.KeyboardEvent): void => {
    if (desabilitado) return;
    if (!aberto) {
      if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) {
        e.preventDefault();
        setAberto(true);
        setAtivo(moverAtivo(opcoes, null, 'ArrowDown'));
      } else if (e.key === 'Backspace' && valores.length > 0) {
        aoMudar(valores.slice(0, -1));
      }
      return;
    }
    if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) {
      e.preventDefault();
      setAtivo((a) => moverAtivo(opcoes, a, e.key as 'ArrowDown'));
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (ativo !== null) alternar(ativo);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      fechar();
    } else if (e.key === 'Tab') {
      fechar(false);
    }
  };

  const chips = valores
    .map((v) => opcoes.find((o) => o.valor === v))
    .filter((o): o is OpcaoDeSeletor => o !== undefined);

  return (
    <div className={cn('relative', className)}>
      <button
        ref={gatilhoRef}
        type="button"
        role="combobox"
        aria-expanded={aberto}
        aria-controls={`${id}-lista`}
        aria-activedescendant={ativo !== null ? `${id}-opcao-${ativo}` : undefined}
        aria-label={rotulo}
        disabled={desabilitado}
        onClick={() => {
          if (aberto) {
            fechar();
          } else {
            setAberto(true);
            setAtivo(null);
          }
        }}
        onKeyDown={aoTeclar}
        className={cn(classeGatilho(false, desabilitado), 'min-h-[38px] flex-wrap')}
      >
        {chips.length === 0 ? (
          <span className="opacity-50">{placeholder}</span>
        ) : (
          <span className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
            {chips.map((o, i) => (
              <span
                key={o.valor}
                className="ds-tag inline-flex items-center gap-1 rounded-none border px-2 py-0.5 text-[11px]"
                style={{
                  borderColor:
                    comPrincipal && i === 0 ? 'var(--color-primary)' : 'var(--color-border)',
                  color: comPrincipal && i === 0 ? 'var(--color-primary)' : 'var(--color-fg-muted)',
                }}
              >
                {comPrincipal && i === 0 && <Star size={9} aria-label="principal" />}
                {o.rotulo}
                {comPrincipal && i > 0 && (
                  <Star
                    size={9}
                    role="button"
                    aria-label={`Tornar ${o.rotulo} principal`}
                    tabIndex={-1}
                    className="cursor-pointer opacity-30 hover:opacity-100"
                    onClick={(e) => {
                      e.stopPropagation();
                      aoMudar(promoverPrincipal(valores, o.valor));
                    }}
                  />
                )}
                <X
                  size={10}
                  role="button"
                  aria-label={`Remover ${o.rotulo}`}
                  tabIndex={-1}
                  className="cursor-pointer opacity-50 hover:opacity-100"
                  onClick={(e) => {
                    e.stopPropagation();
                    aoMudar(valores.filter((v) => v !== o.valor));
                  }}
                />
              </span>
            ))}
          </span>
        )}
        <ChevronDown
          size={14}
          className={cn('shrink-0 opacity-50 transition-transform', aberto && 'rotate-180')}
        />
      </button>
      {recusa && limite !== undefined && (
        <output
          className="mt-1 block text-[11px]"
          style={{ color: 'var(--color-signal, #eab308)' }}
        >
          Você já escolheu {limite}. Remova um para adicionar outro.
        </output>
      )}
      <Flutuante aberto={aberto} gatilhoRef={gatilhoRef} aoFechar={() => fechar(false)}>
        <ListaDeOpcoes
          idBase={id}
          opcoes={opcoes}
          ativo={ativo}
          selecionados={valores}
          aoPassarMouse={setAtivo}
          aoEscolher={alternar}
          multi
        />
      </Flutuante>
    </div>
  );
}
