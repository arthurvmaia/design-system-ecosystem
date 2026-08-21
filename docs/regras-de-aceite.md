# Regras de aceite

Duas conferências obrigatórias, cada uma antes de um ponto sem volta:

- **A da Galeria** roda antes de a peça entrar no acervo.
- **A do site** roda antes de o site ser entregue.

Elas não são recomendação. São a fonte da verdade dos passos que a extração e a
geração têm de cumprir, e nasceram de uma coisa só: **tudo aqui já saiu errado
uma vez, e o dono apontou**. Cada regra cita o que a produziu, porque uma regra
sem a história dela vira burocracia — e a primeira pessoa a contorná-la é quem a
escreveu.

## Como a conferência se comporta

1. Rodar a conferência.
2. O que **passa** sobe.
3. O que **falha**: estudar, tentar fazer passar. Consertar o motor é sempre
   preferível a abrir exceção.
4. O que **não tem como** passar: seguir mesmo assim, e a peça ou o site vai para
   a **tela de pendências**, com o motivo escrito. Nada é descartado em silêncio
   e nada sobe fingindo estar bom.

A diferença entre falhar e ser impossível é honesta: um `<canvas>` pintado por um
runtime que não pode ser baixado nunca vai reproduzir sozinho. Isso é pendência,
não defeito. Já uma peça que perdeu o script porque a compilação o descartou é
defeito, e defeito se conserta.

---

# Regra de aceite da GALERIA

Vale para cada peça, no momento em que ela seria salva no acervo.

> **O site de origem é a fonte da verdade da Galeria.** A peça na Galeria tem de
> ser o que aquela região é no site — não uma aproximação, não uma foto dela.
>
> — "essa daqui tá diferente da galeria, o site é a fonte da verdade para a
> galeria"

### G1. A tecnologia da origem viaja junto

Se a região usa uma tecnologia para existir — WebGL, canvas 2D, GSAP,
ScrollTrigger, Lottie, um observador de rolagem —, **essa tecnologia tem de estar
no bundle**, com o script que a inicializa.

*Por que:* "a questão de usar a mesma tecnologia é obrigatória para o componente
sair igual ao do site de extração, e isso tem que ser na extração, onde salva na
galeria." Sem o runtime, o HTML capturado é uma promessa não cumprida — e o pior
é que ela parece cumprida, porque as tags estão todas lá.

*Como se confere:* todo runtime atribuído à região tem `scripts` não vazio e
esses arquivos estão em disco no bundle. Runtime que só desenha conteúdo
(`iconify`, `tailwind-cdn`) não conta como tecnologia de movimento.

*Falhou:* um hero em WebGL ficou congelado porque o detector achava a cena pela
criação do contexto e gravava `scripts: []` — o bootstrap eram 604 bytes ao lado
do runtime de 407 KB, os dois baixados e os dois inúteis.

### G2. Movimento medido é movimento entregue

Se a captura mediu movimento **na região**, a peça tem de se mexer. Peça que se
mexia na origem e sai parada é reprovada.

*Por que:* "esse componente em si ele não é estático no site, a galeria extraiu
isso errado" e "estou achando as páginas muito estáticas".

*Como se confere:* movimento medido + representação `referencia-visual` é
reprovação, salvo quando o mecanismo for comprovadamente irreproduzível (G7).
Movimento atribuído ao FUNDO da página não conta como movimento da peça.

*Falhou:* um cartão de gráfico virou PNG porque o canvas de página inteira pintava
atrás dele e a observação foi atribuída à seção por área de tela.

### G3. Nada de estado congelado

A captura grava o DOM depois de o observador ter corrido a página. Classes de
revelação (`is-visible`, `aos-animate`, `in-view`) e `transform` de parallax não
podem chegar já aplicados quando o script que os reaplica viaja junto.

*Por que:* a página nasce pronta e nunca se mexe, e nada disso aparece como erro.

*Como se confere:* nenhuma classe de revelação presente quando há observador de
rolagem no bundle.

### G4. A peça sobrevive fora da origem

Nenhum asset apontando para o site de origem. Imagem, fonte, vídeo e script têm
de estar no bundle.

*Por que:* o bundle que aponta para fora perde o conteúdo no dia em que aquele
endereço mudar, e o cliente é quem descobre.

*Como se confere:* nenhuma referência local ausente e nenhum `http(s)://` da
origem. `data:` e `blob:` já SÃO o conteúdo e não contam como pendência.

### G5. Há componente ali

