# Plano de migração — depois que os sócios validarem

*Escrito em 2026-08-02, com o MVP no ar por túnel.*

Este documento existe para o dia em que o MVP for aprovado e a pergunta virar
"como isto sai do computador do Arthur". Ele não é uma proposta de arquitetura
nova: é o mapa do que **hoje** prende o app a uma máquina, e o que cada peça
custa para soltar.

**Anotado desde já:** um dos sócios tem plano **pago do Supabase**, e ele seria
usado caso a migração aconteça. A seção 3 diz exatamente o que o Supabase
resolve e o que ele não resolve — porque ele resolve menos do que parece, e
saber disso antes evita descobrir no meio.

---

## 1. O que o MVP prova, e o que ele não pode provar

O que está no ar prova o **produto**: se a captura vale, se a triagem faz
sentido, se o kit é um conceito útil, se o site gerado presta. Isso é o que
importa validar, e o túnel entrega com fidelidade total, porque é o app de
verdade.

O que ele **não** prova, e ninguém deve concluir dali:

- **Uso simultâneo.** O SQLite aguenta leitura concorrente, mas o app foi
  desenhado para uma pessoa. Dois sócios editando o mesmo kit ao mesmo tempo é
  um caso que nunca foi exercitado.
- **Disponibilidade.** O link vive enquanto a máquina estiver ligada. Não há
  nada a concluir sobre uptime.
- **Custo em escala.** No modo `queue` nada roda sozinho, então o custo medido
  hoje é zero por definição. Ele não diz nada sobre o custo com dez pessoas
  pedindo capturas.

---

## 2. Os quatro limites reais, medidos

Estes são os pontos que prendem o app à máquina. Estão em ordem de dificuldade.

### 2.1 O banco — fácil

SQLite via Drizzle, em `~/design-system-ecosystem/ecosystem.db` (1,4 MB de
dados, 4 MB de WAL). Drizzle já abstrai o dialeto, então trocar por Postgres é
sobretudo trocar o driver e rodar as migrations no destino.

O que exige atenção: as consultas usam `better-sqlite3` de forma **síncrona**.
Postgres é assíncrono. Não é difícil, mas toca todas as rotas.

### 2.2 Os arquivos — médio

201 MB hoje: 39 MB de capturas, 4,3 MB de biblioteca, 126 MB de sites gerados,
em 1.074 arquivos. O código lê e escreve por caminho de disco (`vaultDsDir`,
`projectMediaDir`, e os outros de `packages/shared/src/paths.ts`).

A boa notícia é que **tudo passa por `paths.ts`**. É a fronteira, e ela já
existe: trocar disco por armazenamento de objeto é reescrever aquele módulo e as
poucas rotas que servem arquivo (`vault.ts`, `site.ts`, `asset.ts`,
`app-web.ts`), não caçar `readFileSync` pelo repositório.

### 2.3 A captura — difícil

`pnpm extrair` abre o Chromium de verdade e trabalha por **180 s no padrão, até
900 s numa página pesada**. Medido: uma página levou 420 s e ainda saiu parcial.

Isso não cabe em função serverless de jeito nenhum — nem em Edge Function do
Supabase (limite de segundos), nem em Vercel (60 s no grátis, 300 s no Pro).
Precisa de um **worker de longa duração** com Chromium instalado: uma máquina,
um contêiner, ou um serviço de fila com executor próprio.

### 2.4 O processamento da fila — é uma decisão de produto, não técnica

Hoje o trabalho pesado sou **eu**, o agente, rodando no Claude Code na máquina
do Arthur. O `EXECUTION_MODE=queue` registra o pedido e para.

Existe o outro caminho já escrito no código (`EXECUTION_MODE=api`), em que o
servidor chama a Anthropic direto. Ligar isso é uma linha — e é a decisão que
transforma o custo de zero em custo por uso. **Não é uma etapa de migração: é
uma decisão de modelo de negócio**, e deve ser tomada olhando preço, não
arquitetura.

---

## 3. O Supabase: o que resolve e o que não resolve

### Resolve bem

