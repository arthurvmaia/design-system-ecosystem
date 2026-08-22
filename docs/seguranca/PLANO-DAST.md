# Plano de endurecimento do Orbis, roteirizado pelo Frieren DAST-AI

> **Quem escreveu:** sessão paralela de segurança, 20/08/2026.
> **Estado:** três passadas. Sete achados corrigidos, dois esperando decisão sua. A seção 9 traz a terceira passada, que corrigiu um ERRO MEU da primeira: o guarda de SSRF não cobria o caminho principal do app.
> **Este arquivo não é versionado de propósito.** Ele é o canal entre as duas abas, e não conteúdo do repositório. Tracká-lo faria o `git merge` da branch de segurança falhar com "untracked working tree file would be overwritten", que é o erro mais chato possível na hora mais errada possível. O "porquê" de cada correção mora no código e na mensagem do commit, que é onde este repositório sempre pôs as razões.

---

## 0. Como as duas sessões conviveram

A outra aba estava com trabalho grande e não commitado quando isto começou. Depois ela ramificou para `orbis-criativa` e passou a commitar. As regras que esta aba seguiu, do começo ao fim:

1. **Zero edição na árvore de trabalho dela.** Nenhuma. A única exceção declarada é este arquivo.
2. **Worktree separado.** O código foi escrito em `Desktop/orbis-suite-seguranca`, que é um `git worktree` do mesmo repositório: diretório próprio, branch própria (`seguranca-dast`, saindo de `main`), `.git` compartilhado. Enquanto ela commitava em `orbis-criativa`, eu commitava em `seguranca-dast`, e nenhuma das duas viu a outra.
3. **Nenhum comando de git que mexesse na árvore dela.** Nada de checkout, stash, add ou commit em `Desktop/orbis-suite`.
4. **O app não foi subido.** As portas 8787, 5173, 3000 e 4000 continuaram sendo dela.
5. **Colisão medida antes de cada arquivo, não presumida.** `git diff --name-only main orbis-criativa -- <arquivo>` mais `git status --porcelain -- <arquivo>`. Dois arquivos (`index.ts` e `.env.example`) foram adiados por esse teste enquanto ela ainda escrevia neles, e só entraram depois que ela commitou.
6. **O merge foi testado, e não prometido.** `git merge-tree` para simular, e depois um merge de verdade num ramo à parte (`seguranca-com-criativa`), com a suíte rodada em cima do resultado combinado. A seção 6 traz o único conflito e como resolvê-lo.

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

### A1. A URL da extração aceitava `file://` e a rede interna — CORRIGIDO, mas leia o C1

`ssrf_agent` + `file_read_agent`. Risco alto.

> **Esta seção estava incompleta e ficou aqui como registro.** O que ela descreve fecha o modo `api`. O caminho do modo `queue`, que é o PADRÃO, ficou aberto até a terceira passada. A seção 9 (C1) conta o erro e a correção.

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

## 3. A segunda passada: o que serve HTML

A primeira passada olhou a porta de entrada e o caminho da extração. Esta olhou onde o app SERVE conteúdo que não é dele.

### B1. O HTML extraído rodava com a sessão de quem entrou — CORRIGIDO

`xss_agent`. Risco alto.

**O que era:** `GET /vault/<ds>/` redireciona para `design-system.html`, servido como `text/html` NA MESMA ORIGEM do app, sem CSP e sem sandbox. E o que mora ali não é conteúdo nosso: é o HTML extraído de um site de terceiro, com os scripts dele dentro.

**Medido no acervo desta máquina:** 57 capturas no vault. As primeiras já trazem `<script src="https://cdn.tailwindcss.com">`, `code.iconify.design` e scripts do próprio site capturado.

Abrir esse endereço numa aba fazia o script de outra pessoa rodar com a origem do app e a sessão aberta. Dali ele fala com a API como se fosse você. O cookie é `SameSite=Lax`, que acompanha navegação de primeiro nível, então bastava o endereço.

**O que ficou:** `Content-Security-Policy: sandbox` nos tipos que se leem como DOCUMENTO (`.html` e `.svg`), pela mesma lista e mesmo motivo do `routes/criativos.ts`. Mais `nosniff` em tudo, como o `routes/asset.ts` já fazia.

Não custa nada, e o teste fixa a intenção: nada no app abre esses endereços. A prévia monta o documento dela e usa o vault só para CSS, imagem e fonte, que CSP de documento não afeta.

