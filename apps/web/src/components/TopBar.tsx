import { api } from '@/lib/api';
import { useQuery } from '@tanstack/react-query';
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
 * O que aparece aqui é o acervo DELE — quantos sistemas trouxe, quantas peças
 * curou — mais um ponto dizendo se o servidor está de pé, porque quando ele cai
 * a tela inteira mente e é justo avisar.
 */
export function TopBar() {
  const location = useLocation();
  const label = pageLabel(location.pathname);

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
      className="ds-backdrop relative z-20 flex h-[64px] shrink-0 items-center gap-6 border-b px-8"
      style={{ borderColor: 'var(--color-border)', backgroundColor: 'rgba(0, 0, 0, 0.66)' }}
    >
      <div className="flex min-w-0 items-baseline gap-3">
        <span className="ds-label shrink-0">{label.section}</span>
        <span
          className="ds-interactive-text truncate text-[20px] font-medium"
          style={{ color: 'var(--color-fg)', fontFamily: 'var(--font-display)' }}
        >
          {label.title}
        </span>
      </div>

      <div className="ml-auto hidden items-center gap-5 lg:flex">
        <Leitura rotulo="sistemas" valor={ds.data?.items.length} />
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
  if (pathname.startsWith('/extract')) return { section: 'Traga referências', title: 'Extrair' };
  if (pathname.startsWith('/gallery')) return { section: 'Escolha o que gostou', title: 'Galeria' };
  if (pathname.startsWith('/library')) return { section: 'Seu acervo', title: 'Biblioteca' };
  if (pathname.startsWith('/design-systems')) {
    return { section: 'Suas curadorias', title: 'Design Systems' };
  }
  if (pathname.startsWith('/projects')) return { section: 'Monte o seu site', title: 'Gerar site' };
  if (pathname.startsWith('/meus-projetos')) {
    return { section: 'Prontos para usar', title: 'Meus sites' };
  }
  if (pathname.startsWith('/revisao')) {
    return { section: 'Precisa do seu olhar', title: 'Pendências' };
  }
  if (pathname.startsWith('/settings')) return { section: 'Do seu jeito', title: 'Configurações' };
  return { section: '', title: 'Início' };
}
