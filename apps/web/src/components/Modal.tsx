import { X } from 'lucide-react';
import { type ReactNode, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

/**
 * Sobreposição modal genérica.
 *
 * VAI PARA O BODY, por portal. A versão anterior dizia que `position: fixed`
 * escapa do `overflow-hidden` do Shell e que portal era desnecessário. A
 * primeira metade é verdade; a segunda não, e o preço apareceu na tela: `fixed`
 * escapa do recorte, mas NÃO escapa do contexto de empilhamento.
 *
 * O modal nasce dentro do `<main>`, e o `<main>` tem `ds-fade-in` — animação
 * cria contexto de empilhamento. Preso ali, o `z-[90]` daqui passa a valer só
 * entre irmãos DENTRO do main, e o `<main>` inteiro (z-index auto) fica abaixo
 * do `<header>` da TopBar, que tem `z-20`. Resultado medido: a barra de etapas
 * do wizard aparecia atrás do cabeçalho do app, e a mesma coisa acontecia com a
 * barra lateral. Subir números não resolve isso — só sair do contexto resolve.
 *
 * É a base de ConfirmPop, do modal de detalhe e do editor de kit.
 *
 * Decisões de acessibilidade e leitura:
 * - A SUPERFÍCIE É SÓLIDA. O conteúdo do fundo não pode atravessar o texto do
 *   diálogo; o vidro fica no backdrop, nunca na superfície de leitura.
 * - Foco PRESO: Tab circula dentro do diálogo, o foco inicial entra nele e
 *   volta para onde estava ao fechar.
 * - O fundo não rola enquanto houver modal aberto (com contagem — modais
 *   aninhados não destravam antes da hora).
 * - Esc fecha só o modal do TOPO da pilha, e respeita quem já tratou a tecla
 *   (um seletor aberto dentro do modal fecha a si mesmo, não o modal).
 */

const LARGURA = {
  sm: 'max-w-[420px]',
  md: 'max-w-[640px]',
  lg: 'max-w-[900px]',
  xl: 'max-w-[1200px]',
} as const;

/** Pilha dos modais abertos — só o topo reage ao Esc. */
const pilha: symbol[] = [];

/** Trava de rolagem do fundo com contagem, para aninhamento. */
let travas = 0;
const travarFundo = (): void => {
  travas += 1;
  document.body.style.overflow = 'hidden';
};
const destravarFundo = (): void => {
  travas = Math.max(0, travas - 1);
  if (travas === 0) document.body.style.overflow = '';
};

const FOCAVEIS =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function Modal({
  open,
  onClose,
  children,
  size = 'md',
  title,
  className,
  bodyScroll = true,
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  size?: keyof typeof LARGURA;
  title?: string;
  className?: string;
  /**
   * O corpo rola quando passa da altura do painel (padrão).
   *
   * O painel é limitado a 88vh e corta o que sobra; sem um rolável dentro, o
   * conteúdo mais alto que a tela ficava inalcançável — era o detalhe do
   * segmento que "não descia". Só desligue quando o conteúdo já gerencia a
   * própria altura com colunas roláveis (o editor de kits).
   */
  bodyScroll?: boolean;
}) {
  const painelRef = useRef<HTMLDivElement>(null);
  const idRef = useRef<symbol | null>(null);
  if (idRef.current === null) idRef.current = Symbol('modal');

  // O efeito de foco depende SÓ de `open`. Quase todo call site passa uma arrow
  // inline em `onClose`, então qualquer render do pai criava identidade nova,
  // reexecutava o efeito e o foco pulava para o painel — quem digitava no
  // wizard perdia o cursor a cada autosave. A ref entrega sempre o onClose
  // atual sem reamarrar o efeito.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    const id = idRef.current as symbol;
    pilha.push(id);
    travarFundo();

    const anterior = document.activeElement as HTMLElement | null;
    painelRef.current?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (pilha[pilha.length - 1] !== id) return;

      if (e.key === 'Escape') {
        // Um seletor aberto dentro do modal já tratou (preventDefault) — o
        // modal não fecha junto.
        if (!e.defaultPrevented) onCloseRef.current();
        return;
      }
      if (e.key !== 'Tab') return;

      const painel = painelRef.current;
      if (painel === null) return;
      const focaveis = Array.from(painel.querySelectorAll<HTMLElement>(FOCAVEIS)).filter(
        (el) => el.offsetParent !== null,
      );
      if (focaveis.length === 0) {
        e.preventDefault();
        painel.focus();
        return;
      }
      const primeiro = focaveis[0];
      const ultimo = focaveis[focaveis.length - 1];
      const ativo = document.activeElement;
      const dentro = ativo instanceof Node && painel.contains(ativo);
      if (e.shiftKey) {
        if (!dentro || ativo === primeiro || ativo === painel) {
          e.preventDefault();
          ultimo?.focus();
        }
      } else if (!dentro || ativo === ultimo) {
        e.preventDefault();
        primeiro?.focus();
      }
    };

    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      const i = pilha.indexOf(id);
      if (i !== -1) pilha.splice(i, 1);
      destravarFundo();
      anterior?.focus?.();
    };
  }, [open]);

  if (!open) return null;

  return createPortal(
    // O `overflow-y-auto` é a rede de segurança do centramento: quando o painel
    // é mais alto que a janela, `items-center` corta os DOIS lados e o topo fica
    // inalcançável — foi assim que a barra de etapas do wizard sumiu atrás da
    // borda de cima. Com o scroll aqui, o pior caso vira rolar, não perder.
    // biome-ignore lint/a11y/useKeyWithClickEvents: Esc fecha via listener global; o clique no fundo é só um atalho de mouse, não a única saída.
    <div
      className="ds-fade-in fixed inset-0 z-[90] flex items-center justify-center overflow-y-auto p-6"
      style={{ backgroundColor: 'rgba(0, 0, 0, 0.78)', backdropFilter: 'blur(10px)' }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="presentation"
    >
      {/* biome-ignore lint/a11y/useSemanticElements: dialog + aria-modal é padrão ARIA válido; <dialog> nativo exige showModal() e traz estilo default inconsistente. */}
      <div
        role="dialog"
        ref={painelRef}
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className={`ds-scale-in relative flex max-h-[88vh] w-full flex-col overflow-hidden rounded-xl border outline-none ${LARGURA[size]} ${className ?? ''}`}
        style={{
          // Superfície SÓLIDA: a leitura não depende do que está atrás.
          backgroundColor: 'rgba(13, 13, 14, 0.99)',
          borderColor: 'rgba(255, 255, 255, 0.09)',
          boxShadow: '0 24px 80px rgba(0, 0, 0, 0.6), 0 0 0 1px rgba(0, 0, 0, 0.4)',
        }}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Fechar"
          className="absolute top-3 right-3 z-10 rounded-none p-1.5 opacity-50 transition-all duration-300 hover:bg-white/[0.06] hover:opacity-100"
        >
          <X size={16} style={{ color: 'var(--color-fg)' }} />
        </button>
        {bodyScroll ? (
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">{children}</div>
        ) : (
          children
        )}
      </div>
    </div>,
    document.body,
  );
}
