import { ConfirmPop } from '@/components/ConfirmPop';
import { Mascote } from '@/components/Mascote';
import { PendenciasDeSites } from '@/components/PendenciasDeSites';
import { PreviewFrame } from '@/components/PreviewFrame';
import { type RejectedSegment, api, previewRejeitadoUrl } from '@/lib/api';
import { TRATAMENTO } from '@/lib/orbis';
import { usePreferencias } from '@/lib/preferencias';
import { toast } from '@/lib/toast';
import { useReveal } from '@/lib/use-reveal';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Info, Sparkles, Trash2 } from 'lucide-react';
import { useState } from 'react';

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
 * Pendências.
 *
 * O outro lado da Galeria: blocos que a leitura automática preferiu não levar
 * adiante. Nada some calado — cada um fica aqui com o motivo, e a DECISÃO é da
 * pessoa: aproveitar mesmo assim (vai para a Galeria) ou descartar de vez.
 */
export function RevisaoPage() {
  const rej = useQuery({ queryKey: ['rejeitados'], queryFn: api.listRejeitados });
  const grupos = rej.data?.grupos ?? [];
  const total = rej.data?.total ?? 0;
  useReveal([total]);

  return (
    <div className="mx-auto max-w-[1080px] px-4 sm:px-8 py-8 sm:py-12">
      <div
        className="ds-slide-up text-[11px] uppercase tracking-[0.28em]"
        style={{ color: 'var(--color-primary)', fontFamily: 'var(--font-display)' }}
      >
        Preciso do seu olhar
      </div>
      <h1
        className="ds-slide-up ds-d1 ds-text-glow mt-2 text-[24px] sm:text-[36px] font-medium tracking-tight"
        style={{ color: 'var(--color-fg)', fontFamily: 'var(--font-display)' }}
      >
        Separei alguns blocos para o {TRATAMENTO} decidir.
      </h1>
      <p
        className="ds-slide-up ds-d2 mt-3 max-w-[64ch] text-[15px] leading-[1.7]"
        style={{ color: 'var(--color-fg-muted)' }}
      >
        Mandei para a Galeria o que li com confiança. Estes eu deixei de fora, cada um com o motivo
        à vista: use aproveitar mesmo assim e o bloco vai para a Galeria, ou descarte e ele sai da
        lista.
      </p>

      {/* Os sites que subiram devendo alguma coisa. Vêm ANTES dos blocos
          rejeitados porque site entregue com pendência já está na mão de
          alguém, e bloco rejeitado ainda não saiu daqui. */}
      <div className="mt-10">
        <PendenciasDeSites />
      </div>

      {total === 0 ? (
        <div className="ds-glass-static ds-slide-up ds-d3 mt-10 rounded-xl p-10 text-center">
          <CheckCircle2 size={22} className="mx-auto" style={{ color: 'var(--color-primary)' }} />
          <div className="mt-4 text-[15px]" style={{ color: 'var(--color-fg-muted)' }}>
            {rej.isPending ? 'Conferindo o que ficou pendente.' : 'Não deixei nada pendente.'}
          </div>
          {!rej.isPending && (
            <div className="mt-2 text-[13px]" style={{ color: 'var(--color-fg-subtle)' }}>
              Tudo que capturei até agora está na Galeria.
            </div>
          )}
        </div>
      ) : (
        <div className="mt-10 space-y-10">
          {grupos.map((grupo) => (
            <div key={grupo.designSystemId}>
              <div className="mb-4 flex items-center gap-2">
                <span className="text-[15px] font-medium" style={{ color: 'var(--color-fg)' }}>
                  {grupo.designSystemName}
                </span>
                <span
                  className="ds-data rounded-none px-2 py-0.5 text-[10px]"
                  style={{
                    backgroundColor: 'var(--color-ion-8)',
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
  const qc = useQueryClient();
  const [confirmaDescarte, setConfirmaDescarte] = useState(false);

  const aoMudar = () => {
    qc.invalidateQueries({ queryKey: ['rejeitados'] });
    qc.invalidateQueries({ queryKey: ['segments'] });
  };

  const recuperar = useMutation({
    mutationFn: () => api.recuperarRejeitado(dsId, item.id),
    onSuccess: () => {
      toast.ok('Mandei para a Galeria.');
      aoMudar();
    },
    onError: () => toast.erro('Não consegui enviar. Tente de novo.'),
  });

  const descartar = useMutation({
    mutationFn: () => api.descartarRejeitado(dsId, item.id),
    onSuccess: () => {
      toast.ok('Descartei o bloco.');
      aoMudar();
    },
    onError: () => toast.erro('Não consegui descartar. Tente de novo.'),
  });

  const ocupado = recuperar.isPending || descartar.isPending;
  const delay = index < 6 ? `ds-d${index + 1}` : '';

  return (
    <div className={`ds-scale-in ${delay} ds-glass-static overflow-hidden rounded-xl`}>
      <div className="opacity-80">
        <PreviewFrame src={previewRejeitadoUrl(dsId, item.id)} title={item.name} aspect={16 / 10} />
      </div>
      <div className="p-3.5">
        <div
          className="truncate text-[14px] font-medium"
          style={{ color: 'var(--color-fg)', fontFamily: 'var(--font-body)' }}
        >
          {item.name}
        </div>
        <div className="mt-0.5 text-[11px]" style={{ color: 'var(--color-fg-subtle)' }}>
          {CAT_LABEL[item.category] ?? 'Outros'}
        </div>
        <div
          className="mt-2.5 space-y-1.5 border-t pt-2.5"
          style={{ borderColor: 'var(--color-border)' }}
        >
          {item.motivos.map((motivo) => (
            <div key={motivo} className="flex items-start gap-1.5 text-[12px] leading-snug">
              <Info size={11} className="mt-px shrink-0" style={{ color: 'var(--color-signal)' }} />
              <span style={{ color: 'var(--color-fg-muted)' }}>{motivo}</span>
            </div>
          ))}
        </div>

        <div
          className="mt-3 flex items-center gap-2 border-t pt-3"
          style={{ borderColor: 'var(--color-border)' }}
        >
          <button
            type="button"
            disabled={ocupado}
            onClick={() => recuperar.mutate()}
            className="ds-btn flex items-center gap-1.5 rounded-none px-3.5 py-1.5 text-[12px] font-medium disabled:opacity-40"
            style={{ backgroundColor: 'var(--color-primary)', color: 'var(--color-bone-1)' }}
          >
            {recuperar.isPending ? <Mascote tamanho={12} girando /> : <Sparkles size={12} />}
            Aproveitar mesmo assim
          </button>
          <div className="relative ml-auto">
            <button
              type="button"
              disabled={ocupado}
              onClick={() =>
                usePreferencias.getState().confirmarAntesDeExcluir
                  ? setConfirmaDescarte(true)
                  : descartar.mutate()
              }
              className="flex items-center gap-1.5 rounded-none px-3 py-1.5 text-[12px] transition-colors hover:bg-[rgba(239,68,68,0.14)] disabled:opacity-40"
              style={{ color: 'var(--color-fg-muted)' }}
            >
              {descartar.isPending ? <Mascote tamanho={12} girando /> : <Trash2 size={12} />}
              Descartar
            </button>
            <ConfirmPop
              open={confirmaDescarte}
              title="Descartar este bloco?"
              description="Ele sai das pendências e eu não trago de volta."
              confirmLabel="Descartar"
              busy={descartar.isPending}
              onConfirm={() => {
                setConfirmaDescarte(false);
                descartar.mutate();
              }}
              onClose={() => setConfirmaDescarte(false)}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
