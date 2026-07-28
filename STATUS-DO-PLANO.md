# Status do plano — Fidelidade visual + Subdivisão fina dos componentes

> Concluído em 2026-07-28. **As 8 fases de implementação, a verificação global, a revisão adversarial e o smoke E2E foram executados.** A migração do banco (0003) está aplicada.

## O problema que o plano resolveu

1. **Componentes extraídos não ficavam iguais ao site de origem.** Causa dominante: o bundle só recebia CSS `<style>` inline — CSS de `<link>` externo (Next.js/Vite/Tailwind build), fontes (Google Fonts) e tokens `:root` externos nunca entravam. Além disso o preview V2 dependia 100% do site de origem estar no ar, e o selo de fidelidade marcava hover/focus "completo" sem checar se o CSS veio junto.
2. **Segmentação parava na seção inteira.** Faltava subdivisão menor (botões, cards, badges, inputs, accordions), no espírito da taxonomia do `Extract HTML Design System v3.md`.

Decisões acordadas: corrigir **fidelidade + subdivisão**; subcomponentes entram como **filhos vinculados à seção pai** (`parentId`), trilháveis separadamente na Galeria.

---

## ✅ Fidelidade

### A1 — Preview V2 com assets locais
`apps/server/src/routes/preview.ts`: `lerReescritor` ganhou fallback — quando o manifesto V1 não existe, lê `capture-v2/manifest.json` com parse tolerante e reescreve as refs do preview para `/api/asset/<ds>/...`. O preview de extrações V2 não depende mais do site de origem estar no ar.

### A2 — Coleta ordenada das folhas CSS
`packages/engine-v2/src/instrumentation/collectors.ts`: `COLETAR_CSS_FN` percorre `document.styleSheets` **na ordem do documento**, emitindo `{ ordem, origem: style|link|cssom|adopted|shadow, href, inline, content }`, incluindo `adoptedStyleSheets` e `<style>` de shadow roots abertos. `cssInline` respeita a ordem da cascata.

### A3 — CSS externo e fontes no bundle (coração da correção)
`engine.ts` + `compiler/bundle.ts`: o CSS externo que o `localizeCss` baixa agora **entra no bundle**. `escreverBundle` copia folhas + fontes/imagens/@imports para `assets/<localPath>` mantendo os nomes hashed; o `index.html` linka na ordem do documento, com fallback de intercalação. `derivarContrato` recebe o conteúdo das externas (tokens `:root` e `@font-face` externos entram no contrato).

**Correção posterior (revisão):** o que é folha de estilo passou a sair da COLETA, não da extensão da URL — `packages/engine-v2/src/instrumentation/css-externo.ts`. O embed padrão do Google Fonts (`/css2?family=…`) não termina em `.css`, era baixado cru, ficava fora do `cssMap` e caía em "sem cópia local" — o bundle saía sem as fontes e **todo componente portátil era rebaixado a "parcial"**, exatamente o caso que a A3 existe para resolver.

### A4 — Selo de fidelidade honesto
`packages/explorer/src/assess.ts`: hover/focus só saem "completo" quando o CSS que os define está embutido. `segment-v2.ts`: `cssExternoFaltando` → `f.css` "parcial" e selo "parcial" em componente portátil.

## ✅ Subdivisão

### B1 — `parentId` no schema + migração
`SegmentRecord.parentId` (nullable, default null — manifestos antigos seguem parseando). Coluna `parent_id` com FK auto-referente `ON DELETE cascade` + índice; migração `0003_puzzling_namorita.sql` aplicada.

### B2 — Subdivisão por seção no motor V2
Primitivas em `packages/segmenter/src/primitivas.ts`; `packages/engine-v2/src/segment/subdividir.ts` extrai por seção botões, cards (≥2 irmãos mesma assinatura), badges, campos (com wrapper de label), itens de acordeão e itens de nav. Dedup por assinatura com contagem no nome, teto de 8 filhos/seção, descartes de filho ≥60% da seção ou sem substância. `persist.ts` grava filhos com `parentId` do pai e `position` contínua após as seções.

