# Plano de endurecimento do Orbis, roteirizado pelo Frieren DAST-AI

> **Quem escreveu:** sessão paralela (aba de segurança), 20/08/2026.
> **Contra qual estado:** commit `275931b`, com a árvore de trabalho SUJA (mais de 30 arquivos modificados pela outra sessão).
> **Esta sessão não editou uma linha de código.** Só leu. Este arquivo é a entrega inteira.

---

## 0. Como as duas sessões convivem

A outra aba está no meio de um trabalho grande e não commitado. Uma edição minha em cima disso não daria conflito de git, daria coisa pior: sumiço silencioso de trabalho que ninguém consegue recuperar, porque não existe commit pra voltar.

Então a regra desta aba, enquanto a outra estiver de pé:

1. **Escrevo em UM arquivo só: este.** Pasta nova (`docs/seguranca/`), que ninguém está tocando. Aparece no `git status` como `??` e não colide com nada.
2. **Não rodo git de escrita.** Nada de commit, add, stash, checkout, branch, restore. A árvore de trabalho é dela.
3. **Não subo o app.** As portas 8787, 5173, 3000 e 4000 são dela. Nada de `pnpm dev`, e principalmente nada de `POST /api/desligar`.
4. **O canal é arquivo, nunca conversa colada.** Regra do próprio CLAUDE.md do Arthur. Quem for aplicar isto lê daqui.
5. **Cada achado abaixo vem carimbado com LIVRE ou OCUPADO**, conferido no `git status` no momento em que escrevi. LIVRE quer dizer que o arquivo não está na mão da outra sessão e a correção pode entrar já. OCUPADO quer dizer que precisa esperar o commit dela, senão duas mãos escrevem no mesmo arquivo.
6. **Antes de aplicar qualquer coisa daqui, reconferir o carimbo:** `git status --porcelain -- <arquivo>`. O que estava livre às 04h pode estar ocupado depois.

---

## 1. De onde veio o roteiro, e quanto custou

O `knowbe4/frieren-dast-ai` é um DAST com proxy MITM, 62 regras passivas em YAML e 10 agentes ativos que atacam em paralelo por endpoint: xss, sqli, ssrf, file_read, auth_bypass, secrets, discovery (SSTI, open redirect, CRLF), llm_injection, business_logic e blazor.

**Não foi instalado e não vai ser.** Ele exige um provedor de LLM (`AI_PROVIDER`: Bedrock, Anthropic ou OpenAI) e dispara 10 agentes por endpoint, ou seja, toda varredura vira conta de API. Isso contradiz a regra que este repositório já escreveu em `apps/server/src/lib/anthropic.ts`: custo zero de operação, API paga só com decisão explícita.

O que foi aproveitado, de graça: a **lista de classes de ataque** dele, usada como roteiro de leitura do código deste app. Os achados abaixo estão nomeados pelo agente do Frieren que corresponde a cada um.

---

## 2. Achados

### A1. A URL da extração aceita `file://` e a rede interna

`ssrf_agent` + `file_read_agent`. **Risco: alto. Arquivos LIVRES.**

- **Onde:** `packages/shared/src/schemas/design-system.ts:34` valida com `z.string().url()`. Esse validador do Zod 3 aceita QUALQUER esquema, inclusive `file:`, `ftp:` e `data:`, e não olha o host.
- **Pra onde vai:** `packages/extractor/src/fetch-url.ts:22` entrega direto pro `page.goto(url)` (linha 63) ou pro `fetch(url)` (linha 72). Não existe uma única checagem de destino no caminho. Confirmado por varredura: `z.string().url()` é a única validação de URL do repositório inteiro.
- **O que acontece:**
  - `{"kind":"url","url":"file:///C:/Users/arthur.maia/.aws/credentials"}` faz o Playwright abrir o arquivo local. O conteúdo entra no acervo e vira contexto do modelo.
  - `http://127.0.0.1:8787/...` faz o servidor chamar a si mesmo por dentro, de onde a origem é local.
  - `http://169.254.169.254/` numa hospedagem em nuvem devolve as credenciais da instância.
