# ORBIS CRIATIVA — retomada, 2026-08-20

Ponto de partida de quem continuar a frente **Orbis Criativa**. O `HANDOFF.md`
descreve o produto; este descreve **o que foi construído, o que foi medido e o
que falta**.

Estado: branch **`orbis-criativa`**, árvore limpa. `pnpm verificar` roda lint,
typecheck, **`typecheck:scripts`** e a suíte, e passa — a única falha é
pré-existente e sem relação com esta frente (`scripts/acervo-regressao.test.ts`,
7,1% de bytes duplicados no acervo local).

O job de prova (**Sorriso Vivo**) está fechado: folha **M1..M11 todas verdes**, o
portão da entrega passa, razão em **1575/1575** com zero em voo, e a pasta do
cliente no Desktop tem logo (com o vetor), favicons, quatro banners e o PDF.

---

## 1. A PRÓXIMA COISA A FAZER

**Esta frente é CRIATIVOS e MARCA.** Extração de site, Galeria, Biblioteca e
curadoria são a outra frente, e ela está pausada desde 14/08/2026. Achado que
aparecer de lá vai para a §7 e espera; não vira "a próxima coisa".

O que está aberto AQUI, em ordem:

1. **As quatro decisões do dono**, na §5 — vídeo, exposição, teto de rodada,
   Lojas no workspace.
2. **Medir o preço no transporte REST** e, com ele, ligar o razão na frente de
   Lojas. É a metade que falta do orçamento; ver §5.

O branch deixou de ser um problema: em 21/08/2026 a `orbis-criativa` foi para a
`main`, junto com os 31 commits da frente de Lojas que faltavam aqui.

### O motor criativo passou a valer nas TRÊS frentes (21/08/2026)

A regra do `CLAUDE.md` sempre disse que o motor é UM. Na prática só o recorte da
logo atravessava, e as outras duas frentes tinham cada uma o seu jeito. O que
isso custava, medido:

| Onde | O que estava errado | O certo, medido |
|---|---|---|
| Lojas | toda imagem saía por `mystic`, primeiro item de uma lista de segurança | `imagem-padrao` do catálogo (`text-to-image/nano-banana-pro-flash`) |
| Design System | a trava dizia "~1.600 por vídeo de 8s", com teste travando o número | **520** (40/s + 200 de áudio), pela tabela medida |
| Lojas | gerava sem declarar nem contar crédito | declara preset, transporte e o motivo de o número não existir |

O ESPELHO deixou de ser um arquivo e virou o NÚCLEO: recorte da logo, catálogo
de presets, tabela de preço e razão, em `orbis-lojas-shopify/lib/motor/`,
regravados por `pnpm motor:espelhar`. O núcleo só aceita código portável — nada
de `node:`, Playwright ou `@ds/*` —, e o teste recusa os três: espelhar um
arquivo que os use entrega um espelho que compila aqui e explode lá, em
produção, porque aquela frente está fora do CI.

**A lição que vale além disto:** um teste que trava número escrito à mão não
protege o número, protege o erro. O teste da trava cobrava `/1\.600/` e ficava
verde enquanto a pessoa lia um preço 3× maior antes de decidir gastar. Hoje ele
compara a frase com a MESMA conta que o motor faz.

O portão da entrega **foi consertado**: ele parou de acreditar na folha nas
perguntas que consegue medir sozinho (a medida de cada peça, contra o cabeçalho
do arquivo; e a existência da capa de cada coleção). Onde o disco responde, ele
vence a folha. O que continua fora do alcance dele — alfa, contraste, silhueta —
precisa decodificar pixel, e o pacote de contratos não abre navegador: essas
regras seguem valendo pelo que a folha diz, e a limitação está escrita em
`docs/regras-de-aceite.md` em vez de implícita.

### Um detalhe de máquina que morde

- **O turbo descarta variável de ambiente VAZIA.** `globalPassThroughEnv` agora
  lista as 23 do app e `ORBIS_LOCAL=1 pnpm dev` funciona, mas passar
  `ORBIS_SENHA=` (vazia) é inconstante: às vezes o `.env` vence e o portão sobe
  ativo. Para o portão desligado de verdade, o caminho seguro continua sendo
  subir o servidor por fora (`cd apps/server && ORBIS_LOCAL=1 ORBIS_SENHA= npx
  tsx src/index.ts`).

