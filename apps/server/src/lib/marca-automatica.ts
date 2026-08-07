import { randomBytes } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  type IdentidadeVerbal,
  type LocalDeLogo,
  type LogoVariante,
  type MediaItem,
  type PaletaDoProjeto,
  type RedeSocial,
  type TipografiaDoProjeto,
  distribuirLogos,
  projectMediaDir,
} from '@ds/shared';
import { buscarFotos } from './fotos-pexels.js';

/**
 * Marca automática para TESTES de geração: preenche a bancada inteira da etapa
 * de Marca com uma identidade coerente e cria as mídias que a marca pede.
 *
 * Sem modelo de linguagem, de propósito: o servidor roda em modo fila (API
 * paga bloqueada) e o objetivo declarado do dono é testar a geração — o que
 * exige uma marca VÁLIDA e completa, não uma marca inédita. As receitas são
 * curadas (paleta com contraste conferível, par tipográfico que o gerador já
 * carrega, voz com ids reais dos catálogos), e as mídias saem como SVG gerado
 * — leve, nítido em qualquer tamanho e sem depender de rede.
 */

/**
 * A CENA que as mídias automáticas desenham: o que o nicho vende, em
 * silhueta. "Qualquer mídia" não serve — uma marca de streetwear ganha peças
 * de roupa, uma pousada ganha um quarto, e o que não casa com cena nenhuma
 * fica na composição abstrata (declarada, não fingida).
 */
export type Cena =
  | 'moda'
  | 'cafe'
  | 'design'
  | 'surf'
  | 'arquitetura'
  | 'organicos'
  | 'treino'
  | 'hotel'
  | 'restaurante'
  | 'tecnologia'
  | 'pet'
  | 'beleza'
  | 'generica';

type Receita = {
  nome: string;
  segmento: string;
  /** Palavras que casam o nicho com esta receita (sem acento, minúsculas). */
  palavras: string[];
  /** O que as mídias desta receita desenham. */
  cena: Cena;
  tons: string[];
  arquetipos: string[];
  display: string;
  body: string;
  /** cores: [background, surface, heading, body, primary, primaryFg, accent] */
  cores: [string, string, string, string, string, string, string];
  escura: boolean;
  cta: { label: string; href: string };
};

