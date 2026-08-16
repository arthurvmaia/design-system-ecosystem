import { env } from "cloudflare:workers";
import { getIdentity } from "@/lib/auth";
import { ensureDatabase, ensureUser, getD1 } from "@/lib/data";
import { MAX_UPLOAD_BYTES, MAX_UPLOAD_MB } from "@/lib/business-rules.mjs";
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
   * Teto de 20 MB, o mesmo que a Shopify aceita por asset de tema.
   *
   * Era 12 MB, e ele REPROVAVA o trabalho que o app acabou de pagar: um PNG 4k
   * do provedor tem 11 a 12,3 MB medidos neste acervo, então parte das peças
   * caía exatamente em cima do corte. A geração terminava, a imagem existia, e
   * ela era descartada aqui sem nunca chegar ao tema. Foi assim que uma loja
   * saiu com 3 das 11 imagens.
   *
   * Acima de 20 MB a própria Shopify recusaria o arquivo, então recusar aqui é
   * dizer a mesma coisa mais cedo, e dizendo o tamanho.
   */
  if (dados.byteLength > MAX_UPLOAD_BYTES) {
    throw new Error(`ARQUIVO_GRANDE_${(dados.byteLength / (1024 * 1024)).toFixed(1)}MB_TETO_${MAX_UPLOAD_MB}MB`);
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
  return { id, url: `/api/media/${id}` };
}

export async function POST(request: Request) {
  const identity = await getIdentity();
  if (!identity) return Response.json({ error: "AUTHENTICATION_REQUIRED" }, { status: 401 });
  const viewer = await ensureUser(identity);

  const apiKey = chave();
  if (!magnificDisponivel(apiKey)) return Response.json({ disponivel: false, error: "PROVEDOR_NAO_CONFIGURADO" }, { status: 503 });

  const corpo = await request.json().catch(() => ({})) as {
    acao?: string; taskId?: string; chave?: string;
    papel?: string; modelo?: string; nicho?: string; marca?: string; paleta?: unknown; prompt?: string; aspecto?: string;
  };

  /* segunda etapa: a tarefa terminou, a imagem vira mídia do usuário */
  if (corpo.acao === "salvar") {
    const papel = papelDe(corpo.papel ?? null);
    const modelo = typeof corpo.modelo === "string" && modeloValido(papel, corpo.modelo) ? corpo.modelo : modeloPadrao(papel);
    try {
      const tarefa = await consultarTarefa(apiKey as string, papel, modelo, String(corpo.taskId ?? ""));
      if (tarefa.status !== "COMPLETED" || !tarefa.imagens.length) {
        return Response.json({ disponivel: true, status: tarefa.status, pronta: false });
      }
      const midia = await guardarComoMidia(viewer.id, tarefa.imagens[0], String(corpo.chave ?? "peca"));
      return Response.json({ disponivel: true, status: tarefa.status, pronta: true, ...midia });
    } catch (erro) {
      return Response.json({ error: erro instanceof Error ? erro.message : "SALVAR_FALHOU" }, { status: 502 });
    }
  }
  const papel = papelDe(corpo.papel ?? null);
  const modelo = typeof corpo.modelo === "string" && modeloValido(papel, corpo.modelo) ? corpo.modelo : modeloPadrao(papel);
  const paleta = Array.isArray(corpo.paleta) ? corpo.paleta.filter((cor): cor is string => typeof cor === "string").slice(0, 4) : [];
  /* o texto sai do gerador de marca; o do cliente é aceito, mas curto */
  const prompt = typeof corpo.prompt === "string" && corpo.prompt.trim()
    ? corpo.prompt.trim().slice(0, 600)
    : promptDaVitrine({ nicho: String(corpo.nicho ?? "produtos"), marca: String(corpo.marca ?? "a loja"), paleta });

  try {
    const tarefa = await pedirGeracao(apiKey as string, {
      papel, modelo, prompt,
      aspecto: typeof corpo.aspecto === "string" ? corpo.aspecto : undefined,
      cores: paleta,
    });
    return Response.json({ disponivel: true, papel, ...tarefa });
  } catch (erro) {
    return Response.json({ error: erro instanceof Error ? erro.message : "MAGNIFIC_FALHOU" }, { status: 502 });
  }
}
