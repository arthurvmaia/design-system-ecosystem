import { env } from "cloudflare:workers";
import { getIdentity } from "@/lib/auth";
import { ensureUser } from "@/lib/data";
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

export async function POST(request: Request) {
  const identity = await getIdentity();
  if (!identity) return Response.json({ error: "AUTHENTICATION_REQUIRED" }, { status: 401 });
  await ensureUser(identity);

  const apiKey = chave();
  if (!magnificDisponivel(apiKey)) return Response.json({ disponivel: false, error: "PROVEDOR_NAO_CONFIGURADO" }, { status: 503 });

  const corpo = await request.json().catch(() => ({})) as {
    papel?: string; modelo?: string; nicho?: string; marca?: string; paleta?: unknown; prompt?: string; aspecto?: string;
  };
  const papel = papelDe(corpo.papel ?? null);
  const modelo = typeof corpo.modelo === "string" && modeloValido(papel, corpo.modelo) ? corpo.modelo : modeloPadrao(papel);
  const paleta = Array.isArray(corpo.paleta) ? corpo.paleta.filter((cor): cor is string => typeof cor === "string").slice(0, 4) : [];
  /* o texto sai do gerador de marca; o do cliente é aceito, mas curto */
  const prompt = typeof corpo.prompt === "string" && corpo.prompt.trim()
    ? corpo.prompt.trim().slice(0, 600)
    : promptDaVitrine({ nicho: String(corpo.nicho ?? "produtos"), marca: String(corpo.marca ?? "a loja"), paleta });

  try {
    const tarefa = await pedirGeracao(apiKey as string, { papel, modelo, prompt, aspecto: typeof corpo.aspecto === "string" ? corpo.aspecto : undefined });
    return Response.json({ disponivel: true, papel, ...tarefa });
  } catch (erro) {
    return Response.json({ error: erro instanceof Error ? erro.message : "MAGNIFIC_FALHOU" }, { status: 502 });
  }
}
