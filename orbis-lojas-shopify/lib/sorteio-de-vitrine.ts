import type { ShopifyBlockInstance, ShopifySectionInstance, ShopifyThemeImport } from "./shopify-theme";

/**
 * DUAS LOJAS DO MESMO TEMA NÃO PRECISAM SER A MESMA LOJA.
 *
 * O tema importado é um só, e todo cliente que o escolhe recebia a home na
 * ordem exata em que ela veio do ZIP. Medido no acervo: dentro de um nicho já
 * variam o nome, a paleta (3), o par de fontes (3), a voz e as artes — mas a
 * PÁGINA era idêntica, e é ela que a pessoa vê primeiro.
 *
 * Este módulo embaralha o que é intercambiável, e só isso.
 *
 * ## A regra: só irmãos do MESMO tipo trocam de lugar
 *
 * Três `image-banner` na home são três vagas equivalentes; permutar entre elas
 * dá uma página diferente e continua fazendo sentido. Já um `heading` e um
 * `buttons` dentro da mesma seção não são intercambiáveis — trocá-los põe o
 * botão acima do título.
 *
 * A mesma regra vale nos dois níveis, e ela não depende de conhecer o tema:
 * o `type` está no dado. Por isso funciona com QUALQUER tema importado, e não
 * só com o Dawn.
 *
 * ## Por que isto não quebra o template
 *
 * Nada é inventado: a saída é uma PERMUTAÇÃO de ids que já existiam, e é isso
 * que a diferencia do acidente que derrubou uma home para 404 (um data URI
 * escrito num `image_picker`, ou seja, um valor novo e inválido). Aqui nenhum
 * `setting` novo é escrito. E a exportação já regrava as duas ordens a partir
 * destes vetores — `order` em `theme-export.ts` e `block_order` logo acima —,
 * então prévia e ZIP saem iguais sem encanamento novo.
 *
 * ## Antes da marca, nunca depois
 *
 * As regras de dobra são POSICIONAIS e pertencem ao dono: "a primeira dobra
 * fica calada e a segunda escreve" foi pedido por escrito, e a frase da segunda
 * vem assada no pixel. Sortear DEPOIS moveria a dobra que escreve para o topo e
 * passaria por cima disso em silêncio.
 *
 * Sorteando antes, o que varia é QUAL seção ocupa cada vaga — com a altura, o
 * esquema de cor e o véu que ela trouxe do tema —, e a distribuição de artes e
 * textos roda sobre a ordem já sorteada. O contrato do dono continua de pé.
 *
 * ## Só a home
 *
 * `index` é onde moram as vagas de marketing. Página de produto e de coleção
 * têm blocos que são estrutura, não vitrine — reordenar `price` e `description`
 * seria mexer onde ninguém pediu.
 *
 * ## A semente
 *
 * O sorteio é DETERMINÍSTICO. Aleatório de verdade faria a prévia mostrar uma
 * loja e o ZIP sair com outra, e regerar embaralharia a loja que o cliente já
 * aprovou. Com semente, a mesma loja sai sempre igual para AQUELE cliente e
 * diferente entre clientes — que é exatamente o pedido.
 */

/** Hash FNV-1a: a mesma que o gerador de marca usa, pelo mesmo motivo. */
function hashDaSemente(semente: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < semente.length; i += 1) {
    hash ^= semente.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

/** Xorshift32: pequeno, sem dependência, e igual em qualquer runtime. */
function sorteador(semente: string): () => number {
  let estado = hashDaSemente(semente) || 1;
  return () => {
    estado ^= (estado << 13) >>> 0; estado >>>= 0;
    estado ^= estado >>> 17;
    estado ^= (estado << 5) >>> 0; estado >>>= 0;
    return estado / 0x100000000;
  };
}

function embaralhar<T>(itens: readonly T[], sortear: () => number): T[] {
  const copia = [...itens];
  for (let i = copia.length - 1; i > 0; i -= 1) {
    const j = Math.floor(sortear() * (i + 1));
    const guarda = copia[i];
    copia[i] = copia[j];
    copia[j] = guarda;
  }
  return copia;
}

/**
 * Permuta apenas os irmãos de mesmo `type`, mantendo cada tipo nas vagas que
 * ele já ocupava. Um `newsletter` no fim continua no fim; três banners entre si
 * trocam de ordem.
 */
function permutarIrmaos<T extends { type: string }>(itens: readonly T[], sortear: () => number): { itens: T[]; movidos: number } {
  const porTipo = new Map<string, number[]>();
  itens.forEach((item, indice) => {
    const vagas = porTipo.get(item.type);
    if (vagas) vagas.push(indice);
    else porTipo.set(item.type, [indice]);
  });

  const saida = [...itens];
  let movidos = 0;
  for (const vagas of porTipo.values()) {
    if (vagas.length < 2) continue;
    const sorteados = embaralhar(vagas.map((indice) => itens[indice]), sortear);
    vagas.forEach((vaga, ordem) => {
      saida[vaga] = sorteados[ordem];
      if (sorteados[ordem] !== itens[vaga]) movidos += 1;
    });
  }
  return { itens: saida, movidos };
}

export type ResultadoDoSorteio = { theme: ShopifyThemeImport; movidos: number };

/** A página cujas vagas são de marketing, e a única que o sorteio toca. */
export const PAGINA_SORTEADA = "index";

/**
 * Devolve o tema com a home sorteada a partir da semente.
 *
 * Sem semente, devolve o tema como está: um sorteio sem semente seria ruído,
 * não variedade. E um tema já sorteado com a MESMA semente também volta como
 * está — aplicar a permutação duas vezes não é o mesmo que aplicá-la uma, e
 * essa é a diferença entre "estável para aquele cliente" e "muda a cada
 * render".
 */
export function sortearVitrine(theme: ShopifyThemeImport, semente: string): ResultadoDoSorteio {
  const chave = String(semente ?? "").trim();
  if (!chave || theme.orbisSorteio === chave) return { theme, movidos: 0 };

  const sortear = sorteador(chave);
  let movidos = 0;
  const pages = theme.pages.map((page) => {
    if (page.id !== PAGINA_SORTEADA) return page;

    /* os blocos primeiro, seção a seção, e sempre na ordem ORIGINAL: o gerador
       é consumido em sequência, e mudar a ordem das chamadas mudaria o
       resultado de uma mesma semente */
    const comBlocos: ShopifySectionInstance[] = page.sections.map((secao) => {
      if (secao.blocks.length < 2) return secao;
      const resultado = permutarIrmaos<ShopifyBlockInstance>(secao.blocks, sortear);
      movidos += resultado.movidos;
      return resultado.movidos ? { ...secao, blocks: resultado.itens } : secao;
    });

    const resultado = permutarIrmaos<ShopifySectionInstance>(comBlocos, sortear);
    movidos += resultado.movidos;
    return { ...page, sections: resultado.itens };
  });

  return { theme: { ...theme, pages, orbisSorteio: chave }, movidos };
}