HTML com conteúdo de verdade. Recorte com menos de 200 caracteres é sobra, não
peça — com exceção de `interaction` e `cursor`, que são pequenos por natureza e
valem pelo script.

*Falhou:* seções com `htmlSnippet` vazio derrubavam a validação e o site inteiro
era recusado, perdendo junto as peças boas.

### G6. O que a peça diz que é, ela é

A classificação (categoria e `kind`) tem de bater com o conteúdo. Animação é
`animation`; comportamento de página é `interaction`; ponteiro personalizado é
`cursor`.

*Por que:* "essas animações eu quero que você separe classificando como animação"
e "cria a categoria do mouse". Sem isso a peça existe e nunca pode ser escolhida.

### G7. A pendência é declarada, nunca escondida

Peça que não passa e não tem conserto sobe assim mesmo, marcada, com o motivo em
uma frase que se entende sem abrir o código. Cena que depende de runtime remoto
proprietário é o exemplo legítimo.

### G8. O rastreamento da origem não viaja

Peça cujo script MISTURA rastreamento de terceiro com comportamento não entra na
Galeria. Rastreamento puro passa: o motor o remove sozinho na montagem, inteiro,
e nada se perde.

*Por que:* a S2 já reprovava isso, mas só na entrega do site — quando a peça já
estava no kit e a página já era do cliente. Ali sobram duas saídas ruins: tirar o
script leva o comportamento embora, mantê-lo conta o visitante do cliente na
conta de analytics de outra empresa. As duas exigem uma decisão humana, e num kit
essa decisão se repete em todo site que o usar.

*Medido:* 6 dos 290 bundles da Biblioteca vinham misturados, todos do MESMO site
de origem, e 3 deles estavam no único kit que reprovava no banco de prova —
exatamente em S2. A regra custa 2,1% do acervo, concentrado num site só.

---

# Regra de aceite do SITE GERADO

Vale para cada site, antes de ele ser entregue.

> **O kit empresta o jeito; a identidade é do cliente.** Do site de origem não
> sobrevive nada além do desenho.

### S1. A essência do componente continua

Troca-se **valor**: texto, cor, foto, vídeo, número, rótulo. Não se toca em
estrutura do HTML, hierarquia visual, layout, movimento nem espaçamento interno.

*Por que, nas palavras do dono:* "sempre que vc usar um componente vc não pode
mudar a essência do designer dele; a ideia é apenas trocar os valores e copy,
imagens e vídeos caso precise, mas a essência é para continuar."

*Falhou:* apagar `<img>` sem substituta abria buraco e desmontava a grade;
reescalar dentro de `@keyframes` achatava dois passos no mesmo degrau e parava a
animação.

### S2. Nada da origem sobrevive

Nem nome, nem texto, nem foto, nem vídeo da empresa de origem.

*Por que:* "navegador vc deixou igual ao do site que extraiu e não é essa ideia" e
"tem uma imagem nada a ver, você deveria trocar essa imagem por alguma que tenha
a ver com a marca".

*Como se confere:* nenhuma `<img>`/`<video>` ainda apontando para `assets/<cmp>/`
sem substituição; nenhum nome de marca de origem no texto. Faltando mídia, a foto
FICA e o site vai para pendências — buraco quebra a essência (S1), e o aviso diz
o que resolver.

### S3. A marca veste o site inteiro

Toda peça sai na paleta da marca. Fundo integrado, uma superfície só, de cima a
baixo.

*Por que:* "todos os componentes têm que vir na paleta de cores da marca e o
background você tem que deixar integrado, de 1 página só."

### S4. O texto se lê

Contraste mínimo de 3:1 entre texto e o fundo em que ele pousa.

*Por que:* "jogo de cores dos textos tem que ter destaque." Um título saiu a
1,34:1.

*Onde roda:* **no navegador** (`pnpm conferir`), e isso é o conserto de um
defeito da própria regra. Ela morava no aceite da MONTAGEM recebendo
`contrastesAbaixoDoPiso: 0` — a constante, cravada no código, porque medir
contraste exige layout resolvido. Passou verde em todo site gerado sem nunca ter
comparado duas cores. Regra alimentada por constante é pior que regra ausente:
ocupa o lugar da conferência e ainda dá o carimbo.

*Medido depois do conserto:* 33 trechos abaixo do piso num site, sendo vários a
**1,0:1** — o texto tinha exatamente a cor do fundo.

