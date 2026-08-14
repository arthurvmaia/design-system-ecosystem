# Matriz de UI/UX do Orbis

O que toda tela da suíte precisa cumprir, **como medir cada item** e o estado
medido em 2026-08-14. Escrita a partir da varredura das 11 telas da frente
Design System e do Portal, para ser aplicada nas outras duas frentes — **Lojas**
(porta 3000) e **Criativos**.

Isto não é um guia de estilo. É uma régua: cada linha tem um comando que
responde passou ou não passou, e um número. Item sem como medir não entra.

---

## Como medir

```powershell
pnpm conferir <endereço|pasta> --credencial <senha do portão>
```

A régua abre a página em **1440×900** (quem trabalha) e **390×844 com perfil de
celular de verdade** — `isMobile`, `hasTouch`, densidade 3. Isso importa: sem o
perfil, `@media (hover: hover)` responde que há mouse e `(pointer: coarse)` que
o ponteiro é fino, e todo controle escondido atrás de hover passa despercebido.

O `--credencial` nasceu desta varredura. Sem ele a régua media a **tela de
login** — seis elementos, dez vereditos verdes — e parecia que o app inteiro
passava. Ela faz login pela API, recebe o cookie assinado e injeta no contexto
do navegador (o cookie é `HttpOnly`; a página não consegue colocá-lo sozinha).

**Duas armadilhas de medição, aprendidas aqui:**

1. **Navegador novo toca a abertura.** A régua sempre abre sessão limpa, então
   a sequência de abertura do Orbis (`som`, `pular`) está sempre no ar durante a
   medida. Os três alvos pequenos que aparecem em **todas** as telas são dela, e
   os textos a 0% de opacidade em `/inicio` são a página atrás do overlay. Defeito
   real na abertura, artefato de medição no resto — não conte duas vezes.
2. **Print de página inteira mente.** O Playwright redimensiona a viewport para
   capturar tudo e re-dispara os observadores de rolagem. Meça dobra por dobra.

---

## A matriz

Legenda: **✓** medido e passa · **✗** medido e falha · **—** não se aplica ·
**?** ainda não medido.

| # | O que se cobra | Como medir | Piso | Design System | Portal | Lojas | Criativos |
|---|---|---|---|---|---|---|---|
| 1 | **O texto se lê contra o fundo que caiu atrás dele** | S4, contraste WCAG medido no par resolvido | 4.5:1 | ✓ 11/11 | ✓ | ? | ? |
| 2 | **Nenhum texto fica apagado** | S13, opacidade computada | > 10% | ✓ (só a abertura) | ✗ 1 a 28% | ? | ? |
| 3 | **O dedo acerta o alvo** | S15, retângulo do controle a 390px | 44×44px | ✗ **11/11** | ✗ 1 | ? | ? |
| 4 | **A letra se lê no celular** | S16, `font-size` computado a 390px | 12px | ✓ 11/11 | ✓ | ? | ? |
| 5 | **Nada transborda a tela** | S12, largura do conteúdo × viewport | 0 | ✓ 11/11 | ✓ | ? | ? |
| 6 | **Uma barra de rolagem só** | S18, `scrollWidth` do documento | 1 | ✓ 11/11 | ✓ | ? | ? |
| 7 | **Nenhuma seção colapsa** | S14, altura da seção | > 0 | ✓ 11/11 | ✓ | ? | ? |
| 8 | **O respiro entre blocos é de gente** | S19, distância vertical medida | — | ✓ 11/11 | ✓ | ? | ? |
| 9 | **Toda vaga de mídia foi preenchida** | S11 / S17 | 0 vazias | ✓ 11/11 | ✓ | ? | ? |
| 10 | **Nenhum controle vive só no hover** | `opacity < 0.1` em `button/a` com perfil de toque | 0 | ✗ **6 por tela de grade** | ✓ | ? | ? |
| 11 | **O console abre limpo** | `console.error` na carga da tela | 0 | ✗ **9 erros** | ✓ | ? | ? |
| 12 | **A página não é mais alta que o conteúdo** | S20 | 20% | — não se aplica | — | ? | ? |

**Leitura da matriz em uma frase:** o que depende de *cor, tipografia, geometria
e respiro* passa em tudo; o que depende de **toque** falha em tudo.

---

## Os achados, com número

### 1. Alvo de toque abaixo de 44px — todas as 11 telas

| Tela | Alvos < 44px a 390px |
|---|---|
| `/library` | 48 |
| `/gallery` | 37 |
| `/settings` | 31 |
| `/extract` | 26 |
| `/revisao` | 25 |
| `/projects` | 24 |
| `/expresso`, `/design-systems` | 23 |
| `/inicio`, `/meus-projetos` | 22 |
| Portal | 1 (`Desligar o Orbis`, 164×30) |

**Por que passou até hoje:** o piso de 44px foi aplicado — e está no CSS, com
comentário — mas só em `.portao-campo` e `.portao-botao`, as classes da **tela
de login**. A régua não passava do login, então o conserto foi exatamente até
onde alguém conseguia enxergar. Medir mais fundo é o que revelou o resto.

