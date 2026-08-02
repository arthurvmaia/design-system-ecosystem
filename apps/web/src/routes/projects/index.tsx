import { ConfirmPop } from '@/components/ConfirmPop';
import { Mascote } from '@/components/Mascote';
import { QueuePanel } from '@/components/QueuePanel';
import { type ProjectRecord, type StartWorkResponse, type TaskRecord, api } from '@/lib/api';
import { toast } from '@/lib/toast';
import { useReveal } from '@/lib/use-reveal';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Copy, Pencil, Trash2, Wand2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ProjectWizard } from './Wizard';

export function ProjectsPage() {
  const projects = useQuery({ queryKey: ['projects'], queryFn: api.listProjects });
  const kits = useQuery({ queryKey: ['kits'], queryFn: api.listKits });
  const [wizard, setWizard] = useState<ProjectRecord | 'novo' | null>(null);
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();

  // "Editar" vindo de Meus sites chega como ?edit=<id> — abre o wizard com o
  // projeto carregado assim que a lista responde, e limpa o parâmetro da URL.
  const editId = searchParams.get('edit');
  useEffect(() => {
    if (!editId || wizard !== null) return;
    const alvo = projects.data?.items.find((p) => p.id === editId);
    if (alvo) {
      setWizard(alvo);
      setSearchParams({}, { replace: true });
    }
  }, [editId, projects.data, wizard, setSearchParams]);

  const activeTask = useQuery({
    queryKey: ['task', activeTaskId],
    queryFn: () => (activeTaskId ? api.getTask(activeTaskId).then((r) => r.task) : null),
    refetchInterval: (query) => {
      const t = query.state.data as TaskRecord | null | undefined;
      if (t && (t.status === 'running' || t.status === 'queued')) return 2000;
      return false;
    },
    enabled: activeTaskId !== null,
  });

  const items = projects.data?.items ?? [];
  const kitCount = kits.data?.items.length ?? 0;
  useReveal([items.length]);

  const onWork = (res: StartWorkResponse) => {
    setWizard(null);
    if ('task' in res) setActiveTaskId(res.task.id);
    else toast.ok('Geração adicionada à fila. Rode o PROCESSAR.bat para produzir o site.');
  };

  return (
    <div className="mx-auto max-w-[1080px] px-4 sm:px-8 py-8 sm:py-12">
      <div className="flex items-end justify-between">
        <div>
          <div
            className="ds-slide-up text-[10px] uppercase tracking-[0.28em]"
            style={{ color: 'var(--color-primary)', fontFamily: 'var(--font-display)' }}
          >
            Gerar site
          </div>
          <h1
            className="ds-slide-up ds-d1 ds-text-glow mt-2 text-[24px] sm:text-[36px] font-medium tracking-tight"
            style={{ color: 'var(--color-fg)', fontFamily: 'var(--font-display)' }}
          >
            Um site novo com a sua marca.
          </h1>
          <p
            className="ds-slide-up ds-d2 mt-3 max-w-[62ch] text-[14px] leading-[1.6]"
            style={{ color: 'var(--color-fg-muted)' }}
          >
            Escolha um kit como base visual e traga a sua identidade e o seu conteúdo. O site nunca
            copia texto ou marca do site de origem. Do kit vem só o jeito visual.
          </p>
        </div>
        <div className="ds-scale-in ds-d2">
          <button
            type="button"
            onClick={() => setWizard('novo')}
            disabled={kitCount === 0}
            className="ds-btn ds-gradient-ion ds-glow flex items-center gap-2 rounded-none px-5 py-2.5 text-[13px] font-medium disabled:cursor-not-allowed disabled:opacity-40"
            style={{ color: 'var(--color-bone-1)' }}
          >
            <Mascote tamanho={15} />
            Novo projeto
          </button>
        </div>
      </div>

      <div className="mt-6">
        <QueuePanel />
      </div>

      {kitCount === 0 && (
        <div
          className="ds-glass-static mt-8 rounded-lg p-4 text-[13px]"
          style={{ color: 'var(--color-fg-muted)' }}
        >
          Você ainda não tem nenhum kit. Monte um em <span className="ds-data">Kits</span> antes de
          gerar um site.
        </div>
      )}

      {activeTask.data && <TaskCard task={activeTask.data} />}

      <div className="mt-10">
        <div
          className="text-[10px] uppercase tracking-[0.28em]"
          style={{ color: 'var(--color-fg-subtle)', fontFamily: 'var(--font-display)' }}
        >
          Projetos
        </div>
        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
          {items.map((p) => (
            <ProjectCard key={p.id} project={p} onEdit={() => setWizard(p)} onGenerated={onWork} />
          ))}
          {items.length === 0 && (
            <div
              className="col-span-full py-8 text-center text-[13px]"
              style={{ color: 'var(--color-fg-subtle)' }}
            >
              nenhum projeto ainda.
            </div>
          )}
        </div>
      </div>

      {wizard !== null && (
        <ProjectWizard
          existing={wizard === 'novo' ? null : wizard}
          onClose={() => setWizard(null)}
          onGenerated={onWork}
        />
      )}
    </div>
  );
}

