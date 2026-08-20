import { ConfirmarAcaoCara } from '@/components/ConfirmarAcaoCara';
import { Mascote } from '@/components/Mascote';
import { type PecaCriativa, api, arquivoCriativoUrl } from '@/lib/api';
import { useExigeCredencialDeAcao } from '@/lib/sessao';
import { toast } from '@/lib/toast';
import { ROTULO_DO_FORMATO } from '@/routes/criativos/partes';
// Do subcaminho, e não da raiz: `@ds/shared` puxa `node:fs` por outros
// módulos, e a tela não roda em Node. A régua em si é aritmética pura.
import { ressalvasDaConferencia, rotuloDaConferencia } from '@ds/shared/regras-de-aceite-criativo';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Download, Sparkles, Trash2 } from 'lucide-react';
import { useState } from 'react';

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
  /**
   * As MARCAS entram na mesma tela das peças, e acima delas.
   *
   * Elas não são peça — não têm formato de canal e não vencem —, mas é aqui que
   * quem pediu vem procurar o que produziu. Uma segunda tela só para marca
   * faria a pessoa lembrar em qual das duas ela pediu cada coisa.
   */
  const marcas = useQuery({
    queryKey: ['marcas'],
    queryFn: api.listMarcas,
    refetchInterval: 15_000,
  });
  const items = pecas.data?.items ?? [];
  const itensDeMarca = marcas.data?.items ?? [];
  const excluirMarca = useExcluir('marca');

  return (
    <div className="mx-auto max-w-[1080px] px-4 sm:px-8 py-8 sm:py-12">
      {itensDeMarca.length > 0 && (
        <section className="mb-10">
          <h2
            className="text-[10px] uppercase tracking-[0.28em]"
            style={{ color: 'rgb(var(--acento))', fontFamily: 'var(--font-display)' }}
          >
            Marcas
          </h2>
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
            {itensDeMarca.map((m) => (
              <div key={m.id} className="ds-glass-static rounded-xl px-5 py-4">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="text-[16px] font-medium" style={{ color: 'var(--color-fg)' }}>
                    {m.nome}
                  </span>
                  <span className="flex items-center gap-2">
                    <span className="text-[12px]" style={{ color: 'var(--color-fg-muted)' }}>
                      {m.status === 'pendente' ? 'na fila, esperando o Orbis' : m.rotulo}
                    </span>
                    <BotaoExcluir
                      oQue={`a marca ${m.nome}`}
                      onClick={() => excluirMarca.pedirParaExcluir(m.id, m.nome)}
                    />
                  </span>
                </div>
                {m.oQueFaz !== '' && (
                  <p
                    className="mt-1 truncate text-[12.5px]"
                    style={{ color: 'var(--color-fg-subtle)' }}
                  >
                    {m.oQueFaz}
                  </p>
                )}
                <p className="mt-2 text-[11.5px]" style={{ color: 'var(--color-fg-muted)' }}>
                  {/* Marca sem apresentação não é marca pronta, e a tela diz. */}
                  {m.temApresentacao
                    ? 'Com apresentação em PDF.'
                    : m.status === 'pendente'
                      ? 'A apresentação sai junto com as artes.'
                      : 'Ainda sem apresentação: a marca não está pronta para entregar.'}
                  {m.custoGasto !== null && m.custoGasto > 0
                    ? ` ${m.custoGasto} crédito${m.custoGasto === 1 ? '' : 's'} gastos.`
                    : ''}
                </p>
              </div>
            ))}
          </div>
        </section>
      )}
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

      <ConfirmarAcaoCara
        aberto={excluirMarca.aberto}
        oQueVaiFazer={excluirMarca.oQueVaiFazer}
        ocupado={excluirMarca.ocupado}
        erro={excluirMarca.erro}
        exigeCredencial={excluirMarca.exigeCredencial}
        pergunta="Confirma que é para apagar?"
        aoConfirmar={excluirMarca.confirmar}
        aoFechar={excluirMarca.fechar}
      />
    </div>
  );
}

/**
 * A EXCLUSÃO, e por que ela mora num gancho e não em cada cartão.
 *
 * Marca e peça se apagam do mesmo jeito — confirmar, mandar, recarregar a lista
 * — e só muda a rota. Dois blocos iguais divergiriam no primeiro conserto, e a
 * divergência apareceria como "a marca pede confirmação e a peça não".
 *
 * Ela passa pelo MESMO diálogo das ações que custam. Não porque apagar custe
 * crédito, mas porque é irreversível: leva o pixel pago, o razão e a folha de
 * conferência junto. O atrito aqui é o ponto.
 */
