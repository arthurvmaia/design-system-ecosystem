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

**Captura parcial não é defeito.** O orçamento padrão é 180 s (`DS_EXPLORER_ORCAMENTO_TOTAL_MS`), e num site pesado a fase de percurso — que rola a página e varre o ponteiro em cada parada — não termina nesse tempo. O que sai é bom: todos os segmentos com bundle, CSS completo, ícones desenhados. O que falta são comportamentos das dobras de baixo, e a Galeria diz isso por extenso.

Medido numa página pesada: o percurso pediu **mais de 308 s** e ainda foi cortado; a captura inteira levou 420 s. Se você quiser essa página completa, suba o orçamento:

```powershell
$env:DS_EXPLORER_ORCAMENTO_TOTAL_MS = "900000"; pnpm extrair <job_id>
```

Não vale subir por padrão: a maioria dos sites termina bem dentro dos 180 s, e o custo cairia sobre todos eles.

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

**O nome descreve a FORMA, nunca o assunto do texto de origem.** Quem lê aquele
nome está escolhendo uma peça para reusar num site completamente diferente: o
assunto do site capturado é justamente o que não vai junto. Máximo de 40
caracteres, estrutura primeiro e traço distintivo depois.

```
certo:  "Grade de 3 cartões com ícone"      "Barra fixa com hover magnético"
errado: "Recursos — IA por muito tempo…"    "Hero Split 01"
```

É a mesma regra da origem emprestar a forma e nunca o conteúdo, aplicada ao
nome. A taxonomia (as famílias e o rótulo de cada categoria em português) mora
em `packages/shared/src/schemas/taxonomia.ts` e é fonte única: não redigite
lista de categoria em tela nenhuma.

### `generate`

O payload é rico e é a fonte da verdade — não vá ler o banco por fora:

```
{ projectId, projectName,
  kitId, kit: { id, name, components: [{ id, name, category, kind, bundlePath }] },
  layout,     // ProjectLayout: secoes[{ id, nome, papel?, componentIds[], instrucao? }], density, motion, preferDesignSystemId
              // + objetivo: 'captar-contato'|'vender-produto'|'apresentar-servico'|'mostrar-trabalho'|null
              //   (decidiu a estrutura SUGERIDA; a lista de secoes ja e a decisao final do usuario)
  branding,   // ProjectBranding: brandName, tone, palette, typography, logoPath, contact, social, mainCta
              // + modelo novo (preferir quando presente): identidadeVerbal{tons, arquetipos, eixos, vocabulário},
              //   logos[{tipo, path}], logosLocais, paleta{cores, atribuicoes}, tipografia{presets, ajustes}, sociais[]
  content,    // ProjectContent: produtos[{ id, nome, descricao, preco, imagemPath, link, destaque }]
              // briefs{ secaoId→{mensagem, iaDecide} } e sections{ secaoId→texto } são ESPELHOS
              // do texto da seção; a fonte é layout.secoes[].instrucao
  media }     // MediaItem[]: { path, kind, secaoId, slotRole (espelho derivado), originalName, ... }
              // (path relativo a projects/<id>/media/)
```

O payload traz mais dois campos que mudam o jogo: `kit.designSystem` (o design
system CONSOLIDADO do kit: clusters de cor com papel semântico por origem, tema,
fontes, limitações) e `layout.permissoes` (`criarSecoesFaltantes`,
`criarArteDeApoio` — o que o usuário AUTORIZOU você a criar; desligado = não
crie, mesmo que falte).

**Você não monta mais o site à mão.** O determinístico inteiro — composição,
escopo por origem, RECOLORAÇÃO para a paleta da marca, fundo de página como
camada fixa, responsivo base, `marca.css`, cópia de assets e mídia — mora em
`montarPaginaDoKit` (`@ds/generator`), executável por comando. Seu trabalho é o
CRIATIVO, entregue como dado:

