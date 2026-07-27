import { FontPreview } from '@/components/FontPreview';
import { GoogleFontsPicker } from '@/components/GoogleFontsPicker';
import { api } from '@/lib/api';
import {
  type MarcaSubId,
  STATUS_LABEL,
  type SecaoStatus,
  marcaSectionStatus,
} from '@/lib/generator-sections';
import { SOCIAL_PLATFORMS, validarUrlSocial } from '@/lib/social';
import { toast } from '@/lib/toast';
import { familyName } from '@ds/shared/fonts';
import { useMutation } from '@tanstack/react-query';
import { Loader2, Upload } from 'lucide-react';
import { useState } from 'react';
import { Campo, INPUT, type WizardBranding, inputStyle, mediaUrl } from '../partes';

type MarcaSecaoDef = { id: MarcaSubId; label: string };
const MARCA_SECOES: MarcaSecaoDef[] = [
  { id: 'marca', label: 'Marca' },
  { id: 'paleta', label: 'Paleta' },
  { id: 'tipografia', label: 'Tipografia' },
  { id: 'redes', label: 'Redes sociais' },
];

/**
 * A etapa "Marca" foi quebrada em subseções independentes: uma navegação interna
 * abre um formulário por vez (Marca, Paleta, Tipografia, Redes) em vez de
 * empilhar tudo numa tela só. Cada item mostra status e um resumo do que já foi
 * preenchido. É a defesa direta contra a tela carregada.
 */
export function StepMarca({
  branding,
  setB,
  projectId,
  onLogo,
}: {
  branding: WizardBranding;
  setB: (p: Partial<WizardBranding>) => void;
  projectId: string | null;
  onLogo: (path: string | null) => void;
}) {
  const [sub, setSub] = useState<MarcaSubId>('marca');
  const status = marcaSectionStatus(branding);

  return (
    <div className="flex flex-col gap-5 md:flex-row">
      <nav
        aria-label="Seções da marca"
        className="flex gap-1.5 overflow-x-auto pb-1 md:w-[188px] md:flex-col md:overflow-visible md:pb-0"
      >
        {MARCA_SECOES.map((s) => {
          const info = status[s.id];
          const ativo = sub === s.id;
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => setSub(s.id)}
              aria-current={ativo ? 'page' : undefined}
              className={`flex shrink-0 items-center gap-2.5 rounded-md px-3 py-2 text-left text-[13px] transition-all duration-200 ${ativo ? 'ds-glass-static text-[var(--color-fg)]' : 'text-[var(--color-fg-muted)] hover:bg-white/[0.04] hover:text-[var(--color-fg)]'}`}
            >
              <StatusDot status={info.status} />
              <span className="min-w-0">
                <span className="block">{s.label}</span>
                <span
                  className="ds-data block max-w-[124px] truncate text-[10px]"
                  style={{ color: 'var(--color-fg-subtle)' }}
                >
                  {info.resumo}
                </span>
              </span>
            </button>
          );
        })}
      </nav>

      <div className="min-w-0 flex-1">
        {sub === 'marca' && (
          <PainelMarca branding={branding} setB={setB} projectId={projectId} onLogo={onLogo} />
        )}
        {sub === 'paleta' && <PainelPaleta branding={branding} setB={setB} />}
        {sub === 'tipografia' && <PainelTipografia branding={branding} setB={setB} />}
        {sub === 'redes' && <PainelRedes branding={branding} setB={setB} />}
      </div>
    </div>
  );
}

/** Ponto de status: não depende só de cor — tem título/aria com o rótulo textual. */
function StatusDot({ status }: { status: SecaoStatus }) {
  const cor =
    status === 'configurado'
      ? 'var(--color-signal)'
      : status === 'opcional'
        ? 'var(--color-fg-subtle)'
        : 'var(--color-border-strong)';
  return (
    <span
      title={STATUS_LABEL[status]}
      aria-label={STATUS_LABEL[status]}
      className="inline-block h-[7px] w-[7px] shrink-0 rounded-full"
      style={{
        backgroundColor: cor,
        boxShadow: status === 'configurado' ? '0 0 8px rgba(198,40,40,0.5)' : undefined,
      }}
    />
  );
}

