import { api } from '@/lib/api';
import { cn } from '@/lib/cn';
import { primaryNav } from '@/lib/nav';
import { useNivel } from '@/lib/sessao';
import { leituraDeAcervo, rotuloDaRota } from '@/lib/topo-core';
import { useQuery } from '@tanstack/react-query';
import { Menu } from 'lucide-react';
import { NavLink, useLocation } from 'react-router-dom';

/**
 * Barra superior: onde você está, como se anda daqui, e como o laboratório está.
 *
 * A esquerda continua com o propósito de sempre — localizar a pessoa no fluxo.
 * A direita são os números reais do acervo, em mono. No meio, agora, o fluxo
 * inteiro em atalho.
 *
 * A regra que não mudou: nada de infraestrutura na cara do usuário. Chave de
 * API, caminho de disco e afins continuam sendo conversa interna do sistema.
 * O que aparece aqui é a biblioteca DELE — quantas capturas trouxe, quantas
 * peças curou — mais um ponto dizendo se o servidor está de pé, porque quando
 * ele cai a tela inteira mente e é justo avisar.
 *
 * ## Por que a barra ganhou links
 *
 * Ela era o único elemento fixo do app sem um destino clicável: no computador,
 * trocar de etapa só acontecia pela coluna da esquerda, e o topo — que é onde o
 * olho começa a ler a página — não levava a lugar nenhum. Os destinos saem de
 * `primaryNav`, a mesma fonte da coluna e da barra do celular; uma segunda
 * lista de etapas discordaria da primeira na primeira renomeação.
 *
 * ## Ícone só, e o número só no ativo
 *
 * Sete nomes por extenso não cabem aqui junto com o título e os contadores — é
 * o mesmo aperto que a barra do celular já enfrentou, e abreviar continua fora
 * de questão, porque o app tem um vocabulário só. Então cada item é um ícone, e
 * o nome vive no `title` e no `aria-label`. O nome da etapa aberta não faz falta
 * na fileira: ele está a poucos centímetros dali, à esquerda, em tamanho de
 * título. O número do passo aparece só no ativo, porque a pergunta que esta
 * barra responde é "onde estou"; "quantos passos existem" é resposta da coluna,
 * que numera os sete.
 *
 * ## O que cabe em cada largura
 *
 * Abaixo de `lg` os atalhos somem: ali quem navega é a `BarraDeFluxo`, que é
 * `lg:hidden` — as duas nunca aparecem juntas, e duas navegações do mesmo fluxo
 * na mesma tela seriam ruído. Em `lg` exato sobram cerca de 700px para título,
 * atalhos e números, e nesse ponto o rótulo da seção sai de cena: ele comenta o
 * título, enquanto os atalhos levam a algum lugar. De `xl` para cima os dois
 * cabem e ele volta.
 *
 * No celular, a linha da direita não some mais inteira. Fica o ponto de saúde,
 * que é o único dado capaz de mudar a leitura de tudo o que está na tela, e a
 * palavra ao lado dele só ocupa pixel quando a notícia é ruim ("no ar" e
 * "ligando" ficam para o leitor de tela; "fora do ar" aparece em qualquer
 * largura). Os contadores voltam a partir de `md`: abaixo disso eles disputam
 * espaço com o título, e o título é o que localiza. Quem precisa dos números no
 * celular tem a tela de Início, que os mostra por extenso.
 *
 * ## Traço não é zero
 *
 * O contador já sabia mostrar `0` (o `??` nunca confundiu zero com ausente), mas
 * "não consegui contar" e "ainda estou contando" viravam o mesmo traço mudo.
 * Agora os três casos são explícitos e o traço diz de qual se trata — a regra
 * mora em `topo-core.ts`, com teste.
 */
