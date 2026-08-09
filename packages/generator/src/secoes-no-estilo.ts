/**
 * A seção que o kit não tem peça para preencher, CONSTRUÍDA na linguagem do kit.
 *
 * ## Por que existe
 *
 * As sequências de AIDA passaram de 7-9 para 11-12 etapas, e a Biblioteca não
 * cobre todas em todo nicho: `testimonial` tem 3 peças para 20 kits, `timeline`
 * 4, `logo-cloud` 5. Até aqui, etapa sem peça saía VAZIA — com um aviso, mas
 * vazia. O dono foi direto: *"o que você ver que não encaixa você pode gerar o
 * componente que condiz com o contexto da marca"*.
 *
 * É o mesmo estatuto de `abas-da-pagina.ts`: o compositor CONSTRÓI, na paleta e
 * no ritmo MEDIDOS do kit, em vez de derivar de uma captura que não tem aquilo.
 *
 * ## O que ela NÃO faz, e por quê
 *
 * Não inventa depoimento, número de resultado nem logo de cliente.
 *
 * Não é escrúpulo de estilo: esses três são **afirmações de fato sobre
 * terceiros**. Um depoimento inventado põe na boca de uma pessoa que não existe
 * um elogio que ela não deu; um número inventado é alegação de desempenho; uma
 * nuvem de logos inventada diz que empresas são clientes de quem não as tem. Sai
 * do site do cliente como se fosse verdade, e quem responde por isso é ele.
 *
 * Nesses papéis a seção é RECUSADA com motivo, e o motivo sobe no resumo — que é
 * a mesma disciplina do resto do motor: degradar para o que se sabe, nunca para
 * o vazio calado.
 *
 * O que ela usa é material do próprio projeto: a `instrucao` que o usuário
 * escreveu para aquela seção, o nome da marca, a chamada principal e o contato.
 */

/**
 * O texto do usuário entra como TEXTO, nunca como marcação.
 *
 * Ele vem de um campo livre do wizard: um `&` de "Silva & Filhos" quebraria a
 * entidade seguinte, e um `<` abriria uma tag que ninguém escreveu.
 */
const escaparHtml = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * Os papéis de fato sobre terceiro em modo PROTÓTIPO.
 *
 * O dono pediu: *"pode colocar dados de placeholder, esses sites são só
 * protótipos, não é para cliente final"*. É uma distinção real e ela entra como
 * modo, não como exceção solta — `entrega` continua recusando.
 *
 * O placeholder é entre COLCHETES e genérico, e isso é a decisão que importa:
 * um "Maria Silva, diretora de operações" com um elogio plausível é
 * indistinguível de um depoimento real no dia em que a prévia for compartilhada
 * — e a página não carrega o aviso de que é protótipo. `[nome do cliente]` não
 * consegue ser confundido com ninguém, e serve igualmente para o que o
 * protótipo existe: ver a forma, o espaçamento e o contraste da seção.
 */
const PLACEHOLDER: Record<string, (n: number) => string> = {
  testimonials: (n) => cartoesDeDepoimento(n),
  testimonial: (n) => cartoesDeDepoimento(n),
  stats: (n) => faixaDeNumeros(n),
  logos: (n) => nuvemDeLogos(n),
  'logo-cloud': (n) => nuvemDeLogos(n),
};

const cartoesDeDepoimento = (n: number): string =>
  Array.from(
    { length: n },
    (_, i) => `    <figure class="ds-criada-cartao">
      <blockquote class="ds-criada-texto">[depoimento ${i + 1} — o que o cliente disse]</blockquote>
      <figcaption class="ds-criada-autoria">[nome do cliente] · [cargo, empresa]</figcaption>
    </figure>`,
  ).join('\n');

const faixaDeNumeros = (n: number): string =>
  Array.from(
    { length: n },
    (_, i) => `    <div class="ds-criada-numero">
      <span class="ds-criada-cifra">[00]</span>
      <span class="ds-criada-rotulo">[o que o número ${i + 1} mede]</span>
    </div>`,
  ).join('\n');

