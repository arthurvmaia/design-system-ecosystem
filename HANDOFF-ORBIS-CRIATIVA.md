# ORBIS CRIATIVA — retomada, 2026-08-17

Este arquivo é o ponto de partida de quem continuar a frente **Orbis Criativa**.
O `HANDOFF.md` descreve o produto; o `HANDOFF-RETOMADA.md` descreve onde a frente
de Design Systems parou. Este descreve **o que foi construído aqui, o que já foi
revisado e o que falta**.

Estado do repositório: `main` em `275931b`, **nada commitado**. 30 arquivos
modificados e 20 novos. Suíte com **uma** falha, pré-existente e sem relação com
este trabalho (`scripts/acervo-regressao.test.ts`, 7,1% de bytes duplicados no
acervo local da máquina — a mesma que o `HANDOFF-RETOMADA.md` já registrava).

O plano completo, com a matriz de lacunas e as fases, está em
`~/.claude/plans/c-users-arthur-maia-desktop-orbis-criati-ancient-pizza.md`.

---

## 1. As nove decisões do dono

Elas não estão no código, e sem elas metade das escolhas abaixo parece
arbitrária.

1. **O executor é o agente, pela assinatura da Claude.** Nada de chamada paga à
   API da Anthropic a partir do código. `EXECUTION_MODE=queue` continua sendo o
   caminho. O adapter REST pode ser construído, mas não vira executor autônomo.
2. **Autenticação fica como está**, com senha única. Sem tenant, sem contas. A
   limitação é declarada por escrito, não escondida.
3. **Primeiro lançamento = Marca + Imagem.** Design Systems adiado (a frente de
   gerar site está pausada desde 14/08); Shopify depois do `git pull`; vídeo por
   último.
4. **Vídeo: `google-veo3_1-lite`, 720p, 8s.** Substitui o veo3 decidido em 08/08.
5. **Imagem em 2K, não 1K.** Medido: 1k e 2k custam 75; 4k custa 150.
6. **Franquia:** o cliente tem 1 tentativa extra; o admin gera à vontade pelo
   painel. É regra de produto, diferente do teto de crédito.
7. **Fonte editável da apresentação: HTML versionado** (o PDF é ele impresso).
8. **Photoshop fora do caminho do produto.** Medido: o MCP daqui dirige o
   Photoshop ABERTO na máquina. A rota headless (Photoshop API do Firefly
   Services) exige contrato empresarial; o plano pago de consumidor não dá
   acesso de API. Ele serve como bancada local, nunca como passo de pipeline.
9. **O app vai para a Vercel, público.** Isso vira o critério de toda escolha:
   *sobrevive sem sessão do Claude, sem `~/design-system-ecosystem`, sem SQLite
   em arquivo e sem shell?*

---

## 2. O que foi medido no Magnific

Tudo com `simulate_cost` (read-only, não cobra), em 16/08/2026.

### A armadilha de nome é dupla, e é real

| O que o produto chama | Slug no MCP | Caminho no REST |
|---|---|---|
| **Nano Banana 2** (o preset padrão) | `imagen-nano-banana-2-flash` | `text-to-image/nano-banana-pro-flash` |
| Nano Banana **Pro** | `imagen-nano-banana-2` | (não medido) |

O slug `imagen-nano-banana-2` **não** é o Nano Banana 2. Quem mapear pelo rótulo
pega o modelo errado; quem copiar o slug do MCP para o REST não acha o endpoint.
Há teste dourado que reprova as duas coisas.

### Preços

| Operação | Créditos |
|---|---|
| Imagem Nano Banana 2 @ 1k e @ 2k | 75 (o MESMO) |
| Imagem @ 4k | 150 |
| Nano Banana **Pro** @ 1k e 2k | 75 — igual ao Flash |
| `images_remove_background` | 3 |
| `images_to_svg` / `images_generate_svg` | 150 / 375 |
| Vídeo Veo 3.1 Lite 720p **e 1080p**, 8s | 320 (o MESMO) |
| Vídeo, áudio nativo | +200 |

Duas consequências: o Pro é o modelo de maior fidelidade e sai de graça (por isso
o preset `imagem-marca` usa ele; o Flash fica onde as proporções de faixa 8:1/4:1
importam, que o Pro não aceita). E 1080p não custa nada a mais que 720p.

### Os transportes não têm as mesmas capacidades

- **MCP**: 15 proporções (incl. 8:1, 4:1), `simulate_cost` exato,
  `creations_search` para recuperar tarefa órfã. OAuth interativo — a doc oficial
  diz que é incompatível com backend não assistido.