export function TopBar({ aoAbrirMenu }: { aoAbrirMenu: () => void }) {
  const location = useLocation();
  const label = rotuloDaRota(location.pathname);
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
  const estadoDoServidor = saude.isLoading ? 'ligando' : noAr ? 'no ar' : 'fora do ar';

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
            um só ilegível, e o título é o que localiza. Some de novo em `lg`,
            onde o espaço vai para os atalhos, e volta em `xl`. */}
        <span className="ds-label hidden shrink-0 sm:inline lg:hidden xl:inline">
          {label.section}
        </span>
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

      <AtalhosDoFluxo />

      <div className="ml-auto flex shrink-0 items-center gap-3 sm:gap-5">
        <Leitura
          rotulo="capturas"
          total={ds.data?.items.length}
          isError={ds.isError}
          isPending={ds.isPending}
        />
        <Leitura
          rotulo="peças"
          total={lib.data?.items.length}
          isError={lib.isError}
          isPending={lib.isPending}
        />
        <div className="flex items-center gap-2">
          {/* Enquanto liga, o ponto fica neutro: vermelho antes da primeira
              resposta afirma uma queda que ninguém verificou, e no celular este
              ponto é o único sinal que sobrou na barra. */}
          <span
            aria-hidden
            className={noAr ? 'ds-signal-dot' : 'inline-block h-[6px] w-[6px] rounded-full'}
            style={
              noAr
                ? undefined
                : {
                    backgroundColor: saude.isLoading
                      ? 'var(--color-fg-subtle)'
                      : 'var(--color-danger)',
                  }
            }
          />
          {/* O ponto sozinho é ambíguo, então a palavra continua existindo para
              o leitor de tela em qualquer largura; o que ela não faz é gastar
              pixel de celular para dar uma notícia boa. */}
          <span
            className={cn(
              'ds-label whitespace-nowrap',
              noAr || saude.isLoading ? 'sr-only sm:not-sr-only' : '',
            )}
            style={{ color: 'var(--color-fg-muted)' }}
          >
            {estadoDoServidor}
          </span>
        </div>
      </div>
    </header>
  );
}

/**
 * O fluxo em atalho. Existe só de `lg` para cima, onde a `BarraDeFluxo` já
 * saiu de cena.
 *
 * Quem decide o item aceso é o `NavLink`, o mesmo da coluna e da barra de
 * baixo: a rota ativa tem um dono só, o roteador. É ele também que aplica o
 * `aria-current` — o atributo abaixo não marca todos os itens, ele diz QUAL
 * valor usar quando o item for o ativo.
 */
function AtalhosDoFluxo() {
  return (
    <nav
      aria-label="Atalhos do fluxo"
      className="hidden min-w-0 items-center gap-0.5 overflow-x-auto lg:flex"
      // Rede de segurança para larguras apertadas: a fileira rola em vez de
      // empurrar os números para fora da barra.
      style={{ scrollbarWidth: 'none' }}
    >
      {primaryNav.map((item, i) => {
        const Icone = item.icon;
        return (
          <NavLink
            key={item.to}
            to={item.to}
            aria-label={item.label}
            aria-current="page"
            title={item.description ?? item.label}
            className={({ isActive }) =>
              cn(
                'flex h-9 shrink-0 items-center gap-1.5 rounded-md px-1.5 transition-colors duration-300',
                isActive
                  ? 'ds-glass-static text-[var(--color-fg)]'
                  : 'text-[var(--color-fg-subtle)] hover:bg-white/[0.04] hover:text-[var(--color-fg)]',
              )
            }
          >
            {({ isActive }) => (
              <>
                {isActive && (
                  <span
                    aria-hidden
                    className="ds-data text-[9px]"
                    style={{ color: 'var(--color-ion-4)' }}
                  >
                    {String(i + 1).padStart(2, '0')}
                  </span>
                )}
                <Icone size={15} strokeWidth={1.75} />
              </>
            )}
          </NavLink>
        );
      })}
    </nav>
  );
}

/**
 * Uma leitura de instrumento. Zero é um número e aparece como número — discreto,
 * sem acender. O traço fica para o que ainda não sei e para o que não consegui
 * contar, e nesses casos o texto ao lado explica qual dos dois é, em vez de
 * deixar a pessoa concluir que o acervo está vazio.
 */
function Leitura({
  rotulo,
  total,
  isError,
  isPending,
}: { rotulo: string; total: number | undefined; isError: boolean; isPending: boolean }) {
  const leitura = leituraDeAcervo({ total, isError, isPending });
  const cor = leitura.destaque
    ? 'var(--color-ion-3)'
    : leitura.estado === 'contado'
      ? 'var(--color-fg-muted)'
      : 'var(--color-fg-subtle)';

  return (
    <div className="hidden items-baseline gap-1.5 md:flex" title={leitura.explicacao ?? undefined}>
      <span
        className="ds-data text-[13px]"
        style={{ color: cor }}
        aria-hidden={leitura.explicacao !== null}
      >
        {leitura.texto}
      </span>
      <span className="ds-label">{rotulo}</span>
      {leitura.explicacao !== null && <span className="sr-only">{leitura.explicacao}</span>}
    </div>
  );
}