**O que este achado ensina:** o app já sabia a resposta em DOIS lugares (o `CSP_PREVIA` do preview e o `sandbox` do criativos) e não a aplicava no terceiro. Mesma porta, três trancas diferentes.

### B2. O site gerado abre em aba nova, sem CSP — ACHADO, espera decisão

Risco médio, e **não confirmado com dado real**.

`routes/site.ts` serve o site gerado como `text/html` na origem do app, sem CSP. O front o abre como documento de PRIMEIRO NÍVEL, não em iframe: `MeusProjetos.tsx:174` faz `window.open(siteUrl(...), '_blank', 'noopener')` e `PendenciasDeSites.tsx:224` é um `<a target="_blank">`.

Sites gerados compõem peças extraídas de terceiros. Se script de terceiro viaja para dentro do bundle (o `CLAUDE.md` diz que o `runtime-local.ts` decide isso por script), o mesmo problema do B1 vale aqui.

**Por que não corrigi:** as pastas `projects/*/generated/*` desta máquina estão VAZIAS, então não deu para confirmar se os sites gerados carregam script. E a correção não é a mesma do B1: `sandbox` daria origem opaca ao site, o cookie do portão não acompanharia os arquivos dele, e a prévia chegaria sem CSS. É exatamente o problema que o `routes/preview.ts` descreve por extenso e resolveu abandonando a origem opaca.

**A correção provável** é uma CSP no formato do `CSP_PREVIA` (fechar `connect-src`, `base-uri`, `object-src`), e não `sandbox`. Só que `form-action 'none'` quebraria um site gerado com formulário de contato, que é caso de uso real. Isso é decisão de produto, não de segurança, e é sua.

### B3. O `allow-same-origin` da prévia dá acesso ao `parent` — ACHADO, espera decisão

Risco médio a alto, dependendo do que você extrai. **Lido, não executado: não montei prova de conceito.**

Quatro elos, todos confirmados no código:

1. `PreviewFrame.tsx:180` usa `sandbox="allow-scripts allow-same-origin"`.
2. O documento da prévia é servido na MESMA origem do app (`routes/preview.ts` diz por extenso que isso é obrigatório desde que o portão passou a exigir credencial).
3. O script do site extraído RODA ali por desenho ("o Tailwind CDN compila, o Lucide desenha os ícones").
4. A página do app não tem `script-src` nenhum.

`allow-scripts` junto com `allow-same-origin` é a combinação em que o sandbox deixa de isolar: o documento fica de mesma origem que o pai e alcança `parent.document`. O `CSP_PREVIA` protege o DOCUMENTO da prévia (`connect-src` fechado, e é uma boa defesa), mas não protege o que ele faz com o PAI: código injetado no pai roda sob a CSP do pai, que não existe.

**Por que não mexi:** a origem compartilhada é uma escolha declarada e justificada no arquivo. Tirar o `allow-same-origin` reintroduziria o problema que ela resolve (prévia sem CSS). As saídas reais são servir prévia de outra origem com token no lugar do cookie, ou pôr `script-src` na página do app. As duas são mudanças de arquitetura, e quem decide é você.

### B4. O front está limpo

Varredura completa de `apps/web`: **zero** `dangerouslySetInnerHTML`, `innerHTML`, `eval`, `new Function`, `document.write` ou `srcDoc` montado com dado. O único `href` que recebe valor de fora é o do portal (`CriativosShell.tsx:90`), e ele vem de `/api/enderecos`, que já valida o formato do endereço. O escape do React cobre o resto.

### B5. Observação menor

`routes/site.ts` usa `mimeDoBundle` para servir extensão desconhecida "com cara de JS" como script. É deliberado (capturas antigas com `.17`), mas é farejamento de conteúdo numa rota que serve arquivo de terceiro. Vale um olhar quando o B2 for decidido.

---

## 4. O que ainda NÃO foi olhado

Para ninguém confundir "não achei" com "não olhei":

- O `routes/preview.ts` inteiro (1327 linhas). Li a CSP e o desenho de origem; não li as 1100 linhas de montagem de HTML, que incluem `innerHTML` dentro do documento de prévia.
- O `packages/engine-v2` e o `packages/explorer`, que também abrem URL de fora. O guarda do A1 existe e é importável, mas só o `fetch-url.ts` foi ligado nele: é o único que a rota `POST /api/design-systems` alcança.
- O app de lojas Shopify (`orbis-lojas-shopify`), que é deploy separado.
- A frente Criativos por dentro (só li a defesa de `sandbox` dela).

