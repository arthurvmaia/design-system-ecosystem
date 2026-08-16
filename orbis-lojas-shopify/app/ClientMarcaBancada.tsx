"use client";

import { Check, ChevronRight, CircleAlert, Plus, Sparkles, RefreshCw, X } from "lucide-react";
import { useState } from "react";
import { NICHOS } from "@/lib/marca-generator.mjs";
import { MAX_UPLOAD_MB } from "@/lib/business-rules.mjs";

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
  /** Imagem de cada peça (`logo`, `banner-desktop`, `colecao-1`…) que a pessoa enviou. */
  imagens: Record<string, string>;
};

/** Uma peça de imagem da loja, como a bancada precisa vê-la. */
export type PecaNaBancada = { chave: string; titulo: string; aspecto: string; previaLocal: string };

type SubId = "marca" | "colecoes" | "imagens" | "voz" | "paleta" | "tipografia" | "contato" | "redes";
type Estado = "configurado" | "padrao" | "vazio" | "opcional";

const INSTRUMENTOS: ReadonlyArray<{ id: SubId; nome: string; oQueFaz: string }> = [
  { id: "marca", nome: "Marca", oQueFaz: "O nome que vai na loja e a logo" },
  /* logo abaixo da Marca e ANTES das imagens, porque é ela que decide quantas
     capas a loja precisa: escolher a arte antes de saber as coleções é escolher
     no escuro */
  { id: "colecoes", nome: "Coleções", oQueFaz: "As categorias que a loja vai ter" },
  { id: "imagens", nome: "Imagens da loja", oQueFaz: "Logo, banners e as capas das coleções" },
  { id: "voz", nome: "Voz da marca", oQueFaz: "Como os textos falam com quem lê" },
  { id: "paleta", nome: "Paleta", oQueFaz: "As cores que a loja inteira usa" },
  { id: "tipografia", nome: "Tipografia", oQueFaz: "As fontes de título e de corpo" },
  { id: "contato", nome: "Contato", oQueFaz: "E-mail, WhatsApp e a chamada principal" },
  { id: "redes", nome: "Redes", oQueFaz: "Os perfis que aparecem no rodapé" },
];

