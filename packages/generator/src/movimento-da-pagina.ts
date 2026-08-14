import { type TokensDeMovimento, cssDosTokensDeMovimento } from '@ds/composer';

/**
 * A camada de MOVIMENTO da página composta — a rede de segurança para quando
 * nada no site reage à rolagem.
 *
 * ## Por que ela existe
 *
 * O dono abriu o site do clube e disse que ele "fica parado ao rolar". Estava
 * certo, e a medição explicou por quê:
 *
 * - só **5 das 55 origens** da Biblioteca têm peça de comportamento;
 * - e **nenhum dos 12 kits** usa uma dessas 5 como origem de seção. Zero de
 *   doze. Comportamento de origem própria não é raro no acervo, é inexistente.
 *
 * Uma peça de comportamento é *classe CSS + script que a alterna em quem a
 * carrega*. Seção de outra origem não carrega aquelas classes, e o CSS dela sai
 * escopado na origem de onde veio. Nenhum conserto de escopo faz comportamento
 * estrangeiro animar seção estrangeira — o cruzamento acima diz que
 * "estrangeiro" é o caso NORMAL, e não a exceção.
 *
 * ## Por que isto não é invenção
 *
 * 1. `layout.motion` (`nenhuma | sutil | expressiva`) é campo DECLARADO pelo
 *    usuário no wizard, e até aqui era lido em UM lugar só: uma string de
 *    prompt (`generator/src/index.ts`). O determinístico ignorava por completo.
 *    Honrar uma declaração que já existe não é inventar; ignorá-la é o defeito.
 * 2. O ritmo não sai da minha cabeça: `tokensDeMovimento` (do compositor) MEDE
 *    a duração e a curva do CSS do próprio kit, por mediana. A camada consome
 *    esses números — nada de `0.3s ease` chutado.
 * 3. Isto tem o mesmo estatuto de `cssResponsivoBase`, `marca.css`,
 *    `REGRA_QUE_ABRE_PASSAGEM` e `envolverCamadaDePagina`: coisas que o
 *    compositor CRIA e que nunca vieram de origem nenhuma. A doutrina de "não
 *    prometer o que não entrega" (`representation.ts`) é sobre não afirmar que
 *    uma peça CAPTURADA reproduz a origem — outro assunto.
 * 4. A regra "não mude a essência" proíbe mexer no movimento DA PEÇA. Esta
 *    camada opera na `<section>` — o envelope que o próprio compositor criou —
 *    e nunca dentro da peça. Estrutura, hierarquia, grade e a animação própria
 *    da peça ficam intactas.
 *
 * E ela só entra quando **nada mais** revela ao rolar: comportamento vivo ou
 * classe de revelação devolvida ao estado inicial desligam a camada. Duas
 * revelações sobre o mesmo elemento seriam pior que uma.
 */

/** O quanto a seção sobe ao aparecer, por intensidade declarada no wizard. */
const DESLOCAMENTO = { sutil: 16, expressiva: 28 } as const;

export type IntensidadeDeMovimento = keyof typeof DESLOCAMENTO;

/**
 * Marca as seções que a camada pode revelar.
 *
 * A granularidade é a SEÇÃO, nunca um elemento de dentro da peça: é assim que
 * o "não mude a essência" continua valendo. Quatro exclusões, cada uma com um
 * defeito real por trás:
 *
 * - **a primeira seção com `data-secao`**: ela nasce na dobra visível. Escondê-la
 *   entrega uma tela em branco no primeiro instante do carregamento — o defeito
 *   mais caro que uma revelação pode causar.
 * - **`data-secao="nav"` e `data-secao="footer"`**: moldura, não conteúdo. Uma
 *   navegação que aparece por fade a cada rolagem é bug, não movimento.
 * - **`data-fixa-no-topo`**: a `<section>` dessa nav é `position:sticky`, e um
 *   `transform` no elemento cria containing block — o sticky para de grudar e a
 *   barra fixa desce com a página. É o mesmo motivo pelo qual o estado revelado
 *   volta a `transform:none` e não a `translateY(0)`.
 */
