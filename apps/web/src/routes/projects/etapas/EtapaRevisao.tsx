import type { MediaItem } from '@/lib/api';
import { type Problema, bloqueantes } from '@/lib/revisao-core';
import { familyName } from '@ds/shared/fonts';
import { ARQUETIPOS, type SecaoDoSite, TONS_DE_VOZ } from '@ds/shared/schemas';
import { AlertTriangle, ArrowRight, OctagonX, Sparkles } from 'lucide-react';
import type { WizardBranding } from '../partes';

/**
 * Revisão final: um resumo REAL do que vai ser gerado (voz, paleta viva,
 * fontes, seções, mídia) e a lista de problemas separando o que IMPEDE de
 * gerar do que só merece atenção — cada um com um botão que leva à etapa
 * exata onde se corrige.
 */
export function StepRevisao({
  name,
  kit,
  branding,
  secoes,
  media,
  problemas,
  onIr,
}: {
  name: string;
  kit: { name: string; components: unknown[] } | null;
  branding: WizardBranding;
  secoes: SecaoDoSite[];
  media: MediaItem[];
  problemas: Problema[];
  onIr: (etapa: number) => void;
}) {
  const tomPrincipal = TONS_DE_VOZ.find((t) => t.id === branding.identidadeVerbal.tons[0])?.nome;
  const arquetipoPrincipal = ARQUETIPOS.find(
    (a) => a.id === branding.identidadeVerbal.arquetipos[0],
  )?.nome;
  const voz = [tomPrincipal, arquetipoPrincipal].filter(Boolean).join(' · ');
  const comTexto = secoes.filter((s) => (s.instrucao ?? '').trim() !== '').length;
  const noAutomatico = secoes.length - comTexto;
  const nBloq = bloqueantes(problemas).length;
  const avisos = problemas.filter((p) => p.nivel === 'aviso');

  return (
    <div className="space-y-4">
      {problemas.length > 0 && (
        <div className="space-y-1.5">
          {[...bloqueantes(problemas), ...avisos].map((p) => (
            <div
              key={`${p.etapa}-${p.mensagem}`}
              className="flex items-center gap-2.5 rounded-md border px-3 py-2 text-[12px]"
              style={{
                borderColor:
                  p.nivel === 'bloqueante' ? 'var(--color-ion-5)' : 'var(--color-border)',
                color: 'var(--color-fg)',
              }}
            >
              {p.nivel === 'bloqueante' ? (
                <OctagonX size={13} className="shrink-0" style={{ color: 'var(--color-ion-3)' }} />
              ) : (
                <AlertTriangle
                  size={13}
                  className="shrink-0"
                  style={{ color: 'var(--color-fg-subtle)' }}
                />
              )}
              <span className="min-w-0 flex-1 leading-snug">{p.mensagem}</span>
              <button
                type="button"
                onClick={() => onIr(p.etapa)}
                className="flex shrink-0 items-center gap-1 rounded-none border px-2.5 py-1 text-[11px] transition-colors hover:border-[var(--color-signal)]"
                style={{
                  borderColor: 'var(--color-border-strong)',
                  color: 'var(--color-fg-muted)',
                }}
              >
                Corrigir
                <ArrowRight size={10} />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="ds-glass-static rounded-lg p-4">
        <Linha rotulo="Projeto" valor={name || 'sem nome ainda'} />
        <Linha
          rotulo="Kit base"
          valor={kit ? `${kit.name} · ${kit.components.length} componentes` : 'nenhum escolhido'}
        />
        <Linha rotulo="Marca" valor={branding.brandName || 'não preenchida'} />
        <Linha rotulo="Voz" valor={voz || branding.identidadeVerbal.observacao || 'não definida'} />
        <Linha
          rotulo="Paleta"
          valor={
            <span className="flex items-center gap-1.5">
              {branding.paleta.cores.slice(0, 8).map((c) => (
                <span
                  key={c.id}
                  title={`${c.nome} ${c.hex}`}
                  className="h-4 w-4 rounded-none border"
                  style={{ backgroundColor: c.hex, borderColor: 'var(--color-border)' }}
                />
              ))}
            </span>
          }
        />
        <Linha
          rotulo="Tipografia"
          valor={`${familyName(branding.fontDisplay)} + ${familyName(branding.fontBody)}`}
        />
        <Linha
          rotulo="Estrutura"
          valor={`${secoes.length} ${secoes.length === 1 ? 'seção' : 'seções'}, na sua ordem`}
        />
        <Linha
          rotulo="Textos"
          valor={
            comTexto === 0
              ? 'todos por minha conta'
              : `${comTexto} com texto seu · ${noAutomatico} por minha conta`
          }
        />
        <Linha
          rotulo="Logos e mídias"
          valor={`${branding.logos.length} ${branding.logos.length === 1 ? 'logo' : 'logos'} · ${media.filter((m) => m.kind !== 'logo').length} mídias`}
        />
      </div>

      <div
        className="flex items-start gap-2 rounded-lg p-3 text-[12px] leading-relaxed"
        style={{ backgroundColor: 'rgba(6,182,212,0.14)', color: 'var(--color-fg)' }}
      >
        <Sparkles size={14} className="mt-0.5 shrink-0" style={{ color: 'var(--color-signal)' }} />
        <span>
          {nBloq > 0 ? (
            <>
              Resolva {nBloq === 1 ? 'o item bloqueante' : `os ${nBloq} itens bloqueantes`} acima
              para liberar a geração.{' '}
            </>
          ) : null}
          Ao gerar, o site usa <strong>somente os componentes do kit</strong> como base visual e
          aplica a sua marca, o seu texto e a sua mídia. Seções sem peça no kit são criadas no
          estilo dele. Nada de texto ou marca do site de origem é copiado.
        </span>
      </div>
    </div>
  );
}

function Linha({ rotulo: r, valor }: { rotulo: string; valor: React.ReactNode }) {
  return (
    <div
      className="flex items-center justify-between border-b py-2 text-[13px] last:border-0"
      style={{ borderColor: 'var(--color-border)' }}
    >
      <span style={{ color: 'var(--color-fg-subtle)' }}>{r}</span>
      <span style={{ color: 'var(--color-fg)' }}>{valor}</span>
    </div>
  );
}