**Correção posterior (revisão):** `subirAoWrapperComLabel` não reconhecia o padrão `<label>Nome <input></label>` (o `querySelector` só enxerga descendentes), e com 2+ campos no form devolvia o input pelado, sem rótulo.

### B3 — Galeria: expandir seção e triar filhos
`apps/web/src/routes/Gallery.tsx`: a grade mostra as raízes; card de seção com filhos ganha "N subcomponentes" expandindo em mini-grid `col-span-full`, recolhido por padrão. O filtro por categoria de peça (`badge`, `input`, `accordion` entraram em `CATEGORIES`) sobe os filhos para cards de primeiro nível com selo "de: <seção>". Card de filho é variação compacta, com curtir/excluir independentes. O `ConfirmPop` da seção menciona os N subcomponentes. Nenhuma rota nova no server.

### B4 — Classifier clamp + validação + docs
`CATEGORIAS_DE_PECA` em `@ds/shared`; clamp em `apps/server/src/routes/design-systems.ts` (categoria de seção devolvida para um filho é descartada — nome e `kind` entram). O `SYSTEM_PROMPT` do classifier carrega a regra, o que a faz valer também no modo `queue`, onde a classificação é trabalho do agente (documentado em `CLAUDE.md`). Contrato dos filhos documentado em `packages/engine-v2/README.md`.

## ✅ Verificação global

- `pnpm typecheck` (12/12) e `pnpm lint` limpos; `pnpm test` verde.
- Testes novos: `css-externo.test.ts` (4 casos), o caso do `<label>` envolvendo o input em `subdividir.test.ts`, além de `collectors-css.test.ts` e `subdividir.test.ts` das fases anteriores.
- `validate-preview.test.ts`: fixture de `SegmentRecord` recebeu `parentId`.
- `fila-concluir.ts`: o aviso de SPA usa `raizes`, não `total` — filho de subdivisão não infla a mensagem.

## ✅ Revisão adversarial

Três lentes (correção, conformidade, regressão) sobre o diff completo. Cinco achados; quatro verificados como reais e corrigidos:

1. **Folha de estilo sem `.css` na URL** (Google Fonts) nunca era localizada — ver A3 acima.
2. **Modo queue inseria sem migrar o banco**: nenhum script da fila chamava `runMigrations()` (só o boot do server e o `acervo:importar`). Quem atualizasse pelo GitHub e rodasse o `PROCESSAR.bat` antes de abrir o app quebrava no insert da coluna nova. `segmentarEIndexar` agora migra (idempotente).
3. **`<label>` envolvendo o input** perdia o rótulo — ver B2 acima.
4. **`PREVIEW_VERSION` não subiu** apesar de a A1 mudar a composição do preview V2, então validações antigas ficavam em cache afirmando "validated" sobre um preview que não era mais o validado. Subiu para 5.

O quinto (ausência de clamp no modo `queue`) foi endereçado pela regra no `SYSTEM_PROMPT` + `CLAUDE.md`, com o README corrigido para não prometer um clamp de servidor onde ele não roda.

## ✅ Smoke E2E

Extração real de `nextjs.org` (Next.js, motor V2, 85s, parcial por orçamento de percurso — esperado):

- Bundle `seg_0` offline: 6 folhas externas hashed + 4 inline na ordem exata do documento, 7 fontes `.woff2` locais, **zero referências absolutas** de CSS/fonte.
- Preview da seção: 85 refs reescritas para `/api/asset/<ds>/…`, **zero** links de CSS para a origem.
- Preview do filho pelo caminho clássico, com o embrulho `[data-ds-amostra]`.
- Banco e manifesto: 11 seções + 21 filhos com `parent_id`, zero órfãos, `position` dos filhos começando em 11 (depois das seções).
- `pnpm segmentar` 2× → 32 ids distintos, sem duplicatas.
