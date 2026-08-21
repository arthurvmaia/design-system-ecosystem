/**
 * O NOME DE CADA PRODUTO DO ACERVO, escrito como uma loja escreve.
 *
 * `nome-de-produto.ts` encurta o anúncio do fornecedor por regra, e isso já
 * resolve o pior: o título de 120 caracteres cortado no meio da palavra. Mas
 * regra nenhuma conserta a ORDEM das palavras, e é ela que denuncia a origem —
 * "50cm macio colorido pato brinquedo de pelúcia" é como o buscador da
 * AliExpress gosta de ler, não como uma loja apresenta um produto. A mesma
 * mercadoria, escrita por gente, é "Pato de pelúcia macio 50cm".
 *
 * ## A regra que este arquivo obedece
 *
 * **Só palavras que já estavam no anúncio.** Reordenar, escolher e descartar,
 * sim; acrescentar, não. Nome de produto inventado é promessa sobre mercadoria
 * que ninguém conferiu — e o teste `nome-de-produto.test.mjs` cobra isso
 * palavra por palavra, admitindo apenas as palavras de ligação, que são
 * gramática e não conteúdo.
 *
 * ## Por que uma tabela, e não o arquivo do catálogo
 *
 * `catalogo-nichos.ts` é GERADO pelo extrator, e diz isso no cabeçalho: editar
 * à mão ali é trabalho que a próxima extração apaga. Aqui a chave é o `handle`
 * do produto, que sai do título de origem e sobrevive; produto novo que o
 * extrator traga e que não esteja nesta tabela cai na regra automática, que
 * continua valendo. O teste também cobra o contrário: `handle` desta tabela que
 * não exista mais no catálogo é nome curado que não chega a loja nenhuma.
 */
