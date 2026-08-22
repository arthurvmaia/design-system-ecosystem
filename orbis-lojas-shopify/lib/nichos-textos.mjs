/**
 * O TEXTO DE CADA NICHO nos idiomas em que a loja pode nascer.
 *
 * O nicho não é só uma etiqueta: é de onde saem a manchete do hero, a descrição
 * da marca, os nomes das coleções, os três benefícios da faixa e as três
 * perguntas do FAQ. Tudo isso é o que o visitante lê. Sem esta tabela, escolher
 * "English" entregava uma loja com o cabeçalho em inglês e a vitrine dizendo
 * "Óculos de sol" e "Armações de grau".
 *
 * ## O que NÃO viaja para cá
 *
 * **As RAÍZES do nome da marca** (`Hora`, `Cronos`, `Aura`, `Íris`), porque nome
 * próprio não se traduz: é a raiz que carrega a identidade, e traduzi-la faria
 * a loja trocar de nome ao trocar a tela de idioma.
 *
 * O SUFIXO é outra coisa, e esta é uma decisão revista. Ele parecia parte do
 * nome e é uma palavra de CATEGORIA — o cliente a lê como palavra, não como
 * marca. Deixá-lo fora entregava "Aura Cosméticos", "Órbita Relojoaria" e
 * "Balão Infantil" numa loja em inglês, no lugar mais visível que existe: o
 * cabeçalho, a logo e o rodapé. As listas são POSICIONALMENTE PARALELAS às do
 * português — mesmo tamanho, mesma ordem —, então o sorteio escolhe a mesma
 * vaga nos três idiomas e a marca continua sendo a mesma marca: "Aura
 * Cosméticos" e "Aura Cosmetics", não duas lojas diferentes.
 *
 * **A voz da marca** (`precisa e sóbria`), porque ela não chega à loja: é um
 * campo da bancada de marca, que é tela do app — e o app fala português.
 *
 * **Paletas e fontes**, que não têm idioma.
 *
 * ## Sobre os preços dentro das frases
 *
 * "Frete grátis acima de R$ 199" vira "Free shipping over $199". O número não
 * muda — é a mesma decisão registrada em `idiomas.mjs`: o símbolo acompanha o
 * idioma, o valor não é convertido, porque converter exigiria um câmbio que
 * ninguém forneceu.
 */

/**
 * Só os idiomas ALÉM do português entram aqui.
 *
 * O português é o que está em `marca-generator.mjs`, junto do resto do nicho, e
 * ele continua sendo a fonte: duplicá-lo aqui criaria duas versões da mesma
 * frase, e a segunda ficaria para trás no primeiro conserto.
 */