**A lista de conserto, por classe** (medida em `/gallery`, 60 controles):

| Qtd | Tamanho | O que é | Classe |
|---|---|---|---|
| 11 | 235×40 | item do menu lateral | `px-3 py-2.5 text-[13px]` |
| 7 | 16×16 | caixa de seleção | `h-4 w-4 accent-[…]` |
| 7 | 109×27 | etiqueta de filtro | `ds-tag … px-3 py-1 text-[11px]` |
| 7 | 42×**44** | passo numerado | `min-h-[44px] min-w-[42px]` |
| 6 | 32×32 | ação de cartão (**e a 0% de opacidade**) | `h-8 w-8 … opacity-0` |
| 6 | 36×36 | ação de barra | `h-9 w-9` |
| 5 | 28×28 | fechar, canto do cartão | `absolute top-2.5 right-2.5 h-7 w-7` |
| 1 | 30×36 | **abrir o menu no celular** | `h-9 w-9 lg:hidden` |
| 1 | 332×36 | `Classificar com IA` | `ds-btn …` |
| 1 | 348×32 | campo de busca | `ds-data … py-1.5` |

Duas merecem nome próprio. O `min-h-[44px] min-w-[42px]` mostra que **alguém já
tentou** o piso e cobriu só a altura — faltam 2px de largura. E o `h-9 w-9
lg:hidden` é o botão que **abre o menu no celular**: 30×36px, ou seja, o único
caminho para navegar no telefone é o alvo mais difícil de acertar da tela.

### 2. Seis controles que o dedo nunca alcança

Nas telas de grade, as ações do cartão nascem em `opacity-0` e só aparecem no
hover. Num telefone não existe hover: elas ficam **permanentemente invisíveis** e
ainda por cima medem 32×32px. Não é preferência de estilo — é função que não
existe para quem está no celular.

### 3. Nove erros de console, e eles não são do app

Todos vêm dos **bundles capturados** rodando na prévia da Galeria:

| Erro | Causa | De quem é |
|---|---|---|
| CSP bloqueia `api.iconify.design`, `api.unisvg.com`, `api.simplesvg.com` (6 erros) | a política da prévia libera só `assets.unicorn.studio` | **nossa** |
| `Cannot read properties of null (reading 'querySelector')` em `initPulsewave` | o script da peça não acha o elemento que procura | **nossa** (é o que a regra G9 cobra) |
| `Cannot use import statement outside a module` | script de módulo servido como clássico | **nossa** |
| `Cannot close a closed AudioContext` | inofensivo | da origem |

Três das quatro causas são do nosso lado do pipeline, não do site de origem. O
ícone que não aparece na prévia não é o site que quebrou: é a nossa lista de
domínios liberados.

### 4. Portal

Passa em tudo, menos dois: `Desligar o Orbis` a 164×**30**px, e um parágrafo a
**28%** de opacidade ("Os três são independentes…"). O parágrafo é decisão de
estilo, mas 28% reprova a régua que o próprio Orbis cobra dos outros — ou sobe a
opacidade, ou a régua vira decoração.

---

## O que levar para Lojas e Criativos

Estas são as decisões que **já custaram retrabalho aqui** e que valem a pena
nascer certas nas outras duas frentes:

1. **44×44px é piso de componente, não de tela.** Aplicar no `.btn` base, no
   item de menu, na etiqueta, na caixa de seleção e no botão de ícone — uma vez,
   na camada de componente. Aplicar por tela é como este app chegou a 11 telas
   reprovadas com o conserto já escrito no CSS.
2. **Nenhuma função pode existir só no hover.** Se aparece no hover no desktop,
   precisa estar visível (ou alcançável por toque) no celular. `@media (hover:
   hover)` é o lugar de esconder, e o padrão é aparecer.
3. **A régua roda com credencial desde o primeiro dia.** Medir a tela de login e
   comemorar dez verdes é o erro mais barato de cometer e o mais caro de
   descobrir depois.
4. **Console limpo é requisito de entrega.** Erro de console na prévia é função
   que não funciona; nove deles passaram meses invisíveis porque ninguém media.
5. **Separe defeito de artefato de medição.** Abertura, animação de revelação e
   carregamento produzem estados transitórios reais. Meça, mas classifique — um
   relatório que mistura os dois ensina a ignorar o relatório.
6. **O piso vale para as três frentes ou não vale para nenhuma.** O Orbis cobra
   44px, contraste e responsividade de todo site que **gera**. Cobrar dos outros
   o que não se cumpre é o defeito que esta varredura encontrou primeiro.

---

## Onde ficam as evidências

- Varredura das 11 telas: `pnpm conferir <endereço> --credencial <senha>`,
  reproduzível a qualquer momento.
- O `--credencial` e seus testes: `scripts/conferir-site.ts`,
  `scripts/conferir-site.test.ts`.
- As regras e o que cada uma cobra: `docs/regras-de-aceite.md`,
  `packages/shared/src/regras-de-aceite.ts`.
