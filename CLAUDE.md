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

O `payload` traz `kind: 'url' | 'html'`. **Não faça à mão** — a extração é um comando determinístico. Dois passos:

```powershell
pnpm extrair <job_id>        # renderiza o DOM real por navegador e grava no vault
pnpm fila:concluir <job_id>  # valida, segmenta, indexa e fecha o job
```

O `pnpm extrair` abre a URL num navegador de verdade (Playwright), espera o conteúdo dinâmico, rola a página para disparar lazy-load, torna as referências absolutas e grava o `design-system.html` no vault já registrando o design system no banco. É isso que faz **qualquer URL** funcionar — inclusive sites que respondem 403 a fetch estático ou que montam tudo por JavaScript (SPA). Ele reporta o progresso sozinho.

**Não use WebFetch nem siga os 6 STEPs do `prompt.ts` à mão.** Aquele processo (reescrever/traduzir o HTML via LLM) só enxergava o HTML servido e perdia justamente os sites pesados. O `prompt.ts` continua existindo para o modo `api`, mas no modo `queue` a captura fiel vem do navegador, não de reconstrução manual.

**Sem Playwright instalado**, o `pnpm extrair` cai para fetch estático e avisa — sites protegidos/SPA podem vir incompletos. Para a captura completa, instale uma vez:

```powershell
pnpm --filter @ds/explorer exec playwright install chromium
```

**Captura profunda (opcional).** Para descobrir os estados interativos (accordion aberto, dropdown, modal em portal) e baixar os assets localmente, rode `pnpm explorar <url>` — é o passo caro que grava um manifesto rico em `vault/<ds>/capture/`. A extração normal não precisa dele: a fidelidade de cada segmento (o selo da Galeria) já sai da análise estática no `fila:concluir`.

### `classify`

1. Leia os segmentos do design system indicado em `payload.designSystemId`.
2. Siga o `SYSTEM_PROMPT` de `packages/classifier/src/index.ts` — mesma taxonomia, mesmo formato de saída.
3. Atualize `category`, `kind` e `suggestedName` de cada segmento.

**Segmento com `parent_id` é um SUBCOMPONENTE** — uma peça extraída de dentro de
uma seção (botão, selo, campo, item de acordeão). A `category` dele tem de ser de
peça (`button`, `badge`, `input`, `accordion`, `card`, `nav`, `other`), nunca de
seção: um botão do hero é `button`, não `hero`. No modo `api` o servidor recusa a
troca sozinho; aqui a regra é sua.

### `generate`

O payload é rico e é a fonte da verdade — não vá ler o banco por fora:

```
{ projectId, projectName,
  kitId, kit: { id, name, components: [{ id, name, category, kind, bundlePath }] },
  layout,     // ProjectLayout: mode, blueprintId, disabledRoles, placements[{role, escolha, componentId, observacao}], density, motion
  blueprintId,
  branding,   // ProjectBranding: brandName, tone, palette, typography, logoPath, contact, social, mainCta
              // + modelo novo (preferir quando presente): identidadeVerbal{tons, arquetipos, eixos, vocabulário},
              //   logos[{tipo, path}], logosLocais, paleta{cores, atribuicoes}, tipografia{presets, ajustes}, sociais[]
  content,    // ProjectContent: briefs{ role→{mensagem, pontos, provas, cta} } (fonte) + sections{ role→texto } (espelho legado)
              // + produtos[{ id, nome, descricao, preco, imagemPath, link, destaque }]
  media }     // MediaItem[]: { path, kind, slotRole, originalName, ... } (path relativo a projects/<id>/media/)
```

1. **Use SOMENTE os componentes do kit** (`payload.kit.components`), nunca a Biblioteca inteira. Cada componente tem `bundlePath` — leve o **bundle completo**: o corpo do `index.html` (bundles V2 são documentos completos; extraia o `<body>` e remova `<aside data-ds-aviso>`), TODO o CSS (`assets/css/*.css` em ordem, ou `styles.css` no legado), o JS de `assets/js/` e os arquivos de `assets/`. Copie os arquivos para `assets/<cmp_id>/` no site gerado e reescreva as referências — componentes não colidem entre si. O kit é o Design System final; sair dele traz peças de origens que não conversam.
2. Leia `payload.layout.mode`:
   - `blueprint` — a estrutura está fixada. Use `getBlueprint(payload.blueprintId)` e `resolveSlots()` de `@ds/shared`. Um slot por posição, na ordem. **Respeite `layout.placements`**: `resolverPlacements()` de `@ds/shared` resolve — escolha fixada é ordem, sugestão é preferência, `observacao` é instrução daquela seção.
   - `criativo` — você decide a estrutura. Use `pickCreativeDirection(layout.creativeSeed)` e comprometa-se com a direção sorteada.
