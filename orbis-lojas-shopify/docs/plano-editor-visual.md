# Fase 0 — Descoberta, inspeção e baseline

> Programa: "Editor, previews Shopify, Google Fonts e edição visual de cores",
> executado em fases com autorização explícita entre elas.
> Data: 2026-08-07. Nenhum arquivo funcional foi alterado nesta fase.

## 1. Baseline executável (registrado em 2026-08-07)

| Verificação | Resultado |
|---|---|
| Branch | `main` (repo `design-system-ecosystem`) |
| Últimos commits | `2883456`, `9747640`, `c91d40c` (rodadas do túnel da suíte) |
| Alterações não commitadas | **13 caminhos**, todos em `orbis-lojas-shopify/` — são as rodadas anteriores desta frente (fidelidade de render, editor dinâmico, navegação de preview, Editar código). Devem ser preservadas; não pertencem a nenhuma fase deste programa |
| `npm run lint` (ESLint) | **0 erros, 0 avisos** |
| `npm test` (= `vinext build` + `node --test tests/*.test.mjs`) | build de produção OK, **37/37 testes** |
| `npm run db:generate` (drizzle-kit) | sem migrações pendentes |
| Typecheck | **não existe script** (`tsc` não roda no CI local; o build vite não tipa) — lacuna preexistente |
| Testes E2E | **não existem** — lacuna preexistente |
| Scripts disponíveis | `dev, build, start, test, lint, db:generate` |

Problemas preexistentes (não causados nem corrigidos nesta fase):

1. Exportar sem edições regrava `config/settings_data.json` (defaults do schema
   preenchidos na importação); os outros 283/284 arquivos são byte-idênticos.
2. Fontes licenciadas da Shopify (ex.: Harmonia Sans) não existem no Google
   Fonts; o preview usa o fallback declarado.
3. `shrine.null.js` (script do próprio ShrinePro) chama `whatsmycountry.com`,
   bloqueado por CORS fora da Shopify — não afeta layout.
4. Scroll suave no iframe só anima com a aba visível (comportamento do Chrome).
5. Envio direto à Shopify (OAuth) **não existe** — publicar/exportar são locais
   (backlog documentado no HANDOFF). Critérios que citam "tema enviado à
   Shopify" se aplicam ao **ZIP exportado**, que é o instalável.

## 2. Mapa da arquitetura (o que existe hoje)

**App alvo**: `orbis-lojas-shopify/` — Vinext (Next-on-Vite), React 19, TS,
Cloudflare Workers local (miniflare), D1 (SQLite) + R2, Drizzle, LiquidJS,
fflate. Fora do workspace pnpm da suíte; npm + ESLint próprios.

**Fluxo Shopify** (tudo já mapeado e testado nas rodadas anteriores):

- Importação: `app/api/theme-import/route.ts` → `lib/shopify-theme.ts`
  (`extractShopifyThemePackage`); ZIP preservado no R2
  (`themes/{user}/{fingerprint}.zip`) + assets instalados
  (`theme-assets/{user}/{fp}/...`).
- Render real: `lib/theme-render.ts` (LiquidJS + drops de cor/fonte + bridge
  `orbisSection`/`orbisScrollTo`/`orbisNavigate`) via `app/api/theme-render`.
- Editor visual: `app/AppShell.tsx` (`EditorView` + `ShopifyStructurePanel` +
  `ShopifyProperties` + controles por tipo de setting) — árvore agrupada,
  undo/redo (30 passos, cliente), autosave (draft inteiro, debounce 700 ms via
  `saveProject`), versões (`createVersion`), publicação local, Exportar ZIP
  (`lib/theme-export.ts`, merge semântico sobre os arquivos originais).
- Editar código: `app/api/theme-code/route.ts` + `updateThemeSourceFile`
  (grava no ZIP preservado; assets também na cópia instalada).
- Preview fallback (sem ZIP preservado): `app/ShopifyStorePreview.tsx`,
  conteúdo 100% derivado do tema (rodada 2).

**Modelos/persistência** (`lib/types.ts`, `db/schema.ts`, `lib/data.ts`):
`themes.default_settings` (JSON com `shopify: ShopifyThemeImport`),
`projects.customization` (mesmo formato + edições), `project_versions`,
`theme_imports` (fingerprint/arquivo), `theme_unlocks`, carteira mock.
`normalizeCustomization` (`lib/business-rules.mjs`) é o normalizador único.

