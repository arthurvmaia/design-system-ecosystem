/**
 * O PRODUTO nos idiomas em que a loja pode nascer.
 *
 * Duas coisas por produto, e as duas vêm do mesmo lugar: o NOME que a vitrine
 * mostra e o TÍTULO do anúncio de origem, de onde a descrição é montada.
 *
 * ## Por que o título também, e não só o nome
 *
 * Porque a descrição do produto não é escrita: ela é DERIVADA do título, em
 * `nome-de-produto.ts`. Medido no acervo: dos 100 produtos, 42 rendem lista de
 * características e **58 caem no título inteiro como parágrafo**. Traduzindo só
 * o nome, a loja em inglês abriria com o cartão certo e a página do produto em
 * português. Com o título traduzido, todo o resto do motor funciona igual, sem
 * precisar saber que existe idioma.
 *
 * ## A regra que este arquivo obedece
 *
 * A mesma de `nomes-curados.ts`, dita no idioma da loja: **só palavras que já
 * estavam no anúncio**. Reordenar, escolher e descartar, sim; acrescentar, não.
 * Traduzir não é inventar — é a mesma afirmação noutra língua —, mas
 * ACRESCENTAR seria: preço, prazo, material e medida que o fornecedor não
 * disse continuam fora, nos três idiomas.
 *
 * E os títulos saem com menos de 118 caracteres de propósito. Esse é o
 * comprimento em que a COLETA cortou os títulos originais, e o motor usa isso
 * para descartar o pedaço de palavra do fim. Uma tradução que passasse do
 * limite perderia um trecho inteiro sem motivo, porque nada aqui foi cortado.
 *
 * ## Por que aqui, e não no catálogo
 *
 * `catalogo-nichos.ts` é GERADO pelo extrator e diz isso no cabeçalho: editar
 * ali é trabalho que a próxima extração apaga. A chave é o `handle`, que sai do
 * título de origem e sobrevive. Produto novo que o extrator traga e que não
 * esteja aqui aparece no idioma de origem — visível e corrigível — em vez de
 * sumir da vitrine.
 */

/** O nome de vitrine e o título de origem, por handle, em cada idioma. */
export type ProdutoTraduzido = { nome: string; titulo: string };

