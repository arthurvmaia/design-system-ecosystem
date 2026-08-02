import { cn } from '@/lib/cn';
import { primaryNav } from '@/lib/nav';
import { useEffect, useRef } from 'react';
import { NavLink, useLocation } from 'react-router-dom';

/**
 * A navegação do celular: uma barra do fluxo, embaixo, sempre à vista.
 *
 * ## Por que ela existe
 *
 * A gaveta sozinha cobrava DOIS toques por tela (abrir, escolher) e cobria 260
 * dos 390px enquanto estava aberta. No computador a coluna fica à vista e um
 * clique basta — a versão de celular estava pedindo o dobro de trabalho para o
 * gesto mais comum do app, que é andar entre as etapas.
 *
 * ## Só a etapa atual mostra o nome
 *
 * Medido: sete nomes inteiros pedem 390px só de texto, e o sétimo — "Meus
 * sites" — ficava fora da tela. Uma barra de navegação cujo último destino
 * está escondido não é navegação, é uma gaveta deitada.
 *
 * Abreviar seria a saída óbvia e custaria caro: o app acabou de unificar o
 * vocabulário, e dar um segundo nome a uma tela só porque a tela é estreita
 * desfaz isso.
 *
 * Então os inativos são número + ícone, e só o ATIVO abre o nome. Cabem os
 * sete, sem rolagem escondida, e a pergunta que a barra responde o tempo todo é
 * a certa: onde eu estou. Os números 01–07 dão o resto — quanto já andei e
 * quanto falta.
 *
 * A rolagem lateral continua ali como rede de segurança, para telas ainda mais
 * estreitas, e a etapa atual é trazida para a vista a cada troca de rota.
 */
export function BarraDeFluxo() {
  const { pathname } = useLocation();
  const faixa = useRef<HTMLDivElement>(null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: trazer o ativo à vista é o efeito de MUDAR de rota; `pathname` é a dependência real.
  useEffect(() => {
    const ativo = faixa.current?.querySelector('[data-ativo="sim"]');
    ativo?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
  }, [pathname]);

  return (
    <nav
      ref={faixa}
      aria-label="Etapas do fluxo"
      className="ds-backdrop flex shrink-0 gap-1 overflow-x-auto border-t px-2 py-1.5 lg:hidden"
      style={{
        borderColor: 'var(--color-border)',
        backgroundColor: 'rgba(0, 0, 0, 0.86)',
        // O respiro da barra de gestos do iPhone. Sem isto o último item fica
        // debaixo da faixa do sistema e não recebe toque.
        paddingBottom: 'calc(0.375rem + env(safe-area-inset-bottom))',
        scrollbarWidth: 'none',
      }}
    >
      {primaryNav.map((item, i) => {
        const Icone = item.icon;
        return (
          <NavLink
            key={item.to}
            to={item.to}
            aria-label={item.label}
            className={({ isActive }) =>
              cn(
                // 44px é o mínimo que um dedo acerta sem tentar duas vezes.
                // Não é enfeite: abaixo disso a barra erra o alvo.
                'flex min-h-[44px] min-w-[42px] shrink-0 flex-col items-center justify-center gap-0.5 rounded-md px-1.5 transition-colors',
                isActive
                  ? 'ds-glass-static px-2.5 text-[var(--color-fg)]'
                  : 'text-[var(--color-fg-subtle)]',
              )
            }
          >
            {({ isActive }) => (
              <>
                <span data-ativo={isActive ? 'sim' : 'nao'} className="flex items-center gap-1">
                  <span
                    aria-hidden
                    className="ds-data text-[9px]"
                    style={{ color: isActive ? 'var(--color-ion-4)' : 'var(--color-fg-subtle)' }}
                  >
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <Icone size={14} strokeWidth={1.75} />
                </span>
                {isActive && (
                  <span
                    className="text-[10px] whitespace-nowrap"
                    style={{ fontFamily: 'var(--font-body)' }}
                  >
                    {item.label}
                  </span>
                )}
              </>
            )}
          </NavLink>
        );
      })}
    </nav>
  );
}