| Peça | Como |
|---|---|
| **Banco** | Postgres gerenciado. Cobre 2.1 inteiro, com backup e painel. |
| **Arquivos** | Supabase Storage (S3 por baixo). Cobre 2.2, com URL assinada — que é melhor que o que existe hoje, porque hoje quem serve arquivo é o próprio servidor. |
| **Contas** | Supabase Auth substitui o portão do Orbis por login de verdade, com um usuário por sócio, e-mail e senha própria. Some a senha compartilhada, que é o ponto fraco do arranjo atual. |
| **Papéis** | O nível `visita` que existe hoje vira RLS (row level security) no Postgres, imposto no banco e não no meio do caminho. É mais forte do que temos. |

### **Não** resolve

- **A captura (2.3).** Edge Functions do Supabase são curtas por natureza e não
  têm Chromium. A captura continua precisando de uma máquina própria. É o item
  que sobra depois de o Supabase entrar, e é o mais caro.
- **O processamento da fila (2.4).** Continua sendo uma pessoa abrindo o Claude
  Code, ou o modo `api` ligado.

**A leitura honesta:** o Supabase tira três dos quatro problemas do caminho e
deixa o quarto intacto. Vale muito, e não é a migração inteira.

---

## 4. O plano, em fases

Cada fase entrega algo utilizável sozinha. A ordem é deliberada: começa pelo que
tem menos risco e mais valor imediato.

### Fase 0 — Antes de qualquer coisa: fechar o que o MVP revelou

Não migrar em cima de defeito. O que os sócios acharem no teste entra aqui, e
esta fase termina quando a lista deles estiver vazia ou explicitamente adiada.

### Fase 1 — Contas de verdade (Supabase Auth)

Substitui o portão de senha compartilhada. É a fase de maior ganho por esforço:
resolve "quem fez o quê", acaba com a senha que circula por mensagem, e não
exige mexer em banco nem em arquivo.

Ao fim: cada sócio tem login próprio, e o nível `visita` de hoje vira papel.

### Fase 2 — Banco no Postgres

Trocar o driver do Drizzle, portar as migrations, converter as consultas
síncronas. Ao fim: o app roda contra o Supabase e o `ecosystem.db` some.

**Ponto de atenção:** o acervo atual precisa ser importado, não recriado. As
capturas custaram tempo de máquina e triagem humana.

### Fase 3 — Arquivos no Storage

Reescrever `paths.ts` para devolver referências em vez de caminhos, e as quatro
rotas que servem arquivo para redirecionar a URL assinada. Ao fim: o app roda
sem disco local.

Nesta fase o app já pode viver numa máquina descartável — que é o objetivo real
da migração.

### Fase 4 — O worker de captura

O item que o Supabase não cobre. Um contêiner com Node e Chromium, escutando a
fila e rodando `pnpm extrair`. É onde entra a decisão de infraestrutura de
verdade (VPS, Fly, Cloud Run com timeout longo).

**Só faça esta fase se as capturas passarem a ser frequentes.** Enquanto forem
poucas por semana, rodar na máquina do Arthur é mais barato e mais simples que
manter um worker de pé.

### Fase 5 — O modo `api`, se e quando fizer sentido

Ligar `EXECUTION_MODE=api` e o app passa a trabalhar sozinho. Decisão de
negócio: exige saber o custo por captura e por geração, e ter um teto por
usuário. **Não ligue isto sem um limite de gasto configurado.**

---

## 5. O que decidir antes de começar

Estas perguntas mudam o plano, e é melhor respondê-las com o time do que
descobrir no meio:

1. **Quantas pessoas vão usar de verdade?** Até três, a Fase 1 pode ser adiada e
   o portão atual serve. Acima disso, ela é a primeira.
2. **O acervo é compartilhado ou de cada um?** A resposta muda o modelo de dados
   inteiro. Hoje é um acervo só, sem dono.
3. **Capturar vira coisa de todo dia?** Se sim, a Fase 4 sobe de prioridade. Se
   não, ela pode nunca acontecer.
4. **Quem paga o quê?** O modo `api` tem custo por uso, e sem teto configurado
   ele é ilimitado por construção.

---

## 6. O que NÃO migrar

Vale escrever, porque a tentação existe:

- **O motor de captura (`engine-v2`, `explorer`)** não deve ser reescrito para
  caber em algum limite de serverless. Ele é o ativo do produto, e o que faz a
  fidelidade existir. Se não cabe no ambiente, troque o ambiente.
- **O modo `queue`** não deve ser removido quando o `api` entrar. Ele é a rede
  de segurança: quando o custo assustar, é para onde se volta.
