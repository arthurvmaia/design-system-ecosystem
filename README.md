# Design System Ecosystem

Plataforma para engenharia reversa de sites, curadoria de componentes em uma
biblioteca própria e geração de novos sites a partir dessa biblioteca.

**Fluxo:** Extrair → Galeria (triagem) → Biblioteca (acervo) → Design Systems
(kits) → Gerar site (wizard com sua marca) → Meus sites (prévia, `.zip`, edição).

---

## Comece aqui (Windows)

Só precisa do [Node.js LTS](https://nodejs.org) instalado.

1. **Baixe o projeto**, de um dos dois jeitos:
   - com git:
     ```powershell
     git clone https://github.com/arthurvmaia/design-system-ecosystem.git
     ```
   - sem git: na página do repositório, **Code → Download ZIP**, e extraia em
     qualquer pasta.
2. **Duplo clique no `INICIAR.bat`.**

Ele cuida do resto: instala o pnpm se faltar, instala as dependências, cria o
`.env`, cria o banco e abre o navegador em `http://localhost:5173`. Da segunda
vez em diante, só sobe o app. Se a pasta for movida ou as dependências vierem
de outra máquina, ele percebe e reinstala sozinho — não precisa apagar nada na
mão.

> **Avisos do Windows na primeira vez:** se o SmartScreen mostrar "o Windows
> protegeu o computador", clique em **Mais informações → Executar assim mesmo**.
> Se o firewall pedir permissão para o Node, autorize.

Para **processar a fila** (extrações, classificação e geração de sites) no modo
padrão, instale também o [Claude Code](https://claude.com/product/claude-code)
e use o **`PROCESSAR.bat`**. Ele roda na assinatura Claude de quem usa —
assinatura é individual, cada pessoa entra com a sua.

O passo a passo de uso completo, sem terminal, está em
**[docs/MANUAL.md](docs/MANUAL.md)**.

## Modos de execução

| Modo | O que acontece | Custo |
|---|---|---|
| `queue` (padrão) | O app registra pedidos numa fila em disco; você processa com o `PROCESSAR.bat` no Claude Code | Assinatura Claude — não consome créditos de API |
| `api` | O app chama a API da Anthropic direto, sem pausa | Créditos de API |

A troca é uma variável (`EXECUTION_MODE` em `apps/server/.env`). Guia completo
em [docs/MIGRAR-PARA-API.md](docs/MIGRAR-PARA-API.md).

## Setup manual

### Windows — na unha

```powershell
git clone https://github.com/arthurvmaia/design-system-ecosystem.git
cd design-system-ecosystem
node --version                                  # precisa >= 20.11
pnpm install
Copy-Item apps/server/.env.example apps/server/.env
# modo api: abra apps\server\.env e cole sua ANTHROPIC_API_KEY
pnpm db:migrate                                 # cria ~/design-system-ecosystem/
pnpm dev                                        # server :8787 + web :5173
```

### macOS / Linux / WSL2

```bash
git clone https://github.com/arthurvmaia/design-system-ecosystem.git
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

O jeito certo é **pelo GitHub**: a pessoa clona (ou baixa o ZIP) e roda o
`INICIAR.bat` — o `.gitignore` já garante que segredos e dados não vão junto.

**Não compacte a pasta pelo Explorer.** Três coisas vão junto e quebram do outro
lado:

- `node_modules` — o pnpm monta as dependências com junctions que guardam
  caminho absoluto. O zip as desfaz, e sobra uma árvore apontando para pastas
  que não existem na outra máquina. O app morre com `Cannot find module`.
- `better-sqlite3` — binário nativo, compilado para a versão de Node e a
  arquitetura de quem instalou.
- `apps/server/.env` — **sua chave da Anthropic**, que passaria a ser usada e
  cobrada em seu nome.

Se não der para usar o GitHub, use o **`EMPACOTAR.bat`**: ele gera um zip limpo
na Área de Trabalho, sem nada disso. Quem receber extrai em qualquer pasta e
roda o `INICIAR.bat`.

## Notas para Windows

- **Terminal recomendado**: Windows Terminal + PowerShell 7. O CMD antigo funciona mas o output do Turbo fica menos legível.
- **Node**: se não tem, instale via [nvm-windows](https://github.com/coreybutler/nvm-windows) e rode `nvm install 20.11.0 && nvm use 20.11.0`.
- **better-sqlite3**: ele tem binários pré-compilados para Node 20/22 no Windows x64. Se o `pnpm install` reclamar de compilação, instale Visual Studio Build Tools (opção "Desktop development with C++") e rode `pnpm rebuild better-sqlite3`.
- **Onde ficam os dados**: `C:\Users\<você>\design-system-ecosystem\`. Configurável via env var `DS_ECOSYSTEM_ROOT`.
- **Alternativa**: rodar tudo no WSL2 dá a experiência POSIX completa sem gambiarra. Recomendado se você já usa WSL para dev.

## Estrutura do monorepo

```
apps/
├── server/          API Hono + Drizzle + SQLite (EXECUTION_MODE=queue|api)
└── web/             React 19 + Vite + Tailwind v4

packages/
├── shared/          Schemas Zod, paths, fila — fonte da verdade dos contratos
├── indexer/         Índice SQLite via Drizzle (schema + migrations)
├── explorer/        Captura por navegador (Playwright opcional): renderiza o
│                    DOM real de qualquer URL, inclusive SPAs
├── engine-v2/       Motor de captura V2: instrumenta a página, explora estados
│                    interativos e compila bundles
├── extractor/       Loop agêntico de extração via API (modo api)
├── segmenter/       Parser HTML → segmentos
├── classifier/      Classificação de segmentos via LLM
├── isolator/        Bundle mínimo por componente (PostCSS)
├── tokens/          Extração de design tokens
└── generator/       Composição de sites a partir do kit (blueprint/criativo)

scripts/             Fila, extração, empacotamento e o iniciar.ps1 dos .bat
docs/                Manual, arquitetura e guias
fixtures/            Casos de teste de segmentação
```

Na raiz ficam os pontos de entrada de duplo clique — `INICIAR.bat`,
`PROCESSAR.bat`, `EMPACOTAR.bat`, `SUBIR-GITHUB.bat` — de propósito: são a
interface de quem usa o app sem terminal.

## Onde ficam os dados

Todos fora do repositório, em `~/design-system-ecosystem/`:

- `vault/{ds_id}/` — cada design system extraído (imutável)
- `library/{cmp_id}/` — componentes aprovados (ativo real)
- `library/_shared/{sha256}/` — assets deduplicados
- `projects/{prj_id}/` — sites gerados
- `queue/` — fila de trabalho (`pendente/`, `concluido/`)
- `cache/` — thumbnails, respostas de LLM
- `ecosystem.db` — índice SQLite

Detalhes em [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Scripts

```powershell
pnpm dev              # sobe server (8787) + web (5173)
pnpm build            # build de tudo
pnpm lint             # biome
pnpm typecheck        # tsc em todos os pacotes
pnpm test             # testes de unidade
pnpm db:migrate       # aplica migrations
pnpm fila             # lista a fila
pnpm extrair          # extrai um job de URL por navegador
pnpm fila:concluir    # valida, segmenta, indexa e fecha um job
```

A lista completa dos comandos de fila está no [CLAUDE.md](CLAUDE.md).

## Documentação

| Documento | Para quê |
|---|---|
| [docs/MANUAL.md](docs/MANUAL.md) | Manual de uso — sem terminal, para qualquer pessoa |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Arquitetura detalhada do sistema |
| [docs/CAPTURE.md](docs/CAPTURE.md) | Motor de captura por navegador |
| [docs/MIGRAR-PARA-API.md](docs/MIGRAR-PARA-API.md) | Migração do modo `queue` para o modo `api` |
| [docs/HANDOFF.md](docs/HANDOFF.md) | Histórico de decisões e estado do trabalho |
| [CLAUDE.md](CLAUDE.md) | Instruções para o Claude Code processar a fila |

## Limitações reconhecidas

- **Isolator:** faz matching por classes/tags/ids. Regras como `.hero .button`
  são mantidas mas o pai `.hero` não existe no isolamento, então o botão pode
  renderizar diferente do original.
- **Tokens:** extrai valores repetidos (2+ ocorrências) mas não agrupa cores
  próximas (`#7f1d1d` vs `#801e1e`) em um só token.
- **Generator:** compõe usando os componentes do kit escolhido. Se o kit mistura
  componentes de sites muito diferentes, o resultado pode ficar visualmente
  incoerente — curadoria é responsabilidade de quem usa.
- **Playwright é opcional.** Sem ele, a extração cai para fetch estático —
  funciona para sites server-rendered, não para SPAs. Para a captura completa:
  `pnpm --filter @ds/explorer exec playwright install chromium`.

## Custos aproximados (modo `api`)

- Extração de um site: US$ 0,20 – 3,00 dependendo do tamanho.
- Classificação de um design system: US$ 0,05 – 0,20.
- Geração de um site: US$ 0,10 – 0,50.

No modo `queue` (padrão) nada disso se aplica: o processamento roda na
assinatura Claude via Claude Code.
