import postcss from 'postcss';

/**
 * Analisar a folha de uma origem sem ser mais exigente que o navegador.
 *
 * Todo passo do compositor — escopo, recoloração, retipografia, reescala,
 * inventário — começa por um `postcss.parse` e, quando ele lança, desiste
 * daquela origem com um aviso. Cada um desses caminhos de desistência foi
 * escrito com boa intenção; juntos, eles transformam UM caractere torto numa
 * origem que atravessa o site inteira sem escopo, sem a cor da marca e sem a
 * tipografia dela.
 *
 * Medido: uma folha de 99 KB do acervo tinha uma `}` a mais no meio. O
 * navegador ignora a chave órfã e desenha a página; o `postcss.parse` estrito
 * lança. Sem escopo, os utilitários daquela origem passaram a valer para o
 * DOCUMENTO TODO — o `.grid-cols-1` dela venceu o `lg:grid-cols-12` de outra e
 * o hero de três colunas virou três blocos empilhados, com o lado direito
 * vazio; um `.hidden` alheio apagou a linha vertical que se preenche na
 * rolagem. Dois defeitos que o dono viu, uma chave a mais.
 *
 * Por isso a análise mora aqui, num lugar só: quem chama não precisa lembrar de
 * tolerar, e o que for reparado é DITO — reparo calado seria a mesma falha
 * silenciosa, só que ao contrário.
 */

/** O que o equilíbrio precisou mexer. */
export type ReparoDeChaves = { sobrando: number; faltando: number };

/**
 * Equilibra as chaves de uma folha, como o navegador faz.
 *
 * A régua é a dele: `}` sem bloco aberto é descartada, e bloco que o arquivo
 * esqueceu de fechar é fechado no fim. Comentário e string ficam de fora da
 * contagem — a chave dentro de `content: "}"` é conteúdo, não sintaxe.
 */
export const equilibrarChaves = (css: string): { css: string } & ReparoDeChaves => {
  let saida = '';
  let profundidade = 0;
  let sobrando = 0;
  let i = 0;
  while (i < css.length) {
    const c = css[i];
    if (c === '/' && css[i + 1] === '*') {
      const fim = css.indexOf('*/', i + 2);
      const ate = fim === -1 ? css.length : fim + 2;
      saida += css.slice(i, ate);
      i = ate;
      continue;
    }
    if (c === '"' || c === "'") {
      // A string vai até a aspa igual não escapada. Sem isto, um `content:"{"`
      // abriria um bloco que não existe e o resto da folha sairia deslocado.
      let j = i + 1;
      while (j < css.length && css[j] !== c) j += css[j] === '\\' ? 2 : 1;
      saida += css.slice(i, Math.min(j + 1, css.length));
      i = j + 1;
      continue;
    }
    if (c === '{') {
      profundidade++;
    } else if (c === '}') {
      if (profundidade === 0) {
        sobrando++;
        i++;
        continue;
      }
      profundidade--;
    }
    saida += c;
    i++;
  }
  return { css: saida + '}'.repeat(profundidade), sobrando, faltando: profundidade };
};

/** A folha analisada, com o que foi preciso reparar — ou o motivo de não dar. */
export type AnaliseDeCss = { raiz: postcss.Root; reparo: ReparoDeChaves | null } | { erro: string };

/**
 * Analisa a folha, equilibrando as chaves se for isso que a impede.
 *
 * O que isto NÃO faz é adivinhar: se a folha continuar sem analisar depois de
 * equilibrada — colchete sem fechar, string aberta — o erro sobe e quem chama
 * segue pelo caminho de desistência de sempre.
 */
export const analisarCss = (css: string): AnaliseDeCss => {
  try {
    return { raiz: postcss.parse(css), reparo: null };
  } catch (primeiro) {
    const r = equilibrarChaves(css);
    if (r.sobrando === 0 && r.faltando === 0) {
      return { erro: primeiro instanceof Error ? primeiro.message : String(primeiro) };
    }
    try {
      return { raiz: postcss.parse(r.css), reparo: { sobrando: r.sobrando, faltando: r.faltando } };
    } catch (segundo) {
      return { erro: segundo instanceof Error ? segundo.message : String(segundo) };
    }
  }
};

/** A frase que descreve o reparo, para quem chama declarar junto dos avisos. */
export const avisoDeReparo = (reparo: ReparoDeChaves): string => {
  const partes = [
    reparo.sobrando > 0 ? `${reparo.sobrando} chave(s) \`}\` sobrando, descartada(s)` : '',
    reparo.faltando > 0 ? `${reparo.faltando} bloco(s) sem fechar, fechado(s) no fim` : '',
  ].filter((p) => p !== '');
  return `A folha desta origem estava desequilibrada (${partes.join('; ')}) e foi equilibrada para poder ser lida — o navegador faz o mesmo. Sem isto ela seguiria sem escopo e atropelaria as outras origens.`;
};
