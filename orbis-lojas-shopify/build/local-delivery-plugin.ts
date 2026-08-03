import { unzipSync } from "fflate";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve, sep } from "node:path";
import type { IncomingMessage } from "node:http";
import type { Plugin } from "vite";

/**
 * Só o próprio app pode pedir gravação em disco. Sem isto, qualquer página
 * aberta no navegador consegue escrever na Área de Trabalho enquanto o dev
 * server estiver de pé (POST de blob é requisição simples, sem preflight).
 */
function isSameOrigin(request: IncomingMessage) {
  const fetchSite = request.headers["sec-fetch-site"];
  if (typeof fetchSite === "string" && fetchSite !== "same-origin" && fetchSite !== "none") return false;
  const origin = request.headers.origin;
  if (!origin) return true;
  try {
    return new URL(origin).host === request.headers.host;
  } catch {
    return false;
  }
}

/**
 * Entrega local do Fluxo Cliente (só em dev).
 *
 * As rotas da aplicação rodam em workerd e não enxergam o disco. Este
 * middleware roda no processo Node do Vite e é quem grava o site do cliente na
 * Área de Trabalho: o ZIP do jeito que veio e a pasta extraída ao lado, para o
 * index.html abrir com dois cliques. Fora do dev server a rota não existe e o
 * front cai no download do navegador.
 */
export function localDelivery(): Plugin {
  return {
    name: "local-delivery",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use("/local/deliver-site", (request, response) => {
        if (request.method !== "POST") {
          response.statusCode = 405;
          response.end(JSON.stringify({ error: "METHOD_NOT_ALLOWED" }));
          return;
        }
        if (!isSameOrigin(request)) {
          response.statusCode = 403;
          response.end(JSON.stringify({ error: "CROSS_ORIGIN_BLOCKED" }));
          return;
        }

        const chunks: Buffer[] = [];
        request.on("data", (chunk: Buffer) => chunks.push(chunk));
        request.on("end", () => {
          void (async () => {
            try {
              const zip = Buffer.concat(chunks);
              if (!zip.length || zip.length > 30_000_000) throw new Error("INVALID_ZIP");

              const url = new URL(request.url ?? "/", "http://localhost");
              const rawName = url.searchParams.get("name") ?? "minha-marca";
              const slug = rawName.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48) || "minha-marca";

              const desktop = join(homedir(), "Desktop");
              const zipPath = join(desktop, `site-${slug}.zip`);
              const folderPath = join(desktop, `site-${slug}`);

              const files = unzipSync(new Uint8Array(zip));
              // Se algo estiver segurando a pasta (Explorer, um servidor com o
              // cwd dentro dela), sobrescrever por cima ainda entrega o site.
              await rm(folderPath, { recursive: true, force: true }).catch(() => {});
              await mkdir(folderPath, { recursive: true });
              const root = resolve(folderPath);
              for (const [path, content] of Object.entries(files)) {
                // Contra ZIP Slip: o destino tem de continuar DENTRO da pasta —
                // com separador, senão "site-abc-outra" passaria por prefixo.
                const target = resolve(root, path);
                if (target !== root && !target.startsWith(root + sep)) continue;
                await mkdir(resolve(target, ".."), { recursive: true });
                await writeFile(target, content);
              }
              await writeFile(zipPath, zip);

              response.setHeader("content-type", "application/json");
              response.end(JSON.stringify({ zipPath, folderPath, entryPath: join(folderPath, "index.html") }));
            } catch (error) {
              response.statusCode = 500;
              response.setHeader("content-type", "application/json");
              response.end(JSON.stringify({ error: error instanceof Error ? error.message : "DELIVERY_FAILED" }));
            }
          })();
        });
      });
    },
  };
}
