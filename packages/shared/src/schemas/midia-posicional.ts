/**
 * Mídia POSICIONAL: a imagem ou o vídeo que não está simplesmente numa seção —
 * está num ponto do scroll.
 *
 * Numa peça com efeito guiado por rolagem, a mídia não é "uma imagem": é "esta
 * imagem entre 20% e 60% da rolagem, movendo mais devagar que o resto". Trocar
 * esse arquivo por outro sem saber disso produz um site que parece quebrado sem
 * ninguém entender por quê.
 *
 * ## O que esta medida faz, e o que ela DELIBERADAMENTE não faz
 *
 * Ela DECLARA: cruza o que a captura já mediu (as mídias detectadas e os
 * comportamentos de scroll, com o alvo de cada um) e diz quais mídias estão sob
 * efeito de rolagem e em que intervalo.
 *
 * Ela NÃO oferece a troca dessa mídia. A ordem está escrita no diagnóstico e
 * tem motivo: oferecer mídia posicional numa peça que a pessoa não sabe se
 * funciona é vender o que não se pode entregar. Enquanto o veredito de cápsula
 * não chegar à tela — hoje 8 de 9 reprovaram na validação visual e o resultado
 * é descartado antes da UI —, o app diz o que sabe e para por aí.
 *
 * Declarar sem oferecer não é meio caminho: é a metade que se pode sustentar.
 */

/** Um comportamento de scroll, como o motor grava. Só o que interessa aqui. */
export type ComportamentoParaAncora = {
  kind: string;
  start: number;
  end: number;
  scrub: boolean;
  pin: boolean;
  target?: { id?: string | null; classes?: readonly string[] } | null;
};

/** Uma mídia detectada, como o motor grava. Só o que interessa aqui. */
export type MidiaParaAncora = {
  id: string;
  kind: string;
  fingerprint?: {
    id?: string | null;
    stableClasses?: readonly string[];
  } | null;
};

export type AncoraDeMidia = {
  midiaId: string;
  /** O tipo de efeito: `parallax`, `sticky`, `reveal`… */
  efeito: string;
  /** Onde na rolagem, em fração 0..1 da página. */
  de: number;
  ate: number;
  /** O movimento acompanha a rolagem quadro a quadro (e não só dispara). */
  acompanhaRolagem: boolean;
};

/** Dois alvos são o mesmo elemento? Id bate, ou as classes estáveis batem. */
const mesmoElemento = (
  midia: MidiaParaAncora,
  alvo: ComportamentoParaAncora['target'],
): boolean => {
  if (alvo == null) return false;
  const idMidia = midia.fingerprint?.id ?? null;
  if (idMidia != null && idMidia !== '' && alvo.id === idMidia) return true;

  const classesMidia = midia.fingerprint?.stableClasses ?? [];
  const classesAlvo = alvo.classes ?? [];
  if (classesMidia.length === 0 || classesAlvo.length === 0) return false;
  // Exigir a lista INTEIRA, e não uma interseção qualquer: duas divs com
  // `fixed` em comum não são o mesmo elemento, e casar por pouco produziria
  // âncora inventada — que é pior que âncora nenhuma.
  const conjunto = new Set(classesAlvo);
  return classesMidia.every((c) => conjunto.has(c));
};

/**
 * As mídias que estão presas a um ponto da rolagem.
 *
 * Comportamento sem alvo identificável não gera âncora: quando não dá para
 * afirmar de quem é o efeito, não se atribui — a mesma regra que a conferência
 * de pixel já segue.
 */
export const ancorasDeMidia = (
  midias: readonly MidiaParaAncora[],
  comportamentos: readonly ComportamentoParaAncora[],
): AncoraDeMidia[] => {
  const achadas: AncoraDeMidia[] = [];
  for (const m of midias) {
    for (const c of comportamentos) {
      if (!mesmoElemento(m, c.target)) continue;
      achadas.push({
        midiaId: m.id,
        efeito: c.kind,
        de: c.start,
        ate: c.end,
        acompanhaRolagem: c.scrub || c.pin,
      });
    }
  }
  return achadas;
};

/** A âncora em uma frase de gente. Vazio quando não há o que dizer. */
export const explicarAncora = (a: AncoraDeMidia): string => {
  const faixa =
    a.de <= 0 && a.ate >= 1
      ? 'ao longo da página inteira'
      : `entre ${Math.round(a.de * 100)}% e ${Math.round(a.ate * 100)}% da rolagem`;
  const como = a.acompanhaRolagem
    ? 'e acompanha a rolagem quadro a quadro'
    : 'e é disparada ao chegar ali';
  return `Esta mídia se move ${faixa}, ${como}. Trocar o arquivo mantém o movimento, mas o novo precisa funcionar nesse enquadramento.`;
};
