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
  "roupas": [],
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
  "relogios": [],
  "beleza": [],
  "casa": [],
  "pet": [],
  "fitness": [],
  "gadgets": [],
  "infantil": [],
  "joias": []
};