const RECEITAS: readonly Receita[] = [
  {
    nome: 'Aurora Café',
    segmento: 'cafeteria artesanal',
    palavras: ['cafe', 'cafeteria', 'padaria', 'confeitaria', 'doceria'],
    cena: 'cafe',
    tons: ['acolhedor', 'proximo'],
    arquetipos: ['inocente', 'cuidador'],
    display: 'Cormorant Garamond, serif',
    body: 'Inter, sans-serif',
    cores: ['#faf6f0', '#ffffff', '#2d1b12', '#4a3728', '#8b4a2b', '#ffffff', '#c98d5c'],
    escura: false,
    cta: { label: 'Reservar mesa', href: '#contato' },
  },
  {
    nome: 'Vetor Estúdio',
    segmento: 'estúdio de design digital',
    palavras: ['design', 'estudio', 'agencia', 'marketing', 'branding', 'criativo'],
    cena: 'design',
    tons: ['direto', 'ousado'],
    arquetipos: ['criador'],
    display: 'Poppins, sans-serif',
    body: 'Inter, sans-serif',
    cores: ['#0a0a12', '#14141f', '#f5f5fa', '#b8b8c8', '#6d5cff', '#ffffff', '#00e5a0'],
    escura: true,
    cta: { label: 'Ver portfólio', href: '#trabalhos' },
  },
  {
    nome: 'Maré Alta',
    segmento: 'escola de surf',
    palavras: ['surf', 'praia', 'prancha', 'mar'],
    cena: 'surf',
    tons: ['energico', 'descontraido'],
    arquetipos: ['explorador'],
    display: 'Montserrat, sans-serif',
    body: 'Inter, sans-serif',
    cores: ['#f2f9fb', '#ffffff', '#0b2e3d', '#2c505f', '#0a7ea4', '#ffffff', '#ff8a3d'],
    escura: false,
    cta: { label: 'Agendar aula', href: '#agenda' },
  },
  {
    nome: 'Lumen Arquitetura',
    segmento: 'escritório de arquitetura',
    palavras: ['arquitetura', 'arquiteto', 'interiores', 'engenharia', 'construtora'],
    cena: 'arquitetura',
    tons: ['sofisticado', 'minimalista'],
    arquetipos: ['criador', 'sabio'],
    display: 'Cormorant Garamond, serif',
    body: 'Montserrat, sans-serif',
    cores: ['#111110', '#1c1c1a', '#f4f2ec', '#c9c5ba', '#b09a6d', '#111110', '#e0d6c2'],
    escura: true,
    cta: { label: 'Conhecer projetos', href: '#projetos' },
  },
  {
    nome: 'Horta Viva',
    segmento: 'assinatura de orgânicos',
    palavras: ['organico', 'organicos', 'horta', 'saudavel', 'natural', 'vegano'],
    cena: 'organicos',
    tons: ['humano', 'didatico'],
    arquetipos: ['cuidador', 'pessoa-comum'],
    display: 'Poppins, sans-serif',
    body: 'Inter, sans-serif',
    cores: ['#f6faf3', '#ffffff', '#1e3320', '#3d5240', '#2f7d43', '#ffffff', '#e0a53b'],
    escura: false,
    cta: { label: 'Montar cesta', href: '#planos' },
  },
  {
    nome: 'Pulso',
    segmento: 'app de treino',
    palavras: ['treino', 'academia', 'fitness', 'crossfit', 'personal', 'esporte'],
    cena: 'treino',
    tons: ['energico', 'direto'],
    arquetipos: ['heroi'],
    display: 'Montserrat, sans-serif',
    body: 'Inter, sans-serif',
    cores: ['#0d0d11', '#17171d', '#fafafa', '#b5b5bf', '#e6293d', '#ffffff', '#3de6c8'],
    escura: true,
    cta: { label: 'Começar agora', href: '#download' },
  },
  {
    nome: 'Calçada',
    segmento: 'streetwear',
    palavras: [
      'streetwear',
      'moda',
      'roupa',
      'roupas',
      'vestuario',
      'camiseta',
      'urbana',
      'urbano',
    ],
    cena: 'moda',
    tons: ['energico', 'direto'],
    arquetipos: ['heroi'],
    display: 'Montserrat, sans-serif',
    body: 'Inter, sans-serif',
    // Vermelho + laranja quente: vizinhos no círculo, sem verde alheio — o
    // destaque de uma marca de rua não pode parecer emprestado de outro site.
    cores: ['#0b0b0d', '#151519', '#f5f5f5', '#b8b8bd', '#e02431', '#ffffff', '#ff8a3d'],
    escura: true,
    cta: { label: 'Ver a coleção', href: '#vitrine' },
  },
  {
    nome: 'Pouso',
    segmento: 'pousada e hotelaria',
    palavras: ['hotel', 'pousada', 'hospedagem', 'resort', 'hostel', 'chale'],
    cena: 'hotel',
    tons: ['acolhedor', 'sofisticado'],
    arquetipos: ['cuidador'],
    display: 'Cormorant Garamond, serif',
    body: 'Inter, sans-serif',
    cores: ['#f8f4ec', '#ffffff', '#2a2118', '#54483a', '#9c6b3c', '#ffffff', '#d9b98a'],
    escura: false,
    cta: { label: 'Reservar estadia', href: '#reservas' },
  },
  {
    nome: 'Braseiro',
    segmento: 'restaurante',
    palavras: ['restaurante', 'comida', 'gastronomia', 'hamburgueria', 'pizzaria', 'lanchonete'],
    cena: 'restaurante',
    tons: ['acolhedor', 'proximo'],
    arquetipos: ['pessoa-comum'],
    display: 'Poppins, sans-serif',
    body: 'Inter, sans-serif',
    cores: ['#1a1210', '#241a16', '#faf3ec', '#c9b8ac', '#d4552a', '#ffffff', '#e8a33c'],
    escura: true,
    cta: { label: 'Ver o cardápio', href: '#cardapio' },
  },
  {
    nome: 'Loop',
    segmento: 'software e tecnologia',
    palavras: ['tecnologia', 'software', 'saas', 'startup', 'sistema', 'plataforma'],
    cena: 'tecnologia',
    tons: ['direto', 'didatico'],
    arquetipos: ['sabio'],
    display: 'Poppins, sans-serif',
    body: 'Inter, sans-serif',
    cores: ['#0a0e16', '#131a26', '#f2f6fc', '#aab6c8', '#2f6bff', '#ffffff', '#7fa8ff'],
    escura: true,
    cta: { label: 'Testar grátis', href: '#comecar' },
  },
  {
    nome: 'Focinho',
    segmento: 'pet shop',
    palavras: ['pet', 'petshop', 'animal', 'animais', 'veterinaria', 'tosa'],
    cena: 'pet',
    tons: ['acolhedor', 'descontraido'],
    arquetipos: ['cuidador'],
    display: 'Poppins, sans-serif',
    body: 'Inter, sans-serif',
    cores: ['#fdf8f1', '#ffffff', '#31261c', '#5c4c3d', '#e07a3f', '#ffffff', '#7fb069'],
    escura: false,
    cta: { label: 'Agendar banho', href: '#agenda' },
  },
  {
    nome: 'Navalha',
    segmento: 'barbearia e beleza',
    palavras: ['barbearia', 'salao', 'beleza', 'estetica', 'cabelo', 'barba'],
    cena: 'beleza',
    tons: ['sofisticado', 'direto'],
    arquetipos: ['criador'],
    display: 'Montserrat, sans-serif',
    body: 'Inter, sans-serif',
    cores: ['#14110e', '#1f1a15', '#f3ede4', '#c0b5a6', '#b8863b', '#141110', '#e3c68a'],
    escura: true,
    cta: { label: 'Marcar horário', href: '#agenda' },
  },
];

