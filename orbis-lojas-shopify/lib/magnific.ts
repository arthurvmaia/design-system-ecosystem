/**
 * Provedor opcional de imagem e vídeo por IA: Magnific.
 *
 * O gerador de marca (`lib/marca-generator.mjs`) é local e determinístico — ele
 * sempre funciona, sem chave e sem rede. Este arquivo é o degrau de cima: com
 * uma chave configurada, a loja gerada ganha banner e imagens de verdade em vez
 * do desenho vetorial.
 *
 * ## A chave é do dono do app, e o app nunca a vê pela tela
 *
 * A chave entra por variável de ambiente (`MAGNIFIC_API_KEY`), em `.dev.vars`
 * no desenvolvimento e como secret do Worker em produção. Ela nunca sai daqui:
 * o navegador fala com a nossa rota, a rota fala com a Magnific. Sem chave,
 * `magnificDisponivel()` devolve falso e a área do cliente segue no gerador
 * local, sem erro e sem tela quebrada.
 *
 * ## Contrato da API (docs.magnific.com)
 *
 * Base `https://api.magnific.com`, cabeçalho `x-magnific-api-key`. Cada modelo é
 * um POST em `/v1/ai/<modelo>` que devolve `data.task_id`; o resultado sai por
 * GET em `/v1/ai/<modelo>/<task_id>`, com `status` e `generated` (URLs).
 */

import { identificadorDe, presetPorId } from "./motor/presets";

const BASE = "https://api.magnific.com";

/**
 * Modelos liberados, por papel. É lista fechada de propósito: o modelo chega do
 * navegador e vira caminho de URL — aceitar texto livre aqui seria deixar o
 * cliente escolher para onde a chave é enviada.
 *
 * A lista é a fronteira de SEGURANÇA. Quem é o modelo padrão, isso não se
 * decide aqui: decide o catálogo do motor (`modeloPadrao`, logo abaixo).
 */
export const MODELOS_MAGNIFIC = Object.freeze({
  imagem: Object.freeze([
    "mystic", "flux-dev", "flux-2-turbo", "hyperflux", "seedream-4",
    /* Nano Banana (Gemini): fotografia realista. Vive noutro caminho da API e
       fala outro vocabulário de enquadramento — ver `corpoDoPedido`. */
    "text-to-image/nano-banana-pro", "text-to-image/nano-banana-pro-flash",
  ]),
  video: Object.freeze(["kling-v2.5-pro", "wan-2-5-i2v-1080p", "runway-gen4-turbo"]),
  upscale: Object.freeze(["image-upscaler"]),
});

export type PapelMagnific = keyof typeof MODELOS_MAGNIFIC;
export type TarefaMagnific = { taskId: string; modelo: string; status: string; imagens: string[] };

export function modeloValido(papel: PapelMagnific, modelo: string): boolean {
  return (MODELOS_MAGNIFIC[papel] as readonly string[]).includes(modelo);
}

/**
 * QUE PRESET DO PRODUTO cada papel desta loja usa.
 *
 * O papel (`imagem`, `video`) é vocabulário desta rota; o preset é vocabulário
 * do PRODUTO, e é ele que atravessa as três frentes. Amarrar os dois aqui é o
 * que faz "imagem da loja" e "imagem do criativo" quererem dizer o mesmo
 * modelo — que era justamente o que não acontecia.
 */
export const PRESET_DO_PAPEL: Readonly<Record<PapelMagnific, string | null>> = Object.freeze({
  imagem: "imagem-padrao",
  video: "video-curto",
  /* Ampliar não é gerar uma peça: é operação avulsa, e o catálogo de presets
     não fala dela. Ver `AVULSOS` na tabela de preço do motor. */
  upscale: null,
});

/**
 * O identificador REST daquele preset, ou `null` quando ninguém o mediu.
 *
 * Vale repetir por que o `null` não vira um palpite: o mesmo modelo tem nome
 * diferente no MCP e no REST, e dois deles se contradizem — `imagen-nano-banana-2`
 * é o **Pro**, não o 2. Copiar o slug de um transporte para o outro gera imagem,
 * cobra crédito e entrega outra coisa, sem erro nenhum na tela.
 */
export function modeloDoPreset(presetId: string): string | null {
  const preset = presetPorId(presetId);
  return preset ? identificadorDe(preset, "rest") : null;
}

