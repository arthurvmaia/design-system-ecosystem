/**
 * Catálogo real usado nas prévias dos temas importados.
 *
 * Extraído de https://fiordibrasil.com/products.json (loja Shopify pública) em
 * 2026-08-07: título, descrição, preços, comparação de preço, opções, variantes
 * e imagens são os da própria loja — nada aqui é inventado.
 *
 * Arquivo gerado; para atualizar, rode o extrator de novo em vez de editar à mão.
 */

export type CatalogoImagem = { src: string; width: number; height: number; alt: string; variantIds: number[] };
export type CatalogoVariante = {
  id: number; title: string; option1: string | null; option2: string | null; option3: string | null;
  sku: string; price: number; compareAtPrice: number | null; available: boolean; imageSrc: string | null;
};
export type CatalogoOpcao = { name: string; position: number; values: string[] };
export type CatalogoProduto = {
  id: number; handle: string; title: string; vendor: string; type: string; tags: string[];
  publishedAt: string; descriptionHtml: string;
  options: CatalogoOpcao[]; images: CatalogoImagem[]; variants: CatalogoVariante[];
};

export const CATALOGO_LOJA: CatalogoProduto[] = [
  {
    "id": 8341506392179,
    "handle": "zeus-smartwatch-ultra-resistente",
    "title": "StahlGear Zeus™ Smartwatch Ultra Resistente",
    "vendor": "Fiordi Brasil",
    "type": "SmartWatch",
    "tags": [
      "relógio inteligente",
      "smartwatch",
      "Stahlgear Zeus"
    ],
    "publishedAt": "2026-07-27T14:41:50-03:00",
    "descriptionHtml": "<p><strong>O Smartwatch Ultra Resistente com bateria de até 30 dias.</strong></p> <p><em>Projetado para enfrentar impactos, água e a correria do dia a dia, sem abrir mão de um design premium, chamadas Bluetooth e monitoramento inteligente da sua saúde.</em></p>",
    "options": [
      {
        "name": "Cor",
        "position": 1,
        "values": [
          "Preto",
          "Prata"
        ]
      }
    ],
    "images": [
      {
        "src": "https://cdn.shopify.com/s/files/1/0565/4590/2707/files/capa01.webp?v=1785010807",
        "width": 1254,
        "height": 1254,
        "alt": "StahlGear Zeus™ Smartwatch Ultra Resistente",
        "variantIds": []
      },
      {
        "src": "https://cdn.shopify.com/s/files/1/0565/4590/2707/files/recursos_11zon.webp?v=1785009109",
        "width": 1254,
        "height": 1254,
        "alt": "StahlGear Zeus™ Smartwatch Ultra Resistente",
        "variantIds": []
      },
      {
        "src": "https://cdn.shopify.com/s/files/1/0565/4590/2707/files/ligacoes_11zon.webp?v=1785006341",
        "width": 1254,
        "height": 1254,
        "alt": "StahlGear Zeus™ Smartwatch Ultra Resistente",
        "variantIds": []
      },
      {
        "src": "https://cdn.shopify.com/s/files/1/0565/4590/2707/files/dsafedf_be4b6bce-0dc7-47ef-8986-197a832ddc98.webp?v=1785006322",
        "width": 1254,
        "height": 1254,
        "alt": "StahlGear Zeus™ Smartwatch Ultra Resistente",
        "variantIds": []
      },
      {
        "src": "https://cdn.shopify.com/s/files/1/0565/4590/2707/files/modosesportivos_11zon.webp?v=1785006250",
        "width": 1254,
        "height": 1254,
        "alt": "StahlGear Zeus™ Smartwatch Ultra Resistente",
        "variantIds": []
      },
      {
        "src": "https://cdn.shopify.com/s/files/1/0565/4590/2707/files/saudee_11zon.webp?v=1785009109",
        "width": 1254,
        "height": 1254,
        "alt": "StahlGear Zeus™ Smartwatch Ultra Resistente",
        "variantIds": []
      },
      {
        "src": "https://cdn.shopify.com/s/files/1/0565/4590/2707/files/app_2054cfb5-b903-4de1-8e81-f821d2883b6e.webp?v=1785006243",
        "width": 1254,
        "height": 1254,
        "alt": "StahlGear Zeus™ Smartwatch Ultra Resistente",
        "variantIds": []
      },
      {
        "src": "https://cdn.shopify.com/s/files/1/0565/4590/2707/files/interfaces_11zon_823c2259-4256-441e-82c8-5e8345972aa7.webp?v=1785006237",
        "width": 1254,
        "height": 1254,
        "alt": "StahlGear Zeus™ Smartwatch Ultra Resistente",
        "variantIds": []
      }
    ],
    "variants": [
      {
        "id": 45269688942707,
        "title": "Preto",
        "option1": "Preto",
        "option2": null,
        "option3": null,
        "sku": "",
        "price": 34990,
        "compareAtPrice": 49990,
        "available": true,
        "imageSrc": "https://cdn.shopify.com/s/files/1/0565/4590/2707/files/2_f603a67b-9d44-49d6-b4d6-8a439de440cb.webp?v=1785174608"
      },
      {
        "id": 45269688975475,
        "title": "Prata",
        "option1": "Prata",
        "option2": null,
        "option3": null,
        "sku": "",
        "price": 34990,
        "compareAtPrice": 49990,
        "available": true,
        "imageSrc": "https://cdn.shopify.com/s/files/1/0565/4590/2707/files/4_a8e16381-6e13-4232-8f65-d4cf43c481cd.webp?v=1785174608"
      }
    ]
  },
  {
    "id": 8353961410675,
    "handle": "pulseira-milanesa-zeus™",
    "title": "Pulseira Milanesa Zeus™",
    "vendor": "Fiordi Brasil",
    "type": "Pulseira Relógio",
    "tags": [
      "Pulseira Metálica Zeus"
    ],
    "publishedAt": "2026-08-06T14:29:12-03:00",
    "descriptionHtml": "<ul class=\"seo-sellpoints--sellerPoint--RcmFO_y\"> <li> <pre><strong>Pulseira de aço inoxidável Zeus</strong> Esta <strong>pulseira de metal</strong> é compatível com o relógio inteligente <strong>Zeus</strong>, oferecendo um design elegante e durável. Perfeita para substituição ou uso como acessório extra.</pre> </li> <li> <pre><strong>Material de alta qualidade em aço inoxidável</strong> Fabricada em <strong>aço inoxidável</strong>, a pulseira garante resistência à corrosão e desgaste. Ideal para uso diário, mantendo o brilho e a aparência nova por muito tempo.</pre> </li> <li> <pre><strong>Tamanho universal de 24mm</strong> Com largura de <strong>24mm</strong>, é compatível com modelos de relógios que exigem este tamanho. Ajusta-se perfeitamente ao <strong>Zeus</strong> sem necessidade de adaptações.</pre> </li> <li> <pre><strong>Dois tons disponíveis: prata e preto</strong> Disponível nas cores <strong>prata</strong> e <strong>preto</strong>, a pulseira permite escolher o estilo que combina com seu gosto. Ideal para quem busca versatilidade no visual.</pre> </li> </ul>",
    "options": [
      {
        "name": "Cor",
        "position": 1,
        "values": [
          "Preta",
          "Prata"
        ]
      }
    ],
    "images": [
      {
        "src": "https://cdn.shopify.com/s/files/1/0565/4590/2707/files/preta.avif?v=1786037437",
        "width": 900,
        "height": 900,
        "alt": "Pulseira Milanesa Zeus™",
        "variantIds": [
          45326154367091
        ]
      },
      {
        "src": "https://cdn.shopify.com/s/files/1/0565/4590/2707/files/prata.avif?v=1786037437",
        "width": 900,
        "height": 900,
        "alt": "Pulseira Milanesa Zeus™",
        "variantIds": [
          45326154399859
        ]
      }
    ],
    "variants": [
      {
        "id": 45326154367091,
        "title": "Preta",
        "option1": "Preta",
        "option2": null,
        "option3": null,
        "sku": "",
        "price": 7990,
        "compareAtPrice": 11990,
        "available": true,
        "imageSrc": "https://cdn.shopify.com/s/files/1/0565/4590/2707/files/preta.avif?v=1786037437"
      },
      {
        "id": 45326154399859,
        "title": "Prata",
        "option1": "Prata",
        "option2": null,
        "option3": null,
        "sku": "",
        "price": 7990,
        "compareAtPrice": 11990,
        "available": true,
        "imageSrc": "https://cdn.shopify.com/s/files/1/0565/4590/2707/files/prata.avif?v=1786037437"
      }
    ]
  },
  {
    "id": 8322281046131,
    "handle": "escova-4em1-revitahair",
    "title": "Escova de Terapia Capilar 4 em 1 - RevitaHair Pro™",
    "vendor": "Fiordi Brasil",
    "type": "Escova Terapia Capilar",
    "tags": [
      "escova anti-queda cabelo",
      "escova de terapia capilar",
      "escova revitahair pro",
      "revitahair",
      "terapia capilar"
    ],
    "publishedAt": "2026-07-13T15:10:31-03:00",
    "descriptionHtml": "<p>Muito além de uma escova. Uma terapia completa para cabelos enfraquecidos.</p>",
    "options": [
      {
        "name": "Modelo",
        "position": 1,
        "values": [
          "Preta"
        ]
      }
    ],
    "images": [
      {
        "src": "https://cdn.shopify.com/s/files/1/0565/4590/2707/files/CapaPrincipal01_1.webp?v=1784819873",
        "width": 1620,
        "height": 1620,
        "alt": "Escova de Terapia Capilar 4 em 1 - RevitaHair Pro™",
        "variantIds": [
          45234282528883
        ]
      },
      {
        "src": "https://cdn.shopify.com/s/files/1/0565/4590/2707/files/CapaSecundaria02_ca566368-e9a5-444a-9109-a0ee851e2dbd.webp?v=1784819873",
        "width": 1620,
        "height": 1620,
        "alt": "Escova de Terapia Capilar 4 em 1 - RevitaHair Pro™",
        "variantIds": []
      },
      {
        "src": "https://cdn.shopify.com/s/files/1/0565/4590/2707/files/CapaSecundaria03_5596ed85-f0cf-4cad-99b0-96735a848d5a.webp?v=1784819873",
        "width": 1620,
        "height": 1620,
        "alt": "Escova de Terapia Capilar 4 em 1 - RevitaHair Pro™",
        "variantIds": []
      },
      {
        "src": "https://cdn.shopify.com/s/files/1/0565/4590/2707/files/CapaSecundaria04_05a60de1-3496-4b28-ae65-8272f146b298.webp?v=1784819873",
        "width": 1620,
        "height": 1620,
        "alt": "Escova de Terapia Capilar 4 em 1 - RevitaHair Pro™",
        "variantIds": []
      },
      {
        "src": "https://cdn.shopify.com/s/files/1/0565/4590/2707/files/CapaSecundaria05_2ecc0235-0c34-41a6-b4b0-c1e0ceb9524b.webp?v=1784819874",
        "width": 1620,
        "height": 1620,
        "alt": "Escova de Terapia Capilar 4 em 1 - RevitaHair Pro™",
        "variantIds": []
      },
      {
        "src": "https://cdn.shopify.com/s/files/1/0565/4590/2707/files/CapaSecundaria06_99e6c3f2-acf7-4318-b073-357b01069912.webp?v=1784819873",
        "width": 1620,
        "height": 1620,
        "alt": "Escova de Terapia Capilar 4 em 1 - RevitaHair Pro™",
        "variantIds": []
      },
      {
        "src": "https://cdn.shopify.com/s/files/1/0565/4590/2707/files/CapaSecundaria07_de01ecf5-78cb-45a4-b647-4665402a09e4.webp?v=1784819873",
        "width": 1620,
        "height": 1620,
        "alt": "Escova de Terapia Capilar 4 em 1 - RevitaHair Pro™",
        "variantIds": []
      },
      {
        "src": "https://cdn.shopify.com/s/files/1/0565/4590/2707/files/CapaSecundaria10_9ea96c1d-0564-4777-832f-10f4399f307f.webp?v=1784819873",
        "width": 1620,
        "height": 1620,
        "alt": "Escova de Terapia Capilar 4 em 1 - RevitaHair Pro™",
        "variantIds": []
      }
    ],
    "variants": [
      {
        "id": 45234282528883,
        "title": "Preta",
        "option1": "Preta",
        "option2": null,
        "option3": null,
        "sku": "",
        "price": 16990,
        "compareAtPrice": 24990,
        "available": true,
        "imageSrc": "https://cdn.shopify.com/s/files/1/0565/4590/2707/files/CapaPrincipal01_1.webp?v=1784819873"
      }
    ]
  },
  {
    "id": 8314875084915,
    "handle": "shampoo-tonalizante-gradual-maxcolor",
    "title": "Shampoo Tonalizante Gradual 3 em 1 – MaxColor Pro™",
    "vendor": "Fiordi Brasil",
    "type": "Shampoo Tonalizante Gradual",
    "tags": [
      "shampoo tonalizante"
    ],
    "publishedAt": "2026-07-08T13:26:20-03:00",
    "descriptionHtml": "<p>Tenha de volta a cor do seu cabelo de forma natural e rápida com o Shampoo MaxColor Pro. Ingredientes naturais para resultados duradouros.</p>",
    "options": [
      {
        "name": "Cor",
        "position": 1,
        "values": [
          "Preto - 100ml",
          "Castanho - 100ml"
        ]
      }
    ],
    "images": [
      {
        "src": "https://cdn.shopify.com/s/files/1/0565/4590/2707/files/1_f7c710cd-540c-4283-ab1f-d6c87c647700.webp?v=1783814564",
        "width": 1080,
        "height": 1080,
        "alt": "Shampoo Tonalizante Gradual 3 em 1 – MaxColor Pro™",
        "variantIds": []
      },
      {
        "src": "https://cdn.shopify.com/s/files/1/0565/4590/2707/files/2_6de542bc-e020-4879-a1c6-b890c90be0ec.webp?v=1783814564",
        "width": 1080,
        "height": 1080,
        "alt": "Shampoo Tonalizante Gradual 3 em 1 – MaxColor Pro™",
        "variantIds": []
      },
      {
        "src": "https://cdn.shopify.com/s/files/1/0565/4590/2707/files/3_88104118-5195-4b76-bad0-3a5f606009da.webp?v=1783814564",
        "width": 1080,
        "height": 1080,
        "alt": "Shampoo Tonalizante Gradual 3 em 1 – MaxColor Pro™",
        "variantIds": []
      },
      {
        "src": "https://cdn.shopify.com/s/files/1/0565/4590/2707/files/4_a38cfa74-44ec-4b59-beb1-4073360671d2.webp?v=1783814564",
        "width": 1080,
        "height": 1080,
        "alt": "Shampoo Tonalizante Gradual 3 em 1 – MaxColor Pro™",
        "variantIds": []
      },
      {
        "src": "https://cdn.shopify.com/s/files/1/0565/4590/2707/files/5_3d161716-1d48-43ea-a744-cfdf085a1f7d.webp?v=1783814564",
        "width": 1080,
        "height": 1080,
        "alt": "Shampoo Tonalizante Gradual 3 em 1 – MaxColor Pro™",
        "variantIds": []
      },
      {
        "src": "https://cdn.shopify.com/s/files/1/0565/4590/2707/files/6_8e021fd4-ef83-4b61-a761-be149bf41dc3.webp?v=1783814564",
        "width": 1080,
        "height": 1080,
        "alt": "Shampoo Tonalizante Gradual 3 em 1 – MaxColor Pro™",
        "variantIds": []
      },
      {
        "src": "https://cdn.shopify.com/s/files/1/0565/4590/2707/files/7_eff3838b-85ae-470d-9496-2b4687141cbf.webp?v=1783814564",
        "width": 1080,
        "height": 1080,
        "alt": "Shampoo Tonalizante Gradual 3 em 1 – MaxColor Pro™",
        "variantIds": []
      },
      {
        "src": "https://cdn.shopify.com/s/files/1/0565/4590/2707/files/8_80046b45-2f95-4add-a241-3e141d32d83c.webp?v=1783814564",
        "width": 1080,
        "height": 1080,
        "alt": "Shampoo Tonalizante Gradual 3 em 1 – MaxColor Pro™",
        "variantIds": []
      }
    ],
    "variants": [
      {
        "id": 45191040630899,
        "title": "Preto - 100ml",
        "option1": "Preto - 100ml",
        "option2": null,
        "option3": null,
        "sku": "SKU_1783527980296",
        "price": 15990,
        "compareAtPrice": 20990,
        "available": true,
        "imageSrc": "https://cdn.shopify.com/s/files/1/0565/4590/2707/files/9_41a3fe9a-2dd4-44a7-b18b-48b725e78629.webp?v=1783814564"
      },
      {
        "id": 45221808111731,
        "title": "Castanho - 100ml",
        "option1": "Castanho - 100ml",
        "option2": null,
        "option3": null,
        "sku": "",
        "price": 15990,
        "compareAtPrice": 20990,
        "available": true,
        "imageSrc": "https://cdn.shopify.com/s/files/1/0565/4590/2707/files/10_900a85d8-8441-4ecc-874b-0a12583d0f3a.webp?v=1783814564"
      }
    ]
  },
  {
    "id": 8303618130035,
    "handle": "lumiair-sistema-inteligente-ventilacao-iluminacao",
    "title": "LumiAir™ Ventilador Inteligente de Teto com Led",
    "vendor": "Fiordi Brasil",
    "type": "ventilador de teto com led",
    "tags": [
      "lumiair",
      "sistema de iluminação e ventilação",
      "ventilador",
      "ventilador com led",
      "ventilador de teto",
      "ventilador de teto com led"
    ],
    "publishedAt": "2026-06-25T16:10:03-03:00",
    "descriptionHtml": "<p><img src=\"https://cdn.shopify.com/s/files/1/0565/4590/2707/files/01_0d2c533a-268a-4836-a83b-049016b3056f.webp?v=1784219458\" alt=\"\"><img src=\"https://cdn.shopify.com/s/files/1/0565/4590/2707/files/gif_01_4_01f59058-f3bb-407f-beab-877c0261c78f.gif?v=1783782538\" alt=\"gif 01 (4).gif__PID:8b2c1abb-daf0-4288-b8fa-7b55119921a8\"><img src=\"https://cdn.shopify.com/s/files/1/0565/4590/2707/files/02_544ebde5-569d-405a-b045-b4220398e0df.webp?v=1784219458\" alt=\"\"><img src=\"https://cdn.shopify.com/s/files/1/0565/4590/2707/files/03_485dda39-be8c-4806-a455-d71a576f7b82.webp?v=1784219458\" alt=\"\"><img src=\"https://cdn.shopify.com/s/files/1/0565/4590/2707/files/gif_02_B_novo_c4fcd436-82e8-4715-be05-fa573a244561.gif?v=1783782654\" alt=\"gif 02 B novo.gif__PID:7a574a53-2a10-4b69-97cb-110e98898b44\"><img src=\"https://cdn.shopify.com/s/files/1/0565/4590/2707/files/04_b1a96c99-91e8-4dac-bb78-e0861cf7a387.webp?v=1784219458\" alt=\"\"><img src=\"https://cdn.shopify.com/s/files/1/0565/4590/2707/files/05_e4d19427-388e-4ecf-a180-28cbcd3a2852.webp?v=1784219458\" alt=\"\"><img src=\"https://cdn.shopify.com/s/files/1/0565/4590/2707/files/06_b2e5348b-e04d-488e-8306-09b0042f83d2.webp?v=1784219457\" alt=\"\"><img src=\"https://cdn.shopify.com/s/files/1/0565/4590/2707/files/07_9795cf7b-67b5-4e0d-b529-6df1d16fab6d.webp?v=1784219458\" alt=\"\"><img src=\"https://cdn.shopify.com/s/files/1/0565/4590/2707/files/08_c54cdd5b-62b3-43a3-b694-cdb0e2d34f0d.webp?v=1784219457\" alt=\"\"><img src=\"https://cdn.shopify.com/s/files/1/0565/4590/2707/files/09_57e65714-60fb-4d52-98fa-e154f2145a77.webp?v=1784219458\" alt=\"\"><img src=\"https://cdn.shopify.com/s/files/1/0565/4590/2707/files/10_81e7f5f1-b0fa-49db-a3e6-9c3d3a3e3567.webp?v=1784219457\" alt=\"\"><img src=\"https://cdn.shopify.com/s/files/1/0565/4590/2707/files/11_2003a10e-b329-422f-b61f-bb1fb73ed9bd.webp?v=1784219458\" alt=\"\"></p> <div style=\"display:grid;grid-template-columns:repeat(3,1fr);gap:10px;padding:10px;\"> <video style=\"width:100%;border-radius:8px;\" autoplay loop muted playsinline> <source src=\"https://cdn.shopify.com/videos/c/o/v/2ecdb3df71754aec8b476842e7e6d9a0.mp4\" type=\"video/mp4\"></video> <video style=\"width:100%;border-radius:8px;\" autoplay loop muted playsinline> <source src=\"https://cdn.shopify.com/videos/c/o/v/f2837237ae7c44b6a51618d295184ef4.mp4\"></video> <video style=\"width:100%;border-radius:8px;\" autoplay loop muted playsinline> <source src=\"https://cdn.shopify.com/videos/c/o/v/3d1d3597aed540019ab386569294887a.mp4\" type=\"video/mp4\"></video> </div>",
    "options": [
      {
        "name": "Cor",
        "position": 1,
        "values": [
          "Branco"
        ]
      }
    ],
    "images": [
      {
        "src": "https://cdn.shopify.com/s/files/1/0565/4590/2707/files/CapaPrincipal03_1__11zon.webp?v=1784219836",
        "width": 1620,
        "height": 1620,
        "alt": "LumiAir™ Ventilador Inteligente de Teto com Led",
        "variantIds": []
      },
      {
        "src": "https://cdn.shopify.com/s/files/1/0565/4590/2707/files/CapaSecundaria01_f51eec27-e441-41f6-baed-ba91ff78e258.webp?v=1783781694",
        "width": 1620,
        "height": 1620,
        "alt": "LumiAir™ Ventilador Inteligente de Teto com Led",
        "variantIds": []
      },
      {
        "src": "https://cdn.shopify.com/s/files/1/0565/4590/2707/files/CapaSecundaria04_52ed24d2-a491-452a-93c8-cd221b1a513e.webp?v=1783781694",
        "width": 1620,
        "height": 1620,
        "alt": "LumiAir™ Ventilador Inteligente de Teto com Led",
        "variantIds": []
      },
      {
        "src": "https://cdn.shopify.com/s/files/1/0565/4590/2707/files/CapaSecundaria03_99c023d3-79f6-47ec-8348-f5c5482c158e.webp?v=1783781694",
        "width": 1620,
        "height": 1620,
        "alt": "LumiAir™ Ventilador Inteligente de Teto com Led",
        "variantIds": []
      },
      {
        "src": "https://cdn.shopify.com/s/files/1/0565/4590/2707/files/CapaSecundaria05_3844f1a5-b2d8-4553-9ca9-5c072c72e1d8.webp?v=1783781694",
        "width": 1620,
        "height": 1620,
        "alt": "LumiAir™ Ventilador Inteligente de Teto com Led",
        "variantIds": []
      },
      {
        "src": "https://cdn.shopify.com/s/files/1/0565/4590/2707/files/CapaSecundaria06_fe94a3b3-ded6-4692-8536-cf66ac3c293c.webp?v=1783781694",
        "width": 1620,
        "height": 1620,
        "alt": "LumiAir™ Ventilador Inteligente de Teto com Led",
        "variantIds": []
      },
      {
        "src": "https://cdn.shopify.com/s/files/1/0565/4590/2707/files/CapaSecundaria07_5e92bb3c-fadb-4e98-b807-67f80046b473.webp?v=1783781694",
        "width": 1620,
        "height": 1620,
        "alt": "LumiAir™ Ventilador Inteligente de Teto com Led",
        "variantIds": []
      },
      {
        "src": "https://cdn.shopify.com/s/files/1/0565/4590/2707/files/CapaSecundaria15.webp?v=1783781694",
        "width": 1620,
        "height": 1620,
        "alt": "LumiAir™ Ventilador Inteligente de Teto com Led",
        "variantIds": []
      }
    ],
    "variants": [
      {
        "id": 45135137702003,
        "title": "Branco",
        "option1": "Branco",
        "option2": null,
        "option3": null,
        "sku": "3464536636",
        "price": 13990,
        "compareAtPrice": 19990,
        "available": true,
        "imageSrc": "https://cdn.shopify.com/s/files/1/0565/4590/2707/files/CapaSecundaria14.webp?v=1783781694"
      }
    ]
  },
  {
    "id": 8299164991603,
    "handle": "corretivo-tratamento-alta-cobertura-skinpro24h",
    "title": "Corretivo Tratamento de Alta Cobertura - SkinPro 24H™",
    "vendor": "Fiordi Brasil",
    "type": "Corretivo Tratamento",
    "tags": [
      "Alta cobertura",
      "Corretivo",
      "Corretivo tratamento",
      "creme corretivo",
      "SkinPro"
    ],
    "publishedAt": "2026-06-23T14:52:29-03:00",
    "descriptionHtml": "<div style=\"display: grid; grid-template-columns: repeat(3,1fr); gap: 10px; padding: 10px;\"> <video style=\"width: 100%; border-radius: 8px;\" autoplay=\"autoplay\" loop=\"loop\" muted=\"\" playsinline=\"\" preload=\"auto\"> <source src=\"https://cdn.shopify.com/videos/c/o/v/2197553bd8d14ccfa0e22a6077330f41.mp4\"></video> <video style=\"width: 100%; border-radius: 8px;\" autoplay=\"autoplay\" loop=\"loop\" muted=\"\" playsinline=\"\" preload=\"auto\"> <source src=\"https://cdn.shopify.com/videos/c/o/v/896d989209974704a084ff9a95998af4.mp4\"></video> <video style=\"width: 100%; border-radius: 8px;\" autoplay=\"autoplay\" loop=\"loop\" muted=\"\" playsinline=\"\" preload=\"auto\"> <source src=\"https://cdn.shopify.com/videos/c/o/v/51075eefd5f648f8861eea70ddd81c2c.mp4\" type=\"video/mp4\"></video> </div> <p><img alt=\"\" src=\"https://cdn.shopify.com/s/files/1/0565/4590/2707/files/01_1cba692e-8795-4ebf-bcee-cec8d75476e1.webp?v=1782518371\"></p> <div style=\"max-width: 100%; margin: 20px auto;\"> <div style=\"display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px;\"> <img src=\"https://cdn.shopify.com/s/files/1/0565/4590/2707/files/Claro.gif?v=1782246298\" alt=\"GIF 1\" style=\"width: 100%; border-radius: 14px; display: block; box-shadow: 0 4px 12px rgba(0,0,0,0.08);\"> <img src=\"https://cdn.shopify.com/s/files/1/0565/4590/2707/files/Medio.gif?v=1782246299\" alt=\"GIF 2\" style=\"width: 100%; border-radius: 14px; display: block; box-shadow: 0 4px 12px rgba(0,0,0,0.08);\"> <img src=\"https://cdn.shopify.com/s/files/1/0565/4590/2707/files/Escuro.gif?v=1782246298\" alt=\"GIF 3\" style=\"width: 100%; border-radius: 14px; display: block; box-shadow: 0 4px 12px rgba(0,0,0,0.08);\"> <img src=\"https://cdn.shopify.com/s/files/1/0565/4590/2707/files/Preto.gif?v=1782246299\" alt=\"GIF 4\" style=\"width: 100%; border-radius: 14px; display: block; box-shadow: 0 4px 12px rgba(0,0,0,0.08);\"> </div> <div style=\"display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px;\"><br></div> <p><img src=\"https://cdn.shopify.com/s/files/1/0565/4590/2707/files/02_69a7bb2d-d7a1-4540-890d-7607a9a04d76.webp?v=1782518370\" alt=\"\"><img src=\"https://cdn.shopify.com/s/files/1/0565/4590/2707/files/03_49a79340-7908-40f0-86d6-577c9c00464b.webp?v=1782518370\" alt=\"\"><img src=\"https://cdn.shopify.com/s/files/1/0565/4590/2707/files/04_8c0d743e-db54-4f40-8b46-d5f87e938e3e.webp?v=1782518371\" alt=\"\"><img src=\"https://cdn.shopify.com/s/files/1/0565/4590/2707/files/05_95d16d9e-95a2-4eb0-a3e2-67d66bc565b7.webp?v=1782518371\" alt=\"\"><img src=\"https://cdn.shopify.com/s/files/1/0565/4590/2707/files/06_f4699da5-df85-4f9c-b4c9-20091567efa5.webp?v=1782518370\" alt=\"\"><img src=\"https://cdn.shopify.com/s/files/1/0565/4590/2707/files/07_8f8e4603-f78e-4ac1-bdc8-32e6f48ac7c6.webp?v=1782518370\" alt=\"\"><img src=\"https://cdn.shopify.com/s/files/1/0565/4590/2707/files/08_c3f75adc-b844-476c-b7c4-693421d4de4f.webp?v=1782518371\" alt=\"\"><img src=\"https://cdn.shopify.com/s/files/1/0565/4590/2707/files/09_62716ba8-1525-40f7-8b1b-24e7841a9984.webp?v=1782518371\" alt=\"\"><img src=\"https://cdn.shopify.com/s/files/1/0565/4590/2707/files/10_106a0898-9b6e-49e7-b49f-b943458b7a63.webp?v=1782518371\" alt=\"\"><img src=\"https://cdn.shopify.com/s/files/1/0565/4590/2707/files/11_5f28235b-f502-4f78-8fcd-582f8683cce9.webp?v=1782518370\" alt=\"\"><img src=\"https://cdn.shopify.com/s/files/1/0565/4590/2707/files/12_37be9383-ec21-46bb-be8c-9574fd9ae773.webp?v=1782518370\" alt=\"\"><img src=\"https://cdn.shopify.com/s/files/1/0565/4590/2707/files/13_b15f3bf6-4662-4523-abb3-b181ebc3ee04.webp?v=1782518370\" alt=\"\"><img src=\"https://cdn.shopify.com/s/files/1/0565/4590/2707/files/14_ba223ca9-e634-495b-be03-027f7aac23ef.webp?v=1782518370\" alt=\"\"><img src=\"https://cdn.shopify.com/s/files/1/0565/4590/2707/files/15_aae6ef7d-ef24-47f2-9002-45c501d7d812.webp?v=1782518370\" alt=\"\"><img src=\"https://cdn.shopify.com/s/files/1/0565/4590/2707/files/16_f1b89bd9-cf34-4566-867e-e95d3efb596a.webp?v=1782518371\" alt=\"\"><img src=\"https://cdn.shopify.com/s/files/1/0565/4590/2707/files/17_a176fdb6-fcc1-402c-bc13-0a64ac24ea0f.webp?v=1782518371\" alt=\"\"><img src=\"https://cdn.shopify.com/s/files/1/0565/4590/2707/files/18_807a47f4-29ee-4fab-aef1-f2577cc8ee6c.webp?v=1782518370\" alt=\"\"><img src=\"https://cdn.shopify.com/s/files/1/0565/4590/2707/files/19_19d50446-fc27-4eaa-ae0e-948b9605b83c.webp?v=1782302366\" alt=\"\"><img src=\"https://cdn.shopify.com/s/files/1/0565/4590/2707/files/20_f72df9a5-efd5-4ea4-ad82-0ae7e91af243.webp?v=1782302367\" alt=\"\"><img src=\"https://cdn.shopify.com/s/files/1/0565/4590/2707/files/21_d197b134-fe11-4dbb-8b14-c369d380f3f6.webp?v=1782302367\" alt=\"\"></p> <p>Corretivo Tratamento de Alta Cobertura - SkinPro 24H™</p> </div>",
    "options": [
      {
        "name": "Cor",
        "position": 1,
        "values": [
          "#01",
          "#02",
          "#03",
          "#04",
          "#05",
          "#06"
        ]
      }
    ],
    "images": [
      {
        "src": "https://cdn.shopify.com/s/files/1/0565/4590/2707/files/CapaPrincipal02_b556f31e-4d13-4b30-9108-eb204f0d603c.webp?v=1782518771",
        "width": 1620,
        "height": 1620,
        "alt": "Corretivo Tratamento de Alta Cobertura - SkinPro 24H™",
        "variantIds": []
      },
      {
        "src": "https://cdn.shopify.com/s/files/1/0565/4590/2707/files/CapaSec.08_9b18d979-a5fa-4880-8d1c-4a6aa10e7a02.webp?v=1782518771",
        "width": 1620,
        "height": 1620,
        "alt": "Corretivo Tratamento de Alta Cobertura - SkinPro 24H™",
        "variantIds": []
      },
      {
        "src": "https://cdn.shopify.com/s/files/1/0565/4590/2707/files/CapaSec.02_302e9757-05e2-40e9-b161-302f8b5edd6c.webp?v=1782518771",
        "width": 1620,
        "height": 1620,
        "alt": "Corretivo Tratamento de Alta Cobertura - SkinPro 24H™",
        "variantIds": []
      },
      {
        "src": "https://cdn.shopify.com/s/files/1/0565/4590/2707/files/Designsemnome_52.webp?v=1782303449",
        "width": 1080,
        "height": 1080,
        "alt": "Corretivo Tratamento de Alta Cobertura - SkinPro 24H™",
        "variantIds": []
      },
      {
        "src": "https://cdn.shopify.com/s/files/1/0565/4590/2707/files/CapaSec.03_2ca43b6e-f0c9-415d-acdd-11d810836f32.webp?v=1782518771",
        "width": 1620,
        "height": 1620,
        "alt": "Corretivo Tratamento de Alta Cobertura - SkinPro 24H™",
        "variantIds": []
      },
      {
        "src": "https://cdn.shopify.com/s/files/1/0565/4590/2707/files/CapaSec.04_31ce7ea0-47ec-4b32-ac37-7d851eb8c776.webp?v=1782518771",
        "width": 1620,
        "height": 1620,
        "alt": "Corretivo Tratamento de Alta Cobertura - SkinPro 24H™",
        "variantIds": []
      },
      {
        "src": "https://cdn.shopify.com/s/files/1/0565/4590/2707/files/CapaSec.05_a06da825-081f-431c-b54a-461d59d2d4e8.webp?v=1782518771",
        "width": 1620,
        "height": 1620,
        "alt": "Corretivo Tratamento de Alta Cobertura - SkinPro 24H™",
        "variantIds": []
      },
      {
        "src": "https://cdn.shopify.com/s/files/1/0565/4590/2707/files/CapaSec.09_eec01888-abce-4984-b0c2-1e6384364ad3.webp?v=1782518771",
        "width": 1620,
        "height": 1620,
        "alt": "Corretivo Tratamento de Alta Cobertura - SkinPro 24H™",
        "variantIds": []
      }
    ],
    "variants": [
      {
        "id": 45125406687347,
        "title": "#01",
        "option1": "#01",
        "option2": null,
        "option3": null,
        "sku": "",
        "price": 11990,
        "compareAtPrice": 17990,
        "available": true,
        "imageSrc": "https://cdn.shopify.com/s/files/1/0565/4590/2707/files/CapaSec.15.webp?v=1782518771"
      },
      {
        "id": 45125406720115,
        "title": "#02",
        "option1": "#02",
        "option2": null,
        "option3": null,
        "sku": "",
        "price": 11990,
        "compareAtPrice": 17990,
        "available": true,
        "imageSrc": "https://cdn.shopify.com/s/files/1/0565/4590/2707/files/CapaSec.16.webp?v=1782518771"
      },
      {
        "id": 45125406752883,
        "title": "#03",
        "option1": "#03",
        "option2": null,
        "option3": null,
        "sku": "",
        "price": 11990,
        "compareAtPrice": 17990,
        "available": true,
        "imageSrc": "https://cdn.shopify.com/s/files/1/0565/4590/2707/files/CapaSec.17.webp?v=1782518771"
      },
      {
        "id": 45125406785651,
        "title": "#04",
        "option1": "#04",
        "option2": null,
        "option3": null,
        "sku": "",
        "price": 11990,
        "compareAtPrice": 17990,
        "available": true,
        "imageSrc": "https://cdn.shopify.com/s/files/1/0565/4590/2707/files/CapaSec.18.webp?v=1782518771"
      },
      {
        "id": 45125406818419,
        "title": "#05",
        "option1": "#05",
        "option2": null,
        "option3": null,
        "sku": "",
        "price": 11990,
        "compareAtPrice": 17990,
        "available": true,
        "imageSrc": "https://cdn.shopify.com/s/files/1/0565/4590/2707/files/CapaSec.19.webp?v=1782518771"
      },
      {
        "id": 45125406851187,
        "title": "#06",
        "option1": "#06",
        "option2": null,
        "option3": null,
        "sku": "",
        "price": 11990,
        "compareAtPrice": 17990,
        "available": true,
        "imageSrc": "https://cdn.shopify.com/s/files/1/0565/4590/2707/files/CapaSec.20.webp?v=1782518771"
      }
    ]
  },
  {
    "id": 8292116824179,
    "handle": "depilador-multifuncional-4em1-dermaflex",
    "title": "Depilador Multifuncional 4 em 1 - DermaFlex®",
    "vendor": "Fiordi Brasil",
    "type": "DermaFlex® - Depilador Elétrico 4 em 1",
    "tags": [
      "depilador",
      "depilador 4 em 1",
      "depilador a laser",
      "depilador elétrico",
      "depilador indolor",
      "dermaflex",
      "removedor de pelos"
    ],
    "publishedAt": "2026-06-13T17:17:27-03:00",
    "descriptionHtml": "<div style=\"display: grid; grid-template-columns: repeat(3,1fr); gap: 10px; padding: 10px;\"> <video playsinline=\"\" muted=\"\" loop=\"loop\" autoplay=\"autoplay\" style=\"width: 100%; border-radius: 8px;\"> <source type=\"video/mp4\" src=\"https://cdn.shopify.com/videos/c/o/v/d2179f93439247e3b5ba82773c19f12c.mp4\"></video> <video playsinline=\"\" muted=\"\" loop=\"loop\" autoplay=\"autoplay\" style=\"width: 100%; border-radius: 8px;\"> <source type=\"video/mp4\" src=\"https://cdn.shopify.com/videos/c/o/v/ac2afa520b8a43c187a4e22b9178bf35.mp4\"></video> <video playsinline=\"\" muted=\"\" loop=\"loop\" autoplay=\"autoplay\" style=\"width: 100%; border-radius: 8px;\"> <source type=\"video/mp4\" src=\"https://cdn.shopify.com/videos/c/o/v/3f26c7d08c7e4af9a38da44cd6c864ea.mp4\"></video> </div> <p><img alt=\"\" src=\"https://cdn.shopify.com/s/files/1/0565/4590/2707/files/Parte_1_-_DERMAFLEX.webp?v=1751503187\"><img src=\"https://cdn.shopify.com/s/files/1/0565/4590/2707/files/Video_GIF_03.gif?v=1740709370\" alt=\"\" style=\"display: block; margin-left: auto; margin-right: auto;\"><img alt=\"\" src=\"https://cdn.shopify.com/s/files/1/0565/4590/2707/files/Parte_2_-_DERMAFLEX.webp?v=1751503188\"><img alt=\"\" src=\"https://cdn.shopify.com/s/files/1/0565/4590/2707/files/Parte_3_-_DERMAFLEX.webp?v=1751503188\"></p>",
    "options": [
      {
        "name": "Cor",
        "position": 1,
        "values": [
          "Rosa"
        ]
      }
    ],
    "images": [
      {
        "src": "https://cdn.shopify.com/s/files/1/0565/4590/2707/files/3.5_4.webp?v=1751667253",
        "width": 1080,
        "height": 1080,
        "alt": "Depilador Multifuncional 4 em 1 - DermaFlex®",
        "variantIds": []
      },
      {
        "src": "https://cdn.shopify.com/s/files/1/0565/4590/2707/files/5_1.webp?v=1751667253",
        "width": 1080,
        "height": 1080,
        "alt": "Depilador Multifuncional 4 em 1 - DermaFlex®",
        "variantIds": []
      },
      {
        "src": "https://cdn.shopify.com/s/files/1/0565/4590/2707/files/7_5.webp?v=1752242870",
        "width": 1080,
        "height": 1080,
        "alt": "Depilador Multifuncional 4 em 1 - DermaFlex®",
        "variantIds": []
      },
      {
        "src": "https://cdn.shopify.com/s/files/1/0565/4590/2707/files/8_1.webp?v=1752242870",
        "width": 1080,
        "height": 1080,
        "alt": "Depilador Multifuncional 4 em 1 - DermaFlex®",
        "variantIds": []
      },
      {
        "src": "https://cdn.shopify.com/s/files/1/0565/4590/2707/files/7_5_1.webp?v=1752242870",
        "width": 1080,
        "height": 1080,
        "alt": "Depilador Multifuncional 4 em 1 - DermaFlex®",
        "variantIds": []
      },
      {
        "src": "https://cdn.shopify.com/s/files/1/0565/4590/2707/files/9_1.webp?v=1763835400",
        "width": 1080,
        "height": 1080,
        "alt": "Depilador Multifuncional 4 em 1 - DermaFlex®",
        "variantIds": []
      },
      {
        "src": "https://cdn.shopify.com/s/files/1/0565/4590/2707/files/10_2.webp?v=1763835400",
        "width": 1080,
        "height": 1080,
        "alt": "Depilador Multifuncional 4 em 1 - DermaFlex®",
        "variantIds": [
          45101015695475
        ]
      }
    ],
    "variants": [
      {
        "id": 45101015695475,
        "title": "Rosa",
        "option1": "Rosa",
        "option2": null,
        "option3": null,
        "sku": "",
        "price": 15990,
        "compareAtPrice": 23900,
        "available": true,
        "imageSrc": "https://cdn.shopify.com/s/files/1/0565/4590/2707/files/10_2.webp?v=1763835400"
      }
    ]
  },
  {
    "id": 8108863651955,
    "handle": "escova-alisadora-portatil-beautymax-pro",
    "title": "Escova Alisadora Portátil - BeautyMax Pro®",
    "vendor": "Fiordi Brasil",
    "type": "Escova Alisadora Portátil - BeautyMax Pro®",
    "tags": [
      "alisadora e secadora",
      "anti-frizz",
      "beautymax pro",
      "escova alisadora",
      "escova alisadora portátil",
      "escova modeladora",
      "Melhor Escova Alisadora"
    ],
    "publishedAt": "2026-06-10T13:40:21-03:00",
    "descriptionHtml": "<p><img alt=\"\" src=\"https://cdn.shopify.com/s/files/1/0565/4590/2707/files/Banner_Urgencia_-_BeuatyMax_-_V2.1.webp?v=1780633589\"></p> <div style=\"display: grid; grid-template-columns: repeat(3,1fr); gap: 10px; padding: 10px;\"> <video playsinline=\"\" muted=\"\" loop=\"loop\" autoplay=\"autoplay\" style=\"width: 100%; border-radius: 8px;\"> <source type=\"video/mp4\" src=\"https://cdn.shopify.com/videos/c/o/v/38f7186a872b4309a164c6cce84b4f4b.mp4\"></video> <video playsinline=\"\" muted=\"\" loop=\"loop\" autoplay=\"autoplay\" style=\"width: 100%; border-radius: 8px;\"> <source src=\"https://cdn.shopify.com/videos/c/o/v/18b8c6226b7142b490b42ceef297c9ea.mp4\"></video> <video playsinline=\"\" muted=\"\" loop=\"loop\" autoplay=\"autoplay\" style=\"width: 100%; border-radius: 8px;\"> <source type=\"video/mp4\" src=\"https://cdn.shopify.com/videos/c/o/v/d3b7b31b2e704ae09c69ed69775c8e0c.mp4\"></video> </div> <p><img alt=\"\" src=\"https://cdn.shopify.com/s/files/1/0565/4590/2707/files/01_3.webp?v=1780632763\"><img alt=\"\" src=\"https://cdn.shopify.com/s/files/1/0565/4590/2707/files/02_2.webp?v=1780632764\"><img alt=\"\" src=\"https://cdn.shopify.com/s/files/1/0565/4590/2707/files/03_2.webp?v=1780632764\"><img alt=\"\" src=\"https://cdn.shopify.com/s/files/1/0565/4590/2707/files/04_1.webp?v=1780632764\"><img alt=\"\" src=\"https://cdn.shopify.com/s/files/1/0565/4590/2707/files/05_2.webp?v=1780632764\"><img alt=\"\" src=\"https://cdn.shopify.com/s/files/1/0565/4590/2707/files/06_1.webp?v=1780632764\"><img alt=\"\" src=\"https://cdn.shopify.com/s/files/1/0565/4590/2707/files/07_3.webp?v=1780632764\"><img alt=\"\" src=\"https://cdn.shopify.com/s/files/1/0565/4590/2707/files/08_2.webp?v=1780632764\"><img alt=\"\" src=\"https://cdn.shopify.com/s/files/1/0565/4590/2707/files/09_3.webp?v=1780632764\"><img alt=\"\" src=\"https://cdn.shopify.com/s/files/1/0565/4590/2707/files/10_4.webp?v=1780632765\"></p> <p>Escova alisadora portátil sem fio que alisa, modela e dá brilho em minutos. Leve a BeautyMax Pro pra onde quiser e tenha cabelo de salão onde estiver!</p>",
    "options": [
      {
        "name": "Cor",
        "position": 1,
        "values": [
          "Preto",
          "Branco",
          "Rosa",
          "Azul Claro"
        ]
      }
    ],
    "images": [
      {
        "src": "https://cdn.shopify.com/s/files/1/0565/4590/2707/files/CapaPrincipal03_2__11zon_7cdfbf8c-9760-4f33-b9de-8e035b94667a.webp?v=1785278381",
        "width": 1620,
        "height": 1620,
        "alt": "Escova Alisadora Portátil - BeautyMax Pro®",
        "variantIds": []
      },
      {
        "src": "https://cdn.shopify.com/s/files/1/0565/4590/2707/files/CapaSecundaria01_853ab209-0153-4d56-93ef-b1deb9e7b64a.webp?v=1781110515",
        "width": 1620,
        "height": 1620,
        "alt": "Escova Alisadora Portátil - BeautyMax Pro®",
        "variantIds": []
      },
      {
        "src": "https://cdn.shopify.com/s/files/1/0565/4590/2707/files/CapaSecundaria03_2dfdcb5d-824b-4ab2-9cce-168d4a4371ad.webp?v=1781110517",
        "width": 1620,
        "height": 1620,
        "alt": "Escova Alisadora Portátil - BeautyMax Pro®",
        "variantIds": []
      },
      {
        "src": "https://cdn.shopify.com/s/files/1/0565/4590/2707/files/CapaSecundaria04_4b264f3b-c96a-424d-b743-95e093d9cb15.webp?v=1781110527",
        "width": 1620,
        "height": 1620,
        "alt": "Escova Alisadora Portátil - BeautyMax Pro®",
        "variantIds": []
      },
      {
        "src": "https://cdn.shopify.com/s/files/1/0565/4590/2707/files/CapaSecundaria05_b6c587c5-2677-4446-af90-9974bb28e3c5.webp?v=1781110483",
        "width": 1620,
        "height": 1620,
        "alt": "Escova Alisadora Portátil - BeautyMax Pro®",
        "variantIds": []
      },
      {
        "src": "https://cdn.shopify.com/s/files/1/0565/4590/2707/files/5_0d2efcab-d1f2-4ad5-9ec7-d3b1aa4b21bf.webp?v=1772912024",
        "width": 1080,
        "height": 1080,
        "alt": "Escova Alisadora Portátil - BeautyMax Pro®",
        "variantIds": []
      },
      {
        "src": "https://cdn.shopify.com/s/files/1/0565/4590/2707/files/CapaSecundaria06_9bbf583d-5946-4633-a0f6-6b5fa2cfe924.webp?v=1781110501",
        "width": 1620,
        "height": 1620,
        "alt": "Escova Alisadora Portátil - BeautyMax Pro®",
        "variantIds": []
      },
      {
        "src": "https://cdn.shopify.com/s/files/1/0565/4590/2707/files/CapaSecundaria08_9af497e5-83da-4795-ba81-29fc8971d483.webp?v=1781110520",
        "width": 1620,
        "height": 1620,
        "alt": "Escova Alisadora Portátil - BeautyMax Pro®",
        "variantIds": []
      }
    ],
    "variants": [
      {
        "id": 43979202003059,
        "title": "Preto",
        "option1": "Preto",
        "option2": null,
        "option3": null,
        "sku": "",
        "price": 18490,
        "compareAtPrice": 28490,
        "available": true,
        "imageSrc": "https://cdn.shopify.com/s/files/1/0565/4590/2707/files/Variante1_3.webp?v=1772912024"
      },
      {
        "id": 43979202035827,
        "title": "Branco",
        "option1": "Branco",
        "option2": null,
        "option3": null,
        "sku": "",
        "price": 18490,
        "compareAtPrice": 28490,
        "available": true,
        "imageSrc": "https://cdn.shopify.com/s/files/1/0565/4590/2707/files/Variante2_69050847-cba5-4aef-9b0b-2634eadaf6cd.webp?v=1772912024"
      },
      {
        "id": 43979202068595,
        "title": "Rosa",
        "option1": "Rosa",
        "option2": null,
        "option3": null,
        "sku": "",
        "price": 18490,
        "compareAtPrice": 28490,
        "available": true,
        "imageSrc": "https://cdn.shopify.com/s/files/1/0565/4590/2707/files/Variante3_ae14aaa7-d8fc-4b99-af10-b30183630157.webp?v=1772912024"
      },
      {
        "id": 43979202101363,
        "title": "Azul Claro",
        "option1": "Azul Claro",
        "option2": null,
        "option3": null,
        "sku": "",
        "price": 18490,
        "compareAtPrice": 28490,
        "available": true,
        "imageSrc": "https://cdn.shopify.com/s/files/1/0565/4590/2707/files/Variante4_19184b80-41c3-4dbd-be4d-ce02a115e564.webp?v=1772912024"
      }
    ]
  },
  {
    "id": 8202093265011,
    "handle": "escova-eletrica-9em1-turboclean",
    "title": "TurboClean™ - Escova de Limpeza Elétrica 9 em 1",
    "vendor": "Fiordi Brasil",
    "type": "TurboClean™ - Escova de Limpeza Elétrica 9 em 1",
    "tags": [
      "escova 9 em 1",
      "escova de limpeza elétrica",
      "escova elétrica",
      "escova limpeza",
      "escova limpeza profunda",
      "turboclean",
      "turboclean 9 em 1"
    ],
    "publishedAt": "2026-02-20T17:15:01-03:00",
    "descriptionHtml": "<div style=\"display: grid; grid-template-columns: repeat(3,1fr); gap: 10px; padding: 10px;\"> <video style=\"width: 100%; border-radius: 8px;\" autoplay=\"autoplay\" loop=\"loop\" muted=\"\" playsinline=\"\"> <source src=\"https://cdn.shopify.com/videos/c/o/v/6ce860b77ac3465ca494e325266e3651.mp4\" type=\"video/mp4\"></video> <video style=\"width: 100%; border-radius: 8px;\" autoplay=\"autoplay\" loop=\"loop\" muted=\"\" playsinline=\"\"> <source src=\"https://cdn.shopify.com/videos/c/o/v/298a8c6504464ce6a4ead2ade37e2fb9.mp4\" type=\"video/mp4\"></video> <video style=\"width: 100%; border-radius: 8px;\" autoplay=\"autoplay\" loop=\"loop\" muted=\"\" playsinline=\"\"> <source src=\"https://cdn.shopify.com/videos/c/o/v/68314756cc7040feb2293447fd042535.mp4\" type=\"video/mp4\"></video> </div> <p style=\"text-align: center;\" dir=\"ltr\"><span style=\"color: rgb(0, 170, 255);\"><strong><img alt=\"\" src=\"https://cdn.shopify.com/s/files/1/0565/4590/2707/files/01_1_a348de38-525c-47be-9dae-d2c10a3e5802.webp?v=1772375932\"><video style=\"width: 100%; display: block; margin: 0 auto;\" autoplay muted loop playsinline> <source src=\"https://cdn.shopify.com/videos/c/o/v/5a51351205554775a96621df13220024.mp4\" type=\"video/mp4\"></video><img alt=\"\" src=\"https://cdn.shopify.com/s/files/1/0565/4590/2707/files/02_1.webp?v=1772375932\"><img src=\"https://cdn.shopify.com/s/files/1/0565/4590/2707/files/03_1.webp?v=1772375932\" alt=\"\"><img src=\"https://cdn.shopify.com/s/files/1/0565/4590/2707/files/04_e360db60-3ce3-4a89-97fb-f41b3ff74951.webp?v=1772375933\" alt=\"\"><img src=\"https://cdn.shopify.com/s/files/1/0565/4590/2707/files/05_1.webp?v=1772375932\" alt=\"\"><img src=\"https://cdn.shopify.com/s/files/1/0565/4590/2707/files/06_46fc52ae-60eb-4cae-8e96-64156408ce65.webp?v=1772375932\" alt=\"\"><img src=\"https://cdn.shopify.com/s/files/1/0565/4590/2707/files/07_1.webp?v=1772375932\" alt=\"\"><img src=\"https://cdn.shopify.com/s/files/1/0565/4590/2707/files/08_1_a1fa7be3-c506-4730-97fc-5384e1d3f868.webp?v=1772375932\" alt=\"\"><img src=\"https://cdn.shopify.com/s/files/1/0565/4590/2707/files/09_fe0eb010-5dc0-4cc4-9134-9cef54514749.webp?v=1772375933\" alt=\"\"></strong></span></p> <p style=\"text-align: center;\" dir=\"ltr\"><strong>Itens Inclusos</strong><b></b></p> <p dir=\"ltr\"><span>✔️ 1 Escova elétrica TurboClean™</span></p> <p dir=\"ltr\"><span>✔️ 9 escovas intercambiáveis específicas</span></p> <p dir=\"ltr\"><span>✔️ 1 Cabo extensor ajustável e retrátil</span></p> <p dir=\"ltr\"><span>✔️ 1 Cabo USB para recarga</span></p> <p dir=\"ltr\"><span>✔️ Manual de instruções</span></p> <h4><b id=\"docs-internal-guid-f662b22e-7fff-5bed-60a0-56cf3a8affe7\"><span><b id=\"docs-internal-guid-28fac552-7fff-8adc-6297-b3c7a568c95a\"><b id=\"docs-internal-guid-850fb5b7-7fff-cd25-f4ab-4d4496397b0a\"></b></b></span></b></h4>",
    "options": [
      {
        "name": "Title",
        "position": 1,
        "values": [
          "Default Title"
        ]
      }
    ],
    "images": [
      {
        "src": "https://cdn.shopify.com/s/files/1/0565/4590/2707/files/30_1.webp?v=1773241370",
        "width": 1080,
        "height": 1080,
        "alt": "TurboClean™ - Escova de Limpeza Elétrica 9 em 1",
        "variantIds": []
      },
      {
        "src": "https://cdn.shopify.com/s/files/1/0565/4590/2707/files/CapaSecundaria02.webp?v=1773241370",
        "width": 1080,
        "height": 1080,
        "alt": "TurboClean™ - Escova de Limpeza Elétrica 9 em 1",
        "variantIds": []
      },
      {
        "src": "https://cdn.shopify.com/s/files/1/0565/4590/2707/files/CapaSecundaria06.webp?v=1773241370",
        "width": 1080,
        "height": 1080,
        "alt": "TurboClean™ - Escova de Limpeza Elétrica 9 em 1",
        "variantIds": []
      },
      {
        "src": "https://cdn.shopify.com/s/files/1/0565/4590/2707/files/CapaSecundaria03.webp?v=1773241370",
        "width": 1080,
        "height": 1080,
        "alt": "TurboClean™ - Escova de Limpeza Elétrica 9 em 1",
        "variantIds": []
      },
      {
        "src": "https://cdn.shopify.com/s/files/1/0565/4590/2707/files/CapaSecundaria04.webp?v=1773241370",
        "width": 1080,
        "height": 1080,
        "alt": "TurboClean™ - Escova de Limpeza Elétrica 9 em 1",
        "variantIds": []
      },
      {
        "src": "https://cdn.shopify.com/s/files/1/0565/4590/2707/files/CapaSecundaria05.webp?v=1773241370",
        "width": 1080,
        "height": 1080,
        "alt": "TurboClean™ - Escova de Limpeza Elétrica 9 em 1",
        "variantIds": []
      },
      {
        "src": "https://cdn.shopify.com/s/files/1/0565/4590/2707/files/CapaSecundaria07.webp?v=1773241370",
        "width": 1080,
        "height": 1080,
        "alt": "TurboClean™ - Escova de Limpeza Elétrica 9 em 1",
        "variantIds": []
      },
      {
        "src": "https://cdn.shopify.com/s/files/1/0565/4590/2707/files/CapaSecundaria08.webp?v=1773241370",
        "width": 1080,
        "height": 1080,
        "alt": "TurboClean™ - Escova de Limpeza Elétrica 9 em 1",
        "variantIds": []
      }
    ],
    "variants": [
      {
        "id": 44325632278643,
        "title": "Default Title",
        "option1": "Default Title",
        "option2": null,
        "option3": null,
        "sku": "",
        "price": 22990,
        "compareAtPrice": 29990,
        "available": true,
        "imageSrc": null
      }
    ]
  },
  {
    "id": 8196002218099,
    "handle": "escova-dente-eletrica-oralhydra-pro",
    "title": "Escova de Dente Elétrica - OralHydra Pro®",
    "vendor": "Fiordi Brasil",
    "type": "Escova de Dente Elétrica - OralHydra Pro®",
    "tags": [
      "dentes brancos",
      "escova de dente",
      "escova de dente elétrica",
      "escova dente sônica",
      "higiene bucal",
      "limpeza dental"
    ],
    "publishedAt": "2026-02-12T14:59:02-03:00",
    "descriptionHtml": "<p><img src=\"https://cdn.shopify.com/s/files/1/0565/4590/2707/files/Banner_Urgencia_-_OralHydra_01_3_11zon.webp?v=1780955166\" alt=\"\"></p> <div style=\"display: grid; grid-template-columns: repeat(3,1fr); gap: 10px; padding: 10px;\"> <video style=\"width: 100%; border-radius: 8px;\" autoplay=\"autoplay\" loop=\"loop\" muted=\"\" playsinline=\"\"> <source src=\"https://cdn.shopify.com/videos/c/o/v/8752c922660b42a18ed8d00c9a68cfc5.mp4\" type=\"video/mp4\"></video> <video style=\"width: 100%; border-radius: 8px;\" autoplay=\"autoplay\" loop=\"loop\" muted=\"\" playsinline=\"\"> <source src=\"https://cdn.shopify.com/videos/c/o/v/82ffc3ccff4443d48cfc6108fbacccbe.mp4\" type=\"video/mp4\"></video> <video style=\"width: 100%; border-radius: 8px;\" autoplay=\"autoplay\" loop=\"loop\" muted=\"\" playsinline=\"\"> <source src=\"https://cdn.shopify.com/videos/c/o/v/6c82b035ea0a4d67b3cff0735cadd084.mp4\" type=\"video/mp4\"></video> </div> <p><img alt=\"\" src=\"https://cdn.shopify.com/s/files/1/0565/4590/2707/files/Slice_1.1.webp?v=1770919000\"><img style=\"display: block; margin-left: auto; margin-right: auto;\" alt=\"\" src=\"https://cdn.shopify.com/s/files/1/0565/4590/2707/files/Video_GIf_01_f0321f4a-3829-4f6f-ba5d-9f65449d1489.gif?v=1770921282\"><img alt=\"\" src=\"https://cdn.shopify.com/s/files/1/0565/4590/2707/files/Slice_2_1.webp?v=1770919000\"><img alt=\"\" src=\"https://cdn.shopify.com/s/files/1/0565/4590/2707/files/Slice_3_1.webp?v=1770919000\"><img alt=\"\" src=\"https://cdn.shopify.com/s/files/1/0565/4590/2707/files/Slice_4_23fe3c05-f53c-44d4-9ecf-8189e75aa4ee.webp?v=1770919000\"><img alt=\"\" src=\"https://cdn.shopify.com/s/files/1/0565/4590/2707/files/Slice_5_34737b51-3ec3-417a-b028-e20a7b1429f5.webp?v=1770919000\"><img alt=\"\" src=\"https://cdn.shopify.com/s/files/1/0565/4590/2707/files/Slice_6_1.webp?v=1770919000\"><img alt=\"\" src=\"https://cdn.shopify.com/s/files/1/0565/4590/2707/files/Slice_7_1_bc1a3c16-5c47-4329-9971-f1609ac77357.webp?v=1770919000\"><img alt=\"\" src=\"https://cdn.shopify.com/s/files/1/0565/4590/2707/files/Slice_8_517a8540-968e-4afa-af50-07d17cae009d.webp?v=1770919000\"><img alt=\"\" src=\"https://cdn.shopify.com/s/files/1/0565/4590/2707/files/Slice_9.webp?v=1770919000\"><img alt=\"\" src=\"https://cdn.shopify.com/s/files/1/0565/4590/2707/files/Slice_10.webp?v=1770919001\"></p> <p>Escova de Dente Elétrica - OralHydra Pro®</p>",
    "options": [
      {
        "name": "Cor",
        "position": 1,
        "values": [
          "Preta",
          "Branca",
          "Rosa"
        ]
      }
    ],
    "images": [
      {
        "src": "https://cdn.shopify.com/s/files/1/0565/4590/2707/files/CapaOH01_11zon.webp?v=1785284659",
        "width": 1254,
        "height": 1254,
        "alt": "Escova de Dente Elétrica - OralHydra Pro®",
        "variantIds": []
      },
      {
        "src": "https://cdn.shopify.com/s/files/1/0565/4590/2707/files/CapaSecundaria3.webp?v=1775865703",
        "width": 1080,
        "height": 1080,
        "alt": "Escova de Dente Elétrica - OralHydra Pro®",
        "variantIds": []
      },
      {
        "src": "https://cdn.shopify.com/s/files/1/0565/4590/2707/files/CapaSecundaria2.webp?v=1775865703",
        "width": 1080,
        "height": 1080,
        "alt": "Escova de Dente Elétrica - OralHydra Pro®",
        "variantIds": []
      },
      {
        "src": "https://cdn.shopify.com/s/files/1/0565/4590/2707/files/CapaSecundaria4.webp?v=1775865703",
        "width": 1080,
        "height": 1080,
        "alt": "Escova de Dente Elétrica - OralHydra Pro®",
        "variantIds": []
      },
      {
        "src": "https://cdn.shopify.com/s/files/1/0565/4590/2707/files/CapaSecundaria9.webp?v=1775865703",
        "width": 1080,
        "height": 1080,
        "alt": "Escova de Dente Elétrica - OralHydra Pro®",
        "variantIds": []
      },
      {
        "src": "https://cdn.shopify.com/s/files/1/0565/4590/2707/files/CapaSecundaria6.webp?v=1775865703",
        "width": 1080,
        "height": 1080,
        "alt": "Escova de Dente Elétrica - OralHydra Pro®",
        "variantIds": []
      },
      {
        "src": "https://cdn.shopify.com/s/files/1/0565/4590/2707/files/CapaSecundaria7.webp?v=1775865703",
        "width": 1080,
        "height": 1080,
        "alt": "Escova de Dente Elétrica - OralHydra Pro®",
        "variantIds": []
      },
      {
        "src": "https://cdn.shopify.com/s/files/1/0565/4590/2707/files/CapaSecundaria8.webp?v=1775865703",
        "width": 1080,
        "height": 1080,
        "alt": "Escova de Dente Elétrica - OralHydra Pro®",
        "variantIds": []
      }
    ],
    "variants": [
      {
        "id": 44302773682291,
        "title": "Preta",
        "option1": "Preta",
        "option2": null,
        "option3": null,
        "sku": "",
        "price": 9990,
        "compareAtPrice": 16990,
        "available": true,
        "imageSrc": "https://cdn.shopify.com/s/files/1/0565/4590/2707/files/CapaSecundaria12.webp?v=1775865703"
      },
      {
        "id": 44302773715059,
        "title": "Branca",
        "option1": "Branca",
        "option2": null,
        "option3": null,
        "sku": "",
        "price": 9990,
        "compareAtPrice": 16990,
        "available": true,
        "imageSrc": "https://cdn.shopify.com/s/files/1/0565/4590/2707/files/CapaSecundaria10.webp?v=1775865703"
      },
      {
        "id": 44302773747827,
        "title": "Rosa",
        "option1": "Rosa",
        "option2": null,
        "option3": null,
        "sku": "",
        "price": 9990,
        "compareAtPrice": 16990,
        "available": true,
        "imageSrc": "https://cdn.shopify.com/s/files/1/0565/4590/2707/files/CapaSecundaria11.webp?v=1775865703"
      }
    ]
  }
];