const svgLogo = (
  r: Receita,
  variante: 'principal' | 'horizontal' | 'simbolo' | 'clara' | 'escura' | 'favicon',
): string => {
  const inicial = r.nome[0] ?? 'A';
  const [, , , , primary, primaryFg] = r.cores;
  // Clara/escura: a marca sobre fundo escuro/claro — traço sólido, sem fundo.
  const traco = variante === 'clara' ? '#ffffff' : variante === 'escura' ? '#111111' : primary;
  const marca = `<rect x="4" y="4" width="56" height="56" rx="14" fill="${variante === 'clara' || variante === 'escura' ? 'none' : primary}" stroke="${traco}" stroke-width="${variante === 'clara' || variante === 'escura' ? 4 : 0}"/><text x="32" y="43" text-anchor="middle" font-family="${r.display}" font-size="34" font-weight="700" fill="${variante === 'clara' || variante === 'escura' ? traco : primaryFg}">${inicial}</text>`;
  if (
    variante === 'simbolo' ||
    variante === 'favicon' ||
    variante === 'clara' ||
    variante === 'escura'
  ) {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64">${marca}</svg>`;
  }
  if (variante === 'horizontal') {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 64" width="320" height="64">${marca}<text x="76" y="42" font-family="${r.display}" font-size="26" font-weight="600" fill="${traco}">${r.nome}</text></svg>`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 120" width="200" height="120"><g transform="translate(68,0)">${marca}</g><text x="100" y="98" text-anchor="middle" font-family="${r.display}" font-size="20" font-weight="600" fill="${traco}">${r.nome}</text></svg>`;
};

/**
 * O que cada cena desenha, num plano de 100×100 (o chamador posiciona e
 * escala). Silhuetas simples de propósito: o objetivo é a mídia DIZER o que o
 * nicho vende — camiseta numa marca de roupa, xícara numa cafeteria — sem
 * fingir fotografia. `indice` gira as variantes (a vitrine ganha produtos
 * diferentes, não a mesma imagem quatro vezes).
 */
const desenhoDaCena = (cena: Cena, indice: number, primary: string, accent: string): string => {
  const variantes: Record<Cena, string[]> = {
    moda: [
      // camiseta
      `<path d="M30 16 L10 28 L17 44 L26 39 L26 88 H74 L74 39 L83 44 L90 28 L70 16 Q60 26 50 26 Q40 26 30 16 Z" fill="${primary}"/><path d="M40 16 Q50 24 60 16" fill="none" stroke="${accent}" stroke-width="3"/>`,
      // moletom com capuz
      `<path d="M30 22 L12 32 L18 48 L26 44 L26 88 H74 L74 44 L82 48 L88 32 L70 22 Q60 30 50 30 Q40 30 30 22 Z" fill="${primary}"/><path d="M34 24 Q50 4 66 24 Q58 18 50 18 Q42 18 34 24 Z" fill="${accent}"/><rect x="40" y="62" width="20" height="14" rx="3" fill="${accent}" opacity="0.7"/>`,
      // tênis
      `<path d="M8 66 Q10 50 28 48 Q44 46 54 36 Q58 32 62 36 Q70 46 86 50 Q94 52 92 62 L90 68 Q55 74 8 66 Z" fill="${primary}"/><path d="M8 70 Q55 78 92 70 L92 76 Q55 82 8 76 Z" fill="${accent}"/><path d="M34 48 L40 56 M44 44 L50 52 M54 40 L60 48" stroke="${accent}" stroke-width="3" fill="none"/>`,
      // boné
      `<path d="M28 54 A22 22 0 0 1 72 54 Z" fill="${primary}"/><path d="M50 32 V54" stroke="${accent}" stroke-width="2"/><ellipse cx="63" cy="56" rx="27" ry="6" fill="${accent}"/><rect x="46" y="28" width="8" height="6" rx="3" fill="${primary}"/>`,
    ],
    cafe: [
      `<rect x="24" y="38" width="44" height="36" rx="8" fill="${primary}"/><path d="M68 44 h8 a10 10 0 0 1 0 20 h-8" fill="none" stroke="${primary}" stroke-width="6"/><path d="M36 30 q4 -8 0 -14 M48 30 q4 -8 0 -14 M60 30 q4 -8 0 -14" stroke="${accent}" stroke-width="4" fill="none"/><ellipse cx="46" cy="82" rx="30" ry="4" fill="${accent}" opacity="0.6"/>`,
      `<circle cx="50" cy="54" r="26" fill="${primary}"/><circle cx="50" cy="54" r="18" fill="none" stroke="${accent}" stroke-width="4"/><path d="M42 50 q8 10 16 0" stroke="${accent}" stroke-width="4" fill="none"/>`,
    ],
    design: [
      `<rect x="20" y="20" width="36" height="36" rx="6" fill="${primary}"/><circle cx="62" cy="62" r="20" fill="${accent}" opacity="0.85"/><path d="M30 74 L44 60" stroke="${primary}" stroke-width="5"/>`,
      `<path d="M30 24 L30 70 L44 58 L54 76 L62 70 L52 54 L70 52 Z" fill="${primary}"/><circle cx="70" cy="30" r="10" fill="${accent}"/>`,
    ],
    surf: [
      `<ellipse cx="50" cy="50" rx="14" ry="40" transform="rotate(24 50 50)" fill="${primary}"/><path d="M42 30 Q52 50 46 72" stroke="${accent}" stroke-width="3" fill="none"/>`,
      `<path d="M6 70 Q22 52 38 66 Q30 70 28 78 Q50 60 70 72 Q62 76 62 84 Q80 70 94 78 L94 88 H6 Z" fill="${primary}"/><circle cx="74" cy="28" r="12" fill="${accent}"/>`,
    ],
    arquitetura: [
      `<rect x="16" y="38" width="18" height="46" fill="${primary}"/><rect x="40" y="22" width="22" height="62" fill="${primary}"/><rect x="68" y="48" width="16" height="36" fill="${primary}"/><path d="M44 30h4v4h-4zM54 30h4v4h-4zM44 42h4v4h-4zM54 42h4v4h-4zM44 54h4v4h-4zM54 54h4v4h-4z" fill="${accent}"/>`,
      `<path d="M14 84 L50 20 L86 84 Z" fill="none" stroke="${primary}" stroke-width="5"/><path d="M32 84 L50 52 L68 84" fill="none" stroke="${accent}" stroke-width="4"/>`,
    ],
    organicos: [
      `<path d="M50 84 Q20 60 30 32 Q58 28 66 48 Q72 68 50 84 Z" fill="${primary}"/><path d="M50 82 Q46 58 40 42" stroke="${accent}" stroke-width="3" fill="none"/>`,
      `<circle cx="42" cy="52" r="20" fill="${primary}"/><circle cx="64" cy="44" r="12" fill="${accent}"/><path d="M42 32 Q44 22 54 20" stroke="${primary}" stroke-width="4" fill="none"/>`,
    ],
    treino: [
      `<rect x="10" y="42" width="10" height="24" rx="3" fill="${primary}"/><rect x="22" y="36" width="8" height="36" rx="3" fill="${primary}"/><rect x="80" y="42" width="10" height="24" rx="3" fill="${primary}"/><rect x="70" y="36" width="8" height="36" rx="3" fill="${primary}"/><rect x="30" y="50" width="40" height="8" rx="4" fill="${accent}"/>`,
      `<path d="M50 78 C22 60 14 40 30 30 Q42 24 50 36 Q58 24 70 30 Q86 40 50 78 Z" fill="${primary}"/><path d="M30 52 h12 l6 -10 6 16 6 -8 h10" stroke="${accent}" stroke-width="4" fill="none"/>`,
    ],
    hotel: [
      `<rect x="14" y="30" width="8" height="44" rx="2" fill="${primary}"/><rect x="14" y="58" width="72" height="16" rx="4" fill="${primary}"/><rect x="24" y="46" width="20" height="12" rx="6" fill="${accent}"/><rect x="48" y="50" width="36" height="8" rx="4" fill="${accent}" opacity="0.8"/><path d="M14 80 h72" stroke="${primary}" stroke-width="4"/>`,
      `<path d="M50 18 L58 38 L80 38 L62 50 L70 72 L50 58 L30 72 L38 50 L20 38 L42 38 Z" fill="${accent}"/><path d="M20 84 h60" stroke="${primary}" stroke-width="5"/>`,
    ],
    restaurante: [
      `<circle cx="50" cy="52" r="26" fill="none" stroke="${primary}" stroke-width="5"/><circle cx="50" cy="52" r="14" fill="${accent}" opacity="0.85"/><path d="M14 30 v20 M10 30 v12 M18 30 v12 M14 58 v14" stroke="${primary}" stroke-width="4"/><path d="M86 30 q-6 14 0 24 v18" stroke="${primary}" stroke-width="4" fill="none"/>`,
      `<path d="M22 60 A28 28 0 0 1 78 60 Z" fill="${primary}"/><path d="M16 66 h68" stroke="${accent}" stroke-width="5"/><circle cx="50" cy="26" r="4" fill="${accent}"/>`,
    ],
    tecnologia: [
      `<rect x="16" y="24" width="68" height="48" rx="6" fill="none" stroke="${primary}" stroke-width="5"/><path d="M36 40 L28 48 L36 56 M64 40 L72 48 L64 56 M54 36 L46 60" stroke="${accent}" stroke-width="4" fill="none"/><path d="M40 82 h20" stroke="${primary}" stroke-width="5"/>`,
      `<circle cx="50" cy="50" r="26" fill="none" stroke="${primary}" stroke-width="5"/><circle cx="50" cy="50" r="6" fill="${accent}"/><path d="M50 24 v10 M50 66 v10 M24 50 h10 M66 50 h10" stroke="${accent}" stroke-width="4"/>`,
    ],
    pet: [
      `<ellipse cx="50" cy="62" rx="16" ry="12" fill="${primary}"/><circle cx="34" cy="44" r="7" fill="${primary}"/><circle cx="46" cy="36" r="7" fill="${primary}"/><circle cx="58" cy="36" r="7" fill="${primary}"/><circle cx="70" cy="44" r="7" fill="${primary}"/>`,
      `<circle cx="50" cy="50" r="22" fill="${primary}"/><path d="M32 36 L24 20 L40 28 Z M68 36 L76 20 L60 28 Z" fill="${primary}"/><circle cx="43" cy="47" r="3" fill="${accent}"/><circle cx="57" cy="47" r="3" fill="${accent}"/><path d="M44 60 q6 6 12 0" stroke="${accent}" stroke-width="3" fill="none"/>`,
    ],
    beleza: [
      `<circle cx="34" cy="66" r="8" fill="none" stroke="${primary}" stroke-width="4"/><circle cx="54" cy="72" r="8" fill="none" stroke="${primary}" stroke-width="4"/><path d="M38 60 L74 22 M50 66 L70 44" stroke="${primary}" stroke-width="5"/><circle cx="74" cy="22" r="3" fill="${accent}"/>`,
      `<rect x="44" y="20" width="12" height="52" rx="6" fill="${primary}"/><path d="M44 30 h-10 M44 40 h-10 M44 50 h-10 M56 30 h10 M56 40 h10 M56 50 h10" stroke="${accent}" stroke-width="3"/>`,
    ],
    generica: [
      `<circle cx="66" cy="36" r="26" fill="${accent}" opacity="0.5"/><circle cx="34" cy="66" r="18" fill="${primary}" opacity="0.7"/>`,
      `<rect x="26" y="26" width="48" height="48" rx="10" transform="rotate(12 50 50)" fill="${primary}" opacity="0.7"/><circle cx="50" cy="50" r="14" fill="${accent}" opacity="0.8"/>`,
    ],
  };
  const lista = variantes[cena];
  return lista[indice % lista.length] ?? '';
};

/** Retrato para prova social: busto neutro, sem fingir fotografia. */
const desenhoDeRetrato = (indice: number, primary: string, accent: string): string => {
  const tons = [primary, accent, primary];
  const tom = tons[indice % tons.length] ?? primary;
  return `<circle cx="50" cy="38" r="16" fill="${tom}"/><path d="M22 88 Q26 60 50 60 Q74 60 78 88 Z" fill="${tom}" opacity="0.85"/>`;
};

/**
 * Imagem de apoio: a CENA do nicho sobre o fundo da marca.
 *
 * O que mudou e por quê: a versão anterior desenhava gradiente + formas soltas
 * com a legenda "mídia de teste N" — qualquer mídia, igual para pousada e para
 * streetwear. O dono foi claro: a mídia automática tem de condizer com o que o
 * nicho VENDE. `data-cena` no raiz existe para teste e diagnóstico.
 */
/** A seção pede gente, não produto: prova social sai como retrato. */
const ehPapelDeRetrato = (dica: string): boolean =>
  /prova|testimonial|depoimento|rosto|cliente|avaliac/i.test(dica);

/**
 * O termo de busca de foto REAL para uma mídia (Pexels). Em inglês porque o
 * acervo responde muito melhor; a variação por índice evita quatro fotos
 * iguais na vitrine. Cena genérica busca pelo próprio nicho do dono — é a
 * melhor descrição disponível do que ele vende.
 */
const termoDeFoto = (r: Receita, cena: Cena, indice: number, retrato: boolean): string => {
  if (retrato) return 'portrait person smiling natural light';
  const termos: Record<Cena, string[]> = {
    moda: [
      'streetwear t-shirt product photo',
      'streetwear hoodie product',
      'sneakers product photo',
      'streetwear cap product',
    ],
    cafe: ['specialty coffee cup', 'coffee shop interior', 'barista pouring coffee'],
    design: ['design studio workspace', 'designer working', 'creative office'],
    surf: ['surfboard beach', 'surfer riding wave', 'surf school lesson'],
    arquitetura: ['modern architecture building', 'architectural interior', 'minimalist house'],
    organicos: ['organic vegetables basket', 'fresh farm produce', 'organic food'],
    treino: ['gym workout training', 'fitness athlete', 'running outdoors'],
    hotel: ['cozy hotel room', 'hotel pool resort', 'hotel breakfast'],
    restaurante: ['gourmet restaurant dish', 'chef plating food', 'restaurant interior'],
    tecnologia: ['laptop workspace code', 'software team office', 'modern technology'],
    pet: ['happy dog portrait', 'dog grooming', 'cat playing'],
    beleza: ['barber shop haircut', 'hair salon', 'barber tools'],
    generica: [r.segmento.trim().length > 0 ? r.segmento : 'product photography'],
  };
  const lista = termos[cena];
  return lista[indice % lista.length] ?? lista[0] ?? 'product photography';
};

const svgImagem = (
  r: Receita,
  indice: number,
  w: number,
  h: number,
  opcoes?: { cena?: Cena; papel?: string },
): string => {
  const [background, surface, heading, , primary, , accent] = r.cores;
  const cena = opcoes?.cena ?? 'generica';
  const retrato = ehPapelDeRetrato(opcoes?.papel ?? '');
  const lado = Math.min(w, h);
  const escala = ((retrato ? 0.9 : 0.62) * lado) / 100;
  const dx = (w - 100 * escala) / 2;
  const dy = (h - 100 * escala) / 2;
  const miolo = retrato
    ? desenhoDeRetrato(indice, primary, accent)
    : desenhoDaCena(cena, indice, primary, accent);
  const halo = `<circle cx="${w * 0.72}" cy="${h * 0.26}" r="${lado * 0.42}" fill="${primary}" opacity="0.10"/><circle cx="${w * 0.24}" cy="${h * 0.8}" r="${lado * 0.3}" fill="${accent}" opacity="0.08"/>`;
  const rotulo = r.segmento.trim().length > 0 ? `${r.nome} · ${r.segmento}` : r.nome;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" data-cena="${retrato ? 'retrato' : cena}"><rect width="${w}" height="${h}" fill="${background}"/><rect width="${w}" height="${h}" fill="${surface}" opacity="0.5"/>${halo}<g transform="translate(${dx} ${dy}) scale(${escala})">${miolo}</g><text x="${w * 0.04}" y="${h * 0.95}" font-family="${r.body}" font-size="${Math.max(12, h * 0.032)}" fill="${heading}" opacity="0.45">${rotulo}</text></svg>`;
};

/** Uma seção do projeto que ACEITA mídia, já com a conta feita pela rota. */
export type SecaoParaMidia = {
  id: string;
  nome: string;
  papel?: string;
  /** Quantas imagens a seção pede (contrato das peças + etapa de marketing). */
  quantas: number;
  /** O que enviar, na linguagem da etapa — vira o alt da mídia gerada. */
  oQue: string;
};

const capitalizar = (t: string): string =>
  t
    .trim()
    .split(/\s+/)
    .map((p) => (p.length > 2 ? p[0]?.toUpperCase() + p.slice(1) : p))
    .join(' ');

/** Minúsculas e sem acento: "Confeitaria" e "confeitaria" são o mesmo nicho. */
const normalizar = (t: string): string => t.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '');

