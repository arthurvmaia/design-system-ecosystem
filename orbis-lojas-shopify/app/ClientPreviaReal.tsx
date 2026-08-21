"use client";

import { useEffect, useRef, useState } from "react";

/**
 * A LOJA INTEIRA, na etapa de revisão.
 *
 * É a home REAL do tema escolhido, renderizada pelo mesmo motor da entrega e
 * com a marca aplicada pelo mesmo `aplicarMarcaNoTema`. O que aparece aqui é o
 * que vai sair — não uma demonstração genérica, não uma captura de tela.
 *
 * Ela existe SÓ nesta etapa. Nas anteriores era uma coluna de 340px ao lado de
 * decisões de conteúdo (nicho, nome, cores, coleções) e não ajudava nenhuma
 * delas; aqui a pergunta é exatamente essa, e a resposta precisa de tamanho.
 *
 * O quadro é inerte de propósito (`pointer-events: none` no CSS, sem
 * `allow-forms`): isto é uma vitrine para conferir, não o editor.
 */

/** As duas larguras: um monitor comum e um celular comum. */
const LARGURAS = { desktop: 1280, mobile: 390 } as const;
export type Dispositivo = keyof typeof LARGURAS;

/**
 * Enquanto a loja não se mede, o quadro tem esta altura.
 *
 * Teto por segurança: uma página que se declara com 200 mil pixels (laço de
 * layout, carrossel infinito) esticaria a tela do app até ninguém achar mais o
 * botão de finalizar.
 */
const ALTURA_INICIAL = 900;
const ALTURA_MAXIMA = 24000;

/**
 * A altura da LOJA, e não a da moldura que mostra a loja.
 *
 * Ler `documentElement.scrollHeight` era uma catraca: o elemento raiz cobre a
 * janela do quadro, então a medida nunca desce abaixo da altura que o quadro
 * JÁ tem. Ela sobe e não volta. Trocar o tema por um mais curto — medido aqui,
 * de 4000 para 1200px — deixava o quadro nos 4000 para sempre, e os 2800px de
 * diferença viravam branco vagando no fim da prévia.
 *
 * Duas correções, e as duas são necessárias:
 *
 * 1. Encolher o quadro ANTES de ler. A leitura e a devolução acontecem na
 *    mesma tarefa do JavaScript, e o navegador não pinta estado intermediário:
 *    não pisca, e nem o tema percebe (observador de tamanho só é notificado no
 *    fim do quadro, quando a altura já voltou).
 * 2. Ler o CORPO e não a raiz: `body` tem altura de conteúdo, `documentElement`
 *    tem altura de janela.
 *
 * E o piso de 900 volta a ser o que o nome dele promete — o valor de ENQUANTO
 * não se mede. Aplicado sobre uma medida real, era ele próprio que fabricava
 * branco em toda loja mais curta que isso.
 */
function medirLoja(quadro: HTMLIFrameElement | null): number {
  const corpo = quadro?.contentDocument?.body;
  if (!quadro || !corpo) return ALTURA_INICIAL;
  const antes = quadro.style.height;
  quadro.style.height = `${ALTURA_INICIAL}px`;
  const medida = Math.max(corpo.scrollHeight, corpo.offsetHeight);
  quadro.style.height = antes;
  return medida ? Math.min(ALTURA_MAXIMA, medida) : ALTURA_INICIAL;
}

export function ClientPreviaReal({
  themeId,
  marca,
  nicheId,
  dispositivo = "desktop",
  semTema = "",
}: {
  themeId: string;
  marca: Record<string, unknown>;
  nicheId: string;
  dispositivo?: Dispositivo;
  /** Por que não há tema, quando não há. Espera eterna é a pior tela de erro. */
  semTema?: string;
}) {
  const hospedeiro = useRef<HTMLDivElement | null>(null);
  const moldura = useRef<HTMLIFrameElement | null>(null);
  const [html, setHtml] = useState<string | null>(null);
  const [falhou, setFalhou] = useState(false);
  const [quadro, setQuadro] = useState({ escala: 0, altura: 0 });
  /** A altura MEDIDA da loja, para o quadro mostrar a página inteira. */
  const [alturaBase, setAlturaBase] = useState(ALTURA_INICIAL);

  /**
   * O estado é DERIVADO, não guardado: sem tema é indisponível por construção,
   * e o HTML de um tema antigo não fica na tela depois que o tema sai.
   */
  const indisponivel = !themeId || falhou;
  const paraMostrar = themeId && !falhou ? html : null;
  const largura = LARGURAS[dispositivo];

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
        if (!resposta.ok) { setFalhou(true); return; }
        setHtml(await resposta.text());
        setFalhou(false);
      } catch {
        if (vivo) setFalhou(true);
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
      const disponivel = hospedeiro.current?.clientWidth ?? 0;
      if (!disponivel) return;
      /* no celular a prévia não é esticada até a largura da coluna: um telefone
         de 390px inflado a 900 mente sobre o tamanho da letra */
      const escala = dispositivo === "mobile" ? Math.min(1, disponivel / largura) : disponivel / largura;
      /**
       * A LOJA INTEIRA, e não a primeira dobra.
       *
       * O quadro tinha altura fixa e o resto da página ficava atrás de uma
       * barra de rolagem DENTRO dele — que ninguém consegue usar, porque o
       * quadro é inerte de propósito. Quem ia revisar a loja via o cabeçalho e
       * o banner, e aprovava o resto no escuro.
       *
       * Medindo a loja e crescendo o quadro até ela (`medirLoja`), a rolagem
       * volta a ser a da página, que funciona.
       */
      const alta = medirLoja(moldura.current);
      setAlturaBase(alta);
      setQuadro({ escala, altura: Math.round(alta * escala) });
    };
    medir();
    /* a loja assenta em etapas — fonte, imagem, script do tema — e cada uma
       muda a altura; por isso a medição se repete em vez de acontecer uma vez */
    const relogio = window.setInterval(medir, 700);
    window.addEventListener("resize", medir);
    return () => { window.clearInterval(relogio); window.removeEventListener("resize", medir); };
  }, [largura, dispositivo]);

  return (
    <div
      className={`cpr-host cpr-${dispositivo}`}
      ref={hospedeiro}
      style={{ height: quadro.altura || 360 }}
    >
      {paraMostrar ? (
        <iframe
          className="cpr-frame"
          title="Prévia da loja"
          ref={moldura}
          scrolling="no"
          sandbox="allow-same-origin"
          srcDoc={paraMostrar}
          style={{ width: largura, height: alturaBase, transform: `scale(${quadro.escala})` }}
        />
      ) : (
        <div className="cpr-vazio">
          {indisponivel
            ? semTema || "Não consegui montar a prévia deste tema agora."
            : "Montando a sua loja…"}
        </div>
      )}
    </div>
  );
}
