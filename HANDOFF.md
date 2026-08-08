# HANDOFF — onde o trabalho está

> ## ⚡ ONDE PARAMOS — 2026-08-08, fim da sessão
>
> **11 commits na branch `conserto/defeitos-do-dono-e-rastreamento`.** O `main`
> está intocado e o push segue NÃO autorizado. A branch está a um
> `git merge --ff-only` de distância, se o dono mandar.
>
> ### A mudança que rege o resto
>
> A conferência passou a MEDIR o que era chutado. A regra S4 ("o texto se lê")
> morava no aceite da montagem recebendo `contrastesAbaixoDoPiso: 0` — a
> constante, cravada no código — e por isso deu verde em TODO site gerado sem
> nunca ter comparado duas cores. Ela saiu de lá.
>
> Agora existe **`pnpm conferir <pasta> [--corrigir]`**: abre o site em 1440 e
> 390 e mede contraste real, texto apagado, slot de mídia vazio, transbordo e
> seção que tem conteúdo e não ocupa espaço — **S4, S13, S11, S12, S14**. Com
> `--corrigir`, escreve o conserto no `assets/ajustes.css`.
>
> **O critério do dono, e que vale para todo trabalho novo aqui:** cada ajuste
> feito à mão tem de virar métrica que serve a qualquer site.
>
> ### O que fazer ao sentar
>
> 1. **O SJDR** (`prj_01KZGQBQHW59W5Y71MPGP2NVPF`) está a 14 trechos de passar,
>    e a causa já está diagnosticada: a recoloração migra o TEXTO para a tinta
>    clara da marca e deixa a SEÇÃO com o creme da origem — meia migração. O
>    conserto é no motor (`recolorir.ts`), não na folha de ajustes.
> 2. **Imagens saem do Magnific** (MCP, nano banana 2 em 1k), nunca mais da
>    Pexels — em qualquer site e no próprio app. Os seis prompts do SJDR estão
>    em `scratchpad/prompts-sjdr.json` da sessão; se sumiram, a régua está na
>    memória. O ponto do motor é `apps/server/src/lib/marca-automatica.ts`.
> 3. **Faltam três sites**: Meridiano (relógios), Voltz (eletrônicos) e AVDSGN
>    (portfólio). Os projetos existem, com marca e mídia.
>
> ### Entregue e aprovado
>
> O site da **clínica** (`prj_01KZFRJGVXNE2XREDF70CWHDRT`) passou em todas as
> regras de aceite, sem pendência, validado em 1440 e 390.
>
> ### Armadilha que pegou três vezes
>
> O bloco `MEDIR` do `scripts/conferir-site.ts` é um **template literal**. Crase
> dentro dele FECHA o template e o erro aparece como `Expected ;` em outra linha.
> Barra invertida some do mesmo jeito: `\s` vira `s` e a regex passa a casar com
> a letra. Está documentado no topo do bloco.


*Atualizado em 2026-08-08. Suíte 1.443 testes, 1.441 verdes.*

