# Plano de endurecimento do Orbis, roteirizado pelo Frieren DAST-AI

> **Quem escreveu:** sessão paralela de segurança, 20/08/2026.
> **Estado:** **os cinco achados da primeira passada estão CORRIGIDOS**, mais um sexto da segunda passada. Tudo na branch `seguranca-dast`, em três commits. A seção 6 traz o que a segunda passada encontrou e ainda espera decisão do dono.
> **Este arquivo não é versionado de propósito.** Ele é o canal entre as duas abas, e não conteúdo do repositório. Tracká-lo faria o `git merge` da branch de segurança falhar com "untracked working tree file would be overwritten", que é o erro mais chato possível na hora mais errada possível. O "porquê" de cada correção mora no código e na mensagem do commit, que é onde este repositório sempre pôs as razões.

---

## 0. Como as duas sessões conviveram

A outra aba estava com trabalho grande e não commitado quando isto começou. Depois ela ramificou para `orbis-criativa` e passou a commitar. As regras que esta aba seguiu, do começo ao fim:

1. **Zero edição na árvore de trabalho dela.** Nenhuma. A única exceção declarada é este arquivo.
2. **Worktree separado.** O código foi escrito em `Desktop/orbis-suite-seguranca`, que é um `git worktree` do mesmo repositório: diretório próprio, branch própria (`seguranca-dast`, saindo de `main`), `.git` compartilhado. Enquanto ela commitava em `orbis-criativa`, eu commitava em `seguranca-dast`, e nenhuma das duas viu a outra.
3. **Nenhum comando de git que mexesse na árvore dela.** Nada de checkout, stash, add ou commit em `Desktop/orbis-suite`.
4. **O app não foi subido.** As portas 8787, 5173, 3000 e 4000 continuaram sendo dela.
5. **Colisão medida antes de cada arquivo, não presumida.** `git diff --name-only main orbis-criativa -- <arquivo>` mais `git status --porcelain -- <arquivo>`. Dois arquivos foram descartados por esse teste, e estão listados na seção 3.

### O que fazer com o worktree quando isto acabar

```powershell
cd C:\Users\arthur.maia\Desktop\orbis-suite
git merge seguranca-dast          # ou abra PR de seguranca-dast
git worktree remove ..\orbis-suite-seguranca
git branch -d seguranca-dast
```

O `git worktree remove` apaga a pasta `orbis-suite-seguranca` do Desktop. Ela só existe para dar um lugar de trabalho isolado; depois do merge não serve mais para nada.

---

## 1. De onde veio o roteiro, e por que a ferramenta não foi instalada

O `knowbe4/frieren-dast-ai` (Apache-2.0, ativo) é um DAST com proxy MITM, 62 regras passivas em YAML e 10 agentes ativos: xss, sqli, ssrf, file_read, auth_bypass, secrets, discovery, llm_injection, business_logic e blazor.

**Foi lido, não rodado.** Confirmado no código dele, e não no README:

- A metade passiva (`dast/plugins/passive_scanner.py`) importa `re` e `yaml` e mais nada. Roda sem LLM nenhum.
- A metade ativa (`dast/agents/*`) importa `dast.ai` e chama o modelo. É o botão "Scan" do painel, e é o que custa.
- O `set_provider()` de `bedrock_client.py` só guarda string em variável; não conecta e não valida. Sem credencial preenchida, uma varredura ativa morre em `AiUnavailableError` antes de sair da máquina. Ou seja: não existe caminho pelo qual ele cobre sem alguém preencher credencial de propósito.

Instalar custaria Python, `uv`, navegadores do Playwright e uma CA raiz no navegador, para reconfirmar **um** dos cinco achados (o A5). Os outros quatro exigem os agentes pagos ou leitura de código. O proveito grátis dele foi a lista de classes de ataque, usada como roteiro. É por ela que os achados abaixo estão nomeados.

---

## 2. Os cinco achados

### A1. A URL da extração aceitava `file://` e a rede interna — CORRIGIDO

`ssrf_agent` + `file_read_agent`. Risco alto.

**O que era:** `packages/shared/src/schemas/design-system.ts:34` valida com `z.string().url()`, que confere só o FORMATO. `file:///C:/Users/arthur.maia/.aws/credentials` passava, `http://127.0.0.1:8787` passava, `http://169.254.169.254` passava. O `packages/extractor/src/fetch-url.ts` entregava os três direto ao `page.goto` ou ao `fetch`. Não havia uma única checagem de destino no repositório inteiro.

**O que ficou:** `packages/shared/src/destino-permitido.ts`, novo. Consultado em três momentos, porque um só não bastaria:

- antes de abrir qualquer coisa, com o nome **resolvido no DNS**, porque um domínio público pode apontar para `127.0.0.1`;
- a cada **redirecionamento**, porque quem responde escolhe o próximo endereço (o `fetch` passou a seguir os saltos à mão, com teto de 5);
- a cada **pedido que a página faz**, via `page.route` do Playwright, porque o navegador busca imagem, script e fonte sozinho.

Mora em `packages/shared` porque há quatro lugares no repositório que abrem URL de fora, e um guarda escrito dentro de um deles conserta aquele e deixa os outros. Entra por subcaminho (`@ds/shared/destino-permitido`) e não pelo `index.ts`, para não arrastar `node:dns` para dentro do bundle do front.

**A porta que abre de propósito:** `ORBIS_PERMITIR_REDE_INTERNA=1`. Mesmo desenho do `DS_PERMITIR_API_PAGA`. Serve ao caso real de extrair um site rodando na sua própria máquina, sem deixar o servidor publicado aberto para a rede de quem o hospeda. Ela reabre REDE e não reabre `file:`.

