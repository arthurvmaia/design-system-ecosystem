"use client";

import { useState } from "react";
import { ArrowRight, Check, CircleAlert, ExternalLink, Loader } from "lucide-react";

/**
 * INSTALAR a loja direto na conta Shopify do cliente.
 *
 * Aparece no fim, e só no fim. Permissão se pede no instante em que ela é
 * usada: uma tela dizendo "este app quer gerenciar seus produtos e temas" no
 * começo do fluxo é uma pergunta sem resposta boa — a pessoa ainda não viu um
 * pixel da loja dela e não sabe por que isso é preciso. A mesma tela depois de
 * ela aprovar a loja tem resposta óbvia: é para instalar o que ela aprovou.
 *
 * E pedir no começo teria um custo que não aparece: o app ficaria guardando
 * chave de escrita de lojas de gente que desistiu no meio.
 *
 * ## O ZIP continua existindo
 *
 * Este painel é um caminho a mais, nunca o único. Se a instalação falhar — chave
 * errada, permissão faltando, loja fora do ar —, o pacote continua ali e o
 * cliente sobe à mão como sempre fez. Por isso nada aqui bloqueia o botão de
 * baixar.
 */

type Relatorio = {
  loja: { nome: string; dominio: string; plano: string };
  colecoes: { criadas: number; nomes: string[] };
  produtos: { criados: number; semColecao: number };
  arquivos: { enviados: number; falhas: string[] };
  tema: { instalado: boolean; nome?: string; motivo?: string };
  avisos: string[];
};

type Conferido = { loja: { nome: string; dominio: string; plano: string }; vaiCriar: { colecoes: number; produtos: number } };