export const CATALOGO_TRADUZIDO: Record<string, Record<string, ProdutoTraduzido>> = {
  en: {
    /* roupas */
    "mulher-roupas-de-manga-curta-camiseta-fino-ajust-221772": { nome: "Ribbed short-sleeve tee", titulo: "Women's short-sleeve tee, slim fit, crew neck, ribbed knit hem, streetwear top" },
    "bodysuit-manga-longa-feminino-corpo-streetwear-d-189289": { nome: "Long-sleeve square-neck bodysuit", titulo: "Women's long-sleeve bodysuit, streetwear, bodycon, square neck, ribbed, basic" },
    "1pc-feminino-sexy-cor-solida-camisola-tubo-de-se-898632": { nome: "Seamless solid tube camisole", titulo: "Women's solid tube camisole, ice silk, seamless, sports tank, wireless underwear" },
    "elegante-solido-basico-de-malha-topos-feminino-g-613824": { nome: "Turtleneck long-sleeve knit jumper", titulo: "Elegant solid basic knit top, women's turtleneck, long sleeve, casual slim jumper, simple Korean style" },
    "feminino-sexy-sem-costas-tanque-macacao-superior-017983": { nome: "Sleeveless halter bodysuit", titulo: "Women's open-back tank bodysuit, bodycon, one piece, halter, sleeveless, short jumpsuit" },
    "shorts-de-fitness-feminino-apertado-ciclismo-yog-820432": { nome: "High-waisted fitness shorts", titulo: "Women's fitness shorts, tight fit, cycling, yoga, breathable sports leggings, high waist" },
    "cinta-solida-bodycon-sexy-corpo-casual-basico-br-984359": { nome: "Sleeveless basic bodysuit", titulo: "Solid strappy bodycon body, casual basic, white, summer, women's sleeveless tops, sheer bodysuit" },
    "calcoes-esportivos-femininos-verao-2024-nova-cor-923781": { nome: "Elastic-waist sports shorts", titulo: "Women's sports shorts, summer 2024, new candy colour, slim casual shorts, elastic waist, beach" },
    "gotico-impressao-preto-sem-alcas-tubo-superior-f-356207": { nome: "Gothic strapless tube top", titulo: "Gothic print black strapless tube top, women's slim cropped, summer casual chic, graphic y2k streetwear" },
    "camiseta-esportiva-feminina-ultraleve-de-cor-sol-609273": { nome: "Quick-dry sports tee", titulo: "Women's ultralight solid sports tee, quick dry, light and breathable, compression shirt for the gym" },
    /* oculos */
    "scvcn-novo-ciclismo-ao-ar-livre-oculos-de-sol-do-769871": { nome: "Scvcn cycling sunglasses", titulo: "Scvcn new outdoor cycling sunglasses, men's road riding, bike sports, mountain climbing, women's" },
    "oculos-de-sol-sem-aro-para-homens-e-mulheres-ton-070597": { nome: "Rimless square sunglasses", titulo: "Rimless sunglasses for men and women, small shades, square glasses, summer travel, popular fashion" },
    "moda-vintage-quadrado-polarizado-oculos-de-sol-d-041223": { nome: "Vintage square polarised sunglasses", titulo: "Vintage fashion square polarised sunglasses, women's and men's, driving, fishing, luxury designer shades" },
    "novos-oculos-de-sol-vintage-quadrados-para-mulhe-561635": { nome: "Vintage Square Sunglasses", titulo: "New Vintage Square Sunglasses for Women and Men, Luxury Brand, Small Round Sunglasses for Women" },
    "oculos-de-sol-sem-aro-retangulo-moda-popular-fem-960153": { nome: "Rimless rectangle sunglasses", titulo: "Rimless rectangle sunglasses, popular fashion, women's and men's, small square shades" },
    "quadrado-sem-aro-oculos-de-sol-feminino-marca-lu-589263": { nome: "Rimless square uv400 sunglasses", titulo: "Rimless square sunglasses, women's, luxury designer brand, summer, red glasses, uv400 shades for men" },
    "classico-gotico-steampunk-oculos-de-sol-marca-lu-225736": { nome: "Round steampunk sunglasses", titulo: "Classic gothic steampunk sunglasses, luxury designer brand, high quality, men's and women's, retro round pc frame" },
    "oculos-de-sol-masculinos-quadrados-classicos-con-521175": { nome: "Square sunglasses black frame", titulo: "Men's classic square sunglasses, comfortable, lightweight, black frame, ideal for travel and gifting" },
    "oculos-de-visao-noturna-pc-quadro-polarizado-ocu-734860": { nome: "Polarised night vision glasses", titulo: "Night vision glasses, pc frame, polarised, men's sunglasses, outdoor sport, day and night driving" },
    "oculos-de-sol-promocionais-estilo-classico-oculo-265777": { nome: "Classic Style Unisex Sunglasses", titulo: "Promotional Classic Style Sunglasses, Unisex Sunglasses, Affordable Sunglasses" },
    /* relogios */
    "relogio-esportivo-digital-masculino-a-prova-d-ag-248263": { nome: "Waterproof digital sports watch", titulo: "Men's digital sports watch, waterproof, casual, luminous, stopwatch, alarm, simple military watch" },
    "addiesdive-relogio-de-aco-inoxidavel-masculino-e-485122": { nome: "Addiesdive stainless steel quartz watch", titulo: "Addiesdive stainless steel men's watch, european and american business leisure quartz watch, waterproof" },
    "relogio-de-quartzo-analogico-masculino-com-calen-961705": { nome: "Analogue watch with steel bracelet", titulo: "Men's analogue quartz watch with calendar, stainless steel bracelet, Fashion" },
    "homens-led-digital-relogios-moda-luminosa-esport-160680": { nome: "Military LED Digital watch", titulo: "Men's LED Digital Watches, luminous fashion, sport, waterproof, army, military, date, new" },
    "1-2-pecas-relogios-masculinos-de-negocios-relogi-529149": { nome: "Quartz watch with steel bracelet", titulo: "Men's business watches, fashion quartz watch with steel bracelet and matching bracelet" },
    "relogio-digital-de-luxo-para-homens-em-aco-inoxi-430367": { nome: "Luxury Digital Watch in Stainless Steel", titulo: "Luxury Digital Watch for Men in Stainless Steel, Simple Electronic Business Watch, Gold and Silver" },
    "poedagar-quadrado-de-luxo-relogio-de-pulso-mascu-059976": { nome: "Poedagar square wristwatch", titulo: "Poedagar luxury square men's wristwatch, waterproof, luminous, date, stainless steel men's watch" },
    "set-homens-relogios-de-negocios-casual-pulseira--994516": { nome: "Analogue Watch with Leather Strap", titulo: "Men's Business Casual Watches, Leather Strap, Analogue Quartz Watch, Necklace and Bracelet Set" },
    "relogio-de-pulso-de-quartzo-masculino-da-moda-co-980856": { nome: "Quartz watch with leather strap", titulo: "Men's fashion quartz wristwatch with leather strap" },
    "tomi-relogio-masculino-de-luxo-conjunto-de-caixa-450110": { nome: "Tomi luxury watch with gift box", titulo: "Tomi luxury men's watch, gift box set, high quality rose gold case, simple and versatile" },
    /* beleza */
    "creme-facial-de-sangue-de-dragao-retinol-placent-087608": { nome: "Dragon's blood face cream with retinol", titulo: "Dragon's blood face cream, retinol, placenta, essence, glow, firming, skincare, korean cosmetics" },
    "45-135pcs-sanrio-hello-kitty-cartoon-pimples-def-026351": { nome: "Hello Kitty Hydrocolloid Acne Patch", titulo: "Sanrio Hello Kitty Cartoon Pimple Patch - Invisible Hydrocolloid Acne Sticker, Decorative Patch" },
    "rosto-acne-remendo-invisivel-cuidados-com-a-pele-632860": { nome: "Invisible acne patch", titulo: "Face acne patch, invisible, skincare, pimple patches, anti-inflammatory, absorbent spot sticker" },
    "retinol-levantamento-endurecimento-creme-colagen-934472": { nome: "Face cream with retinol and collagen", titulo: "Retinol lifting firming cream, collagen, smooths wrinkles, moisturising face cream, brightening" },
    "creme-facial-anti-idade-com-retinol-e-colageno-6-619048": { nome: "Anti-ageing Face Cream with Retinol and Collagen", titulo: "Anti-ageing Face Cream with Retinol and Collagen 60g, Intense Moisturiser and Firming, Hyaluronic Acid" },
    "creme-facial-e-para-pescoco-com-retinol-e-colage-752346": { nome: "Face and Neck Cream with Retinol", titulo: "Face and Neck Cream with Retinol and Collagen 45g, Moisturising, Non-greasy, Easy to Apply and Absorb" },
    "de-remendos-de-acne-estrela-multicoloridos-remen-413863": { nome: "Star acne cover patches", titulo: "Multicoloured star acne patches, facial acne patches, acne cover stickers and pimple patches" },
    "1-2-3-pcs-rolo-de-gelo-facial-cuidados-com-a-pel-655724": { nome: "Facial ice roller with gua sha", titulo: "Facial ice roller, skincare, ice roller, face roller, gua sha, facial tool set" },
    "creme-facial-do-sangue-do-dragao-do-retinol-hidr-524461": { nome: "Dragon's blood face cream with Retinol", titulo: "Dragon's blood Retinol face cream, moisturise and repair, brighten, fine lines, pores, acne" },
    "mascara-facial-recarregavel-com-led-7-cores-foto-027165": { nome: "7-colour led face mask", titulo: "Rechargeable led face mask, 7 colours, photon, beauty mask, skin rejuvenation, home facial lifting" },
    /* casa */
    "suporte-de-colher-de-cozinha-garfo-espatula-rack-152512": { nome: "Kitchen spoon and spatula holder", titulo: "Kitchen spoon holder, fork, spatula rack, shelf organiser, plastic, chopstick holder, non-slip" },
    "conjunto-de-recipientes-de-armazenamento-de-alim-976842": { nome: "Set of 6 stainless steel containers", titulo: "6-piece stainless steel food storage container set with lids - leak-proof and stackable" },
    "grau-alimenticio-silicone-preservacao-capa-reuti-723031": { nome: "Reusable round silicone lids", titulo: "Food-grade silicone preservation cover, reusable, airtight, universal, stretch round lids for dishes" },
    "recipiente-de-armazenamento-de-ovos-de-3-camadas-031651": { nome: "3-layer egg organiser", titulo: "3-layer egg storage container for the fridge, holds 24 eggs, large capacity kitchen organiser rack" },
    "ganchos-de-parede-impermeaveis-e-a-prova-de-oleo-835301": { nome: "Waterproof wall hooks", titulo: "Waterproof and oil-proof wall hooks, sticky hooks for the kitchen, shower and bathroom door" },
    "frascos-de-plastico-selados-para-cozinha-organiz-459385": { nome: "Sealed jars for grains", titulo: "Sealed plastic kitchen jars, grain storage organiser, large tank, moisture-proof box" },
    "non-punching-dishwashing-cloth-storage-clip-cozi-742815": { nome: "Kitchen towel holder", titulo: "Non Punching Dishwashing Cloth Storage Clip, Kitchen Household Gloves Hook, Towel Rail, Wall Hanging" },
    "1pc-cinza-diversos-saco-de-armazenamento-montage-036864": { nome: "Wall-mounted plastic bag dispenser", titulo: "Grey storage bag, wall-mounted mesh plastic bag dispenser, hanging and reusable" },
    "2-6-pcs-fixado-na-parede-sacos-de-lixo-titular-s-303618": { nome: "Wall-mounted bin bag organiser", titulo: "Wall-mounted bin bag holder, rubbish bag storage box, plastic film organiser and container" },
    "prateleira-de-cozinha-de-aco-inoxidavel-rack-de--051426": { nome: "Stainless steel sink shelf", titulo: "Stainless steel kitchen shelf, sponge drainer rack, sink drainer rack, washing-up supplies" },
    /* pet */
    "bola-de-brinquedo-para-caes-bola-de-brinquedo-na-804768": { nome: "Bite-resistant toy ball", titulo: "Toy ball for dogs, non-toxic bite-resistant toy ball for pet dogs and puppies" },
    "brinquedo-de-pelucia-interativo-para-caes-polvo--592273": { nome: "Squeaky Plush Octopus for Dogs", titulo: "Interactive Plush Dog Toy, Octopus with Squeaker and Crinkly Tentacles, Chew Toy" },
    "cao-dormindo-com-um-cachorro-abraco-pato-brinque-788774": { nome: "Yellow cuddle duck for dogs", titulo: "Sleeping dog cuddle duck toy to relieve boredom, little yellow duck pet companion" },
    "novo-brinquedo-interativo-da-bola-do-cao-bola-do-976362": { nome: "Rechargeable self-rolling ball", titulo: "New interactive dog ball toy, rechargeable self-rolling dog ball, interactive puppy toy" },
    "brinquedos-para-gatos-e-caes-para-mastigadores-a-622667": { nome: "Squeaky Plush for Cats and Dogs", titulo: "Cat and Dog Toys for Aggressive Chewers, Interactive Squeaky Plush Toy for Cats and Dogs" },
    "bola-interativa-inteligente-para-gatos-duravel-e-008307": { nome: "Smart Interactive Ball for Cats", titulo: "Smart Interactive Ball for Cats, Durable and Long-lasting, Easy to Clean, Dog Toys with Obstacle Avoidance" },
    "50cm-macio-colorido-pato-brinquedo-de-pelucia-pa-058137": { nome: "Soft plush duck 50cm", titulo: "50cm soft colourful plush duck toy for cats and dogs, relaxing pet companion, anxiety relief" },
    "brinquedo-de-pelucia-para-animais-de-estimacao-a-409759": { nome: "Bite-resistant plush toy", titulo: "Plush pet toy, cute animals, bite-resistant, interactive, squeaky dog toy" },
    "1pc-pet-no-brinquedo-para-cao-e-gato-forma-cenou-578396": { nome: "Carrot-shaped rope toy", titulo: "Pet knot toy for dog and cat, carrot shape, dog chew toys, cotton rope indoor dog toys" },
    "brinquedo-de-cachorro-de-pato-de-pelucia-resiste-255975": { nome: "Durable squeaky plush duck", titulo: "Chew-resistant plush duck dog toy, durable dog toy with squeaker, teeth grinding" },
    /* fitness */
    "faixa-de-resistencia-resistente-de-20-230lbs-tre-771538": { nome: "Resistance band 20 to 230lbs", titulo: "Heavy-duty resistance band 20~230lbs, agility training, gym equipment, yoga, pilates, accessories" },
    "1-peca-de-faixas-de-resistencia-de-4-niveis-com--177417": { nome: "4-level resistance bands with handles", titulo: "4-level resistance bands with handles for home workouts and strength training - perfect for yoga" },
    "tensor-de-pedal-de-quatro-tubos-multifuncional-e-133290": { nome: "Four-tube pedal puller", titulo: "Multifunctional four-tube pedal puller, home fitness equipment, yoga, core strengthening, elastic band" },
    "rack-push-up-em-forma-de-u-equipamento-fitness-p-299425": { nome: "U-shaped push-up rack", titulo: "U-shaped push-up rack, Fitness Equipment, Foam Hand Grip, Muscle Training, Push Up Bar, Chest, Gym" },
    "cinto-elastico-esportivo-auditivo-pull-up-auxili-266845": { nome: "Elastic pull-up assist belt", titulo: "Elastic sports pull-up assist belt for men and women, gym and pilates rubber training equipment" },
    "tapete-de-yoga-pilates-fitness-3-4-6mm-de-espess-272203": { nome: "Non-slip yoga mat", titulo: "Yoga pilates fitness mat, 3/4/6mm thick, non-slip yoga pad, travel fitness exercise pad" },
    "wosweir-elastic-training-gum-resistencia-bandas--715244": { nome: "WOSWEIR Resistance Bands", titulo: "WOSWEIR Elastic Training Gum Resistance Bands, Gym, Home Fitness, Expander, Yoga, Pull Up Assist, Crossfit" },
    "banda-de-resistencia-resistente-latex-cinto-elas-516905": { nome: "Latex resistance band", titulo: "Heavy-duty latex resistance band, elastic pull-up assist belt for pilates and home gym training" },
    "a-nova-corda-de-pular-fio-de-aco-exercicio-de-pu-697910": { nome: "Adjustable steel wire skipping rope", titulo: "New steel wire skipping rope, adjustable jump exercise, fitness training sports equipment" },
    "nova-corda-de-pular-com-cabo-de-aco-ajustavel-pa-687882": { nome: "Skipping Rope with Adjustable Steel Cable", titulo: "New Skipping Rope with Adjustable Steel Cable for Home Fitness, Tangle-free Sports Equipment" },
    /* gadgets */
    "bluetooth-5-3-fones-de-ouvido-para-jogos-modo-du-216387": { nome: "Bluetooth 5.3 gaming headphones", titulo: "Bluetooth 5.3 gaming headphones, dual mode, wireless, foldable, noise reduction, music for iphone xiaomi" },
    "multifuncional-portatil-dobravel-headmounted-sem-036557": { nome: "Foldable bluetooth 5.0 headphones", titulo: "Multifunctional portable foldable head-mounted wireless bluetooth 5.0 headphones with tf card slot" },
    "fone-de-ouvido-bluetooth-6-0-lenovo-le302-sem-fi-477059": { nome: "Lenovo LE302 Bluetooth 6.0 Earphones", titulo: "Lenovo LE302 Bluetooth 6.0 Wireless Earphones with Long Battery Life, Sports Earphones with Clip" },
    "ugreen-studio-pro-48db-anc-fones-de-ouvido-sem-f-585460": { nome: "UGREEN Studio Pro ANC headphones", titulo: "UGREEN Studio Pro 48dB ANC Wireless Over-Ear Headphones, Bluetooth, Active Noise Cancelling" },
    "fone-de-ouvido-moondrop-space-travel-2-hifi-com--878815": { nome: "MOONDROP Space Travel 2 earphones", titulo: "MOONDROP Space Travel 2 HiFi earphones with noise cancelling, TWS wireless Bluetooth 6.0 ANC, low latency" },
    "fone-de-ouvido-estereo-p47-bluetooth-5-0-dobrave-256069": { nome: "P47 Stereo Bluetooth 5.0 Headphones", titulo: "P47 Stereo Bluetooth 5.0 Foldable Wireless Headphones for Gaming and Sports, iPhone compatible" },
    "binnune-bw06-fones-de-ouvido-bluetooth-gamer-com-114453": { nome: "BINNUNE BW06 gaming headset with mic", titulo: "BINNUNE BW06 bluetooth gaming headset with microphone for ps5 ps4 pc mac playstation, wireless 2.4ghz" },
    "fones-de-ouvido-bluetooth-5-4-lenovo-gm2-pro-hea-350280": { nome: "Lenovo GM2 Pro Bluetooth 5.4 Earphones", titulo: "Lenovo GM2 Pro Bluetooth 5.4 Earphones, Wireless Sports Headset, In-Ear, Low Latency, Dual Mode" },
    "smailwolf-l80-bluetooth-sem-fio-com-fio-de-tres--888793": { nome: "SmaILWOLF L80 three-mode headset", titulo: "SmaILWOLF L80 Bluetooth wireless and wired three-mode gaming headset, portable and lightweight" },
    "mchose-v9-pro-fone-de-ouvido-com-microfone-tres--477228": { nome: "MCHOSE V9 Pro headset with microphone", titulo: "MCHOSE V9 Pro headset with microphone, three-mode Bluetooth wireless, pc gamer headphones" },
    /* infantil */
    "lanterna-de-projetor-para-criancas-10-cartoes-80-919420": { nome: "Projector torch with 10 cards", titulo: "Projector torch for children, 10 cards, 80 patterns, bedtime toys, cartoon light, educational toy" },
    "inteligencia-matematica-brinquedos-matematicos-e-210743": { nome: "Frog scale for learning maths", titulo: "Maths intelligence toys, funny frog scale, early learning toys, addition and subtraction for children" },
    "1pc-reutilizavel-criancas-livros-de-desenho-de-a-918127": { nome: "Magic water drawing book with pen", titulo: "Reusable children's magic water drawing book with pen, repeatable colouring and drawing book" },
    "brinquedo-montessori-para-aprendizagem-do-bebe-p-591674": { nome: "Montessori Puzzle for Babies", titulo: "Montessori Learning Toy for Babies, Duck, Frog, Pig, Educational Puzzle, Gift for Children" },
    "desenho-com-fio-livro-de-desenho-de-graffiti-inf-448734": { nome: "Children's drawing book with numbers", titulo: "Wire drawing, children's graffiti drawing book, learning numbers, early education to improve marks" },
    "geometria-spirograph-desenho-estenceis-conjunto--151889": { nome: "Geometry stencil set", titulo: "Geometry spirograph drawing stencil set, painting template, creative arts and crafts educational toy" },
    "quebra-cabeca-de-geometria-montessori-para-educa-102211": { nome: "Montessori Geometry Puzzle", titulo: "Montessori Geometry Puzzle for Early Education, Portable Fixed Board for Development, Puzzle" },
    "crianca-montessori-brinquedos-para-criancas-de-2-055424": { nome: "Montessori sticky dart board", titulo: "Montessori toys for children aged 2 to 4, cartoon animal sticky dart board with balls" },
    "8-5-tabuleiro-de-desenho-lcd-escrita-tablet-para-109280": { nome: "8.5 inch lcd drawing board", titulo: "8.5\" lcd drawing board writing tablet for children, boy and girl, montessori educational student toys" },
    "brinquedos-educativos-conjunto-de-brinquedos-de--829128": { nome: "Stacking chairs set", titulo: "Educational toys, stacking chair toy set, building block stacking chairs for children" },
    /* joias */
    "colar-inicial-a-z-colar-banhado-a-ouro-18k-com-l-177356": { nome: "18K gold-plated letter necklace", titulo: "Initial A-Z necklace, 18K gold plated with a cute letter, stainless steel necklace for women" },
    "colar-de-pingente-de-zirconia-multicolorido-banh-432384": { nome: "Multicoloured Zirconia Pendant Necklace", titulo: "Luxurious Gold-Plated Multicoloured Zirconia Pendant Necklace, Elegant Vintage Charm Jewellery to Gift" },
    "colar-de-cruz-premium-para-mulheres-banhado-a-ou-137696": { nome: "18k gold-plated cross necklace", titulo: "Premium cross necklace for women, 18k gold plated chain with fashion gold cross pendant for girls" },
    "18k-banhado-a-ouro-aco-inoxidavel-circulos-inter-213547": { nome: "18k interlocking circles necklace", titulo: "18k gold-plated stainless steel interlocking circles, infinity style, roman numerals statement necklace" },
    "colar-saint-jude-banhado-a-ouro-14k-com-pingente-080134": { nome: "Saint Jude necklace 14K gold plated", titulo: "Saint Jude necklace, 14K gold plated with San Judas pendant, Figaro chain" },
    "corrente-de-cobra-banhada-a-ouro-aco-inoxidavel--998928": { nome: "Gold-plated 3mm snake chain", titulo: "Gold-plated stainless steel snake chain, flat 3mm necklace, fashion choker, hip hop herringbone" },
    "marca-18k-banhado-a-ouro-novo-luxo-colorido-cris-024286": { nome: "18k gold-plated crystal zircon necklace", titulo: "18k gold-plated brand, new luxury colourful crystal zircon necklace for women, party jewellery accessories" },
    "colar-com-pingente-de-sol-espiral-para-mulheres--876977": { nome: "Spiral sun pendant necklace", titulo: "Spiral sun pendant necklace for women - hypoallergenic stainless steel, 18K gold plated, everyday jewellery" },
    "novo-aco-inoxidavel-zircao-colares-para-mulheres-403094": { nome: "18k gold-plated four-leaf necklace", titulo: "New stainless steel zircon necklaces for women, 18k gold plated four-leaf clover luxury chain necklace" },
    "colar-de-corrente-fina-de-aco-inoxidavel-banhado-771695": { nome: "Fine clavicle chain necklace", titulo: "Exquisite gold-plated stainless steel fine chain necklace for women, simple style clavicle chain" },
  },
  es: {
    /* roupas */
    "mulher-roupas-de-manga-curta-camiseta-fino-ajust-221772": { nome: "Camiseta de punto de manga corta", titulo: "Camiseta de manga corta para mujer, corte slim, cuello redondo, bajo de punto, top streetwear" },
    "bodysuit-manga-longa-feminino-corpo-streetwear-d-189289": { nome: "Body de manga larga cuello cuadrado", titulo: "Body de manga larga para mujer, streetwear, bodycon, cuello cuadrado, canalé, básico" },
    "1pc-feminino-sexy-cor-solida-camisola-tubo-de-se-898632": { nome: "Camiseta tubo sin costuras lisa", titulo: "Camiseta tubo lisa de mujer, seda de hielo, sin costuras, top deportivo, ropa interior sin aro" },
    "elegante-solido-basico-de-malha-topos-feminino-g-613824": { nome: "Jersey de punto cuello alto manga larga", titulo: "Top de punto básico liso y elegante, cuello alto de mujer, manga larga, jersey casual slim, estilo coreano simple" },
    "feminino-sexy-sem-costas-tanque-macacao-superior-017983": { nome: "Body halter sin mangas", titulo: "Body de tirantes con espalda abierta, bodycon, una pieza, halter, sin mangas, mono corto" },
    "shorts-de-fitness-feminino-apertado-ciclismo-yog-820432": { nome: "Short de fitness de tiro alto", titulo: "Short de fitness de mujer, ajustado, ciclismo, yoga, mallas deportivas transpirables, tiro alto" },
    "cinta-solida-bodycon-sexy-corpo-casual-basico-br-984359": { nome: "Body básico sin mangas", titulo: "Body bodycon liso de tirantes, básico casual, blanco, verano, tops sin mangas de mujer, body transparente" },
    "calcoes-esportivos-femininos-verao-2024-nova-cor-923781": { nome: "Short deportivo con cintura elástica", titulo: "Short deportivo de mujer, verano 2024, nuevo color caramelo, short slim casual, cintura elástica, playa" },
    "gotico-impressao-preto-sem-alcas-tubo-superior-f-356207": { nome: "Top tubo gótico sin tirantes", titulo: "Top tubo negro sin tirantes con estampado gótico, slim cropped, chic casual de verano, y2k streetwear" },
    "camiseta-esportiva-feminina-ultraleve-de-cor-sol-609273": { nome: "Camiseta deportiva de secado rápido", titulo: "Camiseta deportiva de mujer ultraligera y lisa, secado rápido, transpirable, de compresión para el gimnasio" },
    /* oculos */
    "scvcn-novo-ciclismo-ao-ar-livre-oculos-de-sol-do-769871": { nome: "Gafas de sol Scvcn de ciclismo", titulo: "Nuevas gafas de sol Scvcn de ciclismo al aire libre, carretera para hombre, deporte en bici, montañismo, mujer" },
    "oculos-de-sol-sem-aro-para-homens-e-mulheres-ton-070597": { nome: "Gafas de sol cuadradas sin montura", titulo: "Gafas de sol sin montura para hombre y mujer, gafas pequeñas, cuadradas, viaje de verano, moda popular" },
    "moda-vintage-quadrado-polarizado-oculos-de-sol-d-041223": { nome: "Gafas de sol polarizadas cuadradas vintage", titulo: "Gafas de sol polarizadas cuadradas de moda vintage, de mujer y hombre, conducción, pesca, diseño de lujo" },
    "novos-oculos-de-sol-vintage-quadrados-para-mulhe-561635": { nome: "Gafas de Sol Vintage Cuadradas", titulo: "Nuevas Gafas de Sol Vintage Cuadradas para Mujer y Hombre, Marca de Lujo, Gafas Redondas Pequeñas para Mujer" },
    "oculos-de-sol-sem-aro-retangulo-moda-popular-fem-960153": { nome: "Gafas de sol rectangulares sin montura", titulo: "Gafas de sol rectangulares sin montura, moda popular, de mujer y hombre, gafas cuadradas pequeñas" },
    "quadrado-sem-aro-oculos-de-sol-feminino-marca-lu-589263": { nome: "Gafas de sol cuadradas sin montura uv400", titulo: "Gafas de sol cuadradas sin montura de mujer, marca de diseño de lujo, verano, rojas, uv400 para hombre" },
    "classico-gotico-steampunk-oculos-de-sol-marca-lu-225736": { nome: "Gafas de sol steampunk redondas", titulo: "Gafas de sol steampunk góticas clásicas, marca de lujo, alta calidad, de hombre y mujer, montura redonda retro" },
    "oculos-de-sol-masculinos-quadrados-classicos-con-521175": { nome: "Gafas de sol cuadradas montura negra", titulo: "Gafas de sol cuadradas clásicas de hombre, cómodas, ligeras, montura negra, ideales para viajar y regalar" },
    "oculos-de-visao-noturna-pc-quadro-polarizado-ocu-734860": { nome: "Gafas polarizadas de visión nocturna", titulo: "Gafas de visión nocturna, montura pc, polarizadas, gafas de sol de hombre, deporte al aire libre, día y noche" },
    "oculos-de-sol-promocionais-estilo-classico-oculo-265777": { nome: "Gafas De Sol Unisex Estilo Clásico", titulo: "Gafas De Sol Promocionales Estilo Clásico, Gafas De Sol Unisex, Gafas De Sol Económicas" },
    /* relogios */
    "relogio-esportivo-digital-masculino-a-prova-d-ag-248263": { nome: "Reloj deportivo digital sumergible", titulo: "Reloj deportivo digital de hombre, sumergible, casual, luminoso, cronómetro, alarma, reloj militar simple" },
    "addiesdive-relogio-de-aco-inoxidavel-masculino-e-485122": { nome: "Reloj de cuarzo Addiesdive de acero inoxidable", titulo: "Reloj Addiesdive de acero inoxidable para hombre, reloj de cuarzo de negocios y ocio europeo y americano, sumergible" },
    "relogio-de-quartzo-analogico-masculino-com-calen-961705": { nome: "Reloj analógico con brazalete de acero", titulo: "Reloj de cuarzo analógico de hombre con calendario, brazalete de acero inoxidable, Fashion" },
    "homens-led-digital-relogios-moda-luminosa-esport-160680": { nome: "Reloj LED Digital militar", titulo: "Relojes LED Digitales de hombre, moda luminosa, deporte, impermeable, ejército, militar, fecha, nuevo" },
    "1-2-pecas-relogios-masculinos-de-negocios-relogi-529149": { nome: "Reloj de cuarzo con brazalete de acero", titulo: "Relojes de negocios de hombre, reloj de cuarzo de moda con brazalete de acero y pulsera a juego" },
    "relogio-digital-de-luxo-para-homens-em-aco-inoxi-430367": { nome: "Reloj Digital de Lujo en Acero Inoxidable", titulo: "Reloj Digital de Lujo para Hombre en Acero Inoxidable, Reloj Electrónico Simple de Negocios, Oro y Plata" },
    "poedagar-quadrado-de-luxo-relogio-de-pulso-mascu-059976": { nome: "Reloj de pulsera cuadrado Poedagar", titulo: "Reloj de pulsera cuadrado de lujo Poedagar para hombre, sumergible, luminoso, fecha, acero inoxidable" },
    "set-homens-relogios-de-negocios-casual-pulseira--994516": { nome: "Reloj Analógico con Correa de Piel", titulo: "Relojes de Negocios Casual de Hombre, Correa de Piel, Reloj de Cuarzo Analógico, Conjunto con Collar y Pulsera" },
    "relogio-de-pulso-de-quartzo-masculino-da-moda-co-980856": { nome: "Reloj de cuarzo con correa de piel", titulo: "Reloj de pulsera de cuarzo de moda para hombre con correa de piel" },
    "tomi-relogio-masculino-de-luxo-conjunto-de-caixa-450110": { nome: "Reloj Tomi de lujo con caja de regalo", titulo: "Reloj Tomi de lujo para hombre, conjunto con caja de regalo, caja de oro rosa de alta calidad, simple y versátil" },
    /* beleza */
    "creme-facial-de-sangue-de-dragao-retinol-placent-087608": { nome: "Crema facial de sangre de dragón con retinol", titulo: "Crema facial de sangre de dragón, retinol, placenta, esencia, luminosidad, reafirmante, cosmética coreana" },
    "45-135pcs-sanrio-hello-kitty-cartoon-pimples-def-026351": { nome: "Parche de Hidrocoloide para el Acné Hello Kitty", titulo: "Parche para Granos Sanrio Hello Kitty - Pegatina Invisible de Hidrocoloide para el Acné, Parche Decorativo" },
    "rosto-acne-remendo-invisivel-cuidados-com-a-pele-632860": { nome: "Parche invisible para el acné", titulo: "Parche facial para el acné, invisible, cuidado de la piel, parches para granos, antiinflamatorio, pegatina absorbente" },
    "retinol-levantamento-endurecimento-creme-colagen-934472": { nome: "Crema facial con retinol y colágeno", titulo: "Crema reafirmante con retinol, colágeno, suaviza arrugas, crema facial hidratante, iluminadora" },
    "creme-facial-anti-idade-com-retinol-e-colageno-6-619048": { nome: "Crema Facial Antiedad con Retinol y Colágeno", titulo: "Crema Facial Antiedad con Retinol y Colágeno 60g, Hidratante Intensa y Reafirmante, Ácido Hialurónico" },
    "creme-facial-e-para-pescoco-com-retinol-e-colage-752346": { nome: "Crema Facial y de Cuello con Retinol", titulo: "Crema Facial y de Cuello con Retinol y Colágeno 45g, Hidratante, No Grasa, Fácil de Aplicar y Absorber" },
    "de-remendos-de-acne-estrela-multicoloridos-remen-413863": { nome: "Parches correctores de acné estrella", titulo: "Parches de acné estrella multicolor, parches faciales, pegatinas correctoras de acné y parches para granos" },
    "1-2-3-pcs-rolo-de-gelo-facial-cuidados-com-a-pel-655724": { nome: "Rodillo de hielo facial con gua sha", titulo: "Rodillo de hielo facial, cuidado de la piel, rodillo facial, gua sha, set de herramientas faciales" },
    "creme-facial-do-sangue-do-dragao-do-retinol-hidr-524461": { nome: "Crema facial de sangre de dragón con Retinol", titulo: "Crema facial de sangre de dragón con Retinol, hidrata y repara, ilumina, líneas finas, poros, acné" },
    "mascara-facial-recarregavel-com-led-7-cores-foto-027165": { nome: "Mascarilla facial led de 7 colores", titulo: "Mascarilla facial led recargable, 7 colores, fotones, mascarilla de belleza, rejuvenecimiento, lifting facial en casa" },
    /* casa */
    "suporte-de-colher-de-cozinha-garfo-espatula-rack-152512": { nome: "Soporte de cuchara y espátula para cocina", titulo: "Soporte de cuchara de cocina, tenedor, rejilla para espátula, organizador de estante, plástico, antideslizante" },
    "conjunto-de-recipientes-de-armazenamento-de-alim-976842": { nome: "Juego de 6 recipientes de acero inoxidable", titulo: "Juego de 6 recipientes de acero inoxidable para alimentos con tapas - a prueba de fugas y apilables" },
    "grau-alimenticio-silicone-preservacao-capa-reuti-723031": { nome: "Tapas redondas de silicona reutilizables", titulo: "Tapa de silicona de grado alimentario, reutilizable, hermética, universal, tapas redondas elásticas para platos" },
    "recipiente-de-armazenamento-de-ovos-de-3-camadas-031651": { nome: "Organizador de huevos de 3 niveles", titulo: "Recipiente de 3 niveles para huevos en la nevera, guarda 24 huevos, organizador de cocina de gran capacidad" },
    "ganchos-de-parede-impermeaveis-e-a-prova-de-oleo-835301": { nome: "Ganchos de pared impermeables", titulo: "Ganchos de pared impermeables y a prueba de aceite, ganchos adhesivos para cocina, ducha y puerta del baño" },
    "frascos-de-plastico-selados-para-cozinha-organiz-459385": { nome: "Botes herméticos para cereales", titulo: "Botes de plástico herméticos para cocina, organizador de cereales, bote grande, caja a prueba de humedad" },
    "non-punching-dishwashing-cloth-storage-clip-cozi-742815": { nome: "Toallero de cocina", titulo: "Clip de Almacenaje para Paños sin Taladrar, Gancho para Guantes de Cocina, Toallero, Colgar en Pared" },
    "1pc-cinza-diversos-saco-de-armazenamento-montage-036864": { nome: "Dispensador de bolsas de plástico de pared", titulo: "Bolsa de almacenaje gris, dispensador de bolsas de malla de pared, colgante y reutilizable" },
    "2-6-pcs-fixado-na-parede-sacos-de-lixo-titular-s-303618": { nome: "Organizador de bolsas de basura de pared", titulo: "Soporte de pared para bolsas de basura, caja organizadora, contenedor de film plástico" },
    "prateleira-de-cozinha-de-aco-inoxidavel-rack-de--051426": { nome: "Estante de fregadero de acero inoxidable", titulo: "Estante de cocina de acero inoxidable, escurridor de esponja, escurridor de fregadero, accesorios de lavado" },
    /* pet */
    "bola-de-brinquedo-para-caes-bola-de-brinquedo-na-804768": { nome: "Pelota de juguete resistente a mordidas", titulo: "Pelota de juguete para perros, pelota no tóxica resistente a mordidas para perros y cachorros" },
    "brinquedo-de-pelucia-interativo-para-caes-polvo--592273": { nome: "Pulpo de Peluche con Sonido para Perros", titulo: "Juguete de Peluche Interactivo para Perros, Pulpo con Sonido y Tentáculos Crujientes, Juguete Mordedor" },
    "cao-dormindo-com-um-cachorro-abraco-pato-brinque-788774": { nome: "Pato amarillo de abrazo para perros", titulo: "Pato de abrazo para perros que duermen, alivia el aburrimiento, patito amarillo de compañía" },
    "novo-brinquedo-interativo-da-bola-do-cao-bola-do-976362": { nome: "Pelota rodante automática recargable", titulo: "Nuevo juguete interactivo de pelota para perros, pelota rodante recargable, juguete interactivo para cachorros" },
    "brinquedos-para-gatos-e-caes-para-mastigadores-a-622667": { nome: "Peluche con Sonido para Gatos y Perros", titulo: "Juguetes para Gatos y Perros Mordedores, Juguete Interactivo de Peluche con Sonido para Gatos y Perros" },
    "bola-interativa-inteligente-para-gatos-duravel-e-008307": { nome: "Pelota Interactiva Inteligente para Gatos", titulo: "Pelota Interactiva Inteligente para Gatos, Duradera, Fácil de Limpiar, con Evitación de Obstáculos" },
    "50cm-macio-colorido-pato-brinquedo-de-pelucia-pa-058137": { nome: "Pato de peluche suave 50cm", titulo: "Pato de peluche suave y colorido de 50cm para gatos y perros, compañero relajante, alivia la ansiedad" },
    "brinquedo-de-pelucia-para-animais-de-estimacao-a-409759": { nome: "Peluche resistente a mordidas", titulo: "Juguete de peluche para mascotas, animales tiernos, resistente a mordidas, interactivo, con sonido" },
    "1pc-pet-no-brinquedo-para-cao-e-gato-forma-cenou-578396": { nome: "Juguete de cuerda con forma de zanahoria", titulo: "Juguete de nudo para perro y gato, forma de zanahoria, mordedores, juguetes de cuerda de algodón de interior" },
    "brinquedo-de-cachorro-de-pato-de-pelucia-resiste-255975": { nome: "Pato de peluche duradero con sonido", titulo: "Juguete de peluche de pato resistente a mordidas, juguete duradero con sonido, limpieza dental" },
    /* fitness */
    "faixa-de-resistencia-resistente-de-20-230lbs-tre-771538": { nome: "Banda de resistencia de 20 a 230lbs", titulo: "Banda de resistencia resistente de 20~230lbs, entrenamiento de agilidad, equipo de gimnasio, yoga, pilates" },
    "1-peca-de-faixas-de-resistencia-de-4-niveis-com--177417": { nome: "Bandas de resistencia de 4 niveles con asas", titulo: "Bandas de resistencia de 4 niveles con asas para entrenar en casa y fuerza - perfectas para yoga" },
    "tensor-de-pedal-de-quatro-tubos-multifuncional-e-133290": { nome: "Tensor de pedal de cuatro tubos", titulo: "Tensor de pedal de cuatro tubos multifuncional, equipo de fitness en casa, yoga, abdominales, banda elástica" },
    "rack-push-up-em-forma-de-u-equipamento-fitness-p-299425": { nome: "Rack de flexiones en forma de U", titulo: "Rack de flexiones en forma de U, Equipo de Fitness, Empuñadura de Espuma, Barra para Pecho, Gimnasio" },
    "cinto-elastico-esportivo-auditivo-pull-up-auxili-266845": { nome: "Cinturón elástico de asistencia para dominadas", titulo: "Cinturón elástico deportivo de asistencia para dominadas, hombre y mujer, equipo de goma de gimnasio y pilates" },
    "tapete-de-yoga-pilates-fitness-3-4-6mm-de-espess-272203": { nome: "Esterilla de yoga antideslizante", titulo: "Esterilla de yoga pilates fitness, 3/4/6mm de grosor, antideslizante, colchoneta de viaje y ejercicio" },
    "wosweir-elastic-training-gum-resistencia-bandas--715244": { nome: "Bandas de Resistencia WOSWEIR", titulo: "WOSWEIR Bandas Elásticas de Resistencia, Gimnasio, Fitness en Casa, Expansor, Yoga, Asistencia de Dominadas, Crossfit" },
    "banda-de-resistencia-resistente-latex-cinto-elas-516905": { nome: "Banda de resistencia de látex", titulo: "Banda de resistencia de látex resistente, cinturón elástico de asistencia para pilates y gimnasio en casa" },
    "a-nova-corda-de-pular-fio-de-aco-exercicio-de-pu-697910": { nome: "Comba de alambre de acero ajustable", titulo: "Nueva comba de alambre de acero, salto ajustable, equipo deportivo de entrenamiento y fitness" },
    "nova-corda-de-pular-com-cabo-de-aco-ajustavel-pa-687882": { nome: "Comba con Cable de Acero Ajustable", titulo: "Nueva Comba con Cable de Acero Ajustable para Fitness en Casa, Equipo Deportivo Sin Enredos" },
    /* gadgets */
    "bluetooth-5-3-fones-de-ouvido-para-jogos-modo-du-216387": { nome: "Auriculares Bluetooth 5.3 para juegos", titulo: "Auriculares Bluetooth 5.3 para juegos, modo dual, inalámbricos, plegables, reducción de ruido, iphone xiaomi" },
    "multifuncional-portatil-dobravel-headmounted-sem-036557": { nome: "Auriculares bluetooth 5.0 plegables", titulo: "Auriculares inalámbricos bluetooth 5.0 de diadema, multifuncionales, portátiles y plegables, con ranura tf" },
    "fone-de-ouvido-bluetooth-6-0-lenovo-le302-sem-fi-477059": { nome: "Auriculares Lenovo LE302 Bluetooth 6.0", titulo: "Auriculares Inalámbricos Lenovo LE302 Bluetooth 6.0 con Larga Duración de Batería, Deportivos con Clip" },
    "ugreen-studio-pro-48db-anc-fones-de-ouvido-sem-f-585460": { nome: "Auriculares UGREEN Studio Pro ANC", titulo: "Auriculares Inalámbricos UGREEN Studio Pro 48dB ANC de Diadema, Bluetooth, Cancelación Activa de Ruido" },
    "fone-de-ouvido-moondrop-space-travel-2-hifi-com--878815": { nome: "Auriculares MOONDROP Space Travel 2", titulo: "Auriculares MOONDROP Space Travel 2 HiFi con cancelación de ruido, TWS inalámbricos Bluetooth 6.0 ANC, baja latencia" },
    "fone-de-ouvido-estereo-p47-bluetooth-5-0-dobrave-256069": { nome: "Auriculares Estéreo P47 Bluetooth 5.0", titulo: "Auriculares Estéreo P47 Bluetooth 5.0 Plegables Inalámbricos para Juegos y Deporte, compatibles con iPhone" },
    "binnune-bw06-fones-de-ouvido-bluetooth-gamer-com-114453": { nome: "Auriculares gaming BINNUNE BW06 con micrófono", titulo: "Auriculares gaming bluetooth BINNUNE BW06 con micrófono para ps5 ps4 pc mac playstation, inalámbricos 2.4ghz" },
    "fones-de-ouvido-bluetooth-5-4-lenovo-gm2-pro-hea-350280": { nome: "Auriculares Lenovo GM2 Pro Bluetooth 5.4", titulo: "Auriculares Lenovo GM2 Pro Bluetooth 5.4, Headset Deportivo Inalámbrico, In-Ear, Baja Latencia, Modo Dual" },
    "smailwolf-l80-bluetooth-sem-fio-com-fio-de-tres--888793": { nome: "Auriculares SmaILWOLF L80 de tres modos", titulo: "Auriculares SmaILWOLF L80 Bluetooth inalámbricos y con cable de tres modos para juegos, portátiles y ligeros" },
    "mchose-v9-pro-fone-de-ouvido-com-microfone-tres--477228": { nome: "Auriculares MCHOSE V9 Pro con micrófono", titulo: "Auriculares MCHOSE V9 Pro con micrófono, Bluetooth inalámbrico de tres modos, para pc gamer" },
    /* infantil */
    "lanterna-de-projetor-para-criancas-10-cartoes-80-919420": { nome: "Linterna proyector con 10 tarjetas", titulo: "Linterna proyector para niños, 10 tarjetas, 80 dibujos, juguetes para dormir, luz de dibujos, juguete educativo" },
    "inteligencia-matematica-brinquedos-matematicos-e-210743": { nome: "Balanza rana para aprender matemáticas", titulo: "Juguetes de inteligencia matemática, divertida balanza rana, aprendizaje temprano, suma y resta para niños" },
    "1pc-reutilizavel-criancas-livros-de-desenho-de-a-918127": { nome: "Libro mágico de dibujo con agua y rotulador", titulo: "Libro reutilizable de dibujo con agua mágica y rotulador, libro para colorear y dibujar repetible" },
    "brinquedo-montessori-para-aprendizagem-do-bebe-p-591674": { nome: "Puzle Montessori para Bebés", titulo: "Juguete Montessori de Aprendizaje para Bebés, Pato, Rana, Cerdo, Puzle Educativo, Regalo para Niños" },
    "desenho-com-fio-livro-de-desenho-de-graffiti-inf-448734": { nome: "Libro de dibujo infantil con números", titulo: "Dibujo con hilo, libro de dibujo de graffiti infantil, aprender números, educación temprana para mejorar notas" },
    "geometria-spirograph-desenho-estenceis-conjunto--151889": { nome: "Juego de plantillas de geometría", titulo: "Juego de plantillas de dibujo espirógrafo de geometría, plantilla de pintura, juguete educativo de manualidades" },
    "quebra-cabeca-de-geometria-montessori-para-educa-102211": { nome: "Puzle de Geometría Montessori", titulo: "Puzle de Geometría Montessori para Educación Infantil, Tablero Fijo Portátil para el Desarrollo, Puzle" },
    "crianca-montessori-brinquedos-para-criancas-de-2-055424": { nome: "Diana adhesiva montessori", titulo: "Juguetes montessori para niños de 2 a 4 años, diana adhesiva de animales de dibujos con pelotas" },
    "8-5-tabuleiro-de-desenho-lcd-escrita-tablet-para-109280": { nome: "Pizarra de dibujo lcd de 8.5", titulo: "Pizarra de dibujo lcd de 8.5\" para niños y niñas, tableta de escritura, juguetes educativos montessori" },
    "brinquedos-educativos-conjunto-de-brinquedos-de--829128": { nome: "Juego de sillas apilables", titulo: "Juguetes educativos, juego de sillas apilables, sillas de bloques de construcción para niños" },
    /* joias */
    "colar-inicial-a-z-colar-banhado-a-ouro-18k-com-l-177356": { nome: "Collar de letra bañado en oro 18K", titulo: "Collar inicial A-Z, bañado en oro 18K con letra, collar de acero inoxidable para mujer" },
    "colar-de-pingente-de-zirconia-multicolorido-banh-432384": { nome: "Collar con Colgante de Circonita Multicolor", titulo: "Collar con Colgante de Circonita Multicolor Bañado en Oro, Joya Elegante Vintage con Encanto para Regalar" },
    "colar-de-cruz-premium-para-mulheres-banhado-a-ou-137696": { nome: "Collar de cruz bañado en oro 18k", titulo: "Collar de cruz premium para mujer, cadena bañada en oro 18k con colgante de cruz de moda para chicas" },
    "18k-banhado-a-ouro-aco-inoxidavel-circulos-inter-213547": { nome: "Collar de círculos entrelazados 18k", titulo: "Círculos entrelazados de acero inoxidable bañados en oro 18k, estilo infinito, collar con números romanos" },
    "colar-saint-jude-banhado-a-ouro-14k-com-pingente-080134": { nome: "Collar Saint Jude bañado en oro 14K", titulo: "Collar Saint Jude bañado en oro 14K con colgante San Judas, cadena Figaro" },
    "corrente-de-cobra-banhada-a-ouro-aco-inoxidavel--998928": { nome: "Cadena de serpiente bañada en oro 3mm", titulo: "Cadena de serpiente de acero inoxidable bañada en oro, collar plano de 3mm, gargantilla de moda, hip hop" },
    "marca-18k-banhado-a-ouro-novo-luxo-colorido-cris-024286": { nome: "Collar de circonita cristal bañado en oro 18k", titulo: "Marca bañada en oro 18k, nuevo collar de lujo de circonita cristal de colores para mujer, joyería de fiesta" },
    "colar-com-pingente-de-sol-espiral-para-mulheres--876977": { nome: "Collar con colgante de sol espiral", titulo: "Collar con colgante de sol espiral para mujer - acero inoxidable hipoalergénico bañado en oro 18K, uso diario" },
    "novo-aco-inoxidavel-zircao-colares-para-mulheres-403094": { nome: "Collar de cuatro hojas bañado en oro 18k", titulo: "Nuevos collares de circonita de acero inoxidable para mujer, trébol de cuatro hojas bañado en oro 18k, cadena de lujo" },
    "colar-de-corrente-fina-de-aco-inoxidavel-banhado-771695": { nome: "Collar de cadena fina de clavícula", titulo: "Collar de cadena fina de acero inoxidable bañado en oro para mujer, estilo simple, cadena de clavícula" },
  },
};

/**
 * O produto no idioma da loja — nome e título juntos, ou nada.
 *
 * Devolver os dois de uma vez, e não um de cada vez, é o que impede a página de
 * abrir com o nome em inglês e a descrição em português: ou o produto tem
 * tradução, ou ele sai inteiro como veio.
 */
export function produtoNoIdioma(handle: string, idioma: string): ProdutoTraduzido | undefined {
  return CATALOGO_TRADUZIDO[idioma]?.[handle];
}