---

## 2. O que existe hoje, e funciona

### Comandos

```powershell
pnpm criativo:precos                              # catálogo + tabela de preço medida
pnpm criativo:compor <job> <n> [--fundo <arq>]    # compõe, mede no navegador, roda C1..C11
           [--arranjo <nome>]                     # recompõe noutro layout, de graça
pnpm criativo:razao ver|reservar|debitar|liberar  # o razão, que serve as DUAS frentes
pnpm marca:montar <job> --prompt | --simbolo <a>  # o prompt do símbolo, e a marca
pnpm marca:apresentar <job>                       # a apresentação em PDF, medida
pnpm marca:entregar <job> --para "<pasta>"        # a pasta DO CLIENTE
pnpm marca:derivar <símbolo>                      # as 3 versões, por cálculo
pnpm motor:espelhar [--seco]                      # sincroniza o NÚCLEO do motor na frente de Lojas
pnpm typecheck:scripts                            # existe, NÃO bloqueia (ver §5)
```

### O caminho de uma MARCA

```
tela /criativos/marca → POST /api/marcas (credencial 428; id = hash da chave;
       retrato gravado com `wx` ANTES da fila)
     → [pessoa abre o PROCESSAR.bat]
     → pnpm marca:montar <job> --prompt        # o prompt EXATO, do briefing
     → mcp: account_balance
     → pnpm criativo:razao reservar <job> simbolo 75
     → mcp: images_generate (preset imagem-marca) → baixa para marcas/<job>/
     → pnpm criativo:razao debitar <job> simbolo 75
     → pnpm marca:montar <job> --simbolo simbolo-original.png
     → [as artes: um briefing POR arte, nunca `count: N` num prompt só]
     → pnpm marca:apresentar <job>
     → pnpm fila:concluir <job>                 # recusa sem apresentação
     → pnpm marca:entregar <job> --para "<Desktop>"
```

### Como a ARTE de banner nasce hoje

Regra do dono: **a arte é gerada por inteiro no Magnific**. O prompt descreve a
peça completa — foto, layout, cor, chamada e botão — e o motor busca o arquivo
(`arte-completa-N.png`). O compositor continua inteiro e continua sendo o caminho
quando a arte chega crua.

Três regras que custaram esta rodada e valem para QUALQUER marca:

1. **Dois conceitos são duas PROPOSTAS VISUAIS, tiradas do briefing.** Não duas
   geometrias da mesma ideia, e não de um cardápio fixo de estilos — cardápio
   devolve as mesmas duas ideias para clínica, padaria e advogado. **M10**
   confere, lendo `artes/propostas.json`.
2. **Todo banner de site tem desktop E mobile**, e o mobile não é recorte da
   larga. **M11** recusa a entrega pela metade.
3. **O mobile aparece NA APRESENTAÇÃO**, não só na pasta: a página de conceito
   existe para o cliente ver o que vai receber.

O que se PERDE ao gerar em vez de compor, e fica declarado na página de
pendências: C2, C3, C4 e C11 medem o DOCUMENTO, e um PNG não tem documento.
A grafia é conferência de olho — acento em português é onde o modelo mais erra.

**Existe brand kit no Magnific** e ele resolveria a tipografia (`brandKitId` no
`images_generate`), mas `brand_kit_list` NÃO está exposto no MCP: o kit tem de
ser criado no app pelo dono.

### Os ARRANJOS de banner (o caminho da arte CRUA)

`comporPeca` tinha **um layout só** — foto em cima, faixa sólida embaixo — e o
dono viu: *"você fez 1 estilo de banner só para os dois"*. Hoje são quatro, e
arranjo é geometria: nenhum custa crédito, então recompor um banner já pago
noutro arranjo é de graça.

| Arranjo | O que é | Em que o texto pousa |
|---|---|---|
| `faixa-inferior` | foto cheia, faixa sólida embaixo | cor sólida |
| `tela-dividida` | parte ao meio no eixo LONGO: cor de um lado, foto do outro | cor sólida |
| `veu-cheio` | foto cheia sob véu, texto centralizado | foto + véu |
| `texto-sobre-imagem` | foto limpa, texto no terço MEDIDO | foto nua |

