import { Select } from '@/components/seletores';
import { type Blueprint, type MediaItem, api } from '@/lib/api';
import { toast } from '@/lib/toast';
import { useMutation } from '@tanstack/react-query';
import { Image as ImageIcon, Loader2, Trash2, Upload } from 'lucide-react';
import { useState } from 'react';
import { Campo, mediaUrl } from '../partes';

export function StepMidia({
  projectId,
  slots,
  media,
  onMedia,
}: {
  projectId: string | null;
  slots: Blueprint['slots'];
  media: MediaItem[];
  onMedia: (m: MediaItem[]) => void;
}) {
  // No modo criativo não há slots de blueprint — cai numa lista genérica de
  // seções para a mídia ainda ter onde ser ancorada.
  const secoes =
    slots.length > 0
      ? slots.map((s) => ({ role: s.role, label: s.label }))
      : [
          { role: 'hero', label: 'Destaque' },
          { role: 'showcase', label: 'Demonstração' },
          { role: 'gallery', label: 'Galeria' },
          { role: 'about', label: 'Sobre' },
        ];
  const [slotRole, setSlotRole] = useState<string>(secoes[0]?.role ?? 'hero');
  const [kind, setKind] = useState<MediaItem['kind']>('image');

  const upload = useMutation({
    mutationFn: (file: File) => {
      if (!projectId) throw new Error('rascunho ainda não criado');
      return api.uploadMedia(projectId, file, { kind, slotRole });
    },
    onSuccess: (res) => {
      onMedia(res.media);
      toast.ok('Mídia enviada.');
    },
    onError: (e) => toast.erro(e instanceof Error ? e.message : 'Falha no upload.'),
  });

  const remover = useMutation({
    mutationFn: (path: string) => {
      if (!projectId) throw new Error('sem projeto');
      return api.deleteMedia(projectId, path);
    },
    onSuccess: (res) => onMedia(res.media),
    onError: (e) => toast.erro(e instanceof Error ? e.message : 'Falha ao remover.'),
  });

  // Logo aparece na etapa de marca; aqui listamos só as mídias de conteúdo.
  const conteudo = media.filter((m) => m.kind !== 'logo');

  return (
    <div className="space-y-5">
      <div className="ds-glass-static flex flex-wrap items-end gap-3 rounded-lg p-4">
        <Campo label="Seção">
          <Select
            className="min-w-44"
            rotulo="Seção da mídia"
            opcoes={secoes.map((s) => ({ valor: s.role, rotulo: s.label }))}
            valor={slotRole}
            aoMudar={setSlotRole}
          />
        </Campo>
        <Campo label="Tipo">
          <Select
            className="min-w-36"
            rotulo="Tipo da mídia"
            opcoes={[
              { valor: 'image', rotulo: 'Imagem' },
              { valor: 'video', rotulo: 'Vídeo' },
              { valor: 'mockup', rotulo: 'Mockup' },
            ]}
            valor={kind}
            aoMudar={(v) => setKind(v as MediaItem['kind'])}
          />
        </Campo>
        <label
          className="ds-btn flex cursor-pointer items-center gap-2 rounded-full px-4 py-2 text-[12px] font-medium"
          style={{ backgroundColor: 'var(--color-primary)', color: 'var(--color-bone-1)' }}
        >
          {upload.isPending ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}
          Enviar
          <input
            type="file"
            accept="image/*,video/*"
            className="hidden"
            disabled={!projectId || upload.isPending}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) upload.mutate(f);
            }}
          />
        </label>
      </div>

      {conteudo.length === 0 ? (
        <div className="py-8 text-center text-[12px]" style={{ color: 'var(--color-fg-subtle)' }}>
          Nenhuma mídia ainda. A mídia é opcional — os slots sem imagem são criados no estilo do
          kit.
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {conteudo.map((m) => (
            <div key={m.path} className="ds-glass-static overflow-hidden rounded-lg">
              <div
                className="flex aspect-[16/10] items-center justify-center overflow-hidden"
                style={{ backgroundColor: 'var(--color-obsidian-2)' }}
              >
                {m.kind === 'video' ? (
                  <video
                    src={projectId ? mediaUrl(projectId, m.path) : undefined}
                    className="h-full w-full object-cover"
                    muted
                  />
                ) : projectId ? (
                  <img
                    src={mediaUrl(projectId, m.path)}
                    alt={m.alt ?? m.originalName}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <ImageIcon size={18} style={{ color: 'var(--color-fg-subtle)' }} />
                )}
              </div>
              <div className="flex items-center justify-between gap-2 p-2">
                <div className="min-w-0">
                  <div className="truncate text-[11px]" style={{ color: 'var(--color-fg)' }}>
                    {m.originalName}
                  </div>
                  <div className="ds-data text-[9px]" style={{ color: 'var(--color-fg-subtle)' }}>
                    {m.slotRole ?? '—'} · {m.kind}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => remover.mutate(m.path)}
                  className="shrink-0 rounded-full p-1 hover:bg-[rgba(198,40,40,0.16)]"
                  title="Remover"
                >
                  <Trash2 size={12} style={{ color: 'var(--color-crimson-3)' }} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
