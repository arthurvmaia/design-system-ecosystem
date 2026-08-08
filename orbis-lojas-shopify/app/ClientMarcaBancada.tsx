"use client";

import { ChevronRight, Sparkles, RefreshCw, X } from "lucide-react";
import { useState } from "react";
import { NICHOS } from "@/lib/marca-generator.mjs";

/**
 * A etapa "Marca" como bancada: uma coluna de instrumentos fechados, e um
 * aberto por vez.
 *
 * Seis painéis abertos ao mesmo tempo dão a tudo o mesmo peso, e sem hierarquia
 * ninguém sabe por onde começar. Fechados, cada linha mostra só o que decide
 * onde mexer: o nome do instrumento, o estado e o resumo do que já está
 * definido — "Miró Studio · logo gerada" responde sem clique nenhum.
 *
 * O cartão do topo é para quem chegou sem marca: um clique e a Orbis devolve
 * nome, paleta, tipografia, voz e logo prontos, que a pessoa então ajusta.
 */

export type MarcaCliente = {
  name: string;
  slogan: string;
  description: string;
  primaryColor: string;
  backgroundColor: string;
  accentColor: string;
  headingFont: string;
  bodyFont: string;
  voice: string;
  whatsapp: string;
  instagram: string;
  email: string;
  logoDataUri: string;
  collections: string[];
};

type SubId = "marca" | "voz" | "paleta" | "tipografia" | "contato" | "redes";
type Estado = "configurado" | "padrao" | "vazio" | "opcional";

const INSTRUMENTOS: ReadonlyArray<{ id: SubId; nome: string; oQueFaz: string }> = [
  { id: "marca", nome: "Marca", oQueFaz: "O nome que vai na loja e a logo" },
  { id: "voz", nome: "Voz da marca", oQueFaz: "Como os textos falam com quem lê" },
  { id: "paleta", nome: "Paleta", oQueFaz: "As cores que a loja inteira usa" },
  { id: "tipografia", nome: "Tipografia", oQueFaz: "As fontes de título e de corpo" },
  { id: "contato", nome: "Contato", oQueFaz: "E-mail, WhatsApp e a chamada principal" },
  { id: "redes", nome: "Redes", oQueFaz: "Os perfis que aparecem no rodapé" },
];

/** O resumo de cada linha: o que responde a pergunta sem precisar abrir. */
function situacao(marca: MarcaCliente, gerada: boolean, id: SubId): { estado: Estado; resumo: string } {
  if (id === "marca") {
    if (!marca.name.trim()) return { estado: "vazio", resumo: "Escreva o nome da loja" };
    return { estado: "configurado", resumo: `${marca.name}${marca.logoDataUri ? " · com logo" : " · sem logo"}` };
  }
  if (id === "voz") {
    return marca.voice
      ? { estado: gerada ? "configurado" : "configurado", resumo: marca.voice }
      : { estado: "padrao", resumo: "Ainda no tom padrão" };
  }
  if (id === "paleta") {
    return { estado: gerada ? "configurado" : "padrao", resumo: `${marca.primaryColor} · ${marca.backgroundColor}` };
  }
  if (id === "tipografia") {
    return marca.headingFont
      ? { estado: "configurado", resumo: `${marca.headingFont} + ${marca.bodyFont}` }
      : { estado: "padrao", resumo: "As fontes que o tema já traz" };
  }
  if (id === "contato") {
    const tem = [marca.email, marca.whatsapp].filter(Boolean);
    return tem.length ? { estado: "configurado", resumo: tem.join(" · ") } : { estado: "opcional", resumo: "Como falar com você" };
  }
  const redes = marca.instagram ? `@${marca.instagram}` : "";
  return redes ? { estado: "configurado", resumo: redes } : { estado: "opcional", resumo: "Nenhuma rede (opcional)" };
}

export function ClientMarcaBancada({
  marca,
  nicheId,
  gerada,
  onChange,
  onGerar,
}: {
  marca: MarcaCliente;
  nicheId: string;
  gerada: boolean;
  onChange: (parcial: Partial<MarcaCliente>) => void;
  onGerar: () => void;
}) {
  const [aberto, setAberto] = useState<SubId | null>(null);
  const nicho = NICHOS.find((item: { id: string }) => item.id === nicheId);

  if (aberto) {
    const instrumento = INSTRUMENTOS.find((item) => item.id === aberto)!;
    return (
      <div className="cf-body cf-bancada-aberta">
        <div className="cf-bancada-cabeca">
          <div>
            <span className="cf-bancada-oque">{instrumento.oQueFaz}</span>
            <h3>{instrumento.nome}</h3>
          </div>
          <button className="secondary-button" onClick={() => setAberto(null)}><X size={13} /> Voltar para a lista</button>
        </div>
        <Painel id={aberto} marca={marca} onChange={onChange} />
      </div>
    );
  }

  return (
    <div className="cf-body cf-bancada">
      <button className="cf-convite" onClick={onGerar}>
        <span className="cf-convite-icone" aria-hidden="true"><Sparkles size={20} strokeWidth={1.6} /></span>
        <span className="cf-convite-texto">
          <span className="cf-convite-selo">Orbis Criativos</span>
          <strong>{gerada ? "Quer outra versão da marca?" : "Ainda não tem uma marca criada?"}</strong>
          <span>
            {nicho
              ? `A gente cria com o senhor a partir de ${nicho.nome.toLowerCase()}: nome, paleta, tipografia, voz e logo.`
              : "A gente cria com o senhor: nome, paleta, tipografia, voz e logo."}
          </span>
        </span>
        <span className="cf-convite-acao">{gerada ? <><RefreshCw size={14} /> Gerar outra</> : <>Quero criar <ChevronRight size={14} /></>}</span>
      </button>

      <p className="cf-bancada-nota">
        Abra um de cada vez. O que o senhor deixar em branco eu resolvo com o kit, e a lista diz o que já está definido.
      </p>

      <div className="cf-bancada-lista">
        {INSTRUMENTOS.map((instrumento) => {
          const info = situacao(marca, gerada, instrumento.id);
          return (
            <button key={instrumento.id} className="cf-bancada-linha" onClick={() => setAberto(instrumento.id)}>
              <i className={`cf-ponto cf-ponto-${info.estado}`} title={info.resumo} aria-label={info.resumo} />
              <span className="cf-bancada-nome">
                <b>{instrumento.nome}</b>
                <small>{instrumento.oQueFaz}</small>
              </span>
              <span className={`cf-bancada-resumo ${info.estado === "configurado" ? "aceso" : ""}`}>{info.resumo}</span>
              <ChevronRight size={14} />
            </button>
          );
        })}
      </div>
    </div>
  );
}

