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
  ROTULO_DE_PAPEL,
  type SecaoDoSite,
  type SectionRole,
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

/**
 * Em que momento da decisão esta seção age — o AIDA.
 *
 * Atenção, Interesse, Desejo, Ação é a espinha das quatro sequências, e não é
 * enfeite de vocabulário: é o que explica por que a ordem é aquela. Uma página
 * que pede a Ação antes de construir o Desejo não converte; uma que fica no
 * Interesse e nunca pede nada, também não. Ver o momento de cada seção ao lado
 * do nome é o que permite reordenar sem quebrar o argumento.
 */
export const ETAPAS_AIDA = ['atencao', 'interesse', 'desejo', 'acao'] as const;
export type EtapaAida = (typeof ETAPAS_AIDA)[number];

export const ROTULO_AIDA: Record<EtapaAida, string> = {
  atencao: 'Atenção',
  interesse: 'Interesse',
  desejo: 'Desejo',
  acao: 'Ação',
};

/** O que cada momento do AIDA está tentando fazer com quem lê. */
export const EXPLICA_AIDA: Record<EtapaAida, string> = {
  atencao: 'fazer a pessoa parar e entender onde ela chegou',
  interesse: 'dar motivo para continuar lendo em vez de fechar',
  desejo: 'fazer ela se ver com aquilo, e querer',
  acao: 'pedir o passo, num lugar onde ele é fácil de dar',
};

