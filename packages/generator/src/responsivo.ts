/**
 * Camada RESPONSIVA base do site gerado — mobile de verdade, não página
 * espremida. Carrega DEPOIS do CSS do esqueleto (para vencer larguras fixas
 * dos componentes capturados) e ANTES da marca (a identidade continua por
 * cima de tudo).
 *
 * Princípios:
 * - nada de rolagem horizontal em nenhuma largura;
 * - mídia sempre proporcional ao contêiner;
 * - colunas empilham no celular; linhas de flex podem quebrar;
 * - texto confortável (>=16px de base) e alvos de toque dignos (>=44px);
 * - a identidade do kit fica: cores, fontes e clima não são tocados aqui.
 *
 * O `!important` nas regras de grade é deliberado e CONFINADO ao breakpoint
 * móvel: o CSS capturado de sites reais declara colunas de formas arbitrárias,
 * e sem vencer essa cascata a "versão mobile" seria só a página estreitada.
 */
export const cssResponsivoBase =
  (): string => `/* Camada responsiva — gerada pelo Design System Ecosystem */
html {
  -webkit-text-size-adjust: 100%;
  scroll-behavior: smooth;
}
body {
  overflow-x: hidden;
}
img, video, iframe, canvas, svg, picture {
  max-width: 100%;
  height: auto;
}

@media (max-width: 768px) {
  body {
    font-size: 16px;
    line-height: 1.6;
  }
  /* Colunas empilham: qualquer grade de seção vira uma coluna só. */
  [data-secao] [class*="grid-cols"],
  [data-secao] [style*="grid-template-columns"] {
    grid-template-columns: 1fr !important;
  }
  /* Linhas de flex podem quebrar em vez de estourar a tela. */
  [data-secao] [class*="flex"]:not([class*="flex-col"]) {
    flex-wrap: wrap;
  }
  /* Nada dentro de uma seção pode ser mais largo que a tela. */
  [data-secao] {
    overflow-x: clip;
  }
  [data-secao] * {
    max-width: 100vw;
  }
  /* Respiro lateral mínimo e títulos que cabem. */
  [data-secao] {
    padding-left: max(16px, env(safe-area-inset-left));
    padding-right: max(16px, env(safe-area-inset-right));
  }
  h1 { font-size: clamp(1.75rem, 8vw, 2.75rem); }
  h2 { font-size: clamp(1.4rem, 6vw, 2rem); }
  /* Alvos de toque dignos. */
  a, button, [role="button"], input, select, textarea {
    min-height: 44px;
  }
  /* Navegação horizontal densa vira lista rolável suave, sem estourar. */
  [data-secao="nav"] nav,
  [data-secao="nav"] ul {
    flex-wrap: wrap;
    row-gap: 8px;
  }
  @media (prefers-reduced-motion: reduce) {
    html { scroll-behavior: auto; }
  }
}
`;
