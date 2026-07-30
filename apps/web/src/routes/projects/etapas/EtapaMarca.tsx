import {
  STATUS_LABEL,
  type SecaoInfo,
  type SecaoStatus,
  marcaSectionStatus,
} from '@/lib/generator-sections';
import type { WizardBranding } from '../partes';
import { PainelContato } from './marca/PainelContato';
import { PainelMarca } from './marca/PainelMarca';
import { PainelPaleta } from './marca/PainelPaleta';
import { PainelRedes } from './marca/PainelRedes';
import { PainelTipografia } from './marca/PainelTipografia';
import { PainelVoz } from './marca/PainelVoz';

/**
 * A etapa "Marca" em GRADE: todos os painéis visíveis de uma vez, cada um num
 * cartão de vidro com o próprio título. A navegação interna que abria um
 * formulário por vez fazia sentido no modal estreito; na moldura larga do
 * wizard cabem 2 colunas, e ver tudo lado a lado tira a caça ao painel
 * escondido. Paleta e Tipografia ocupam a linha inteira porque têm preview ao
 * lado dos controles. O pontinho de status de cada cartão continua vindo de
 * `marcaSectionStatus` — nada do estado ou do salvamento mudou, só o arranjo.
 */
export function StepMarca({
  branding,
  setB,
  projectId,
}: {
  branding: WizardBranding;
  setB: (p: Partial<WizardBranding>) => void;
  projectId: string | null;
}) {
  const status = marcaSectionStatus(branding);

  return (
    <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-2">
      <Cartao info={status.marca}>
        <PainelMarca branding={branding} setB={setB} projectId={projectId} />
      </Cartao>
      <Cartao info={status.voz}>
        <PainelVoz branding={branding} setB={setB} />
      </Cartao>
      <Cartao info={status.paleta} largo>
        <PainelPaleta branding={branding} setB={setB} />
      </Cartao>
      <Cartao info={status.tipografia} largo>
        <PainelTipografia branding={branding} setB={setB} />
      </Cartao>
      <Cartao info={status.contato}>
        <PainelContato branding={branding} setB={setB} />
      </Cartao>
      <Cartao info={status.redes}>
        <PainelRedes branding={branding} setB={setB} />
      </Cartao>
    </div>
  );
}

/** Cartão de vidro de um painel; o ponto no canto diz o status sem roubar espaço. */
function Cartao({
  info,
  largo,
  children,
}: {
  info: SecaoInfo;
  largo?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section
      className={`ds-glass-static relative rounded-xl p-5 md:p-6 ${largo ? 'xl:col-span-2' : ''}`}
    >
      <span className="absolute top-5 right-5 md:top-6 md:right-6">
        <StatusDot status={info.status} resumo={info.resumo} />
      </span>
      {children}
    </section>
  );
}

/** Ponto de status: não depende só de cor — tem título/aria com o rótulo textual. */
function StatusDot({ status, resumo }: { status: SecaoStatus; resumo: string }) {
  const cor =
    status === 'configurado'
      ? 'var(--color-signal)'
      : status === 'opcional'
        ? 'var(--color-fg-subtle)'
        : 'var(--color-border-strong)';
  const rotulo = status === 'configurado' ? resumo : STATUS_LABEL[status];
  return (
    <span
      title={rotulo}
      aria-label={rotulo}
      className="inline-block h-[7px] w-[7px] shrink-0 rounded-full"
      style={{
        backgroundColor: cor,
        boxShadow: status === 'configurado' ? '0 0 8px rgba(56,189,248,0.6)' : undefined,
      }}
    />
  );
}