---

## 5. O que foi medido

| | |
|---|---|
| Testes novos | 44 (16 no guarda de destino, 12 no de origem, 7 no de caminho, 6 no vault, 3 no resto) |
| Suíte na branch de segurança | 1836 testes, 1834 passando, 1 pulado |
| Suíte com as duas branches JUNTAS | 1994 testes, 1992 passando |
| `pnpm typecheck` | 13 pacotes sozinha, 14 juntas |
| `pnpm lint` | limpo (548 arquivos sozinha, 597 juntas) |
| Única falha | `acervo-regressao`, fase 3: 7,1% de bytes duplicados contra meta de 5% |
| A falha é minha? | **Não.** Rodada com as mudanças guardadas no stash, falha idêntica. Mede o acervo em `~/design-system-ecosystem`, não o código. |

---

## 6. Como juntar

Duas branches prontas:

- **`seguranca-dast`** — só segurança, sai de `main`, três commits.
- **`seguranca-com-criativa`** — as duas já juntas, com o conflito resolvido e a suíte rodada em cima do resultado combinado.

O merge de `seguranca-dast` em `orbis-criativa` tem **um** conflito, e ele é de três linhas: a linha de import do `origem-permitida` ficou colada no bloco de import do `portao`, que a outra branch reescreveu. O git trata linhas adjacentes como um trecho só. As duas mudanças não se contradizem; a resolução é manter as duas, a minha em cima e o bloco dela embaixo.

`.env.example`, `vault.ts` e `packages/shared/package.json` juntam sozinhos.

Depois do merge, o worktree não serve mais para nada:

```
git worktree remove ..\orbis-suite-seguranca
```

---

## 7. O que muda para quem usa o app

**Nada, na tela.** Nenhuma correção mexe em layout, fluxo ou botão.

Duas mudanças de comportamento, as duas deliberadas:

1. Extrair um endereço que aponte para a própria máquina ou para a rede interna passa a ser recusado com explicação. Quem precisar liga `ORBIS_PERMITIR_REDE_INTERNA=1`.
2. Abrir `/vault/<ds>/design-system.html` direto numa aba passa a mostrar a página sem executar os scripts dela. Nada no app usa esse endereço; a Galeria continua usando a prévia, que não mudou.

E o que passa a ser impossível: ler arquivo do disco pelo campo de extrair, usar o app como binóculo para a rede de dentro, derrubar a suíte por um formulário de outro site, receber o caminho da máquina numa mensagem de erro, pôr o portão num iframe alheio, e rodar script de site extraído com a sessão de quem entrou.

---

## 8. O que continua sendo o maior risco, e não é nenhum destes

O perímetro do app é **uma senha só**, compartilhada, na frente de um túnel público. Quem tiver ela entra em tudo. Estas oito correções reduzem o estrago de quem entrou; nenhuma delas muda o fato de que existe uma chave só e ela circula.

Na prática, **manter o túnel desligado quando não está em uso** protege mais do que qualquer linha deste plano.
---

## 9. A terceira passada, e um erro meu que ela corrigiu

*Escrita depois de ler o `docs/MIGRACAO.md`, que muda o peso de várias coisas.*

### C1. O guarda de SSRF não cobria o caminho PRINCIPAL — CORRIGIDO

**Este é um erro meu, e vale registrar como erro.**

Na primeira passada eu liguei o guarda de destino no `packages/extractor/src/fetch-url.ts` e disse que o A1 estava fechado. Estava fechado no modo `api`.

Só que o padrão do app é o modo `queue`, e ali o `pnpm extrair` **não passa pelo `@ds/extractor`**. Ele entra por `renderPage` e `explorePage` do `@ds/explorer`, e por `capturarComV2` do `@ds/engine-v2`. Nenhum dos três tinha guarda. Ou seja: eu tranquei a porta lateral e anunciei a casa fechada.

O que passava, na prática: `file:///C:/Users/arthur.maia/.aws/credentials` digitado no campo de extrair virava um job, e o `pnpm extrair` abria o arquivo num navegador de verdade.

