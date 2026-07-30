import { TRATAMENTO } from '@/lib/orbis';
import { type Preferencias, usePreferencias } from '@/lib/preferencias';
import { toast } from '@/lib/toast';

/**
 * Configurações — só preferências que funcionam de verdade, persistidas no
 * navegador. Nada de diagnóstico técnico: infraestrutura é conversa interna
 * do sistema, não do usuário.
 */
export function SettingsPage() {
  const prefs = usePreferencias();

  const definir = (patch: Partial<Preferencias>, aviso: string): void => {
    prefs.definir(patch);
    toast.ok(aviso);
  };

  return (
    <div className="mx-auto max-w-[720px] px-8 py-16">
      <h1
        className="ds-slide-up ds-text-glow text-[36px] font-medium leading-[1.1] tracking-tight"
        style={{ color: 'var(--color-fg)', fontFamily: 'var(--font-display)' }}
      >
        Do jeito que o {TRATAMENTO} preferir.
      </h1>
      <p
        className="ds-slide-up ds-d1 mt-3 max-w-[56ch] text-[15px] leading-[1.7]"
        style={{ color: 'var(--color-fg-muted)' }}
      >
        Ajuste aqui e eu passo a seguir na hora. Guardo a escolha neste computador.
      </p>

      <div className="mt-10 space-y-4">
        <Bloco
          titulo="Movimento na tela"
          descricao="Eu me mexo bastante enquanto trabalho, e nem todo mundo quer (ou pode) acompanhar isso. Em Reduzir sempre eu fico parado: sem animações, sem efeitos de fundo."
        >
          <Opcoes
            valor={prefs.movimento}
            opcoes={[
              ['sistema', 'Seguir o aparelho'],
              ['reduzir', 'Reduzir sempre'],
            ]}
            aoMudar={(v) =>
              definir(
                { movimento: v as Preferencias['movimento'] },
                v === 'reduzir' ? 'Vou ficar parado.' : 'Sigo o que o aparelho pedir.',
              )
            }
          />
        </Bloco>

        <Bloco
          titulo="Confirmar antes de excluir"
          descricao="Com a confirmação ligada, eu pergunto antes de apagar qualquer componente ou bloco. Desligada, o primeiro clique já apaga, e eu não desfaço."
        >
          <Opcoes
            valor={prefs.confirmarAntesDeExcluir ? 'sim' : 'nao'}
            opcoes={[
              ['sim', 'Sempre perguntar'],
              ['nao', 'Excluir direto'],
            ]}
            aoMudar={(v) =>
              definir(
                { confirmarAntesDeExcluir: v === 'sim' },
                v === 'sim'
                  ? 'Vou perguntar antes.'
                  : 'Não pergunto mais: o primeiro clique apaga.',
              )
            }
          />
        </Bloco>

        <Bloco
          titulo="Abertura do aplicativo"
          descricao="A sequência que eu mostro quando o aplicativo abre."
        >
          <Opcoes
            valor={prefs.introAoAbrir}
            opcoes={[
              ['primeira-vez', 'Só na primeira visita'],
              ['sempre', 'Sempre'],
            ]}
            aoMudar={(v) =>
              definir({ introAoAbrir: v as Preferencias['introAoAbrir'] }, 'Anotado.')
            }
          />
        </Bloco>

        <Bloco
          titulo="Som da abertura"
          descricao="Na abertura eu toco uma trilha curta. Em Mudo eu abro em silêncio, e não pergunto de novo."
        >
          <Opcoes
            valor={prefs.somDaIntro ? 'sim' : 'nao'}
            opcoes={[
              ['sim', 'Com som'],
              ['nao', 'Mudo'],
            ]}
            aoMudar={(v) =>
              definir(
                { somDaIntro: v === 'sim' },
                v === 'sim' ? 'Volto a tocar na abertura.' : 'Abro em silêncio.',
              )
            }
          />
        </Bloco>
      </div>
    </div>
  );
}

function Bloco({
  titulo,
  descricao,
  children,
}: {
  titulo: string;
  descricao: string;
  children: React.ReactNode;
}) {
  return (
    <div className="ds-glass-static rounded-xl p-5">
      <div className="text-[15px] font-medium" style={{ color: 'var(--color-fg)' }}>
        {titulo}
      </div>
      <p
        className="mt-1 max-w-[52ch] text-[13px] leading-relaxed"
        style={{ color: 'var(--color-fg-muted)' }}
      >
        {descricao}
      </p>
      <div className="mt-3">{children}</div>
    </div>
  );
}

function Opcoes({
  valor,
  opcoes,
  aoMudar,
}: {
  valor: string;
  opcoes: readonly (readonly [string, string])[];
  aoMudar: (v: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {opcoes.map(([v, r]) => (
        <button
          key={v}
          type="button"
          aria-pressed={valor === v}
          onClick={() => aoMudar(v)}
          className="rounded-full border px-4 py-2 text-[13px] transition-colors"
          style={{
            borderColor: valor === v ? 'var(--color-primary)' : 'var(--color-border)',
            backgroundColor: valor === v ? 'rgba(14,165,233,0.18)' : 'transparent',
            color: valor === v ? 'var(--color-fg)' : 'var(--color-fg-muted)',
          }}
        >
          {r}
        </button>
      ))}
    </div>
  );
}
