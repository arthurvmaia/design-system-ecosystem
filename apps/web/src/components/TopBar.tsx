import { api } from '@/lib/api';
import { useNivel } from '@/lib/sessao';
import { useQuery } from '@tanstack/react-query';
import { Menu } from 'lucide-react';
import { useLocation } from 'react-router-dom';

/**
 * Barra superior: onde você está, e como o laboratório está.
 *
 * A esquerda continua com o único propósito de antes — localizar a pessoa no
 * fluxo. A direita é nova e é a peça que mais empurra a interface para "painel
 * de instrumento": números reais do acervo, em mono, sempre à vista.
 *
 * A regra que não mudou: nada de infraestrutura na cara do usuário. Chave de
 * API, caminho de disco e afins continuam sendo conversa interna do sistema.
 * O que aparece aqui é a biblioteca DELE — quantas capturas trouxe, quantas
 * peças curou — mais um ponto dizendo se o servidor está de pé, porque quando
 * ele cai a tela inteira mente e é justo avisar.
 */
export function TopBar({ aoAbrirMenu }: { aoAbrirMenu: () => void }) {
  const location = useLocation();
  const label = pageLabel(location.pathname);
  const nivel = useNivel();

  // As mesmas queryKeys que a barra lateral e as telas já usam: o cache é
  // compartilhado, então isto não gera requisição nova nem fica desatualizado.
  const ds = useQuery({ queryKey: ['design-systems'], queryFn: api.listDesignSystems });
  const lib = useQuery({ queryKey: ['library'], queryFn: api.listLibrary });
  const saude = useQuery({
    queryKey: ['health'],
    queryFn: api.health,
    refetchInterval: 20000,
    retry: false,
  });

  const noAr = saude.data?.status === 'ok';

  return (
    <header
      className="ds-backdrop relative z-20 flex h-[64px] shrink-0 items-center gap-3 border-b px-4 sm:gap-6 sm:px-8"
      style={{ borderColor: 'var(--color-border)', backgroundColor: 'rgba(0, 0, 0, 0.66)' }}
    >
      {/* A porta da gaveta. Só existe onde a coluna não cabe. */}
      <button
        type="button"
        onClick={aoAbrirMenu}
        aria-label="Abrir o menu"
        // 44px: abaixo disso o dedo erra e a pessoa toca duas vezes.
        className="-ml-2 flex h-11 w-11 shrink-0 items-center justify-center lg:hidden"
        style={{ color: 'var(--color-fg-muted)' }}
      >
        <Menu size={18} />
      </button>

      <div className="flex min-w-0 items-baseline gap-3">
        {/* O rótulo da seção some no celular: dois textos disputando 200px viram
            um só ilegível, e o título é o que localiza. */}
        <span className="ds-label hidden shrink-0 sm:inline">{label.section}</span>
        <span
          className="ds-interactive-text truncate text-[17px] font-medium sm:text-[20px]"
          style={{ color: 'var(--color-fg)', fontFamily: 'var(--font-display)' }}
        >
          {label.title}
        </span>
      </div>

      {/* O selo do modo visita. Fica visível SEMPRE que a sessão for de visita,
          inclusive no celular: quem entrou para olhar precisa saber por que o
          botão de excluir vai recusar, antes de clicar nele. */}
      {nivel === 'visita' && (
        <span
          className="ml-2 shrink-0 rounded-none border px-2 py-0.5 text-[9px] uppercase tracking-[0.16em]"
          style={{
            borderColor: 'color-mix(in srgb, var(--color-accent) 40%, transparent)',
            color: 'var(--color-ion-3)',
            fontFamily: 'var(--font-mono)',
          }}
          title="Esta credencial abre para ver. Navegue tudo; mudar, só com a credencial de administrador."
        >
          modo visita
        </span>
      )}

      <div className="ml-auto hidden items-center gap-5 lg:flex">
        <Leitura rotulo="capturas" valor={ds.data?.items.length} />
        <Leitura rotulo="peças" valor={lib.data?.items.length} />
        <div className="flex items-center gap-2">
          <span
            aria-hidden
            className={noAr ? 'ds-signal-dot' : 'inline-block h-[6px] w-[6px] rounded-full'}
            style={noAr ? undefined : { backgroundColor: 'var(--color-danger)' }}
          />
          <span className="ds-label" style={{ color: 'var(--color-fg-muted)' }}>
            {saude.isLoading ? 'ligando' : noAr ? 'no ar' : 'fora do ar'}
          </span>
        </div>
      </div>
    </header>
  );
}

/**
 * Uma leitura de instrumento. Enquanto o número não chega, mostra um traço em
 * vez de zero: zero é uma informação, e "ainda não sei" é outra.
 */
function Leitura({ rotulo, valor }: { rotulo: string; valor: number | undefined }) {
  return (
    <div className="flex items-baseline gap-1.5">
      <span
        className="ds-data text-[13px]"
        style={{ color: valor === undefined ? 'var(--color-fg-subtle)' : 'var(--color-ion-3)' }}
      >
        {valor ?? '—'}
      </span>
      <span className="ds-label">{rotulo}</span>
    </div>
  );
}

/** Rótulos humanos por etapa — o propósito da tela, não o número do pipeline. */
function pageLabel(pathname: string): { section: string; title: string } {
  if (pathname.startsWith('/inicio')) return { section: 'Estou pronto', title: 'Início' };
  if (pathname.startsWith('/extract')) return { section: 'Me traga referências', title: 'Extrair' };
  if (pathname.startsWith('/gallery')) return { section: 'O que eu capturei', title: 'Galeria' };
  if (pathname.startsWith('/library')) return { section: 'Peças guardadas', title: 'Biblioteca' };
  if (pathname.startsWith('/design-systems')) {
    return { section: 'O que eu monto com', title: 'Kits' };
  }
  if (pathname.startsWith('/projects')) {
    return { section: 'Monto com o seu kit', title: 'Gerar site' };
  }
  if (pathname.startsWith('/meus-projetos')) {
    return { section: 'O que eu já montei', title: 'Meus sites' };
  }
  if (pathname.startsWith('/revisao')) {
    return { section: 'Preciso do seu olhar', title: 'Pendências' };
  }
  if (pathname.startsWith('/settings')) return { section: 'Do seu jeito', title: 'Configurações' };
  return { section: '', title: 'Início' };
}