function SecaoCabecalho({
  titulo,
  descricao,
  opcional,
}: {
  titulo: string;
  descricao: string;
  opcional?: boolean;
}) {
  return (
    <div className="mb-4">
      <div className="flex items-center gap-2">
        <h3 className="text-[15px] font-medium" style={{ color: 'var(--color-fg)' }}>
          {titulo}
        </h3>
        {opcional && (
          <span
            className="rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-[0.12em]"
            style={{ borderColor: 'var(--color-border)', color: 'var(--color-fg-subtle)' }}
          >
            Opcional
          </span>
        )}
      </div>
      <p className="mt-1 text-[12px] leading-relaxed" style={{ color: 'var(--color-fg-muted)' }}>
        {descricao}
      </p>
    </div>
  );
}

function PainelMarca({
  branding,
  setB,
  projectId,
  onLogo,
}: {
  branding: WizardBranding;
  setB: (p: Partial<WizardBranding>) => void;
  projectId: string | null;
  onLogo: (path: string | null) => void;
}) {
  const upload = useMutation({
    mutationFn: (file: File) => {
      if (!projectId) throw new Error('rascunho ainda não criado');
      return api.uploadMedia(projectId, file, { kind: 'logo' });
    },
    onSuccess: (res) => {
      onLogo(res.item.path);
      toast.ok('Logo enviada.');
    },
    onError: (e) => toast.erro(e instanceof Error ? e.message : 'Falha no upload.'),
  });

  return (
    <div className="max-w-[440px] space-y-4">
      <SecaoCabecalho titulo="Marca" descricao="Como a marca se apresenta no site." />
      <Campo label="Nome da marca">
        <input
          type="text"
          value={branding.brandName}
          onChange={(e) => setB({ brandName: e.target.value })}
          className={INPUT}
          style={inputStyle}
          placeholder="como aparece no site"
        />
      </Campo>
      <Campo label="Tom de voz">
        <input
          type="text"
          value={branding.tone}
          onChange={(e) => setB({ tone: e.target.value })}
          className={INPUT}
          style={inputStyle}
          placeholder="ex: direto e confiante"
        />
      </Campo>
      <Campo label="Logo">
        {branding.logoPath && projectId ? (
          <div className="flex items-center gap-3">
            <img
              src={mediaUrl(projectId, branding.logoPath)}
              alt="logo"
              className="h-12 max-w-[140px] rounded-md object-contain"
              style={{ backgroundColor: 'rgba(255,255,255,0.06)' }}
            />
            <button
              type="button"
              onClick={() => onLogo(null)}
              className="text-[11px]"
              style={{ color: 'var(--color-crimson-3)' }}
            >
              remover
            </button>
          </div>
        ) : (
          <label
            className="flex cursor-pointer items-center gap-2 rounded-md border border-dashed px-3 py-2.5 text-[12px] transition-colors hover:border-[var(--color-signal)]"
            style={{ borderColor: 'var(--color-border-strong)', color: 'var(--color-fg-muted)' }}
          >
            {upload.isPending ? (
              <Loader2 size={13} className="animate-spin" />
            ) : (
              <Upload size={13} />
            )}
            enviar logo (png/svg)
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) upload.mutate(f);
              }}
            />
          </label>
        )}
      </Campo>
    </div>
  );
}

function PainelPaleta({
  branding,
  setB,
}: {
  branding: WizardBranding;
  setB: (p: Partial<WizardBranding>) => void;
}) {
  return (
    <div className="max-w-[540px] space-y-4">
      <SecaoCabecalho
        titulo="Paleta de cores"
        descricao="A identidade visual do novo site. É definida aqui — não é herdada das cores dos componentes da Galeria, que servem só de preview fiel."
      />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Cor label="Primária" value={branding.primary} onChange={(v) => setB({ primary: v })} />
        <Cor label="Fundo" value={branding.background} onChange={(v) => setB({ background: v })} />
        <Cor label="Texto" value={branding.foreground} onChange={(v) => setB({ foreground: v })} />
        <Cor
          label="Destaque"
          value={branding.accent || '#c62828'}
          onChange={(v) => setB({ accent: v })}
        />
      </div>
      <div
        className="rounded-lg border p-4"
        style={{ borderColor: 'var(--color-border)', backgroundColor: branding.background }}
      >
        <div className="text-[15px] font-medium" style={{ color: branding.foreground }}>
          Aa — {branding.brandName || 'Sua marca'}
        </div>
        <button
          type="button"
          className="mt-2 rounded-md px-3 py-1.5 text-[12px]"
          style={{ backgroundColor: branding.primary, color: '#ffffff' }}
        >
          Botão primário
        </button>
      </div>
    </div>
  );
}

