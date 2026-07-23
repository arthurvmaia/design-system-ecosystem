# Captura, exploração e fidelidade

Documenta a camada nova do pipeline: o motor `@ds/explorer`, a descoberta de
estados, a localização de assets e o contrato de fidelidade. Complementa
`ARCHITECTURE.md`.

## Por que existe

O pipeline antigo via a página como **um único snapshot estático do DOM
inicial** e todo o resto era análise de string. Isso perdia, por construção:
estados interativos (accordion/tabs/dropdown/modal), backgrounds animados
(canvas/gradiente), conteúdo em portal e conteúdo assíncrono. A segmentação
ainda **apagava** os elementos vazios (canvas, orbes de gradiente, overlays
ocultos) como "enfeite".

## As duas metades de `@ds/explorer`

**Lógica pura (testável sem navegador):**

- `config.ts` — limites configuráveis (abaixo).
- `safety.ts` — guardas: nunca clicar em compra/logout/submit/download/link
  externo. Na dúvida, reprova.
- `interaction-map.ts` — decide o que é interativo e quais sondagens
  (hover/focus/click) são seguras.
- `state-diff.ts` — compara snapshots e deduplica estados por assinatura.
- `assets.ts` — acha referências (HTML+CSS+srcset+@import), baixa, deduplica por
  conteúdo (sha256) e reescreve as referências.
- `css.ts` — quais `@keyframes`/`@font-face`/`--vars` o CSS mantido usa.
- `assess.ts` — `assessFidelity(html, css)`: o nível de suporte, o modo de
  render, os avisos e as interações. É o que segmenter e Biblioteca usam.

**Orquestração (precisa de Playwright, opcional):**

- `browser.ts` — dirige o Chromium: carrega, espera, faz scroll, injeta a
  instrumentação, roda o loop de descoberta com todos os tetos, volta ao estado
  anterior após cada interação. Sem Playwright, lança `PlaywrightUnavailableError`.
- `explore.ts` — `explorePage(url)`: monta o `CaptureManifest`. Degrada para
  captura `estatico` (assets, sem estados) quando o navegador não está.

O Playwright é **opcional** (import dinâmico, como em `@ds/extractor/fetch-url`).
Para a captura completa:

```bash
pnpm --filter @ds/explorer exec playwright install chromium
```

## Níveis de fidelidade

Um componente nunca finge estar completo. `SupportLevel`:

- `completo` — HTML/CSS (e estados capturados) reproduzem o componente.
- `parcial` — parte das interações virou estado; parte não.
- `visual` — aparência fiel, comportamento não roda (canvas vira imagem).
- `externo` — depende de runtime/asset externo não capturado (iframe, lottie, CDN).
- `nao-suportado` — não há como reproduzir isolado.

A Galeria mostra o selo (só quando não é `completo`) e, no detalhe, os avisos e
as interações conhecidas.

## Limites (variáveis de ambiente)

Todos com default sensato em `config.ts`; override por env, prefixo
`DS_EXPLORER_`:

| Env | Default | O que limita |
|---|---|---|
| `DS_EXPLORER_PAGE_LOAD_TIMEOUT_MS` | 30000 | carregamento da página |
| `DS_EXPLORER_SETTLE_AFTER_LOAD_MS` | 1500 | espera de conteúdo assíncrono |
| `DS_EXPLORER_SETTLE_AFTER_INTERACTION_MS` | 400 | espera após cada interação |
| `DS_EXPLORER_MAX_ELEMENTS` | 400 | elementos analisados |
| `DS_EXPLORER_MAX_STATES_PER_ELEMENT` | 6 | estados por elemento |
| `DS_EXPLORER_MAX_DEPTH` | 4 | profundidade de exploração |
| `DS_EXPLORER_MAX_CLICKS` | 120 | cliques na sessão |
| `DS_EXPLORER_MAX_ASSET_BYTES` | 8388608 | tamanho de asset |
| `DS_EXPLORER_MAX_ANIMATIONS_OBSERVED` | 40 | animações observadas |
| `DS_EXPLORER_MAX_RETRIES` | 2 | tentativas por interação |
| `DS_EXPLORER_ASSET_CONCURRENCY` | 6 | downloads em paralelo |
| `DS_EXPLORER_TOTAL_BUDGET_MS` | 120000 | orçamento total da sessão |

## Onde encaixa nos dois modos

- **queue**: `pnpm explorar <url> [ds_id]` grava `vault/<ds>/capture/manifest.json`
  e os assets em `vault/<ds>/capture/assets/`. O operador roda antes de segmentar.
- **api**: a mesma `explorePage` pode ser chamada de dentro do servidor.

Em ambos, a segmentação enriquece cada segmento com a fidelidade (via
`assessFidelity`) e, quando há manifesto de captura, associa os estados
descobertos. Nada dispara trabalho sozinho.

## Paleta: fora daqui

A Galeria e a Biblioteca **não** geram nem persistem paleta de identidade. O CSS
do componente preserva as cores originais para o preview ser fiel, mas a escolha
de paleta/tema é da tela de geração do site. Por isso o fluxo Galeria→Biblioteca
não chama mais o extrator de tokens.