const nuvemDeLogos = (n: number): string =>
  Array.from(
    { length: n },
    (_, i) => `    <div class="ds-criada-logo" role="img" aria-label="Espaço para logo ${i + 1}">[logo ${i + 1}]</div>`,
  ).join('\n');

/** Papéis cujo conteúdo é afirmação de fato sobre terceiro. Não se inventa. */
const FATO_SOBRE_TERCEIRO: Record<string, string> = {
  testimonials:
    'depoimento é fala de uma pessoa real; inventar põe na boca de alguém um elogio que não foi dado',
  testimonial:
    'depoimento é fala de uma pessoa real; inventar põe na boca de alguém um elogio que não foi dado',
  stats: 'número de resultado é alegação de desempenho, e quem responde por ela é o cliente',
  logos: 'nuvem de logos afirma que aquelas empresas são clientes de quem exibe',
  'logo-cloud': 'nuvem de logos afirma que aquelas empresas são clientes de quem exibe',
};

export type ContextoDaSecaoCriada = {
  papel: string;
  /** O nome que o usuário deu à seção. */
  nome: string;
  /** O que ELE escreveu para esta seção. É a fonte do texto. */
  instrucao?: string | null;
  marca: {
    nome?: string | null;
    chamada?: string | null;
    email?: string | null;
    telefone?: string | null;
    endereco?: string | null;
  };
  /** Duração e curva MEDIDAS no CSS do kit — o site inteiro no mesmo compasso. */
  duracaoMs: number;
  easing: string;
  /**
   * `prototipo` libera placeholder nos papéis de fato sobre terceiro; `entrega`
   * recusa. O padrão é `entrega`, porque é o modo em que o erro custa caro: um
   * site que vai ao ar com depoimento inventado é problema do cliente, não do
   * motor. O banco de prova e a prévia declaram `prototipo`.
   */
  modo?: 'prototipo' | 'entrega';
};

export type SecaoCriada =
  | { html: string; css: string; recusa?: undefined }
  | { html?: undefined; css?: undefined; recusa: string };

const limpo = (s: string | null | undefined): string => (s ?? '').trim();

/**
 * Quebra o texto do usuário em título e parágrafos.
 *
 * A primeira linha vira título só quando é CURTA (até 80) e não termina em
 * ponto: parágrafo inteiro promovido a `<h2>` sai gigante e desmonta a
 * hierarquia — foi o defeito que a régua S4 e a S14 já cobram no resto do site.
 */
