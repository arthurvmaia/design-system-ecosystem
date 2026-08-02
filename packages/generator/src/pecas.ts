import { readFileSync } from 'node:fs';
import { join } from 'node:path';

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
 */
export const removerScriptsQueCompilamCss = (
  corpo: string,
  bundlePath: string,
): { corpo: string; removidos: string[] } => {
  const removidos: string[] = [];
  const saida = corpo.replace(
    /<script\b[^>]*\bsrc\s*=\s*"([^"]+)"[^>]*>\s*<\/script>/gi,
    (tag, src: string) => {
      if (/^(https?:)?\/\//i.test(src)) return tag; // remotos: outra regra cuida
      if (src.split(/[\/]/).includes('..')) return tag;
      try {
        const conteudo = readFileSync(join(bundlePath, src), 'utf8');
        if (/tailwindcss/i.test(conteudo)) {
          removidos.push(src);
          return `<!-- script de compilação de CSS removido na composição: ${src} -->`;
        }
      } catch {
        // arquivo ausente: o aviso de asset faltando já cobre
      }
      return tag;
    },
  );
  return { corpo: saida, removidos };
};