export const marcarAlvosDeRevelacao = (html: string): { html: string; marcados: number } => {
  let vistas = 0;
  let marcados = 0;
  const saida = html.replace(
    /<section\b[^>]*\bdata-secao\s*=\s*"([^"]*)"[^>]*>/gi,
    (tag, papel) => {
      vistas += 1;
      if (vistas === 1) return tag;
      if (papel === 'nav' || papel === 'footer') return tag;
      if (/\bdata-fixa-no-topo\b/i.test(tag)) return tag;
      if (/\bdata-orbis-revelar\b/i.test(tag)) return tag;
      marcados += 1;
      return tag.replace(/>$/, ' data-orbis-revelar>');
    },
  );
  return { html: saida, marcados };
};

/**
 * O CSS da camada, com a duração e a curva MEDIDAS no CSS do kit.
 *
 * Duas decisões que parecem detalhe e não são:
 *
 * - o estado escondido vive **só** sob `html[data-orbis-movimento="ligado"]`, e
 *   esse atributo é posto pelo script DEPOIS de ele confirmar que tem
 *   `IntersectionObserver`. Sem essa trava, um navegador sem o observador
 *   deixaria a página inteira em `opacity:0` para sempre. É exatamente a
 *   disciplina condicional de `limparEstadoRevelado`: nunca esconder o que
 *   ninguém vai revelar.
 * - o estado revelado é `transform:none`, e não `translateY(0)`. Um `transform`
 *   permanente, ainda que identidade, cria containing block e quebra qualquer
 *   `position:fixed` descendente — um menu, um modal, uma camada de fundo.
 *
 * `prefers-reduced-motion` desliga tudo com `!important`, porque quem pediu
 * menos movimento no sistema operacional não deve depender de a cascata cair
 * do lado certo.
 */
export const cssDaRevelacao = (t: TokensDeMovimento, intensidade: IntensidadeDeMovimento): string =>
  [
    '/* Camada de MOVIMENTO da página composta — criada pelo compositor, não',
    '   veio de origem nenhuma. A duração e a curva abaixo foram MEDIDAS no CSS',
    `   do próprio kit (${t.amostras} declaração(ões) de transition/animation). */`,
    `:root{\n${cssDosTokensDeMovimento(t)}\n}`,
    'html[data-orbis-movimento="ligado"] [data-orbis-revelar]:not([data-orbis-revelado]){',
    `  opacity:0;transform:translateY(${DESLOCAMENTO[intensidade]}px)`,
    '}',
    '[data-orbis-revelar]{',
    '  opacity:1;transform:none;',
    '  transition:opacity var(--orbis-duracao-media) var(--orbis-easing),',
    '             transform var(--orbis-duracao-media) var(--orbis-easing)',
    '}',
    '@media (prefers-reduced-motion: reduce){',
    '  [data-orbis-revelar]{opacity:1!important;transform:none!important;transition:none!important}',
    '}',
  ].join('\n');

/**
 * O observador da camada, inline no fim do `<body>`.
 *
 * A PRIMEIRA instrução é a checagem de suporte, e a ordem importa: só depois de
 * saber que existe `IntersectionObserver` é que o atributo que ATIVA o estado
 * escondido é posto no `<html>`. Invertido, um navegador sem suporte receberia
 * a página inteira invisível e nada para revelá-la.
 *
 * `rootMargin: '0px 0px -10% 0px'` faz a seção revelar quando ela entrou de
 * verdade no campo de visão, e não no instante em que a primeira linha de
 * pixels encosta na borda de baixo. `unobserve` porque revelar é de mão única:
 * seção que já apareceu não volta a sumir ao rolar para cima.
 */
