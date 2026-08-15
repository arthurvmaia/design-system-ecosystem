"use client";

import { useState } from "react";
import { ArrowLeft, ArrowRight, ExternalLink } from "lucide-react";
import { LINK_DE_AFILIADO, SEM_LINK_DE_INDICACAO } from "@/app/shopify-afiliado";

/**
 * O passo entre escolher "sou cliente" e começar a criar.
 *
 * A loja que este app monta é um TEMA da Shopify: sem conta lá, o arquivo que
 * a pessoa recebe no fim não tem onde ser aberto. Perguntar isso no fim seria
 * tarde: ela já teria escolhido marca, cores e produtos para descobrir que
 * falta o principal.
 *
 * A ÚNICA saída daqui passa pelo link de indicação. Não é obstáculo por
 * obstáculo: a conta é necessária de verdade, e este é o momento em que ela é
 * necessária. O que a decisão remove é o atalho que pulava o link sem pular a
 * necessidade.
 *
 * Depois do clique a tela não presume nada. Ela sabe uma coisa só, a que
 * aconteceu de fato: a Shopify foi aberta em outra aba. Por isso o texto passa
 * a ser "quando terminar por lá, siga" em vez de "conta criada" — dizer o que
 * não se viu é o começo de uma tela que mente.
 */
export function ContaShopify({ onSeguir, onVoltar }: { onSeguir: () => void; onVoltar: () => void }) {
  const [abriu, setAbriu] = useState(false);

  return (
    <main className="entry-gate">
      <div className="entry-gate-brilho" aria-hidden="true" />
      <div className="crt-scanlines" aria-hidden="true" />
      <button type="button" className="voltar-ao-portal" onClick={onVoltar}>
        <ArrowLeft size={14} /> Voltar
      </button>
      <div className="entry-gate-caixa">
        {/* a logo é o próprio link: é o que a pessoa reconhece antes de ler
            qualquer palavra, e clicar nela é o gesto natural */}
        <a
          className="conta-shopify-marca"
          href={LINK_DE_AFILIADO}
          target="_blank"
          rel="noreferrer"
          aria-label="Criar conta na Shopify"
          onClick={() => setAbriu(true)}
        >
          <MarcaShopify />
        </a>
        <div className="entry-gate-marca">SHOPIFY</div>
        <div className="entry-gate-submarca">Primeiro passo</div>
        <p className="entry-gate-fala">
          Senhor, a loja que eu monto é um tema da Shopify: é lá que ela ganha endereço, carrinho e
          pagamento. Abra a sua conta agora e eu cuido de todo o resto.
        </p>

        {/* sem repetir a sacola aqui: em cima do verde da própria Shopify ela
            fica verde sobre verde e sobra só o "s" solto */}
        <a
          className="conta-shopify-botao"
          href={LINK_DE_AFILIADO}
          target="_blank"
          rel="noreferrer"
          onClick={() => setAbriu(true)}
        >
          Criar minha conta na Shopify
          <ExternalLink size={14} />
        </a>

        <div className="conta-shopify-passos">
          <div><b>01</b><span>Crie a conta e escolha o endereço da loja.</span></div>
          <div><b>02</b><span>Volte aqui e me diga como é a sua marca.</span></div>
          <div><b>03</b><span>Receba o tema pronto e suba na sua loja.</span></div>
        </div>

        {abriu ? (
          <>
            <button type="button" className="conta-shopify-seguir seguir-pronto" onClick={onSeguir}>
              Terminei na Shopify, criar meu site <ArrowRight size={13} />
            </button>
            <span className="conta-shopify-nota">
              Abri a Shopify na outra aba. Termine por lá e volte, que eu continuo daqui.
            </span>
          </>
        ) : (
          <span className="conta-shopify-nota">
            Abre em outra aba. Assim que o senhor abrir, eu libero a criação do site.
          </span>
        )}

        {SEM_LINK_DE_INDICACAO && (
          /* aviso para o DONO do app, não para o cliente: sem o link de
             indicação configurado, o botão funciona e a comissão não existe,
             e um erro silencioso desses só aparece no extrato */
          <span className="conta-shopify-aviso">
            Link de indicação ainda não configurado: o botão leva à Shopify, mas não gera comissão.
          </span>
        )}
      </div>
    </main>
  );
}

/**
 * A sacola da Shopify, desenhada em vetor.
 *
 * Fica no app inteiro sem baixar nada: não some em resolução nenhuma e não
 * depende de rede. Para usar o arquivo oficial do portal de parceiros, é
 * trocar este componente pela imagem do asset, e o resto da tela não muda.
 */
function MarcaShopify({ tamanho = 60 }: { tamanho?: number }) {
  return (
    <svg width={tamanho} height={tamanho} viewBox="0 0 48 48" role="img" aria-label="Shopify" focusable="false">
      <path
        d="M24 4c-4.6 0-8.4 3.2-9.9 7.7l-4.3 1.3a2.4 2.4 0 0 0-1.7 2L5 41.2a1.6 1.6 0 0 0 1.3 1.8l25.9 3.9a1.6 1.6 0 0 0 1.8-1.3l4.9-27.9a1.6 1.6 0 0 0-1.2-1.8l-4.3-1a10 10 0 0 0-9.4-11zm0 3.4c3 0 5.5 2 6.5 4.9l-13 4c1-4.9 3.6-8.9 6.5-8.9z"
        fill="#95BF47"
      />
      <path
        d="M24 18.6c-3.5 0-6.1 2-6.1 5 0 2.7 2 4 3.7 4.9 1.5.8 2.3 1.4 2.3 2.3 0 .9-.8 1.5-2 1.5a7.6 7.6 0 0 1-3.6-1l-.9 3.3a9 9 0 0 0 4.4 1.1c3.8 0 6.5-2 6.5-5.3 0-2.7-2-4-3.8-5-1.4-.7-2.2-1.2-2.2-2.1 0-.8.7-1.4 1.9-1.4 1.1 0 2.2.3 3.1.8l.9-3.2a8 8 0 0 0-4.2-.9z"
        fill="#ffffff"
      />
    </svg>
  );
}
