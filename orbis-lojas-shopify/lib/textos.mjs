/**
 * O TEXTO DA LOJA, nos idiomas em que ela pode nascer.
 *
 * Tudo o que o visitante lê e que não veio do cliente: o modelo da loja (a
 * faixa de anúncio, o hero, os benefícios, o FAQ, o rodapé, a busca, o
 * carrinho), a cópia que a marca recebe quando não escreveu a sua, e os poucos
 * rótulos que o renderizador escreve por conta.
 *
 * ## Por que tabela, e não tradução na hora
 *
 * Porque a casa é determinística: a mesma loja, gerada duas vezes, tem de sair
 * igual. Tradução por modelo de linguagem varia entre chamadas, custa dinheiro
 * por loja gerada e não roda no modo `queue`, onde o código não chama API
 * nenhuma. Texto escrito uma vez, conferido uma vez, sai igual para sempre.
 *
 * ## O que NÃO está aqui
 *
 * O texto do próprio TEMA — "Adicionar ao carrinho", "Pesquisar", "Finalizar
 * compra" — não: ele vem dos arquivos de tradução que o tema já carrega (o
 * Dawn traz 52). Reescrevê-lo aqui seria manter uma segunda tradução do que a
 * Shopify já traduziu, e as duas divergiriam na primeira seção nova.
 *
 * E os nomes dos produtos também não: eles moram com o catálogo, em
 * `nomes-curados.ts`, porque a chave lá é o `handle` do produto.
 */

import { IDIOMAS } from "./idiomas.mjs";

/**
 * O MODELO da loja, por idioma.
 *
 * As chaves espelham `DEFAULT_CUSTOMIZATION` (`business-rules.mjs`) — só os
 * campos de texto, porque cor e medida não têm idioma. O teste cobra que os
 * três idiomas tenham exatamente as mesmas chaves: tradução que esquece um
 * campo deixa uma frase em português no meio da loja em inglês, e é o tipo de
 * buraco que só aparece na tela do cliente.
 */
