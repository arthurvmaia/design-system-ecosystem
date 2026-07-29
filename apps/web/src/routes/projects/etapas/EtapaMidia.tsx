import { type KitComponentRef, type MediaItem, api } from '@/lib/api';
import { toast } from '@/lib/toast';
import { type Produto, type SecaoDoSite, resolverSecoes } from '@ds/shared/schemas';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Image as ImageIcon, Loader2, Plus, Trash2, Upload } from 'lucide-react';
import { mediaUrl, rotulo } from '../partes';

/** A finalidade humana da mídia em cada papel — a tela fala de propósito. */
const FINALIDADE: Record<string, string> = {
  hero: 'Imagem principal',
  showcase: 'Demonstração',
  gallery: 'Galeria',
  catalog: 'Fotos de produto',
  testimonials: 'Foto de quem depõe',
  about: 'Foto de contexto',
  team: 'Fotos da equipe',
  features: 'Ilustrações de apoio',
};

/**
 * Mídia e produtos do projeto.
 *
 * A regra antiga era "só pede upload quem tem espaço declarado no componente".
 * Na prática isso zerava a etapa: um kit cujas peças não declaram mídia deixava
 * a tela vazia, com um aviso dizendo que todas as seções ficaram de fora. Quem
 * quer subir um banner não tinha onde.
 *
 * Agora TODA seção aceita mídia. O que o contrato do componente diz vira
 * informação ("esta peça tem 2 espaços de imagem", "esta não declara espaço, a
 * mídia entra como fundo") em vez de porteiro. E quem não quiser escolher a
 * seção envia direto para "deixe o gerador decidir": a mídia fica sem `slotRole`
 * e o gerador coloca onde couber.
 *
 * A mídia é ancorada na SEÇÃO, não na peça: trocar o componente na Estrutura
 * preserva tudo. Logos vêm da Marca e entram sozinhas.
 */