- **Quem alcança:** só `admin` (o nível `visita` já é barrado por ser escrita) e, se `ORBIS_SENHA_ACAO` estiver definida, com a senha de ação. O ponto é que existe UMA senha de admin, compartilhada com quem for convidado, e o app é publicado por túnel.
- **Correção:** um guarda de destino em `packages/shared`, e não local no fetch-url, porque há QUATRO lugares que abrem URL de fora: `packages/extractor/src/fetch-url.ts`, `packages/explorer/src/explore.ts:315`, `packages/explorer/src/browser.ts:223` e `packages/engine-v2/src/engine.ts:451`. Um guarda local conserta um e deixa três.

  O guarda: aceitar só `http:` e `https:`; resolver o hostname e recusar loopback, `169.254.0.0/16`, `10/8`, `172.16/12`, `192.168/16`, `.local` e `localhost`. E conferir DE NOVO no redirecionamento, porque `page.goto` segue redirect sozinho: um site legítimo pode responder 302 pra `http://127.0.0.1`. No Playwright isso se faz no evento de request da página, não só antes de chamar.

### A2. Injeção de prompt indireta escreve arquivo fora da pasta

`llm_injection_agent` + `file_read_agent`. **Risco: médio hoje, alto no dia que ligar o modo api. Arquivo LIVRE.**

- **Onde:** `packages/extractor/src/tools.ts`, função `resolveSafe`.
- **O que falta:** ela barra caminho absoluto na entrada e barra `..`, mas confere só `rel.startsWith('..')`. Falta o `isAbsolute(rel)` que o `apps/server/src/routes/app-web.ts:104` já faz na mesma situação. Duas guardas irmãs, uma completa e outra não.
- **Medido nesta máquina, Node 24:** o caminho `D:evil.js` não conta como absoluto pro Node. O `resolve(workDir, 'D:evil.js')` devolve a raiz da unidade D, o `relative` devolve um caminho absoluto de outra unidade, e isso não começa com `..`. **Passa pela guarda atual, e é bloqueado assim que o `isAbsolute(rel)` entrar.**
  - `C:evil.js` cai dentro da própria pasta (mesma unidade) e é inofensivo.
  - Caminho de rede (UNC) é barrado na entrada.
  - Ou seja: o escape só existe em máquina com uma segunda unidade montada. É condicional, não universal.
- **Como um estranho chega nisso:** o extrator lê o HTML de um site QUALQUER e tem `create_file` e `str_replace` na mão. O caminho da chamada de ferramenta é escolhido pelo modelo, e o modelo acabou de ler texto escrito por outra pessoa. É a definição de injeção indireta.
- **Hoje está frio** porque `EXECUTION_MODE=queue` e `DS_PERMITIR_API_PAGA` desligado fecham o caminho. Esquenta sozinho no dia da virada pra api.
- **Correção:** uma linha, copiada da irmã que já está certa.

### A3. Desligar a suíte inteira de fora, sem senha

`business_logic_agent` + `auth_agent`. **Risco: alto no formato Vercel. `desligar.ts` LIVRE, `index.ts` OCUPADO.**

- **Onde:** `apps/server/src/routes/desligar.ts:72` junto com `cookieDeSessao` em `apps/server/src/lib/portao.ts`.
- `POST /api/desligar` não lê corpo nem exige cabeçalho próprio. Um formulário HTML em qualquer site faz esse POST, e formulário não dispara preflight.
- **Com app e API na mesma origem** (o caso do túnel, que o `app-web.ts` documenta) o cookie sai `SameSite=Lax`, e Lax não acompanha POST vindo de outro site. **Protegido.**
- **Com `WEB_ORIGIN` num domínio de verdade** (front na Vercel, API noutro lugar, cenário que o código escreve explicitamente que suporta) o cookie sai `SameSite=None; Secure`, e aí ele acompanha. Qualquer página aberta noutra aba derruba servidor, tela, portal e app de lojas de uma vez.
- **CORS não cobre isto.** Ele decide quem consegue LER a resposta, não quem consegue MANDAR o pedido. O efeito colateral já aconteceu antes da resposta existir.
- **Correção que cobre a classe inteira, e não só esta rota:** no guarda de `index.ts`, para todo método que não é leitura, exigir que `Origin` bata com `WEB_ORIGIN` (ou que `Sec-Fetch-Site` seja `same-origin`). É o mesmo lugar onde a tranca do nível `visita` já mora, pelo mesmo motivo escrito lá: tranca que só existe na tela não é tranca.
- **Correção parcial que dá pra fazer já, sem tocar no arquivo ocupado:** exigir um cabeçalho próprio no `desligar.ts`. Cabeçalho fora da lista simples obriga preflight, e o preflight morre no CORS.

### A4. O erro de qualquer rota devolve a mensagem crua

Regra passiva de página de erro e rastro. **Risco: baixo. `index.ts` OCUPADO.**

