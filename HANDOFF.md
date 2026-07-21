# HANDOFF — estado do trabalho

> Atualizado em: 2026-07-21. A grande reforma (previews + entidades + fluxo) foi **CONCLUÍDA**
> nesta sessão. Este arquivo registra o que foi feito, como validar e o que sobra de ressalva.

## Objetivo do produto

Criar design systems reutilizáveis a partir de referências visuais de sites, e gerar sites novos com a marca do usuário a partir deles.

**Fluxo (norte de tudo):**

```
Extrair → Galeria (bruto, triagem) → Biblioteca (acervo persistente)
→ Design Systems / Kits (curadoria nomeada) → Gerar site (wizard: marca+conteúdo+mídia do usuário)
→ Meus sites (persistentes, prévia via /site, .zip, editar)
```

- Galeria é material bruto derivado da extração: curtir manda para a Biblioteca; excluir é triagem; re-segmentar recria tudo.
- Biblioteca é o acervo persistente (bundle próprio em `library/<cmp>/bundle/`).
- **Kit** = Design System final: conjunto nomeado de componentes da Biblioteca (rota `/design-systems`).
- Site gerado usa **somente os componentes do kit** como base visual + marca/copy/mídia do usuário. NUNCA copia texto/marca do site fonte.
- Modo de execução: `queue` (Claude Code processa via PROCESSAR.bat — ver CLAUDE.md) ou `api` (chama Anthropic direto).

## Status: reforma concluída (8/8 itens)

Validado nesta máquina: **`pnpm typecheck` (10/10 pacotes) ✓ · `pnpm lint` (biome, 106 arquivos, 0 erros) ✓ · `pnpm --filter @ds/web build` (tsc -b + vite, 1666 módulos) ✓ · smoke test HTTP das rotas novas ✓**.

### Server (concluído em sessões anteriores, sem mexer)
- `routes/preview.ts` — `GET /api/preview/segment|component/:id`: documento completo (head real + scripts + body attrs + `<base>`), CSP `sandbox allow-scripts`, `?bg=claro|escuro`, fallback informativo.
- `routes/site.ts` — `GET /site/:prjId/:versao/*` serve as versões geradas (prévia/aba de Meus sites).
- `routes/kits.ts` — CRUD de kits + `POST /:id/duplicate`; leitura resolve componentes + `usedByProjects`.
- `routes/design-systems.ts` — `GET /:id/impacto` + `DELETE /:dsId/segments/:segId`.
- `routes/library.ts` — GET devolve `tags`; PATCH aceita `category`/`tags`; `GET /:id/impacto` (kits que usam).
- Banco: migration `0002` (kits, kit_components, projects.kit_id). Schemas `kit.ts`, `project.ts` estendido.

### Server (concluído NESTA sessão)
- `routes/projects.ts` **reescrito** para o novo fluxo:
  - `POST /` cria **rascunho** `{name, kitId?}` (não enfileira nada).
  - `PATCH /:id` atualiza name/kitId/content/branding/layout (regrava content.json/branding.json).
  - `POST /:id/media` (multipart, `c.req.parseBody()`) salva em `projects/<id>/media/` + anexa ao manifest com `slotRole`; `DELETE /:id/media?path=` remove; `GET /:id/media/:name` serve o arquivo (prévia no wizard).
  - `POST /:id/generate` valida kit (com componentes), monta payload **kit-scoped** e enfileira `generate` (modo fila) ou roda a task filtrando o catálogo pelo kit (modo api).
  - `POST /:id/duplicate` copia config+mídia como novo rascunho; `DELETE /:id` apaga registro+pasta.

