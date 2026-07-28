# @ds/engine-v2

Motor de captura V2: segmenta a página **por evidência** (geometria, tempo,
reação medida) durante a própria captura, compila bundles portáteis por seção e
persiste tudo no formato que a Galeria já lê (`SegmentRecord` + `SegmentInsight`
no `segments/manifest.json`, manifesto rico em `capture-v2/`).

## Subdivisão fina — o contrato dos filhos

Depois que uma seção passa no veredito, `segment/subdividir.ts` extrai as peças
reutilizáveis de dentro dela: botões, cards, badges, campos (com o wrapper do
`<label>`), itens de acordeão e itens de navegação (estes só em seções
`nav`/`header`/`footer`). Um exemplar por estilo (dedup por `assinatura` de
`@ds/segmenter`, com a contagem no nome — "Botão primário (×4)"), teto de 8
filhos por seção, e descartes de substância: filho que é ≥60% do HTML da seção
ou que não tem texto nem função.

O que um **filho** é, do ponto de vista de quem consome:

- **`SegmentRecord` com `parentId`** apontando para a seção de origem. `parentId
  = null` é seção raiz; os dois moram na mesma tabela `segments` e no mesmo
  `segments/manifest.json`.
- **Sem bundle de compilador.** O bundle V2 (`capture-v2/bundles/seg_<i>/`) é
  por seção; o filho carrega só o `htmlSnippet` (embrulhado em
  `[data-ds-amostra]`, que o preview já estiliza).
- **Sem `SegmentInsight`.** A UI já tolera `fidelity: null`; o selo de
  fidelidade do filho é o não-selo.
- **`position` depois de todas as seções.** A seção `i` continua sendo o bundle
  `seg_<i>` — os filhos não deslocam o esquema de pastas. No manifesto (e no
  insert do banco) os pais vêm primeiro: a FK auto-referente com
  `ON DELETE cascade` exige a ordem, e excluir a seção leva os filhos junto.
- **Preview pelo caminho clássico** (`/api/preview/segment/<id>`), o mesmo dos
  segmentos V1 — nenhuma rota nova.
- **Categoria de PEÇA** (`CATEGORIAS_DE_PECA` de `@ds/shared`: button, badge,
  input, accordion, card, nav, other) — um botão do hero é `button`, não `hero`.
  A regra está no `SYSTEM_PROMPT` do classifier (é o que vale no modo `queue`,
  onde a classificação é trabalho do agente) e, no modo `api`, o servidor ainda
  aplica um clamp: categoria de seção devolvida para um filho é descartada, e só
  nome e `kind` entram.

Na Galeria, os filhos aparecem recolhidos sob o card da seção ("N
subcomponentes") e sobem para a grade quando o filtro de categoria de peça os
alcança. Curtir/excluir de um filho é independente do pai.

## Mapa do pacote

- `engine.ts` — orquestra a captura (Playwright), coleta CSS na ordem do
  documento e liga o resultado do `localizeCss` ao bundle.
- `instrumentation/collectors.ts` — coletores injetados na página (CSS ordenado
  com origem `style|link|cssom|adopted|shadow`, mídia, runtimes, estados).
- `compiler/bundle.ts` — escreve o bundle offline por seção: folhas externas
  copiadas com os nomes hashed, fontes/imagens/`@import` locais,
  `dependencies.css` no manifesto e limitação declarada quando uma folha ficou
  sem cópia local.
- `segment/segment-v2.ts` — veredito por evidência + fidelidade honesta
  (`cssExternoFaltando` rebaixa o selo para "parcial").
- `segment/subdividir.ts` — a subdivisão fina descrita acima.
- `persist.ts` — grava manifesto/estados/scroll/rejeitados no vault; quem
  indexa no SQLite é o `scripts/segmentar.ts` (idempotente).

Testes: `pnpm --filter @ds/engine-v2 test` (não exigem navegador).
