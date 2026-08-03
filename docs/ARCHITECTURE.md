# Arquitetura

Este documento registra as decisões de projeto para o Design System Ecosystem:
o "como" de cada parte. Para o estado atual do trabalho, veja o `HANDOFF.md` na
raiz; para o uso diário sem terminal, o `docs/MANUAL.md`.

## Princípios

1. **Local-first.** Todos os dados do usuário vivem em `~/design-system-ecosystem/`. Zero dependência de nuvem no MVP. Sync é aditivo depois.
2. **Filesystem como fonte de verdade para conteúdo.** SQLite indexa metadados e relações, não guarda arquivos. Você pode dar `cat` em qualquer coisa.
3. **Contrato de entrada imutável.** O script do professor (`Extract HTML Design System v3.md`) nunca é modificado. Ele é a boundary entre "extração" e "consumo".
4. **Curadoria explícita.** O ativo do projeto é a `library/`. Design systems no `vault/` são matéria-prima descartável.
5. **Reprocessável.** Toda transformação pode ser rerodada a partir do vault. Nada é perdido se um passo for reescrito.
6. **LLM é cacheado.** Cada chamada é keyed por hash de input. Reprocessar é gratuito se nada mudou.

## Camadas de storage

Cinco tiers com características distintas:

| Tier | Papel | Estado | Custo de perda |
|------|-------|--------|----------------|
| Vault | Todo DS já processado, arquivado imutável | Permanente | Reprocessa tudo do zero |
| Library | Componentes aprovados pelo usuário | Permanente, curado | Alto: é o ativo |
| Projects | Sites gerados | Permanente | Regenerável |
| Cache | Thumbnails, respostas LLM, screenshots | Regenerável | Custo de tempo e API |
| Workspace | Extração em curso | Temporário | Zero (só perde a task ativa) |

Camada transversal: **Index** (SQLite) que aponta para arquivos no filesystem.

## Layout do disco

```
~/design-system-ecosystem/
├── ecosystem.db                    # SQLite index
├── ecosystem.config.json           # preferências
├── .lock                           # exclusão mútua entre processos
├── vault/{ds_id}/{source,extracted,segments}/
├── library/{_shared,{cmp_id}/{bundle,tokens.json,preview.png,metadata.json}}/
├── projects/{prj_id}/{content,branding,media,generated}/
├── cache/{thumbnails,llm,playwright}/
└── workspace/{task_id}/{input,output,task.json}/
```

## IDs

Todos os IDs são ULIDs com prefixo por tipo:
- `ds_` design system
- `seg_` segmento (componente candidato)
- `cmp_` componente da library
- `prj_` projeto
- `task_` task de background

Escolha:
- Ordenáveis por tempo (lexicográfico)
- 26 caracteres úteis, curtos o suficiente para logs
- Sem risco de colisão prática
- Prefixo torna logs legíveis: `cmp_01H...` é claramente um componente

## SQLite

- `journal_mode = WAL` para leituras concorrentes
- `foreign_keys = ON` sempre
- `synchronous = NORMAL` para performance sem risco de corrupção
- `busy_timeout = 5000` para lidar com locks em burst

Índices calibrados por query real (não spec):
- `segments(design_system_id, category)` para a galeria filtrada
- `library_components(added_at DESC)` para "recentes"
- `library_components(bundle_hash)` para detecção de duplicata
- `component_tags(tag)` para busca por tag
- FTS5 virtual `components_fts(name, notes, tags)` para busca textual

## Contrato de dados (Zod)

Todo estado que trafega entre servidor e cliente é validado por schema Zod (em `@ds/shared/schemas`). Nunca desserializamos JSON sem passar por `.parse()`. Trade-off é overhead pequeno em runtime pela garantia de que dados corrompidos ou versões antigas quebram no ponto de entrada, não no meio.

Schemas versionados aqui:
- `DesignSystemRecord`, `CreateDesignSystemInput`, `StackManifest`
- `SegmentRecord`, `SegmentsManifest`, `ComponentCategory`, `ComponentKind`
- `LibraryComponentRecord`, `ComponentDependency`, `ComponentTokens`, `ComponentMetadata`, `SharedAssetMetadata`
- `ProjectRecord`, `ProjectContent`, `ProjectBranding`, `MediaItem`, `MediaManifest`, `ProjectComponentLink`
- `TaskManifest`, `LlmCacheRecord`

## Ciclo de vida

**Extração:**
1. Usuário envia URL ou HTML.
2. Cria `task_id` e `workspace/{task_id}/`.
3. Se URL, faz fetch com Playwright.
4. Roda script do professor via Claude API em `workspace/{task_id}/output/`.
5. Valida output contra schema.
6. Move para `vault/{ds_id}/extracted/`.
7. Segmentador roda em cima, escreve `vault/{ds_id}/segments/`.
8. Insere linhas em `design_systems` e `segments`.
9. Deleta `workspace/{task_id}/`.

**Curadoria:**
1. Usuário clica coração num segmento.
2. Isolator gera bundle self-contained.
3. Bundle grava em `library/{cmp_id}/bundle/`.
4. Assets compartilhados (fontes, ícones comuns) vão para `library/_shared/{sha256}/`.
5. Insere linhas em `library_components` e `component_dependencies`.
6. Atualiza `segments.in_library = true`.

**Geração:**
1. Cria `prj_id` e pasta.
2. Usuário preenche content, branding, media via wizard.
3. Agente LLM escolhe componentes da library, compõe.
4. Aplica tokens da marca sobre os componentes escolhidos.
5. Escreve `projects/{prj_id}/generated/{iso_timestamp}/`.
6. Nunca sobrescreve gerações anteriores.

