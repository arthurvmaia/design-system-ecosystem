import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Clock, MousePointerClick, X } from 'lucide-react';
import { FluxoProgresso } from './FluxoProgresso';

/**
 * Painel da fila.
 *
 * Só aparece no modo `queue`. Mostra o que está aguardando processamento, o
 * semáforo de saúde e o quanto já andou a rodada atual — sem nenhum botão que
 * dispare o trabalho, porque processar é uma ação que acontece fora do app,
 * por decisão de uma pessoa.
 */

type Job = {
  id: string;
  type: string;
  label: string;
  createdAt: number;
};

type Progresso = { total: number; concluidos: number; percentual: number };

type QueueState = {
  mode: string;
  pending: Job[];
  done: Job[];
  erros: number;
  progresso: Progresso | null;
};

type Semaforo = 'verde' | 'amarelo' | 'vermelho';

/**
 * Verde e amarelo não existem na paleta obsidian/crimson de propósito — ela é
 * monocromática. Estes três são tons escuros o bastante para conviver com o
 * fundo sem parecerem alerta de sistema operacional.
 */
const SEMAFORO: Record<Semaforo, { cor: string; texto: string }> = {
  verde: { cor: '#3fb950', texto: 'tudo certo' },
  amarelo: { cor: '#d29922', texto: 'atenção' },
  vermelho: { cor: '#f85149', texto: 'sem resposta' },
};

export function QueuePanel() {
  const qc = useQueryClient();
  const { data, isError } = useQuery({
    queryKey: ['queue'],
    queryFn: async () => {
      const res = await fetch('/api/queue');
      if (!res.ok) throw new Error('falha ao ler a fila');
      return res.json() as Promise<QueueState>;
    },
    // Enquanto uma rodada está em andamento vale pagar mais requisições para a
    // barra andar de forma visível. Parada, 5s é de sobra.
    refetchInterval: (query) =>
      (query.state.data as QueueState | undefined)?.progresso ? 1500 : 5000,
  });

  const cancel = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/queue/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('falha ao cancelar');
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['queue'] }),
  });

  // Servidor fora do ar é justamente o caso que o vermelho existe para mostrar,
  // então aqui o painel aparece mesmo sem dados — antes ele sumia calado.
  if (isError) {
    return (
      <div className="ds-glass-static ds-slide-up rounded-lg p-4">
        <Cabecalho estado="vermelho" />
        <div
          className="mt-3 text-[13px] leading-relaxed"
          style={{ color: 'var(--color-fg-muted)' }}
        >
          O aplicativo não respondeu, então não deu para ler a fila. Feche e abra ele de novo: dê
          dois cliques em <strong style={{ color: 'var(--color-fg)' }}>INICIAR</strong> na pasta do
          aplicativo. Seus pedidos continuam guardados.
        </div>
      </div>
    );
  }

  if (data === undefined || data.mode !== 'queue') return null;

  const pendentes = data.pending;
  const estado: Semaforo = data.erros > 0 ? 'amarelo' : 'verde';

  return (
    <div className="ds-glass-static ds-slide-up rounded-lg p-4">
      <Cabecalho estado={estado} quantidade={pendentes.length} />

      {data.progresso !== null && (
        <FluxoProgresso
          percentual={data.progresso.percentual}
          total={data.progresso.total}
          tipo={pendentes[0]?.type ?? data.done[0]?.type ?? 'extract'}
        />
      )}

      {data.erros > 0 && (
        <div className="mt-3 text-[12px] leading-relaxed" style={{ color: SEMAFORO.amarelo.cor }}>
          {data.erros === 1
            ? 'Um pedido não foi concluído'
            : `${data.erros} pedidos não foram concluídos`}{' '}
          na última rodada. Nada se perdeu. Na próxima vez que você processar, dá para tentar de
          novo.
        </div>
      )}

      {pendentes.length === 0 ? (
        <div className="mt-3 text-[12px]" style={{ color: 'var(--color-fg-subtle)' }}>
          Nada pendente.
        </div>
      ) : (
        <>
          <div className="mt-3 space-y-1.5">
            {pendentes.map((job, i) => (
              <div
                key={job.id}
                className="ds-reveal ds-visible flex items-center justify-between gap-3 rounded-md px-2 py-1.5"
                style={{ backgroundColor: 'rgba(255,255,255,0.03)' }}
              >
                <div className="flex min-w-0 items-center gap-2">
                  <span className="ds-data text-[10px]" style={{ color: 'var(--color-fg-subtle)' }}>
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <span className="truncate text-[12px]">{job.label}</span>
                </div>
                <button
                  type="button"
                  onClick={() => cancel.mutate(job.id)}
                  title="Remover da fila"
                  className="shrink-0 opacity-40 transition-opacity hover:opacity-100"
                >
                  <X size={12} />
                </button>
              </div>
            ))}
          </div>

          <div
            className="mt-3 flex items-start gap-2 border-t pt-3 text-[11px] leading-relaxed"
            style={{ borderColor: 'var(--color-border)', color: 'var(--color-fg-muted)' }}
          >
            <MousePointerClick size={12} className="mt-0.5 shrink-0" />
            <span>
              Para processar, dê dois cliques em{' '}
              <strong style={{ color: 'var(--color-fg)' }}>PROCESSAR</strong> na pasta do
              aplicativo. Ele mostra a fila e você escolhe o que quer rodar.
            </span>
          </div>
        </>
      )}
    </div>
  );
}

function Cabecalho({ estado, quantidade }: { estado: Semaforo; quantidade?: number }) {
  const { cor, texto } = SEMAFORO[estado];
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        <Clock size={13} style={{ color: 'var(--color-signal)' }} />
        <span
          className="text-[11px] uppercase tracking-[0.28em]"
          style={{ fontFamily: 'var(--font-display)' }}
        >
          Fila
        </span>
        {quantidade !== undefined && quantidade > 0 && (
          <span
            className="ds-data rounded-full px-2 py-0.5 text-[10px]"
            style={{ backgroundColor: 'var(--color-crimson-8)', color: 'var(--color-bone-1)' }}
          >
            {quantidade}
          </span>
        )}
      </div>

      <div className="flex items-center gap-2" title={texto}>
        <span
          className="inline-block h-2 w-2 shrink-0 rounded-full"
          style={{ backgroundColor: cor, boxShadow: `0 0 8px ${cor}` }}
        />
        <span
          className="text-[10px] uppercase tracking-[0.2em]"
          style={{ color: cor, fontFamily: 'var(--font-display)' }}
        >
          {texto}
        </span>
      </div>
    </div>
  );
}
