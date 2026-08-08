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
/**
 * ATENÇÃO ao mexer aqui: isto é um template literal.
 *
 * Crase dentro deste bloco FECHA o template, e o erro que aparece é um
 * "Expected ;" em outra linha — três vezes eu perdi tempo procurando no lugar
 * errado. Barra invertida some do mesmo jeito: `\s` vira `s` e a regex passa a
 * casar com a letra. Escreva sem crase e dobre a barra.
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
  /**
   * Um seletor que a folha de ajustes consiga mirar.
   *
   * Escopo pela SECAO (o id dela e estavel entre geracoes) mais a lista de
   * classes do elemento. Mirar por classe, e nao por caminho, e proposital: o
   * defeito quase nunca e de um elemento, e do COMPONENTE — os tres cartoes da
   * mesma faixa erram junto, e a correcao tem de valer para os tres.
   */
  const seletorDe = (el) => {
    const sec = el.closest('[data-secao-id]');
    const escopo = sec ? '[data-secao-id="' + sec.getAttribute('data-secao-id') + '"] ' : '';
    // A barra invertida vai DOBRADA: isto vive dentro de um template literal, e
    // uma barra sozinha some antes de chegar ao navegador — o split passava a
    // quebrar na letra "s", e text-base virava text-ba.e: um seletor que nao
    // casa com nada.
    const cls = (el.getAttribute('class') || '')
      .trim()
      .split(/\\s+/)
      .filter(Boolean)
      .map((c) => '.' + CSS.escape(c));
    if (cls.length > 0) return escopo + cls.join('');
    /**
     * Elemento sem classe nenhuma ainda precisa de alvo.
     *
     * Cai no PAI: as classes dele mais o filho direto pela tag. E o mais
     * proximo de "este pedaco do componente" que da para escrever sem depender
     * de posicao, que muda quando o conteudo muda.
     */
    const pai = el.parentElement;
    if (!pai) return null;
    const clsPai = (pai.getAttribute('class') || '')
      .trim()
      .split(/\\s+/)
      .filter(Boolean)
      .map((c) => '.' + CSS.escape(c));
    if (clsPai.length > 0) return escopo + clsPai.join('') + ' > ' + el.tagName.toLowerCase();
    /**
     * Ultimo recurso: a secao mais a tag.
     *
     * Grosso de proposito: pega todos os paragrafos daquela secao. Para COR
     * isso costuma ser o certo (o defeito e do bloco inteiro), e e melhor que
     * o anterior, que era desistir: dezoito achados ficavam sem alvo e a
     * pagina seguia ilegivel com a maquina sabendo onde.
     */
    if (escopo === '') return null;
    return escopo + el.tagName.toLowerCase();
  };

  // As tintas da marca, na ordem em que um designer as tentaria.
  const raizEstilo = getComputedStyle(document.documentElement);
  const TINTAS = ['--marca-heading', '--marca-body', '--marca-primary', '--marca-accent'];
  const tintaQueLe = (fundo) => {
    const lb = luminancia(fundo.r, fundo.g, fundo.b);
    for (const t of TINTAS) {
      const c = rgb(raizEstilo.getPropertyValue(t).trim());
      if (!c) continue;
      const lt = luminancia(c.r, c.g, c.b);
      const razao = (Math.max(lt, lb) + 0.05) / (Math.min(lt, lb) + 0.05);
      if (razao >= ${PISO_DE_CONTRASTE}) return t;
    }
    return null;
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
     * Texto pintado pelo FUNDO nao se mede pela cor.
     *
     * bg-clip-text com text-transparent e um recorte: a cor do texto e
     * transparente DE PROPOSITO e quem pinta e o gradiente atras. Medindo a
     * cor, todo titulo desses aparecia como "opacidade zero" — oito falsos
     * positivos num site so, e a correcao que eu escrevia para eles nao fazia
     * efeito nenhum, porque nao havia defeito. Medir o gradiente exigiria
     * amostrar pixel; enquanto nao amostro, nao opino.
     */
    const recorte = e.backgroundClip === 'text' || e.webkitBackgroundClip === 'text';
    if (recorte) continue;
    /**
     * Camada de sobreposicao (hover, brilho) fica de fora: ela e invisivel por
     * projeto e nao recebe clique. Texto que ninguem alcanca nao e conteudo
     * escondido, e decoracao esperando o ponteiro.
     */
    if (e.pointerEvents === 'none' && Number.parseFloat(e.opacity) === 0) continue;
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
        apagados.push({ texto, opacidade: oef, onde: onde(el), seletor: seletorDe(el) });
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
    contrastes.push({
      texto,
      contraste: razao,
      onde: onde(el),
      seletor: seletorDe(el),
      tinta: tintaQueLe(atras.cor),
    });
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

  /**
   * Secao que TEM conteudo e nao ocupa espaco.
   *
   * Seis das oito secoes de um site sairam com altura zero: o texto estava no
   * DOM, a secao existia, e a pagina tinha um buraco. Acontece quando a peca vem
   * de um site cujo layout inteiro e orquestrado por rolagem — la os blocos sao
   * tirados do fluxo e posicionados por script; recortados, nao tem altura
   * propria nenhuma.
   *
   * Nenhuma das outras regras pega: o texto se le, nada esta apagado, nada
   * transborda. So que ninguem ve.
   */
  const colapsadas = [];
  for (const sec of document.querySelectorAll('[data-secao]')) {
    const texto = (sec.textContent || '').trim();
    if (texto.length < 30) continue;
    const r = sec.getBoundingClientRect();
    if (r.height >= 40) continue;
    colapsadas.push(
      (sec.getAttribute('data-secao') || 'secao') + ' (' + texto.length + ' caracteres, ' + Math.round(r.height) + 'px de altura)'
    );
  }

  return { contrastes, apagados, vazios, fora, colapsadas };
}`;

/** As marcas do bloco: reescrever entre elas em vez de acumular retoque sobre retoque. */
const QUEBRA = String.fromCharCode(10);
const ABRE = '/* ORBIS: correções MEDIDAS no navegador — não edite à mão */';
const FECHA = '/* ORBIS: fim das correções medidas */';

/**
 * Escreve na folha de ajustes o que só o navegador consegue decidir.
 *
 * A composição sabe o papel de cada cor, mas não sabe em que chão o texto vai
 * pousar: isso só existe com o layout resolvido. Um texto pode passar contra o
 * fundo da PÁGINA e falhar contra o CARTÃO em que ele sentou — foi o
 * "Guardião del Rei" a 1,3:1 dentro do card do plano.
 *
 * Isto beira o "consertar a saída em vez do motor", que este projeto evita por
 * princípio. A diferença é a mesma do grid medido: não é palpite sobre o que
 * deveria ser, é MEDIDA do que é. E a folha de ajustes já existia exatamente
 * para retoque posterior — é a última da cascata, então vence sem `!important`.
 *
 * A correção mira por CLASSE dentro da seção, não por caminho de elemento: o
 * defeito quase nunca é de um elemento, é do componente, e os três cartões da
 * mesma faixa erram juntos.
 */
/**
 * Tira o bloco de correções da folha, devolvendo o que havia antes dele.
 *
 * Serve a dois momentos, e o segundo é o que me mordeu: antes de MEDIR para
 * corrigir. Sem isso a medição enxerga a página já corrigida, acha só o que
 * sobrou, e reescreve o bloco com essas poucas regras — jogando fora as que
 * estavam segurando o resto. O defeito volta inteiro, e o comando parece ter
 * piorado o site que ele mesmo consertou.
 */
const semOBloco = (css: string): string =>
  css.includes(ABRE)
    ? `${css.slice(0, css.indexOf(ABRE))}${css.slice(css.indexOf(FECHA) + FECHA.length)}`
    : css;

const escreverCorrecoes = (
  pasta: string,
  medidas: SiteNoNavegador[],
): { regras: number; semAlvo: number } => {
  const porSeletor = new Map<string, string>();
  let semAlvo = 0;

  for (const m of medidas) {
    for (const c of m.contrastesAbaixoDoPiso) {
      if (c.seletor === null || c.tinta === null) {
        semAlvo += 1;
        continue;
      }
      porSeletor.set(c.seletor, `  color: var(${c.tinta});`);
    }
    for (const t of m.textoApagado) {
      if (t.seletor === null) {
        semAlvo += 1;
        continue;
      }
      /**
       * A revelação não disparou: o conteúdo precisa aparecer.
       *
       * `opacity: 1` sozinho não basta, e isso foi medido: o zero quase sempre
       * vem de uma animação com `both`, que fixa o estado inicial e vence uma
       * declaração comum. Some com a animação parada e o conteúdo aparece.
       * Perder a entrada é ruim; um bloco de texto invisível é pior.
       */
      const jaTem = porSeletor.get(t.seletor) ?? '';
      // Sem dedupe, o mesmo seletor acumulava `opacity: 1;` uma vez por trecho
      // de texto que ele cobria — quatro vezes a mesma declaração.
      if (!jaTem.includes('opacity: 1;')) {
        const revela = `  opacity: 1;${QUEBRA}  animation: none;`;
        porSeletor.set(t.seletor, `${jaTem}${jaTem === '' ? '' : QUEBRA}${revela}`);
      }
    }
  }

  const arquivo = join(pasta, 'assets', 'ajustes.css');
  const atual = existsSync(arquivo) ? readFileSync(arquivo, 'utf8') : '';
  const semBloco = semOBloco(atual);

  if (porSeletor.size === 0) {
    writeFileSync(
      arquivo,
      `${semBloco.trimEnd()}
