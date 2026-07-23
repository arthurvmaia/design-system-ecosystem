# Páginas de teste

Páginas locais que representam os cenários de captura, para validar a extração
de ponta a ponta sem depender de um site externo.

## `kitchen-sink.html`

Uma página só que reúne **todos** os cenários do pedido:

| Cenário | Onde | O que o pipeline deve fazer |
|---|---|---|
| Componente estático | `.hero`, `#preco` | segmento normal, fidelidade `completo` |
| Hover no elemento | `.btn` | interação `hover` (CSS) |
| Hover em região interna | `.region .reveal` | preserva o efeito de hover na sub-região |
| Foco / focus-visible | `.focusable` | interação `focus` |
| Botão com clique | `.btn` | clique seguro na exploração |
| Accordion | `.accordion-item` | `toggle`, fidelidade `parcial` sem captura |
| Tabs | `[role=tab]` | `tab`, estado `aria-selected` |
| Dropdown | `[aria-haspopup=menu]` | `toggle`, menu revelado |
| Modal em portal | `.modal[role=dialog]` | promovido a segmento `overlay` |
| Tooltip | `.has-tip .tooltip` | `tooltip` |
| Carrossel | `.carousel` | `carousel` |
| Animação CSS + keyframes | `.floating` / `@keyframes float` | isolador preserva o `@keyframes` |
| Background animado (canvas) | `#particles` | promovido a segmento `background`, `visual` |
| Background animado (gradiente) | `.bg-aurora` | promovido a segmento `background` |
| Revelado por scroll | `[data-reveal]` | interação `viewport` |
| Conteúdo assíncrono | `#async-slot` | considerado (aparece após o load) |
| SVG animado (SMIL) | `.svg-demo svg` | `renderMode: svg-animado` |
| Assets relativos | `assets/logo.svg` | referência localizada e reescrita |
| Variáveis CSS | `:root { --brand }` | isolador preserva as `--vars` usadas |
| Media query | `.grid` | mantida no CSS isolado |
| Ativo/selecionado | `.tab[aria-selected]` | estado preservado |

## Como usar

Captura por navegador (grava manifesto rico no vault):

```bash
pnpm explorar http://localhost:8899/kitchen-sink.html
```

Sem Playwright instalado, cai para captura estática (sem descoberta de estados)
e avisa. Para a captura completa:

```bash
pnpm --filter @ds/explorer exec playwright install chromium
```

Os testes automatizados de `@ds/segmenter` já rodam a segmentação sobre esta
página e conferem o conteúdo estrutural extraído (`kitchen-sink.test.ts`).
