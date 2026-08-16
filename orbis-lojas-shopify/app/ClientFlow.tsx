"use client";

import { ArrowLeft, ArrowRight, Check, CircleAlert, Download, FolderOpen, PenLine, RefreshCw, Sparkles } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Orbis } from "@/app/Orbis";
import { ClientMarcaBancada, type MarcaCliente } from "@/app/ClientMarcaBancada";
import { RealHomeThumbnail } from "@/app/PreviewCard";
import { SITE_TEMPLATES } from "@/lib/site-generator.mjs";
import { NICHOS, fotoDoNicho, gerarMarca, ilustracaoDataUri, logoDaMarca, novaSemente, textoSobre } from "@/lib/marca-generator.mjs";
import { MAX_UPLOAD_BYTES, MAX_UPLOAD_MB } from "@/lib/business-rules.mjs";
import { coresDaMarca, fallbackDataUri, pecasDaMarca } from "@/lib/marca-imagens";
import { derivarLogos } from "@/lib/logo-derivar";
import { comporBanner } from "@/lib/banner-compor";

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
  /* o pacote passou do teto da Shopify: aviso, não erro. O ZIP existe e serve. */
  const [avisoDeTamanho, setAvisoDeTamanho] = useState("");

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

  /**
   * A MARCA e a arte dela sobrevivem a fechar a aba.
   *
   * As imagens viviam só em memória. Recarregar, sair para ver outra coisa,
   * voltar no dia seguinte: tudo apagava o mapa, e a loja nascia sem nenhuma
   * imagem, com os arquivos parados no banco, pagos e intactos. Medido neste
   * computador: as seis peças geradas às 17:50 e a loja criada às 23:15 com
   * ZERO imagens, banner no quadro cinza de "conecte esta imagem".
   *
   * O cofre guarda a SEMENTE junto, e não é detalhe: a semente é sorteada a
   * cada escolha de nicho, então guardar só as imagens não bastava — ao voltar,
   * a marca seria outra (outro nome, outras cores) e a arte da anterior ficaria
   * órfã de qualquer jeito. Guardando as duas, quem volta encontra a mesma
   * loja onde deixou.
   *
   * Por NICHO, porque é o nicho que a pessoa escolhe ao voltar. Trocar de marca
   * de propósito continua sendo o botão de gerar outra, que sorteia semente
   * nova e abre um cofre limpo.
   */
  const chaveDoCofre = (nicho: string) => (nicho ? `orbis:marca:${nicho}` : "");
  const cofre = chaveDoCofre(nicheId);
  /* a leitura mora onde a marca MUDA, não num efeito: é um evento, e efeito
     que chama setState na hora provoca render em cascata */
  const abrirCofre = useCallback((nicho: string): string => {
    const chave = chaveDoCofre(nicho);
    if (!chave) return "";
    try {
      const salvo = JSON.parse(window.localStorage.getItem(chave) ?? "null") as
        { semente?: string; imagens?: Record<string, string> } | null;
      setImagensGeradas(salvo?.imagens ?? {});
      return typeof salvo?.semente === "string" ? salvo.semente : "";
    } catch { setImagensGeradas({}); return ""; }
  }, []);
  useEffect(() => {
    if (!cofre || !semente) return;
    try {
      if (Object.keys(imagensGeradas).length) {
        window.localStorage.setItem(cofre, JSON.stringify({ semente, imagens: imagensGeradas }));
      }
    } catch { /* sem armazenamento local a sessão continua, só não guarda */ }
  }, [cofre, semente, imagensGeradas]);

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
  /* as que dependem do provedor. O nome por extenso e o favicon são desenhados
     aqui, por tipografia e geometria: entram na entrega sem fila e sem crédito */
  const pecasGeradas = useMemo(() => pecas.filter((peca) => peca.origem === "gerada"), [pecas]);

  const gerarMarcaAgora = useCallback((sementeNova: string) => {
    if (!nicheId) return;
    setSemente(sementeNova);
    setMarca(marcaGerada(nicheId, sementeNova, editadoAMao));
    setGerada(true);
    /* marca nova, cofre limpo: a arte da anterior não serve a esta */
    setImagensGeradas({});
    try { const c = chaveDoCofre(nicheId); if (c) window.localStorage.removeItem(c); } catch { /* sem armazenamento */ }
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

  /**
   * O nicho diz o que a loja VENDE. Só isso.
   *
   * Quando a Orbis é quem cria a marca, ele é também a semente da identidade —
   * daí a geração aqui. No modo manual ele traz o catálogo e não encosta na
   * marca: quem chegou com nome, cores e logo próprios não pode ver isso ser
   * sobrescrito por ter escolhido o que vende.
   */
  function escolherNicho(id: string) {
    setNicheId(id);
    /* o que já existe para este nicho volta: a semente guardada devolve a MESMA
       marca, e com ela a arte que já foi gerada e paga */
    const guardada = abrirCofre(id);
    if (modo === "manual") return;
    setModo("gerada");
    const sementeNova = guardada || novaSemente();
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
    if (arquivo.size > MAX_UPLOAD_BYTES) throw new Error(`A imagem precisa ter até ${MAX_UPLOAD_MB} MB.`);
    const formulario = new FormData();
    formulario.append("file", arquivo);
    const resposta = await fetch("/api/media", { method: "POST", body: formulario });
    if (!resposta.ok) throw new Error(`Não consegui guardar essa imagem. Tente PNG, JPG ou WebP de até ${MAX_UPLOAD_MB} MB.`);
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
      /* peça DESENHADA não vai para a fila: ela já existe, sai de vetor aqui
         mesmo. E peça que já veio não é pedida de novo: repetir o que está
         pronto gasta crédito para trocar uma imagem boa por outra. */
      for (const peca of pecasGeradas.filter((p) => !imagensGeradas[p.chave])) {
        const resposta = await fetch("/api/marca-imagens", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ papel: "imagem", prompt: peca.prompt, aspecto: peca.aspecto, paleta: cores }),
        });
        if (!resposta.ok) throw new Error("O provedor recusou o pedido de imagem.");
        const dados = await resposta.json() as { taskId?: string; modelo?: string };
        if (dados.taskId && dados.modelo) tarefas.push({ chave: peca.chave, taskId: dados.taskId, modelo: dados.modelo });
      }

      /**
       * A espera tem de caber no trabalho.
       *
       * Eram 40 voltas de 5 s: 200 segundos para um lote de doze imagens em 4k.
       * Quem não chegasse até lá era DESCARTADO, e o cliente recebia a loja com
       * o que tivesse dado tempo. Aconteceu de verdade: 3 de 11.
       *
       * Agora o teto é de 15 minutos, o intervalo cresce (a fila do provedor
       * não anda mais rápido por ser perguntada mais vezes), e nada é
       * abandonado em silêncio: peça que falhou por motivo definitivo sai da
       * fila DIZENDO o motivo, e o que sobrar no fim aparece pelo nome.
       */
      const TETO_MS = 15 * 60 * 1000;
      const comeco = Date.now();
      /* as que já estavam prontas continuam prontas: a rodada nova só soma */
      const prontas: Record<string, string> = { ...imagensGeradas };
      const falhas: Record<string, string> = {};
      const pendentes = new Map(tarefas.map((tarefa) => [tarefa.chave, tarefa]));
      const tituloDe = (chave: string) => pecas.find((peca) => peca.chave === chave)?.titulo ?? chave;

      while (pendentes.size && Date.now() - comeco < TETO_MS) {
        const decorrido = Date.now() - comeco;
        setProgressoIa(`${Object.keys(prontas).length} de ${pecasGeradas.length} prontas, ${Math.round(decorrido / 1000)}s…`);
        /* 5 s no primeiro minuto, 10 s depois: perguntar mais não faz a fila
           do provedor andar, e cada pergunta é uma consulta paga em tempo */
        await new Promise((resolve) => window.setTimeout(resolve, decorrido < 60_000 ? 5000 : 10_000));
        for (const [chave, tarefa] of [...pendentes]) {
          const resposta = await fetch("/api/marca-imagens", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ acao: "salvar", papel: "imagem", taskId: tarefa.taskId, modelo: tarefa.modelo, chave }),
          });
          if (!resposta.ok) {
            /* 4xx é definitivo (arquivo grande demais, tarefa inválida):
               insistir só gasta o relógio das outras. 5xx pode ser passageiro,
               então esse continua na fila. */
            if (resposta.status >= 400 && resposta.status < 500) {
              const corpo = await resposta.json().catch(() => ({})) as { error?: string };
              falhas[chave] = corpo.error ?? `erro ${resposta.status}`;
              pendentes.delete(chave);
            }
            continue;
          }
          const dados = await resposta.json() as { pronta?: boolean; url?: string; erro?: string };
          if (dados.pronta && dados.url) { prontas[chave] = dados.url; pendentes.delete(chave); }
          else if (dados.erro) { falhas[chave] = dados.erro; pendentes.delete(chave); }
        }
        setImagensGeradas({ ...prontas });
      }

      /**
       * As versões do símbolo saem do símbolo, aqui, por cálculo.
       *
       * Só depois que ele chega, e só uma vez. Pedi-las ao modelo devolveria
       * outro desenho a cada pedido, que é o que fazia a marca chegar em três
       * modelos diferentes.
       */
      const subir = async (blob: Blob, nome: string, tipo = "image/png") => {
        const corpo = new FormData();
        corpo.append("file", new File([blob], `${nome}.${tipo === "image/jpeg" ? "jpg" : "png"}`, { type: tipo }));
        const resposta = await fetch("/api/media", { method: "POST", body: corpo });
        if (!resposta.ok) throw new Error("UPLOAD_FALHOU");
        return (await resposta.json() as { url: string }).url;
      };

      /**
       * O BANNER vira dois arquivos, um por formato, SEM texto.
       *
       * Cada arte é cortada em 3000×1000 e 1080×1350 a partir da MESMA foto:
       * é a mesma cena no computador e no celular, que foi o pedido, e cada
       * campo recebe o corte que lhe serve em vez de o tema esticar um só.
       *
       * Sem frase nenhuma por cima. O dono pediu assim, e a razão é boa: texto
       * de banner é decisão de quem vende, e ele decide isso no editor da
       * Shopify, não aqui.
       */
      const comBanner = ["banner-1", "banner-2"].filter((chave) => prontas[chave] && !prontas[`${chave}-mobile`]);
      if (comBanner.length) {
        setProgressoIa("escrevendo o texto nos banners…");
        const paleta = coresDaMarca({ ...marca, nicheId });
        const veu = marca.primaryColor || "#101010";
        const cores = { veu, texto: textoSobre(veu), destaque: marca.accentColor || paleta[1] || textoSobre(veu) };
        const fontes = { titulo: marca.headingFont || undefined, corpo: marca.bodyFont || undefined };
        for (const chave of comBanner) {
          try {
            /* SEM texto: o dono pediu banner sem frase nenhuma. O que a
               composição faz aqui é o corte exato de cada formato a partir da
               MESMA foto, que é o que o tema não sabe fazer sozinho. */
            const texto = { titulo: "" };
            const largo = await comporBanner(prontas[chave], texto, cores, "desktop", fontes);
            const alto = await comporBanner(prontas[chave], texto, cores, "mobile", fontes);
            prontas[chave] = await subir(largo, chave, "image/jpeg");
            prontas[`${chave}-mobile`] = await subir(alto, `${chave}-mobile`, "image/jpeg");
            setImagensGeradas({ ...prontas });
          } catch {
            /* sem a composição o banner continua sendo a foto limpa, e o tema
               volta a escrever por cima: pior que o ideal, melhor que vazio */
            falhas[chave] = "não consegui escrever o texto na arte deste banner";
          }
        }
      }

      if (prontas.logo && (!prontas["logo-fundo-branco"] || !prontas["logo-fundo-preto"])) {
        setProgressoIa("recortando o símbolo e montando as versões…");
        try {
          const versoes = await derivarLogos(prontas.logo);
          prontas.logo = await subir(versoes.transparente, "logotipo");
          prontas["logo-fundo-branco"] = await subir(versoes.fundoBranco, "logotipo-fundo-branco");
          prontas["logo-fundo-preto"] = await subir(versoes.fundoPreto, "logotipo-fundo-preto");
          setImagensGeradas({ ...prontas });
        } catch {
          /* o recorte falhou (fundo que não era liso, por exemplo): a loja
             continua com o símbolo como ele veio, e as versões ficam de fora.
             Melhor faltar uma versão do que entregar um recorte que comeu
             metade do desenho. */
          falhas["logo-fundo-branco"] = "não consegui recortar o fundo do símbolo";
          falhas["logo-fundo-preto"] = "não consegui recortar o fundo do símbolo";
        }
      }

      /* o que não veio aparece PELO NOME: "faltaram 3" manda a pessoa procurar
         quais; dizer quais é a diferença entre um aviso e um enigma */
      const faltando = [...pendentes.keys(), ...Object.keys(falhas)].map(tituloDe);
      setProgressoIa(faltando.length
        ? `${Object.keys(prontas).length} de ${pecasGeradas.length} prontas. Sem imagem: ${faltando.join(", ")}. Posso gerar de novo só o que faltou.`
        : `${pecasGeradas.length} imagens prontas.`);
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
          /* o nicho vai nos dois modos: ele é o CATÁLOGO, não a marca */
          nicheId: nicheId || undefined,
          /* e quem escreve a marca é dito por extenso, não deduzido do nicho */
          criarMarca: modo === "gerada",
          /* a semente, essa sim, só faz sentido quando a Orbis inventa a marca */
          seed: modo === "gerada" ? semente : undefined,
          brand: {
            name: marca.name, slogan: marca.slogan, description: marca.description,
            primaryColor: marca.primaryColor, backgroundColor: marca.backgroundColor, accentColor: marca.accentColor,
            headingFont: marca.headingFont || undefined, bodyFont: marca.bodyFont || undefined,
            whatsapp: marca.whatsapp, instagram: marca.instagram, email: marca.email,
            /* as coleções que a pessoa escreveu vencem as do nicho: o servidor
               regera a marca, e sem isto ele devolveria as padrão por cima */
            collections: marca.collections.map((nome) => nome.trim()).filter(Boolean).slice(0, 12),
          },
          /* só vai o que a IA realmente gerou; o resto o servidor desenha */
          imagens: { ...marca.imagens, ...(modo === "gerada" ? imagensGeradas : {}) },
          /* quais dessas a Orbis gerou: o servidor precisa saber para NÃO pôr
             arte gerada no campo de logo do tema (ela vem com fundo quadrado, e
             o cabeçalho fica com um retângulo colado sobre a página) */
          imagensGeradas: modo === "gerada" ? Object.keys(imagensGeradas) : [],
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
      /* a Shopify recusa tema acima de 50 MB, e ela recusa LÁ, na hora de
         subir. Saber aqui é a diferença entre um aviso e uma tarde perdida */
      const grande = resposta.headers.get("x-theme-too-large");
      setAvisoDeTamanho(grande ? `O pacote saiu com ${grande} MB e a Shopify aceita até 50 MB. Apague algumas imagens da pasta de upload antes de subir o tema.` : "");

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
    setTemplateId(SITE_TEMPLATES[0].id); setStatus("idle"); setErro(null); setDelivery(null); setZip(null); setAvisoDeTamanho("");
    /* recomeçar é recomeçar: o cofre da marca antiga sai junto, senão a loja
       seguinte herdaria a logo de uma marca que não existe mais */
    try { if (cofre) window.localStorage.removeItem(cofre); } catch { /* sem armazenamento, nada a limpar */ }
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
          {/* aviso, não erro: o pacote existe e serve, mas a Shopify vai
              recusá-lo por tamanho, e ela recusa lá na frente sem dizer por quê */}
          {avisoDeTamanho && <p className="cf-aviso-tamanho"><CircleAlert size={14} /> {avisoDeTamanho}</p>}
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
      <div className="cf-layout cf-layout-cheio">
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
                {/* trocar para "eu já tenho marca" NÃO apaga o nicho: ele é a
                    outra pergunta, e apagá-lo tirava o catálogo de quem só
                    quis escrever a própria marca */}
                <button className={`cf-modo ${modo === "manual" ? "selecionado" : ""}`} onClick={() => { setModo("manual"); setGerada(false); }}>
                  <span className="cf-modo-icone"><PenLine size={20} strokeWidth={1.6} /></span>
                  <strong>Eu já tenho minha marca</strong>
                  <p>Preencha nome, cores e contatos do seu jeito. O que ficar em branco eu resolvo com o kit.</p>
                </button>
              </div>

              {/* O nicho vale nos DOIS caminhos. As duas caixas acima decidem
                  quem escreve a MARCA; o nicho decide o que a loja VENDE, e uma
                  coisa não diz nada sobre a outra. Enquanto ele morava dentro
                  do caminho "a Orbis cria", quem chegava com marca própria — o
                  cliente real, que já tem nome e logo — saía com a loja sem
                  produto nenhum, sem nunca ter visto esta pergunta. */}
              {modo !== null && (
                <>
                  <span className="cf-secao-titulo">
                    {modo === "gerada"
                      ? "Escolha o nicho da loja"
                      : "O que a sua loja vende? (opcional)"}
                  </span>
                  <p className="cf-secao-ajuda">
                    {modo === "gerada"
                      ? "É daqui que saem a identidade e os produtos da vitrine."
                      : "Traz os produtos da vitrine. Sua marca continua sendo a que você preencher. Sem escolher, a loja sai sem catálogo."}
                  </p>
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
              marcaPropria={modo === "manual"}
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
                        Quatro logos e um favicon, duas artes de banner que servem o computador e o celular,
                        {" "}e três cenas da marca. Cada arte é gerada UMA vez: pedir a mesma coisa duas vezes
                        {" "}devolve duas coisas diferentes, e é isso que fazia o celular abrir outra campanha.
                        {!iaDisponivel && " Provedor de imagem não configurado: a loja sai com a imagem que o tema já traz."}
                      </p>
                    </div>
                    <button className="primary-button" disabled={gerandoImagens || !iaDisponivel} onClick={() => void gerarImagens()}>
                      {/* com peças já prontas, o botão passa a ser o de
                          RETOMAR: gerar tudo de novo trocaria imagem boa por
                          outra e ainda gastaria crédito para isso */}
                      {gerandoImagens
                        ? "Gerando…"
                        : Object.keys(imagensGeradas).length >= pecasGeradas.length
                          ? "Gerar tudo de novo"
                          : Object.keys(imagensGeradas).length
                            ? `Gerar as ${pecasGeradas.length - Object.keys(imagensGeradas).length} que faltam`
                            : `Gerar as ${pecasGeradas.length} imagens`}
                    </button>
                  </div>
                  <div className="cf-pecas">
                    {pecas.map((peca) => (
                      <span key={peca.chave} className="cf-peca">
                        <b>{peca.titulo}</b>
                        <code>{peca.aspecto.replace(/^[a-z_]*?_(\d+)_(\d+)$/, "$1:$2")}</code>
                        {/* peça desenhada já nasce pronta: dizer "desenhada" em
                            vez de deixá-la sem selo evita a leitura de que ela
                            falhou ou de que ainda está na fila */}
                        {peca.origem === "desenhada"
                          ? <i className="cf-peca-ok"><Check size={11} /> desenhada</i>
                          : imagensGeradas[peca.chave]
                            ? <i className="cf-peca-ok"><Check size={11} /> {peca.origem === "derivada" ? "derivada" : "pronta"}</i>
                            : peca.origem === "derivada" ? <i className="cf-peca-nota">sai do símbolo</i> : null}
                      </span>
                    ))}
                  </div>
                  {progressoIa && <p className="cf-painel-nota">{progressoIa}</p>}
                </>
              )}

            </div>
          )}

          {passo === 3 && (
            <div className="cf-body">
              <dl className="cf-review">
                <div><dt>Como foi criada</dt><dd>{modo === "gerada" ? `Gerada pela Orbis a partir de ${NICHOS.find((n: { id: string; nome: string }) => n.id === nicheId)?.nome ?? "um nicho"}` : "Preenchida por você"}</dd></div>
                {/* o catálogo é decisão à parte da marca, então aparece à parte
                    — e "sem catálogo" é dito, não deixado para a pessoa
                    descobrir com a loja pronta e a vitrine vazia */}
                <div><dt>Catálogo</dt><dd>{nicheId
                  ? `${NICHOS.find((n: { id: string; nome: string }) => n.id === nicheId)?.nome ?? nicheId}: 10 produtos com foto e preço`
                  : "Sem catálogo: a loja sai com a vitrine vazia"}</dd></div>
                <div><dt>Marca</dt><dd>{marca.name.trim() || "Minha Marca"}</dd></div>
                {marca.slogan && <div><dt>Slogan</dt><dd>{marca.slogan}</dd></div>}
                <div><dt>Cores</dt><dd><i className="cf-swatch" style={{ background: marca.primaryColor }} /> {marca.primaryColor} · <i className="cf-swatch" style={{ background: marca.backgroundColor }} /> {marca.backgroundColor}</dd></div>
                {marca.headingFont && <div><dt>Tipografia</dt><dd>{marca.headingFont} + {marca.bodyFont}</dd></div>}
                <div><dt>Tema</dt><dd>{temaEscolhido?.name ?? "Nenhum escolhido"}</dd></div>
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

        {/**
         * A prévia ao vivo SAIU do fluxo do cliente.
         *
         * Ela ocupava uma coluna de 340px em todo passo, e nenhum deles se
         * decide olhando uma miniatura desse tamanho: escolher nicho, escrever
         * a marca, escolher tema e revisar são decisões de conteúdo, não de
         * aparência em ponto pequeno. Quem quiser ver a loja vê no editor, em
         * tamanho de gente.
         *
         * Decisão do dono, e ela libera a largura da página para onde o
         * trabalho acontece.
         */}
      </div>
    </main>
  );
}