1. **Escreva `entrada-geracao.json`** na pasta do projeto
   (`~/design-system-ecosystem/projects/<prj_id>/entrada-geracao.json`), no
   formato de `scripts/pagina-montar.ts`: os campos estruturais copiados do
   payload (`projectId`, `titulo`, `kit`, `layout`, `branding`) mais o seu
   criativo:
   - `secoes[]`: por seção, `substituicoes` (trecho EXATO do HTML de origem →
     texto novo, no tom da marca — `derivarDiretrizes`/`explicarPapel` seguem
     valendo) e/ou `htmlCriado` para seção sem peça. Ao criar, consulte DUAS
     fontes nesta ordem: o `kit.designSystem` (as cores por papel, as fontes,
     o tema) e a identidade do usuário (`branding`). É isso que faz a seção
     criada parecer do mesmo site.
   - `cssCriado`: as regras das suas seções criadas (use os tokens
     `var(--marca-...)`, nunca hex solto). **O fundo é da PÁGINA, nunca da
     seção**: não declare `background` no wrapper de seção — o compositor
     envolve o seu HTML em `[data-ds-criado]` transparente sobre o fundo da
     página (`--pagina-fundo`, publicado no CSS base). Fundo local só em
     cartão/moldura, e de preferência com alfa (`color-mix(..., transparent)`),
     para a página continuar UMA superfície contínua.
   - `responsivoExtra`: o que ESTE site pede além do `cssResponsivoBase`.
   - `midia[]`: `{de, para}` — onde entra cada arquivo de
     `projects/<id>/media/`. Mídia com `secaoId` vai naquela seção; sem
     `secaoId`, a posição é decisão sua. **Vídeo (`kind: 'video'`) entra como
     `<video>`** com `muted playsInline` (e `controls` quando for conteúdo,
     `autoplay loop` quando for fundo) — nunca como `<img>`.
2. **Respeite as permissões.** Sem `criarSecoesFaltantes`, não invente seção
   que o usuário não pediu (nem nav, nem rodapé — apenas avise no resumo). Sem
   `criarArteDeApoio`, seção sem mídia fica sem mídia. Com as permissões
   ligadas, crie no estilo do kit: arte de apoio é SVG/CSS na paleta da marca
   ou reuso das mídias gerais, nunca imagem inventada por IA.
3. **Rode `pnpm pagina <caminho do entrada-geracao.json>`.** Ele monta tudo,
   imprime o destino, a contagem da recoloração e os avisos. Leia os avisos:
   substituição que não casou e peça sem bundle aparecem ali, e é mais barato
   corrigir a entrada e rodar de novo do que remendar a saída.
4. **NUNCA copie texto, nome ou marca do site de origem.** O kit empresta só o
   jeito visual; a identidade é a do usuário.
5. **Valide como sempre**: navegador headless em ~1440px e ~390px (janela na
   cara de quem usa o computador é interrupção, não validação), e feche com
   `pnpm fila:concluir <job_id>`.

**Não escreva scripts `_tmp-*` de montagem.** Se algo determinístico faltar no
`montarPaginaDoKit`, isso é defeito do motor — conserte o motor (com teste) em
vez de contornar num script descartável. Os restos de `_tmp-*` de gerações
antigas são exatamente o que este contrato aposenta.

## Avisando que está trabalhando

Um job de extração ou de geração leva minutos. Nesse tempo, quem está com o app
aberto não vê nada acontecer: a janela do PROCESSAR fica quieta e a tela da fila
diz que nada está rodando, porque nada foi reportado. A pessoa acha que travou.

Então **reporte o avanço**, pelo menos uma vez por etapa:

```powershell
pnpm fila:progresso <job_id> <0-100>
```

Para `generate`, os marcos que a tela já sabe nomear são: 25 (estrutura
escolhida), 50 (marca aplicada), 70 (textos escritos), 95 (páginas montadas).
Para `extract`, o `pnpm extrair` já reporta sozinho.

Isso é aviso, não entrega: quem marca um job como feito é o `fila:concluir`.

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
pnpm test             # suite rapida (~10s): tudo menos os testes de navegador
pnpm test:navegador   # os 11 arquivos com Chromium (~4min, precisa do playwright)
pnpm test:tudo        # os dois
pnpm verificar        # lint + typecheck + test + portao de fidelidade
pnpm db:migrate       # aplica migrations
pnpm fila             # lista a fila
pnpm extrair          # extrai um job de URL por navegador (renderiza o DOM real) — passo 1 do modo queue
pnpm explorar         # captura profunda: descobre estados interativos e baixa assets (opcional)
pnpm fila:escolher    # lista numerado e devolve os ids escolhidos (usado pelo PROCESSAR.bat)
pnpm fila:progresso   # reporta 0-100 de um job em andamento
pnpm fila:concluir    # valida, segmenta, indexa e fecha um job
pnpm segmentar        # segmenta um ds_id à mão (conserto; o fila:concluir já faz sozinho)
pnpm voz              # gera a voz do Orbis para a abertura (sintetizador do Windows)
pnpm pagina           # monta um site do kit a partir de um entrada-geracao.json (modo queue)
pnpm medir-fidelidade # mede o acervo e compara com a linha de base (--gravar adota o resultado)
                      # --falhar-se-piorar vira PORTAO: sai 1 se reprovar, 2 se nao der para verificar