*Armadilha na medição:* não parseie cor com regex. O navegador devolve
`color(srgb …)` e `oklch(…)` para tudo que passou pela recoloração, e uma regex
de `rgb()` devolve nulo justamente nos trechos ilegíveis, que então são pulados.
A conversão certa é pintar num canvas de 1×1 e ler o pixel.

### S11. Todo slot de mídia foi preenchido

Nenhuma `<img>` da página fica sem carregar.

*Por que:* uma faixa de dezesseis cartões saiu com blocos de cor no lugar das
fotos. A peça pedia imagem, o projeto não tinha, e o site subiu assim. Bloco
vazio não é "quase pronto" — é a seção anunciando que não tinha o que mostrar.

*Onde roda:* no navegador. `src` presente não quer dizer imagem carregada.

### S12. Nada transborda a tela

Nenhum elemento passa da borda, em 1440 e em 390.

*Por que:* no celular uma seção saía 72px fora da tela. Não havia rolagem
horizontal — o recorte escondia —, então nada parecia errado até alguém olhar o
print. O que está fora do recorte conta; o que a origem corta de propósito, não.

*Onde roda:* no navegador, nas duas larguras. Quase todo defeito de transbordo só
existe na estreita.

### S13. Nenhum texto fica apagado

Nenhum trecho de texto na página com opacidade efetiva abaixo de 35%.

*Por que:* o hero de um site saiu ilegível com o texto na opacidade inicial da
revelação por rolagem, que nunca disparou. O dono disse "aqui eu nem consigo ler
o que tem". Não é contraste: é conteúdo que ocupa espaço e não aparece.

*Como se mede:* a opacidade MULTIPLICA pela cadeia de ancestrais — um pai a 0,05
apaga o filho a 1. Medir só o elemento não acha nada.

*Armadilha:* a primeira versão da medição PULAVA texto quase invisível, tratando
como decoração. Era exatamente o defeito, e por isso a conferência concordava com
um site que ninguém conseguia ler.

### S5. O grid é um só, e nada encosta na borda

Todas as seções no mesmo eixo. Nenhum conteúdo cortado ou colado na borda da
tela. E o oposto também reprova: nenhuma seção encaixotada numa coluna estreita.

*Por que:* "o grid do site precisa estar alinhado com o mesmo", "está muito
encostado nas bordas", "as bordas ficaram tipo cortadas" e "esse primeiro ficou
parecendo PDF e eu não quero os sites gerados assim".

*Como se confere:* a moldura vem da **geometria medida** no mapa estrutural da
captura, nunca de suposição. Peça que era sangria na origem não recebe container.

### S6. O site se mexe

Se o kit tem peça com movimento, o site entregue se mexe. Animação de CSS
rodando, revelação por rolagem funcionando.

*Por que:* "os efeitos de fade scroll, fade in, parallax, você sempre tem que
pegar se tiver na biblioteca" e "estou achando as páginas muito estáticas".

### S7. A marca aparece onde se espera

Favicon presente. Variações de logotipo no site. Título da aba com o nome da
marca **e nada mais**.

*Por que:* "você também não está colocando favicon nem todas as outras variações
do logotipo" e "no título da aba do site gerado tem que ser apenas o nome da
marca; isso pra qualquer site que gerar".

### S8. O site sobrevive sozinho

Toda referência resolve dentro da pasta do site. Apagar kit, peça ou origem não
pode quebrá-lo.

*Por que:* "os sites que já foram gerados têm que ser independentes, pois já
foram gerados e não dependem mais dos componentes."

*Exceção declarada:* endereço de fonte em CDN não quebra por apagar nada aqui,
mas depende de rede — e sai declarado, não escondido.

### S9. Nenhuma seção vazia

Seção sem peça e sem HTML criado é pendência, não entrega.

### S10. Variedade entre sites

Dois sites gerados no mesmo dia não podem sair com as mesmas peças.

*Por que:* "na geração do site expresso você está usando poucos componentes e
sempre são os mesmos."

---

## O que fazer com o que reprova

Na ordem, sempre:

1. **Consertar o motor.** Quase toda reprovação desta lista nasceu de um defeito
   real, e o conserto vale para todos os sites, não só para aquele.
2. **Se não der, declarar.** Vai para pendências com o motivo, e o dono decide se
   aceita.
3. **Nunca contornar em silêncio.** Um site que sobe com pendência escondida
   custa mais caro do que um que não sobe: o erro chega ao cliente sem ninguém ter
   escolhido isso.

### G9. O script da peça encontra o que procura

Peça cujo script busca um elemento por id literal (`getElementById('x')`,
`querySelector('#x')`) que **não existe no HTML dela** não entra na Galeria.

