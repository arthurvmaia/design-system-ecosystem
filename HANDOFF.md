# HANDOFF — onde o trabalho está

> ## 🔄 RETOMADA — trabalho em voo (2026-08-14)
>
> **OS 20 KITS PASSARAM.** Prova22 (`kits-provar-GxInuO`): S4, S12, S13, S14,
> S15, S16, S17, S18, S19 — todas ZERO, 20 de 20 aprovados. A ordem que
> segurava a fila ("site nenhum antes dos kits 100%") está cumprida.
>
> **O que fechou o S4 (216 → 30 → 0), tudo medido:**
> 1. *Alfa por variável do Tailwind.* `literalDe` rejeitava qualquer valor com
>    `var(`, e o Tailwind escreve TODA cor como
>    `rgb(5 5 5 / var(--tw-bg-opacity, 1))`. Quase toda cor literal do site era
>    invisível: no pior projeto, 2 correções viraram 61.
> 2. *Tinta declarada por TAG.* O compositor escreve no `marca.css`
>    `a{color:var(--marca-link)}` e `h1..h6{color:var(--marca-heading)}` — e
>    esse arquivo nem chegava à conferência.
> 3. *Tinta padrão da seção.* `REGRA_DA_TINTA_DA_MARCA` põe `--marca-body` no
>    proxy; a conferência passou a modelar isso.
> 4. *Chave por ORIGEM.* `.bg-white` existe em quase toda origem: numa virou
>    `--marca-surface` (escuro), noutra ficou branca. O mapa por nome de classe
>    respondia com a errada.
> 5. *Variável da origem.* `color:var(--c-bg)` com `--c-bg` recolorido na
>    DEFINIÇÃO — resolvida quando há uma definição só.
>
> **E o S13 (83 → 0):** a régua nunca chegava ao fim da página, porque o
> `scroll-behavior:smooth` da origem fazia cada `scrollTo` virar animação que o
> passo seguinte reiniciava.
>
> **AGORA: a fila de 11 jobs `generate`** — SJDR primeiro COM NAVEGADOR
> VISÍVEL, depois AVDSGN (portfólio real), depois Meridiano/Voltz/expressos
> (Café da Estação, asteric, Navalha, Ourivés — processar UM de cada
> duplicata). Geração completa: copy no tom da marca, Magnific, vídeo onde
> couber, contraste medido + animações presentes, 390px bloqueante.
>
> **Em aberto, pedido pelo dono nesta sessão:** entregável deixa de ser zip
> cru e passa a ser PROJETO pronto para deploy (README de publicação,
> package.json, configs), mantendo o botão de visualizar. Depois: varredura de
> UI/UX e os passos 3–6 do MVP Criativos.

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
7. **O Chromium do Playwright é por REVISÃO, e outro projeto pode trocá-la.**
   Em 2026-08-14 as duas extrações da fila morreram antes de abrir navegador: o
   Playwright do monorepo (1.61.1) procura o Chromium **1228** e a máquina só
   tinha o **1234**, instalado por uma versão mais nova de outro projeto do
   disco. A mensagem fala em "Playwright recém-instalado" e engana — não era.
   Conserto: `pnpm exec playwright install chromium` (~300 MB). Vai repetir toda
   vez que o outro projeto reinstalar browsers.
8. **Captura parcial pode ser reserva pessimista, não site pesado.** Também em
   2026-08-14: o segundo site saiu PARCIAL na fase `v2-retratos` usando 212 s de
   um orçamento de 316 s — **104 s terminaram sem dono**. A causa é o histórico:
   a captura anterior gravou um `v2-estados` de 44 s, a reserva medida (com
   folga de 50%) guardou esse custo para as fases seguintes e sobrou 43,9 s para
   `retratos`; no fim, o `estados` daquele site custou 11 s. Reserva é calculada
   uma vez e não é devolvida quando a fase seguinte sai barata. Antes de culpar
   o site, compare o total USADO com o total CONCEDIDO.

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

- **2026-08-14:** entraram dois design systems da fila —
  `ds_01M00E771YZXCH1EXB2WVSVYTH` (open-design.ai, 34 peças, captura completa em
  261 s) e `ds_01M00EG4DHQ0TQMSKW3KT25AFP` (aris-photograph, 24 peças, parcial —
  ver armadilha 8). Deles saiu o primeiro kit real do acervo,
  **"Estúdio de Fotos — Editorial"** (`kit_01M00FNS6VBJE4M4DS9798S89Q`), 14
  peças, base ARIS, com `nav`/`button`/`card`/`badge` travados numa origem só.
  Dois achados do kit valem para o motor: a **faixa que anda na horizontal**
  perde o ancestral que a recorta e estoura a página para 4.629 px de largura
  (foi tirada do kit; o conserto é no compilador de bundle), e **6 das 14 peças
  são `capsula-runtime` com `editavel: false`** — desenham a foto em WebGL, e a
  foto do cliente não entra nelas por troca de HTML.
- Os 8 design systems antigos do vault **não têm linha no banco**: o
  `ecosystem.db` só conhece os dois novos. São pastas órfãs — `pnpm
  acervo:limpar-orfas` lista, e com `--apagar` remove.
- **160 MB** em `~/design-system-ecosystem`, fila vazia.
- As duas origens foram **recapturadas** com o motor que mede escala. As cópias
  de segurança seguem em `vault/<ds>/capture-v2.anterior`. Confira a Galeria e,
  quando estiver satisfeito: `pnpm reextrair --descartar-anterior`.
- Existe um kit chamado **"kit misto de teste"**, criado para exercitar a mistura
  de origens. Se não for usar, apague pela tela.