export function StepMidia({
  projectId,
  secoes,
  components,
  kitId,
  media,
  onMedia,
  produtos,
  onProdutos,
}: {
  projectId: string | null;
  secoes: SecaoDoSite[];
  components: KitComponentRef[];
  kitId: string | null;
  media: MediaItem[];
  onMedia: (m: MediaItem[]) => void;
  produtos: Produto[];
  onProdutos: (p: Produto[]) => void;
}) {
  const contratos = useQuery({
    queryKey: ['kit-contratos', kitId],
    queryFn: () => {
      if (!kitId) throw new Error('sem kit');
      return api.getKitContratos(kitId);
    },
    enabled: kitId !== null,
  });

  // A lista é a estrutura que a pessoa montou, na ordem dela. Antes vinha dos
  // slots do blueprint, então esta tela mostrava seções que o site não teria.
  const resolvidas = resolverSecoes(secoes, components).secoes;

  const upload = useMutation({
    mutationFn: ({ file, secaoId }: { file: File; secaoId: string }) => {
      if (!projectId) throw new Error('rascunho ainda não criado');
      const kind: MediaItem['kind'] = file.type.startsWith('video/') ? 'video' : 'image';
      return api.uploadMedia(projectId, file, { kind, secaoId });
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
  // Solta também é a mídia de uma seção que a pessoa apagou depois: ela volta
  // para o balaio em vez de desaparecer junto com a seção.
  const soltas = conteudo.filter(
    (m) => m.secaoId === undefined || !secoes.some((s) => s.id === m.secaoId),
  );

  const mover = useMutation({
    mutationFn: ({ path, secaoId }: { path: string; secaoId: string | null }) => {
      if (!projectId) throw new Error('sem projeto');
      return api.updateMedia(projectId, path, { secaoId });
    },
    onSuccess: (res) => onMedia(res.media),
    onError: (e) => toast.erro(e instanceof Error ? e.message : 'Falha ao mover a mídia.'),
  });

  const opcoesDeSecao = [
    { valor: '', rotulo: 'Deixe o gerador decidir' },
    ...resolvidas.map((s) => ({ valor: s.id, rotulo: s.nome.trim() || 'Seção sem nome' })),
  ];

  return (
    <div className="space-y-4">
      <p className="text-[13px] leading-relaxed" style={{ color: 'var(--color-fg-muted)' }}>
        Tudo aqui é <strong style={{ color: 'var(--color-fg)' }}>opcional</strong>. Pode pular e
        gerar sem nada: as seções saem bonitas no estilo do kit. Envie na seção que quiser, ou solte
        em <strong style={{ color: 'var(--color-fg)' }}>Deixe o gerador decidir</strong> e eu
        escolho onde cada uma entra melhor. A mídia fica presa à seção, então trocar a peça na
        Estrutura não apaga nada. As logos vêm da Marca e entram sozinhas.
      </p>

      {/* Envio sem escolher seção: o caminho mais curto para quem só quer subir
          um banner e seguir. Depois dá para mover cada uma pelo seletor. */}
      <div
        className="flex flex-wrap items-center gap-3 rounded-lg border border-dashed p-3"
        style={{ borderColor: 'var(--color-border-strong)' }}
      >
        <div className="min-w-0 flex-1">
          <div className="text-[13px] font-medium" style={{ color: 'var(--color-fg)' }}>
            Enviar mídia
          </div>
          <div className="text-[11px]" style={{ color: 'var(--color-fg-subtle)' }}>
            Banner, foto, vídeo. Escolha a seção agora ou depois, item por item.
          </div>
        </div>
        <label
          className="flex cursor-pointer items-center gap-1.5 rounded-full px-4 py-2 text-[12px] font-medium"
          style={{ backgroundColor: 'var(--color-primary)', color: 'var(--color-bone-1)' }}
        >
          {upload.isPending ? <Loader2 size={12} className="animate-spin" /> : <Upload size={12} />}
          escolher arquivo
          <input
            type="file"
            accept="image/*,video/*"
            multiple
            className="hidden"
            disabled={!projectId || upload.isPending}
            onChange={(e) => {
              for (const f of Array.from(e.target.files ?? [])) {
                upload.mutate({ file: f, secaoId: '' });
              }
              e.target.value = '';
            }}
          />
        </label>
      </div>

      {resolvidas.map((s) => {
        const daSecao = conteudo.filter((m) => m.secaoId === s.id);
        // Os espaços somam TODAS as peças da seção: com duas peças de cards, a
        // seção aceita o dobro de imagens, e dizer o número de uma só mentiria.
        const contratosDaSecao = s.pecas
          .map((p) => contratos.data?.items.find((x) => x.id === p.id))
          .filter((c) => c !== undefined);
        const declarados = contratosDaSecao.filter((c) => c.disponivel);
        const nImagens = declarados.reduce(
          (n, c) => n + c.midias.filter((m) => m.tipo !== 'video').length,
          0,
        );
        const nVideos = declarados.reduce(
          (n, c) => n + c.midias.filter((m) => m.tipo === 'video').length,
          0,
        );
        const espacos = [
          nImagens > 0 ? `${nImagens} de imagem` : null,
          nVideos > 0 ? `${nVideos} de vídeo` : null,
        ].filter((x): x is string => x !== null);
        const finalidade = FINALIDADE[s.slug];
        return (
          <div
            key={s.id}
            className="rounded-lg border p-3"
            style={{ borderColor: 'var(--color-border)' }}
          >
            <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="text-[14px] font-medium" style={{ color: 'var(--color-fg)' }}>
                {s.nome.trim() || 'Seção sem nome'}
              </span>
              {finalidade !== undefined && (
                <span
                  className="rounded-full px-2 py-0.5 text-[10px] uppercase tracking-[0.08em]"
                  style={{
                    backgroundColor: 'rgba(255,255,255,0.06)',
                    color: 'var(--color-fg-muted)',
                  }}
                >
                  {finalidade}
                </span>
              )}
              <span className="ds-data text-[10px]" style={{ color: 'var(--color-fg-subtle)' }}>
                {s.pecas.length === 0
                  ? 'criada no estilo do kit: a mídia enviada vira o visual da seção'
                  : `${s.pecas.map((p) => p.name).join(' + ')}${
                      espacos.length > 0 ? ` · espaços: ${espacos.join(', ')}` : ''
                    }`}
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
                    if (f) upload.mutate({ file: f, secaoId: s.id });
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
                    opcoes={opcoesDeSecao}
                    onMover={(v) => mover.mutate({ path: m.path, secaoId: v === '' ? null : v })}
                    onRemover={() => remover.mutate(m.path)}
                  />
                ))}
              </div>
            )}
          </div>
        );
      })}

      <div className="rounded-lg border p-3" style={{ borderColor: 'var(--color-border)' }}>
        <div className="mb-2 text-[10px] uppercase tracking-[0.2em]" style={rotulo}>
          Deixe o gerador decidir
        </div>
        {soltas.length === 0 ? (
          <div className="text-[12px]" style={{ color: 'var(--color-fg-subtle)' }}>
            Nada aqui. O que você enviar sem escolher seção aparece nesta lista, e eu decido onde
            cada peça entra melhor.
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
            {soltas.map((m) => (
              <MidiaThumb
                key={m.path}
                item={m}
                projectId={projectId}
                opcoes={opcoesDeSecao}
                onMover={(v) => mover.mutate({ path: m.path, secaoId: v === '' ? null : v })}
                onRemover={() => remover.mutate(m.path)}
              />
            ))}
          </div>
        )}
      </div>

      <BlocoProdutos
        projectId={projectId}
        produtos={produtos}
        onProdutos={onProdutos}
        onMedia={onMedia}
      />
    </div>
  );
}

