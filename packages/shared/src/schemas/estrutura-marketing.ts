import { newSectionId } from '../ids.js';
// A seta aponta num sentido só: este módulo conhece `layout.ts`, e `layout.ts`
// não conhece este. A primeira versão tinha os dois se importando — `layout.ts`
// precisava de `sequenciaDe` para o `sugerirSecoes` que morava lá, e este
// precisava de `SectionRole`. O carregamento quebrava com "Cannot access
// 'ObjetivoDoSite' before initialization", que é o sintoma clássico. A correção
// foi mudar `sugerirSecoes` de casa: ela virou uma função de marketing no dia em
// que passou a nascer de uma sequência, e é aqui que ela pertence.
import {
  type ComponenteDoKitResumo,
  type ObjetivoDoSite,
  ROLE_CATEGORIES,
  ROTULO_DE_PAPEL,
  type SecaoDoSite,
  type SectionRole,
  papelParaCategoria,
} from './layout.js';

/**
 * A estrutura sugerida nasce do OBJETIVO do site, não de uma espinha técnica.
 *
 * Até aqui a sugestão inicial era `nav, hero, logos, features, contact, footer`:
 * uma lista de papéis, na ordem em que costumam aparecer. Ela não estava errada,
 * estava vazia de intenção. Uma página que capta contato e uma que vende um
 * produto têm sequências diferentes, e a diferença não é de gosto — é de o que
 * precisa ser respondido, e em que ordem, para a pessoa do outro lado avançar.
 *
 * O que este arquivo traz é essa ordem, por objetivo, como DADO CURADO. Cada
 * etapa diz três coisas:
 *
 * - **o papel**, para casar peça do kit (`ROLE_CATEGORIES`) e sustentar o
 *   `data-secao` do site gerado;
 * - **o que ela faz**, em uma frase, para a tela explicar em vez de rotular;
 * - **que imagem ela costuma pedir**, e por quê — a parte que o app não sabia
 *   dizer e que fazia a etapa de mídia virar adivinhação.
 *
 * Por que dado e não chamada de modelo: no modo `queue` o app não chama API
 * nenhuma, e mesmo no modo `api` uma sugestão de estrutura precisa ser
 * determinística. Mesmo kit e mesmo objetivo devem propor a mesma página, ou a
 * pessoa não consegue confiar no que vê.
 *
 * E é ponto de partida, nunca molde: a estrutura sugerida continua inteiramente
 * editável. Ela existe para a tela não abrir em branco.
 */

/** Como cada objetivo se chama e o que ele quer dizer, para a tela. */
export const OBJETIVOS: Record<ObjetivoDoSite, { rotulo: string; explica: string }> = {
  'captar-contato': {
    rotulo: 'Captar contato',
    explica: 'A pessoa chega, entende a proposta e deixa o contato. É o caminho mais geral.',
  },
  'vender-produto': {
    rotulo: 'Vender um produto',
    explica: 'Tem preço, tem compra. A página precisa vencer as objeções antes do botão.',
  },
  'apresentar-servico': {
    rotulo: 'Apresentar um serviço',
    explica: 'O que você faz, para quem, e como funciona o trabalho. Fecha em conversa.',
  },
  'mostrar-trabalho': {
    rotulo: 'Mostrar trabalho',
    explica: 'Portfólio: o trabalho fala primeiro, o texto vem depois.',
  },
};

/** Uma etapa da página, no vocabulário de marketing. */
export type EtapaDeMarketing = {
  /** Papel semântico — casa peça do kit e vira o `data-secao`. */
  papel: SectionRole;
  /** Nome sugerido da seção. Pode divergir do rótulo genérico do papel. */
  nome?: string;
  /** O que esta seção faz na página, em uma frase. */
  faz: string;
  /**
   * A imagem que esta etapa costuma pedir, e por quê.
   *
   * `quantas` é uma expectativa, não uma cota: o app soma isto com os espaços
   * REAIS das peças escolhidas (o contrato do kit) para chegar ao número que
   * mostra. Ausente significa que a etapa não pede imagem por natureza — o que
   * é uma resposta, não uma omissão.
   */
  midia?: { quantas: number; oQue: string; porque: string };
};

