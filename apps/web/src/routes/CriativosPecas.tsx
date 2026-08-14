import { Mascote } from '@/components/Mascote';
import { type PecaCriativa, api, arquivoCriativoUrl } from '@/lib/api';
import { ROTULO_DO_FORMATO } from '@/routes/criativos/partes';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, Download, Sparkles } from 'lucide-react';

/**
 * As PEÇAS produzidas — o fim da linha da frente Criativos.
 *
 * ## Por que ela existe
 *
 * A frente tinha os dois começos (a tela dos quatro passos e o Expresso) e
 * nenhum fim: quem pedia uma peça enfileirava e nunca mais a via. O resultado
 * ficava em `criativos/<job>/resultado.json`, ao lado dos arquivos, sem tela
 * que o lesse.
 *
 * ## O que ela mostra, e o que ela recusa a mostrar
 *
 * Variação aprovada ganha prévia e botão de baixar. Variação reprovada ou que
 * falhou aparece com o MOTIVO por escrito, e sem botão — é a regra do contrato
 * do pedido: peça que não passou na verificação não vira download silencioso.
 * Escondê-la seria pior: quem pagou por quatro variações e recebeu três
 * precisa saber o que houve com a quarta.
 *
 * O custo gasto aparece junto porque a contabilidade é parte do contrato: quem
 * pediu com teto tem direito de ver quanto foi de verdade.
 */
export function CriativosPecasPage() {
  const pecas = useQuery({
    queryKey: ['pecas-criativas'],
    queryFn: api.listPecasCriativas,
    // O Orbis produz fora do navegador; sem recarregar sozinho, a tela ficaria
    // dizendo "em produção" muito depois de a peça estar pronta.
    refetchInterval: 15_000,
  });
  const items = pecas.data?.items ?? [];

  return (
    <div className="mx-auto max-w-[1080px] px-4 sm:px-8 py-8 sm:py-12">
      <div
        className="ds-slide-up text-[10px] uppercase tracking-[0.28em]"
        style={{ color: 'rgb(var(--acento))', fontFamily: 'var(--font-display)' }}
      >
        Minhas peças
      </div>
      <h1
        className="ds-slide-up ds-d1 ds-text-glow mt-2 text-[24px] sm:text-[36px] font-medium tracking-tight"
        style={{ color: 'var(--color-fg)', fontFamily: 'var(--font-display)' }}
      >
        O que eu produzi para a sua marca.
      </h1>
      <p
        className="ds-slide-up ds-d2 mt-3 max-w-[62ch] text-[14px] leading-[1.6]"
        style={{ color: 'var(--color-fg-muted)' }}
      >
        Cada pedido vira um lote de variações. As aprovadas você baixa aqui; as que não passaram na
        verificação ficam com o motivo à vista, porque peça reprovada não vira download calado.
      </p>

      {pecas.isPending && (
        <div
          className="mt-10 flex items-center gap-2 text-[13px]"
          style={{ color: 'var(--color-fg-muted)' }}
        >
          <Mascote tamanho={14} girando />
          Procurando o que já ficou pronto.
        </div>
      )}

      {!pecas.isPending && items.length === 0 && (
        <div
          className="ds-glass-static mt-10 rounded-xl px-6 py-10 text-center"
          style={{ color: 'var(--color-fg-muted)' }}
        >
          <Sparkles size={20} className="mx-auto mb-3" style={{ color: 'rgb(var(--acento))' }} />
          <p className="text-[14px]">Nenhuma peça pedida ainda.</p>
          <p className="mt-1 text-[12.5px]" style={{ color: 'var(--color-fg-subtle)' }}>
            Comece por "Nova peça" ou pelo Expresso, aqui em cima.
          </p>
        </div>
      )}

      <div className="mt-10 space-y-5">
        {items.map((peca) => (
          <CartaoDaPeca key={peca.id} peca={peca} />
        ))}
      </div>
    </div>
  );
}

/** O estado do pedido em palavras de gente, não em nome de campo. */
const FRASE_DO_ESTADO: Record<PecaCriativa['status'], string> = {
  pendente: 'na fila, esperando o Orbis',
  concluido: 'pronto',
  erro: 'parou no meio',
  cancelado: 'cancelado',
};