### A2. Injeção de prompt indireta escrevia fora da pasta — CORRIGIDO

`llm_injection_agent` + `file_read_agent`. Risco médio hoje, alto no dia da virada para o modo `api`.

**O que era:** `resolveSafe`, em `packages/extractor/src/tools.ts`, conferia `rel.startsWith('..')` e não conferia `isAbsolute(rel)`. As duas perguntas que o `apps/server/src/routes/app-web.ts:104` já fazia na mesma situação; era a irmã pela metade.

**Medido nesta máquina, Node 24:** `D:evil.js` não conta como absoluto para o Node (quer dizer "a pasta atual da unidade D"), então passava pela guarda de entrada. E `relative` entre unidades diferentes devolve um caminho absoluto, que não começa com `..`. Gravava na raiz de D. `C:evil.js` cai dentro da própria pasta e é inofensivo; caminho de rede já era barrado. O escape existia só em máquina com uma segunda unidade montada.

**Quem chegava lá:** o modelo, escolhendo o caminho da chamada de ferramenta logo depois de ler o HTML de um site qualquer.

**O que ficou:** a segunda pergunta, mais o teste que a prova (`tools.test.ts`, o caso da unidade vizinha).

### A3. Desligar a suíte inteira de fora — CORRIGIDO

`business_logic_agent` + `auth_agent`. Risco alto no formato Vercel, nenhum no formato túnel.

`POST /api/desligar` não lê corpo nem exige cabeçalho próprio, e formulário HTML de outro site não dispara preflight. Com app e API na mesma origem (o túnel) o cookie sai `SameSite=Lax` e não acompanha: **protegido**. Com `WEB_ORIGIN` num domínio de verdade, o cookie sai `SameSite=None; Secure` e acompanha: qualquer página aberta noutra aba derruba servidor, tela, portal e app de lojas.

CORS não cobre isto: ele decide quem LÊ a resposta, não quem MANDA o pedido.

**O que ficou:** `apps/server/src/lib/origem-permitida.ts`, ligado no guarda de `index.ts`. Cobre a classe inteira, e não só esta rota.

Três decisões que valem saber:

- **Entra ANTES do portão**, e não depois, porque o caso pior é o de portão DESLIGADO (`ORBIS_LOCAL=1`): ali não há sessão para conferir, e o formulário alcança `localhost:8787` sem credencial nenhuma. Depois do `desligado` a conferência ficaria de fora justamente onde mais faz falta.
- **Duas origens valem:** o `WEB_ORIGIN` declarado e a origem do PRÓPRIO pedido. A segunda existe porque o endereço do túnel é sorteado na hora e nunca está no `.env`; conferir só contra `WEB_ORIGIN` trancaria o app para fora de si mesmo.
- **Ausência de `Origin` LIBERA**, e isso não é buraco: o navegador não tem como omitir esse cabeçalho numa escrita feita por uma página, então "sem `Origin`" só acontece em `curl`, script, teste e `PROCESSAR.bat`. Recusar ali quebraria a automação inteira sem fechar porta nenhuma.

### A4. O erro de qualquer rota devolve a mensagem crua — CORRIGIDO

Risco baixo. `apps/server/src/index.ts`, no `onError`: `message: err.message`. O `asset.ts` tem o cuidado declarado de não vazar caminho físico, e o `onError` desfazia esse cuidado por fora. Um `ENOENT` levava `C:\Users\arthur.maia\...` até o navegador, e num túnel público isso sai para a internet.

**O que ficou:** texto fixo na resposta, detalhe só no `console.error` que já estava lá. Conferido antes: `internal_error` não é lido em lugar nenhum do front.

### A5. A página do portão saía sem cabeçalho de segurança — CORRIGIDO

Risco médio. `apps/server/src/routes/app-web.ts` respondia só `Content-Type` e `Cache-Control`, enquanto o `asset.ts` já mandava `nosniff` e o `criativos.ts` já mandava CSP. A tela onde a CREDENCIAL é digitada era a mais desprotegida das três.

**O que ficou:** `X-Content-Type-Options: nosniff`, `Content-Security-Policy: frame-ancestors 'none'` (com `X-Frame-Options: DENY` ao lado, para navegador velho), `Referrer-Policy: no-referrer`, e `Strict-Transport-Security` quando a conexão chegou por https, lido do `x-forwarded-proto` como o `orbis.ts` já lê.

**Conferido antes de aplicar:** os iframes do app apontam todos para `/api/preview/*`, que é outra rota, registrada antes do coringa, e não recebe estes cabeçalhos. Os do app de lojas usam `srcDoc`, que nem passa por resposta HTTP. `frame-ancestors` não quebra nada.

A CSP tem essa diretiva SÓ. Mandar `default-src` daqui quebraria o bundle do app.

### A6. O que foi olhado e está certo

- **Contador de tentativas do login:** atraso que dobra, teto de 5s, contador global e em memória. A escolha está justificada por escrito e o motivo se sustenta.
- **Assinatura do cookie:** prazo e nível viajam dentro da assinatura, comparação em tempo constante dos dois lados, as duas senhas sempre conferidas para não vazar qual errou.
- **`Access-Control-Allow-Origin: *` nos assets:** conteúdo endereçado por hash, sem credencial, e fonte em iframe de origem opaca exige.
- **`desligar.ts` matando por porta:** porta vem de constante, PID passa por `^\d+$`. Sem injeção de comando.
- **SQL:** tudo por drizzle; o único `prepare` cru é literal fixo em `health.ts:8`. Sem SQLi.
- **Traversal em `asset.ts` e `app-web.ts`:** as duas guardas completas.

---