/**
 * As quatro sequências.
 *
 * Cada uma é uma ordem de argumentação, não uma lista de componentes. Lendo de
 * cima para baixo dá para ver o raciocínio: promessa → problema → como funciona
 * → prova → objeção → chamada. Tirar uma etapa do meio é uma decisão legítima,
 * e por isso tudo isso é editável — mas a ordem padrão tem um porquê.
 */
export const SEQUENCIAS: Record<ObjetivoDoSite, EtapaDeMarketing[]> = {
  'captar-contato': [
    { papel: 'nav', faz: 'leva a pessoa direto ao que ela veio procurar' },
    {
      papel: 'hero',
      nome: 'Abertura com a promessa',
      faz: 'diz em uma frase o que você resolve e para quem',
      midia: {
        quantas: 1,
        oQue: 'uma imagem forte do produto, do serviço ou de quem usa',
        porque: 'a abertura é a única seção que quase todo mundo vê; sem imagem ela vira só texto',
      },
    },
    {
      papel: 'features',
      nome: 'O problema',
      faz: 'nomeia a dor que a pessoa já sente, antes de oferecer a solução',
    },
    {
      papel: 'showcase',
      nome: 'Como funciona',
      faz: 'mostra o caminho em poucos passos, para tirar o medo do desconhecido',
      midia: {
        quantas: 3,
        oQue: 'uma imagem por passo',
        porque: 'passo explicado só com texto obriga a pessoa a imaginar; com imagem ela vê',
      },
    },
    {
      papel: 'logos',
      nome: 'Prova social',
      faz: 'mostra que outras pessoas já confiaram antes dela',
      midia: {
        quantas: 4,
        oQue: 'logos de clientes ou parceiros',
        porque: 'prova social vive de marca reconhecível; nome escrito não tem o mesmo peso',
      },
    },
    {
      papel: 'faq',
      nome: 'Objeções',
      faz: 'responde o que trava a decisão, no lugar onde ela trava',
    },
    { papel: 'contact', nome: 'Deixe seu contato', faz: 'o pedido, sem rodeio e sem competição' },
    { papel: 'footer', faz: 'fecha a página e guarda o que é obrigatório' },
  ],

  'vender-produto': [
    { papel: 'nav', faz: 'leva a pessoa direto ao que ela veio procurar' },
    {
      papel: 'hero',
      nome: 'Abertura com a oferta',
      faz: 'diz o que é, para quem, e por que vale',
      midia: {
        quantas: 1,
        oQue: 'a foto principal do produto',
        porque: 'ninguém compra o que não viu',
      },
    },
    {
      papel: 'features',
      nome: 'O que é',
      faz: 'descreve o produto pelo que ele faz, não pelo que ele tem',
    },
    {
      papel: 'showcase',
      nome: 'Benefícios',
      faz: 'traduz cada característica no que ela muda no dia da pessoa',
      midia: {
        quantas: 3,
        oQue: 'o produto em uso, em situações diferentes',
        porque: 'benefício se mostra em contexto; foto de catálogo mostra só o objeto',
      },
    },
    {
      papel: 'catalog',
      nome: 'Vitrine',
      faz: 'apresenta os produtos com preço, para a escolha ser possível',
      midia: {
        quantas: 4,
        oQue: 'uma foto por produto',
        porque: 'item de vitrine sem foto quase nunca é clicado',
      },
    },
    {
      papel: 'testimonials',
      nome: 'Prova',
      faz: 'quem já comprou fala, e vale mais do que você falando',
      midia: {
        quantas: 3,
        oQue: 'rosto de quem depôs',
        porque: 'depoimento com rosto é lido como pessoa; sem rosto, como texto de marketing',
      },
    },
    {
      papel: 'faq',
      nome: 'Garantia e objeções',
      faz: 'prazo, troca, devolução, o que costuma travar a compra',
    },
    { papel: 'cta', nome: 'Comprar', faz: 'a ação, sozinha na tela, sem distração ao redor' },
    { papel: 'footer', faz: 'fecha a página e guarda o que é obrigatório' },
  ],

  'apresentar-servico': [
    { papel: 'nav', faz: 'leva a pessoa direto ao que ela veio procurar' },
    {
      papel: 'hero',
      nome: 'Abertura',
      faz: 'diz o que você faz, em uma frase que a pessoa repetiria',
      midia: {
        quantas: 1,
        oQue: 'uma imagem do trabalho acontecendo, ou de quem o recebe',
        porque: 'serviço é abstrato; a imagem dá a ele um lugar e um rosto',
      },
    },
    {
      papel: 'features',
      nome: 'Para quem é',
      faz: 'deixa claro quem se beneficia — e, por consequência, quem não',
    },
    {
      papel: 'showcase',
      nome: 'O método',
      faz: 'mostra como o trabalho corre, do primeiro contato à entrega',
      midia: {
        quantas: 3,
        oQue: 'uma imagem por etapa do método',
        porque: 'método é o que mais gera dúvida; ver as etapas reduz a insegurança',
      },
    },
    {
      papel: 'stats',
      nome: 'Resultados',
      faz: 'números do que já foi entregue, quando existirem',
    },
    {
      papel: 'about',
      nome: 'Quem faz',
      faz: 'quem está por trás — em serviço, a confiança é na pessoa',
      midia: {
        quantas: 1,
        oQue: 'uma foto sua ou da equipe',
        porque: 'contratar serviço é contratar gente; a foto é o que torna isso concreto',
      },
    },
    { papel: 'contact', nome: 'Vamos conversar', faz: 'o convite para a conversa' },
    { papel: 'footer', faz: 'fecha a página e guarda o que é obrigatório' },
  ],

  'mostrar-trabalho': [
    { papel: 'nav', faz: 'leva a pessoa direto ao que ela veio procurar' },
    {
      papel: 'hero',
      nome: 'Abertura',
      faz: 'seu nome e o que você faz, curto — aqui o trabalho fala primeiro',
      midia: {
        quantas: 1,
        oQue: 'o trabalho de que você mais se orgulha',
        porque: 'num portfólio, a abertura já é uma peça do portfólio',
      },
    },
    {
      papel: 'gallery',
      nome: 'Seleção de trabalhos',
      faz: 'os trabalhos escolhidos, poucos e bem apresentados',
      midia: {
        quantas: 6,
        oQue: 'uma imagem por trabalho',
        porque: 'é a seção inteira: sem imagem, não existe',
      },
    },
    {
      papel: 'showcase',
      nome: 'O processo',
      faz: 'como você chega no resultado — é o que separa você de quem só entrega',
      midia: {
        quantas: 3,
        oQue: 'bastidor, rascunho, versões intermediárias',
        porque: 'processo mostrado com imagem prova autoria; descrito com texto, não',
      },
    },
    {
      papel: 'testimonials',
      nome: 'Depoimentos',
      faz: 'quem contratou conta como foi trabalhar com você',
    },
    { papel: 'contact', nome: 'Contato', faz: 'o caminho para o próximo trabalho' },
    { papel: 'footer', faz: 'fecha a página e guarda o que é obrigatório' },
  ],
};

