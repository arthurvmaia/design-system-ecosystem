/**
 * Contagem de espaços de mídia de uma seção, num lugar só.
 *
 * A tela de Mídia tinha DUAS contas que divergiam: o selo do cabeçalho separava
 * imagem de vídeo, e a frase de `sugerirMidiaDaSecao` (que vive no shared e não
 * é deste escopo) soma tudo como "imagem". Numa seção com 2 espaços de imagem e
 * 1 de vídeo, o selo dizia uma coisa e a frase dizia "Há 3 espaços de imagem"
 * logo abaixo. Duas contas na mesma tela é o padrão que já mordeu este repo em
 * outras formas: uma delas sempre acaba mentindo.
 *
 * A conta separada vence, porque é a que diz a verdade sobre os espaços. A
 * frase não é reescrita do zero: ela é COMPOSTA por cima da frase do shared,
 * trocando só o prefixo "Há N espaços de imagem" pela versão separada quando há
 * vídeo. Se o shared mudar a redação, o prefixo não casa e a frase original sai
 * intacta: degrada para o comportamento de hoje, nunca para quebrado.
 */

export type ContagemDeEspacos = { imagens: number; videos: number };

/** O que a conta precisa saber do contrato de uma peça (subset de `KitContratoResumo`). */
export type ContratoContavel = {
  disponivel: boolean;
  midias: ReadonlyArray<{ tipo: string }>;
};

/**
 * Soma os espaços declarados pelos contratos LEGÍVEIS das peças de uma seção.
 * Contrato indisponível não entra: chutar por ele produziria um número que
 * ninguém sabe de onde veio, a mesma regra de `sugerirMidiaDaSecao`.
 */
export const contarEspacos = (contratos: ReadonlyArray<ContratoContavel>): ContagemDeEspacos => {
  let imagens = 0;
  let videos = 0;
  for (const c of contratos) {
    if (!c.disponivel) continue;
    for (const m of c.midias) {
      if (m.tipo === 'video') videos += 1;
      else imagens += 1;
    }
  }
  return { imagens, videos };
};

/** "2 de imagem, 1 de vídeo": o formato da frase da seção. Null quando não há espaço. */
export const rotuloDeEspacos = (c: ContagemDeEspacos): string | null => {
  const partes = [
    c.imagens > 0 ? `${c.imagens} de imagem` : null,
    c.videos > 0 ? `${c.videos} de vídeo` : null,
  ].filter((x): x is string => x !== null);
  return partes.length > 0 ? partes.join(', ') : null;
};

/** "2 imagens · 1 vídeo": o selo curto do cabeçalho. Null quando não há o que dizer. */
export const seloDeEspacos = (c: ContagemDeEspacos): string | null => {
  const partes = [
    c.imagens > 0 ? `${c.imagens} ${c.imagens === 1 ? 'imagem' : 'imagens'}` : null,
    c.videos > 0 ? `${c.videos} ${c.videos === 1 ? 'vídeo' : 'vídeos'}` : null,
  ].filter((x): x is string => x !== null);
  return partes.length > 0 ? partes.join(' · ') : null;
};

/** O prefixo que `nomeDeQuantas()` do shared põe na frase. É só ele que trocamos. */
const PREFIXO_DO_SHARED = /^Há \d+ espaços? de imagem/;

/**
 * A frase do porquê com a conta separada. Sem vídeo, as duas contas coincidem e
 * a frase do shared já está certa; com vídeo, o prefixo é trocado por
 * "Há N de imagem, M de vídeo". Prefixo ausente (fonte 'etapa'/'nenhuma', ou
 * redação nova no shared) devolve a frase como veio.
 */
export const fraseComEspacosSeparados = (porque: string, c: ContagemDeEspacos): string => {
  if (c.videos === 0) return porque;
  const rotulo = rotuloDeEspacos(c);
  if (rotulo === null || !PREFIXO_DO_SHARED.test(porque)) return porque;
  return porque.replace(PREFIXO_DO_SHARED, `Há ${rotulo}`);
};

/**
 * O selo e a frase saindo da MESMA conta.
 *
 * `fonte` decide qual conta vale: com peça conhecida ('peca'/'peca-e-etapa') a
 * verdade é o contrato, separado por tipo; sem peça conhecida a sugestão vem da
 * etapa de marketing, que só fala de imagem, e aí `quantas` é a única conta que
 * existe.
 */
export const contagemUnificada = (
  sugestao: { quantas: number; porque: string; fonte: string },
  daSecao: ContagemDeEspacos,
): { selo: string | null; porque: string } => {
  const efetiva =
    sugestao.fonte === 'peca' || sugestao.fonte === 'peca-e-etapa'
      ? daSecao
      : { imagens: sugestao.quantas, videos: 0 };
  return {
    selo: seloDeEspacos(efetiva),
    porque: fraseComEspacosSeparados(sugestao.porque, efetiva),
  };
};
