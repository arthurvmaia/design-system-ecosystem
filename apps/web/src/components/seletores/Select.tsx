import { cn } from '@/lib/cn';
import {
  type EstadoTypeahead,
  type OpcaoDeSeletor,
  aplicarTypeahead,
  moverAtivo,
} from '@/lib/seletor-core';
import { ChevronDown } from 'lucide-react';
import { useCallback, useId, useRef, useState } from 'react';
import { Flutuante } from './Flutuante';
import { ListaDeOpcoes, aoAbrirLista, classeGatilho } from './partes';

/**
 * Select próprio — substitui o `<select>` nativo nas áreas customizadas.
 *
 * Padrão ARIA de combobox somente-leitura: o FOCO permanece no gatilho e a
 * opção ativa viaja por `aria-activedescendant`. Teclado completo: ↓/↑ abrem e
 * movem (pulando desabilitadas, com loop), Home/End, busca por digitação,
 * Enter/Espaço selecionam, Esc fecha e devolve o foco. O comportamento vem do
 * núcleo puro (`seletor-core`), coberto por teste sem navegador.
 */
export function Select({
  opcoes,
  valor,
  aoMudar,
  placeholder = 'Selecionar…',
  rotulo,
  desabilitado = false,
  invalido = false,
  className,
}: {
  opcoes: OpcaoDeSeletor[];
  valor: string | null;
  aoMudar: (valor: string) => void;
  placeholder?: string;
  /** Rótulo acessível quando não há <label> externo apontando para o id. */
  rotulo?: string;
  desabilitado?: boolean;
  invalido?: boolean;
  className?: string;
}) {
  const id = useId();
  const gatilhoRef = useRef<HTMLButtonElement>(null);
  const [aberto, setAberto] = useState(false);
  const [ativo, setAtivo] = useState<number | null>(null);
  const typeahead = useRef<EstadoTypeahead>({ buffer: '', ultimoMs: 0 });

  const selecionada = opcoes.find((o) => o.valor === valor) ?? null;

  const fechar = useCallback((devolverFoco = true) => {
    setAberto(false);
    setAtivo(null);
    if (devolverFoco) gatilhoRef.current?.focus();
  }, []);

  const abrir = (tecla?: 'ArrowDown' | 'ArrowUp'): void => {
    setAberto(true);
    setAtivo(aoAbrirLista(opcoes, valor, tecla));
  };

  const escolher = (indice: number): void => {
    const opcao = opcoes[indice];
    if (opcao === undefined || opcao.desabilitada) return;
    aoMudar(opcao.valor);
    fechar();
  };

  const aoTeclar = (e: React.KeyboardEvent): void => {
    if (desabilitado) return;
    if (!aberto) {
      if (['ArrowDown', 'ArrowUp'].includes(e.key)) {
        e.preventDefault();
        abrir(e.key as 'ArrowDown' | 'ArrowUp');
      } else if (['Enter', ' '].includes(e.key)) {
        e.preventDefault();
        abrir();
      }
      return;
    }
    if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) {
      e.preventDefault();
      setAtivo((a) => moverAtivo(opcoes, a, e.key as 'ArrowDown'));
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (ativo !== null) escolher(ativo);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      fechar();
    } else if (e.key === 'Tab') {
      fechar(false);
    } else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      const r = aplicarTypeahead(opcoes, ativo, typeahead.current, e.key, Date.now());
      typeahead.current = r.estado;
      if (r.ativo !== null) setAtivo(r.ativo);
    }
  };

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
        aria-invalid={invalido || undefined}
        disabled={desabilitado}
        onClick={() => (aberto ? fechar() : abrir())}
        onKeyDown={aoTeclar}
        className={classeGatilho(invalido, desabilitado)}
      >
        <span className={cn('truncate', selecionada === null && 'opacity-50')}>
          {selecionada?.rotulo ?? placeholder}
        </span>
        <ChevronDown
          size={14}
          className={cn('shrink-0 opacity-50 transition-transform', aberto && 'rotate-180')}
        />
      </button>
      <Flutuante aberto={aberto} gatilhoRef={gatilhoRef} aoFechar={() => fechar(false)}>
        <ListaDeOpcoes
          idBase={id}
          opcoes={opcoes}
          ativo={ativo}
          selecionados={valor === null ? [] : [valor]}
          aoPassarMouse={setAtivo}
          aoEscolher={escolher}
        />
      </Flutuante>
    </div>
  );
}