- **REST**: 10 proporções, `webhook_url`, chave de API. **Sem simulação de custo
  e sem listagem de tarefas.**

Saldo em 17/08: **20.635** de 45.000. `isUnlimitedMode: true` com
`unlimitedAppliesHere: false` — **o ilimitado não cobre MCP/API**.

---

## 3. O que está construído

### Comandos novos

```powershell
pnpm criativo:precos                              # catálogo + tabela de preço medida, e o que falta medir
pnpm criativo:compor <job> <n> [--fundo <arq>]    # compõe, mede, roda C1..C10 e grava a folha
pnpm criativo:razao ver|reservar|debitar|liberar  # o razão de crédito de um job
```

### O caminho de uma peça, hoje

```
tela → POST /api/criativos (credencial de ação 428; id = hash da chave de envio,
       arquivo criado com flag 'wx'; retrato em criativos/<job>/pedido.json)
     → [pessoa abre o PROCESSAR.bat]
     → agente: account_balance → criativo:razao reservar → images_generate (MCP)
       → baixa para o disco → criativo:razao debitar → account_balance
     → pnpm criativo:compor <job> <n> --fundo <arquivo baixado>
     → pnpm fila:concluir <job>
     → download só do que a régua aprovou
```

### As peças

- **`packages/creative-engine`** (novo): catálogo de presets por transporte,
  tabela de preço datada, razão de crédito, composição em DOM.
- **`packages/shared/src/regras-de-aceite-criativo.ts`**: as regras **C1..C10**.
  O texto delas está em `docs/regras-de-aceite.md`, junto com as G e as S.
- **`scripts/criativo-*.ts`**: os três comandos acima.
- **`apps/server/src/routes/criativos.ts`**: POST do pedido, upload em rascunho,
  rota de custos, listagem que lê o disco além da fila.

### O princípio que organiza a régua