export const SCRIPT_DA_REVELACAO = `<script>
(function(){
  if(!('IntersectionObserver' in window)) return;
  document.documentElement.setAttribute('data-orbis-movimento','ligado');
  var alvos = document.querySelectorAll('[data-orbis-revelar]');
  var obs = new IntersectionObserver(function(entradas){
    for (var i=0;i<entradas.length;i++){
      if(!entradas[i].isIntersecting) continue;
      entradas[i].target.setAttribute('data-orbis-revelado','');
      obs.unobserve(entradas[i].target);
    }
  },{rootMargin:'0px 0px -10% 0px'});
  for (var i=0;i<alvos.length;i++) obs.observe(alvos[i]);
})();
</script>`;

/**
 * Os ancestrais que um observador de rolagem acrescenta para REVELAR o que está
 * escondido esperando por ele.
 *
 * É a lista de `CLASSES_DE_REVELACAO` do `montagem.ts` vista do outro lado: lá
 * elas aparecem NO elemento; aqui elas aparecem num ANCESTRAL dele.
 */
const ANCESTRAIS_QUE_REVELAM = [
  'is-visible',
  'is-inview',
  'in-view',
  'aos-animate',
  'revealed',
  'scroll-visible',
  'animate-in',
] as const;

/*
 * `active` e `visible` ficaram DE FORA, e a primeira versão os tinha.
 *
 * São classes comuns demais: quase toda página tem um link de menu com
 * `.active`. Como a decisão de destravar olhava se ALGUM ancestral da lista
 * existia na página, um único `.active` num item de navegação desligava o
 * destrave inteiro — e a seção continuava invisível. É a mesma disciplina de
 * `CLASSES_DE_REVELACAO`, no `montagem.ts`: só entra nome que, na prática, um
 * site usa para uma coisa só.
 */

/**
 * Destrava o conteúdo que nasceu invisível esperando um ancestral que nunca vem.
 *
 * ## O defeito, medido no banco de prova
 *
 * **8 de 12 kits** entregavam uma seção inteira em `opacity: 0`, invisível para
 * sempre. A causa não era a limpeza do estado revelado — nesses sites não havia
 * classe de revelação nenhuma no HTML para limpar. Era o CSS da origem:
 *
 * ```css
 * :where([data-ds-corpo="ds_…"]):is(.animate-fade-up){opacity:0}
 * :where([data-ds-corpo="ds_…"]):is(.in-view .animate-fade-up){opacity:1}
 * ```
 *
 * O elemento nasce escondido, e quem o revela é a classe `.in-view` posta num
 * ANCESTRAL pelo script da origem. Quando esse script não alcança a página
 * composta — o caso normal, porque a peça de comportamento quase sempre vem de
 * outra origem que a das seções —, o ancestral nunca aparece e o texto some.
 *
 * ## A prova, e por que ela é estreita
 *
 * Só destrava o que o próprio CSS PROVA ser revelação: uma classe que aparece
 * zerando opacidade numa regra E aparecendo com opacidade 1 noutra regra
 * qualificada por um ancestral conhecido de revelação. Esse par é a assinatura
 * do padrão; sem ele, um `opacity: 0` pode ser sobreposição decorativa, estado
 * de hover ou camada que deve mesmo ficar invisível — e mexer nisso trocaria um
 * defeito por outro.
 *
 * E só destrava quando o ancestral NÃO ESTÁ na página. Havendo o ancestral, a
 * revelação funciona e nada aqui deve acontecer.
 */