/**
 * A receita que CASA com o nicho, ou null. O casamento é por `palavras` (cada
 * receita declara as suas, sem acento) e continua aceitando o segmento como
 * rede de segurança — mas nunca inventa: nicho desconhecido devolve null e o
 * chamador decide a degradação (cores sorteadas, cena genérica DECLARADA).
 */
const receitaCasada = (nicho: string): Receita | null => {
  const alvo = normalizar(nicho);
  const tokens = alvo.split(/\s+/).filter((t) => t.length > 3);
  return (
    RECEITAS.find(
      (r) =>
        r.palavras.some((p) => alvo.includes(p) || tokens.some((t) => p.includes(t))) ||
        normalizar(r.segmento)
          .split(/\s+/)
          .some((p) => p.length > 3 && alvo.includes(p)),
    ) ?? null
  );
};

/** Receita para um nicho: casa por palavra; sem casamento, sorteio estável. */
const receitaParaNicho = (nicho: string): Receita => {
  const casada = receitaCasada(nicho);
  if (casada !== null) return casada;
  const alvo = normalizar(nicho);
  let h = 0;
  for (const ch of alvo) h = (h * 31 + ch.charCodeAt(0)) % 997;
  const sorteada = RECEITAS[h % RECEITAS.length] as Receita;
  // O sorteio dá cores e fontes COERENTES entre si, mas a cena daquela receita
  // seria mentira (desenhar café para um nicho desconhecido): vira genérica.
  return { ...sorteada, cena: 'generica' };
};