const useExcluir = (
  qual: 'peca' | 'marca',
): {
  aberto: boolean;
  ocupado: boolean;
  erro: string | null;
  exigeCredencial: boolean;
  pedirParaExcluir: (jobId: string, nome: string) => void;
  confirmar: (credencial: string) => void;
  fechar: () => void;
  oQueVaiFazer: string;
} => {
  const qc = useQueryClient();
  const exigeCredencial = useExigeCredencialDeAcao();
  const [alvo, setAlvo] = useState<{ jobId: string; nome: string } | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const excluir = useMutation({
    mutationFn: ({ jobId, credencial }: { jobId: string; credencial: string }) =>
      qual === 'peca'
        ? api.excluirPecaCriativa(jobId, credencial)
        : api.excluirMarca(jobId, credencial),
    onSuccess: () => {
      toast.ok(`${alvo?.nome ?? 'O pedido'} foi apagado, senhor.`);
      setAlvo(null);
      setErro(null);
      void qc.invalidateQueries({ queryKey: qual === 'peca' ? ['pecas-criativas'] : ['marcas'] });
    },
    onError: (e: unknown) => {
      // A mensagem do servidor VENCE a genérica: é ela que explica o 409 ("ainda
      // está na fila") e o 428 ("a credencial não bateu"), e trocá-la por
      // "não foi possível excluir" apagaria a única instrução útil.
      setErro(e instanceof Error ? e.message : 'Não consegui apagar.');
    },
  });

  return {
    aberto: alvo !== null,
    ocupado: excluir.isPending,
    erro,
    exigeCredencial,
    pedirParaExcluir: (jobId, nome) => {
      setErro(null);
      setAlvo({ jobId, nome });
    },
    confirmar: (credencial) => {
      if (alvo === null) return;
      excluir.mutate({ jobId: alvo.jobId, credencial });
    },
    fechar: () => {
      setAlvo(null);
      setErro(null);
    },
    oQueVaiFazer:
      alvo === null
        ? ''
        : `Apagar "${alvo.nome}" e todos os arquivos dela: as variações, a folha de conferência e o razão. Não tem volta.`,
  };
};

/** O botão, igual nos dois cartões. */
function BotaoExcluir({ onClick, oQue }: { onClick: () => void; oQue: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={`Apagar ${oQue}`}
      aria-label={`Apagar ${oQue}`}
      className="shrink-0 rounded-none border p-1.5 transition-colors hover:border-[var(--color-danger)]"
      style={{ borderColor: 'var(--color-border)', color: 'var(--color-fg-subtle)' }}
    >
      <Trash2 size={14} strokeWidth={1.6} />
    </button>
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
  const excluir = useExcluir('peca');
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
              {peca.comRessalva > 0 && (
                // A ressalva entra no MESMO lugar do número, e não numa nota de
                // rodapé: "3 de 3 aprovadas" era exatamente a frase que sumia
                // com a pendência que a régua tinha nomeado.
                <span style={{ color: 'var(--color-fg-subtle)' }}>
                  {' '}
                  ({peca.comRessalva} com ressalva)
                </span>
              )}
            </div>
          )}
          {peca.custoGasto !== null && (
            <div style={{ color: 'var(--color-fg-subtle)' }}>
              {peca.custoGasto} crédito{peca.custoGasto === 1 ? '' : 's'} gastos
            </div>
          )}
        </div>
        <BotaoExcluir
          oQue={`a peça de ${peca.pedido.marca}`}
          onClick={() => excluir.pedirParaExcluir(peca.id, `a peça de ${peca.pedido.marca}`)}
        />
      </div>

      <ConfirmarAcaoCara
        aberto={excluir.aberto}
        oQueVaiFazer={excluir.oQueVaiFazer}
        ocupado={excluir.ocupado}
        erro={excluir.erro}
        exigeCredencial={excluir.exigeCredencial}
        pergunta="Confirma que é para apagar?"
        aoConfirmar={excluir.confirmar}
        aoFechar={excluir.fechar}
      />

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
  // O rótulo é DERIVADO da folha, não do `estado` gravado: o estado tem três
  // palavras e a régua tem quatro respostas. Uma peça sem folha não é uma peça
  // aprovada — é uma peça que ninguém mediu, e a tela diz isso.
  const rotulo = rotuloDaConferencia(variacao.conferencia);
  const ressalvas = ressalvasDaConferencia(variacao.conferencia);

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
        {rotulo === 'aprovada com ressalva' && (
          <p
            className="mt-1.5 text-[11.5px] leading-snug"
            style={{ color: 'var(--color-fg-muted)' }}
          >
            Aprovada com ressalva:{' '}
            {ressalvas.map((r) => `${r.codigo}, ${r.titulo.toLowerCase()}`).join('; ')}. Baixa, e o
            que ficou por medir vai escrito.
          </p>
        )}
        {rotulo === 'sem folha' && variacao.estado === 'aprovada' && (
          <p
            className="mt-1.5 text-[11.5px] leading-snug"
            style={{ color: 'var(--color-fg-muted)' }}
          >
            Sem folha de conferência: esta peça foi produzida antes da régua, e ninguém mediu se ela
            saiu boa.
          </p>
        )}
      </div>
    </div>
  );
}
