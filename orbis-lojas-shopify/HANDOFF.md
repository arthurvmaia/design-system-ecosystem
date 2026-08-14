# HANDOFF — Orbis · Criação de lojas Shopify

> Documento de passagem de trabalho. Última atualização: **2026-08-14
> (limpeza do catálogo, interação da prévia e cópia atualizada do
> repositório)**. Mora em `orbis-lojas-shopify/`, dentro do repositório
> `design-system-ecosystem`. Sessões conduzidas com Claude no Claude Code.

---

## 🔄 RETOMADA — 2026-08-14

### Onde abrir a próxima sessão

**`C:\Users\rick3\Desktop\design-system-ecosystem-atualizado`** — é a cópia
feita hoje, já em dia com o GitHub. A pasta antiga
(`Desktop\design-system-ecosystem`) continua no disco, intacta, mas **está 171
commits atrás**: não trabalhe nela.

Estado do Git na cópia:

| | |
|---|---|
| `origin` | `github.com/arthurvmaia/design-system-ecosystem` |
| commits do GitHub que faltam | **0** (sincronizada) |
| commits locais nunca enviados | **46** — toda a frente Shopify |
| árvore de `orbis-lojas-shopify` | `13e9c6fd…` (idêntica antes e depois do merge) |

**Nada foi enviado para o GitHub.** O `push` é decisão do dono, porque publica
o código.

### O que foi FEITO nesta rodada (três commits)

1. **`e521030` — tema importado não recebe produto nem coleção inventados.**
   Todo tema aparecia com os mesmos produtos e as mesmas coleções, porque o
   render injetava um catálogo fixo em qualquer tema. Agora a vitrine só
   existe quando há nicho: `lojaDoNicho(nicheId)` devolve `LOJA_VAZIA` sem
   nicho, e `demoCollection` deixou de emprestar a foto do primeiro produto
   (era ela que repetia a mesma imagem em todos os cartões de coleção).

2. **`48c6f76` — catálogo dos nichos vira a única fonte de mercadoria.**
   `lib/catalogo-loja.ts` (os 10 produtos da Fiordi) foi apagado; sobrou
   `lib/catalogo-nichos.ts` (10 nichos × 10 produtos reais da AliExpress).
   Com o array vazio, a simulação de reserva ainda desreferenciava
   `PRODUCTS[0]` e quebrava a página de produto — `Runtime.product` passou a
   aceitar nulo e a seção diz o vazio por extenso.
   Teste novo: `tests/preview-sem-catalogo.test.mjs` **renderiza** o
   componente (é o único jeito de pegar essa classe de quebra; reprova com o
   código anterior).

3. **`f754957` — menu, busca e carrinho respondem na prévia.** Duas causas:
   - o modo `selecionar` engolia todo clique e só abria exceção para uma lista
     curta (fechar, comprar, carrinho). Menu de três barras, busca, accordion
     e qualquer `summary` morriam ali. Agora o modo de seleção **avisa** o
     editor e deixa o clique seguir; continua travado só o que sai do lugar
     (link externo e envio de formulário).
   - `alvosDaGaveta()` exigia que a gaveta estivesse dentro de uma seção. No
     Dawn ela vem de um snippet do layout, filha direta do `body` — como na
     loja real —, então a lista saía vazia e nada abria. A exigência caiu, e o
     interceptador do ícone só engole o clique quando há gaveta para abrir.

Conferido no editor, com o Dawn: menu abre, busca abre, gaveta abre com a
seção atualizada, comprar enche o carrinho e a árvore ainda acompanha o clique
de seleção. **Lint limpo, 87/87 testes.**

### O que está EM VOO

Nada em execução. A rodada fechou com tudo commitado e verde.

### O que vem A SEGUIR (na ordem)

1. **Subir um tema gerado para a Shopify e publicar.** É o único elo que ainda
   não foi verificado ponta a ponta depois das correções de rejeição
   (data URI em `image_picker`, `richtext` sem tag de bloco, template de
   mercado). Gerar uma loja pela área do cliente, importar o `.zip`, publicar
   e conferir em *Editar código → templates* que o `templates/index.json`
   está lá. **Isso é do dono: eu não entro na conta da Shopify.**
2. **Conferir na tela os três controles corrigidos** (menu, busca, carrinho).
   O painel de navegador que eu uso não desenha quadros, e transição de CSS
   fica congelada nele — verifiquei o estado (classe `active`, corpo travado,
   conteúdo chegando, X fechando), não a animação.
3. **Decidir o `push`** dos 46 commits.

### Armadilhas conhecidas (custaram tempo)

- **Crase dentro de template literal.** O bridge do preview é uma string com
  crases em `lib/theme-render.ts`. Escrever `` `<summary>` `` num comentário
  ali fecha a string e o endpoint passa a devolver 500 com o próprio script
  como mensagem de erro. Aconteceu duas vezes hoje.
