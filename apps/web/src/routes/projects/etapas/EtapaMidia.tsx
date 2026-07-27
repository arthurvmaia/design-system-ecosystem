import type { LayoutChoice } from '@/components/LayoutPicker';
import { type Blueprint, type KitComponentRef, type MediaItem, api } from '@/lib/api';
import { toast } from '@/lib/toast';
import { type SectionRole, resolverPlacements } from '@ds/shared/schemas';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Image as ImageIcon, Loader2, Trash2, Upload } from 'lucide-react';
import { mediaUrl, rotulo } from '../partes';

/** A finalidade humana da mídia em cada papel — a tela fala de propósito. */
const FINALIDADE: Record<string, string> = {
  hero: 'Imagem principal',
  showcase: 'Demonstração',
  gallery: 'Galeria',
  catalog: 'Fotos de produto',
  testimonial: 'Foto de quem depõe',
  about: 'Foto de contexto',
  team: 'Fotos da equipe',
  features: 'Ilustrações de apoio',
};

/** Papéis que se BENEFICIAM de mídia mesmo sem espaço declarado no contrato. */
const PAPEIS_VISUAIS = new Set(Object.keys(FINALIDADE));

/**
 * Mídia por SEÇÃO REAL — e SÓ para quem aceita: a lista nasce da estrutura
 * final, das peças escolhidas e das capacidades de cada uma. Seção cujo
 * componente não tem espaço de mídia nem se beneficia dela NÃO pede upload
 * (aparece só se já tiver arquivo, com o aviso). A mídia é ancorada na SEÇÃO:
 * trocar a peça na Estrutura preserva tudo. Logos vêm da Marca, sozinhas.
 */
