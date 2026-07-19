import { existsSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Integridade de assets de um HTML extraído.
 *
 * Um `design-system.html` pode estar perfeito de estrutura e mesmo assim ser
 * inútil: basta o `<link rel="stylesheet">` apontar para um arquivo que nunca
 * foi gravado. O HTML abre, o navegador engole o 404 em silêncio, e o que
 * aparece é a página crua — fundo branco, texto preto, link azul.
 *
 * Foi exatamente isso que passou batido: o STEP 2 do prompt (extrair o CSS
 * inline para `assets/css/`) não foi cumprido, mas o `<link>` foi escrito
 * mesmo assim. Como a validação só checava se a PASTA do vault existia, o job
 * fechou como concluído e o design system entrou na galeria quebrado.
 *
 * Esta checagem é o contrário de sutil de propósito: se o HTML promete um
 * arquivo, o arquivo tem que estar lá.
 */

const EXTERNO = /^(https?:)?\/\//i;

/** Referências que não apontam para o disco local e portanto não nos cabem. */
const ehExterna = (ref: string): boolean =>
  EXTERNO.test(ref) ||
  ref.startsWith('data:') ||
  ref.startsWith('blob:') ||
  ref.startsWith('mailto:') ||
  ref.startsWith('tel:') ||
  ref.startsWith('javascript:') ||
  ref.startsWith('#');

/**
 * Devolve os caminhos locais que o HTML referencia mas que não existem em
 * `baseDir`. Lista vazia significa que está tudo no lugar.
 */
export const listarAssetsFaltando = (baseDir: string, html: string): string[] => {
  const faltando: string[] = [];
  const vistos = new Set<string>();

  const re = /(?:href|src)\s*=\s*["']([^"']+)["']/gi;
  let match: RegExpExecArray | null = re.exec(html);

  while (match !== null) {
    const ref = match[1];
    match = re.exec(html);
    if (ref === undefined || ehExterna(ref)) continue;

    // Query string e âncora não fazem parte do nome do arquivo em disco.
    const limpo = (ref.split(/[?#]/)[0] ?? '').trim();
    if (limpo === '' || vistos.has(limpo)) continue;
    vistos.add(limpo);

    // Caminho absoluto num HTML de vault é erro de extração por si só, mas
    // aqui só interessa se resolve para um arquivo existente.
    const alvo = join(baseDir, limpo.replace(/^\/+/, ''));
    if (!existsSync(alvo)) faltando.push(limpo);
  }

  return faltando;
};
