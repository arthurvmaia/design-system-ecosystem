import { PreviewFrame } from '@/components/PreviewFrame';
import { type RejectedSegment, api, previewRejeitadoUrl } from '@/lib/api';
import { useReveal } from '@/lib/use-reveal';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, Info } from 'lucide-react';

const CAT_LABEL: Record<string, string> = {
  hero: 'Hero',
  header: 'Cabeçalho',
  nav: 'Navegação',
  footer: 'Rodapé',
  card: 'Cards',
  feature: 'Features',
  pricing: 'Preços',
  testimonial: 'Depoimentos',
  faq: 'FAQ',
  cta: 'CTA',
  form: 'Forms',
  button: 'Botões',
  other: 'Não identificado',
};

/**
 * Revisão.
 *
 * O outro lado da Galeria: o que o algoritmo NÃO teve confiança para interpretar
 * e por isso deixou de fora. Não some — fica aqui, com o motivo, para a pessoa
 * olhar. Site novo e fora do padrão cai mais aqui, e isso é o esperado.
 */
export function RevisaoPage() {
  const rej = useQuery({ queryKey: ['rejeitados'], queryFn: api.listRejeitados });
  const grupos = rej.data?.grupos ?? [];
  const total = rej.data?.total ?? 0;
  useReveal([total]);

  return (
    <div className="mx-auto max-w-[1080px] px-8 py-12">
      <div
        className="ds-slide-up text-[10px] uppercase tracking-[0.28em]"
        style={{ color: 'var(--color-primary)', fontFamily: 'var(--font-display)' }}
      >
        Pendências · área de exceções
      </div>
      <h1
        className="ds-slide-up ds-d1 ds-text-glow mt-2 text-[36px] font-medium tracking-tight"
        style={{ color: 'var(--color-fg)', fontFamily: 'var(--font-display)' }}
      >
        O que o algoritmo não entendeu.
      </h1>
      <p
        className="ds-slide-up ds-d2 mt-3 max-w-[64ch] text-[14px] leading-[1.6]"
        style={{ color: 'var(--color-fg-muted)' }}
      >
        A Galeria recebe só o que foi bem interpretado. Estes blocos ficaram de fora — cada um com o
        motivo. É normal um site mais novo ou fora do padrão cair aqui; use esta tela para conferir
        se algo bom foi barrado por engano.
      </p>

      {total === 0 ? (
        <div className="ds-glass-static ds-slide-up ds-d3 mt-10 rounded-xl p-10 text-center">
          <CheckCircle2 size={22} className="mx-auto" style={{ color: 'var(--color-primary)' }} />
          <div className="mt-4 text-[14px]" style={{ color: 'var(--color-fg-muted)' }}>
            {rej.isPending ? 'Carregando...' : 'Nada para revisar.'}
          </div>
          {!rej.isPending && (
            <div className="mt-2 text-[12px]" style={{ color: 'var(--color-fg-subtle)' }}>
              Tudo que foi extraído até agora o algoritmo conseguiu interpretar e mandou para a
              Galeria.
            </div>
          )}
        </div>
      ) : (
        <div className="mt-10 space-y-10">
          {grupos.map((grupo) => (
            <div key={grupo.designSystemId}>
              <div className="mb-4 flex items-center gap-2">
                <AlertTriangle size={14} style={{ color: 'var(--color-signal)' }} />
                <span className="text-[14px] font-medium" style={{ color: 'var(--color-fg)' }}>
                  {grupo.designSystemName}
                </span>
                <span
                  className="ds-data rounded-full px-2 py-0.5 text-[10px]"
                  style={{
                    backgroundColor: 'var(--color-crimson-8)',
                    color: 'var(--color-bone-1)',
                  }}
                >
                  {grupo.itens.length}
                </span>
              </div>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                {grupo.itens.map((item, i) => (
                  <CardRejeitado key={item.id} dsId={grupo.designSystemId} item={item} index={i} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function CardRejeitado({
  dsId,
  item,
  index,
}: {
  dsId: string;
  item: RejectedSegment;
  index: number;
}) {
  const delay = index < 6 ? `ds-d${index + 1}` : '';
  return (
    <div className={`ds-scale-in ${delay} ds-glass-static overflow-hidden rounded-xl`}>
      <div className="opacity-70">
        <PreviewFrame src={previewRejeitadoUrl(dsId, item.id)} title={item.name} aspect={16 / 10} />
      </div>
      <div className="p-3.5">
        <div
          className="truncate text-[13px] font-medium"
          style={{ color: 'var(--color-fg)', fontFamily: 'var(--font-body)' }}
        >
          {item.name}
        </div>
        <div className="ds-data mt-0.5 text-[10px]" style={{ color: 'var(--color-fg-subtle)' }}>
          {CAT_LABEL[item.category] ?? 'Outros'}
        </div>
        <div
          className="mt-2.5 space-y-1.5 border-t pt-2.5"
          style={{ borderColor: 'var(--color-border)' }}
        >
          {item.motivos.map((motivo) => (
            <div key={motivo} className="flex items-start gap-1.5 text-[11px] leading-snug">
              <Info size={11} className="mt-px shrink-0" style={{ color: 'var(--color-signal)' }} />
              <span style={{ color: 'var(--color-fg-muted)' }}>{motivo}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