/** O objetivo padrão: o mais geral dos quatro. */
export const OBJETIVO_PADRAO: ObjetivoDoSite = 'captar-contato';

/** A sequência de um objetivo. Sem objetivo, a mais geral. */
export const sequenciaDe = (objetivo: ObjetivoDoSite | null | undefined): EtapaDeMarketing[] =>
  SEQUENCIAS[objetivo ?? OBJETIVO_PADRAO] ?? SEQUENCIAS[OBJETIVO_PADRAO];

/** O nome sugerido de uma etapa: o próprio, ou o rótulo genérico do papel. */
export const nomeDaEtapa = (etapa: EtapaDeMarketing): string =>
  etapa.nome ?? ROTULO_DE_PAPEL[etapa.papel];

/**
 * O que a estrutura de marketing sabe sobre uma seção, por papel.
 *
 * A tela de Estrutura precisa explicar seções que o usuário criou, moveu ou
 * renomeou — e nesse ponto a sequência já não vale como lista. O papel continua
 * valendo: uma seção de `testimonials` faz o que prova social faz, tenha ela o
 * nome que tiver e esteja onde estiver.
 *
 * Procura no objetivo escolhido primeiro; se o papel não estiver nele, procura
 * nos outros. Uma seção de preço numa página de portfólio é incomum, não é
 * inexplicável.
 */
