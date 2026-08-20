import type { ProjectRecord } from '@/lib/api';
import { mediaUrl } from '@/routes/projects/partes';
import {
  ARQUETIPOS,
  type FormatoCriativo,
  LIMITES_DO_PEDIDO,
  PedidoCriativo,
  TONS_DE_VOZ,
  normalizarProjectBranding,
} from '@ds/shared/schemas';

/**
 * O vocabulário COMPARTILHADO da frente Criativos.
 *
 * A frente tem duas telas que montam o MESMO `PedidoCriativo`: a dos 4 passos
 * (`Criativos.tsx`) e o expresso (`CriativosExpresso.tsx`). O expresso é atalho
 * de tela, nunca contrato paralelo, e a maneira de isso continuar verdade é as
 * duas lerem estas constantes daqui: rótulo de formato, custo de ensaio, voz
 * das issues e a regra de qual projeto empresta a marca. Digitado duas vezes,
 * cada um desses valores diverge sem ninguém errar.
 */

// ── Rótulos e números do ensaio ──────────────────────────────────────────────

/**
 * Só o RÓTULO mora aqui; a medida sai de `DIMENSAO_DO_FORMATO`, no contrato.
 * Dois lados mostrando números digitados em lugares diferentes é como a medida
 * diverge sem ninguém errar — a mesma razão que pôs a dimensão no shared.
 */
export const ROTULO_DO_FORMATO: Record<FormatoCriativo, string> = {
  'feed-1x1': 'Feed 1:1',
  'story-9x16': 'Story 9:16',
  'reels-9x16': 'Reels 9:16',
  'banner-3x1': 'Banner 3:1',
};

/**
 * O padrão de variações vem do CONTRATO, não de um número redigitado aqui: se
 * o default do schema mudar, as telas mudam junto sem ninguém lembrar delas.
 */
export const VARIACOES_PADRAO: number = PedidoCriativo.shape.variacoes.parse(undefined);

/**
 * O teto do job mora no CONTRATO (`tetoComFolga`, em `@ds/shared/schemas`), e
 * não aqui: a mesma conta vale para a tela que mostra o número e para o
 * servidor que o confere quando o pedido chega.
 */

// ── A voz das issues do contrato ─────────────────────────────────────────────

/**
 * Issues do contrato que nasceram SEM voz (min/max genéricos do Zod) ganham a
 * frase do Orbis aqui, chaveadas pelo campo. As de `superRefine` já vêm
 * escritas no contrato e passam direto — a fonte da mensagem é uma só. Os
 * números vêm de `LIMITES_DO_PEDIDO`, nunca redigitados: a frase tem de citar
 * o MESMO limite que o schema cobra, hoje e depois que ele mudar.
 */
export const VOZ_POR_CAMPO: Record<string, string> = {
  headline: `A headline passou de ${LIMITES_DO_PEDIDO.headline} caracteres. Nesse tamanho ela não fica legível na peça.`,
  cta: `O CTA passou de ${LIMITES_DO_PEDIDO.cta} caracteres. Botão é uma ordem curta.`,
  descricaoParaGerar: `A descrição passou de ${LIMITES_DO_PEDIDO.descricaoParaGerar} caracteres. Me diga o essencial da cena.`,
  restricoes: `As restrições passaram de ${LIMITES_DO_PEDIDO.restricoes} caracteres.`,
  marca: `O nome da marca passa de ${LIMITES_DO_PEDIDO.marca} caracteres: na peça ele não cabe assim.`,
  /**
   * O teto só fica zerado quando o custo medido não chegou. Sem ele o pedido
   * não pode nascer: o motor para ao zerar o teto, e parar exige saber onde
   * fica o zero. A frase diz o que aconteceu em vez de acusar o campo.
   */
  tetoDeCreditos:
    'Ainda não sei quanto isto custa, então não deixo confirmar. Recarregue a página: o custo vem do servidor, e pedir sem saber o preço é o que o teto existe para impedir.',
};

export const vozDaIssue = (issue: {
  code: string;
  message: string;
  path: (string | number)[];
}): string =>
  issue.code === 'custom'
    ? issue.message
    : (VOZ_POR_CAMPO[String(issue.path[issue.path.length - 1] ?? '')] ??
      `O contrato reprovou "${issue.path.join('.')}". Volte ao passo desse campo e complete.`);

