import { exec } from "node:child_process";
import type { IncomingMessage } from "node:http";
import type { Plugin } from "vite";

/**
 * Só o próprio app pode pedir o desligamento. Sem isto, qualquer página aberta
 * no navegador derruba a suíte enquanto o dev server estiver de pé (um POST
 * simples não passa por preflight, então o navegador não barra sozinho).
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
 * Derruba a suíte inteira: as duas outras telas, o servidor e este app.
 *
 * As rotas deste app rodam em workerd e não enxergam processo nenhum. Quem pode
 * matar os outros é o Node do Vite — e este middleware é justamente o pedaço do
 * app que vive lá fora, no processo do dev server.
 *
 * Por porta, e não por PID guardado: os quatro processos nascem de lugares
 * diferentes e nenhum é filho deste. `taskkill /T` porque cada um tem netos, e
 * matar só o pai deixaria a porta presa por um órfão invisível.
 */
const PORTAS_DA_SUITE = [4000, 5173, 8787] as const;

function matarPorta(porta: number): Promise<void> {
  return new Promise((resolve) => {
    exec(`netstat -ano | findstr ":${porta} " | findstr LISTENING`, (erro, saida) => {
      if (erro !== null || saida.trim() === "") return resolve();
      const pids = new Set<string>();
      for (const linha of saida.trim().split("\n")) {
        const pid = linha.trim().split(/\s+/).pop();
        if (pid !== undefined && /^\d+$/.test(pid) && pid !== "0") pids.add(pid);
      }
      if (pids.size === 0) return resolve();
      let restantes = pids.size;
      for (const pid of pids) {
        exec(`taskkill /PID ${pid} /T /F`, () => {
          restantes -= 1;
          if (restantes === 0) resolve();
        });
      }
    });
  });
}

export function desligarSuite(): Plugin {
  return {
    name: "desligar-suite",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use("/local/desligar", (request, response) => {
        if (request.method !== "POST" || !isSameOrigin(request)) {
          response.statusCode = request.method !== "POST" ? 405 : 403;
          response.end(JSON.stringify({ error: "RECUSADO" }));
          return;
        }
        response.setHeader("content-type", "application/json");
        response.end(JSON.stringify({ desligando: true }));
        // A resposta sai ANTES do desligamento: sem essa folga o navegador
        // perde a conexão no meio e mostra erro para uma ação que deu certo.
        setTimeout(() => {
          void (async () => {
            for (const porta of PORTAS_DA_SUITE) await matarPorta(porta);
            process.exit(0);
          })();
        }, 400);
      });
    },
  };
}
