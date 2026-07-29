import {
  AlertTriangle,
  Compass,
  Home,
  Layers,
  Library,
  type LucideIcon,
  Package,
  Settings,
  UploadCloud,
  Wand2,
} from 'lucide-react';

/**
 * Configuração da navegação lateral.
 *
 * Fica separada do componente de propósito: é dado puro, testável sem renderizar
 * React, e é o que garante a regra de hierarquia — funcionalidades PRINCIPAIS
 * (criar/organizar/gerar) numa lista; funcionalidades AUXILIARES (exceção e
 * operação) noutra, no rodapé, com menos peso.
 */

export type NavItemDef = {
  to: string;
  label: string;
  icon: LucideIcon;
  /** Texto de tooltip/descrição. */
  description: string | null;
};

/**
 * Principais: o fluxo de criar, organizar e gerar. A Revisão NÃO está aqui de
 * propósito — ela é exceção, não etapa obrigatória.
 */
export const primaryNav: NavItemDef[] = [
  { to: '/inicio', label: 'Início', icon: Home, description: 'O que este app faz' },
  { to: '/extract', label: 'Extrair', icon: UploadCloud, description: 'Nova extração' },
  { to: '/gallery', label: 'Galeria', icon: Compass, description: 'Triagem de candidatos' },
  { to: '/library', label: 'Biblioteca', icon: Library, description: 'Acervo curado' },
  { to: '/design-systems', label: 'Design Systems', icon: Layers, description: 'Kits finais' },
  { to: '/projects', label: 'Gerar site', icon: Wand2, description: 'A partir de um kit' },
  { to: '/meus-projetos', label: 'Meus sites', icon: Package, description: 'Prontos para baixar' },
];

/** A rota da área de pendências. Constante para deep-link e testes. */
export const PENDENCIAS_ROUTE = '/revisao';

/**
 * Auxiliares: manutenção, exceção, operação. Rodapé do sidebar, fora do fluxo.
 * "Pendências" é a área de exceção (a antiga "Revisão") — nome mais claro, que
 * não sugere que todo componente precisa passar por ali.
 */
export const secondaryNav: NavItemDef[] = [
  {
    to: PENDENCIAS_ROUTE,
    label: 'Pendências',
    icon: AlertTriangle,
    description: 'Itens que o sistema não interpretou e aguardam revisão manual',
  },
  { to: '/settings', label: 'Configurações', icon: Settings, description: null },
];

/**
 * Estado do selo de pendências — função pura, testável.
 *
 * Regras do produto:
 * - erro/carregando/indefinido: NÃO assume zero e NÃO mostra número, mas o item
 *   continua acessível (o rótulo não afirma "nenhuma pendência").
 * - zero: discreto, sem selo de alerta, rótulo diz "nenhuma pendência".
 * - um ou mais: mostra o contador com destaque moderado, e o rótulo acessível
 *   anuncia a quantidade.
 */
export type PendenciasBadge = {
  /** Exibir o contador visual? */
  mostrar: boolean;
  valor: number;
  /** Usar o estilo de destaque (ação necessária)? */
  destaque: boolean;
  /** aria-label do item, para leitor de tela. */
  rotuloAcessivel: string;
};

export const pendenciasBadge = (args: {
  total: number | undefined;
  isError: boolean;
  isPending: boolean;
}): PendenciasBadge => {
  const base = 'Pendências de revisão';

  if (args.isError || args.isPending || args.total === undefined) {
    return { mostrar: false, valor: 0, destaque: false, rotuloAcessivel: base };
  }
  if (args.total <= 0) {
    return {
      mostrar: false,
      valor: 0,
      destaque: false,
      rotuloAcessivel: `${base}, nenhuma pendência`,
    };
  }
  const plural = args.total === 1 ? 'item aguardando análise' : 'itens aguardando análise';
  return {
    mostrar: true,
    valor: args.total,
    destaque: true,
    rotuloAcessivel: `${base}, ${args.total} ${plural}`,
  };
};