/** A cena das mídias de um nicho — a de quem casou, ou a genérica, declarada. */
export const cenaParaNicho = (nicho: string | null | undefined): Cena => {
  if (nicho === null || nicho === undefined || nicho.trim() === '') return 'generica';
  return receitaCasada(nicho)?.cena ?? 'generica';
};

export type MarcaAutomatica = {
  brandName: string;
  /** O nicho que dirigiu a marca — persiste no branding (decide cena e copy). */
  nicho: string | null;
  tone: string;
  primary: string;
  background: string;
  foreground: string;
  accent: string;
  fontDisplay: string;
  fontBody: string;
  logoPath: string | null;
  contact: { email: string; phone: string; whatsapp: string; address: string };
  social: Record<string, string>;
  mainCta: { label: string; href: string };
  identidadeVerbal: IdentidadeVerbal;
  logos: LogoVariante[];
  logosLocais: Partial<Record<LocalDeLogo, string>>;
  paleta: PaletaDoProjeto;
  tipografia: TipografiaDoProjeto;
  sociais: RedeSocial[];
};

/**
 * Gera SÓ as imagens das seções, a partir da marca que o projeto JÁ TEM.
 *
 * Existe porque a ordem do wizard é Marca antes de Estrutura: na hora em que a
 * marca automática roda, as seções ainda não existem, e mídia por seção só faz
 * sentido depois que a estrutura nasce. Este caminho lê a identidade salva
 * (nome, paleta, fontes — vinda da marca automática OU preenchida à mão) e
 * veste as seções que aceitam mídia, ancorando cada imagem em `secaoId`.
 */