- **O painel de navegador não compõe quadros.** `IntersectionObserver`,
  `loading="lazy"` e transições de CSS não avançam. Teste estado, não
  aparência; se precisar ver, desligue a transição.
- **Tema arquivado some da lista.** O botão de remover tema do estúdio marca
  `status='archived'` e o `bootstrap` só devolve `published`. Uma área de
  Temas vazia pode ser isso, e não defeito de render.
- **4 testes do monorepo reprovam** (`scripts/acervo-regressao.test.ts`):
  é **dado**, não código. O acervo desta máquina (8 sites em
  `~/design-system-ecosystem/vault`) foi capturado pelo pipeline antigo e não
  tem bundles nem `.orig.css`. Resolveria com `pnpm reextrair --todos`, que é
  demorado e mexe no acervo — decisão do dono.

---

## 🛟 Recuperação 2026-08-07 — navegação e miniatura da home real

O programa de fases abaixo introduziu duas regressões, corrigidas em cinco
fases de recuperação (um commit cada):

1. **Navegação** (`95462d7`): a ordem tinha virado recomendação minha em vez da
   definição do produto. Ordem correta e travada por teste:
   **01 Início · 02 Importar temas · 03 Temas · 04 Editor · 05 Editar código ·
   06 Projetos** (Projetos sempre por último).
2. **Miniatura dos cards** (`a59b756`, `e419df5`, `a35637b`): os cards mostravam
   um **mock geométrico** (círculo, barras, blocos) — tanto o antigo
   `.mini-store` quanto o `PreviewMock` que a fase 2 do programa criou. Agora a
   miniatura é **a HOME REAL**, pelo MESMO motor Liquid que abre o tema
   (`GET /api/theme-render`), num iframe reduzido por escala e inerte.
   `?projectId=` foi adicionado à mesma rota para o projeto renderizar o
   **próprio estado salvo**; o `updatedAt` na URL invalida o cache sozinho.
   O mock só sobrevive como estado de carregamento; sem ZIP preservado o card
   **declara o motivo** em vez de fingir preview.

**Armadilha que custou tempo e vale saber**: `IntersectionObserver` e
`ResizeObserver` **não entregam callback quando a aba não está compositando
quadros**. Com só eles, a miniatura ficava presa em "carregando" e, ao trocar
de viewport, mantinha a escala anterior (home cortada no mobile). A geometria
(`getBoundingClientRect`, `clientWidth`) é quem decide, com `scroll`/`resize`
como rede de segurança e os observers como gatilho barato.

Validação final (`53/53` testes, lint e build limpos): tema e projeto
`lavenore` com 39 imagens reais e 14 seções na ordem certa, escala 0,73 no
desktop e 0,2727 em 375px, zero mocks no caminho final, export ainda
regravando só `settings_data.json`, Editar código com 288 arquivos e nenhum
dado perdido.

## 🚀 Programa 2026-08-07 — fases 0 a 10 (um commit por fase)

Roteiro completo em [docs/plano-editor-visual.md](docs/plano-editor-visual.md).
O que cada fase entregou (commits `eb55d25` → fase 10):

- **F0** baseline + mapas + plano (`eb55d25`); **F1** navegação: Início ·
  Editor · Temas · Importar · Editar código · Projetos por último
  (`f7ba7ef`); **F2** fundação dos previews (`previewFromTheme/Project` +
  `PreviewCard` com skeleton/fallback/erro, `8c2dcbb`); **F3** Temas no padrão
  Shopify: primeiro tema em card grande + biblioteca (`c31e882`); **F4**
  Projetos sobre a mesma fundação (`6a4b6ee`); **F5** prévia ao vivo no fluxo
  do cliente com a marca do wizard — bloqueio da Marca do design system
  documentado no plano (`6c8269e`); **F6** catálogo Google Fonts completo
  (1.942 famílias, metadata público + cache R2 24h + reserva declarada,
  busca/categorias/paginação, preview por subset `text=`, `f15f1f8`); **F7**
  aplicação/persistência: pesos restritos aos reais da família, itálico só
  quando existe, restaurar padrão, prova de carga mínima no teste de render
  (`ec4313f`); **F8** inspetor: modos Selecionar/Interagir/Prévia na ponte,
  seleção de BLOCO pelo `shopify_attributes`, hover, formulários bloqueados,
  clique abre e rola o grupo do bloco no painel (`76a09e6`); **F9** cores:
  `ShopifyColorField` com alfa, amostras das cores reais do tema, recentes,
  origem declarada (padrão × editado no tema/seção/bloco), restauração e
  alerta de contraste WCAG que nunca troca sozinho + `lib/color-tools.ts`
  (`0e6d7a4`); **F10** integração: CSS morto dos cards antigos removido,
  regressão de export 283/284 byte-idênticos, render sem vars quebradas,
  varredura de todos os fluxos em desktop e 375px. Suíte final: **49/49**.

