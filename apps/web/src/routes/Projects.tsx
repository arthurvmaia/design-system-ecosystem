import { type LayoutChoice, LayoutPicker } from '@/components/LayoutPicker';
import { QueuePanel } from '@/components/QueuePanel';
import { type TaskRecord, api } from '@/lib/api';
import { cn } from '@/lib/cn';
import { useReveal } from '@/lib/use-reveal';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ExternalLink, Loader2, Rocket, Trash2 } from 'lucide-react';
import { useState } from 'react';

/** O servidor responde com `task` no modo api e com `job` no modo fila. */
type CreateProjectResponse =
  | { task: { id: string } }
  | { queued: true; job: { id: string; label: string }; projectId: string };

type ProjectRow = {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  contentJson: string | null;
  brandingJson: string | null;
  status: string;
};

/**
 * Card de um projeto já criado.
 *
 * A lixeira só aparece sob o cursor: apagar leva junto os sites gerados e é
 * definitivo, então não convém ficar oferecendo o botão o tempo todo ao lado
 * de quem só queria conferir a data.
 */
function ProjectCard({ project }: { project: ProjectRow }) {
  const qc = useQueryClient();
  const [confirmando, setConfirmando] = useState(false);

  const excluir = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/projects/${project.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(await res.text());
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['projects'] });
      qc.invalidateQueries({ queryKey: ['meus-projetos'] });
      qc.invalidateQueries({ queryKey: ['meus-projetos-contagem'] });
    },
  });

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
          <div className="flex shrink-0 items-center gap-2">
            <StatusBadge status={project.status} />
            <button
              type="button"
              onClick={() => setConfirmando(true)}
              disabled={excluir.isPending}
              title="Excluir projeto"
              className="opacity-0 transition-opacity duration-200 group-hover:opacity-50 hover:!opacity-100 disabled:cursor-not-allowed"
              style={{ color: 'var(--color-crimson-3)' }}
            >
              {excluir.isPending ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Trash2 size={14} />
              )}
            </button>
          </div>
        </div>

        <div className="ds-data mt-2 text-[10px]" style={{ color: 'var(--color-fg-subtle)' }}>
          {project.id} · {new Date(project.updatedAt).toLocaleString('pt-BR')}
        </div>

        {confirmando && (
          <div
            className="ds-scale-in mt-3 rounded-lg border p-3"
            style={{
              borderColor: 'var(--color-border)',
              backgroundColor: 'rgba(107, 20, 20, 0.16)',
            }}
          >
            <div className="text-[12px]" style={{ color: 'var(--color-fg)' }}>
              Apagar <strong>{project.name}</strong> e os sites já gerados dele? Não dá para
              desfazer.
            </div>
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={() => excluir.mutate()}
                className="ds-btn rounded-full px-3.5 py-1.5 text-[12px] font-medium"
                style={{ backgroundColor: 'var(--color-primary)', color: 'var(--color-bone-1)' }}
              >
                Apagar
              </button>
              <button
                type="button"
                onClick={() => setConfirmando(false)}
                className="ds-btn rounded-full px-3.5 py-1.5 text-[12px]"
                style={{ color: 'var(--color-fg-muted)' }}
              >
                Cancelar
              </button>
            </div>
          </div>
        )}

        {excluir.error && (
          <div className="mt-2 text-[11px]" style={{ color: 'var(--color-crimson-3)' }}>
            {excluir.error.message}
          </div>
        )}
      </div>
    </div>
  );
}