export const explicarPapel = (
  papel: SectionRole,
  objetivo?: ObjetivoDoSite | null,
): EtapaDeMarketing | undefined => {
  const preferida = sequenciaDe(objetivo).find((e) => e.papel === papel);
  if (preferida !== undefined) return preferida;
  for (const chave of Object.keys(SEQUENCIAS) as ObjetivoDoSite[]) {
    const achada = SEQUENCIAS[chave].find((e) => e.papel === papel);
    if (achada !== undefined) return achada;
  }
  return AVULSOS[papel];
};

/**
 * Papéis que nenhuma sequência usa, mas que aparecem na página assim mesmo.
 *
 * Eles nascem de dois caminhos legítimos: a pessoa cria a seção à mão, ou o kit
 * traz uma peça daquele tipo e a sugestão dá destino a ela. Em qualquer um dos
 * dois, a tela precisa saber explicar o que aquela seção faz — e não saber
 * significa mostrar uma seção muda no meio de uma página que explica todas as
 * outras. A ausência era um buraco descoberto por teste, não uma decisão.
 *
 * Eles ficam FORA das sequências de propósito: são seções que dependem do caso.
 * Uma tabela de planos não cabe em toda página que vende, e uma seção de equipe
 * só faz sentido quando a equipe é argumento.
 */
const AVULSOS: Partial<Record<SectionRole, EtapaDeMarketing>> = {
  pricing: {
    papel: 'pricing',
    nome: 'Planos',
    faz: 'põe os planos lado a lado, para a escolha ser por comparação e não por dúvida',
  },
  team: {
    papel: 'team',
    nome: 'Equipe',
    faz: 'mostra quem faz o trabalho, quando as pessoas são parte do que se compra',
    midia: {
      quantas: 3,
      oQue: 'uma foto por pessoa',
      porque: 'seção de equipe sem rosto não cumpre o que promete',
    },
  },
  stats: {
    papel: 'stats',
    nome: 'Números',
    faz: 'traz o que já foi feito em número, quando houver número real para mostrar',
  },
  about: {
    papel: 'about',
    nome: 'Sobre',
    faz: 'conta de onde você vem e por que faz isso',
  },
  gallery: {
    papel: 'gallery',
    nome: 'Galeria',
    faz: 'mostra o trabalho em imagem, sem texto no caminho',
    midia: {
      quantas: 6,
      oQue: 'as imagens da galeria',
      porque: 'é a seção inteira: sem imagem, não existe',
    },
  },
  catalog: {
    papel: 'catalog',
    nome: 'Catálogo',
    faz: 'lista os produtos para a pessoa escolher',
    midia: {
      quantas: 4,
      oQue: 'uma foto por produto',
      porque: 'item de catálogo sem foto quase nunca é clicado',
    },
  },
  cta: {
    papel: 'cta',
    nome: 'Chamada para ação',
    faz: 'o pedido, isolado, sem nada competindo por atenção ao lado',
  },
  testimonials: {
    papel: 'testimonials',
    nome: 'Depoimentos',
    faz: 'quem já contratou fala — vale mais do que você falando',
  },
  showcase: {
    papel: 'showcase',
    nome: 'Demonstração',
    faz: 'mostra o que foi dito acontecendo, em vez de só descrever',
  },
  logos: {
    papel: 'logos',
    nome: 'Prova social',
    faz: 'mostra quem já confiou antes',
    midia: {
      quantas: 4,
      oQue: 'logos de clientes ou parceiros',
      porque: 'prova social vive de marca reconhecível',
    },
  },
};