> ## Rodada 2026-08-07/08 — o motor passou a ser medido, e as regras a mandar
>
> **29 commits**, de `f0bf5fa` a `1f2051f`. Push segue NÃO autorizado.
>
> ### O que mudou de fundamental
>
> - **O orçamento de captura sai do custo MEDIDO.** O percurso custa 295 s de
>   mediana e recebia 61; a soma das fases passa de 560 s e o configurado era
>   180. **43 das 58 capturas saíam parciais** — aritmética, não sites ruins.
>   Hoje o total vem do histórico × o tamanho do site, e o teto de fase lê
>   `tel.totalAtual()` (ler a constante foi o que fez a primeira versão não
>   servir para nada). Medido: um site foi de 9 para 24 segmentos.
> - **O grid sai da geometria MEDIDA** no `structuralMap` (`pageBox` + cadeia de
>   `parent`), nunca de suposição. Peça que era sangria na origem não recebe
>   moldura — foi esse discernimento que faltou à tentativa que virou "PDF".
> - **Duas REGRAS DE ACEITE** (`docs/regras-de-aceite.md`), executáveis em
>   `packages/shared/src/regras-de-aceite.ts`, valendo na curadoria, no botão de
>   curtir e na montagem. Veredito de três valores: `reprovou` é defeito e se
>   conserta no motor; `pendente` é limite real e sobe declarado.
> - **Acervo reextraído**: 57 sites, 1011 → 1389 segmentos, parciais de 74% para
>   30%. Biblioteca curada com 290 peças de 55 origens; 10 kits, um por nicho.
>
> ### Comandos novos
>
> `pnpm acervo:lote` (importa um catálogo inteiro) · `pnpm curar` (escolhe as
> peças boas por evidência) · `pnpm kits` (monta a leva de dez) ·
> `pnpm projeto:de-kit` (projeto a partir de um kit escolhido) ·
> `pnpm site:gerar` (monta pelo caminho determinístico, sem LLM).
>
> ### Os quatro defeitos do dono — FECHADOS em 2026-08-08, não commitados
>
> Todos vistos no primeiro site gerado (clínica odontológica, kit "Clínica e
> consultório", `prj_01KZFRJGVXNE2XREDF70CWHDRT`), e **dois deles eram o mesmo
> defeito**.
>
> **1. Nome da origem no texto** — "CANVAS" gigante no rodapé e "© 2024 CANVAS
> SYSTEMS". A troca existia e não fazia nada, por três motivos somados:
>
> - o nome saía do HOST, e **246 das 288 peças** do acervo vieram do catálogo
>   `ds.asimov.academy`, que guarda cada site numa pasta com o nome do domínio
>   original — a marca está no CAMINHO, não no host. Sem isto a troca não achava
>   nome em 85% do acervo;
> - a troca morava DENTRO do bloco `if (existsSync(assetsDir))`, e rodapé e nav
>   costumam não ter `assets/` — justamente as peças que a motivaram;
> - `alt`, `title` e `placeholder` não eram tocados, e são texto que se lê.
>
> A regra **S2 passou a conferir TEXTO** (o documento já prometia isso): nome que
> sobra **reprova** — não abre buraco ao sair, então é defeito, não pendência. A
> mídia continua sendo pendência, pelo motivo de sempre.
>
> **2 e 3 — linhas neon estáticas e lado direito do hero vazio: UMA chave a
> mais.** A folha de uma origem tinha uma `}` órfã no meio de 99 KB. O navegador
> ignora; o `postcss.parse` estrito lança, e **toda** etapa do compositor
> desistia daquela origem — escopo, recoloração, retipografia, reescala. Sem
> escopo, os utilitários dela passaram a valer para o DOCUMENTO TODO: o
> `.grid-cols-1` dela venceu o `lg:grid-cols-12` de outra (hero de três colunas
> virou três blocos empilhados, lado direito vazio) e um `.hidden` alheio apagou
> a linha vertical. Agora `packages/composer/src/analisar-css.ts` equilibra as
> chaves como o navegador faz, num lugar só, usado pelos 9 pontos que
> analisavam CSS. O reparo é DITO nos avisos. Medido no site: hero em 3 colunas,
> beam vertical de volta e animando, e a origem voltou a receber a cor da marca.
>
> **4. O painel de ressalvas** não sobrepunha: comia a altura da coluna flex e
> espremia a prévia contra o `min-h`. Agora vem recolhido com a contagem, e
> aberto rola dentro do próprio teto (`Bancada.tsx`).
>
> ### Mais dois, que só o console do navegador mostrou
>
> Gerei o site da clínica pela fila e abri o console. Nenhum dos dois aparecia na
> tela, e os dois valiam para todo site gerado:
>
> - **O site disparava o Google Analytics e o Google Ads da EMPRESA DE ORIGEM.**
>   `G-2M6V79H761` e `AW-17731977471` vinham dentro dos `.js` capturados e
>   carregavam de verdade: cada visitante do cliente virava `page_view` e
>   `scroll` na conta de outra empresa. Agora a montagem classifica cada script
>   (`rastreamentoDeTerceiro`): o que é só rastreamento sai do HTML **e do
>   disco**; o que mistura rastreio com comportamento fica e a **regra S2
>   reprova**, porque aí é decisão humana. Medido no site: 4 scripts removidos,
>   zero requisição para host de analytics.
> - **131 arquivos de fonte declarados no CSS não existiam** — a captura trouxe
>   a folha do Google Fonts e baixou 2 dos 8 arquivos de cada família. O
>   navegador pedia cada um e recebia 404, sem nada quebrar na tela. Agora o
>   `src` que não está em disco sai da folha, e a família sem nenhum arquivo sai
>   inteira. Medido: **zero recursos quebrados**, e as fontes continuam certas
>   (vêm do link do Google Fonts, que já era dependência declarada).
>
> ### ⚠ O defeito NOVO que ficou aberto: o recorte perde o ancestral
>
> No celular (390px), a seção de tratamentos sai cortada — 72px fora da tela. A
> causa não é responsivo faltando: a origem TEM
> `@media (max-width:980px){#platform .split-section{grid-template-columns:1fr}}`.
> O que acontece é que **a peça foi recortada de dentro do `#platform`**, e toda
> regra que a origem qualificou por aquele ancestral parou de casar — inclusive a
> do celular. Sobra uma regra sem qualificador (`.split-section{5fr 6fr}`), que
> não tem versão mobile.
>
> É uma CLASSE de defeito, não um caso: quem escreve CSS costuma qualificar
> justamente os overrides de breakpoint. Sintoma típico: funciona no desktop,
> quebra no celular. O conserto provável é, dentro da folha JÁ ESCOPADA por
> origem, deixar cair o qualificador de ancestral que não existe no recorte — o
> `:where([data-ds-corpo])` já impede o vazamento para as outras origens.
>
> Suíte: **1.453 verdes, 1 vermelho** — o vermelho é o de sempre, declarado
> abaixo. Lint e typecheck limpos.
>
> ### Os cinco sites
>
> Os cinco projetos existem, com marca e mídia, e os jobs estão na fila:
>
> | Site | Projeto | Kit |
> |---|---|---|
> | Sorriso Vivo (clínica, CTA de orçamento) | `prj_01KZFRJGVXNE2XREDF70CWHDRT` | Clínica e consultório |
> | Sócio Torcedor SJDR (vende o APP) | `prj_01KZGQBQHW59W5Y71MPGP2NVPF` | Software e assinatura |
> | Meridiano (relógios) | `prj_01KZGQCE3WGKYKR5DKJM0K256B` | Loja de produto físico |
> | Voltz (eletrônicos) | `prj_01KZGQCVXR9SVRT7HKX5PXBG3M` | Imóvel e arquitetura |
> | AVDSGN (portfólio) | `prj_01KZGQDJ4BT1AQ7JNYAE65E5WW` | Portfólio e estúdio |
>
> **A clínica está gerada e validada** (1440 e 390). Os outros quatro esperam o
> conserto do ancestral, para não assar o mesmo corte de celular em todos.
>
> A paleta do SJDR já é a do app (marinho `#0b1530`, azul `#1f7bff`, verde
> `#22c55e`), gravada no branding do projeto. O `projeto:de-kit` ganhou as
> permissões ligadas (`criarSecoesFaltantes`, `criarArteDeApoio`), como na via
> expressa: sem elas, "Prova social" e "Contato" saíam VAZIAS, contrariando o
> comentário do próprio script.
>
> Fica registrado, sem conserto: a marca automática escolhe o CTA por sorteio de
> nicho e errou nos quatro (`Marcar horário` para relojoaria, `Agendar aula` para
> eletrônicos). Corrigi no branding de cada projeto, não no gerador.
>
> ### Depois disso
>
> Gerar 5 sites, cada um com um kit diferente: clínica odontológica (CTA de
> orçamento), **São João del-Rei — página que VENDE O APP de sócio torcedor**
> (paleta do PDF do app: marinho `#0b1530`, azul `#1f7bff`, verde `#22c55e`),
> relógios masculinos (mais de um relógio), eletrônicos (TV, iPhone) e o
> portfólio do dono a partir de https://avdsgn.com.br/.
>
> Fica aberto, declarado: a segmentação de um site do acervo ainda produz
> segmento aninhado (7,1% de bytes duplicados, um teste vermelho). A regra G7
> impede que ele chegue a um kit, mas a raiz — o escolhedor de seções pegando um
> container que engloba irmãos — continua lá.

---

## 1. Onde o produto está

O fluxo inteiro funciona ponta a ponta:

```
Extrair → Galeria (triagem) → Biblioteca (acervo) → Kits (design system final)
→ Gerar site (marca + conteúdo do usuário) → Meus sites
```

O acervo tem **2 origens capturadas** (`ds.asimov.academy` e `futureui`), 13
peças na Biblioteca, 3 kits e 5 projetos. O app roda local (`pnpm dev`) e sai
para os sócios por túnel Cloudflare, atrás de duas credenciais: uma para entrar,
outra para as ações que gastam (Extrair e Gerar site).

---

## 1.1 Onde mora o roteiro (leia antes de procurar)

O `DIAGNOSTICO.md` **não está no git, e isso é a decisão, não descuido.** Ele é a
única fonte que descreve as fatias pendentes, mas são 123 KB de diagnóstico de
produto, estratégia e conversa sobre sócios — e este repositório é **público**.

Ele mora em duas cópias: uma na raiz do projeto, para trabalhar, e outra em
`..\_privado\`, que é o que o protege de sumir. As duas linhas no `.gitignore`
impedem que um `git add .` distraído o publique. O mesmo vale para `_auditoria/`.

Se você clonou este repositório e não achou o `DIAGNOSTICO.md`, é isso: peça a
cópia a quem tem, não procure no histórico.

## 1.2 A suíte: três portas, dois apps independentes

Este repositório deixou de ser um app só. O `INICIAR.bat` agora abre um
**portal** — a credencial de sempre e três cartões:

| Porta | O que é | Onde vive | Porta TCP |
|---|---|---|---|
| Orbis · Criação de Design System | o app deste repositório, intocado | `apps/web` + `apps/server` | 5173 + 8787 |
| Orbis · Criação de Lojas Shopify | estúdio de temas Shopify (era "Tempera") | `orbis-lojas-shopify/` | 3000 |
| Orbis · Criativos | ainda não existe; o cartão abre um modal | — | — |
| *o portal* | as três portas e o portão | `apps/portal` | 4000 |

**Os dois apps são independentes de verdade.** O de lojas usa npm, vinext
(Next-on-Vite), Cloudflare Workers com D1 e R2 — nada disso combina com o pnpm +
Turborepo daqui. Por isso ele fica **fora** dos globs do workspace (`apps/*`,
`packages/*`) e **fora** do Biome (`files.ignore` no `biome.json`): sem essa
exclusão o `pnpm lint`, que bloqueia o CI, tentaria formatar um projeto que usa
ESLint e outro estilo. Ele tem o próprio lockfile, os próprios testes
(`node --test tests/*.test.mjs`) e o próprio `iniciar.bat` para subir sozinho.

**A senha é uma só, e continua morando no servidor.** O portal desenha o campo e
pergunta ao `/api/orbis/entrar` pelo proxy do Vite; a credencial nunca chega ao
navegador. Como cookie ignora porta, entrar no portal já vale para o app de
design system — a pessoa digita uma vez. O caminho de volta é que cobra pedágio:
o `PortaoOrbis` encerra a sessão quando a aba sai de vista, então voltar do
design system para o portal pede a credencial de novo. Isso foi **mantido de
propósito**; afrouxar protegeria menos o link público do túnel.

**O app de lojas não tem portão nenhum.** Localmente tudo bem. Se um dia a suíte
for publicada pelo túnel, a porta 3000 estaria aberta — está registrado aqui
para não ser descoberto no pior momento.

## 2. O que a sessão de 2026-08-03 entregou

Faxina e quatro frentes fechadas. A faxina tirou 28 símbolos sem consumidor
(quase todos resíduo da migração 0006, que apagou `project_components` e deixou
os schemas para trás), três módulos órfãos da web e 13 MB de artefato
regenerável, e corrigiu três documentos que descreviam um sistema que não existe
mais — o `ARCHITECTURE.md` ainda chamava o `@ds/generator` de "agente LLM que
compõe site".

As frentes fechadas: **4.1, 4.4 e o terceiro eixo** (a marca rege tamanho,
respiro e raio dentro das peças, com o corpo como âncora), **4.3** (o teste do
motor media o diretório de trabalho, não o motor), **fatia 5** (a etapa Marca
parou de dizer "herdado do kit" para o que não se herda — e nada é herdado do
kit hoje, `buildBrandingCss` recebe só o branding), **fatia 6** (o alcance da
marca aparece com o motivo, e o aviso passou a existir no editor de kit, que é
onde a mistura é decidida), **fatia 7** (os quatro chamadores da resolução por
identidade migraram; o índice deixou de ser código morto), **fatia 8** (esqueleto
tipado, drag, contrato de mídia no inspetor e a etapa Mídia fora do wizard),
**fatia 9** (a recusa, limitada ao descasamento de tipo), **fatia 10** (a nav
superior), **fatia 11** (o acervo governa o ritmo, não só a curva), **fatia 12**
(a fórmula virou página com URL e os estados aparecem lado a lado) e **fatia 13**
(a âncora de rolagem viaja pela pilha).

## 2.1 O que a sessão anterior entregou

Doze commits, de `66706c8` a `1cfa5ea`. Em ordem de importância, não de data.

### O kit deixou de ser uma lista e virou um sistema

O plano da arquitetura (as 6 fatias) foi executado inteiro. Ele existia para
realizar a ideia central: **pegar uma peça de um site, outra de outro, e montar
um site com o design system dos dois — com precisão sobre o que vem de onde.**

| Fatia | O que mudou |
|---|---|
| 1 | Cada peça diz de onde veio, e o **Confronto** põe as origens de uma categoria lado a lado, por conjunto e não peça a peça |
| 2 | Apagar ou editar uma peça reconsolida os kits que a usavam — antes o kit seguia descrevendo cores de uma peça apagada |
| 3 | Duas origens que declaram `@font-face` com o mesmo nome pararam de colidir |
| 4 | **Governança**: cada família tem regra de mistura (fundamentos = 1 origem, peças = 1 origem por categoria, dobras e efeitos = livres), com recusa em `PATCH` e motivo |
| 5 | A fonte da marca passa a valer DENTRO das peças, por token no ponto de uso — não por regra que disputa a cascata |
| 6 | O motor mede **linguagem visual**: as rampas de tamanho, respiro e raio de cada site |

### A bancada com prévia

No editor de kit, a coluna direita alterna entre **Biblioteca** e **Como vai
ficar**. A prévia monta pelo `montarPaginaDoKit`, o mesmo caminho da geração
final, e acompanha a seleção antes de salvar. É onde duas origens brigando
aparecem em um segundo, em vez de depois de gerar o site inteiro.

### Dois defeitos sérios encontrados no caminho

**Toda prévia do app estava sem CSS.** Desde que o portão de credencial entrou.
A CSP declarava `sandbox`, o que dá origem opaca ao documento; de origem opaca,
pedir o próprio `assets/styles.css` é um pedido cross-site, o cookie
`SameSite=Lax` não viaja, o servidor respondia 401 e o Chrome bloqueava
(`ERR_BLOCKED_BY_ORB`). Na tela: caixa branca com texto preto miúdo em cada peça
da Galeria, da Biblioteca e do kit. Corrigido; `preview.csp.test.ts` trava a
regra.

**O CI estava vermelho desde a fatia 1.** `library/` no `.gitignore`, sem barra
na frente, casa em qualquer profundidade e engolia
`apps/web/src/routes/library/`. O `Confronto.tsx` nunca entrou no repositório e
a compilação quebrava só no runner. Os cinco padrões de dado de runtime foram
ancorados na raiz (`/vault/`, `/library/`…), o que mata a classe inteira.

### Faxina

Saiu a segunda implementação da composição (`lerPecaDoBundle` /
`comporPecasDoKit`, sem chamada de produção), a tabela morta
`project_components` (migração 0006, zero linhas conferidas com backup antes), e
a lista de categorias de peça passou a ser derivada da taxonomia com teste
amarrando as duas.

---

## 3. O que está em andamento

**Nada.** A árvore está limpa, o CI verde, e não há trabalho começado pela
metade. O que segue abaixo é escolha do dono, não pendência de execução.

Uma coisa mudou de natureza e vale dizer: até esta sessão, "o que falta" saía do
que os documentos diziam. Agora sai de uma auditoria que leu fatia por fatia
contra o código. Se o que está escrito aqui divergir do que você encontrar,
acredite no código e corrija este arquivo — foi assim que se descobriu que a
fatia 13 estava liberada havia semanas e ninguém sabia.

---

## 4. O que falta, em ordem de retorno

### 4.1 e 4.4 — FEITAS em 2026-08-03

A marca rege TAMANHO e RESPIRO, não só a família da fonte. O decidido: a escala
é **da marca por padrão** (`ProjectBranding.escalaDoSite`), porque a família da
fonte já se comportava assim e tamanho seguir outra regra seria surpresa sem
motivo. `de-cada-origem` desliga.

A âncora é o **corpo**: o degrau onde está a maior parte do texto de uma origem
cai no degrau de corpo da referência, e a hierarquia em volta vem por
deslocamento. Réguas de comprimentos diferentes alinhadas por posição relativa
deslocariam justamente o texto de leitura.

Ligar o padrão não mexe em projeto que já existe: sem régua medida, a reescrita
não acontece e o literal continua valendo. O que a régua não alcança (`em`, `%`,
`calc`, `clamp`) sai declarado em `reescala.mantidas`, não escondido.

Fica em aberto um terceiro eixo: `EscalaDaOrigem.raios` é medido e ninguém
consome. A decisão de desenho não foi tomada — raio escala junto com o tamanho,
ou é constante da marca?

### 4.2 A captura é PARCIAL nas duas origens

As duas terminam em `parcial-orcamento`: a fase de percurso (que rola a página e
varre o ponteiro em cada parada) não cabe nos 180 s padrão. O que sai é bom —
segmentos com bundle, CSS completo, ícones desenhados; o que falta são
comportamentos das dobras de baixo, e a Galeria declara isso.

Para uma captura inteira:

```powershell
$env:DS_EXPLORER_ORCAMENTO_TOTAL_MS = "900000"; pnpm extrair <job_id>
```

Não vale subir por padrão: a maioria dos sites termina bem dentro dos 180 s e o
custo cairia sobre todos.

### 4.3 — FEITA em 2026-08-03

Não era defeito do motor. `engine.browser.test.ts` era o único dos 11 arquivos
de navegador que montava a raiz das fixtures com `process.cwd()`, e o pacote
declara um `test:navegador` próprio que roda com o cwd dentro dele, onde não
existe `fixtures/`. O servidor de fixture subia calado e respondia 404 para
tudo: a captura rodava contra página vazia, o manifesto saía **válido e vazio**,
e só as asserções de conteúdo quebravam.

Agora o caminho sai de `import.meta.url` e `iniciarServidorFixture` lança quando
a raiz não existe. **37 de 37 passam.** O job de navegador do CI está em
condição de deixar de ser `continue-on-error` — essa mudança no `ci.yml` não foi
feita e é a próxima da frente.

### 4.4 — FEITA junto com a 4.1

Ver acima. Mesma mecânica, régua própria (`EscalaDaOrigem.espacos`) e sem
âncora: respiro não tem "corpo", e nomear um degrau de espaço como o principal
exigiria saber a intenção de quem desenhou.

### 4.5 As fatias do diagnóstico — auditadas contra o código em 2026-08-03

Antes desta sessão, o que se sabia era o que os documentos diziam. Uma auditoria
leu cada fatia contra o código, e o resultado mudou o quadro: **quase nada estava
intocado, quase tudo estava pela metade.** As fatias 1 a 4, 5, 6 e 9 a 13 foram
fechadas ou tiveram a parte que faltava entregue nesta sessão.

O que ficou, e por quê:

- **Fatia 7, a coluna `segments.hash`**: continua sem existir, e continua sendo a
  decisão certa. Os quatro chamadores foram migrados para a chave composta, então
  o índice hash→pasta deixou de ser código morto e o app resolve bundle por
  identidade de verdade. A coluna só vale quando houver algo que ela destrave, e
  a razão original (mexer no banco logo depois de uma perda de acervo) segue de pé.
- **Fatia 12, a galeria de movimento e a vitrine de ícones**: a página existe, com
  rota e URL, e as peças mostram os estados lado a lado. As duas vitrines que
  faltam são apresentação, não mecanismo.
- **Fatia 13, a troca de mídia dentro de cápsula de runtime**: não foi feita de
  propósito. O diagnóstico registra que está "desenhada, não validada", e nenhuma
  cápsula do acervo foi testada com mídia trocada. Em vez de prometer, a geração
  avisa quais peças têm mídia presa à rolagem e diz que o movimento é o do
  original. Para validar, é preciso trocar a mídia de uma cápsula real e conferir
  se o efeito sobrevive.

**Duas premissas do handoff anterior caducaram, e vale registrar para ninguém
replanejar em cima delas.** A fatia 13 era declarada travada porque "o veredito
de cápsula é descartado antes da UI" e "8 de 9 reprovam". O descarte foi
corrigido (o rebaixamento acontece em `design-systems.ts` via
`suporteAposVereditos`), e no acervo de hoje **zero cápsulas reprovam** — o que
falha são cinco registros do canal de scroll.

### 4.6 Depois que os sócios validarem

`docs/MIGRACAO.md` tem o plano de tirar o MVP do computador do Arthur. Supabase
(o sócio tem plano pago) resolve 3 das 4 restrições; a captura por navegador é a
que não resolve, e o documento diz por quê.

---

## 5. Armadilhas conhecidas

Coisas que já custaram tempo e vão custar de novo se ninguém avisar.

1. **`.gitignore` sem barra na frente casa em qualquer profundidade.** Foi assim
   que uma pasta de código sumiu do repositório por dias. Os padrões de runtime
   agora são ancorados; mantenha assim.
2. **O biome respeita o `.gitignore`.** Arquivo ignorado não é linteado, então
   um arquivo fora do git passa pelo `pnpm lint` local e reprova no CI. Um clone
   limpo é o único teste honesto: `git clone . /tmp/x && cd /tmp/x && pnpm i && pnpm verificar`.
3. **Prévia precisa de MESMA origem.** Enquanto o portão exigir credencial, um
   documento de prévia em origem opaca chega sem CSS. Ver `CSP_PREVIA` em
   `routes/preview.ts` — o porquê está escrito lá por extenso.
4. **`PROCESSAR.bat` aberto duas vezes** põe sessões paralelas no mesmo job.
5. **Copie `ecosystem.db` + `-wal` + `-shm`** antes de qualquer migração. O
   acervo já sumiu uma vez, e a causa nunca foi identificada.
6. **O túnel serve o build antigo até reiniciar.** Depois de qualquer correção
   que os sócios precisem ver, derrube e levante de novo.

---

## 6. Como validar

```powershell
pnpm verificar          # lint + typecheck + suíte rápida + portão de fidelidade
pnpm test:navegador     # os 11 arquivos com Chromium (~4 min) — ver 4.3
```

O portão de fidelidade **não** roda no CI de propósito: ele mede o acervo, que
mora em `~/design-system-ecosystem` e não existe num runner limpo.

---

## 7. Estado do acervo

- **160 MB** em `~/design-system-ecosystem`, fila vazia.
- As duas origens foram **recapturadas** com o motor que mede escala. As cópias
  de segurança seguem em `vault/<ds>/capture-v2.anterior`. Confira a Galeria e,
  quando estiver satisfeito: `pnpm reextrair --descartar-anterior`.
- Existe um kit chamado **"kit misto de teste"**, criado para exercitar a mistura
  de origens. Se não for usar, apague pela tela.