export function ProjectsPage() {
  const projects = useQuery({ queryKey: ['projects'], queryFn: api.listProjects });
  const lib = useQuery({ queryKey: ['library'], queryFn: api.listLibrary });
  const [showWizard, setShowWizard] = useState(false);
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);

  const activeTask = useQuery({
    queryKey: ['task', activeTaskId],
    queryFn: () => (activeTaskId ? api.getTask(activeTaskId).then((r) => r.task) : null),
    refetchInterval: (query) => {
      const t = query.state.data as TaskRecord | null | undefined;
      if (!t) return false;
      if (t.status === 'running' || t.status === 'queued') return 2000;
      return false;
    },
    enabled: activeTaskId !== null,
  });

  const items = (projects.data?.items ?? []) as ProjectRow[];
  const libCount = lib.data?.items.length ?? 0;
  useReveal([items.length]);

  return (
    <div className="mx-auto max-w-[1080px] px-8 py-12">
      <div className="flex items-end justify-between">
        <div>
          <div
            className="ds-slide-up text-[10px] uppercase tracking-[0.28em]"
            style={{ color: 'var(--color-primary)', fontFamily: 'var(--font-display)' }}
          >
            Fase 7 · Projetos
          </div>
          <h1
            className="ds-slide-up ds-d1 ds-text-glow mt-2 text-[36px] font-medium tracking-tight"
            style={{ color: 'var(--color-fg)', fontFamily: 'var(--font-display)' }}
          >
            Sites gerados a partir da biblioteca.
          </h1>
        </div>
        {/* A entrada fica no invólucro: `ds-scale-in` usa fill-mode both e segue
            aplicando o transform final, o que anulava o levantar do `ds-btn`. */}
        <div className="ds-scale-in ds-d2">
          <button
            type="button"
            onClick={() => setShowWizard(true)}
            disabled={libCount === 0}
            className="ds-btn ds-gradient-crimson ds-glow flex items-center gap-2 rounded-full px-5 py-2.5 text-[13px] font-medium disabled:cursor-not-allowed disabled:opacity-40"
            style={{ color: 'var(--color-bone-1)' }}
          >
            <Rocket size={13} />
            Novo projeto
          </button>
        </div>
      </div>

      <div className="mt-6">
        <QueuePanel />
      </div>

      {libCount === 0 && (
        <div
          className="ds-glass-static mt-8 rounded-lg p-4 text-[13px]"
          style={{ color: 'var(--color-fg-muted)' }}
        >
          Sua biblioteca está vazia. Adicione componentes na Galeria antes de gerar sites.
        </div>
      )}

      {showWizard && (
        <WizardCard
          onCancel={() => setShowWizard(false)}
          onStart={(taskId) => {
            setShowWizard(false);
            setActiveTaskId(taskId);
          }}
        />
      )}

      {activeTask.data && <TaskCard task={activeTask.data} />}

      <div className="mt-10">
        <div
          className="text-[10px] uppercase tracking-[0.28em]"
          style={{ color: 'var(--color-fg-subtle)', fontFamily: 'var(--font-display)' }}
        >
          Anteriores
        </div>
        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
          {items.map((p) => (
            <ProjectCard key={p.id} project={p} />
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
    </div>
  );
}

function WizardCard({
  onCancel,
  onStart,
}: {
  onCancel: () => void;
  onStart: (taskId: string) => void;
}) {
  const [name, setName] = useState('');
  const [about, setAbout] = useState('');
  const [slogan, setSlogan] = useState('');
  const [cta, setCta] = useState('');
  const [primary, setPrimary] = useState('#7f1d1d');
  const [bg, setBg] = useState('#ffffff');
  const [fg, setFg] = useState('#0a0a0a');
  const [fontDisplay, setFontDisplay] = useState('Inter, sans-serif');
  const [fontBody, setFontBody] = useState('Inter, sans-serif');
  const [layout, setLayout] = useState<LayoutChoice>({
    mode: 'blueprint',
    blueprintId: 'saas-landing',
    disabledRoles: [],
  });

  const qc = useQueryClient();
  const create = useMutation({
    // Um único POST. A versão anterior chamava api.createProject() e em seguida
    // fazia o fetch abaixo, criando dois projetos a cada clique em "Gerar site".
    mutationFn: async () => {
      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          content: { about, slogan, cta },
          branding: {
            palette: { primary, background: bg, foreground: fg },
            typography: { display: fontDisplay, body: fontBody },
          },
          layout,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json() as Promise<CreateProjectResponse>;
    },
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['projects'] });
      qc.invalidateQueries({ queryKey: ['queue'] });
      // No modo fila não existe task para acompanhar: o pedido foi registrado
      // e será processado depois.
      if ('task' in res) onStart(res.task.id);
      else onCancel();
    },
  });

  return (
    <div className="ds-glass-static ds-scale-in mt-8 rounded-xl p-6">
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <Section title="Projeto">
          <Input label="Nome" value={name} onChange={setName} />
        </Section>
        <Section title="Conteúdo">
          <Input label="Sobre" value={about} onChange={setAbout} />
          <Input label="Slogan" value={slogan} onChange={setSlogan} />
          <Input label="CTA" value={cta} onChange={setCta} />
        </Section>
        <Section title="Cores">
          <ColorInput label="Primária" value={primary} onChange={setPrimary} />
          <ColorInput label="Fundo" value={bg} onChange={setBg} />
          <ColorInput label="Texto" value={fg} onChange={setFg} />
        </Section>
        <Section title="Tipografia">
          <Input label="Display" value={fontDisplay} onChange={setFontDisplay} />
          <Input label="Body" value={fontBody} onChange={setFontBody} />
        </Section>
      </div>

      <div className="mt-6 border-t pt-6" style={{ borderColor: 'var(--color-border)' }}>
        <div
          className="mb-3 text-[10px] uppercase tracking-[0.28em]"
          style={{ color: 'var(--color-fg-subtle)', fontFamily: 'var(--font-display)' }}
        >
          Como montar o site
        </div>
        <LayoutPicker value={layout} onChange={setLayout} />
      </div>
      <div className="mt-6 flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 text-[12px]"
          style={{ color: 'var(--color-fg-muted)' }}
        >
          Cancelar
        </button>
        <button
          type="button"
          onClick={() => create.mutate()}
          disabled={!name || create.isPending}
          className="ds-btn ds-glow flex items-center gap-2 rounded-full px-5 py-2.5 text-[13px] font-medium disabled:opacity-40"
          style={{ backgroundColor: 'var(--color-primary)', color: 'var(--color-bone-1)' }}
        >
          {create.isPending ? <Loader2 size={12} className="animate-spin" /> : <Rocket size={12} />}
          Gerar site
        </button>
      </div>
      {create.error && (
        <div className="mt-3 text-[11px]" style={{ color: 'var(--color-crimson-3)' }}>
          {create.error.message}
        </div>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div
        className="text-[10px] uppercase tracking-[0.28em]"
        style={{ color: 'var(--color-fg-subtle)', fontFamily: 'var(--font-display)' }}
      >
        {title}
      </div>
      <div className="mt-3 space-y-2">{children}</div>
    </div>
  );
}

function Input({
  label,
  value,
  onChange,
}: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="block">
      <span
        className="mb-1 block text-[10px]"
        style={{ color: 'var(--color-fg-subtle)', fontFamily: 'var(--font-mono)' }}
      >
        {label}
      </span>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-md border px-3 py-2 text-[12px] outline-none transition-all duration-300 focus:border-[var(--color-signal)] focus:shadow-[0_0_20px_rgba(198,40,40,0.18)]"
        style={{
          borderColor: 'var(--color-border)',
          backgroundColor: 'rgba(0, 0, 0, 0.35)',
          color: 'var(--color-fg)',
          fontFamily: 'var(--font-body)',
        }}
      />
    </label>
  );
}

