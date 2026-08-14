# RETOMADA — 2026-08-14, fim da sessão

Este arquivo é o ponto de partida da próxima sessão. O `HANDOFF.md` ao lado
descreve o produto; este descreve **onde o trabalho parou e o que fazer a
seguir**.

Estado do repositório: `main` em `84236a4`, em sincronia com o remoto, árvore
limpa. Suíte com **uma** falha, pré-existente e sem relação com nada desta
sessão (`scripts/acervo-regressao.test.ts`: 7,1% de bytes duplicados no design
system `ds_01KZEMQXS1QCQ7SPWJR2NHRDMH`, que mede o acervo local da máquina).

---

## 1. O que ficou pronto nesta sessão

### Os 20 kits do banco de prova PASSAM

Era a ordem que segurava tudo: *"site nenhum antes dos kits 100%"*. Prova 22,
banco `kits-provar-GxInuO`. **S4, S12, S13, S14, S15, S16, S17, S18 e S19 todas
em zero**, 20 de 20 aprovados.

O S4 caiu de 216 → 30 → 0 quando encontrei cinco cegueiras do corretor de pares
de cor (`packages/composer/src/par-de-cores.ts`), todas medidas:

1. **Alfa por variável.** A guarda rejeitava qualquer valor com `var(`, e o
   Tailwind escreve *toda* cor como `rgb(5 5 5 / var(--tw-bg-opacity, 1))`.
2. **Tinta por TAG.** O compositor escreve no `marca.css`
   `a{color:var(--marca-link)}` e `h1..h6{…}` — e esse arquivo nem chegava à
   conferência.
3. **Tinta padrão da seção** (`REGRA_DA_TINTA_DA_MARCA`), não modelada.
4. **Chave por ORIGEM.** `.bg-white` virou escuro numa origem e branco noutra;
   o mapa por nome de classe respondia com a errada.
5. **Variável da origem** (`var(--c-bg)`), recolorida na definição, não no uso.

O S13 (83 → 0) caiu quando descobri que a régua **nunca chegava ao fim da
página**: o `scroll-behavior:smooth` da origem fazia cada `scrollTo` virar
animação que o passo seguinte reiniciava.

### Quatro sites entregues

Cada um com **22 verificações nas duas larguras** e aceite estático sem
pendência:

| Site | Projeto |
|---|---|
| Sócio Torcedor SJDR | `prj_01KZGQBQHW59W5Y71MPGP2NVPF` |
| AVDSGN · Portfólio | `prj_01KZGQDJ4BT1AQ7JNYAE65E5WW` |
| Meridiano · Relojoaria | `prj_01KZGQCE3WGKYKR5DKJM0K256B` |
| Voltz · Eletrônicos | `prj_01KZGQCVXR9SVRT7HKX5PXBG3M` |

### Outras entregas

- **Entregável virou PROJETO**, não zip cru: leia-me de publicação (três
  caminhos), `npm start` sem instalar nada, `netlify.toml`/`vercel.json`/
  `.nojekyll`/`.gitignore` e `ENTREGA.md` com o que foi verificado e o que
  ficou pendente. Os relatórios internos saem do pacote.
- **Frente Criativos ganhou o fim da linha**: rota `/api/criativos` e tela
  "Minhas peças". Download só do que a verificação aprovou; reprovada mostra o
  motivo; o custo gasto aparece.
- **Portal**: escolher "admin" mantinha o recorte de cliente (o perfil fica na
  sessão e só o cliente declarava na URL). Agora as duas escolhas declaram.
- **Prévia do kit** mostra só as peças (o dono cortou tipografia, escala e
  paleta).
- **1 GB liberado**: 54 de 60 versões geradas antigas apagadas. Seis pastas
  vazias resistiram porque o servidor as segurava; somem no restart.

---

## 2. O que está BLOQUEADO esperando sua decisão

### 2.1. Os 7 jobs que restam na fila não têm o que gerar

Café da Estação, asteric, Navalha & Cia e Ourivés (cada um duplicado). Verifiquei
os quatro:

| Job | Pasta do projeto | Mídia em disco | Projeto no banco | Peças vivas |
|---|---|---|---|---|
| Café da Estação | não | não | **não** | 0 de 5 |
| asteric | não | não | — | 0 de 5 |
| Navalha & Cia | não | não | — | 0 de 7 |
| Ourivés | não | não | — | 0 de 5 |

São sobras dos testes da Via Expressa: o job entrou na fila mas o projeto e o
material nunca chegaram ao disco. Procurei os arquivos pelo prefixo em todo o
`design-system-ecosystem`: nenhum.

Gerar assim produziria um site com as fotos e o logotipo **da empresa de
origem** — o que a regra S2 existe para barrar.

**Escolha uma:** eu limpo os sete jobs da fila, ou você roda a Via Expressa de
novo para as marcas que ainda interessam (aí o projeto e o material nascem em
disco e eu gero na hora).

### 2.2. As imagens automáticas não combinam com as marcas

O Voltz é loja de eletrônicos e a galeria mostra **fotos de surfe**, com
legendas de "TV 4K de 65 polegadas" por cima. São as imagens que o assistente
gerou para o projeto: passam em todas as regras (são mídia da marca, não da
origem) e são a primeira coisa que qualquer pessoa vê.

Trocar por Magnific, seguindo o motor `orbis-suite`, custa crédito. **Preciso
que você declare o teto antes** — a regra do app é orçamento declarado e
contado, e eu não gasto sem isso.

---

