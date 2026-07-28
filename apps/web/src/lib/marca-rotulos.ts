import type { LocalDeLogo, TipoDeLogo, TokenSemantico } from '@ds/shared/schemas';
import type { EixosEditoriais, PresetDeCorpo, PresetDeTitulos } from '@ds/shared/schemas';
import { ARQUETIPOS, type IdentidadeVerbal, TONS_DE_VOZ } from '@ds/shared/schemas';

/**
 * Rótulos pt-BR de TODOS os vocabulários da marca — a UI nunca mostra o id
 * técnico. Um teste garante que cada membro dos enums do shared tem rótulo:
 * se o schema ganhar um valor novo, o teste quebra antes da tela.
 */

export const ROTULO_TIPO_DE_LOGO: Record<TipoDeLogo, string> = {
  principal: 'Principal',
  horizontal: 'Horizontal',
  vertical: 'Vertical',
  simbolo: 'Símbolo',
  reduzida: 'Reduzida',
  clara: 'Clara (para fundo escuro)',
  escura: 'Escura (para fundo claro)',
  monocromatica: 'Monocromática',
  favicon: 'Ícone da aba',
  social: 'Compartilhamento',
};

export const ROTULO_LOCAL_DE_LOGO: Record<LocalDeLogo, string> = {
  'cabecalho-claro': 'Cabeçalho claro',
  'cabecalho-escuro': 'Cabeçalho escuro',
  'menu-mobile': 'Menu no celular',
  hero: 'Abertura',
  rodape: 'Rodapé',
  favicon: 'Aba do navegador',
  social: 'Compartilhamento',
};

export const ROTULO_TOKEN: Record<TokenSemantico, string> = {
  background: 'Fundo da página',
  surface: 'Fundo de cartões',
  'surface-elevated': 'Cartão em destaque',
  heading: 'Títulos',
  body: 'Texto',
  muted: 'Texto secundário',
  primary: 'Cor principal',
  'primary-hover': 'Principal (mouse em cima)',
  'primary-foreground': 'Texto sobre a principal',
  secondary: 'Cor secundária',
  accent: 'Cor de destaque',
  border: 'Bordas',
  link: 'Links',
  focus: 'Contorno de foco',
  success: 'Mensagens de sucesso',
  warning: 'Mensagens de atenção',
  error: 'Mensagens de erro',
};

/** Estados que só entram com atribuição manual (a paleta não os inventa). */
export const TOKENS_DE_ESTADO: readonly TokenSemantico[] = ['success', 'warning', 'error'];

export const ROTULO_EIXO: Record<keyof EixosEditoriais, string> = {
  formalidade: 'Formalidade',
  energia: 'Energia',
  proximidade: 'Proximidade',
  objetividade: 'Objetividade',
  sofisticacao: 'Sofisticação',
  nivelTecnico: 'Profundidade técnica',
};

export const ROTULO_PRESET_TITULOS: Record<PresetDeTitulos, { nome: string; descricao: string }> = {
  compacta: { nome: 'Compacta', descricao: 'Títulos firmes, pouca variação de tamanho.' },
  equilibrada: { nome: 'Equilibrada', descricao: 'O meio-termo que funciona em quase tudo.' },
  editorial: { nome: 'Editorial', descricao: 'Contraste generoso, respiro de revista.' },
  impactante: { nome: 'Impactante', descricao: 'Peso máximo, títulos que dominam a dobra.' },
  delicada: { nome: 'Delicada', descricao: 'Leve e espaçada, para marcas suaves.' },
};

export const ROTULO_PRESET_CORPO: Record<PresetDeCorpo, { nome: string; descricao: string }> = {
  compacto: { nome: 'Compacto', descricao: 'Mais conteúdo por tela.' },
  confortavel: { nome: 'Confortável', descricao: 'Leitura fácil, o padrão.' },
  amplo: { nome: 'Amplo', descricao: 'Espaçado, poucas distrações.' },
  editorial: { nome: 'Editorial', descricao: 'Texto grande, longform.' },
};

/**
 * Resume a identidade verbal numa frase — é o espelho LEGADO do campo `tone`,
 * para o gerador e fluxos antigos continuarem lendo algo útil até migrarem.
 */
export const resumoDaVoz = (iv: IdentidadeVerbal): string | undefined => {
  const tons: string[] = iv.tons
    .map((id) => TONS_DE_VOZ.find((t) => t.id === id)?.nome as string | undefined)
    .filter((n): n is string => n !== undefined);
  const arquetipo: string | undefined = ARQUETIPOS.find((a) => a.id === iv.arquetipos[0])?.nome;
  const partes: (string | undefined)[] = [
    tons.length > 0 ? tons.join(', ') : undefined,
    arquetipo !== undefined ? `postura ${arquetipo}` : undefined,
    iv.observacao?.trim() || undefined,
  ];
  const validas = partes.filter((p): p is string => p !== undefined);
  return validas.length > 0 ? validas.join(' · ') : undefined;
};