Três decisões valem saber:

**A escala saiu do quadro e passou a sair da CAIXA DO ARRANJO.** A coluna de uma
tela dividida é metade da largura, e a mesma headline quebra ali em quase o dobro
de linhas. Sem isso, trocar de arranjo seria trocar de chance de estourar o
quadro sem nada dizer. Medido nos quatro arranjos × quatro formatos, com o texto
no teto do schema: **C2 passa nos dezesseis** (`compor.browser.test.ts`).

**O contraste deixou de ser sempre declarado.** Ele era exato porque nós
escolhíamos as duas cores do par. Dois arranjos põem o texto sobre a foto, e ali
o mesmo número continuaria saindo bonito e deixaria de descrever a peça — o
defeito do `opacity:.85`, de novo. Então o arranjo declara em que o texto pousa:
cor sólida usa o par declarado; sobre foto, o pixel é AMOSTRADO no pior caso sob
a caixa do texto. Efeito colateral bom: o logotipo sobre foto deixou de ficar
com C3 eternamente pendente, porque agora existe um fundo medido atrás dele.

**O alfa do véu é DERIVADO, não escolhido.** É o menor que faz o pior pixel
possível (branco puro para tinta clara, preto para tinta escura) ainda vencer o
piso de 3:1. Como luminância e composição são monótonas, conferir o extremo do
cubo cobre TODA foto. Medido: 0,56 para `#1E2F4F`, 0,66 para `#0050c4`, 0,40 para
branco — a faixa onde um véu editorial vive. A conta não foi calibrada para dar
isso; deu.

**A disposição da faixa também é derivada.** Num banner 3× mais largo que alto,
empilhar marca, headline e botão gasta altura que a peça não tem; em linha, os
três dividem a largura que sobra de graça. Vence a que preserva mais o corpo da
letra e, no empate, a que gasta menos altura — e é o segundo critério que faz o
trabalho, porque as duas cabem com o corpo ideal e o fator empata. Medido: a
faixa foi de 52% para 40% da peça.

**C12 mede o que sobrou da FOTO**, e essa regra nasceu de uma peça que passou em
onze e o dono reprovou de olho. Piso de metade, porque uma peça em que a foto é
a menor parte é um painel de texto com uma tira de imagem em cima. Medido antes
de o número existir: 48% na reprovada, 56/60/100/100 nas outras.

Na apresentação, cada conceito é composto, MEDIDO pela régua da peça e só então
vira conceito — se reprovar, o comando tenta o arranjo seguinte, porque recompor
não gasta nada. Dois conceitos não podem sair no mesmo arranjo, e **M10** confere
isso no registro (`artes/arranjos.json`), não no pixel.

Para recompor uma peça da frente Criativos noutro arranjo, sem pagar de novo:

```powershell
pnpm criativo:compor <job> <n> --fundo <o mesmo arquivo> --arranjo veu-cheio
```

### As peças de código

- **`packages/creative-engine`** (`@ds/creative`) — o motor. Catálogo, preço
  datado, razão, composição em DOM, fonte embutida com cache, recorte das
  versões da logo, favicon/`.ico`, e a apresentação.
- **`packages/shared/src/regras-de-aceite-criativo.ts`** — **C1..C12**.
- **`packages/shared/src/regras-de-aceite-marca.ts`** — **M1..M10**.
- **`packages/shared/src/schemas/marca.ts`** — contrato, estágios pagos e o
  portão da entrega da marca.
- **`packages/shared/src/schemas/arranjo-da-peca.ts`** — os quatro arranjos e, em
  cada um, o SUBSTRATO em que o texto pousa. É esse campo que decide se o
  contraste é declarado ou amostrado.
- **`apps/server/src/routes/marcas.ts`** — o POST, a listagem e o custo.
- **`apps/web/src/routes/CriativosMarca.tsx`** — a tela.

---

## 3. O que foi PROVADO com dinheiro real

