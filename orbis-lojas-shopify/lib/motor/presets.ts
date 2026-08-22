/* ATENÇÃO: ARQUIVO ESPELHADO. NÃO EDITE AQUI.
 *
 * O original mora em `packages/creative-engine/src/catalogo/presets.ts`,
 * no motor criativo, porque as três frentes do portal precisam do MESMO motor:
 * a logo do site, a da loja e a do criativo têm de ser a mesma logo, e o modelo
 * que a loja pede tem de ser o modelo que o produto declarou.
 *
 * Para mudar, edite o original e rode `pnpm motor:espelhar`.
 * Editar aqui faz a suíte reprovar, de propósito.
 */
/**
 * O catálogo que traduz um preset DO PRODUTO no identificador REAL do provedor,
 * por transporte.
 *
 * ## Por que isto não pode ser uma string escrita na hora
 *
 * O mesmo modelo tem três nomes, e dois deles se contradizem:
 *
 * | O que o produto chama | Slug no MCP                  | Caminho no REST                          |
 * |-----------------------|------------------------------|------------------------------------------|
 * | Nano Banana 2         | `imagen-nano-banana-2-flash` | `text-to-image/nano-banana-pro-flash`    |
 * | Nano Banana **Pro**   | `imagen-nano-banana-2`       | (não medido)                             |
 *
 * O slug `imagen-nano-banana-2` **não** é o Nano Banana 2 — o catálogo do MCP o
 * chama de "Google Nano Banana Pro". Quem mapeia pelo rótulo pega o modelo
 * errado no MCP; quem copia o slug do MCP para o REST não acha o endpoint.
 *
 * Os dois erros são silenciosos: geram imagem, cobram crédito e entregam outra
 * coisa. Daí o teste dourado ao lado deste arquivo, que REPROVA se alguém
 * reintroduzir o mapeamento óbvio.
 *
 * ## Regra do `null`
 *
 * Identificador que ninguém mediu é `null`, nunca uma string provável. Um slug
 * adivinhado passa no teste e falha na chamada paga — e o teste dourado sobre um
 * slug inventado apenas trava a ficção no lugar.
 */

export type Transporte = 'mcp' | 'rest';
export type Modalidade = 'imagem' | 'video';

/** O identificador real por transporte. `null` = NÃO MEDIDO. */
export type IdentificadorPorTransporte = {
  readonly mcp: string | null;
  readonly rest: string | null;
};

export type PresetVisual = {
  readonly id: string;
  readonly rotulo: string;
  readonly modalidade: Modalidade;
  /** Quando escolher este, em uma frase. */
  readonly paraQue: string;
  readonly identificador: IdentificadorPorTransporte;
  /** O valor que vai no parâmetro de resolução, como o provedor o escreve. */
  readonly resolucao: string | null;
  /** As proporções que CADA transporte aceita. Elas não coincidem. */
  readonly proporcoes: { readonly mcp: readonly string[]; readonly rest: readonly string[] };
  /** Quando o identificador foi conferido contra o provedor. */
  readonly medidoEm: string;
};

/**
 * As proporções do `imagen-nano-banana-2-flash` no MCP, copiadas do catálogo.
 *
 * As quatro últimas — 8:1, 4:1, 1:4, 1:8 — são de FAIXA, e não existem na lista
 * do REST. É a diferença de capacidade que obriga `capabilities()` a existir: o
 * mesmo preset aceita mais coisa num transporte do que no outro.
 */
const PROPORCOES_FLASH_MCP = [
  '1:1',
  '21:9',
  '8:1',
  '4:1',
  '16:9',
  '9:16',
  '1:4',
  '1:8',
  '4:3',
  '4:5',
  '5:4',
  '3:4',
  '3:2',
  '2:3',
] as const;

