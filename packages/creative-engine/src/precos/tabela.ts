import type { Transporte } from '../catalogo/presets.js';

/**
 * A tabela de preço, MEDIDA e DATADA.
 *
 * ## Por que ela existe, se o MCP sabe o preço
 *
 * Porque o outro transporte não sabe. O `simulate_cost` do MCP devolve o valor
 * exato antes de gastar; a API REST **não tem endpoint de simulação** — só
 * `POST /v1/analytics/team-credit-usage`, que conta o que já foi consumido. Um
 * worker autônomo, que só existe por REST, precisa estimar de algum lugar, e o
 * único lugar honesto é uma tabela que alguém mediu e assinou com a data.
 *
 * ## Por que ela vence
 *
 * Preço de provedor muda. Uma tabela sem validade é um palpite se passando por
 * número: ela continua respondendo com a mesma confiança depois de virar
 * ficção. Vencida, o motor RECUSA produzir e diz por quê — parar é resultado,
 * cobrar errado em silêncio é defeito.
 *
 * ## O que está medido, e o que não está
 *
 * Tudo abaixo saiu de `simulate_cost` com `certainty: "exact"` em 16/08/2026.
 * O REST está `null` de propósito: não dá para medi-lo sem gastar, e um número
 * copiado do MCP seria adivinhação com cara de medição.
 */

/** Como o preço se comporta. A forma foi medida, não suposta. */
export type RegraDePreco =
  | {
      readonly tipo: 'por-imagem';
      /** Linear na quantidade: 4 variações custaram exatamente 4×. */
      readonly creditos: number;
      /** O que muda quando a resolução muda. 1k e 2k custam IGUAL. */
      readonly porResolucao: Readonly<Record<string, number>>;
    }
  | {
      readonly tipo: 'por-segundo';
      /** Linear na duração, e INDIFERENTE à resolução: 720p e 1080p custam igual. */
      readonly creditosPorSegundo: number;
      /** Áudio nativo é adicional fixo, não embutido. */
      readonly adicionalAudio: number;
    };

export type PrecoPorTransporte = {
  readonly mcp: RegraDePreco | null;
  readonly rest: RegraDePreco | null;
};

export const MEDIDO_EM = '2026-08-16';

/**
 * Noventa dias. Não é um número sagrado: é o prazo em que alguém volta aqui e
 * remede, e é curto o bastante para o erro aparecer antes de virar hábito.
 */
export const VALIDA_ATE = '2026-11-14';

export const TABELA: Readonly<Record<string, PrecoPorTransporte>> = {
  'imagem-padrao': {
    mcp: { tipo: 'por-imagem', creditos: 75, porResolucao: { '1k': 75, '2k': 75, '4k': 150 } },
    rest: null,
  },
  'imagem-marca': {
    mcp: { tipo: 'por-imagem', creditos: 75, porResolucao: { '1k': 75, '2k': 75, '4k': 150 } },
    rest: null,
  },
  'imagem-rascunho': {
    mcp: { tipo: 'por-imagem', creditos: 60, porResolucao: {} },
    rest: null,
  },
  'video-curto': {
    mcp: { tipo: 'por-segundo', creditosPorSegundo: 40, adicionalAudio: 200 },
    rest: null,
  },
};

/**
 * As operações avulsas, que não são "gerar uma peça".
 *
 * O `removerFundo` está aqui por um motivo prático: a 3 créditos, ele é a
 * chamada paga mais barata do provedor, e por isso é com ele que se prova o
 * caminho do dinheiro de ponta a ponta sem apostar.
 */
export const AVULSOS: Readonly<Record<string, number>> = {
  removerFundo: 3,
  vetorizar: 150,
  gerarVetor: 375,
};

export type Estimativa =
  | { readonly ok: true; readonly creditos: number }
  | { readonly ok: false; readonly motivo: string };

export type PedidoDeEstimativa = {
  readonly presetId: string;
  readonly transporte: Transporte;
  /** Quantas imagens. Ignorado em vídeo. */
  readonly quantidade?: number;
  /** Duração em segundos. Ignorado em imagem. */
  readonly segundos?: number;
  readonly resolucao?: string | null;
  readonly comAudio?: boolean;
  /** A data de hoje, injetada para o teste não depender do relógio. */
  readonly hoje: string;
};

/**
 * Quanto isto vai custar — ou por que não dá para dizer.
 *
 * Nunca devolve um número "aproximado". Ou a linha foi medida e vale, ou a
 * resposta é uma recusa com o motivo escrito, para quem chama parar em vez de
 * seguir com um palpite.
 */
export const estimar = (p: PedidoDeEstimativa): Estimativa => {
  if (p.hoje > VALIDA_ATE) {
    return {
      ok: false,
      motivo: `A tabela de preço venceu em ${VALIDA_ATE} (medida em ${MEDIDO_EM}). Remeça com simulate_cost antes de gastar: estimar por número velho é chutar com cara de conta.`,
    };
  }

  const linha = TABELA[p.presetId];
  if (linha === undefined) {
    return { ok: false, motivo: `Preset desconhecido: ${p.presetId}.` };
  }

  const regra = linha[p.transporte];
  if (regra === null) {
    return {
      ok: false,
      motivo: `O preço de "${p.presetId}" no transporte ${p.transporte} não foi medido. Um número copiado do outro transporte seria adivinhação com cara de medição.`,
    };
  }

  if (regra.tipo === 'por-imagem') {
    const quantidade = p.quantidade ?? 1;
    if (!Number.isInteger(quantidade) || quantidade < 1) {
      return { ok: false, motivo: 'Quantidade de imagens tem de ser inteiro positivo.' };
    }
    const resolucao = p.resolucao ?? null;
    if (resolucao !== null && Object.keys(regra.porResolucao).length > 0) {
      const porResolucao = regra.porResolucao[resolucao];
      if (porResolucao === undefined) {
        return {
          ok: false,
          motivo: `A resolução "${resolucao}" não foi medida para "${p.presetId}".`,
        };
      }
      return { ok: true, creditos: porResolucao * quantidade };
    }
    return { ok: true, creditos: regra.creditos * quantidade };
  }

  const segundos = p.segundos ?? 0;
  if (!Number.isInteger(segundos) || segundos < 1) {
    return { ok: false, motivo: 'Duração do vídeo tem de ser inteiro positivo, em segundos.' };
  }
  const base = regra.creditosPorSegundo * segundos;
  return { ok: true, creditos: p.comAudio === true ? base + regra.adicionalAudio : base };
};
