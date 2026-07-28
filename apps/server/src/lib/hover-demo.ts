/**
 * Demonstração de hover sem ponteiro.
 *
 * `:hover` não se aciona por código: o navegador só o aplica com um ponteiro de
 * verdade sobre o elemento, e nenhuma API de página muda isso. Então a prévia
 * não conseguia mostrar sozinha o que acontece ao passar o mouse — a pessoa
 * tinha de descobrir passando o mouse, e num card pequeno raramente descobria.
 *
 * A saída é honesta e não simula nada: as MESMAS declarações que o site escreveu
 * para `:hover` são reescritas para uma classe (`.ds-hv`), e a prévia liga essa
 * classe num elemento de cada vez. O que aparece é exatamente o que o CSS do
 * site manda aparecer no hover, aplicado de propósito em vez de por acaso.
 *
 * A classe entra JUNTO do seletor original (`.btn:hover` vira `.btn.ds-hv`), o
 * que preserva a especificidade da regra e ainda soma uma classe — então ela
 * vence a regra normal do mesmo jeito que o hover venceria.
 */

export type RegraHover = {
  /** Seletor original, com `:hover`. */
  original: string;
  /** Seletor equivalente por classe, para a demonstração. */
  demo: string;
  /** Seletor do elemento que RECEBE a classe (a parte antes do `:hover`). */
  alvo: string;
  declaracoes: string;
};

/** Corta o CSS em blocos `seletor { declarações }`, respeitando aninhamento. */
const blocos = (css: string): Array<{ seletor: string; corpo: string; aninhado: boolean }> => {
  const saida: Array<{ seletor: string; corpo: string; aninhado: boolean }> = [];
  let i = 0;
  let inicioSeletor = 0;
  while (i < css.length) {
    const c = css[i];
    if (c === '{') {
      const seletor = css.slice(inicioSeletor, i).trim();
      let nivel = 1;
      let j = i + 1;
      while (j < css.length && nivel > 0) {
        if (css[j] === '{') nivel++;
        else if (css[j] === '}') nivel--;
        j++;
      }
      const corpo = css.slice(i + 1, j - 1);
      // `@media`/`@supports` guardam outras regras dentro; o resto é declaração.
      saida.push({ seletor, corpo, aninhado: seletor.startsWith('@') });
      inicioSeletor = j;
      i = j;
      continue;
    }
    i++;
  }
  return saida;
};

/**
 * O elemento que recebe a classe é o que carrega o `:hover`. Em
 * `.card:hover .titulo`, quem sofre o hover é `.card`; o `.titulo` só reage.
 */
const alvoDoSeletor = (seletor: string): string => {
  const corte = seletor.indexOf(':hover');
  return seletor.slice(0, corte).trim();
};

/** Só o hover interessa: `:focus` e afins já são demonstráveis por foco real. */
const TEM_HOVER = /:hover(?![\w-])/;

/**
 * Extrai as regras de hover de um CSS e devolve a versão por classe.
 *
 * Ignora regra cujo alvo é vazio (um `:hover` solto, que casaria com tudo) e
 * regra dentro de `@media` de impressão. Aceita seletor com vírgula: cada parte
 * vira uma regra própria, senão uma parte sem hover arrastaria a outra.
 */
export const extrairRegrasHover = (css: string, dentroDeMedia = false): RegraHover[] => {
  const saida: RegraHover[] = [];
  for (const b of blocos(css)) {
    if (b.aninhado) {
      if (/print/i.test(b.seletor)) continue;
      saida.push(...extrairRegrasHover(b.corpo, true));
      continue;
    }
    const partes = b.seletor.split(',').map((s) => s.trim());
    for (const parte of partes) {
      if (!TEM_HOVER.test(parte)) continue;
      const alvo = alvoDoSeletor(parte);
      if (alvo.length === 0) continue;
      const declaracoes = b.corpo.trim();
      if (declaracoes.length === 0) continue;
      saida.push({
        original: parte,
        demo: parte.replace(/:hover(?![\w-])/g, '.ds-hv'),
        alvo,
        declaracoes,
      });
    }
  }
  void dentroDeMedia;
  return saida;
};

/** Teto: um site grande tem centenas de regras de hover e a demo não precisa delas. */
const MAX_REGRAS = 300;

export type DemoDeHover = {
  /** CSS a injetar no documento da prévia. */
  estilo: string;
  /** Seletores que recebem a classe, na ordem em que aparecem. */
  alvos: string[];
};

/**
 * Monta o CSS da demonstração e a lista de alvos, a partir de um ou mais CSS.
 * Devolve `null` quando o site não tem hover nenhum — aí não há o que oferecer.
 */
export const montarDemoDeHover = (cssTexts: readonly string[]): DemoDeHover | null => {
  const regras: RegraHover[] = [];
  for (const css of cssTexts) {
    for (const r of extrairRegrasHover(css)) {
      if (regras.length >= MAX_REGRAS) break;
      regras.push(r);
    }
  }
  if (regras.length === 0) return null;

  const linhas = regras.map((r) => `${r.demo}{${r.declaracoes}}`);
  const alvos: string[] = [];
  for (const r of regras) if (!alvos.includes(r.alvo)) alvos.push(r.alvo);
  return { estilo: linhas.join('\n'), alvos };
};