// ── A marca que o app já conhece ─────────────────────────────────────────────

export type MarcaHerdada = {
  projetoNome: string;
  brandName: string;
  /** Amostras clicáveis: clicar elege a cor principal da peça. */
  amostras: Array<{ nome: string; hex: string }>;
  corPrimaria: string;
  logoUrl: string | null;
  /**
   * Tipografia e voz viajam JUNTO com a escolha da marca, porque é isso que a
   * peça veste: quem elege a marca precisa VER o que vem no pacote, no mesmo
   * desenho da tela de Marca do wizard. As famílias ficam como o projeto
   * guarda ("Sora, sans-serif") para a prévia usar a pilha inteira.
   */
  fonteTitulos: string;
  fonteCorpo: string;
  /** Nomes legíveis (catálogo de tons/arquétipos); o primeiro de cada lista domina. */
  tons: string[];
  arquetipos: string[];
  /** Observação livre da voz. É onde o `tone` legado mora depois da migração. */
  vozObservacao: string | null;
};

/**
 * A marca herdada do projeto mais recente que TEM marca com nome. É a regra do
 * passo 2 dos 4 passos, e o expresso a usa igual: perguntar de novo o que o
 * app já sabe é o erro que faz a experiência parecer burocracia.
 */
export const marcaHerdadaDeProjetos = (itens: ProjectRecord[]): MarcaHerdada | null => {
  const ordenados = [...itens].sort((a, b) => b.updatedAt - a.updatedAt);
  for (const p of ordenados) {
    if (p.brandingJson === null) continue;
    const b = normalizarProjectBranding(p.brandingJson);
    const nome = (b.brandName ?? '').trim();
    // Marca sem nome não pré-preenche nada útil: o nome é o único campo que
    // trava, e é justamente o que faltaria.
    if (nome === '') continue;

    const amostrasNovas = (b.paleta?.cores ?? []).map((c) => ({ nome: c.nome, hex: c.hex }));
    const amostrasLegado = [
      { nome: 'principal', hex: b.palette.primary },
      ...(b.palette.accent !== undefined ? [{ nome: 'acento', hex: b.palette.accent }] : []),
      { nome: 'fundo', hex: b.palette.background },
      { nome: 'texto', hex: b.palette.foreground },
    ];
    const vistos = new Set<string>();
    const amostras = (amostrasNovas.length > 0 ? amostrasNovas : amostrasLegado).filter((c) => {
      const chave = c.hex.toLowerCase();
      if (vistos.has(chave)) return false;
      vistos.add(chave);
      return true;
    });

    // A variação `principal` vence quando existe: é a mesma regra da
    // distribuição de logos do wizard. O `logoPath` legado cobre projeto
    // antigo que nunca abriu o painel novo.
    const logoPath =
      b.logos?.find((l) => l.tipo === 'principal')?.path ??
      b.logoPath ??
      b.logos?.[0]?.path ??
      null;

    // O modelo novo (tipografia/identidadeVerbal) vence; o legado
    // (typography/tone) já chega migrado pelo normalizador, então projeto
    // antigo mostra a voz que tinha em texto livre, nunca um painel vazio.
    const iv = b.identidadeVerbal;
    const obs = iv?.observacao?.trim() ?? '';
    return {
      projetoNome: p.name,
      brandName: nome,
      amostras,
      corPrimaria: amostras[0]?.hex ?? b.palette.primary,
      logoUrl: logoPath != null ? mediaUrl(p.id, logoPath) : null,
      fonteTitulos: b.tipografia?.display ?? b.typography.display,
      fonteCorpo: b.tipografia?.body ?? b.typography.body,
      tons: (iv?.tons ?? []).map((id) => TONS_DE_VOZ.find((t) => t.id === id)?.nome ?? id),
      arquetipos: (iv?.arquetipos ?? []).map(
        (id) => ARQUETIPOS.find((a) => a.id === id)?.nome ?? id,
      ),
      vozObservacao: obs === '' ? null : obs,
    };
  }
  return null;
};