*Por que:* o script não quebra — ele desiste. Bate no próprio guarda
(`if (!svg) return`) e volta na primeira linha, sem erro no console. O que ele
desenharia fica congelado no estado em que a captura o pegou, e na tela isso
parece um componente estático que "veio meio errado".

*Como apareceu:* o dono reprovou uma linha do tempo que, na origem, se preenche
conforme a página rola. O compilador prefixava todos os ids internos do SVG
(para `url(#gradiente)` de dois segmentos não colidirem) sem reescrever o
JavaScript que os procura. Dos cinco ids da peça, só dois participavam da
colisão; os outros três eram os que o script buscava.

*Por que a regra continua depois do conserto:* porque conserto de motor não
alcança o que já está em disco. Depois de corrigir o compilador e recompilar, a
Biblioteca tinha as duas cópias — a antiga quebrada e a nova boa — e o montador
escolheu a antiga.

*Só o RENOMEIO, e o número que ensinou isso:* a primeira versão acusava todo id
literal ausente e reprovou **316 de 1396 peças**. O número estava errado, não o
acervo — os `assets/js` de uma captura são os scripts do site INTEIRO,
compartilhados entre segmentos. Um `interactions.js` que procura `#mobile-menu`
legitimamente não acha esse id numa peça de hero, e corretamente não faz nada.

A assinatura do defeito é outra: **o elemento está ali sob outro nome.** O HTML
tem `seg6-svg1-pipeline-svg`, o script procura `pipeline-svg`. Aí não há leitura
benigna. A regra acusa só quando existe no HTML um id terminando em
`-<procurado>` — o que pega os 4 bundles medidos no acervo e nenhum a mais.
Busca montada em tempo de execução (`'#' + nome`) fica fora: sem executar não se
sabe o alvo, e acusar no escuro reprova peça boa.

---

# Regra de aceite da PEÇA CRIATIVA

Vale para cada variação produzida na frente Criativos, no momento em que ela
seria marcada como `aprovada`.

> **A peça criativa custa dinheiro e sai da casa.** As outras duas réguas
> protegem o acervo; esta protege o cliente e a conta de quem paga. Por isso o
> `pendente` aqui quase nunca é limite técnico: é **coisa que não temos como
> medir** — e o que não se mede não pode ser chamado de aprovado.

Uma peça com pendência sai rotulada **"aprovada com ressalva"**, com a ressalva
nomeada, e a folha de conferência viaja com ela. O contrato recusa fechar um job
cuja variação está `aprovada` sem folha, ou com uma regra reprovada dentro dela:
veredito que contradiz a própria medição é pior que não medir, porque alguém
olhou, viu errado, e carimbou verde assim mesmo.

### C1. A dimensão é exatamente a do formato

*Por que:* peça fora de medida não entra no lugar. O canal corta, estica ou
recusa, e quem descobre é o cliente, depois de pagar.

*Como se confere:* largura e altura MEDIDAS no arquivo, contra
`DIMENSAO_DO_FORMATO`. A medida sai do cabeçalho do PNG, sem biblioteca.

*Falhou:* a primeira geração paga saiu 736×414 num pedido de 1080×1080 — o
provedor devolve a proporção que ele quer, não a que se pediu. É por isso que a
composição recorta para a dimensão exata em vez de confiar na saída.

### C2. O texto pedido está na peça, e dentro do quadro

*Por que:* o cliente digitou uma headline literal. Ela aparecer "parecida" é o
mesmo que não aparecer — e ela aparecer FORA do quadro também.

*Como se confere:* duas medições, porque são duas perguntas. A primeira lê o
texto renderizado e cobra a headline e o CTA literais. A segunda mede
`getBoundingClientRect()` de cada `[data-papel]` e cobra que a caixa esteja
dentro do quadro do formato, nos quatro lados. Sem a segunda medição a regra
fica **pendente**, nunca verde.

*Falhou:* medido em Chromium num `banner-3x1` com uma headline de 176
caracteres (o schema permite 200): a faixa de leitura cresceu para cima e a
linha da marca terminou **601px acima** do topo do quadro de 500px. A peça saiu
sem marca visível e a headline entrou cortada no meio — e as **dez** regras
ficaram verdes, com o rótulo "aprovada". Nenhuma delas perguntava onde o texto
estava; todas perguntavam se ele existia, e `innerText` responde sobre o
documento, não sobre o pixel.

Foi por causa desse caso que a composição passou a derivar o corpo da letra do
comprimento do texto, em vez de usar uma fração fixa da largura.