**O que não se mede não fica verde.** Campo ausente vira `pendente`, nunca
`passou`, e há um teste que passa um objeto vazio e exige zero aprovações. C7
(texto espúrio dentro do pixel) e C8 (marca d'água) são declaradamente
imensuráveis sem OCR: ficam pendentes quando houve geração, e a peça sai
"aprovada com ressalva".

O portão de entrega (`problemasDaEntregaCriativa`) recusa fechar quando: a
variação está `aprovada` sem folha de conferência; a folha tem regra reprovada;
o arquivo mede diferente do formato; o arquivo não pode ser medido; o razão
mostra reserva em voo; ou o `custoGasto` da entrega não bate com o razão.

---

## 4. A primeira geração paga do repositório

Aconteceu em 17/08, com teto de 3 créditos autorizado pelo dono. O handoff
anterior dizia que nunca tinha havido uma.

`images_remove_background`, saldo **20.638 → 20.635**, delta de 3 batendo
exatamente com o razão. O arquivo veio para o disco (a URL do provedor traz
token que expira, então ela não é entrega), 73.519 bytes, PNG real, 736×414
medidos do cabeçalho.

**Esse 736×414 é o dado que justifica a composição:** o pedido era de outra
proporção. O provedor devolve o que ele quer.

---

## 5. A revisão adversarial, e o que ela achou

Rodei cinco revisores independentes + dois céticos sobre todo o código novo.
Confirmei cada achado antes de mexer.

### Consertado e testado

| # | Defeito | O que custava |
|---|---|---|
| 1 | `/output/` fora do `.gitignore` | 6,8 MB com a apresentação de marca de um cliente; um `git add -A` levaria para repositório público |
| 2 | `mesmoConteudo` cego ao aninhado | `JSON.stringify(a, Object.keys(a).sort())` — o 2º argumento é lista de chaves PERMITIDAS, aplicada recursivamente. Pedidos que diferiam só na headline contavam como o mesmo, e `gerar→upload` também |
| 3 | Idempotência expirando ao fechar o job | O `wx` só protege `pendente/`. Mesma chave abria um segundo job pago, e o `finishJob` dele apagava o custo do primeiro |
| 4 | Razão pareando errado | Um débito apagava as reservas POSTERIORES da mesma referência. Medido: 300 créditos num teto de 225 |
| 5 | `custoGasto` nunca saía de 0 | Razão e entrega nunca se encontravam; `0 > teto` nunca dispara |
| 6 | Vídeo vendido sem rota de produção | 520 créditos por peça que sairia como imagem parada. Agora o POST recusa |
| 7 | Arquivo não-mensurável passava batido | `continue` em silêncio. Agora reprova |
| 8 | `resultado.json` ilegível | Recomeçava do zero e apagava variações já pagas |

### PENDENTE — o mais sério primeiro

**A. A régua não mede a peça.** Um revisor provou em Chromium: uma headline
realista (o schema permite 200 caracteres) joga a marca inteira para fora do
quadro num `banner-3x1`, e `innerText` continua devolvendo o texto — **as dez
regras ficam verdes sobre uma peça sem marca visível**. E o contraste é medido
sobre as cores declaradas: no topo da linha da marca o pixel real é **2,51:1**
enquanto C4 declara 11,82, porque a faixa é um gradiente que começa transparente
e a marca tem `opacity:.85`.

*Correção:* `LER_TEXTOS` devolver também `getBoundingClientRect()` por
`[data-papel]`, e C2 reprovar quando `top < 0 || bottom > altura`. O idioma já
existe na casa em `scripts/conferir-site.ts:363-380`. Escalar a fonte pelo
comprimento do texto (determinístico). Pôr o texto sobre faixa **sólida** e tirar
o `opacity`, para o número de `contrasteDaPeca` voltar a ser verdade.

**B. Toda peça gerada sai gravada `aprovada`, e o rótulo é descartado.**
`scripts/criativo-compor.ts` calcula `rotuloDaPeca` e joga fora na linha
seguinte; `PecaCriativa` (`apps/web/src/lib/api.ts`) nem declara `conferencia`.
Contradiz "toda pendência é declarada". *Correção barata:* o front deriva o
rótulo da `conferencia`, que já viaja.

**C. O job entra na fila ANTES do upload e do retrato.**
`apps/server/src/routes/criativos.ts` — se o `renameSync` falhar, o job fica
enfileirado e cobrável citando um arquivo que não existe, e o reenvio cai em
`repetido` sem reparar. *Correção:* o id é determinístico, então gravar
`pedido.json` e o upload **antes** de `enfileirarUmaVez`.

**D. O `CLAUDE.md` não documenta `pnpm criativo:compor`.** Quem processar segue
o documento, gera o pixel (crédito sai) e descobre no fim que o `fila:concluir`
recusa. Falta o passo 5.5 com a sequência real e a nota de onde o arquivo do
provedor deve pousar (dentro de `criativosDir`).

**E. `--fundo` sobrescreve o upload do cliente**, e C5/C7/C8 ficam verdes:
`uploadPreservado` pergunta se *algum* fundo existe, não se é o do cliente.

**F. `fila:concluir` reescreve o retrato do pedido** incondicionalmente
(`scripts/fila-concluir.ts`), e confere o teto contra o payload da fila — o lado
mutável — em vez do retrato.

**G. Dívida declarada**, agrupada por arquivo, na saída completa da revisão
(`~/.claude/.../tasks/wwuk09phr.output`): C3 casa substring em qualquer papel;
contraste `NaN` passa por baixo do piso; C10 é cego a mojibake que não gere
U+FFFD; o portão aceita folha com uma regra só; `razao.json` é read-modify-write
sem trava; a chave de envio vive só na memória da aba (F5 abre um segundo job).

### Decisões que a revisão devolveu para o dono

1. **Vídeo:** fechar a venda no POST (feito) até existir rota, ou construir a
   rota de vídeo agora?
2. **Exposição:** o app vai ser alcançado por túnel ou por mais de uma pessoa nos
   próximos dias? Se sim, sobem para bloqueante: exigir `Origin` em todo
   não-GET, credencial de ação no rascunho, e contador no 428.
3. **Teto no servidor:** o POST passa a recalcular `tetoComFolga` e recusar teto
   maior, ou a docstring para de prometer uma conferência que não existe?
4. **Teto de rodada:** `ORBIS_CRIATIVO_TETO_LOTE` passa a ser perguntado no
   `selecionar.ts` quando a rodada tem job `criativo`?

---

## 6. Como continuar

```powershell
pnpm verificar          # lint + typecheck + suíte + portão de fidelidade
pnpm criativo:precos    # confere se a tabela de preço ainda vale (vence em 14/11)
```

A ordem que eu seguiria: **A** (a régua mentindo é o defeito que anula todos os
outros consertos), depois **B** e **D** (as duas mentiras para quem usa), depois
**C** e **F**.

Depois disso, a **Fase 6**: marca como entidade (`Brand`/`BrandVersion`), que é o
que destrava o pacote de marca e a integração com as outras frentes.

### O que NÃO fazer

- Não propor worker autônomo nem Photoshop no caminho do produto: as duas coisas
  foram decididas contra, com medição.
- Não mexer em `orbis-lojas-shopify` antes do `git pull` que o dono vai fazer.
- Não derivar slug de modelo a partir do rótulo. O catálogo é a fonte.
- Não gastar crédito sem teto declarado pelo dono.