## 3. A receita da fila de geração (funcionou nos quatro sites)

**O payload dos jobs é ANTERIOR à curadoria.** Em todos, parte das peças do kit
foi aposentada da Biblioteca e a seção sai VAZIA (a regra S9 acusa). Antes de
qualquer coisa:

1. Ler o job e testar `library/<cmp>/bundle` de cada peça: as mortas aparecem.
2. Repor pelo kit ATUAL de mesmo nome — o rótulo do job nomeia o kit, e as
   peças estão em `kitComponents` no SQLite, **não** no payload.
3. Extrair o texto real de cada peça nova (os `>texto<` do `index.html` do
   bundle) e escrever as substituições contra ele. **A âncora é o texto NU**:
   ancorar em `>texto<` falha quando há marcação no meio.
4. **A troca mais específica vai PRIMEIRO.** Substituição é sequencial: uma
   chave curta (`CLIENTES`) come a longa (`FEEDBACK DOS NOSSOS CLIENTES`).
5. Seção sem peça é oportunidade: `criarSecoesFaltantes` está ligado em todos, e
   o dono quer página longa com o AIDA inteiro.

**Armadilhas que me custaram tempo:**

- **Print de página inteira MENTE.** O Playwright redimensiona a viewport para
  capturar tudo e re-dispara os observadores de rolagem: o SJDR apareceu com um
  vazio de 4000px que não existia. Medir dobra por dobra, rolando.
- **Mídia é indexada pela ORIGEM.** Oito entradas apontando para o mesmo arquivo
  viram uma; para preencher N vagas com a mesma arte, copiar o arquivo N vezes.
- **Ids de seção nunca de memória.** Inventei prefixos e a seção nova foi parar
  no lugar errado. Ler do payload sempre.

---

## 4. Consertos de motor que saíram desta sessão

| O quê | Onde |
|---|---|
| `--ver` abre a janela da conferência (padrão segue headless) | `scripts/conferir-site.ts` |
| A régua mede ENDEREÇO, não só pasta | idem |
| O deslocamento congelado sai junto com a opacidade (classe presa em `translateY(40px) scale(.95)` deixava botão de 42px onde o CSS mandava 44) | `packages/generator/src/montagem.ts` |
| A S20 diz "não verifiquei" em vez de sumir da lista | `packages/shared/src/regras-de-aceite.ts` |
| Alvo de toque de 44px no portão do portal e do app | `apps/portal/src/portal.css`, `apps/web/src/styles/globals.css` |

---

## 5. O gate: leia isto antes de confiar em parecer meu

Rodei o skill `gate` sobre as duas últimas mudanças. **As três lentes morreram
por limite de sessão**, e eu emiti um parecer degradado auditando meu próprio
trabalho — que liberou com nota 7.

Às 15h32 o limite voltou, relancei as três em subagente de contexto limpo, e as
três **reprovaram por unanimidade** um bloqueador que eu não tinha visto:
`pnpm conferir <endereço>` quebrava em 100% das execuções, com o crash vindo
depois da lista de vereditos toda verde — e saindo com código 1, o mesmo de
"reprovou", o que estragava o comando como portão.

Corrigido, medido e coberto por teste (`scripts/conferir-site.test.ts`, que não
existia — foi essa ausência que deixou o defeito passar por dois commits e uma
rodada de gate).

**A lição, registrada:** a regra dos quatro olhos não é formalidade. Parecer que
eu emito sobre o meu próprio trabalho vale como conferência, não como auditoria.

Parecer completo das duas rodadas em
`scripts/_auditoria/2026-08-14-gate-regua-no-proprio-app.md`.

**Dívida consciente registrada ali:** o `pendente` da S20 significa "esta página
não é do tipo que a regra mede" e o das outras regras significa "falta material
seu". São coisas diferentes dividindo o mesmo estado. Separar exige um quarto
estado atravessando `VereditoDaRegra`, as telas de pendência e o `kits-provar` —
é refatoração de contrato, não conserto. Risco atual medido: zero, porque nenhum
consumidor de produção lê `aprovado`/`comPendencia` do `aceite-navegador.json`.

---

## 6. Fila de trabalho, na ordem

1. **Decidir sobre os 7 jobs órfãos** (seção 2.1) — bloqueia a fila.
2. **Decidir sobre as imagens** (seção 2.2) — bloqueia a qualidade dos sites.
3. **Varredura de UI/UX do app** — autorizada pelo dono, começada: a régua já
   mede endereço e já achou dois defeitos nossos. O caminho é apontá-la para as
   telas internas (precisa da credencial do portão) e para o portal.
4. **MVP Criativos, o que falta**: o handler do job `criativo` é agente, não
   código (está descrito em `CLAUDE.md`, seção `### criativo`). Falta exercitar
   o fluxo inteiro uma vez, do pedido ao download.

---

## 7. Comandos que você vai querer

```powershell
pnpm kits:provar --manter        # o banco de prova dos 20 kits
pnpm conferir <pasta|endereço>   # a régua; --ver abre a janela
pnpm pagina <entrada-geracao>    # monta um site do kit
pnpm fila                        # o que está pendente
pnpm --filter @ds/web build      # OBRIGATÓRIO depois de mexer em apps/web
```

O desktop serve o **build** de `apps/web/dist`, não o dev server: mudou
`apps/web`, rode o build antes de dizer que a tela está nova.

Para levantar o que a auditoria precisa:
`pnpm --filter @ds/server dev` (8787) e `pnpm --filter @ds/portal dev` (4000).
