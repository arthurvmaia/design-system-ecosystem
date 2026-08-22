/**
 * Orbis Criativos: a marca inteira gerada a partir de um nicho.
 *
 * A pessoa que abre a área do cliente muitas vezes não tem marca nenhuma — veio
 * montar a loja justamente porque a marca ainda vai nascer. Pedir nome, paleta,
 * tipografia e tom de voz nessa hora é cobrar o que ela não tem. Aqui ela
 * escolhe o nicho ("óculos", "pet", "fitness") e sai com nome, slogan,
 * descrição, paleta, tipografia, voz, logo, coleções e textos prontos.
 *
 * ## Determinístico de propósito
 *
 * Tudo sai de uma semente (`semente`): a mesma semente devolve exatamente a
 * mesma marca. Isso vale mais do que parece — a prévia no navegador e a
 * geração no servidor produzem o mesmo resultado sem trafegar a marca inteira,
 * e "gerar outra" é só trocar a semente. Também dispensa confiar em SVG vindo
 * do cliente: o servidor redesenha a logo a partir da semente.
 *
 * ## Onde entra um modelo de verdade
 *
 * Este arquivo é o motor local, e é o que existe hoje: não há provedor de IA
 * configurado no app. `gerarMarca` é a fronteira — trocar o miolo por uma
 * chamada a um modelo não muda quem chama nem o formato devolvido.
 *
 * Puro e testável com `node --test`, como o resto das regras.
 */
import { IDIOMA_PADRAO, idiomaDe } from "./idiomas.mjs";
import { textosDoIdioma } from "./textos.mjs";
import { nichoNoIdioma } from "./nichos-textos.mjs";