pnpm reextrair        # re-captura um ds_id (ou --todos) no MESMO id, trocando só no fim
pnpm regiao:recompilar # limpa/recompila bundles do acervo sem reabrir navegador (--todos, --seco)
pnpm fila:limpar      # zera a fila inteira (roda no fim do PROCESSAR.bat)
pnpm acervo:limpar-orfas # lista (e com --apagar remove) pastas do vault sem design system no app
pnpm acervo:exportar  # zip portátil do acervo (EXPORTAR-ACERVO.bat)
pnpm acervo:importar  # importa acervo de outra máquina reescrevendo caminhos (IMPORTAR-ACERVO.bat)
```

## Verificação

O GitHub roda `.github/workflows/ci.yml` a cada push na main: lint, typecheck e a
suíte rápida, em Node 22 e 24. O job de navegador roda separado e **ainda não
bloqueia** — ele depende de tempo de parede e oscila conforme a CPU do runner.

O portão de fidelidade **não** está no CI, e não é esquecimento: ele mede o
acervo, que mora em `~/design-system-ecosystem` e não existe num runner limpo. O
que roda no CI é o teste da lógica dele (`packages/generator/src/portao.test.ts`).

Rode o portão na sua máquina depois de mexer em `engine-v2`, `composer` ou
`generator`. É o mesmo gesto que o `pnpm reextrair` já pede no fim:

```powershell
pnpm medir-fidelidade --falhar-se-piorar
```

Ele reprova (saída 1) quando algum bundle do acervo tem instrumentação vazada,
script declarado e ausente, ou seletor morto. Sai 2 quando **não deu para
verificar**: sem linha de base, acervo vazio, base ilegível. Sair 0 nesses casos
seria dizer que passou algo que ninguém mediu.

A comparação par a par só vale entre bundles do MESMO diretório. Depois de um
`pnpm reextrair`, `seg_3` é uma vaga e não uma identidade: os segmentos foram
refeitos e aquele número pode ser outra dobra da página. Quando a base for de
outro acervo, o comando diz isso por extenso em vez de comparar populações
diferentes e chamar o resultado de melhora.

## Arquitetura

- `apps/web` — React 19 + Vite + Tailwind v4. Paleta obsidian/crimson/bone. Fluxo: Extrair → Galeria (triagem) → Biblioteca (acervo) → Design Systems (kits finais) → Gerar site (wizard a partir de um kit) → Meus sites (`/meus-projetos`, fim da linha: só o que tem site em disco, com prévia via `/site`, `.zip` e edição).
- `apps/server` — Hono. `EXECUTION_MODE=queue|api` decide se registra em disco ou chama a API.
- `packages/explorer` — motor de captura por navegador (Playwright opcional). `renderPage` faz a extração fiel de qualquer URL (usada pelo `pnpm extrair`); `explorePage` faz a captura profunda de estados/assets; `assessFidelity` dá o nível de suporte/avisos de cada componente. Degrada para estático sem o navegador. Ver `docs/CAPTURE.md`.
- `packages/engine-v2` — o motor V2 da extração: instrumenta antes dos scripts do site, observa no tempo, segmenta POR EVIDÊNCIA e compila os bundles. Ele também MEDE a linguagem visual (`mapper/rampas.ts`): os degraus de tamanho de letra, respiro e raio que o site usa saem no manifesto como `designTokens`, e cada segmento declara quais degraus tem dentro. Três decisões que valem saber: **o bundle é autossuficiente** (`runtime-local.ts` decide por script se ele viaja, é dispensado ou fica remoto, e as imagens são reescritas para caminho local — um `.zip` aberto sem internet tem de continuar igual); **a classificação não promete o que não entrega** (`representation.ts`: quem depende de runtime que DESENHA nasce `capsula-runtime`); **toda cobertura parcial é declarada** (`comparar-bundle.ts` compara cada bundle com o print da dobra e diz quantos ficaram de fora e por quê).
- `packages/extractor` — loop agêntico com tools de arquivo (modo `api`). `prompt.ts` é o ativo.
- `packages/classifier` — categoriza segmentos em lote.
- `packages/generator` — compõe sites a partir da estrutura que o usuário declarou (`layout.secoes`). Também mede a fidelidade dos bundles (`fidelidade.ts`, `pnpm medir-fidelidade`).
- `packages/composer` — junta peças de origens diferentes sem que elas se estraguem: escopo do CSS por origem com `:where()` (especificidade ZERO, para o `marca.css` continuar vencendo a cascata) e os dois proxies de documento que fazem `html.dark body .card` casar. Substitui a poda do `@ds/isolator`, que descartava CSS por análise estática e errava sempre para menos.
- `packages/shared` — schemas Zod, paths, fila. Fonte da verdade dos contratos. `estrutura-marketing.ts` traz as quatro sequências de página por objetivo e o que cada seção faz.
- `packages/indexer` — SQLite via Drizzle.

Dados ficam em `~/design-system-ecosystem/`, fora do repo.