/**
 * Produtos do usuário.
 *
 * Só o nome é obrigatório: quem quer listar seis produtos sem preço consegue, e
 * quem quer catálogo completo também. A foto aponta para uma mídia já enviada,
 * então não existe caminho solto nem arquivo órfão. Lista vazia significa que o
 * site não tem vitrine, e não que ela deva ser inventada.
 */
function BlocoProdutos({
  projectId,
  produtos,
  onProdutos,
  onMedia,
}: {
  projectId: string | null;
  produtos: Produto[];
  onProdutos: (p: Produto[]) => void;
  onMedia: (m: MediaItem[]) => void;
}) {
  const trocar = (id: string, patch: Partial<Produto>) =>
    onProdutos(produtos.map((p) => (p.id === id ? { ...p, ...patch } : p)));

  // A foto do produto é enviada AQUI, no próprio produto. Ela entra no manifesto
  // de mídias como qualquer outra (para o gerador achar o arquivo), mas sem
  // seção: o lugar dela é o card do produto, não uma dobra do site.
  const enviarFoto = useMutation({
    mutationFn: ({ file, produtoId }: { file: File; produtoId: string }) => {
      if (!projectId) throw new Error('rascunho ainda não criado');
      return api
        .uploadMedia(projectId, file, { kind: 'image' })
        .then((res) => ({ ...res, produtoId }));
    },
    onSuccess: (res) => {
      onMedia(res.media);
      trocar(res.produtoId, { imagemPath: res.item.path });
      toast.ok('Foto do produto enviada.');
    },
    onError: (e) => toast.erro(e instanceof Error ? e.message : 'Falha ao enviar a foto.'),
  });

  const campo = {
    borderColor: 'var(--color-border)',
    backgroundColor: 'rgba(0,0,0,0.3)',
    color: 'var(--color-fg)',
  };

  return (
    <div className="rounded-lg border p-3" style={{ borderColor: 'var(--color-border)' }}>
      <div className="mb-1 flex flex-wrap items-center gap-3">
        <span className="text-[14px] font-medium" style={{ color: 'var(--color-fg)' }}>
          Seus produtos
        </span>
        <button
          type="button"
          onClick={() =>
            onProdutos([
              ...produtos,
              { id: `prd_${Date.now().toString(36)}${produtos.length}`, nome: '' },
            ])
          }
          className="ml-auto flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px]"
          style={{ borderColor: 'var(--color-border-strong)', color: 'var(--color-fg-muted)' }}
        >
          <Plus size={11} />
          adicionar produto
        </button>
      </div>
      <p className="mb-3 text-[12px]" style={{ color: 'var(--color-fg-subtle)' }}>
        O que você vende. Vira vitrine no site, montada com as peças do kit. Só o nome é
        obrigatório. Sem produto nenhum, o site simplesmente não tem essa seção.
      </p>

      {produtos.length === 0 ? (
        <div className="text-[12px]" style={{ color: 'var(--color-fg-subtle)' }}>
          Nenhum produto ainda.
        </div>
      ) : (
        <div className="space-y-3">
          {produtos.map((p, i) => (
            <div
              key={p.id}
              className="rounded-md border p-3"
              style={{ borderColor: 'var(--color-border)' }}
            >
              <div className="mb-2 flex items-center gap-2">
                <span className="ds-data text-[10px]" style={{ color: 'var(--color-fg-subtle)' }}>
                  {i + 1}
                </span>
                <input
                  type="text"
                  value={p.nome}
                  onChange={(e) => trocar(p.id, { nome: e.target.value })}
                  placeholder="nome do produto"
                  className="flex-1 rounded-md border px-3 py-1.5 text-[13px] outline-none"
                  style={campo}
                />
                <input
                  type="text"
                  value={p.preco ?? ''}
                  onChange={(e) => trocar(p.id, { preco: e.target.value })}
                  placeholder="preço (opcional)"
                  className="w-[150px] rounded-md border px-3 py-1.5 text-[13px] outline-none"
                  style={campo}
                />
                <button
                  type="button"
                  onClick={() => onProdutos(produtos.filter((x) => x.id !== p.id))}
                  className="shrink-0 rounded-full p-1 hover:bg-[rgba(198,40,40,0.16)]"
                  title="Remover produto"
                  aria-label={`Remover ${p.nome || 'produto'}`}
                >
                  <Trash2 size={12} style={{ color: 'var(--color-crimson-3)' }} />
                </button>
              </div>
              <textarea
                value={p.descricao ?? ''}
                onChange={(e) => trocar(p.id, { descricao: e.target.value })}
                placeholder="descrição curta (opcional)"
                rows={2}
                className="w-full resize-y rounded-md border px-3 py-2 text-[13px] outline-none"
                style={campo}
              />
              <div className="mt-2 flex flex-wrap items-center gap-2">
                {p.imagemPath !== undefined && projectId ? (
                  <div className="flex items-center gap-2">
                    <img
                      src={mediaUrl(projectId, p.imagemPath)}
                      alt={`Foto de ${p.nome || 'produto'}`}
                      className="h-10 w-10 rounded object-cover"
                    />
                    <button
                      type="button"
                      onClick={() => trocar(p.id, { imagemPath: undefined })}
                      className="rounded-full border px-2.5 py-1 text-[11px]"
                      style={{ borderColor: 'var(--color-border)', color: 'var(--color-fg-muted)' }}
                    >
                      trocar foto
                    </button>
                  </div>
                ) : (
                  <label
                    className="flex cursor-pointer items-center gap-1.5 rounded-md border px-3 py-1.5 text-[12px]"
                    style={{
                      borderColor: 'var(--color-border-strong)',
                      color: 'var(--color-fg-muted)',
                    }}
                  >
                    {enviarFoto.isPending ? (
                      <Loader2 size={11} className="animate-spin" />
                    ) : (
                      <Upload size={11} />
                    )}
                    enviar foto
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      disabled={!projectId || enviarFoto.isPending}
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) enviarFoto.mutate({ file: f, produtoId: p.id });
                        e.target.value = '';
                      }}
                    />
                  </label>
                )}
                <input
                  type="text"
                  value={p.link ?? ''}
                  onChange={(e) => trocar(p.id, { link: e.target.value })}
                  placeholder="link (opcional)"
                  className="min-w-[180px] flex-1 rounded-md border px-3 py-1.5 text-[12px] outline-none"
                  style={campo}
                />
                <input
                  type="text"
                  value={p.destaque ?? ''}
                  onChange={(e) => trocar(p.id, { destaque: e.target.value })}
                  placeholder="selo: novo, mais vendido…"
                  className="w-[180px] rounded-md border px-3 py-1.5 text-[12px] outline-none"
                  style={campo}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function MidiaThumb({
  item,
  projectId,
  opcoes,
  onMover,
  onRemover,
}: {
  item: MediaItem;
  projectId: string | null;
  opcoes: Array<{ valor: string; rotulo: string }>;
  onMover: (valor: string) => void;
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
      {/* Trocar de seção sem reenviar o arquivo. */}
      <select
        value={item.slotRole ?? ''}
        onChange={(e) => onMover(e.target.value)}
        aria-label={`Seção de ${item.originalName}`}
        className="w-full border-t px-1.5 py-1 text-[10px] outline-none"
        style={{
          borderColor: 'rgba(255,255,255,0.06)',
          backgroundColor: 'rgba(0,0,0,0.35)',
          color: 'var(--color-fg-muted)',
        }}
      >
        {opcoes.map((o) => (
          <option key={o.valor} value={o.valor}>
            {o.rotulo}
          </option>
        ))}
      </select>
    </div>
  );
}