/**
 * Uma mídia de seção: foto REAL quando há chave da Pexels (mídia de produto
 * tem de parecer produto — exigência do dono), desenho de cena quando não há
 * chave, rede ou resultado. A degradação é silenciosa de propósito: a marca
 * automática nunca falha por causa de foto.
 */
const midiaDaSecao = async (
  receita: Receita,
  cena: Cena,
  indice: number,
  dica: string,
  hero: boolean,
): Promise<{ conteudo: string | Buffer; ext: 'svg' | 'jpg'; mime: string; credito?: string }> => {
  const retrato = ehPapelDeRetrato(dica);
  const foto = (await buscarFotos(termoDeFoto(receita, cena, indice, retrato), 1, { retrato }))[0];
  if (foto !== undefined) {
    return { conteudo: foto.bytes, ext: foto.ext, mime: foto.mime, credito: foto.credito };
  }
  return {
    conteudo: svgImagem(receita, indice, hero ? 1600 : 1200, 900, { cena, papel: dica }),
    ext: 'svg',
    mime: 'image/svg+xml',
  };
};

export const criarMidiasDasSecoes = async (
  projectId: `prj_${string}`,
  visual: { nome: string; display: string; body: string; cores: Receita['cores'] },
  secoes: readonly SecaoParaMidia[],
  nicho?: string | null,
): Promise<MediaItem[]> => {
  const cena = cenaParaNicho(nicho);
  const receita: Receita = {
    nome: visual.nome,
    segmento: nicho?.trim() ?? '',
    palavras: [],
    cena,
    tons: [],
    arquetipos: [],
    display: visual.display,
    body: visual.body,
    cores: visual.cores,
    escura: false,
    cta: { label: '', href: '' },
  };
  const dir = projectMediaDir(projectId);
  mkdirSync(dir, { recursive: true });
  const prefixo = `${Date.now().toString(36)}-${randomBytes(2).toString('hex')}`;
  const media: MediaItem[] = [];
  let indice = 0;
  for (const secao of secoes.filter((s) => s.quantas > 0)) {
    const quantas = Math.min(secao.quantas, 8);
    const hero = /hero|abertura/i.test(secao.papel ?? secao.nome);
    const slugSecao = secao.nome
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .slice(0, 30);
    for (let i = 0; i < quantas; i++) {
      const dica = `${secao.papel ?? ''} ${secao.nome} ${secao.oQue}`;
      const m = await midiaDaSecao(receita, cena, indice++, dica, hero);
      const stored = `${prefixo}-secao-${slugSecao}-${i + 1}.${m.ext}`;
      if (typeof m.conteudo === 'string') writeFileSync(join(dir, stored), m.conteudo, 'utf8');
      else writeFileSync(join(dir, stored), m.conteudo);
      const credito = m.credito !== undefined ? ` (foto: ${m.credito})` : '';
      media.push({
        path: stored,
        mimeType: m.mime,
        kind: 'image',
        originalName: `secao-${slugSecao}-${i + 1}.${m.ext}`,
        alt: `Imagem ${i + 1} para a seção "${secao.nome}": ${secao.oQue}${credito}`.slice(0, 180),
        secaoId: secao.id,
      });
    }
  }
  return media;
};