## 🗂️ Rodada 2026-08-06 (3) — navegação por link no preview e Editar código

1. **Links do tema navegam a prévia** (pedido: "clico em Produtos e nada
   acontece"). As rotas simuladas deixaram de ser âncoras mortas (`#`) e
   viraram caminhos reais (`/cart`, `/collections/all`, `/products/<handle>`,
   `/pages/…` — [lib/theme-render.ts](lib/theme-render.ts)); o bridge posta
   `orbisNavigate` no clique em `<a>`, e `resolvePreviewPageId`
   ([app/ShopifyStorePreview.tsx](app/ShopifyStorePreview.tsx)) traduz o href
   para a página do editor — mesmo gesto do editor da Shopify. Validado:
   clicar em "Produtos" no render real troca o editor de `index` para
   `collection`.
2. **Editar código**, como o "Edit code" da Shopify. Entradas: item na sidebar
   logo abaixo de Importar temas E botão no card do tema. Explorer com as
   pastas reais (layout/templates/sections/blocks/snippets/assets/config/
   locales), filtro, editor monospace com Salvar. A fonte é o ZIP preservado
   no R2: `updateThemeSourceFile`
   ([lib/shopify-theme.ts](lib/shopify-theme.ts)) regrava UM arquivo e mantém
   o resto byte a byte; a rota
   [app/api/theme-code/route.ts](app/api/theme-code/route.ts) lê/lista/grava
   e, para `assets/`, atualiza também a cópia instalada que a prévia serve.
   Salvar já vale no render e no ZIP exportado. Binários (imagens, fontes)
   são listados mas não editáveis — preservados como estão. Tema aninhado em
   pacote (depth>0) é recusado com `SHOPIFY_CODE_NESTED` em vez de corromper.
   Validado ao vivo: editar `sections/announcement-bar.liquid` refletiu no
   render, binário recusado, restauração byte-idêntica; UI com 284 arquivos em
   7 pastas.
3. **Testes**: 37/37 (`tests/shopify-theme-code.test.mjs` cobre regravação,
   criação, guardas de caminho e o mapa href→página; o teste de fallback
   ganhou as âncoras da navegação e da aba de código). Lint e build limpos.

## 🧭 Rodada 2026-08-06 (2) — editor com lógica Shopify, conteúdo 100% do tema

Princípio desta rodada: **nenhum conteúdo inventado pelo app no fluxo Shopify**
— tudo que aparece vem do tema importado (settings, blocos, schemas, schemes).

1. **Fallback simulado reconstruído**
   ([app/ShopifyStorePreview.tsx](app/ShopifyStorePreview.tsx)): a paleta agora
   nasce dos `color_schemes` REAIS (`schemePalette`/`themePalette`, exportados)
   e cada seção respeita o próprio `color_scheme`; as listas de nomes de chave
   viraram último recurso. Menu do header e colunas do rodapé derivam dos
   blocos da seção; blog/artigo usam títulos do tema; fallbacks de
   título/corpo/botão vêm dos defaults do schema ou somem — as frases próprias
   ("GUIA SHRINE", "Envios e entregas", trust badges…) foram removidas. A barra
   de frete grátis só existe se o tema declarar meta (`freeShippingGoalFrom`).
   Dados de loja que não existem no ZIP (avaliações, variantes) ganharam a
   badge `DEMONSTRAÇÃO` — declarados, não disfarçados.
2. **Controles de paridade** ([app/AppShell.tsx](app/AppShell.tsx)):
   `color_scheme` virou seletor visual com amostras dos schemes
   (`ShopifySchemeSelect`); adicionar seção lista CADA preset do schema
   (`tipo::índice`, aplicado de verdade); contador `x/y` de blocos quando há
   `max_blocks`; `url`/`video_url`/`video` com campos próprios;
   `product_list`/`collection_list` editados como handles e salvos como array
   (`ShopifyHandleListField`); `radio` virou grupo de radios; as sugestões de
   handles só usam sementes demo quando o tema não referencia recurso nenhum.
3. **Sincronia árvore→preview**: o bridge do render
   ([lib/theme-render.ts](lib/theme-render.ts)) escuta `orbisScrollTo` e rola
   até a seção com destaque; `ShopifyLiveRender` posta a seleção no iframe.
   Nota de validação: com `scroll-behavior: smooth` o movimento só anima com a
   aba visível (comportamento do Chrome), o outline sempre aplica.
4. **Miniaturas e guardas**: cards de tema/projeto pintam com a paleta real do
   tema importado; o estado vazio do editor perdeu a menção fixa ao ShrinePro;
   tema com `pages` vazio mostra aviso em vez de cair calado no editor legado.
5. **Validação**: 34/34 testes (novo `tests/shopify-preview-fallback.test.mjs`
   trava o retorno das strings inventadas), lint e build limpos; no app real:
   miniatura `#6d388b`, contador `1/12` na Barra de avisos, outline via clique
   na árvore, export sem edições = 283/284 arquivos byte-idênticos (só
   `settings_data.json` ganha os defaults do schema — comportamento herdado).

## 🎨 Rodada 2026-08-06 — fidelidade de cores e fontes no render

O preview saía com as cores e fontes erradas para qualquer tema Dawn-based
(ShrinePro incluso). Diagnóstico feito contra o tema REAL da loja
(`shrinepro-1-1`, id 151301193798) com um harness executável.

**Causas raiz encontradas e corrigidas:**

1. **Cores resolviam como string, não como o drop da Shopify.** Os temas geram
   as variáveis CSS com `{{ settings.colors_text.red }}, {{ ...green }}` — com
   string, cada canal saía vazio e TODAS as variáveis base viravam
   `--color-base-*: , , ;` (CSS inválido). Agora `color`/`color_background`
   resolvem para um drop com `.red/.green/.blue/.alpha/.rgb/.hue...` que
   imprime o valor original ([lib/theme-render.ts](lib/theme-render.ts),
   `colorDrop`). Os esquemas (`settings.color_schemes`) viraram uma coleção
   iterável com `.id` e cores por canal — o padrão Dawn v9+.
2. **font_picker interpretado errado.** `harmonia_sans_n4` virava família
   "Harmonia" e QUALQUER família com a letra "i" era marcada itálica
   (`--font-body-style: italic` no tema inteiro). O parser agora lê
   `<família>_<n|i><peso>` (`shopifyFontFromHandle`). `font_face`/`font_url`
   deixaram de devolver vazio: as fontes reais são carregadas por uma folha do
   Google Fonts injetada no `content_for_header` (fonte licenciada fora do
   Google, ex. Harmonia Sans, cai no `fallback_families` declarado — nunca
   troca em silêncio).
3. **`window.Shopify` não existia no preview.** O JS dos temas
   (`designMode`, `routes`, `locale`) morria com ReferenceError e sliders não
   inicializavam. O render injeta o shim no `content_for_header`.
4. **Section groups além de header/footer eram ignorados.** Qualquer
   `sections/*.json` agora vira grupo; templates `.context.*` (mercados) saem
   da lista de páginas mas seguem no ZIP.
5. **Tema >3MB era descartado EM SILÊNCIO na persistência** e o editor caía na
   simulação genérica (paleta CACTUS). `cleanShopifyData` agora enxuga só o
   inventário `sourceFiles` e só desiste (com aviso) acima de 24MB.
6. **Editor**: `font_picker` ganhou controle próprio (família/peso/itálico ⇄
   handle canônico) em vez de campo de texto cru.

**Validação**: `tests/shopify-theme-render.test.mjs` (novo) cobre canais de
cor, esquemas iteráveis, gradiente com fallback, fontes e grupos;
`tests/_diagnostico.mjs` audita qualquer ZIP real
(`node tests/_diagnostico.mjs <zip> [página]`). 30/30 testes, lint e build
limpos. CSS computado do render conferido contra o editor da Shopify:
announcement `rgb(109, 56, 139)` = `#6d388b` exato, texto
`rgba(18, 18, 18, 0.9)`, Poppins 700 carregada, `--page-width: 140rem`, mesma
ordem de seções.

**Limitação conhecida**: chamadas externas do próprio tema (ex.
`whatsmycountry.com` do shrine.null.js) falham por CORS fora da Shopify — igual
aconteceria em qualquer preview local; não afeta layout.

## 🏠 Onde este app vive agora (leia primeiro)

Ele deixou de rodar sozinho na Área de Trabalho e passou a ser uma das três
portas da **Suíte Orbis**. O que mudou para quem trabalha aqui:

- **A pasta**: `Desktop\orbis-suite\orbis-lojas-shopify`. A pasta antiga
  (`Desktop\app2-shopify`) continua no disco como registro histórico, com o
  próprio git — mas o trabalho novo é aqui.
- **Como subir**: o `INICIAR.bat` da raiz da suíte sobe as quatro peças (portal
  4000, design system 5173 + 8787, este app 3000) e abre o portal. Para subir só
  este app, o `iniciar.bat` daqui continua funcionando.
- **A independência é real e proposital**: npm, lockfile, testes e ESLint
  próprios. Ele fica **fora** do workspace pnpm (`apps/*`, `packages/*`) e no
  `files.ignore` do `biome.json` da suíte — sem isso o `pnpm lint`, que bloqueia
  o CI, tentaria formatar este projeto com o estilo do outro.
- **A marca**: "Tempera" virou **Orbis · Criação de lojas Shopify**, e a troca
  desceu até o sufixo do ZIP exportado (`-orbis.zip`), o prefixo dos assets que
  a exportação cria (`orbis-<id>-`, `orbis-inline-`) e o atributo que a prévia
  escuta (`data-orbis-section`).
- **Este app não tem senha.** O portão da suíte protege o portal e o app de
  design system; a porta 3000 abre direto. Local, tudo bem; se um dia a suíte
  for publicada por túnel, isso precisa ser resolvido antes.

### O editor no celular (rodada 2026-08-03)

Abaixo de 860px os três painéis viram **abas**: Seções · Prévia · Ajustes. Antes
a árvore de seções tinha `display: none` — o telefone perdia justamente a peça
que escolhe o que editar. Tocar numa seção da árvore já pula para os Ajustes
dela. A barra de ações parou de esconder Exportar ZIP, versões e desfazer:
agora ela quebra em linha, porque com `justify-content: flex-end` o excesso
transbordava para a **esquerda**, e o que transborda para a esquerda nenhum dedo
alcança. Conferido em 390×844 e 768×1024 no navegador de verdade.

## O que é o projeto

Estúdio visual de temas Shopify que roda 100% local: importa o ZIP de qualquer tema
(OS 2.0, clássico ou híbrido), **instala de verdade** (arquivos, assets, schemas),
renderiza o Liquid real como a Shopify faz, permite editar tudo num editor com
paridade funcional ao da Shopify e exporta um **ZIP instalável** com as edições.

Stack: Vinext (Next-on-Vite) · React 19 · TypeScript · Cloudflare Workers (miniflare local)
· D1 · R2 · Drizzle · LiquidJS · fflate · Tailwind v4 (tokens próprios em CSS).

## Como rodar

```bash
npm install
npm run dev        # porta 3000 (ou o INICIAR.bat da suíte, que sobe tudo)
npm run lint       # ESLint
node --test tests/*.test.mjs   # 25 testes (npm test builda antes e pode resetar o miniflare)
npm run build      # build de produção
```

Identidade em dev é automática (`local-demo-owner`). Dados ficam em `.wrangler/state`
(D1 + R2 do miniflare) — **apagar essa pasta reseta temas/projetos importados**.

---

## 🎯 RODADA ATUAL (2026-08-02): duas portas, Fluxo Cliente

O produto ganha uma tela de entrada com dois caminhos: **Fluxo do Cliente** e
**Fluxo do ADM** (o estúdio atual, intocado). No fluxo do cliente, a pessoa
solicita um site: informa os dados da marca (nome, descrição, logo, cores,
contato), escolhe o tema (só ShrinePro por enquanto) e um de dois templates
padrão do ShrinePro, cada um com uma composição de seções diferente. O sistema
usa o backend admin existente (cria projeto real no banco, visível na aba
Projetos), monta o site estático com a marca e entrega um **ZIP na Área de
Trabalho**, junto da pasta extraída, para abrir o `index.html` com um clique.

### Decisões desta rodada

- **O site do cliente sai de um gerador estático novo (`lib/site-generator.mjs`),
  não do motor Liquid.** O ShrinePro não tem arquivos Liquid no repo (o ZIP
  original ficou de fora por conter licença); o seed dele é o modelo legado
  hardcoded em `lib/data.ts`. O render real (`lib/theme-render.ts`) exige
  `preservedSource` com ZIP no R2, que o ShrinePro não tem.
- **Entrega em disco via middleware Node no Vite dev server**
  (`build/local-delivery-plugin.ts`, rota `/local/deliver-site`). As rotas de
  API rodam em workerd e não enxergam filesystem; em dev, o middleware grava o
  ZIP e a pasta extraída na Área de Trabalho. Fora do dev, o fallback é o
  download normal do navegador.
- **A solicitação do cliente cria projeto de verdade** via `unlockTheme`
  (ShrinePro é grátis; os triggers SQLite criam o projeto atomicamente) e
  `saveProject` com a customização da marca aplicada. O ADM enxerga tudo.
- **Orbis oficial em PNG** (mascote do app irmão `claude_v2/my_app_ds`):
  `public/mascote-{64,128,512}.png`, componente `app/Orbis.tsx` com as regras
  do original (nunca parado: respira em repouso, gira quando trabalha; aparece
  só na marca, no trabalho e em tela vazia; nunca sobre conteúdo do usuário; o
  site gerado do cliente NÃO leva Orbis). O `mascote-64.png` vira o favicon.

### Entregue e validado nesta rodada

- Portão de entrada ([app/EntryGate.tsx](app/EntryGate.tsx)) e wizard do cliente
  ([app/ClientFlow.tsx](app/ClientFlow.tsx)): marca → tema → modelo → revisão.
- Gerador estático ([lib/site-generator.mjs](lib/site-generator.mjs)) com os
  templates **Essencial** (benefícios, depoimentos, FAQ) e **Vitrine**
  (conjunto, comparação), páginas `index.html` + `produto.html`
  autossuficientes, cores derivadas da marca com contraste automático, botão
  flutuante de WhatsApp e contatos no rodapé.
- Rota [POST /api/client-request](app/api/client-request/route.ts): cria o
  projeto real via `unlockTheme` + `saveProject` (aparece na aba Projetos do
  ADM com o nome "Site de <marca> · <modelo>") e devolve o ZIP.
- Entrega local ([build/local-delivery-plugin.ts](build/local-delivery-plugin.ts)):
  grava `site-<marca>.zip` e a pasta extraída na Área de Trabalho; se a pasta
  estiver presa por outro processo, sobrescreve por cima; se a gravação falhar,
  o front baixa o ZIP pelo navegador.
- Orbis oficial em PNG no shell (sidebar, loading, vazios, dropzone, portão) e
  favicon `mascote-64.png` (o 404 antigo morreu).
- Testes: [tests/site-generator.test.mjs](tests/site-generator.test.mjs), 7
  casos; suíte inteira 21/21; lint zero.
- Prova de ponta a ponta: dois sites gerados pelo wizard no navegador
  (Aurora Café · Essencial, Verde Vivo · Vitrine), abertos e conferidos com as
  marcas aplicadas; projetos visíveis no fluxo ADM.

### Entregue na sequência (mesma rodada): mídia do editor → asset exportado

Item 2 do backlog, concluído depois da entrega do Fluxo Cliente:

- [lib/theme-export.ts](lib/theme-export.ts): `exportThemeZip` ganhou um passo
  puro que converte referências de mídia do editor (`/api/media/<id>`) e data
  URIs base64 (png/jpg/webp/gif) em arquivos reais em `assets/`
  (`orbis-<id8>-<nome>` / `orbis-inline-<hash>.<ext>`), reescrevendo o
  valor para `shopify://shop_images/<arquivo>` — formato canônico do
  `image_picker`, que o render do Orbis resolve por basename no round-trip.
  Dedupe por conteúdo, colisão de nome resolvida por sufixo, mídia indisponível
  fica como estava e vira warning (`x-export-warnings`).
  **A reescrita acontece só nos valores que de fato são gravados** (globais,
  templates JSON e seções clássicas de `current.sections`), então nenhum asset
  entra no ZIP sem referência; o que não tem onde ser gravado vira warning.
- [app/api/theme-export/route.ts](app/api/theme-export/route.ts): resolve os
  IDs coletados (`collectEditorMediaIds`) no D1 (chaveado por usuário) + R2 e
  passa os bytes ao exportador. Teto de 100 mídias e de 40MB por exportação,
  consulta em lotes de 20 (o D1 aceita poucos parâmetros por statement) e falha
  de mídia degrada para warning em vez de derrubar a exportação do tema.
- [lib/site-generator.mjs](lib/site-generator.mjs): a logo do cliente deixou de
  ser data URI inflando o HTML e virou `assets/logo.<ext>` no ZIP/pasta
  entregues (referência relativa; o site continua abrindo com um clique).
  A rota do cliente e os testes aceitam arquivos binários no pacote.
- Ressalva Shopify (documentada em
  [docs/shopify-editor-parity.md](docs/shopify-editor-parity.md)): `shop_images`
  é da loja, não do tema — ao instalar o ZIP na Shopify o merchant ainda precisa
  subir a imagem (que viaja no ZIP) para Arquivos ou reselecionar no editor.
  O toast de exportação agora diz isso e mostra os warnings.

**Corrigido junto, do painel de revisão adversarial (3 lentes, 2 céticos por
achado) — tudo com teste:**

- Loop infinito no batismo de asset: nome de 90 caracteres fazia o sufixo de
  colisão ser cortado e a busca por nome livre nunca terminava.
- Seções clássicas: imagem de **bloco** virava asset mas a referência era
  descartada (o merge de `current.sections` só olhava `settings`). Agora blocos
  de seção clássica são gravados como nos templates JSON.
- Apagar todos os blocos de uma seção não era persistido — agora é.
- Middleware de entrega local: passou a exigir mesma origem (qualquer página
  aberta no navegador conseguia gravar na Área de Trabalho com o dev server de
  pé) e a guarda anti ZIP-Slip passou a comparar com separador.
- Miniatura do editor volta a aparecer para valores `shopify://shop_images/...`
  e nomes de asset do tema (`mediaPreviewSource` resolve pelos assets instalados).

- Testes: suíte 25/25 (mídia na exportação, colisão de nomes, seção clássica com
  bloco, asset órfão, logo do cliente); lint zero; `tsc` sem erro novo.
- Prova de ponta a ponta no runtime real (workerd + D1 + R2), 20 verificações:
  importar tema → subir imagem pelo editor → exportar → asset com os bytes certos
  e referência reescrita → reimportar → prévia renderiza a imagem; e o fluxo do
  cliente entregando `assets/logo.png`. O tema e os projetos de teste foram
  apagados depois; o ambiente ficou como estava.

### Divergências encontradas na exploração (registro)

- `themes/shrinepro/manifest.json` é código morto: nenhum import; o seed real
  do ShrinePro vive em `lib/data.ts:208-258`.
- O Drizzle está desconectado do runtime: `db/schema.ts` declara 26 tabelas,
  mas o app cria só 16 via DDL cru em `lib/data.ts`. Podem divergir em silêncio.
- "Publicar" é cosmético: só troca status e `published_slug`; nenhuma rota
  serve esse slug. O único caminho de saída real do produto é o ZIP.

---

## ✅ FEITO (validado com evidências)

### 1. Identidade visual "LAB.01 // Orbis"
- Paleta ciano/preto (203 cores migradas por script de hue-shift), fonte Orbitron,
  cantos retos, scanlines CRT ([app/globals.css](app/globals.css)).
- **Orbis**, mascote-sentinela (esfera CSS pura), presente em sidebar, dashboard,
  loading, estados vazios, dropzone e toasts; toda a comunicação do app é o Orbis
  falando com "o senhor" ([app/AppShell.tsx](app/AppShell.tsx)).

### 2. Importação que instala o tema de verdade
- `extractShopifyThemePackage` ([lib/shopify-theme.ts](lib/shopify-theme.ts)): localiza o tema
  até em ZIPs aninhados, interpreta schemas globais/seções/blocos/presets/templates/groups.
- Parser captura: `max_blocks`, `enabled_on`/`disabled_on`, `visible_if`, `placeholder`,
  `step`/`unit`, e settings `header`/`paragraph` como separadores traduzidos.
- Todos os assets (imagens, CSS, JS, fontes) instalados no R2 e servidos por
  [/api/theme-assets](app/api/theme-assets/route.ts); ZIP original preservado no R2
  (`themes/{user}/{fingerprint}.zip`) para round-trip e render.
- Segurança: ZIP Slip bloqueado, limites de tamanho/arquivos, chaves sensíveis fora
  dos dados editáveis.

### 3. Motor de renderização Liquid real
- [lib/theme-render.ts](lib/theme-render.ts): renderiza layout + seções + snippets com
  LiquidJS; tags Shopify (`schema`, `section`, `sections`, `form`, `paginate`, `style`,
  `javascript`, `stylesheet`, `layout`); ~65 filtros (asset_url, image_url, money, t,
  cores, payment_terms…); objetos simulados (shop, cart, routes, coleções/produtos demo
  com fallback por Proxy); traduções pt-BR dos locales.
- **Correção crítica**: objetos globais registrados como `globals` do engine — o
  `{% render %}` isola escopo e os snippets não viam `settings` (quebrava ícone do
  carrinho e fazia edições "não terem efeito").
- Uploads do editor (`/api/media/...`) e data-URIs reconhecidos como imagem.
- Rotas: [POST/GET /api/theme-render](app/api/theme-render/route.ts) (draft ao vivo / tema salvo).

### 4. Editor com paridade Shopify
- **Árvore agrupada** igual à organização da Shopify (genérica para qualquer tema):
  Cabeçalho / Modelo / **Seções globais** (cart-drawer, popups, etc. capturados do
  layout) / Rodapé; "+ Adicionar seção" por grupo (respeita `enabled_on`/`disabled_on`);
  expandir/recolher blocos; ocultar/reexibir (olho); mover/duplicar/remover com
  confirmação; blocos com adicionar/mover/duplicar/remover respeitando `max_blocks`.
- Painel de configurações gerado do schema na ordem original, com separadores,
  `visible_if` avaliado (==, !=, and, or), ranges com step/unit, pickers de recursos
  (collection/product/menu/…) com sugestões de handles reais do tema + aviso de demo,
  upload de imagem com **miniatura**.
- Prévia ao vivo em iframe sandbox (`ShopifyLiveRender` em
  [app/ShopifyStorePreview.tsx](app/ShopifyStorePreview.tsx)): clique na seção seleciona na
  árvore (postMessage), re-render com debounce a cada edição, fallback para simulação.
- Toolbar: undo/redo (30 passos), autosave (debounce 700ms), zoom 50–100%, prévia em
  nova aba, **Exportar ZIP**, versões, publicar (fluxo local existente).

### 5. Exportação ZIP sem perdas
- [lib/theme-export.ts](lib/theme-export.ts) + [/api/theme-export](app/api/theme-export/route.ts):
  merge semântico sobre os arquivos ORIGINAIS (só reescreve `settings_data.json` e
  templates JSON que mudaram; chaves desconhecidas preservadas; relatório
  `x-modified-files`).
- **Prova real**: ZIP exportado do tema Lavenore foi subido pelo usuário na Shopify e
  funciona lá (tema `lavenore-novo-projeto-tempera`, id 151291166790).

### 6. Testes, docs e qualidade
- **14/14 testes** (`tests/`): regras de negócio, importador, round-trip de exportação,
  fixture com o schema REAL de 29 settings da "Coleção em destaque".
- Docs: [docs/shopify-featured-collection-reference.md](docs/shopify-featured-collection-reference.md)
  (espec. reversa da seção real), [docs/shopify-editor-parity.md](docs/shopify-editor-parity.md)
  (arquitetura/limitações), [IMPLEMENTATION_REPORT.md](IMPLEMENTATION_REPORT.md).
- Lint zero; build de produção ok; `db:generate` sem migrações pendentes.

### 7. Estado do ambiente do usuário
- Temas instalados no app: lavenore (o principal), Vision Nichada, Kalles, Aurora
  (fixture de teste — pode apagar), ShrinePro (seed).
- Na Shopify da loja `aj0afe-y3`: tema publicado é "Horizon" (intocado); rascunhos
  incluem o export original e o `lavenore-novo-projeto-tempera` (gerado por este app).
  **Nada foi alterado/publicado na loja pelo agente** — só leitura autorizada.

---

## 🔄 EM ANDAMENTO

Nada em voo neste momento. A rodada do Fluxo Cliente (2026-08-02) foi concluída
e validada de ponta a ponta: portão de entrada, wizard, gerador com os dois
templates, entrega na Área de Trabalho e projetos visíveis no ADM. Lint zero,
21/21 testes.

Pontos de atenção deixados pela rodada:

- Ficaram dois projetos "Site de Verde Vivo · vitrine" no banco porque o site
  foi regenerado uma segunda vez para corrigir um check duplicado na seção de
  comparação. Cada solicitação cria um projeto; pode apagar um deles pela UI.
- A entrega em disco (`/local/deliver-site`) só existe com `npm run dev` de pé;
  fora dele o front baixa o ZIP pelo navegador.
- Os erros de fonte no console do app (preload de Geist/Orbitron por caminho
  file://) são do modo dev do vinext, anteriores à rodada e sem efeito.
- Ponto antigo que segue valendo: projetos criados antes de uma reimportação de
  tema podem carregar schema antigo; recriar o projeto a partir do tema resolve.

---

## 📋 FALTA FAZER (backlog priorizado nesta rodada)

Primeiro o que serve ao Fluxo Cliente; o resto desce sem sumir.

1. ~~Fluxo Cliente completo~~ **FEITO nesta rodada** (ver "Entregue e validado").
2. ~~Mídia do editor → asset exportado~~ **FEITO nesta rodada** (ver "Entregue
   na sequência"): mídia do editor e data URIs viram `assets/` com referência
   `shopify://shop_images/...`; logo do cliente vira `assets/logo.<ext>`.
3. **Entrega fora do dev server**: o middleware de gravação em disco só existe
   com `npm run dev`. Para build de produção, decidir entre download puro ou um
   empacotador local dedicado.
4. **Mais temas e mais templates no Fluxo Cliente**: hoje é só ShrinePro com
   duas composições; o wizard já deixa o espaço aberto.
5. **Publicação direta na Shopify (OAuth)**: requer app no Shopify Partners
   (client_id/secret via env). Arquitetura já especificada em
   [docs/shopify-editor-parity.md](docs/shopify-editor-parity.md): tokens só no servidor,
   upload em lotes para tema não publicado, publicar apenas com confirmação explícita,
   detecção de capacidade na UI (sem botões falsos).
6. **Autosave com patches granulares** (hoje envia o draft inteiro do projeto).
7. **Drag-and-drop** na árvore (reordenação atual: botões, acessível por teclado).
8. **UI de restaurar versão** (criar versão existe; restauração só via dados).
9. `{% liquid %}`/filtros menos comuns: cobertura incremental conforme temas novos.
10. Strings >50k truncadas na importação (proteção): avaliar limite maior p/ richtext.
11. Melhorar mock de busca/predictive search e página de conta na prévia.

## Armadilhas conhecidas (para quem pegar o projeto)

- `npm run build` pode resetar o estado do miniflare → temas do app somem; basta
  reimportar os ZIPs (ficam em Downloads/Desktop do usuário).
- A vitrine pública `aj0afe-y3.myshopify.com` está protegida por senha ("Opening soon").
- Loja/tema da URL do admin são referência de teste — nada é hard-coded no app.
- O zip de backup na Área de Trabalho pula 9 arquivos de banco quando o dev server
  está rodando (locks do sqlite) — código sempre completo.