### C3. A marca está na peça, exata

*Por que:* a marca é FATO, não estilo. É o único pedaço da peça que não admite
interpretação.

*Como se confere:* depende de COMO ela assina, porque "exata" quer dizer coisas
diferentes nos dois casos.

Assinando em **texto**: a grafia é procurada no texto do papel `marca`, com a
caixa exata. Se aparece só ignorando maiúsculas, REPROVA, porque
`text-transform: uppercase` muda o que se vê sem mudar o documento: "iFood" vira
"IFOOD" na tela e continua "iFood" no DOM.

A busca é no PAPEL, e não na peça toda. Varrendo todos os textos, uma headline
que mencionasse a marca satisfazia a regra enquanto a linha da marca estava com
outra grafia, ou ausente. Sem a geometria medida não há como saber qual texto é
de qual papel, e aí a varredura larga é o que há: o veredito diz isso na frase,
em vez de afirmar mais do que mediu.

Assinando em **logotipo**: o arquivo carregou (`naturalWidth` maior que zero) e
a proporção dele na peça bate com a do arquivo, com 2% de folga de
arredondamento. As duas coisas são invisíveis para qualquer leitura de texto.
Uma imagem que não carrega continua ocupando lugar, então a peça sai com um
buraco onde deveria estar a marca e nenhuma medida de geometria reclama; e um
logotipo esticado é a falha que o dono da marca reconhece antes de todas.

### C4. O texto se lê no tamanho real

*Por que:* peça de tráfego que não se lê não cumpre função nenhuma.

*Como se confere:* o menor contraste entre texto e fundo fica em 3:1 ou acima —
o mesmo piso das outras réguas da casa. O número é CALCULADO entre o par de
cores que a composição escolheu, não amostrado do pixel, e isso é barato e
exato enquanto valerem as duas condições que o tornam verdade: o texto é opaco,
e a faixa sob ele é sólida. As duas são medidas aqui, não presumidas.

*Falhou:* na mesma peça de C2, a régua declarava **11,82:1** e o pixel real no
topo da linha da marca media **2,51:1**. A faixa era um degradê que começava
transparente e a marca vinha com `opacity:.85`: o par de cores continuava o
mesmo, e nenhuma das duas cores estava na tela. Hoje o degradê vive num véu
acima da caixa de texto, a marca é opaca, e a régua **reprova** quando encontra
qualquer `[data-papel]` com opacidade menor que 1 — porque nesse caso o número
declarado deixou de descrever a peça.

Contraste que não dá para calcular (`NaN`, de cor em formato que a conta não lê)
fica **pendente**. Sem essa conferência ele passava por baixo do piso em
silêncio, já que `NaN < 3` é `false`.

### C5. O material do cliente foi preservado

*Por que:* upload vence geração. Trocar o arquivo dele por material inventado é
o contrário do que ele pediu.

*Como se confere:* houve upload? Então ele tem de estar na peça. **Não houve
upload** e **ninguém conferiu** são coisas diferentes: a primeira passa, a
segunda é pendência. Enquanto as duas foram o mesmo `null`, a régua dava verde
para o que ninguém tinha olhado.

### C6. As variações são de fato diferentes

*Por que:* cobrar duas e entregar uma.

*Como se confere:* o hash do conteúdo não bate com o de nenhuma irmã do mesmo
pedido.

### C7. Nenhum texto espúrio dentro do pixel

*Por que:* modelo de imagem inventa letra torta, legenda e assinatura. Nada
disso pode chegar ao cliente como se fosse da marca dele.

*Como se confere:* **não se confere.** Ler o que está DENTRO da imagem exige
OCR, e este repositório não tem. Com pixel gerado, a regra é PENDENTE e vai para
revisão humana. Peça sem pixel gerado passa: não há o que inventar.

### C8. Sem marca d'água do provedor

*Por que:* marca d'água de terceiro numa peça de campanha é problema do cliente,
não do fornecedor.

*Como se confere:* também não se confere. O plano da conta não é prova sobre o
pixel — dizer "o plano é premium, logo não tem marca d'água" é vender cadastro
como proveniência. PENDENTE quando houve geração.

### C9. A procedência está registrada

*Por que:* peça que não diz de que modelo e preset saiu não é reproduzível nem
auditável. Quando o cliente pedir "outra igual a essa", não há como.

*Como se confere:* a variação traz modelo e preset. Sem isso, pendência.

### C10. Nenhum caractere se perdeu no caminho

