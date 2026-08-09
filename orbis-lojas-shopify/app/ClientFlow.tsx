"use client";

import { ArrowLeft, ArrowRight, Check, CircleAlert, Download, FolderOpen, PenLine, RefreshCw, Sparkles } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Orbis } from "@/app/Orbis";
import { ClientPreviaReal } from "@/app/ClientPreviaReal";
import { ClientMarcaBancada, type MarcaCliente } from "@/app/ClientMarcaBancada";
import { RealHomeThumbnail } from "@/app/PreviewCard";
import { SECTION_LABELS, SITE_TEMPLATES } from "@/lib/site-generator.mjs";
import { NICHOS, fotoDoNicho, gerarMarca, ilustracaoDataUri, logoDaMarca, novaSemente } from "@/lib/marca-generator.mjs";
import { fallbackDataUri, pecasDaMarca } from "@/lib/marca-imagens";

/**
 * O balcão do cliente: quatro passos e uma loja na mão.
 *
 * Dois caminhos entram pela mesma porta. Quem já tem marca preenche a bancada e
 * segue. Quem não tem — a maioria, que veio montar a loja justamente porque a
 * marca ainda vai nascer — escolhe o nicho e recebe nome, paleta, tipografia,
 * voz, logo e coleções prontos, mexendo só no que quiser.
 *
 * O tema não é mais um só: a lista é a mesma da área Temas do estúdio, com a
 * home real de cada tema como miniatura. Escolhido o tema, a marca é aplicada
 * sobre os settings reais dele no servidor.
 *
 * Nada de editor, de token ou de jargão de tema nesta tela: isso é do estúdio.
 */

type Modo = "gerada" | "manual";
type Delivery = { zipPath: string; folderPath: string; entryPath: string } | null;
type Status = "idle" | "working" | "done" | "error";
type TemaDisponivel = { id: string; name: string; description?: string; sectionCount?: number };

const PASSOS = ["Projeto", "Marca", "Tema", "Revisão"] as const;

const MARCA_VAZIA: MarcaCliente = {
  name: "", slogan: "", description: "",
  primaryColor: "#0e7490", backgroundColor: "#f6f8f7", accentColor: "#0e7490",
  headingFont: "", bodyFont: "", voice: "",
  whatsapp: "", instagram: "", email: "", logoDataUri: "", collections: [], imagens: {},
};

/** A marca gerada volta como `MarcaCliente`, com o que a pessoa digitou vencendo. */
function marcaGerada(nicheId: string, semente: string, sobrescritas: Partial<MarcaCliente>): MarcaCliente {
  const gerada = gerarMarca({ nicheId, semente, sobrescritas });
  return {
    name: gerada.name, slogan: gerada.slogan, description: gerada.description,
    primaryColor: gerada.primaryColor, backgroundColor: gerada.backgroundColor, accentColor: gerada.accentColor,
    headingFont: gerada.headingFont, bodyFont: gerada.bodyFont, voice: gerada.voice,
    whatsapp: gerada.whatsapp, instagram: gerada.instagram, email: gerada.email,
    logoDataUri: gerada.logoDataUri, collections: gerada.collections,
    /* o que a pessoa enviou continua valendo depois de gerar outra marca */
    imagens: sobrescritas.imagens ?? {},
  };
}