Uma marca inteira, do briefing ao PDF: **Sorriso Vivo**, em
`~/design-system-ecosystem/marcas/job_01MARCAPROVA0000000000001/`, entregue em
`~/Desktop/Sorriso Vivo/`.

| Etapa | Créditos |
|---|---|
| Símbolo | 75 |
| Direção de imagem (3, descartadas) | 225 |
| Conceitos de banner (2, descartados) | 150 |
| Direção refeita, um briefing por arte | 225 |
| Banners refeitos | 150 |
| **Marca** | **825** de 825 |
| Criativos de tráfego (2 fundos) | 150 |
| **Sessão** | **975** |

Saldo ao fim: **~11.000**. O handoff anterior dizia 20.635 — estava velho.

Os 375 de retrabalho foram **erro de prompt**, e estão no razão com esse nome
(`direcao-refeita`, `banner-refeito`), não escondidos numa linha só.

---

## 4. As lições que custaram caro

**A régua tem de medir o PIXEL, não o documento.** Medido: num `banner-3x1` com
headline de 176 caracteres, a marca terminava 601px acima do topo do quadro e as
dez regras ficavam VERDES. `innerText` responde sobre o documento.

**Uma regra que não separa as classes não é uma regra.** M9 nasceu medindo
distância visual entre artes, com piso 0,08 — número escolhido, não medido.
Medido depois:

```
0,225  0,207  0,188  0,129   pares que são A MESMA ideia
0,174  0,259                 pares que são ideias DIFERENTES
```

As faixas **se cruzam**. A regra saiu e virou procedência (qual briefing gerou
cada arte), que é exata.

**`count: N` num prompt só devolve N variações de UMA ideia.** Foi a causa das
artes repetidas. Cada arte precisa do próprio briefing.

**Medir a BANDA não é medir o BLOCO.** A escolha do terço em
`texto-sobre-imagem` nasceu medindo qual terço do quadro carregava melhor a
tinta. Ela mentia por construção: a banda é 33% da largura e o bloco de texto é
42%, então o bloco alinhado ao terço bom sempre invade o vizinho. Medido no caso
extremo — dois terços estourados e um escuro —, a banda escolhida dava **1,13:1**
no pixel que o texto realmente pegava. Hoje o compositor põe o bloco nas três
posições e mede o que o TEXTO pega em cada uma. Três passadas de layout, todas de
graça, e a única pergunta que corresponde à peça.

**Onze regras verdes não são uma peça boa.** O banner recomposto passou em C1 a
C11 — dimensão exata, texto dentro do quadro, marca presente, contraste acima do
piso, tipografia da marca — e o dono olhou e disse que estava péssimo. Nenhuma
das onze perguntava a PROPORÇÃO: a faixa tinha 52% da peça e a foto 48%. Quando
uma régua completa aprova o que o olho reprova, o buraco não está no veredito,
está na lista de perguntas.

**A trava tem de ficar onde a medição não alcança.** A primeira tentativa de
consertar aquilo foi capar a faixa em 50% da altura. Medido: sozinho, não mudou
nada — a estimativa já cabia no orçamento menor, e quem consertou foi a
disposição em linha (52% → 40%). Aplicado de verdade, quebrou C2 no teto do
schema: uma headline de 200 caracteres não entra numa faixa capada nem no menor
corpo de letra, e texto fora do quadro é falha pior que faixa gorda. A trava
saiu; quem cobra a proporção é C12, que mede.

**Armadilhas de linguagem que custaram tempo:**

- Dentro de um template literal, `\d` **não é escape**: o JS descarta a barra e
  entrega a letra. A regex de cor virava `/d+/`. Use `[0-9]`. Ela mordeu de novo
  num `\(` de teste, que virou `(` e passou a casar qualquer caractere: dentro de
  template literal, prefira `includes` a montar regex.
- Uma crase dentro de um comentário de CSS **fecha o template literal**.
- O esbuild embrulha funções em `__name(fn, "nome")`, e isso viaja na
  serialização para dentro da página. Declare `__name` antes do `evaluate`.
- Passar `() => f()` para `page.evaluate` carrega a referência ao MÓDULO, que
  não existe na página. Passe a função inteira.
- `superRefine` embrulha o schema num `ZodEffects`, que não tem `.shape`.

