# GATE — a régua apontada para o próprio app — 2026-08-14 — Rodada 1 — faixa VAI SAIR

sha256 (16 primeiros):
- `apps/portal/src/portal.css` — 82125AC6DB0EF76F
- `scripts/conferir-site.ts` — D7C8047C6E75FEC2
- `packages/shared/src/regras-de-aceite.ts` — 8689905FF811A711

fonte: `8520eae` (HEAD do próprio repositório que a peça altera)

## ⚠️ Isolamento DEGRADADO — leia antes de confiar neste parecer

A regra 1 do gate diz que o auditor nunca é quem produziu, porque quem escreveu
audita a intenção em vez do resultado. **Esta rodada não cumpriu essa regra.**

As três lentes foram disparadas em subagentes de contexto limpo (adversarial,
usuário-zero e convenção) e **as três morreram por limite de sessão** antes de
emitir parecer. A seção 9 do gate manda degradar em vez de abortar: rodar as
lentes em sequência no próprio turno, com o isolamento pior e declarado. Foi o
que aconteceu.

Consequência honesta: o que segue vale como conferência, não como auditoria
independente. **Relançar as três lentes depois das 15h** (limite reseta) é o
que fecha isto de verdade — o diff auditado está em `%TEMP%/gate-diff.txt`.

## Preflight

| Passo | Resultado |
|---|---|
| Typecheck (`pnpm typecheck`) | 0 erros |
| Lint (`pnpm lint`) | limpo, 543 arquivos |
| Teste (`pnpm test`) | 1776 testes, 1774 passam, 1 falha PRÉ-EXISTENTE (`acervo-regressao`: 7,1% de bytes duplicados num design system local, sem relação com o diff) |
| Segredo | nenhum padrão de credencial no diff |
| Diff limpo | sim — o auditado é o que está no disco |

## Achados

| Sev | Lente | Achado | Evidência | Correção |
|---|---|---|---|---|
| IMPORTANTE | ★ adversarial | **Abstenção em SILÊNCIO.** A medida passou a devolver `alturaTotal: 0` para página sem seção, e a regra S20 se abstinha sem emitir veredito. A lista da conferência saía com uma regra a MENOS e quem lê não distinguia "passou" de "ninguém mediu" — o critério (e), falha em silêncio. | `scripts/conferir-site.ts:1086` imprime uma linha por veredito de `aceite.vereditos`; sem veredito, nenhuma linha. Saída real do portal antes: 10 regras listadas em vez de 11. | **APLICADA.** `regras-de-aceite.ts` passou a emitir veredito `pendente` com o motivo "não verifiquei: esta página não tem seção para medir". Saída real depois: `· S20 … não verifiquei: …`. |
| IMPORTANTE | ★ adversarial | **Falso negativo latente.** Se um dia a emissão de `data-secao` quebrar, todo site gerado passaria a abster da S20 em vez de reprovar — e antes da correção acima isso seria invisível. | Mesmo mecanismo do achado anterior. | Mitigado pela correção acima: a abstenção agora aparece na lista, então uma regressão dessas vira uma linha `·` em todo site, à vista. |
| IMPORTANTE | convenção | **Peça sem teste automatizado** (na entrada). A mudança da medida vive dentro do template literal que roda no navegador e não tinha teste. | `scripts/conferir-site.ts`, bloco `MEDIR`. | **PARCIAL.** A regra ganhou teste (`regras-de-aceite.test.ts`: abstém com total 0, reprova com 5%, passa com 50%). A MEDIDA em si continua sem teste de navegador — fica registrado. |
| POLIMENTO | convenção | `.portao-campo` ficou com `height: 44px` e `min-height: 44px` juntos. | `apps/portal/src/portal.css:335` | Intencional e comentado: `height` fixa o tamanho no eixo horizontal, `min-height` é o piso quando o eixo vira vertical. Manter. |

## O que foi VERIFICADO por medição, não por leitura

- **Nenhum outro consumidor.** `grep` por `alturaTotal|alturaUtil` fora do
  `conferir-site.ts`: só a regra S20 em `regras-de-aceite.ts`. A ocorrência em
  `packages/explorer/src/scroll-capture.ts` é variável local homônima.
- **Campo do portal:** 320×21px antes, 320×44px depois (medido no navegador a
  390px). A causa era `flex: 1` virando `flex-basis: 0%` no eixo principal
  quando o formulário empilha no celular, atropelando `height`.
- **Sem regressão nos sites gerados:** o site do SJDR continua com `✓ S20` nas
  duas larguras — a abstenção NÃO alcançou quem tem seção.
- **Portal depois da correção:** zero reprovações nas 11 regras, nas duas
  larguras.

