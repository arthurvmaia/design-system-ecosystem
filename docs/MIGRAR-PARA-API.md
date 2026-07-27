# Migrar o MVP para a API

Instruções para o Claude Code. Quando o MVP estiver validado e você quiser que o
app rode sozinho chamando a API da Anthropic, mande este arquivo.

---

## Contexto

O app tem os dois caminhos implementados e vivos. Migrar **não é reescrever** —
é trocar uma variável e ajustar o que muda de comportamento.

```
apps/server/.env
EXECUTION_MODE=queue   ← MVP: registra pedidos em disco, você processa no Claude Code
EXECUTION_MODE=api     ← produção: o app chama a Anthropic direto
```

O código da API nunca foi removido. Ele está em:

- `packages/extractor/src/agent.ts` — loop agêntico, com cache de prompt
- `packages/classifier/src/index.ts` — classificação em lote
- `packages/generator/src/index.ts` — composição do site (dois modos)

---

## Passo a passo

### 1. Trocar o modo

Em `apps/server/.env`:

```
EXECUTION_MODE=api
```

Reinicie o app. O log do servidor deve mostrar `modo : api`.

### 2. Conferir crédito

A partir daqui cada extração, classificação e geração consome créditos.

- Saldo: https://console.anthropic.com/settings/billing
- **Defina um limite de gasto mensal antes de liberar para os dois usuários.**

### 3. Decidir o modelo da extração — importante

O MVP rodou extração no Claude Code (Opus 4.8). A configuração de produção usa
Sonnet 5 para extrair:

```
ANTHROPIC_MODEL_EXTRACTOR=claude-sonnet-5
ANTHROPIC_MODEL_CLASSIFIER=claude-opus-4-8
ANTHROPIC_MODEL_GENERATOR=claude-opus-4-8
```

**Se a qualidade validada no MVP for o padrão a manter, suba o extrator para
Opus:**

```
ANTHROPIC_MODEL_EXTRACTOR=claude-opus-4-8
```

Caso contrário, produção sairá um degrau abaixo do que foi validado — e vai
parecer que "a API quebrou algo", quando na verdade o MVP é que rodava num
modelo mais forte. Custa mais; é uma decisão de negócio, não técnica.

### 4. Validar

```powershell
pnpm typecheck
pnpm lint
pnpm dev
```

Depois, no app:

1. Extraia **um** site pequeno e confira o resultado
2. Classifique os segmentos
3. Gere um site nos dois modos (blueprint e criativo)
4. Confira o consumo em https://console.anthropic.com/settings/usage

---

## O que NÃO mexer

Estes pontos custaram trabalho e não devem ser "simplificados" na migração:

**Cache de prompt no extrator** (`packages/extractor/src/agent.ts`)
Três breakpoints: system+tools, HTML de entrada, e um rolante na conversa. O
loop reenvia o contexto até 60 vezes; sem cache, o custo multiplica. Não remova
os `cache_control`.

**`max_tokens: 16000`** nos três pacotes
Eram 4096–8192 e truncavam resultados grandes — o gerador chegava a estourar
`"Composição não retornou JSON"`. `max_tokens` é teto, não compra: você paga o
que o modelo escreve, então baixar isso não economiza, só volta a amputar.

**Slot separado do classificador**
A classificação organiza a galeria e alimenta a curadoria. Ela usa
`models.classifier` (Opus), não `models.extractor`. Não volte a apontar para o
slot barato.

**`prompt.ts` versão 3**
É o ativo de qualidade da extração. Se mexer, bumpe `PROMPT_VERSION`.

---

## Manter os dois modos

Não apague o modo `queue`. Ele serve para:

- comparar qualidade entre os dois caminhos no mesmo projeto
- voltar atrás sem reescrever nada, se a conta de API surpreender
- trabalhar sem crédito, se o saldo acabar no meio de algo

O custo de manter é uma variável de ambiente e um `if`.

---

## Checklist

- [ ] `EXECUTION_MODE=api` em `apps/server/.env`
- [ ] Crédito na conta + limite de gasto definido
- [ ] Decisão sobre o modelo do extrator (Sonnet 5 vs Opus 4.8)
- [ ] `pnpm typecheck` e `pnpm lint` limpos
- [ ] Uma extração real validada
- [ ] Uma geração em cada modo (blueprint e criativo)
- [ ] Consumo conferido no console
