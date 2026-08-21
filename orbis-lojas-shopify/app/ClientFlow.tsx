"use client";

import { ArrowLeft, ArrowRight, Check, CircleAlert, Download, PenLine, RefreshCw, Sparkles, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Orbis } from "@/app/Orbis";
import { ClientMarcaBancada, type MarcaCliente } from "@/app/ClientMarcaBancada";
import { ClientPreviaReal, type Dispositivo } from "@/app/ClientPreviaReal";
import { RealHomeThumbnail } from "@/app/PreviewCard";
import { SITE_TEMPLATES } from "@/lib/site-generator.mjs";
import { NICHOS, fotoDoNicho, gerarMarca, ilustracaoDataUri, logoDaMarca, novaSemente, textoSobre } from "@/lib/marca-generator.mjs";
import { MAX_UPLOAD_BYTES, MAX_UPLOAD_MB } from "@/lib/business-rules.mjs";
import { coresDaMarca, fallbackDataUri, pecasDaMarca } from "@/lib/marca-imagens";
import { derivarLogos } from "@/lib/logo-derivar";
import {
  alteracoesRestantes, aprovar, arteLida, arteNova, comAlteracao, estadoDaArte,
  placarDasArtes, podeGerar, podePedirAlteracao, urlsAprovadas, type ArteDaLoja,
} from "@/lib/artes-da-loja";
import { comporBanner } from "@/lib/banner-compor";
import { InstalarNaLoja } from "@/app/InstalarNaLoja";
import { ARTE_DA_DOBRA_COM_FRASE } from "@/lib/shopify-brand";
import {
  PONTO_INICIAL, ROTULO_DO_PROJETO, estadoDoProjeto, passoRestauravel, pontoLido, type EstadoDoProjeto,
} from "@/lib/estado-do-projeto";

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
type Status = "idle" | "working" | "done" | "error";
type TemaDisponivel = { id: string; name: string; description?: string; sectionCount?: number };

const PASSOS = ["Projeto", "Marca", "Tema", "Revisão"] as const;

/* o relógio mora FORA do componente: ler a hora dentro dele é impuro, e a
   regra de pureza do compilador do React reprova com razão */
const agora = () => Date.now();

/**
 * O motivo da falha, em português.
 *
 * O servidor fala em código — `ARQUIVO_GRANDE_23.4MB_TETO_40MB` — porque código
 * é o que serve para decidir o que fazer. Só que quem lê a tela é o dono da
 * loja, e para ele isso não é um motivo: é um susto. Traduzir aqui deixa as
 * duas coisas certas, cada uma no seu lugar.
 */
function motivoLegivel(bruto: string): string {
  const grande = bruto.match(/^ARQUIVO_GRANDE_([\d.]+)MB/);
  if (grande) return `a imagem veio com ${grande[1]} MB, acima do que eu guardo`;
  if (/^ARQUIVO_VAZIO/.test(bruto)) return "o provedor devolveu um arquivo vazio";
  if (/^TIPO_INVALIDO/.test(bruto)) return "o provedor devolveu algo que não é imagem";
  if (/^URL_INVALIDA/.test(bruto)) return "o endereço da imagem veio inválido";
  if (/^DOWNLOAD_/.test(bruto)) return "não consegui baixar a imagem do provedor";
  if (/^MEDIA_STORAGE/.test(bruto)) return "não consegui guardar a imagem aqui";
  /* frase que já veio pronta (a de tarefa encerrada) passa direto; código
     desconhecido aparece como veio, porque esconder atrapalha o conserto */
  return bruto;
}

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

/**
 * ONDE A PESSOA PAROU, lido do disco.
 *
 * Vive fora do componente e é chamado como valor inicial de `useState`, não num
 * efeito: efeito que chama `setState` na hora provoca render em cascata e o
 * lint do projeto reprova — e, pior, faria a tela piscar no passo 1 antes de
 * pular para o 3.
 *
 * Ler no primeiro render é seguro AQUI porque este componente só existe depois
 * de um clique: a página serve o portão de entrada, não o fluxo. Não há
 * primeiro render no servidor para divergir.
 */
const CHAVE_DO_PONTO = "orbis:projeto";
function lerPonto() {
  if (typeof window === "undefined") return pontoLido(null);
  try { return pontoLido(JSON.parse(window.localStorage.getItem(CHAVE_DO_PONTO) ?? "null")); }
  catch { return pontoLido(null); }
}

/** As artes guardadas de um nicho, já passadas pela leitura que impõe os limites. */
function lerArtes(nicho: string): Record<string, ArteDaLoja> {
  if (typeof window === "undefined" || !nicho) return {};
  try {
    const salvo = JSON.parse(window.localStorage.getItem(`orbis:marca:${nicho}`) ?? "null") as
      { artes?: Record<string, unknown>; imagens?: Record<string, string> } | null;
    /* `imagens` é o formato antigo, de antes das versões: uma URL por peça.
       Ler os dois mantém de pé a loja que ficou pela metade ontem. */
    const bruto = salvo?.artes ?? salvo?.imagens ?? {};
    const lidas: Record<string, ArteDaLoja> = {};
    for (const [peca, valor] of Object.entries(bruto)) {
      const arte = arteLida(valor);
      if (arte) lidas[peca] = arte;
    }
    return lidas;
  } catch { return {}; }
}

/** A semente guardada: é ela que devolve a MESMA marca, não uma parecida. */
function lerSemente(nicho: string): string {
  if (typeof window === "undefined" || !nicho) return "";
  try {
    const salvo = JSON.parse(window.localStorage.getItem(`orbis:marca:${nicho}`) ?? "null") as { semente?: string } | null;
    return typeof salvo?.semente === "string" ? salvo.semente : "";
  } catch { return ""; }
}

