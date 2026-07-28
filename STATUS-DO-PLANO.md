# Status do plano — Fidelidade visual + Subdivisão fina dos componentes

> Atualizado em 2026-07-28. Execução parou por limite de sessão da conta; **6 de 8 fases de implementação concluídas**. Nada foi commitado — todas as mudanças estão no working tree. A migração do banco (0003) **já foi aplicada** no SQLite real.

## O problema que o plano resolve

1. **Componentes extraídos não ficavam iguais ao site de origem.** Causa dominante: o bundle só recebia CSS `<style>` inline — CSS de `<link>` externo (Next.js/Vite/Tailwind build), fontes (Google Fonts) e tokens `:root` externos nunca entravam. Além disso o preview V2 dependia 100% do site de origem estar no ar, e o selo de fidelidade marcava hover/focus "completo" sem checar se o CSS veio junto.
2. **Segmentação parava na seção inteira.** Faltava subdivisão menor (botões, cards, badges, inputs, accordions), no espírito da taxonomia do `Extract HTML Design System v3.md`.

Decisões acordadas: corrigir **fidelidade + subdivisão**; subcomponentes entram como **filhos vinculados à seção pai** (`parentId`), trilháveis separadamente na Galeria.

Plano completo original: `C:\Users\Jefferson\.claude\plans\analise-meu-projeto-e-wild-valiant.md`

---

## ✅ FEITO

### A1 — Preview V2 com assets locais ✅
`apps/server/src/routes/preview.ts`: `lerReescritor` ganhou fallback — quando o manifesto V1 não existe, lê `capture-v2/manifest.json` com parse tolerante (pick Zod só de `assets`) e reescreve as refs do preview para `/api/asset/<ds>/...`. O preview de extrações V2 não depende mais do site de origem estar no ar. Comportamento V1 e casos de `null` preservados.

### A2 — Coleta ordenada das folhas CSS ✅
`packages/engine-v2/src/instrumentation/collectors.ts`: `COLETAR_CSS_FN` reescrito para percorrer `document.styleSheets` **na ordem do documento**, emitindo `{ ordem, origem: style|link|cssom|adopted|shadow, href, inline, content }`. Agora também coleta `adoptedStyleSheets` (teto global 4000 regras) e `<style>` de shadow roots abertos (com demarcador). `RawCss` ganhou `ordem?`/`origem?` opcionais (compatível com capturas antigas); `cssInline` em `engine.ts` respeita a ordem da cascata. Teste novo `collectors-css.test.ts` (7/7 sem navegador).

### A3 — CSS externo e fontes no bundle ✅ (coração da correção)
`packages/engine-v2/src/engine.ts` + `compiler/bundle.ts`: o CSS externo que o `localizeCss` já baixava (e ficava órfão) agora **entra no bundle**. `EntradaBundle` ganhou `cssExternos`, `cssInlineOrdenado`, `assetsDeCss` e `dirAssetsCaptura`; `escreverBundle` copia folhas + fontes/imagens/@imports para `assets/<localPath>` **mantendo os nomes hashed** (os `@import` reescritos dependem deles). O `index.html` linka `[externos na ordem do documento, depois arquivos do organizarCss]`; com intercalação (`<style>` antes de `<link>`) cai para um arquivo por folha na ordem exata, com motivo no manifesto. `dependencies.css` lista as externas; `derivarContrato` recebe o conteúdo delas (tokens `:root` e `@font-face` externos entram no contrato). Folha sem cópia local vira limitação no manifesto e nos segmentos. Testes: bundle 5/5, compiler 37/37.

### A4 — Selo de fidelidade honesto ✅
`packages/explorer/src/assess.ts`: hover/focus só saem "completo" quando o CSS que os define está embutido (`AssessOptions.cssEmbutido`); senão "parcial" com aviso "declarado no HTML; CSS não embutido". `packages/engine-v2/src/segment/segment-v2.ts`: `montarFidelidade` ganhou `cssExternoFaltando` → `f.css` "parcial" e selo "parcial" em componente portátil. Sinal ligado ao resultado da A3 em `engine.ts`. Testes: explorer 109/109, segment-v2 22/22.

### B1 — `parentId` no schema + migração ✅ (migração JÁ APLICADA no banco real)
`packages/shared/src/schemas/segment.ts`: `SegmentRecord.parentId` (nullable, default null — manifestos antigos seguem parseando). `packages/indexer`: coluna `parent_id` com FK auto-referente `ON DELETE cascade` + índice; migração `0003_puzzling_namorita.sql` gerada e aplicada (o SQL do drizzle-kit veio sem o `ON DELETE cascade` — corrigido à mão antes de aplicar; os 28 segmentos existentes ficaram com `parent_id = NULL`). Tipo cliente atualizado em `apps/web/src/lib/api.ts`.

