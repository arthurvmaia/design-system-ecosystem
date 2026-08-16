import { env } from "cloudflare:workers";
import { getIdentity } from "@/lib/auth";
import { ensureDatabase, ensureUser, getD1 } from "@/lib/data";
import { MAX_ARTE_GERADA_BYTES, MAX_ARTE_GERADA_MB, MAX_UPLOAD_MB } from "@/lib/business-rules.mjs";
import { consultarTarefa, magnificDisponivel, modeloPadrao, modeloValido, pedirGeracao, promptDaVitrine, type PapelMagnific } from "@/lib/magnific";

/**
 * Imagens da loja gerada, quando há provedor de IA configurado.
 *
 * GET sem parâmetro responde se o recurso existe — a área do cliente pergunta
 * isso antes de mostrar o botão, para não oferecer o que não está ligado. Com
 * `taskId`, consulta o andamento. POST abre a geração.
 *
 * A chave fica no ambiente do Worker e nunca chega ao navegador.
 */

const PAPEIS: PapelMagnific[] = ["imagem", "video", "upscale"];

function chave(): string | undefined {
  return (env as unknown as Record<string, string | undefined>).MAGNIFIC_API_KEY;
}

function papelDe(valor: string | null): PapelMagnific {
  return PAPEIS.find((papel) => papel === valor) ?? "imagem";
}

export async function GET(request: Request) {
  const identity = await getIdentity();
  if (!identity) return Response.json({ error: "AUTHENTICATION_REQUIRED" }, { status: 401 });
  await ensureUser(identity);

  const url = new URL(request.url);
  const apiKey = chave();
  if (!magnificDisponivel(apiKey)) {
    return Response.json({
      disponivel: false,
      motivo: "Nenhum provedor de imagem por IA configurado. Defina MAGNIFIC_API_KEY para ligar.",
    });
  }
  const taskId = url.searchParams.get("taskId");
  if (!taskId) return Response.json({ disponivel: true, provedor: "magnific" });

  const papel = papelDe(url.searchParams.get("papel"));
  const modelo = url.searchParams.get("modelo") ?? modeloPadrao(papel);
  try {
    const tarefa = await consultarTarefa(apiKey as string, papel, modelo, taskId);
    return Response.json({ disponivel: true, ...tarefa });
  } catch (erro) {
    return Response.json({ error: erro instanceof Error ? erro.message : "MAGNIFIC_FALHOU" }, { status: 502 });
  }
}

/**
 * Guarda a imagem gerada como mídia do usuário.
 *
 * A URL que a Magnific devolve expira, e o tema exportado precisa do arquivo
 * dentro de `assets/`. Gravando em R2 + `media_files`, a imagem vira
 * `/api/media/<id>` — o mesmo endereço que o exportador já sabe transformar em
 * asset do ZIP.
 */