/** O que a pessoa digitou por cima da marca gerada — o que não é sorteável. */
function lerEdicoes(nicho: string): Partial<MarcaCliente> {
  if (typeof window === "undefined" || !nicho) return {};
  try {
    const salvo = JSON.parse(window.localStorage.getItem(`orbis:marca:${nicho}`) ?? "null") as
      { editadoAMao?: Partial<MarcaCliente> } | null;
    const edicoes = salvo?.editadoAMao;
    return edicoes && typeof edicoes === "object" ? edicoes : {};
  } catch { return {}; }
}

/**
 * LOJA ENTREGUE não é ponto de parada: é fim.
 *
 * O ponto de parada existe para quem PAROU no meio: fechou a aba escolhendo
 * cores, voltou no dia seguinte, continua de onde estava. Quem terminou não tem
 * onde continuar — o pacote já saiu e a loja é dele.
 *
 * Sem esta distinção, o app fazia a pior coisa possível para quem monta loja
 * para os outros: o cliente SEGUINTE abria o fluxo e caía na etapa 04 da loja
 * do cliente ANTERIOR, com as artes daquele aprovadas, e o passo das artes
 * dizia "nada a gerar" — porque arte aprovada não se refaz. O ciclo travava
 * justamente onde ele deveria recomeçar.
 *
 * Então: entregou, some. O cofre daquele nicho sai junto, senão escolher o
 * mesmo nicho devolveria a marca e as artes do cliente passado. Nada se perde
 * de verdade — as imagens continuam no acervo do app e o projeto, no estúdio.
 */
function encerrarLojaEntregue(ponto: { estado: string; nicheId: string }) {
  if (typeof window === "undefined" || ponto.estado !== "completed") return;
  try {
    if (ponto.nicheId) window.localStorage.removeItem(`orbis:marca:${ponto.nicheId}`);
    window.localStorage.removeItem(CHAVE_DO_PONTO);
  } catch { /* sem armazenamento local não há o que apagar */ }
}

