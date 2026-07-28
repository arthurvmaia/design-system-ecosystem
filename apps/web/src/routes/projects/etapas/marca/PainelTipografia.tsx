import { GoogleFontsPicker } from '@/components/GoogleFontsPicker';
import { ROTULO_PRESET_CORPO, ROTULO_PRESET_TITULOS } from '@/lib/marca-rotulos';
import { familyName } from '@ds/shared/fonts';
import {
  type AjusteTipografico,
  PresetDeCorpo,
  PresetDeTitulos,
  type TipografiaDoProjeto,
  derivarEscala,
} from '@ds/shared/schemas';
import type { WizardBranding } from '../../partes';
import { Recolhivel, SecaoCabecalho } from './partes';

/**
 * Tipografia: fontes por papel + preset de títulos/corpo com a escala DERIVADA
 * mostrada ao vivo (H1–H3 e parágrafo reais, nas fontes escolhidas). O ajuste
 * fino sobrepõe o preset e fica recolhido.
 */
export function PainelTipografia({
  branding,
  setB,
}: {
  branding: WizardBranding;
  setB: (p: Partial<WizardBranding>) => void;
}) {
  const tipografia = branding.tipografia;
  const setTipo = (patch: Partial<TipografiaDoProjeto>): void =>
    setB({ tipografia: { ...tipografia, ...patch } });

  const escala = derivarEscala({
    ...tipografia,
    display: branding.fontDisplay,
    body: branding.fontBody,
  });

  const ajuste = tipografia.ajusteTitulos;
  const setAjuste = (patch: Partial<AjusteTipografico>): void =>
    setTipo({ ajusteTitulos: { ...ajuste, ...patch } });

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="space-y-4">
        <SecaoCabecalho
          titulo="Tipografia"
          descricao="Escolha as fontes e um jeito de titular. O preview ao lado mostra a escala real que o site vai usar."
        />

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <div
              className="mb-1.5 text-[10px] uppercase tracking-[0.2em]"
              style={{ color: 'var(--color-fg-subtle)', fontFamily: 'var(--font-display)' }}
            >
              Fonte de títulos
            </div>
            <GoogleFontsPicker
              value={branding.fontDisplay}
              onChange={(fam) => setB({ fontDisplay: fam })}
              ariaLabel="Fonte de títulos"
            />
          </div>
          <div>
            <div
              className="mb-1.5 text-[10px] uppercase tracking-[0.2em]"
              style={{ color: 'var(--color-fg-subtle)', fontFamily: 'var(--font-display)' }}
            >
              Fonte de corpo
            </div>
            <GoogleFontsPicker
              value={branding.fontBody}
              onChange={(fam) => setB({ fontBody: fam })}
              ariaLabel="Fonte de corpo"
            />
          </div>
        </div>
        <button
          type="button"
          onClick={() => setB({ fontBody: branding.fontDisplay })}
          className="text-[11px] underline"
          style={{ color: 'var(--color-fg-muted)' }}
        >
          Usar a fonte de títulos também no corpo
        </button>

        <div>
          <div
            className="mb-1.5 text-[10px] uppercase tracking-[0.2em]"
            style={{ color: 'var(--color-fg-subtle)', fontFamily: 'var(--font-display)' }}
          >
            Jeito dos títulos
          </div>
          <div className="grid gap-1.5 sm:grid-cols-2">
            {PresetDeTitulos.options.map((p) => {
              const ativo = tipografia.presetTitulos === p;
              return (
                <button
                  key={p}
                  type="button"
                  aria-pressed={ativo}
                  onClick={() => setTipo({ presetTitulos: p, ajusteTitulos: undefined })}
                  className="rounded-md border px-3 py-2 text-left transition-colors"
                  style={{
                    borderColor: ativo ? 'var(--color-primary)' : 'var(--color-border)',
                    backgroundColor: ativo ? 'rgba(107,20,20,0.16)' : 'transparent',
                  }}
                >
                  <span className="block text-[12px]" style={{ color: 'var(--color-fg)' }}>
                    {ROTULO_PRESET_TITULOS[p].nome}
                  </span>
                  <span
                    className="block text-[10px] leading-snug"
                    style={{ color: 'var(--color-fg-subtle)' }}
                  >
                    {ROTULO_PRESET_TITULOS[p].descricao}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <div
            className="mb-1.5 text-[10px] uppercase tracking-[0.2em]"
            style={{ color: 'var(--color-fg-subtle)', fontFamily: 'var(--font-display)' }}
          >
            Jeito do texto
          </div>
          <div className="grid gap-1.5 sm:grid-cols-2">
            {PresetDeCorpo.options.map((p) => {
              const ativo = tipografia.presetCorpo === p;
              return (
                <button
                  key={p}
                  type="button"
                  aria-pressed={ativo}
                  onClick={() => setTipo({ presetCorpo: p })}
                  className="rounded-md border px-3 py-2 text-left transition-colors"
                  style={{
                    borderColor: ativo ? 'var(--color-primary)' : 'var(--color-border)',
                    backgroundColor: ativo ? 'rgba(107,20,20,0.16)' : 'transparent',
                  }}
                >
                  <span className="block text-[12px]" style={{ color: 'var(--color-fg)' }}>
                    {ROTULO_PRESET_CORPO[p].nome}
                  </span>
                  <span
                    className="block text-[10px] leading-snug"
                    style={{ color: 'var(--color-fg-subtle)' }}
                  >
                    {ROTULO_PRESET_CORPO[p].descricao}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <Recolhivel rotulo="Ajuste fino dos títulos" detalhe="sobrepõe o jeito escolhido">
          <div className="space-y-2.5">
            <label
              className="flex items-center gap-3 text-[11px]"
              style={{ color: 'var(--color-fg-muted)' }}
            >
              <span className="w-[110px] shrink-0">Peso</span>
              <input
                type="range"
                min={100}
                max={900}
                step={100}
                value={escala.pesoTitulos}
                onChange={(e) => setAjuste({ peso: Number(e.target.value) })}
                className="flex-1"
                style={{ accentColor: 'var(--color-primary)' }}
              />
              <span className="ds-data w-8 text-right" style={{ color: 'var(--color-fg)' }}>
                {escala.pesoTitulos}
              </span>
            </label>
            <label
              className="flex items-center gap-3 text-[11px]"
              style={{ color: 'var(--color-fg-muted)' }}
            >
              <span className="w-[110px] shrink-0">Contraste H1–H6</span>
              <input
                type="range"
                min={1.05}
                max={1.5}
                step={0.01}
                value={tipografia.ajusteTitulos?.escala ?? escalaDoPreset(tipografia)}
                onChange={(e) => setAjuste({ escala: Number(e.target.value) })}
                className="flex-1"
                style={{ accentColor: 'var(--color-primary)' }}
              />
              <span className="ds-data w-8 text-right" style={{ color: 'var(--color-fg)' }}>
                {(tipografia.ajusteTitulos?.escala ?? escalaDoPreset(tipografia)).toFixed(2)}
              </span>
            </label>
            <label
              className="flex items-center gap-3 text-[11px]"
              style={{ color: 'var(--color-fg-muted)' }}
            >
              <span className="w-[110px] shrink-0">Altura da linha</span>
              <input
                type="range"
                min={0.9}
                max={2.2}
                step={0.05}
                value={escala.lineHeightTitulos}
                onChange={(e) => setAjuste({ lineHeight: Number(e.target.value) })}
                className="flex-1"
                style={{ accentColor: 'var(--color-primary)' }}
              />
              <span className="ds-data w-8 text-right" style={{ color: 'var(--color-fg)' }}>
                {escala.lineHeightTitulos.toFixed(2)}
              </span>
            </label>
            <div className="flex items-center gap-2">
              {(
                [
                  ['nenhuma', 'Normal'],
                  ['uppercase', 'MAIÚSCULAS'],
                  ['capitalize', 'Capitalizada'],
                ] as const
              ).map(([v, r]) => (
                <button
                  key={v}
                  type="button"
                  aria-pressed={escala.transformacaoTitulos === v}
                  onClick={() => setAjuste({ transformacao: v })}
                  className="rounded-md border px-2.5 py-1 text-[11px] transition-colors"
                  style={{
                    borderColor:
                      escala.transformacaoTitulos === v
                        ? 'var(--color-primary)'
                        : 'var(--color-border)',
                    color: 'var(--color-fg-muted)',
                  }}
                >
                  {r}
                </button>
              ))}
            </div>
            {tipografia.ajusteTitulos !== undefined && (
              <button
                type="button"
                onClick={() => setTipo({ ajusteTitulos: undefined })}
                className="text-[11px] underline"
                style={{ color: 'var(--color-fg-muted)' }}
              >
                Voltar ao jeito escolhido
              </button>
            )}
          </div>
        </Recolhivel>
      </div>

      {/* Preview REAL: a escala derivada, nas fontes escolhidas */}
      <div className="space-y-3">
        <div className="flex flex-wrap gap-2 text-[11px]">
          <span
            className="rounded-full border px-2.5 py-1"
            style={{ borderColor: 'var(--color-border)', color: 'var(--color-fg-muted)' }}
          >
            Títulos:{' '}
            <strong style={{ color: 'var(--color-fg)' }}>{familyName(branding.fontDisplay)}</strong>
          </span>
          <span
            className="rounded-full border px-2.5 py-1"
            style={{ borderColor: 'var(--color-border)', color: 'var(--color-fg-muted)' }}
          >
            Corpo:{' '}
            <strong style={{ color: 'var(--color-fg)' }}>{familyName(branding.fontBody)}</strong>
          </span>
        </div>
        <div
          className="space-y-2 overflow-hidden rounded-lg border p-4"
          style={{ borderColor: 'var(--color-border)' }}
        >
          {(['H1', 'H2', 'H3'] as const).map((h, i) => (
            <div
              key={h}
              style={{
                fontFamily: branding.fontDisplay,
                fontSize: escala.headings[i],
                fontWeight: escala.pesoTitulos,
                lineHeight: escala.lineHeightTitulos,
                letterSpacing: escala.letterSpacingTitulos,
                textTransform:
                  escala.transformacaoTitulos === 'nenhuma'
                    ? undefined
                    : escala.transformacaoTitulos,
                color: 'var(--color-fg)',
              }}
            >
              Título {h.toLowerCase()}
            </div>
          ))}
          <p
            style={{
              fontFamily: branding.fontBody,
              fontSize: escala.corpoTamanho,
              lineHeight: escala.corpoLineHeight,
              color: 'var(--color-fg-muted)',
            }}
          >
            O texto de leitura fica assim: tamanho e respiro vêm do jeito escolhido, e a fonte é a
            sua. Nada aqui é imagem. Essa é a escala real do site.
          </p>
        </div>
      </div>
    </div>
  );
}

/** A razão do preset atual, lida da própria escala derivada (h1/h2). */
const escalaDoPreset = (t: TipografiaDoProjeto): number => {
  const [h1, h2] = derivarEscala({ ...t, ajusteTitulos: undefined }).headings;
  return Math.round((Number.parseFloat(h1) / Number.parseFloat(h2)) * 100) / 100;
};