export const NICHOS_TRADUZIDOS = {
  en: {
    roupas: {
      nome: "Clothing & fashion",
      resumo: "Everyday clothing, basics and seasonal collections.",
      produto: "clothing",
      /* posicionalmente paralelo ao portugues: o sorteio pega a mesma vaga */
      sufixos: ["Atelier", "Studio", "Wear", "Co.", "Fashion"],
      colecoes: ["New in", "Basics", "Seasonal", "Tailoring", "Sale", "Last pieces"],
      beneficios: ["Returns within 30 days", "Free shipping over $199", "Size chart on every item"],
      perguntas: [
        ["How do I pick my size?", "Every item has its size chart on the product page, with both body and garment measurements."],
        ["Can I exchange it if it doesn't fit?", "You can. The first size exchange is on us, within 30 days."],
        ["How long does delivery take?", "Between 5 and 12 business days, with a tracking code as soon as the order ships."],
      ],
      manchetes: ["Pieces that last", "Basics done right", "Getting dressed, made easy"],
    },
    oculos: {
      nome: "Glasses & eyewear",
      resumo: "Sunglasses and prescription frames.",
      produto: "eyewear",
      /* posicionalmente paralelo ao portugues: o sorteio pega a mesma vaga */
      sufixos: ["Eyewear", "Optics", "Studio", "Co."],
      colecoes: ["Sunglasses", "Prescription frames", "Polarised", "Unisex", "New arrivals", "Accessories"],
      beneficios: ["UV400 protection on every model", "Case and cloth included", "12-month warranty"],
      perguntas: [
        ["Do the lenses block UV?", "All of them. Every model ships with a UV400 filter, which blocks UVA and UVB."],
        ["Can I add prescription lenses?", "The frames take prescription lenses; bring your prescription to your optician."],
        ["What if the shape doesn't suit me?", "You have 7 days to return it at no cost, with the original packaging."],
      ],
      manchetes: ["See better, look better", "Protection that suits you", "Frames for the whole day"],
    },
    relogios: {
      nome: "Watches",
      resumo: "Analogue watches, digital watches and smartwatches.",
      produto: "watches",
      /* posicionalmente paralelo ao portugues: o sorteio pega a mesma vaga */
      sufixos: ["Watches", "Watchmakers", "Time", "Co."],
      colecoes: ["Smartwatches", "Analogue", "Sport", "Straps", "New arrivals", "Deals"],
      beneficios: ["Tested water resistance", "12-month warranty", "Extra strap on selected models"],
      perguntas: [
        ["Can it get wet?", "Each model states its water resistance on the page; the ones marked 5ATM handle showers and rain."],
        ["How long does the battery last?", "From 7 to 30 days on smartwatches, depending on heart-rate tracking and screen use."],
        ["Is there a warranty?", "Yes, 12 months against manufacturing defects, handled directly by us."],
      ],
      manchetes: ["Time on your wrist", "Precision that keeps up", "Watches for people who don't stop"],
    },
    beleza: {
      nome: "Beauty & skincare",
      resumo: "Skin, hair and make-up care.",
      produto: "cosmetics",
      /* posicionalmente paralelo ao portugues: o sorteio pega a mesma vaga */
      sufixos: ["Beauty", "Skin", "Cosmetics", "Care"],
      colecoes: ["Face", "Hair", "Body", "Sets", "Best sellers", "New arrivals"],
      beneficios: ["Dermatologically tested formulas", "Never tested on animals", "Discreet, sealed delivery"],
      perguntas: [
        ["Is it right for sensitive skin?", "Every product page lists the skin type it suits and the full ingredient list."],
        ["How soon will I see results?", "It depends on the product and the routine; four weeks of continuous use is a fair minimum."],
        ["How is it shipped?", "In sealed packaging, with nothing on the outside identifying the contents."],
      ],
      manchetes: ["A routine that fits your day", "Simple care, calm skin", "Beauty without the fuss"],
    },
    casa: {
      nome: "Home & decor",
      resumo: "Homeware, storage and decoration for the home.",
      produto: "home decor objects",
      /* posicionalmente paralelo ao portugues: o sorteio pega a mesma vaga */
      sufixos: ["Home", "House", "Decor", "Studio"],
      colecoes: ["Kitchen", "Storage", "Decor", "Bed & bath", "Lighting", "Deals"],
      beneficios: ["Free shipping over $249", "90-day warranty", "Reinforced packaging"],
      perguntas: [
        ["Does it come with instructions?", "Items that need assembly ship with an illustrated manual in the box."],
        ["What if it arrives broken?", "Send us a photo and we sort it out with a replacement or a refund, no argument."],
        ["What is the delivery time?", "From 5 to 12 business days, tracked from the moment it ships."],
      ],
      manchetes: ["A home that feels like yours", "Details that change a room", "Practical, room by room"],
    },
    pet: {
      nome: "Pet",
      resumo: "Accessories, toys and care for dogs and cats.",
      produto: "products for dogs and cats",
      /* posicionalmente paralelo ao portugues: o sorteio pega a mesma vaga */
      sufixos: ["Pet", "Petshop", "Store", "Co."],
      colecoes: ["Dogs", "Cats", "Toys", "Grooming", "Walks", "Best sellers"],
      beneficios: ["Non-toxic materials", "Easy 30-day returns", "Free shipping over $149"],
      perguntas: [
        ["How do I pick the collar size?", "Measure your pet's neck with a tape and compare it with the chart on the page."],
        ["Are the toys safe?", "We use non-toxic, hard-wearing materials; the size guidance is on each product."],
        ["Can I return it?", "You can, within 30 days, as long as your pet hasn't used it."],
      ],
      manchetes: ["Caring for them is simple", "Everything for the barks and the purrs", "The best for your animal"],
    },
    fitness: {
      nome: "Fitness & sports",
      resumo: "Equipment, accessories and training clothing.",
      produto: "training gear",
      /* posicionalmente paralelo ao portugues: o sorteio pega a mesma vaga */
      sufixos: ["Fit", "Sports", "Training", "Co."],
      colecoes: ["Strength", "Running", "Yoga & mobility", "Supplements", "Accessories", "Deals"],
      beneficios: ["12-month warranty", "Free shipping over $199", "Assembly support"],
      perguntas: [
        ["How much weight does it hold?", "The maximum load is on the spec sheet of every product."],
        ["Is it good for beginners?", "Yes; each page states the level and suggests how to progress."],
        ["Is there a warranty?", "12 months against manufacturing defects, exchanged directly with us."],
      ],
      manchetes: ["No more excuses", "Gear that keeps the pace", "Consistency beats intensity"],
    },
    gadgets: {
      nome: "Electronics & gadgets",
      resumo: "Tech accessories, audio and the connected home.",
      produto: "electronics",
      /* posicionalmente paralelo ao portugues: o sorteio pega a mesma vaga */
      sufixos: ["Tech", "Labs", "Gadgets", "Store"],
      colecoes: ["Audio", "Chargers", "Smart home", "Accessories", "New arrivals", "Deals"],
      beneficios: ["12-month warranty", "Compatibility listed on every product", "Ships within 24h"],
      perguntas: [
        ["Will it work with my device?", "The compatibility list is on the spec sheet of every product."],
        ["Do I get an invoice?", "Yes, the invoice goes out by email as soon as the order is billed."],
        ["What about the warranty?", "12 months against manufacturing defects, handled directly by us."],
      ],
      manchetes: ["Tech that solves things", "Fewer cables, more use", "Gadgets worth the space"],
    },
    infantil: {
      nome: "Kids & baby",
      resumo: "Nursery, toys and accessories for children.",
      produto: "children's goods",
      /* posicionalmente paralelo ao portugues: o sorteio pega a mesma vaga */
      sufixos: ["Kids", "Baby", "Junior", "Store"],
      colecoes: ["Nursery", "Toys", "Little clothes", "Bath time", "Out and about", "Best sellers"],
      beneficios: ["Certified non-toxic materials", "30-day returns", "Gift wrapping"],
      perguntas: [
        ["What age is it for?", "The recommended age range is on each item's page."],
        ["Are the materials safe?", "We use non-toxic materials, with no loose parts on items for the youngest ones."],
        ["Can I send it as a gift?", "You can: tick the gift option in the cart and it ships wrapped, with no prices."],
      ],
      manchetes: ["Made for your little one", "Care from day one", "Growing up safely"],
    },
    joias: {
      nome: "Jewellery & accessories",
      resumo: "Gold-plated jewellery, costume pieces and everyday accessories.",
      produto: "jewellery",
      /* posicionalmente paralelo ao portugues: o sorteio pega a mesma vaga */
      sufixos: ["Jewels", "Accessories", "Studio", "Co."],
      colecoes: ["Necklaces", "Earrings", "Rings", "Bracelets", "Sets", "New arrivals"],
      beneficios: ["18k gold plating", "12-month warranty against tarnishing", "Gift packaging"],
      perguntas: [
        ["Does it tarnish over time?", "With the care described on the card that comes with the piece, the plating lasts far longer."],
        ["Can it get wet?", "Avoid showers, sea and pool: chlorine and salt are what wear the plating down fastest."],
        ["Does it come gift-wrapped?", "Yes, every piece ships in its own box with the care card."],
      ],
      manchetes: ["Pieces for every day", "Shine in the detail", "Accessories that stay with you"],
    },
  },

  es: {
    roupas: {
      nome: "Ropa y moda",
      resumo: "Prendas de vestir, básicos y colecciones de temporada.",
      produto: "ropa",
      /* posicionalmente paralelo ao portugues: o sorteio pega a mesma vaga */
      sufixos: ["Atelier", "Studio", "Wear", "Co.", "Moda"],
      colecoes: ["Novedades", "Básicos", "Temporada", "Sastrería", "Rebajas", "Últimas piezas"],
      beneficios: ["Cambios hasta 30 días", "Envío gratis desde 199 €", "Guía de tallas en cada prenda"],
      perguntas: [
        ["¿Cómo elijo la talla?", "Cada prenda tiene su guía de tallas en la propia página, con las medidas del cuerpo y de la ropa."],
        ["¿Puedo cambiarla si no me queda?", "Puedes. El primer cambio de talla corre por nuestra cuenta, hasta 30 días."],
        ["¿Cuánto tarda en llegar?", "Entre 5 y 12 días hábiles, con el código de seguimiento en cuanto sale el pedido."],
      ],
      manchetes: ["Prendas que se quedan", "Lo básico bien hecho", "Vestirse sin esfuerzo"],
    },
    oculos: {
      nome: "Gafas y eyewear",
      resumo: "Gafas de sol y monturas graduadas.",
      produto: "gafas",
      /* posicionalmente paralelo ao portugues: o sorteio pega a mesma vaga */
      sufixos: ["Eyewear", "Óptica", "Studio", "Co."],
      colecoes: ["Gafas de sol", "Monturas graduadas", "Polarizadas", "Unisex", "Novedades", "Accesorios"],
      beneficios: ["Protección UV400 en todos los modelos", "Estuche y gamuza incluidos", "Garantía de 12 meses"],
      perguntas: [
        ["¿Las lentes protegen del UV?", "Todas. Los modelos salen con filtro UV400, que bloquea UVA y UVB."],
        ["¿Sirven para graduar?", "Las monturas admiten lentes graduadas; lleva tu receta a tu óptica de confianza."],
        ["¿Y si el modelo no me queda bien?", "Tienes 7 días para devolverlo sin coste, con el embalaje original."],
      ],
      manchetes: ["Ver mejor, verse mejor", "Protección que va contigo", "Monturas para todo el día"],
    },
    relogios: {
      nome: "Relojes",
      resumo: "Relojes analógicos, digitales y smartwatches.",
      produto: "relojes",
      /* posicionalmente paralelo ao portugues: o sorteio pega a mesma vaga */
      sufixos: ["Watches", "Relojería", "Time", "Co."],
      colecoes: ["Smartwatches", "Analógicos", "Deportivos", "Correas", "Novedades", "Ofertas"],
      beneficios: ["Resistencia al agua comprobada", "Garantía de 12 meses", "Correa extra en modelos seleccionados"],
      perguntas: [
        ["¿Se puede mojar?", "Cada modelo indica su resistencia en la página; los marcados 5ATM aguantan ducha y lluvia."],
        ["¿Cuánto dura la batería?", "De 7 a 30 días en los smartwatches, según el uso del pulsómetro y de la pantalla."],
        ["¿Tiene garantía?", "Sí, 12 meses contra defectos de fabricación, directamente con nosotros."],
      ],
      manchetes: ["El tiempo en tu muñeca", "Precisión que acompaña el día", "Relojes para quien no para"],
    },
    beleza: {
      nome: "Belleza y skincare",
      resumo: "Cuidado de la piel, el cabello y maquillaje.",
      produto: "cosméticos",
      /* posicionalmente paralelo ao portugues: o sorteio pega a mesma vaga */
      sufixos: ["Beauty", "Skin", "Cosmética", "Care"],
      colecoes: ["Rostro", "Cabello", "Cuerpo", "Kits", "Más vendidos", "Novedades"],
      beneficios: ["Fórmulas testadas dermatológicamente", "Sin testar en animales", "Envío discreto y sellado"],
      perguntas: [
        ["¿Sirve para piel sensible?", "La página de cada producto indica el tipo de piel y la lista completa de ingredientes."],
        ["¿En cuánto tiempo veo resultados?", "Depende del producto y de la rutina; cuatro semanas de uso continuo es el mínimo razonable."],
        ["¿Cómo se envía?", "En embalaje sellado y sin nada por fuera que identifique el contenido."],
      ],
      manchetes: ["Una rutina que cabe en tu día", "Cuidado simple, piel tranquila", "Belleza sin complicaciones"],
    },
    casa: {
      nome: "Casa y decoración",
      resumo: "Menaje, organización y decoración para el hogar.",
      produto: "objetos de decoración para casa",
      /* posicionalmente paralelo ao portugues: o sorteio pega a mesma vaga */
      sufixos: ["Home", "Casa", "Decor", "Studio"],
      colecoes: ["Cocina", "Organización", "Decoración", "Textil de hogar", "Iluminación", "Ofertas"],
      beneficios: ["Envío gratis desde 249 €", "Garantía de 90 días", "Embalaje reforzado"],
      perguntas: [
        ["¿Viene con instrucciones?", "Los artículos que necesitan montaje llevan un manual ilustrado en la caja."],
        ["¿Y si llega roto?", "Mándanos una foto y lo resolvemos con reenvío o reembolso, sin discusión."],
        ["¿Cuál es el plazo de entrega?", "De 5 a 12 días hábiles, con seguimiento desde el envío."],
      ],
      manchetes: ["La casa a tu manera", "Detalles que cambian un ambiente", "Practicidad en cada rincón"],
    },
    pet: {
      nome: "Mascotas",
      resumo: "Accesorios, juguetes y cuidados para perros y gatos.",
      produto: "productos para perros y gatos",
      /* posicionalmente paralelo ao portugues: o sorteio pega a mesma vaga */
      sufixos: ["Pet", "Petshop", "Store", "Co."],
      colecoes: ["Perros", "Gatos", "Juguetes", "Higiene", "Paseo", "Más vendidos"],
      beneficios: ["Materiales atóxicos", "Cambio fácil en 30 días", "Envío gratis desde 149 €"],
      perguntas: [
        ["¿Cómo elijo la talla del collar?", "Mide el cuello de tu mascota con una cinta y compáralo con la tabla de la página."],
        ["¿Los juguetes son seguros?", "Usamos materiales atóxicos y resistentes; la indicación de tamaño está en cada producto."],
        ["¿Puedo cambiarlo?", "Puedes, hasta 30 días, siempre que tu mascota no lo haya usado."],
      ],
      manchetes: ["Cuidar bien es simple", "Todo para quien ladra y ronronea", "Lo mejor para tu animal"],
    },
    fitness: {
      nome: "Fitness y deportes",
      resumo: "Equipamiento, accesorios y ropa de entrenamiento.",
      produto: "artículos de entrenamiento",
      /* posicionalmente paralelo ao portugues: o sorteio pega a mesma vaga */
      sufixos: ["Fit", "Sports", "Training", "Co."],
      colecoes: ["Musculación", "Running", "Yoga y movilidad", "Suplementos", "Accesorios", "Ofertas"],
      beneficios: ["Garantía de 12 meses", "Envío gratis desde 199 €", "Soporte para el montaje"],
      perguntas: [
        ["¿Cuánta carga aguanta?", "La carga máxima está en la ficha técnica de cada producto."],
        ["¿Sirve para principiantes?", "Sí; cada página indica el nivel y sugiere cómo progresar."],
        ["¿Tiene garantía?", "12 meses contra defectos de fabricación, con cambio directo con nosotros."],
      ],
      manchetes: ["Entrenar sin excusas", "Equipamiento que aguanta el ritmo", "La constancia gana a la intensidad"],
    },
    gadgets: {
      nome: "Electrónica y gadgets",
      resumo: "Accesorios de tecnología, audio y hogar conectado.",
      produto: "electrónica",
      /* posicionalmente paralelo ao portugues: o sorteio pega a mesma vaga */
      sufixos: ["Tech", "Labs", "Gadgets", "Store"],
      colecoes: ["Audio", "Cargadores", "Hogar inteligente", "Accesorios", "Novedades", "Ofertas"],
      beneficios: ["Garantía de 12 meses", "Compatibilidad indicada en cada producto", "Envío en 24h"],
      perguntas: [
        ["¿Es compatible con mi aparato?", "La lista de compatibilidad está en la ficha técnica de cada producto."],
        ["¿Hay factura?", "Sí, la factura sale por correo en cuanto se emite el pedido."],
        ["¿Y la garantía?", "12 meses contra defectos de fabricación, tratada directamente con nosotros."],
      ],
      manchetes: ["Tecnología que resuelve", "Menos cables, más uso", "Gadgets que valen el espacio"],
    },
    infantil: {
      nome: "Infantil y bebé",
      resumo: "Canastilla, juguetes y accesorios para niños.",
      produto: "artículos infantiles",
      /* posicionalmente paralelo ao portugues: o sorteio pega a mesma vaga */
      sufixos: ["Kids", "Baby", "Infantil", "Store"],
      colecoes: ["Canastilla", "Juguetes", "Ropita", "Higiene", "Paseo", "Más vendidos"],
      beneficios: ["Materiales atóxicos y certificados", "Cambios en 30 días", "Embalaje para regalo"],
      perguntas: [
        ["¿A partir de qué edad?", "La franja de edad recomendada está en la página de cada artículo."],
        ["¿Los materiales son seguros?", "Usamos materiales atóxicos y sin piezas sueltas en los artículos para los más pequeños."],
        ["¿Puedo regalarlo?", "Puedes: marca la opción regalo en el carrito y sale envuelto, sin precios."],
      ],
      manchetes: ["Del tamaño de tu pequeño", "Cuidado desde el primer día", "Crecer con seguridad"],
    },
    joias: {
      nome: "Joyas y accesorios",
      resumo: "Semijoyas, bisutería y accesorios de uso diario.",
      produto: "joyas",
      /* posicionalmente paralelo ao portugues: o sorteio pega a mesma vaga */
      sufixos: ["Joyas", "Accesorios", "Studio", "Co."],
      colecoes: ["Collares", "Pendientes", "Anillos", "Pulseras", "Kits", "Novedades"],
      beneficios: ["Baño de oro de 18k", "Garantía de 12 meses contra la oxidación", "Embalaje para regalo"],
      perguntas: [
        ["¿Se oscurece con el tiempo?", "Con el cuidado indicado en la tarjeta que acompaña la pieza, el baño dura mucho más."],
        ["¿Se puede mojar?", "Evita la ducha, el mar y la piscina: el cloro y la sal son lo que más desgasta el baño."],
        ["¿Viene envuelto para regalo?", "Sí, cada pieza sale en su cajita con la tarjeta de cuidados."],
      ],
      manchetes: ["Piezas para todos los días", "Brillo en el detalle", "Accesorios que se quedan contigo"],
    },
  },
};

/**
 * O nicho JÁ NO IDIOMA da loja.
 *
 * Recebe o nicho como ele está em `marca-generator.mjs` (português) e devolve
 * uma cópia com os campos de texto trocados. O que não tiver tradução fica como
 * está: uma loja com uma frase em português é ruim, uma loja com um campo vazio
 * é pior.
 */
export function nichoNoIdioma(nicho, idioma) {
  const tabela = NICHOS_TRADUZIDOS[idioma]?.[nicho?.id];
  if (!nicho || !tabela) return nicho;
  return {
    ...nicho,
    nome: tabela.nome ?? nicho.nome,
    resumo: tabela.resumo ?? nicho.resumo,
    produto: tabela.produto ?? nicho.produto,
    /* a raiz fica; o sufixo, que e palavra de categoria, acompanha a lingua */
    sufixos: tabela.sufixos ?? nicho.sufixos,
    colecoes: tabela.colecoes ?? nicho.colecoes,
    beneficios: tabela.beneficios ?? nicho.beneficios,
    perguntas: tabela.perguntas ?? nicho.perguntas,
    manchetes: tabela.manchetes ?? nicho.manchetes,
  };
}
