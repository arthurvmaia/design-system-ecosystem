# Orbis

Três produtos atrás de uma porta só. Um `INICIAR.bat` sobe tudo, uma credencial
abre, e a primeira tela pergunta por onde começar.

| Porta | O que faz | Onde mora | Porta TCP |
|---|---|---|---|
| **Criação de Design System** | engenharia reversa de sites, curadoria de peças e geração de sites novos a partir do acervo | `apps/web` + `apps/server` | 5173 + 8787 |
| **Criação de Lojas Shopify** | importa o tema Shopify de verdade, edita com paridade ao editor da Shopify e devolve um ZIP instalável | [`orbis-lojas-shopify/`](orbis-lojas-shopify/README.md) | 3000 |
| **Criativos** | geração de criativos para anúncio e redes — **ainda em construção**, o cartão abre um aviso | — | — |
| *o portal* | a credencial e as três portas | `apps/portal` | 4000 |

**Os dois apps são independentes de verdade** — código, interface e dados
separados. O de lojas usa npm, vinext (Next-on-Vite) e Cloudflare Workers com D1
e R2; nada disso combina com o pnpm + Turborepo daqui, então ele fica **fora**
dos globs do workspace e fora do Biome, com lockfile, testes e lint próprios. O
que os une é só o vestíbulo: um link de volta ao portal em cada um.

A credencial é uma só e mora no servidor (`ORBIS_SENHA`). Como cookie ignora
porta, entrar no portal já vale para o app de design system — você digita uma
vez. O app de lojas não tem portão: local tudo bem, mas se um dia a suíte for
publicada por túnel, a porta 3000 precisa ser resolvida antes.

> O repositório ainda se chama `design-system-ecosystem` porque nasceu do
> primeiro dos três. O nome ficou; o escopo cresceu.

---

## O app de design system

Plataforma para engenharia reversa de sites, curadoria de componentes em uma
biblioteca própria e geração de novos sites a partir dessa biblioteca. **Daqui
para baixo, este README fala dele** — o app de lojas Shopify tem o
[seu próprio](orbis-lojas-shopify/README.md).

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

Ele cuida do resto: instala o pnpm se faltar, instala as dependências dos dois
apps, cria o `.env`, cria o banco, confere se as quatro portas estão livres e
abre o navegador no **portal**, em `http://localhost:4000`. Da segunda vez em
diante, só sobe. Se a pasta for movida ou as dependências vierem de outra
máquina, ele percebe e reinstala sozinho — não precisa apagar nada na mão.

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
- `orbis-lojas-shopify/.wrangler` — o banco e os ZIPs dos **temas Shopify que
  você importou**. Tem tema comprado ali dentro, e mandar junto é redistribuir a
  licença de outra pessoa sem querer.

Se não der para usar o GitHub, use o **`EMPACOTAR.bat`**: ele gera um zip limpo
na Área de Trabalho, sem nada disso. Quem receber extrai em qualquer pasta e
roda o `INICIAR.bat`.

### Levando o acervo junto

O repositório leva só o **app** — os design systems extraídos, a biblioteca
curada e os sites gerados moram fora dele e cada máquina começa zerada. Para
dar o seu acervo a alguém:

1. Você: duplo clique no **`EXPORTAR-ACERVO.bat`** → sai um
   `acervo-design-system-*.zip` na Área de Trabalho. Mande esse arquivo.
2. A pessoa: arrasta o zip para cima do **`IMPORTAR-ACERVO.bat`** (ou só dá
   duplo clique nele, que ele acha o zip sozinho).

O importador reescreve os caminhos do banco para a máquina de destino e, se já
existir acervo lá, transforma o atual em backup em vez de apagar. Cache, fila e
chave de API não viajam.

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
├── web/             React 19 + Vite + Tailwind v4
└── portal/          O vestíbulo: a credencial e as três portas (Vite, :4000)

orbis-lojas-shopify/ O app de lojas Shopify. FORA do workspace de propósito:
                     npm, vinext, Cloudflare Workers, lockfile e testes próprios

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
├── composer/        Junta peças de origens diferentes sem que se estraguem:
│                    escopo por origem, recoloração e retipografia pela marca
└── generator/       Composição de sites a partir do kit, na estrutura do usuário

scripts/             Fila, extração, empacotamento e o iniciar.ps1 dos .bat
docs/                Manual, arquitetura e guias
fixtures/            Casos de teste de segmentação
```

Na raiz ficam os pontos de entrada de duplo clique — `INICIAR.bat`,
`PROCESSAR.bat`, `EMPACOTAR.bat`, `EXPORTAR-ACERVO.bat`, `IMPORTAR-ACERVO.bat`,
`SUBIR-GITHUB.bat` — de propósito: são a interface de quem usa o app sem
terminal.

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
pnpm dev              # sobe server (8787) + web (5173) + portal (4000)
pnpm build            # build de tudo
pnpm lint             # biome
pnpm typecheck        # tsc em todos os pacotes
pnpm test             # testes de unidade
pnpm db:migrate       # aplica migrations
pnpm fila             # lista a fila
pnpm extrair          # extrai um job de URL por navegador
pnpm fila:concluir    # valida, segmenta, indexa e fecha um job
pnpm acervo:exportar  # zip do acervo (vault+biblioteca+sites+banco) na Área de Trabalho
pnpm acervo:importar  # importa um acervo exportado noutra máquina
```

A lista completa dos comandos de fila está no [CLAUDE.md](CLAUDE.md).

O app de lojas Shopify tem os seus, e não passam pelo pnpm — ele não pertence a
este workspace:

```powershell
cd orbis-lojas-shopify
npm install
npm run dev                       # :3000 (ou o INICIAR.bat da raiz, que sobe tudo)
npm run lint                      # eslint
node --test tests/*.test.mjs      # 25 testes
```

## Documentação

| Documento | Para quê |
|---|---|
| [docs/MANUAL.md](docs/MANUAL.md) | Manual de uso — sem terminal, para qualquer pessoa |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Arquitetura detalhada do sistema |
| [docs/CAPTURE.md](docs/CAPTURE.md) | Motor de captura por navegador |
| [docs/MIGRAR-PARA-API.md](docs/MIGRAR-PARA-API.md) | Migração do modo `queue` para o modo `api` |
| [docs/HANDOFF.md](docs/HANDOFF.md) | Histórico de decisões e estado do trabalho |
| [CLAUDE.md](CLAUDE.md) | Instruções para o Claude Code processar a fila |
| [HANDOFF.md](HANDOFF.md) | Estado atual da suíte, incluindo as três portas |
| [orbis-lojas-shopify/README.md](orbis-lojas-shopify/README.md) | O app de lojas Shopify |
| [orbis-lojas-shopify/HANDOFF.md](orbis-lojas-shopify/HANDOFF.md) | Estado do app de lojas |

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

A configuração padrão usa o **Claude Fable 5** (modelo mais capaz da Anthropic,
US$ 10/50 por milhão de tokens) na extração e na geração, em esforço máximo,
com fallback automático para o Opus 4.8 se uma requisição for recusada.
Estimativas por operação:

- Extração de um site: US$ 0,40 – 6,00 dependendo do tamanho.
- Classificação de um design system (Opus 4.8): US$ 0,05 – 0,20.
- Geração de um site: US$ 0,20 – 1,00.

Para baratear, troque `ANTHROPIC_MODEL_EXTRACTOR` e `ANTHROPIC_MODEL_GENERATOR`
para `claude-opus-4-8` no `apps/server/.env` — os valores caem pela metade.

No modo `queue` (padrão) nada disso se aplica: o processamento roda na
assinatura Claude via Claude Code.
