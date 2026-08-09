"use client";

import { useEffect, useRef, useState } from "react";

/**
 * A prévia da área do cliente: a home REAL do tema, com a marca já aplicada.
 *
 * A versão anterior era um desenho estrutural — retângulos cinza no lugar das
 * seções. Ele dizia a ordem das seções e mais nada, e a pessoa está escolhendo
 * exatamente o que ele não mostrava: cor, fonte, banner, produto. Aqui roda o
 * mesmo motor de render da entrega, com o mesmo `aplicarMarcaNoTema`, então o
 * que aparece é a loja que vai sair.
 *
 * O quadro é inerte de propósito (`pointer-events: none` no CSS e sem
 * `allow-forms`): isto é uma vitrine, não o editor. Clicar aqui não deve
 * navegar nem comprar.
 */
export function ClientPreviaReal({
  themeId,
  marca,
  nicheId,
  largura = 1280,
}: {
  themeId: string;
  marca: Record<string, unknown>;
  nicheId: string;
  largura?: number;
}) {
  const hospedeiro = useRef<HTMLDivElement | null>(null);
  const [html, setHtml] = useState<string | null>(null);
  const [estado, setEstado] = useState<"carregando" | "pronto" | "indisponivel">("carregando");
  const [quadro, setQuadro] = useState({ escala: 0, altura: 0 });

  /* a marca muda a cada tecla; o render é caro, então espera a pessoa parar */
  const assinatura = JSON.stringify({ themeId, nicheId, marca });
  useEffect(() => {
    if (!themeId) return;
    let vivo = true;
    const espera = window.setTimeout(async () => {
      try {
        const resposta = await fetch("/api/theme-render", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ themeId, page: "index", marca: { ...marca, nicheId } }),
        });
        if (!vivo) return;
        if (!resposta.ok) { setEstado("indisponivel"); return; }
        setHtml(await resposta.text());
        setEstado("pronto");
      } catch {
        if (vivo) setEstado("indisponivel");
      }
    }, 700);
    return () => { vivo = false; window.clearTimeout(espera); };
  }, [assinatura, themeId, nicheId, marca]);

  /**
   * A escala sai da largura real da coluna, medida por geometria.
   *
   * ResizeObserver não dispara em aba sem composição de quadros, e a prévia
   * ficaria em escala zero para sempre; medir no efeito e a cada resize é o que
   * sempre funciona.
   */
  useEffect(() => {
    const medir = () => {
      const largura_disponivel = hospedeiro.current?.clientWidth ?? 0;
      if (!largura_disponivel) return;
      const escala = largura_disponivel / largura;
      setQuadro({ escala, altura: Math.round(900 * escala) });
    };
    medir();
    const relogio = window.setInterval(medir, 1000);
    window.addEventListener("resize", medir);
    return () => { window.clearInterval(relogio); window.removeEventListener("resize", medir); };
  }, [largura]);

  return (
    <div className="cpr-host" ref={hospedeiro} style={{ height: quadro.altura || 360 }}>
      {estado === "pronto" && html ? (
        <iframe
          className="cpr-frame"
          title="Prévia da loja"
          sandbox="allow-same-origin"
          srcDoc={html}
          style={{ width: largura, height: 900, transform: `scale(${quadro.escala})` }}
        />
      ) : (
        <div className="cpr-vazio">
          {estado === "indisponivel" ? "Escolha um tema para ver a prévia." : "Montando a prévia da loja…"}
        </div>
      )}
    </div>
  );
}
