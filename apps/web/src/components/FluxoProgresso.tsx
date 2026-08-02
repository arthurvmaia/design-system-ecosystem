import { Check } from 'lucide-react';
import { Mascote } from './Mascote';

/**
 * Progresso em linguagem de gente.
 *
 * O número cru ("0%", "95%") não conta a história e, como o reporte é grosso
 * (pula 15 → 35 → 90), a barra fica parada por minutos e parece travada. Aqui
 * traduzimos o percentual em ETAPAS nomeadas — "Extraindo o visual…", "Montando
 * a captura…" — com um círculo de loading que está sempre em movimento,
 * para deixar claro que há trabalho acontecendo mesmo entre um salto e outro.
 */

type Etapa = { curto: string; titulo: string; sub: string; ate: number };

/** Cada tipo de trabalho tem seu próprio roteiro. `ate` = percentual em que a etapa termina. */
const FLUXOS: Record<string, Etapa[]> = {
  extract: [
    { curto: 'Abrir', titulo: 'Abrindo o site', sub: 'Entendendo o layout da página', ate: 15 },
    {
      curto: 'Visual',
      titulo: 'Extraindo o visual',
      sub: 'Capturando cores, fontes e estilos',
      ate: 35,
    },
    {
      curto: 'Animações',
      titulo: 'Capturando as animações',
      sub: 'Os movimentos e as interações',
      ate: 50,
    },
    {
      curto: 'Ícones',
      titulo: 'Separando ícones e imagens',
      sub: 'Os elementos gráficos do site',
      ate: 65,
    },
    {
      curto: 'Montar',
      titulo: 'Montando a captura',
      sub: 'Juntando tudo num lugar só',
      ate: 95,
    },
    {
      curto: 'Organizar',
      titulo: 'Organizando as peças',
      sub: 'Deixando pronto para você curar',
      ate: 100,
    },
  ],
  classify: [
    { curto: 'Ler', titulo: 'Lendo as peças', sub: 'Olhando cada peça encontrada', ate: 40 },
    {
      curto: 'Nomear',
      titulo: 'Dando nome a cada peça',
      sub: 'Identificando o que é cada uma',
      ate: 80,
    },
    { curto: 'Organizar', titulo: 'Organizando por tipo', sub: 'Botões, cards, seções…', ate: 100 },
  ],
  generate: [
    {
      curto: 'Planejar',
      titulo: 'Planejando o site',
      sub: 'Escolhendo a estrutura das seções',
      ate: 25,
    },
    { curto: 'Marca', titulo: 'Aplicando a sua marca', sub: 'Cores, fontes e logo', ate: 50 },
    { curto: 'Texto', titulo: 'Escrevendo os textos', sub: 'Com o seu conteúdo', ate: 70 },
    {
      curto: 'Montar',
      titulo: 'Montando as páginas',
      sub: 'Juntando as peças do kit',
      ate: 95,
    },
    { curto: 'Finalizar', titulo: 'Finalizando', sub: 'Últimos ajustes', ate: 100 },
  ],
};

const PADRAO: Etapa[] = [
  { curto: 'Início', titulo: 'Começando', sub: 'Preparando o trabalho', ate: 33 },
  { curto: 'Trabalho', titulo: 'Processando', sub: 'Fazendo o trabalho', ate: 80 },
  { curto: 'Final', titulo: 'Finalizando', sub: 'Quase lá', ate: 100 },
];

