import { cn } from '@/lib/cn';

/**
 * O mascote: o núcleo do sistema.
 *
 * Ele aparece em três situações, e só nelas: na marca, quando há trabalho
 * rodando, e nas telas vazias. **Nunca sobre conteúdo do usuário** — nada de
 * marca d'água em prévia de site ou em card de componente. Ali ele não
 * informaria nada e só disputaria atenção com o que a pessoa veio ver.
 *
 * O arquivo já vem com fundo transparente: o `pnpm mascote` usa o próprio brilho
 * do desenho como máscara de alfa. Por isso ele compõe sobre qualquer superfície
 * — preto puro, painel de vidro ou o vídeo da abertura — sem recorte, sem
 * moldura e sem truque de mistura de camada.
 *
 * Duas fontes de arquivo, pela densidade: até 128 CSS px o de 128 já cobre tela
 * retina com folga; acima disso entra o de 512. Carregar o de 512 num ícone de
 * 26px seria 362 KB para desenhar um ponto.
 */
export function Mascote({
  tamanho,
  pulsando = false,
  girando = false,
  esmaecido = false,
  alt,
  className,
}: {
  /** Lado em CSS px. */
  tamanho: number;
  /** Respira devagar — para quando há trabalho acontecendo. */
  pulsando?: boolean;
  /**
   * Gira — é o mascote no papel de indicador de carregamento.
   *
   * Toda espera do app passa por aqui. Um spinner genérico diz "aguarde"; o
   * núcleo girando diz "o sistema está trabalhando", e é a mesma cara que
   * aparece na abertura e na marca. Uma espera é o momento em que a pessoa mais
   * olha para a tela: é caro desperdiçá-lo com um desenho de biblioteca.
   */
  girando?: boolean;
  /** Meio apagado — para tela vazia, onde ele é presença e não evento. */
  esmaecido?: boolean;
  /**
   * Texto alternativo. Sem ele o mascote é DECORATIVO e sai do alcance do leitor
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
        girando && 'ds-nucleo-gira',
        pulsando && !girando && 'ds-nucleo-pulsa',
        className,
      )}
      style={{ width: tamanho, height: tamanho, opacity: esmaecido ? 0.42 : 1 }}
    />
  );
}
