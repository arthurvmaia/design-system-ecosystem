# HANDOFF — estado do trabalho

> **Este arquivo é histórico.** Ele registra a reforma de julho de 2026
> (previews + entidades + fluxo). O estado ATUAL do trabalho — o que está
> pronto, o que falta e as armadilhas conhecidas — está no `HANDOFF.md` da raiz.


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
  - `POST /:id/media` (multipart, `c.req.parseBody()`) salva em `projects/<id>/media/` + anexa ao manifest com `secaoId`; `DELETE /:id/media?path=` remove; `GET /:id/media/:name` serve o arquivo (prévia no wizard).
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
- **Mídia por `secaoId`** no manifest: responde "esta imagem vai onde" sem heurística, e ancora no id da seção para sobreviver a renomear e reordenar. O `slotRole` continua no payload como espelho, derivado do papel da seção na hora de gerar. `path` é o nome relativo em `media/`.

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
- Estrutura e Mídia seguem a MESMA lista: `layout.secoes`. A etapa de Mídia é dinâmica em cima do que a pessoa montou na Estrutura, e mídia de uma seção apagada volta para "deixe o gerador decidir" em vez de sumir.

## Adendo 2026-07-21 (mesma sessão)

- **Progresso amigável** (`components/FluxoProgresso.tsx`): substitui a barra crua no QueuePanel por um anel de loading + trilha de etapas nomeadas em linguagem de leigo ("Extraindo o visual…", "Montando o design system…"). Mapeia o percentual (STEP 1≈15 … STEP 6≈95, 100=segmentado) para 6 etapas no extract, 3 no classify, 5 no generate. O reporte é grosso — entre um STEP e outro o número fica parado, mas o arco girando mostra que está vivo. Validado: typecheck/lint/build verdes.
- **Confirmado em produção**: a extração de teste (`ds_01KY2PSS…`) rodou pela fila e gravou design-system.html + assets; o "0% travado" era só o reporte grosso antes do primeiro STEP.
## Correções pós-reforma (2026-07-21)

- **500 ao curtir (CSS)**: `packages/isolator/src/index.ts` — `postcss.parse` estourava (`CssSyntaxError`, `<css input>:NNNN`) em CSS raspado com sintaxe que ele não engole, derrubando o `POST /api/library`. Agora isola **arquivo por arquivo** com try/catch: o arquivo problemático fica cru (menos isolado, mas curável), os demais são isolados normal. O pacote é consumido via `src`, então **exige reiniciar o servidor** para carregar.
- **Nomes em inglês**: `packages/segmenter/src/index.ts` — o nome saía do `id`/`class` do site (inglês: "Platform", "Section Padding"). Agora sai do **título visível da seção** (língua do conteúdo) e, na falta, do rótulo da **categoria em PT** (`CATEGORIA_PT`); `id`/`class` não nomeia mais. `teste01` (ds_01KY2PSS) foi re-segmentado (`pnpm segmentar`) e já mostra PT. Extrações novas saem em PT direto.
- **Progresso amigável**: ver acima (`FluxoProgresso`).

- **Validação pré-Galeria + tela de Revisão** (pedido do usuário): a Galeria recebe só o que foi bem interpretado. `packages/segmenter` agora valida cada candidato (`validarSegmento`): precisa ter texto de verdade (≥12 chars) OU mídia/controle; reprova invólucro vazio, fragmento < 60 chars sem mídia, e `other` sem substância. Os reprovados vão para `vault/<ds>/segments/rejeitados.json` (não o banco). Server: `GET /api/rejeitados` (agrega por DS) e `GET /api/preview/rejeitado/:dsId/:segId`. Web: rota `/revisao` (RevisaoPage) com preview + motivos, badge na sidebar, e banner na Galeria quando o DS atual tem reprovados. Conservador de propósito — na dúvida, aprova. Contratos em `packages/shared/src/schemas/segment.ts` (`RejectedSegment`, `RejeitadosManifest`) e `paths.ts` (`vaultRejeitadosPath`).

- **Modo de execução**: `EXECUTION_MODE=queue` (no `apps/server/.env`) — **não consome créditos de API**. O app só registra jobs em disco; o trabalho (extração/classificação/geração) roda no Claude Code via PROCESSAR.bat, na assinatura. A chave em `.env` só é lida se trocar para `EXECUTION_MODE=api`. Ver `apps/server/src/lib/execution-mode.ts`.

- **GitHub — SUBIDO**: remote corrigido para `github.com/arthurvmaia/design-system-ecosystem` (o usuário `arthurvdata` era typo). Repo criado pelo usuário; dois pushes feitos (reforma+correções, depois validação/Revisão). Branch `main`. `.env` protegido (fora do commit). Próximos envios: `SUBIR-GITHUB.bat` (o GCM não libera token de forma não-interativa por script).

> **IMPORTANTE — reiniciar o servidor**: o isolador (fix do 500 no curtir), a rota `/api/rejeitados` e a validação do segmenter só entram ao reiniciar o servidor (INICIAR.bat), porque o código fica em memória. Os nomes PT do teste01 já estão no banco (aparecem só atualizando a Galeria).

## Correções pós-reforma (parte 2)

- **`no such table: kits`** (banco pré-existente): a causa era o servidor **não aplicar migrations no boot** — só o `pnpm db:migrate` aplicava, e o INICIAR só o chamava quando o banco não existia. Um banco criado antes da migration de kits nunca recebia as tabelas novas. Fix: `packages/indexer/src/migrate.ts` exporta `runMigrations()` (idempotente, guardada por `process.argv` para o import no servidor não disparar o CLID); `apps/server/src/index.ts` chama `runMigrations()` no `boot()` dentro de try/catch. Validado: um banco fresco recebe `kits`/`kit_components`/`projects` via migrate. O drizzle rastreia por timestamp em `__drizzle_migrations`; o banco compartilhado tem um marco alto (no-op, seguro).
- **INICIAR não pede mais chave no modo `queue`**: `scripts/iniciar.ps1` só exige `ANTHROPIC_API_KEY` se `EXECUTION_MODE=api`. No MVP (queue) o app não usa a chave, então travar o primeiro início pedindo uma (inclusive de um amigo sem chave) não fazia sentido.