`,
      'utf8',
    );
    return { regras: 0, semAlvo };
  }

  const corpo = [...porSeletor.entries()]
    .map(
      ([sel, decls]) => `${sel} {
${decls}
}`,
    )
    .join(QUEBRA + QUEBRA);
  writeFileSync(
    arquivo,
    `${semBloco.trimEnd()}

${ABRE}
${corpo}
${FECHA}
`,
    'utf8',
  );
  return { regras: porSeletor.size, semAlvo };
};

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
        contrastes: {
          texto: string;
          contraste: number;
          onde: string;
          seletor: string | null;
          tinta: string | null;
        }[];
        apagados: { texto: string; opacidade: number; onde: string; seletor: string | null }[];
        vazios: string[];
        fora: string[];
        colapsadas: string[];
      };
      await pagina.close();
      const medida: SiteNoNavegador = {
        largura,
        contrastesAbaixoDoPiso: bruto.contrastes,
        textoApagado: bruto.apagados,
        slotsDeMidiaVazios: bruto.vazios,
        transbordam: bruto.fora,
        secoesColapsadas: bruto.colapsadas,
      };
      saida.push({ largura, medida, aceite: conferirSiteNoNavegador(medida) });
    }
  } finally {
    await navegador.close();
  }
  return saida;
};

const principal = async (): Promise<void> => {
  const corrigir = process.argv.includes('--corrigir');
  const alvo = process.argv.slice(2).find((a) => !a.startsWith('--'));
  if (alvo === undefined) {
    console.log('\n  Uso: pnpm conferir <pasta do site gerado>\n');
    process.exit(1);
  }
  const pasta = resolve(alvo);
  // Corrigir exige medir o site CRU: com o bloco anterior no lugar, a medição
  // só enxerga o resíduo e o bloco novo nasce menor que o problema.
  if (corrigir) {
    const folha = join(pasta, 'assets', 'ajustes.css');
    if (existsSync(folha)) {
      writeFileSync(folha, `${semOBloco(readFileSync(folha, 'utf8')).trimEnd()}${QUEBRA}`, 'utf8');
    }
  }
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

  if (corrigir) {
    const { regras, semAlvo } = escreverCorrecoes(
      pasta,
      resultados.map((r) => r.medida),
    );
    console.log(
      `
  ${regras} regra(s) escritas em assets/ajustes.css${semAlvo > 0 ? `; ${semAlvo} achado(s) sem alvo mirável (elemento sem classe ou marca sem tinta que sirva)` : ''}.`,
    );
    console.log('  Rode de novo sem --corrigir para conferir o resultado.');
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