function CartaoDaPeca({ peca }: { peca: PecaCriativa }) {
  const emProducao = peca.status === 'pendente';
  return (
    <div className="ds-glass-static overflow-hidden rounded-xl">
      <div
        className="flex flex-wrap items-baseline justify-between gap-3 border-b px-5 py-4"
        style={{ borderColor: 'var(--color-border)' }}
      >
        <div className="min-w-0">
          <div className="truncate text-[16px] font-medium" style={{ color: 'var(--color-fg)' }}>
            {peca.pedido.marca}
          </div>
          <div className="mt-1 text-[12px]" style={{ color: 'var(--color-fg-subtle)' }}>
            {[
              peca.pedido.tipo === 'video' ? 'vídeo' : 'imagem',
              // O formato vem do payload como string: se um pedido antigo
              // trouxer um nome que a tabela não conhece, mostra-se o nome cru
              // em vez de quebrar a linha inteira.
              peca.pedido.formato === null
                ? null
                : ((ROTULO_DO_FORMATO as Record<string, string>)[peca.pedido.formato] ??
                  peca.pedido.formato),
              FRASE_DO_ESTADO[peca.status],
            ]
              .filter(Boolean)
              .join(' · ')}
          </div>
        </div>
        <div className="text-right text-[12px]" style={{ color: 'var(--color-fg-muted)' }}>
          {peca.variacoes.length > 0 && (
            <div>
              {peca.aprovadas} de {peca.variacoes.length} aprovadas
            </div>
          )}
          {peca.custoGasto !== null && (
            <div style={{ color: 'var(--color-fg-subtle)' }}>
              {peca.custoGasto} crédito{peca.custoGasto === 1 ? '' : 's'} gastos
            </div>
          )}
        </div>
      </div>

      {emProducao && peca.variacoes.length === 0 ? (
        <div
          className="flex items-center gap-2 px-5 py-6 text-[13px]"
          style={{ color: 'var(--color-fg-muted)' }}
        >
          <Mascote tamanho={13} girando />
          Ainda não comecei esta. Ela entra quando você mandar processar a fila.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 p-5 sm:grid-cols-2 lg:grid-cols-3">
          {peca.variacoes.map((v, i) => (
            <Variacao
              key={v.caminho ?? `${peca.id}-${i}`}
              jobId={peca.id}
              indice={i + 1}
              variacao={v}
              ehVideo={peca.pedido.tipo === 'video'}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function Variacao({
  jobId,
  indice,
  variacao,
  ehVideo,
}: {
  jobId: string;
  indice: number;
  variacao: PecaCriativa['variacoes'][number];
  ehVideo: boolean;
}) {
  const aprovada = variacao.estado === 'aprovada' && variacao.caminho !== null;
  const url = aprovada ? arquivoCriativoUrl(jobId, variacao.caminho ?? '') : null;

  return (
    <div className="border" style={{ borderColor: 'var(--color-border)' }}>
      <div
        className="flex aspect-square items-center justify-center overflow-hidden"
        style={{ backgroundColor: 'rgba(255,255,255,0.03)' }}
      >
        {url === null ? (
          <AlertTriangle size={22} style={{ color: 'var(--color-fg-subtle)' }} />
        ) : ehVideo ? (
          // Sem `autoplay`: prévia que toca sozinha numa grade de seis vira
          // barulho e consumo, e ninguém pediu para assistir.
          <video src={url} controls muted playsInline className="h-full w-full object-cover">
            <track kind="captions" />
          </video>
        ) : (
          <img
            src={url}
            alt={`Variação ${indice}`}
            className="h-full w-full object-cover"
            loading="lazy"
          />
        )}
      </div>
      <div className="px-3 py-2.5">
        <div
          className="flex items-center justify-between gap-2 text-[11px]"
          style={{ color: 'var(--color-fg-subtle)' }}
        >
          <span>Variação {indice}</span>
          {url !== null && (
            <a
              href={url}
              download
              className="flex items-center gap-1.5 text-[11px] transition-colors hover:text-[var(--color-fg)]"
              style={{ color: 'rgb(var(--acento))' }}
            >
              <Download size={11} />
              Baixar
            </a>
          )}
        </div>
        {variacao.motivo !== null && (
          <p
            className="mt-1.5 text-[11.5px] leading-snug"
            style={{ color: 'var(--color-fg-muted)' }}
          >
            {variacao.estado === 'falhou' ? 'Não saiu: ' : 'Reprovada: '}
            {variacao.motivo}
          </p>
        )}
      </div>
    </div>
  );
}
