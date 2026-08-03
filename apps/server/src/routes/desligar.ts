import { exec } from 'node:child_process';
import { Hono } from 'hono';

/**
 * Desligar a suíte inteira, de dentro do app.
 *
 * O INICIAR sobe quatro processos e o jeito de encerrar era fechar a janela
 * preta certa. Quem usa o app pelo navegador, em modo `--app`, nem vê essa
 * janela: fechava o navegador e deixava tudo rodando atrás, comendo memória e
 * segurando as portas. O próximo INICIAR então reclamava de uma sobra que a
 * pessoa não tinha como enxergar.
 *
 * ## Por que esta rota fica ATRÁS do portão
 *
 * Ela é a mais destrutiva do app: derruba o servidor, a tela, o portal e o app
 * de lojas de uma vez. As rotas de `/api/orbis` são as únicas que respondem sem
 * sessão, porque são a própria porta; desligar não pode viver ali. Aqui, o
 * guarda de `index.ts` exige sessão, e o nível `visita` já é recusado por ser
 * uma escrita. Quem desliga é quem entrou com a credencial de dono.
 *
 * ## Como ela mata o que não é dela
 *
 * Por porta, e não por PID guardado. Os quatro processos nascem de lugares
 * diferentes (o turbo sobe três, o `npm run dev` do app de lojas sobe outro),
 * e nenhum deles é filho deste servidor. A porta é o único fio que liga este
 * processo aos outros três, e é o mesmo fio que o `iniciar.ps1` já usa para
 * saber se sobrou algo rodando.
 *
 * `taskkill /T` porque cada um desses processos tem netos (node, workerd): matar
 * só o pai deixaria a porta presa por um órfão invisível.
 */
export const desligarRoute = new Hono();

/** As quatro peças da suíte. A ordem coloca este servidor por último. */
const PORTAS_DA_SUITE = [3000, 4000, 5173] as const;

const matarPorta = (porta: number): Promise<void> =>
  new Promise((resolve) => {
    // `netstat -ano` lista as conexões com o PID dono. O filtro pega só quem
    // ESCUTA na porta: uma conexão de saída para a mesma porta não é o servidor.
    exec(`netstat -ano | findstr ":${porta} " | findstr LISTENING`, (erro, saida) => {
      if (erro !== null || saida.trim() === '') {
        resolve();
        return;
      }
      const pids = new Set<string>();
      for (const linha of saida.trim().split('\n')) {
        const pid = linha.trim().split(/\s+/).pop();
        if (pid !== undefined && /^\d+$/.test(pid) && pid !== '0') pids.add(pid);
      }
      if (pids.size === 0) {
        resolve();
        return;
      }
      let restantes = pids.size;
      for (const pid of pids) {
        exec(`taskkill /PID ${pid} /T /F`, () => {
          restantes -= 1;
          if (restantes === 0) resolve();
        });
      }
    });
  });

export const desligarSuite = async (): Promise<void> => {
  for (const porta of PORTAS_DA_SUITE) await matarPorta(porta);
  // Este processo por último, e só depois que os outros caíram: morrer primeiro
  // deixaria os três de pé sem ninguém para derrubá-los.
  process.exit(0);
};

desligarRoute.post('/', (c) => {
  // A resposta sai ANTES do desligamento. Sem essa folga, o navegador perde a
  // conexão no meio e mostra erro de rede para uma ação que deu certo, o que é
  // a pior mentira possível numa tela de desligar.
  setTimeout(() => {
    void desligarSuite();
  }, 400);
  return c.json({ desligando: true, portas: [...PORTAS_DA_SUITE, 8787] });
});
