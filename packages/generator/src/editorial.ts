import type { BriefDaSecao, DiretrizesEditoriais } from '@ds/shared';

/**
 * Pipeline EDITORIAL de copy — a fonte única e versionada de como o texto do
 * site nasce: um PLANO determinístico (o que pedir, para qual seção, com que
 * orientação e limite), um MODELO plugável (a LLM em produção, uma função
 * simulada nos testes) e VALIDADORES determinísticos que recusam texto fora
 * das regras — com uma rodada de correção antes de desistir.
 *
 * Nada aqui toca rede ou disco: quem chama decide o modelo e onde gravar.
 */

export const COPY_VERSION = 1;

export type PedidoDeCopy = {
  role: string;
  /** O papel do texto dentro da seção. */
  papel: 'titulo' | 'paragrafo' | 'itens' | 'cta';
  /** Orientação completa para o modelo (voz + brief + limite). */
  orientacao: string;
  /** Limite duro de caracteres (quando o contrato do componente impõe). */
  limite?: number;
};

export type PlanoEditorial = {
  copyVersion: number;
  pedidos: PedidoDeCopy[];
};

/**
 * Monta o plano a partir dos briefs e das diretrizes da voz — DETERMINÍSTICO:
 * mesmo brief, mesma voz → mesmo plano. Seção sem brief não gera pedido (o
 * gerador segue o hint do slot, sem inventar fatos).
 */
export const montarPlanoEditorial = (dados: {
  briefs: Record<string, BriefDaSecao>;
  diretrizes: DiretrizesEditoriais;
  limites?: Record<string, number>;
}): PlanoEditorial => {
  const voz = [
    ...dados.diretrizes.orientacoes,
    dados.diretrizes.vocabularioPreferido.length > 0
      ? `Prefira estas palavras: ${dados.diretrizes.vocabularioPreferido.join(', ')}.`
      : null,
    dados.diretrizes.vocabularioEvitar.length > 0
      ? `NUNCA use: ${dados.diretrizes.vocabularioEvitar.join(', ')}.`
      : null,
    dados.diretrizes.observacao ?? null,
  ]
    .filter((x): x is string => x !== null)
    .join(' ');

  const pedidos: PedidoDeCopy[] = [];
  for (const [role, brief] of Object.entries(dados.briefs)) {
    const base = (texto: string): string => (voz !== '' ? `${voz} ${texto}` : texto);
    const limite = dados.limites?.[role];
    if (brief.mensagem !== undefined && brief.mensagem.trim() !== '') {
      pedidos.push({
        role,
        papel: 'titulo',
        orientacao: base(`Transforme em título de seção: "${brief.mensagem.trim()}".`),
        ...(limite !== undefined ? { limite } : {}),
      });
      pedidos.push({
        role,
        papel: 'paragrafo',
        orientacao: base(
          `Escreva o parágrafo de apoio da mensagem: "${brief.mensagem.trim()}". Só fatos do brief.`,
        ),
      });
    }
    const itens = [...brief.pontos, ...brief.provas].map((p) => p.trim()).filter((p) => p !== '');
    if (itens.length > 0) {
      pedidos.push({
        role,
        papel: 'itens',
        orientacao: base(`Reescreva cada item na voz da marca, um por linha: ${itens.join(' | ')}`),
      });
    }
    if (brief.cta !== undefined && brief.cta.trim() !== '') {
      pedidos.push({
        role,
        papel: 'cta',
        orientacao: base(`Chamada curta de botão a partir de: "${brief.cta.trim()}".`),
        limite: limite !== undefined ? Math.min(limite, 40) : 40,
      });
    }
  }
  return { copyVersion: COPY_VERSION, pedidos };
};

// ── Validadores determinísticos ──────────────────────────────────────────────

export type RegrasDeCopy = {
  limite?: number;
  vocabularioEvitar: string[];
};

/** Devolve os problemas do texto — lista vazia = aprovado. Determinístico. */
export const validarCopy = (texto: string, regras: RegrasDeCopy): string[] => {
  const problemas: string[] = [];
  const t = texto.trim();
  if (t === '') problemas.push('texto vazio');
  if (regras.limite !== undefined && t.length > regras.limite) {
    problemas.push(`passa do limite de ${regras.limite} caracteres (tem ${t.length})`);
  }
  const baixo = t.toLowerCase();
  for (const palavra of regras.vocabularioEvitar) {
    if (palavra.trim() !== '' && baixo.includes(palavra.trim().toLowerCase())) {
      problemas.push(`usa palavra proibida: "${palavra}"`);
    }
  }
  return problemas;
};

// ── Execução com modelo plugável ─────────────────────────────────────────────

/** O modelo é uma função — a LLM em produção, uma função simulada nos testes. */
export type ModeloDeCopy = (pedido: PedidoDeCopy) => Promise<string> | string;

export type CopyDaSecao = Partial<Record<PedidoDeCopy['papel'], string>>;

export type ResultadoEditorial = {
  copyVersion: number;
  secoes: Record<string, CopyDaSecao>;
  /** O que não passou nem após a correção — honesto, nunca silencioso. */
  problemas: Array<{ role: string; papel: string; problemas: string[] }>;
};

/**
 * Executa o plano: pede, valida, e num reprovado pede UMA correção com os
 * problemas anexados à orientação. Se ainda reprovar, mantém o texto e lista o
 * problema — quem chama decide se publica. Determinístico dado o modelo.
 */
export const executarPlano = async (
  plano: PlanoEditorial,
  modelo: ModeloDeCopy,
  regras: { vocabularioEvitar: string[] },
): Promise<ResultadoEditorial> => {
  const secoes: Record<string, CopyDaSecao> = {};
  const problemas: ResultadoEditorial['problemas'] = [];
  for (const pedido of plano.pedidos) {
    const regrasDoPedido: RegrasDeCopy = {
      vocabularioEvitar: regras.vocabularioEvitar,
      ...(pedido.limite !== undefined ? { limite: pedido.limite } : {}),
    };
    let texto = String(await modelo(pedido));
    let erros = validarCopy(texto, regrasDoPedido);
    if (erros.length > 0) {
      texto = String(
        await modelo({
          ...pedido,
          orientacao: `${pedido.orientacao} CORRIJA: a versão anterior falhou (${erros.join('; ')}).`,
        }),
      );
      erros = validarCopy(texto, regrasDoPedido);
    }
    if (erros.length > 0)
      problemas.push({ role: pedido.role, papel: pedido.papel, problemas: erros });
    secoes[pedido.role] = { ...secoes[pedido.role], [pedido.papel]: texto };
  }
  return { copyVersion: plano.copyVersion, secoes, problemas };
};