- `apps/server/src/index.ts:141`: `app.onError` responde `{ error: 'internal_error', message: err.message }`.
- O `asset.ts` tem o cuidado declarado de não vazar caminho físico. O `onError` vaza por fora dele: um `ENOENT` carrega o caminho absoluto da máquina até o navegador, e num túnel público isso sai pra internet.
- **Correção:** texto fixo na resposta, detalhe só no `console.error` que já está lá.

### A5. A página que tem o campo de senha sai sem cabeçalho de segurança nenhum

Regras passivas de headers, clickjacking e HSTS. **Risco: médio. Arquivo LIVRE.**

- `apps/server/src/routes/app-web.ts:86`: a resposta leva só `Content-Type` e `Cache-Control`.
- Comparação dentro do próprio repositório: `asset.ts` manda `X-Content-Type-Options: nosniff`, `criativos.ts:698` manda `Content-Security-Policy: sandbox`. A página do portão, que é onde a credencial é digitada, não manda nada.
- Sem `frame-ancestors` nem `X-Frame-Options`, essa tela pode ser posta num iframe invisível de outro site, com um botão falso por cima. Sem HSTS, a primeira visita pelo túnel aceita ser rebaixada. Sem `nosniff`, um arquivo servido pelo fallback pode ser reinterpretado.
- **Correção:** `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY` (ou CSP com `frame-ancestors 'none'`), `Referrer-Policy: no-referrer`, e `Strict-Transport-Security` quando o `x-forwarded-proto` disser https. O `conexaoSegura` de `orbis.ts:54` já sabe ler isso.

### A6. O que foi olhado e está certo, e eu NÃO mexeria

- **Contador de tentativas global e em memória** (`limite-de-tentativas.ts`): a escolha está justificada por escrito e o motivo se sustenta (contar por IP atrás de túnel é contar o IP do túnel, e `x-forwarded-for` é escrito por quem chama). O limite dela já está declarado no próprio arquivo.
- **`Access-Control-Allow-Origin: *` nos assets:** conteúdo endereçado por hash, sem credencial, e fonte em iframe de origem opaca exige. Correto.
- **`desligar.ts` matando por porta:** a porta vem de constante, o PID passa por `^\d+$` antes de entrar no `taskkill`. Não há injeção de comando ali.
- **SQL:** tudo por drizzle. O único `prepare` cru é `health.ts:8`, com literal fixo e sem parâmetro. Sem SQLi.
- **Assinatura do cookie** (`portao.ts`): prazo e nível viajam dentro da assinatura, comparação em tempo constante dos dois lados, as duas senhas sempre conferidas pra não vazar qual delas errou. Bem feito.
- **Traversal em `asset.ts` e `app-web.ts`:** as duas guardas estão completas.

---

## 3. Ordem sugerida

**Pode entrar agora, arquivos livres, nenhum encosta no trabalho da outra aba:**

1. A2, o `isAbsolute(rel)` em `packages/extractor/src/tools.ts`. Uma linha, risco zero de regressão.
2. A5, os cabeçalhos em `apps/server/src/routes/app-web.ts`.
3. A1, o guarda de destino em `packages/shared`, ligado nos quatro pontos de fetch. É o maior dos três e o que mais vale.

**Espera o commit da outra aba:**

4. A3 na forma boa (checagem de origem no guarda de `index.ts`).
5. A4 (`onError`, no mesmo `index.ts`).

---

## 4. Como conferir, sem subir o app

O repositório já tem teste em vitest ao lado do código (`portao.test.ts`, `paths.test.ts`). O mesmo formato serve:

- **A1:** tabela de URLs contra o guarda. Passam: `https://exemplo.com`, `http://exemplo.com:8080/a`. Recusadas: `file:///etc/passwd`, `http://127.0.0.1:8787`, `http://169.254.169.254/`, `http://[::1]/`, `http://192.168.0.1/`, `http://localhost`, `data:text/html,x`, e um domínio que resolva pra IP privado.
- **A2:** os cinco caminhos já medidos, com o resultado esperado de cada um. O `D:evil.js` é o que prova a correção.
- **A3:** pedido sem `Origin` e pedido com `Origin` de outro site contra uma rota de escrita, esperando 403.
- **A5:** conferir os cabeçalhos na resposta de `GET /`.

O que NÃO foi auditado nesta passada, pra ninguém achar que está coberto: o front (`apps/web`) em profundidade, o `preview.ts` inteiro (1327 linhas, tem construção de HTML com `innerHTML` dentro do documento sandbox), o `packages/engine-v2` e o app de lojas Shopify.
