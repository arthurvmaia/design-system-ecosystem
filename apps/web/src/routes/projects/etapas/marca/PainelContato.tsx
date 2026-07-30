import type { WizardBranding } from '../../partes';
import { INPUT, inputStyle, rotulo } from '../../partes';
import { SecaoCabecalho } from './partes';

/**
 * Contato e chamada principal.
 *
 * Moraram na etapa Conteúdo por acidente de história: são dados da marca, não
 * texto de seção, e quando o conteúdo passou a ser escrito dentro da própria
 * estrutura eles ficaram órfãos. Aqui estão em casa, ao lado do nome, da voz e
 * da paleta.
 */
export function PainelContato({
  branding,
  setB,
}: {
  branding: WizardBranding;
  setB: (p: Partial<WizardBranding>) => void;
}) {
  const campo = (
    label: string,
    valor: string,
    aoMudar: (v: string) => void,
    dica?: string,
  ): React.ReactElement => (
    <label className="block">
      <span className="mb-1.5 block text-[12px] uppercase tracking-[0.16em]" style={rotulo}>
        {label}
      </span>
      <input
        type="text"
        value={valor}
        onChange={(e) => aoMudar(e.target.value)}
        placeholder={dica}
        className={INPUT}
        style={inputStyle}
      />
    </label>
  );

  return (
    <div className="space-y-5">
      {/* O cabeçalho padrão dos painéis: na grade, os seis cartões abrem igual. */}
      <SecaoCabecalho
        titulo="Contato e chamada"
        descricao="É o que o site oferece para a pessoa dar o próximo passo. O que você deixar em branco simplesmente não aparece."
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {campo('E-mail', branding.contact.email, (v) =>
          setB({ contact: { ...branding.contact, email: v } }),
        )}
        {campo('Telefone', branding.contact.phone, (v) =>
          setB({ contact: { ...branding.contact, phone: v } }),
        )}
        {campo('WhatsApp', branding.contact.whatsapp, (v) =>
          setB({ contact: { ...branding.contact, whatsapp: v } }),
        )}
        {campo('Endereço', branding.contact.address, (v) =>
          setB({ contact: { ...branding.contact, address: v } }),
        )}
      </div>

      <div>
        <div className="mb-3 text-[12px] uppercase tracking-[0.2em]" style={rotulo}>
          Chamada principal
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {campo(
            'Texto do botão',
            branding.mainCta.label,
            (v) => setB({ mainCta: { ...branding.mainCta, label: v } }),
            'ex.: Falar no WhatsApp',
          )}
          {campo(
            'Link',
            branding.mainCta.href,
            (v) => setB({ mainCta: { ...branding.mainCta, href: v } }),
            'ex.: https://wa.me/5511999999999',
          )}
        </div>
        <p className="mt-2 text-[13px]" style={{ color: 'var(--color-fg-subtle)' }}>
          Sem isso, os botões do site saem com um texto padrão.
        </p>
      </div>
    </div>
  );
}
