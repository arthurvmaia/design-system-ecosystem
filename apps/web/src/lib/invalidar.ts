import type { QueryClient } from '@tanstack/react-query';

/**
 * O grafo de dependência entre as telas, num lugar só.
 *
 * ## O problema que isto resolve
 *
 * As listas de invalidação viviam espalhadas: o detalhe da peça invalidava
 * `library` e `kits`; a exclusão em lote invalidava `library` e `segments` — e
 * **não** `kits`, que é justamente quem muda quando uma peça sai. Duas telas
 * fazendo a mesma coisa com listas diferentes é como uma delas fica velha sem
 * ninguém notar.
 *
 * Aqui a pergunta é outra: **o que depende do quê**. Quem mexe numa peça chama
 * `aoMudarPeca` e não precisa lembrar da lista.
 *
 * ## A ordem das dependências
 *
 * ```
 * captura  →  peça (segmento)  →  peça guardada  →  kit  →  projeto  →  site
 * ```
 *
 * Mexer num nível invalida ele e TUDO à direita. Nunca à esquerda: guardar uma
 * peça não muda a captura de onde ela veio.
 *
 * A regra de ouro, e o motivo de o grafo existir: **na dúvida, invalidar a
 * mais**. Uma requisição extra custa milissegundos numa API local; uma tela
 * velha faz a pessoa desconfiar do sistema inteiro.
 */

/** Uma peça guardada mudou de nome, de categoria, ou saiu da Biblioteca. */
export const aoMudarPeca = (qc: QueryClient): void => {
  // A própria Biblioteca, e a Galeria — que marca `inLibrary` em cada segmento.
  qc.invalidateQueries({ queryKey: ['library'] });
  qc.invalidateQueries({ queryKey: ['segments'] });
  // Os kits: o design system consolidado deles nasce das peças. O servidor já
  // reconsolidou; sem isto a tela continuaria mostrando a paleta antiga.
  qc.invalidateQueries({ queryKey: ['kits'] });
  qc.invalidateQueries({ queryKey: ['kit-design-system'] });
  // E os projetos, que carregam o kit escolhido.
  qc.invalidateQueries({ queryKey: ['projects'] });
};

/** Um kit mudou de nome, de peças ou de regras. */
export const aoMudarKit = (qc: QueryClient): void => {
  qc.invalidateQueries({ queryKey: ['kits'] });
  qc.invalidateQueries({ queryKey: ['kit-design-system'] });
  qc.invalidateQueries({ queryKey: ['projects'] });
};

/**
 * Uma captura foi apagada, ou os segmentos dela foram refeitos.
 *
 * É a de maior alcance: uma captura que some leva os segmentos dela, e as peças
 * já guardadas perdem a referência de origem (viram cópias órfãs, que é o
 * combinado — elas sobrevivem, mas a procedência muda).
 */
export const aoMudarCaptura = (qc: QueryClient): void => {
  qc.invalidateQueries({ queryKey: ['design-systems'] });
  qc.invalidateQueries({ queryKey: ['segments'] });
  qc.invalidateQueries({ queryKey: ['rejeitados'] });
  aoMudarPeca(qc);
};