export const destravarRevelacaoSemGatilho = (
  css: string,
  html: string,
): { css: string; classes: string[] } => {
  const zeradas = new Set<string>();
  /**
   * Classe escondida → os ancestrais que a revelam.
   *
   * Guardar QUAL ancestral revela cada classe, e não só "foi revelada por
   * algum", é o que torna a decisão por classe. A primeira versão perguntava se
   * algum ancestral da lista existia na página inteira, e bastava um para
   * desligar o destrave de TODAS — inclusive das classes cujo revelador não
   * estava lá.
   */
  const reveladaPor = new Map<string, Set<string>>();

  // Uma varredura só, ignorando o miolo de `@keyframes`: lá `opacity:0` é o
  // primeiro quadro da animação, não o estado de espera de um elemento.
  const semQuadros = css.replace(/@keyframes[^{]*\{(?:[^{}]*\{[^}]*\})*[^{}]*\}/gi, '');
  for (const m of semQuadros.matchAll(/([^{}]{1,400})\{([^{}]*)\}/g)) {
    const seletor = m[1] ?? '';
    const corpo = m[2] ?? '';
    /**
     * Duas formas de segurar conteúdo, e a segunda é a que o acervo usa.
     *
     * A primeira versão só conhecia `opacity: 0` ⟷ `opacity: 1`, e não casou com
     * nada. Medido no CSS composto: a origem esconde com `opacity: 0` e uma
     * ANIMAÇÃO PAUSADA, e o ancestral de revelação dá play —
     * `:is(.in-view) .animate-scale{animation-play-state:running}`. O último
     * quadro da animação é que traz o elemento de volta.
     *
     * `animation-play-state: paused` é, aliás, o sinal mais limpo dos dois: é
     * conteúdo esperando alguém apertar play, sem outra leitura possível.
     */
    const zera =
      /\bopacity\s*:\s*0(?:\.0+)?\s*(?:!important)?\s*[;}]?/.test(corpo) ||
      /\banimation-play-state\s*:\s*paused/.test(corpo);
    const acende =
      /\bopacity\s*:\s*1(?:\.0+)?\s*(?:!important)?\s*[;}]?/.test(corpo) ||
      /\banimation-play-state\s*:\s*running/.test(corpo);
    if (!zera && !acende) continue;
    /**
     * Sem `new RegExp` de propósito, e a razão é uma armadilha desta base.
     *
     * Regex montada por template literal perde um nível de barra: `\b` vira o
     * caractere de backspace e `\s` vira a letra "s". A primeira versão desta
     * linha montou `.in-view[s>~+]`, que não casa com nada — e o destrave nunca
     * acontecia, em silêncio. O topo do `scripts/conferir-site.ts` documenta a
     * mesma armadilha em outro lugar. Busca por texto não tem esse risco.
     */
    const ancestrais = ANCESTRAIS_QUE_REVELAM.filter((a) => {
      const i = seletor.indexOf(`.${a}`);
      if (i < 0) return false;
      /**
       * É ANCESTRAL quando ainda existe alguém DEPOIS dele no mesmo seletor.
       *
       * Os parênteses que sobram são descartados antes de olhar, e isso não é
       * detalhe: o escopo por origem produz `:is(.in-view) .animate-scale`, e
       * exigir combinador logo após o nome rejeitava justamente a forma que o
       * acervo tem. Vírgula não conta — ali começa outro seletor da lista.
       */
      const resto = seletor.slice(i + a.length + 1).replace(/^\)+/, '');
      return /^[\s>~+]+\S/.test(resto);
    });
    for (const c of seletor.matchAll(/\.([\w-]+)/g)) {
      const classe = c[1];
      if (classe === undefined) continue;
      if ((ANCESTRAIS_QUE_REVELAM as readonly string[]).includes(classe)) continue;
      if (zera && ancestrais.length === 0) zeradas.add(classe);
      if (acende && ancestrais.length > 0) {
        const jaVistos = reveladaPor.get(classe) ?? new Set<string>();
        for (const a of ancestrais) jaVistos.add(a);
        reveladaPor.set(classe, jaVistos);
      }
    }
  }

  // As classes que a página tem, por termo inteiro: `includes` de string casaria
  // `visible` dentro de `is-visible` e daria presença onde não há.
  const classesDaPagina = new Set<string>();
  for (const m of html.matchAll(/\bclass\s*=\s*"([^"]*)"/g)) {
    for (const c of (m[1] ?? '').split(/\s+/)) if (c !== '') classesDaPagina.add(c);
  }

  /**
   * Preso = escondido, provado como revelação, e SEM o revelador dele na página.
   *
   * A decisão é por classe: uma classe cujo `.in-view` existe na página está
   * viva e não se toca; a vizinha, que depende de um `.aos-animate` ausente,
   * está presa. Decidir em bloco confundia as duas.
   */
  const presos = [...zeradas]
    .filter((c) => {
      const quemRevela = reveladaPor.get(c);
      if (quemRevela === undefined) return false;
      return ![...quemRevela].some((a) => classesDaPagina.has(a));
    })
    .sort();
  if (presos.length === 0) return { css: '', classes: [] };

  const regra = presos.map((c) => `.${c}`).join(',\n');
  return {
    css: `/*
  Conteúdo que nasceu invisível esperando um ancestral de revelação que não
  chega: o script que o acrescenta não alcança esta página composta. Perder a
  animação de entrada é perda pequena e visível; uma seção em branco é perda
  grande e silenciosa.
*/
${regra}{animation-play-state:running!important;opacity:1!important;transform:none!important;filter:none!important;visibility:visible!important}
`,
    classes: presos,
  };
};