export const NOMES_CURADOS: Record<string, string> = {
  /* roupas */
  "mulher-roupas-de-manga-curta-camiseta-fino-ajust-221772": "Camiseta de malha manga curta",
  "bodysuit-manga-longa-feminino-corpo-streetwear-d-189289": "Bodysuit manga longa pescoço quadrado",
  "1pc-feminino-sexy-cor-solida-camisola-tubo-de-se-898632": "Camisola tubo sem costura cor sólida",
  "elegante-solido-basico-de-malha-topos-feminino-g-613824": "Pulôver de malha gola alta manga longa",
  "feminino-sexy-sem-costas-tanque-macacao-superior-017983": "Bodysuit halter sem mangas",
  "shorts-de-fitness-feminino-apertado-ciclismo-yog-820432": "Shorts de fitness cintura alta",
  "cinta-solida-bodycon-sexy-corpo-casual-basico-br-984359": "Bodysuit básico sem mangas",
  "calcoes-esportivos-femininos-verao-2024-nova-cor-923781": "Calções esportivos cintura elástica",
  "gotico-impressao-preto-sem-alcas-tubo-superior-f-356207": "Tubo superior gótico sem alças",
  "camiseta-esportiva-feminina-ultraleve-de-cor-sol-609273": "Camiseta esportiva de secagem rápida",

  /* óculos */
  "scvcn-novo-ciclismo-ao-ar-livre-oculos-de-sol-do-769871": "Óculos de sol Scvcn de ciclismo",
  "oculos-de-sol-sem-aro-para-homens-e-mulheres-ton-070597": "Óculos de sol quadrados sem aro",
  "moda-vintage-quadrado-polarizado-oculos-de-sol-d-041223": "Óculos de sol polarizado quadrado vintage",
  "novos-oculos-de-sol-vintage-quadrados-para-mulhe-561635": "Óculos de Sol Vintage Quadrados",
  "oculos-de-sol-sem-aro-retangulo-moda-popular-fem-960153": "Óculos de sol retângulo sem aro",
  "quadrado-sem-aro-oculos-de-sol-feminino-marca-lu-589263": "Óculos de sol quadrado sem aro uv400",
  "classico-gotico-steampunk-oculos-de-sol-marca-lu-225736": "Óculos de sol steampunk redondo",
  "oculos-de-sol-masculinos-quadrados-classicos-con-521175": "Óculos de sol quadrados armação preta",
  "oculos-de-visao-noturna-pc-quadro-polarizado-ocu-734860": "Óculos de visão noturna polarizado",
  "oculos-de-sol-promocionais-estilo-classico-oculo-265777": "Óculos De Sol Unisex Estilo Clássico",

  /* relógios */
  "relogio-esportivo-digital-masculino-a-prova-d-ag-248263": "Relógio digital esportivo à prova d'água",
  "addiesdive-relogio-de-aco-inoxidavel-masculino-e-485122": "Relógio de quartzo Addiesdive de aço inoxidável",
  "relogio-de-quartzo-analogico-masculino-com-calen-961705": "Relógio analógico com pulseira de aço",
  "homens-led-digital-relogios-moda-luminosa-esport-160680": "Relógio LED Digital militar",
  "1-2-pecas-relogios-masculinos-de-negocios-relogi-529149": "Relógio de quartzo com pulseira de aço",
  "relogio-digital-de-luxo-para-homens-em-aco-inoxi-430367": "Relógio Digital de Luxo em Aço Inoxidável",
  "poedagar-quadrado-de-luxo-relogio-de-pulso-mascu-059976": "Relógio de pulso quadrado Poedagar",
  "set-homens-relogios-de-negocios-casual-pulseira--994516": "Relógio Analógico com Pulseira de Couro",
  "relogio-de-pulso-de-quartzo-masculino-da-moda-co-980856": "Relógio de quartzo com pulseira de couro",
  "tomi-relogio-masculino-de-luxo-conjunto-de-caixa-450110": "Relógio Tomi de luxo com caixa de presente",

  /* beleza */
  "creme-facial-de-sangue-de-dragao-retinol-placent-087608": "Creme facial de sangue de dragão com retinol",
  "45-135pcs-sanrio-hello-kitty-cartoon-pimples-def-026351": "Adesivo de Hidrocoloide para Acne Hello Kitty",
  "rosto-acne-remendo-invisivel-cuidados-com-a-pele-632860": "Adesivo invisível para acne",
  "retinol-levantamento-endurecimento-creme-colagen-934472": "Creme facial com retinol e colágeno",
  "creme-facial-anti-idade-com-retinol-e-colageno-6-619048": "Creme Facial Anti-idade com Retinol e Colágeno",
  "creme-facial-e-para-pescoco-com-retinol-e-colage-752346": "Creme Facial e para Pescoço com Retinol",
  "de-remendos-de-acne-estrela-multicoloridos-remen-413863": "Adesivos corretivos de acne estrela",
  "1-2-3-pcs-rolo-de-gelo-facial-cuidados-com-a-pel-655724": "Rolo de gelo facial com guasha",
  "creme-facial-do-sangue-do-dragao-do-retinol-hidr-524461": "Creme facial do sangue do dragão com Retinol",
  "mascara-facial-recarregavel-com-led-7-cores-foto-027165": "Máscara facial de led com 7 cores",

  /* casa */
  "suporte-de-colher-de-cozinha-garfo-espatula-rack-152512": "Suporte de colher e espátula para cozinha",
  "conjunto-de-recipientes-de-armazenamento-de-alim-976842": "Conjunto de 6 recipientes de aço inoxidável",
  "grau-alimenticio-silicone-preservacao-capa-reuti-723031": "Tampas redondas de silicone reutilizável",
  "recipiente-de-armazenamento-de-ovos-de-3-camadas-031651": "Organizador de ovos de 3 camadas",
  "ganchos-de-parede-impermeaveis-e-a-prova-de-oleo-835301": "Ganchos de parede impermeáveis",
  "frascos-de-plastico-selados-para-cozinha-organiz-459385": "Frascos selados para grãos",
  "non-punching-dishwashing-cloth-storage-clip-cozi-742815": "Toalheiro de cozinha",
  "1pc-cinza-diversos-saco-de-armazenamento-montage-036864": "Dispensador de sacos plásticos de parede",
  "2-6-pcs-fixado-na-parede-sacos-de-lixo-titular-s-303618": "Organizador de sacos de lixo de parede",
  "prateleira-de-cozinha-de-aco-inoxidavel-rack-de--051426": "Prateleira de pia em aço inoxidável",

  /* pet */
  "bola-de-brinquedo-para-caes-bola-de-brinquedo-na-804768": "Bola de brinquedo resistente à mordida",
  "brinquedo-de-pelucia-interativo-para-caes-polvo--592273": "Polvo de Pelúcia com Som para Cães",
  "cao-dormindo-com-um-cachorro-abraco-pato-brinque-788774": "Pato amarelo de abraço para cachorro",
  "novo-brinquedo-interativo-da-bola-do-cao-bola-do-976362": "Bola de rolamento automático recarregável",
  "brinquedos-para-gatos-e-caes-para-mastigadores-a-622667": "Pelúcia com Som para Gatos e Cães",
  "bola-interativa-inteligente-para-gatos-duravel-e-008307": "Bola Interativa Inteligente para Gatos",
  "50cm-macio-colorido-pato-brinquedo-de-pelucia-pa-058137": "Pato de pelúcia macio 50cm",
  "brinquedo-de-pelucia-para-animais-de-estimacao-a-409759": "Pelúcia resistente à mordida",
  "1pc-pet-no-brinquedo-para-cao-e-gato-forma-cenou-578396": "Brinquedo de corda em forma de cenoura",
  "brinquedo-de-cachorro-de-pato-de-pelucia-resiste-255975": "Pato de pelúcia durável com som",

  /* fitness */
  "faixa-de-resistencia-resistente-de-20-230lbs-tre-771538": "Faixa de resistência de 20 a 230lbs",
  "1-peca-de-faixas-de-resistencia-de-4-niveis-com--177417": "Faixas de resistência de 4 níveis com alças",
  "tensor-de-pedal-de-quatro-tubos-multifuncional-e-133290": "Tensor de pedal de quatro tubos",
  "rack-push-up-em-forma-de-u-equipamento-fitness-p-299425": "Rack push-up em forma de U",
  "cinto-elastico-esportivo-auditivo-pull-up-auxili-266845": "Cinto elástico auxiliar de pull-up",
  "tapete-de-yoga-pilates-fitness-3-4-6mm-de-espess-272203": "Tapete de yoga antiderrapante",
  "wosweir-elastic-training-gum-resistencia-bandas--715244": "Bandas de Resistência WOSWEIR",
  "banda-de-resistencia-resistente-latex-cinto-elas-516905": "Banda de resistência de látex",
  "a-nova-corda-de-pular-fio-de-aco-exercicio-de-pu-697910": "Corda de pular de fio de aço ajustável",
  "nova-corda-de-pular-com-cabo-de-aco-ajustavel-pa-687882": "Corda de Pular com Cabo de Aço Ajustável",

  /* gadgets */
  "bluetooth-5-3-fones-de-ouvido-para-jogos-modo-du-216387": "Fones de ouvido Bluetooth 5.3 para jogos",
  "multifuncional-portatil-dobravel-headmounted-sem-036557": "Fone de ouvido bluetooth 5.0 dobrável",
  "fone-de-ouvido-bluetooth-6-0-lenovo-le302-sem-fi-477059": "Fone de Ouvido Lenovo LE302 Bluetooth 6.0",
  "ugreen-studio-pro-48db-anc-fones-de-ouvido-sem-f-585460": "Fones de ouvido UGREEN Studio Pro ANC",
  "fone-de-ouvido-moondrop-space-travel-2-hifi-com--878815": "Fone de ouvido MOONDROP Space Travel 2",
  "fone-de-ouvido-estereo-p47-bluetooth-5-0-dobrave-256069": "Fone de Ouvido Estéreo P47 Bluetooth 5.0",
  "binnune-bw06-fones-de-ouvido-bluetooth-gamer-com-114453": "Fone gamer BINNUNE BW06 com microfone",
  "fones-de-ouvido-bluetooth-5-4-lenovo-gm2-pro-hea-350280": "Fones de Ouvido Lenovo GM2 Pro Bluetooth 5.4",
  "smailwolf-l80-bluetooth-sem-fio-com-fio-de-tres--888793": "Fone de ouvido SmaILWOLF L80 três modos",
  "mchose-v9-pro-fone-de-ouvido-com-microfone-tres--477228": "Fone de ouvido MCHOSE V9 Pro com microfone",

  /* infantil */
  "lanterna-de-projetor-para-criancas-10-cartoes-80-919420": "Lanterna de projetor com 10 cartões",
  "inteligencia-matematica-brinquedos-matematicos-e-210743": "Escala de sapo de educação matemática",
  "1pc-reutilizavel-criancas-livros-de-desenho-de-a-918127": "Livro de desenho de água mágica com caneta",
  "brinquedo-montessori-para-aprendizagem-do-bebe-p-591674": "Quebra-cabeça Montessori para Bebê",
  "desenho-com-fio-livro-de-desenho-de-graffiti-inf-448734": "Livro de desenho infantil com números",
  "geometria-spirograph-desenho-estenceis-conjunto--151889": "Conjunto de estênceis de geometria",
  "quebra-cabeca-de-geometria-montessori-para-educa-102211": "Quebra-Cabeça de Geometria Montessori",
  "crianca-montessori-brinquedos-para-criancas-de-2-055424": "Placa de dardo pegajosa montessori",
  "8-5-tabuleiro-de-desenho-lcd-escrita-tablet-para-109280": "Tabuleiro de desenho lcd de 8.5",
  "brinquedos-educativos-conjunto-de-brinquedos-de--829128": "Conjunto de empilhamento de cadeiras",

  /* joias */
  "colar-inicial-a-z-colar-banhado-a-ouro-18k-com-l-177356": "Colar de letra banhado a ouro 18K",
  "colar-de-pingente-de-zirconia-multicolorido-banh-432384": "Colar de Pingente de Zircônia Multicolorido",
  "colar-de-cruz-premium-para-mulheres-banhado-a-ou-137696": "Colar de cruz banhado a ouro 18k",
  "18k-banhado-a-ouro-aco-inoxidavel-circulos-inter-213547": "Colar de círculos intertravados 18k",
  "colar-saint-jude-banhado-a-ouro-14k-com-pingente-080134": "Colar Saint Jude banhado a ouro 14K",
  "corrente-de-cobra-banhada-a-ouro-aco-inoxidavel--998928": "Corrente de cobra banhada a ouro 3mm",
  "marca-18k-banhado-a-ouro-novo-luxo-colorido-cris-024286": "Colar de cristal zircão banhado a ouro 18k",
  "colar-com-pingente-de-sol-espiral-para-mulheres--876977": "Colar com pingente de sol espiral",
  "novo-aco-inoxidavel-zircao-colares-para-mulheres-403094": "Colar de quatro folhas banhado a ouro 18k",
  "colar-de-corrente-fina-de-aco-inoxidavel-banhado-771695": "Colar de corrente fina de clavícula",
};
