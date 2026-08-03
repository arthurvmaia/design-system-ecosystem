# HANDOFF — onde o trabalho está

*Atualizado em 2026-08-03. CI verde, 1.290 testes rápidos e 79 de navegador
passando, portão de fidelidade aprovado.*

Este arquivo é para quem senta amanhã: o que está pronto, o que ficou pelo
caminho e **por que** cada coisa que falta foi deixada para depois. O registro
histórico da reforma de julho continua em `docs/HANDOFF.md`.

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