## Concorrência

Single-user local. SQLite em WAL permite reads concorrentes com writes.
- Lockfile na raiz (`~/design-system-ecosystem/.lock`) impede dois processos escrevendo simultaneamente.
- Tasks longas (extração, geração) rodam em worker separado com fila.
- API do servidor é stateless: tudo persiste no filesystem ou SQLite.

## Backup e recuperação

Ordem de prioridade para backup:
1. `library/` (ativo real)
2. `vault/` (fonte para reconstruir tudo)
3. `ecosystem.db` (reconstrutível a partir do filesystem)

`cache/` e `workspace/` nunca precisam de backup.

Script planejado: `ds rebuild-index` varre o filesystem e reconstrói o SQLite a partir dos `metadata.json` de cada componente, do `manifest.json` de cada segments folder, e dos `metadata.json` dos projects.

## Trade-offs conscientes

- **Não uso content-addressable como PK.** Perderia estabilidade de referência quando bundles mudam trivialmente. ULID é PK, `bundle_hash` é campo separado.
- **JSON blobs em text.** Simples e valido no ponto de leitura via Zod. Migrar para JSON1 ou colunas separadas só se performance de query provar necessário.
- **Categoria no DB, não como pasta.** Categoria pode mudar (retag). Pastas por ID são estáveis.
- **BLOBs fora do DB.** Filesystem tem melhor DX (grep, diff, backup incremental) e permite Playwright renderizar direto.
- **Sem soft-delete.** Deleta física com cascade. Se o usuário quiser desfazer, tem que reimportar do vault.

## Stack

Frontend: React 19, Vite 6, Tailwind v4, TanStack Query 5, Zustand 5, Zod, lucide-react, react-router 7.
Backend: Hono 4 sobre @hono/node-server, Drizzle ORM sobre better-sqlite3, @anthropic-ai/sdk.
Ferramentas: pnpm workspaces, Turborepo 2, Biome 1.9, TypeScript 5.7.
Captura e composição: Playwright, PostCSS + selector-parser, node-html-parser.

## Módulos

### @ds/extractor
Runner do prompt do professor via Claude API com tool_use. Ferramentas expostas ao agente: `create_file`, `str_replace`, `view` — todas confinadas ao workspace com proteção contra path traversal. Fluxo: fetch URL (Playwright opcional ou fetch nativo) → agente Claude loop até `EXTRACTION_COMPLETE` → validação de output → migração pro vault → limpeza do workspace.

### @ds/segmenter
Parse do `design-system.html` via node-html-parser. Estratégia: itera sobre filhos diretos do `<body>`, usa comentários `<!-- [id] -->` para nomear (padrão do professor), fallback pra id/class/tag. Escreve `manifest.json` em `vault/{ds}/segments/`.

### @ds/classifier
Batch classifier via LLM. Envia 8 segmentos por chamada, recebe JSON validado por Zod com `category` + `kind` + `suggestedName`. Sem tool_use, só JSON puro. Atualiza tabela `segments` em transação. As categorias e as famílias vêm de `packages/shared/src/schemas/taxonomia.ts`, que é fonte única — nenhuma tela ou pacote redigita a lista.

### @ds/isolator
Bundle mínimo por componente. Coleta classes/tags/ids do HTML do segmento, parse todo o CSS do vault via PostCSS, para cada regra checa se algum seletor casa com os tokens coletados (usando `postcss-selector-parser`). Remove regras não usadas, mantém as demais. Detecta assets referenciados (url(), src, href).

A poda por análise estática **não é mais** o caminho da composição: ela errava sempre para menos, descartando CSS que a peça usava. Quem compõe hoje é o `@ds/composer`. O isolator continua importado pela rota da Biblioteca.

### @ds/composer
Junta peças de origens diferentes sem que elas se estraguem. Escopa o CSS por origem com `:where()` (especificidade ZERO, para o `marca.css` continuar vencendo a cascata) e mantém dois proxies de documento, o que faz `html.dark body .card` casar dentro da peça. Também reescreve VALOR no ponto de uso: `recolorir.ts` troca literais de cor por `var(--marca-<papel>, <literal>)` e `retipografar.ts` faz o mesmo com `font-family`. Em ambos, o literal original é sempre o fallback, e nenhuma das duas jamais declara um `--marca-*` — só consome.

### @ds/engine-v2
Motor de captura V2: instrumenta a página antes dos scripts do site, observa no tempo, segmenta por evidência e compila os bundles. Também mede a linguagem visual (`mapper/rampas.ts`): os degraus de tamanho de letra, respiro e raio saem no manifesto como `designTokens`.

### @ds/generator
Compõe o site a partir da estrutura que o usuário declarou (`layout.secoes`). A composição é **determinística**, não agêntica: `montarPaginaDoKit` faz escopo por origem, recoloração, retipografia, fundo de página, responsivo base, `marca.css` e cópia de assets. O que vem de um LLM é só o criativo, entregue como dado num `entrada-geracao.json`. Cada geração escreve em nova pasta timestampada, nunca sobrescreve.

## Rotas do servidor

- `GET /health` — status do sistema
- `GET/POST/DELETE /api/design-systems` — CRUD de design systems, POST dispara extração
- `GET /api/design-systems/:id/segments` — lista segmentos
- `POST /api/design-systems/:id/classify` — dispara classificação LLM
- `GET/POST/PATCH/DELETE /api/library` — CRUD da library, POST isola + tokeniza automaticamente
- `GET/POST /api/projects` — cria projeto e dispara geração
- `GET /api/tasks/:id` — polling de tarefas em background
- `GET /vault/:dsId/*` — serve assets do vault (para iframes de preview)