export function StepMidia({
  projectId,
  slots,
  layout,
  components,
  kitId,
  media,
  onMedia,
}: {
  projectId: string | null;
  slots: Blueprint['slots'];
  layout: LayoutChoice;
  components: KitComponentRef[];
  kitId: string | null;
  media: MediaItem[];
  onMedia: (m: MediaItem[]) => void;
}) {
  const contratos = useQuery({
    queryKey: ['kit-contratos', kitId],
    queryFn: () => {
      if (!kitId) throw new Error('sem kit');
      return api.getKitContratos(kitId);
    },
    enabled: kitId !== null,
  });
  const contratoDe = (cmpId: string | undefined) =>
    contratos.data?.items.find((x) => x.id === cmpId);

  // No modo criativo não há slots de blueprint — cai numa lista genérica de
  // seções para a mídia ainda ter onde ser ancorada.
  const guiada = slots.length > 0;
  const secoes = guiada
    ? slots.map((s) => ({ role: s.role, label: s.label }))
    : [
        { role: 'hero', label: 'Destaque' },
        { role: 'showcase', label: 'Demonstração' },
        { role: 'gallery', label: 'Galeria' },
        { role: 'about', label: 'Sobre' },
      ];

  const resolvidos = guiada
    ? new Map(
        resolverPlacements(
          slots.map((s) => ({ ...s, role: s.role as SectionRole })),
          layout.placements,
          components,
        ).map((r) => [r.role as string, r]),
      )
    : new Map();

  const upload = useMutation({
    mutationFn: ({ file, slotRole }: { file: File; slotRole: string }) => {
      if (!projectId) throw new Error('rascunho ainda não criado');
      const kind: MediaItem['kind'] = file.type.startsWith('video/') ? 'video' : 'image';
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
  const soltas = conteudo.filter(
    (m) => m.slotRole === undefined || !secoes.some((s) => s.role === m.slotRole),
  );

  // Relevância: só pede upload quem tem ESPAÇO no componente escolhido, quem
  // será criada no estilo (a mídia vira o visual) ou quem é papel visual por
  // natureza. O resto só aparece se já tiver arquivo enviado.
  const relevantes = secoes.filter((s) => {
    const r = resolvidos.get(s.role);
    const contrato = contratoDe(r?.componente?.id);
    const temEspaco = (contrato?.midias.length ?? 0) > 0;
    const criadaNoEstilo = guiada && (r == null || r.componente == null);
    const contratoDesconhecido = r?.componente != null && contrato?.disponivel !== true;
    const jaTemMidia = conteudo.some((m) => m.slotRole === s.role);
    return (
      temEspaco ||
      criadaNoEstilo ||
      (contratoDesconhecido && PAPEIS_VISUAIS.has(s.role)) ||
      jaTemMidia
    );
  });
  const dispensadas = secoes.length - relevantes.length;

  return (
    <div className="space-y-4">
      <p className="text-[13px] leading-relaxed" style={{ color: 'var(--color-fg-muted)' }}>
        Tudo aqui é <strong style={{ color: 'var(--color-fg)' }}>opcional</strong> — pode pular e
        gerar sem mídia: as seções saem bonitas no estilo do kit. A mídia fica presa à{' '}
        <strong style={{ color: 'var(--color-fg)' }}>seção</strong>: trocar a peça na Estrutura não
        apaga nada. As logos vêm da Marca e entram sozinhas nos lugares certos.
        {dispensadas > 0 && (
          <span className="mt-1 block text-[12px]" style={{ color: 'var(--color-fg-subtle)' }}>
            {dispensadas === 1
              ? 'Uma seção da sua estrutura não usa mídia e ficou de fora da lista.'
              : `${dispensadas} seções da sua estrutura não usam mídia e ficaram de fora da lista.`}
          </span>
        )}
      </p>

      {relevantes.map((s) => {
        const r = resolvidos.get(s.role);
        const contrato = contratoDe(r?.componente?.id);
        const daSecao = conteudo.filter((m) => m.slotRole === s.role);
        const nImagens = contrato?.midias.filter((m) => m.tipo !== 'video').length ?? 0;
        const nVideos = contrato?.midias.filter((m) => m.tipo === 'video').length ?? 0;
        const espacos =
          contrato?.disponivel === true
            ? [
                nImagens > 0 ? `${nImagens} de imagem` : null,
                nVideos > 0 ? `${nVideos} de vídeo` : null,
              ].filter((x): x is string => x !== null)
            : [];
        return (
          <div
            key={s.role}
            className="rounded-lg border p-3"
            style={{ borderColor: 'var(--color-border)' }}
          >
            <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="text-[14px] font-medium" style={{ color: 'var(--color-fg)' }}>
                {s.label}
              </span>
              {FINALIDADE[s.role] && (
                <span
                  className="rounded-full px-2 py-0.5 text-[10px] uppercase tracking-[0.08em]"
                  style={{
                    backgroundColor: 'rgba(255,255,255,0.06)',
                    color: 'var(--color-fg-muted)',
                  }}
                >
                  {FINALIDADE[s.role]}
                </span>
              )}
              <span className="ds-data text-[10px]" style={{ color: 'var(--color-fg-subtle)' }}>
                {r?.componente !== null && r !== undefined
                  ? `${r.componente.name}${
                      espacos.length > 0
                        ? ` · espaços: ${espacos.join(', ')}`
                        : contrato?.disponivel === false
                          ? ''
                          : ' · sem espaço de mídia no componente'
                    }`
                  : guiada
                    ? 'criada no estilo do kit — a mídia enviada vira o visual da seção'
                    : ''}
              </span>
              <label
                className="ml-auto flex cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] transition-colors hover:border-[var(--color-signal)]"
                style={{
                  borderColor: 'var(--color-border-strong)',
                  color: 'var(--color-fg-muted)',
                }}
              >
                {upload.isPending ? (
                  <Loader2 size={11} className="animate-spin" />
                ) : (
                  <Upload size={11} />
                )}
                enviar
                <input
                  type="file"
                  accept="image/*,video/*"
                  className="hidden"
                  disabled={!projectId || upload.isPending}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) upload.mutate({ file: f, slotRole: s.role });
                    e.target.value = '';
                  }}
                />
              </label>
            </div>
            {daSecao.length > 0 && (
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
                {daSecao.map((m) => (
                  <MidiaThumb
                    key={m.path}
                    item={m}
                    projectId={projectId}
                    onRemover={() => remover.mutate(m.path)}
                  />
                ))}
              </div>
            )}
          </div>
        );
      })}

      {soltas.length > 0 && (
        <div className="rounded-lg border p-3" style={{ borderColor: 'var(--color-border)' }}>
          <div className="mb-2 text-[10px] uppercase tracking-[0.2em]" style={rotulo}>
            Sem seção (o gerador decide onde usar)
          </div>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
            {soltas.map((m) => (
              <MidiaThumb
                key={m.path}
                item={m}
                projectId={projectId}
                onRemover={() => remover.mutate(m.path)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function MidiaThumb({
  item,
  projectId,
  onRemover,
}: {
  item: MediaItem;
  projectId: string | null;
  onRemover: () => void;
}) {
  return (
    <div className="ds-glass-static group relative overflow-hidden rounded-md">
      <div
        className="flex aspect-[16/10] items-center justify-center overflow-hidden"
        style={{ backgroundColor: 'var(--color-obsidian-2)' }}
      >
        {item.kind === 'video' ? (
          <video
            src={projectId ? mediaUrl(projectId, item.path) : undefined}
            className="h-full w-full object-cover"
            muted
          />
        ) : projectId ? (
          <img
            src={mediaUrl(projectId, item.path)}
            alt={item.alt ?? item.originalName}
            className="h-full w-full object-cover"
          />
        ) : (
          <ImageIcon size={16} style={{ color: 'var(--color-fg-subtle)' }} />
        )}
      </div>
      <div className="flex items-center justify-between gap-1 px-1.5 py-1">
        <span className="truncate text-[10px]" style={{ color: 'var(--color-fg-muted)' }}>
          {item.originalName}
        </span>
        <button
          type="button"
          onClick={onRemover}
          className="shrink-0 rounded-full p-0.5 hover:bg-[rgba(198,40,40,0.16)]"
          title="Remover"
          aria-label={`Remover ${item.originalName}`}
        >
          <Trash2 size={11} style={{ color: 'var(--color-crimson-3)' }} />
        </button>
      </div>
    </div>
  );
}
