import { Mascote } from '@/components/Mascote';
import { Select } from '@/components/seletores';
import { type MediaItem, api } from '@/lib/api';
import { ehVideoEscolhido } from '@/lib/arquivo-escolhido';
import { toast } from '@/lib/toast';
import type { Produto, SecaoDoSite } from '@ds/shared/schemas';
import { useMutation } from '@tanstack/react-query';
import {
  AlertTriangle,
  ChevronDown,
  Image as ImageIcon,
  Play,
  Plus,
  Trash2,
  Upload,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { mediaUrl } from '../partes';

/**
 * O depósito do projeto: o que existe no site sem pertencer a seção nenhuma.
 *
 * A Mídia era uma etapa do wizard e deixou de ser. A mídia DE UMA SEÇÃO se
 * envia olhando para a seção, no inspetor da Estrutura — escolher uma imagem
 * para "a abertura" é decisão diferente de escolher uma imagem no meio de uma
 * lista de seis campos iguais, e era essa lista que a etapa era. Sobraram duas
 * coisas que não têm seção a que pertencer, e por isso não cabem no inspetor:
 *
 * - as MÍDIAS GERAIS, que entram sem `secaoId` no manifesto (o cliente e o
 *   servidor descartam o campo vazio) e cujo lugar quem escolhe é a geração;
 * - os PRODUTOS, que viram vitrine montada com as peças do kit e não moram numa
 *   dobra específica da página.
 *
 * Elas ficam aqui, num painel ao pé da Estrutura, fechado por padrão: uma etapa
 * inteira do wizard para duas listas opcionais cobrava um "Próximo" de todo
 * mundo, inclusive de quem não tem produto nem arquivo solto.
 *
 * Mídia de uma seção APAGADA também cai aqui: ela volta para as mídias gerais em
 * vez de sumir junto com a seção. E cada thumb tem o seletor de seção, que é o
 * caminho de mão dupla — dá para mandar um arquivo geral para uma seção sem
 * reenviá-lo.
 */
export function Deposito({
  projectId,
  secoes,
  media,
  onMedia,
  produtos,
  onProdutos,
  criarArteDeApoio,
  onCriarArteDeApoio,
  pendencia,
}: {
  projectId: string | null;
  secoes: SecaoDoSite[];
  media: MediaItem[];
  onMedia: (m: MediaItem[]) => void;
  produtos: Produto[];
  onProdutos: (p: Produto[]) => void;
  /**
   * A permissão `layout.permissoes.criarArteDeApoio`. Mora no layout do projeto
   * e o Wizard a grava junto com as seções; aqui vive só a caixa que a liga. Ela
   * está neste painel porque o que a caixa autoriza é justamente reusar as
   * mídias gerais logo acima.
   */
  criarArteDeApoio: boolean;
  onCriarArteDeApoio: (v: boolean) => void;
  /**
   * A pendência do gate que se resolve AQUI dentro, quando existe.
   *
   * É o que impede o painel fechado de virar esconderijo: o botão "Próximo"
   * trava dizendo que um produto está sem nome, e o produto está a uma rolagem
   * de distância dentro de um bloco recolhido. Com a mensagem, o painel abre
   * sozinho e se aproxima.
   */
  pendencia?: string;
}) {
  const [aberto, setAberto] = useState(false);
  const painel = useRef<HTMLDivElement>(null);

  // `block: 'nearest'` de propósito: quando a pendência aparece porque a pessoa
  // acabou de clicar em "adicionar produto" (produto novo nasce sem nome), o
  // painel já está na frente dela e um scroll qualquer seria um pulo sem motivo.
  useEffect(() => {
    if (pendencia === undefined) return;
    setAberto(true);
    painel.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [pendencia]);

  const upload = useMutation({
    mutationFn: (file: File) => {
      if (!projectId) throw new Error('rascunho ainda não criado');
      // A decisão vídeo/imagem vem de `arquivo-escolhido`, não de uma cópia
      // local: com `file.type` vazio (acontece) a regra é a extensão, e duas
      // cópias dela fariam o MESMO arquivo virar vídeo aqui e imagem no
      // inspetor da seção.
      const kind: MediaItem['kind'] = ehVideoEscolhido(file) ? 'video' : 'image';
      // Sem `secaoId`: é a AUSÊNCIA do campo no manifesto que significa "o
      // gerador decide onde entra".
      return api.uploadMedia(projectId, file, { kind });
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

  const mover = useMutation({
    mutationFn: ({ path, secaoId }: { path: string; secaoId: string | null }) => {
      if (!projectId) throw new Error('sem projeto');
      return api.updateMedia(projectId, path, { secaoId });
    },
    onSuccess: (res) => onMedia(res.media),
    onError: (e) => toast.erro(e instanceof Error ? e.message : 'Falha ao mover a mídia.'),
  });

  // Mídias de teste POR SEÇÃO, a partir da marca já salva. Vive aqui, e não na
  // etapa de Marca, porque a ordem do wizard é Marca antes de Estrutura: só
  // AGORA as seções existem para receber as suas imagens.
  const gerarDaMarca = useMutation({
    mutationFn: () => {
      if (!projectId) throw new Error('rascunho ainda não criado');
      return api.gerarMidiasAutomaticas(projectId);
    },
    onSuccess: (res) => {
      onMedia(res.media);
      toast.ok(`Criei ${res.criadas.length} imagem(ns) de teste, ancoradas nas seções.`);
    },
    onError: (e) => toast.erro(e instanceof Error ? e.message : 'Não consegui gerar as mídias.'),
  });

  // Logo aparece na etapa de marca; aqui listamos só as mídias de conteúdo.
  const conteudo = media.filter((m) => m.kind !== 'logo');
  const gerais = conteudo.filter(
    (m) => m.secaoId === undefined || !secoes.some((s) => s.id === m.secaoId),
  );

  const opcoesDeSecao = [
    { valor: '', rotulo: 'Mídias gerais', descricao: 'eu decido onde entra' },
    ...secoes.map((s) => ({ valor: s.id, rotulo: s.nome.trim() || 'Seção sem nome' })),
  ];

  const resumo = [
    `${gerais.length} ${gerais.length === 1 ? 'mídia geral' : 'mídias gerais'}`,
    `${produtos.length} ${produtos.length === 1 ? 'produto' : 'produtos'}`,
  ].join(' · ');

  return (
    <div
      ref={painel}
      className="rounded-lg border"
      style={{
        borderColor: pendencia !== undefined ? 'var(--color-ion-5)' : 'var(--color-border-strong)',
      }}
    >
      <button
        type="button"
        onClick={() => setAberto(!aberto)}
        aria-expanded={aberto}
        className="flex w-full items-center gap-3 px-3.5 py-3 text-left transition-colors duration-300 hover:bg-white/[0.03]"
      >
        <span className="min-w-0 flex-1">
          <span className="block text-[14px] font-medium" style={{ color: 'var(--color-fg)' }}>
            Mídias gerais e produtos
          </span>
          <span
            className="mt-0.5 block text-[11px] leading-relaxed"
            style={{ color: 'var(--color-fg-subtle)' }}
          >
            O que não é de nenhuma seção. A mídia de uma seção você envia na própria seção, ali no
            painel de detalhes.
          </span>
        </span>
        <span className="ds-data shrink-0 text-[11px]" style={{ color: 'var(--color-fg-muted)' }}>
          {resumo}
        </span>
        <ChevronDown
          size={14}
          className="shrink-0 transition-transform duration-300"
          style={{
            color: 'var(--color-fg-subtle)',
            transform: aberto ? 'rotate(180deg)' : undefined,
          }}
        />
      </button>

      {pendencia !== undefined && (
        <div
          className="border-t px-3.5 py-2 text-[12px]"
          style={{ borderColor: 'var(--color-border)', color: 'var(--color-fg)' }}
        >
          {pendencia}
        </div>
      )}

      {aberto && (
        <div
          className="ds-fade-in space-y-4 border-t p-3.5"
          style={{ borderColor: 'var(--color-border)' }}
        >
          {/* ── Mídias gerais ─────────────────────────────────────────────────
              O caminho mais curto para quem só quer subir arquivos e seguir. */}
          <div>
            <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="text-[13px] font-medium" style={{ color: 'var(--color-fg)' }}>
                Mídias gerais
              </span>
              <span className="text-[11px]" style={{ color: 'var(--color-fg-subtle)' }}>
                Eu decido onde cada uma entra.
              </span>
              <button
                type="button"
                disabled={!projectId || gerarDaMarca.isPending}
                onClick={() => gerarDaMarca.mutate()}
                className="ml-auto rounded-none border px-3 py-1.5 text-[12px] disabled:opacity-50"
                style={{ borderColor: 'var(--color-border-strong)', color: 'var(--color-fg)' }}
                title="Crio imagens de teste com a sua marca, uma para cada espaço que as seções aceitam."
              >
                {gerarDaMarca.isPending ? 'gerando…' : 'gerar da marca para as seções'}
              </button>
              <label
                className="flex cursor-pointer items-center gap-1.5 rounded-none px-4 py-1.5 text-[12px] font-medium"
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
                    for (const f of Array.from(e.target.files ?? [])) upload.mutate(f);
                    e.target.value = '';
                  }}
                />
              </label>
            </div>
            {gerais.length === 0 ? (
              <div className="text-[12px]" style={{ color: 'var(--color-fg-subtle)' }}>
                Nada aqui ainda. Banner, foto, vídeo: o que entrar sem seção aparece nesta grade, e
                eu escolho onde cada peça funciona melhor no site.
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
            {!projectId && (
              <p className="mt-1.5 text-[11px]" style={{ color: 'var(--color-fg-subtle)' }}>
                O envio abre depois do primeiro avanço, quando o rascunho existe.
              </p>
            )}
          </div>

          {/* ── A permissão de arte de apoio ────────────────────────────────
              Liga `layout.permissoes.criarArteDeApoio`. O texto diz EXATAMENTE
              o que acontece: desenho em SVG/CSS na paleta e reuso das mídias
              gerais. Geração de imagem por IA não existe neste fluxo, então a
              caixa não promete isso. */}
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
                Arte de apoio é desenho em SVG e CSS na paleta da marca, ou o reuso de uma das
                mídias gerais acima. Eu não gero imagem por IA: esse canal não existe aqui.
                Desmarcada, a seção sem mídia sai só com o estilo do kit.
              </span>
            </span>
          </label>

          <BlocoProdutos
            projectId={projectId}
            produtos={produtos}
            onProdutos={onProdutos}
            onMedia={onMedia}
          />
        </div>
      )}
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
      {/* Mandar o arquivo para uma seção sem reenviá-lo. O valor é o `secaoId`
          (o espelho `slotRole` é derivado e nunca casaria com um `sec_...`).
          Seletor próprio do app, não o <select> nativo: é a regra declarada em
          `seletores/index.ts`, e o flutuante em portal funciona dentro do
          Modal. Valor '' é "Mídias gerais": a mídia volta para esta grade e quem
          decide o lugar sou eu. */}
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
