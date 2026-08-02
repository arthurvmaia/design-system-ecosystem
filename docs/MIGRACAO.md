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
