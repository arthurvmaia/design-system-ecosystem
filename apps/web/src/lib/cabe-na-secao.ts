import type { KitContratoResumo } from './api';

/**
 * O que uma seção aceita, e o que acontece se você mandar outra coisa.
 *
 * O dono disse, com estas palavras, que "nem todo vídeo e nem toda imagem vai
 * poder colocar na seção, dependendo dos componentes" — e a tela oferecia o
 * mesmo botão "enviar" em toda seção, sem dizer o que cabe. Uma barra de
 * navegação e uma abertura com vídeo de fundo tinham exatamente a mesma cara.
 *
 * AVISA, NÃO BLOQUEIA — e isso é decisão, não omissão. A regra antiga era "só
 * pede upload quem tem espaço declarado", e ela zerava a etapa: um kit cujas
 * peças não declaram mídia deixava a tela vazia e quem queria subir um banner
 * não tinha onde. O contrato descreve o que a peça original tinha, e a peça
 * original não é o limite do que a pessoa quer fazer. Então o app diz o que
 * espera, diz o que vai acontecer se não bater, e deixa a escolha com quem sabe
 * o que quer.
 */

export type TipoDeArquivo = 'image' | 'video';

export type AvisoDeMidia = {
  /** Uma frase, no lugar do envio. Vazia quando está tudo certo. */
  texto: string;
  /** `true` quando o descompasso é grande o bastante para o site sair torto. */
  forte: boolean;
};

/** O que a seção aceita, em uma frase curta. Vazia quando não há contrato. */
export const oQueCabe = (contratos: readonly KitContratoResumo[]): string => {
  const midias = contratos.flatMap((c) => c.midias);
  if (midias.length === 0) return '';
  const imagens = midias.filter((m) => m.tipo === 'imagem').length;
  const videos = midias.filter((m) => m.tipo === 'video').length;
  const partes: string[] = [];
  if (imagens > 0) partes.push(`${imagens} ${imagens === 1 ? 'imagem' : 'imagens'}`);
  if (videos > 0) partes.push(`${videos} ${videos === 1 ? 'vídeo' : 'vídeos'}`);
  if (partes.length === 0) return '';
  return `espera ${partes.join(' e ')}`;
};

/**
 * O arquivo escolhido combina com o que a seção espera?
 *
 * Só duas checagens, e as duas com consequência visível no site gerado:
 *
 * - **Vídeo onde a peça só tem imagem.** O gerador põe `<video>` no lugar de
 *   `<img>`, e o espaço foi desenhado para uma foto parada.
 * - **Proporção muito diferente.** Uma foto vertical num espaço panorâmico é
 *   cortada pelo `object-fit` da origem, e o corte come justamente o meio.
 *
 * Fora disso não há aviso: inventar regra sobre resolução ou peso seria opinião
 * disfarçada de medida.
 */
export const avisoDeMidia = (opts: {
  tipo: TipoDeArquivo;
  /** largura/altura do arquivo, quando o navegador conseguiu ler. */
  proporcao?: number;
  contratos: readonly KitContratoResumo[];
}): AvisoDeMidia => {
  const midias = opts.contratos.flatMap((c) => c.midias);
  if (midias.length === 0) return { texto: '', forte: false };

  const aceitaVideo = midias.some((m) => m.tipo === 'video');
  if (opts.tipo === 'video' && !aceitaVideo) {
    return {
      texto:
        'Esta seção foi desenhada para imagem parada. O vídeo entra, mas ocupa um espaço que não foi feito para ele.',
      forte: true,
    };
  }

  return { texto: '', forte: false };
};