- **O Orbis** não deve virar "assistente". A voz em primeira pessoa e a regra de
  nunca prometer o que não entrega são identidade do produto, não enfeite.

---


---

## 7. O plano das TRÊS VERSÕES

*Escrito em 2026-08-08, com o dono, e com números medidos no acervo daquele dia.
Esta seção é a rota decidida; as seções 1 a 6 continuam valendo como o
levantamento técnico que a sustenta.*

**Para quem chega agora e vai avaliar este plano:** o app captura o design de
sites existentes, cura as peças numa biblioteca, monta kits e gera sites novos a
partir deles. Hoje ele roda inteiro na máquina do dono. As três versões abaixo
são a rota para tirá-lo de lá — sem tentar tirar tudo de uma vez.

### 7.1 As três versões

| Versão | Para quem | O que faz | Onde roda |
|---|---|---|---|
| **1 — local** | o dono | tudo: extrair, curar, montar kit, gerar site | a máquina dele, com o agente do Claude Code |
| **2 — mostruário** | o sócio | só OLHAR o que já existe: galeria, biblioteca, kits, sites gerados | estático, publicado |
| **3 — cliente** | quem compra | biblioteca, montar kit, gerar site, e "Meus sites" com o site DELE | servidor de verdade, geração por API |

**A EXTRAÇÃO nunca sai da versão 1.** Ela continua sendo trabalho do dono, na
máquina dele, alimentando a biblioteca que as outras versões consomem. Não é
limitação técnica: é o desenho. A captura é o ativo do produto, e quem decide o
que vale capturar é quem entende o acervo. Isso também é o que permite a versão 3
existir **sem resolver o problema mais caro deste documento** (seção 2.3).

### 7.2 Infraestrutura decidida

**Vercel e Supabase, ambos em planos PAGOS do sócio.** Isso resolve as dúvidas de
custo e de licença que apareceriam num plano gratuito — não há restrição de uso
comercial a contornar.

O que cada um cobre está na seção 3. O resumo: o Supabase resolve banco,
arquivos, contas e papéis (RLS). **Nenhum dos dois resolve a captura**, e o
motivo é o da seção 2.3 e não muda com plano pago: uma captura trabalha de 180 s
a 900 s, e o limite de função da Vercel no plano Pro é de 300 s. A captura
precisa de um processo longo com Chromium — e, pelo desenho acima, ela nem
precisa sair da máquina do dono.

### 7.3 Versão 2 e 3 são UM app com DUAS PORTAS

A ideia do dono, e ela barateia o trabalho: **a tela de entrada pergunta se quem
chega é SÓCIO ou CLIENTE** e manda para a experiência correspondente.

A consequência é que **não são dois apps**. A versão 3, nesta etapa, é o mesmo
conteúdo: o cliente percorre Biblioteca, Kits e Gerar site com os dados reais, e
só não consegue ESCREVER. A do sócio é a mesma coisa com a Galeria a mais. Mesmo
build, mesma publicação, navegação diferente.

**A porta já quase existe**: `apps/portal` é uma tela de entrada com cartões
(hoje Design System, Lojas Shopify, Criativos). Virar duas portas é editar
aquilo, não criar do zero.

**O detalhe de arquitetura que torna o modo estático barato:** o cliente web tem
**um único ponto de `fetch`** (`apps/web/src/lib/api.ts`, por volta da linha
540). Um modo estático é, por isso, mudança contida:

1. um script varre as rotas de LEITURA e grava cada resposta como arquivo
   (`dist/api/**.json`) — são 116 rotas `.get(` no servidor, mas o mostruário
   precisa só das que alimentam as quatro telas;
2. o embrulho de `fetch`, em modo estático, mapeia `/api/x` para `/api/x.json` e
   **recusa qualquer verbo que não seja GET na origem** — esconder o botão não
   basta se a chamada ainda sai;
3. as ações de escrita saem da tela.

**Cuidado obrigatório nesta etapa:** botão inerte que PARECE vivo é pior que
botão ausente. Se o cliente clica em "Gerar site" e nada acontece, ele conclui
que o app quebrou, e a conclusão é razoável. A ação precisa DIZER que ainda não
está disponível — é a regra de nunca prometer o que não se entrega, que vale para
o produto inteiro.