/** Uma etapa da página, no vocabulário de marketing. */
export type EtapaDeMarketing = {
  /** Papel semântico — casa peça do kit e vira o `data-secao`. */
  papel: SectionRole;
  /** Nome sugerido da seção. Pode divergir do rótulo genérico do papel. */
  nome?: string;
  /** O que esta seção faz na página, em uma frase. */
  faz: string;
  /** O momento da decisão em que ela age. */
  aida: EtapaAida;
  /**
   * Que TIPO de peça cai bem aqui — descrito sem olhar o kit de ninguém.
   *
   * É a diferença entre "a peça X do seu kit encaixa" e "aqui vai uma barra de
   * navegação". A primeira depende do que a pessoa curou e muda a cada kit; a
   * segunda é a orientação de que ela precisa ANTES de escolher, quando a seção
   * ainda está vazia e ela não sabe o que procurar.
   */
  sugestao: string;
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
    {
      papel: 'nav',
      faz: 'leva a pessoa direto ao que ela veio procurar',
      aida: 'atencao',
      sugestao: 'uma barra de navegação com o logo e poucos links, fixa no topo',
    },
    {
      papel: 'hero',
      nome: 'Abertura com a promessa',
      faz: 'diz em uma frase o que você resolve e para quem',
      aida: 'atencao',
      sugestao:
        'um bloco de abertura ocupando a tela: título grande, uma linha de apoio, um botão e uma imagem ao lado ou atrás',
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
      aida: 'interesse',
      sugestao:
        'três ou quatro cartões curtos, cada um nomeando uma dor; sem imagem, o texto é o argumento',
    },
    {
      papel: 'showcase',
      nome: 'Como funciona',
      faz: 'mostra o caminho em poucos passos, para tirar o medo do desconhecido',
      aida: 'interesse',
      sugestao: 'uma sequência numerada de passos, em linha ou empilhada, com uma imagem por passo',
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
      aida: 'desejo',
      sugestao: 'uma faixa horizontal de logos em cinza, todos do mesmo tamanho',
      midia: {
        quantas: 4,
        oQue: 'logos de clientes ou parceiros',
        porque: 'prova social vive de marca reconhecível; nome escrito não tem o mesmo peso',
      },
    },
    {
      papel: 'testimonials',
      nome: 'Quem já passou por isso',
      faz: 'uma pessoa parecida com ela conta que deu certo',
      aida: 'desejo',
      sugestao: 'dois ou três depoimentos curtos, com foto redonda, nome e a frase entre aspas',
      midia: {
        quantas: 3,
        oQue: 'rosto de quem depôs',
        porque: 'depoimento com rosto é lido como pessoa; sem rosto, como texto de marketing',
      },
    },
    {
      papel: 'stats',
      nome: 'Os números',
      faz: 'troca a promessa por medida: tempo, quantidade, resultado',
      aida: 'desejo',
      sugestao: 'três ou quatro números grandes com um rótulo curto embaixo de cada',
    },
    {
      papel: 'faq',
      nome: 'Objeções',
      faz: 'responde o que trava a decisão, no lugar onde ela trava',
      aida: 'desejo',
      sugestao: 'uma lista de perguntas que abrem ao clicar, uma embaixo da outra',
    },
    {
      papel: 'cta',
      nome: 'A chamada',
      faz: 'repete o convite depois de o argumento estar todo dado',
      aida: 'acao',
      sugestao: 'uma faixa larga com fundo de cor, uma frase e um botão só, sem mais nada em volta',
    },
    {
      papel: 'contact',
      nome: 'Deixe seu contato',
      faz: 'o pedido, sem rodeio e sem competição',
      aida: 'acao',
      sugestao: 'um formulário curto (nome, contato e mais nada) ou um botão único de WhatsApp',
    },
    {
      papel: 'footer',
      faz: 'fecha a página e guarda o que é obrigatório',
      aida: 'acao',
      sugestao: 'um rodapé com contato, redes e o obrigatório, em texto pequeno',
    },
  ],

  'vender-produto': [
    {
      papel: 'nav',
      faz: 'leva a pessoa direto ao que ela veio procurar',
      aida: 'atencao',
      sugestao: 'uma barra de navegação com o logo e poucos links, fixa no topo',
    },
    {
      papel: 'hero',
      nome: 'Abertura com a oferta',
      faz: 'diz o que é, para quem, e por que vale',
      aida: 'atencao',
      sugestao:
        'um bloco de abertura com a foto do produto grande, o preço ou a oferta em destaque e um botão de compra',
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
      aida: 'interesse',
      sugestao: 'um bloco de texto com imagem ao lado, ou três cartões descrevendo o produto',
    },
    {
      papel: 'showcase',
      nome: 'Benefícios',
      faz: 'traduz cada característica no que ela muda no dia da pessoa',
      aida: 'interesse',
      sugestao: 'blocos alternados de imagem e texto, um benefício por bloco',
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
      aida: 'desejo',
      sugestao: 'uma grade de cartões de produto: foto, nome, preço e botão',
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
      aida: 'desejo',
      sugestao: 'cartões de depoimento com foto redonda, nome e a frase entre aspas',
      midia: {
        quantas: 3,
        oQue: 'rosto de quem depôs',
        porque: 'depoimento com rosto é lido como pessoa; sem rosto, como texto de marketing',
      },
    },
    {
      papel: 'stats',
      nome: 'Os números',
      faz: 'quantos já compraram, em quanto tempo chega, quanto dura',
      aida: 'desejo',
      sugestao: 'três ou quatro números grandes com um rótulo curto embaixo de cada',
    },
    {
      papel: 'logos',
      nome: 'Onde já está',
      faz: 'mostra marcas e lugares que já confiaram, antes de pedir a compra',
      aida: 'desejo',
      sugestao: 'uma faixa horizontal de logos em cinza, todos do mesmo tamanho',
      midia: {
        quantas: 4,
        oQue: 'logos de clientes, lojas ou parceiros',
        porque: 'prova social vive de marca reconhecível; nome escrito não tem o mesmo peso',
      },
    },
    {
      papel: 'pricing',
      nome: 'Os planos',
      faz: 'põe as opções lado a lado, para a escolha ser de qual e não de se',
      aida: 'desejo',
      sugestao: 'três cartões de plano lado a lado, com o do meio em destaque',
    },
    {
      papel: 'faq',
      nome: 'Garantia e objeções',
      faz: 'prazo, troca, devolução, o que costuma travar a compra',
      aida: 'desejo',
      sugestao: 'uma lista de perguntas que abrem ao clicar, com prazo, troca e devolução',
    },
    {
      papel: 'cta',
      nome: 'Comprar',
      faz: 'a ação, sozinha na tela, sem distração ao redor',
      aida: 'acao',
      sugestao: 'uma faixa larga com fundo de cor, uma frase e um botão só, sem mais nada em volta',
    },
    {
      papel: 'footer',
      faz: 'fecha a página e guarda o que é obrigatório',
      aida: 'acao',
      sugestao: 'um rodapé com contato, redes e o obrigatório, em texto pequeno',
    },
  ],

  'apresentar-servico': [
    {
      papel: 'nav',
      faz: 'leva a pessoa direto ao que ela veio procurar',
      aida: 'atencao',
      sugestao: 'uma barra de navegação com o logo e poucos links, fixa no topo',
    },
    {
      papel: 'hero',
      nome: 'Abertura',
      faz: 'diz o que você faz, em uma frase que a pessoa repetiria',
      aida: 'atencao',
      sugestao:
        'um bloco de abertura com uma frase que a pessoa repetiria, imagem do trabalho acontecendo e um botão de conversa',
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
      aida: 'interesse',
      sugestao: 'três ou quatro cartões dizendo para quem serve, e por consequência para quem não',
    },
    {
      papel: 'showcase',
      nome: 'O método',
      faz: 'mostra como o trabalho corre, do primeiro contato à entrega',
      aida: 'interesse',
      sugestao: 'uma linha do tempo ou passos numerados, do primeiro contato à entrega',
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
      aida: 'desejo',
      sugestao: 'uma faixa com três ou quatro números grandes e um rótulo curto embaixo de cada',
    },
    {
      papel: 'about',
      nome: 'Quem faz',
      faz: 'quem está por trás — em serviço, a confiança é na pessoa',
      aida: 'desejo',
      sugestao: 'um bloco com sua foto ou da equipe ao lado de um texto em primeira pessoa',
      midia: {
        quantas: 1,
        oQue: 'uma foto sua ou da equipe',
        porque: 'contratar serviço é contratar gente; a foto é o que torna isso concreto',
      },
    },
    {
      papel: 'testimonials',
      nome: 'Quem já contratou',
      faz: 'a palavra de quem passou pelo serviço, que vale mais que a sua',
      aida: 'desejo',
      sugestao: 'dois ou três depoimentos com foto redonda, nome e a frase entre aspas',
      midia: {
        quantas: 3,
        oQue: 'rosto de quem depôs',
        porque: 'depoimento com rosto é lido como pessoa; sem rosto, como texto de marketing',
      },
    },
    {
      papel: 'pricing',
      nome: 'Como cobramos',
      faz: 'tira o preço do escuro, que é o que mais adia a conversa',
      aida: 'desejo',
      sugestao: 'dois ou três pacotes lado a lado, com o que entra em cada um',
    },
    {
      papel: 'faq',
      nome: 'Dúvidas',
      faz: 'responde prazo, escopo e o que costuma travar a contratação',
      aida: 'desejo',
      sugestao: 'uma lista de perguntas que abrem ao clicar, uma embaixo da outra',
    },
    {
      papel: 'cta',
      nome: 'A chamada',
      faz: 'repete o convite depois de o argumento estar todo dado',
      aida: 'acao',
      sugestao: 'uma faixa larga com fundo de cor, uma frase e um botão só, sem mais nada em volta',
    },
    {
      papel: 'contact',
      nome: 'Vamos conversar',
      faz: 'o convite para a conversa',
      aida: 'acao',
      sugestao: 'um formulário curto ou um botão único de WhatsApp, com o convite acima',
    },
    {
      papel: 'footer',
      faz: 'fecha a página e guarda o que é obrigatório',
      aida: 'acao',
      sugestao: 'um rodapé com contato, redes e o obrigatório, em texto pequeno',
    },
  ],

  'mostrar-trabalho': [
    {
      papel: 'nav',
      faz: 'leva a pessoa direto ao que ela veio procurar',
      aida: 'atencao',
      sugestao:
        'uma barra de navegação enxuta, quase invisível: no portfólio ela não pode competir com o trabalho',
    },
    {
      papel: 'hero',
      nome: 'Abertura',
      faz: 'seu nome e o que você faz, curto — aqui o trabalho fala primeiro',
      aida: 'atencao',
      sugestao:
        'uma abertura com uma imagem grande do melhor trabalho e seu nome em texto pequeno por cima',
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
      aida: 'interesse',
      sugestao:
        'uma grade ou mosaico de imagens grandes, com o título aparecendo só ao passar o cursor',
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
      aida: 'desejo',
      sugestao: 'blocos de imagem e texto mostrando bastidor, rascunho e versões até o resultado',
      midia: {
        quantas: 3,
        oQue: 'bastidor, rascunho, versões intermediárias',
        porque: 'processo mostrado com imagem prova autoria; descrito com texto, não',
      },
    },
    {
      papel: 'about',
      nome: 'Quem faz',
      faz: 'põe rosto e história no trabalho, que é metade do que se contrata',
      aida: 'desejo',
      sugestao: 'um bloco com sua foto ao lado de um texto curto em primeira pessoa',
      midia: {
        quantas: 1,
        oQue: 'uma foto sua ou do estúdio',
        porque: 'portfólio mostra o trabalho; esta seção mostra quem o fez',
      },
    },
    {
      papel: 'stats',
      nome: 'Os números',
      faz: 'quantos projetos, quantos anos, quantos clientes',
      aida: 'desejo',
      sugestao: 'três ou quatro números grandes com um rótulo curto embaixo de cada',
    },
    {
      papel: 'logos',
      nome: 'Para quem trabalhei',
      faz: 'as marcas que já passaram por aqui dizem o tamanho do trabalho',
      aida: 'desejo',
      sugestao: 'uma faixa horizontal de logos em cinza, todos do mesmo tamanho',
      midia: {
        quantas: 4,
        oQue: 'logos dos clientes atendidos',
        porque: 'prova social vive de marca reconhecível; nome escrito não tem o mesmo peso',
      },
    },
    {
      papel: 'testimonials',
      nome: 'Depoimentos',
      faz: 'quem contratou conta como foi trabalhar com você',
      aida: 'desejo',
      sugestao: 'cartões de depoimento com foto, nome e o trabalho a que ele se refere',
    },
    {
      papel: 'faq',
      nome: 'Como funciona trabalhar comigo',
      faz: 'prazo, etapas e formato, que é o que a pessoa não ousa perguntar',
      aida: 'desejo',
      sugestao: 'uma lista de perguntas que abrem ao clicar, uma embaixo da outra',
    },
    {
      papel: 'cta',
      nome: 'A chamada',
      faz: 'convida para o próximo projeto, depois de o trabalho ter falado',
      aida: 'acao',
      sugestao: 'uma faixa larga com fundo de cor, uma frase e um botão só, sem mais nada em volta',
    },
    {
      papel: 'contact',
      nome: 'Contato',
      faz: 'o caminho para o próximo trabalho',
      aida: 'acao',
      sugestao: 'um bloco simples com e-mail e redes, ou um botão único de conversa',
    },
    {
      papel: 'footer',
      faz: 'fecha a página e guarda o que é obrigatório',
      aida: 'acao',
      sugestao: 'um rodapé com contato, redes e o obrigatório, em texto pequeno',
    },
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
    aida: 'desejo',
    sugestao: 'uma tabela de dois ou três planos lado a lado, com o recomendado em destaque',
  },
  team: {
    papel: 'team',
    nome: 'Equipe',
    faz: 'mostra quem faz o trabalho, quando as pessoas são parte do que se compra',
    aida: 'desejo',
    sugestao: 'uma grade de fotos da equipe com nome e função embaixo de cada uma',
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
    aida: 'desejo',
    sugestao: 'uma faixa com três ou quatro números grandes e um rótulo curto embaixo de cada',
  },
  about: {
    papel: 'about',
    nome: 'Sobre',
    faz: 'conta de onde você vem e por que faz isso',
    aida: 'desejo',
    sugestao: 'um bloco com foto ao lado de um texto em primeira pessoa',
  },
  gallery: {
    papel: 'gallery',
    nome: 'Galeria',
    faz: 'mostra o trabalho em imagem, sem texto no caminho',
    aida: 'interesse',
    sugestao: 'uma grade ou mosaico de imagens grandes, quase sem texto no caminho',
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
    aida: 'desejo',
    sugestao: 'uma grade de cartões de produto: foto, nome, preço e botão',
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
    aida: 'acao',
    sugestao: 'uma faixa larga com fundo de cor, uma frase e um botão só, sem nada em volta',
  },
  testimonials: {
    papel: 'testimonials',
    nome: 'Depoimentos',
    faz: 'quem já contratou fala — vale mais do que você falando',
    aida: 'desejo',
    sugestao: 'cartões de depoimento com foto, nome e a frase entre aspas',
  },
  showcase: {
    papel: 'showcase',
    nome: 'Demonstração',
    faz: 'mostra o que foi dito acontecendo, em vez de só descrever',
    aida: 'interesse',
    sugestao: 'blocos alternados de imagem e texto mostrando a coisa acontecendo',
  },
  logos: {
    papel: 'logos',
    nome: 'Prova social',
    faz: 'mostra quem já confiou antes',
    aida: 'desejo',
    sugestao: 'uma faixa horizontal de logos em cinza, todos do mesmo tamanho',
    midia: {
      quantas: 4,
      oQue: 'logos de clientes ou parceiros',
      porque: 'prova social vive de marca reconhecível',
    },
  },
};