*Por que:* C2 e C3 comparam o texto renderizado com o texto do pedido. Se os
dois vierem corrompidos, os dois concordam e ambos passam — a régua fica verde
sobre uma peça que mostra "cole��o".

*Como se confere:* duas assinaturas, porque a corrupção tem duas formas.

A primeira é a **perda**: o texto não contém o caractere de substituição
(U+FFFD), que é o rastro que sobra quando alguma etapa leu os bytes com a
codificação errada e não soube o que fazer com eles.

A segunda é o **embaralhamento**, e ela não deixa rastro nenhum. Quando bytes de
UTF-8 são lidos como se fossem de uma tabela de um byte, "coleção" vira
"coleÃ§Ã£o": nada se perdeu, cada byte virou um caractere válido, e não há U+FFFD
para denunciar. A regra procura a assinatura desse acidente (um `Ã` ou `Â`
seguido de um caractere da faixa de continuação, ou o `â€` das aspas
tipográficas), que português correto nunca produz. Há teste com "coleção",
"Estação" e "São João" provando que ela não acusa peça boa.

*Falhou:* a primeira peça composta deste repositório saiu com o CTA
"Ver a cole��o", e as nove regras da época ficaram verdes. Quem percebeu foi o
olho, ao abrir o PNG. Esta regra existe para o olho não precisar ser o único —
e a segunda assinatura existe porque a primeira só pegava metade dos casos.

### C11. A peça saiu na tipografia da marca

*Por que:* o `font-family` do CSS é um PEDIDO, e o fallback dele é silencioso
por desenho. Sem a fonte carregada, o navegador desenha noutra letra e nada no
arquivo diz que isso aconteceu: a peça alega ser da marca sem ser.

*Como se confere:* a composição EMBUTE o arquivo da fonte na página (o Chromium
que compõe não tem as fontes do mundo instaladas), e depois percorre
`document.fonts` procurando uma face daquela família com `status: "loaded"`.
Pedido que não escolheu tipografia passa: a letra da casa foi decisão.

*Falhou:* a primeira tentativa usou `document.fonts.check()`, e ele responde a
pergunta errada, que é se o navegador consegue desenhar o texto de ALGUM jeito.
Medido: uma família inventada passava por aplicada, porque o fallback do
sistema dá conta.

*Por que reprova em vez de virar ressalva:* recompor não gasta crédito. O pixel
gerado já está pago e em disco, e `pnpm criativo:compor` monta de novo a partir
dele. Como o conserto é de graça, deixar sair uma peça na letra errada seria
escolher entregar errado.

### C12. A foto continua sendo a peça

*Por que:* esta regra nasceu de uma peça que passou em ONZE regras e o dono
reprovou de olho. Medido no banner real da marca de prova: a faixa de leitura
saiu com **52% da peça** e a foto com **48%**. C1 dizia que a dimensão era
exata, C2 que o texto cabia no quadro, C3 que a marca estava lá, C4 que se lia,
C11 que a tipografia era a da marca — todas certas, e nenhuma perguntava o que
sobrou da imagem. Uma peça com foto em que a foto é a MENOR parte não é uma peça
com foto; é um painel de texto com uma tira de imagem em cima.

*Como se confere:* a geometria, medida no navegador. A camada da foto (a peça
inteira, ou a metade dela numa tela dividida) menos a área que as superfícies
OPACAS de texto cobrem, sobre a área da peça. O véu não conta como cobertura:
ele escurece a foto e continua mostrando-a, e é essa a diferença entre uma foto
sob véu e uma tira de foto acima de um painel.

*Por que o piso é METADE:* porque não é um número calibrado — é onde a definição
da peça empata consigo mesma, e empatar já é o extremo tolerável. Medido antes
de o número ser escrito, no mesmo banner e nos quatro arranjos:

```
48%                      a peça que o dono reprovou de olho
56%  60%  100%  100%     as que ele não reprovou
```

As duas classes não se cruzam, e o piso cai entre elas sem ter sido ajustado
para isso. Se um dia se cruzarem, a regra está errada e sai — é a mesma lição
que aposentou o piso de distância visual entre artes (M9).

*Três estados, e não dois:* peça SEM foto passa (a faixa é a peça, por decisão);
peça com foto que ninguém mediu fica PENDENTE; quem não disse nem se há foto
também fica pendente. `false` é um padrão, não uma medida, e com dois estados
uma conferência vazia saía com C12 verde.