export function ClientFlow({ onExit, dominioShopify = "" }: { onExit: () => void; dominioShopify?: string }) {
  /**
   * O PONTO DE PARADA, restaurado.
   *
   * Antes, recarregar devolvia a pessoa ao passo 1 com tudo em branco. As artes
   * voltavam ao escolher o nicho de novo, mas o tema escolhido e o que ela
   * digitou à mão — coleções, principalmente — não voltavam de lugar nenhum:
   * não são sorteáveis a partir da semente, então eram trabalho jogado fora.
   */
  const [pontoNoDisco] = useState(lerPonto);
  /* a loja entregue não é restaurada: quem terminou começa outra, do zero */
  const ponto = pontoNoDisco.estado === "completed" ? PONTO_INICIAL : pontoNoDisco;
  const [artesGuardadas] = useState(() => lerArtes(ponto.nicheId));
  /**
   * E o que ficou no disco é apagado, não só ignorado.
   *
   * Ignorar resolveria esta abertura e deixaria a bomba armada: bastava a
   * pessoa escolher de novo o mesmo nicho para a marca e as artes do cliente
   * anterior voltarem. Apagar é efeito, então mora num efeito — e não chama
   * `setState`, porque o estado inicial já nasceu limpo.
   */
  useEffect(() => { encerrarLojaEntregue(pontoNoDisco); }, [pontoNoDisco]);
  const [passo, setPasso] = useState(() => passoRestauravel(ponto, Object.keys(artesGuardadas).length > 0));
  /* até onde a pessoa já chegou: o que ficou para trás é clicável, o que vem
     depois não, senão daria para pular um passo que ainda nem foi preenchido */
  const [passoMaisLonge, setPassoMaisLonge] = useState(() => passoRestauravel(ponto, Object.keys(artesGuardadas).length > 0));
  const [modo, setModo] = useState<Modo | null>(() => (ponto.modo === "gerada" || ponto.modo === "manual" ? ponto.modo : null));
  const [nicheId, setNicheId] = useState(() => ponto.nicheId);
  const [semente, setSemente] = useState(() => lerSemente(ponto.nicheId) || "orbis");
  const [gerada, setGerada] = useState(() => ponto.modo === "gerada" && Boolean(ponto.nicheId));
  /* a marca é RECONSTRUÍDA da semente guardada, não gravada: a mesma semente
     devolve o mesmo nome, as mesmas cores e a mesma voz, e o que foi digitado
     à mão entra por cima */
  const [marca, setMarca] = useState<MarcaCliente>(() => (
    ponto.modo === "gerada" && ponto.nicheId
      ? marcaGerada(ponto.nicheId, lerSemente(ponto.nicheId) || "orbis", lerEdicoes(ponto.nicheId))
      : { ...MARCA_VAZIA, ...lerEdicoes(ponto.nicheId) }
  ));
  const [editadoAMao, setEditadoAMao] = useState<Partial<MarcaCliente>>(() => lerEdicoes(ponto.nicheId));
  const [temas, setTemas] = useState<TemaDisponivel[]>([]);
  const [temasCarregando, setTemasCarregando] = useState(true);
  const [themeId, setThemeId] = useState(() => ponto.themeId);
  const [templateId, setTemplateId] = useState<string>(SITE_TEMPLATES[0].id);
  /* as artes da Orbis saem do provedor de imagem; sem ele, o tema fica com
     as imagens que já traz. Marca própria não passa por aqui. */
  const [iaDisponivel, setIaDisponivel] = useState(false);
  /**
   * Cada peça tem VIDA própria: versão, alterações gastas e aprovação.
   *
   * Era um mapa de `chave → url`, que não sabia dizer se aquela imagem já foi
   * refeita, quantas vezes, nem se o cliente disse sim. Sem isso não há limite
   * de alteração que se sustente: recarregar a página zerava tudo.
   */
  const [artes, setArtes] = useState<Record<string, ArteDaLoja>>(artesGuardadas);
  /* a peça aberta no visualizador; null = a lista */
  const [arteAberta, setArteAberta] = useState<string | null>(null);
  const [gerandoImagens, setGerandoImagens] = useState(false);
  const [progressoIa, setProgressoIa] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [erro, setErro] = useState<string | null>(null);
  const [zip, setZip] = useState<{ blob: Blob; name: string } | null>(null);
  /* o id do projeto entregue: é por ele que a instalação sabe QUAL loja subir,
     e ele já vinha no cabeçalho da entrega — só não tinha quem o guardasse */
  const [projetoEntregue, setProjetoEntregue] = useState("");
  /* o que a instalação direta pôs na loja: é o que faz as instruções da tela
     falarem do que FALTA, em vez de repetir o caminho manual inteiro */
  const [instalado, setInstalado] = useState<{ temaInstalado: boolean; loja: string } | null>(null);
  /* o pacote passou do teto da Shopify: aviso, não erro. O ZIP existe e serve. */
  const [avisoDeTamanho, setAvisoDeTamanho] = useState("");
  /* como a loja é conferida na revisão, e a confirmação de finalizar */
  const [dispositivo, setDispositivo] = useState<Dispositivo>("desktop");
  const [confirmando, setConfirmando] = useState(false);

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
        { semente?: string; artes?: Record<string, unknown>; imagens?: Record<string, string>; editadoAMao?: Partial<MarcaCliente> } | null;
      /* `imagens` é o formato antigo, de antes das versões: uma URL por peça.
         Ler os dois mantém de pé a loja que ficou pela metade ontem. */
      const bruto = salvo?.artes ?? salvo?.imagens ?? {};
      const lidas: Record<string, ArteDaLoja> = {};
      for (const [peca, valor] of Object.entries(bruto)) {
        const arte = arteLida(valor);
        if (arte) lidas[peca] = arte;
      }
      setArtes(lidas);
      /* o que foi digitado à mão volta junto: sem isso, escolher o nicho de
         novo devolvia a arte e apagava as coleções escritas */
      if (salvo?.editadoAMao && typeof salvo.editadoAMao === "object") setEditadoAMao(salvo.editadoAMao);
      return typeof salvo?.semente === "string" ? salvo.semente : "";
    } catch { setArtes({}); return ""; }
  }, []);
  useEffect(() => {
    if (!cofre || !semente) return;
    try {
      /* grava mesmo sem arte nenhuma: o que a pessoa DIGITOU (coleções, nome,
         cores) é o trabalho que não se refaz sozinho, e esperar a primeira
         imagem para começar a guardar perdia justamente esse */
      if (Object.keys(artes).length || Object.keys(editadoAMao).length) {
        window.localStorage.setItem(cofre, JSON.stringify({ semente, artes, editadoAMao }));
      }
    } catch { /* sem armazenamento local a sessão continua, só não guarda */ }
  }, [cofre, semente, artes, editadoAMao]);

  /**
   * O ESTADO DO PROJETO, derivado do caminho percorrido.
   *
   * Não é um campo que alguém escreve: é uma leitura do que já existe. Guardado
   * à parte, ele viraria a segunda verdade sobre a mesma coisa, e bastaria uma
   * gravação falhar no meio para o projeto dizer que está aprovando artes com
   * as artes todas aprovadas.
   */
  const estado: EstadoDoProjeto = estadoDoProjeto({
    passo, artes, gerando: gerandoImagens, entrega: status,
  });

  /**
   * O PONTO DE PARADA vai para o disco a cada mudança.
   *
   * O estado vai junto como registro — para o resumo e para o servidor —, mas
   * quem manda é a derivação acima: ao reabrir, ele é recalculado do zero.
   */
  useEffect(() => {
    try {
      window.localStorage.setItem(CHAVE_DO_PONTO, JSON.stringify({
        passo, modo: modo ?? "", nicheId, themeId, estado,
      }));
    } catch { /* sem armazenamento local a sessão continua, só não guarda */ }
  }, [passo, modo, nicheId, themeId, estado]);

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
  /**
   * As artes que PRECISAM de aprovação.
   *
   * Só as geradas e as derivadas: o nome por extenso e o favicon saem de vetor,
   * não têm versão e não há o que julgar. Cobrar aprovação delas seria pedir um
   * clique que não decide nada.
   */
  const obrigatorias = useMemo(
    () => pecas.filter((peca) => peca.origem !== "desenhada").map((peca) => peca.chave),
    [pecas],
  );
  const placar = useMemo(() => placarDasArtes(artes, obrigatorias), [artes, obrigatorias]);

  /**
   * As peças que a galeria mostra, na ordem em que a loja as usa.
   *
   * Entram as que TÊM imagem: as geradas e derivadas que já chegaram, e as
   * desenhadas, que são desenho local e existem desde sempre. Peça sem imagem
   * ficaria como um retângulo vazio prometendo algo que não está lá.
   */
  const galeria = useMemo(() => pecas
    .map((peca) => ({
      peca,
      arte: artes[peca.chave],
      /* a desenhada não tem versão nem aprovação: ela é vetor, feito aqui */
      url: artes[peca.chave]?.url ?? (peca.origem === "desenhada" ? fallbackDataUri(peca) : ""),
    }))
    .filter((item) => Boolean(item.url)), [pecas, artes]);
  const temGaleria = passo === 2 && modo === "gerada" && galeria.length > 0;
  const quantasPodemGerar = useMemo(
    () => pecasGeradas.filter((peca) => podeGerar(artes[peca.chave])).length,
    [pecasGeradas, artes],
  );

  const gerarMarcaAgora = useCallback((sementeNova: string) => {
    if (!nicheId) return;
    setSemente(sementeNova);
    setMarca(marcaGerada(nicheId, sementeNova, editadoAMao));
    setGerada(true);
    /* marca nova, cofre limpo: a arte da anterior não serve a esta */
    setArtes({});
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
    /**
     * A revisão só abre com as artes resolvidas.
     *
     * Ela é a tela do "essa é a minha loja pronta". Deixar entrar com arte
     * pendente entrega a promessa quebrada: metade da loja é decisão do
     * cliente e a outra metade é rascunho esperando.
     *
     * Sem nenhuma arte gerada o passo continua livre — quem não usa o provedor
     * de imagem não pode ficar preso numa aprovação que não existe.
     */
    if (passo === 2) {
      if (!themeId) return false;
      if (modo !== "gerada" || !Object.keys(artes).length) return true;
      return placar.pendentes.length === 0;
    }
    return true;
  }, [passo, modo, nicheId, marca.name, themeId, artes, placar]);

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
  /**
   * Gera as peças que PODEM ser geradas agora.
   *
   * `pecas` vazio = o lote inteiro que ainda cabe. Com uma peça, é o pedido de
   * alteração daquela arte. Nos dois caminhos a permissão sai da MESMA função
   * (`podeGerar`), que é o que impede "gerar tudo de novo" de virar crédito
   * infinito — enquanto fossem duas perguntas, o botão de lote era a porta dos
   * fundos para a terceira versão.
   */
  async function gerarImagens(apenas?: string[]) {
    setGerandoImagens(true);
    setErro(null);
    setProgressoIa("abrindo as tarefas…");
    try {
      const cores = [marca.primaryColor, marca.accentColor, marca.backgroundColor];
      const tarefas: Array<{ chave: string; taskId: string; modelo: string }> = [];
      /* peça DESENHADA não vai para a fila: ela já existe, sai de vetor aqui
         mesmo. E peça que já veio não é pedida de novo: repetir o que está
         pronto gasta crédito para trocar uma imagem boa por outra. */
      const alvo = pecasGeradas.filter((p) => (apenas ? apenas.includes(p.chave) : true) && podeGerar(artes[p.chave]));
      if (!alvo.length) { setProgressoIa("Nada a gerar: as artes estão aprovadas ou no limite de alterações."); return; }
      for (const peca of alvo) {
        const resposta = await fetch("/api/marca-imagens", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ papel: "imagem", prompt: peca.prompt, aspecto: peca.aspecto, resolucao: peca.resolucao, paleta: cores }),
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
      /**
       * Cada URL nova vira uma ARTE, e é aqui que a alteração é cobrada.
       *
       * Peça que não existia nasce V1, sem gastar nada — a geração original não
       * conta. Peça que já existia sobe de versão e consome uma das duas. Só
       * chega aqui o que ficou PRONTO: pedido que falhou não passa por esta
       * linha, e por isso erro do provedor não custa tentativa.
       */
      /**
       * TROCA a URL sem cobrar alteração.
       *
       * O corte do banner e o recorte da logo acontecem DEPOIS da geração e
       * substituem o arquivo da mesma versão: é a mesma foto, cortada. Passar
       * por `guardar` cobraria uma das duas alterações do cliente por um
       * trabalho que ele não pediu, e a peça chegaria na V2 recém-nascida.
       */
      const substituir = (peca: string, url: string) => {
        setArtes((atuais) => (atuais[peca]
          ? { ...atuais, [peca]: { ...atuais[peca], url } }
          : { ...atuais, [peca]: arteNova(url) }));
      };
      const guardar = (prontas: Record<string, string>) => {
        setArtes((atuais) => {
          const proximas = { ...atuais };
          for (const [peca, url] of Object.entries(prontas)) {
            if (!url || proximas[peca]?.url === url) continue;
            proximas[peca] = proximas[peca] ? comAlteracao(proximas[peca], url) : arteNova(url);
          }
          return proximas;
        });
      };
      const TETO_MS = 15 * 60 * 1000;
      const comeco = agora();
      /* as que já estavam prontas continuam prontas: a rodada nova só soma */
      const prontas: Record<string, string> = {};
      const falhas: Record<string, string> = {};
      const pendentes = new Map(tarefas.map((tarefa) => [tarefa.chave, tarefa]));
      const tituloDe = (chave: string) => pecas.find((peca) => peca.chave === chave)?.titulo ?? chave;

      while (pendentes.size && agora() - comeco < TETO_MS) {
        const decorrido = agora() - comeco;
        /* o mesmo conjunto dos dois lados do "de": `prontas` também guarda as
           versões do símbolo e o par de celular dos banners, que o denominador
           não conta. Era daí que saía o "7 de 6". */
        const jaVieram = pecasGeradas.filter((peca) => prontas[peca.chave]).length;
        setProgressoIa(`${jaVieram} de ${pecasGeradas.length} prontas, ${Math.round(decorrido / 1000)}s…`);
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
            /**
             * Insistir só faz sentido no que pode mudar.
             *
             * O servidor agora DIZ qual é o caso: arquivo grande demais, tipo
             * errado e resposta vazia voltam como 4xx com `definitivo`, porque
             * perguntar de novo devolve a mesma imagem. Antes tudo saía como
             * 502 e o cliente insistia até o teto de 15 minutos, gastando o
             * relógio das peças que ainda tinham chance.
             */
            const corpo = await resposta.json().catch(() => ({})) as { error?: string; definitivo?: boolean };
            if (corpo.definitivo || (resposta.status >= 400 && resposta.status < 500)) {
              falhas[chave] = corpo.error ?? `erro ${resposta.status}`;
              pendentes.delete(chave);
            }
            continue;
          }
          const dados = await resposta.json() as { pronta?: boolean; url?: string; erro?: string };
          if (dados.pronta && dados.url) { prontas[chave] = dados.url; pendentes.delete(chave); }
          else if (dados.erro) { falhas[chave] = dados.erro; pendentes.delete(chave); }
        }
        guardar(prontas);
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
            /**
             * A PRIMEIRA dobra é a foto e mais nada; a SEGUNDA leva a frase.
             *
             * É a mesma divisão que o tema já seguia — só que a frase deixa de
             * ser campo de texto do tema e passa a ser ASSADA na arte, com véu
             * medido e tipografia de verdade. O dono viu o texto digitado por
             * cima da foto e pediu assim: "o texto seja na imagem".
             *
             * A frase é o SLOGAN, o mesmo que ele aprovou na etapa da marca e
             * pode trocar por lá — nunca uma frase inventada aqui, e nunca
             * escrita pelo gerador de imagem, que erra letra e acento.
             */
            const levaAFrase = chave === ARTE_DA_DOBRA_COM_FRASE;
            const texto = { titulo: levaAFrase ? (marca.slogan ?? "").trim() : "" };
            const largo = await comporBanner(prontas[chave], texto, cores, "desktop", fontes);
            const alto = await comporBanner(prontas[chave], texto, cores, "mobile", fontes);
            prontas[chave] = await subir(largo, chave, "image/jpeg");
            prontas[`${chave}-mobile`] = await subir(alto, `${chave}-mobile`, "image/jpeg");
            substituir(chave, prontas[chave]);
            substituir(`${chave}-mobile`, prontas[`${chave}-mobile`]);
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
          substituir("logo", prontas.logo);
          substituir("logo-fundo-branco", prontas["logo-fundo-branco"]);
          substituir("logo-fundo-preto", prontas["logo-fundo-preto"]);
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
      /**
       * "7 de 6 prontas" — o número que não podia existir, e existia.
       *
       * O numerador contava TODAS as chaves de `prontas`, e ali dentro também
       * moram peças que o denominador não conta: as versões do símbolo, que
       * saem por cálculo, e o par de celular de cada banner. Com quatro
       * geradas mais três derivadas, dava sete de seis.
       *
       * Contar o mesmo conjunto dos dois lados é a correção inteira.
       */
      const quantasGeradas = pecasGeradas.filter((peca) => prontas[peca.chave]).length;
      /* e o motivo aparece: "sem imagem" sem por quê manda a pessoa adivinhar
         se foi o provedor, o tamanho do arquivo ou o tempo */
      const porque = [...new Set(Object.values(falhas).map(motivoLegivel))].join("; ");
      setProgressoIa(faltando.length
        ? `${quantasGeradas} de ${pecasGeradas.length} prontas. Sem imagem: ${faltando.join(", ")}${porque ? ` (${porque})` : ""}. Posso gerar de novo só o que faltou.`
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
    /**
     * O endereço do arquivo é solto DEPOIS, não na linha seguinte.
     *
     * Soltar na hora funcionava enquanto o app segurava o pacote em memória de
     * qualquer jeito. Agora ele é dispensado logo após o download, e as duas
     * coisas juntas tirariam o chão do arquivo antes de o navegador terminar
     * de gravá-lo.
     */
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
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
          /* SÓ as aprovadas: versão em análise ou no limite sem o sim do
             cliente não pode ser entregue como decisão tomada */
          imagens: { ...marca.imagens, ...(modo === "gerada" ? urlsAprovadas(artes) : {}) },
          /* quais dessas a Orbis gerou: o servidor precisa saber para NÃO pôr
             arte gerada no campo de logo do tema (ela vem com fundo quadrado, e
             o cabeçalho fica com um retângulo colado sobre a página) */
          imagensGeradas: modo === "gerada" ? Object.keys(urlsAprovadas(artes)) : [],
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
      setProjetoEntregue(resposta.headers.get("x-project-id") ?? "");
      /* a Shopify recusa tema acima de 50 MB, e ela recusa LÁ, na hora de
         subir. Saber aqui é a diferença entre um aviso e uma tarde perdida */
      const grande = resposta.headers.get("x-theme-too-large");
      setAvisoDeTamanho(grande ? `O pacote saiu com ${grande} MB e a Shopify aceita até 50 MB. Apague algumas imagens da pasta de upload antes de subir o tema.` : "");

      /**
       * O pacote fica AQUI, em memória, até a pessoa baixar.
       *
       * O app gravava uma pasta na Área de Trabalho com o ZIP e a prévia
       * extraída ao lado. Só que quem usa baixa o arquivo pelo navegador — e aí
       * a mesma loja existia em dois lugares: uma cópia em Downloads e uma
       * pasta que ninguém abria, sobrando a cada loja gerada.
       *
       * Nada se perde: a prévia local e as imagens para subir em Conteúdo →
       * Arquivos viajam DENTRO do ZIP, na pasta `previa-local`. O que saiu é a
       * segunda cópia, não o conteúdo.
       */
      setStatus("done");
    } catch (falha) {
      setErro(falha instanceof Error ? falha.message : "Não consegui gerar a loja agora.");
      setStatus("error");
    }
  }

  function recomecar() {
    setPasso(0); setPassoMaisLonge(0); setModo(null); setNicheId(""); setGerada(false);
    setMarca(MARCA_VAZIA); setEditadoAMao({});
    setTemplateId(SITE_TEMPLATES[0].id); setStatus("idle"); setErro(null); setZip(null); setProjetoEntregue(""); setInstalado(null); setAvisoDeTamanho(""); setDispositivo("desktop"); setConfirmando(false);
    /* recomeçar é recomeçar: o cofre da marca antiga sai junto, senão a loja
       seguinte herdaria a logo de uma marca que não existe mais — e o ponto de
       parada também, senão a próxima abertura voltaria para a loja recomeçada */
    try {
      if (cofre) window.localStorage.removeItem(cofre);
      window.localStorage.removeItem(CHAVE_DO_PONTO);
    } catch { /* sem armazenamento, nada a limpar */ }
    setArtes({}); setArteAberta(null); setProgressoIa("");
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
          {/**
            * O QUE FALTA, e só o que falta.
            *
            * Estas linhas ensinavam o caminho manual inteiro, sempre. Depois de
            * a instalação direta existir, elas passaram a mentir: mandavam
            * enviar em Conteúdo → Arquivos as mesmas imagens que já tinham
            * entrado, e subir um tema que, com o túnel de pé, já está lá.
            *
            * Instrução que contradiz o que acabou de acontecer é pior que
            * instrução nenhuma: faz a pessoa desconfiar do que ela viu na tela.
            */}
          {instalado ? (
            <>
              <p>
                A sua loja já está montada em <b>{instalado.loja}</b>: coleções, produtos e imagens
                entraram por aqui.
              </p>
              {instalado.temaInstalado ? (
                <p className="cf-painel-nota">
                  O tema entrou <b>sem publicar</b>. Confira em Loja online → Temas e publique quando
                  quiser trocar a loja no ar.
                </p>
              ) : (
                <p className="cf-painel-nota">
                  Falta só o tema: clique em <b>Baixar o ZIP</b> e suba em{" "}
                  <b>Loja online → Temas → Adicionar tema</b>.
                </p>
              )}
            </>
          ) : (
            <>
              <p>
                O ZIP é o tema Shopify completo. Clique em <b>Baixar o ZIP</b> e ele vai para a sua
                pasta de downloads. Depois suba em{" "}
                <b>Shopify → Loja online → Temas → Adicionar tema → Enviar arquivo ZIP</b> e clique em
                Publicar.
              </p>
              {/* a prévia local e as imagens para subir em Conteúdo → Arquivos vão
                  DENTRO do ZIP: dizer onde evita a pergunta de sempre */}
              <p className="cf-painel-nota">
                Dentro do ZIP, a pasta <b>previa-local</b> tem a loja para olhar aqui e as imagens para
                subir em Conteúdo → Arquivos.
              </p>
            </>
          )}
          {/**
            * INSTALAR direto na loja, quando dá.
            *
            * Só aparece com um projeto entregue na mão: sem ele não há o que
            * instalar, e um painel pedindo chave de acesso sem ter o que fazer
            * com ela é pedir permissão por pedir.
            *
            * Fica ACIMA dos botões e não no lugar deles — o ZIP continua sendo
            * a saída que funciona sempre, e quem preferir subir à mão não tem
            * de recusar nada para chegar nele.
            */}
          {projetoEntregue && <InstalarNaLoja projectId={projetoEntregue} dominioInicial={dominioShopify} onInstalado={setInstalado} />}
          <div className="cf-actions">
            {/**
              * Baixou, acabou: o fluxo volta ao começo.
              *
              * O pacote é o fim da linha, e a tela de "pronto" não tem mais
              * nada a fazer depois que o arquivo saiu. Ficar nela era o que
              * deixava a loja anterior acumulada no app, esperando alguém
              * lembrar de apertar "fazer outra".
              *
              * O que foi entregue não se perde: o ZIP vai para a pasta de
              * downloads e o projeto fica registrado no estúdio.
              */}
            <button className="secondary-button" onClick={() => { baixarZip(zip); recomecar(); }}><Download size={15} /> Baixar o ZIP</button>
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
      {/**
       * A CONFIRMAÇÃO de finalizar.
       *
       * Finalizar é o fim do caminho: depois dela o pacote é montado e a pessoa
       * sai do fluxo. Uma pergunta antes custa um clique e evita o "eu ainda
       * queria ver uma coisa" logo depois — e ela diz o que está sendo
       * aprovado, que é a versão apresentada, não uma promessa de perfeição.
       */}
      {confirmando && (
        <div className="cf-arte-modal" role="dialog" aria-modal="true" aria-label="Finalizar este projeto?">
          <div className="cf-arte-caixa cf-confirmar">
            <header>
              <div>
                <strong>Finalizar este projeto?</strong>
                <span>Você está aprovando a versão apresentada da sua loja.</span>
              </div>
              <button className="icon-button" aria-label="Fechar" onClick={() => setConfirmando(false)}><X size={16} /></button>
            </header>
            <footer>
              <button className="secondary-button" onClick={() => setConfirmando(false)}>Voltar e ajustar</button>
              <button className="primary-button" onClick={() => { setConfirmando(false); void pedirLoja(); }}>
                <Check size={14} /> Aprovar e finalizar
              </button>
            </footer>
          </div>
        </div>
      )}
      {/**
       * O VISUALIZADOR de uma arte.
       *
       * A lista diz o estado; aqui a pessoa VÊ a imagem no tamanho que dá para
       * julgar e decide. As duas decisões ficam juntas, e o que resta de
       * alteração é dito por extenso — número de crédito escondido é
       * reclamação garantida na terceira tentativa.
       */}
      {arteAberta && (() => {
        const peca = pecas.find((item) => item.chave === arteAberta);
        const arte = artes[arteAberta];
        if (!peca || !arte) return null;
        const restantes = alteracoesRestantes(arte);
        const podeAlterar = podePedirAlteracao(arte) && iaDisponivel && !gerandoImagens;
        return (
          <div className="cf-arte-modal" role="dialog" aria-modal="true" aria-label={`Arte: ${peca.titulo}`}>
            <div className="cf-arte-caixa">
              <header>
                <div>
                  <strong>{peca.titulo}</strong>
                  <span>Versão {arte.versao} · {restantes === 0 ? "sem alterações restantes" : `${restantes} ${restantes === 1 ? "alteração restante" : "alterações restantes"}`}</span>
                </div>
                <button className="icon-button" aria-label="Fechar" onClick={() => setArteAberta(null)}><X size={16} /></button>
              </header>
              {/* eslint-disable-next-line @next/next/no-img-element -- mídia do próprio usuário. */}
              <img src={arte.url} alt={peca.titulo} />
              {arte.aprovada ? (
                <p className="cf-arte-estado cf-arte-ok"><Check size={14} /> Arte aprovada. É ela que vai para a loja.</p>
              ) : restantes === 0 ? (
                <p className="cf-arte-estado cf-arte-limite"><CircleAlert size={14} /> Limite de alterações atingido. Esta é a versão final desta arte.</p>
              ) : null}
              <footer>
                <button
                  className="secondary-button"
                  disabled={!podeAlterar}
                  title={arte.aprovada ? "Arte já aprovada" : restantes === 0 ? "Limite de alterações atingido" : undefined}
                  onClick={() => { setArteAberta(null); void gerarImagens([peca.chave]); }}
                >
                  <RefreshCw size={14} /> Pedir alteração
                </button>
                <button
                  className="primary-button"
                  disabled={arte.aprovada}
                  onClick={() => { setArtes((atuais) => ({ ...atuais, [peca.chave]: aprovar(atuais[peca.chave]) })); setArteAberta(null); }}
                >
                  <Check size={14} /> {arte.aprovada ? "Aprovada" : "Aprovar arte"}
                </button>
              </footer>
            </div>
          </div>
        );
      })()}
      {/**
       * A COLUNA DA DIREITA volta, com outro conteúdo.
       *
       * Ela existiu para a prévia ao vivo da loja e saiu por não ajudar
       * decisão nenhuma numa miniatura de 340px. Aqui a pergunta é outra e cabe
       * exatamente nesse tamanho: "gostei desta arte?". A lista de NOMES não
       * respondia isso — obrigava a abrir peça por peça só para descobrir o que
       * era cada uma, e era isso que ficava estranho e desorganizado.
       *
       * Só no passo das artes, e só quando existe arte. Nos outros a coluna
       * ficaria reservada e vazia, tirando largura de onde o trabalho acontece.
       */}
      <div className={`cf-layout ${temGaleria ? "" : "cf-layout-cheio"}`}>
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
                      {/**
                       * O QUE ESTA CAIXA DIZ ao cliente.
                       *
                       * Ela contava o processo: quantos logos, quantos banners,
                       * por que cada peça é gerada uma vez só. Era a explicação
                       * de uma decisão INTERNA, escrita para quem construiu o
                       * app, na tela de quem contratou uma loja. Quem chega
                       * aqui não está comprando um método de geração, está
                       * comprando a identidade da marca dele.
                       *
                       * A contagem das peças, aliás, já está logo abaixo: cada
                       * arte tem o próprio nome e o próprio estado na lista.
                       * Dizer o número em prosa era repetir o que a tela mostra.
                       *
                       * O aviso do provedor FICA. Ele não é detalhe de processo:
                       * é a diferença entre a loja sair com a marca do cliente
                       * ou com as imagens que o tema já trazia, e quem não for
                       * avisado fica esperando arte que não vem.
                       */}
                      <p>
                        Sua identidade visual, criada para valorizar a sua marca.
                        {" "}A Orbis prepara artes consistentes com o estilo, o posicionamento e a
                        {" "}personalidade do seu negócio.
                        {!iaDisponivel && " Provedor de imagem não configurado: a loja sai com a imagem que o tema já traz."}
                      </p>
                    </div>
                    <button className="primary-button" disabled={gerandoImagens || !iaDisponivel} onClick={() => void gerarImagens()}>
                      {/* com peças já prontas, o botão passa a ser o de
                          RETOMAR: gerar tudo de novo trocaria imagem boa por
                          outra e ainda gastaria crédito para isso */}
                      {gerandoImagens
                        ? "Gerando…"
                        : quantasPodemGerar === 0
                          ? "Nada a gerar"
                          : quantasPodemGerar < pecasGeradas.length
                            ? `Gerar as ${quantasPodemGerar} que faltam`
                            : `Gerar as ${pecasGeradas.length} imagens`}
                    </button>
                  </div>
                  {/**
                   * A lista de NOMES só aparece enquanto não há o que ver.
                   *
                   * Depois que as artes existem, quem mostra é a galeria da
                   * direita: nome sem imagem obriga a abrir peça por peça só
                   * para descobrir o que é cada uma.
                   */}
                  {!temGaleria && (
                    <div className="cf-pecas">
                      {pecas.map((peca) => (
                        <span key={peca.chave} className={`cf-peca cf-peca-${peca.origem === "desenhada" ? "desenhada" : "ausente"}`}>
                          <b>{peca.titulo}</b>
                          {peca.origem === "desenhada" && <i className="cf-peca-ok"><Check size={11} /> desenhada</i>}
                          {peca.origem === "derivada" && <i className="cf-peca-nota">sai do símbolo</i>}
                        </span>
                      ))}
                    </div>
                  )}
                  {(() => {
                    const placar = placarDasArtes(artes, obrigatorias);
                    if (!placar.total || !Object.keys(artes).length) return null;
                    return placar.pendentes.length
                      ? <p className="cf-painel-nota">{placar.aprovadas} de {placar.total} artes aprovadas. Abra cada uma para aprovar ou pedir alteração.</p>
                      : <p className="cf-painel-nota cf-tudo-aprovado"><Check size={13} /> As {placar.total} artes estão aprovadas.</p>;
                  })()}
                  {progressoIa && <p className="cf-painel-nota">{progressoIa}</p>}
                </>
              )}

            </div>
          )}

          {passo === 3 && (
            <div className="cf-body">
              {/**
               * A REVISÃO é onde a loja aparece inteira, e é a ÚNICA etapa que
               * tem prévia.
               *
               * Nas etapas anteriores ela era uma coluna de 340px ao lado de
               * decisões de conteúdo, e não ajudava nenhuma delas. Aqui a
               * pergunta é outra e é exatamente essa: "é essa a minha loja?".
               * Por isso a prévia ocupa a largura, é o tema DE VERDADE com a
               * marca aplicada, e tem o par computador/celular.
               */}
              <div className="cf-revisao-topo">
                <div>
                  <h3>Sua loja está pronta para revisão</h3>
                  <p>Confira antes de finalizar. É o tema escolhido com a sua marca, as artes aprovadas e as suas coleções.</p>
                </div>
                <div className="cf-dispositivos" role="group" aria-label="Tamanho da tela">
                  {(["desktop", "mobile"] as const).map((qual) => (
                    <button
                      key={qual}
                      type="button"
                      className={dispositivo === qual ? "ativo" : ""}
                      aria-pressed={dispositivo === qual}
                      onClick={() => setDispositivo(qual)}
                    >
                      {qual === "desktop" ? "Computador" : "Celular"}
                    </button>
                  ))}
                </div>
              </div>
              <ClientPreviaReal
                themeId={themeId}
                nicheId={nicheId}
                dispositivo={dispositivo}
                semTema={temasCarregando ? "Procurando o tema…" : "Escolha um tema no passo anterior para ver a loja."}
                marca={{
                  name: marca.name || "Minha Marca", slogan: marca.slogan, description: marca.description,
                  primaryColor: marca.primaryColor, backgroundColor: marca.backgroundColor, accentColor: marca.accentColor,
                  headingFont: marca.headingFont || undefined, bodyFont: marca.bodyFont || undefined,
                  collections: marca.collections,
                  /* SÓ o que foi aprovado: mostrar versão em análise faria a
                     revisão prometer uma loja que não é a que vai ser entregue */
                  imagens: { ...marca.imagens, ...urlsAprovadas(artes) },
                }}
              />
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
                {obrigatorias.length > 0 && <div><dt>Artes</dt><dd>{placar.aprovadas}/{placar.total} aprovadas</dd></div>}
                <div><dt>Estado</dt><dd>{ROTULO_DO_PROJETO[estado]}</dd></div>
                <div><dt>Entrega</dt><dd>ZIP para baixar, com o tema e a pasta <b>previa-local</b> dentro, e o projeto no estúdio com a marca aplicada ao tema.</dd></div>
              </dl>
            </div>
          )}

          <footer className="cf-foot">
            {passo > 0 ? <button className="secondary-button" onClick={() => irPara(passo - 1)}><ArrowLeft size={15} /> Voltar</button> : <span />}
            {passo === 1 && <span className="cf-foot-dica">Escreva o nome da marca. Ele aparece na loja inteira.</span>}
            {/* o motivo de não dar para avançar fica DITO, no lugar onde a
                pessoa clica: botão apagado sem explicação vira "travou" */}
            {passo === 2 && placar.pendentes.length > 0 && Object.keys(artes).length > 0 && (
              <span className="cf-foot-dica cf-foot-pendente">
                Finalize a aprovação das suas artes antes de revisar sua loja: {placar.pendentes.length}
                {placar.pendentes.length === 1 ? " arte ainda precisa" : " artes ainda precisam"} de aprovação.
              </span>
            )}
            {passo < PASSOS.length - 1 ? (
              <button className="primary-button" disabled={!podeAvancar} onClick={() => irPara(passo + 1)}>Próximo <ArrowRight size={15} /></button>
            ) : (
              <button className="primary-button" onClick={() => setConfirmando(true)}>Aprovar e finalizar <ArrowRight size={15} /></button>
            )}
          </footer>
        </div>

        {/**
         * A GALERIA DAS ARTES, na coluna da direita.
         *
         * Clicar num nome não diz se a arte ficou boa. A miniatura diz, e a
         * decisão que esta etapa cobra — aprovar ou pedir outra — é uma
         * decisão de olho, não de leitura. Por isso cada peça aparece com a
         * cara dela, o número da versão e o estado, e o clique abre grande.
         *
         * Cabe em 340px porque é o que a pergunta pede: para escolher entre
         * "essa serve" e "essa não", miniatura basta; para decidir de verdade,
         * abre-se a peça.
         */}
        {temGaleria && (
          <aside className="cf-galeria">
            <header>
              <strong>Prévia das artes</strong>
              <span>Abra cada uma para ver de perto, aprovar ou pedir alteração.</span>
            </header>
            <div className="cf-galeria-grade">
              {galeria.map(({ peca, arte, url }) => {
                const estado = peca.origem === "desenhada" ? "desenhada" : estadoDaArte(arte);
                const abre = peca.origem !== "desenhada" && Boolean(arte);
                return (
                  <button
                    key={peca.chave}
                    type="button"
                    className={`cf-arte-card cf-peca-${estado}`}
                    disabled={!abre}
                    title={abre ? `Abrir ${peca.titulo}` : peca.titulo}
                    onClick={() => abre && setArteAberta(peca.chave)}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element -- mídia do próprio usuário ou desenho local. */}
                    <img src={url} alt={peca.titulo} loading="lazy" />
                    <b>{peca.titulo}</b>
                    <small>
                      {arte && <code>V{arte.versao}</code>}
                      {estado === "desenhada" && <i className="cf-peca-ok"><Check size={10} /> desenhada</i>}
                      {estado === "aprovada" && <i className="cf-peca-ok"><Check size={10} /> aprovada</i>}
                      {estado === "aguardando" && <i className="cf-peca-nota">aguardando</i>}
                      {estado === "limite" && <i className="cf-peca-limite">no limite</i>}
                    </small>
                  </button>
                );
              })}
            </div>
          </aside>
        )}
        {/**
         * A prévia ao vivo SÓ existe na revisão.
         *
         * Ela ocupava uma coluna de 340px em TODO passo, e nenhum deles se
         * decide olhando uma miniatura desse tamanho: escolher nicho, escrever
         * a marca e escolher tema são decisões de conteúdo. A coluna ficava
         * lá, tirando largura de onde o trabalho acontece, para responder uma
         * pergunta que ninguém tinha feito ainda.
         *
         * Na etapa 04 a pergunta é exatamente essa — "é essa a minha loja?" —
         * e a prévia responde em largura cheia, com o par computador/celular.
         */}
      </div>
    </main>
  );
}
