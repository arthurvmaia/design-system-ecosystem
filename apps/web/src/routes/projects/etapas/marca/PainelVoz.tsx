import { MultiSelect } from '@/components/seletores';
import { ROTULO_EIXO } from '@/lib/marca-rotulos';
import {
  ARQUETIPOS,
  type EixosEditoriais,
  type IdentidadeVerbal,
  TONS_DE_VOZ,
  conflitoDeArquetipos,
  derivarDiretrizes,
} from '@ds/shared/schemas';
import { Campo, INPUT, type WizardBranding, inputStyle } from '../../partes';
import { ChipsInput, Recolhivel, SecaoCabecalho } from './partes';

const OPCOES_TONS = TONS_DE_VOZ.map((t) => ({
  valor: t.id,
  rotulo: t.nome,
  descricao: t.descricao,
}));

const OPCOES_ARQUETIPOS = ARQUETIPOS.map((a) => ({
  valor: a.id,
  rotulo: a.nome,
  descricao: `${a.descricao} ${a.exemplo}`,
}));

const EIXOS: (keyof EixosEditoriais)[] = [
  'formalidade',
  'energia',
  'proximidade',
  'objetividade',
  'sofisticacao',
  'nivelTecnico',
];

/**
 * Voz da marca: tons (o primeiro domina), postura (arquétipos) e vocabulário.
 * A régua editorial é DERIVADA na hora — a pessoa vê o efeito de cada escolha —
 * e pode ser ajustada à mão por quem quiser controle fino.
 */
export function PainelVoz({
  branding,
  setB,
}: {
  branding: WizardBranding;
  setB: (p: Partial<WizardBranding>) => void;
}) {
  const iv = branding.identidadeVerbal;
  const setIv = (patch: Partial<IdentidadeVerbal>): void =>
    setB({ identidadeVerbal: { ...iv, ...patch } });

  const diretrizes = derivarDiretrizes(iv);
  const conflito = conflitoDeArquetipos(iv.arquetipos);
  const temEscolha = iv.tons.length > 0 || iv.arquetipos.length > 0;

  return (
    <div className="max-w-[560px] space-y-5">
      <SecaoCabecalho
        titulo="Voz da marca"
        descricao="Como a marca fala. O tom muda vocabulário e ritmo; a postura muda o argumento. O primeiro de cada lista domina. Clique na estrela para trocar."
      />

      <Campo label="Tom de voz (até 4, e o primeiro domina)">
        <MultiSelect
          opcoes={OPCOES_TONS}
          valores={iv.tons}
          aoMudar={(tons) => setIv({ tons })}
          limite={4}
          comPrincipal
          placeholder="ex: Direto, Confiável…"
          rotulo="Tons de voz"
        />
      </Campo>

      <Campo label="Postura (até 3, e a primeira domina)">
        <MultiSelect
          opcoes={OPCOES_ARQUETIPOS}
          valores={iv.arquetipos}
          aoMudar={(arquetipos) => setIv({ arquetipos })}
          limite={3}
          comPrincipal
          placeholder="ex: Sábio, Criador…"
          rotulo="Posturas da marca"
        />
        {conflito !== null && (
          <output
            className="mt-1.5 block rounded-md border px-2.5 py-1.5 text-[11px] leading-relaxed"
            style={{ borderColor: 'var(--color-border)', color: 'var(--color-fg-muted)' }}
          >
            {conflito}
          </output>
        )}
      </Campo>

      {temEscolha && (
        <div className="rounded-lg border p-3.5" style={{ borderColor: 'var(--color-border)' }}>
          <div
            className="mb-2.5 text-[10px] uppercase tracking-[0.2em]"
            style={{ color: 'var(--color-fg-subtle)', fontFamily: 'var(--font-display)' }}
          >
            Como isso soa na prática
          </div>
          <div className="grid gap-x-6 gap-y-1.5 sm:grid-cols-2">
            {EIXOS.map((eixo) => (
              <div key={eixo} className="flex items-center justify-between gap-3">
                <span className="text-[11px]" style={{ color: 'var(--color-fg-muted)' }}>
                  {ROTULO_EIXO[eixo]}
                </span>
                <span
                  className="flex gap-[3px]"
                  aria-label={`${ROTULO_EIXO[eixo]}: ${diretrizes.eixos[eixo]} de 4`}
                >
                  {[0, 1, 2, 3, 4].map((n) => (
                    <span
                      key={n}
                      className="h-[6px] w-[14px] rounded-full"
                      style={{
                        backgroundColor:
                          n <= diretrizes.eixos[eixo]
                            ? 'var(--color-primary)'
                            : 'rgba(255,255,255,0.08)',
                      }}
                    />
                  ))}
                </span>
              </div>
            ))}
          </div>
          {diretrizes.orientacoes.length > 0 && (
            <ul
              className="mt-3 space-y-1 border-t pt-2.5"
              style={{ borderColor: 'var(--color-border)' }}
            >
              {diretrizes.orientacoes.slice(0, 4).map((o) => (
                <li
                  key={o}
                  className="text-[11px] leading-relaxed"
                  style={{ color: 'var(--color-fg-muted)' }}
                >
                  {o}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {temEscolha && (
        <Recolhivel rotulo="Ajustar a régua manualmente" detalhe="sobrepõe a derivação automática">
          <div className="space-y-2.5">
            {EIXOS.map((eixo) => (
              <label key={eixo} className="flex items-center gap-3">
                <span
                  className="w-[150px] shrink-0 text-[11px]"
                  style={{ color: 'var(--color-fg-muted)' }}
                >
                  {ROTULO_EIXO[eixo]}
                </span>
                <input
                  type="range"
                  min={0}
                  max={4}
                  step={1}
                  value={diretrizes.eixos[eixo]}
                  onChange={(e) =>
                    setIv({ eixos: { ...diretrizes.eixos, [eixo]: Number(e.target.value) } })
                  }
                  className="flex-1"
                  style={{ accentColor: 'var(--color-primary)' }}
                />
                <span
                  className="ds-data w-4 text-right text-[11px]"
                  style={{ color: 'var(--color-fg)' }}
                >
                  {diretrizes.eixos[eixo]}
                </span>
              </label>
            ))}
            {iv.eixos !== undefined && (
              <button
                type="button"
                onClick={() => setIv({ eixos: undefined })}
                className="text-[11px] underline"
                style={{ color: 'var(--color-fg-muted)' }}
              >
                Voltar ao automático
              </button>
            )}
          </div>
        </Recolhivel>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <Campo label="Palavras da marca">
          <ChipsInput
            valores={iv.vocabularioPreferido}
            aoMudar={(vocabularioPreferido) => setIv({ vocabularioPreferido })}
            placeholder="Enter adiciona"
            rotulo="Palavras que a marca usa"
          />
        </Campo>
        <Campo label="Palavras a evitar">
          <ChipsInput
            valores={iv.vocabularioEvitar}
            aoMudar={(vocabularioEvitar) => setIv({ vocabularioEvitar })}
            placeholder="Enter adiciona"
            rotulo="Palavras que a marca evita"
          />
        </Campo>
      </div>

      <Campo label="Observações sobre a voz">
        <textarea
          value={iv.observacao ?? ''}
          onChange={(e) => setIv({ observacao: e.target.value || undefined })}
          rows={2}
          className={INPUT}
          style={inputStyle}
          placeholder="algo que só você sabe sobre como a marca fala"
        />
      </Campo>
    </div>
  );
}
