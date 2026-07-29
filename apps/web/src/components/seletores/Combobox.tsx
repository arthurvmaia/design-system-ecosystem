import { Mascote } from '@/components/Mascote';
import { cn } from '@/lib/cn';
import { type OpcaoDeSeletor, filtrarOpcoes, moverAtivo } from '@/lib/seletor-core';
import { ChevronDown } from 'lucide-react';
import { useCallback, useId, useMemo, useRef, useState } from 'react';
import { Flutuante } from './Flutuante';
import { ListaDeOpcoes } from './partes';

/**
 * Combobox com busca — para listas grandes (fontes, kits, componentes).
 * O foco fica no INPUT; a opção ativa viaja por `aria-activedescendant`; o
 * filtro (sem acento, prefixo primeiro) vem do núcleo puro e é testado lá.
 */
export function Combobox({
  opcoes,
  valor,
  aoMudar,
  placeholder = 'Buscar…',
  rotulo,
  desabilitado = false,
  invalido = false,
  carregando = false,
  className,
}: {
  opcoes: OpcaoDeSeletor[];
  valor: string | null;
  aoMudar: (valor: string) => void;
  placeholder?: string;
  rotulo?: string;
  desabilitado?: boolean;
  invalido?: boolean;
  carregando?: boolean;
  className?: string;
}) {
  const id = useId();
  const raizRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [aberto, setAberto] = useState(false);
  const [consulta, setConsulta] = useState('');
  const [ativo, setAtivo] = useState<number | null>(null);

  const selecionada = opcoes.find((o) => o.valor === valor) ?? null;
  const filtradas = useMemo(() => filtrarOpcoes(opcoes, consulta), [opcoes, consulta]);

  const fechar = useCallback((devolverFoco = true) => {
    setAberto(false);
    setConsulta('');
    setAtivo(null);
    if (devolverFoco) inputRef.current?.focus();
  }, []);

  const escolher = (indice: number): void => {
    const opcao = filtradas[indice];
    if (opcao === undefined || opcao.desabilitada) return;
    aoMudar(opcao.valor);
    fechar();
  };

  const aoTeclar = (e: React.KeyboardEvent): void => {
    if (!aberto && ['ArrowDown', 'ArrowUp'].includes(e.key)) {
      e.preventDefault();
      setAberto(true);
      setAtivo(moverAtivo(filtradas, null, e.key as 'ArrowDown'));
      return;
    }
    if (!aberto) return;
    if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) {
      e.preventDefault();
      setAtivo((a) => moverAtivo(filtradas, a, e.key as 'ArrowDown'));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (ativo !== null) escolher(ativo);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      fechar();
    } else if (e.key === 'Tab') {
      fechar(false);
    }
  };

  return (
    <div ref={raizRef} className={cn('relative', className)}>
      <div
        className={cn(
          'flex w-full items-center gap-2 rounded-lg border px-3 py-2 transition-colors focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-[var(--color-primary)]',
          invalido
            ? 'border-[var(--color-ion-6)]'
            : 'border-[var(--color-border)] hover:border-[var(--color-border-strong)]',
          desabilitado && 'cursor-not-allowed opacity-50',
        )}
      >
        <input
          ref={inputRef}
          type="text"
          role="combobox"
          aria-expanded={aberto}
          aria-controls={`${id}-lista`}
          aria-activedescendant={ativo !== null ? `${id}-opcao-${ativo}` : undefined}
          aria-label={rotulo}
          aria-invalid={invalido || undefined}
          aria-autocomplete="list"
          autoComplete="off"
          disabled={desabilitado}
          value={aberto ? consulta : (selecionada?.rotulo ?? '')}
          placeholder={selecionada?.rotulo ?? placeholder}
          onFocus={() => setAberto(true)}
          onChange={(e) => {
            setConsulta(e.target.value);
            setAberto(true);
            setAtivo(moverAtivo(filtrarOpcoes(opcoes, e.target.value), null, 'ArrowDown'));
          }}
          onKeyDown={aoTeclar}
          className="min-w-0 flex-1 bg-transparent text-[13px] outline-none placeholder:opacity-50"
          style={{ color: 'var(--color-fg)' }}
        />
        {carregando ? (
          <Mascote tamanho={14} girando esmaecido className="shrink-0" />
        ) : (
          <ChevronDown
            size={14}
            className={cn('shrink-0 opacity-50 transition-transform', aberto && 'rotate-180')}
          />
        )}
      </div>
      <Flutuante aberto={aberto} gatilhoRef={raizRef} aoFechar={() => fechar(false)}>
        <ListaDeOpcoes
          idBase={id}
          opcoes={filtradas}
          ativo={ativo}
          selecionados={valor === null ? [] : [valor]}
          aoPassarMouse={setAtivo}
          aoEscolher={escolher}
          mensagemVazia={carregando ? 'Carregando…' : 'Nada encontrado com essa busca.'}
        />
      </Flutuante>
    </div>
  );
}
