/**
 * Dez produtos reais por nicho, para a loja gerada nascer com vitrine de
 * verdade em vez de produto de demonstração.
 *
 * Extraídos das buscas públicas da AliExpress (pt.aliexpress.com) em 2026-08-08:
 * título, preço em centavos de real, preço comparado, desconto, nota, volume de
 * vendas e imagens são os da própria listagem — nada aqui é inventado.
 *
 * Arquivo gerado; para atualizar, rode o extrator de novo em vez de editar à mão.
 */

export type ProdutoDoNicho = {
  id: number; handle: string; title: string;
  price: number; compareAtPrice: number | null; discount: number | null;
  rating: number | null; sold: string; images: string[];
};

/** Dez por nicho: é o teto pedido, e o que cabe numa vitrine sem encher linguiça. */
export const PRODUTOS_POR_NICHO: Record<string, ProdutoDoNicho[]> = {
  "roupas": [
    {
      "id": 1005006819221772,
      "handle": "mulher-roupas-de-manga-curta-camiseta-fino-ajust-221772",
      "title": "Mulher roupas de manga curta camiseta fino ajuste topos feminino o pescoço bainha de malha camiseta street wear sexo des",
      "price": 1311,
      "compareAtPrice": 5034,
      "discount": 73,
      "rating": 4.6,
      "sold": "10.000+  vendido(s)",
      "images": [
        "https://ae-pic-a1.aliexpress-media.com/kf/S14f40b6f656047b894c035b9bbb017954.jpg",
        "https://ae-pic-a1.aliexpress-media.com/kf/S4626bc30587849e5a94ef308cd42973bc.jpg",
        "https://ae-pic-a1.aliexpress-media.com/kf/Sf360d67df88c466993a680d66c13fedat.jpg",
        "https://ae-pic-a1.aliexpress-media.com/kf/S72a57e2b53024f87933c200cafa114fcb.jpg"
      ]
    },
    {
      "id": 1005007345189289,
      "handle": "bodysuit-manga-longa-feminino-corpo-streetwear-d-189289",
      "title": "Bodysuit manga longa feminino corpo streetwear dropshipping forefair sexy bodycon pescoço quadrado bainha virilha básico",
      "price": 999,
      "compareAtPrice": 4388,
      "discount": 77,
      "rating": 4.9,
      "sold": "10.000+  vendido(s)",
      "images": [
        "https://ae-pic-a1.aliexpress-media.com/kf/Sf924875337cc4de08d3da4eacf9805ffg.jpg",
        "https://ae-pic-a1.aliexpress-media.com/kf/S77fb2c8b9f9241f4ac5c2b0c9cfb9b1cz.jpg",
        "https://ae-pic-a1.aliexpress-media.com/kf/S93c824a946704e57858c06def411d2c4j.jpg",
        "https://ae-pic-a1.aliexpress-media.com/kf/S378867f7da294ad6a001b16132607298X.jpg"
      ]
    },
    {
      "id": 1005007037898632,
      "handle": "1pc-feminino-sexy-cor-solida-camisola-tubo-de-se-898632",
      "title": "1pc feminino sexy cor sólida camisola tubo de seda gelo sem costura esportes regata sem fio roupa interior sutiã acolcho",
      "price": 599,
      "compareAtPrice": 2670,
      "discount": 77,
      "rating": 4.9,
      "sold": "10.000+  vendido(s)",
      "images": [
        "https://ae-pic-a1.aliexpress-media.com/kf/S6660efaf29c844da8d7f8915fd552d0dw.jpg",
        "https://ae-pic-a1.aliexpress-media.com/kf/S2a83a42ff34a47869f73bfe832f049bdn.jpg",
        "https://ae-pic-a1.aliexpress-media.com/kf/Sae4551ece2184c1aba7ec773f897f4f5D.jpg",
        "https://ae-pic-a1.aliexpress-media.com/kf/Sb62675ad881349a8bb4f80c8c87592459.jpg"
      ]
    },
    {
      "id": 1005006982613824,
      "handle": "elegante-solido-basico-de-malha-topos-feminino-g-613824",
      "title": "Elegante sólido básico de malha topos feminino gola alta camisola manga longa casual fino pulôver moda coreana simples r",
      "price": 1399,
      "compareAtPrice": 5140,
      "discount": 72,
      "rating": 4.9,
      "sold": "10.000+  vendido(s)",
      "images": [
        "https://ae-pic-a1.aliexpress-media.com/kf/S08d66e3a9847433dbafbd1eafca6628eL.jpg",
        "https://ae-pic-a1.aliexpress-media.com/kf/S8f0aaada2e9d4b64962095565c9d6f65p.jpg",
        "https://ae-pic-a1.aliexpress-media.com/kf/S85b6e4d47735492ab552da250cc6cf0cb.jpg",
        "https://ae-pic-a1.aliexpress-media.com/kf/Sfbf8536f1a1543e8a5202f079d3fc543p.jpg"
      ]
    },
    {
      "id": 1005007345017983,
      "handle": "feminino-sexy-sem-costas-tanque-macacao-superior-017983",
      "title": "Feminino sexy sem costas tanque macacão superior bodycon uma peça halter sem mangas bodysuit macacões curtos",
      "price": 1199,
      "compareAtPrice": 4182,
      "discount": 71,
      "rating": 4.9,
      "sold": "10.000+  vendido(s)",
      "images": [
        "https://ae-pic-a1.aliexpress-media.com/kf/S44631bedaa5c42ea8b13f2f6454ed95f0.jpg",
        "https://ae-pic-a1.aliexpress-media.com/kf/S23dd2cf44fca4566959ddf89dd73af6c3.jpg",
        "https://ae-pic-a1.aliexpress-media.com/kf/S6cb99451cff943caa342b65710f2a5efe.jpg",
        "https://ae-pic-a1.aliexpress-media.com/kf/Sc89454008f0745f788a17cfe08932e1cb.jpg"
      ]
    },
    {
      "id": 1005005784820432,
      "handle": "shorts-de-fitness-feminino-apertado-ciclismo-yog-820432",
      "title": "Shorts de fitness feminino apertado ciclismo yoga calças esportivas respiráveis cintura alta",
      "price": 2099,
      "compareAtPrice": 4416,
      "discount": 52,
      "rating": 4.6,
      "sold": "5.000+  vendido(s)",
      "images": [
        "https://ae-pic-a1.aliexpress-media.com/kf/S7b25f6cb0c694a3a98c76768f709943fI.jpg",
        "https://ae-pic-a1.aliexpress-media.com/kf/S6f090a546c9742e0b84ccd50f0563033O.jpg",
        "https://ae-pic-a1.aliexpress-media.com/kf/S4235943f29174e6faa46ff66bcded949t.jpg",
        "https://ae-pic-a1.aliexpress-media.com/kf/S5dc8a4aea49a444a99c411bf5ecdd535B.jpg"
      ]
    },
    {
      "id": 1005006635984359,
      "handle": "cinta-solida-bodycon-sexy-corpo-casual-basico-br-984359",
      "title": "Cinta sólida bodycon sexy corpo casual básico branco verão bodysuit feminino topos sem mangas sheer bodysuits macacão ma",
      "price": 699,
      "compareAtPrice": 3793,
      "discount": 81,
      "rating": 4.6,
      "sold": "5.000+  vendido(s)",
      "images": [
        "https://ae-pic-a1.aliexpress-media.com/kf/S97b51d9560f542e09a84dc4ab40569b6Q.jpg",
        "https://ae-pic-a1.aliexpress-media.com/kf/Sd9c4f05711ab4421b17f6501523c2eeeb.jpg",
        "https://ae-pic-a1.aliexpress-media.com/kf/S7a4f6efe606f413087cbc1a7e928029fA.jpg",
        "https://ae-pic-a1.aliexpress-media.com/kf/S1b0d6dc26f6345909a9ce2a7175da938V.jpg"
      ]
    },
    {
      "id": 1005006679923781,
      "handle": "calcoes-esportivos-femininos-verao-2024-nova-cor-923781",
      "title": "Calções esportivos femininos verão 2024 nova cor doce anti esvaziado shorts magros casual senhora cintura elástica praia",
      "price": 599,
      "compareAtPrice": 2725,
      "discount": 78,
      "rating": 4.2,
      "sold": "5.000+  vendido(s)",
      "images": [
        "https://ae-pic-a1.aliexpress-media.com/kf/S8e0e79e96da24c2b9b34de681d55fec7j.jpg",
        "https://ae-pic-a1.aliexpress-media.com/kf/Sd88d95ce7dd54d2d9e049e9a9b67fc94X.jpg",
        "https://ae-pic-a1.aliexpress-media.com/kf/S7801d5fc2fb7468ea6a988bbab967946M.jpg",
        "https://ae-pic-a1.aliexpress-media.com/kf/Sbbfd371057c6490da4672972224eeca6o.jpg"
      ]
    },
    {
      "id": 1005009121356207,
      "handle": "gotico-impressao-preto-sem-alcas-tubo-superior-f-356207",
      "title": "Gótico impressão preto sem alças tubo superior feminino magro recortado verão casual chique gráfico t y2k streetwear col",
      "price": 599,
      "compareAtPrice": 3023,
      "discount": 80,
      "rating": 4.9,
      "sold": "5.000+  vendido(s)",
      "images": [
        "https://ae-pic-a1.aliexpress-media.com/kf/S4860ae2cd3f54c90b764efba8649b969C.jpg",
        "https://ae-pic-a1.aliexpress-media.com/kf/Sc22763f0c29c41ff80f805fec0017d13v.jpg",
        "https://ae-pic-a1.aliexpress-media.com/kf/S291714908afe42f4b4ed34270523e656b.jpg",
        "https://ae-pic-a1.aliexpress-media.com/kf/S8f55d87a9f2746f9a52cd9a1997798782.jpg"
      ]
    },
    {
      "id": 1005007805609273,
      "handle": "camiseta-esportiva-feminina-ultraleve-de-cor-sol-609273",
      "title": "Camiseta esportiva feminina ultraleve de cor sólida de secagem rápida, leve e respirável, camisa de compressão para acad",
      "price": 599,
      "compareAtPrice": 3915,
      "discount": 84,
      "rating": 4.9,
      "sold": "5.000+  vendido(s)",
      "images": [
        "https://ae-pic-a1.aliexpress-media.com/kf/Sc3ff4fa522ca4539aaf44f2ae8fdc72bf.jpg",
        "https://ae-pic-a1.aliexpress-media.com/kf/Se3b71a5631fa4ef99094c472610c2c780.jpg",
        "https://ae-pic-a1.aliexpress-media.com/kf/Scf93528304244bb783f557b18672761cC.jpg",
        "https://ae-pic-a1.aliexpress-media.com/kf/Sdff651264f714cc898c6f58fd12b8672T.jpg"
      ]
    }
  ],
  "oculos": [
    {
      "id": 1005007175769871,
      "handle": "scvcn-novo-ciclismo-ao-ar-livre-oculos-de-sol-do-769871",
      "title": "Scvcn novo ciclismo ao ar livre óculos de sol dos homens estrada condução bicicleta esportes escalada de montanha femini",
      "price": 1216,
      "compareAtPrice": 5154,
      "discount": 76,
      "rating": 4.8,
      "sold": "50.000+  vendido(s)",
      "images": [
        "https://ae-pic-a1.aliexpress-media.com/kf/Saf509b8b8fba4ae9b58271bc95dca5f1A.jpg"
      ]
    },
    {
      "id": 1005007386070597,
      "handle": "oculos-de-sol-sem-aro-para-homens-e-mulheres-ton-070597",
      "title": "Óculos de sol sem aro para homens e mulheres, tons pequenos, óculos quadrados, viagem de verão, moda popular, feminino, ",
      "price": 599,
      "compareAtPrice": 2953,
      "discount": 79,
      "rating": 4.4,
      "sold": "50.000+  vendido(s)",
      "images": [
        "https://ae-pic-a1.aliexpress-media.com/kf/Sea2903d3d21d40f2943dfe91468edef7k.jpg",
        "https://ae-pic-a1.aliexpress-media.com/kf/S53f2abd198c04297a61adbe175b4306cf.jpg",
        "https://ae-pic-a1.aliexpress-media.com/kf/Sa42cca81fe594b2c86cf16ec3738a16a0.jpg",
        "https://ae-pic-a1.aliexpress-media.com/kf/S94a0eca0fbbd42259084d14a3f49f77dE.jpg"
      ]
    },
    {
      "id": 1005007490041223,
      "handle": "moda-vintage-quadrado-polarizado-oculos-de-sol-d-041223",
      "title": "Moda vintage quadrado polarizado óculos de sol das mulheres dos homens condução pesca marca luxo designer óculos de sol ",
      "price": 599,
      "compareAtPrice": 3292,
      "discount": 81,
      "rating": 4.6,
      "sold": "50.000+  vendido(s)",
      "images": [
        "https://ae-pic-a1.aliexpress-media.com/kf/S41187a2400c04c7189f414c08c920eb9E.jpg",
        "https://ae-pic-a1.aliexpress-media.com/kf/S719899afcb8347a2a854c015aed700a1X.jpg",
        "https://ae-pic-a1.aliexpress-media.com/kf/Sf563beb3f4bf48af8fd0d1d853e9dad7v.jpg",
        "https://ae-pic-a1.aliexpress-media.com/kf/S5943cd4f99fb443ea0bce6372910d0b8u.jpg"
      ]
    },
    {
      "id": 1005007513561635,
      "handle": "novos-oculos-de-sol-vintage-quadrados-para-mulhe-561635",
      "title": "Novos Óculos de Sol Vintage Quadrados para Mulheres e Homens, Marca de Luxo, Óculos de Sol Redondos Pequenos para Mulher",
      "price": 599,
      "compareAtPrice": 2644,
      "discount": 77,
      "rating": 4.4,
      "sold": "10.000+  vendido(s)",
      "images": [
        "https://ae-pic-a1.aliexpress-media.com/kf/S160ac3c2319e42a1a793bdbd1b998727x.jpg",
        "https://ae-pic-a1.aliexpress-media.com/kf/Sc78ad1bc1d3f4ec6a1f49879b4142e29j.jpg",
        "https://ae-pic-a1.aliexpress-media.com/kf/Sd06c159db6a941898daa2d9354a728ebz.jpg",
        "https://ae-pic-a1.aliexpress-media.com/kf/Se645265d8f9a447c901d22a58cb105ecp.jpg"
      ]
    },
    {
      "id": 1005006860960153,
      "handle": "oculos-de-sol-sem-aro-retangulo-moda-popular-fem-960153",
      "title": "Óculos de sol sem aro retângulo moda popular feminino masculino tons pequenos quadrados óculos de sol para feminino masc",
      "price": 599,
      "compareAtPrice": 2172,
      "discount": 72,
      "rating": 4.9,
      "sold": "10.000+  vendido(s)",
      "images": [
        "https://ae-pic-a1.aliexpress-media.com/kf/S7538379f031e4c2faa7ec59c6f246129U.png",
        "https://ae-pic-a1.aliexpress-media.com/kf/S315f444653b94f7ebd2e5f4a1a3a9f81u.jpg",
        "https://ae-pic-a1.aliexpress-media.com/kf/S86bd0cd4fc8142cebf12bf6f2c0697ac9.jpg",
        "https://ae-pic-a1.aliexpress-media.com/kf/S3969240559e3477e8ac5f60198175048l.jpg"
      ]
    },
    {
      "id": 1005009460589263,
      "handle": "quadrado-sem-aro-oculos-de-sol-feminino-marca-lu-589263",
      "title": "quadrado sem aro óculos de sol feminino marca luxo designer verão vermelho óculos moda óculos de sol para homem uv400 to",
      "price": 599,
      "compareAtPrice": 2882,
      "discount": 79,
      "rating": 4.9,
      "sold": "10.000+  vendido(s)",
      "images": [
        "https://ae-pic-a1.aliexpress-media.com/kf/Sf33fcc023f644d84a43d87a14d99b298M.png",
        "https://ae-pic-a1.aliexpress-media.com/kf/S43044d3b35bb42d7a172b561a9fd1be55.png",
        "https://ae-pic-a1.aliexpress-media.com/kf/Sacf2857261bd483ea3695a90429d9f12Q.png",
        "https://ae-pic-a1.aliexpress-media.com/kf/S3f6dc65f48c74b92aa9fd2315d4bada2B.png"
      ]
    },
    {
      "id": 1005008071225736,
      "handle": "classico-gotico-steampunk-oculos-de-sol-marca-lu-225736",
      "title": "Clássico gótico steampunk óculos de sol marca luxo designer alta qualidade masculino e feminino retro redondo pc quadro ",
      "price": 599,
      "compareAtPrice": 2935,
      "discount": 79,
      "rating": 4.4,
      "sold": "10.000+  vendido(s)",
      "images": [
        "https://ae-pic-a1.aliexpress-media.com/kf/H36d7d7865d18485ea52675db09ba0c0by.jpg",
        "https://ae-pic-a1.aliexpress-media.com/kf/Hea3d5f1cd0b546408d5ab74781eb5a46Z.jpg",
        "https://ae-pic-a1.aliexpress-media.com/kf/H402d1072e747494aaa3578aa28673b6d6.jpg",
        "https://ae-pic-a1.aliexpress-media.com/kf/H056c6eba11b34fe0a5c8b19a5a4fec2bP.jpg"
      ]
    },
    {
      "id": 1005008583521175,
      "handle": "oculos-de-sol-masculinos-quadrados-classicos-con-521175",
      "title": "Óculos de sol masculinos quadrados clássicos, confortáveis, leves, armação preta, ideais para viagens, presentes fotográ",
      "price": 1299,
      "compareAtPrice": 2824,
      "discount": 54,
      "rating": 4.5,
      "sold": "10.000+  vendido(s)",
      "images": [
        "https://ae-pic-a1.aliexpress-media.com/kf/S4d31cb57d7b94e5182af1dbb391725c5c.jpg",
        "https://ae-pic-a1.aliexpress-media.com/kf/S1a53203433fe40c5a5039edad95dc4b0T.jpg",
        "https://ae-pic-a1.aliexpress-media.com/kf/Sadaa2833c5694f5c8edd8fecbf047a5f8.jpg",
        "https://ae-pic-a1.aliexpress-media.com/kf/Sd387fe63ed8b45d594ec2b631c267526Y.png"
      ]
    },
    {
      "id": 1005009014734860,
      "handle": "oculos-de-visao-noturna-pc-quadro-polarizado-ocu-734860",
      "title": "Óculos de visão noturna pc quadro polarizado óculos de sol dos homens esporte ao ar livre óculos de sol dia visão noturn",
      "price": 699,
      "compareAtPrice": 1934,
      "discount": 63,
      "rating": 4.2,
      "sold": "10.000+  vendido(s)",
      "images": [
        "https://ae-pic-a1.aliexpress-media.com/kf/S3a193a5a25c442d0a9b020d903b884c6y.jpg",
        "https://ae-pic-a1.aliexpress-media.com/kf/Sd0dbeaa9a3c741189b0251a3e19b14384.jpg",
        "https://ae-pic-a1.aliexpress-media.com/kf/Sbc36421401434c74825368acc675a6abZ.jpg",
        "https://ae-pic-a1.aliexpress-media.com/kf/S85a463564a5749e3b97b7d20e1ac5608g.jpg"
      ]
    },
    {
      "id": 1005004679265777,
      "handle": "oculos-de-sol-promocionais-estilo-classico-oculo-265777",
      "title": "Óculos De Sol Promocionais Estilo Clássico Óculos De Sol Unisex Óculos De Sol Baratos",
      "price": 699,
      "compareAtPrice": 1933,
      "discount": 63,
      "rating": 4.5,
      "sold": "10.000+  vendido(s)",
      "images": [
        "https://ae-pic-a1.aliexpress-media.com/kf/Sba34d9c756bf4f2887b963713ae595cdV.jpg",
        "https://ae-pic-a1.aliexpress-media.com/kf/Se4f7f26b3ecc48a98063e996d1cfcfa95.jpg",
        "https://ae-pic-a1.aliexpress-media.com/kf/S6f82ec7c3b864712b2bcb70661164b35K.jpg",
        "https://ae-pic-a1.aliexpress-media.com/kf/Sea045519ce0e4645910c4be366524fe9Z.jpg"
      ]
    }
  ],
  "relogios": [
    {
      "id": 1005007171248263,
      "handle": "relogio-esportivo-digital-masculino-a-prova-d-ag-248263",
      "title": "Relógio esportivo digital masculino, à prova d'água, casual, luminoso, cronômetro, alarme, relógio militar simples para ",
      "price": 599,
      "compareAtPrice": 3078,
      "discount": 80,
      "rating": 4.9,
      "sold": "10.000+  vendido(s)",
      "images": [
        "https://ae-pic-a1.aliexpress-media.com/kf/S72461c751fd94cc59edd8e698250e50aZ.jpg",
        "https://ae-pic-a1.aliexpress-media.com/kf/S65724d804a7a4427b52160c4b453f022j.jpg",
        "https://ae-pic-a1.aliexpress-media.com/kf/Sb60918423fdd4a91a00eef2804601c54n.jpg",
        "https://ae-pic-a1.aliexpress-media.com/kf/S52021072aa1a4aa1a5170f0455528be0d.jpg"
      ]
    },
    {
      "id": 1005005767485122,
      "handle": "addiesdive-relogio-de-aco-inoxidavel-masculino-e-485122",
      "title": "Addiesdive relógio de aço inoxidável masculino europeu e americano negócios lazer relógio de quartzo à prova dwaterproof",
      "price": 21780,
      "compareAtPrice": 50596,
      "discount": 56,
      "rating": 4.9,
      "sold": "10.000+  vendido(s)",
      "images": [
        "https://ae-pic-a1.aliexpress-media.com/kf/S215e7d0bfff14e4697c5c8b410def6c6U.png",
        "https://ae-pic-a1.aliexpress-media.com/kf/Sc4183dcaf1e54a4b94778ce687f6738bW.jpg",
        "https://ae-pic-a1.aliexpress-media.com/kf/Sdbb293364749449b988409e84140df8bB.jpg",
        "https://ae-pic-a1.aliexpress-media.com/kf/S08be1827d038402b888722d459abfa00P.jpg"
      ]
    },
    {
      "id": 1005007286961705,
      "handle": "relogio-de-quartzo-analogico-masculino-com-calen-961705",
      "title": "Relógio de quartzo analógico masculino com calendário, pulseira de aço inoxidável, Fashion",
      "price": 699,
      "compareAtPrice": 3802,
      "discount": 81,
      "rating": 4.2,
      "sold": "10.000+  vendido(s)",
      "images": [
        "https://ae-pic-a1.aliexpress-media.com/kf/Sf9b96877ce6a4feda50d4aa0c1b6efa2k.jpg",
        "https://ae-pic-a1.aliexpress-media.com/kf/Sf11f41700fbb4bd0a63f3ce2cafd4c55D.jpg",
        "https://ae-pic-a1.aliexpress-media.com/kf/S05842a07bec844f8be931bcfb9aecac0d.jpg",
        "https://ae-pic-a1.aliexpress-media.com/kf/Sddcde2b2a08546509540a7785b94700f6.jpg"
      ]
    },
    {
      "id": 1005007010160680,
      "handle": "homens-led-digital-relogios-moda-luminosa-esport-160680",
      "title": "Homens LED Digital Relógios, moda luminosa, esporte, impermeável, homem, exército, militar, relógio, data, novo",
      "price": 599,
      "compareAtPrice": 2897,
      "discount": 79,
      "rating": 4.9,
      "sold": "10.000+  vendido(s)",
      "images": [
        "https://ae-pic-a1.aliexpress-media.com/kf/S73ee513066db4764b4caaa42c72c93b3g.jpg",
        "https://ae-pic-a1.aliexpress-media.com/kf/S13488b2e36944e6f99ca24e98b7c3146a.jpg",
        "https://ae-pic-a1.aliexpress-media.com/kf/S87db451fd114462e81e92ab597bd17c4B.jpg",
        "https://ae-pic-a1.aliexpress-media.com/kf/Se3dd417a7cd64bb19b59920f327d548fA.jpg"
      ]
    },
    {
      "id": 1005008406529149,
      "handle": "1-2-pecas-relogios-masculinos-de-negocios-relogi-529149",
      "title": "1/2 peças relógios masculinos de negócios relógio de quartzo com pulseira de aço da moda masculina com pulseira (caixa n",
      "price": 599,
      "compareAtPrice": 2719,
      "discount": 77,
      "rating": 4.9,
      "sold": "10.000+  vendido(s)",
      "images": [
        "https://ae-pic-a1.aliexpress-media.com/kf/S72b7bfd785064002bd12b796686a6262b.jpg",
        "https://ae-pic-a1.aliexpress-media.com/kf/Sfdd26d3c10c64b0994cf13cf777a05a1T.jpg",
        "https://ae-pic-a1.aliexpress-media.com/kf/Sd44c8dadcdc44c26b4f0d9c56bd0ea5a7.jpg",
        "https://ae-pic-a1.aliexpress-media.com/kf/Sc3d17d30c42442fa9b6fbef31c03bbd1b.jpg"
      ]
    },
    {
      "id": 1005006966430367,
      "handle": "relogio-digital-de-luxo-para-homens-em-aco-inoxi-430367",
      "title": "Relógio Digital de Luxo para Homens em Aço Inoxidável, Relógio Eletrônico Simples para Negócios, Ouro e Prata, Reloj Hom",
      "price": 599,
      "compareAtPrice": 2535,
      "discount": 76,
      "rating": 4.9,
      "sold": "10.000+  vendido(s)",
      "images": [
        "https://ae-pic-a1.aliexpress-media.com/kf/S65ff0f3c65964121b734ef6ce4941be86.jpg",
        "https://ae-pic-a1.aliexpress-media.com/kf/S44652a7842204608b3564fb88c761fe9t.jpg",
        "https://ae-pic-a1.aliexpress-media.com/kf/S168301d8815c430a94708bf755079464E.jpg",
        "https://ae-pic-a1.aliexpress-media.com/kf/Sb0f13bb53379459b9c26b131abf318b8w.jpg"
      ]
    },
    {
      "id": 1005008737059976,
      "handle": "poedagar-quadrado-de-luxo-relogio-de-pulso-mascu-059976",
      "title": "Poedagar quadrado de luxo relógio de pulso masculino à prova dwaterproof água luminosa data aço inoxidável relógio mascu",
      "price": 5599,
      "compareAtPrice": 13543,
      "discount": 58,
      "rating": 4.8,
      "sold": "10.000+  vendido(s)",
      "images": [
        "https://ae-pic-a1.aliexpress-media.com/kf/Saed903e2657d46a3832fae6937cf458dq.jpg",
        "https://ae-pic-a1.aliexpress-media.com/kf/S5d113f6ad0954dd593abae8a23c4b6e4M.jpg",
        "https://ae-pic-a1.aliexpress-media.com/kf/Sa370be0671604964808932c881ab5751L.jpg",
        "https://ae-pic-a1.aliexpress-media.com/kf/S5e86621054664cffbbb25541b8f8577cU.jpg"
      ]
    },
    {
      "id": 1005007344994516,
      "handle": "set-homens-relogios-de-negocios-casual-pulseira--994516",
      "title": "/set Homens Relógios de Negócios Casual Pulseira de Couro Analógico Masculino Relógio de Quartzo Colar Pulseira Conjunto",
      "price": 599,
      "compareAtPrice": 3106,
      "discount": 80,
      "rating": 4.9,
      "sold": "10.000+  vendido(s)",
      "images": [
        "https://ae-pic-a1.aliexpress-media.com/kf/S173d0f13b83a488eb7bc15847bcc1858s.jpg",
        "https://ae-pic-a1.aliexpress-media.com/kf/Sf56dd1186ab14069a67b3c10e7368e6er.jpg",
        "https://ae-pic-a1.aliexpress-media.com/kf/Sfbec33b1e3b1446cb2e3b747152355d3E.jpg",
        "https://ae-pic-a1.aliexpress-media.com/kf/S24eca766afc54c0fbf5b951c50ac4e1cH.jpg"
      ]
    },
    {
      "id": 1005007009980856,
      "handle": "relogio-de-pulso-de-quartzo-masculino-da-moda-co-980856",
      "title": "Relógio de pulso de quartzo masculino da moda com pulseira de couro",
      "price": 999,
      "compareAtPrice": 3727,
      "discount": 73,
      "rating": 4.9,
      "sold": "10.000+  vendido(s)",
      "images": [
        "https://ae-pic-a1.aliexpress-media.com/kf/S7eb0f3d51b384366a7a52fd9ad60cd17D.jpg",
        "https://ae-pic-a1.aliexpress-media.com/kf/S3fdd4bcea3da4306b6dc4bb91abb4584Q.jpg",
        "https://ae-pic-a1.aliexpress-media.com/kf/Sa8b00da4609d409887e6de40500a13b8s.jpg",
        "https://ae-pic-a1.aliexpress-media.com/kf/Sae4b18416fb84b6aaf90ef5850dbede9m.jpg"
      ]
    },
    {
      "id": 1005008660450110,
      "handle": "tomi-relogio-masculino-de-luxo-conjunto-de-caixa-450110",
      "title": "Tomi relógio masculino de luxo, conjunto de caixa de presente, caixa de ouro rosa de alta qualidade, simples e versátil,",
      "price": 4599,
      "compareAtPrice": 11518,
      "discount": 60,
      "rating": 4.9,
      "sold": "10.000+  vendido(s)",
      "images": [
        "https://ae-pic-a1.aliexpress-media.com/kf/S6606ea544a444efd84c322b9198d3af5C.jpg",
        "https://ae-pic-a1.aliexpress-media.com/kf/S02dfaed63d3942ccb6141ef905141227l.jpg",
        "https://ae-pic-a1.aliexpress-media.com/kf/Sd6ce7df523024343aebfe69cbab16a90X.jpg",
        "https://ae-pic-a1.aliexpress-media.com/kf/S8e2bee30747f4a609d936e79c127723a3.jpg"
      ]
    }
  ],
  "beleza": [
    {
      "id": 1005008248087608,
      "handle": "creme-facial-de-sangue-de-dragao-retinol-placent-087608",
      "title": "Creme facial de sangue de dragão, retinol, placenta, essência, brilho, firmador, cuidados com a pele, cosméticos coreano",
      "price": 599,
      "compareAtPrice": 2377,
      "discount": 74,
      "rating": 4.9,
      "sold": "10.000+  vendido(s)",
      "images": [
        "https://ae-pic-a1.aliexpress-media.com/kf/Sa3626e5091f34350bcc141a1019b20afI.jpg",
        "https://ae-pic-a1.aliexpress-media.com/kf/S822860384cfb4eef9216bc495d211ab2X.jpg",
        "https://ae-pic-a1.aliexpress-media.com/kf/S63e22887379c4b46a1f59d566b800aabO.jpg",
        "https://ae-pic-a1.aliexpress-media.com/kf/Sf89a94daf5354a0797f43c103fc5fa3ck.jpg"
      ]
    },
    {
      "id": 1005012524026351,
      "handle": "45-135pcs-sanrio-hello-kitty-cartoon-pimples-def-026351",
      "title": "45/135PCS Sanrio Hello Kitty Cartoon Pimples Defect Patch - Adesivo Invisível de Hidrocoloide para Acne, Adesivo Decorat",
      "price": 599,
      "compareAtPrice": 1258,
      "discount": 52,
      "rating": 4.9,
      "sold": "10.000+  vendido(s)",
      "images": [
        "https://ae-pic-a1.aliexpress-media.com/kf/S6c9083bcebe24fb79bb957d6647e846fo.jpg",
        "https://ae-pic-a1.aliexpress-media.com/kf/Sf51f132914fd46348652cb57293a779cz.jpg",
        "https://ae-pic-a1.aliexpress-media.com/kf/S1f8287d82af64848b969dd4353303bdbD.jpg",
        "https://ae-pic-a1.aliexpress-media.com/kf/Sd8d0aba5c5be439a9454298f6bdd752e5.jpg"
      ]
    },
    {
      "id": 1005010118632860,
      "handle": "rosto-acne-remendo-invisivel-cuidados-com-a-pele-632860",
      "title": "rosto acne remendo invisível cuidados com a pele espinha acne remendos anti-inflamatório cura absorvente ponto adesivo c",
      "price": 599,
      "compareAtPrice": 1740,
      "discount": 65,
      "rating": 4.6,
      "sold": "10.000+  vendido(s)",
      "images": [
        "https://ae-pic-a1.aliexpress-media.com/kf/S4c31b4ec12ae40d79d8e5ecba145d7ecb.jpg",
        "https://ae-pic-a1.aliexpress-media.com/kf/Scadbe6a3ee6147e3b159f4bf1a66adfb2.jpg",
        "https://ae-pic-a1.aliexpress-media.com/kf/S8eb4d42a1050423b9dd583012a0eb5da2.jpg",
        "https://ae-pic-a1.aliexpress-media.com/kf/S2119d3e2c3d841068ab2a895671caf3dy.jpg"
      ]
    },
    {
      "id": 1005007425934472,
      "handle": "retinol-levantamento-endurecimento-creme-colagen-934472",
      "title": "Retinol levantamento endurecimento creme colágeno rugas suaves creme facial para hidratante clareamento iluminar produto",
      "price": 599,
      "compareAtPrice": 2871,
      "discount": 79,
      "rating": 4.7,
      "sold": "10.000+  vendido(s)",
      "images": [
        "https://ae-pic-a1.aliexpress-media.com/kf/S7ef1619a7deb442fb6fb99ea0ebd4b6e8.jpg",
        "https://ae-pic-a1.aliexpress-media.com/kf/Sbfd5ce818006485c8f81ee91c6fdd680v.jpg",
        "https://ae-pic-a1.aliexpress-media.com/kf/S0cee84bab1b344648a4ac764a0eea6bdg.jpg",
        "https://ae-pic-a1.aliexpress-media.com/kf/S79354922a3054cde9e824de55c5af6d2L.jpg"
      ]
    },
    {
      "id": 1005010285619048,
      "handle": "creme-facial-anti-idade-com-retinol-e-colageno-6-619048",
      "title": "Creme Facial Anti-idade com Retinol e Colágeno 60g, Hidratante Intenso e Firmador, Ácido Hialurônico, Entrega Rápida",
      "price": 599,
      "compareAtPrice": 2925,
      "discount": 79,
      "rating": 4.9,
      "sold": "10.000+  vendido(s)",
      "images": [
        "https://ae-pic-a1.aliexpress-media.com/kf/S8f216e1cd8d346f2aa65cf4d9d428c43k.png",
        "https://ae-pic-a1.aliexpress-media.com/kf/S432c07675dbd44aba8e71f1a6915bd37J.png",
        "https://ae-pic-a1.aliexpress-media.com/kf/Se45cd49a3f5745b18ad94c91467cea3ec.png",
        "https://ae-pic-a1.aliexpress-media.com/kf/S9226c511730445899ab041c6b31d4dd9i.png"
      ]
    },
    {
      "id": 1005008959752346,
      "handle": "creme-facial-e-para-pescoco-com-retinol-e-colage-752346",
      "title": "Creme Facial e para Pescoço com Retinol e Colágeno 45g, Hidratante e Umectante, Não Oleoso, Fácil de Usar, Fácil de Abso",
      "price": 599,
      "compareAtPrice": 2883,
      "discount": 79,
      "rating": 4.7,
      "sold": "10.000+  vendido(s)",
      "images": [
        "https://ae-pic-a1.aliexpress-media.com/kf/S49e0c66eb18248ba93a0cf30f0ab4b42Z.png",
        "https://ae-pic-a1.aliexpress-media.com/kf/S092236f69e55452bb6a6bc093ef13311P.png",
        "https://ae-pic-a1.aliexpress-media.com/kf/Scbf40097197945ffb9d5fce7ade22d94k.png",
        "https://ae-pic-a1.aliexpress-media.com/kf/S5a66469da570474f92e51f0746f8a02ag.png"
      ]
    },
    {
      "id": 1005010191413863,
      "handle": "de-remendos-de-acne-estrela-multicoloridos-remen-413863",
      "title": "de remendos de acne estrela multicoloridos, remendos de acne facial, adesivos corretivos de acne e remendos de espinhas,",
      "price": 448,
      "compareAtPrice": 897,
      "discount": 50,
      "rating": 4.4,
      "sold": "5.000+  vendido(s)",
      "images": [
        "https://ae-pic-a1.aliexpress-media.com/kf/Sef7bfb77c46b4f6ca11d0f66a3dcc228u.jpg",
        "https://ae-pic-a1.aliexpress-media.com/kf/Sb09bf40da9d646e4936397634862f6fej.jpg",
        "https://ae-pic-a1.aliexpress-media.com/kf/S0f6078693716468daf34a2b5b0b01dd1s.jpg",
        "https://ae-pic-a1.aliexpress-media.com/kf/Sc3d2175e297c4eda80209f1fe8da770dh.jpg"
      ]
    },
    {
      "id": 1005010697655724,
      "handle": "1-2-3-pcs-rolo-de-gelo-facial-cuidados-com-a-pel-655724",
      "title": "1/2/3 pçs rolo de gelo facial cuidados com a pele rolo de gelo rolo facial guasha conjunto de ferramentas faciais rolo d",
      "price": 599,
      "compareAtPrice": 2564,
      "discount": 76,
      "rating": 4.7,
      "sold": "5.000+  vendido(s)",
      "images": [
        "https://ae-pic-a1.aliexpress-media.com/kf/S73ea992b46ef401198911c31b6cc13a9N.png",
        "https://ae-pic-a1.aliexpress-media.com/kf/Sc892dfaf1123466bb7dc61fc01e1cd676.jpg",
        "https://ae-pic-a1.aliexpress-media.com/kf/S74613844dea8431e83e18c8782b5fec35.jpg",
        "https://ae-pic-a1.aliexpress-media.com/kf/S43be6330784d4b6c84df9462999bd3b9i.jpg"
      ]
    },
    {
      "id": 1005007647524461,
      "handle": "creme-facial-do-sangue-do-dragao-do-retinol-hidr-524461",
      "title": "Creme facial do sangue do dragão do Retinol, hidratar o reparo, clarear o ocultador, linhas finas, poros, acne, iluminar",
      "price": 599,
      "compareAtPrice": 2824,
      "discount": 78,
      "rating": 4.7,
      "sold": "5.000+  vendido(s)",
      "images": [
        "https://ae-pic-a1.aliexpress-media.com/kf/Sad06934257924800a3f68bec37878ecd3.jpg",
        "https://ae-pic-a1.aliexpress-media.com/kf/S0302bd8ef5bb4b02ab7e61e34722eff2q.jpg",
        "https://ae-pic-a1.aliexpress-media.com/kf/S52e4a9ac70df42488316a7fd68fcda41i.jpg",
        "https://ae-pic-a1.aliexpress-media.com/kf/Sf7a4563ed82e4688a6ca466df6ef8533M.jpg"
      ]
    },
    {
      "id": 1005005083027165,
      "handle": "mascara-facial-recarregavel-com-led-7-cores-foto-027165",
      "title": "Máscara facial recarregável com led, 7 cores, fóton, máscara de beleza, rejuvenescimento da pele, casa, lifting facial, ",
      "price": 3859,
      "compareAtPrice": 11956,
      "discount": 67,
      "rating": 4.7,
      "sold": "5.000+  vendido(s)",
      "images": [
        "https://ae-pic-a1.aliexpress-media.com/kf/Sf7a8c1d531024555895cebafb664ff81z.jpg"
      ]
    }
  ],
  "casa": [
    {
      "id": 1005005872152512,
      "handle": "suporte-de-colher-de-cozinha-garfo-espatula-rack-152512",
      "title": "Suporte de colher de cozinha garfo espátula rack prateleira organizador plástico pauzinhos titular antiderrapante colher",
      "price": 599,
      "compareAtPrice": 2766,
      "discount": 78,
      "rating": 4.6,
      "sold": "50.000+  vendido(s)",
      "images": [
        "https://ae-pic-a1.aliexpress-media.com/kf/S58f5f649027d4ba09d16cf17781ca3332.jpg",
        "https://ae-pic-a1.aliexpress-media.com/kf/Se3115393a1464a3a91786bec6c31c6afw.jpg",
        "https://ae-pic-a1.aliexpress-media.com/kf/S56007a735a4d4df59b89bb1a9069caaaD.jpg",
        "https://ae-pic-a1.aliexpress-media.com/kf/S9ae3ce8214354fbf863e837c6312f4eaz.jpg"
      ]
    },
    {
      "id": 1005007379976842,
      "handle": "conjunto-de-recipientes-de-armazenamento-de-alim-976842",
      "title": "Conjunto de recipientes de armazenamento de alimentos de aço inoxidável de 6 peças com tampas – à prova de vazamentos, e",
      "price": 4067,
      "compareAtPrice": 15067,
      "discount": 73,
      "rating": 4.2,
      "sold": "10.000+  vendido(s)",
      "images": [
        "https://ae-pic-a1.aliexpress-media.com/kf/Sd84748ed76c048ffaed268d1dd18ec65H.jpg",
        "https://ae-pic-a1.aliexpress-media.com/kf/Se68af03e7d0a42179f5d8e9d435fe542p.jpg",
        "https://ae-pic-a1.aliexpress-media.com/kf/S4822154596cb4d9d8f26b6e6f2aaf9a0A.jpg",
        "https://ae-pic-a1.aliexpress-media.com/kf/S742776781b5d4638b852858624422161C.jpg"
      ]
    },
    {
      "id": 1005006784723031,
      "handle": "grau-alimenticio-silicone-preservacao-capa-reuti-723031",
      "title": "grau alimentício silicone preservação capa reutilizável hermético comida universal prato estiramento tampas redondas par",
      "price": 599,
      "compareAtPrice": 1457,
      "discount": 58,
      "rating": 4.9,
      "sold": "10.000+  vendido(s)",
      "images": [
        "https://ae-pic-a1.aliexpress-media.com/kf/S6ed0b1c2415743a899e6e7da20b4768eV.jpg",
        "https://ae-pic-a1.aliexpress-media.com/kf/Sc5af2f501d1b4bfa8767f312e6872c8aG.jpg",
        "https://ae-pic-a1.aliexpress-media.com/kf/S1ffe824ebd3e4df882c9362abc702146g.jpg",
        "https://ae-pic-a1.aliexpress-media.com/kf/Sd4a9dcec65874f80bd1d8ee51b8b1966g.jpg"
      ]
    },
    {
      "id": 1005009313031651,
      "handle": "recipiente-de-armazenamento-de-ovos-de-3-camadas-031651",
      "title": "Recipiente de armazenamento de ovos de 3 camadas para geladeira contém 24 ovos organizador rack grande capacidade cozinh",
      "price": 2699,
      "compareAtPrice": 7804,
      "discount": 65,
      "rating": 4.1,
      "sold": "10.000+  vendido(s)",
      "images": [
        "https://ae-pic-a1.aliexpress-media.com/kf/S883c3b68d89c4bfa91681192107f5a788.jpg",
        "https://ae-pic-a1.aliexpress-media.com/kf/S86e5add49931498b8532433f3441cba2e.jpg",
        "https://ae-pic-a1.aliexpress-media.com/kf/S8dc33b7873784606b1ef24d1314cd29e2.jpg",
        "https://ae-pic-a1.aliexpress-media.com/kf/S46474b221662477aa0c8499882d82e52P.jpg"
      ]
    },
    {
      "id": 1005007216835301,
      "handle": "ganchos-de-parede-impermeaveis-e-a-prova-de-oleo-835301",
      "title": "Ganchos de parede impermeáveis e à prova de óleo, ganchos pegajosos para porta de chuveiro de cozinha, banheiro, porta d",
      "price": 599,
      "compareAtPrice": 2370,
      "discount": 74,
      "rating": 4.6,
      "sold": "10.000+  vendido(s)",
      "images": [
        "https://ae-pic-a1.aliexpress-media.com/kf/Sfe64bea048274509acd3aabaaf07aa09G.jpg",
        "https://ae-pic-a1.aliexpress-media.com/kf/S8450d24e77e548ddb7534fb9c0adbeb1Q.jpg",
        "https://ae-pic-a1.aliexpress-media.com/kf/S46b3c894db234d9a9b2f6c89b4090d1bw.jpg",
        "https://ae-pic-a1.aliexpress-media.com/kf/Sa024cb0ebe0c4d0485210ee4f65c514dW.jpg"
      ]
    },
    {
      "id": 1005006116459385,
      "handle": "frascos-de-plastico-selados-para-cozinha-organiz-459385",
      "title": "Frascos de plástico selados para cozinha, organizador de armazenamento de grãos, tanque grande, caixa à prova de umidade",
      "price": 1099,
      "compareAtPrice": 5513,
      "discount": 80,
      "rating": 4,
      "sold": "10.000+  vendido(s)",
      "images": [
        "https://ae-pic-a1.aliexpress-media.com/kf/S2221d981369a41b192ef6ec2b8b236ccy.jpg",
        "https://ae-pic-a1.aliexpress-media.com/kf/S3e7307eb6df446c2b7a74b70fd3002d6k.jpg",
        "https://ae-pic-a1.aliexpress-media.com/kf/S988306eb788f475595bd4df7b3b0044ce.jpg",
        "https://ae-pic-a1.aliexpress-media.com/kf/S2f6fc2470ad54ab4907f5f6d953597e8P.jpg"
      ]
    },
    {
      "id": 1005005482742815,
      "handle": "non-punching-dishwashing-cloth-storage-clip-cozi-742815",
      "title": "Non Punching Dishwashing Cloth Storage Clip, Cozinha Household Gloves Hook, Toalheiro, Hole Clip, Wall Hanging, 3Pcs",
      "price": 599,
      "compareAtPrice": 2818,
      "discount": 78,
      "rating": 4.8,
      "sold": "10.000+  vendido(s)",
      "images": [
        "https://ae-pic-a1.aliexpress-media.com/kf/Sb9dd59c0b78348a487bb2d9ba7eaff31Y.jpg",
        "https://ae-pic-a1.aliexpress-media.com/kf/S119a7ef63e58445eb28f85880f49cf969.jpg",
        "https://ae-pic-a1.aliexpress-media.com/kf/S7aabad88c6794d0f9820e373c67ff632s.jpg",
        "https://ae-pic-a1.aliexpress-media.com/kf/S269e74bca3634d2ebfaf0ae157baeccfZ.jpg"
      ]
    },
    {
      "id": 1005004970036864,
      "handle": "1pc-cinza-diversos-saco-de-armazenamento-montage-036864",
      "title": "1pc cinza diversos saco de armazenamento montagem na parede malha sacos plásticos dispensador pendurado reutilizável bol",
      "price": 506,
      "compareAtPrice": 1148,
      "discount": 55,
      "rating": 4.7,
      "sold": "10.000+  vendido(s)",
      "images": [
        "https://ae-pic-a1.aliexpress-media.com/kf/S2476cbf699164e95a7f8b34ca8050a15R.jpg",
        "https://ae-pic-a1.aliexpress-media.com/kf/S691c1eee4dee4e468b62d65e7d9961c0w.jpg",
        "https://ae-pic-a1.aliexpress-media.com/kf/S685e03afef584c7b9b1f676112463cabv.jpg",
        "https://ae-pic-a1.aliexpress-media.com/kf/S46f766e569f14d96b4d9bf6cd4971f60G.jpg"
      ]
    },
    {
      "id": 1005010439303618,
      "handle": "2-6-pcs-fixado-na-parede-sacos-de-lixo-titular-s-303618",
      "title": "2/6 pçs fixado na parede sacos de lixo titular saco de lixo caixa de armazenamento organizador saco plástico filme recip",
      "price": 599,
      "compareAtPrice": 2240,
      "discount": 73,
      "rating": 4.9,
      "sold": "10.000+  vendido(s)",
      "images": [
        "https://ae-pic-a1.aliexpress-media.com/kf/S7af94d8c02f64935a3a90cf7d8d772b9V.jpeg",
        "https://ae-pic-a1.aliexpress-media.com/kf/Sf36b4b5362484ff6ac133b152108c23do.jpg",
        "https://ae-pic-a1.aliexpress-media.com/kf/S23c8b90925f94a8a83176cf283d8d031h.jpg",
        "https://ae-pic-a1.aliexpress-media.com/kf/S0cf9bf23fdc44b64afc6c00115cccbc52.jpg"
      ]
    },
    {
      "id": 1005008837051426,
      "handle": "prateleira-de-cozinha-de-aco-inoxidavel-rack-de--051426",
      "title": "Prateleira de cozinha de aço inoxidável, rack de drenagem de esponja, rack de drenagem de pia, suprimentos de lavagem de",
      "price": 1299,
      "compareAtPrice": 4956,
      "discount": 73,
      "rating": 4.2,
      "sold": "10.000+  vendido(s)",
      "images": [
        "https://ae-pic-a1.aliexpress-media.com/kf/S7d941f3eba39442595c3b6e506df5fccb.jpg",
        "https://ae-pic-a1.aliexpress-media.com/kf/S90d56b3446304128a2b9fe4c9ff3f3edw.png",
        "https://ae-pic-a1.aliexpress-media.com/kf/Sf11c59019a464a95b43bb96a03145d29O.png",
        "https://ae-pic-a1.aliexpress-media.com/kf/Sd46aea0550be4180bdc90776f6426765Y.png"
      ]
    }
  ],
  "pet": [
    {
      "id": 1005007170804768,
      "handle": "bola-de-brinquedo-para-caes-bola-de-brinquedo-na-804768",
      "title": "Bola de brinquedo para cães, bola de brinquedo não tóxica resistente à mordida para cães de estimação, filhote de cachor",
      "price": 599,
      "compareAtPrice": 1415,
      "discount": 57,
      "rating": 4.9,
      "sold": "10.000+  vendido(s)",
      "images": [
        "https://ae-pic-a1.aliexpress-media.com/kf/Scb4652fcbfec4dee8feb166d6461389cC.jpg",
        "https://ae-pic-a1.aliexpress-media.com/kf/Se38371265d4e4e10a8f7e3e2a390a8c3n.jpg",
        "https://ae-pic-a1.aliexpress-media.com/kf/S63bc09a216d4430786886631e11ef3af3.jpg",
        "https://ae-pic-a1.aliexpress-media.com/kf/Sa6c89da92ed146febb911f5d9f85f1cdt.jpg"
      ]
    },
    {
      "id": 1005007822592273,
      "handle": "brinquedo-de-pelucia-interativo-para-caes-polvo--592273",
      "title": "Brinquedo de Pelúcia Interativo para Cães, Polvo com Som e Tentáculos Crocantes, Brinquedo de Mastigar em Formato de Aba",
      "price": 599,
      "compareAtPrice": 2753,
      "discount": 78,
      "rating": 4.9,
      "sold": "10.000+  vendido(s)",
      "images": [
        "https://ae-pic-a1.aliexpress-media.com/kf/Scc40d92debd343059e0dddac284f1973Y.jpg",
        "https://ae-pic-a1.aliexpress-media.com/kf/S94331065065f4ef3847a1cb5043f4e95c.jpg",
        "https://ae-pic-a1.aliexpress-media.com/kf/S57a40cd25b1f425a888140252a9e0a9ds.jpg",
        "https://ae-pic-a1.aliexpress-media.com/kf/S4266e899ade3402bb54a9942936a62df3.jpg"
      ]
    },
    {
      "id": 1005008557788774,
      "handle": "cao-dormindo-com-um-cachorro-abraco-pato-brinque-788774",
      "title": "Cão dormindo com um cachorro abraço pato brinquedos para aliviar o tédio do pequeno pato amarelo animal de estimação bon",
      "price": 599,
      "compareAtPrice": 2323,
      "discount": 74,
      "rating": 4.9,
      "sold": "10.000+  vendido(s)",
      "images": [
        "https://ae-pic-a1.aliexpress-media.com/kf/S74541855e13c4f7a956be63c4d50da216.png",
        "https://ae-pic-a1.aliexpress-media.com/kf/S18c72e6c4268442dbdd1f45334e0b3e6X.png",
        "https://ae-pic-a1.aliexpress-media.com/kf/S32f70426cf7049469fc8dab51a00d8c2X.png",
        "https://ae-pic-a1.aliexpress-media.com/kf/S2f0a504e112f47ecbda55fa009a905543.png"
      ]
    },
    {
      "id": 1005008861976362,
      "handle": "novo-brinquedo-interativo-da-bola-do-cao-bola-do-976362",
      "title": "Novo brinquedo interativo da bola do cão, bola do cão de rolamento automático recarregável, brinquedo interativo do filh",
      "price": 699,
      "compareAtPrice": 2479,
      "discount": 71,
      "rating": 4.6,
      "sold": "10.000+  vendido(s)",
      "images": [
        "https://ae-pic-a1.aliexpress-media.com/kf/S936144b3408847eba61bf9770fbc1aaaI.png",
        "https://ae-pic-a1.aliexpress-media.com/kf/S6633fc048d50418e8eddc36aa5f10c789.png",
        "https://ae-pic-a1.aliexpress-media.com/kf/Sca17dcf535484d1ab712f63788ba2245X.png",
        "https://ae-pic-a1.aliexpress-media.com/kf/Sffda2e7f833b4ac5a44ba1fdee593fd8D.png"
      ]
    },
    {
      "id": 1005009410622667,
      "handle": "brinquedos-para-gatos-e-caes-para-mastigadores-a-622667",
      "title": "Brinquedos para Gatos e Cães para Mastigadores Agressivos, Brinquedo Interativo de Pelúcia com Som para Gatos e Cães, Pr",
      "price": 599,
      "compareAtPrice": 3165,
      "discount": 81,
      "rating": 4.4,
      "sold": "10.000+  vendido(s)",
      "images": [
        "https://ae-pic-a1.aliexpress-media.com/kf/S482b0daf072c4967967f8c2141a22e4aM.jpg",
        "https://ae-pic-a1.aliexpress-media.com/kf/S62db1803e4a344fe9aa93f8a725170791.jpg",
        "https://ae-pic-a1.aliexpress-media.com/kf/Sacea6406d977440bbfc527014a6c6937n.jpg",
        "https://ae-pic-a1.aliexpress-media.com/kf/S2aaf236beb424576afb0a4bc65221bcbi.jpg"
      ]
    },
    {
      "id": 1005009947008307,
      "handle": "bola-interativa-inteligente-para-gatos-duravel-e-008307",
      "title": "Bola Interativa Inteligente para Gatos, Durável e de Longa Duração, Fácil de Limpar, Brinquedos para Cães com Evitação I",
      "price": 699,
      "compareAtPrice": 3249,
      "discount": 78,
      "rating": 4.6,
      "sold": "10.000+  vendido(s)",
      "images": [
        "https://ae-pic-a1.aliexpress-media.com/kf/S300130f6700a45b8a16c730e5a7b8365P.png",
        "https://ae-pic-a1.aliexpress-media.com/kf/Sef3043430aa8400097b855bafcba7d0f7.png",
        "https://ae-pic-a1.aliexpress-media.com/kf/S8353fce1e34849fabe3278b84bea77b69.png",
        "https://ae-pic-a1.aliexpress-media.com/kf/Sa9d868ddcac54001ad9033d7cb6d4664E.png"
      ]
    },
    {
      "id": 1005010089058137,
      "handle": "50cm-macio-colorido-pato-brinquedo-de-pelucia-pa-058137",
      "title": "50cm macio colorido pato brinquedo de pelúcia para gatos cães relaxar companheiro de animais de estimação alívio de ansi",
      "price": 999,
      "compareAtPrice": 4220,
      "discount": 76,
      "rating": 4.9,
      "sold": "10.000+  vendido(s)",
      "images": [
        "https://ae-pic-a1.aliexpress-media.com/kf/S6b305ed58a2d466fa29439330b02692fU.jpg",
        "https://ae-pic-a1.aliexpress-media.com/kf/S15de31b7422a4d8dbdd00f5a24ce8b77W.jpg",
        "https://ae-pic-a1.aliexpress-media.com/kf/S8f29e92b4e9e4ea191fc85314e412b00q.jpg",
        "https://ae-pic-a1.aliexpress-media.com/kf/S715234f55fe84210a4e9cd12d871507d3.jpg"
      ]
    },
    {
      "id": 1005006967409759,
      "handle": "brinquedo-de-pelucia-para-animais-de-estimacao-a-409759",
      "title": "Brinquedo de pelúcia para animais de estimação, animais fofos, resistente à mordida, interativo, estridente, brinquedo d",
      "price": 899,
      "compareAtPrice": 3762,
      "discount": 76,
      "rating": 4.9,
      "sold": "10.000+  vendido(s)",
      "images": [
        "https://ae-pic-a1.aliexpress-media.com/kf/S107a1dca1dd3444e83cd5126ec6d8035E.jpg",
        "https://ae-pic-a1.aliexpress-media.com/kf/Se045cf4d691b4bc48e09b16588f1dceaS.jpg",
        "https://ae-pic-a1.aliexpress-media.com/kf/S28c6a1dda3eb4e4889078159910128efS.jpg",
        "https://ae-pic-a1.aliexpress-media.com/kf/Sa3fb6e33b7754e89b6084e7632d32464k.jpg"
      ]
    },
    {
      "id": 1005006365578396,
      "handle": "1pc-pet-no-brinquedo-para-cao-e-gato-forma-cenou-578396",
      "title": "1pc pet nó brinquedo para cão e gato forma cenoura cão mastigar brinquedos corda de algodão brinquedos para cães interno",
      "price": 599,
      "compareAtPrice": 2731,
      "discount": 78,
      "rating": 4.7,
      "sold": "5.000+  vendido(s)",
      "images": [
        "https://ae-pic-a1.aliexpress-media.com/kf/S7139ee226c404bc196c8e06d754114ccL.jpg",
        "https://ae-pic-a1.aliexpress-media.com/kf/S041b6eb47c2646ebb8075df6eb82d23eF.jpg",
        "https://ae-pic-a1.aliexpress-media.com/kf/Sb92ccfccad494760a7a0f4bba66edcc62.jpg",
        "https://ae-pic-a1.aliexpress-media.com/kf/Sf5da73cc6e744d819427ee3f5293515e0.jpg"
      ]
    },
    {
      "id": 1005009889255975,
      "handle": "brinquedo-de-cachorro-de-pato-de-pelucia-resiste-255975",
      "title": "Brinquedo de cachorro de pato de pelúcia resistente à mastigar brinquedo de cachorro durável com têmpera som dentes moag",
      "price": 699,
      "compareAtPrice": 1165,
      "discount": 39,
      "rating": 4.6,
      "sold": "5.000+  vendido(s)",
      "images": [
        "https://ae-pic-a1.aliexpress-media.com/kf/S165a5dd8fc1544c2b8bebbe9a69da791M.jpg",
        "https://ae-pic-a1.aliexpress-media.com/kf/S334d60d7d2194a2d92764fdffa5807683.jpg",
        "https://ae-pic-a1.aliexpress-media.com/kf/S10f363e21edf48c5afd16e1406e1e455j.jpg",
        "https://ae-pic-a1.aliexpress-media.com/kf/Sc0a5f2d2059744a4a74771f2b4cf88fb9.jpg"
      ]
    }
  ],
  "fitness": [
    {
      "id": 1005008251771538,
      "handle": "faixa-de-resistencia-resistente-de-20-230lbs-tre-771538",
      "title": "Faixa de resistência resistente de 20 ~ 230lbs, treinamento de agilidade, equipamento de ginástica, yoga, pilates, acess",
      "price": 1799,
      "compareAtPrice": 5808,
      "discount": 69,
      "rating": 4.7,
      "sold": "50.000+  vendido(s)",
      "images": [
        "https://ae-pic-a1.aliexpress-media.com/kf/Se586433ce7464b2a8f64059596127c567.jpg",
        "https://ae-pic-a1.aliexpress-media.com/kf/Sb631ebab1b324d34b7f4b0f682bd0e33A.png",
        "https://ae-pic-a1.aliexpress-media.com/kf/Sccf637d6dc854c25aeb1dfe4edb3aa410.jpg",
        "https://ae-pic-a1.aliexpress-media.com/kf/S619b0beb5a4d41d7802f24bae3b6b875S.jpg"
      ]
    },
    {
      "id": 1005007250177417,
      "handle": "1-peca-de-faixas-de-resistencia-de-4-niveis-com--177417",
      "title": "1 peça de faixas de resistência de 4 níveis com alças para treinos em casa e treinamento de força – perfeitas para ioga,",
      "price": 1199,
      "compareAtPrice": 3952,
      "discount": 69,
      "rating": 4.5,
      "sold": "10.000+  vendido(s)",
      "images": [
        "https://ae-pic-a1.aliexpress-media.com/kf/S7262ac4e7b3f42a591c64257f3176eb9O.jpg",
        "https://ae-pic-a1.aliexpress-media.com/kf/Sd72608f6dda44e11b013c6cb29028eaaY.jpg",
        "https://ae-pic-a1.aliexpress-media.com/kf/S8ff83abe520e4ef1991e05c8a2778df9y.jpg",
        "https://ae-pic-a1.aliexpress-media.com/kf/Sf288366541554947928617cb02dcf83eZ.jpg"
      ]
    },
    {
      "id": 1005009778133290,
      "handle": "tensor-de-pedal-de-quatro-tubos-multifuncional-e-133290",
      "title": "Tensor de pedal de quatro tubos multifuncional, equipamento fitness doméstico, yoga, fortalecimento abdominal, faixa elá",
      "price": 699,
      "compareAtPrice": 4464,
      "discount": 84,
      "rating": 4.6,
      "sold": "10.000+  vendido(s)",
      "images": [
        "https://ae-pic-a1.aliexpress-media.com/kf/See178e2dde2545c48d99251ee42b8f5ba.png",
        "https://ae-pic-a1.aliexpress-media.com/kf/S0a40b41fce624bb8b9d6cc1620433dd2L.jpg",
        "https://ae-pic-a1.aliexpress-media.com/kf/S0cca2c1094454bcc9fc09e1aad08d49aa.jpg",
        "https://ae-pic-a1.aliexpress-media.com/kf/S6a5a6afa03d84846a01edaa2de039408Z.png"
      ]
    },
    {
      "id": 1005007392299425,
      "handle": "rack-push-up-em-forma-de-u-equipamento-fitness-p-299425",
      "title": "Rack push-up em forma de U, Equipamento Fitness, Punho de Esponja de Mão, Treino Muscular, Barra Push Up, Peito, Ginásio",
      "price": 3254,
      "compareAtPrice": 13940,
      "discount": 76,
      "rating": 4.7,
      "sold": "10.000+  vendido(s)",
      "images": [
        "https://ae-pic-a1.aliexpress-media.com/kf/S7093bd272e9a4fe0a70f1407ede9c89dJ.png",
        "https://ae-pic-a1.aliexpress-media.com/kf/S0ea25d5f26ab495eb08894af8438adf6b.png",
        "https://ae-pic-a1.aliexpress-media.com/kf/S395d9099bb2d411a81aa2c1841bfa614l.png",
        "https://ae-pic-a1.aliexpress-media.com/kf/Sa5b5ae5fdd5a4a959909cc249ed2420fS.png"
      ]
    },
    {
      "id": 1005005651266845,
      "handle": "cinto-elastico-esportivo-auditivo-pull-up-auxili-266845",
      "title": "Cinto elástico esportivo auditivo pull-up auxiliar masculino e feminino ginásio pilates equipamento de exercício de borr",
      "price": 599,
      "compareAtPrice": 2962,
      "discount": 79,
      "rating": 4.7,
      "sold": "10.000+  vendido(s)",
      "images": [
        "https://ae-pic-a1.aliexpress-media.com/kf/Se790e2800f6f4aa7a2fa72811f992352Z.jpg",
        "https://ae-pic-a1.aliexpress-media.com/kf/S3b59ed57b5864f629514f9bda7f7a8ebn.jpg",
        "https://ae-pic-a1.aliexpress-media.com/kf/S6ae5fbacc73144dd98b58b0f9ff30c14W.jpg",
        "https://ae-pic-a1.aliexpress-media.com/kf/S34fefb8c03994dfa91f38e12f2823dabU.jpg"
      ]
    },
    {
      "id": 1005006995272203,
      "handle": "tapete-de-yoga-pilates-fitness-3-4-6mm-de-espess-272203",
      "title": "Tapete de yoga pilates fitness 3/4/6mm de espessura antiderrapante almofada de yoga viagem fitness exercício almofada pa",
      "price": 3429,
      "compareAtPrice": 6855,
      "discount": 49,
      "rating": 4.9,
      "sold": "10.000+  vendido(s)",
      "images": [
        "https://ae-pic-a1.aliexpress-media.com/kf/S2519edadb8104a8a914b2c6c1ff4151bZ.jpg",
        "https://ae-pic-a1.aliexpress-media.com/kf/S098ef04cfd1c4366b55c986374788dfaS.jpg",
        "https://ae-pic-a1.aliexpress-media.com/kf/S43a6f8d5c8784c8992b871c47225527fK.jpg",
        "https://ae-pic-a1.aliexpress-media.com/kf/S09db2583774146e98b38fa0ec04fbd16C.jpg"
      ]
    },
    {
      "id": 1005007642715244,
      "handle": "wosweir-elastic-training-gum-resistencia-bandas--715244",
      "title": "WOSWEIR Elastic Training Gum Resistência Bandas Ginásio Casa Fitness Expansor Yoga Pull Up Assist Borracha Crossfit Work",
      "price": 699,
      "compareAtPrice": 2370,
      "discount": 70,
      "rating": 4.8,
      "sold": "5.000+  vendido(s)",
      "images": [
        "https://ae-pic-a1.aliexpress-media.com/kf/Sc49190b008474baf8ea053cda784962co.jpg",
        "https://ae-pic-a1.aliexpress-media.com/kf/Safd77c431a3146a5a267ae17d039dcd12.jpg",
        "https://ae-pic-a1.aliexpress-media.com/kf/S942c10fb87724b4390e9955df85e80a89.jpg",
        "https://ae-pic-a1.aliexpress-media.com/kf/Sd275ce42cbbc4f58a63dc6463baaf7dfi.jpg"
      ]
    },
    {
      "id": 1005008584516905,
      "handle": "banda-de-resistencia-resistente-latex-cinto-elas-516905",
      "title": "Banda de resistência resistente látex cinto elástico puxar para cima auxiliar para pilates treino fitness em casa ginási",
      "price": 699,
      "compareAtPrice": 3208,
      "discount": 78,
      "rating": 4.7,
      "sold": "5.000+  vendido(s)",
      "images": [
        "https://ae-pic-a1.aliexpress-media.com/kf/S396e44942009429f96ede8d7c4b37139V.jpg",
        "https://ae-pic-a1.aliexpress-media.com/kf/S0f97a9bdeda547c697e72f11b9186e08V.jpg",
        "https://ae-pic-a1.aliexpress-media.com/kf/S6b05d8e90a4f4936939afddd46345a05L.jpg",
        "https://ae-pic-a1.aliexpress-media.com/kf/S6a2017c111ef40ba976046ed80d0e644m.jpg"
      ]
    },
    {
      "id": 1005007358697910,
      "handle": "a-nova-corda-de-pular-fio-de-aco-exercicio-de-pu-697910",
      "title": "A nova corda de pular fio de aço exercício de pular ajustável salto fitness treino treinamento equipamentos esportivos e",
      "price": 599,
      "compareAtPrice": 5925,
      "discount": 89,
      "rating": 4.7,
      "sold": "5.000+  vendido(s)",
      "images": [
        "https://ae-pic-a1.aliexpress-media.com/kf/S727dfae56f0b45349d2d7f3da9cb561bT.png",
        "https://ae-pic-a1.aliexpress-media.com/kf/S55a527d3001e4eedbdd2e44c1e03deacD.png",
        "https://ae-pic-a1.aliexpress-media.com/kf/Sce627c9b15f74849a3f2d7aaea7b68278.png",
        "https://ae-pic-a1.aliexpress-media.com/kf/Se59d9c11e13f4b2e94b91ea3362eae34F.png"
      ]
    },
    {
      "id": 1005010323687882,
      "handle": "nova-corda-de-pular-com-cabo-de-aco-ajustavel-pa-687882",
      "title": "Nova Corda de Pular com Cabo de Aço Ajustável para Exercícios de Fitness em Casa, Equipamento Esportivo Sem Emaranhados",
      "price": 1099,
      "compareAtPrice": 3333,
      "discount": 67,
      "rating": 4.9,
      "sold": "5.000+  vendido(s)",
      "images": [
        "https://ae-pic-a1.aliexpress-media.com/kf/S68f9dbc752c940039fbe099937a6ca611.png",
        "https://ae-pic-a1.aliexpress-media.com/kf/S7b1b863239694a0fba679fd767ef565cS.jpg",
        "https://ae-pic-a1.aliexpress-media.com/kf/Sf181f0e9652f4e9dbe2895ff48acd4d0i.jpg",
        "https://ae-pic-a1.aliexpress-media.com/kf/Sc51e38770a5646c784e50da667b57d35H.jpg"
      ]
    }
  ],
  "gadgets": [
    {
      "id": 1005009254216387,
      "handle": "bluetooth-5-3-fones-de-ouvido-para-jogos-modo-du-216387",
      "title": "Bluetooth 5.3 fones de ouvido para jogos modo duplo sem fio dobrável redução ruído música para iphone xiaomi",
      "price": 1934,
      "compareAtPrice": 6280,
      "discount": 69,
      "rating": 4.3,
      "sold": "10.000+  vendido(s)",
      "images": [
        "https://ae-pic-a1.aliexpress-media.com/kf/S814a46217b3e48809e14c45721d92efbE.jpg",
        "https://ae-pic-a1.aliexpress-media.com/kf/Sbc150c2fd7744435b97d20ccde36a3c2P.jpg",
        "https://ae-pic-a1.aliexpress-media.com/kf/S99c4af8d87b44cceac3195eff8dd7d461.jpg",
        "https://ae-pic-a1.aliexpress-media.com/kf/S9eadfef5442249358d7d9fc986716eb5O.jpg"
      ]
    },
    {
      "id": 1005010546036557,
      "handle": "multifuncional-portatil-dobravel-headmounted-sem-036557",
      "title": "Multifuncional portátil dobrável headmounted sem fio bluetooth 5.0 fone de ouvido para conexão bluetooth cartão tf conex",
      "price": 2119,
      "compareAtPrice": 5560,
      "discount": 61,
      "rating": 4.2,
      "sold": "10.000+  vendido(s)",
      "images": [
        "https://ae-pic-a1.aliexpress-media.com/kf/S557fba8e51704347bf25365c9d5ca8f8Z.jpg",
        "https://ae-pic-a1.aliexpress-media.com/kf/Sf59c4692bb9445e7a33bca3f9febb25dY.jpg",
        "https://ae-pic-a1.aliexpress-media.com/kf/Se779509f4e20445ba6db0b9af946c3bcj.jpg",
        "https://ae-pic-a1.aliexpress-media.com/kf/Sbb49a767598e434aa4ae11a484b254917.jpg"
      ]
    },
    {
      "id": 1005009580477059,
      "handle": "fone-de-ouvido-bluetooth-6-0-lenovo-le302-sem-fi-477059",
      "title": "Fone de Ouvido Bluetooth 6.0 Lenovo LE302 Sem Fio com Longa Duração de Bateria, Fones de Ouvido Esportivos com Clip para",
      "price": 7216,
      "compareAtPrice": 10160,
      "discount": 28,
      "rating": 4.6,
      "sold": "10.000+  vendido(s)",
      "images": [
        "https://ae-pic-a1.aliexpress-media.com/kf/Sd4b15e4f55884d518ec23fe0e7164544R.jpg",
        "https://ae-pic-a1.aliexpress-media.com/kf/S34a4e5c2b37647f1add8e696635c8333S.jpg",
        "https://ae-pic-a1.aliexpress-media.com/kf/S7931e6a146074d9fae88900f57f65502X.jpg",
        "https://ae-pic-a1.aliexpress-media.com/kf/S9d425412ac5e4371a9206025367e9a608.jpg"
      ]
    },
    {
      "id": 1005008603585460,
      "handle": "ugreen-studio-pro-48db-anc-fones-de-ouvido-sem-f-585460",
      "title": "UGREEN Studio Pro 48dB ANC Fones de ouvido sem fio sobre a orelha Fones de ouvido Bluetooth Cancelamento de ruído ativo ",
      "price": 21258,
      "compareAtPrice": 36919,
      "discount": 42,
      "rating": 4.8,
      "sold": "10.000+  vendido(s)",
      "images": [
        "https://ae-pic-a1.aliexpress-media.com/kf/S74d75d6ca42a49288334c07bbedf56a6x.jpg"
      ]
    },
    {
      "id": 1005009402878815,
      "handle": "fone-de-ouvido-moondrop-space-travel-2-hifi-com--878815",
      "title": "Fone de ouvido MOONDROP Space Travel 2 HiFi com cancelamento de ruído TWS sem fio Bluetooth 6.0 ANC com baixa latência, ",
      "price": 13988,
      "compareAtPrice": 16988,
      "discount": 17,
      "rating": 4.9,
      "sold": "10.000+  vendido(s)",
      "images": [
        "https://ae-pic-a1.aliexpress-media.com/kf/Sfd92c2ee4a3d45bb975867b037511c88M.jpg"
      ]
    },
    {
      "id": 1005007171256069,
      "handle": "fone-de-ouvido-estereo-p47-bluetooth-5-0-dobrave-256069",
      "title": "Fone de Ouvido Estéreo P47 Bluetooth 5.0 Dobrável Sem Fio para Jogos e Esportes Compatível com iPhone 16 15 14 13 12 Pro",
      "price": 1099,
      "compareAtPrice": 4579,
      "discount": 76,
      "rating": 4.9,
      "sold": "5.000+  vendido(s)",
      "images": [
        "https://ae-pic-a1.aliexpress-media.com/kf/Se779509f4e20445ba6db0b9af946c3bcj.jpg"
      ]
    },
    {
      "id": 1005009719114453,
      "handle": "binnune-bw06-fones-de-ouvido-bluetooth-gamer-com-114453",
      "title": "BINNUNE BW06 fones de ouvido bluetooth gamer com microfone para ps5 ps4 pc mac playstation sem fio 2.4ghz gaming fone de",
      "price": 13059,
      "compareAtPrice": 27206,
      "discount": 51,
      "rating": 4.9,
      "sold": "5.000+  vendido(s)",
      "images": [
        "https://ae-pic-a1.aliexpress-media.com/kf/S0db37e77c91c475fa0d7ee175b7408cbi.png",
        "https://ae-pic-a1.aliexpress-media.com/kf/S9d3f41091cff431eafc66a6592853b44V.jpg",
        "https://ae-pic-a1.aliexpress-media.com/kf/S951b924c75a14025bdc1dde89cc5dc6e2.jpg",
        "https://ae-pic-a1.aliexpress-media.com/kf/Sdbc40caf0a6f4dc791f18dd40e20a679m.jpg"
      ]
    },
    {
      "id": 1005004983350280,
      "handle": "fones-de-ouvido-bluetooth-5-4-lenovo-gm2-pro-hea-350280",
      "title": "Fones de Ouvido Bluetooth 5.4 Lenovo GM2 Pro, Headset Esportivo Sem Fio, In-Ear, Baixa Latência, Modo Duplo, Fones de Mú",
      "price": 2397,
      "compareAtPrice": 11244,
      "discount": 78,
      "rating": 4.8,
      "sold": "5.000+  vendido(s)",
      "images": [
        "https://ae-pic-a1.aliexpress-media.com/kf/Sfba160068985485bad1268670e77a942w.jpg"
      ]
    },
    {
      "id": 1005009120888793,
      "handle": "smailwolf-l80-bluetooth-sem-fio-com-fio-de-tres--888793",
      "title": "SmaILWOLF L80 Bluetooth sem fio com fio de três modos para jogos fone de ouvido portátil para casa fone de ouvido leve c",
      "price": 11459,
      "compareAtPrice": 22880,
      "discount": 49,
      "rating": 4.9,
      "sold": "5.000+  vendido(s)",
      "images": [
        "https://ae-pic-a1.aliexpress-media.com/kf/S4e9ae2cb6da844ef802527ed45e5805eJ.jpg"
      ]
    },
    {
      "id": 1005010537477228,
      "handle": "mchose-v9-pro-fone-de-ouvido-com-microfone-tres--477228",
      "title": "MCHOSE V9 Pro fone de ouvido com microfone três modos Bluetooth sem fio computador PC gamer fones de ouvido acessórios V",
      "price": 22963,
      "compareAtPrice": 54267,
      "discount": 57,
      "rating": 4.9,
      "sold": "5.000+  vendido(s)",
      "images": [
        "https://ae-pic-a1.aliexpress-media.com/kf/S25e9abe9e96b4dd3a191a565d097c999L.jpg",
        "https://ae-pic-a1.aliexpress-media.com/kf/S0605c17872284a56a90d3fb7bad7e267Y.jpg",
        "https://ae-pic-a1.aliexpress-media.com/kf/Sdcc0c8c54a494aae95abb813739956e9d.jpg",
        "https://ae-pic-a1.aliexpress-media.com/kf/Sd8f635d3c7414b5aa8fbd960dde4b491T.jpg"
      ]
    }
  ],
  "infantil": [
    {
      "id": 1005010105919420,
      "handle": "lanterna-de-projetor-para-criancas-10-cartoes-80-919420",
      "title": "Lanterna de projetor para crianças, 10 cartões, 80 padrões, brinquedos para dormir, luz de desenho animado, brinquedo ed",
      "price": 599,
      "compareAtPrice": 3271,
      "discount": 81,
      "rating": 4.7,
      "sold": "10.000+  vendido(s)",
      "images": [
        "https://ae-pic-a1.aliexpress-media.com/kf/S4b9ae2d94bc14c6fb400bbb357a77ff4o.jpg",
        "https://ae-pic-a1.aliexpress-media.com/kf/S88083905064149efa47580db59b1b5acG.jpg",
        "https://ae-pic-a1.aliexpress-media.com/kf/Sf17e7756252742edb463add256b918a11.jpg",
        "https://ae-pic-a1.aliexpress-media.com/kf/S3e3c0d10dc0749a3b0410246757a14256.jpg"
      ]
    },
    {
      "id": 1005009916210743,
      "handle": "inteligencia-matematica-brinquedos-matematicos-e-210743",
      "title": "Inteligência matemática brinquedos matemáticos engraçado escala de sapo crianças educação precoce brinquedos adição subt",
      "price": 1399,
      "compareAtPrice": 5076,
      "discount": 72,
      "rating": 4.9,
      "sold": "10.000+  vendido(s)",
      "images": [
        "https://ae-pic-a1.aliexpress-media.com/kf/S104222d67a664f15974dc21444fa395bh.jpg",
        "https://ae-pic-a1.aliexpress-media.com/kf/S61b4864d43fd48b7afb4c002d83b2f65c.jpg",
        "https://ae-pic-a1.aliexpress-media.com/kf/Sb9abe9253e68439fbf18d6eb1c4e97b4i.jpg",
        "https://ae-pic-a1.aliexpress-media.com/kf/Scdc8283b599946968a08374f4ae01dd1E.jpg"
      ]
    },
    {
      "id": 1005006861918127,
      "handle": "1pc-reutilizavel-criancas-livros-de-desenho-de-a-918127",
      "title": "1pc reutilizável crianças livros de desenho de água mágica com caneta repetido livro de colorir magia livro de desenho d",
      "price": 637,
      "compareAtPrice": 1328,
      "discount": 52,
      "rating": 4.9,
      "sold": "10.000+  vendido(s)",
      "images": [
        "https://ae-pic-a1.aliexpress-media.com/kf/S412fbc7cb5ba4f33b978a34fa5529b20S.jpg",
        "https://ae-pic-a1.aliexpress-media.com/kf/S86ab70f827ac4deaa749dcdb548acab3g.jpg",
        "https://ae-pic-a1.aliexpress-media.com/kf/Sb3eae58afcdc41b399c33ed3ee7af604j.jpg",
        "https://ae-pic-a1.aliexpress-media.com/kf/S54f302b421b14464983e54095947af871.jpg"
      ]
    },
    {
      "id": 1005007011591674,
      "handle": "brinquedo-montessori-para-aprendizagem-do-bebe-p-591674",
      "title": "Brinquedo Montessori para Aprendizagem do Bebê, Pato, Sapo, Porco, Quebra-cabeça Educacional, Presente para Criança, Men",
      "price": 1999,
      "compareAtPrice": 6269,
      "discount": 68,
      "rating": 4.9,
      "sold": "10.000+  vendido(s)",
      "images": [
        "https://ae-pic-a1.aliexpress-media.com/kf/S2560513b29934baabb36e37ab92289bcw.jpg",
        "https://ae-pic-a1.aliexpress-media.com/kf/S881dcfeed3154fb9b017b5b4b50a17edn.jpg",
        "https://ae-pic-a1.aliexpress-media.com/kf/S847c258fe36d42c8b572fade58ea5b60d.jpg",
        "https://ae-pic-a1.aliexpress-media.com/kf/S661c78ed87b742399630c3a224875578G.jpg"
      ]
    },
    {
      "id": 1005009460448734,
      "handle": "desenho-com-fio-livro-de-desenho-de-graffiti-inf-448734",
      "title": "Desenho com fio, livro de desenho de graffiti infantil, números de aprendizagem, educação precoce para melhorar as notas",
      "price": 599,
      "compareAtPrice": 1882,
      "discount": 68,
      "rating": 4.9,
      "sold": "10.000+  vendido(s)",
      "images": [
        "https://ae-pic-a1.aliexpress-media.com/kf/S39609a0a5f624139833fef7cf4c87fbbp.jpg",
        "https://ae-pic-a1.aliexpress-media.com/kf/S63f1c66e14334a2fa2e4afecc264efd8q.jpg",
        "https://ae-pic-a1.aliexpress-media.com/kf/Sad42461dc6c04fa194881035828ff991f.jpg",
        "https://ae-pic-a1.aliexpress-media.com/kf/S3197c593fca24e509331cd80f92629f2h.jpg"
      ]
    },
    {
      "id": 1005005768151889,
      "handle": "geometria-spirograph-desenho-estenceis-conjunto--151889",
      "title": "Geometria spirograph desenho estênceis conjunto modelo de pintura arte artesanato criativo crianças brinquedo educativo ",
      "price": 699,
      "compareAtPrice": 1747,
      "discount": 59,
      "rating": 4.5,
      "sold": "10.000+  vendido(s)",
      "images": [
        "https://ae-pic-a1.aliexpress-media.com/kf/S38f382f6960e44ef8a06c38d5b9e3e56S.jpg",
        "https://ae-pic-a1.aliexpress-media.com/kf/Sa99c698840ff40b2ba170eaa1fd027a4S.jpg",
        "https://ae-pic-a1.aliexpress-media.com/kf/S41566e419fee4be0a0dd5de81790c442l.jpg",
        "https://ae-pic-a1.aliexpress-media.com/kf/S5e271edf129845b1a5cc5adc1dd77e137.jpg"
      ]
    },
    {
      "id": 1005012743102211,
      "handle": "quebra-cabeca-de-geometria-montessori-para-educa-102211",
      "title": "Quebra-Cabeça de Geometria Montessori para Educação Infantil, Tabuleiro Fixo Portátil para Desenvolvimento, Quebra-Cabeç",
      "price": 1099,
      "compareAtPrice": 4442,
      "discount": 75,
      "rating": 4.9,
      "sold": "5.000+  vendido(s)",
      "images": [
        "https://ae-pic-a1.aliexpress-media.com/kf/Scbf2b45f4f854cbdb8a3f0711d303030N.jpg",
        "https://ae-pic-a1.aliexpress-media.com/kf/S7721ac746f354cc08cafc2d74eda0b07K.jpg",
        "https://ae-pic-a1.aliexpress-media.com/kf/Sb38ab05e8555468cb5ce31ad3e067d759.jpg",
        "https://ae-pic-a1.aliexpress-media.com/kf/S83823427c97640c7988639c6e72e6e32H.jpg"
      ]
    },
    {
      "id": 1005005250055424,
      "handle": "crianca-montessori-brinquedos-para-criancas-de-2-055424",
      "title": "Criança montessori brinquedos para crianças de 2 a 4 anos de idade dos desenhos animados animal dardo placa pegajosa bol",
      "price": 699,
      "compareAtPrice": 948,
      "discount": 26,
      "rating": 4.5,
      "sold": "5.000+  vendido(s)",
      "images": [
        "https://ae-pic-a1.aliexpress-media.com/kf/S426eacc94ff345479728ef4f45d5d17fM.jpg",
        "https://ae-pic-a1.aliexpress-media.com/kf/S14ffa552e9a9422fb4485a11ad25bf48b.jpg",
        "https://ae-pic-a1.aliexpress-media.com/kf/S3fa4e25d39604e5e8a671034c2d3f01ba.jpg",
        "https://ae-pic-a1.aliexpress-media.com/kf/S07fe04926ef845afa8683dd8daf16b29u.jpg"
      ]
    },
    {
      "id": 1005009614109280,
      "handle": "8-5-tabuleiro-de-desenho-lcd-escrita-tablet-para-109280",
      "title": "8.5 \"tabuleiro de desenho lcd escrita tablet para crianças menino menina montessori brinquedos educativos estudante quad",
      "price": 699,
      "compareAtPrice": 3772,
      "discount": 81,
      "rating": 4.7,
      "sold": "5.000+  vendido(s)",
      "images": [
        "https://ae-pic-a1.aliexpress-media.com/kf/Sb58aa6c8b88a4d0b84ed259b65cd3aacv.jpg",
        "https://ae-pic-a1.aliexpress-media.com/kf/S19c2443cd90748d39b13fa07d16d8ac8r.jpg",
        "https://ae-pic-a1.aliexpress-media.com/kf/Sdaf5ded3826442398c4ab5284d784b41W.jpg",
        "https://ae-pic-a1.aliexpress-media.com/kf/S4c088fcd2a774228bbb3a5befa4cbc74c.jpg"
      ]
    },
    {
      "id": 1005008622829128,
      "handle": "brinquedos-educativos-conjunto-de-brinquedos-de--829128",
      "title": "Brinquedos educativos, conjunto de brinquedos de empilhamento de cadeiras, cadeiras de empilhamento de blocos de constru",
      "price": 1599,
      "compareAtPrice": 5547,
      "discount": 71,
      "rating": 4.7,
      "sold": "4.000+  vendido(s)",
      "images": [
        "https://ae-pic-a1.aliexpress-media.com/kf/S589d793aa71c499ab6aec70a71ca7980n.jpg",
        "https://ae-pic-a1.aliexpress-media.com/kf/S62ef3103fb9f40218d8d7585ac7f804bV.jpg",
        "https://ae-pic-a1.aliexpress-media.com/kf/Sba595dfa39fd4abbbc1734ac3f15786cu.jpg",
        "https://ae-pic-a1.aliexpress-media.com/kf/S4de5150cc0ae4881bdfac385ca1e278bz.jpg"
      ]
    }
  ],
  "joias": [
    {
      "id": 1005010089177356,
      "handle": "colar-inicial-a-z-colar-banhado-a-ouro-18k-com-l-177356",
      "title": "Colar inicial A-Z colar banhado a ouro 18K com letra fofa colar de aço inoxidável para mulheres",
      "price": 599,
      "compareAtPrice": 1789,
      "discount": 66,
      "rating": 4.9,
      "sold": "10.000+  vendido(s)",
      "images": [
        "https://ae-pic-a1.aliexpress-media.com/kf/S9231a1e540d54ab9a0fa34603e6ca4988.jpg",
        "https://ae-pic-a1.aliexpress-media.com/kf/S41ec8ed3d92b4d3a8e2785e4576b5586O.jpg",
        "https://ae-pic-a1.aliexpress-media.com/kf/S4c718e8acb6b4faf9e397befca85061bq.jpg",
        "https://ae-pic-a1.aliexpress-media.com/kf/S79c64ad8eba846b7999ae369582d62f9k.jpg"
      ]
    },
    {
      "id": 1005006996432384,
      "handle": "colar-de-pingente-de-zirconia-multicolorido-banh-432384",
      "title": "Colar de Pingente de Zircônia Multicolorido Banhado a Ouro Luxuoso, Joia Elegante Vintage Charmosa para Presentear Mulhe",
      "price": 599,
      "compareAtPrice": 1852,
      "discount": 67,
      "rating": 4.9,
      "sold": "10.000+  vendido(s)",
      "images": [
        "https://ae-pic-a1.aliexpress-media.com/kf/Sdec638cff58a45bb97f4c56501adc5ebo.png",
        "https://ae-pic-a1.aliexpress-media.com/kf/Sdd89462b99294612aaae0d8f1c4b4cb9j.png",
        "https://ae-pic-a1.aliexpress-media.com/kf/Sc12f2c7eceaa4116aa2bd9129ad455d69.png",
        "https://ae-pic-a1.aliexpress-media.com/kf/Sb39358428aa341529ce049fd6204df625.png"
      ]
    },
    {
      "id": 1005005022137696,
      "handle": "colar-de-cruz-premium-para-mulheres-banhado-a-ou-137696",
      "title": "Colar de cruz premium para mulheres banhado a ouro 18k corrente com pingente de cruz de ouro da moda para meninas colar ",
      "price": 699,
      "compareAtPrice": 819,
      "discount": 14,
      "rating": 4.6,
      "sold": "5.000+  vendido(s)",
      "images": [
        "https://ae-pic-a1.aliexpress-media.com/kf/S88f98ce32f294b89856a670e5b3d7976K.jpg",
        "https://ae-pic-a1.aliexpress-media.com/kf/S3ac3b81ac9884e1ca689a6678b9a60a7m.jpg",
        "https://ae-pic-a1.aliexpress-media.com/kf/Seb61875b713540af903851a26dba00ccJ.jpg",
        "https://ae-pic-a1.aliexpress-media.com/kf/Seefde39612a942df9f961c3081f739e0B.jpg"
      ]
    },
    {
      "id": 1005006921213547,
      "handle": "18k-banhado-a-ouro-aco-inoxidavel-circulos-inter-213547",
      "title": "18k banhado a ouro aço inoxidável círculos intertravados estilo infinito números romanos colar de declaração de casament",
      "price": 699,
      "compareAtPrice": 1177,
      "discount": 40,
      "rating": 4.6,
      "sold": "5.000+  vendido(s)",
      "images": [
        "https://ae-pic-a1.aliexpress-media.com/kf/S23744082eb49457c91699ba78d6725bdq.jpg",
        "https://ae-pic-a1.aliexpress-media.com/kf/S168bcdf7f6fd42e2b7fbfc1ec8389af4z.jpg",
        "https://ae-pic-a1.aliexpress-media.com/kf/S25924c5e24ce4b06a53e11bc413df929v.jpg",
        "https://ae-pic-a1.aliexpress-media.com/kf/S2cdeb65e20ca4e899df8be93edd5d5f7n.jpg"
      ]
    },
    {
      "id": 1005006861080134,
      "handle": "colar-saint-jude-banhado-a-ouro-14k-com-pingente-080134",
      "title": "Colar Saint Jude banhado a ouro 14K com pingente San Judas corrente Figaro",
      "price": 899,
      "compareAtPrice": 2959,
      "discount": 69,
      "rating": 4.9,
      "sold": "5.000+  vendido(s)",
      "images": [
        "https://ae-pic-a1.aliexpress-media.com/kf/Sa6ddb9713b66408fb5eaa060d833fe1bM.jpg",
        "https://ae-pic-a1.aliexpress-media.com/kf/S9fa06116a279410a95de62c7cbf7a3f0I.jpg",
        "https://ae-pic-a1.aliexpress-media.com/kf/S3067d576bb274cbd918526ea29f7caadi.jpg",
        "https://ae-pic-a1.aliexpress-media.com/kf/Sb3f710d374d94df6b83b256d5f5354daw.jpg"
      ]
    },
    {
      "id": 1005008247998928,
      "handle": "corrente-de-cobra-banhada-a-ouro-aco-inoxidavel--998928",
      "title": "Corrente de cobra banhada a ouro aço inoxidável colar plano 3mm moda gargantilha hip hop espinha de peixe para homens mu",
      "price": 599,
      "compareAtPrice": 1752,
      "discount": 65,
      "rating": 4.9,
      "sold": "4.000+  vendido(s)",
      "images": [
        "https://ae-pic-a1.aliexpress-media.com/kf/Sfbcb88b43d72480b9094db8751d722f1V.jpg",
        "https://ae-pic-a1.aliexpress-media.com/kf/Sda25f597f67f438e870cf78093104c23d.jpg",
        "https://ae-pic-a1.aliexpress-media.com/kf/S3bda38fb60664b88b87ed7b81d22a7e6b.png",
        "https://ae-pic-a1.aliexpress-media.com/kf/S37a636f9339c413cbe8e516b3d25a676Q.png"
      ]
    },
    {
      "id": 1005009709024286,
      "handle": "marca-18k-banhado-a-ouro-novo-luxo-colorido-cris-024286",
      "title": "Marca 18k banhado a ouro novo luxo colorido cristal zircão colar para mulheres moda festa jóias acessórios senhoras jóia",
      "price": 1499,
      "compareAtPrice": 3265,
      "discount": 54,
      "rating": 4.8,
      "sold": "4.000+  vendido(s)",
      "images": [
        "https://ae-pic-a1.aliexpress-media.com/kf/S9aabe96cbc784bd48e58e61d3dc633afs.jpg",
        "https://ae-pic-a1.aliexpress-media.com/kf/Sb4e17c84e1d149fc886ef62581c47537f.jpg",
        "https://ae-pic-a1.aliexpress-media.com/kf/Sefa84015d9014ae1a7d11f477ff6186cl.jpg",
        "https://ae-pic-a1.aliexpress-media.com/kf/Sfc41ef84f21845aa9154cc63ec0d5de1Z.jpg"
      ]
    },
    {
      "id": 1005008997876977,
      "handle": "colar-com-pingente-de-sol-espiral-para-mulheres--876977",
      "title": "Colar com pingente de sol espiral para mulheres – aço inoxidável hipoalergênico banhado a ouro 18K, uso diário e joias d",
      "price": 699,
      "compareAtPrice": 1050,
      "discount": 33,
      "rating": 4.8,
      "sold": "4.000+  vendido(s)",
      "images": [
        "https://ae-pic-a1.aliexpress-media.com/kf/Sba7c3012b05e4aa8844a38bf603386ab4.jpg",
        "https://ae-pic-a1.aliexpress-media.com/kf/S54cff5d790754056bd19ebcc90e16220p.jpg",
        "https://ae-pic-a1.aliexpress-media.com/kf/Se525b1d05aad4c2e878de6977a95a604x.jpg",
        "https://ae-pic-a1.aliexpress-media.com/kf/Sdacdd4ee7f2e4c438656b2bf55bec80fc.jpg"
      ]
    },
    {
      "id": 1005008159403094,
      "handle": "novo-aco-inoxidavel-zircao-colares-para-mulheres-403094",
      "title": "Novo aço inoxidável zircão colares para mulheres 18k banhado a ouro quatro folhas grama colar corrente colar de luxo jói",
      "price": 1799,
      "compareAtPrice": 1941,
      "discount": 7,
      "rating": 4.7,
      "sold": "4.000+  vendido(s)",
      "images": [
        "https://ae-pic-a1.aliexpress-media.com/kf/S450ed59109c34e6289fad34e62c3798dE.jpg",
        "https://ae-pic-a1.aliexpress-media.com/kf/S2b592174bc9b4935b0951af628f6ab7cB.jpg",
        "https://ae-pic-a1.aliexpress-media.com/kf/Sdfb73c017c3648da9b9c4b1e9d29bfe5Y.jpg",
        "https://ae-pic-a1.aliexpress-media.com/kf/Sf1673d641b114cc985d8409411d773d3c.jpg"
      ]
    },
    {
      "id": 1005007169771695,
      "handle": "colar-de-corrente-fina-de-aco-inoxidavel-banhado-771695",
      "title": "Colar de corrente fina de aço inoxidável banhado a ouro requintado para mulheres estilo simples corrente de clavícula jo",
      "price": 599,
      "compareAtPrice": 1466,
      "discount": 59,
      "rating": 4.9,
      "sold": "3.000+  vendido(s)",
      "images": [
        "https://ae-pic-a1.aliexpress-media.com/kf/Sf92d25d953fc4c0c97e13614100f9b627.jpg",
        "https://ae-pic-a1.aliexpress-media.com/kf/Sa64539aafc104005bef459a940cd1221j.jpg",
        "https://ae-pic-a1.aliexpress-media.com/kf/Sdeb0f03e9998420e8dd4a4a1584af950x.jpg",
        "https://ae-pic-a1.aliexpress-media.com/kf/S00ec7e29f77248aa9858ec19523f18b6F.jpg"
      ]
    }
  ]
};