export const TEXTOS = {
  "pt-BR": {
    modelo: {
      announcement: { text: "FRETE GRÁTIS EM PEDIDOS SELECIONADOS" },
      header: { menuItems: ["Novidades", "Mais vendidos", "Sobre"] },
      hero: {
        eyebrow: "NOVA COLEÇÃO · 2026",
        body: "Produtos essenciais, selecionados com cuidado e enviados para todo o Brasil.",
        buttonLabel: "Comprar agora",
      },
      benefits: {
        items: [
          { title: "Entrega rápida", text: "Para todo o Brasil" },
          { title: "Compra protegida", text: "Pagamento seguro" },
          { title: "Troca sem atrito", text: "Em até 30 dias" },
        ],
      },
      products: {
        eyebrow: "SELEÇÃO DA SEMANA",
        title: "Mais vendidos",
        linkLabel: "Ver todos",
        badges: ["BEST SELLER", "ESSENCIAL", "ESSENCIAL"],
      },
      bundle: {
        eyebrow: "COMPRE JUNTO",
        title: "Seu ritual completo",
        body: "Combine os favoritos e economize no conjunto.",
        buttonLabel: "Adicionar conjunto",
      },
      comparison: {
        eyebrow: "POR QUE ESCOLHER",
        title: "Feito para a sua rotina",
        items: ["Fórmula selecionada", "Uso simples", "Compra protegida"],
      },
      testimonials: {
        eyebrow: "QUEM USA, RECOMENDA",
        title: "Experiências da comunidade",
        quote: "Conteúdo demonstrativo. Substitua por um depoimento real antes de publicar.",
        author: "Cliente de demonstração",
      },
      faq: {
        eyebrow: "DÚVIDAS",
        title: "Perguntas frequentes",
        items: [
          { question: "Qual é o prazo de envio?", answer: "O prazo é calculado no checkout conforme o CEP." },
          { question: "Posso trocar meu pedido?", answer: "Sim. Solicite a troca dentro do período informado pela loja." },
          { question: "Quais formas de pagamento?", answer: "Configure as formas disponíveis na sua plataforma de pagamento." },
        ],
      },
      newsletter: {
        title: "Novidades direto na sua caixa de entrada",
        body: "Cadastre seu e-mail para receber lançamentos e conteúdos da marca.",
        placeholder: "Seu melhor e-mail",
        buttonLabel: "Quero receber",
      },
      footer: {
        description: "Produtos essenciais para uma rotina mais simples.",
        storeLinks: ["Novidades", "Mais vendidos", "Sobre"],
        helpLinks: ["Contato", "Trocas", "Políticas"],
      },
      search: {
        title: "Pesquisa",
        placeholder: "O que você procura?",
        emptyMessage: "Digite para buscar produtos, coleções e conteúdos.",
        popularTitle: "Buscas populares",
        popularTerms: ["Mais vendidos", "Novidades", "Kits"],
      },
      productPage: {
        eyebrow: "BEST SELLER",
        description: "Uma fórmula essencial criada para acompanhar sua rotina.",
        buttonLabel: "Adicionar ao carrinho",
      },
      collection: {
        eyebrow: "COLEÇÃO",
        title: "Mais vendidos",
        description: "Os favoritos escolhidos pela comunidade.",
      },
      cart: {
        title: "Seu carrinho",
        emptyText: "Seu carrinho está vazio.",
        progressText: "Adicione mais produtos para ganhar frete grátis.",
        checkoutLabel: "Finalizar compra",
      },
      blog: {
        eyebrow: "CONTEÚDO",
        description: "Guias, novidades e histórias da marca.",
        articles: ["Rituais para começar bem", "Como escolher seus essenciais", "Por dentro da marca"],
      },
    },
    marca: {
      /* o hero de uma loja gerada abre por aqui quando a pessoa não escreveu
         manchete: é rótulo de loja, não promessa sobre mercadoria */
      eyebrow: "LOJA OFICIAL",
      /* as duas frases que colam o nicho na marca: a descricao da loja e a
         faixa de anuncio. Ficam aqui, e nao no nicho, porque valem para os dez. */
      curadoria: "Curadoria, envio rápido e atendimento de gente de verdade.",
      envio: "Envio para todo o Brasil",
      slogan: "Produtos escolhidos com cuidado, entregues com atenção.",
      /** O ano entra por fora: quem escreve a data é o gerador, não a tabela. */
      copyright: (marca, ano) => `© ${ano} ${marca}. Todos os direitos reservados.`,
      diarioDaMarca: (marca) => `Diário ${marca}`,
    },
    render: {
      /* o menu da PRÉVIA: a loja real recebe o menu do cliente, este é o que a
         demonstração mostra enquanto ele não existe */
      menu: { inicio: "Início", produtos: "Produtos", contato: "Contato" },
      /** A nota é da ORIGEM, e o texto diz isso: não é avaliação desta loja. */
      notaDaOrigem: (nota, vendas) => `Nota ${nota} na origem${vendas ? `, ${vendas}` : ""}.`,
      vendidos: (quantidade) => `${quantidade} vendido(s)`,
      colecaoDemo: "Coleção",
      /* o "fornecedor" que a loja gerada mostra: e ela mesma que escolheu */
      curadoria: "Curadoria da loja",
      placeholderImagem: "Imagem",
      placeholderConecte: "Conecte esta imagem",
      placeholderArquivo: "Arquivo da loja",
    },
  },

  en: {
    modelo: {
      announcement: { text: "FREE SHIPPING ON SELECTED ORDERS" },
      header: { menuItems: ["New in", "Best sellers", "About"] },
      hero: {
        eyebrow: "NEW COLLECTION · 2026",
        body: "Everyday essentials, carefully selected and shipped with care.",
        buttonLabel: "Shop now",
      },
      benefits: {
        items: [
          { title: "Fast delivery", text: "Nationwide shipping" },
          { title: "Secure checkout", text: "Protected payment" },
          { title: "Easy returns", text: "Within 30 days" },
        ],
      },
      products: {
        eyebrow: "THIS WEEK'S PICKS",
        title: "Best sellers",
        linkLabel: "View all",
        badges: ["BEST SELLER", "ESSENTIAL", "ESSENTIAL"],
      },
      bundle: {
        eyebrow: "BUY TOGETHER",
        title: "Your complete routine",
        body: "Pair the favourites and save on the set.",
        buttonLabel: "Add the set",
      },
      comparison: {
        eyebrow: "WHY CHOOSE US",
        title: "Made for your routine",
        items: ["Selected formula", "Simple to use", "Protected purchase"],
      },
      testimonials: {
        eyebrow: "PEOPLE WHO USE IT, RECOMMEND IT",
        title: "From the community",
        quote: "Placeholder content. Replace it with a real review before publishing.",
        author: "Sample customer",
      },
      faq: {
        eyebrow: "QUESTIONS",
        title: "Frequently asked questions",
        items: [
          { question: "How long does shipping take?", answer: "Delivery time is calculated at checkout from your address." },
          { question: "Can I exchange my order?", answer: "Yes. Request the exchange within the window the store announces." },
          { question: "Which payment methods?", answer: "Set the available methods in your payment platform." },
        ],
      },
      newsletter: {
        title: "News straight to your inbox",
        body: "Sign up to hear about launches and stories from the brand.",
        placeholder: "Your best email",
        buttonLabel: "Sign me up",
      },
      footer: {
        description: "Essentials for a simpler routine.",
        storeLinks: ["New in", "Best sellers", "About"],
        helpLinks: ["Contact", "Returns", "Policies"],
      },
      search: {
        title: "Search",
        placeholder: "What are you looking for?",
        emptyMessage: "Start typing to search products, collections and content.",
        popularTitle: "Popular searches",
        popularTerms: ["Best sellers", "New in", "Sets"],
      },
      productPage: {
        eyebrow: "BEST SELLER",
        description: "An everyday essential made to keep up with your routine.",
        buttonLabel: "Add to cart",
      },
      collection: {
        eyebrow: "COLLECTION",
        title: "Best sellers",
        description: "The favourites the community keeps choosing.",
      },
      cart: {
        title: "Your cart",
        emptyText: "Your cart is empty.",
        progressText: "Add more products to unlock free shipping.",
        checkoutLabel: "Checkout",
      },
      blog: {
        eyebrow: "STORIES",
        description: "Guides, news and stories from the brand.",
        articles: ["Rituals to start the day", "How to choose your essentials", "Inside the brand"],
      },
    },
    marca: {
      eyebrow: "OFFICIAL STORE",
      curadoria: "Curated selection, fast shipping and real people answering you.",
      envio: "Nationwide shipping",
      slogan: "Products chosen with care, shipped with attention.",
      copyright: (marca, ano) => `© ${ano} ${marca}. All rights reserved.`,
      diarioDaMarca: (marca) => `${marca} Journal`,
    },
    render: {
      menu: { inicio: "Home", produtos: "Products", contato: "Contact" },
      notaDaOrigem: (nota, vendas) => `Rated ${nota} at the source${vendas ? `, ${vendas}` : ""}.`,
      vendidos: (quantidade) => `${quantidade} sold`,
      colecaoDemo: "Collection",
      curadoria: "Store selection",
      placeholderImagem: "Image",
      placeholderConecte: "Connect this image",
      placeholderArquivo: "Store file",
    },
  },

  es: {
    modelo: {
      announcement: { text: "ENVÍO GRATIS EN PEDIDOS SELECCIONADOS" },
      header: { menuItems: ["Novedades", "Más vendidos", "Nosotros"] },
      hero: {
        eyebrow: "NUEVA COLECCIÓN · 2026",
        body: "Productos esenciales, elegidos con cuidado y enviados con atención.",
        buttonLabel: "Comprar ahora",
      },
      benefits: {
        items: [
          { title: "Entrega rápida", text: "Envío a todo el país" },
          { title: "Compra protegida", text: "Pago seguro" },
          { title: "Cambios sin líos", text: "Hasta 30 días" },
        ],
      },
      products: {
        eyebrow: "SELECCIÓN DE LA SEMANA",
        title: "Más vendidos",
        linkLabel: "Ver todos",
        badges: ["MÁS VENDIDO", "ESENCIAL", "ESENCIAL"],
      },
      bundle: {
        eyebrow: "COMPRA JUNTO",
        title: "Tu rutina completa",
        body: "Combina los favoritos y ahorra en el conjunto.",
        buttonLabel: "Añadir el conjunto",
      },
      comparison: {
        eyebrow: "POR QUÉ ELEGIRNOS",
        title: "Hecho para tu rutina",
        items: ["Fórmula seleccionada", "Uso sencillo", "Compra protegida"],
      },
      testimonials: {
        eyebrow: "QUIEN LO USA, LO RECOMIENDA",
        title: "Experiencias de la comunidad",
        quote: "Contenido de muestra. Sustitúyelo por una reseña real antes de publicar.",
        author: "Cliente de muestra",
      },
      faq: {
        eyebrow: "DUDAS",
        title: "Preguntas frecuentes",
        items: [
          { question: "¿Cuánto tarda el envío?", answer: "El plazo se calcula en el pago según tu dirección." },
          { question: "¿Puedo cambiar mi pedido?", answer: "Sí. Solicita el cambio dentro del plazo que indique la tienda." },
          { question: "¿Qué formas de pago hay?", answer: "Configura las formas disponibles en tu plataforma de pago." },
        ],
      },
      newsletter: {
        title: "Novedades directo a tu correo",
        body: "Suscríbete para recibir lanzamientos e historias de la marca.",
        placeholder: "Tu mejor correo",
        buttonLabel: "Quiero recibirlas",
      },
      footer: {
        description: "Esenciales para una rutina más simple.",
        storeLinks: ["Novedades", "Más vendidos", "Nosotros"],
        helpLinks: ["Contacto", "Cambios", "Políticas"],
      },
      search: {
        title: "Búsqueda",
        placeholder: "¿Qué estás buscando?",
        emptyMessage: "Escribe para buscar productos, colecciones y contenidos.",
        popularTitle: "Búsquedas populares",
        popularTerms: ["Más vendidos", "Novedades", "Kits"],
      },
      productPage: {
        eyebrow: "MÁS VENDIDO",
        description: "Un esencial pensado para acompañar tu rutina.",
        buttonLabel: "Añadir al carrito",
      },
      collection: {
        eyebrow: "COLECCIÓN",
        title: "Más vendidos",
        description: "Los favoritos que la comunidad sigue eligiendo.",
      },
      cart: {
        title: "Tu carrito",
        emptyText: "Tu carrito está vacío.",
        progressText: "Añade más productos para conseguir el envío gratis.",
        checkoutLabel: "Finalizar compra",
      },
      blog: {
        eyebrow: "CONTENIDO",
        description: "Guías, novedades e historias de la marca.",
        articles: ["Rituales para empezar bien", "Cómo elegir tus esenciales", "Por dentro de la marca"],
      },
    },
    marca: {
      eyebrow: "TIENDA OFICIAL",
      curadoria: "Curaduría, envío rápido y atención de personas de verdad.",
      envio: "Envío a todo el país",
      slogan: "Productos elegidos con cuidado, enviados con atención.",
      copyright: (marca, ano) => `© ${ano} ${marca}. Todos los derechos reservados.`,
      diarioDaMarca: (marca) => `Diario ${marca}`,
    },
    render: {
      menu: { inicio: "Inicio", produtos: "Productos", contato: "Contacto" },
      notaDaOrigem: (nota, vendas) => `Valoración ${nota} en el origen${vendas ? `, ${vendas}` : ""}.`,
      vendidos: (quantidade) => `${quantidade} vendido(s)`,
      colecaoDemo: "Colección",
      curadoria: "Selección de la tienda",
      placeholderImagem: "Imagen",
      placeholderConecte: "Conecta esta imagen",
      placeholderArquivo: "Archivo de la tienda",
    },
  },
};

/** Os textos do idioma pedido, com o português como chão para o que não existir. */
export function textosDoIdioma(idioma) {
  return TEXTOS[idioma] ?? TEXTOS["pt-BR"];
}

/** Os idiomas que esta tabela cobre — a tela lê daqui, e não de uma lista repetida. */
export const IDIOMAS_COM_TEXTO = IDIOMAS.filter((codigo) => Boolean(TEXTOS[codigo]));
