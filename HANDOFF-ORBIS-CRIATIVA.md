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

**A comparação de pixel não chega até a curadoria, e isso promove peça ruim em
silêncio.**

Em `curadoria-escolha.ts`, `comparacaoVisualOk === false` é condição de REPROVA
— *"o bundle não bate com o que a captura viu"*. Mas `curar-biblioteca` lia esse
campo de `insight.comparacaoVisual`, que o `SegmentInsight` não declara e o
manifesto não grava: ele era `null` desde sempre, e **a reprovação nunca
disparou**. Peça cujo bundle diverge da captura entra na Biblioteca sem que nada
acuse.

Hoje o `null` é EXPLÍCITO, com o buraco escrito no lugar — "não medido" é
verdadeiro, e o de antes não era. O que falta é o caminho:

- o dado existe em disco (`lerComparacoesV2(id)`);
- quem associa comparação a segmento é `associarConferencias`, uma função
  **privada** da rota de design systems, e a associação é heurística (casa por
  print da dobra e por posição);
- trazê-la para a curadoria quer dizer extraí-la para um pacote compartilhado,
  com teste.

É a mesma forma de todos os achados desta frente: a régua tinha a pergunta certa
e não tinha a resposta, e ninguém via porque `null` não reclama.

### Depois dela

- **As quatro decisões do dono** que continuam abertas, na §5.
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
pnpm marca:espelhar [--seco]                      # sincroniza o recorte na frente de Lojas
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

## 5. O que FALTA

### Trabalho

A lista inteira que estava aqui foi feita. O que ficou:

1. **A comparação de pixel até a curadoria** — a §1.
2. **`problemasDaEntregaDeMarca` não confere a marca CONTRA a régua.** Ele exige
   que a folha esteja completa e sem reprovação, mas quem a escreve é o próprio
   comando que produziu a marca. Um resultado forjado à mão passaria.
3. **A frente de Lojas continua com o espelho do recorte** (`pnpm marca:espelhar`),
   e a decisão de trazê-la para o workspace segue aberta — é a quarta da lista
   abaixo.

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
pnpm marca:espelhar --seco
```

### O que NÃO fazer

- Não propor worker autônomo nem Photoshop no caminho do produto: decididos
  contra, com medição.
- Não derivar slug de modelo do rótulo. O catálogo é a fonte.
- Não gastar crédito sem teto declarado pelo dono.
- Não editar `orbis-lojas-shopify/lib/logo-derivar.ts`: é espelho. O original
  está em `packages/creative-engine/src/marca/derivar-navegador.ts`.
- Não criar segunda implementação de nada visual. O motor é um.
- Não escrever regra com número escolhido: **meça as duas classes primeiro** e
  confirme que o limiar separa. Se não separar, a regra está errada.
