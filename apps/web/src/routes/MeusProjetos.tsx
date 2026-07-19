import { useReveal } from '@/lib/use-reveal';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Download, FolderOpen, Package } from 'lucide-react';

/**
 * O fim da linha do fluxo.
 *
 * Projetos lista tudo que foi pedido, inclusive rascunho que nunca gerou nada.
 * Aqui só entra o que virou arquivo em disco — é a diferença entre "pedi" e
 * "está pronto para baixar".
 */

type Versao = { timestamp: string; arquivos: number; bytes: number };

type ProjetoConcluido = {
  id: string;
  name: string;
  status: string;
  updatedAt: number;
  versoes: Versao[];
};

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
  const projetos = useQuery({
    queryKey: ['meus-projetos'],
    queryFn: async () => {
      const res = await fetch('/api/meus-projetos');
      if (!res.ok) throw new Error('falha ao listar');
      return res.json() as Promise<{ items: ProjetoConcluido[] }>;
    },
  });

  const items = projetos.data?.items ?? [];
  useReveal([items.length]);

  return (
    <div className="mx-auto max-w-[1080px] px-8 py-12">
      <div
        className="ds-slide-up text-[10px] uppercase tracking-[0.28em]"
        style={{ color: 'var(--color-primary)', fontFamily: 'var(--font-display)' }}
      >
        Fase 8 · Entrega
      </div>
      <h1
        className="ds-slide-up ds-d1 ds-text-glow mt-2 text-[36px] font-medium tracking-tight"
        style={{ color: 'var(--color-fg)', fontFamily: 'var(--font-display)' }}
      >
        Meus projetos.
      </h1>
      <p
        className="ds-slide-up ds-d2 mt-3 max-w-[62ch] text-[14px] leading-[1.6]"
        style={{ color: 'var(--color-fg-muted)' }}
      >
        Tudo que já foi gerado e está pronto para sair daqui. Cada versão é um site completo —
        baixe o .zip para subir num host ou mandar para alguém.
      </p>

      {items.length === 0 ? (
        <VazioState carregando={projetos.isPending} />
      ) : (
        <div className="mt-10 space-y-4">
          {items.map((projeto) => (
            <CardProjeto key={projeto.id} projeto={projeto} />
          ))}
        </div>
      )}
    </div>
  );
}

function CardProjeto({ projeto }: { projeto: ProjetoConcluido }) {
  const abrirPasta = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/meus-projetos/${projeto.id}/abrir-pasta`, { method: 'POST' });
      if (!res.ok) throw new Error('falha ao abrir a pasta');
    },
  });

  const maisRecente = projeto.versoes[0];
  const anteriores = projeto.versoes.slice(1);

  return (
    <div className="ds-reveal ds-glass-static rounded-xl p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="text-[17px] font-medium" style={{ color: 'var(--color-fg)' }}>
            {projeto.name}
          </div>
          <div className="ds-data mt-1 text-[11px]" style={{ color: 'var(--color-fg-subtle)' }}>
            {projeto.id} · {projeto.versoes.length}{' '}
            {projeto.versoes.length === 1 ? 'versão' : 'versões'}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={() => abrirPasta.mutate()}
            title="Abrir a pasta no computador"
            className="ds-btn ds-glow-border ds-backdrop flex items-center gap-2 rounded-full px-4 py-2 text-[12px]"
            style={{
              backgroundColor: 'rgba(255, 255, 255, 0.04)',
              color: 'var(--color-fg)',
              fontFamily: 'var(--font-body)',
            }}
          >
            <FolderOpen size={13} />
            Abrir pasta
          </button>

          {maisRecente !== undefined && (
            <a
              href={`/api/meus-projetos/${projeto.id}/download?versao=${encodeURIComponent(maisRecente.timestamp)}`}
              className="ds-btn ds-glow flex items-center gap-2 rounded-full px-4 py-2 text-[12px] font-medium"
              style={{
                backgroundColor: 'var(--color-primary)',
                color: 'var(--color-bone-1)',
                fontFamily: 'var(--font-body)',
              }}
            >
              <Download size={13} />
              Baixar .zip
            </a>
          )}
        </div>
      </div>

      {maisRecente !== undefined && (
        <div
          className="mt-4 flex items-center gap-3 border-t pt-3 text-[11px]"
          style={{ borderColor: 'var(--color-border)', color: 'var(--color-fg-muted)' }}
        >
          <Package size={12} style={{ color: 'var(--color-signal)' }} />
          <span>Mais recente · {formatarData(maisRecente.timestamp)}</span>
          <span className="ds-data" style={{ color: 'var(--color-fg-subtle)' }}>
            {maisRecente.arquivos} arquivos · {formatarBytes(maisRecente.bytes)}
          </span>
        </div>
      )}

      {anteriores.length > 0 && (
        <div className="mt-3 space-y-1.5">
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
                <span className="ds-data" style={{ color: 'var(--color-fg-subtle)' }}>
                  {versao.arquivos} arquivos · {formatarBytes(versao.bytes)}
                </span>
                <a
                  href={`/api/meus-projetos/${projeto.id}/download?versao=${encodeURIComponent(versao.timestamp)}`}
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
  );
}

function VazioState({ carregando }: { carregando: boolean }) {
  return (
    <div className="ds-glass-static ds-slide-up ds-d3 mt-10 rounded-xl p-10 text-center">
      <Package size={22} className="mx-auto" style={{ color: 'var(--color-fg-subtle)' }} />
      <div className="mt-4 text-[14px]" style={{ color: 'var(--color-fg-muted)' }}>
        {carregando ? 'Carregando...' : 'Nenhum projeto gerado ainda.'}
      </div>
      {!carregando && (
        <div className="mt-2 text-[12px]" style={{ color: 'var(--color-fg-subtle)' }}>
          Crie um projeto em <span className="ds-data">Projetos</span> e processe a fila. Quando o
          site for gerado, ele aparece aqui para baixar.
        </div>
      )}
    </div>
  );
}