/**
 * O modelo padrão de um papel — do CATÁLOGO, e só dele quando ele responde.
 *
 * Antes era o primeiro item da lista de segurança acima, e o primeiro item era
 * `mystic`: um modelo que o produto nunca declarou, cujo preço ninguém mediu, e
 * que só estava ali por ordem alfabética do dia em que a lista nasceu. Toda
 * imagem de toda loja saía dele, porque a tela nunca manda `modelo`.
 *
 * O que sobra de fallback é DECLARADO, não silencioso: papel cujo preset não
 * tem identificador REST medido (vídeo, hoje) continua no primeiro da lista, e
 * `papeisForaDoCatalogo()` diz quais são — para a dívida aparecer numa lista em
 * vez de aparecer numa fatura.
 */
export function modeloPadrao(papel: PapelMagnific): string {
  const presetId = PRESET_DO_PAPEL[papel];
  const doCatalogo = presetId === null ? null : modeloDoPreset(presetId);
  if (doCatalogo !== null && modeloValido(papel, doCatalogo)) return doCatalogo;
  return MODELOS_MAGNIFIC[papel][0];
}

/** Os papéis que ainda caem no fallback, e por quê. Existe para o teste e para o handoff. */
export function papeisForaDoCatalogo(): { papel: PapelMagnific; motivo: string }[] {
  const fora: { papel: PapelMagnific; motivo: string }[] = [];
  for (const papel of Object.keys(PRESET_DO_PAPEL) as PapelMagnific[]) {
    const presetId = PRESET_DO_PAPEL[papel];
    if (presetId === null) {
      fora.push({ papel, motivo: "não é geração de peça: é operação avulsa, fora do catálogo de presets" });
      continue;
    }
    const modelo = modeloDoPreset(presetId);
    if (modelo === null) fora.push({ papel, motivo: `o preset "${presetId}" não tem identificador REST medido` });
    else if (!modeloValido(papel, modelo)) fora.push({ papel, motivo: `o catálogo pede "${modelo}", que não está na lista de segurança` });
  }
  return fora;
}

export function magnificDisponivel(chave: string | undefined): boolean {
  return typeof chave === "string" && chave.trim().length >= 8;
}

function extrair(payload: unknown): TarefaMagnific | null {
  const raiz = payload && typeof payload === "object" ? payload as Record<string, unknown> : {};
  const dados = raiz.data && typeof raiz.data === "object" ? raiz.data as Record<string, unknown> : raiz;
  const taskId = typeof dados.task_id === "string" ? dados.task_id : "";
  if (!taskId) return null;
  const gerado = Array.isArray(dados.generated) ? dados.generated : [];
  return {
    taskId,
    modelo: "",
    status: typeof dados.status === "string" ? dados.status : "CREATED",
    imagens: gerado.filter((item): item is string => typeof item === "string"),
  };
}

async function chamar(chave: string, caminho: string, init: RequestInit): Promise<unknown> {
  const resposta = await fetch(`${BASE}${caminho}`, {
    ...init,
    headers: { "content-type": "application/json", "x-magnific-api-key": chave, ...(init.headers ?? {}) },
  });
  if (!resposta.ok) {
    const detalhe = await resposta.text().catch(() => "");
    throw new Error(`MAGNIFIC_${resposta.status}${detalhe ? `: ${detalhe.slice(0, 180)}` : ""}`);
  }
  return resposta.json();
}

/**
 * Enquadramentos aceitos pela API. Lista fechada porque o valor vem da tela e
 * um enquadramento inválido derruba a geração inteira com erro de validação.
 */
export const ASPECTOS = Object.freeze([
  "square_1_1", "classic_4_3", "traditional_3_4", "widescreen_16_9", "social_story_9_16",
  "smartphone_horizontal_20_9", "smartphone_vertical_9_20", "standard_3_2", "portrait_2_3",
  "horizontal_2_1", "vertical_1_2", "social_5_4", "social_post_4_5",
]);

export function aspectoValido(valor: string): boolean {
  return ASPECTOS.includes(valor);
}

/** `widescreen_16_9` → `16:9`: o vocabulário curto que o Nano Banana usa. */
export function razaoCurta(aspecto: string): string {
  const partes = aspecto.match(/(\d+)_(\d+)$/);
  return partes ? `${partes[1]}:${partes[2]}` : "1:1";
}

function ehNanoBanana(modelo: string) {
  return modelo.includes("nano-banana");
}

/**
 * O corpo do pedido, no formato do modelo escolhido.
 *
 * Cada família fala uma língua: o Mystic quer `widescreen_16_9` e aceita
 * `styling.colors`; o Nano Banana quer `16:9` e `2K`, e não tem campo de
 * paleta — nele as cores entram pelo texto. Traduzir aqui evita a família
 * errada receber um campo que ela recusa, o que derruba a geração inteira.
 */