/** Gera a marca, grava as mídias no projeto e devolve o patch pronto da tela. */
export const criarMarcaAutomatica = async (
  projectId: `prj_${string}`,
  opts?: {
    /** Nicho do produto (opcional): dirige receita, nome, logo e mídias. */
    nicho?: string | null;
    /** Nome da marca (opcional): vence receita e nicho; dele saem a inicial
     * do logo e a marca d'água das imagens. */
    nomeDaMarca?: string | null;
    /** Seções que aceitam mídia, já contadas pela rota. Vazio = pacote genérico. */
    secoes?: readonly SecaoParaMidia[];
  },
): Promise<{ branding: MarcaAutomatica; media: MediaItem[] }> => {
  const nicho = opts?.nicho?.trim() || null;
  const base =
    nicho !== null
      ? receitaParaNicho(nicho)
      : (RECEITAS[Math.floor(Math.random() * RECEITAS.length)] as Receita);
  // Nicho que não casa com receita nenhuma vira o NOME da marca: é dele que
  // saem a inicial do logo e a marca d'água das mídias.
  const casouComReceita = nicho !== null && receitaCasada(nicho) !== null;
  const nomeEscolhido = opts?.nomeDaMarca?.trim() || null;
  const receita: Receita = {
    ...base,
    segmento: nicho ?? base.segmento,
    nome: nomeEscolhido ?? (nicho !== null && !casouComReceita ? capitalizar(nicho) : base.nome),
  };
  const [background, surface, heading, body, primary, primaryFg, accent] = receita.cores;

  const dir = projectMediaDir(projectId);
  mkdirSync(dir, { recursive: true });
  const prefixo = `${Date.now().toString(36)}-${randomBytes(2).toString('hex')}`;
  const media: MediaItem[] = [];
  const gravar = (
    nome: string,
    conteudo: string | Buffer,
    kind: MediaItem['kind'],
    alt: string,
    secaoId?: string,
    formato: { ext: 'svg' | 'jpg'; mime: string } = { ext: 'svg', mime: 'image/svg+xml' },
  ): string => {
    const stored = `${prefixo}-${nome}.${formato.ext}`;
    if (typeof conteudo === 'string') writeFileSync(join(dir, stored), conteudo, 'utf8');
    else writeFileSync(join(dir, stored), conteudo);
    media.push({
      path: stored,
      mimeType: formato.mime,
      kind,
      originalName: `${nome}.${formato.ext}`,
      alt,
      ...(secaoId !== undefined ? { secaoId } : {}),
    });
    return stored;
  };

  const tiposDeLogo = ['principal', 'horizontal', 'simbolo', 'clara', 'escura', 'favicon'] as const;
  const logos: LogoVariante[] = tiposDeLogo.map((tipo) => ({
    tipo,
    path: gravar(`logo-${tipo}`, svgLogo(receita, tipo), 'logo', `Logo ${tipo} de ${receita.nome}`),
    transparente: tipo === 'clara' || tipo === 'escura',
  }));

  // ── Mídias POR SEÇÃO, quando o projeto tem estrutura ─────────────────────
  // A conta vem da rota (contrato das peças + etapa de marketing): seção que
  // não aceita mídia não ganha nada — zero é resposta, não omissão. Cada
  // imagem nasce ANCORADA na seção (`secaoId`), como um upload manual.
  const secoes = (opts?.secoes ?? []).filter((s) => s.quantas > 0);
  if (secoes.length > 0) {
    let indice = 0;
    for (const secao of secoes) {
      const quantas = Math.min(secao.quantas, 8);
      for (let i = 0; i < quantas; i++) {
        const hero = /hero|abertura/i.test(secao.papel ?? secao.nome);
        const slugSecao = secao.nome
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .slice(0, 30);
        const dica = `${secao.papel ?? ''} ${secao.nome} ${secao.oQue}`;
        const m = await midiaDaSecao(receita, receita.cena, indice++, dica, hero);
        const credito = m.credito !== undefined ? ` (foto: ${m.credito})` : '';
        gravar(
          `secao-${slugSecao}-${i + 1}`,
          m.conteudo,
          'image',
          `Imagem ${i + 1} para a seção "${secao.nome}": ${secao.oQue}${credito}`.slice(0, 180),
          secao.id,
          { ext: m.ext, mime: m.mime },
        );
      }
    }
  } else {
    // Sem estrutura ainda: pacote genérico, útil do mesmo jeito para testes —
    // mas já na cena do nicho, porque a cena não depende da estrutura.
    const opcoes = { cena: receita.cena };
    gravar(
      'imagem-hero',
      svgImagem(receita, 0, 1600, 900, opcoes),
      'image',
      `Imagem de abertura de ${receita.nome}`,
    );
    gravar(
      'imagem-galeria-1',
      svgImagem(receita, 1, 1200, 1500, opcoes),
      'image',
      'Imagem de galeria 1',
    );
    gravar(
      'imagem-galeria-2',
      svgImagem(receita, 2, 1200, 1500, opcoes),
      'image',
      'Imagem de galeria 2',
    );
    gravar(
      'imagem-galeria-3',
      svgImagem(receita, 3, 1200, 1500, opcoes),
      'image',
      'Imagem de galeria 3',
    );
    gravar('imagem-faixa', svgImagem(receita, 2, 1920, 640, opcoes), 'image', 'Faixa decorativa');
  }

  const distribuicao = distribuirLogos(logos);
  const logosLocais: Partial<Record<LocalDeLogo, string>> = {};
  for (const [local, variante] of Object.entries(distribuicao)) {
    if (variante !== undefined) logosLocais[local as LocalDeLogo] = variante.path;
  }

  const slug = receita.nome.toLowerCase().replace(/[^a-z0-9]+/g, '');
  const paleta: PaletaDoProjeto = {
    cores: [
      { id: 'fundo', nome: 'Fundo', hex: background },
      { id: 'superficie', nome: 'Superfície', hex: surface },
      { id: 'titulo', nome: 'Título', hex: heading },
      { id: 'texto', nome: 'Texto', hex: body },
      { id: 'principal', nome: 'Principal', hex: primary },
      { id: 'sobre-principal', nome: 'Sobre o principal', hex: primaryFg },
      { id: 'destaque', nome: 'Destaque', hex: accent },
    ],
    atribuicoes: {
      background: 'fundo',
      surface: 'superficie',
      heading: 'titulo',
      body: 'texto',
      primary: 'principal',
      'primary-foreground': 'sobre-principal',
      accent: 'destaque',
      link: 'principal',
      focus: 'destaque',
      border: 'superficie',
    },
  };

  return {
    branding: {
      brandName: receita.nome,
      nicho,
      tone: receita.tons.join(', '),
      primary,
      background,
      foreground: heading,
      accent,
      fontDisplay: receita.display,
      fontBody: receita.body,
      logoPath: logos[0]?.path ?? null,
      contact: {
        email: `contato@${slug}.com.br`,
        phone: '(11) 4002-8922',
        whatsapp: '5511940028922',
        address: `Rua Exemplo, 123 — São Paulo, SP (${receita.segmento})`,
      },
      social: { instagram: `https://instagram.com/${slug}` },
      mainCta: receita.cta,
      identidadeVerbal: {
        tons: receita.tons,
        arquetipos: receita.arquetipos,
        vocabularioPreferido: [],
        vocabularioEvitar: [],
        observacao: `Marca de teste gerada automaticamente (${receita.segmento}).`,
      },
      logos,
      logosLocais,
      paleta,
      tipografia: {
        display: receita.display,
        body: receita.body,
        presetTitulos: receita.escura ? 'impactante' : 'equilibrada',
        presetCorpo: 'confortavel',
      },
      sociais: [
        {
          plataforma: 'instagram',
          url: `https://instagram.com/${slug}`,
          usuario: slug,
          ordem: 0,
          visivel: true,
        },
      ],
    },
    media,
  };
};
