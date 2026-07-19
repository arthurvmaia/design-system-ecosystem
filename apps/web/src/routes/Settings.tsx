import { PhasePlaceholder } from '@/components/PhasePlaceholder';
import { api } from '@/lib/api';
import { useQuery } from '@tanstack/react-query';

export function SettingsPage() {
  const health = useQuery({ queryKey: ['health'], queryFn: api.health });

  return (
    <PhasePlaceholder
      phase="Sistema"
      title="Configurações do ecossistema."
      intent="Aqui vão ficar as escolhas globais: modelos de LLM usados por operação, política de cache, atalho para abrir a pasta de dados no Finder, opções de export e import de biblioteca."
      ready={[
        'Preferências gravadas em ecosystem.config.json na raiz de dados.',
        'Diagnóstico do backend (server, banco, chave) em tempo real.',
      ]}
      next={[
        'Editor visual das preferências.',
        'Ações destrutivas com confirmação (limpar cache, resetar índice).',
        'Export e import de library.',
      ]}
    >
      <div className="ds-glass-static rounded-xl p-6">
        <div
          className="text-[10px] uppercase tracking-[0.28em]"
          style={{ color: 'var(--color-fg-subtle)', fontFamily: 'var(--font-display)' }}
        >
          Estado atual do backend
        </div>
        <pre
          className="ds-data mt-4 overflow-x-auto text-[12px] leading-[1.7]"
          style={{ color: 'var(--color-fg)' }}
        >
          {JSON.stringify(health.data ?? { loading: true }, null, 2)}
        </pre>
      </div>
    </PhasePlaceholder>
  );
}
