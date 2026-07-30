import { type PosicaoFlutuante, posicionarFlutuante } from '@/lib/seletor-core';
import { type ReactNode, type RefObject, useEffect, useLayoutEffect, useState } from 'react';
import { createPortal } from 'react-dom';

/**
 * A camada FLUTUANTE dos seletores: portal para o `document.body` com
 * `position: fixed` — escapa de qualquer `overflow` (inclusive o do Modal,
 * que vive em `z-[90]`; aqui é `z-[120]`). O posicionamento (flip para cima,
 * clamp na viewport, altura máxima) é decidido pelo núcleo puro e testado lá;
 * este componente só mede o gatilho e aplica.
 *
 * Fecha por clique fora e reposiciona em scroll/resize — scroll em CAPTURA,
 * porque o contêiner rolável do Modal não borbulha o evento até o window.
 */
export function Flutuante({
  aberto,
  gatilhoRef,
  aoFechar,
  children,
  larguraDoGatilho = true,
  alturaDesejada = 320,
}: {
  aberto: boolean;
  gatilhoRef: RefObject<HTMLElement | null>;
  aoFechar: () => void;
  children: ReactNode;
  /** Flutuante herda a largura do gatilho (selects); menus usam a própria. */
  larguraDoGatilho?: boolean;
  alturaDesejada?: number;
}) {
  const [pos, setPos] = useState<PosicaoFlutuante | null>(null);
  const [largura, setLargura] = useState<number | undefined>(undefined);

  useLayoutEffect(() => {
    if (!aberto) {
      setPos(null);
      return;
    }
    const medir = (): void => {
      const el = gatilhoRef.current;
      if (el === null) return;
      const r = el.getBoundingClientRect();
      setPos(
        posicionarFlutuante(
          { x: r.x, y: r.y, w: r.width, h: r.height },
          { w: window.innerWidth, h: window.innerHeight },
          alturaDesejada,
        ),
      );
      setLargura(larguraDoGatilho ? r.width : undefined);
    };
    medir();
    window.addEventListener('scroll', medir, true);
    window.addEventListener('resize', medir);
    return () => {
      window.removeEventListener('scroll', medir, true);
      window.removeEventListener('resize', medir);
    };
  }, [aberto, gatilhoRef, alturaDesejada, larguraDoGatilho]);

  useEffect(() => {
    if (!aberto) return;
    const aoClicarFora = (e: PointerEvent): void => {
      const alvo = e.target as Node;
      if (gatilhoRef.current?.contains(alvo)) return;
      const flutuante = document.getElementById('ds-flutuante-ativo');
      if (flutuante?.contains(alvo)) return;
      aoFechar();
    };
    document.addEventListener('pointerdown', aoClicarFora);
    return () => document.removeEventListener('pointerdown', aoClicarFora);
  }, [aberto, aoFechar, gatilhoRef]);

  if (!aberto || pos === null) return null;

  return createPortal(
    <div
      id="ds-flutuante-ativo"
      // `ds-scale-in` (0,5 s), não `ds-fade-in` (0,7 s): um dropdown que leva
      // quase um segundo para ficar legível parece travado, não elegante.
      className="ds-scale-in fixed z-[120] overflow-hidden rounded-lg border"
      style={{
        left: pos.x,
        top: pos.y,
        width: largura,
        maxHeight: pos.maxAltura,
        // Superfície SÓLIDA, mesma regra do Modal: a leitura não depende do que
        // está atrás. O token `--color-surface-elevated` que ficava aqui é
        // branco a 5% SEM blur — 95% do fundo atravessava e o dropdown ficava
        // ilegível sobre qualquer conteúdo denso (afetava as 8 telas que usam
        // seletores).
        backgroundColor: 'rgba(13, 13, 14, 0.99)',
        borderColor: 'var(--color-border-strong)',
        // A sombra dupla (queda + anel escuro) descola o flutuante do fundo
        // mesmo quando o que está atrás também é escuro — padrão do Modal.
        boxShadow: '0 24px 80px rgba(0, 0, 0, 0.6), 0 0 0 1px rgba(0, 0, 0, 0.4)',
      }}
    >
      {children}
    </div>,
    document.body,
  );
}
