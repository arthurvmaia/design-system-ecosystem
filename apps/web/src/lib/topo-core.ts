import { type NavItemDef, primaryNav, secondaryNav } from './nav';

/**
 * A lógica pura da barra de cima: que tela é esta, e como ler os números.
 *
 * ## O nome da tela deixou de ser digitado duas vezes
 *
 * A TopBar mantinha um mapa próprio de rótulos — 'Galeria', 'Kits', 'Meus
 * sites' — com os MESMOS nomes que `nav.ts` já dá aos links. Duas listas com os
 * mesmos nomes discordam na primeira renomeação, e a barra de cima é onde a
 * divergência aparece primeiro: o link aceso diria uma coisa e o título ao lado
 * dele outra. Aqui o nome vem de `nav.ts`. O que continua local é só o
 * PROPÓSITO de cada tela, que não existe em lugar nenhum além do topo.
 *
 * ## Zero é um fato, traço é uma ausência
 *
 * `leituraDeAcervo` separa três coisas que a barra tratava como uma só: contei
 * e deu zero, ainda estou contando, e não consegui contar. Zero precisa
 * aparecer — é na biblioteca vazia que a pessoa mais precisa ver o zero, porque
 * é ele que explica por que a tela seguinte não tem nada. Esconder o contador
 * no zero faz o acervo vazio parecer acervo não carregado.
 */

/**
 * O propósito de cada tela, na voz do app. Não é rótulo de rota — é o motivo de
 * ela existir, e por isso não cabe em `nav.ts` (que descreve o link, não a
 * tela). Caminho sem propósito declarado fica sem a linha de cima, e não
 * inventa uma.
 */
const PROPOSITO: Record<string, string> = {
  '/inicio': 'Estou pronto',
  '/expresso': 'Eu monto tudo de uma vez',
  '/extract': 'Me traga referências',
  '/gallery': 'O que eu capturei',
  '/library': 'Peças guardadas',
  '/design-systems': 'O que eu monto com',
  '/projects': 'Monto com o seu kit',
  '/meus-projetos': 'O que eu já montei',
  '/revisao': 'Preciso do seu olhar',
  '/settings': 'Do seu jeito',
};

/** Tudo que tem lugar na navegação: o fluxo e as auxiliares. */
const ROTAS: readonly NavItemDef[] = [...primaryNav, ...secondaryNav];

/**
 * Qual item da navegação responde por este caminho.
 *
 * Duas regras, e as duas existem para bater com o `NavLink`, que é quem acende
 * o item na tela: se as leituras discordarem, o título diz uma etapa e o link
 * aceso é outro.
 *
 * 1. Casa por SEGMENTO, não por prefixo de texto: `/projects` responde por
 *    `/projects/abc` e não por `/projects-antigos`.
 * 2. Ganha o mais específico. Hoje nenhuma rota é filha de outra, então a
 *    escolha é sempre única; a regra está aqui para o dia em que for, e para
 *    que a resposta não dependa da ordem das listas.
 */
export function itemDaRota(
  pathname: string,
  itens: readonly NavItemDef[] = ROTAS,
): NavItemDef | null {
  let achado: NavItemDef | null = null;
  for (const item of itens) {
    const casa = pathname === item.to || pathname.startsWith(`${item.to}/`);
    if (!casa) continue;
    if (achado === null || item.to.length > achado.to.length) achado = item;
  }
  return achado;
}

export type RotuloDoTopo = {
  /** O propósito da tela. Vazio quando não há um declarado. */
  section: string;
  /** O nome da tela, o mesmo do link. */
  title: string;
};

/**
 * O que a barra escreve à esquerda.
 *
 * Caminho desconhecido não acontece na prática — o roteador manda qualquer
 * sobra para `/inicio`. O rótulo antecipa esse destino em vez de piscar em
 * branco no quadro entre a rota inválida e o redirecionamento.
 */
export function rotuloDaRota(pathname: string): RotuloDoTopo {
  const item = itemDaRota(pathname);
  if (item === null) return { section: '', title: 'Início' };
  return { section: PROPOSITO[item.to] ?? '', title: item.label };
}

/** Contei (mesmo que zero), ainda contando, ou não consegui contar. */
export type EstadoDaLeitura = 'contado' | 'aguardando' | 'indisponivel';

export type LeituraDeAcervo = {
  /** O que vai na tela: o número, inclusive '0', ou o traço da ausência. */
  texto: string;
  estado: EstadoDaLeitura;
  /** Acender o número? Só quando há algo a mostrar — zero fica discreto. */
  destaque: boolean;
  /** Por que não há número. `null` quando há: aí o número fala por si. */
  explicacao: string | null;
};

const TRACO = '—';

/**
 * Uma leitura de instrumento do acervo, honesta nos três casos.
 *
 * O traço nunca é usado para dizer zero, e o zero nunca é usado para dizer "não
 * sei": são informações diferentes e a barra de cima é lida de relance, sem
 * chance de conferir em outro lugar.
 */
export const leituraDeAcervo = (args: {
  total: number | undefined;
  isError: boolean;
  isPending: boolean;
}): LeituraDeAcervo => {
  if (args.isError) {
    return {
      texto: TRACO,
      estado: 'indisponivel',
      destaque: false,
      explicacao: 'não consegui contar agora',
    };
  }
  if (args.isPending || args.total === undefined) {
    return { texto: TRACO, estado: 'aguardando', destaque: false, explicacao: 'ainda contando' };
  }
  return {
    texto: String(args.total),
    estado: 'contado',
    destaque: args.total > 0,
    explicacao: null,
  };
};
