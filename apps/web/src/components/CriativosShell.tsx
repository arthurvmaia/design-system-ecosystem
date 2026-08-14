import { Mascote } from '@/components/Mascote';
import { Toaster } from '@/components/Toaster';
import { ArrowLeft, Images, Sparkles, Zap } from 'lucide-react';
import { NavLink, Outlet } from 'react-router-dom';

/**
 * A casca PRÓPRIA da frente Criativos.
 *
 * ## Por que ela existe
 *
 * O dono viu a tela dos 4 passos vestida com a moldura do Design System — a
 * sidebar do fluxo (Extrair, Galeria, Kits…), o topo com "57 capturas, 274
 * peças" — e corrigiu a arquitetura: *"a orbis criativo é para ter a própria
 * navegação dela, as 3 frentes do app no portal é para terem seu espaço
 * próprio"*. O Lojas tem a porta 3000 inteira; o Criativos não pode ser um
 * corredor dentro da casa alheia.
 *
 * ## O que ela é, e o que ela não é
 *
 * O CÓDIGO continua no mesmo bundle do app de design system, e isso é decisão
 * da espec que segue valendo: é daqui que a frente puxa a marca dos projetos
 * (`ProjectBranding`), e duplicar app inteiro para o MVP seria infra sem
 * cliente. O que muda é a CASCA: identidade ORBIS CRIATIVOS, navegação dela
 * (a peça, e a volta ao portal), e nada do fluxo de design system na tela.
 * Se um dia a frente crescer para app separado, esta casca é o contorno de
 * recorte — tudo que é dela já mora aqui dentro.
 *
 * A saída é para o PORTAL, não para o app vizinho: é o portal que dá o espaço
 * próprio de cada frente, e é para lá que se volta para trocar. O `<a>` cru e
 * o host dinâmico seguem o idioma do `VoltarAoPortal` da sidebar — o destino é
 * outra origem, e o roteador daqui não sabe nada sobre ela.
 */
export function CriativosShell() {
  const portal = `${window.location.protocol}//${window.location.hostname}:4000`;
  return (
    <div className="relative flex h-screen w-screen flex-col overflow-hidden">
      <div className="ds-halo" aria-hidden="true" />
      <div className="ds-grid" aria-hidden="true" />

      <header
        className="relative z-10 flex items-center gap-4 border-b px-5 py-3"
        style={{ borderColor: 'var(--color-border)', backgroundColor: 'rgba(10, 10, 12, 0.85)' }}
      >
        <span className="flex items-center gap-2.5">
          <Mascote tamanho={26} />
          <span className="leading-tight">
            <span
              className="block text-[13px] font-semibold tracking-[0.22em]"
              style={{ color: 'var(--color-fg)', fontFamily: 'var(--font-display)' }}
            >
              ORBIS
            </span>
            <span
              className="ds-label block text-[9px] tracking-[0.3em]"
              style={{ color: 'rgb(var(--acento))' }}
            >
              CRIATIVOS
            </span>
          </span>
        </span>

        {/* NavLink de verdade agora que a frente tem 2 rotas: o próprio
            NavLink põe aria-current="page" no ativo, e o `end` da primeira
            impede que /criativos/expresso acenda as duas ao mesmo tempo. */}
        <nav className="ml-6 flex items-center gap-1" aria-label="Navegação da frente Criativos">
          {(
            [
              { para: '/criativos', rotulo: 'Nova peça', Icone: Sparkles, soExato: true },
              { para: '/criativos/expresso', rotulo: 'Expresso', Icone: Zap, soExato: false },
              { para: '/criativos/pecas', rotulo: 'Minhas peças', Icone: Images, soExato: false },
            ] as const
          ).map(({ para, rotulo, Icone, soExato }) => (
            <NavLink
              key={para}
              to={para}
              end={soExato}
              className="flex items-center gap-2 rounded-none px-3 py-1.5 text-[12px] transition-colors"
              style={({ isActive }) => ({
                color: isActive ? 'var(--color-fg)' : 'var(--color-fg-muted)',
                backgroundColor: isActive ? 'rgb(var(--acento) / 0.10)' : 'transparent',
              })}
            >
              <Icone size={13} strokeWidth={1.75} />
              {rotulo}
            </NavLink>
          ))}
        </nav>

        <a
          href={portal}
          title="Voltar ao portal da suíte Orbis"
          className="ml-auto flex items-center gap-2 rounded-none px-3 py-1.5 text-[12px] transition-colors"
          style={{ color: 'var(--color-fg-muted)' }}
        >
          <ArrowLeft size={14} strokeWidth={1.75} />
          Trocar de app
        </a>
      </header>

      <main className="ds-fade-in relative z-10 min-h-0 flex-1 overflow-y-auto">
        <Outlet />
      </main>
      <Toaster />
    </div>
  );
}
