import { Mascote } from '@/components/Mascote';
import { Select } from '@/components/seletores';
import { api } from '@/lib/api';
import { ROTULO_LOCAL_DE_LOGO, ROTULO_TIPO_DE_LOGO } from '@/lib/marca-rotulos';
import { toast } from '@/lib/toast';
import { LocalDeLogo, type LogoVariante, TipoDeLogo, distribuirLogos } from '@ds/shared/schemas';
import { useMutation } from '@tanstack/react-query';
import { Trash2, Upload } from 'lucide-react';
import { Campo, INPUT, type WizardBranding, inputStyle, mediaUrl } from '../../partes';
import { Recolhivel, SecaoCabecalho } from './partes';

/**
 * Nome + logos da marca. Aceita VÁRIAS variações (principal, clara, escura,
 * símbolo…), mostra cada uma sobre fundo claro E escuro, e distribui
 * automaticamente pelos lugares do site — com ajuste manual por lugar.
 */
export function PainelMarca({
  branding,
  setB,
  projectId,
}: {
  branding: WizardBranding;
  setB: (p: Partial<WizardBranding>) => void;
  projectId: string | null;
}) {
  // Toda mudança nos logos mantém o espelho legado (`logoPath`) e descarta
  // ajustes manuais que apontem para um tipo que deixou de existir.
  const aplicarLogos = (
    logos: LogoVariante[],
    logosLocais: WizardBranding['logosLocais'] = branding.logosLocais,
  ): void => {
    const locais = Object.fromEntries(
      Object.entries(logosLocais).filter(([, tipo]) => logos.some((l) => l.tipo === tipo)),
    ) as WizardBranding['logosLocais'];
    const principal = logos.find((l) => l.tipo === 'principal') ?? logos[0];
    setB({ logos, logosLocais: locais, logoPath: principal?.path ?? null });
  };

  const upload = useMutation({
    mutationFn: (file: File) => {
      if (!projectId) {
        throw new Error('Avance uma etapa para criar o rascunho antes de enviar arquivos.');
      }
      return api.uploadMedia(projectId, file, { kind: 'logo' });
    },
    onSuccess: (res) => {
      const tipoLivre =
        TipoDeLogo.options.find((t) => !branding.logos.some((l) => l.tipo === t)) ?? 'principal';
      aplicarLogos([...branding.logos, { tipo: tipoLivre, path: res.item.path }]);
      toast.ok('Logo enviada.');
    },
    onError: (e) => toast.erro(e instanceof Error ? e.message : 'Falha no upload.'),
  });

  const distAuto = distribuirLogos(branding.logos);
  const efetivo = (local: LocalDeLogo): LogoVariante | undefined => {
    const manual = branding.logosLocais[local];
    if (manual !== undefined) {
      const v = branding.logos.find((l) => l.tipo === manual);
      if (v !== undefined) return v;
    }
    return distAuto[local];
  };

  const opcoesDeTipo = TipoDeLogo.options.map((t) => ({
    valor: t,
    rotulo: ROTULO_TIPO_DE_LOGO[t],
  }));

  return (
    <div className="max-w-[560px] space-y-5">
      <SecaoCabecalho
        titulo="Marca"
        descricao="O nome como aparece no site e as variações da logo. Quanto mais variações, melhor cada canto do site fica. Mas uma só já resolve tudo."
      />
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

      <Campo label="Logos">
        <div className="space-y-2">
          {branding.logos.map((logo, i) => (
            <div
              key={`${logo.tipo}-${logo.path}`}
              className="flex items-center gap-3 rounded-lg border p-2"
              style={{ borderColor: 'var(--color-border)' }}
            >
              {/* preview sobre claro E escuro — a pessoa vê onde a variação funciona */}
              <div
                className="flex shrink-0 overflow-hidden rounded-md border"
                style={{ borderColor: 'var(--color-border)' }}
              >
                <span
                  className="flex h-11 w-14 items-center justify-center"
                  style={{ backgroundColor: '#f5f5f2' }}
                >
                  {projectId && (
                    <img
                      src={mediaUrl(projectId, logo.path)}
                      alt={`${ROTULO_TIPO_DE_LOGO[logo.tipo]} em fundo claro`}
                      className="max-h-9 max-w-12 object-contain"
                    />
                  )}
                </span>
                <span
                  className="flex h-11 w-14 items-center justify-center"
                  style={{ backgroundColor: '#141414' }}
                >
                  {projectId && (
                    <img
                      src={mediaUrl(projectId, logo.path)}
                      alt={`${ROTULO_TIPO_DE_LOGO[logo.tipo]} em fundo escuro`}
                      className="max-h-9 max-w-12 object-contain"
                    />
                  )}
                </span>
              </div>
              <Select
                className="w-[220px]"
                opcoes={opcoesDeTipo}
                valor={logo.tipo}
                rotulo="Variação da logo"
                aoMudar={(tipo) => {
                  const logos = branding.logos.map((l, j) =>
                    j === i ? { ...l, tipo: tipo as LogoVariante['tipo'] } : l,
                  );
                  aplicarLogos(logos);
                }}
              />
              <button
                type="button"
                aria-label={`Remover ${ROTULO_TIPO_DE_LOGO[logo.tipo]}`}
                onClick={() => aplicarLogos(branding.logos.filter((_, j) => j !== i))}
                className="ml-auto rounded-md p-1.5 transition-colors hover:bg-white/[0.06]"
                style={{ color: 'var(--color-fg-subtle)' }}
              >
                <Trash2 size={13} />
              </button>
            </div>
          ))}

          <label
            className="flex cursor-pointer items-center gap-2 rounded-md border border-dashed px-3 py-2.5 text-[12px] transition-colors hover:border-[var(--color-signal)]"
            style={{ borderColor: 'var(--color-border-strong)', color: 'var(--color-fg-muted)' }}
          >
            {upload.isPending ? <Mascote tamanho={13} girando /> : <Upload size={13} />}
            {branding.logos.length === 0 ? 'enviar logo (png/svg)' : 'adicionar outra variação'}
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) upload.mutate(f);
                e.target.value = '';
              }}
            />
          </label>
        </div>
      </Campo>

      {branding.logos.length > 0 && (
        <Recolhivel
          rotulo="Onde cada logo aparece"
          detalhe="distribuição automática, dá para ajustar"
        >
          <div className="grid gap-2 sm:grid-cols-2">
            {LocalDeLogo.options.map((local) => {
              const atual = efetivo(local);
              return (
                <div
                  key={local}
                  className="flex items-center gap-2.5 rounded-md border p-2"
                  style={{ borderColor: 'var(--color-border)' }}
                >
                  <span
                    className="flex h-9 w-11 shrink-0 items-center justify-center rounded"
                    style={{
                      backgroundColor: local === 'cabecalho-escuro' ? '#141414' : '#f5f5f2',
                    }}
                  >
                    {atual !== undefined && projectId && (
                      <img
                        src={mediaUrl(projectId, atual.path)}
                        alt={ROTULO_TIPO_DE_LOGO[atual.tipo]}
                        className="max-h-7 max-w-9 object-contain"
                      />
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="text-[11px]" style={{ color: 'var(--color-fg)' }}>
                      {ROTULO_LOCAL_DE_LOGO[local]}
                    </div>
                    <Select
                      className="mt-1"
                      opcoes={[
                        { valor: '', rotulo: 'Automático' },
                        ...branding.logos.map((l) => ({
                          valor: l.tipo,
                          rotulo: ROTULO_TIPO_DE_LOGO[l.tipo],
                        })),
                      ]}
                      valor={branding.logosLocais[local] ?? ''}
                      rotulo={`Logo para ${ROTULO_LOCAL_DE_LOGO[local]}`}
                      aoMudar={(tipo) => {
                        const locais = { ...branding.logosLocais };
                        if (tipo === '') {
                          delete locais[local];
                        } else {
                          locais[local] = tipo;
                        }
                        setB({ logosLocais: locais });
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </Recolhivel>
      )}
    </div>
  );
}