export function ClientFlow({ onExit }: { onExit: () => void }) {
  const [passo, setPasso] = useState(0);
  /* até onde a pessoa já chegou: o que ficou para trás é clicável, o que vem
     depois não, senão daria para pular um passo que ainda nem foi preenchido */
  const [passoMaisLonge, setPassoMaisLonge] = useState(0);
  const [modo, setModo] = useState<Modo | null>(null);
  const [nicheId, setNicheId] = useState("");
  const [semente, setSemente] = useState("orbis");
  const [gerada, setGerada] = useState(false);
  const [marca, setMarca] = useState<MarcaCliente>(MARCA_VAZIA);
  const [editadoAMao, setEditadoAMao] = useState<Partial<MarcaCliente>>({});
  const [temas, setTemas] = useState<TemaDisponivel[]>([]);
  const [temasCarregando, setTemasCarregando] = useState(true);
  const [themeId, setThemeId] = useState("");
  const [templateId, setTemplateId] = useState<string>(SITE_TEMPLATES[0].id);
  /* as artes da Orbis saem do provedor de imagem; sem ele, o tema fica com
     as imagens que já traz. Marca própria não passa por aqui. */
  const [iaDisponivel, setIaDisponivel] = useState(false);
  const [imagensGeradas, setImagensGeradas] = useState<Record<string, string>>({});
  const [gerandoImagens, setGerandoImagens] = useState(false);
  const [progressoIa, setProgressoIa] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [erro, setErro] = useState<string | null>(null);
  const [delivery, setDelivery] = useState<Delivery>(null);
  const [zip, setZip] = useState<{ blob: Blob; name: string } | null>(null);

  const template = SITE_TEMPLATES.find((entrada) => entrada.id === templateId) ?? SITE_TEMPLATES[0];
  const temaEscolhido = temas.find((tema) => tema.id === themeId) ?? null;

  /* a lista de temas é a MESMA da área Temas do estúdio: o que estiver lá,
     aparece aqui para o cliente escolher */
  useEffect(() => {
    let ativo = true;
    void (async () => {
      try {
        const resposta = await fetch("/api/bootstrap");
        const dados = await resposta.json() as { themes?: TemaDisponivel[] };
        if (!ativo) return;
        const lista = Array.isArray(dados.themes) ? dados.themes : [];
        setTemas(lista);
        setThemeId((atual) => atual || lista[0]?.id || "");
      } catch {
        if (ativo) setTemas([]);
      } finally {
        if (ativo) setTemasCarregando(false);
      }
    })();
    return () => { ativo = false; };
  }, []);

  /* o provedor de imagem é opcional: a tela só oferece o que existe */
  useEffect(() => {
    let ativo = true;
    void (async () => {
      try {
        const resposta = await fetch("/api/marca-imagens");
        const dados = await resposta.json() as { disponivel?: boolean };
        if (ativo) setIaDisponivel(Boolean(dados.disponivel));
      } catch { if (ativo) setIaDisponivel(false); }
    })();
    return () => { ativo = false; };
  }, []);

  /** Troca de passo guardando até onde a pessoa já chegou. */
  function irPara(indice: number) {
    setPasso(indice);
    setPassoMaisLonge((atual) => Math.max(atual, indice));
  }

  /* quantas peças o cliente já enviou, para o passo do tema dizer sem rodeio */
  const enviadasPeloCliente = useMemo(
    () => Object.keys(marca.imagens).length,
    [marca.imagens],
  );

  /* as peças que a loja precisa, no enquadramento certo de cada uma */
  const pecas = useMemo(() => pecasDaMarca({ ...marca, nicheId }), [marca, nicheId]);

  const gerarMarcaAgora = useCallback((sementeNova: string) => {
    if (!nicheId) return;
    setSemente(sementeNova);
    setMarca(marcaGerada(nicheId, sementeNova, editadoAMao));
    setGerada(true);
  }, [nicheId, editadoAMao]);

  function ajustarMarca(parcial: Partial<MarcaCliente>) {
    setEditadoAMao((atual) => ({ ...atual, ...parcial }));
    setMarca((atual) => {
      const proxima = { ...atual, ...parcial };
      /* a logo acompanha o nome e as cores; no modo manual é a única forma de
         a loja entregue ter uma — o servidor redesenha a mesma a partir daí */
      if (proxima.name.trim()) proxima.logoDataUri = logoDaMarca(proxima).dataUri;
      return proxima;
    });
  }

  function escolherNicho(id: string) {
    setNicheId(id);
    setModo("gerada");
    const sementeNova = novaSemente();
    setSemente(sementeNova);
    setMarca(marcaGerada(id, sementeNova, editadoAMao));
    setGerada(true);
  }

  const podeAvancar = useMemo(() => {
    if (passo === 0) return modo === "manual" || (modo === "gerada" && Boolean(nicheId));
    if (passo === 1) return marca.name.trim().length >= 2;
    if (passo === 2) return Boolean(themeId);
    return true;
  }, [passo, modo, nicheId, marca.name, themeId]);

  /**
   * Guarda a imagem que a pessoa enviou e devolve o endereço dela.
   *
   * Vai para a mídia do usuário porque é de lá que o exportador tira o arquivo
   * para dentro de `assets/` no tema. A logo também vira data URI, porque a
   * prévia local e o site estático precisam dela embutida.
   */
  async function enviarImagem(chave: string, arquivo: File) {
    if (arquivo.size > 5 * 1024 * 1024) throw new Error("A imagem precisa ter até 5 MB.");
    const formulario = new FormData();
    formulario.append("file", arquivo);
    const resposta = await fetch("/api/media", { method: "POST", body: formulario });
    if (!resposta.ok) throw new Error("Não consegui guardar essa imagem. Tente PNG, JPG ou WebP de até 5 MB.");
    const { url } = await resposta.json() as { url: string };
    setMarca((atual) => ({ ...atual, imagens: { ...atual.imagens, [chave]: url } }));
    setEditadoAMao((atual) => ({ ...atual, imagens: { ...(atual.imagens ?? {}), [chave]: url } }));
    if (chave === "logo") {
      const dataUri = await new Promise<string>((resolve, reject) => {
        const leitor = new FileReader();
        leitor.onload = () => resolve(String(leitor.result ?? ""));
        leitor.onerror = () => reject(new Error("Não consegui ler o arquivo."));
        leitor.readAsDataURL(arquivo);
      });
      setMarca((atual) => ({ ...atual, logoDataUri: dataUri }));
      setEditadoAMao((atual) => ({ ...atual, logoDataUri: dataUri }));
    }
  }

  /**
   * Gera as imagens da loja no provedor e guarda cada uma como mídia.
   *
   * O modelo trabalha em fila: a chamada abre a tarefa e o resultado vem
   * depois. Por isso abrimos todas de uma vez e depois voltamos perguntando
   * quais terminaram, em vez de esperar uma por uma.
   */
  async function gerarImagens() {
    setGerandoImagens(true);
    setErro(null);
    setProgressoIa("abrindo as tarefas…");
    try {
      const cores = [marca.primaryColor, marca.accentColor, marca.backgroundColor];
      const tarefas: Array<{ chave: string; taskId: string; modelo: string }> = [];
      for (const peca of pecas as Array<{ chave: string; prompt: string; aspecto: string }>) {
        const resposta = await fetch("/api/marca-imagens", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ papel: "imagem", prompt: peca.prompt, aspecto: peca.aspecto, paleta: cores }),
        });
        if (!resposta.ok) throw new Error("O provedor recusou o pedido de imagem.");
        const dados = await resposta.json() as { taskId?: string; modelo?: string };
        if (dados.taskId && dados.modelo) tarefas.push({ chave: peca.chave, taskId: dados.taskId, modelo: dados.modelo });
      }

      const prontas: Record<string, string> = {};
      const pendentes = new Map(tarefas.map((tarefa) => [tarefa.chave, tarefa]));
      for (let volta = 0; volta < 40 && pendentes.size; volta += 1) {
        setProgressoIa(`${prontas ? Object.keys(prontas).length : 0} de ${tarefas.length} prontas…`);
        await new Promise((resolve) => window.setTimeout(resolve, 5000));
        for (const [chave, tarefa] of [...pendentes]) {
          const resposta = await fetch("/api/marca-imagens", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ acao: "salvar", papel: "imagem", taskId: tarefa.taskId, modelo: tarefa.modelo, chave }),
          });
          if (!resposta.ok) continue;
          const dados = await resposta.json() as { pronta?: boolean; url?: string };
          if (dados.pronta && dados.url) { prontas[chave] = dados.url; pendentes.delete(chave); }
        }
        setImagensGeradas({ ...prontas });
      }
      setProgressoIa(pendentes.size
        ? `${Object.keys(prontas).length} de ${tarefas.length} prontas; o resto entra com a arte da Orbis.`
        : `${tarefas.length} imagens prontas.`);
    } catch (falha) {
      setErro(falha instanceof Error ? falha.message : "Não consegui gerar as imagens agora.");
      setProgressoIa("");
    } finally {
      setGerandoImagens(false);
    }
  }

  function baixarZip(atual: { blob: Blob; name: string } | null) {
    if (!atual) return;
    const url = URL.createObjectURL(atual.blob);
    const ancora = document.createElement("a");
    ancora.href = url;
    ancora.download = `loja-${atual.name}.zip`;
    ancora.click();
    URL.revokeObjectURL(url);
  }

  async function pedirLoja() {
    setStatus("working");
    setErro(null);
    try {
      const resposta = await fetch("/api/client-request", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          themeId,
          templateId,
          nicheId: modo === "gerada" ? nicheId : undefined,
          seed: modo === "gerada" ? semente : undefined,
          brand: {
            name: marca.name, slogan: marca.slogan, description: marca.description,
            primaryColor: marca.primaryColor, backgroundColor: marca.backgroundColor, accentColor: marca.accentColor,
            headingFont: marca.headingFont || undefined, bodyFont: marca.bodyFont || undefined,
            whatsapp: marca.whatsapp, instagram: marca.instagram, email: marca.email,
          },
          /* só vai o que a IA realmente gerou; o resto o servidor desenha */
          imagens: { ...marca.imagens, ...(modo === "gerada" ? imagensGeradas : {}) },
        }),
      });
      if (!resposta.ok) {
        const payload = await resposta.json().catch(() => ({}));
        throw new Error(payload.error ?? "Não consegui gerar a loja agora. Tente novamente.");
      }
      const blob = await resposta.blob();
      const nome = resposta.headers.get("x-site-name") ?? "minha-marca";
      const pacote = { blob, name: nome };
      setZip(pacote);

      const entrega = await fetch(`/local/deliver-site?name=${encodeURIComponent(nome)}`, { method: "POST", body: blob });
      if (entrega.ok) setDelivery(await entrega.json());
      else { setDelivery(null); baixarZip(pacote); }
      setStatus("done");
    } catch (falha) {
      setErro(falha instanceof Error ? falha.message : "Não consegui gerar a loja agora.");
      setStatus("error");
    }
  }

  function recomecar() {
    setPasso(0); setPassoMaisLonge(0); setModo(null); setNicheId(""); setGerada(false);
    setMarca(MARCA_VAZIA); setEditadoAMao({});
    setTemplateId(SITE_TEMPLATES[0].id); setStatus("idle"); setErro(null); setDelivery(null); setZip(null);
    setImagensGeradas({}); setProgressoIa("");
  }

  if (status === "working") {
    return (
      <main className="client-flow">
        <div className="entry-gate-brilho" aria-hidden="true" />
        <div className="cf-panel cf-center">
          <Orbis tamanho={96} girando alt="Orbis montando a loja" />
          <h2>Montando a loja de {marca.name.trim() || "sua marca"}…</h2>
          <p>Estou aplicando sua marca ao tema, criando as coleções e embrulhando tudo para o senhor.</p>
        </div>
      </main>
    );
  }

  if (status === "done") {
    return (
      <main className="client-flow">
        <div className="entry-gate-brilho" aria-hidden="true" />
        <div className="cf-panel cf-center">
          <span className="cf-done-badge"><Check size={26} strokeWidth={2.4} /></span>
          <h2>Loja pronta, senhor.</h2>
          {delivery ? (
            <>
              <p>
                Deixei <b>uma pasta</b> na sua Área de Trabalho, com duas coisas dentro. O <b>ZIP é o
                tema</b>: suba em <b>Shopify → Loja online → Temas → Adicionar tema → Enviar arquivo
                ZIP</b> e clique em Publicar. A pasta <b>previa</b> é só para olhar aqui, com dois
                cliques no index.html. Tem um LEIA-ME lá dentro repetindo isso.
              </p>
              <div className="cf-paths">
                <div><FolderOpen size={15} /> <span>{delivery.folderPath}</span></div>
                <div><Download size={15} /> <span>{delivery.zipPath}</span></div>
                <div><FolderOpen size={15} /> <span>{delivery.entryPath}</span></div>
              </div>
            </>
          ) : (
            <p>Não consegui gravar direto na Área de Trabalho, então baixei o ZIP pelo navegador. Ele é o tema Shopify completo: suba em <b>Temas → Adicionar tema → Enviar arquivo ZIP</b>.</p>
          )}
          <div className="cf-actions">
            <button className="secondary-button" onClick={() => baixarZip(zip)}><Download size={15} /> Baixar o ZIP</button>
            <button className="secondary-button" onClick={recomecar}><RefreshCw size={15} /> Fazer outra loja</button>
            <button className="primary-button" onClick={onExit}>Concluir <ArrowRight size={15} /></button>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="client-flow">
      <div className="entry-gate-brilho" aria-hidden="true" />
      <div className="cf-layout">
        <div className="cf-panel">
          <header className="cf-head">
            <Orbis tamanho={40} alt="" />
            <div>
              <strong>Criar minha loja</strong>
              <small>Quatro passos e a loja sai no seu computador.</small>
            </div>
            <button className="text-button" onClick={onExit}>Sair</button>
          </header>

          {/* As abas são o caminho de volta: voltar dois passos com o botão
              "Voltar" é trabalho que a pessoa já fez uma vez. Só não deixam
              pular adiante do que ainda falta preencher. */}
          <ol className="cf-steps">
            {PASSOS.map((rotulo, indice) => {
              const liberado = indice <= passoMaisLonge;
              return (
                <li key={rotulo} className={indice === passo ? "active" : indice < passo ? "done" : ""}>
                  <button
                    type="button"
                    disabled={!liberado || indice === passo}
                    onClick={() => irPara(indice)}
                    aria-current={indice === passo ? "step" : undefined}
                    title={liberado ? `Ir para ${rotulo}` : "Termine o passo anterior primeiro"}
                  >
                    <i>{indice < passo ? <Check size={11} /> : String(indice + 1).padStart(2, "0")}</i>
                    {rotulo}
                  </button>
                </li>
              );
            })}
          </ol>

          {erro && <div className="error-banner" role="alert"><CircleAlert size={16} /><span>{erro}</span><button onClick={() => setErro(null)}>Entendi</button></div>}

          {passo === 0 && (
            <div className="cf-body">
              <div className="cf-modos">
                <button className={`cf-modo ${modo === "gerada" ? "selecionado" : ""}`} onClick={() => setModo("gerada")}>
                  <span className="cf-modo-icone"><Sparkles size={20} strokeWidth={1.6} /></span>
                  <strong>A Orbis cria minha marca</strong>
                  <p>Escolha o nicho e receba nome, paleta, tipografia, voz, logo e coleções. Depois é só escolher o tema.</p>
                </button>
                <button className={`cf-modo ${modo === "manual" ? "selecionado" : ""}`} onClick={() => { setModo("manual"); setNicheId(""); setGerada(false); }}>
                  <span className="cf-modo-icone"><PenLine size={20} strokeWidth={1.6} /></span>
                  <strong>Eu já tenho minha marca</strong>
                  <p>Preencha nome, cores e contatos do seu jeito. O que ficar em branco eu resolvo com o kit.</p>
                </button>
              </div>

              {modo === "gerada" && (
                <>
                  <span className="cf-secao-titulo">Escolha o nicho da loja</span>
                  <div className="cf-nichos">
                    {NICHOS.map((nicho: { id: string; nome: string; resumo: string }) => (
                      <button key={nicho.id} className={`cf-nicho ${nicheId === nicho.id ? "selecionado" : ""}`} onClick={() => escolherNicho(nicho.id)}>
                        {/* eslint-disable-next-line @next/next/no-img-element -- arquivo local do app; o desenho vetorial é a reserva. */}
                        <img
                          className="cf-nicho-arte"
                          src={fotoDoNicho(nicho.id)}
                          alt=""
                          
                          onError={(evento) => { evento.currentTarget.src = ilustracaoDataUri(nicho.id); }}
                        />
                        <strong>{nicho.nome}</strong>
                        <small>{nicho.resumo}</small>
                        {nicheId === nicho.id && <span className="cf-selected-badge"><Check size={12} /> Escolhido</span>}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}

          {passo === 1 && (
            <ClientMarcaBancada
              marca={marca}
              nicheId={nicheId}
              gerada={gerada}
              pecas={pecas.map((peca: { chave: string; titulo: string; aspecto: string; fallbackSvg: string }) => ({ chave: peca.chave, titulo: peca.titulo, aspecto: peca.aspecto, previaLocal: fallbackDataUri(peca) }))}
              onEnviarImagem={enviarImagem}
              onChange={ajustarMarca}
              onGerar={() => gerarMarcaAgora(novaSemente())}
            />
          )}

          {passo === 2 && (
            <div className="cf-body">
              <span className="cf-secao-titulo">Temas disponíveis no estúdio</span>
              {temasCarregando ? (
                <p className="cf-painel-nota">Carregando os temas…</p>
              ) : temas.length === 0 ? (
                <p className="cf-painel-nota">Nenhum tema disponível ainda. Importe um tema em <b>Importar temas</b> e ele aparece aqui.</p>
              ) : (
                <div className="cf-temas">
                  {temas.map((tema) => (
                    <button key={tema.id} className={`cf-tema ${themeId === tema.id ? "selecionado" : ""}`} onClick={() => setThemeId(tema.id)}>
                      <span className="cf-tema-thumb">
                        <RealHomeThumbnail src={`/api/theme-render?themeId=${encodeURIComponent(tema.id)}&page=index`} title={tema.name} />
                      </span>
                      <strong>{tema.name}</strong>
                      {tema.sectionCount ? <small>{tema.sectionCount} seções</small> : null}
                      {themeId === tema.id && <span className="cf-selected-badge"><Check size={12} /> Escolhido</span>}
                    </button>
                  ))}
                </div>
              )}
              {/* Marca própria não passa por geração nenhuma: quem já tem logo e
                  banner quer usar os dele, e um botão de gerar ali só confunde. */}
              <span className="cf-secao-titulo">Imagens da loja</span>
              {modo === "manual" ? (
                <p className="cf-painel-nota">
                  A loja usa as imagens que você enviou no passo <b>Marca</b> ({enviadasPeloCliente} de {pecas.length}).
                  {enviadasPeloCliente < pecas.length && " O que faltar fica com a imagem que o tema já traz."}
                </p>
              ) : (
                <>
                  <div className="cf-artes">
                    <span className="cf-modo-icone"><Sparkles size={20} strokeWidth={1.6} /></span>
                    <div>
                      <strong>Artes da Orbis</strong>
                      <p>
                        Símbolo da marca, banner de desktop e de celular e as capas das {marca.collections.length || 4} coleções,
                        {" "}em fotografia profissional, no enquadramento certo e na paleta da marca.
                        {!iaDisponivel && " Provedor de imagem não configurado: a loja sai com a imagem que o tema já traz."}
                      </p>
                    </div>
                    <button className="primary-button" disabled={gerandoImagens || !iaDisponivel} onClick={() => void gerarImagens()}>
                      {gerandoImagens ? "Gerando…" : `Gerar as ${pecas.length} imagens`}
                    </button>
                  </div>
                  <div className="cf-pecas">
                    {pecas.map((peca: { chave: string; titulo: string; aspecto: string }) => (
                      <span key={peca.chave} className="cf-peca">
                        <b>{peca.titulo}</b>
                        <code>{peca.aspecto.replace(/^[a-z_]*?_(\d+)_(\d+)$/, "$1:$2")}</code>
                        {imagensGeradas[peca.chave] ? <i className="cf-peca-ok"><Check size={11} /> pronta</i> : null}
                      </span>
                    ))}
                  </div>
                  {progressoIa && <p className="cf-painel-nota">{progressoIa}</p>}
                </>
              )}

              <span className="cf-secao-titulo">Composição das páginas</span>
              <div className="cf-templates">
                {SITE_TEMPLATES.map((entrada) => (
                  <button key={entrada.id} className={`cf-template ${templateId === entrada.id ? "selected" : ""}`} onClick={() => setTemplateId(entrada.id)}>
                    <span className="cf-template-thumb" aria-hidden="true">
                      {entrada.sections.filter((secao: string) => secao !== "announcement").slice(0, 6).map((secao: string) => <i key={secao} data-kind={secao} />)}
                    </span>
                    <strong>{entrada.name}</strong>
                    <p>{entrada.tagline}</p>
                    <span className="cf-template-sections">{entrada.sections.map((secao: string) => SECTION_LABELS[secao as keyof typeof SECTION_LABELS]).join(" · ")}</span>
                    {templateId === entrada.id && <span className="cf-selected-badge"><Check size={12} /> Escolhido</span>}
                  </button>
                ))}
              </div>
            </div>
          )}

          {passo === 3 && (
            <div className="cf-body">
              <dl className="cf-review">
                <div><dt>Como foi criada</dt><dd>{modo === "gerada" ? `Gerada pela Orbis a partir de ${NICHOS.find((n: { id: string; nome: string }) => n.id === nicheId)?.nome ?? "um nicho"}` : "Preenchida por você"}</dd></div>
                <div><dt>Marca</dt><dd>{marca.name.trim() || "Minha Marca"}</dd></div>
                {marca.slogan && <div><dt>Slogan</dt><dd>{marca.slogan}</dd></div>}
                <div><dt>Cores</dt><dd><i className="cf-swatch" style={{ background: marca.primaryColor }} /> {marca.primaryColor} · <i className="cf-swatch" style={{ background: marca.backgroundColor }} /> {marca.backgroundColor}</dd></div>
                {marca.headingFont && <div><dt>Tipografia</dt><dd>{marca.headingFont} + {marca.bodyFont}</dd></div>}
                <div><dt>Tema</dt><dd>{temaEscolhido?.name ?? "Nenhum escolhido"}</dd></div>
                <div><dt>Modelo</dt><dd>{template.name}: {template.tagline}</dd></div>
                {marca.collections.length > 0 && <div><dt>Coleções</dt><dd>{marca.collections.join(" · ")}</dd></div>}
                {(marca.whatsapp || marca.instagram || marca.email) && <div><dt>Contato</dt><dd>{[marca.whatsapp, marca.instagram && `@${marca.instagram}`, marca.email].filter(Boolean).join(" · ")}</dd></div>}
                <div><dt>Entrega</dt><dd>ZIP e pasta na sua Área de Trabalho, e o projeto no estúdio com a marca aplicada ao tema.</dd></div>
              </dl>
            </div>
          )}

          <footer className="cf-foot">
            {passo > 0 ? <button className="secondary-button" onClick={() => irPara(passo - 1)}><ArrowLeft size={15} /> Voltar</button> : <span />}
            {passo === 1 && <span className="cf-foot-dica">Escreva o nome da marca. Ele aparece na loja inteira.</span>}
            {passo < PASSOS.length - 1 ? (
              <button className="primary-button" disabled={!podeAvancar} onClick={() => irPara(passo + 1)}>Próximo <ArrowRight size={15} /></button>
            ) : (
              <button className="primary-button" onClick={() => void pedirLoja()}>Criar minha loja <ArrowRight size={15} /></button>
            )}
          </footer>
        </div>

        <aside className="cf-preview" aria-label="Prévia da loja">
          <span className="cf-preview-title">Prévia ao vivo</span>
          {/* a home REAL do tema com a marca aplicada, não um desenho de caixas */}
          <ClientPreviaReal themeId={themeId} nicheId={nicheId} marca={{
            name: marca.name || "Minha Marca", slogan: marca.slogan, description: marca.description,
            primaryColor: marca.primaryColor, backgroundColor: marca.backgroundColor, accentColor: marca.accentColor,
            headingFont: marca.headingFont || undefined, bodyFont: marca.bodyFont || undefined,
            collections: marca.collections, imagens: { ...marca.imagens, ...imagensGeradas },
          }} />
          {marca.logoDataUri && (
            <div className="cf-preview-logo">
              {/* eslint-disable-next-line @next/next/no-img-element -- data URI gerado localmente. */}
              <img src={marca.logoDataUri} alt="Logo gerada" />
              <span>Logo gerada pela Orbis</span>
            </div>
          )}
        </aside>
      </div>
    </main>
  );
}