**O que ficou:** `exigirDestinoPermitido` na primeira linha de `explorePage`, `renderPage` e `capturarComV2`. No `capturarComV2` a conferência fica antes da tentativa E antes da retentativa, porque a segunda volta com a mesma URL e um guarda que só roda na primeira não é guarda.

**Por que isso é permanente e não transitório:** pelo item 7.1 do `MIGRACAO.md`, a extração NUNCA sai da máquina do dono, nem na versão 3. Este é o caminho definitivo.

**O que os testes precisaram declarar:** os testes de navegador capturam de `localhost`, que o guarda recusa. A permissão foi para dentro do `iniciarServidorFixture` e das três fixtures inline, com o mesmo raciocínio: subir uma fixture É a declaração de que o alvo é meu, e ela vale exatamente enquanto o servidor existe. Não virou variável de ambiente do `pnpm test`, senão quem não sobe fixture ganharia a permissão de brinde.

**O que NÃO foi feito, e por quê:** o `@ds/explorer` observa a rede de forma passiva de propósito (`capturarRede` usa `page.on('response')`, e o comentário no código diz "Passivo — não pede nada"). Interceptar pedido a pedido ali, como fiz no `fetch-url.ts`, mudaria o comportamento do motor de captura. O `MIGRACAO.md` 6 diz por extenso para não reescrever esse motor por conveniência, e concordo. Então **redirecionamento e subrecurso continuam sem conferência no caminho do explorer** — o que está fechado é o destino de ENTRADA, que é onde mora o `file://`.

### C2. A CSP do site gerado, na parte que não depende de decisão — CORRIGIDO PELA METADE, de propósito

O B2 ficou parado esperando decisão de produto. Fiz a metade que não precisa dela:

- entra `object-src 'none'` e `base-uri 'none'`, que não quebram site nenhum;
- entra `nosniff`;
- **não** entram `connect-src` nem `form-action`, que fechariam mais e quebrariam um site de cliente com formulário de contato.

O teste fixa as duas coisas: o que a CSP fecha **e** o que ela deixa aberto. Um teste que só olhasse o lado fechado deixaria a próxima pessoa "consertar" a ausência sem saber que ela foi escolhida.

`sandbox` continua não servindo aqui, e o motivo é o mesmo que o `routes/preview.ts` já escreveu: origem opaca faz o documento pedir os próprios arquivos como se fosse outro site, o cookie não vai junto, e o site chega sem CSS.

### C3. O que o `MIGRACAO.md` muda na leitura de tudo isto

Ler o plano mudou o peso de três coisas:

1. **A senha única já é a Fase 1 do teu plano.** Eu vinha repetindo que ela é o maior risco; ela já está resolvida no papel, com Supabase Auth substituindo o portão. Não é notícia, é confirmação.
2. **O item 7.5 do teu plano é o B1 e o B2 vistos de outro ângulo.** Ele diz: "o acervo é feito de capturas completas de sites de outras empresas; num endereço aberto na internet é outra coisa". Exato. E acrescento o que ele não diz: publicar site gerado e captura na MESMA origem do app significa que o script de terceiro roda com a sessão de quem entrou. Na versão 2 (mostruário estático na Vercel) isso vale igual, e proteção por senha da Vercel não ajuda contra isso — ela decide quem entra, não o que roda depois.
3. **A Fase 5 é onde o A2 acorda.** Acrescentei uma seção ao `docs/MIGRAR-PARA-API.md` explicando o que muda de risco ao virar a chave, e uma linha no checklist dele. É o único lugar onde alguém vai olhar na hora certa.

### C4. O que sugiro para a Fase 0

O teu `MIGRACAO.md` abre com "Fase 0 — não migrar em cima de defeito". Se essa lista for real, estes são os candidatos que esta passada deixou:

- **Decidir o B2** (o que um site gerado tem direito de fazer: falar com a rede? enviar formulário?). Sem essa resposta a CSP dele fica pela metade para sempre.
- **Decidir o B3** (a prévia continua na mesma origem?). A resposta muda com a Fase 1: com Supabase Auth e token no lugar de cookie compartilhado, servir prévia de outra origem deixa de ser o problema que é hoje.
- **Ler o `preview.ts` inteiro** antes de publicar qualquer coisa. São 1327 linhas, é a peça que monta HTML de terceiro, e ninguém a leu por inteiro com olho de segurança — nem eu.
