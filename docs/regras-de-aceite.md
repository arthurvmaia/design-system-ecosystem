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