---

### O que não está no schema não existe depois do primeiro parse

`ResultadoDeMarca` não declarava `colecoes`. Zod descarta chave não declarada,
então a decisão gravada por um comando evaporava no comando seguinte que lesse e
regravasse o arquivo. O spread de `...lido.data` estava correto; o filtro era o
`parse`.

Custou uma entrega inteira sair errada sem nenhum aviso: as quatro capas em
disco, a decisão apagada, e `marca:entregar` montando vinte arquivos sem a pasta
`Colecoes/`. **Campo novo em arquivo persistido é entrada nova no schema**, e a
prova de que sobreviveu é gravar, rodar o comando que regrava, e ler de novo.

M12 é a régua que passou a cobrar isso.

---

## 5. O que FALTA

### Trabalho

A lista inteira que estava aqui foi feita. O que ficou:

1. **LIGAR O RAZÃO na frente de Lojas.** O preço do REST foi MEDIDO em
   21/08/2026 e a linha está na tabela; o que falta é contar o gasto.

   ### O que a medição custou e o que ela devolveu

   Teto declarado pelo dono: **250 créditos**. Gasto: **225**. Saldo 4.210 →
   3.985, lido no `account_balance` antes e depois de cada geração, pelo
   caminho REAL da loja (`pedirGeracao` de `lib/magnific.ts`) e não por uma
   reimplementação.

   | Resolução | Saldo | Custo |
   |---|---|---|
   | 2k | 4210 → 4135 | **75** |
   | 4k | 4135 → 3985 | **150** |

   Deu o MESMO que o MCP. Isso é um resultado, não a confirmação do óbvio:
   enquanto ninguém tinha medido, escrever 75 ali teria sido adivinhação que por
   acaso acertou — e a diferença aparece no dia em que o provedor mudar o preço
   de um transporte e não do outro. O `1k` continua recusando no REST, porque
   ninguém gerou 1k por lá.

   ### Três achados que mudam o caminho de quem continuar

   **A chave EXISTE e está configurada.** Ela mora em
   `orbis-lojas-shopify/.dev.vars` (que está no `.gitignore`), e foi conferida
   com controle: chave inventada devolve `401 "The provided API key is
   invalid"`, a do arquivo devolve `403 "User does not belong to any team"` —
   classes diferentes, a segunda autenticou. O sufixo mostrado no painel da
   Magnific **não bate** com o da chave que funciona; quem decide é a resposta
   do servidor, não a máscara.

   **O REST não sabe dizer quanto gastou, nesta conta.** O único endpoint de
   consumo é `POST /v1/analytics/team-credit-usage`, e ele responde 403 porque é
   de TIME e esta conta não está em nenhum. Isso desfaz a saída que parecia
   óbvia: "liga o razão lendo o consumo pelo REST" não funciona aqui. O
   antes-e-depois sai do `account_balance` do MCP.

   **Quatro pendências eram uma.** `imagem-marca`, `imagem-rascunho` e
   `video-curto` não têm identificador REST — não existe chamada a fazer, então
   medi-los é impossível, não caro. `pendenciasDePreco()` separa as duas
   classes, e o `pnpm criativo:precos` imprime as duas listas.

   ### O que sobra, e é decisão sua

   Persistir o razão na frente de Lojas pede uma tabela em D1 — schema de um app
   publicado com deploy próprio. O razão já está espelhado em
   `lib/motor/razao.ts`, então é ligar, não construir. Hoje a rota DECLARA o
   custo (agora com número real) e não o conta.

2. **A frente de Lojas continua com o espelho, agora do NÚCLEO inteiro**
   (`pnpm motor:espelhar`): recorte da logo, catálogo de presets, tabela de
   preço e razão. A decisão de trazê-la para o workspace segue aberta — é a
   quarta da lista abaixo. Os quatro espelhos estão **em dia** (21/08/2026).

A comparação de pixel que estava nesta lista era da frente PAUSADA. Mudou para a
§7, com o que foi medido e o que sobrou para decidir.

### O prompt que manda RETRATAR a categoria, provado com 75 créditos

