/**
 * A TRAVA: nenhuma tela gera imagem paga sem o dono ter dito que sim.
 *
 * ## Por que ela existe
 *
 * O dono pediu por extenso: *"quero que se eu for fazer um expresso ou mandar
 * criar marca automaticamente em alguma outra tela que pede isso, quero que você
 * sempre tenha uma trava que pergunte se eu quero gerar pelo Magnific"*.
 *
 * O motivo é dinheiro, e ele é mensurável: o ilimitado existe na conta mas
 * **não vale na sessão** (`unlimitedAppliesHere: false`), então toda geração
 * consome crédito. Uma via expressa que gerasse sozinha poderia torrar milhares
 * de créditos num clique que a pessoa deu esperando um rascunho.
 *
 * ## De onde sai o NÚMERO
 *
 * Do motor criativo, sempre. A pergunta desta trava trazia "~75 por imagem,
 * ~1.600 por vídeo de 8s" escritos à mão, e havia um teste travando os dois. O
 * de vídeo estava errado por 3×: o preset `video-curto` custa **520** por peça
 * de 8s com áudio (40/s mais 200 de áudio nativo), medido em 16/08/2026. A
 * pessoa lia 1.600 e decidia com ele.
 *
 * É o mesmo defeito que a rota `/api/criativos/custos` já tinha consertado do
 * outro lado — lá o número de vídeo estava errado por 73%. Número de dinheiro
 * não vive na tela nem num arquivo de rota: sai da tabela MEDIDA do motor, e
 * quando a tabela vence a trava RECUSA o caminho pago em vez de repetir um
 * preço que virou ficção.
 *
 * ## O que ela NÃO é
 *
 * Não é um cliente do Magnific. **O servidor não tem nenhum** — hoje a marca
 * automática desenha a logo em SVG (`svgLogo`), e é por isso que o dono achou as
 * logos "muito básicas". Quem gera pelo Magnific é o agente, pela ferramenta
 * MCP, que o servidor não alcança.
 *
 * Então a trava faz a única coisa honesta possível aqui: **exige a decisão** e,
 * quando a resposta é "Magnific", registra o PEDIDO em vez de fingir que gerou.
 * O agente atende o pedido depois. Prometer geração que o processo não consegue
 * fazer seria pior que desenhar.
 */

import { MEDIDO_EM, VALIDA_ATE, estimar } from '@ds/creative';

/** O que a tela decidiu sobre as imagens desta criação de marca. */
export type EscolhaDeImagem = 'desenho' | 'magnific';

export type DecisaoDeImagem =
  | { ok: true; escolha: EscolhaDeImagem }
  | { ok: false; erro: string; pergunta: string; opcoes: readonly EscolhaDeImagem[] };

/**
 * A duração do vídeo que a conta usa, em segundos.
 *
 * É o mesmo número da rota `/api/criativos/custos`, e pela mesma razão: o
 * contrato ainda não tem campo de duração. Quando tiver, ele manda.
 */
const SEGUNDOS_DO_VIDEO = 8;

export type CustoDaTrava =
  | {
      readonly ok: true;
      readonly imagem: number;
      readonly video: number;
      readonly medidoEm: string;
      readonly validaAte: string;
    }
  | { readonly ok: false; readonly motivo: string };

/** Hoje, em ISO. Isolado para o teste não depender do relógio da máquina. */
export const hojeISO = (): string => new Date().toISOString().slice(0, 10);

/**
 * O que custa o caminho pago, pela tabela MEDIDA do motor.
 *
 * Os dois preços são pedidos separados de propósito: juntá-los num `&&` diria
 * que "algum" falhou, e quem lê precisa do motivo daquele que falhou.
 */
export const custoDaTrava = (hoje: string = hojeISO()): CustoDaTrava => {
  const imagem = estimar({
    presetId: 'imagem-padrao',
    transporte: 'mcp',
    quantidade: 1,
    resolucao: '2k',
    hoje,
  });
  if (!imagem.ok) return { ok: false, motivo: imagem.motivo };
  const video = estimar({
    presetId: 'video-curto',
    transporte: 'mcp',
    segundos: SEGUNDOS_DO_VIDEO,
    comAudio: true,
    hoje,
  });
  if (!video.ok) return { ok: false, motivo: video.motivo };
  return {
    ok: true,
    imagem: imagem.creditos,
    video: video.creditos,
    medidoEm: MEDIDO_EM,
    validaAte: VALIDA_ATE,
  };
};

/**
 * A pergunta que a tela mostra. Mora aqui, e não na web, porque a razão dela
 * (custo por imagem, crédito finito) é do servidor, e duas cópias divergiriam.
 *
 * Ela é FUNÇÃO, e não constante, porque o preço tem validade: uma constante
 * montada na carga do módulo continuaria respondendo com a mesma confiança
 * depois de a tabela vencer, e é exatamente esse silêncio que o motor recusa.
 */
export const perguntaDaTrava = (hoje: string = hojeISO()): string => {
  const custo = custoDaTrava(hoje);
  if (!custo.ok) {
    return `Não dá para oferecer o Magnific agora: ${custo.motivo} Até remedir, resta o desenho local (grátis).`;
  }
  return `As imagens desta marca saem do Magnific (gera crédito: ${custo.imagem} por imagem, ${custo.video} por vídeo de ${SEGUNDOS_DO_VIDEO}s com áudio, medido em ${custo.medidoEm}) ou do desenho local (grátis, mais simples)?`;
};

