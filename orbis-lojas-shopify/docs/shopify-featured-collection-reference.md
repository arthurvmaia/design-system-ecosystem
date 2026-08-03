# Referência real — Seção "Coleção em destaque" (featured-collection)

**Fontes (2026-08-02):**
1. Editor real da Shopify, sessão autenticada do usuário:
   `admin.shopify.com/store/aj0afe-y3/themes/151276322886/editor?section=template--21121272676422__featured_collection_UdVFar`
   (tema `theme-export-lavenore-com-br-1-2-revisado-e-co`, rascunho — nada foi salvo, publicado ou alterado).
2. Schema extraído do arquivo `sections/featured-collection.liquid` do ZIP de export **do mesmo tema**
   (`theme_export__lavenore-com-br-1-2-revisado-e-corrigido__07NOV2025-0337am.zip`) — fonte da verdade
   idêntica à que o editor da Shopify renderiza.

**Observações da interface real:** árvore de seções à esquerda; preview central com contorno azul e
etiqueta "Coleção em destaque" na seção selecionada; painel de configurações à direita gerado do schema,
com separadores vindos de settings `type: header`; a Shopify exibe cards de onboarding
("Example product title", R$ 19,99) porque a coleção conectada está vazia na loja.

## Metadados da seção

| Propriedade | Valor real |
|---|---|
| Tipo | `featured-collection` |
| Nome | `t:sections.featured-collection.name` → "Coleção em destaque" |
| Blocos | **nenhum** (a seção não define `blocks`) |
| `max_blocks` | n/a |
| `enabled_on` | não definido |
| `disabled_on` | `{ groups: ["header", "footer"] }` — não pode ser adicionada aos grupos de cabeçalho/rodapé |
| Presets | 1 (`t:sections.featured-collection.presets.name`) |
| ID da instância no template | `featured_collection_UdVFar` (em `templates/index.json`) |

## Os 29 settings do schema (ordem original)

Legenda: tipo → efeito no preview. Labels `t:` são resolvidos pelos arquivos `locales/*.schema.json`.

| # | id | Tipo | Label | Default | Valor atual na loja | Limites/Opções | Info/Dependências |
|---|---|---|---|---|---|---|---|
| 1 | `display_id` | checkbox | Display section ID | `false` | `false` | — | Usado p/ mesclar seções e âncoras de botão |
| 2 | `visibility` | select | Display on | `always-display` | `always-display` | `desktop-hidden` (Mobile only) / `mobile-hidden` (Desktop only) / `always-display` (All devices) | Controla visibilidade por dispositivo (classe CSS na seção) |
| 3 | `title` | text | Título | `Featured collection` | **`Ofertas Imperdíveis`** | — | Muda o `<h2>` do cabeçalho da seção |
| 4 | `heading_size` | select | Tamanho do título | `h1` | **`h2`** | `h2`/`h1`/`h0` | Classe tipográfica do título |
| 5 | `description` | richtext | Descrição | — | `""` (vazio) | — | Par com `show_description` |
| 6 | `show_description` | checkbox | Mostrar descrição da coleção | `false` | `false` | — | Se ativo, usa a descrição da coleção |
| 7 | `description_style` | select | Estilo da descrição | `body` | `body` | `body`/`subtitle`/`uppercase` | Só tem efeito visível com descrição ativa |
| 8 | `collection` | **collection** | Coleção | — | **`casa-cozinha-e-jardim`** | picker de coleção da loja | Fonte dos produtos exibidos |
| 9 | `products_to_show` | range | Máximo de produtos | `4` | **`7`** | min 2 · max 25 · step 1 | Quantidade de cards; ativa paginação do slider |
| 10 | `columns_desktop` | range | Colunas no desktop | `4` | `4` | min 1 · max 5 · step 1 | Grid desktop (`--columns`) |
| 11 | `stretch_cards` | checkbox | Make all cards same height | `false` | **`true`** | — | Iguala altura dos cards |
| 12 | `full_width` | checkbox | Largura total | `false` | `false` | — | Seção ocupa a viewport inteira |
| 13 | `show_view_all` | checkbox | Botão "Ver tudo" | `true` | `true` | — | Exibe se a coleção tem mais produtos que o limite |
| 14 | `view_all_style` | select | Estilo do "Ver tudo" | `solid` | `solid` | `link`/`outline`/`solid` | Aparência do botão |
| 15 | `enable_desktop_slider` | checkbox | Carrossel no desktop | `false` | **`true`** | — | Ativa slider + setas no desktop |
| 16 | `color_scheme` | select (esquema de cores) | Esquema de cores | `background-1` | `background-1` | `accent-1`/`accent-2`/`background-1`/`background-2`/`inverse` | Classe `color-*`; info: "has cards info" |
| 17 | — | **header** | "Product cards" (separador) | — | — | — | Agrupa os controles 18–23 |
| 18 | `image_ratio` | select | Proporção da imagem | `adapt` | `adapt` | `adapt`/`portrait`/`square` | Aspect ratio dos cards |
| 19 | `show_secondary_image` | checkbox | Segunda imagem no hover | `false` | **`true`** | — | Troca imagem ao passar o mouse |
| 20 | `badges` | select | Badges | `regular` | `regular` | `disabled`/`regular`/`custom` | Info: "Adjust custom badges in Theme settings > Product cards." |
| 21 | `show_vendor` | checkbox | Mostrar fornecedor | `false` | `false` | — | Nome do vendor no card |
| 22 | `show_rating` | checkbox | Mostrar avaliação | `false` | `false` | — | Requer app de avaliações (info no schema) |
| 23 | `enable_quick_add` | checkbox | Compra rápida | `false` | **`true`** | — | Botão quick add no card |
| 24 | — | **header** | "Mobile layout" (separador) | — | — | — | Agrupa 25–26 |
| 25 | `columns_mobile` | select | Colunas no celular | `"2"` | `"2"` | `"1"`/`"2"` | Grid mobile |
| 26 | `swipe_on_mobile` | checkbox | Deslizar no celular | `false` | **`true`** | — | Carrossel por swipe no mobile |
| 27 | — | **header** | "Section padding" (separador) | — | — | — | Agrupa 28–29 |
| 28 | `padding_top` | range | Espaço superior | `36` | `36` | min 0 · max 100 · step 4 · unit px | Padding-top da seção |
| 29 | `padding_bottom` | range | Espaço inferior | `36` | `36` | min 0 · max 100 · step 4 · unit px | Padding-bottom da seção |

## Conferência da lista sugerida

Presentes: coleção, título, descrição, quantidade de produtos, colunas, comportamento mobile
(colunas + swipe), proporção de imagem, segunda imagem, fornecedor, avaliação, badges/comparação de
preço (via `badges`), compra rápida, "ver tudo", largura da seção, esquema de cores, espaçamentos
superior/inferior, visibilidade por dispositivo, carrossel desktop, altura dos cards.

**Ausentes nesta seção/tema** (não inventar): recorte de imagem além de ratio, alinhamento de texto,
margem/bordas/raio/animação por seção (ficam nas configurações globais do tema), cor de fundo direta
(usa `color_scheme`).

## Comportamentos do editor real observados

- Salvar fica desabilitado até haver mudança; desfazer/refazer no topo; badge "Rascunho".
- Selecionar seção no preview seleciona na árvore e abre o painel (contorno azul + etiqueta com o nome).
- Headers do schema viram separadores visuais no painel, mantendo a ordem original.
- Campos `range` mostram unidade (px) e respeitam step (0–100 de 4 em 4).
- Picker de coleção abre lista real das coleções da loja (aqui: handle `casa-cozinha-e-jardim`).
