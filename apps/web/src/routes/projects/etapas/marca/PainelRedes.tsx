import { MultiSelect } from '@/components/seletores';
import { SOCIAL_PLATFORMS, validarUrlSocial } from '@/lib/social';
import { PosicaoSocial, type RedeSocial } from '@ds/shared/schemas';
import { Eye, EyeOff } from 'lucide-react';
import { Campo, INPUT, type WizardBranding, inputStyle } from '../../partes';
import { SecaoCabecalho } from './partes';

const ROTULO_POSICAO: Record<PosicaoSocial, string> = {
  cabecalho: 'Cabeçalho',
  'menu-mobile': 'Menu no celular',
  rodape: 'Rodapé',
  contato: 'Seção de contato',
};

const OPCOES_POSICAO = PosicaoSocial.options.map((p) => ({
  valor: p,
  rotulo: ROTULO_POSICAO[p],
}));

/**
 * Redes sociais como LISTA rica (fonte única): cada canal preenchido pode
 * escolher onde aparece e ser ocultado sem perder a URL. O record legado
 * `social` vira espelho derivado na hora de salvar.
 */
export function PainelRedes({
  branding,
  setB,
}: {
  branding: WizardBranding;
  setB: (p: Partial<WizardBranding>) => void;
}) {
  const sociais = branding.sociais;

  const aplicar = (novas: RedeSocial[]): void => {
    setB({
      sociais: novas,
      // espelho legado coerente: sem entradas fantasmas de redes removidas
      social: Object.fromEntries(novas.map((s) => [s.plataforma, s.url])),
    });
  };

  const mudar = (plataforma: string, patch: Partial<RedeSocial>): void => {
    const existente = sociais.find((s) => s.plataforma === plataforma);
    if (existente === undefined) {
      const url = patch.url ?? '';
      if (url.trim() === '') return;
      const ordem = SOCIAL_PLATFORMS.findIndex((p) => p.id === plataforma);
      aplicar([
        ...sociais,
        { plataforma, url, ordem: ordem === -1 ? sociais.length : ordem, visivel: true, ...patch },
      ]);
      return;
    }
    if (patch.url !== undefined && patch.url.trim() === '') {
      aplicar(sociais.filter((s) => s.plataforma !== plataforma));
      return;
    }
    aplicar(sociais.map((s) => (s.plataforma === plataforma ? { ...s, ...patch } : s)));
  };

  return (
    <div className="max-w-[560px] space-y-3">
      <SecaoCabecalho
        titulo="Redes sociais"
        descricao="Preencha só as redes que a marca usa. Cada uma pode escolher onde aparece no site — o automático coloca no rodapé e na seção de contato."
        opcional
      />
      {SOCIAL_PLATFORMS.map((p) => {
        const entrada = sociais.find((s) => s.plataforma === p.id);
        const val = entrada?.url ?? '';
        const erro = validarUrlSocial(val);
        const preenchida = val.trim() !== '' && erro === null;
        return (
          <div key={p.id}>
            <Campo label={p.label}>
              <div className="flex items-center gap-2">
                <input
                  type="url"
                  value={val}
                  onChange={(e) => mudar(p.id, { url: e.target.value })}
                  placeholder={p.placeholder}
                  aria-invalid={erro ? true : undefined}
                  className={INPUT}
                  style={
                    erro ? { ...inputStyle, borderColor: 'var(--color-crimson-4)' } : inputStyle
                  }
                />
                {entrada !== undefined && (
                  <button
                    type="button"
                    aria-pressed={entrada.visivel}
                    title={entrada.visivel ? 'Aparece no site' : 'Oculta do site (URL guardada)'}
                    onClick={() => mudar(p.id, { visivel: !entrada.visivel })}
                    className="shrink-0 rounded-md border p-2 transition-colors hover:bg-white/[0.06]"
                    style={{
                      borderColor: 'var(--color-border)',
                      color: entrada.visivel ? 'var(--color-fg)' : 'var(--color-fg-subtle)',
                    }}
                  >
                    {entrada.visivel ? <Eye size={13} /> : <EyeOff size={13} />}
                  </button>
                )}
              </div>
              {erro && (
                <div
                  role="alert"
                  className="mt-1 text-[11px]"
                  style={{ color: 'var(--color-crimson-3)' }}
                >
                  {erro}
                </div>
              )}
              {preenchida && entrada !== undefined && entrada.visivel && (
                <div className="mt-1.5 flex items-center gap-2">
                  <span
                    className="shrink-0 text-[10px] uppercase tracking-[0.14em]"
                    style={{ color: 'var(--color-fg-subtle)' }}
                  >
                    Onde aparece
                  </span>
                  <MultiSelect
                    className="min-w-0 flex-1"
                    opcoes={OPCOES_POSICAO}
                    valores={entrada.posicoes ?? []}
                    aoMudar={(posicoes) =>
                      mudar(p.id, {
                        posicoes: posicoes.length > 0 ? (posicoes as PosicaoSocial[]) : undefined,
                      })
                    }
                    placeholder="Automático (rodapé e contato)"
                    rotulo={`Onde ${p.label} aparece`}
                  />
                </div>
              )}
            </Campo>
          </div>
        );
      })}
    </div>
  );
}