### Web (concluído NESTA sessão)
- `lib/toast.ts` + `components/Toaster.tsx` (montado no `Shell.tsx`) — feedback de ação.
- `components/Modal.tsx`, `components/ConfirmPop.tsx` (confirmação com impacto), `components/PreviewFrame.tsx` (iframe `src=/api/preview|/site`, `sandbox="allow-scripts"`, escala responsiva por ResizeObserver, lazy por IntersectionObserver, skeleton).
- `lib/api.ts` — tipos+funções para kits, impacto, delete-segment, `tags`, preview URLs, `siteUrl`/`downloadUrl`, projetos (draft/patch/media/generate/duplicate) e meus-projetos.
- `routes/Gallery.tsx` — PreviewFrame, card clicável → modal de detalhe (preview grande + toggle de fundo), excluir segmento (confirm), excluir extração (confirm com impacto), toasts.
- `routes/Library.tsx` — PreviewFrame do componente (conserta o card vazio), modal editar nome/categoria/tags/notas, remover com impacto de kits.
- `routes/Kits.tsx` **NOVO** (`/design-systems`) — listar, criar/editar com picker da Biblioteca (preview+busca+ordem via ↑↓), duplicar, excluir com aviso `usedByProjects`.
- `routes/Projects.tsx` **reescrito** — página "Gerar site" (exige ≥1 kit) + **wizard de 6 etapas** (Projeto/Marca/Estrutura/Conteúdo/Mídia/Revisão), draft salvo por PATCH a cada avanço; card com editar/gerar/duplicar/excluir. `?edit=<id>` abre o wizard (usado por Meus sites).
- `routes/MeusProjetos.tsx` **reescrito** — prévia iframe da última versão via `/site`, "Ver site" em nova aba, baixar .zip por versão, duplicar, editar (→ `/projects?edit=`), excluir com confirm.
- `components/Sidebar.tsx` + `App.tsx` — nav nova: Extrair → Galeria → Biblioteca → **Design Systems** → **Gerar site** → **Meus sites**; badge de kits; rota `/design-systems`.
- `vite.config.ts` — proxy `/site` adicionado.

### Docs
- `CLAUDE.md` — seção `generate` reescrita para o payload kit-scoped: usar SOMENTE componentes do kit; marcar `data-origem="biblioteca" data-componente=...` vs `data-origem="gerado"`; aplicar branding/copy/mídia do usuário; nunca copiar do site fonte.

## Decisões técnicas (e porquês)

- **Preview por URL de server, não srcDoc**: origem própria controlada, composição centralizada. `allow-scripts` SEM `allow-same-origin` renderiza Tailwind-CDN fielmente sem entregar a origem do app; CORS restrito a `WEB_ORIGIN` protege as mutações.
- **Kit como entidade própria** (N:N com posição): usuário pediu "vários Design Systems finais"; projects referenciam kit (`set null` ao excluir kit — site gerado sobrevive).
- **Geração kit-scoped**: o site usa só o kit do projeto, não a Biblioteca inteira — evita Frankenstein de origens que não conversam. Slots sem peça no kit são criados no estilo do kit.
- **Wizard salva por PATCH a cada etapa**: rascunho não se perde se fechar no meio; mídia sobe na hora (endpoint próprio). Reabrir (editar) reidrata do content/branding/layout/media salvos.
- **Mídia por `slotRole`** no manifest: responde "esta imagem vai onde" sem heurística; `path` é o nome relativo em `media/`.

## Como rodar / validar

```powershell
# na raiz my_app_ds
pnpm dev                      # server 8787 + web 5173 (ou INICIAR.bat)
pnpm typecheck                # tsc nos 10 pacotes (turbo)
pnpm lint                     # biome check .   (rodar 'pnpm exec biome check --write .' se acusar formatação)
pnpm --filter @ds/web build   # tsc -b + vite build
pnpm db:migrate               # migrations (0002 já aplicada)
```

- **node_modules pode estar quebrado** (symlinks pnpm pendurados: `turbo`/`typescript` sem `bin`). Se `turbo`/`tsc` falharem com "Cannot find module .../bin", rode `pnpm install` — se pedir confirmação para recriar do zero e o shell for não-interativo, use `$env:CI='true'; pnpm install --prefer-offline` (o store já tem os pacotes; foi assim que reparei nesta sessão).

