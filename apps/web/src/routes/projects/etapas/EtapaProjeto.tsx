import { OBJETIVOS, type ObjetivoDoSite } from '@ds/shared/schemas';
import { Campo, INPUT, inputStyle, rotulo } from '../partes';

/**
 * A primeira etapa: nome, kit e — novo — o que este site precisa FAZER.
 *
 * O objetivo decide a estrutura sugerida na etapa seguinte, e nada mais. Ele
 * não restringe peça, não trava seção e não muda o que já foi montado: uma
 * página que capta contato e uma que vende um produto precisam responder coisas
 * diferentes, em ordens diferentes, e a sugestão passou a saber disso.
 *
 * Deixar em branco é uma resposta: cai na sequência de captar contato, que é a
 * mais geral. Por isso ele não é campo obrigatório e não entra no gate da etapa
 * — obrigar uma escolha aqui só produziria cliques no primeiro item.
 */
export function StepProjeto({
  name,
  onName,
  kitId,
  onKit,
  kits,
  objetivo,
  onObjetivo,
}: {
  name: string;
  onName: (v: string) => void;
  kitId: string | null;
  onKit: (id: string) => void;
  kits: Array<{ id: string; name: string; components: unknown[] }>;
  objetivo: ObjetivoDoSite | null;
  onObjetivo: (o: ObjetivoDoSite | null) => void;
}) {
  const objetivos = Object.keys(OBJETIVOS) as ObjetivoDoSite[];
  return (
    <div className="space-y-5">
      <Campo label="Nome do projeto">
        <input
          type="text"
          value={name}
          onChange={(e) => onName(e.target.value)}
          placeholder="Ex: Landing do Cliente X"
          className={INPUT}
          style={inputStyle}
        />
      </Campo>
      <div>
        <div className="mb-2 text-[10px] uppercase tracking-[0.2em]" style={rotulo}>
          Kit base <span style={{ color: 'var(--color-ion-3)' }}>*</span>
        </div>
        {kits.length === 0 ? (
          <div className="text-[12px]" style={{ color: 'var(--color-fg-subtle)' }}>
            Nenhum kit disponível. Monte um em Design Systems.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {kits.map((k) => (
              <button
                key={k.id}
                type="button"
                onClick={() => onKit(k.id)}
                className="ds-glass rounded-lg p-3 text-left"
                style={kitId === k.id ? { borderColor: 'var(--color-ion-5)' } : undefined}
              >
                <div className="text-[13px] font-medium" style={{ color: 'var(--color-fg)' }}>
                  {k.name}
                </div>
                <div
                  className="ds-data mt-1 text-[10px]"
                  style={{ color: 'var(--color-fg-subtle)' }}
                >
                  {k.components.length} componentes
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      <div>
        <div className="mb-1 text-[10px] uppercase tracking-[0.2em]" style={rotulo}>
          O que este site precisa fazer
        </div>
        <p className="mb-2.5 text-[12px]" style={{ color: 'var(--color-fg-subtle)' }}>
          Isso muda a estrutura que o app vai propor na próxima etapa. Você pode trocar tudo depois,
          e pode pular: sem escolha, ele propõe a estrutura mais geral.
        </p>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {objetivos.map((o) => {
            const escolhido = objetivo === o;
            return (
              <button
                key={o}
                type="button"
                // Clicar no que já está escolhido desmarca. Sem isso, a única
                // forma de voltar a "sem objetivo" seria recriar o projeto.
                onClick={() => onObjetivo(escolhido ? null : o)}
                aria-pressed={escolhido}
                className="ds-glass rounded-lg p-3 text-left"
                style={escolhido ? { borderColor: 'var(--color-ion-5)' } : undefined}
              >
                <div className="text-[13px] font-medium" style={{ color: 'var(--color-fg)' }}>
                  {OBJETIVOS[o].rotulo}
                </div>
                <div
                  className="mt-1 text-[11px] leading-relaxed"
                  style={{ color: 'var(--color-fg-subtle)' }}
                >
                  {OBJETIVOS[o].explica}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
