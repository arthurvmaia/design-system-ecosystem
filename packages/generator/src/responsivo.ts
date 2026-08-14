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
/*
  O embrulho da AMOSTRA é do motor, não da origem — e as classes dele também.

  \`embrulhar\` (segmenter) veste o subcomponente num
  \`<div data-ds-amostra class="flex flex-col gap-6 p-8">\`, apostando que esses
  utilitários existem no CSS capturado. Quando a origem nunca usou \`p-8\`, o
  padding é zero e o \`align-items: stretch\` do flex estica o botão até os
  1440px da tela — e um \`skewX(-12°)\` projeta a caixa 6px além da borda
  (medido no kit Loja de produto físico; \`max-width\` não segura porque o
  excesso é da bounding box do transform, não da largura de layout).

  O preview JÁ tem exatamente esta rede no ESTILO_BASE dele, pelo mesmo
  motivo. O site gerado não tinha. Especificidade (0,2,0) vence as regras
  escopadas por \`:where()\` sem precisar de !important, e o alcance é SÓ o
  embrulho que o próprio motor escreveu — o desenho da peça não é tocado.
*/
[data-secao] [data-ds-amostra] {
  display: flex;
  flex-direction: column;
  gap: 24px;
  padding: 32px;
  align-items: flex-start;
}
[data-secao] [data-ds-amostra="botoes"] {
  flex-direction: row;
  flex-wrap: wrap;
  align-items: center;
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
  /*
    Alvos de toque dignos — e agora nas DUAS medidas, com peso para vencer.

    A versão anterior definia só \`min-height\` e sem \`!important\`, e a regra S15
    (que passou a MEDIR isto) mostrou o buraco no primeiro site: um botão de
    menu saiu 24x44px. Alto o bastante, estreito demais — o dedo erra na
    horizontal do mesmo jeito. E qualquer regra mais específica da peça
    capturada sobrepunha a intenção em silêncio.

    O \`!important\` fica confinado ao breakpoint móvel, como o do grid logo
    acima: no desktop o desenho da origem manda.

    \`inline-flex\` para o botão-ícone porque \`min-width\` sozinho alarga a caixa
    e deixa o ícone encostado num canto; centrar é parte de acertar o alvo.
  */
  /*
    Checkbox e radio ficam FORA da inflacao: o controle de marcar e pequeno DE
    PROPOSITO (o desenho da peca pinta borda e fundo nele), e o min-height o
    esticava para 16x44 — deformava a essencia E continuava reprovando, porque
    a largura seguia 16. O alvo do dedo e o ROTULO, e e ele que cresce abaixo.
  */
  a, button, [role="button"], [role="tab"], input:not([type="checkbox"]):not([type="radio"]), select, textarea, summary {
    min-height: 44px !important;
  }
  /*
    O rotulo que carrega (ou aponta para) o controle E o alvo real: label[for]
    e label:has(input) ativam o campo nativamente, entao crescer o rotulo e
    crescer o alvo — sem tocar o desenho do controle (a trilha do toggle de
    32x16 continua 32x16, centrada dentro do rotulo). Medido no banco: 7 alvos
    (3 checkboxes desenhados + 4 toggles sr-only) passam a 44x44 pelo rotulo.
  */
  label:has(input[type="checkbox"]), label:has(input[type="radio"]), label[for] {
    display: inline-flex;
    align-items: center;
    min-height: 44px !important;
    min-width: 44px !important;
  }
  button, [role="button"], [role="tab"], input[type="button"], input[type="submit"], summary {
    min-width: 44px !important;
  }
  button, [role="button"], [role="tab"] {
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }
  /*
    O LINK DE MENU precisa das duas coisas que ele nao tem sozinho.

    Medido no banco de prova, em 390px: onze links saiam \`display: inline\` com
    17px de altura — e \`min-height\` NAO SE APLICA a elemento inline nao
    substituido, entao a regra acima existia e nao valia para eles. Outros dez
    saiam com 20 a 43px de largura, porque \`min-width\` so alcancava botao e
    campo.

    O alcance sao os contextos de NAVEGACAO — nav, rodape e item de lista. Link
    no meio de um paragrafo continua inline de proposito: engorda-lo esburacaria
    a leitura, e a propria WCAG 2.5.8 o isenta.
  */
  nav a, [data-secao="nav"] a, footer a, [data-secao="footer"] a, li > a {
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }
  /*
    A LARGURA minima vale para TODO link e botao da secao, nao so os de menu.

    A versao anterior prendia \`min-width\` ao mesmo seletor do \`inline-flex\`, e
    com isso alcancava so nav, rodape e item de lista. Medido em 390px: vinte e
    cinco links de icone saiam com 40 a 43px de largura — a um pixel de passar —
    porque estavam soltos no meio da secao, fora daqueles tres contextos.

    Alargar aqui e seguro justamente onde o \`inline-flex\` nao seria: \`min-width\`
    NAO se aplica a elemento inline nao substituido, entao o link no meio de um
    paragrafo continua exatamente como esta, e so o que ja e bloco engorda.
  */
  [data-secao] a, [data-secao] button, [data-secao] [role="button"] {
    min-width: 44px !important;
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