/** A lista do REST, documentada em `/v1/ai/text-to-image/nano-banana-pro-flash`. */
const PROPORCOES_REST = [
  '1:1',
  '2:3',
  '3:2',
  '4:3',
  '3:4',
  '5:4',
  '4:5',
  '16:9',
  '9:16',
  '21:9',
] as const;

/** As do Nano Banana Pro no MCP: as mesmas do Flash, MENOS as de faixa. */
const PROPORCOES_PRO_MCP = [
  '1:1',
  '21:9',
  '16:9',
  '9:16',
  '4:3',
  '4:5',
  '5:4',
  '3:4',
  '3:2',
  '2:3',
] as const;

const MEDIDO_EM = '2026-08-16';

export const PRESETS: readonly PresetVisual[] = [
  {
    id: 'imagem-padrao',
    rotulo: 'Imagem padrão',
    modalidade: 'imagem',
    paraQue: 'A peça de tráfego pago: feed, story, reels. É o preset da maioria.',
    identificador: {
      mcp: 'imagen-nano-banana-2-flash',
      rest: 'text-to-image/nano-banana-pro-flash',
    },
    resolucao: '2k',
    proporcoes: { mcp: PROPORCOES_FLASH_MCP, rest: PROPORCOES_REST },
    medidoEm: MEDIDO_EM,
  },
  {
    id: 'imagem-marca',
    rotulo: 'Imagem de marca',
    modalidade: 'imagem',
    paraQue:
      'O símbolo e os ativos finais da marca, onde fidelidade importa mais que velocidade. Custa o MESMO que o padrão (75 em 2k, medido), então usar o modelo mais fraco aqui seria perder qualidade de graça — o que ele não aceita são as proporções de faixa.',
    identificador: { mcp: 'imagen-nano-banana-2', rest: null },
    resolucao: '2k',
    proporcoes: { mcp: PROPORCOES_PRO_MCP, rest: [] },
    medidoEm: MEDIDO_EM,
  },
  {
    id: 'imagem-rascunho',
    rotulo: 'Imagem de rascunho',
    modalidade: 'imagem',
    paraQue: 'Exploração barata, para escolher direção antes de gastar no final.',
    identificador: { mcp: 'imagen-nano-banana-2-lite', rest: null },
    resolucao: null,
    proporcoes: { mcp: PROPORCOES_PRO_MCP, rest: [] },
    medidoEm: MEDIDO_EM,
  },
  {
    id: 'video-curto',
    rotulo: 'Vídeo curto',
    modalidade: 'video',
    paraQue:
      'O vídeo de 8 segundos com áudio nativo. 1080p custa o MESMO que 720p (medido), então não há motivo para entregar menos.',
    identificador: { mcp: 'google-veo3_1-lite', rest: null },
    resolucao: '1080p',
    proporcoes: { mcp: ['16:9', '9:16'], rest: [] },
    medidoEm: MEDIDO_EM,
  },
] as const;

export const presetPorId = (id: string): PresetVisual | null =>
  PRESETS.find((p) => p.id === id) ?? null;

/**
 * O identificador para usar AGORA, naquele transporte.
 *
 * Devolve `null` quando ninguém mediu — e quem chama tem de tratar isso como
 * "não dá para produzir por aqui", nunca como "use o outro nome parecido".
 */
export const identificadorDe = (preset: PresetVisual, transporte: Transporte): string | null =>
  preset.identificador[transporte];

/** Aquele transporte aceita essa proporção neste preset? */
export const aceitaProporcao = (
  preset: PresetVisual,
  transporte: Transporte,
  proporcao: string,
): boolean => preset.proporcoes[transporte].includes(proporcao);

/**
 * As proporções que os DOIS transportes aceitam.
 *
 * É o conjunto seguro: pedir algo fora dele amarra a peça a um transporte, e o
 * transporte é decisão de infraestrutura, não do cliente.
 */
export const proporcoesEmComum = (preset: PresetVisual): readonly string[] =>
  preset.proporcoes.mcp.filter((p) => preset.proporcoes.rest.includes(p));
