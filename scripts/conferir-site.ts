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
 * O perfil de cada largura — e em 390 ele é de CELULAR de verdade, não de
 * janela estreita.
 *
 * A diferença não é cosmética. Sem `isMobile`/`hasTouch`, o Chromium continua
 * sendo desktop com a janela apertada, e duas media queries que os sites usam o
 * tempo todo respondem ERRADO: `@media (hover: hover)` diz que há mouse, e
 * `(pointer: coarse)` diz que o ponteiro é fino. Conteúdo que a origem escondeu
 * atrás de hover — menu, legenda, botão que só aparece ao passar o mouse — some
 * num telefone real e a medição jurava que estava tudo certo.
 *
 * A altura também é do aparelho: 844 é a de um telefone corrente, e medir
 * transbordo e seção colapsada numa janela de 900 de altura descreve uma tela
 * que ninguém tem. `deviceScaleFactor: 3` é a densidade da tela dele.
 */
const PERFIL: Record<number, { height: number; isMobile: boolean; deviceScaleFactor: number }> = {
  1440: { height: 900, isMobile: false, deviceScaleFactor: 1 },
  390: { height: 844, isMobile: true, deviceScaleFactor: 3 },
};

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

  /**
   * QUEM apagou: o elemento da cadeia que zera, e a regra CSS responsavel.
   *
   * A conferencia dizia QUE texto estava apagado e nunca QUEM o apagou, e essa
   * lacuna custou tres tentativas de conserto no motor, todas deduzidas do CSS
   * e todas erradas: a primeira mexeu na limpeza da classe de revelacao, a
   * segunda procurou o par opacity 0 / opacity 1, e o mecanismo real era uma
   * ANIMACAO PAUSADA que um ancestral despausa. Deduzir a causa de um sintoma
   * medido e o mesmo erro que a regra alimentada por constante: parece
   * informacao e nao e.
   *
   * Aqui a resposta vem do proprio navegador, que sabe exatamente qual regra
   * casou com qual elemento.
   */
  const quemApagou = (el) => {
    let n = el;
    while (n && n !== document.documentElement) {
      const e = getComputedStyle(n);
      const zerado = Number.parseFloat(e.opacity) < 0.35;
      const parado = e.animationPlayState === 'paused';
      if (zerado || parado) {
        const classes = (n.getAttribute('class') || '').trim().split(/\\s+/).filter(Boolean);
        let regra = null;
        for (const folha of document.styleSheets) {
          let lista;
          try { lista = folha.cssRules; } catch (err) { continue; }
          const anda = (rs) => {
            for (const r of rs) {
              if (regra) return;
              if (r.cssRules) { anda(r.cssRules); continue; }
              if (!r.selectorText || !r.style) continue;
              const zera = r.style.getPropertyValue('opacity');
              const pausa = r.style.getPropertyValue('animation-play-state');
              if (zera !== '0' && pausa !== 'paused') continue;
              let casa = false;
              try { casa = n.matches(r.selectorText); } catch (err2) { casa = false; }
              if (casa) regra = r.selectorText.slice(0, 120);
            }
          };
          anda(lista);
          if (regra) break;
        }
        const motivo = parado && !zerado ? 'animacao pausada' : 'opacidade zero';
        return n.tagName.toLowerCase()
          + (classes.length ? '.' + classes.slice(0, 3).join('.') : '')
          + ' (' + motivo + ')'
          + (regra ? ' por: ' + regra : ' sem regra de folha (estilo inline?)');
      }
      n = n.parentElement;
    }
    return null;
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
     *
     * A opacidade aqui e a EFETIVA, e a diferenca era o defeito: opacity NAO
     * e herdada como valor computado (o filho continua em 1 mesmo dentro de um
     * pai em 0), enquanto pointer-events E herdada. A guarda lia a opacidade do
     * proprio elemento, achava 1, e nunca disparava — enquanto a deteccao logo
     * abaixo ja usava a efetiva, que sobe a arvore. Duas medidas diferentes na
     * mesma funcao.
     *
     * O caso real: um cartao de preco que revela as vantagens no hover — a
     * classe do conteudo tem opacity 0 com pointer-events none, e a regra de
     * hover do cartao a leva a 1. Desenho deliberado, acusado como texto que
     * sumiu. (Sem crase neste bloco: ele e um template literal.)
     */
    if (e.pointerEvents === 'none' && opacidadeEfetiva(el) === 0) continue;
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
    /**
     * A MARCA D'AGUA e a excecao, e ela e reconhecivel pelo tamanho.
     *
     * Medido num kit do banco de prova: o rodape trazia o nome da marca em
     * text-[20vw] com text-white/5 — letra de 20% da largura da tela, a 5% de
     * opacidade. Isso e desenho deliberado, e a regra reprovava por "conteudo
     * que nao apareceu". (Sem crase: este bloco e um template literal, e crase
     * aqui FECHA o template — o aviso esta no topo do arquivo.)
     *
     * Ninguem escreve 20vw a 5% por acidente. Texto de LEITURA nunca tem esse
     * tamanho, entao letra gigante com alfa baixo e decoracao por construcao —
     * e a distincao precisa das DUAS coisas juntas: um titulo grande e opaco
     * continua sendo titulo, e um texto pequeno e apagado continua sendo
     * defeito.
     */
    const corpoDaLetra = Number.parseFloat(getComputedStyle(el).fontSize) || 0;
    const marcaDagua = corpoDaLetra >= 100 && opacidadeEfetiva(el) >= 0.95;
    if (oef < 0.35 && !marcaDagua) {
      const chaveA = texto.slice(0, 20) + '|' + onde(el);
      if (!vistos.has(chaveA)) {
        vistos.add(chaveA);
        apagados.push({
          texto,
          opacidade: oef,
          onde: onde(el),
          seletor: seletorDe(el),
          culpado: quemApagou(el),
        });
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

  /**
   * ALVO DE TOQUE pequeno demais — so no celular, porque so la o dedo e a mira.
   *
   * O CSS responsivo do proprio compositor ja escreve \`min-height: 44px\` para
   * link, botao e campo, e a intencao esta documentada la. So que ela nao e
   * \`!important\` e nunca foi CONFERIDA: qualquer regra mais especifica da peca
   * capturada, ou um \`style\` inline, a sobrepoe em silencio. E ela define so
   * altura, entao um botao de icone pode sair alto e estreito.
   *
   * 44px e a medida da Apple e a mesma que o Google usa em 48dp. Abaixo disso,
   * errar o toque deixa de ser acidente e vira regra.
   */
  const alvosPequenos = [];
  if (larguraVisivel <= 500) {
    const vistosAlvo = new Set();
    for (const el of document.querySelectorAll('a, button, input, select, textarea, [role="button"], [role="tab"]')) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      const e = getComputedStyle(el);
      if (e.visibility === 'hidden' || e.display === 'none') continue;
      /**
       * Link DENTRO de uma frase e texto, nao botao — e a excecao que a propria
       * WCAG 2.5.8 escreve. Cobrar 44px dele obrigaria a espacar a leitura.
       *
       * A primeira versao isentava pelo NOME do pai (P, LI, SPAN, H1..H4), e o
       * LI derrubou a regra: item de menu e <li><a>Vagas</a></li>, que E um
       * alvo de toque, e saia isento junto com o link no meio de um paragrafo.
       *
       * A pergunta certa nao e "quem e o pai" e sim "tem frase em volta?".
       * Quando o texto do pai e praticamente so o do link, o link E o item — e
       * o dedo precisa acerta-lo.
       */
      const pai = el.parentElement;
      const textoDoLink = (el.textContent || '').trim();
      const textoDoPai = pai ? (pai.textContent || '').trim() : '';
      const dentroDeTexto = el.tagName === 'A' && pai
        && ['P', 'LI', 'SPAN', 'H1', 'H2', 'H3', 'H4'].indexOf(pai.tagName) >= 0
        && textoDoPai.length > textoDoLink.length + 10;
      if (dentroDeTexto) continue;
      if (r.height >= 44 && r.width >= 44) continue;
      const chave = onde(el) + '|' + (el.textContent || '').trim().slice(0, 14);
      if (vistosAlvo.has(chave)) continue;
      vistosAlvo.add(chave);
      alvosPequenos.push(
        onde(el) + ' "' + (el.textContent || '').trim().slice(0, 18) + '" ('
        + Math.round(r.width) + 'x' + Math.round(r.height) + 'px)'
      );
    }
  }

  /**
   * TEXTO MIUDO — nenhuma regra lia tamanho de letra.
   *
   * S4 compara cores e S13 mede opacidade; as duas dao verde para um texto de
   * 8px com contraste perfeito. No celular isso e ilegivel na pratica, e nao
   * aparece em nenhuma outra medicao.
   *
   * O piso e 12px, e nao 16: rotulo em caixa alta, credito de foto e nota de
   * rodape vivem legitimamente entre 12 e 14. Abaixo de 12 nao ha uso honesto.
   */
  const textoMiudo = [];
  if (larguraVisivel <= 500) {
    const vistosMiudo = new Set();
    for (const el of document.querySelectorAll('[data-secao] *')) {
      if (el.children.length > 0) continue;
      const t = (el.textContent || '').trim();
      if (t.length < 6) continue;
      const e = getComputedStyle(el);
      if (e.visibility === 'hidden' || e.display === 'none') continue;
      const tam = Number.parseFloat(e.fontSize) || 16;
      if (tam >= 12) continue;
      const chave = onde(el) + '|' + t.slice(0, 14);
      if (vistosMiudo.has(chave)) continue;
      vistosMiudo.add(chave);
      textoMiudo.push(onde(el) + ' "' + t.slice(0, 22) + '" (' + tam.toFixed(1) + 'px)');
    }
  }

  /*
    IMAGEM ENTREGUE MINUSCULA.
    A regra do slot vazio (S11) so ve a vaga SEM imagem. O dono fotografou o
    oposto: uma foto de conteudo desenhada com 48px no meio do hero — a vaga foi
    preenchida e o resultado e pior que vazio, porque ninguem enxerga o que ha
    ali. Icone, logo e avatar sao pequenos POR NATUREZA e ficam de fora: o alvo
    e a midia de CONTEUDO, a que a peca reservou area para mostrar.
  */
  const imagensMinusculas = [];
  {
    const vistosImg = new Set();
    for (const el of document.querySelectorAll('[data-secao] img, [data-secao] video')) {
      const r = el.getBoundingClientRect();
      const menor = Math.min(r.width, r.height);
      if (menor === 0) continue;
      if (menor >= 96) continue;
      const cls = (el.getAttribute('class') || '').toLowerCase();
      const alt = (el.getAttribute('alt') || '').toLowerCase();
      const ehEnfeite =
        /icon|logo|avatar|badge|selo|marca|bandeira|flag/.test(cls + ' ' + alt) ||
        el.closest('nav, header, footer, [role="navigation"], button, a[aria-label]') !== null;
      if (ehEnfeite) continue;
      // Midia de CONTEUDO: a que a peca reservou area para. Se a caixa em volta
      // e larga e a imagem e um selo, o slot esta subaproveitado.
      const pai = el.parentElement;
      const larguraDoPai = pai ? pai.getBoundingClientRect().width : 0;
      if (larguraDoPai < 200) continue;
      const chave = onde(el) + '|' + (el.getAttribute('src') || '').slice(-24);
      if (vistosImg.has(chave)) continue;
      vistosImg.add(chave);
      imagensMinusculas.push(
        onde(el) + ' ' + Math.round(r.width) + 'x' + Math.round(r.height) + 'px em vaga de ' + Math.round(larguraDoPai) + 'px'
      );
    }
  }

  /*
    SEGUNDA BARRA DE ROLAGEM.
    A pagina rola; um bloco dentro dela tambem. O dono viu duas barras na mesma
    tela. Vem de marcacao da ORIGEM que viajou (overflow-y:auto no corpo da
    peca): la aquele bloco era a pagina inteira, aqui e uma secao. Rolagem
    aninhada esconde conteudo e sequestra a roda do mouse.
  */
  const rolagemAninhada = [];
  {
    for (const el of document.querySelectorAll('[data-secao] *')) {
      const e = getComputedStyle(el);
      const rola = e.overflowY === 'auto' || e.overflowY === 'scroll';
      if (!rola) continue;
      if (el.scrollHeight <= el.clientHeight + 8) continue;
      // Pre, code e tabela rolam por desenho, e ai a barra e intencional.
      if (el.closest('pre, code, table') !== null) continue;
      rolagemAninhada.push(
        onde(el) + ' (' + el.scrollHeight + 'px de conteudo em ' + el.clientHeight + 'px de caixa)'
      );
      if (rolagemAninhada.length >= 6) break;
    }
  }

  /*
    RESPIRO MORTO ENTRE SECOES.
    Espaco vazio entre o fim de uma secao e o comeco da proxima. Cada peca traz
    o proprio respiro da origem, e empilhadas elas somam: o dono viu "muito
    espaco em branco de um componente para o outro", e e isso que faz a pagina
    ficar longa sem ter mais conteudo — a mesma queixa do scroll lento.
  */
  const respiroMorto = [];
  {
    const secs = [...document.querySelectorAll('[data-secao]')];
    for (let i = 0; i + 1 < secs.length; i++) {
      const a = secs[i].getBoundingClientRect();
      const b = secs[i + 1].getBoundingClientRect();
      const vao = Math.round(b.top - a.bottom);
      /*
        Dois limites, nao um. O dono apontou os DOIS extremos em sites
        diferentes: "muito espaco em branco de um componente para o outro" e,
        no seguinte, "componentes colado um com outro". Cada peca traz o
        respiro da propria origem — empilhadas, ora somam ora se anulam.
      */
      if (vao > 160) {
        respiroMorto.push(
          (secs[i].getAttribute('data-secao') || '?') + ' -> ' +
          (secs[i + 1].getAttribute('data-secao') || '?') + ': ' + vao + 'px de vao'
        );
        continue;
      }
      // Colado: sem respiro nenhum, duas pecas viram uma mancha so.
      if (vao < 8 && a.height > 80 && b.height > 80) {
        respiroMorto.push(
          (secs[i].getAttribute('data-secao') || '?') + ' -> ' +
          (secs[i + 1].getAttribute('data-secao') || '?') + ': colados (' + vao + 'px)'
        );
      }
    }
  }

  /*
    ALTURA DESPROPORCIONAL.
    "O scroll desce muito lento" e altura: a pagina e muito mais alta do que o
    conteudo pede. Medida sem palpite — quanto da altura total e ocupado por
    TEXTO e MIDIA de verdade. Abaixo de um terco, a pessoa rola por vazio.
  */
  let alturaTotal = 0;
  let alturaUtil = 0;
  {
    alturaTotal = Math.max(document.documentElement.scrollHeight, document.body.scrollHeight);
    /*
      Somar a altura de cada elemento CONTA DUAS VEZES quem esta dentro de quem:
      um <li> dentro de um <p> dentro de um cartao soma tres. A primeira versao
      disso deu 115% de fracao util em quatro sites — impossivel, e o numero
      denunciou o metodo.

      O certo e medir a UNIAO das faixas verticais ocupadas: cada elemento
      contribui com o intervalo [topo, base] no documento, e intervalos que se
      cruzam viram um so.
    */
    const faixas = [];
    const topoDoDoc = window.scrollY || document.documentElement.scrollTop || 0;
    for (const el of document.querySelectorAll('[data-secao] p, [data-secao] h1, [data-secao] h2, [data-secao] h3, [data-secao] h4, [data-secao] li, [data-secao] img, [data-secao] video, [data-secao] button, [data-secao] input')) {
      const r = el.getBoundingClientRect();
      if (r.height <= 0 || r.width <= 0) continue;
      faixas.push([r.top + topoDoDoc, r.bottom + topoDoDoc]);
    }
    faixas.sort((a, b) => a[0] - b[0]);
    let soma = 0;
    let ini = null;
    let fim = null;
    for (const [a, b] of faixas) {
      if (ini === null) { ini = a; fim = b; continue; }
      if (a <= fim) { if (b > fim) fim = b; continue; }
      soma += fim - ini;
      ini = a; fim = b;
    }
    if (ini !== null) soma += fim - ini;
    alturaUtil = Math.round(soma);
  }

  return {
    contrastes,
    apagados,
    vazios,
    fora,
    colapsadas,
    alvosPequenos,
    textoMiudo,
    imagensMinusculas,
    rolagemAninhada,
    respiroMorto,
    alturaTotal,
    alturaUtil,
  };
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
      const perfil = PERFIL[largura] ?? { height: 900, isMobile: false, deviceScaleFactor: 1 };
      const pagina = await navegador.newPage({
        viewport: { width: largura, height: perfil.height },
        isMobile: perfil.isMobile,
        hasTouch: perfil.isMobile,
        deviceScaleFactor: perfil.deviceScaleFactor,
      });
      await pagina.goto(pathToFileURL(indice).href, { waitUntil: 'load' });
      /**
       * A página é PERCORRIDA antes de medir, como um visitante percorre.
       *
       * Esperar não bastava, e a diferença é a mecânica do `IntersectionObserver`:
       * ele só dispara para quem ENTRA na viewport. Seção abaixo da dobra nunca
       * entra se ninguém rolar — então ela seguia no estado inicial da revelação
       * (`opacity: 0`) e a regra S13 acusava 51 trechos "apagados" num site que,
       * para quem usa, aparece inteiro. Medir sem rolar é medir uma página que
       * ninguém vê.
       *
       * Desce de meia tela em meia tela (passo menor que a viewport, para não
       * pular nenhum gatilho), respira a cada parada, e VOLTA AO TOPO: as regras
       * de transbordo e de seção colapsada medem geometria, e geometria depende
       * de onde a rolagem parou.
       */
      /**
       * A altura é RELIDA a cada parada, e não medida uma vez no começo.
       *
       * Medir uma vez foi um defeito meu, e ele produziu falso positivo: em
       * 390px a página é bem mais alta, as imagens ainda estavam carregando
       * quando a varredura começou, e o limite do laço ficou velho. As últimas
       * seções nunca entraram na tela, a revelação delas não disparou, e a
       * regra S13 acusou cinco trechos "apagados" num site inteiro e correto.
       *
       * O teto de voltas existe para página que cresce a cada rolagem (rolagem
       * infinita) não virar laço eterno.
       */
      let y = 0;
      for (let volta = 0; volta < 200; volta++) {
        await pagina.evaluate(`window.scrollTo(0, ${y})`);
        await pagina.waitForTimeout(120);
        const altura = await pagina.evaluate('document.body.scrollHeight');
        const total = typeof altura === 'number' ? altura : 0;
        if (y >= total) break;
        y += 450;
      }
      await pagina.evaluate('window.scrollTo(0, 0)');
      // A espera final continua valendo: a última revelação ainda está em
      // transição quando a rolagem volta, e medir no meio dela dá número falso.
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
        apagados: {
          texto: string;
          opacidade: number;
          onde: string;
          seletor: string | null;
          culpado: string | null;
        }[];
        vazios: string[];
        fora: string[];
        colapsadas: string[];
        alvosPequenos: string[];
        textoMiudo: string[];
        imagensMinusculas: string[];
        rolagemAninhada: string[];
        respiroMorto: string[];
        alturaTotal: number;
        alturaUtil: number;
      };
      await pagina.close();
      const medida: SiteNoNavegador = {
        largura,
        contrastesAbaixoDoPiso: bruto.contrastes,
        textoApagado: bruto.apagados,
        slotsDeMidiaVazios: bruto.vazios,
        transbordam: bruto.fora,
        secoesColapsadas: bruto.colapsadas,
        alvosDeToquePequenos: bruto.alvosPequenos,
        textoMiudo: bruto.textoMiudo,
        /**
         * Os quatro campos das regras S17 a S20.
         *
         * Este objeto é montado campo a campo, e não por espalhamento: campo
         * novo medido no navegador que ninguém copia aqui some em silêncio, e a
         * regra nasce sem nunca disparar. Aconteceu — as quatro rodaram sobre
         * 20 sites e devolveram nada, porque o veredito lia um objeto onde elas
         * não estavam.
         */
        imagensMinusculas: bruto.imagensMinusculas,
        rolagemAninhada: bruto.rolagemAninhada,
        respiroMorto: bruto.respiroMorto,
        alturaTotal: bruto.alturaTotal,
        alturaUtil: bruto.alturaUtil,
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
