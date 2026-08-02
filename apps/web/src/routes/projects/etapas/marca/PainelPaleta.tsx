import { Select } from '@/components/seletores';
import { ROTULO_TOKEN, TOKENS_DE_ESTADO } from '@/lib/marca-rotulos';
import {
  type CorDaPaleta,
  type PaletaDoProjeto,
  TOKENS_SEMANTICOS,
  contrasteRatio,
  distribuirTokens,
} from '@ds/shared/schemas';
import { Plus, Trash2 } from 'lucide-react';
import { Campo, type WizardBranding, inputStyle } from '../../partes';
import { Recolhivel, SecaoCabecalho } from './partes';

const proximoId = (cores: readonly CorDaPaleta[]): string => {
  let i = cores.length + 1;
  while (cores.some((c) => c.id === `cor-${i}`)) i += 1;
  return `cor-${i}`;
};

/**
 * Paleta variável (1 a 12 cores nomeadas) distribuída sobre os papéis REAIS do
 * site gerado. A distribuição é automática por luminância/contraste; o ajuste
 * fino por papel fica recolhido para quem quiser controle total.
 */
export function PainelPaleta({
  branding,
  setB,
}: {
  branding: WizardBranding;
  setB: (p: Partial<WizardBranding>) => void;
}) {
  const paleta = branding.paleta;
  const tokens = distribuirTokens(paleta);

  // Toda mudança na paleta mantém o espelho legado (4 cores) coerente.
  const aplicar = (nova: PaletaDoProjeto): void => {
    const t = distribuirTokens(nova);
    setB({
      paleta: nova,
      primary: t.primary ?? branding.primary,
      background: t.background ?? branding.background,
      foreground: t.body ?? branding.foreground,
      accent: t.accent ?? branding.accent,
    });
  };

  const mudarCor = (i: number, patch: Partial<CorDaPaleta>): void => {
    aplicar({
      ...paleta,
      cores: paleta.cores.map((c, j) => (j === i ? { ...c, ...patch } : c)),
    });
  };

  const removerCor = (i: number): void => {
    const removida = paleta.cores[i];
    if (removida === undefined) return;
    const atribuicoes = Object.fromEntries(
      Object.entries(paleta.atribuicoes).filter(([, corId]) => corId !== removida.id),
    );
    aplicar({ cores: paleta.cores.filter((_, j) => j !== i), atribuicoes });
  };

  const contrasteBaixo =
    tokens.background !== undefined &&
    tokens.body !== undefined &&
    contrasteRatio(tokens.background, tokens.body) < 4.5;

  return (
    // O cartão da paleta ocupa a linha inteira da grade: controles à esquerda,
    // preview vivo à direita — mesmo desenho do painel de tipografia. Numa
    // coluna só (celular), o preview volta para baixo dos controles.
    <div className="grid gap-x-8 gap-y-5 lg:grid-cols-2">
      <div className="space-y-5">
        <SecaoCabecalho
          titulo="Paleta de cores"
          descricao="Esta é a identidade visual do novo site. Ela não é herdada das peças da Galeria. Nomeie suas cores; a distribuição pelos papéis do site é automática."
        />

        <Campo label={`Cores (${paleta.cores.length} de 12)`}>
          <div className="space-y-2">
            {paleta.cores.map((cor, i) => (
              <div key={cor.id} className="flex items-center gap-2.5">
                <input
                  type="color"
                  value={cor.hex}
                  aria-label={`Cor ${cor.nome}`}
                  onChange={(e) => mudarCor(i, { hex: e.target.value })}
                  className="h-8 w-10 shrink-0 cursor-pointer rounded"
                />
                <input
                  type="text"
                  value={cor.nome}
                  aria-label="Nome da cor"
                  onChange={(e) => mudarCor(i, { nome: e.target.value })}
                  className="w-full min-w-0 flex-1 rounded-md border px-2.5 py-2 text-[13px] outline-none focus:border-[var(--color-signal)]"
                  style={inputStyle}
                />
                <span
                  className="ds-data w-[74px] shrink-0 text-[12px]"
                  style={{ color: 'var(--color-fg-subtle)' }}
                >
                  {cor.hex}
                </span>
                <button
                  type="button"
                  aria-label={`Remover ${cor.nome}`}
                  disabled={paleta.cores.length <= 1}
                  onClick={() => removerCor(i)}
                  className="shrink-0 rounded-md p-1.5 transition-colors hover:bg-white/[0.06] disabled:opacity-30"
                  style={{ color: 'var(--color-fg-subtle)' }}
                >
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
            {paleta.cores.length < 12 && (
              <button
                type="button"
                onClick={() =>
                  aplicar({
                    ...paleta,
                    cores: [
                      ...paleta.cores,
                      {
                        id: proximoId(paleta.cores),
                        nome: `Cor ${paleta.cores.length + 1}`,
                        hex: '#888888',
                      },
                    ],
                  })
                }
                className="flex items-center gap-1.5 rounded-md border border-dashed px-3 py-2 text-[13px] transition-colors hover:border-[var(--color-signal)]"
                style={{
                  borderColor: 'var(--color-border-strong)',
                  color: 'var(--color-fg-muted)',
                }}
              >
                <Plus size={12} />
                adicionar cor
              </button>
            )}
          </div>
        </Campo>
      </div>

      <div className="space-y-4">
        {/* Preview VIVO com os papéis reais do site gerado */}
        <div
          className="overflow-hidden rounded-lg border"
          style={{ borderColor: 'var(--color-border)', backgroundColor: tokens.background }}
        >
          <div
            className="flex items-center justify-between px-4 py-2.5"
            style={{
              backgroundColor: tokens.surface,
              borderBottom: `1px solid ${tokens.border ?? 'transparent'}`,
            }}
          >
            <span className="text-[13px] font-semibold" style={{ color: tokens.heading }}>
              {branding.brandName || 'Sua marca'}
            </span>
            <span
              className="rounded-md px-2.5 py-1 text-[11px] font-medium"
              style={{ backgroundColor: tokens.primary, color: tokens['primary-foreground'] }}
            >
              Começar
            </span>
          </div>
          <div className="space-y-2 px-4 py-4">
            <div className="text-[16px] font-semibold" style={{ color: tokens.heading }}>
              Um título de exemplo
            </div>
            <p className="text-[12px] leading-relaxed" style={{ color: tokens.body }}>
              É assim que o texto corrido do site fica sobre o fundo escolhido.
            </p>
            <p className="text-[11px]" style={{ color: tokens.muted }}>
              Detalhe secundário ·{' '}
              <span style={{ color: tokens.link, textDecoration: 'underline' }}>um link</span>
            </p>
            <div
              className="rounded-md border p-3 text-[11px]"
              style={{
                backgroundColor: tokens['surface-elevated'],
                borderColor: tokens.border,
                color: tokens.body,
              }}
            >
              Um cartão em destaque
            </div>
          </div>
        </div>

        {contrasteBaixo && (
          <output
            className="block rounded-md border px-3 py-2 text-[12px] leading-relaxed"
            style={{ borderColor: 'var(--color-border)', color: 'var(--color-fg-muted)' }}
          >
            O texto pode ficar difícil de ler sobre esse fundo (contraste baixo). Vale escurecer ou
            clarear uma das duas cores. Você também pode atribuir outra cor ao papel “Texto” no
            ajuste fino.
          </output>
        )}

        <Recolhivel rotulo="Ajuste fino por papel" detalhe="qual cor ocupa cada papel do site">
          <div className="grid gap-x-4 gap-y-2 sm:grid-cols-2">
            {TOKENS_SEMANTICOS.map((token) => {
              const efetivo = tokens[token];
              const ehEstado = TOKENS_DE_ESTADO.includes(token);
              return (
                <div key={token} className="flex items-center gap-2">
                  <span
                    className="h-5 w-5 shrink-0 rounded border"
                    style={{
                      backgroundColor: efetivo ?? 'transparent',
                      borderColor: 'var(--color-border)',
                    }}
                    title={efetivo ?? 'sem cor'}
                  />
                  <span
                    className="w-[140px] shrink-0 truncate text-[12px]"
                    style={{ color: 'var(--color-fg-muted)' }}
                  >
                    {ROTULO_TOKEN[token]}
                  </span>
                  <Select
                    className="min-w-0 flex-1"
                    opcoes={[
                      {
                        valor: '',
                        rotulo: ehEstado ? 'Não usar' : 'Automático',
                        descricao: ehEstado ? 'Só entra se você atribuir uma cor.' : undefined,
                      },
                      ...paleta.cores.map((c) => ({
                        valor: c.id,
                        rotulo: c.nome,
                        descricao: c.hex,
                      })),
                    ]}
                    valor={paleta.atribuicoes[token] ?? ''}
                    rotulo={`Cor para ${ROTULO_TOKEN[token]}`}
                    aoMudar={(corId) => {
                      const atribuicoes = { ...paleta.atribuicoes };
                      if (corId === '') {
                        delete atribuicoes[token];
                      } else {
                        atribuicoes[token] = corId;
                      }
                      aplicar({ ...paleta, atribuicoes });
                    }}
                  />
                </div>
              );
            })}
          </div>
        </Recolhivel>
      </div>
    </div>
  );
}
