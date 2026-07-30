import { Mascote } from '@/components/Mascote';
import { QueuePanel } from '@/components/QueuePanel';
import { type QueueJobRef, type TaskRecord, api } from '@/lib/api';
import { cn } from '@/lib/cn';
import { TRABALHANDO, saudacaoCompleta } from '@/lib/orbis';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FileText, Link as LinkIcon, MousePointerClick, UploadCloud } from 'lucide-react';
import { type ChangeEvent, useState } from 'react';
import { useNavigate } from 'react-router-dom';

type Mode = 'url' | 'file';

/** Tamanho de arquivo em linguagem de gente — nada de "bytes" cru na tela. */
function tamanhoLegivel(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Tela de entrada do fluxo: a bancada onde o material chega.
 *
 * O painel de envio é o único elemento com moldura acesa da tela, porque é o
 * único que espera ação. Todo o resto — fila, acompanhamento, log — é leitura,
 * e leitura não pisca.
 *
 * O acompanhamento virou log de instrumento: carimbo de tempo à esquerda,
 * mensagem à direita, nível pela cor. Uma extração é uma sequência de eventos no
 * tempo; sem a hora, viram frases soltas e não dá para saber onde travou.
 */
export function ExtractPage() {
  const health = useQuery({ queryKey: ['health'], queryFn: api.health });
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [mode, setMode] = useState<Mode>('url');
  const [url, setUrl] = useState('');
  const [urlName, setUrlName] = useState('');
  const [htmlFile, setHtmlFile] = useState<{ name: string; content: string } | null>(null);
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const [queuedJob, setQueuedJob] = useState<QueueJobRef | null>(null);

  // O modo decide o que acontece ao clicar em extrair: `api` roda agora,
  // `queue` só registra o pedido em disco. Mesma queryKey do QueuePanel de
  // propósito — os dois leem a mesma resposta, então o shape tem que bater.
  const queue = useQuery({
    queryKey: ['queue'],
    queryFn: async () => {
      const res = await fetch('/api/queue');
      if (!res.ok) throw new Error('falha ao ler a fila');
      return res.json() as Promise<{
        mode: string;
        pending: QueueJobRef[];
        done: QueueJobRef[];
        erros: number;
        progresso: { total: number; concluidos: number; percentual: number } | null;
      }>;
    },
  });
  const isQueueMode = queue.data?.mode === 'queue';

  const activeTask = useQuery({
    queryKey: ['task', activeTaskId],
    queryFn: () => (activeTaskId ? api.getTask(activeTaskId).then((r) => r.task) : null),
    refetchInterval: (query) => {
      const task = query.state.data as TaskRecord | null | undefined;
      if (!task) return false;
      if (task.status === 'running' || task.status === 'queued') return 1500;
      return false;
    },
    enabled: activeTaskId !== null,
  });

  const start = useMutation({
    mutationFn: async () => {
      if (mode === 'url') {
        return api.createDesignSystem({
          kind: 'url',
          url,
          name: urlName || undefined,
        });
      }
      if (!htmlFile) throw new Error('Preciso de um arquivo HTML para começar.');
      return api.createDesignSystem({
        kind: 'html',
        html: htmlFile.content,
        name: htmlFile.name.replace(/\.html?$/i, ''),
      });
    },
    onSuccess: (res) => {
      // Modo `api`: veio uma task, dá para acompanhar o progresso aqui.
      if ('task' in res) {
        setQueuedJob(null);
        setActiveTaskId(res.task.id);
        qc.invalidateQueries({ queryKey: ['tasks'] });
        return;
      }
      // Modo `queue`: o pedido foi só registrado. Não existe task para acompanhar —
      // o trabalho acontece quando uma pessoa roda o PROCESSAR.bat.
      setActiveTaskId(null);
      setQueuedJob(res.job);
      qc.invalidateQueries({ queryKey: ['queue'] });
    },
  });

  const done = activeTask.data?.status === 'succeeded';
  const failed = activeTask.data?.status === 'failed';

  return (
    <div className="mx-auto max-w-[880px] px-8 py-14">
      <div className="ds-slide-up flex items-center gap-3">
        <span className="ds-label" style={{ color: 'var(--color-ion-4)' }}>
          entrada · 01
        </span>
        <span className="ds-hairline flex-1" aria-hidden />
      </div>
      <h1
        className="ds-slide-up ds-d1 ds-text-glow mt-4 text-[42px] font-medium leading-[1.05] tracking-tight"
        style={{ color: 'var(--color-fg)', fontFamily: 'var(--font-display)' }}
      >
        {saudacaoCompleta()} Qual site vamos capturar hoje?
      </h1>
      <p
        className="ds-slide-up ds-d2 mt-4 max-w-[62ch] text-[15px] leading-[1.6]"
        style={{ color: 'var(--color-fg-muted)' }}
      >
        {isQueueMode ? (
          <>
            Cole o endereço de um site ou envie um arquivo HTML: eu guardo o pedido na fila e não
            rodo nada agora. Quando quiser que eu comece, dê dois cliques em{' '}
            <strong style={{ color: 'var(--color-fg)' }}>PROCESSAR</strong>, na pasta do aplicativo,
            e escolha o que rodar.
          </>
        ) : (
          <>
            Cole o endereço de um site ou envie um arquivo HTML. Eu abro a página, capturo o visual
            inteiro e levo as seções aproveitáveis para a Galeria.
          </>
        )}
      </p>

      {/* No modo fila ninguém chama a API a partir do app, então a chave não é
          pré-requisito para registrar o pedido. */}
      {!isQueueMode && !health.data?.anthropicConfigured && (
        <div
          className="ds-glow-border ds-backdrop ds-slide-up ds-d3 mt-8 rounded-lg p-4 text-[13px]"
          style={{
            backgroundColor: 'rgba(245,158,11,0.14)',
            color: 'var(--color-fg)',
          }}
        >
          Não consigo extrair sozinho neste computador: a extração automática não está ativa. Peça
          para quem fez a instalação ativar, seus pedidos ficam guardados até lá.
        </div>
      )}

      {/* Toggle URL / File — vira um seletor segmentado dentro de uma moldura
          única, em vez de dois botões soltos: assim lê como chave de dois
          estados, que é o que é, e não como duas ações diferentes. */}
      <div
        className="ds-slide-up ds-d3 mt-10 inline-flex gap-1 rounded-full border p-1"
        style={{ borderColor: 'var(--color-border)' }}
      >
        <ModeButton active={mode === 'url'} onClick={() => setMode('url')} icon={LinkIcon}>
          URL
        </ModeButton>
        <ModeButton active={mode === 'file'} onClick={() => setMode('file')} icon={FileText}>
          Arquivo HTML
        </ModeButton>
      </div>

      <div className="ds-glass-static ds-glow-border ds-slide-up ds-d4 mt-4 rounded-xl p-6">
        {mode === 'url' ? (
          <div className="space-y-4">
            <TextInput
              label="URL"
              placeholder="https://exemplo.com"
              value={url}
              onChange={setUrl}
            />
            <TextInput
              label="Nome (opcional)"
              placeholder="Ex: Landing Vercel"
              value={urlName}
              onChange={setUrlName}
            />
          </div>
        ) : (
          <FileDropzone onFile={setHtmlFile} current={htmlFile} />
        )}

        <button
          type="button"
          onClick={() => start.mutate()}
          disabled={
            start.isPending ||
            (mode === 'url' && !url) ||
            (mode === 'file' && !htmlFile) ||
            activeTask.data?.status === 'running'
          }
          className="ds-btn ds-glow mt-6 flex items-center gap-2 rounded-full px-5 py-2.5 text-[13px] font-medium disabled:cursor-not-allowed disabled:opacity-40"
          style={{
            backgroundColor: 'var(--color-primary)',
            color: 'var(--color-bone-1)',
            fontFamily: 'var(--font-body)',
          }}
        >
          {start.isPending || activeTask.data?.status === 'running' ? (
            <Mascote tamanho={14} girando />
          ) : (
            <UploadCloud size={14} />
          )}
          {isQueueMode ? 'Adicionar à fila' : 'Iniciar extração'}
        </button>

        {start.error && (
          <div className="mt-3 text-[12px]" style={{ color: 'var(--color-ion-3)' }}>
            {start.error.message}
          </div>
        )}
      </div>

      {queuedJob && (
        <div className="ds-glass-static ds-scale-in mt-8 rounded-xl p-6">
          <div
            className="text-[10px] uppercase tracking-[0.24em]"
            style={{ color: 'var(--color-signal)', fontFamily: 'var(--font-display)' }}
          >
            Guardei na fila
          </div>
          <div className="mt-2 text-[15px]" style={{ color: 'var(--color-fg)' }}>
            {queuedJob.label}
          </div>
          <div
            className="mt-4 flex items-start gap-2 border-t pt-4 text-[13px] leading-relaxed"
            style={{ borderColor: 'var(--color-border)', color: 'var(--color-fg-muted)' }}
          >
            <MousePointerClick size={14} className="mt-0.5 shrink-0" />
            <span>
              Ainda não rodei nada. Para eu começar, dê dois cliques em{' '}
              <strong style={{ color: 'var(--color-fg)' }}>PROCESSAR</strong>, na pasta do
              aplicativo: ele mostra a fila e você escolhe o que rodar.
            </span>
          </div>
        </div>
      )}

      {isQueueMode && (
        <div className="mt-8">
          <QueuePanel />
        </div>
      )}

      {activeTask.data && (
        <TaskProgress
          task={activeTask.data}
          onOpenGallery={() => navigate('/gallery')}
          done={done}
          failed={failed}
        />
      )}
    </div>
  );
}

function ModeButton({
  active,
  onClick,
  icon: Icon,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon: typeof LinkIcon;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'flex items-center gap-2 rounded-full px-4 py-1.5 text-[11px] uppercase tracking-[0.14em] transition-colors',
        active
          ? 'text-[var(--color-ion-3)]'
          : 'text-[var(--color-fg-subtle)] hover:text-[var(--color-fg)]',
      )}
      style={{
        fontFamily: 'var(--font-mono)',
        backgroundColor: active ? 'rgba(56,189,248,0.12)' : 'transparent',
      }}
    >
      <Icon size={12} />
      {children}
    </button>
  );
}