/**
 * A REDE DE SEGURANÇA da revelação: o que entrou na tela e não acendeu, acende.
 *
 * ## Por que CSS não resolve este caso
 *
 * `destravarOpacidadeSemRevelador` e `destravarRevelacaoSemGatilho` leem o CSS,
 * e por isso alcançam só quem se esconde POR CSS. A biblioteca de animação não
 * faz isso: `gsap.from(alvo,{opacity:0})` escreve no `style` do elemento em
 * tempo de execução, e não existe regra nenhuma para a análise estática achar.
 *
 * Medido no banco de prova depois da curadoria: dos 54 trechos apagados que
 * restavam, **52 eram a mesma classe** (`.gsap-fade-up`) de uma origem só — e o
 * HTML entregue trazia `opacity: 1` no atributo, porque o congelamento da
 * captura já tinha sido consertado. Quem zerava era o script, rodando.
 *
 * ## Por que o gatilho é a ENTRADA na tela, e não um relógio
 *
 * Acender tudo depois de um tempo fixo destruiria toda revelação legítima: uma
 * seção abaixo da dobra COMEÇA invisível de propósito, e deve continuar assim
 * até a pessoa chegar nela. O relógio não distingue "falhou" de "ainda não é a
 * hora".
 *
 * A entrada na tela distingue. Quando o elemento aparece e, passado o tempo de
 * uma animação de entrada, ele continua apagado, a revelação não vai mais vir —
 * e é exatamente esse o caso que a régua S13 acusa.
 *
 * ## O que fica de fora, e por quê
 *
 * - **Sem texto**: decoração apagada é desenho, e acendê-la não devolve leitura.
 * - **`pointer-events: none`**: é a assinatura de conteúdo que aparece no hover
 *   (o cartão de preço que abre as vantagens). Acender isso mostraria tudo de
 *   uma vez e quebraria o desenho — já custou uma regressão nesta mesma frente.
 * - **Quem já se lê**: o piso é o mesmo da régua, e nada é tocado acima dele.
 */
export const ESPERA_DA_REDE_MS = 900;

