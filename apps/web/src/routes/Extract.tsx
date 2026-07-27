import { QueuePanel } from '@/components/QueuePanel';
import { type QueueJobRef, type TaskRecord, api } from '@/lib/api';
import { cn } from '@/lib/cn';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FileText, Link as LinkIcon, Loader2, MousePointerClick, UploadCloud } from 'lucide-react';
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
 * Tela de entrada do fluxo.
 *
 * Os painéis daqui são vidro estático, sem a inclinação 3D do `ds-card`: isto é
 * um formulário, e um campo que se move enquanto a pessoa mira o cursor nele
 * atrapalha. A inclinação fica para as telas de coleção, onde o card é o objeto
 * e não o continente.
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
      if (!htmlFile) throw new Error('Selecione um arquivo HTML');
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
    <div className="mx-auto max-w-[880px] px-8 py-16">
      <div
        className="ds-slide-up text-[11px] uppercase tracking-[0.32em]"
        style={{ color: 'var(--color-signal)', fontFamily: 'var(--font-display)' }}
      >
        Traga uma referência
      </div>
      <h1
        className="ds-slide-up ds-d1 ds-text-glow mt-3 text-[42px] font-medium leading-[1.05] tracking-tight"
        style={{ color: 'var(--color-fg)', fontFamily: 'var(--font-display)' }}
      >
        Trazer um site novo para o ecossistema.
      </h1>
      <p
        className="ds-slide-up ds-d2 mt-4 max-w-[62ch] text-[15px] leading-[1.6]"
        style={{ color: 'var(--color-fg-muted)' }}
      >
        {isQueueMode ? (
          <>
            Cole o endereço de um site ou envie um arquivo HTML. O pedido fica guardado na fila —
            nada roda agora. Quando quiser processar, dê dois cliques em{' '}
            <strong style={{ color: 'var(--color-fg)' }}>PROCESSAR</strong> na pasta do aplicativo e
            escolha o que rodar.
          </>
        ) : (
          <>
            Cole o endereço de um site ou envie um arquivo HTML. A extração abre a página, captura o
            visual por completo e traz as seções aproveitáveis para a Galeria.
          </>
        )}
      </p>

      {/* No modo fila ninguém chama a API a partir do app, então a chave não é
          pré-requisito para registrar o pedido. */}
      {!isQueueMode && !health.data?.anthropicConfigured && (
        <div
          className="ds-glow-border ds-backdrop ds-slide-up ds-d3 mt-8 rounded-lg p-4 text-[13px]"
          style={{
            backgroundColor: 'rgba(107, 20, 20, 0.16)',
            color: 'var(--color-fg)',
          }}
        >
          A extração automática não está ativa neste computador, então nada pode rodar por aqui
          agora. Peça a quem fez a instalação para ativá-la — seus pedidos não se perdem.
        </div>
      )}

      {/* Toggle URL / File */}
      <div className="ds-slide-up ds-d3 mt-12 flex gap-2">
        <ModeButton active={mode === 'url'} onClick={() => setMode('url')} icon={LinkIcon}>
          URL
        </ModeButton>
        <ModeButton active={mode === 'file'} onClick={() => setMode('file')} icon={FileText}>
          Arquivo HTML
        </ModeButton>
      </div>

      <div className="ds-glass-static ds-slide-up ds-d4 mt-4 rounded-xl p-6">
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
            <Loader2 size={14} className="animate-spin" />
          ) : (
            <UploadCloud size={14} />
          )}
          {isQueueMode ? 'Adicionar à fila' : 'Iniciar extração'}
        </button>

        {start.error && (
          <div className="mt-3 text-[12px]" style={{ color: 'var(--color-crimson-3)' }}>
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
            Registrado na fila
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
              Nada rodou ainda. Para processar, dê dois cliques em{' '}
              <strong style={{ color: 'var(--color-fg)' }}>PROCESSAR</strong> na pasta do aplicativo
              — ele mostra a fila e você escolhe o que rodar.
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
      className={cn(
        'ds-tag flex items-center gap-2 rounded-full border px-4 py-1.5 text-[12px] font-medium',
        active
          ? 'ds-glass-static text-[var(--color-fg)]'
          : 'border-transparent text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]',
      )}
      style={{ fontFamily: 'var(--font-body)' }}
    >
      <Icon size={13} />
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
        className="ds-data w-full rounded-md border px-3.5 py-2.5 text-[13px] outline-none transition-all duration-300 focus:border-[var(--color-signal)] focus:shadow-[0_0_20px_rgba(198,40,40,0.18)]"
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
      className="flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed py-12 text-center transition-all duration-300 hover:border-[var(--color-signal)] hover:bg-white/[0.02] hover:shadow-[0_0_30px_rgba(198,40,40,0.12)]"
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
          {running ? 'Extraindo a referência…' : done ? 'Extração concluída' : 'Extração'}
        </div>
        <StatusBadge status={task.status} />
      </div>

      {/* Enquanto roda, a varredura na barra diz que há trabalho acontecendo
          mesmo quando nenhum evento novo chega. */}
      {running && <div className="ds-progress mt-5 rounded-full" />}

      {failed && (
        <div
          className="mt-4 text-[13px] leading-relaxed"
          style={{ color: 'var(--color-crimson-3)' }}
        >
          Não deu para concluir esta extração. Você pode tentar de novo — se o problema repetir, o
          site pode estar bloqueando a captura.
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
        <div
          className="mt-6 text-[10px] uppercase tracking-[0.24em]"
          style={{ color: 'var(--color-fg-subtle)', fontFamily: 'var(--font-display)' }}
        >
          Passo a passo
        </div>
      )}
      <div className="mt-2 max-h-[300px] overflow-y-auto">
        {events.map((ev, i) => (
          <div
            key={`${ev.timestamp}-${i}`}
            className="ds-data border-t py-1.5 text-[11px]"
            style={{
              borderColor: 'var(--color-border)',
              color:
                ev.level === 'error'
                  ? 'var(--color-crimson-3)'
                  : ev.level === 'warn'
                    ? 'var(--color-fg-muted)'
                    : 'var(--color-fg)',
            }}
          >
            {ev.message}
          </div>
        ))}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: TaskRecord['status'] }) {
  const visual: Record<TaskRecord['status'], { rotulo: string; cor: string }> = {
    queued: { rotulo: 'Na fila', cor: 'var(--color-fg-subtle)' },
    running: { rotulo: 'Trabalhando', cor: 'var(--color-signal)' },
    succeeded: { rotulo: 'Concluída', cor: 'var(--color-signal)' },
    failed: { rotulo: 'Não concluída', cor: 'var(--color-crimson-3)' },
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
