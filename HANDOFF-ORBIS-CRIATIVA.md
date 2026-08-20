# ORBIS CRIATIVA — retomada, 2026-08-20

Este arquivo é o ponto de partida de quem continuar a frente **Orbis Criativa**.
O `HANDOFF.md` descreve o produto; o `HANDOFF-RETOMADA.md` descreve onde a frente
de Design Systems parou. Este descreve **o que foi construído, o que já foi
medido e o que falta**.

Estado do repositório: branch **`orbis-criativa`**, 13 commits a partir de
`275931b`. Árvore limpa. Suíte com **uma** falha, pré-existente e sem relação
com este trabalho (`scripts/acervo-regressao.test.ts`, 7,1% de bytes duplicados
no acervo local da máquina — a mesma que o `HANDOFF-RETOMADA.md` já registrava).

```
  d9fcd9e Handoff: C, E, F e a divida G fecharam
  e7139af O razao ganha trava, e a chave de envio sobrevive ao F5 (divida G)
  22f0d08 Docs: o texto de C3 e C10 que nao tinha chegado no commit anterior
  22bcb7f A divida G da regua: papel certo, mojibake e folha inteira
  9a8b629 `--fundo` para de passar por cima do arquivo do cliente (E)
  d5cfd36 O job para de nascer cobravel apontando para o vazio (C e F)
  2255589 Handoff: o que a regua passou a medir, e o que ainda falta
  ad83142 Os documentos param de prometer o que ninguem faz
  e6e1e78 Um motor de marca so, para as tres frentes do portal
  4d62218 O servidor da frente Criativos: pedido, upload por papel e custo medido
  f018f84 A direcao de marca chega ate a peca, em vez de morrer no navegador
  eed3d3b A regua para de medir o documento e passa a medir a PECA
  07d2569 O contrato do pedido criativo, o preco MEDIDO e o razao de credito
```

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

E uma décima, dada em 20/08: **o motor criativo é UM e atende as três frentes.**
Qualquer processo do portal que precise gerar imagem, vídeo ou criar marca
chama `@ds/creative`. Segunda implementação de parte visual é defeito.

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

### Comandos

```powershell
pnpm criativo:precos                              # catálogo + tabela de preço medida
pnpm criativo:compor <job> <n> [--fundo <arq>]    # compõe, mede no navegador, roda C1..C11
pnpm criativo:razao ver|reservar|debitar|liberar  # o razão de crédito de um job
pnpm marca:derivar <símbolo> [--saida <pasta>]    # as 3 versões da logo, por cálculo
pnpm marca:espelhar [--seco]                      # sincroniza o recorte na frente de Lojas
```

### O caminho de uma peça, hoje

```
tela → POST /api/criativos (credencial de ação 428; id = hash da chave de envio;
       upload por PAPEL: imagem e logotipo em gavetas separadas)
     → [pessoa abre o PROCESSAR.bat]
     → agente: account_balance → criativo:razao reservar → images_generate (MCP)
       → BAIXA para criativosDir(job) → criativo:razao debitar → account_balance
     → pnpm criativo:compor <job> <n> --fundo <arquivo baixado>
     → pnpm fila:concluir <job>
     → download só do que a régua aprovou
```

### As peças

- **`packages/creative-engine`** (`@ds/creative`) — o motor. Catálogo de presets
  por transporte, tabela de preço datada, razão de crédito, composição em DOM,
  fonte embutida com cache, e o recorte das versões da logo.
- **`packages/shared/src/regras-de-aceite-criativo.ts`** — as regras **C1..C11**.
  O texto delas está em `docs/regras-de-aceite.md`, junto com as G e as S.
- **`packages/shared/src/schemas/cores-da-peca.ts`** — a derivação de cor, que a
  tela e o compositor usam pela MESMA conta.
- **`apps/server/src/routes/criativos.ts`** — POST do pedido, upload por papel,
  rota de custos, listagem que lê o disco além da fila.

### O princípio que organiza a régua

