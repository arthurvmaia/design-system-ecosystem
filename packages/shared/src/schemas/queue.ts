import { z } from 'zod';

/**
 * Fila de trabalho em disco.
 *
 * Existe para separar QUEM PEDE de QUEM EXECUTA.
 *
 * No modo `api`, o servidor pede e executa na mesma hora, chamando a Anthropic.
 * No modo `queue`, o servidor só registra o pedido num arquivo JSON e devolve
 * na hora. O trabalho fica parado até uma pessoa abrir o Claude Code e mandar
 * processar.
 *
 * Essa pausa é intencional e é o ponto inteiro do desenho: nada aqui observa a
 * pasta, nada dispara sozinho. Um vigia automático transformaria isto em
 * automação disfarçada — que é exatamente o que este modo evita.
 */

/**
 * `ajustar` é o pedido de retoque num site JÁ GERADO — "esse título está
 * pequeno", "esse azul não é o meu azul".
 *
 * É um tipo próprio, e não um `generate` de novo, por uma razão que muda o
 * resultado: gerar de novo refaz a página inteira e desfaz tudo o que já estava
 * bom, além de custar a composição toda. O site entregue é independente (carrega
 * cópia de todos os assets), então o retoque pousa NELE, como uma folha de
 * estilo que entra por último na cascata — a composição original fica intacta e
 * o ajuste se desfaz apagando uma linha.
 */
/**
 * `aprender` e o pedido de NOVA TENTATIVA sobre algo que a regra de aceite
 * reprovou ou deixou pendente.
 *
 * E diferente de `ajustar` porque nao ha nada para ajustar: a peca nao saiu boa,
 * e o que se pede e que alguem ESTUDE aquele caso e tente outra abordagem —
 * outra forma de interpretar o componente, outra maneira de reproduzir a
 * tecnologia que ele usa. E investigacao, nao retoque.
 *
 * O dono pediu por nome: "era bom nessa tela de pendencias ter um botao em cada
 * um de 'faca-me aprender', que seria onde vc iria tentar outras abordagens para
 * tentar interpretar esse componente".
 */
/**
 * `criativo` é o pedido de PEÇA para a marca do cliente — imagem ou vídeo que
 * ele baixa na máquina. É a frente de criativos; a espec mora em
 * `references/12-frente-criativos-mvp.md`.
 *
 * É um tipo próprio, e não um `generate`, porque não existe site nem kit aqui:
 * a saída é um punhado de arquivos em `criativos/<job_id>/`, fora de qualquer
 * projeto, e o custo é outro — cada variação gasta crédito de geração, então o
 * pedido carrega um TETO de orçamento que os outros tipos não têm. Quem produz
 * é o motor (skill `orbis-suite`), nunca o código do app chamando API de
 * imagem, e o download só libera o que a verificação aprovou.
 *
 * O `payload` segue `PedidoCriativo` e o `result` segue `ResultadoCriativo`,
 * os dois em `criativo.ts`.
 */
export const QueueJobType = z.enum([
  'extract',
  'classify',
  'generate',
  'ajustar',
  'aprender',
  'criativo',
]);
export type QueueJobType = z.infer<typeof QueueJobType>;

/**
 * `cancelado` é separado de `erro` de propósito. Cancelar é uma decisão de quem
 * usa — clicar no X da fila — e não tem nada de anormal. Enquanto os dois
 * dividiam o mesmo status, remover um pedido acendia o alerta do painel e a
 * pessoa ficava procurando um problema que nunca existiu.
 */
export const QueueJobStatus = z.enum(['pendente', 'concluido', 'erro', 'cancelado']);
export type QueueJobStatus = z.infer<typeof QueueJobStatus>;

export const QueueJob = z.object({
  id: z.string().startsWith('job_'),
  type: QueueJobType,
  /** Descrição curta para a interface e para a listagem no Claude Code. */
  label: z.string(),
  status: QueueJobStatus,
  createdAt: z.number().int().positive(),
  completedAt: z.number().int().positive().nullable().default(null),
  /** Dados necessários para executar. O formato varia por tipo. */
  payload: z.record(z.string(), z.unknown()),
  /** Preenchido por quem processou: o que foi produzido, para auditoria. */
  result: z.record(z.string(), z.unknown()).nullable().default(null),
  error: z.string().nullable().default(null),
});
export type QueueJob = z.infer<typeof QueueJob>;

/** Modo de execução do servidor. */
export const ExecutionMode = z.enum(['queue', 'api']);
export type ExecutionMode = z.infer<typeof ExecutionMode>;

/**
 * Um pedido de retoque num site já gerado, e o que ele produziu.
 *
 * Mora em `generated/<versao>/ajustes.json`, ao lado do site — e não no banco —
 * porque pertence ÀQUELA versão: baixar o .zip leva o histórico junto, e apagar
 * a versão apaga os pedidos dela sem deixar órfão em lugar nenhum.
 *
 * O `css` guarda o que foi escrito para atender o pedido. Guardar isso, e não só
 * o texto do pedido, é o que torna o ajuste REVERSÍVEL: dá para ver o que cada
 * frase produziu, refazer um sem refazer os outros, e desfazer o último sem
 * tocar no site.
 */
export const AjusteDoSite = z.object({
  id: z.string().min(1),
  /** O que a pessoa escreveu, na língua dela. */
  pedido: z.string().min(1).max(2000),
  pedidoEm: z.number().int().positive(),
  estado: z.enum(['pendente', 'aplicado', 'recusado']).default('pendente'),
  aplicadoEm: z.number().int().positive().nullable().default(null),
  /** O CSS que atendeu o pedido. Vazio enquanto pendente. */
  css: z.string().default(''),
  /**
   * O que foi feito, em uma frase — ou por que não deu.
   *
   * Existe porque "aplicado" sozinho não informa: a pessoa pediu "deixa o botão
   * mais destacado" e precisa saber se isso virou cor, tamanho ou sombra.
   */
  resposta: z.string().default(''),
});
export type AjusteDoSite = z.infer<typeof AjusteDoSite>;

export const AjustesDoSite = z.object({
  /**
   * A versão do FORMATO deste arquivo — não a versão do site.
   *
   * Chamava-se `versao` e colidia: no mesmo objeto de resposta convivia com o
   * carimbo de tempo da versão gerada, e o spread sobrescrevia um com o outro.
   * Dois significados no mesmo nome é defeito esperando acontecer.
   */
  formato: z.literal(1).default(1),
  ajustes: z.array(AjusteDoSite).default([]),
});
export type AjustesDoSite = z.infer<typeof AjustesDoSite>;