A capa de **Estética** do Sorriso Vivo voltou uma pessoa sentada a uma mesa, sem
nenhuma pista de odontologia. As outras três acertaram — e acertaram pela
palavra, não pelo prompt: "Odontopediatria" já sugere a criança na cadeira,
"Estética" sozinha sugere uma pessoa bonita.

O prompt dizia `for the "X" category cover`, que é metadado. Em lugar nenhum o
modelo era mandado RETRATAR a categoria. A frase nova exige que a atividade, a
ferramenta ou o resultado esteja no quadro, e recusa retrato genérico.

Refeita com o prompt corrigido, a mesma categoria voltou moldeira de clareamento
e seringa de gel sobre a bandeja, com a cadeira azul ao fundo. Uma geração, 75
créditos, saldo conferido antes e depois (6585 → 6510).

**O que ficou para o olho do dono:** as outras três capas têm gente e esta é um
still de objeto. A luz, o azul e o consultório são os mesmos, então elas leem
como conjunto — mas é a única sem pessoa, e trocar isso custa 75.

A régua da marca **deixou de valer pela palavra do produtor**. O portão refaz o
que dá sem navegador (medida do arquivo, existência das capas) e o
`fila:concluir` abre o navegador e refaz o resto (M1..M6): alfa, silhueta e
contraste passaram a ser medidos por quem não produziu a marca. Só a divergência
acusa — refeita reprova e folha diz `passou` —, e sem navegador a conferência é
pulada dizendo que foi pulada.

### O job `navegador` do CI, adiado de propósito (21/08/2026)

O dono viu e disse "resolva isso depois". Fica escrito para não se perder.

O job `navegador (chromium)` foi CANCELADO em 25m17s — ele bate no
`timeout-minutes: 25` declarado no `ci.yml`. Antes de estourar, um teste
reprovou:

```
✓ auto-validação real: fixture → segmenter → validarPreviews → …   4,3 s
✓ validador: valida scroll real e grava o resultado (navegador)    3,4 s
✗ Biblioteca: componente com CSS externo funciona após apagar a extração   1,6 s
Error: The operation was canceled.
```

O teste mora em `apps/server/src/routes/library.assets.browser.test.ts:60`. Ele
**não foi tocado** por nenhum commit desta rodada — nem ele, nem
`routes/library.ts`. Não é regressão desta frente, e é da frente PAUSADA
(Biblioteca/extração).

O job **não bloqueia** (`continue-on-error: true`), por decisão registrada no
próprio `ci.yml`: são testes com orçamento de tempo fixo, e um runner de 4 vCPU
tende a estourá-los. A condição escrita lá para ele virar bloqueante é "duas
semanas de verde, e só depois de afrouxar as asserções sensíveis à velocidade da
máquina" — e ela continua não cumprida.

Duas coisas a separar quando alguém pegar isto, porque o log as mistura: o teste
que REPROVOU (1,6 s, não é tempo de parede) e o job que ESTOUROU o teto (25 min).
São causas diferentes, e consertar uma não conserta a outra.

### O estado da verificação, medido em 21/08/2026

```
pnpm lint          limpo
pnpm typecheck     limpo
pnpm test          2015 passam, 1 falha
pnpm medir-fidelidade --falhar-se-piorar   passa (849 bundles, 57 sites)
pnpm audit         nenhuma vulnerabilidade conhecida (eram 11, sendo 3 altas)
pnpm motor:espelhar --seco                 os 4 espelhos em dia
```

A falha única é `acervo-regressao`: 7,1% de bytes duplicados entre segmentos de
UM site capturado, meta 5%. Ela lê só o `vault/`, é da frente pausada e é
anterior a este trabalho.

### Decisões do dono

1. **Vídeo:** manter a venda fechada no POST (feito) ou construir a rota?
2. **Exposição:** o app vai ser alcançado por túnel ou por mais de uma pessoa?
   Se sim, sobem para bloqueante: exigir `Origin` em todo não-GET, credencial de
   ação no rascunho, e contador no 428.
3. **Teto de rodada:** `ORBIS_CRIATIVO_TETO_LOTE` passa a ser perguntado no
   `selecionar.ts` quando a rodada tem job que gasta?