// ── A estrutura sugerida ────────────────────────────────────────────────────

/**
 * Propõe a estrutura inicial a partir do kit e do OBJETIVO do site.
 *
 * A espinha que existia aqui (`nav, hero, logos, features, contact, footer`) era
 * uma lista de papéis na ordem em que costumam aparecer. Não estava errada,
 * estava vazia de intenção: uma página que capta contato e uma que vende um
 * produto precisam responder coisas diferentes, em ordens diferentes. Agora a
 * sequência vem de `estrutura-marketing.ts`, por objetivo, e cada seção nasce
 * sabendo o que faz na página.
 *
 * Duas passadas, como antes. Primeiro a sequência: cada etapa vira uma seção e
 * recebe a primeira peça compatível ainda não usada — espalhar o kit pela página
 * rende mais que empilhar tudo numa seção só. Depois o resto do kit: peça que
 * sobrou puxa a seção do papel dela; se essa seção já existe, a peça entra NELA.
 *
 * O rodapé continua sendo materializado junto com o resto da sequência, e não
 * depois das sobras, pelo mesmo motivo de sempre: se ele viesse por último, um
 * componente de formulário criaria uma seção "Contato" no laço de sobras e a
 * sequência criaria outra, vazia, logo abaixo.
 *
 * Determinística: mesmo kit e mesmo objetivo, mesma proposta. O `novoId` é
 * injetável para o teste não depender de ulid.
 */
export const sugerirSecoes = (
  componentes: readonly ComponenteDoKitResumo[],
  novoId: () => string = newSectionId,
  objetivo?: ObjetivoDoSite | null,
): SecaoDoSite[] => {
  const usados = new Set<string>();
  const sequencia = sequenciaDe(objetivo);

  const secaoDaEtapa = (etapa: EtapaDeMarketing): SecaoDoSite => {
    const cats = ROLE_CATEGORIES[etapa.papel];
    const peca = componentes.find((c) => cats.includes(c.category) && !usados.has(c.id));
    if (peca !== undefined) usados.add(peca.id);
    return {
      id: novoId(),
      nome: nomeDaEtapa(etapa),
      papel: etapa.papel,
      componentIds: peca !== undefined ? [peca.id] : [],
    };
  };

  const daSequencia = sequencia.map(secaoDaEtapa);
  // O fechamento fica no fim: as sobras entram ANTES dele, no meio da página,
  // que é onde uma seção extra faz sentido. Empurrá-las para depois do rodapé
  // seria pôr conteúdo abaixo do fim da página.
  const ultimo = daSequencia[daSequencia.length - 1];
  const fecha = ultimo !== undefined && ultimo.papel === 'footer';
  const corpo = fecha ? daSequencia.slice(0, -1) : daSequencia;
  const fechamento = fecha && ultimo !== undefined ? [ultimo] : [];
  const extras: SecaoDoSite[] = [];

  for (const c of componentes) {
    if (usados.has(c.id)) continue;
    usados.add(c.id);
    const papel = papelParaCategoria(c.category);
    if (papel === undefined) {
      // Categoria que nenhum papel reconhece. A peça não some por isso: vira uma
      // seção com o nome dela, sem papel, para o usuário renomear.
      extras.push({ id: novoId(), nome: c.name, componentIds: [c.id] });
      continue;
    }
    const jaExiste = [...corpo, ...fechamento, ...extras].find((s) => s.papel === papel);
    if (jaExiste !== undefined) jaExiste.componentIds.push(c.id);
    else extras.push({ id: novoId(), nome: ROTULO_DE_PAPEL[papel], papel, componentIds: [c.id] });
  }

  return [...corpo, ...extras, ...fechamento];
};
