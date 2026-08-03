# IMPLEMENTATION_REPORT — Paridade com o editor Shopify (2026-08-02)

## Diagnóstico inicial

- Projeto Vinext + React 19 + CF Workers + D1 + R2 + Drizzle; sem Git inicializado; scripts: dev/build/start/test/lint/db:generate.
- Já existiam (validados no código, não só no README): importador ZIP OS 2.0/vintage/híbrido com
  proteção ZIP Slip e limites; editor com árvore de páginas/seções, painel gerado por schema,
  autosave (debounce 700ms), undo/redo (30 passos), versões, duplicação, publicação simulada;
  render Liquid real no servidor (LiquidJS) com iframe + seleção por postMessage; assets em R2.
- Lacunas reais encontradas: sem exportação ZIP; schema perdia headers/paragraphs, visible_if,
  max_blocks, enabled_on/disabled_on, placeholder e step em ranges; sem operações de
  seção (mover/duplicar/remover/ocultar) nem de blocos na árvore; pickers de recursos eram texto puro;
  sem zoom/abrir-em-nova-aba.

## Inspeção da Shopify (sessão autorizada)

Editor real aberto na seção `featured_collection_UdVFar` do tema `theme-export-lavenore-...`
(rascunho; NADA foi salvo/publicado/alterado). Espec. reversa em
`docs/shopify-featured-collection-reference.md` — 29 settings com tipos, limites, defaults e os
valores reais da loja, conferidos contra o schema extraído do ZIP de export do MESMO tema.

## Implementado nesta rodada

1. **Parser** (`lib/shopify-theme.ts`): headers/paragraphs preservados como separadores (com ordem
   original e tradução), `visible_if`, `placeholder`, `max_blocks`, `enabled_on`/`disabled_on`.
2. **Editor** (`app/AppShell.tsx`):
   - separadores de grupo no painel; avaliador seguro de `visible_if`; `step`/`unit` em ranges;
   - pickers de recursos (collection/product/page/blog/article/link_list/menu/metaobject) com
     sugestões de handles reais do tema (datalist) e aviso de dados demo;
   - operações de seção: mover ↑↓, duplicar, remover (com confirmação), ocultar/reexibir;
   - blocos na árvore: listar, adicionar (respeitando tipos e `max_blocks`), mover, duplicar, remover;
   - filtro de "Adicionar seção" por `enabled_on`/`disabled_on` do template atual;
   - toolbar: zoom (50/75/100%), abrir prévia em nova aba, **Exportar ZIP** (desabilitado com motivo
     quando o ZIP fonte não está preservado).
3. **Exportação** (`lib/theme-export.ts` + `app/api/theme-export/route.ts`): merge semântico sobre os
   arquivos originais; só reescreve o que mudou; preserva chaves desconhecidas; relatório
   `x-modified-files`/`x-export-warnings`; download com nome sanitizado; autenticada por usuário.
4. **CSS** (`app/globals.css`): setting-header, ops de seção/bloco, zoom-select.
5. **Testes** (`tests/shopify-theme-export.test.mjs` + `tests/fixtures/featured-collection-schema.json`):
   fixture com o schema REAL de 29 settings; fidelidade do parse (min/max/step/unit/options/disabled_on);
   round-trip sem edições (chaves desconhecidas intactas, sem reescrita cosmética);
   exportação com edições (só arquivos necessários mudam, `custom_css` da seção sobrevive).

## Arquivos

- Criados: `lib/theme-export.ts`, `app/api/theme-export/route.ts`, `tests/shopify-theme-export.test.mjs`,
  `tests/fixtures/featured-collection-schema.json`, `docs/shopify-featured-collection-reference.md`,
  `docs/shopify-editor-parity.md`, `IMPLEMENTATION_REPORT.md`.
- Modificados: `lib/shopify-theme.ts`, `app/AppShell.tsx`, `app/globals.css`.
- Migrations: nenhuma necessária (`npm run db:generate` → "No schema changes").

## Comandos e resultados

| Comando | Resultado |
|---|---|
| `npm run lint` | ✅ 0 erros, 0 avisos |
| `node --test tests/*.test.mjs` | ✅ 14/14 |
| `npm run db:generate` | ✅ sem mudanças de schema |
| `npm run build` | ✅ build completo, rota `/api/theme-export` registrada |

## Evidências de validação (ambiente vivo, tema Lavenore real)

- Painel da coleção em destaque no editor: 3 separadores traduzidos ("Cartão de produto",
  "Layout para dispositivos móveis", "Preenchimento da seção"), 27 controles (26 + visibilidade),
  8 selects, 4 ranges, 12 toggles — mesmos limites do schema (2–25 step 1; 0–100 step 4 px).
- Picker de coleção exibindo o valor real `casa-cozinha-e-jardim` + 21 sugestões de handles do tema.
- Edição→re-render Liquid ao vivo já validada em rodada anterior (campo alterado apareceu no iframe).
- **Export→reimport com o tema real**: ZIP de 1015KB exportado pelo app foi reimportado com
  sucesso como tema Shopify válido (status 201) — prova de ZIP instalável.
- Desktop/tablet/celular: alternância de device aplica larguras 1040/720/390px no iframe da prévia
  (mecanismo pré-existente, mantido; zoom novo aplicado por cima).

## Limitações restantes (externas ou próximos passos)

1. **Publicação direta na Shopify**: requer app OAuth registrado (Shopify Partners). Sem
   `client_id/secret` no ambiente, implementá-la agora criaria um botão falso — contra as regras.
   A exportação ZIP cobre o fluxo real de instalação; arquitetura do adaptador documentada.
2. Autosave envia draft completo (sem patches granulares). 3. Drag-and-drop (reordenação é por
   botões, acessível por teclado). 4. Mídia enviada pelo editor não vira asset do ZIP exportado.
5. Restauração de versão ainda sem UI dedicada.