3. **Preencha cada slot.** Se o kit tem um componente da categoria do slot (`ROLE_CATEGORIES` de `@ds/shared`), use-o e envolva em `<section data-secao="role" data-origem="biblioteca" data-componente="cmp_...">`. Se não tem, **crie** o HTML/CSS/JS daquele slot no estilo do kit (mesmas cores, tipografia, espaçamento, densidade) com `data-origem="gerado"`. Nenhum slot fica vazio.
4. **A IDV do usuário entra POR CIMA do esqueleto, nunca dentro dele**: o CSS dos componentes fica em `assets/styles.css` e a marca em `assets/marca.css`, carregada DEPOIS — os tokens vencem a cascata sem `!important`. Com `branding.paleta`, use `distribuirTokens()` (17 tokens semânticos); com `branding.tipografia`, use `derivarEscala()` (H1–H6, peso, respiro). Texto vem de `content.briefs[role]` (mensagem, pontos, provas, cta — fonte estruturada; `sections` é só o espelho legado). Brief com `iaDecide: true` = a pessoa delegou o texto daquela seção: escreva no tom da marca SEM inventar fatos, números, clientes ou prêmios — sem informação concreta, texto seguro e genérico, fácil de editar. Logos: `distribuirLogos(branding.logos)` decide a variação por local (`logosLocais` sobrepõe). Mídias de `media` entram no slot indicado por `slotRole`. Respeite a voz (`identidadeVerbal` → `derivarDiretrizes()`), `density` e `motion`.
5. **Mídia e produtos.** Mídia com `slotRole` entra naquela seção; mídia **sem** `slotRole` foi deixada de propósito para você posicionar onde funcionar melhor. `content.produtos` é a vitrine: monte-a com as peças do kit (card/pricing/gallery), usando `imagemPath` como foto e respeitando o que está vazio — produto sem preço não ganha preço inventado. Lista vazia significa que o site **não tem** seção de produto.
6. **NUNCA copie texto, nome ou marca do site de origem.** O kit empresta só o jeito visual; a identidade é a do usuário.
7. **Responsividade é REQUISITO, não melhoria.** O site precisa de uma versão mobile pensada: meta viewport, nada de rolagem horizontal, colunas empilhadas, mídia proporcional, texto ≥16px, alvos de toque ≥44px, navegação adaptada. Escreva a camada em `assets/responsivo.css` carregada ENTRE `styles.css` e `marca.css` (use `cssResponsivoBase()` de `@ds/generator` como base e adapte o que o kit exigir, sem perder o estilo dele). Valide em ~1440px e ~390px antes de concluir.
8. Escreva em `~/design-system-ecosystem/projects/<prj_id>/generated/<timestamp>/` com `index.html` + assets. É o que a tela **Meus sites** serve na prévia e empacota no `.zip`. O `fila:concluir` valida: assets referenciados existem, `marca.css` carrega depois do `styles.css`, toda seção tem `data-origem`, a meta viewport está declarada e existe CSS com `@media` de largura.

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
pnpm extrair          # extrai um job de URL por navegador (renderiza o DOM real) — passo 1 do modo queue
pnpm explorar         # captura profunda: descobre estados interativos e baixa assets (opcional)
pnpm fila:escolher    # lista numerado e devolve os ids escolhidos (usado pelo PROCESSAR.bat)
pnpm fila:progresso   # reporta 0-100 de um job em andamento
pnpm fila:concluir    # valida, segmenta, indexa e fecha um job
pnpm segmentar        # segmenta um ds_id à mão (conserto; o fila:concluir já faz sozinho)
pnpm fila:limpar      # zera a fila inteira (roda no fim do PROCESSAR.bat)
pnpm acervo:exportar  # zip portátil do acervo (EXPORTAR-ACERVO.bat)
pnpm acervo:importar  # importa acervo de outra máquina reescrevendo caminhos (IMPORTAR-ACERVO.bat)
```

## Arquitetura

- `apps/web` — React 19 + Vite + Tailwind v4. Paleta obsidian/crimson/bone. Fluxo: Extrair → Galeria (triagem) → Biblioteca (acervo) → Design Systems (kits finais) → Gerar site (wizard a partir de um kit) → Meus sites (`/meus-projetos`, fim da linha: só o que tem site em disco, com prévia via `/site`, `.zip` e edição).
- `apps/server` — Hono. `EXECUTION_MODE=queue|api` decide se registra em disco ou chama a API.
- `packages/explorer` — motor de captura por navegador (Playwright opcional). `renderPage` faz a extração fiel de qualquer URL (usada pelo `pnpm extrair`); `explorePage` faz a captura profunda de estados/assets; `assessFidelity` dá o nível de suporte/avisos de cada componente. Degrada para estático sem o navegador. Ver `docs/CAPTURE.md`.
- `packages/extractor` — loop agêntico com tools de arquivo (modo `api`). `prompt.ts` é o ativo.
- `packages/classifier` — categoriza segmentos em lote.
- `packages/generator` — compõe sites a partir da biblioteca; dois modos (blueprint/criativo).
- `packages/shared` — schemas Zod, paths, fila. Fonte da verdade dos contratos.
- `packages/indexer` — SQLite via Drizzle.

Dados ficam em `~/design-system-ecosystem/`, fora do repo.
