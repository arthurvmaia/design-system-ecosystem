import { Mascote } from '@/components/Mascote';
import { type TaskRecord, api } from '@/lib/api';
import { toast } from '@/lib/toast';
import { useQuery } from '@tanstack/react-query';
import { X } from 'lucide-react';
import {
  type ReactNode,
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

/**
 * A TELA DE TRABALHO: o que aparece enquanto eu faço um processo grande.
 *
 * Qualquer tela registra uma task (`acompanhar`) e esta camada cuida do resto:
 * a tela cheia animada com os eventos ao vivo, o botão de continuar navegando
 * (o processo NÃO para: só a tela sai da frente) e a pastilha no canto que fica
 * de plantão para reabrir. Uma instância só, no topo do app — dois processos
 * grandes ao mesmo tempo não é um caso que a fila do servidor produza, e duas
 * telas cheias brigando seria pior que enfileirar a segunda.
 */

type Acompanhado = { taskId: string; titulo: string };

type TrabalhoCtx = {
  /** Registra a task e ABRE a tela. */
  acompanhar: (taskId: string, titulo: string) => void;
};

const Ctx = createContext<TrabalhoCtx | null>(null);

export const useTrabalho = (): TrabalhoCtx => {
  const ctx = useContext(Ctx);
  if (ctx === null) throw new Error('useTrabalho fora do TrabalhoProvider');
  return ctx;
};

const RODANDO = new Set<TaskRecord['status']>(['queued', 'running']);

export function TrabalhoProvider({ children }: { children: ReactNode }) {
  const [atual, setAtual] = useState<Acompanhado | null>(null);
  const [aberta, setAberta] = useState(false);

  const task = useQuery({
    queryKey: ['trabalho', atual?.taskId],
    queryFn: () => (atual ? api.getTask(atual.taskId).then((r) => r.task) : null),
    enabled: atual !== null,
    refetchInterval: (q) => {
      const t = q.state.data;
      return t == null || RODANDO.has(t.status) ? 1500 : false;
    },
  });

  const ctx = useMemo<TrabalhoCtx>(
    () => ({
      acompanhar: (taskId, titulo) => {
        setAtual({ taskId, titulo });
        setAberta(true);
      },
    }),
    [],
  );

  const t = task.data ?? null;
  const rodando = atual !== null && (t === null || RODANDO.has(t.status));
  const eventos = (t?.events ?? []).slice(-4);

  // O fim não passa em silêncio quando a tela saiu da frente: um toast quando
  // a task cruza para um estado final com a tela fechada.
  const statusAnterior = useRef<TaskRecord['status'] | null>(null);
  useEffect(() => {
    const status = t?.status ?? null;
    if (status !== null && status !== statusAnterior.current && !RODANDO.has(status) && !aberta) {
      if (status === 'succeeded') toast.ok('Terminei o trabalho que estava rodando.');
      else if (status === 'failed')
        toast.erro('O trabalho falhou. Abra a pastilha para ver o motivo.');
    }
    statusAnterior.current = status;
  }, [t?.status, aberta]);

  const encerrar = () => {
    setAtual(null);
    setAberta(false);
  };

  return (
    <Ctx.Provider value={ctx}>
      {children}

      {/* A tela cheia. */}
      {atual !== null && aberta && (
        <div
          className="fixed inset-0 z-[90] flex items-center justify-center p-6"
          style={{
            background: 'color-mix(in srgb, var(--color-bg) 88%, transparent)',
            backdropFilter: 'blur(6px)',
          }}
        >
          <div className="flex w-full max-w-[560px] flex-col items-center text-center">
            <span className="ds-home-halo relative" aria-hidden />
            <Mascote tamanho={110} girando={rodando} className="ds-home-nucleo relative" />
            <h2
              className="mt-6 text-[20px] font-medium"
              style={{ color: 'var(--color-fg)', fontFamily: 'var(--font-display)' }}
            >
              {rodando
                ? atual.titulo
                : t?.status === 'succeeded'
                  ? 'Terminei.'
                  : t?.status === 'failed'
                    ? 'Não consegui terminar.'
                    : atual.titulo}
            </h2>
            <div className="mt-4 min-h-[72px] w-full">
              {eventos.length === 0 ? (
                <p className="text-[13px]" style={{ color: 'var(--color-fg-muted)' }}>
                  {rodando ? 'Já começo a contar o que estou fazendo.' : ''}
                </p>
              ) : (
                <ul className="space-y-1">
                  {eventos.map((e) => (
                    <li
                      key={`${e.timestamp}-${e.message}`}
                      className="text-[13px] leading-relaxed"
                      style={{
                        color:
                          e.level === 'error'
                            ? 'var(--color-ion-3)'
                            : e.level === 'warn'
                              ? 'var(--color-signal)'
                              : 'var(--color-fg-muted)',
                      }}
                    >
                      {e.message}
                    </li>
                  ))}
                </ul>
              )}
              {t?.status === 'failed' && t.errorMessage !== null && (
                <p className="mt-2 text-[13px]" style={{ color: 'var(--color-ion-3)' }}>
                  {t.errorMessage}
                </p>
              )}
            </div>
            <div className="mt-6 flex items-center gap-3">
              {rodando ? (
                <button
                  type="button"
                  onClick={() => setAberta(false)}
                  className="rounded-none border px-4 py-2 text-[13px]"
                  style={{ borderColor: 'var(--color-border-strong)', color: 'var(--color-fg)' }}
                >
                  Continuar navegando: eu sigo trabalhando
                </button>
              ) : (
                <button
                  type="button"
                  onClick={encerrar}
                  className="rounded-none px-4 py-2 text-[13px] font-medium"
                  style={{ backgroundColor: 'var(--color-primary)', color: 'var(--color-bone-1)' }}
                >
                  Fechar
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* A pastilha de plantão, quando a tela saiu da frente. */}
      {atual !== null && !aberta && (
        <button
          type="button"
          onClick={() => {
            if (rodando) setAberta(true);
            else encerrar();
          }}
          className="fixed bottom-4 right-4 z-[80] flex items-center gap-2 rounded-none border px-3 py-2 text-[12px] shadow-lg"
          style={{
            borderColor: 'var(--color-border-strong)',
            background: 'var(--color-bg)',
            color: 'var(--color-fg)',
          }}
          title={rodando ? 'Ver o andamento' : 'Terminou. Clique para dispensar.'}
        >
          <Mascote tamanho={18} girando={rodando} />
          {rodando ? atual.titulo : t?.status === 'failed' ? 'Não terminei. Ver.' : 'Terminei.'}
          {!rodando && <X size={11} aria-hidden />}
        </button>
      )}
    </Ctx.Provider>
  );
}