/**
 * Por qual caminho o pedido veio — e é isto que decide se há pergunta.
 *
 * O dono separou os dois casos, e a razão é o ESFORÇO já investido:
 *
 * - **`expressa`** é o atalho: um clique, um nicho, e a marca inteira nasce. Aí
 *   a pessoa não pediu imagem paga, pediu um rascunho rápido — e um gasto de
 *   milhares de créditos escondido nesse clique é exatamente o que a trava
 *   existe para impedir. **Pergunta, sem padrão.**
 * - **`wizard`** é o caminho longo: ela preencheu cada campo da marca, etapa por
 *   etapa, até o fim. *"Se eu estou preenchendo as etapas até o final é porque
 *   quero com Magnific de certeza."* **Padrão é `magnific`**, e ela ainda pode
 *   dizer `desenho` no corpo se quiser o contrário.
 */
export type FluxoDoPedido = 'expressa' | 'wizard';

/**
 * Lê a escolha do corpo da requisição, à luz de quem pediu.
 *
 * Na via expressa, **sem escolha é recusa**. Um padrão silencioso ali seria a
 * trava não existindo: ou gasta sem perguntar, ou desenha quando a pessoa
 * queria o Magnific e ela só descobre olhando a tela pronta.
 */
export const lerEscolhaDeImagem = (
  corpo: unknown,
  fluxo: FluxoDoPedido = 'expressa',
  hoje: string = hojeISO(),
): DecisaoDeImagem => {
  const custo = custoDaTrava(hoje);
  const v = (corpo as { imagens?: unknown } | null)?.imagens;

  /**
   * Preço que ninguém consegue dizer não autoriza gasto nenhum.
   *
   * A tabela vence, e vencida ela vira palpite com cara de conta. Aqui isso não
   * derruba a criação da marca: o que some é a OPÇÃO paga — a lista de opções
   * encolhe para o que ainda dá para autorizar, e o desenho local continua
   * inteiro. Deixar passar seria pedir um sim sobre um número que não existe.
   *
   * Vale para os dois fluxos, inclusive o wizard: o padrão dele é `magnific`
   * porque quem preencheu tudo demonstrou a intenção, e não porque o custo
   * deixou de importar.
   */
  if (!custo.ok && v !== 'desenho') {
    return {
      ok: false,
      erro: 'preco_indisponivel',
      pergunta: perguntaDaTrava(hoje),
      opcoes: ['desenho'],
    };
  }

  if (v === 'desenho' || v === 'magnific') return { ok: true, escolha: v };
  if (fluxo === 'wizard') return { ok: true, escolha: 'magnific' };
  return {
    ok: false,
    erro: 'imagens_nao_decidido',
    pergunta: perguntaDaTrava(hoje),
    opcoes: ['desenho', 'magnific'],
  };
};

/**
 * O fluxo declarado no corpo.
 *
 * Chama-se `fluxo`, e não `origem`, porque a rota da via expressa JÁ tem um
 * campo `origem`: o design system que veste o kit. Dois significados no mesmo
 * nome é como um deles passa a ser lido errado numa refatoração distraída.
 *
 * Sem declaração vale `expressa` — a que pergunta. Esquecer de declarar não
 * pode liberar gasto.
 */
export const lerFluxoDoPedido = (corpo: unknown): FluxoDoPedido =>
  (corpo as { fluxo?: unknown } | null)?.fluxo === 'wizard' ? 'wizard' : 'expressa';

/**
 * O PEDIDO que sobe junto com a marca criada, quando a escolha foi Magnific.
 *
 * Ele é a prova de que ninguém prometeu o que não fez: a marca sai desenhada
 * AGORA, e o pedido fica registrado para o agente atender com a ferramenta.
 *
 * E ele nomeia o PRESET, não "o Magnific". A diferença é quem escolhe o modelo:
 * um recado sem preset deixa a escolha para quem for atender, e foi assim que a
 * frente de Lojas passou meses gerando por um modelo que o produto nunca
 * declarou. Com o preset escrito, atender é executar, não decidir.
 */
export const avisoDePedidoAoMagnific = (projectId: string, hoje: string = hojeISO()): string => {
  const custo = custoDaTrava(hoje);
  const quanto = custo.ok
    ? ` Cada imagem custa ${custo.imagem} créditos (medido em ${custo.medidoEm}), e o gasto tem de passar pelo razão: reserve antes, debite depois.`
    : ` O custo NÃO pôde ser estimado: ${custo.motivo}`;
  return `As imagens deste projeto (${projectId}) foram DESENHADAS e há um pedido de geração pelo Magnific registrado, no preset "${PRESET_DO_PEDIDO}". O servidor não fala com o Magnific — quem gera é o agente, pela ferramenta. Peça a ele para atender o pedido.${quanto}`;
};

/**
 * O preset em que este pedido tem de ser atendido.
 *
 * `imagem-padrao` é a peça comum. Símbolo e ativos finais da marca pedem
 * `imagem-marca` (o Pro), que custa o mesmo — mas essa é decisão da marca, e a
 * marca automática daqui não gera símbolo: ela o desenha.
 */
export const PRESET_DO_PEDIDO = 'imagem-padrao';