async function guardarComoMidia(viewerId: string, url: string, nome: string) {
  if (!env.MEDIA) throw new Error("MEDIA_STORAGE_UNAVAILABLE");
  if (!/^https:\/\//i.test(url)) throw new Error("URL_INVALIDA");
  const resposta = await fetch(url);
  if (!resposta.ok) throw new Error(`DOWNLOAD_${resposta.status}`);
  const dados = new Uint8Array(await resposta.arrayBuffer());
  if (!dados.byteLength) throw new Error("ARQUIVO_VAZIO");
  /**
   * Recusar aqui é a ÚLTIMA linha, não a primeira.
   *
   * Este teto já foi 12 MB e já foi 20 MB, e nas duas vezes ele reprovava o
   * trabalho que o app acabou de mandar gerar e PAGAR. Com 20 MB, medido numa
   * rodada real deste computador: cenas de 17,9 e 19,8 MB passando raspando, e
   * a rodada de seis terminando com quatro. O cliente ficava sem a peça e sem
   * saber por quê.
   *
   * A causa foi atacada onde ela nasce: a peça agora pede a resolução do
   * DESTINO dela, e cena e símbolo caem para 2k. Aqui sobra o papel de barreira
   * contra resposta desgovernada, e por isso o número é folgado.
   *
   * Os 20 MB da Shopify continuam existindo, como AVISO logo abaixo: eles valem
   * na hora de subir o arquivo em Conteúdo → Arquivos, não na hora de guardar.
   */
  if (dados.byteLength > MAX_ARTE_GERADA_BYTES) {
    throw new Error(`ARQUIVO_GRANDE_${(dados.byteLength / (1024 * 1024)).toFixed(1)}MB_TETO_${MAX_ARTE_GERADA_MB}MB`);
  }
  const tipo = resposta.headers.get("content-type") ?? "image/png";
  if (!/^image\//.test(tipo)) throw new Error("TIPO_INVALIDO");

  await ensureDatabase();
  const id = crypto.randomUUID();
  const extensao = tipo.includes("jpeg") ? "jpg" : tipo.includes("webp") ? "webp" : "png";
  const arquivo = `${nome.replace(/[^a-z0-9-]/gi, "-").slice(0, 40) || "imagem"}.${extensao}`;
  const storageKey = `media/${viewerId}/${id}-${arquivo}`;
  await env.MEDIA.put(storageKey, dados, { httpMetadata: { contentType: tipo }, customMetadata: { ownerId: viewerId } });
  await getD1().prepare(`INSERT INTO media_files(id, user_id, storage_key, filename, content_type, size)
    VALUES (?, ?, ?, ?, ?, ?)`)
    .bind(id, viewerId, storageKey, arquivo, tipo, dados.byteLength)
    .run();
  const megas = dados.byteLength / (1024 * 1024);
  return {
    id,
    url: `/api/media/${id}`,
    /* passou do que a Shopify aceita por arquivo: a peça existe e serve na
       prévia, mas quem for subir precisa saber antes de descobrir lá */
    ...(megas > MAX_UPLOAD_MB
      ? { aviso: `${megas.toFixed(1)} MB: acima dos ${MAX_UPLOAD_MB} MB que a Shopify aceita por arquivo. Comprima antes de subir.` }
      : {}),
  };
}

/** As resoluções que o provedor aceita. Fora daqui, ele decide. */
const RESOLUCOES = new Set(["1k", "2k", "4k"]);

/**
 * Os fins de linha do provedor: daqui não sai imagem, por mais que se pergunte.
 *
 * A lista é generosa de propósito. Um status novo que ninguém previu volta a
 * cair no caminho de "ainda trabalhando", que é o comportamento seguro; o que
 * não pode acontecer é o contrário, dar por perdida uma tarefa que ia chegar.
 */
const TERMINOU_MAL = new Set(["FAILED", "ERROR", "CANCELED", "CANCELLED", "REJECTED", "EXPIRED", "TIMEOUT"]);

export async function POST(request: Request) {
  const identity = await getIdentity();
  if (!identity) return Response.json({ error: "AUTHENTICATION_REQUIRED" }, { status: 401 });
  const viewer = await ensureUser(identity);

  const apiKey = chave();
  if (!magnificDisponivel(apiKey)) return Response.json({ disponivel: false, error: "PROVEDOR_NAO_CONFIGURADO" }, { status: 503 });

  const corpo = await request.json().catch(() => ({})) as {
    acao?: string; taskId?: string; chave?: string;
    papel?: string; modelo?: string; nicho?: string; marca?: string; paleta?: unknown; prompt?: string; aspecto?: string;
    resolucao?: string;
  };

  /* segunda etapa: a tarefa terminou, a imagem vira mídia do usuário */
  if (corpo.acao === "salvar") {
    const papel = papelDe(corpo.papel ?? null);
    const modelo = typeof corpo.modelo === "string" && modeloValido(papel, corpo.modelo) ? corpo.modelo : modeloPadrao(papel);
    try {
      const tarefa = await consultarTarefa(apiKey as string, papel, modelo, String(corpo.taskId ?? ""));
      /**
       * TAREFA MORTA é resposta, não silêncio.
       *
       * O código só reconhecia `COMPLETED`; qualquer outro status virava
       * "ainda não". Uma tarefa que o provedor já deu por perdida ficava sendo
       * perguntada de dez em dez segundos até o orçamento de 15 minutos
       * acabar. Medido numa rodada real: 05:56:51 a última imagem chegou,
       * 06:10:35 o laço desistiu. Quatorze minutos perguntando a um morto.
       */
      if (TERMINOU_MAL.has(tarefa.status.toUpperCase())) {
        return Response.json({ disponivel: true, status: tarefa.status, pronta: false, erro: `o provedor encerrou como ${tarefa.status}` });
      }
      if (tarefa.status !== "COMPLETED" || !tarefa.imagens.length) {
        return Response.json({ disponivel: true, status: tarefa.status, pronta: false });
      }
      const midia = await guardarComoMidia(viewer.id, tarefa.imagens[0], String(corpo.chave ?? "peca"));
      return Response.json({ disponivel: true, status: tarefa.status, pronta: true, ...midia });
    } catch (erro) {
      const motivo = erro instanceof Error ? erro.message : "SALVAR_FALHOU";
      /**
       * Falha DEFINITIVA sai como 4xx, e é o que faz o cliente parar.
       *
       * Arquivo grande demais, tipo errado, resposta vazia: perguntar de novo
       * devolve exatamente a mesma coisa, porque a imagem já existe e não muda.
       * Enquanto tudo saía como 502, o cliente tratava como passageiro e
       * insistia até o teto de tempo — gastando o orçamento das peças que
       * ainda tinham chance.
       */
      const definitivo = /^(ARQUIVO_GRANDE|ARQUIVO_VAZIO|TIPO_INVALIDO|URL_INVALIDA)/.test(motivo);
      return Response.json({ error: motivo, definitivo }, { status: definitivo ? 422 : 502 });
    }
  }
  const papel = papelDe(corpo.papel ?? null);
  const modelo = typeof corpo.modelo === "string" && modeloValido(papel, corpo.modelo) ? corpo.modelo : modeloPadrao(papel);
  const paleta = Array.isArray(corpo.paleta) ? corpo.paleta.filter((cor): cor is string => typeof cor === "string").slice(0, 4) : [];
  /**
   * O texto sai do gerador de marca; o teto existe contra pedido desgovernado.
   *
   * Eram 600 caracteres, e o pedido de capa de coleção mede ~560 com um nome
   * curto: um nome comprido ("Coleção de estação") passava do teto e o corte
   * comia o FIM da frase, que é onde mora "sem letras, sem logotipos e sem
   * marca d'água". A peça voltaria com texto escrito dentro, e ninguém saberia
   * por quê. O teto sobe para o dobro, que ainda é teto e já não corta o nosso.
   */
  const prompt = typeof corpo.prompt === "string" && corpo.prompt.trim()
    ? corpo.prompt.trim().slice(0, 1200)
    : promptDaVitrine({ nicho: String(corpo.nicho ?? "produtos"), marca: String(corpo.marca ?? "a loja"), paleta });

  try {
    const tarefa = await pedirGeracao(apiKey as string, {
      papel, modelo, prompt,
      aspecto: typeof corpo.aspecto === "string" ? corpo.aspecto : undefined,
      cores: paleta,
      /* a resolução vem da PEÇA: banner precisa de 4k porque é recomposto em
         3000×1000, cena e símbolo não usam mais que 2k. Pedir 4k para tudo
         fazia arquivo de 20 MB que arrastava a rodada e estourava o teto. */
      resolucao: RESOLUCOES.has(String(corpo.resolucao)) ? String(corpo.resolucao) : undefined,
    });
    return Response.json({ disponivel: true, papel, ...tarefa });
  } catch (erro) {
    return Response.json({ error: erro instanceof Error ? erro.message : "MAGNIFIC_FALHOU" }, { status: 502 });
  }
}