### 7.4 O tamanho, medido

| Parte | Tamanho | Arquivos |
|---|---|---|
| `vault/` (capturas cruas) | **2,2 GB** | — |
| `library/` (peças curadas) | **522 MB** | 7.614 |
| `projects/` (todas as versões de site) | **917 MB** | — |
| **só a ÚLTIMA versão de cada site** | **98 MB** | 13 projetos |

Dentro da biblioteca o peso é `.js` da origem (225 MB) e `.png` (153 MB).

**O acervo inteiro não vai para um host estático, e não precisa ir.** A galeria e
a biblioteca aparecem por **imagem** — os `frames/` que cada bundle já traz são
prints da peça —, e não pela prévia viva, que é o que custa os 522 MB. Os sites
gerados vão inteiros: são o que o sócio mais quer ver, e para mostruário bastam
4 ou 5 escolhidos, uns 30 MB.

Orçamento: app compilado (~2 MB) + JSON das rotas (~10-20 MB) + frames em WebP
(~15 MB) + sites escolhidos (~30 MB) ≈ **70 MB, uns 2.000 arquivos**.

### 7.5 A porta de acesso — isto não é opcional

O acervo é feito de **capturas completas de sites de outras empresas**. Numa
máquina local é uma coisa; num endereço aberto na internet é outra, e a diferença
não depende de o app ser mostruário ou produto.

O app já tem um portão por credencial (`ORBIS_SENHA`). Publicado, ele precisa de
controle de acesso de verdade — na Vercel, proteção por senha do plano; com
Supabase Auth, login por sócio (é a Fase 1 da seção 4, e ela vale a pena antes de
publicar, não depois).

### 7.6 Versão 3 — o que ela OBRIGA a decidir

Registrado agora para não ser reinventado depois. A versão 3 não está sendo
construída nesta etapa.

- **Dono nos dados.** "Meus sites" mostrando só o site daquele cliente exige algo
  que hoje não existe: o acervo é *"um acervo só, sem dono"* (seção 5, pergunta
  2). A versão 3 é quem obriga a responder, e a resposta é RLS no Postgres
  (seção 3).
- **A geração deixa a fila e vira chamada de API.** O dono avaliou que por fila
  não daria, e está certo pelo motivo da seção 2.4: a fila depende de uma pessoa
  abrir o Claude Code. Com cliente do outro lado, o pedido não pode esperar
  alguém sentar. O `EXECUTION_MODE=api` já existe no código.
- **É a versão que LIGA O CUSTO.** Enquanto for fila, o custo é zero por
  construção. No modo `api` cada geração custa, e **sem teto configurado o custo é
  ilimitado por construção**. Um teto por projeto e um teto por mês entram JUNTO
  com a chave, nunca depois.
- **A extração continua fora.** O cliente não captura; escolhe do que já foi
  capturado.

### 7.7 A ordem, e o que cada versão exige

1. **Versão 2 primeiro.** Não exige banco, nem conta, nem servidor: é build mais
   arquivos. E nada do que ela pede é jogado fora — o instantâneo estático segue
   servindo de demonstração depois de a versão 3 existir.
2. **Versão 3 exige, nesta ordem**: contas (Fase 1), Postgres com dono nos dados
   (Fase 2 + RLS), arquivos no Storage (Fase 3), e o modo `api` com teto de gasto.
   A captura (Fase 4) **continua fora do escopo**.

### 7.8 O que pedir a quem for avaliar este plano

Três perguntas onde uma segunda opinião vale mais que uma revisão geral:

1. **O instantâneo estático se sustenta?** Congelar 116 rotas de leitura em
   arquivos JSON é simples, mas envelhece: cada mudança de acervo pede uma
   republicação. É aceitável para mostruário, e deixa de ser quando alguém
   esperar dado fresco. Há um limite prático de quantas vezes se republica 70 MB?
2. **A versão 3 deve mesmo nascer inerte?** A alternativa é ela só aparecer
   quando funcionar. Mostrar o caminho antes de ele existir tem valor comercial e
   tem risco de leitura — e a resposta pode depender de quem vai ver.
3. **O teto de gasto do modo `api`.** É o único item deste documento que pode
   gerar prejuízo silencioso. Vale desenhar o mecanismo (teto por projeto, por
   mês, e o que acontece quando estoura) antes de a chave existir.
