import { ConfirmPop } from '@/components/ConfirmPop';
import { Mascote } from '@/components/Mascote';
import { PreviewFrame } from '@/components/PreviewFrame';
import { type MeusProjetosItem, api, downloadUrl, siteUrl } from '@/lib/api';
import { TRABALHANDO, VAZIO, conta } from '@/lib/orbis';
import { toast } from '@/lib/toast';
import { useReveal } from '@/lib/use-reveal';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Copy, Download, ExternalLink, FolderOpen, Package, Pencil, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

const formatarBytes = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} b`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} kb`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} mb`;
};

/**
 * O gerador nomeia a pasta com ISO e troca `:` e `.` por `-`, porque
 * dois-pontos é inválido em nome de pasta no Windows: `2026-07-18T22-35-48-123Z`.
 * Aqui desfazemos exatamente essa troca — só na parte da hora, ancorada no fim
 * da string, senão o padrão casaria também com os hífens da data.
 */
const formatarData = (nome: string): string => {
  const iso = nome.replace(/T(\d{2})-(\d{2})-(\d{2})-(\d{3})Z$/, 'T$1:$2:$3.$4Z');
  const data = new Date(iso);
  return Number.isNaN(data.getTime()) ? nome : data.toLocaleString('pt-BR');
};

export function MeusProjetosPage() {
  const projetos = useQuery({ queryKey: ['meus-projetos'], queryFn: api.listMeusProjetos });

  const items = projetos.data?.items ?? [];
  useReveal([items.length]);

  return (
    <div className="mx-auto max-w-[1080px] px-8 py-12">
      <div
        className="ds-slide-up text-[10px] uppercase tracking-[0.28em]"
        style={{ color: 'var(--color-primary)', fontFamily: 'var(--font-display)' }}
      >
        Meus sites
      </div>
      <h1
        className="ds-slide-up ds-d1 ds-text-glow mt-2 text-[36px] font-medium tracking-tight"
        style={{ color: 'var(--color-fg)', fontFamily: 'var(--font-display)' }}
      >
        O que eu montei está pronto para sair daqui.
      </h1>
      <p
        className="ds-slide-up ds-d2 mt-3 max-w-[62ch] text-[14px] leading-[1.6]"
        style={{ color: 'var(--color-fg-muted)' }}
      >
        Cada versão é um site completo: veja a prévia, abra numa aba ou baixe o .zip para subir num
        host. Se quiser mudar alguma coisa, edite o projeto e eu gero de novo.
      </p>

      {items.length === 0 ? (
        <VazioState carregando={projetos.isPending} />
      ) : (
        <div className="mt-10 space-y-5">
          {items.map((projeto) => (
            <CardProjeto key={projeto.id} projeto={projeto} />
          ))}
        </div>
      )}
    </div>
  );
}

function CardProjeto({ projeto }: { projeto: MeusProjetosItem }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [confirmDel, setConfirmDel] = useState(false);

  const maisRecente = projeto.versoes[0];
  const anteriores = projeto.versoes.slice(1);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['meus-projetos'] });
    qc.invalidateQueries({ queryKey: ['meus-projetos-contagem'] });
    qc.invalidateQueries({ queryKey: ['projects'] });
  };

  const abrirPasta = useMutation({
    mutationFn: () => api.abrirPasta(projeto.id),
    onError: (e) => toast.erro(e instanceof Error ? e.message : 'Não consegui abrir a pasta.'),
  });
  const duplicar = useMutation({
    mutationFn: () => api.duplicateProject(projeto.id),
    onSuccess: () => {
      invalidate();
      toast.ok('Dupliquei como rascunho. Está em Gerar site.');
    },
    onError: (e) => toast.erro(e instanceof Error ? e.message : 'Não consegui duplicar.'),
  });
  const excluir = useMutation({
    mutationFn: () => api.deleteProject(projeto.id),
    onSuccess: () => {
      invalidate();
      toast.ok('Excluí o projeto.');
      setConfirmDel(false);
    },
    onError: (e) =>
      toast.erro(
        e instanceof Error
          ? e.message
          : 'Não consegui excluir. O arquivo pode estar aberto em outro programa.',
      ),
  });

  return (
    <div className="ds-reveal ds-glass-static overflow-hidden rounded-xl">
      <div className="grid grid-cols-1 md:grid-cols-[minmax(0,340px)_1fr]">
        {/* Prévia da versão mais recente. */}
        {maisRecente && (
          <button
            type="button"
            onClick={() =>
              window.open(siteUrl(projeto.id, maisRecente.timestamp), '_blank', 'noopener')
            }
            className="group block border-b md:border-r md:border-b-0"
            style={{ borderColor: 'var(--color-border)' }}
            aria-label={`Abrir ${projeto.name} em nova aba`}
          >
            <PreviewFrame
              src={siteUrl(projeto.id, maisRecente.timestamp)}
              title={projeto.name}
              aspect={16 / 10}
            />
          </button>
        )}

        <div className="flex flex-col p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div
                className="truncate text-[17px] font-medium"
                style={{ color: 'var(--color-fg)' }}
              >
                {projeto.name}
              </div>
              <div className="mt-1 text-[12px]" style={{ color: 'var(--color-fg-subtle)' }}>
                {conta(projeto.versoes.length, 'versão', 'versões')}
              </div>
            </div>
          </div>

          {maisRecente && (
            <div
              className="mt-3 flex items-center gap-3 text-[11px]"
              style={{ color: 'var(--color-fg-muted)' }}
            >
              <Package size={12} style={{ color: 'var(--color-signal)' }} />
              <span>Mais recente · {formatarData(maisRecente.timestamp)}</span>
              <span style={{ color: 'var(--color-fg-subtle)' }}>
                {formatarBytes(maisRecente.bytes)}
              </span>
            </div>
          )}

          <div className="mt-4 flex flex-wrap items-center gap-2">
            {maisRecente && (
              <a
                href={siteUrl(projeto.id, maisRecente.timestamp)}
                target="_blank"
                rel="noopener noreferrer"
                className="ds-btn ds-glow-border ds-backdrop flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[12px]"
                style={{ backgroundColor: 'rgba(255,255,255,0.04)', color: 'var(--color-fg)' }}
              >
                <ExternalLink size={12} />
                Ver site
              </a>
            )}
            {maisRecente && (
              <a
                href={downloadUrl(projeto.id, maisRecente.timestamp)}
                className="ds-btn ds-glow flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[12px] font-medium"
                style={{ backgroundColor: 'var(--color-primary)', color: 'var(--color-bone-1)' }}
              >
                <Download size={12} />
                Baixar .zip
              </a>
            )}
            <button
              type="button"
              onClick={() => navigate(`/projects?edit=${projeto.id}`)}
              className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] transition-colors hover:text-[var(--color-fg)]"
              style={{ color: 'var(--color-fg-muted)' }}
            >
              <Pencil size={12} />
              Editar
            </button>
            <button
              type="button"
              onClick={() => abrirPasta.mutate()}
              className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] transition-colors hover:text-[var(--color-fg)]"
              style={{ color: 'var(--color-fg-muted)' }}
            >
              <FolderOpen size={12} />
              Ver arquivos
            </button>
            <div className="ml-auto flex items-center gap-1">
              <button
                type="button"
                onClick={() => duplicar.mutate()}
                disabled={duplicar.isPending}
                title="Duplicar"
                className="rounded-full p-1.5 transition-all hover:scale-110 hover:bg-white/[0.06]"
                style={{ color: 'var(--color-fg-muted)' }}
              >
                {duplicar.isPending ? <Mascote tamanho={13} girando /> : <Copy size={13} />}
              </button>
              <button
                type="button"
                onClick={() => setConfirmDel(true)}
                title="Excluir"
                className="rounded-full p-1.5 transition-all hover:scale-110 hover:bg-[rgba(239,68,68,0.16)]"
                style={{ color: 'var(--color-ion-3)' }}
              >
                <Trash2 size={13} />
              </button>
            </div>
          </div>

          {anteriores.length > 0 && (
            <div
              className="mt-4 space-y-1.5 border-t pt-3"
              style={{ borderColor: 'var(--color-border)' }}
            >
              {anteriores.map((versao) => (
                <div
                  key={versao.timestamp}
                  className="flex items-center justify-between rounded-md px-2 py-1.5 text-[11px]"
                  style={{ backgroundColor: 'rgba(255,255,255,0.03)' }}
                >
                  <span style={{ color: 'var(--color-fg-muted)' }}>
                    {formatarData(versao.timestamp)}
                  </span>
                  <div className="flex items-center gap-3">
                    <span style={{ color: 'var(--color-fg-subtle)' }}>
                      {formatarBytes(versao.bytes)}
                    </span>
                    <a
                      href={siteUrl(projeto.id, versao.timestamp)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="opacity-50 transition-opacity hover:opacity-100"
                      title="Abrir esta versão"
                    >
                      <ExternalLink size={12} />
                    </a>
                    <a
                      href={downloadUrl(projeto.id, versao.timestamp)}
                      className="opacity-50 transition-opacity hover:opacity-100"
                      title="Baixar esta versão"
                    >
                      <Download size={12} />
                    </a>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <ConfirmPop
        open={confirmDel}
        title={`Apagar "${projeto.name}"?`}
        busy={excluir.isPending}
        confirmLabel="Apagar projeto"
        onConfirm={() => excluir.mutate()}
        onClose={() => setConfirmDel(false)}
        description="Apago junto todos os sites gerados dele. Não dá para desfazer."
      />
    </div>
  );
}

function VazioState({ carregando }: { carregando: boolean }) {
  return (
    <div className="ds-glass-static ds-slide-up ds-d3 mt-10 rounded-xl p-10 text-center">
      <Mascote
        tamanho={96}
        esmaecido
        pulsando={carregando}
        alt={
          carregando
            ? 'O núcleo do sistema, pulsando: procurando os sites prontos'
            : 'O núcleo do sistema, apagado: nenhum site pronto ainda'
        }
        className="mx-auto"
      />
      <div className="mt-5 text-[14px]" style={{ color: 'var(--color-fg-muted)' }}>
        {carregando ? TRABALHANDO.carregandoSites : VAZIO.sites.titulo}
      </div>
      {!carregando && (
        <div className="mt-2 text-[12px]" style={{ color: 'var(--color-fg-subtle)' }}>
          Comece em <span className="ds-data">Gerar site</span>, a partir de um kit.{' '}
          {VAZIO.sites.corpo}
        </div>
      )}
    </div>
  );
}
