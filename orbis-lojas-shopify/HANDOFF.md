# HANDOFF — Orbis · Criação de lojas Shopify

> Documento de passagem de trabalho. Última atualização: **2026-08-02 (rodada
> Fluxo Cliente, nesta máquina: clone em
> `C:\Users\arthur.maia\Desktop\app2-shopify`)**.
> Sessões conduzidas com Claude (Fable 5) no Claude Code. Backup espelho da
> máquina original em `C:\Users\rick3\Desktop\Projeto shopify.zip`.

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
npm run dev        # porta 3000 nesta máquina (ou dois cliques no iniciar.bat)
npm run lint       # ESLint
node --test tests/*.test.mjs   # 21 testes (npm test builda antes e pode resetar o miniflare)
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
