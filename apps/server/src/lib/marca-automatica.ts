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

type Receita = {
  nome: string;
  segmento: string;
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
    tons: ['energico', 'direto'],
    arquetipos: ['heroi'],
    display: 'Montserrat, sans-serif',
    body: 'Inter, sans-serif',
    cores: ['#0d0d11', '#17171d', '#fafafa', '#b5b5bf', '#e6293d', '#ffffff', '#3de6c8'],
    escura: true,
    cta: { label: 'Começar agora', href: '#download' },
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

/** Imagem de apoio: gradiente da marca com formas — nítida em qualquer tela. */
const svgImagem = (r: Receita, indice: number, w: number, h: number): string => {
  const [background, surface, , , primary, , accent] = r.cores;
  const g1 = `<linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${primary}"/><stop offset="1" stop-color="${accent}"/></linearGradient>`;
  const formas = [
    `<circle cx="${w * 0.78}" cy="${h * 0.3}" r="${h * 0.45}" fill="${accent}" opacity="0.35"/><circle cx="${w * 0.2}" cy="${h * 0.85}" r="${h * 0.3}" fill="${surface}" opacity="0.18"/>`,
    `<rect x="${w * 0.55}" y="${h * 0.15}" width="${w * 0.5}" height="${h * 0.9}" rx="${h * 0.1}" transform="rotate(18 ${w * 0.8} ${h * 0.6})" fill="${background}" opacity="0.22"/>`,
    `<path d="M0 ${h * 0.7} Q ${w * 0.25} ${h * 0.5} ${w * 0.5} ${h * 0.7} T ${w} ${h * 0.7} V ${h} H 0 Z" fill="${background}" opacity="0.3"/>`,
    `<circle cx="${w * 0.5}" cy="${h * 0.5}" r="${h * 0.28}" fill="none" stroke="${surface}" stroke-width="${h * 0.02}" opacity="0.5"/>`,
  ];
  const forma = formas[indice % formas.length] ?? '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}"><defs>${g1}</defs><rect width="${w}" height="${h}" fill="url(#g)"/>${forma}<text x="${w / 2}" y="${h / 2}" text-anchor="middle" font-family="${r.body}" font-size="${h * 0.05}" fill="#ffffff" opacity="0.55">${r.nome} — mídia de teste ${indice + 1}</text></svg>`;
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

/** Receita para um nicho: casa por palavra; sem casamento, sorteio estável. */
const receitaParaNicho = (nicho: string): Receita => {
  const alvo = nicho.toLowerCase();
  const casada = RECEITAS.find(
    (r) =>
      r.segmento
        .toLowerCase()
        .split(/\s+/)
        .some((p) => p.length > 3 && alvo.includes(p)) ||
      alvo.split(/\s+/).some((p) => p.length > 3 && r.segmento.toLowerCase().includes(p)),
  );
  if (casada !== undefined) return casada;
  let h = 0;
  for (const ch of alvo) h = (h * 31 + ch.charCodeAt(0)) % 997;
  return RECEITAS[h % RECEITAS.length] as Receita;
};

export type MarcaAutomatica = {
  brandName: string;
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
export const criarMidiasDasSecoes = (
  projectId: `prj_${string}`,
  visual: { nome: string; display: string; body: string; cores: Receita['cores'] },
  secoes: readonly SecaoParaMidia[],
): MediaItem[] => {
  const receita: Receita = {
    nome: visual.nome,
    segmento: '',
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
      const stored = `${prefixo}-secao-${slugSecao}-${i + 1}.svg`;
      writeFileSync(
        join(dir, stored),
        svgImagem(receita, indice++, hero ? 1600 : 1200, 900),
        'utf8',
      );
      media.push({
        path: stored,
        mimeType: 'image/svg+xml',
        kind: 'image',
        originalName: `secao-${slugSecao}-${i + 1}.svg`,
        alt: `Imagem ${i + 1} para a seção "${secao.nome}": ${secao.oQue}`.slice(0, 180),
        secaoId: secao.id,
      });
    }
  }
  return media;
};

/** Gera a marca, grava as mídias no projeto e devolve o patch pronto da tela. */
export const criarMarcaAutomatica = (
  projectId: `prj_${string}`,
  opts?: {
    /** Nicho do produto (opcional): dirige receita, nome, logo e mídias. */
    nicho?: string | null;
    /** Seções que aceitam mídia, já contadas pela rota. Vazio = pacote genérico. */
    secoes?: readonly SecaoParaMidia[];
  },
): { branding: MarcaAutomatica; media: MediaItem[] } => {
  const nicho = opts?.nicho?.trim() || null;
  const base =
    nicho !== null
      ? receitaParaNicho(nicho)
      : (RECEITAS[Math.floor(Math.random() * RECEITAS.length)] as Receita);
  // Nicho que não casa com receita nenhuma vira o NOME da marca: é dele que
  // saem a inicial do logo e a marca d'água das mídias.
  const casouComReceita =
    nicho !== null &&
    base.segmento.toLowerCase().includes(nicho.toLowerCase().split(/\s+/)[0] ?? '');
  const receita: Receita =
    nicho === null
      ? base
      : {
          ...base,
          segmento: nicho,
          nome: casouComReceita ? base.nome : capitalizar(nicho),
        };
  const [background, surface, heading, body, primary, primaryFg, accent] = receita.cores;

  const dir = projectMediaDir(projectId);
  mkdirSync(dir, { recursive: true });
  const prefixo = `${Date.now().toString(36)}-${randomBytes(2).toString('hex')}`;
  const media: MediaItem[] = [];
  const gravar = (
    nome: string,
    svg: string,
    kind: MediaItem['kind'],
    alt: string,
    secaoId?: string,
  ): string => {
    const stored = `${prefixo}-${nome}.svg`;
    writeFileSync(join(dir, stored), svg, 'utf8');
    media.push({
      path: stored,
      mimeType: 'image/svg+xml',
      kind,
      originalName: `${nome}.svg`,
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
        gravar(
          `secao-${slugSecao}-${i + 1}`,
          svgImagem(receita, indice++, hero ? 1600 : 1200, hero ? 900 : 900),
          'image',
          `Imagem ${i + 1} para a seção "${secao.nome}": ${secao.oQue}`.slice(0, 180),
          secao.id,
        );
      }
    }
  } else {
    // Sem estrutura ainda: pacote genérico, útil do mesmo jeito para testes.
    gravar(
      'imagem-hero',
      svgImagem(receita, 0, 1600, 900),
      'image',
      `Imagem de abertura de ${receita.nome}`,
    );
    gravar('imagem-galeria-1', svgImagem(receita, 1, 1200, 1500), 'image', 'Imagem de galeria 1');
    gravar('imagem-galeria-2', svgImagem(receita, 2, 1200, 1500), 'image', 'Imagem de galeria 2');
    gravar('imagem-galeria-3', svgImagem(receita, 3, 1200, 1500), 'image', 'Imagem de galeria 3');
    gravar('imagem-faixa', svgImagem(receita, 2, 1920, 640), 'image', 'Faixa decorativa');
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
