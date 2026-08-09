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
 * consome crédito. Em 2026-08-09 restavam 17.230 de 45.000, a ~75 por imagem e
 * 1.600 por vídeo de 8s. Uma via expressa que gerasse sozinha poderia torrar
 * milhares de créditos num clique que a pessoa deu esperando um rascunho.
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

/** O que a tela decidiu sobre as imagens desta criação de marca. */
export type EscolhaDeImagem = 'desenho' | 'magnific';

export type DecisaoDeImagem =
  | { ok: true; escolha: EscolhaDeImagem }
  | { ok: false; erro: string; pergunta: string; opcoes: readonly EscolhaDeImagem[] };

/**
 * A pergunta que a tela mostra. Mora aqui, e não na web, porque a razão dela
 * (custo por imagem, crédito finito) é do servidor, e duas cópias divergiriam.
 */
export const PERGUNTA_DA_TRAVA =
  'As imagens desta marca saem do Magnific (gera crédito: ~75 por imagem, ~1.600 por vídeo de 8s) ou do desenho local (grátis, mais simples)?';

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
): DecisaoDeImagem => {
  const v = (corpo as { imagens?: unknown } | null)?.imagens;
  if (v === 'desenho' || v === 'magnific') return { ok: true, escolha: v };
  if (fluxo === 'wizard') return { ok: true, escolha: 'magnific' };
  return {
    ok: false,
    erro: 'imagens_nao_decidido',
    pergunta: PERGUNTA_DA_TRAVA,
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
 * O aviso que sobe junto com a marca criada, quando a escolha foi Magnific.
 *
 * Ele é a prova de que ninguém prometeu o que não fez: a marca sai desenhada
 * AGORA, e o pedido fica registrado para o agente atender com a ferramenta.
 */
export const avisoDePedidoAoMagnific = (projectId: string): string =>
  `As imagens deste projeto (${projectId}) foram DESENHADAS e há um pedido de geração pelo Magnific registrado. O servidor não fala com o Magnific — quem gera é o agente, pela ferramenta. Peça a ele para atender o pedido.`;