export function InstalarNaLoja({ projectId, dominioInicial, onInstalado }: {
  projectId: string;
  dominioInicial: string;
  /**
   * Avisa a tela em volta do que entrou na loja.
   *
   * Sem isso, o texto de cima continuava mandando subir à mão o que este painel
   * acabou de instalar: "envie as imagens em Conteúdo → Arquivos" com as oito já
   * lá dentro. Instrução que contradiz o que acabou de acontecer faz a pessoa
   * desconfiar do que ela viu.
   */
  onInstalado?: (resumo: { temaInstalado: boolean; loja: string }) => void;
}) {
  const [dominio, setDominio] = useState(dominioInicial);
  const [estado, setEstado] = useState<"parado" | "conferindo" | "conferido" | "instalando" | "feito">("parado");
  const [conferido, setConferido] = useState<Conferido | null>(null);
  const [relatorio, setRelatorio] = useState<Relatorio | null>(null);
  const [erro, setErro] = useState("");
  /* o `state` da autorização que o cliente aprovou; vazio quando a instalação
     usa as credenciais do dono (as lojas dele) */
  const [conexao, setConexao] = useState("");

  const ocupado = estado === "conferindo" || estado === "instalando";

  /**
   * CONECTAR: leva o cliente à tela de permissões da Shopify e espera.
   *
   * A aba nova é aberta ANTES do `fetch`, e vazia. Navegador só deixa abrir
   * janela dentro do clique da pessoa; abrir depois de uma resposta assíncrona
   * cai no bloqueador de pop-up e o cliente não vê nada acontecer.
   *
   * Depois é pergunta e resposta: a aprovação acontece lá, e esta tela pergunta
   * de dois em dois segundos se já foi. Sem isso, a janela de origem ficaria
   * parada para sempre esperando um evento que nunca chega.
   */
  async function conectar() {
    setErro("");
    const janela = window.open("", "_blank", "width=620,height=780");
    setEstado("conferindo");
    try {
      const resposta = await fetch("/api/shopify/entrar", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ loja: dominio.trim(), projectId }),
      });
      const dados = await resposta.json().catch(() => ({}));
      /**
       * SEM endereço público, cai no caminho do dono.
       *
       * O OAuth precisa que a Shopify redirecione de volta, e para isso precisa
       * de um endereço que ela alcance. Não havendo, ainda existe o outro
       * caminho: o app se identificar com as credenciais do dono, que a Shopify
       * aceita nas lojas da MESMA organização.
       *
       * É menos do que o OAuth faz, e é dito assim mesmo. Mas transformar a
       * falta do túnel em "não dá para instalar" tiraria do dono justamente o
       * caminho que ele usa para testar.
       */
      if ((dados as { error?: string }).error === "SEM_ENDERECO_PUBLICO") {
        janela?.close();
        await chamar("conferir", "");
        return;
      }
      if (!resposta.ok || !(dados as { destino?: string }).destino) {
        janela?.close();
        setErro((dados as { mensagem?: string }).mensagem ?? "não consegui começar a conexão");
        setEstado("parado");
        return;
      }
      const { estado: chave, destino } = dados as { estado: string; destino: string };
      if (janela) janela.location.href = destino;
      else window.open(destino, "_blank");

      /* espera a aprovação, com teto: cliente que desistiu não pode deixar a
         tela girando para sempre */
      const limite = Date.now() + 5 * 60 * 1000;
      for (;;) {
        await new Promise((pronto) => setTimeout(pronto, 2000));
        if (Date.now() > limite) { setErro("a autorização demorou demais; tente de novo"); setEstado("parado"); return; }
        const situacao = await fetch(`/api/shopify/estado?estado=${chave}`).then((r) => r.json()).catch(() => ({}));
        const status = (situacao as { status?: string }).status;
        if (status === "conectado") break;
        if (status === "sumiu") { setErro("a autorização não foi concluída"); setEstado("parado"); return; }
      }
      setConexao(chave);
      await chamar("conferir", chave);
    } catch (falha) {
      janela?.close();
      setErro((falha as Error).message);
      setEstado("parado");
    }
  }

  async function chamar(acao: "conferir" | "instalar", chave = conexao) {
    setErro("");
    setEstado(acao === "conferir" ? "conferindo" : "instalando");
    try {
      const resposta = await fetch("/api/shopify-instalar", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ acao, dominio: dominio.trim(), projectId, estado: chave || undefined }),
      });
      const dados = await resposta.json().catch(() => ({}));
      if (!resposta.ok) {
        setErro((dados as { mensagem?: string; error?: string }).mensagem ?? (dados as { error?: string }).error ?? "não consegui conectar");
        setEstado(acao === "conferir" ? "parado" : "conferido");
        return;
      }
      if (acao === "conferir") { setConferido(dados as Conferido); setEstado("conferido"); return; }
      const relato = dados as Relatorio;
      setRelatorio(relato);
      setEstado("feito");
      onInstalado?.({ temaInstalado: relato.tema.instalado, loja: relato.loja.nome });
    } catch (falha) {
      setErro((falha as Error).message);
      setEstado(acao === "conferir" ? "parado" : "conferido");
    }
  }

  if (estado === "feito" && relatorio) {
    return (
      <div className="instalar-loja instalar-feito">
        <h3><Check size={16} /> Instalado em {relatorio.loja.nome}</h3>
        <ul className="instalar-placar">
          <li><b>{relatorio.colecoes.criadas}</b> coleções</li>
          <li><b>{relatorio.produtos.criados}</b> produtos</li>
          <li><b>{relatorio.arquivos.enviados}</b> imagens</li>
          <li className={relatorio.tema.instalado ? "" : "instalar-pendente"}>
            <b>{relatorio.tema.instalado ? "1" : "0"}</b> tema
          </li>
        </ul>
        {/* o que NÃO aconteceu é dito com o mesmo destaque do que aconteceu:
            relatório que só conta acerto é propaganda, não relatório */}
        {!relatorio.tema.instalado && (
          <p className="instalar-aviso">
            {/* uma frase, não duas: o motivo já diz "suba o tema pelo ZIP", e
                repetir a mesma instrução logo em seguida faz o aviso parecer
                dois avisos diferentes */}
            <CircleAlert size={14} /> Falta o tema: {relatorio.tema.motivo}. Baixe o ZIP e suba em
            Loja online → Temas → Adicionar tema.
          </p>
        )}
        {relatorio.avisos.map((aviso) => <p className="instalar-aviso" key={aviso}><CircleAlert size={14} /> {aviso}</p>)}
        <a className="instalar-link" href={`https://${relatorio.loja.dominio}/admin/products`} target="_blank" rel="noreferrer">
          Ver na minha Shopify <ExternalLink size={13} />
        </a>
      </div>
    );
  }

  return (
    <div className="instalar-loja">
      <h3>Instalar direto na minha Shopify</h3>
      {/**
       * UM CAMPO, e ele não é permissão.
       *
       * A versão anterior desta tela pedia uma chave de acesso e ensinava, em
       * quatro passos, como criá-la no painel da Shopify. Era colo demais para
       * quem só quer a loja no ar — e virou pó quando a Shopify aposentou os
       * apps personalizados criados no admin, que era de onde aquela chave
       * saía.
       *
       * Hoje quem se identifica é o APP, com as credenciais do dono. O cliente
       * diz onde é a loja dele e mais nada.
       */}
      <p className="instalar-nota">
        Em vez de baixar o ZIP e subir à mão, eu crio as coleções, os produtos e as imagens na sua
        loja. Só preciso saber qual é ela.
      </p>

      <label className="instalar-campo">
        <span>Endereço da loja</span>
        <div>
          <input value={dominio} onChange={(e) => setDominio(e.target.value)} placeholder="minha-loja" disabled={ocupado} spellCheck={false} />
          <b>.myshopify.com</b>
        </div>
        <em>É o endereço que você escolheu ao criar a conta.</em>
      </label>

      {erro && <p className="instalar-erro"><CircleAlert size={14} /> {erro}</p>}

      {/* o bloco fica de pé DURANTE a instalação: escondê-lo ao clicar tirava
          da tela justamente o que diz o que está acontecendo */}
      {(estado === "conferido" || estado === "instalando") && conferido && (
        <div className="instalar-confere">
          <p>
            Conectado em <b>{conferido.loja.nome}</b>{conferido.loja.plano ? ` (${conferido.loja.plano})` : ""}. Vou criar{" "}
            <b>{conferido.vaiCriar.colecoes} coleções</b> e <b>{conferido.vaiCriar.produtos} produtos</b>, e enviar as
            imagens da marca.
          </p>
          {/* dizer o tamanho ANTES de escrever: aprovar sabendo o que foi
              autorizado é o que separa permissão de surpresa */}
          <button className="primary-button" onClick={() => void chamar("instalar", conexao)} disabled={ocupado}>
            {estado === "instalando" ? <><Loader size={14} className="girando" /> Instalando…</> : <>Instalar agora <ArrowRight size={14} /></>}
          </button>
        </div>
      )}

      {estado !== "conferido" && estado !== "instalando" && (
        <button
          className="secondary-button"
          onClick={() => void conectar()}
          disabled={ocupado || !dominio.trim()}
        >
          {estado === "conferindo" ? <><Loader size={14} className="girando" /> Esperando a sua aprovação…</> : <>Conectar minha loja <ArrowRight size={14} /></>}
        </button>
      )}
    </div>
  );
}