*Por que reprova em vez de virar ressalva:* recompor noutro arranjo é geometria
sobre um pixel que já está pago e em disco. Como o conserto é de graça, deixar
sair a peça errada seria escolher entregar errado.

### O portão da entrega cobra a folha INTEIRA

Uma variação `aprovada` precisa de folha com **todas** as regras (C1 a C11), e
não com algumas. Enquanto uma folha com uma regra só passava, "aprovada com
folha" parecia auditável: bastava declarar C1 e a ausência das outras dez não
aparecia em lugar nenhum. Regra que some de uma folha é regra que ninguém
rodou.

A lista canônica (`CODIGOS_DA_REGUA`) mora no contrato, e não na régua, para o
portão poder cobrá-la sem depender dela. Um teste amarra as duas: a régua tem
de produzir exatamente essa lista, senão o portão passa a exigir o que não
existe, ou deixa de exigir o que passou a existir.

### Antes de gastar: claim não autorizado

Não é regra de aceite — é porteiro. Preço, desconto, prazo e frete no texto da
peça são conferidos **no pedido**, contra `autorizacoesDeClaim`. Conferir depois
da geração só serviria para reprovar algo que já foi pago.

---

# Regra de aceite da MARCA CRIADA

`M1` a `M12`, em `packages/shared/src/regras-de-aceite-marca.ts`, executadas por
`pnpm marca:montar` (M1..M6) e por `pnpm marca:apresentar` (M7..M12).

## O que muda em relação às outras três

Uma peça criativa erra e vira lixo de uma campanha. **Uma marca errada é
carregada por tudo o que a empresa faz depois** — o site, a loja, a assinatura de
e-mail, o bordado do uniforme — e o erro só é notado quando já está em todos
eles.

Por isso o que esta régua mede não é "ficou bonita", que ninguém mede, e sim as
coisas que fazem uma marca ser **inutilizável** e que se medem exatamente.

### M1. As três versões saíram, na medida

*Por que:* as versões (transparente, fundo branco, monocromática) saem do símbolo
por CÁLCULO, não por geração. Faltar uma, ou sair fora do lado padrão, significa
que o recorte falhou — e recorte que falhou não vira entrega.

### M2. A transparente é transparente de verdade

*Por que:* um PNG "transparente" cujo alfa é opaco em toda parte é um retângulo
branco esperando para aparecer sobre o primeiro fundo colorido. E o oposto
também reprova: alfa zero em todo lugar é o recorte que comeu o desenho.

### M3. A monocromática é silhueta, não foto sem cor

*Por que:* ela existe para bordado, carimbo e impressão de uma tinta, onde não há
meio-tom. Uma versão dessaturada parece certa na tela e sai como mancha no
tecido.

*Como se confere:* a fração do desenho que é meio-tom. O piso é 12%, e ele
acomoda a borda macia do recorte — que é meio-tom por natureza e é o que faz a
logo não parecer recorte de tesoura. A primeira versão desta regra contava
"quantos tons distintos existem" e reprovava toda silhueta correta, porque
contava o antialiasing como tinta.

### M4. As versões são o MESMO símbolo

*Por que:* é a queixa que originou o motor inteiro. Pedir "o mesmo símbolo em
fundo branco" ao gerador abre um pedido NOVO e ele desenha outro símbolo — foi
assim que uma marca chegou em três modelos diferentes em vez de uma marca em três
roupas.

*Como se confere:* a distância visual entre as versões e o símbolo de origem.
Elas são recortadas e recentradas do MESMO arquivo, então a diferença esperada é
de borda e de escala; geração independente produz distâncias muito acima.

### M5. A cor da marca se lê sobre branco

*Por que:* uma peça de campanha ilegível se refaz; um logotipo ilegível vai para
a fachada.

### M6. A marca é reproduzível e a decisão está escrita

*Por que:* sem o prompt e a procedência registrados, pedir uma variação desta
marca é começar de novo e receber outro desenho — e cada tentativa custa. Quando
a cor foi escolhida pelo Orbis e não pelo cliente, o motivo tem de existir: cor
escolhida em silêncio é cor que ninguém pode discutir depois.

### M7. A apresentação existe, e explica o sistema

*Por que:* regra do dono — **marca sem apresentação não é marca pronta**. Um
punhado de PNGs numa pasta obriga quem recebe a adivinhar qual é a logo, quando
usar cada versão e o que é a cor, que é exatamente o trabalho que contratar uma
marca vinha evitar.

### M8. A apresentação não corta nem esconde nada