## Veredito

Preflight ✓ · adversarial (degradada) ✗→✓ após correção · convenção (degradada) ✓

**LIBERADO com ressalva de isolamento** — zero BLOQUEADOR. Nota 7/10: a peça
sai, mas a nota carrega o fato de que ninguém independente a leu.

PRÓXIMA AÇÃO: relançar as três lentes em subagente depois das 15h e acrescentar
a rodada neste mesmo arquivo. Se elas confirmarem, a nota sobe; se acharem algo,
o gate cumpre o papel que hoje não pôde cumprir.

---

# Rodada 2 — 2026-08-14 15h32 — isolamento RESTAURADO

sha256 (16 primeiros), depois da última correção:
- `apps/portal/src/portal.css` — 4A6C3C82602AA754
- `scripts/conferir-site.ts` — 3067BE87A06713EC
- `packages/shared/src/regras-de-aceite.ts` — 8FCA576AEF242E1E

As três lentes rodaram em subagentes de contexto limpo, como manda a regra 1.
E elas acharam o que a rodada 1 degradada não achou.

## BLOQUEADOR — confirmado por três lentes independentes e por mim

`pnpm conferir <endereço>` **quebrava em 100% das execuções**. `join(pasta,
'aceite-navegador.json')` tratava a URL como pasta, o `writeFileSync` estourava
com ENOENT — e o crash vinha DEPOIS de imprimir a lista inteira de vereditos.
A tela mostrava tudo verde e o erro aparecia no fim.

Pior: o processo saía com **1**, o mesmo código de "reprovou". Para quem
encadeia `pnpm pagina && pnpm conferir` como portão, o comando passou a falhar
sempre, medisse o que medisse. Número que não muda não prova nada — o defeito
que este repositório mais persegue, do avesso.

A rodada 1 (eu, auditando a mim mesmo) leu a lista bonita de ✓ e não conferiu
se o comando terminava. É exatamente o que a regra dos quatro olhos existe para
impedir.

**CORRIGIDO:** `destinoDoVeredito(alvo)` devolve `null` para endereço, e a
gravação só acontece quando há pasta. `--corrigir` com endereço é recusado cedo,
com mensagem que diz por quê. Medido depois: endereço sai 0, pasta sai 0, e o
site do SJDR continua com `✓ S20` nas duas larguras.

## IMPORTANTES — todos corrigidos

| Achado | Lente | Correção |
|---|---|---|
| Zero teste em `scripts/conferir-site.ts` — a causa raiz de o bloqueador ter sobrevivido a dois commits e a uma rodada de gate | as três | `scripts/conferir-site.test.ts` criado. A decisão que quebrou virou função testável (`destinoDoVeredito`) e tem teste de regressão de verdade. |
| Texto de ajuda não mencionava endereço | adversarial | `Uso: pnpm conferir <pasta do site gerado \| endereço http>` |
| Acentuação ausente no comentário novo do `portal.css`, num arquivo 100% acentuado, a 29 linhas de "portão" escrito certo | convenção | Reescrito com acentuação plena. |
| Brecha latente: a condição `total !== undefined && util !== undefined` repetida nos dois ramos fazia a S20 sumir em silêncio se só um viesse definido — o mesmo buraco pela porta dos fundos | convenção | Guarda única, com os três estados num só ramo. |

## IMPORTANTE aceito e NÃO corrigido, com a razão

O `pendente` da S20 significa "esta página não é do tipo que a regra mede", e o
`pendente` das outras regras significa "falta material seu, resolva". A lente de
convenção apontou com razão que são coisas diferentes dividindo o mesmo estado,
e que o portão de fidelidade trata "não deu para verificar" como estado de
primeira classe (saída 2, distinta de 0 e 1).

Não separei agora porque um quarto estado atravessa `VereditoDaRegra`, as telas
de pendência e o `kits-provar` — é refatoração de contrato, não conserto. A
lente adversarial verificou que **nenhum consumidor de produção lê
`aprovado`/`comPendencia` do `aceite-navegador.json` hoje**, então o risco atual
é zero. Fica registrado como dívida consciente.

## Veredito da rodada 2

adversarial ✗→ corrigido · usuário-zero ✗→ corrigido · convenção ✗→ corrigido

**LIBERADO** — zero BLOQUEADOR em aberto. As notas das lentes (3, 3 e 4) valem
para o estado em que elas auditaram; o bloqueador que as motivou está corrigido,
medido e coberto por teste.

O gate funcionou: a rodada degradada liberou com nota 7 o que três auditores
independentes reprovaram por unanimidade. É a prova de que a regra 1 não é
formalidade.
