# Paridade com o editor de temas da Shopify — arquitetura do Orbis

## Arquitetura implementada

```
ZIP do tema ──▶ /api/theme-import ──▶ extractShopifyThemePackage (lib/shopify-theme.ts)
                                        │  schemas de settings/seções/blocos, templates JSON,
                                        │  section groups, presets, max_blocks, enabled_on/disabled_on,
                                        │  visible_if, headers/paragraphs, traduções
                                        ├─▶ D1 (themes.default_settings.shopify — modelo normalizado)
                                        ├─▶ R2 themes/{user}/{fingerprint}.zip (fonte intacta)
                                        └─▶ R2 theme-assets/{user}/{fingerprint}/* (todos os assets)

Editor (AppShell.tsx) ── draft por projeto (D1, autosave debounce 700ms, undo/redo em memória)
   ├─ árvore: páginas → seções → blocos (mover/duplicar/remover/ocultar, limites do schema)
   ├─ painel: formulário gerado do schema (ordem original, separadores, visible_if, min/max/step/unit)
   └─ prévia: POST /api/theme-render ──▶ LiquidJS server-side ──▶ iframe sandbox (srcDoc)
                                          seleção via postMessage (data-orbis-section)

Exportação ── POST /api/theme-export ──▶ exportThemeZip (lib/theme-export.ts)
               ZIP original + merge semântico de settings_data.json / templates JSON
               (chaves desconhecidas preservadas; relatório de arquivos modificados)
```

## Modelo normalizado (equivalências)

| Conceito pedido | Implementação existente |
|---|---|
| ThemeDefinition | `ShopifyThemeImport` |
| ThemeGlobalSettings | `globalGroups` + `globalValues` |
| TemplateDefinition/SectionInstance/BlockInstance | `ShopifyPage` / `ShopifySectionInstance` / `ShopifyBlockInstance` |
| SectionDefinition/BlockDefinition/SettingDefinition | `ShopifySectionSchema` / `ShopifyBlockSchema` / `ShopifySettingDefinition` |
| EditorDraft / EditorRevision | `projects.customization` (draft) / `project_versions` |
| ThemeAsset | R2 `theme-assets/*` + rota autenticada `/api/theme-assets` |
| PublishingTarget | exportação ZIP (garantida); adaptador Shopify = limitação documentada abaixo |

## Registry de tipos de campo (ShopifySettingControl)

Suportados com controle dedicado: checkbox, text, number, textarea, richtext/inline_richtext/html/liquid
(textarea com round-trip JSON), range (min/max/step/unit), select, radio, color, color_scheme_group
(editor de esquemas), image_picker (upload → R2), collection, product, page, blog, article, link_list,
menu, metaobject (picker com sugestões de handles reais do tema + dados demo identificados),
header e paragraph (separadores, ordem original preservada).
Tipos não reconhecidos: caem no controle genérico (texto/JSON) — o valor é preservado no
round-trip e exportado intacto (testado). `visible_if` é avaliado com subset seguro (==, !=, and, or).

## Prévia

Liquid REAL renderizado no servidor (lib/theme-render.ts): layout, seções, snippets, translações,
~60 filtros, objetos simulados (produtos/coleções/carrinho/menus com fallbacks). Iframe com
`sandbox="allow-scripts allow-same-origin allow-forms"`, links neutralizados, clique em seção
seleciona na árvore via postMessage. Desktop/tablet/celular + zoom 50–100%. Falha de render → fallback
para a simulação React com aviso implícito (sem selo "RENDER REAL").

## Persistência

Draft por projeto em D1 (autosave com debounce, isolamento por user_id nas rotas), undo/redo em
memória (30 passos), versões nomeadas via `createVersion`. Limitação honesta: o autosave envia o
draft completo do projeto (não patches); com temas grandes (~1–3MB) é aceitável localmente, mas
patches granulares são o próximo passo natural.

## Exportação e publicação

- **Exportação garantida** (implementada e testada): ZIP instalável; apenas `config/settings_data.json`,
  templates JSON e section groups são reescritos quando há mudança semântica; todo o resto é byte a byte
  o original; relatório em `x-modified-files`. Ciclo exportar→reimportar validado com o tema Lavenore real.
- **Integração direta com Shopify (OAuth + Admin API)**: NÃO implementada nesta rodada — exige app
  registrado no Shopify Partners (client_id/secret) que não existe no ambiente. O caminho previsto:
  rota de OAuth com tokens somente no servidor (D1), listagem de temas, upload em lotes de arquivos
  modificados para tema NÃO publicado, publicação só com confirmação explícita. Detecção de capacidade:
  o botão de integração deve aparecer apenas quando `SHOPIFY_APP_KEY/SECRET` estiverem configurados.

## Segurança

Import: limites de tamanho/arquivos, proteção ZIP Slip (`safeArchivePath`), remoção de chaves sensíveis
(licenças/tokens) dos DADOS EDITÁVEIS — mas preservadas no ZIP fonte para round-trip. Preview: iframe
sandbox, sem cookies de app expostos ao conteúdo, uploads validados (MIME/têm 5MB), rotas autenticadas
por usuário, R2 chaveado por `user_id`. Sem tokens no frontend.

## Limitações reais

1. Publicação direta na Shopify depende de credenciais de app (ver acima).
2. Imagens do editor viram assets na exportação (`assets/orbis-*`), com a referência reescrita
   para `shopify://shop_images/<arquivo>` — formato canônico do `image_picker`, que o render do
   Orbis resolve por basename no round-trip. Na Shopify, o merchant ainda precisa subir o
   arquivo (que viaja no ZIP) para Arquivos ou reselecionar a imagem: `shop_images` é da loja,
   não do tema, e upload de ZIP não popula Arquivos. O toast de exportação avisa.
   Edições de imagem em páginas sem template JSON (grupos legados do layout, templates `.liquid`,
   páginas geradas pelo importador) continuam sem ter onde ser gravadas — mas agora saem como
   warning em vez de sumirem em silêncio, e não deixam asset órfão no ZIP.
3. Autosave manda o draft inteiro (sem patches granulares).
4. Reordenação é por botões (acessível por teclado); drag-and-drop nativo não foi adicionado.
5. Strings >50k são truncadas na importação (proteção) — afetaria exportação desses campos.
6. `visible_if` cobre ==/!=/and/or; expressões Liquid complexas são ignoradas (campo sempre visível).

## Próximos passos sugeridos

OAuth Shopify Partners → adaptador de publicação; patches JSON no autosave; drag-and-drop;
restauração de versões pela UI.
