/**
 * `pnpm conferir <pasta do site gerado>` — a conferência que precisa DESENHAR.
 *
 * ## Por que existe
 *
 * O aceite da montagem lê arquivos: sabe dizer se uma referência aponta para o
 * vazio, se sobrou o nome da origem, se uma seção ficou sem peça. O que ele não
 * sabe é o que só nasce do layout resolvido — se o texto se lê contra o fundo
 * que caiu atrás dele, se a imagem realmente carregou, se algo passou da borda
 * da tela.
 *
 * Isso não era uma lacuna declarada: a regra S4 ("o texto se lê") morava no
 * aceite da montagem recebendo `contrastesAbaixoDoPiso: 0` — a constante,
 * cravada. Ela passou verde em todo site gerado sem nunca ter comparado duas
 * cores, e por essa porta saíram um hero ilegível, uma barra de menu clara sobre
 * página escura e um cartão escuro com texto escuro. O dono viu os três em
 * print; a máquina, nenhum.
 *
 * ## O que ele mede, e por que nesses dois tamanhos
 *
 * 1440 é a tela de quem trabalha e 390 é o celular. Quase todo defeito de
 * legibilidade aparece nos dois; quase todo defeito de transbordo só aparece no
 * segundo. Medir só um deixaria metade passar.
 *
 * O veredito é gravado ao lado do site, em `aceite-navegador.json`, e junto do
 * `aceite.json` forma a conferência inteira: o que se lê do arquivo e o que só
 * o navegador vê.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  PISO_DE_CONTRASTE,
  type ResultadoDeAceite,
  type SiteNoNavegador,
  conferirSiteNoNavegador,
} from '@ds/shared';
import { executadoDireto } from './executado-direto.js';

/** As duas larguras: a de quem trabalha e a de quem anda com o site no bolso. */
const LARGURAS = [1440, 390] as const;

/**
 * A medição roda DENTRO da página, porque é lá que as cores estão resolvidas.
 *
 * O texto é comparado com o primeiro ancestral que tem fundo opaco — é o que o
 * olho enxerga. Fundo com imagem ou gradiente é PULADO em vez de chutado: medir
 * contraste contra um gradiente exige amostrar pixel, e um número inventado aqui
 * seria a mesma doença que esta passagem veio curar.
 */
const MEDIR = `() => {
  const luminancia = (r, g, b) => {
    const f = (c) => { const s = c / 255; return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4); };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  /**
   * Quem converte a cor e o NAVEGADOR, nao uma regex.
   *
   * A primeira versao lia so rgb(), e o Chrome devolve color(srgb ...) e
   * oklch(...) para tudo que passou pela recoloracao. Cor que a regex nao
   * entendia virava null e o elemento era PULADO — a conferencia dava verde
   * exatamente nos trechos que o dono nao conseguia ler. Pintar num canvas de
   * 1x1 e ler o pixel resolve qualquer sintaxe que o navegador aceite, hoje e
   * nas que vierem.
   */
  const tela = document.createElement('canvas');
  tela.width = 1; tela.height = 1;
  const pincel = tela.getContext('2d', { willReadFrequently: true });
  const rgb = (cor) => {
    if (!cor || cor === 'none' || cor === 'transparent') return null;
    pincel.clearRect(0, 0, 1, 1);
    pincel.fillStyle = '#000000';
    pincel.fillStyle = cor;
    pincel.fillRect(0, 0, 1, 1);
    const d = pincel.getImageData(0, 0, 1, 1).data;
    return { r: d[0], g: d[1], b: d[2], a: d[3] / 255 };
  };
  const onde = (el) => {
    const sec = el.closest('[data-secao]');
    const papel = sec ? sec.getAttribute('data-secao') : 'página';
    return papel + ' › ' + el.tagName.toLowerCase();
  };
  const fundoOpaco = (el) => {
    let p = el;
    while (p && p !== document.documentElement) {
      const e = getComputedStyle(p);
      if (e.backgroundImage && e.backgroundImage !== 'none') return { imagem: true };
      const c = rgb(e.backgroundColor);
      if (c && c.a >= 0.95) return { cor: c };
      p = p.parentElement;
    }
    const c = rgb(getComputedStyle(document.documentElement).backgroundColor);
    return c && c.a >= 0.95 ? { cor: c } : { imagem: true };
  };

  // A opacidade MULTIPLICA pela cadeia: um pai a 0.05 apaga o filho a 1.
  const opacidadeEfetiva = (el) => {
    let o = 1;
    let p = el;
    while (p && p !== document.documentElement) {
      o *= Number.parseFloat(getComputedStyle(p).opacity);
      p = p.parentElement;
    }
    return o;
  };

  const contrastes = [];
  const apagados = [];
  const vistos = new Set();
  for (const el of document.querySelectorAll('body *')) {
    if (el.children.length > 0) continue;
    const texto = (el.textContent || '').trim();
    if (texto.length < 2) continue;
    const e = getComputedStyle(el);
    if (e.visibility === 'hidden' || e.display === 'none') continue;
    const cx = el.getBoundingClientRect();
    if (cx.width === 0 || cx.height === 0) continue;
    const frente = rgb(e.color);
    if (!frente) continue;
    /**
     * Texto quase invisível NÃO é decoração — é conteúdo que não apareceu.
     *
     * Era o que eu pulava, e por isso a conferência dava verde num hero que o
     * dono não conseguia ler: a revelação por rolagem não disparou e os cartões
     * ficaram na opacidade inicial. Quem escreve opacity zero e espera o
     * observador conta com o observador; quando ele não vem, o texto está lá,
     * ocupa espaço, e ninguém lê.
     */
    const oef = opacidadeEfetiva(el) * frente.a;
    if (oef < 0.35) {
      const chaveA = texto.slice(0, 20) + '|' + onde(el);
      if (!vistos.has(chaveA)) {
        vistos.add(chaveA);
        apagados.push({ texto, opacidade: oef, onde: onde(el) });
      }
      continue;
    }
    const atras = fundoOpaco(el);
    if (atras.imagem) continue;
    const lf = luminancia(frente.r, frente.g, frente.b);
    const la = luminancia(atras.cor.r, atras.cor.g, atras.cor.b);
    const razao = (Math.max(lf, la) + 0.05) / (Math.min(lf, la) + 0.05);
    if (razao >= ${PISO_DE_CONTRASTE}) continue;
    const chave = texto.slice(0, 20) + '|' + onde(el);
    if (vistos.has(chave)) continue;
    vistos.add(chave);
    contrastes.push({ texto, contraste: razao, onde: onde(el) });
  }

  // Imagem que não carregou: o slot vira bloco vazio e ninguém reclama.
  const vazios = [];
  for (const img of document.querySelectorAll('img')) {
    if (img.naturalWidth > 0) continue;
    const r = img.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) continue;
    vazios.push(onde(img) + ' (' + (img.getAttribute('src') || 'sem src').slice(-40) + ')');
  }

  // Transbordo: passa da borda E não está dentro de um recorte proposital.
  const larguraVisivel = document.documentElement.clientWidth;
  const fora = [];
  const jaVi = new Set();
  for (const el of document.querySelectorAll('[data-secao] *')) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.right <= larguraVisivel + 2) continue;
    let recortado = false;
    let p = el.parentElement;
    while (p && p !== document.body) {
      const e = getComputedStyle(p);
      if (e.overflowX !== 'visible' || e.overflow !== 'visible') { recortado = true; break; }
      p = p.parentElement;
    }
    if (recortado) continue;
    const chave = onde(el);
    if (jaVi.has(chave)) continue;
    jaVi.add(chave);
    fora.push(chave + ' (+' + Math.round(r.right - larguraVisivel) + 'px)');
  }

  return { contrastes, apagados, vazios, fora };
}`;

