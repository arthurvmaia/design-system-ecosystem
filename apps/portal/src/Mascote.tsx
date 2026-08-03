/**
 * O Orbis do vestíbulo.
 *
 * Mesma doutrina do resto da suíte: ele nunca fica parado. Respira em repouso,
 * gira quando está trabalhando — e some quando há conteúdo do usuário na tela,
 * que aqui nunca é o caso, porque o portal é só a porta.
 *
 * O componente é autocontido de propósito. O portal não importa nada do app de
 * design system nem do app de lojas: são três coisas independentes que apenas
 * se parecem.
 */
export function Mascote({
  tamanho,
  girando = false,
  alt,
}: {
  tamanho: number;
  girando?: boolean;
  alt?: string;
}) {
  return (
    <img
      className={girando ? 'mascote mascote-gira' : 'mascote mascote-respira'}
      src={tamanho > 128 ? '/mascote-512.png' : '/mascote-128.png'}
      width={tamanho}
      height={tamanho}
      style={{ width: tamanho, height: tamanho }}
      alt={alt ?? ''}
      aria-hidden={alt === undefined}
      draggable={false}
    />
  );
}