/** Hash FNV-1a: transforma a semente de texto em número para o gerador. */
function hashSemente(valor) {
  let hash = 0x811c9dc5;
  const texto = String(valor ?? "");
  for (let i = 0; i < texto.length; i += 1) {
    hash ^= texto.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

/** Gerador pseudoaleatório pequeno e estável (mulberry32). */
function sorteador(semente) {
  let estado = hashSemente(semente) || 1;
  return function proximo() {
    estado = (estado + 0x6d2b79f5) >>> 0;
    let t = estado;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function escolher(sorteio, lista) {
  return lista[Math.floor(sorteio() * lista.length) % lista.length];
}

/* ------------------------------------------------------------------ nichos */

/**
 * Os nichos de dropshipping que a área do cliente oferece.
 *
 * Cada um traz o vocabulário da categoria (raízes e sufixos de nome), paletas
 * que combinam com a mercadoria, pares de fonte, o jeito de falar, e as
 * coleções, benefícios e perguntas que a loja daquele nicho realmente tem.
 * Nada aqui é decoração: é o que a loja gerada vai vestir.
 */
export const NICHOS = Object.freeze([
  {
    id: "roupas",
    nome: "Roupas e moda",
    resumo: "Peças de vestuário, básicos e coleções de estação.",
    /**
     * O que a loja vende, em DUAS palavras — para o pedido de imagem.
     *
     * `resumo` é a frase de vitrine e serve à tela; num pedido a um gerador de
     * imagem ela vira ruído. "Semijoias, bijuterias e acessórios de uso diário"
     * fez a capa de "Pulseiras" voltar como BOLSA: o modelo pesou "acessórios",
     * que estava escrito no pedido, e ignorou a palavra que importava. O
     * assunto de uma capa é a coleção; o nicho entra curto e só como contexto.
     */
    produto: "roupas",
    /**
     * O ASSUNTO CONCRETO de cada cena de campanha.
     *
     * `produto` é a palavra curta que nomeia o ramo — "artigos de treino",
     * "objetos de decoração para casa" —, e ela serve para dizer de que loja se
     * trata. Como ASSUNTO de uma foto, porém, ela não é nada: não existe objeto
     * chamado "artigos de treino" para pôr na frente da câmera. Medido numa
     * loja de fitness: o pedido do segundo banner voltou um retângulo verde
     * liso, sem produto nenhum no quadro, porque o modelo não tinha o que
     * fotografar e obedeceu ao resto do pedido ("fundo liso", "margem larga").
     *
     * Aqui o assunto é uma coisa que existe: um par de halteres, um pote de
     * creme, um colar. Não é invenção sobre o estoque de ninguém — é o que o
     * catálogo daquele nicho vende, dito de um jeito que uma câmera alcança.
     */
    cenas: { pessoa: "uma pessoa vestindo uma camisa de linho, em pé", produto: "uma camisa dobrada e uma calça de alfaiataria sobre a bancada" },
    raizes: ["Alma", "Trama", "Linho", "Volare", "Aurora", "Cais", "Verso", "Norte"],
    sufixos: ["Atelier", "Studio", "Wear", "Co.", "Moda"],
    paletas: [
      { primaria: "#1f2937", fundo: "#f7f5f2", destaque: "#c2703d" },
      { primaria: "#7c3f58", fundo: "#faf6f3", destaque: "#d8a48f" },
      { primaria: "#14532d", fundo: "#f4f7f2", destaque: "#a3b18a" },
    ],
    fontes: [
      { titulo: "Playfair Display", corpo: "Inter" },
      { titulo: "Cormorant", corpo: "Karla" },
      { titulo: "DM Serif Display", corpo: "DM Sans" },
    ],
    vozes: ["editorial e calma", "próxima e direta", "elegante sem afetação"],
    colecoes: ["Novidades", "Básicos", "Coleção de estação", "Alfaiataria", "Promoções", "Últimas peças"],
    beneficios: ["Troca em até 30 dias", "Frete grátis acima de R$ 199", "Tabela de medidas em cada peça"],
    perguntas: [
      ["Como escolho o tamanho?", "Cada peça tem a tabela de medidas na própria página, com as medidas do corpo e da roupa."],
      ["Posso trocar se não servir?", "Pode. A primeira troca por tamanho é por nossa conta, em até 30 dias."],
      ["Em quanto tempo chega?", "Entre 5 e 12 dias úteis, com o código de rastreio assim que o pedido sai."],
    ],
    manchetes: ["Peças que ficam", "O básico bem-feito", "Vestir sem esforço"],
  },
  {
    id: "oculos",
    nome: "Óculos e eyewear",
    resumo: "Óculos de sol e armações de grau.",
    produto: "óculos",
    cenas: { pessoa: "uma pessoa usando óculos de sol", produto: "um par de óculos de sol" },
    raizes: ["Vista", "Lente", "Solar", "Íris", "Miró", "Claro", "Zenite"],
    sufixos: ["Eyewear", "Optics", "Studio", "Co."],
    paletas: [
      { primaria: "#0f172a", fundo: "#f5f6f8", destaque: "#d97706" },
      { primaria: "#1e3a5f", fundo: "#f7f8fa", destaque: "#38bdf8" },
      { primaria: "#3f2d20", fundo: "#faf7f2", destaque: "#c08457" },
    ],
    fontes: [
      { titulo: "Archivo", corpo: "Inter" },
      { titulo: "Space Grotesk", corpo: "IBM Plex Sans" },
      { titulo: "Manrope", corpo: "Manrope" },
    ],
    vozes: ["técnica e confiante", "moderna e enxuta", "clara e objetiva"],
    colecoes: ["Óculos de sol", "Armações de grau", "Polarizados", "Unissex", "Lançamentos", "Acessórios"],
    beneficios: ["Proteção UV400 em todos os modelos", "Estojo e flanela inclusos", "Garantia de 12 meses"],
    perguntas: [
      ["As lentes têm proteção UV?", "Todas. Os modelos saem com filtro UV400, que bloqueia UVA e UVB."],
      ["Serve para grau?", "As armações aceitam lentes de grau; leve a receita ao seu óptico de confiança."],
      ["E se o modelo não cair bem?", "Você tem 7 dias para devolver sem custo, com a embalagem original."],
    ],
    manchetes: ["Enxergue melhor, apareça melhor", "Proteção que combina com você", "Armações para o dia inteiro"],
  },
  {
    id: "relogios",
    nome: "Relógios",
    resumo: "Relógios analógicos, digitais e smartwatches.",
    produto: "relógios",
    cenas: { pessoa: "um relógio no pulso de uma pessoa", produto: "um relógio de pulso com pulseira de couro" },
    raizes: ["Hora", "Cronos", "Meridiano", "Vento", "Órbita", "Aço"],
    sufixos: ["Watches", "Relojoaria", "Time", "Co."],
    paletas: [
      { primaria: "#111827", fundo: "#f4f5f7", destaque: "#b45309" },
      { primaria: "#1f2933", fundo: "#f6f7f9", destaque: "#0ea5e9" },
      { primaria: "#2c2416", fundo: "#faf8f4", destaque: "#a97142" },
    ],
    fontes: [
      { titulo: "Oswald", corpo: "Inter" },
      { titulo: "Barlow Condensed", corpo: "Barlow" },
      { titulo: "Rajdhani", corpo: "Roboto" },
    ],
    vozes: ["precisa e sóbria", "esportiva e enérgica", "sofisticada e seca"],
    colecoes: ["Smartwatches", "Analógicos", "Esportivos", "Pulseiras", "Lançamentos", "Ofertas"],
    beneficios: ["Resistência à água comprovada", "Garantia de 12 meses", "Pulseira extra em modelos selecionados"],
    perguntas: [
      ["Pode molhar?", "Cada modelo informa a resistência na página; os marcados 5ATM aguentam banho e chuva."],
      ["Quanto dura a bateria?", "De 7 a 30 dias nos smartwatches, conforme o uso do monitor cardíaco e da tela."],
      ["Tem garantia?", "Sim, 12 meses contra defeito de fabricação, direto conosco."],
    ],
    manchetes: ["O tempo no seu pulso", "Precisão que acompanha o dia", "Relógios para quem não para"],
  },
  {
    id: "beleza",
    nome: "Beleza e skincare",
    resumo: "Cuidados com a pele, cabelo e maquiagem.",
    produto: "cosméticos",
    cenas: { pessoa: "uma pessoa aplicando creme no rosto", produto: "um pote de creme e um frasco de sérum" },
    raizes: ["Pele", "Aura", "Sereno", "Flor", "Rotina", "Lume"],
    sufixos: ["Beauty", "Skin", "Cosméticos", "Care"],
    paletas: [
      { primaria: "#9d5c63", fundo: "#fdf7f5", destaque: "#e0a3a3" },
      { primaria: "#3f6d5c", fundo: "#f5faf7", destaque: "#8fbfa5" },
      { primaria: "#7a5c9e", fundo: "#f9f6fc", destaque: "#c3a7e0" },
    ],
    fontes: [
      { titulo: "Marcellus", corpo: "Nunito Sans" },
      { titulo: "Lora", corpo: "Source Sans Pro" },
      { titulo: "Quicksand", corpo: "Quicksand" },
    ],
    vozes: ["acolhedora e cuidadosa", "clara e sem promessa milagrosa", "leve e otimista"],
    colecoes: ["Rosto", "Cabelo", "Corpo", "Kits", "Mais vendidos", "Lançamentos"],
    beneficios: ["Fórmulas testadas dermatologicamente", "Sem teste em animais", "Envio discreto e lacrado"],
    perguntas: [
      ["Serve para pele sensível?", "A página de cada produto traz o tipo de pele indicado e a lista completa de ingredientes."],
      ["Em quanto tempo vejo resultado?", "Depende do produto e da rotina; o uso contínuo por 4 semanas é o mínimo razoável."],
      ["Como é enviado?", "Em embalagem lacrada e sem identificação do conteúdo por fora."],
    ],
    manchetes: ["Uma rotina que cabe no seu dia", "Cuidado simples, pele calma", "Beleza sem complicação"],
  },
  {
    id: "casa",
    nome: "Casa e decoração",
    resumo: "Utilidades, organização e decoração para o lar.",
    produto: "objetos de decoração para casa",
    cenas: { pessoa: "uma pessoa arrumando potes numa prateleira da cozinha", produto: "um jogo de potes de vidro sobre a bancada" },
    raizes: ["Casa", "Ninho", "Terra", "Abrigo", "Varanda", "Lar"],
    sufixos: ["Home", "Casa", "Decor", "Studio"],
    paletas: [
      { primaria: "#4a5240", fundo: "#f7f6f1", destaque: "#c9a227" },
      { primaria: "#2f4858", fundo: "#f5f8f9", destaque: "#e08e45" },
      { primaria: "#6b4f4f", fundo: "#faf6f4", destaque: "#c7a17a" },
    ],
    fontes: [
      { titulo: "Fraunces", corpo: "Inter" },
      { titulo: "Bitter", corpo: "Open Sans" },
      { titulo: "Libre Baskerville", corpo: "Lato" },
    ],
    vozes: ["caseira e tranquila", "prática e direta", "aconchegante"],
    colecoes: ["Cozinha", "Organização", "Decoração", "Cama e banho", "Iluminação", "Ofertas"],
    beneficios: ["Frete grátis acima de R$ 249", "Garantia de 90 dias", "Embalagem reforçada"],
    perguntas: [
      ["Vem com manual?", "Os itens que precisam de montagem vêm com manual ilustrado na caixa."],
      ["E se chegar quebrado?", "Registre uma foto e resolvemos com reenvio ou reembolso, sem discussão."],
      ["Qual o prazo de entrega?", "De 5 a 12 dias úteis, com rastreio desde a postagem."],
    ],
    manchetes: ["A casa do seu jeito", "Detalhes que mudam o ambiente", "Praticidade em cada cômodo"],
  },
  {
    id: "pet",
    nome: "Pet",
    resumo: "Acessórios, brinquedos e cuidados para cães e gatos.",
    produto: "produtos para cães e gatos",
    cenas: { pessoa: "uma pessoa brincando com um cachorro no chão da sala", produto: "um brinquedo de pelúcia e uma bola de borracha" },
    raizes: ["Patas", "Focinho", "Late", "Bicho", "Amigo", "Ronrom"],
    sufixos: ["Pet", "Petshop", "Store", "Co."],
    paletas: [
      { primaria: "#2563eb", fundo: "#f5f8ff", destaque: "#f59e0b" },
      { primaria: "#166534", fundo: "#f4faf5", destaque: "#facc15" },
      { primaria: "#9a3412", fundo: "#fef8f4", destaque: "#38bdf8" },
    ],
    fontes: [
      { titulo: "Fredoka", corpo: "Nunito" },
      { titulo: "Comfortaa", corpo: "Rubik" },
      { titulo: "Poppins", corpo: "Poppins" },
    ],
    vozes: ["carinhosa e brincalhona", "prática e amiga", "calorosa"],
    colecoes: ["Cães", "Gatos", "Brinquedos", "Higiene", "Passeio", "Mais vendidos"],
    beneficios: ["Materiais atóxicos", "Troca fácil em 30 dias", "Frete grátis acima de R$ 149"],
    perguntas: [
      ["Como escolho o tamanho da coleira?", "Meça o pescoço do bicho com uma fita e compare com a tabela na página."],
      ["Os brinquedos são seguros?", "Usamos materiais atóxicos e resistentes; a indicação de porte está em cada produto."],
      ["Posso trocar?", "Pode, em até 30 dias, desde que o item não tenha sido usado pelo pet."],
    ],
    manchetes: ["Cuidar bem é simples", "Tudo para quem late e ronrona", "O melhor para o seu bicho"],
  },
  {
    id: "fitness",
    nome: "Fitness e esportes",
    resumo: "Equipamentos, acessórios e roupa de treino.",
    produto: "artigos de treino",
    cenas: { pessoa: "uma pessoa treinando com uma faixa elástica", produto: "um par de halteres ao lado de um tapete de yoga enrolado" },
    raizes: ["Força", "Pulso", "Ritmo", "Fibra", "Movi", "Ápice"],
    sufixos: ["Fit", "Sports", "Training", "Co."],
    paletas: [
      { primaria: "#0f172a", fundo: "#f4f6f8", destaque: "#22c55e" },
      { primaria: "#111827", fundo: "#f6f6f7", destaque: "#ef4444" },
      { primaria: "#1e293b", fundo: "#f5f7fa", destaque: "#f97316" },
    ],
    fontes: [
      { titulo: "Anton", corpo: "Inter" },
      { titulo: "Bebas Neue", corpo: "Roboto" },
      { titulo: "Archivo Black", corpo: "Archivo" },
    ],
    vozes: ["direta e motivadora", "técnica e sem hype", "enérgica"],
    colecoes: ["Musculação", "Corrida", "Yoga e mobilidade", "Suplementos", "Acessórios", "Ofertas"],
    beneficios: ["Garantia de 12 meses", "Frete grátis acima de R$ 199", "Suporte para montagem"],
    perguntas: [
      ["Qual carga o equipamento aguenta?", "A carga máxima está na ficha técnica de cada produto."],
      ["Serve para iniciante?", "Sim; cada página indica o nível e traz sugestão de progressão."],
      ["Tem garantia?", "12 meses contra defeito de fabricação, com troca direta conosco."],
    ],
    manchetes: ["Treino sem desculpa", "Equipamento que aguenta o ritmo", "Constância vence intensidade"],
  },
  {
    id: "gadgets",
    nome: "Eletrônicos e gadgets",
    resumo: "Acessórios de tecnologia, áudio e casa conectada.",
    produto: "eletrônicos",
    cenas: { pessoa: "uma pessoa usando fones de ouvido sem fio", produto: "um fone de ouvido sem fio ao lado do estojo de carga" },
    raizes: ["Pulso", "Circuito", "Nova", "Volt", "Sinal", "Núcleo"],
    sufixos: ["Tech", "Labs", "Gadgets", "Store"],
    paletas: [
      { primaria: "#0b1220", fundo: "#f4f6f9", destaque: "#06b6d4" },
      { primaria: "#111827", fundo: "#f5f6f8", destaque: "#8b5cf6" },
      { primaria: "#0f172a", fundo: "#f6f8fa", destaque: "#22d3ee" },
    ],
    fontes: [
      { titulo: "Space Grotesk", corpo: "Inter" },
      { titulo: "Chakra Petch", corpo: "IBM Plex Sans" },
      { titulo: "Outfit", corpo: "Outfit" },
    ],
    vozes: ["técnica e sem exagero", "moderna e enxuta", "informativa"],
    colecoes: ["Áudio", "Carregadores", "Casa inteligente", "Acessórios", "Lançamentos", "Ofertas"],
    beneficios: ["Garantia de 12 meses", "Compatibilidade listada em cada produto", "Envio em até 24h"],
    perguntas: [
      ["É compatível com o meu aparelho?", "A lista de compatibilidade fica na ficha técnica de cada produto."],
      ["Tem nota fiscal?", "Sim, a nota vai por e-mail assim que o pedido é faturado."],
      ["E a garantia?", "12 meses contra defeito de fabricação, tratada direto conosco."],
    ],
    manchetes: ["Tecnologia que resolve", "Menos fio, mais uso", "Gadgets que valem o espaço"],
  },
  {
    id: "infantil",
    nome: "Infantil e bebê",
    resumo: "Enxoval, brinquedos e acessórios para crianças.",
    produto: "artigos infantis",
    cenas: { pessoa: "uma criança brincando com um quebra-cabeça de madeira", produto: "um quebra-cabeça de madeira e blocos coloridos empilhados" },
    raizes: ["Nino", "Balão", "Pequeno", "Céu", "Colo", "Bem-me-quer"],
    sufixos: ["Kids", "Baby", "Infantil", "Store"],
    paletas: [
      { primaria: "#2563eb", fundo: "#f6f9ff", destaque: "#fbbf24" },
      { primaria: "#be185d", fundo: "#fdf6f9", destaque: "#7dd3fc" },
      { primaria: "#15803d", fundo: "#f5fbf6", destaque: "#fb923c" },
    ],
    fontes: [
      { titulo: "Fredoka", corpo: "Nunito" },
      { titulo: "Comfortaa", corpo: "Quicksand" },
      { titulo: "Poppins", corpo: "Poppins" },
    ],
    vozes: ["afetuosa e simples", "tranquilizadora", "leve"],
    colecoes: ["Enxoval", "Brinquedos", "Roupinhas", "Higiene", "Passeio", "Mais vendidos"],
    beneficios: ["Materiais atóxicos e certificados", "Troca em 30 dias", "Embalagem para presente"],
    perguntas: [
      ["A partir de que idade?", "A faixa etária indicada está na página de cada item."],
      ["Os materiais são seguros?", "Usamos materiais atóxicos e sem peças soltas nos itens para os menores."],
      ["Posso presentear?", "Pode: marque a opção presente no carrinho e vai embalado, sem valores."],
    ],
    manchetes: ["Do tamanho do seu pequeno", "Cuidado desde o primeiro dia", "Crescer com segurança"],
  },
  {
    id: "joias",
    nome: "Joias e acessórios",
    resumo: "Semijoias, bijuterias e acessórios de uso diário.",
    produto: "joias",
    cenas: { pessoa: "um colar delicado no pescoço de uma pessoa", produto: "um colar fino e um par de brincos sobre veludo" },
    raizes: ["Brilho", "Prata", "Elo", "Luz", "Camélia", "Ouro"],
    sufixos: ["Joias", "Acessórios", "Studio", "Co."],
    paletas: [
      { primaria: "#3f3529", fundo: "#faf7f2", destaque: "#c9a227" },
      { primaria: "#4c1d3d", fundo: "#fbf6f9", destaque: "#d4a5c0" },
      { primaria: "#1f2937", fundo: "#f7f7f6", destaque: "#b8b8b8" },
    ],
    fontes: [
      { titulo: "Cormorant", corpo: "Jost" },
      { titulo: "Tenor Sans", corpo: "Inter" },
      { titulo: "Playfair Display", corpo: "Karla" },
    ],
    vozes: ["delicada e precisa", "sofisticada e curta", "afetiva"],
    colecoes: ["Colares", "Brincos", "Anéis", "Pulseiras", "Kits", "Lançamentos"],
    beneficios: ["Banho de ouro 18k", "Garantia de 12 meses contra oxidação", "Embalagem para presente"],
    perguntas: [
      ["Escurece com o tempo?", "Com o cuidado indicado no cartão que acompanha a peça, o banho dura muito mais."],
      ["Posso molhar?", "Evite banho, mar e piscina: o cloro e o sal são o que mais desgastam o banho."],
      ["Vem embalado para presente?", "Sim, toda peça sai em caixinha própria com o cartão de cuidados."],
    ],
    manchetes: ["Peças para todo dia", "Brilho no detalhe", "Acessórios que ficam com você"],
  },
]);

export function nichoPorId(id) {
  return NICHOS.find((nicho) => nicho.id === id) ?? NICHOS[0];
}

/* -------------------------------------------------------------------- cores */

function paraRgb(hex) {
  const limpo = String(hex ?? "").replace("#", "");
  const cheio = limpo.length === 3 ? limpo.split("").map((c) => c + c).join("") : limpo;
  return [0, 2, 4].map((posicao) => Number.parseInt(cheio.slice(posicao, posicao + 2), 16) || 0);
}

function paraHex([r, g, b]) {
  return `#${[r, g, b].map((canal) => Math.max(0, Math.min(255, Math.round(canal))).toString(16).padStart(2, "0")).join("")}`;
}

/** Mistura duas cores; `peso` é quanto da segunda entra. */
export function misturar(a, b, peso) {
  const [r1, g1, b1] = paraRgb(a);
  const [r2, g2, b2] = paraRgb(b);
  return paraHex([r1 + (r2 - r1) * peso, g1 + (g2 - g1) * peso, b1 + (b2 - b1) * peso]);
}

/** Preto ou branco sobre a cor, pelo brilho percebido. */
export function textoSobre(cor) {
  const [r, g, b] = paraRgb(cor);
  return (r * 299 + g * 587 + b * 114) / 1000 > 145 ? "#111111" : "#ffffff";
}

/* --------------------------------------------------------------------- logo */

/**
 * Desenha a logo em SVG: uma marca geométrica com as iniciais.
 *
 * SVG e não bitmap porque é nítido em qualquer tamanho, pesa poucos bytes e o
 * servidor consegue redesenhar exatamente o mesmo arquivo a partir da semente —
 * assim nenhuma imagem enviada pelo cliente precisa ser confiada.
 */
export function gerarLogoSvg({ nome, primaria, destaque, forma }) {
  const iniciais = String(nome ?? "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((parte) => parte[0])
    .join("")
    .toUpperCase() || "O";
  const marca = {
    circulo: `<circle cx="60" cy="60" r="42" fill="${primaria}"/><circle cx="60" cy="60" r="42" fill="none" stroke="${destaque}" stroke-width="4"/>`,
    losango: `<rect x="24" y="24" width="72" height="72" rx="10" transform="rotate(45 60 60)" fill="${primaria}"/>`,
    arco: `<path d="M18 96a42 42 0 0 1 84 0z" fill="${primaria}"/><rect x="18" y="96" width="84" height="8" fill="${destaque}"/>`,
    escudo: `<path d="M60 16 104 34v34c0 22-19 33-44 40C35 101 16 90 16 68V34z" fill="${primaria}"/>`,
    hexagono: `<path d="M60 14 102 38v44L60 106 18 82V38z" fill="${primaria}"/><path d="M60 14 102 38v44L60 106 18 82V38z" fill="none" stroke="${destaque}" stroke-width="4"/>`,
    moldura: `<rect x="18" y="18" width="84" height="84" fill="none" stroke="${primaria}" stroke-width="8"/><rect x="34" y="34" width="52" height="52" fill="${destaque}"/>`,
  }[forma] ?? "";
  const corDoTexto = forma === "moldura" ? primaria : textoSobre(primaria);
  return [
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" width="120" height="120" role="img">',
    `<title>${escaparXml(nome)}</title>`,
    marca,
    `<text x="60" y="60" text-anchor="middle" dominant-baseline="central" font-family="Georgia, serif" font-size="34" font-weight="700" fill="${corDoTexto}">${escaparXml(iniciais)}</text>`,
    "</svg>",
  ].join("");
}

function escaparXml(valor) {
  return String(valor ?? "").replace(/[<>&"']/g, (caractere) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" }[caractere]));
}

/** A logo como data URI, pronta para `<img src>` e para virar asset do tema. */
export function logoDataUri(svg) {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

/* --------------------------------------------------------- arte dos nichos */

/**
 * O desenho de cada nicho, para o cartão de escolha.
 *
 * Três quadradinhos de cor não dizem se o cartão é de óculos ou de relógio — a
 * pessoa lê o texto e ignora a imagem. Aqui cada nicho tem a sua coisa: a
 * camiseta, os óculos, a pata, o halter. É SVG e não foto porque precisa abrir
 * sem rede, pesar pouco e vestir a paleta do próprio nicho.
 */
const DESENHOS = {
  roupas: (p, d) => `<path d="M56 30 70 24Q80 34 90 24L104 30 110 44 100 48V80H60V48L50 44Z" fill="${p}"/><path d="M70 24Q80 34 90 24" fill="none" stroke="${d}" stroke-width="3"/>`,
  oculos: (p, d) => `<rect x="34" y="40" width="36" height="26" rx="12" fill="${p}"/><rect x="90" y="40" width="36" height="26" rx="12" fill="${p}"/><rect x="70" y="48" width="20" height="6" rx="3" fill="${d}"/><path d="M34 46 22 38M126 46 138 38" stroke="${p}" stroke-width="4" stroke-linecap="round"/>`,
  relogios: (p, d) => `<rect x="69" y="14" width="22" height="24" rx="4" fill="${p}"/><rect x="69" y="62" width="22" height="24" rx="4" fill="${p}"/><circle cx="80" cy="50" r="23" fill="${p}"/><circle cx="80" cy="50" r="17" fill="${d}"/><path d="M80 50V39M80 50l9 6" stroke="${p}" stroke-width="3" stroke-linecap="round"/>`,
  beleza: (p, d) => `<rect x="63" y="40" width="34" height="46" rx="8" fill="${p}"/><rect x="72" y="30" width="16" height="12" fill="${d}"/><rect x="73" y="12" width="14" height="18" rx="6" fill="${p}"/><path d="M117 30c5 7 8 11 8 15a8 8 0 0 1-16 0c0-4 3-8 8-15Z" fill="${d}"/>`,
  casa: (p, d) => `<path d="M80 16 126 52H34Z" fill="${p}"/><rect x="47" y="52" width="66" height="34" fill="${p}"/><rect x="70" y="60" width="20" height="26" fill="${d}"/><rect x="53" y="60" width="12" height="12" fill="${d}"/>`,
  pet: (p, d) => `<ellipse cx="80" cy="64" rx="23" ry="18" fill="${p}"/><circle cx="55" cy="42" r="9" fill="${d}"/><circle cx="71" cy="31" r="9" fill="${p}"/><circle cx="89" cy="31" r="9" fill="${p}"/><circle cx="105" cy="42" r="9" fill="${d}"/>`,
  fitness: (p, d) => `<rect x="52" y="45" width="56" height="10" rx="5" fill="${p}"/><rect x="36" y="32" width="16" height="36" rx="5" fill="${p}"/><rect x="108" y="32" width="16" height="36" rx="5" fill="${p}"/><rect x="26" y="40" width="9" height="20" rx="4" fill="${d}"/><rect x="125" y="40" width="9" height="20" rx="4" fill="${d}"/>`,
  gadgets: (p, d) => `<path d="M44 66a36 36 0 0 1 72 0" fill="none" stroke="${p}" stroke-width="9" stroke-linecap="round"/><rect x="34" y="58" width="18" height="28" rx="9" fill="${p}"/><rect x="108" y="58" width="18" height="28" rx="9" fill="${p}"/><rect x="39" y="65" width="8" height="14" rx="4" fill="${d}"/><rect x="113" y="65" width="8" height="14" rx="4" fill="${d}"/>`,
  infantil: (p, d) => `<circle cx="61" cy="33" r="11" fill="${p}"/><circle cx="99" cy="33" r="11" fill="${p}"/><circle cx="80" cy="45" r="21" fill="${p}"/><ellipse cx="80" cy="77" rx="23" ry="15" fill="${p}"/><circle cx="80" cy="51" r="9" fill="${d}"/>`,
  joias: (p, d) => `<circle cx="80" cy="64" r="21" fill="none" stroke="${p}" stroke-width="8"/><path d="M80 18 96 34 80 50 64 34Z" fill="${d}"/><path d="M64 34h32" stroke="${p}" stroke-width="2.5"/>`,
};

/** O SVG do nicho, já vestido com a primeira paleta dele. */
export function ilustracaoDoNicho(id) {
  const nicho = nichoPorId(id);
  const paleta = nicho.paletas[0];
  const desenho = DESENHOS[nicho.id] ?? DESENHOS.roupas;
  const brilho = misturar(paleta.fundo, paleta.primaria, 0.1);
  return [
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 100" width="160" height="100" role="img">',
    `<title>${escaparXml(nicho.nome)}</title>`,
    `<rect width="160" height="100" fill="${paleta.fundo}"/>`,
    `<rect y="70" width="160" height="30" fill="${brilho}"/>`,
    desenho(paleta.primaria, paleta.destaque),
    "</svg>",
  ].join("");
}

export function ilustracaoDataUri(id) {
  return logoDataUri(ilustracaoDoNicho(id));
}

/**
 * A foto do nicho, para o cartão de escolha.
 *
 * São fotografias de produto de verdade, geradas uma vez pelo Nano Banana Pro e
 * guardadas em `public/nichos/`. O desenho vetorial continua como reserva: se o
 * arquivo faltar, o cartão cai nele em vez de mostrar imagem quebrada.
 */
export function fotoDoNicho(id) {
  return `/nichos/${nichoPorId(id).id}.jpg`;
}

/* ------------------------------------------------------------------- marca */

const FORMAS = ["circulo", "losango", "arco", "escudo", "hexagono", "moldura"];

/**
 * A logo de uma marca qualquer, inclusive a que a pessoa escreveu à mão.
 *
 * Toda loja sai com logo: quem preenche o nome no modo manual não passava por
 * `gerarMarca` e ficava sem nenhuma — o cabeçalho do site entregue mostrava um
 * espaço vazio no lugar dela. A forma vem do nome, então a mesma marca sempre
 * ganha o mesmo desenho, no navegador e no servidor.
 */
export function logoDaMarca({ name, primaryColor, accentColor }) {
  const nome = String(name ?? "").trim() || "Minha Marca";
  const primaria = cor(primaryColor) || "#0e7490";
  const destaque = cor(accentColor) || primaria;
  const forma = escolher(sorteador(`logo:${nome}`), FORMAS);
  const svg = gerarLogoSvg({ nome, primaria, destaque, forma });
  return { forma, svg, dataUri: logoDataUri(svg) };
}

/**
 * A marca inteira a partir de um nicho e de uma semente.
 *
 * `sobrescritas` deixa a pessoa manter o que ela mesma decidiu: o que vier
 * preenchido ali vence o gerado, campo a campo. É o que permite gerar tudo e
 * depois trocar só o nome, sem perder o resto.
 */
/**
 * @param {{ nicheId?: string, semente?: string, sobrescritas?: Record<string, unknown>, idioma?: string }} [pedido]
 */
export function gerarMarca({ nicheId, semente = "orbis", sobrescritas = {}, idioma = IDIOMA_PADRAO } = {}) {
  /**
   * O nicho JA NO IDIOMA da loja, e o sorteio a partir do id.
   *
   * Traduzir o nicho aqui, no comeco, e o que faz a manchete, as colecoes, os
   * beneficios e o FAQ sairem na lingua escolhida sem que nada mais adiante
   * precise saber que existe idioma. O SORTEIO continua sendo pelo `id`, que
   * nao traduz: a mesma semente devolve a mesma loja nos tres idiomas, e o
   * cliente que troca de idioma nao ve a marca inteira mudar por baixo.
   */
  const codigo = idiomaDe(idioma);
  const textos = textosDoIdioma(codigo);
  const nicho = nichoNoIdioma(nichoPorId(nicheId), codigo);
  const sorteio = sorteador(`${nicho.id}:${semente}`);

  const raiz = escolher(sorteio, nicho.raizes);
  const sufixo = escolher(sorteio, nicho.sufixos);
  const nomeGerado = `${raiz} ${sufixo}`;
  const paleta = escolher(sorteio, nicho.paletas);
  const fontes = escolher(sorteio, nicho.fontes);
  const voz = escolher(sorteio, nicho.vozes);
  const manchete = escolher(sorteio, nicho.manchetes);
  const forma = escolher(sorteio, FORMAS);
  /* as coleções são as DO NICHO, na ordem dele: quem escolheu óculos quer
     "Óculos de sol" e "Armações de grau", não um sorteio a cada geração */
  /**
   * As coleções do CLIENTE vencem as do nicho.
   *
   * O nicho é um ponto de partida bom ("Novidades", "Alfaiataria"), mas quem
   * sabe as categorias da própria loja é quem vende: uma loja de roupa pode
   * querer "Moda Fitness" e outra "Verão". Sem esta linha o que a pessoa
   * digitava na bancada era regerado por cima aqui e sumia sem aviso.
   *
   * Vazio ou só espaço não conta: apagar tudo devolve as do nicho, em vez de
   * entregar uma loja sem categoria nenhuma.
   */
  const escolhidas = Array.isArray(sobrescritas.collections)
    ? sobrescritas.collections.map((nome) => String(nome ?? "").trim()).filter(Boolean)
    : [];
  const colecoes = escolhidas.length ? escolhidas.slice(0, 12) : nicho.colecoes.slice(0, 6);

  const nome = texto(sobrescritas.name) || nomeGerado;
  const primaria = cor(sobrescritas.primaryColor) || paleta.primaria;
  const fundo = cor(sobrescritas.backgroundColor) || paleta.fundo;
  const destaque = cor(sobrescritas.accentColor) || paleta.destaque;
  const svg = gerarLogoSvg({ nome, primaria, destaque, forma });

  return {
    nicheId: nicho.id,
    nicheNome: nicho.nome,
    /* o idioma viaja COM a marca: e ele que o gerador, o tema e o pacote leem
       adiante, e um campo paralelo seria esquecido numa das pontas */
    idioma: codigo,
    semente: String(semente),
    name: nome,
    slogan: texto(sobrescritas.slogan) || manchete,
    description: texto(sobrescritas.description) || `${nicho.resumo} ${textos.marca.curadoria}`,
    primaryColor: primaria,
    backgroundColor: fundo,
    accentColor: destaque,
    headingFont: texto(sobrescritas.headingFont) || fontes.titulo,
    bodyFont: texto(sobrescritas.bodyFont) || fontes.corpo,
    voice: texto(sobrescritas.voice) || voz,
    whatsapp: texto(sobrescritas.whatsapp),
    instagram: texto(sobrescritas.instagram).replace(/^@/, ""),
    email: texto(sobrescritas.email),
    logoForma: forma,
    logoSvg: svg,
    logoDataUri: logoDataUri(svg),
    collections: colecoes,
    benefits: nicho.beneficios,
    faq: nicho.perguntas.map(([pergunta, resposta]) => ({ pergunta, resposta })),
    announcement: `${nicho.beneficios[0]} · ${textos.marca.envio}`,
  };
}

function texto(valor) {
  return typeof valor === "string" ? valor.trim().slice(0, 240) : "";
}

function cor(valor) {
  return typeof valor === "string" && /^#[0-9a-f]{6}$/i.test(valor.trim()) ? valor.trim().toLowerCase() : "";
}

/** Semente nova a cada "gerar outra", curta o suficiente para caber na URL. */
export function novaSemente() {
  return Math.random().toString(36).slice(2, 10);
}