export const SCRIPT_DA_REDE_DE_SEGURANCA = `<script>(function(){
  var ESPERA=${ESPERA_DA_REDE_MS};
  var PISO=0.35;
  function temTexto(el){
    for(var i=0;i<el.childNodes.length;i++){
      var n=el.childNodes[i];
      if(n.nodeType===3&&n.nodeValue&&n.nodeValue.trim().length>2)return true;
    }
    return false;
  }
  /* QUEM apagou e um ancestral: o container carrega a opacidade, o texto esta
     nos filhos, e o efeito e cumulativo. Acender o culpado traz os irmaos. */
  function culpado(el){
    var n=el;
    while(n&&n!==document.body){
      var c=getComputedStyle(n);
      /* Revelado no HOVER: quem nao recebe clique espera o ponteiro. */
      if(c.pointerEvents==='none'&&parseFloat(c.opacity)===0)return null;
      if(parseFloat(c.opacity)<PISO)return n;
      n=n.parentElement;
    }
    return null;
  }
  function efetiva(el){
    var o=1,n=el;
    while(n&&n!==document.documentElement){o*=parseFloat(getComputedStyle(n).opacity);n=n.parentElement;}
    return o;
  }
  /*
    A quarta versao, e cada uma pagou uma licao MEDIDA:

    v1 conferia cada elemento uma vez, 900ms depois de aparecer — todos os
    conferidos ja estavam legiveis e os apagados nunca chegavam a conferencia.
    v2 varria ao parar de rolar, so o que estava NA TELA — quem rola sem parar
    visitava tudo sem dar ociosidade, e so a primeira dobra acendia.
    v3 lembrou os VISITADOS — e mediu zero varreduras: paginas com
    ScrollSmoother/lenis emitem scroll continuamente, o debounce re-armava
    para sempre, e "esperar a ociosidade" era esperar o nunca (contadores:
    241 observados, 119 intersecoes, 0 varreduras).

    v4: debounce para a pagina quieta, PRAZO MAXIMO para a barulhenta. Cada
    visitado carrega a hora em que entrou; a varredura so decide sobre quem ja
    tem ESPERA de idade (animacao de entrada legitima termina antes disso), e
    enquanto houver pendencia um prazo re-armado forca a varredura mesmo sem
    ociosidade nenhuma. Quem nunca foi visitado segue escuro: secao que a
    pessoa nao alcancou comeca invisivel de proposito.
  */
  var pendentes=[];
  var io=new IntersectionObserver(function(entradas){
    for(var i=0;i<entradas.length;i++){
      if(!entradas[i].isIntersecting)continue;
      pendentes.push({el:entradas[i].target,em:Date.now()});
      io.unobserve(entradas[i].target);
    }
    if(pendentes.length)agendar();
  },{threshold:0.15});
  function resolver(el){
    if(efetiva(el)>=PISO)return;
    var alvo=culpado(el);
    if(!alvo)return;
    alvo.style.setProperty('opacity','1','important');
    var t=getComputedStyle(alvo).transform;
    if(t&&t!=='none')alvo.style.setProperty('transform','none','important');
    alvo.setAttribute('data-orbis-acendido','');
  }
  function varrer(){
    if(curto){clearTimeout(curto);curto=null;}
    if(prazo){clearTimeout(prazo);prazo=null;}
    var agora=Date.now(),restam=[];
    for(var i=0;i<pendentes.length;i++){
      var p=pendentes[i];
      /* Novo demais: a animacao de entrada dele ainda esta no curso dela. */
      if(agora-p.em<ESPERA){restam.push(p);continue;}
      resolver(p.el);
    }
    pendentes=restam;
    if(pendentes.length)armarPrazo();
  }
  var curto=null,prazo=null;
  function agendar(){
    if(curto)clearTimeout(curto);
    curto=setTimeout(varrer,ESPERA);
    armarPrazo();
  }
  /* O prazo NAO e re-armado pelo scroll — e isso que o torna um teto. */
  function armarPrazo(){
    if(prazo||!pendentes.length)return;
    prazo=setTimeout(varrer,ESPERA*1.5);
  }
  addEventListener('scroll',agendar,{passive:true});
  addEventListener('resize',agendar,{passive:true});
  function ligar(){
    var alvos=document.querySelectorAll('[data-secao] *');
    for(var i=0;i<alvos.length;i++){
      if(!temTexto(alvos[i]))continue;
      io.observe(alvos[i]);
    }
    agendar();
  }
  if(document.readyState==='loading')addEventListener('DOMContentLoaded',ligar);else ligar();
})()</script>`;