export const conferirNoNavegador = async (
  pasta: string,
): Promise<{ largura: number; aceite: ResultadoDeAceite; medida: SiteNoNavegador }[]> => {
  const indice = join(pasta, 'index.html');
  if (!existsSync(indice)) throw new Error(`não achei ${indice}`);
  const pw = await import('playwright');
  const navegador = await pw.chromium.launch({ headless: true });
  const saida: { largura: number; aceite: ResultadoDeAceite; medida: SiteNoNavegador }[] = [];
  try {
    for (const largura of LARGURAS) {
      const pagina = await navegador.newPage({ viewport: { width: largura, height: 900 } });
      await pagina.goto(pathToFileURL(indice).href, { waitUntil: 'load' });
      // As revelações por rolagem só resolvem depois de a página assentar; sem
      // esta espera, metade do texto ainda está com opacidade 0 e a medição
      // acusaria contraste onde não há defeito.
      await pagina.waitForTimeout(700);
      // Texto passado ao `evaluate` é avaliado como EXPRESSÃO: sem os
      // parênteses de chamada, o que volta é a própria função, e o resultado
      // chega `undefined`.
      const bruto = (await pagina.evaluate(`(${MEDIR})()`)) as {
        contrastes: { texto: string; contraste: number; onde: string }[];
        apagados: { texto: string; opacidade: number; onde: string }[];
        vazios: string[];
        fora: string[];
      };
      await pagina.close();
      const medida: SiteNoNavegador = {
        largura,
        contrastesAbaixoDoPiso: bruto.contrastes,
        textoApagado: bruto.apagados,
        slotsDeMidiaVazios: bruto.vazios,
        transbordam: bruto.fora,
      };
      saida.push({ largura, medida, aceite: conferirSiteNoNavegador(medida) });
    }
  } finally {
    await navegador.close();
  }
  return saida;
};

const principal = async (): Promise<void> => {
  const alvo = process.argv[2];
  if (alvo === undefined) {
    console.log('\n  Uso: pnpm conferir <pasta do site gerado>\n');
    process.exit(1);
  }
  const pasta = resolve(alvo);
  const resultados = await conferirNoNavegador(pasta);

  let reprovou = false;
  for (const { largura, aceite } of resultados) {
    console.log(`\n  ── ${largura}px ──`);
    for (const v of aceite.vereditos) {
      const marca = v.estado === 'passou' ? '✓' : v.estado === 'pendente' ? '·' : '✗';
      console.log(`  ${marca} ${v.codigo} ${v.titulo}${v.motivo === '' ? '' : `: ${v.motivo}`}`);
    }
    if (!aceite.aprovado) reprovou = true;
  }

  const arquivo = join(pasta, 'aceite-navegador.json');
  writeFileSync(
    arquivo,
    JSON.stringify({ formato: 1, conferidoEm: Date.now(), larguras: resultados }, null, 2),
    'utf8',
  );
  console.log(`\n  Veredito gravado em ${arquivo}\n`);

  // Sai com erro quando reprova: assim o comando serve de portão para quem
  // encadeia `pnpm pagina && pnpm conferir`, e não só de relatório para ler.
  if (reprovou) process.exit(1);
};

if (executadoDireto(import.meta.url)) {
  principal().catch((e: unknown) => {
    console.error(e);
    process.exit(1);
  });
}

/** O `aceite.json` da montagem, para quem quiser os dois vereditos juntos. */
export const aceiteDaMontagem = (pasta: string): ResultadoDeAceite | null => {
  const arquivo = join(pasta, 'aceite.json');
  if (!existsSync(arquivo)) return null;
  return JSON.parse(readFileSync(arquivo, 'utf8')) as ResultadoDeAceite;
};