function ColorInput({
  label,
  value,
  onChange,
}: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="flex items-center gap-3">
      <input
        type="color"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-8 w-10 cursor-pointer rounded"
      />
      <div className="flex-1">
        <div
          className="text-[10px]"
          style={{ color: 'var(--color-fg-subtle)', fontFamily: 'var(--font-mono)' }}
        >
          {label}
        </div>
        <div
          className="text-[12px]"
          style={{ color: 'var(--color-fg)', fontFamily: 'var(--font-mono)' }}
        >
          {value}
        </div>
      </div>
    </label>
  );
}

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
        <div className="ds-progress mt-5 rounded-full" />
      )}

      <div className="mt-4 max-h-[220px] overflow-y-auto">
        {(task.events ?? []).map((ev, i) => (
          <div
            key={`${ev.timestamp}-${i}`}
            className="ds-data border-t py-1 text-[11px]"
            style={{
              borderColor: 'var(--color-border)',
              color: ev.level === 'error' ? 'var(--color-crimson-3)' : 'var(--color-fg)',
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
    running: 'var(--color-signal)',
    queued: 'var(--color-signal)',
    succeeded: 'var(--color-primary)',
    generated: 'var(--color-primary)',
    failed: 'var(--color-crimson-3)',
  };
  return (
    <span
      className={cn(
        'ds-tag ds-backdrop rounded-full border px-3 py-1 text-[10px] uppercase tracking-[0.18em]',
      )}
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

// Silence unused
void ExternalLink;