**Navegação atual**: NÃO há router/URLs — `AppShell` usa `Tab` em estado
(`useState`), sidebar única (desktop e mobile via `menuOpen`), sem breadcrumbs,
sem deep links, sem permissões por item. Ordem atual:
`Início(01) · Importar temas(02) · Editar código(03) · Temas(04) · Projetos(05) · Editor(06)`.
Estados ativos: classe `active` por comparação de tab. Teclado: botões nativos.

**Previews atuais**:
- Temas: `ThemeCard` — foto real (`assetPreview`, eleita na importação) OU
  mini-mock com a paleta real do tema (`themePalette`); badge; ações
  Visualizar/Editar tema/Editar código/apagar. Modal `ThemeModalPreview` usa o
  render Liquid real.
- Projetos: `ProjectRow` — thumb de 3 barras com paleta real; sem imagem.
- Fluxo do cliente (`app/ClientFlow.tsx`): wizard de 4 passos ("Sua marca" →
  Tema fixo ShrinePro → Modelo (`SITE_TEMPLATES` de `lib/site-generator.mjs`)
  → Revisão) → `POST /api/client-request` → ZIP estático. **Sem preview**; a
  "marca" é estado local do wizard (nome, slogan, 2 cores, logo, contatos).

**Tipografia hoje**: `font_picker` com parser de handle Shopify
(`shopifyFontFromHandle`), carregamento real via folha Google Fonts injetada no
`content_for_header` (só famílias/pesos usados), controle com datalist de
**34 famílias estáticas** (`SHOPIFY_FONT_FAMILIES`). Não há catálogo completo,
categorias, busca remota, nem favoritos.

**Cores hoje**: drops de cor no render (`.red/.rgb/...`), esquemas reais
(`schemePalette`), `ColorField` (hex 6 dígitos), `ShopifySchemeSelect` com
amostras. Não há: paleta da Marca, cores recentes, RGB/HSL/alfa no controle,
origem do valor/níveis de herança explícitos.

**Seleção de elementos hoje**: nível de SEÇÃO apenas (`data-orbis-section` +
postMessage nos dois sentidos). Não há manifesto de elementos, seleção de
bloco/elemento pelo preview, modos seleção/interação, nem painel dirigido por
clique em elemento.

**Área de Marca do Design System** (OUTRO app da suíte, `apps/web` +
`apps/server` :5173/:8787, pnpm): `packages/shared/src/schemas/brand.ts` —
`ProjectBranding` com `identidadeVerbal` (tons/arquétipos), `logos[{tipo,path}]`,
`paleta{cores, atribuicoes}` com distribuição determinística de tokens,
`tipografia{presets/ajustes}`, `sociais`, contato. Persistida por projeto no
`ecosystem.db` + `~/design-system-ecosystem/projects/<id>/media`. O convite
"Ainda não tem uma marca criada?" do print é
`apps/web/src/components/ConviteOrbisCriativos.tsx` (wizard Gerar site, etapa
Marca). **Os dois apps são independentes de propósito** (stacks e dados
separados; README/HANDOFF da suíte).

**Referência Shopify** (sessão autenticada, loja `aj0afe-y3`, inspecionada em
2026-08-06/07): página de temas = card grande do tema publicado com screenshot
desktop+mobile lado a lado, versão, menu `…` (Pré-visualizar, Renomear,
Duplicar, Editar código, Fazer download…), botão "Editar tema"; "Rascunhos de
tema" em lista com thumb pequena, data, Publicar/Editar tema. Editor = sidebar
de seções, preview central, inspector à direita, seletor de página no topo.

## 3. Riscos e dependências

1. **Sem router**: "rotas/deep links/breadcrumbs" do escopo não existem — a
   Fase 1 é reordenar `navItems` + títulos + testes; criar router é mudança
   estrutural NÃO pedida (registrar como fora de escopo, decisão conservadora).
2. **Marca cross-app (Fase 5)**: usar a Marca do Design System no fluxo do
   cliente do app de lojas cruza dois apps deliberadamente independentes.
   Opções: (a) API read-only no `apps/server` consumida pelo app de lojas;
   (b) exportação/handoff de um `brand.json` + mídia; (c) usar a etapa "Sua
   marca" do próprio ClientFlow como a Marca (uma fonte, mas não é "a área de
   Marca do DS"). **Recomendação técnica**: (a) leitura direta da API do DS
   quando a suíte está no ar (mesma máquina), com fallback claro quando
   offline; nunca copiar para o D1 (evita segunda fonte de verdade). Fica
   registrado como decisão a confirmar na Fase 5.