/** O resumo de cada linha: o que responde a pergunta sem precisar abrir. */
function situacao(marca: MarcaCliente, gerada: boolean, id: SubId, pecas: PecaNaBancada[]): { estado: Estado; resumo: string } {
  if (id === "marca") {
    if (!marca.name.trim()) return { estado: "vazio", resumo: "Escreva o nome da loja" };
    return { estado: "configurado", resumo: `${marca.name}${marca.logoDataUri ? " · com logo" : " · sem logo"}` };
  }
  if (id === "colecoes") {
    const quantas = marca.collections.filter((nome) => nome.trim()).length;
    if (!quantas) return { estado: "vazio", resumo: "Nenhuma coleção ainda" };
    return { estado: "configurado", resumo: `${quantas} ${quantas === 1 ? "coleção definida" : "coleções definidas"}` };
  }
  if (id === "imagens") {
    const enviadas = pecas.filter((peca) => marca.imagens[peca.chave]).length;
    return enviadas
      ? { estado: "configurado", resumo: `${enviadas} de ${pecas.length} enviadas` }
      : { estado: "padrao", resumo: `${pecas.length} artes da Orbis` };
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
  marcaPropria,
  pecas,
  onChange,
  onGerar,
  onEnviarImagem,
}: {
  marca: MarcaCliente;
  nicheId: string;
  gerada: boolean;
  /**
   * A pessoa disse que JÁ TEM a marca dela.
   *
   * Nesse caminho o convite "Ainda não tem uma marca criada? Quero criar"
   * contradiz a escolha que ela acabou de fazer no passo anterior, e pior:
   * aceitar o convite sobrescreveria o nome, as cores e a logo que ela veio
   * trazer. O convite some; a bancada de preencher continua igual.
   */
  marcaPropria?: boolean;
  pecas: PecaNaBancada[];
  onChange: (parcial: Partial<MarcaCliente>) => void;
  onGerar: () => void;
  onEnviarImagem: (chave: string, arquivo: File) => Promise<void>;
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
        {aberto === "imagens"
          ? <PainelImagens marca={marca} pecas={pecas} onEnviarImagem={onEnviarImagem} />
          : aberto === "colecoes"
            ? <PainelColecoes marca={marca} onChange={onChange} />
            : <Painel id={aberto} marca={marca} onChange={onChange} onEnviarImagem={onEnviarImagem} />}
      </div>
    );
  }

  return (
    <div className="cf-body cf-bancada">
      {!marcaPropria && (
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
      )}

      <p className="cf-bancada-nota">
        Abra um de cada vez. O que o senhor deixar em branco eu resolvo com o kit, e a lista diz o que já está definido.
      </p>

      <div className="cf-bancada-lista">
        {INSTRUMENTOS.map((instrumento) => {
          const info = situacao(marca, gerada, instrumento.id, pecas);
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

/**
 * As imagens da loja, uma a uma, com a prévia do que vai entrar.
 *
 * Quem já tem marca chega com logo, banner e fotos de coleção prontos, e não
 * quer nada gerado — só um lugar para pôr o que tem. Cada peça mostra o
 * enquadramento esperado e o que está valendo agora: a arte da Orbis enquanto
 * nada foi enviado, o arquivo da pessoa depois.
 */
function PainelImagens({
  marca,
  pecas,
  onEnviarImagem,
}: {
  marca: MarcaCliente;
  pecas: PecaNaBancada[];
  onEnviarImagem: (chave: string, arquivo: File) => Promise<void>;
}) {
  const [enviando, setEnviando] = useState("");
  const [falha, setFalha] = useState("");

  async function escolher(chave: string, arquivo: File | undefined) {
    if (!arquivo) return;
    setFalha("");
    setEnviando(chave);
    try { await onEnviarImagem(chave, arquivo); }
    catch (erro) { setFalha(erro instanceof Error ? erro.message : "Não consegui enviar essa imagem."); }
    finally { setEnviando(""); }
  }

  return (
    <div className="cf-painel">
      <p className="cf-painel-nota">
        PNG, JPG ou WebP de até {MAX_UPLOAD_MB} MB. O que ficar sem envio entra com a arte da Orbis, na paleta da marca.
      </p>
      {falha && <p className="cf-painel-erro">{falha}</p>}
      <div className="cf-galeria">
        {pecas.map((peca) => {
          const enviada = marca.imagens[peca.chave];
          return (
            <label key={peca.chave} className={`cf-galeria-item ${enviada ? "enviada" : ""}`}>
              {/* eslint-disable-next-line @next/next/no-img-element -- prévia local ou mídia do próprio usuário. */}
              <img src={enviada || peca.previaLocal} alt={`Prévia de ${peca.titulo}`} />
              <b>{peca.titulo}</b>
              <span>
                <code>{peca.aspecto.replace(/^[a-z_]*?_(\d+)_(\d+)$/, "$1:$2")}</code>
                {enviada ? <i className="cf-peca-ok"><Check size={11} /> sua imagem</i> : <i>arte da Orbis</i>}
              </span>
              <span className="secondary-button">
                {enviando === peca.chave ? "Enviando…" : enviada ? "Trocar" : "Enviar"}
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  onChange={(evento) => void escolher(peca.chave, evento.target.files?.[0])}
                />
              </span>
            </label>
          );
        })}
      </div>
    </div>
  );
}

/**
 * AS COLEÇÕES da loja, escritas por quem vende.
 *
 * Não é lista fechada de propósito. O nicho sugere um ponto de partida
 * ("Novidades", "Alfaiataria"), mas quem sabe as categorias da própria loja é o
 * dono dela: uma loja de roupa pode querer "Moda Fitness" e outra "Verão", e
 * nenhuma lista nossa acerta as duas.
 *
 * O que se digita aqui vai longe: as coleções viram as capas que a arte precisa
 * cobrir, as categorias do CSV que a Shopify importa e os cartões da vitrine.
 * Por isso as duas travas — nome vazio e nome repetido — são aqui, na entrada,
 * e não três telas adiante quando já viraram arquivo.
 */
function PainelColecoes({
  marca,
  onChange,
}: {
  marca: MarcaCliente;
  onChange: (parcial: Partial<MarcaCliente>) => void;
}) {
  const [nova, setNova] = useState("");
  const [aviso, setAviso] = useState("");
  const lista = marca.collections;

  const jaExiste = (nome: string, ignorar = -1) =>
    lista.some((item, indice) => indice !== ignorar && item.trim().toLowerCase() === nome.trim().toLowerCase());

  function adicionar() {
    const nome = nova.trim();
    if (!nome) { setAviso("Escreva o nome da coleção."); return; }
    if (jaExiste(nome)) { setAviso(`"${nome}" já está na lista.`); return; }
    onChange({ collections: [...lista, nome] });
    setNova("");
    setAviso("");
  }

  function renomear(indice: number, nome: string) {
    const proxima = lista.map((item, i) => (i === indice ? nome : item));
    onChange({ collections: proxima });
  }

  /* a validação de repetido roda ao SAIR do campo, não a cada tecla: avisar
     enquanto a pessoa digita "Vestidos" letra por letra é ruído, porque
     "Vest" ainda não é o nome dela */
  function conferir(indice: number) {
    const nome = lista[indice]?.trim() ?? "";
    if (!nome) { onChange({ collections: lista.filter((_, i) => i !== indice) }); return; }
    if (jaExiste(nome, indice)) {
      setAviso(`"${nome}" estava repetida e foi removida.`);
      onChange({ collections: lista.filter((_, i) => i !== indice) });
    }
  }

  return (
    <div className="cf-painel">
      <div className="cf-colecoes-nova">
        <label className="cf-field">
          <span>Nome da coleção</span>
          <input
            value={nova}
            maxLength={40}
            placeholder="Ex.: Vestidos"
            onChange={(evento) => { setNova(evento.target.value); if (aviso) setAviso(""); }}
            onKeyDown={(evento) => { if (evento.key === "Enter") { evento.preventDefault(); adicionar(); } }}
          />
        </label>
        <button className="secondary-button" type="button" onClick={adicionar}><Plus size={13} /> Adicionar coleção</button>
      </div>
      {aviso && <p className="cf-colecoes-aviso"><CircleAlert size={13} /> {aviso}</p>}

      {lista.length === 0 ? (
        <p className="cf-painel-nota">
          Nenhuma coleção ainda. Escreva as categorias da sua loja: elas viram os cartões da vitrine,
          as capas que eu desenho e as categorias que a Shopify importa junto com os produtos.
        </p>
      ) : (
        <ul className="cf-colecoes">
          {lista.map((nome, indice) => (
            <li key={`colecao-${indice}`} className="cf-colecao">
              <input
                value={nome}
                maxLength={40}
                aria-label={`Coleção ${indice + 1}`}
                onChange={(evento) => renomear(indice, evento.target.value)}
                onBlur={() => conferir(indice)}
              />
              <button
                type="button"
                className="icon-button"
                aria-label={`Remover a coleção ${nome || indice + 1}`}
                onClick={() => onChange({ collections: lista.filter((_, i) => i !== indice) })}
              >
                <X size={14} />
              </button>
            </li>
          ))}
        </ul>
      )}
      {lista.length > 0 && (
        <p className="cf-painel-nota">
          {lista.length} {lista.length === 1 ? "coleção" : "coleções"}. Deixar o campo em branco e sair remove a linha.
        </p>
      )}
    </div>
  );
}

function Painel({
  id,
  marca,
  onChange,
  onEnviarImagem,
}: {
  id: SubId;
  marca: MarcaCliente;
  onChange: (parcial: Partial<MarcaCliente>) => void;
  onEnviarImagem: (chave: string, arquivo: File) => Promise<void>;
}) {
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
        <div className="cf-painel-logo">
          {/* eslint-disable-next-line @next/next/no-img-element -- data URI local ou mídia do próprio usuário. */}
          {(marca.imagens.logo || marca.logoDataUri) && <img src={marca.imagens.logo || marca.logoDataUri} alt="Logo da marca" />}
          <span>
            {marca.imagens.logo
              ? "Sua logo. Trocar envia outro arquivo no lugar."
              : "Logo desenhada a partir do nome e da paleta. Se você já tem a sua, envie aqui."}
          </span>
          <span className="secondary-button">
            {marca.imagens.logo ? "Trocar logo" : "Enviar minha logo"}
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={(evento) => { const arquivo = evento.target.files?.[0]; if (arquivo) void onEnviarImagem("logo", arquivo); }}
            />
          </span>
        </div>
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