### B2 — Subdivisão por seção no motor V2 ✅
Primitivas extraídas para `packages/segmenter/src/primitivas.ts` (assinatura, PARECE_BOTAO, PARECE_CARD, embrulhar...). Novo `packages/engine-v2/src/segment/subdividir.ts`: extrai por seção botões, cards (≥2 irmãos mesma assinatura), badges, campos (com wrapper de label), itens de acordeão e itens de nav; dedup por assinatura com contagem no nome ("Botão primário (×2)"), teto 8 filhos/seção, descartes de filho ≥60% da seção ou sem substância. `SegmentoV2.filhos` preenchido só em seção aprovada; `persist.ts` grava filhos com `parentId` do pai e `position` contínua após as seções (pais primeiro — FK ok; filhos sem insights). `scripts/segmentar.ts`: aviso de SPA conta só raízes. Teste novo `subdividir.test.ts` (9 casos). node-html-parser alinhado a ^6.1.13 nos dois pacotes.

---

## ⬜ FALTA FAZER

### B3 — Galeria: expandir seção e triar filhos ⬜ (não iniciada)
`apps/web/src/routes/Gallery.tsx`:
- Separar raízes (`parentId === null`) de `filhosPorPai` (Map); grade mostra raízes.
- Card de seção com filhos ganha affordance "N subcomponentes" expandindo abaixo do card (`col-span-full`, mini-grid compacto), recolhido por padrão.
- Filtro por categoria de peça (button/badge/input/accordion/card) mostra filhos que casam como cards de primeiro nível; adicionar `badge`, `input`, `accordion` a `CATEGORIES`/`CATEGORY_LABEL` (linhas ~47-87).
- Card de filho: variação compacta do `SegmentCard`, mesmo `previewSegmentUrl(child.id)` (server já funciona), selo "de: <nome da seção>"; curtir/excluir independentes.
- `ConfirmPop` de exclusão de seção menciona "e seus N subcomponentes" (cascade do banco já remove).
- **Nenhuma rota nova no server.**

### B4 — Classifier clamp + validação + docs ⬜ (não iniciada)
- `apps/server/src/routes/design-systems.ts` (~:430-442): clamp — segmento com `parentId` só aceita categoria de peça (button, badge, input, accordion, card, nav, other).
- `packages/classifier/src/index.ts`: incluir flag de subcomponente no input do prompt (dica de categoria), sem mudar o contrato de saída.
- Conferir que o validador de replay (`@ds/server/validate`, usado pelo `fila:concluir`) não falha com filho sem bundle/estados; corrigir minimamente se falhar.
- Documentar o contrato no README do engine-v2 (filho = SegmentRecord com parentId, sem bundle próprio, position após as seções, preview pelo caminho clássico).

### Verificação global ⬜ (não rodou)
- `pnpm typecheck && pnpm lint` na raiz + suíte de testes de todos os pacotes alterados (cada pacote passou isolado, mas o repo inteiro nunca rodou junto).
- **Ponto de atenção conhecido:** `apps/server/src/lib/validate-preview.test.ts:104` — fixture de `SegmentRecord` provavelmente ainda sem `parentId` (B2 corrigiu `persist.ts` e `segmenter/index.ts`, mas esse teste do server não estava no escopo de ninguém).
- **Pendência de uma linha:** `scripts/fila-concluir.ts` imprime `avisoSpa(total)` — trocar para o novo campo `raizes` do resultado da segmentação (o gatilho já está certo; só a mensagem pode inflar).

### Revisão adversarial ⬜ (não rodou)
Três lentes sobre o diff completo (correção, conformidade com o plano, regressão/compatibilidade), 3 céticos por achado, correção só dos confirmados.

### Smoke E2E ⬜ (não rodou)
Extrair um site Next.js real (job rotulado `smoke-teste-`), depois validar: bundle `seg_0` funciona **offline** com folhas hashed na ordem e fontes locais; preview com `<link>` reescritos para `/api/asset/...`; `segments/manifest.json` e SQLite com filhos (`parent_id`); `pnpm segmentar` 2× sem duplicatas.

---

## Como retomar

O workflow pode ser retomado do ponto onde parou (as 6 fases prontas voltam do cache; só B3, B4, verificação, revisão e smoke rodam de novo). Basta pedir ao Claude Code: **"continue a execução do plano"**. Alternativamente, as fases B3/B4 são pequenas o bastante para implementar direto, seguindo as seções acima.

## Estado do repositório

- Nenhum commit foi feito — tudo está no working tree (`git status` / `git diff` mostram o conjunto).
- Banco real (`~/design-system-ecosystem`): migração 0003 aplicada (aditiva e segura; dados antigos intactos com `parent_id = NULL`).
- Arquivos novos criados: `packages/segmenter/src/primitivas.ts`, `packages/engine-v2/src/segment/subdividir.ts` (+ testes `subdividir.test.ts`, `collectors-css.test.ts`), migração `packages/indexer/migrations/0003_*`.