function TextInput({
  label,
  placeholder,
  value,
  onChange,
}: {
  label: string;
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="block">
      <span
        className="mb-1.5 block text-[10px] uppercase tracking-[0.24em]"
        style={{ color: 'var(--color-fg-subtle)', fontFamily: 'var(--font-display)' }}
      >
        {label}
      </span>
      <input
        type="text"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="ds-data w-full rounded-md border px-3.5 py-2.5 text-[13px] outline-none transition-all duration-300 focus:border-[var(--color-signal)] focus:shadow-[0_0_20px_rgba(56,189,248,0.25)]"
        style={{
          borderColor: 'var(--color-border)',
          backgroundColor: 'rgba(0, 0, 0, 0.35)',
          color: 'var(--color-fg)',
        }}
      />
    </label>
  );
}

function FileDropzone({
  onFile,
  current,
}: {
  onFile: (file: { name: string; content: string } | null) => void;
  current: { name: string; content: string } | null;
}) {
  const handleChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const content = await f.text();
    onFile({ name: f.name, content });
  };

  return (
    <label
      className="flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed py-12 text-center transition-all duration-300 hover:border-[var(--color-signal)] hover:bg-white/[0.02] hover:shadow-[0_0_30px_rgba(56,189,248,0.18)]"
      style={{ borderColor: 'var(--color-border-strong)' }}
    >
      <UploadCloud size={20} style={{ color: 'var(--color-fg-muted)' }} />
      <span
        className="mt-3 text-[13px]"
        style={{ color: 'var(--color-fg-muted)', fontFamily: 'var(--font-body)' }}
      >
        {current ? current.name : 'Clique para escolher um arquivo .html'}
      </span>
      {current && (
        <span className="mt-1 text-[11px]" style={{ color: 'var(--color-fg-subtle)' }}>
          {tamanhoLegivel(current.content.length)}
        </span>
      )}
      <input type="file" accept=".html,text/html" onChange={handleChange} className="hidden" />
    </label>
  );
}

