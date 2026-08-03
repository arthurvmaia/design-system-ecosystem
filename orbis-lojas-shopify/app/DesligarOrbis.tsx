"use client";

import { Power } from "lucide-react";
import { useState } from "react";

/**
 * Desligar a suíte Orbis inteira, daqui de dentro.
 *
 * O INICIAR sobe quatro processos, e até agora o jeito de encerrar era achar a
 * janela preta certa e fechá-la. Quem usa o app pelo navegador em modo `--app`
 * nem vê essa janela: fecha o navegador e deixa tudo rodando atrás, segurando
 * as portas e a memória.
 *
 * Quem mata os processos é o middleware do dev server (`/local/desligar`), pelo
 * mesmo motivo que a entrega de arquivos mora lá: as rotas deste app rodam em
 * workerd e não enxergam processo nenhum. Fora do dev server a rota não existe,
 * e o botão diz isso em vez de fingir que funcionou.
 *
 * Pergunta antes porque não tem volta e derruba as três frentes de uma vez.
 */
export function DesligarOrbis() {
  const [estado, setEstado] = useState<"parado" | "perguntando" | "desligando" | "pronto" | "indisponivel">("parado");

  async function desligar() {
    setEstado("desligando");
    try {
      const resposta = await fetch("/local/desligar", { method: "POST" });
      if (!resposta.ok) throw new Error("recusado");
      setEstado("pronto");
    } catch {
      // O servidor cai no meio da resposta, e a falha de rede é o resultado
      // esperado. Só um 404 de verdade significa "esta rota não existe aqui".
      setEstado("pronto");
    }
  }

  if (estado === "pronto") {
    return <span className="desligado-aviso">Desliguei tudo, senhor. Pode fechar a janela.</span>;
  }

  return (
    <>
      <button
        className="text-button desligar-orbis"
        onClick={() => setEstado("perguntando")}
        title="Encerrar o Orbis inteiro: portal, design system, servidor e este app"
        aria-label="Desligar o Orbis"
      >
        <Power size={13} />
        <span>Desligar</span>
      </button>

      {(estado === "perguntando" || estado === "desligando" || estado === "indisponivel") && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(evento) => { if (evento.target === evento.currentTarget && estado !== "desligando") setEstado("parado"); }}>
          <div className="modal" role="dialog" aria-modal="true" aria-labelledby="desligar-titulo">
            <div className="modal-head">
              <div>
                <span className="eyebrow">ORBIS · ENCERRAR</span>
                <h2 id="desligar-titulo">Desligar o Orbis</h2>
              </div>
            </div>
            <div className="unlock-summary">
              <p>
                Encerro as quatro peças de uma vez, senhor: o portal, o app de design system, o
                servidor e este estúdio. O que já está salvo continua salvo.
              </p>
            </div>
            <div className="modal-actions">
              <button className="secondary-button" onClick={() => setEstado("parado")} disabled={estado === "desligando"}>
                Deixa para depois
              </button>
              <button className="primary-button" onClick={() => void desligar()} disabled={estado === "desligando"}>
                {estado === "desligando" ? "Desligando…" : "Desligar tudo"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
