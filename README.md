# Design System Ecosystem

Plataforma para engenharia reversa de sites, curadoria de componentes em uma biblioteca própria, e geração de novos sites a partir dessa biblioteca.

## Estado atual

**Fases 0-7 implementadas.** Loop completo: extrair → segmentar → classificar → curar → gerar.

| Fase | Módulo | Status |
|---|---|---|
| 0 | Fundação, storage, shell | ✅ testado |
| 1 | Extractor (agente Claude) | ✅ pronto, testável com API key |
| 2 | Segmenter | ✅ testado |
| 3 | Classifier (LLM) | ✅ pronto, testável com API key |
| 4 | Library (curadoria) | ✅ testado |
| 5 | Isolator (PostCSS) | ✅ testado (pragmático) |
| 6 | Tokens (extração) | ✅ testado (pragmático) |
| 7 | Generator (LLM) | ✅ pronto, testável com API key |
| 8 | Tauri (empacotamento) | ⏭ pendente |

## Requisitos

- Node.js `>=20.11.0`
- pnpm `>=9.0.0`
- Chave da Anthropic (para Fases 1, 3 e 7)

## Setup

### Windows — jeito fácil

Só precisa do [Node.js LTS](https://nodejs.org) instalado.

```powershell
git clone <url-do-repo>
cd design-system-ecosystem
```

Depois **duplo clique no `INICIAR.bat`**. Ele cuida do resto: instala o pnpm se
faltar, instala as dependências, cria o `.env`, pede sua chave da Anthropic,
cria o banco e abre o navegador. Da segunda vez em diante, só sobe o app.

Se a pasta for movida ou as dependências vierem de outra máquina, ele percebe e
reinstala sozinho — não precisa apagar nada na mão.

### Windows — na unha

```powershell
git clone <url-do-repo>
cd design-system-ecosystem
node --version                                  # precisa >= 20.11
pnpm install
Copy-Item apps/server/.env.example apps/server/.env
# abra apps\server\.env e cole sua ANTHROPIC_API_KEY
pnpm db:migrate                                 # cria ~/design-system-ecosystem/
pnpm dev                                        # server :8787 + web :5173
```

### macOS / Linux / WSL2

```bash
git clone <url-do-repo>
cd design-system-ecosystem
nvm use
pnpm install
cp apps/server/.env.example apps/server/.env
pnpm db:migrate
pnpm dev
```

Os `.bat` são só para Windows. Nos outros sistemas, `pnpm dev` sobe o app e
`pnpm fila` / `pnpm fila:concluir` processam a fila.

## Compartilhar com alguém

**Não compacte a pasta pelo Explorer.** Três coisas vão junto e quebram do outro
lado:

- `node_modules` — o pnpm monta as dependências com junctions que guardam
  caminho absoluto. O zip as desfaz, e sobra uma árvore apontando para pastas
  que não existem na outra máquina. O app morre com `Cannot find module`.
- `better-sqlite3` — binário nativo, compilado para a versão de Node e a
  arquitetura de quem instalou.
- `apps/server/.env` — **sua chave da Anthropic**, que passaria a ser usada e
  cobrada em seu nome.

Use o **`EMPACOTAR.bat`**. Ele gera um zip limpo na Área de Trabalho, sem nada
disso. Quem receber extrai em qualquer pasta e roda o `INICIAR.bat`, que instala
as dependências na máquina dele e pede a chave dele.

Pelo GitHub o `.gitignore` já cobre tudo isso: clonar e rodar o `INICIAR.bat`
funciona direto.

### Notas para Windows

- **Terminal recomendado**: Windows Terminal + PowerShell 7. O CMD antigo funciona mas o output do Turbo fica menos legível.
- **Node**: se não tem, instale via [nvm-windows](https://github.com/coreybutler/nvm-windows) e rode `nvm install 20.11.0 && nvm use 20.11.0`.
- **better-sqlite3**: ele tem binários pré-compilados para Node 20/22 no Windows x64. Se o `pnpm install` reclamar de compilação, instale Visual Studio Build Tools (opção "Desktop development with C++") e rode `pnpm rebuild better-sqlite3`.
- **Onde ficam os dados**: `C:\Users\<você>\design-system-ecosystem\`. Configurável via env var `DS_ECOSYSTEM_ROOT`.
- **Alternativa**: rodar tudo no WSL2 dá a experiência POSIX completa sem gambiarra. Recomendado se você já usa WSL para dev.

## Fluxo de uso

1. **Extrair** (`/extract`): cole URL ou envie HTML. O agente roda o prompt do professor via Claude API. Cria `vault/{ds_id}/` e segmenta automaticamente.
2. **Galeria** (`/gallery`): navegue os segmentos. Clique **Classificar via LLM** para categorizar tudo em Hero, Card, etc. Clique no coração pra curar.
3. **Biblioteca** (`/library`): componentes aprovados. Cada um vem com bundle isolado + tokens extraídos. Renomeie, remova.
4. **Projetos** (`/projects`): preencha o wizard (nome, conteúdo, cores, tipografia). Um agente LLM compõe o site usando só os componentes curados.

## Estrutura do monorepo

```
apps/
├── server/          Hono + Drizzle + SQLite
└── web/             React 19 + Vite + Tailwind v4

packages/
├── shared/          Zod schemas + paths + IDs
├── indexer/         Drizzle schema + migrations
├── extractor/       Agente Claude + prompt do professor
├── segmenter/       Parser HTML → segmentos
├── classifier/      LLM classifier de segmentos
├── isolator/        Bundle mínimo por componente (PostCSS)
├── tokens/          Extração de design tokens
└── generator/       Composição de site via LLM
```

## Onde ficam os dados

Todos em `~/design-system-ecosystem/`:

- `vault/{ds_id}/` — cada design system extraído (imutável)
- `library/{cmp_id}/` — componentes aprovados (ativo real)
- `library/_shared/{sha256}/` — assets deduplicados
- `projects/{prj_id}/` — sites gerados
- `cache/` — thumbnails, respostas de LLM
- `workspace/{task_id}/` — extrações em andamento (descartável)
- `ecosystem.db` — SQLite index

Detalhes em `docs/ARCHITECTURE.md`.

## Scripts

- `pnpm dev` sobe server + web (Turbo)
- `pnpm build` build de tudo
- `pnpm lint` Biome check
- `pnpm typecheck` TypeScript check
- `pnpm db:generate` nova migration a partir do schema Drizzle
- `pnpm db:migrate` aplica migrations

## Custos aproximados de LLM

Cada operação consome tokens da Anthropic. Estimativa:

- Extração de um site (Fase 1): US$ 0,20 - 3,00 dependendo do tamanho.
- Classificação de um DS (Fase 3): US$ 0,05 - 0,20.
- Geração de um site (Fase 7): US$ 0,10 - 0,50.

Cache do system prompt do professor não está ativado nesta versão do SDK. Ativar cache seria uma otimização futura.

## Limitações reconhecidas

**Fase 5 (Isolator):** faz matching por classes/tags/ids. Regras como `.hero .button` são mantidas mas o pai `.hero` não existe no isolamento, então o botão pode renderizar diferente do original. Solução completa exige rescrita de seletores.

**Fase 6 (Tokens):** extrai valores repetidos (2+ ocorrências) mas não agrupa cores próximas (`#7f1d1d` vs `#801e1e`) em um só token. Cluster perceptivo é próxima iteração.

**Fase 7 (Generator):** compõe usando qualquer componente da library. Se você misturou componentes de sites muito diferentes, o resultado pode ficar visualmente incoerente. Curadoria é responsabilidade do usuário.

**Playwright é opcional.** Se não estiver instalado, URL fetching cai no fetch nativo do Node — funciona pra sites server-rendered mas não pra SPAs. Instale com `pnpm --filter @ds/extractor add playwright && npx playwright install chromium` se precisar.

## Próxima fase

Fase 8 (Tauri) empacota tudo como app desktop. Ficou pendente porque muda o runtime e você provavelmente vai querer iterar sobre o loop primeiro com sites reais.