/**
 * Hora do evento, curta. Timestamp que não vem como número vira `--:--:--` em
 * vez de `Invalid Date`: a coluna continua alinhada e ninguém precisa decifrar
 * um erro de formatação no meio de um log de extração.
 */
function horaCurta(ts: unknown): string {
  const d = new Date(typeof ts === 'number' || typeof ts === 'string' ? ts : Number.NaN);
  return Number.isNaN(d.getTime()) ? '--:--:--' : d.toLocaleTimeString('pt-BR', { hour12: false });
}

function TaskProgress({
  task,
  onOpenGallery,
  done,
  failed,
}: {
  task: TaskRecord;
  onOpenGallery: () => void;
  done: boolean;
  failed: boolean;
}) {
  const events = task.events ?? [];
  const running = task.status === 'running' || task.status === 'queued';

  return (
    <div className="ds-glass-static ds-scale-in mt-8 rounded-xl p-6">
      <div className="flex items-center justify-between">
        <div
          className="text-[13px] font-medium"
          style={{ color: 'var(--color-fg)', fontFamily: 'var(--font-display)' }}
        >
          {running ? TRABALHANDO.extraindo : done ? 'Terminei a extração.' : 'Extração'}
        </div>
        <StatusBadge status={task.status} />
      </div>

      {/* Enquanto roda, a varredura na barra diz que há trabalho acontecendo
          mesmo quando nenhum evento novo chega. */}
      {running && <div className="ds-progress mt-5 rounded-full" />}

      {failed && (
        <div className="mt-4 text-[13px] leading-relaxed" style={{ color: 'var(--color-danger)' }}>
          Não consegui concluir esta extração. Tente de novo: se falhar outra vez, o site pode estar
          bloqueando a minha captura.
          {task.errorMessage && (
            <span className="mt-1 block text-[12px]" style={{ color: 'var(--color-fg-subtle)' }}>
              Detalhe: {task.errorMessage}
            </span>
          )}
        </div>
      )}

      {done && (
        <button
          type="button"
          onClick={onOpenGallery}
          className="ds-btn ds-glow mt-5 rounded-full px-5 py-2.5 text-[13px] font-medium"
          style={{
            backgroundColor: 'var(--color-primary)',
            color: 'var(--color-bone-1)',
          }}
        >
          Abrir Galeria →
        </button>
      )}

      {events.length > 0 && (
        <>
          <div className="mt-6 flex items-center gap-3">
            <span className="ds-label">passo a passo</span>
            <span className="ds-hairline flex-1" aria-hidden />
            <span className="ds-data text-[10px]" style={{ color: 'var(--color-fg-subtle)' }}>
              {events.length}
            </span>
          </div>
          {/* Log de instrumento: carimbo de tempo à esquerda, mensagem à direita,
              nível pela cor. Ler uma corrida de extração é ler uma sequência de
              eventos no tempo — sem a hora, viram frases soltas. */}
          <div
            className="mt-2 max-h-[300px] overflow-y-auto rounded-md border"
            style={{ borderColor: 'var(--color-border)', backgroundColor: 'rgba(0,0,0,0.45)' }}
          >
            {events.map((ev, i) => (
              <div
                key={`${ev.timestamp}-${i}`}
                className="ds-data flex gap-3 px-3 py-1.5 text-[11px] leading-relaxed"
                style={{
                  borderTop: i === 0 ? undefined : '1px solid var(--color-border)',
                  color:
                    ev.level === 'error'
                      ? 'var(--color-danger)'
                      : ev.level === 'warn'
                        ? 'var(--color-warn)'
                        : 'var(--color-fg-muted)',
                }}
              >
                <span className="shrink-0" style={{ color: 'var(--color-fg-subtle)' }}>
                  {horaCurta(ev.timestamp)}
                </span>
                <span className="min-w-0 flex-1">{ev.message}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: TaskRecord['status'] }) {
  const visual: Record<TaskRecord['status'], { rotulo: string; cor: string }> = {
    queued: { rotulo: 'Na fila', cor: 'var(--color-fg-subtle)' },
    running: { rotulo: 'Trabalhando', cor: 'var(--color-signal)' },
    succeeded: { rotulo: 'Concluída', cor: 'var(--color-signal)' },
    failed: { rotulo: 'Não concluída', cor: 'var(--color-ion-3)' },
    cancelled: { rotulo: 'Cancelada', cor: 'var(--color-fg-subtle)' },
  };
  return (
    <span
      className="ds-tag ds-backdrop rounded-full border px-3 py-1 text-[11px] uppercase tracking-[0.16em]"
      style={{
        backgroundColor: 'rgba(255, 255, 255, 0.04)',
        borderColor: 'var(--color-border)',
        color: visual[status].cor,
        fontFamily: 'var(--font-display)',
      }}
    >
      {visual[status].rotulo}
    </span>
  );
}