3. **Catálogo Google Fonts**: a API oficial (webfonts.googleapis.com) exige
   chave. Alternativa sem chave: manifest estático versionado (nome, categoria,
   pesos, estilos) gerado de fontes públicas + carregamento css2 sob demanda
   (já existente). Recomendação: manifest local versionado + css2; sem
   dependência nova. Decidir na Fase 6.
4. **Autosave é draft-inteiro**: as novas edições (fontes/cores por elemento)
   devem entrar no MESMO draft/normalizador para herdar autosave, undo/redo,
   versões e exportação — nada de estado paralelo.
5. **Elementos editáveis**: temas arbitrários não trazem manifesto; a
   estratégia estável é mapear elemento→setting real do schema (cor/fonte) via
   atributos injetados no render (`data-orbis-*`), nunca DOM/índice. Elementos
   sem setting correspondente = não editáveis (documentado).
6. **`npm test` roda build antes** — commits por fase ficam naturalmente
   validados; sem typecheck dedicado (lacuna preexistente, não corrigir fora
   de fase).

## 4. Plano técnico proposto (fases 1–10, ajustado ao real)

- **Fase 1 — Navegação**: reordenar `navItems` para
  `Início · Editor · Temas · Importar temas · Editar código · Projetos(último)`
  (decisão pendente: posição de Início/Importar/Editar código dentro de
  "demais áreas"; recomendação acima mantém Início primeiro por ser o hub).
  Atualizar índices, `tabTitle`, eyebrows das PageIntro, abas mobile, testes de
  fonte. Sem router novo.
- **Fase 2 — Fundação de previews**: componente `PreviewCard` base +
  normalizador `{imagem, paleta, titulo, status, meta, acoes}` a partir de
  `Theme`/`Project`; skeleton/fallback/erro compartilhados; screenshot real do
  render como thumbnail (rota que devolve o HTML renderizado → thumb via
  iframe estático, sem serviço novo de screenshot).
- **Fase 3 — Temas**: aplicar a fundação ao grid de temas no padrão Shopify
  (card grande + lista), estados vazio/1/N, responsivo, a11y.
- **Fase 4 — Projetos**: idem para projetos (tema relacionado, status,
  atualização, progresso quando houver).
- **Fase 5 — Preview no ClientFlow**: preview ao vivo do tema com a marca
  aplicada nos 4 passos; fonte dos dados = decisão da seção 3.2.
- **Fase 6 — Catálogo Google Fonts**: manifest + busca/filtros/categorias,
  virtualização, preview do nome na própria fonte via css2 `text=`,
  pesos/estilos, recentes; sem carregar catálogo inteiro.
- **Fase 7 — Aplicação/persistência de fontes**: o catálogo alimenta o
  `font_picker` (handle Shopify continua o formato persistido — já é o que o
  tema exporta); tokens do tema (`type_header_font` etc.) continuam a fonte de
  verdade; provas de carga sob demanda.
- **Fase 8 — Fundação do inspetor**: render injeta `data-orbis-el` com
  `{sectionId, blockId?, settingIds de cor/fonte aplicáveis}` derivados do
  schema; modos seleção/interação/preview; seleção por clique e teclado;
  contorno; ponte para o painel.
- **Fase 9 — Edição visual de cores**: painel dirigido pela seleção
  (propriedades reais do schema), seletor com hex/RGB/HSL/alfa quando o tipo
  suportar, paleta do tema (schemes) + recentes, origem do valor
  (default do schema vs. valor salvo), restauração; persistência no draft.
- **Fase 10 — Integração/regressão**: suíte completa, comparação com este
  baseline, documentação final.

## 5. Critérios de aceite refinados (globais)

Além dos critérios do programa: (a) nenhuma segunda fonte de verdade (draft +
`normalizeCustomization` seguem únicos); (b) export/round-trip continua
283/284+ byte-idêntico; (c) suíte `npm test` nunca regride; (d) cada fase =
1 commit exclusivo; (e) "enviado à Shopify" = ZIP exportado instalável,
enquanto OAuth não existir (backlog).