function ProjectCard({
  project,
  onEdit,
  onGenerated,
}: {
  project: ProjectRecord;
  onEdit: () => void;
  onGenerated: (res: StartWorkResponse) => void;
}) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [confirmDel, setConfirmDel] = useState(false);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['projects'] });
    qc.invalidateQueries({ queryKey: ['meus-projetos'] });
    qc.invalidateQueries({ queryKey: ['meus-projetos-contagem'] });
  };

  const gerar = useMutation({
    mutationFn: () => api.generateProject(project.id),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['queue'] });
      onGenerated(res);
    },
    onError: (e) => toast.erro(e instanceof Error ? e.message : 'Falha ao gerar.'),
  });

  const duplicar = useMutation({
    mutationFn: () => api.duplicateProject(project.id),
    onSuccess: () => {
      invalidate();
      toast.ok('Projeto duplicado como rascunho.');
    },
    onError: (e) => toast.erro(e instanceof Error ? e.message : 'Falha ao duplicar.'),
  });

  const excluir = useMutation({
    mutationFn: () => api.deleteProject(project.id),
    onSuccess: () => {
      invalidate();
      toast.ok('Projeto excluído.');
      setConfirmDel(false);
    },
    onError: (e) => toast.erro(e instanceof Error ? e.message : 'Falha ao excluir.'),
  });

  // Mesma queryKey do painel de fila lá em cima: uma consulta só, cache
  // compartilhado. Serve para uma pergunta específica — este projeto tem
  // trabalho esperando para acontecer?
  const fila = useQuery({
    queryKey: ['queue'],
    queryFn: async () => {
      const res = await fetch('/api/queue');
      if (!res.ok) throw new Error('falha ao ler a fila');
      return (await res.json()) as {
        pending: { id: string; label: string; payload?: { projectId?: string } }[];
      };
    },
  });
  // Quem gera o site é um processo de fora, que lê o pedido do disco. Apagar o
  // projeto no meio não interrompe ele: o site fica pronto numa pasta que já não
  // pertence a ninguém. O servidor recusa esse caminho; aqui o botão só deixa de
  // convidar para ele.
  const jobNaFila = fila.data?.pending.find((j) => j.payload?.projectId === project.id) ?? null;

  const gerado = project.status === 'generated';

  return (
    <div className="ds-card ds-glass-static group rounded-xl p-4">
      <div className="ds-card-content">
        <div className="flex items-center justify-between gap-3">
          <div
            className="min-w-0 truncate text-[15px] font-medium"
            style={{ color: 'var(--color-fg)', fontFamily: 'var(--font-display)' }}
          >
            {project.name}
          </div>
          <StatusBadge status={project.status} />
        </div>

        <div className="ds-data mt-2 text-[10px]" style={{ color: 'var(--color-fg-subtle)' }}>
          {project.id} · {new Date(project.updatedAt).toLocaleString('pt-BR')}
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onEdit}
            className="ds-btn ds-glow-border ds-backdrop flex items-center gap-1.5 rounded-none px-3.5 py-1.5 text-[12px]"
            style={{ backgroundColor: 'rgba(255,255,255,0.04)', color: 'var(--color-fg)' }}
          >
            <Pencil size={12} />
            Editar
          </button>
          <button
            type="button"
            onClick={() => gerar.mutate()}
            disabled={gerar.isPending}
            className="ds-btn ds-glow flex items-center gap-1.5 rounded-none px-3.5 py-1.5 text-[12px] font-medium disabled:opacity-50"
            style={{ backgroundColor: 'var(--color-primary)', color: 'var(--color-bone-1)' }}
          >
            {gerar.isPending ? <Mascote tamanho={12} girando /> : <Wand2 size={12} />}
            {gerado ? 'Gerar de novo' : 'Gerar site'}
          </button>
          {gerado && (
            <button
              type="button"
              onClick={() => navigate('/meus-projetos')}
              className="flex items-center gap-1.5 rounded-none px-2 py-1.5 text-[12px] transition-colors hover:text-[var(--color-fg)]"
              style={{ color: 'var(--color-fg-muted)' }}
            >
              Ver site
            </button>
          )}
          <div className="ml-auto flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
            <button
              type="button"
              onClick={() => duplicar.mutate()}
              disabled={duplicar.isPending}
              title="Duplicar"
              className="rounded-none p-1.5 transition-all hover:scale-110 hover:bg-white/[0.06]"
              style={{ color: 'var(--color-fg-muted)' }}
            >
              {duplicar.isPending ? <Mascote tamanho={13} girando /> : <Copy size={13} />}
            </button>
            <button
              type="button"
              onClick={() => setConfirmDel(true)}
              disabled={jobNaFila !== null}
              title={
                jobNaFila === null
                  ? 'Excluir'
                  : 'Tem um pedido na fila para este projeto. Cancele ele antes de apagar.'
              }
              className="rounded-none p-1.5 transition-all hover:scale-110 hover:bg-[rgba(239,68,68,0.16)] disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:scale-100 disabled:hover:bg-transparent"
              style={{ color: 'var(--color-ion-3)' }}
            >
              <Trash2 size={13} />
            </button>
          </div>
        </div>
      </div>

      <ConfirmPop
        open={confirmDel}
        title={`Apagar "${project.name}"?`}
        busy={excluir.isPending}
        confirmLabel="Apagar projeto"
        onConfirm={() => excluir.mutate()}
        onClose={() => setConfirmDel(false)}
        description="Leva junto os sites já gerados dele. Não dá para desfazer."
      />
    </div>
  );
}

