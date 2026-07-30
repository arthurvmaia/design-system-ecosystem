import { classeDaAnimacao } from '@/lib/animacao-do-nucleo';
import { cn } from '@/lib/cn';

/**
 * O Orbis: o núcleo do sistema.
 *
 * Ele aparece em três situações, e só nelas: na marca, quando há trabalho
 * rodando, e nas telas vazias. **Nunca sobre conteúdo do usuário** — nada de
 * marca d'água em prévia de site ou em card de componente. Ali ele não
 * informaria nada e só disputaria atenção com o que a pessoa veio ver.
 *
 * ## Ele nunca fica parado
 *
 * Não existe Orbis estático. A versão anterior deste componente tinha um modo
 * quieto: `esmaecido` sem `pulsando` desenhava uma imagem imóvel, e era assim
 * que as telas vazias o mostravam, com o argumento de que ali ele era
 * "presença e não evento".
 *
 * O argumento estava errado na prática. Parado, ele lê como ícone decorativo,
 * ou pior, como interface travada: quem chega numa tela vazia e vê um disco
 * imóvel não sabe se o app está pensando ou morto. Um equipamento ligado tem um
 * LED aceso mesmo sem estar fazendo nada, e é essa a informação.
 *
 * Então a animação não é opção, é o padrão, e o componente **não oferece** como
 * desligar. Uma regra que depende de cada tela lembrar de passar `pulsando` é
 * uma regra que volta a ser quebrada na próxima tela nova. Aqui ela é
 * estrutural: não existe prop capaz de produzir um Orbis quieto.
 *
 * Quem decide o repouso é quem usa o computador, não a tela:
 * `prefers-reduced-motion` (e o espelho manual em Configurações) já zeram toda
 * animação do app e continuam valendo. Movimento é o padrão; acessibilidade
 * ganha dele.
 *
 * ## As duas animações
 *
 * `respira` é o repouso: 3,2 s, lento, quase subliminar. `gira` é o trabalho:
 * 1,4 s, com o brilho oscilando junto, porque em 12 px o giro de um desenho
 * radial quase não se percebe sozinho.
 *
 * ## O arquivo
 *
 * Já vem com fundo transparente: o `pnpm mascote` usa o próprio brilho do
 * desenho como máscara de alfa. Por isso ele compõe sobre qualquer superfície
 * (preto puro, painel de vidro ou o vídeo da abertura) sem recorte, sem moldura
 * e sem truque de mistura de camada.
 *
 * Duas fontes de arquivo, pela densidade: até 128 CSS px o de 128 já cobre tela
 * retina com folga; acima disso entra o de 512. Carregar o de 512 num ícone de
 * 26px seria 362 KB para desenhar um ponto.
 */

export function Mascote({
  tamanho,
  girando = false,
  esmaecido = false,
  animacaoPropria = false,
  alt,
  className,
}: {
  /** Lado em CSS px. */
  tamanho: number;
  /**
   * Gira — é o Orbis no papel de indicador de carregamento.
   *
   * Toda espera do app passa por aqui. Um spinner genérico diz "aguarde"; o
   * núcleo girando diz "o sistema está trabalhando", e é a mesma cara que
   * aparece na abertura e na marca. Uma espera é o momento em que a pessoa mais
   * olha para a tela: é caro desperdiçá-lo com um desenho de biblioteca.
   *
   * Sem isto ele respira, que é o repouso. Não há terceira opção.
   */
  girando?: boolean;
  /**
   * Meio apagado — para tela vazia, onde ele é fundo e não notícia.
   *
   * Muda só a opacidade. Antes ele também parava, e era isso que fazia a tela
   * vazia parecer congelada.
   */
  esmaecido?: boolean;
  /**
   * O chamador traz a própria animação no `className`. Um caso só: a marca.
   * Ver `classeDaAnimacao`.
   */
  animacaoPropria?: boolean;
  /**
   * Texto alternativo. Sem ele o Orbis é DECORATIVO e sai do alcance do leitor
   * de tela, que é o certo na casca: repetir "núcleo do sistema" em toda tela
   * seria ruído. Nas telas vazias ele carrega sentido junto com a frase, e aí
   * recebe texto.
   */
  alt?: string;
  className?: string;
}) {
  const fonte = tamanho > 128 ? '/mascote-512.png' : '/mascote-128.png';
  return (
    <img
      src={fonte}
      alt={alt ?? ''}
      aria-hidden={alt === undefined ? true : undefined}
      width={tamanho}
      height={tamanho}
      draggable={false}
      className={cn(
        'shrink-0 select-none',
        classeDaAnimacao({ girando, animacaoPropria }),
        className,
      )}
      style={{ width: tamanho, height: tamanho, opacity: esmaecido ? 0.42 : 1 }}
    />
  );
}