// ── A estrutura sugerida ────────────────────────────────────────────────────

/**
 * Propõe a estrutura inicial a partir do OBJETIVO do site. Só dele.
 *
 * A versão anterior fazia mais: casava peça do kit com papel e pré-alocava
 * cada uma numa seção, e as sobras viravam seções extras. Parecia ajuda e era
 * atropelo, por decisão de quem usa: a alocação de peça é a parte que a pessoa
 * QUER fazer, e uma sugestão que já chega preenchida transforma a montagem em
 * conferência. Pior, o argumento de marketing sumia no meio das seções extras
 * que só existiam porque uma peça sobrou.
 *
 * O que sai agora é o esqueleto argumentativo puro, numerado na ordem da
 * página ("Seção 1 · Navegação", "Seção 2 · Abertura com a oferta"...), cada
 * seção VAZIA e carregando duas orientações da etapa: o momento AIDA em que
 * ela age e a sugestão do TIPO de peça que cai bem ali — escrita sem olhar o
 * kit de ninguém, porque é a orientação de antes da escolha.
 *
 * O número no nome é ponto de partida, como o resto: a pessoa renomeia e
 * reordena à vontade, e o app não tenta manter a numeração em dia.
 *
 * O parâmetro do kit continua na assinatura por compatibilidade com os
 * chamadores; ele deixou de influenciar a sugestão.
 */
export const sugerirSecoes = (
  _componentes: readonly ComponenteDoKitResumo[],
  novoId: () => string = newSectionId,
  objetivo?: ObjetivoDoSite | null,
): SecaoDoSite[] =>
  sequenciaDe(objetivo).map((etapa, i) => ({
    id: novoId(),
    nome: `Seção ${i + 1} · ${nomeDaEtapa(etapa)}`,
    papel: etapa.papel,
    componentIds: [],
  }));