function PainelTipografia({
  branding,
  setB,
}: {
  branding: WizardBranding;
  setB: (p: Partial<WizardBranding>) => void;
}) {
  const [role, setRole] = useState<'display' | 'body'>('display');
  const valor = role === 'display' ? branding.fontDisplay : branding.fontBody;
  const escolher = (fam: string) =>
    setB(role === 'display' ? { fontDisplay: fam } : { fontBody: fam });

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div>
        <SecaoCabecalho
          titulo="Tipografia"
          descricao="Clique numa fonte para escolher. Títulos e corpo podem ter fontes diferentes."
        />
        <div
          className="mb-3 inline-flex rounded-md border p-0.5"
          style={{ borderColor: 'var(--color-border)' }}
        >
          {(['display', 'body'] as const).map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setRole(r)}
              aria-pressed={role === r}
              className="rounded px-3 py-1.5 text-[12px] transition-colors"
              style={{
                backgroundColor: role === r ? 'var(--color-primary)' : 'transparent',
                color: role === r ? 'var(--color-bone-1)' : 'var(--color-fg-muted)',
              }}
            >
              {r === 'display' ? 'Fonte de títulos' : 'Fonte de corpo'}
            </button>
          ))}
        </div>
        <GoogleFontsPicker
          value={valor}
          onChange={escolher}
          ariaLabel={`Fonte de ${role === 'display' ? 'títulos' : 'corpo'}`}
        />
      </div>
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
        <FontPreview heading={branding.fontDisplay} body={branding.fontBody} />
        <button
          type="button"
          onClick={() => setB({ fontBody: branding.fontDisplay })}
          className="text-[11px] underline"
          style={{ color: 'var(--color-fg-muted)' }}
        >
          Usar a fonte de títulos também no corpo
        </button>
      </div>
    </div>
  );
}

function PainelRedes({
  branding,
  setB,
}: {
  branding: WizardBranding;
  setB: (p: Partial<WizardBranding>) => void;
}) {
  return (
    <div className="max-w-[520px] space-y-3">
      <SecaoCabecalho
        titulo="Redes sociais"
        descricao="Preencha só as redes que a marca usa. Nenhuma é obrigatória."
        opcional
      />
      {SOCIAL_PLATFORMS.map((p) => {
        const val = branding.social[p.id] ?? '';
        const erro = validarUrlSocial(val);
        return (
          <Campo key={p.id} label={p.label}>
            <input
              type="url"
              value={val}
              onChange={(e) => setB({ social: { ...branding.social, [p.id]: e.target.value } })}
              placeholder={p.placeholder}
              aria-invalid={erro ? true : undefined}
              className={INPUT}
              style={erro ? { ...inputStyle, borderColor: 'var(--color-crimson-4)' } : inputStyle}
            />
            {erro && (
              <div
                role="alert"
                className="mt-1 text-[11px]"
                style={{ color: 'var(--color-crimson-3)' }}
              >
                {erro}
              </div>
            )}
          </Campo>
        );
      })}
    </div>
  );
}

function Cor({
  label,
  value,
  onChange,
}: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="flex items-center gap-3">
      <input
        type="color"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-8 w-10 cursor-pointer rounded"
      />
      <div className="flex-1">
        <div
          className="text-[10px]"
          style={{ color: 'var(--color-fg-subtle)', fontFamily: 'var(--font-mono)' }}
        >
          {label}
        </div>
        <div className="ds-data text-[12px]" style={{ color: 'var(--color-fg)' }}>
          {value}
        </div>
      </div>
    </label>
  );
}