const partirTexto = (texto: string): { titulo: string | null; paragrafos: string[] } => {
  const linhas = texto
    .split(/\n+/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (linhas.length === 0) return { titulo: null, paragrafos: [] };
  const primeira = linhas[0] ?? '';
  const viraTitulo = linhas.length > 1 && primeira.length <= 80 && !/[.!?]$/.test(primeira);
  return viraTitulo
    ? { titulo: primeira, paragrafos: linhas.slice(1) }
    : { titulo: null, paragrafos: linhas };
};

/** A chamada e o contato, que são material do próprio cliente. */
const blocoDeContato = (c: ContextoDaSecaoCriada): string => {
  const linhas: string[] = [];
  const email = limpo(c.marca.email);
  const tel = limpo(c.marca.telefone);
  const end = limpo(c.marca.endereco);
  if (email !== '')
    linhas.push(
      `<a class="ds-criada-contato" href="mailto:${escaparHtml(email)}">${escaparHtml(email)}</a>`,
    );
  if (tel !== '')
    linhas.push(
      `<a class="ds-criada-contato" href="tel:${escaparHtml(tel.replace(/[^\d+]/g, ''))}">${escaparHtml(tel)}</a>`,
    );
  if (end !== '') linhas.push(`<p class="ds-criada-contato">${escaparHtml(end)}</p>`);
  return linhas.join('\n');
};

/**
 * O CSS das seções criadas.
 *
 * Nada de hex solto: tudo em `var(--marca-*)`, que é o que faz a seção parecer
 * do mesmo site. E **nenhum `background` no wrapper**: o fundo é da PÁGINA, e o
 * compositor já envolve isto em `[data-ds-criado]` transparente. Fundo local só
 * em cartão, com alfa, para a página seguir sendo uma superfície contínua.
 */
export const cssDasSecoesCriadas = (duracaoMs: number, easing: string): string =>
  `/* Seções construídas pelo compositor, na paleta e no ritmo medidos do kit. */
.ds-criada{max-width:72rem;margin:0 auto;padding:4rem 1.5rem}
.ds-criada-titulo{
  color:var(--marca-heading,inherit);
  font-family:var(--marca-fonte-display,inherit);
  font-size:clamp(1.75rem,4vw,2.75rem);line-height:1.15;margin:0 0 1rem;
}
.ds-criada-texto{
  color:var(--marca-body,inherit);
  font-family:var(--marca-fonte-body,inherit);
  font-size:1.0625rem;line-height:1.7;margin:0 0 1rem;max-width:62ch;
}
.ds-criada-acoes{display:flex;flex-wrap:wrap;gap:1rem;align-items:center;margin-top:1.5rem}
.ds-criada-cta{
  display:inline-flex;align-items:center;justify-content:center;
  /* 44px: o mesmo alvo de toque digno que a regra S15 cobra no site inteiro. */
  min-height:44px;min-width:44px;padding:.85rem 1.6rem;
  background:var(--marca-primary,currentColor);
  color:var(--marca-primary-foreground,#fff);
  border-radius:var(--marca-raio-3,.6rem);
  font-family:var(--marca-fonte-body,inherit);font-weight:600;text-decoration:none;
  transition:filter ${duracaoMs}ms ${easing},transform ${duracaoMs}ms ${easing};
}
.ds-criada-cta:hover{filter:brightness(1.08);transform:translateY(-1px)}
.ds-criada-cta:focus-visible{outline:2px solid var(--marca-focus,var(--marca-accent,currentColor));outline-offset:3px}
.ds-criada-contato{
  color:var(--marca-link,var(--marca-body,inherit));
  font-family:var(--marca-fonte-body,inherit);font-size:1.0625rem;
  display:inline-flex;align-items:center;min-height:44px;
}
/*
  A grade das seções de PROTÓTIPO: auto-fit com piso de 16rem, e em 390px ela
  vira uma coluna sozinha sem precisar de media query própria.
  (Sem crase aqui dentro: este bloco é um template literal e crase o FECHA.)
*/
.ds-criada-grade{display:grid;gap:1.25rem;grid-template-columns:repeat(auto-fit,minmax(16rem,1fr))}
.ds-criada-cartao{
  margin:0;padding:1.5rem;border-radius:var(--marca-raio-4,.9rem);
  /* Fundo LOCAL com alfa: a página segue sendo uma superfície contínua. */
  background:color-mix(in srgb,var(--marca-surface,currentColor) 55%,transparent);
  border:1px solid var(--marca-border,transparent);
}
.ds-criada-autoria{
  margin-top:1rem;color:var(--marca-muted,inherit);
  font-family:var(--marca-fonte-body,inherit);font-size:.9375rem;
}
.ds-criada-numero{display:flex;flex-direction:column;gap:.35rem}
.ds-criada-cifra{
  color:var(--marca-primary,inherit);font-family:var(--marca-fonte-display,inherit);
  font-size:clamp(2rem,5vw,3.25rem);line-height:1;font-weight:700;
}
.ds-criada-rotulo{
  color:var(--marca-body,inherit);font-family:var(--marca-fonte-body,inherit);
  /* Nunca abaixo de 12px: é o piso que a regra S16 cobra no site inteiro. */
  font-size:.9375rem;
}
.ds-criada-logo{
  display:flex;align-items:center;justify-content:center;min-height:4.5rem;
  border-radius:var(--marca-raio-3,.6rem);
  border:1px dashed var(--marca-border,currentColor);
  color:var(--marca-muted,inherit);
  font-family:var(--marca-fonte-body,inherit);font-size:.9375rem;
}
@media (max-width:640px){.ds-criada{padding:3rem 1.25rem}}
@media (prefers-reduced-motion:reduce){.ds-criada-cta{transition:none}}
`;

/**
 * Constrói a seção, ou recusa dizendo por quê.
 *
 * Recusa nos três papéis de fato sobre terceiro, e recusa quando não há material
 * nenhum — seção construída com nada seria uma casca com o nome de uma etapa, e
 * o vazio declarado informa mais.
 */
export const criarSecaoNoEstilo = (c: ContextoDaSecaoCriada): SecaoCriada => {
  const impedimento = FATO_SOBRE_TERCEIRO[c.papel];
  if (impedimento !== undefined) {
    const molde = c.modo === 'prototipo' ? PLACEHOLDER[c.papel] : undefined;
    if (molde === undefined) {
      return {
        recusa: `"${c.nome}" não foi criada: ${impedimento}. Traga o material e ela entra.`,
      };
    }
    const titulo = limpo(c.instrucao).split('\n')[0]?.trim() || limpo(c.nome);
    return {
      html: `<section class="ds-criada" data-ds-placeholder>
  <h2 class="ds-criada-titulo">${escaparHtml(titulo)}</h2>
  <div class="ds-criada-grade">
${molde(3)}
  </div>
</section>`,
      css: cssDasSecoesCriadas(c.duracaoMs, c.easing),
    };
  }

  const texto = limpo(c.instrucao);
  const chamada = limpo(c.marca.chamada);
  const contato = blocoDeContato(c);
  const ehContato = c.papel === 'contact' || c.papel === 'cta';

  if (texto === '' && !ehContato) {
    return {
      recusa: `"${c.nome}" não foi criada: não há peça no kit para este papel nem texto seu para esta seção.`,
    };
  }

  const { titulo, paragrafos } = partirTexto(texto);

  /**
   * O CORPO decide se a seção existe — o título, não.
   *
   * Um `<h2>Contato</h2>` sozinho é o nome de uma etapa com moldura em volta:
   * ocupa a página, não informa nada, e ainda passa por seção preenchida no
   * resumo. O vazio DECLARADO informa mais, e é a mesma disciplina do resto do
   * motor.
   */
  const corpo: string[] = paragrafos.map(
    (p) => `  <p class="ds-criada-texto">${escaparHtml(p)}</p>`,
  );

  if (ehContato) {
    const acoes: string[] = [];
    if (chamada !== '')
      acoes.push(`    <a class="ds-criada-cta" href="#contato">${escaparHtml(chamada)}</a>`);
    if (contato !== '') acoes.push(contato);
    if (acoes.length > 0)
      corpo.push(`  <div class="ds-criada-acoes">\n${acoes.join('\n')}\n  </div>`);
  }

  if (corpo.length === 0) {
    return {
      recusa: `"${c.nome}" não foi criada: nem texto seu nem contato da marca para mostrar.`,
    };
  }

  const tituloFinal = titulo ?? (texto === '' ? limpo(c.nome) : null);
  const partes: string[] = ['<section class="ds-criada">'];
  if (tituloFinal !== null && tituloFinal !== '')
    partes.push(`  <h2 class="ds-criada-titulo">${escaparHtml(tituloFinal)}</h2>`);
  partes.push(...corpo, '</section>');

  return { html: partes.join('\n'), css: cssDasSecoesCriadas(c.duracaoMs, c.easing) };
};