## Bugs conhecidos / limitações / riscos

- **Não testado em runtime**: o caminho feliz do `generate` (precisa de um kit com componentes; evitei para não enfileirar job / gastar API) e o pipeline de preview end-to-end (o data root `~/design-system-ecosystem` desta máquina está **vazio** — 0 extrações, 0 kits — então Galeria/Biblioteca/Meus sites aparecem vazios até extrair algo). Typecheck+lint+build cobrem a compilação; o smoke test cobriu create/patch/media/generate-erro/duplicate/delete de projeto.
- `DELETE /api/design-systems/:id` ainda não apaga `vault/<id>/` do disco (TODO herdado; impacto é exibido antes).
- Preview de componente cuja extração foi apagada perde fontes/runtime (best effort; styles.css do bundle segura o grosso).
- Segmentos "sistema" em sites Tailwind-CDN dependem do CDN compilar dentro do iframe (funciona online; offline cai no ESTILO_BASE legível).
- Wizard no modo `criativo`: as etapas Estrutura/Mídia mostram poucos slots (o gerador decide a estrutura) — comportamento intencional; a etapa de Mídia cai numa lista genérica de seções (Destaque/Demonstração/Galeria/Sobre).

## Adendo 2026-07-21 (mesma sessão)

- **Progresso amigável** (`components/FluxoProgresso.tsx`): substitui a barra crua no QueuePanel por um anel de loading + trilha de etapas nomeadas em linguagem de leigo ("Extraindo o visual…", "Montando o design system…"). Mapeia o percentual (STEP 1≈15 … STEP 6≈95, 100=segmentado) para 6 etapas no extract, 3 no classify, 5 no generate. O reporte é grosso — entre um STEP e outro o número fica parado, mas o arco girando mostra que está vivo. Validado: typecheck/lint/build verdes.
- **Confirmado em produção**: a extração de teste (`ds_01KY2PSS…`) rodou pela fila e gravou design-system.html + assets; o "0% travado" era só o reporte grosso antes do primeiro STEP.
## Correções pós-reforma (2026-07-21)

- **500 ao curtir (CSS)**: `packages/isolator/src/index.ts` — `postcss.parse` estourava (`CssSyntaxError`, `<css input>:NNNN`) em CSS raspado com sintaxe que ele não engole, derrubando o `POST /api/library`. Agora isola **arquivo por arquivo** com try/catch: o arquivo problemático fica cru (menos isolado, mas curável), os demais são isolados normal. O pacote é consumido via `src`, então **exige reiniciar o servidor** para carregar.
- **Nomes em inglês**: `packages/segmenter/src/index.ts` — o nome saía do `id`/`class` do site (inglês: "Platform", "Section Padding"). Agora sai do **título visível da seção** (língua do conteúdo) e, na falta, do rótulo da **categoria em PT** (`CATEGORIA_PT`); `id`/`class` não nomeia mais. `teste01` (ds_01KY2PSS) foi re-segmentado (`pnpm segmentar`) e já mostra PT. Extrações novas saem em PT direto.
- **Progresso amigável**: ver acima (`FluxoProgresso`).

- **GitHub (push pendente de ação do usuário)**: o remote estava com o usuário **errado** (`arthurvdata`); corrigido para **`arthurvmaia`** (usuário real). O repo `arthurvmaia/design-system-ecosystem` **ainda não existe** no GitHub. As 48 alterações estão no working tree (não commitadas de propósito, para o `SUBIR-GITHUB.bat` funcionar), `.env` protegido. O GCM não libera token de forma não-interativa daqui, então o push precisa do usuário: criar o repo vazio (github.com/new, nome `design-system-ecosystem`, sem README) e rodar `SUBIR-GITHUB.bat` — ele commita e faz o push com login no navegador.
