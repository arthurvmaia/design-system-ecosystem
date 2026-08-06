import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { lerCssDoBundle } from './cascata.js';

/**
 * O que sobrou da ponte entre o bundle e o `@ds/composer`.
 *
 * Este arquivo já teve `lerPecaDoBundle` e `comporPecasDoKit` — a composição de
 * um kit em um passo. As duas foram removidas porque `montarPaginaDoKit`
 * (`pagina.ts`) passou a fazer o mesmo trabalho com mais contexto (seções,
 * marca, mídia, cascata das quatro folhas), e nenhuma chamada de produção
 * sobrou nelas: só os testes delas mesmas.
 *
 * Duas implementações da mesma composição não são redundância inofensiva. A
 * cópia morta tinha `manterCoresOriginais`, um interruptor que ninguém ligava,
 * enquanto a viva decide o mesmo por `ehPecaDeFundo`. Consertar um defeito de
 * composição na cópia errada é o tipo de erro que não dá sintoma — o teste
 * passa e a tela não muda. O que o composer garante (escopo por origem, proxies,
 * keyframes renomeados, especificidade zero) segue testado no
 * `@ds/composer`, e o caminho vivo, em `pagina.test.ts`.
 *
 * O que ficou aqui é o que só existe aqui.
 */

/**
 * Remove do corpo da peça os `<script>` locais que COMPILAM CSS em runtime.
 *
 * O caso medido: o runtime do Tailwind CDN (407 KB) foi localizado para dentro
 * dos bundles pelo motor, e o corpo da peça o carrega como
 * `<script src="js/<hash>.js">`. No site COMPOSTO ele roda de novo, varre os
 * nomes de classe e injeta um `<style>` com as utilitárias recompiladas — com
 * os literais de cor ORIGINAIS, por cima da recoloração e do `marca.css`. A
 * página inteira volta às cores do site de origem sem nenhum erro aparecer.
 *
 * O CSS que ele compilaria JÁ ESTÁ nos arquivos do bundle (o coletor capturou
 * o CSSOM depois da página rodar; é o motivo de o bundle levar o CSS inteiro).
 * No site gerado, esse script é duplicação — e destrutiva.
 *
 * A detecção é por CONTEÚDO (`tailwindcss` no arquivo), não por nome: o hash
 * do arquivo muda por captura. Falso positivo exigiria um script de site que
 * cite "tailwindcss" no código — e ser removido do site GERADO (o bundle em si
 * não muda) é degradação aceitável, declarada no aviso.
 *
 * A remoção é VERIFICADA, não assumida: só acontece quando o CSS do bundle da
 * peça carrega de fato a saída do compilador (a marca `--tw-` do preflight).
 * O aviso antigo afirmava "o CSS compilado já viaja nos arquivos do bundle"
 * como texto fixo — numa peça promovida antes de o coletor capturar o CSSOM,
 * remover o script era remover o ÚNICO estilo que ela tinha. Sem a marca, o
 * script fica, e o chamador declara a permanência (`mantidos`).
 *
 * O que sai no lugar não é um comentário: é um STUB que define `window.tailwind`.
 * O runtime do CDN cria esse global, e o script de CONFIGURAÇÃO da página
 * (`tailwind.config = {…}`) vive em OUTRO arquivo local que roda logo depois —
 * medido na prévia do kit: sem o stub, esse arquivo morre em
 * `ReferenceError: tailwind is not defined` na linha 5 e leva junto todo o
 * runtime da peça que vinha depois dele no mesmo arquivo (reveals, animações).
 */
const STUB_DO_COMPILADOR = (src: string): string =>
  `<!-- script de compilação de CSS removido na composição: ${src} --><script>window.tailwind=window.tailwind||{config:{}};</script>`;

export const removerScriptsQueCompilamCss = (
  corpo: string,
  bundlePath: string,
): { corpo: string; removidos: string[]; mantidos: string[] } => {
  const removidos: string[] = [];
  const mantidos: string[] = [];
  // Preguiçoso: a maioria das peças não tem compilador nenhum, e ler o CSS do
  // bundle só paga quando um candidato a remoção aparece.
  let cssCompilado: boolean | null = null;
  const bundleTemCssCompilado = (): boolean => {
    if (cssCompilado === null) {
      try {
        cssCompilado = /--tw-/.test(lerCssDoBundle(bundlePath).css);
      } catch {
        cssCompilado = false;
      }
    }
    return cssCompilado;
  };
  const saida = corpo.replace(
    /<script\b[^>]*\bsrc\s*=\s*"([^"]+)"[^>]*>\s*<\/script>/gi,
    (tag, src: string) => {
      if (/^(https?:)?\/\//i.test(src)) return tag; // remotos: outra regra cuida
      if (src.split(/[\/]/).includes('..')) return tag;
      try {
        const conteudo = readFileSync(join(bundlePath, src), 'utf8');
        if (/tailwindcss/i.test(conteudo)) {
          if (bundleTemCssCompilado()) {
            removidos.push(src);
            return STUB_DO_COMPILADOR(src);
          }
          mantidos.push(src);
          return tag;
        }
      } catch {
        // arquivo ausente: o aviso de asset faltando já cobre
      }
      return tag;
    },
  );
  return { corpo: saida, removidos, mantidos };
};
