# Design System Ecosystem

Monorepo pnpm + Turborepo. Extrai design systems de sites, cura componentes e gera novos sites a partir da biblioteca curada.

## Ao iniciar uma sessão

Leia a fila e mostre ao usuário o que está pendente:

```powershell
Get-ChildItem "$env:USERPROFILE\design-system-ecosystem\queue\pendente\*.json" | ForEach-Object { (Get-Content $_ -Raw | ConvertFrom-Json).label }
```

Apresente assim:

```
Fila: 3 pendentes
  1. Extrair — stripe.com
  2. Extrair — linear.app
  3. Gerar site — Landing Cliente X

Processar todos? (ou diga quais)
```

Se a fila estiver vazia, diga apenas isso e siga normalmente — não invente trabalho.

**Espere a resposta.** Interprete o que a pessoa disser em linguagem natural ("manda ver", "só o primeiro", "pula o 2"). Não processe nada antes de ela pedir.

**Exceção: sessão já aberta com uma ordem.** Se a sessão começou com um pedido explícito de processar jobs — é o que o `PROCESSAR.bat` faz, depois que a pessoa escolhe quais na janela — o pedido já foi feito. Não pergunte de novo: vá direto ao trabalho e só pare no fim, com o resumo. Perguntar aqui trava o processo, porque não há ninguém digitando do outro lado.

Nesse caso o pedido vem com ids específicos. **Processe só esses.** Os outros pendentes ficaram de fora de propósito — não os processe "já que estão aí".

## Como processar cada tipo

Os arquivos ficam em `~/design-system-ecosystem/queue/pendente/*.json`. Cada job tem `id`, `type`, `label`, `payload`.

### `extract`

O `payload` traz `kind: 'url' | 'html'`.

1. Busque o HTML (WebFetch para URL, ou use o HTML do payload).
2. **Siga `packages/extractor/src/prompt.ts` literalmente** — os 6 STEPs, na ordem. Esse prompt está na `PROMPT_VERSION = 3` e é o que define a qualidade da extração. Não improvise um processo próprio.
3. Escreva a saída em `~/design-system-ecosystem/vault/<ds_id>/extracted/`, na mesma estrutura que o extrator da API produz. O `design-system.html` vai nessa pasta, e os assets em `extracted/assets/{css,js,images/svg}/`.
4. Registre no banco e finalize o job (abaixo).

**Grave os assets antes do HTML.** Os STEPs 2 a 4 existem para produzir arquivos; o STEP 5 só escreve os `<link>` e `<script>` que apontam para eles. Escrever o HTML primeiro e deixar os assets para depois é o erro que gera um design system que abre sem estilo nenhum — e o `fila:concluir` agora recusa fechar um job assim, listando o que ficou faltando.

**Reporte o progresso a cada STEP.** Uma extração leva minutos e a interface fica parada enquanto isso. Depois de terminar cada STEP:

```powershell
pnpm fila:progresso <job_id> <0-100>
```

Use a proporção do prompt: STEP 1 ≈ 15, STEP 2 ≈ 35, STEP 3 ≈ 50, STEP 4 ≈ 65, STEP 5 ≈ 90, STEP 6 ≈ 95. Não precisa ser exato — precisa andar.

### `classify`

1. Leia os segmentos do design system indicado em `payload.designSystemId`.
2. Siga o `SYSTEM_PROMPT` de `packages/classifier/src/index.ts` — mesma taxonomia, mesmo formato de saída.
3. Atualize `category`, `kind` e `suggestedName` de cada segmento.

### `generate`

1. Leia `payload.layout`. Ele traz `mode`:
   - `blueprint` — a estrutura está fixada. Use `getBlueprint(payload.blueprintId)` e `resolveSlots()` de `@ds/shared`. Preencha um componente por slot, na ordem.
   - `criativo` — você decide a estrutura. Use `pickCreativeDirection(layout.creativeSeed)` e comprometa-se com a direção sorteada.
2. **Nos dois modos: use apenas componentes da biblioteca curada.** É a regra que não se quebra.
3. Respeite `density`, `motion` e `preferDesignSystemId` (prioriza peças do mesmo design system, para a página não ficar incoerente).
4. Escreva em `~/design-system-ecosystem/projects/<prj_id>/generated/<timestamp>/`.

## Finalizando um job

Depois de produzir os arquivos, indexe e feche:

```powershell
pnpm fila:concluir <job_id>
```

Isso valida o schema, registra no SQLite e move o job para `concluido/`. Se o schema não bater, ele falha alto — corrija a saída em vez de forçar.

## Regras

- **Nunca crie um watcher, cron, daemon ou qualquer coisa que processe a fila sem uma pessoa mandar.** O único gatilho válido é alguém abrir o `PROCESSAR.bat` e escolher os jobs na janela. A partir daí o processamento corre sozinho até o fim — mas só sobre os ids escolhidos, e a janela encerra quando acaba. Agendar, disparar em background ou ficar de olho na pasta descaracteriza o modo e coloca a conta do usuário em risco.
- Não chame a API da Anthropic a partir do código no modo `queue` — o trabalho é seu.
- Não invente conteúdo que não esteja no material do usuário.

## Comandos

```powershell
pnpm dev              # sobe server (8787) + web (5173)
pnpm typecheck        # tsc em todos os pacotes
pnpm lint             # biome
pnpm db:migrate       # aplica migrations
pnpm fila             # lista a fila
pnpm fila:escolher    # lista numerado e devolve os ids escolhidos (usado pelo PROCESSAR.bat)
pnpm fila:progresso   # reporta 0-100 de um job em andamento
pnpm fila:concluir    # valida a entrega, indexa e fecha um job
pnpm fila:limpar      # zera a fila inteira (roda no fim do PROCESSAR.bat)
```

## Arquitetura

- `apps/web` — React 19 + Vite + Tailwind v4. Paleta obsidian/crimson/bone. `Meus projetos` (`/meus-projetos`) é o fim da linha: lista só o que tem site gerado em disco e oferece o `.zip`.
- `apps/server` — Hono. `EXECUTION_MODE=queue|api` decide se registra em disco ou chama a API.
- `packages/extractor` — loop agêntico com tools de arquivo. `prompt.ts` é o ativo.
- `packages/classifier` — categoriza segmentos em lote.
- `packages/generator` — compõe sites a partir da biblioteca; dois modos (blueprint/criativo).
- `packages/shared` — schemas Zod, paths, fila. Fonte da verdade dos contratos.
- `packages/indexer` — SQLite via Drizzle.

Dados ficam em `~/design-system-ecosystem/`, fora do repo.
