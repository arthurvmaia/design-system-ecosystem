/**
 * O Orbis: o núcleo do sistema, agora com o desenho oficial.
 *
 * Ele aparece em três situações, e só nelas: na marca, quando há trabalho
 * rodando, e nas telas vazias. Nunca sobre conteúdo do usuário, e nunca no
 * site gerado para o cliente. Ali ele não informaria nada e só disputaria
 * atenção com o que a pessoa veio ver.
 *
 * Não existe Orbis estático. Parado, ele lê como ícone decorativo, ou pior,
 * como interface travada. Por isso a animação é o padrão e o componente não
 * oferece como desligar: `girando` é o trabalho (1,4 s), sem ele respira
 * (3,2 s). Quem decide o repouso é `prefers-reduced-motion`, não a tela.
 *
 * Duas fontes de arquivo, pela densidade: até 128 CSS px o de 128 já cobre
 * tela retina com folga; acima disso entra o de 512.
 */
export function Orbis({
  tamanho,
  girando = false,
  esmaecido = false,
  alt,
  className,
}: {
  /** Lado em CSS px. */
  tamanho: number;
  /** Gira: o Orbis no papel de indicador de trabalho. Sem isto, respira. */
  girando?: boolean;
  /** Meio apagado, para tela vazia, onde ele é fundo e não notícia. */
  esmaecido?: boolean;
  /**
   * Texto alternativo. Sem ele o Orbis é decorativo e sai do alcance do
   * leitor de tela, que é o certo na casca do app.
   */
  alt?: string;
  className?: string;
}) {
  const fonte = tamanho > 128 ? "/mascote-512.png" : "/mascote-128.png";
  const animacao = girando ? "orbis-nucleo-gira" : "orbis-nucleo-pulsa";
  return (
    // eslint-disable-next-line @next/next/no-img-element -- PNG local minúsculo; o otimizador só atrapalharia aqui.
    <img
      src={fonte}
      alt={alt ?? ""}
      aria-hidden={alt === undefined ? true : undefined}
      width={tamanho}
      height={tamanho}
      draggable={false}
      className={[animacao, className].filter(Boolean).join(" ")}
      style={{ width: tamanho, height: tamanho, flexShrink: 0, userSelect: "none", opacity: esmaecido ? 0.42 : 1 }}
    />
  );
}
