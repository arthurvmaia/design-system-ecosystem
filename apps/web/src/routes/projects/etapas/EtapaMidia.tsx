import { Mascote } from '@/components/Mascote';
import { Select } from '@/components/seletores';
import { type KitComponentRef, type MediaItem, api } from '@/lib/api';
import { contagemUnificada, contarEspacos } from '@/lib/midia-contagens';
import { toast } from '@/lib/toast';
import {
  type ObjetivoDoSite,
  type Produto,
  type SecaoDoSite,
  resolverSecoes,
  sugerirMidiaDaSecao,
} from '@ds/shared/schemas';
import { useMutation, useQuery } from '@tanstack/react-query';
import { AlertTriangle, Image as ImageIcon, Play, Plus, Trash2, Upload } from 'lucide-react';
import { useState } from 'react';
import { mediaUrl } from '../partes';

/**
 * Mídia e produtos do projeto.
 *
 * A regra antiga era "só pede upload quem tem espaço declarado no componente".
 * Na prática isso zerava a etapa: um kit cujas peças não declaram mídia deixava
 * a tela vazia, com um aviso dizendo que todas as seções ficaram de fora. Quem
 * quer subir um banner não tinha onde.
 *
 * Agora TODA seção aceita mídia, e a etapa inteira é opcional por extenso: dá
 * para pular sem enviar nada. As MÍDIAS GERAIS são área de primeira classe: o
 * que entra sem seção fica sem `secaoId` no manifesto (o cliente e o servidor
 * descartam o campo vazio) e o gerador decide onde cada uma entra. O contrato
 * das peças vira informação, nunca porteiro, e o selo e a frase de cada seção
 * saem da MESMA conta (`midia-contagens`), separando imagem de vídeo.
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
  objetivo,
  criarArteDeApoio,
  onCriarArteDeApoio,
}: {
  projectId: string | null;
  secoes: SecaoDoSite[];
  components: KitComponentRef[];
  kitId: string | null;
  media: MediaItem[];
  onMedia: (m: MediaItem[]) => void;
  produtos: Produto[];
  onProdutos: (p: Produto[]) => void;
  /** Decide qual sequência de marketing explica o pedido de imagem de cada seção. */
  objetivo: ObjetivoDoSite | null;
  /**
   * A permissão `layout.permissoes.criarArteDeApoio`. Mora no layout do projeto
   * e o Wizard a grava junto com as seções; aqui vive só a caixa que a liga.
   */
  criarArteDeApoio: boolean;
  onCriarArteDeApoio: (v: boolean) => void;
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
    mutationFn: ({ file, secaoId }: { file: File; secaoId: string | null }) => {
      if (!projectId) throw new Error('rascunho ainda não criado');
      // `file.type` vem VAZIO em alguns sistemas — e aí todo vídeo cairia em
      // 'image' e o thumb renderizaria um <img> de .mp4. Quando o navegador
      // não diz o MIME, a extensão decide (o servidor aplica a mesma regra).
      const ext = file.name.slice(file.name.lastIndexOf('.')).toLowerCase();
      const pareceVideo = file.type
        ? file.type.startsWith('video/')
        : ['.mp4', '.webm', '.mov', '.ogv', '.m4v'].includes(ext);
      const kind: MediaItem['kind'] = pareceVideo ? 'video' : 'image';
      // Mídia geral vai SEM o campo: é a ausência de `secaoId` no manifesto que
      // significa "o gerador decide" (string vazia seria descartada no caminho,
      // mas não mandar é o contrato dito por inteiro).
      return api.uploadMedia(projectId, file, {
        kind,
        ...(secaoId !== null ? { secaoId } : {}),
      });
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
  // Geral também é a mídia de uma seção que a pessoa apagou depois: ela volta
  // para as mídias gerais em vez de desaparecer junto com a seção.
  const gerais = conteudo.filter(
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
    { valor: '', rotulo: 'Mídias gerais', descricao: 'eu decido onde entra' },
    ...resolvidas.map((s) => ({ valor: s.id, rotulo: s.nome.trim() || 'Seção sem nome' })),
  ];

  return (
    <div className="space-y-4">
      <p className="text-[13px] leading-relaxed" style={{ color: 'var(--color-fg-muted)' }}>
        Tudo aqui é <strong style={{ color: 'var(--color-fg)' }}>opcional</strong>, seção por seção:
        o senhor pode pular e gerar sem enviar nada, que cada seção sai no estilo do kit. Mídia
        enviada fica presa à seção, então trocar a peça na Estrutura não apaga nada. As logos vêm da
        Marca e entram sozinhas.
      </p>

      {/* ── Mídias gerais: área de primeira classe ──────────────────────────
          O caminho mais curto para quem só quer subir arquivos e seguir. O que
          entra aqui fica sem seção no manifesto, e cada item pode ser movido
          depois pelo seletor do próprio thumb. */}
      <div className="rounded-lg border p-3" style={{ borderColor: 'var(--color-border-strong)' }}>
        <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="text-[14px] font-medium" style={{ color: 'var(--color-fg)' }}>
            Mídias gerais
          </span>
          <span className="text-[11px]" style={{ color: 'var(--color-fg-subtle)' }}>
            Eu decido onde cada uma entra.
          </span>
          <label
            className="ml-auto flex cursor-pointer items-center gap-1.5 rounded-none px-4 py-1.5 text-[12px] font-medium"
            style={{ backgroundColor: 'var(--color-primary)', color: 'var(--color-bone-1)' }}
          >
            {upload.isPending ? <Mascote tamanho={12} girando /> : <Upload size={12} />}
            enviar arquivos
            <input
              type="file"
              accept="image/*,video/*"
              multiple
              className="hidden"
              disabled={!projectId || upload.isPending}
              onChange={(e) => {
                for (const f of Array.from(e.target.files ?? [])) {
                  upload.mutate({ file: f, secaoId: null });
                }
                e.target.value = '';
              }}
            />
          </label>
        </div>
        {gerais.length === 0 ? (
          <div className="text-[12px]" style={{ color: 'var(--color-fg-subtle)' }}>
            Nada aqui ainda. Banner, foto, vídeo: o que entrar sem seção aparece nesta grade, e eu
            escolho onde cada peça funciona melhor no site.
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
            {gerais.map((m) => (
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

      {/* ── A permissão de arte de apoio ────────────────────────────────────
          Liga `layout.permissoes.criarArteDeApoio`. O texto diz EXATAMENTE o
          que acontece: desenho em SVG/CSS na paleta e reuso das mídias gerais.
          Geração de imagem por IA não existe neste fluxo, então a caixa não
          promete isso. */}
      <label
        className="flex cursor-pointer items-start gap-2.5 rounded-lg border p-3"
        style={{ borderColor: 'var(--color-border)' }}
      >
        <input
          type="checkbox"
          checked={criarArteDeApoio}
          onChange={(e) => onCriarArteDeApoio(e.target.checked)}
          className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--color-primary)]"
        />
        <span className="min-w-0">
          <span className="block text-[13px] font-medium" style={{ color: 'var(--color-fg)' }}>
            Numa seção sem mídia, posso criar arte de apoio com a sua identidade.
          </span>
          <span
            className="mt-0.5 block text-[11px] leading-relaxed"
            style={{ color: 'var(--color-fg-subtle)' }}
          >
            Arte de apoio é desenho em SVG e CSS na paleta da marca, ou o reuso de uma das mídias
            gerais acima. Eu não gero imagem por IA: esse canal não existe aqui. Desmarcada, a seção
            sem mídia sai só com o estilo do kit.
          </span>
        </span>
      </label>

      {resolvidas.map((s) => {
        // Os espaços somam TODAS as peças da seção: com duas peças de cards, a
        // seção aceita o dobro de imagens, e dizer o número de uma só mentiria.
        const contratosDaSecao = s.pecas
          .map((p) => contratos.data?.items.find((x) => x.id === p.id))
          .filter((c) => c !== undefined);
        const sugestao = sugerirMidiaDaSecao(
          secoes.find((x) => x.id === s.id) ?? { id: s.id, nome: s.nome, componentIds: [] },
          contratos.data?.items ?? [],
          objetivo,
        );
        // O selo e a frase saem da MESMA conta, separando imagem de vídeo. A
        // frase do shared soma tudo como imagem; a composição vive em
        // `midia-contagens`, testada sem navegador.
        const contagem = contagemUnificada(sugestao, contarEspacos(contratosDaSecao));
        const daSecao = conteudo.filter((m) => m.secaoId === s.id);
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
              {contagem.selo !== null && (
                <span
                  className="rounded-none px-2 py-0.5 text-[10px] uppercase tracking-[0.08em]"
                  style={{
                    backgroundColor: 'rgba(255,255,255,0.06)',
                    color: 'var(--color-fg-muted)',
                  }}
                >
                  {contagem.selo}
                </span>
              )}
              <span className="ds-data text-[10px]" style={{ color: 'var(--color-fg-subtle)' }}>
                {s.pecas.length === 0
                  ? 'criada no estilo do kit: a mídia enviada vira o visual da seção'
                  : s.pecas.map((p) => p.name).join(' + ')}
              </span>
              {/* O PORQUÊ, na linha de baixo e por extenso.
                  A tela pedia um número de imagens sem dizer para quê, e a
                  única resposta possível era chutar. A razão vem da etapa de
                  marketing daquela seção, somada aos espaços reais das peças —
                  ver `sugerirMidiaDaSecao`. */}
              <span
                className="w-full text-[11px] leading-relaxed"
                style={{ color: 'var(--color-fg-subtle)' }}
              >
                {contagem.porque}
              </span>
              <label
                className="ml-auto flex cursor-pointer items-center gap-1.5 rounded-none border px-3 py-1 text-[11px] transition-colors hover:border-[var(--color-signal)]"
                style={{
                  borderColor: 'var(--color-border-strong)',
                  color: 'var(--color-fg-muted)',
                }}
              >
                {upload.isPending ? <Mascote tamanho={11} girando /> : <Upload size={11} />}
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
          className="ml-auto flex items-center gap-1.5 rounded-none border px-3 py-1 text-[11px]"
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
                  className="shrink-0 rounded-none p-1 hover:bg-[rgba(239,68,68,0.16)]"
                  title="Remover produto"
                  aria-label={`Remover ${p.nome || 'produto'}`}
                >
                  <Trash2 size={12} style={{ color: 'var(--color-ion-3)' }} />
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
                      className="rounded-none border px-2.5 py-1 text-[11px]"
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
                    {enviarFoto.isPending ? <Mascote tamanho={11} girando /> : <Upload size={11} />}
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
  opcoes: Array<{ valor: string; rotulo: string; descricao?: string }>;
  onMover: (valor: string) => void;
  onRemover: () => void;
}) {
  // Vídeo que o navegador não decodifica (o caso real: HEVC enviado antes de
  // o upload recusar esse formato). Dois sinais somados, porque um só perde
  // metade dos casos:
  // 1) `onError` do elemento — arquivo corrompido ou container recusado;
  // 2) `loadedmetadata` com `videoWidth === 0` — o caso HEVC de verdade: o
  //    container MP4 é lido (duração e faixas chegam), mas nenhum quadro
  //    decodifica, então `onError` nunca dispara e o thumb ficaria um
  //    retângulo preto com um Play que não toca nada.
  const [naoDecodifica, setNaoDecodifica] = useState(false);
  return (
    <div className="ds-glass-static group relative overflow-hidden rounded-md">
      <div
        className="relative flex aspect-[16/10] items-center justify-center overflow-hidden"
        style={{ backgroundColor: 'var(--color-ink-2)' }}
      >
        {item.kind === 'video' ? (
          <>
            {/* Sem `preload`, o navegador não busca frame nenhum e até um .mp4
                válido vira caixa preta. `metadata` traz o primeiro quadro sem
                baixar o vídeo inteiro; `playsInline` evita o fullscreen do iOS. */}
            <video
              src={projectId ? mediaUrl(projectId, item.path) : undefined}
              className="h-full w-full object-cover"
              preload="metadata"
              playsInline
              muted
              onError={() => setNaoDecodifica(true)}
              onLoadedMetadata={(e) => {
                if (e.currentTarget.videoWidth === 0) setNaoDecodifica(true);
              }}
            />
            {naoDecodifica ? (
              /* No lugar do Play: um Play aqui prometeria o que o vídeo não
                 entrega. O texto curto cabe no thumb; a explicação inteira vai
                 no `title`, e por isso o overlay recebe ponteiro (sem hover não
                 há tooltip). Ele cobre só a área do vídeo: o excluir logo
                 abaixo, que é o caminho de correção, continua clicável. */
              <span
                className="absolute inset-0 flex flex-col items-center justify-center gap-1 px-2 text-center"
                style={{ backgroundColor: 'rgba(0, 0, 0, 0.55)' }}
                title="O arquivo está em um formato que os navegadores não tocam (provavelmente HEVC). Exporte em H.264 e envie de novo; eu já recuso novos uploads assim."
              >
                <AlertTriangle size={13} aria-hidden style={{ color: 'var(--color-warn)' }} />
                <span className="text-[9px] leading-tight" style={{ color: 'var(--color-bone-2)' }}>
                  este vídeo não toca no navegador
                </span>
              </span>
            ) : (
              /* O ícone diz "isto é um vídeo" — o quadro parado sozinho passa
                  por imagem. Decorativo: o nome do arquivo já está logo abaixo. */
              <span className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <span
                  className="flex h-6 w-6 items-center justify-center rounded-none"
                  style={{ backgroundColor: 'rgba(0, 0, 0, 0.55)' }}
                >
                  <Play
                    size={11}
                    fill="currentColor"
                    aria-hidden
                    style={{ color: 'var(--color-bone-1)' }}
                  />
                </span>
              </span>
            )}
          </>
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
          className="shrink-0 rounded-none p-0.5 hover:bg-[rgba(239,68,68,0.16)]"
          title="Remover"
          aria-label={`Remover ${item.originalName}`}
        >
          <Trash2 size={11} style={{ color: 'var(--color-ion-3)' }} />
        </button>
      </div>
      {/* Trocar de seção sem reenviar o arquivo. O valor é o `secaoId` (o
          espelho `slotRole` é derivado e nunca casaria com um `sec_...`).
          Seletor próprio do app, não o <select> nativo: é a regra declarada em
          `seletores/index.ts`, e o flutuante em portal funciona dentro do
          Modal. Valor '' é "Mídias gerais": a mídia volta para a grade de cima
          e quem decide o lugar sou eu. */}
      <div className="border-t p-1" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
        <Select
          opcoes={opcoes}
          valor={item.secaoId ?? ''}
          aoMudar={onMover}
          rotulo={`Seção de ${item.originalName}`}
        />
      </div>
    </div>
  );
}