export function FluxoProgresso({
  percentual,
  tipo,
  total,
}: {
  percentual: number;
  tipo: string;
  total: number;
}) {
  const etapas = FLUXOS[tipo] ?? PADRAO;
  const pct = Math.max(0, Math.min(100, percentual));

  // A etapa em andamento é a primeira cujo teto ainda não foi alcançado.
  const idx = etapas.findIndex((e) => pct < e.ate);
  const concluido = idx === -1;
  const atual = concluido ? etapas.length - 1 : idx;
  const etapaAtual = etapas[atual] ?? etapas[etapas.length - 1] ?? PADRAO[0];

  return (
    <div className="mt-4">
      <div className="flex items-center gap-4">
        <AnelLoading pct={pct} concluido={concluido} />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <div
              className="truncate text-[15px] font-medium"
              style={{ color: 'var(--color-fg)', fontFamily: 'var(--font-display)' }}
            >
              {concluido ? 'Tudo pronto!' : `${etapaAtual?.titulo}…`}
            </div>
            <span
              className="ds-data shrink-0 text-[10px] uppercase tracking-[0.14em]"
              style={{ color: 'var(--color-fg-subtle)' }}
            >
              {total > 1 && `${total} itens · `}
              {concluido ? 'concluído' : `etapa ${atual + 1} de ${etapas.length}`}
            </span>
          </div>
          <div className="mt-0.5 truncate text-[12px]" style={{ color: 'var(--color-fg-muted)' }}>
            {concluido ? 'Pronto! Já pode conferir o resultado.' : etapaAtual?.sub}
          </div>
        </div>
      </div>

      {/* Trilha de etapas: círculos ligados por uma linha que enche até a atual. */}
      <div className="mt-5 flex items-start">
        {etapas.map((etapa, i) => {
          const feito = concluido || i < atual;
          const emAndamento = !concluido && i === atual;
          return (
            <div key={etapa.curto} className="flex flex-1 flex-col items-center">
              <div className="flex w-full items-center">
                {/* linha à esquerda (some no primeiro) */}
                <Linha ativa={i <= atual || concluido} invisivel={i === 0} />
                <Bolinha feito={feito} emAndamento={emAndamento} />
                {/* linha à direita (some no último) */}
                <Linha ativa={i < atual || concluido} invisivel={i === etapas.length - 1} />
              </div>
              <span
                className="mt-1.5 text-center text-[9px] uppercase tracking-[0.08em]"
                style={{
                  color: emAndamento
                    ? 'var(--color-fg)'
                    : feito
                      ? 'var(--color-fg-muted)'
                      : 'var(--color-fg-subtle)',
                  fontFamily: 'var(--font-display)',
                }}
              >
                {etapa.curto}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Anel circular: o preenchimento mostra o quanto já andou; o arco girando mostra que está vivo. */
function AnelLoading({ pct, concluido }: { pct: number; concluido: boolean }) {
  const r = 24;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative h-[60px] w-[60px] shrink-0">
      <svg width="60" height="60" viewBox="0 0 60 60" aria-hidden>
        <title>progresso</title>
        <circle cx="30" cy="30" r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="4" />
        <circle
          cx="30"
          cy="30"
          r={r}
          fill="none"
          stroke="var(--color-primary)"
          strokeWidth="4"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - pct / 100)}
          transform="rotate(-90 30 30)"
          style={{ transition: 'stroke-dashoffset 0.8s ease' }}
        />
      </svg>
      {/* Arco fino girando por cima — o sinal de "trabalhando" que nunca para. */}
      {!concluido && (
        <svg
          width="60"
          height="60"
          viewBox="0 0 60 60"
          className="absolute inset-0 animate-spin"
          style={{ animationDuration: '1.6s' }}
          aria-hidden
        >
          <title>carregando</title>
          <circle
            cx="30"
            cy="30"
            r={r}
            fill="none"
            stroke="var(--color-signal)"
            strokeWidth="2"
            strokeLinecap="round"
            strokeDasharray={`${c * 0.18} ${c}`}
          />
        </svg>
      )}
      {/* O núcleo dentro do anel: é a cara de "estou pensando". Fica ATRÁS do
          número, apagado, porque quem precisa ler ali é o percentual — o mascote
          está dizendo que há alguém trabalhando, não quanto falta. */}
      {!concluido && (
        <div className="absolute inset-0 flex items-center justify-center">
          <Mascote tamanho={38} esmaecido />
        </div>
      )}
      <div className="absolute inset-0 flex items-center justify-center">
        {concluido ? (
          <Check size={20} style={{ color: 'var(--color-signal)' }} />
        ) : (
          <span
            className="ds-data text-[13px] font-medium"
            style={{
              color: 'var(--color-fg)',
              fontFamily: 'var(--font-display)',
              textShadow: '0 0 8px rgb(0 0 0 / 0.9)',
            }}
          >
            {Math.round(pct)}
            <span className="text-[9px]" style={{ color: 'var(--color-fg-subtle)' }}>
              %
            </span>
          </span>
        )}
      </div>
    </div>
  );
}

function Bolinha({ feito, emAndamento }: { feito: boolean; emAndamento: boolean }) {
  return (
    <div className="relative flex h-5 w-5 shrink-0 items-center justify-center">
      {emAndamento && (
        <span
          className="absolute inset-0 animate-ping rounded-full"
          style={{ backgroundColor: 'var(--color-ion-5)', opacity: 0.35 }}
        />
      )}
      <div
        className="relative flex h-5 w-5 items-center justify-center rounded-full border transition-colors duration-500"
        style={{
          backgroundColor: feito
            ? 'var(--color-primary)'
            : emAndamento
              ? 'var(--color-ion-8)'
              : 'transparent',
          borderColor: feito || emAndamento ? 'var(--color-ion-4)' : 'var(--color-border-strong)',
        }}
      >
        {feito ? (
          <Check size={11} style={{ color: 'var(--color-bone-1)' }} />
        ) : emAndamento ? (
          <span
            className="h-1.5 w-1.5 rounded-full"
            style={{ backgroundColor: 'var(--color-signal)' }}
          />
        ) : null}
      </div>
    </div>
  );
}

function Linha({ ativa, invisivel }: { ativa: boolean; invisivel: boolean }) {
  return (
    <div
      className="h-[2px] flex-1 rounded-none transition-colors duration-500"
      style={{
        backgroundColor: invisivel
          ? 'transparent'
          : ativa
            ? 'var(--color-ion-6)'
            : 'var(--color-border-strong)',
      }}
    />
  );
}