**O que não se mede não fica verde.** Campo ausente vira `pendente`, nunca
`passou`, e há um teste que passa um objeto vazio e exige zero aprovações. C7
(texto espúrio dentro do pixel) e C8 (marca d'água) são declaradamente
imensuráveis sem OCR: ficam pendentes quando houve geração, e a peça sai
"aprovada com ressalva".

---

## 4. O que foi consertado desde o handoff anterior

Os oito defeitos da revisão adversarial já estavam consertados. Estes são os
**pendentes** daquele handoff, todos fechados agora:

**A — a régua não media a peça.** Medido em Chromium: num `banner-3x1` com
headline de 176 caracteres, a marca terminava **601px acima** do topo do quadro
e as dez regras ficavam verdes. C2 passou a medir `getBoundingClientRect()` nos
quatro lados; C4 passou a medir as duas condições que tornam o contraste
declarado verdadeiro (texto opaco, faixa sólida). A composição parou de produzir
o defeito: corpo derivado do comprimento do texto, respiro vertical saindo da
altura, faixa sólida com o degradê num véu. 16 de 16 combinações dentro do
quadro, incluindo o teto do schema.

**B — a ressalva era descartada.** O rótulo agora é derivado da folha, que
sempre viajou. A tela mostra "N com ressalva" e nomeia qual.

**D — o `CLAUDE.md` não documentava o `criativo:compor`.** Documentado, com a
sequência real.

**G (parcial) — contraste `NaN`** passava por baixo do piso (`NaN < 3` é
`false`). Agora fica pendente.

---

## 5. O que FALTA

As pendências técnicas C, E, F e a dívida G fecharam. O que sobrou depende de
decisão, não de trabalho.

### Criação de marca: metade construída

O **recorte** está pronto, testado por pixel e disponível para as três frentes
(`pnpm marca:derivar`). Falta a metade que **gera o símbolo**, e ela depende do
teto de crédito (abaixo). Enquanto isso não vier, `tipo: 'marca'` NÃO entra no
contrato: vender o que não tem rota de produção é o defeito nº 6 que a revisão
pegou no vídeo.

### Dívida declarada que continua

**89 erros de tipo em `scripts/`**, fora os de criativo e de marca (que estão
limpos). A pasta não tinha typecheck nenhum — 56 arquivos, todos os comandos que
o processamento roda —, e foi por isso que uma referência solta a
`pedidoDeReferencia` passou batido durante a própria correção de F. Hoje há
`pnpm typecheck:scripts`, mas ele NÃO entra no `verificar` até essa limpeza.

**O app da frente de Lojas tem 94 erros de tipo pré-existentes**, e um
`cloudflare:workers` que não resolve. Nada disso é da consolidação do motor de
marca: medido antes e depois, o número não mudou.

### Decisões que continuam com o dono

1. **Teto de crédito da criação de marca.** O símbolo custa 75 (preset
   `imagem-marca`, Nano Banana Pro) por tentativa. Sem teto declarado, nada é
   gerado — e é a única peça que falta para a criação de marca ficar completa.
2. **Vídeo:** manter a venda fechada no POST (feito) ou construir a rota agora?
3. **Exposição:** o app vai ser alcançado por túnel ou por mais de uma pessoa nos
   próximos dias? Se sim, sobem para bloqueante: exigir `Origin` em todo
   não-GET, credencial de ação no rascunho, e contador no 428.
4. **Teto de rodada:** `ORBIS_CRIATIVO_TETO_LOTE` passa a ser perguntado no
   `selecionar.ts` quando a rodada tem job `criativo`?
5. **A frente de Lojas entra no workspace pnpm?** Hoje ela é projeto separado
   com `package-lock.json` e deploy próprios, então o recorte da logo vive lá
   como ESPELHO verificado por teste (`pnpm marca:espelhar`). Entrando no
   workspace, o espelho morre e vira um `import`.

## 6. Como continuar

```powershell
pnpm verificar          # lint + typecheck + suíte + portão de fidelidade
pnpm test:navegador     # os testes que medem pixel (precisa do playwright)
pnpm criativo:precos    # confere se a tabela de preço ainda vale (vence em 14/11)
pnpm marca:espelhar --seco  # confere se o recorte da frente de Lojas está em dia
```

Com o teto declarado, a geração do símbolo fecha a criação de marca — é o
próximo passo de produto. Depois disso, a limpeza dos 89 erros de `scripts/`
para o `typecheck:scripts` poder entrar no `verificar` como portão.

### O que NÃO fazer

- Não propor worker autônomo nem Photoshop no caminho do produto: as duas coisas
  foram decididas contra, com medição.
- Não derivar slug de modelo a partir do rótulo. O catálogo é a fonte.
- Não gastar crédito sem teto declarado pelo dono.
- Não editar `orbis-lojas-shopify/lib/logo-derivar.ts`: ele é espelho. O original
  está em `packages/creative-engine/src/marca/derivar-navegador.ts`.
- Não criar uma segunda implementação de nada visual. O motor é um.
