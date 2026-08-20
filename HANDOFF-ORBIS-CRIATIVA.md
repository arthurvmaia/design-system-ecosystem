# ORBIS CRIATIVA — retomada, 2026-08-20

Ponto de partida de quem continuar a frente **Orbis Criativa**. O `HANDOFF.md`
descreve o produto; este descreve **o que foi construído, o que foi medido e o
que falta**.

Estado: branch **`orbis-criativa`**, 26 commits a partir de `275931b`, árvore
limpa. Suíte com **uma** falha, pré-existente e sem relação com este trabalho
(`scripts/acervo-regressao.test.ts`, 7,1% de bytes duplicados no acervo local).

---

## 1. A PRÓXIMA COISA A FAZER

**Os dois conceitos de banner têm o mesmo layout.** O dono viu e reclamou duas
vezes: primeiro "estão todas com a mesma ideia de arte" (isso era o prompt, e
foi consertado — cada arte tem briefing próprio agora), e depois **"você fez 1
estilo de banner só para os dois"** — e essa segunda é do MOTOR, não do prompt.

`comporPeca` (`packages/creative-engine/src/compor.ts`) tem **um layout só**:
foto em cima, faixa sólida embaixo com logo, headline e botão. Dois "conceitos"
saem com a mesma composição e fotos diferentes, e num brandbook a página de
conceito existe justamente para mostrar abordagens DIFERENTES.

O que falta é o compositor aceitar mais de um arranjo — por exemplo:

- **faixa embaixo** (o que existe hoje);
- **texto sobre a imagem**, alinhado ao terço vazio, sem faixa;
- **tela dividida**: metade cor sólida com o texto, metade foto;
- **imagem cheia com véu**, texto centralizado.

Cada um é geometria, então nenhum custa crédito: os banners atuais podem ser
recompostos de graça a partir dos pixels já pagos. E cada um precisa entrar na
régua do mesmo jeito que o de hoje — C2 mede se o texto cabe no quadro, e um
layout novo é uma nova chance de o texto não caber.

**Cuidado com a armadilha já vivida:** não medir "layouts diferentes" por
distância de pixel. Foi tentado com as artes e **não funciona** (ver §4). O que
separa é a PROCEDÊNCIA: cada conceito declara qual arranjo usou, e dois
conceitos com o mesmo arranjo reprovam.

---

## 2. O que existe hoje, e funciona

### Comandos

```powershell
pnpm criativo:precos                              # catálogo + tabela de preço medida
pnpm criativo:compor <job> <n> [--fundo <arq>]    # compõe, mede no navegador, roda C1..C11
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

### As peças de código

- **`packages/creative-engine`** (`@ds/creative`) — o motor. Catálogo, preço
  datado, razão, composição em DOM, fonte embutida com cache, recorte das
  versões da logo, favicon/`.ico`, e a apresentação.
- **`packages/shared/src/regras-de-aceite-criativo.ts`** — **C1..C11**.
- **`packages/shared/src/regras-de-aceite-marca.ts`** — **M1..M9**.
- **`packages/shared/src/schemas/marca.ts`** — contrato, estágios pagos e o
  portão da entrega da marca.
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

**Armadilhas de linguagem que custaram tempo:**

- Dentro de um template literal, `\d` **não é escape**: o JS descarta a barra e
  entrega a letra. A regex de cor virava `/d+/`. Use `[0-9]`.
- Uma crase dentro de um comentário de CSS **fecha o template literal**.
- O esbuild embrulha funções em `__name(fn, "nome")`, e isso viaja na
  serialização para dentro da página. Declare `__name` antes do `evaluate`.
- Passar `() => f()` para `page.evaluate` carrega a referência ao MÓDULO, que
  não existe na página. Passe a função inteira.
- `superRefine` embrulha o schema num `ZodEffects`, que não tem `.shape`.

---

## 5. O que FALTA

### Trabalho

1. **Os layouts de banner** — §1. É a próxima coisa.
2. **O SVG do símbolo** — 150 créditos, declarado como pendência na última
   página do PDF. Sem ele não há fachada nem veículo.
3. **A tela nunca foi conferida com o olho.** Ela compila, tem 6 testes de rota
   e o build passa, mas o portão pede a credencial do dono e ela não foi usada.
   Rode `pnpm dev` e abra `/criativos/marca`.
4. **O fluxo nunca rodou pela TELA.** Todos os jobs desta sessão nasceram de
   script. Criar uma marca pelo formulário e processá-la pelo `PROCESSAR.bat` é
   a prova que falta.
5. **89 erros de tipo em `scripts/`**, pré-existentes. `pnpm typecheck:scripts`
   existe e NÃO entra no `verificar` até essa limpeza. Os arquivos de criativo e
   de marca estão limpos.

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
