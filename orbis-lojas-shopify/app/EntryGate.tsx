"use client";

import { ArrowLeft, ArrowRight, SlidersHorizontal, Store } from "lucide-react";
import { Orbis } from "@/app/Orbis";
import { enderecoDoPortal } from "@/app/portal";

/**
 * O portão: a primeira tela de toda visita.
 *
 * Antes de mostrar qualquer coisa, o app pergunta quem chegou. Cliente vai para
 * o balcão (solicitar um site); ADM vai para o estúdio completo. Não há senha
 * nem persistência: cada entrada no app passa por aqui de novo, porque a mesma
 * máquina atende os dois papéis durante o protótipo.
 *
 * A saída para o portal fica AQUI, no alto, e não escondida num menu: esta é a
 * primeira tela de quem chega vindo da suíte, e é onde a pessoa procura quando
 * percebe que escolheu a porta errada.
 */
export function EntryGate({ onChoose }: { onChoose: (flow: "client" | "admin") => void }) {
  return (
    <main className="entry-gate">
      <div className="entry-gate-brilho" aria-hidden="true" />
      <div className="crt-scanlines" aria-hidden="true" />
      <a className="voltar-ao-portal" href={enderecoDoPortal()}>
        <ArrowLeft size={14} /> Trocar de app
      </a>
      <div className="entry-gate-caixa">
        <Orbis tamanho={72} alt="Orbis, o núcleo do sistema" />
        <div className="entry-gate-marca">ORBIS</div>
        <div className="entry-gate-submarca">Criação de lojas Shopify</div>
        <p className="entry-gate-fala">
          Bem-vindo, senhor. Sou o Orbis, guardião deste estúdio. Diga-me quem é, que eu abro a porta certa.
        </p>
        <div className="entry-gate-cards">
          <button className="entry-card" onClick={() => onChoose("client")}>
            <Store size={22} strokeWidth={1.6} />
            <strong>Sou cliente</strong>
            <span>Quero meu site pronto: informo minha marca, escolho o visual e recebo tudo em um arquivo.</span>
            <em>Solicitar meu site <ArrowRight size={13} /></em>
          </button>
          <button className="entry-card" onClick={() => onChoose("admin")}>
            <SlidersHorizontal size={22} strokeWidth={1.6} />
            <strong>Sou do estúdio</strong>
            <span>Painel completo: importar temas, editar seções, acompanhar projetos e publicar.</span>
            <em>Entrar no estúdio <ArrowRight size={13} /></em>
          </button>
        </div>
      </div>
    </main>
  );
}