function corpoDoPedido(
  { papel, modelo, prompt, aspecto, cores, resolucao, imagemBase64 }:
    { papel: PapelMagnific; modelo: string; prompt: string; aspecto: string; cores: string[]; resolucao?: string; imagemBase64?: string },
): Record<string, unknown> {
  if (papel === "upscale") return { image: imagemBase64, prompt, scale_factor: "2x" };
  if (papel === "video") {
    const corpo: Record<string, unknown> = { prompt, aspect_ratio: aspecto };
    if (imagemBase64) corpo.image = imagemBase64;
    return corpo;
  }
  if (ehNanoBanana(modelo)) {
    return { prompt, aspect_ratio: razaoCurta(aspecto), resolution: (resolucao ?? "2k").toUpperCase() };
  }
  /**
   * A resolução vem da PEÇA, não de uma constante.
   *
   * Já foi `2k` para tudo, e o banner saía esticado — ele é recomposto em
   * 3000×1000, e ampliar de 2048 px pixeliza de verdade. A correção foi pôr
   * `4k` fixo, e ela trocou um defeito por outro: as cenas passaram a chegar
   * com 17,9 e 19,8 MB, o download arrastava a rodada inteira, e o que passava
   * do teto era descartado DEPOIS de gerado e pago.
   *
   * Quem sabe do que cada peça precisa é a peça: o banner continua em 4k
   * porque a composição exige, e cena e símbolo caem para 2k porque o destino
   * deles não usa mais que isso. Ver `RESOLUCAO` em `marca-imagens.ts`.
   */
  const corpo: Record<string, unknown> = { prompt, aspect_ratio: aspecto, resolution: resolucao ?? "2k" };
  /* `styling.colors` é o que faz a imagem sair na paleta da marca em vez de
     depender de o modelo obedecer as cores citadas no texto */
  const paleta = cores.filter((cor) => /^#[0-9a-f]{6}$/i.test(cor)).slice(0, 5);
  if (paleta.length) corpo.styling = { colors: paleta.map((cor) => ({ color: cor, weight: 1 })) };
  return corpo;
}

/** Abre a tarefa de geração. O resultado vem depois, por `consultarTarefa`. */
export async function pedirGeracao(
  chave: string,
  { papel, modelo, prompt, aspecto = "square_1_1", cores = [], resolucao, imagemBase64 }:
    { papel: PapelMagnific; modelo: string; prompt: string; aspecto?: string; cores?: string[]; resolucao?: string; imagemBase64?: string },
): Promise<TarefaMagnific> {
  if (!modeloValido(papel, modelo)) throw new Error("MODELO_NAO_PERMITIDO");
  if (papel !== "upscale" && !aspectoValido(aspecto)) throw new Error("ASPECTO_NAO_PERMITIDO");
  const corpo = corpoDoPedido({ papel, modelo, prompt, aspecto, cores, resolucao, imagemBase64 });
  const bruto = await chamar(chave, `/v1/ai/${modelo}`, { method: "POST", body: JSON.stringify(corpo) });
  const tarefa = extrair(bruto);
  if (!tarefa) throw new Error("MAGNIFIC_SEM_TASK_ID");
  return { ...tarefa, modelo };
}

export async function consultarTarefa(chave: string, papel: PapelMagnific, modelo: string, taskId: string): Promise<TarefaMagnific> {
  if (!modeloValido(papel, modelo)) throw new Error("MODELO_NAO_PERMITIDO");
  if (!/^[a-z0-9-]{8,64}$/i.test(taskId)) throw new Error("TASK_ID_INVALIDO");
  const bruto = await chamar(chave, `/v1/ai/${modelo}/${taskId}`, { method: "GET" });
  const tarefa = extrair(bruto);
  if (!tarefa) throw new Error("MAGNIFIC_RESPOSTA_INVALIDA");
  return { ...tarefa, modelo };
}

/**
 * O texto que descreve a imagem da loja para o modelo.
 *
 * Fica aqui, e não na tela, porque é a tradução da marca gerada para a língua
 * do modelo — muda junto com o gerador, não com o layout.
 */
export function promptDaVitrine({ nicho, marca, paleta }: { nicho: string; marca: string; paleta: string[] }): string {
  return [
    `Fotografia publicitária de vitrine para uma loja de ${nicho}, marca "${marca}".`,
    `Paleta dominante: ${paleta.join(", ")}.`,
    "Luz natural suave, composição limpa com espaço para texto à esquerda, sem letras nem logotipos na imagem, sem marca d'água.",
  ].join(" ");
}