4. **A frente de Lojas entra no workspace pnpm?** Hoje é projeto separado com
   `package-lock.json` e deploy próprios, então o recorte da logo vive lá como
   ESPELHO verificado por teste. Entrando no workspace, o espelho vira `import`.

---

## 6. Como continuar

```powershell
pnpm verificar          # lint + typecheck + suíte + portão de fidelidade
pnpm test:navegador     # os testes que medem PIXEL (precisa do playwright)
pnpm criativo:precos    # a tabela de preço vence em 14/11
pnpm motor:espelhar --seco
```

### O que NÃO fazer

- Não propor worker autônomo nem Photoshop no caminho do produto: decididos
  contra, com medição.
- Não derivar slug de modelo do rótulo. O catálogo é a fonte.
- Não gastar crédito sem teto declarado pelo dono.
- Não editar nada em `orbis-lojas-shopify/lib/motor/` nem
  `lib/logo-derivar.ts`: são ESPELHOS, e cada um nomeia o original no próprio
  cabeçalho. Edite o original e rode `pnpm motor:espelhar`.
- Não pôr no núcleo espelhado código que puxe `node:`, Playwright ou `@ds/*`:
  nada disso existe no workerd da Cloudflare, e o espelho compilaria aqui para
  explodir lá — em produção, porque aquela frente está fora do CI.
- Não criar segunda implementação de nada visual. O motor é um.
- Não escrever regra com número escolhido: **meça as duas classes primeiro** e
  confirme que o limiar separa. Se não separar, a regra está errada.

---

## 7. Um achado da frente PAUSADA (não é desta frente)

> A frente de extrair site e curar componentes está **pausada desde 14/08/2026**:
> o dono parou porque sites e componentes não saíam bons e a arquitetura vai ser
> repensada. O que segue foi medido e consertado por engano, seguindo um ponteiro
> que este handoff tinha no lugar errado. Fica registrado para quando aquela
> frente voltar; **não puxe daqui enquanto ela estiver parada**.

**Decidir se `pnpm reextrair --todos` passa a conferir o pixel por padrão — e,
se sim, reextrair o acervo.**

A §1 anterior dizia que a comparação de pixel "não chegava até a curadoria" e
que o conserto era extrair `associarConferencias` para um pacote compartilhado.
A extração foi feita (mora em `@ds/shared`, e a curadoria agora a lê), e ela
**não mudou um número**: 1396 peças, 151 reprovadas, antes e depois.

Número parado é sinal. Medindo o acervo em disco:

```
57 de 57 manifestos com `visualComparisons: []`
57 de 57 sem a fase `v2-comparar` na telemetria
57 de 57 sem UMA linha dizendo por quê
```

A comparação nunca rodou. Não é a associação que faltava — é o dado.

**A causa** está em `scripts/reextrair.ts`: em lote, a verificação visual nasce
DESLIGADA (`pendentes.length === 1 || --verificar`). O acervo foi reextraído em
lote, e o único caminho que o motor decidira ser silencioso era exatamente esse
— "quem desligou sabe que desligou". Só que ninguém desligou: o padrão desligou,
e o manifesto não guardou rastro. A conta chegou na curadoria, onde
`comparacaoVisualOk === false` é condição de REPROVA e nunca disparou em peça
alguma.

**O motor funciona.** Rodado contra a fixture com `verificarVisual: true`:
`v2-comparar` na telemetria, 10 comparações gravadas, **2 de 10 reprovando com
45% de diferença**, e a limitação declarada. O que faltava era ligar.

**Já consertado:** a decisão agora DIZ que estava desligada (o silêncio era a
premissa errada); o `reextrair` avisa na tela, em lote, que não vai conferir e
como ligar; e existe um teste ponta a ponta do fio
(`comparacao-fim-a-fim.browser.test.ts`) — ele não existia, e é por isso que
ninguém via: as duas pontas eram testadas e a ligação não.

**O que sobra é a decisão do dono**, porque custa tempo dele: a conferência é 6%
do orçamento por captura, e reextrair 57 sites com `--verificar` é uma rodada
longa. Feito isso, a reprova por divergência passa a valer sobre o acervo — e
pelo que a fixture mostrou (2 em 10), ela não vai ficar quieta.