function Painel({ id, marca, onChange }: { id: SubId; marca: MarcaCliente; onChange: (parcial: Partial<MarcaCliente>) => void }) {
  if (id === "marca") {
    return (
      <div className="cf-painel">
        <label className="cf-field">
          <span>Nome da loja *</span>
          <input value={marca.name} maxLength={48} placeholder="Ex.: Aurora Café" onChange={(evento) => onChange({ name: evento.target.value })} />
        </label>
        <label className="cf-field">
          <span>Slogan</span>
          <input value={marca.slogan} maxLength={140} placeholder="Uma frase curta que apresenta a marca" onChange={(evento) => onChange({ slogan: evento.target.value })} />
        </label>
        <label className="cf-field">
          <span>Descrição</span>
          <textarea value={marca.description} maxLength={240} rows={3} placeholder="O que você vende e para quem" onChange={(evento) => onChange({ description: evento.target.value })} />
        </label>
        {marca.logoDataUri && (
          <div className="cf-painel-logo">
            {/* eslint-disable-next-line @next/next/no-img-element -- data URI local gerado aqui; não passa pelo otimizador. */}
            <img src={marca.logoDataUri} alt="Logo gerada para a marca" />
            <span>Logo gerada a partir do nome e da paleta. Gerar outra marca desenha uma nova.</span>
          </div>
        )}
      </div>
    );
  }
  if (id === "voz") {
    return (
      <div className="cf-painel">
        <label className="cf-field">
          <span>Como a loja fala</span>
          <input value={marca.voice} maxLength={80} placeholder="Ex.: próxima e direta" onChange={(evento) => onChange({ voice: evento.target.value })} />
        </label>
        <p className="cf-painel-nota">O tom guia os textos que entram nas seções que o tema deixou em branco.</p>
      </div>
    );
  }
  if (id === "paleta") {
    return (
      <div className="cf-painel cf-row">
        <label className="cf-field">
          <span>Cor principal</span>
          <span className="cf-color"><input type="color" value={marca.primaryColor} onChange={(evento) => onChange({ primaryColor: evento.target.value })} /><code>{marca.primaryColor}</code></span>
        </label>
        <label className="cf-field">
          <span>Cor de fundo</span>
          <span className="cf-color"><input type="color" value={marca.backgroundColor} onChange={(evento) => onChange({ backgroundColor: evento.target.value })} /><code>{marca.backgroundColor}</code></span>
        </label>
        <label className="cf-field">
          <span>Destaque</span>
          <span className="cf-color"><input type="color" value={marca.accentColor} onChange={(evento) => onChange({ accentColor: evento.target.value })} /><code>{marca.accentColor}</code></span>
        </label>
      </div>
    );
  }
  if (id === "tipografia") {
    return (
      <div className="cf-painel cf-row">
        <label className="cf-field">
          <span>Fonte dos títulos</span>
          <input value={marca.headingFont} maxLength={60} placeholder="Ex.: Playfair Display" onChange={(evento) => onChange({ headingFont: evento.target.value })} />
        </label>
        <label className="cf-field">
          <span>Fonte do corpo</span>
          <input value={marca.bodyFont} maxLength={60} placeholder="Ex.: Inter" onChange={(evento) => onChange({ bodyFont: evento.target.value })} />
        </label>
      </div>
    );
  }
  if (id === "contato") {
    return (
      <div className="cf-painel cf-row">
        <label className="cf-field"><span>E-mail</span><input value={marca.email} maxLength={120} placeholder="contato@suamarca.com" onChange={(evento) => onChange({ email: evento.target.value })} /></label>
        <label className="cf-field"><span>WhatsApp</span><input value={marca.whatsapp} maxLength={20} placeholder="5511999998888" onChange={(evento) => onChange({ whatsapp: evento.target.value })} /></label>
      </div>
    );
  }
  return (
    <div className="cf-painel">
      <label className="cf-field"><span>Instagram</span><input value={marca.instagram} maxLength={60} placeholder="@suamarca" onChange={(evento) => onChange({ instagram: evento.target.value })} /></label>
      <p className="cf-painel-nota">Os perfis preenchidos aparecem no rodapé da loja.</p>
    </div>
  );
}
