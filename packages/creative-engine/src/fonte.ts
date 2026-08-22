import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { getRoot } from '@ds/shared/paths';

/**
 * A FONTE DA MARCA na peça, embutida.
 *
 * ## Por que embutir, e não apenas pedir
 *
 * A peça se compõe num Chromium sem as fontes do mundo instaladas. Escrever
 * `font-family: "Sora", system-ui` ali não é um pedido que falha alto: é um
 * pedido que falha CALADO — o navegador cai no fallback, a peça sai numa letra
 * que não é a da marca, e nada no arquivo diz que isso aconteceu. É a mesma
 * classe de defeito que a régua acabou de aprender a pegar na geometria: uma
 * coisa que parece certa e não é.
 *
 * Então o arquivo da fonte entra na página, como data URI, do mesmo jeito que o
 * fundo entra. Se ele não puder entrar, esta função devolve `null` e a peça
 * usa a letra da casa — sabendo que usou, e dizendo.
 *
 * ## Por que há cache em disco
 *
 * Um lote de oito variações da mesma marca pediria a mesma fonte oito vezes. O
 * arquivo baixado é gravado já no formato final (o `@font-face` com o binário
 * embutido), então a segunda peça em diante não toca a rede — e uma máquina
 * sem internet continua produzindo tudo o que já produziu uma vez.
 */

/** Os pesos que a peça usa: 600 na marca e no CTA, 700 na headline. */
const PESOS = [600, 700];

/** A pasta do cache. Fora do repositório, junto do resto dos dados. */
const pastaDasFontes = (): string => join(getRoot(), 'fontes');

/** Um nome de família vira nome de arquivo sem inventar caminho. */
const arquivoDaFamilia = (familia: string): string =>
  `${familia.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.css`;

/**
 * O `@font-face` pronto para entrar na peça, com o binário embutido.
 *
 * `null` quando a fonte não pôde ser obtida — sem rede, família desconhecida,
 * resposta inesperada. Nunca lança: falhar em obter a fonte da marca não pode
 * derrubar a produção de uma peça que, no pior caso, sai na letra da casa.
 */
export const cssDaFonte = async (familia: string): Promise<string | null> => {
  const nome = familia.trim();
  if (nome === '') return null;

  const pasta = pastaDasFontes();
  const cache = join(pasta, arquivoDaFamilia(nome));
  if (existsSync(cache)) {
    try {
      return readFileSync(cache, 'utf8');
    } catch {
      // Cache ilegível é cache ausente: segue para a rede.
    }
  }

  try {
    const fam = encodeURIComponent(nome).replace(/%20/g, '+');
    const url = `https://fonts.googleapis.com/css2?family=${fam}:wght@${PESOS.join(';')}&display=swap`;
    /**
     * O `User-Agent` decide o FORMATO que o Google devolve.
     *
     * Sem um agente que ele reconheça como navegador moderno, a resposta vem em
     * `ttf` — que funciona, e pesa três a quatro vezes mais dentro de um data
     * URI. Pedir como Chrome é o que traz `woff2`.
     */
    const resposta = await fetch(url, {
      headers: {
        'user-agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
    });
    if (!resposta.ok) return null;
    const css = await resposta.text();

    // Cada `src: url(...)` vira o binário embutido. Um que falhe derruba a
    // fonte inteira: meia família aplicada é a peça saindo com dois pesos
    // diferentes de letra, que é pior que sair só com a da casa.
    const ENDERECO = /url\((https:\/\/[^)]+\.woff2)\)/g;
    const enderecos = [...css.matchAll(ENDERECO)]
      .map((m) => m[1])
      .filter((u): u is string => u !== undefined);
    if (enderecos.length === 0) return null;

    const embutidos = new Map<string, string>();
    for (const endereco of enderecos) {
      if (embutidos.has(endereco)) continue;
      const bin = await fetch(endereco);
      if (!bin.ok) return null;
      const base64 = Buffer.from(await bin.arrayBuffer()).toString('base64');
      embutidos.set(endereco, `data:font/woff2;base64,${base64}`);
    }

    const pronto = css.replace(
      /url\((https:\/\/[^)]+\.woff2)\)/g,
      (inteiro, endereco: string) => `url(${embutidos.get(endereco) ?? inteiro})`,
    );

    try {
      mkdirSync(pasta, { recursive: true });
      writeFileSync(cache, pronto, 'utf8');
    } catch {
      // Sem cache a peça sai igual; só a próxima volta a pagar a rede.
    }
    return pronto;
  } catch {
    return null;
  }
};