*Por que:* ela nasceu sem régua, e a primeira consequência apareceu na primeira
leitura: um banner recortado com a headline cortada no meio. Quem viu foi o olho,
e o olho não escala. O que passa da borda some na impressão, e o que é recortado
numa página de aplicação vira outra peça.

### M9. Cada arte veio do próprio briefing

*Por que:* *"estão todas com a mesma ideia de arte"*. A causa não era o gerador:
foi pedir N imagens com `count: N` num prompt só, o que devolve N variações de
UMA ideia por construção.

*Como se confere:* a PROCEDÊNCIA — de que briefing cada arte veio —, e não o
pixel. A primeira versão media distância visual entre as artes, com piso 0,08.
Medido depois, contra pares de classe conhecida:

```
0,225  0,207  0,188  0,129   pares que são A MESMA ideia
0,174  0,259                 pares que são ideias DIFERENTES
```

As faixas se CRUZAM. Um par da mesma ideia (0,225) está mais distante que um par
de ideias diferentes (0,174), e nenhum piso separa as classes. A regra saiu.

### M10. Cada conceito é uma proposta visual diferente

*Por que:* a mesma queixa, três vezes. *"você fez 1 estilo de banner só para os
dois"*, e depois de dois consertos de geometria, *"por que você está fazendo só
nesse estilo?"*. As duas primeiras correções trocaram o LAYOUT e mantiveram a
linguagem visual — bloco na cor da marca, texto branco, foto de gente sorrindo,
três vezes seguidas.

**Geometria diferente não é proposta diferente.** Uma proposta é uma direção
inteira: que peso de cor, que assunto, que registro. E ela sai do BRIEFING
daquela marca, nunca de um cardápio fixo de estilos — um cardápio devolve as
mesmas duas ideias para clínica, padaria e escritório de advocacia.

*Como se confere:* `artes/propostas.json`, pela mesma razão de M9.

### M11. Cada conceito tem versão desktop e mobile

*Por que:* um banner de site vive num site responsivo, e o telefone é onde a
maior parte das pessoas o vê. Entregar só a versão larga é entregar metade — e a
outra metade **não se obtém recortando esta**, porque o texto foi diagramado para
a largura que o recorte destrói.

Isto é diferente do criativo de tráfego pago, que também é vertical e NÃO é o
mesmo produto: aquele é para quem nunca ouviu falar da marca, e vive na frente
Criativos com copy de venda e orçamento próprios.

### M12. Toda coleção decidida tem a sua capa

*Por que:* uma coleção decidida e sem capa é a vitrine com uma prateleira vazia.
O cliente escolheu a categoria (ou o Orbis escolheu por ele), o nome aparece na
apresentação, e o arquivo não existe — quem abre a pasta procura a imagem que
foi prometida.

A regra nasceu de um sumiço **medido**: `ResultadoDeMarca` não declarava
`colecoes`, o `parse` de Zod descarta chave não declarada, e a decisão gravada
por `marca:colecoes --definir` evaporava no comando seguinte que lesse e
regravasse o arquivo. As quatro capas do Sorriso Vivo estavam em disco e a
entrega saiu sem a pasta, sem nada reclamar. É o mesmo formato de furo de M11 e
de C12: a pergunta não existia em lugar nenhum, então nada respondeu.

Lista vazia **passa**: marca sem vitrine é uma resposta. `null` fica pendente:
ninguém ter olhado não é.

## O portão da entrega da marca

`problemasDaEntregaDeMarca` recusa fechar o job quando: não há resultado, ou ele
está fora do contrato; ele aponta para arquivo que não existe; a folha não cobre
a régua inteira, ou alguma regra reprovou; **não há apresentação em PDF**; há
crédito empenhado sem desfecho; o custo declarado não bate com o razão; ou o
gasto passou do teto.

O teto é o do RETRATO do pedido, gravado antes da fila — mais o que o dono
liberou depois, que vive no razão com data e motivo (`pnpm criativo:razao teto`).
O retrato continua intocado, e é ele que prova qual era o teto quando o job
entrou.

## O que a régua da marca NÃO mede

**A arte gerada por inteiro.** Quando o pixel já chega com a copy dentro — que é
como as artes de banner nascem hoje —, C2 (texto literal), C3 (grafia da marca),
C4 (contraste) e C11 (tipografia) não se aplicam: elas medem o DOCUMENTO, e um
PNG não tem documento. Responder qualquer uma delas exigiria OCR. A apresentação
declara isso na página de pendências, e a conferência da grafia é de olho —
acento em português é onde o modelo mais erra.