// ── UI helpers ───────────────────────────────────────────────────────────────

function TaskCard({ task }: { task: TaskRecord }) {
  return (
    <div className="ds-glass-static ds-scale-in mt-8 rounded-xl p-6">
      <div className="flex items-center justify-between">
        <div>
          <div
            className="text-[10px] uppercase tracking-[0.24em]"
            style={{ color: 'var(--color-fg-subtle)', fontFamily: 'var(--font-display)' }}
          >
            Gerando
          </div>
          <div className="ds-data mt-1 text-[13px]" style={{ color: 'var(--color-fg)' }}>
            {task.id}
          </div>
        </div>
        <StatusBadge status={task.status} />
      </div>
      {(task.status === 'running' || task.status === 'queued') && (
        <div className="ds-progress mt-5 rounded-none" />
      )}
      <div className="mt-4 max-h-[220px] overflow-y-auto">
        {(task.events ?? []).map((ev, i) => (
          <div
            key={`${ev.timestamp}-${i}`}
            className="ds-data border-t py-1 text-[11px]"
            style={{
              borderColor: 'var(--color-border)',
              color: ev.level === 'error' ? 'var(--color-ion-3)' : 'var(--color-fg)',
            }}
          >
            {ev.message}
          </div>
        ))}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    draft: 'var(--color-fg-subtle)',
    'ready-to-generate': 'var(--color-signal)',
    running: 'var(--color-signal)',
    queued: 'var(--color-signal)',
    generating: 'var(--color-signal)',
    succeeded: 'var(--color-primary)',
    generated: 'var(--color-primary)',
    failed: 'var(--color-ion-3)',
  };
  return (
    <span
      className="ds-tag ds-backdrop rounded-none border px-3 py-1 text-[10px] uppercase tracking-[0.18em]"
      style={{
        backgroundColor: 'rgba(255, 255, 255, 0.04)',
        borderColor: 'var(--color-border)',
        color: map[status] ?? 'var(--color-fg)',
        fontFamily: 'var(--font-display)',
      }}
    >
      {status}
    </span>
  );
}
