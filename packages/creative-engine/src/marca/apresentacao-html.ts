/**
 * A APRESENTAÇÃO DA MARCA: o HTML que vira o PDF.
 *
 * ## Por que HTML, e não um gerador de PDF
 *
 * Decisão do dono: a fonte editável é HTML versionado, e o PDF é ele impresso.
 * Isso mantém o texto como TEXTO (selecionável, buscável, corrigível com um
 * `git diff`), e o layout numa linguagem que qualquer pessoa da casa lê. Um
 * PDF montado por biblioteca vira binário opaco na primeira correção de vírgula.
 *
 * ## O que a referência aprovada ensina, e o que dela NÃO se copia
 *
 * O dono aprovou uma apresentação de referência e o que vale dela é o MÉTODO:
 * editorial e limpa, muito espaço em branco, hierarquia tipográfica clara,
 * cabeçalho e paginação consistentes, alternância controlada entre fundo claro
 * e escuro, exemplos reais de aplicação, instruções de faça/evite, e pendências
 * declaradas com honestidade. Ela EXPLICA o sistema em vez de ser uma galeria.
 *
 * O que não se copia é a marca dela: paleta, fontes, imagens, textos e
 * composição exata. Cada apresentação sai na cor e na letra da própria marca,
 * com os dados da própria marca.
 *
 * ## O que `data-inteiro` marca, e por quê
 *
 * Uma imagem de REFERÊNCIA pode ser recortada: ela mostra o padrão, e o
 * enquadramento não é o assunto. Uma imagem de APLICAÇÃO não pode — ela existe
 * para mostrar a peça inteira, e recortada ela vira uma peça diferente.
 *
 * A diferença estava só no CSS, e por isso um `object-fit: cover` cortou a
 * headline de um conceito de banner no meio, numa página cujo propósito é
 * mostrar a peça. Quem viu foi o olho, ao abrir o PDF. `data-inteiro` declara a
 * intenção no documento, e a régua a MEDE — que é a diferença entre uma
 * decisão de layout e uma promessa conferível.
 *
 * ## Seção sem dado não é inventada
 *
 * A referência é explícita: se uma seção não tem dado válido, o template não
 * inventa. Ela é omitida, ou aparece como pendência escrita. É a mesma regra da
 * régua — o que não se mede não fica verde — aplicada ao documento.
 */

/** Uma arte gerada que a apresentação mostra. */
export type ArteDaApresentacao = {
  /** O título da página ou do bloco. */
  readonly titulo: string;
  /** O que ela demonstra, em uma frase. */
  readonly legenda: string;
  /** O PNG como data URI. */
  readonly imagem: string;
};

export type DadosDaApresentacao = {
  readonly nome: string;
  /** O que a marca faz, do briefing. */
  readonly oQueFaz: string;
  readonly tom: string;
  readonly cor: string;
  /** A tinta que se lê sobre a cor da marca, já calculada. */
  readonly tintaSobreACor: string;
  /** A família tipográfica e o `@font-face` embutido. */
  readonly fonte: { readonly familia: string; readonly css: string } | null;
  /** As versões da logo, como data URI. */
  readonly logos: {
    readonly principal: string;
    readonly negativo: string;
    readonly fundoBranco: string;
    readonly lockupHorizontal: string;
    readonly lockupVertical: string;
  };
  /** Os favicons, do menor ao maior, com o lado de cada um. */
  readonly favicons: readonly { readonly lado: number; readonly imagem: string }[];
  /** A paleta, com nome, hex e o papel de cada cor. */
  readonly paleta: readonly {
    readonly nome: string;
    readonly hex: string;
    readonly papel: string;
    /** O contraste medido contra branco. */
    readonly sobreBranco: number;
  }[];
  /** A direção de imagem: as capas de categoria. Vazio = seção omitida. */
  readonly direcaoDeImagem: readonly ArteDaApresentacao[];
  /** Os conceitos de banner. Vazio = seção omitida. */
  readonly banners: readonly ArteDaApresentacao[];
  /**
   * As COLEÇÕES: as categorias que a vitrine mostra, cada uma com a sua capa.
   *
   * Elas entram na apresentação e não só na pasta pela mesma razão que o mobile
   * dos banners entrou: a página de aplicação existe para o cliente VER o que
   * vai receber, e uma capa que só existe em disco ele descobre depois.
   *
   * `decididoPor` viaja porque a decisão tem dono. Quando foi o Orbis que
   * escolheu as categorias, a página diz isso — a mesma regra da cor, que pode
   * ser escolhida por nós e nunca em silêncio.
   *
   * Vazio = seção omitida: marca que não é loja não tem vitrine, e uma página
   * vazia diria que faltou alguma coisa.
   */
  readonly colecoes: {
    readonly formato: string;
    readonly decididoPor: 'cliente' | 'orbis';
    readonly itens: readonly { readonly nome: string; readonly imagem: string }[];
  } | null;
  /** O que ainda depende do cliente. Vazio = a seção diz que não há nada. */
  readonly pendencias: readonly string[];
  readonly versao: string;
  /** A data, já formatada. Vem de fora porque o motor não inventa relógio. */
  readonly data: string;
};

/** Escapa o que vem do briefing: ele é texto do cliente, não HTML. */
const esc = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * As páginas, na ordem da referência.
 *
 * A ordem não é arbitrária: ela vai do que a marca É para como ela se APLICA, e
 * termina no que ainda falta decidir. Quem lê de cima a baixo entende o sistema
 * antes de ver a primeira aplicação — que é a diferença entre uma apresentação
 * e uma galeria de imagens.
 */
export const htmlDaApresentacao = (d: DadosDaApresentacao): string => {
  const familia =
    d.fonte === null
      ? "'Georgia',serif"
      : `'${d.fonte.familia.replace(/'/g, '')}',system-ui,sans-serif`;

  let n = 0;
  const pagina = (
    secao: string,
    corpo: string,
    modo: 'claro' | 'escuro' | 'marca' = 'claro',
  ): string => {
    n += 1;
    return `<section class="p ${modo}">
      <header><span class="secao">${esc(secao)}</span><span class="num">${String(n).padStart(2, '0')}</span></header>
      <div class="corpo">${corpo}</div>
      <footer><span>${esc(d.nome)}</span><span>${esc(d.versao)}</span></footer>
    </section>`;
  };

  const paginas: string[] = [];

  // 01 — Capa
  paginas.push(
    pagina(
      'Apresentação da marca',
      `<div class="capa">
        <img class="capa-logo" data-inteiro src="${d.logos.negativo}" alt="${esc(d.nome)}">
        <h1>${esc(d.nome)}</h1>
        <p class="sub">${esc(d.oQueFaz)}</p>
        <p class="meta">${esc(d.versao)} &middot; ${esc(d.data)}</p>
      </div>`,
      'marca',
    ),
  );

  // 02 — O sistema
  paginas.push(
    pagina(
      'O sistema visual',
      `<h2>O que este documento é</h2>
      <div class="duas">
        <div>
          <p>Este é o sistema visual de <strong>${esc(d.nome)}</strong>: o símbolo, as
          versões dele, a cor, a letra e as regras de uso. Ele existe para que a marca
          apareça igual em todo lugar, e para que quem for aplicá-la não precise
          adivinhar.</p>
          ${d.tom.trim() === '' ? '' : `<p>O tom da marca: <strong>${esc(d.tom)}</strong>.</p>`}
        </div>
        <div>
          <p class="nota">Tudo o que está aqui foi <strong>medido</strong>, não afirmado:
          as versões saem do mesmo símbolo por cálculo, o contraste de cada cor é
          conferido contra o piso de 3:1, e o que não pôde ser verificado aparece na
          última página como pendência, em vez de sumir.</p>
        </div>
      </div>`,
    ),
  );

  // 03 — O logotipo
  paginas.push(
    pagina(
      'O logotipo',
      `<h2>Uma marca, três roupas</h2>
      <p class="chamada">As três saem do <strong>mesmo símbolo</strong>, por cálculo. Não são
      três desenhos parecidos: são o mesmo desenho recortado para cada situação.</p>
      <div class="tres">
        <figure class="sobre-claro"><img data-inteiro src="${d.logos.principal}" alt="Logotipo principal"><figcaption><strong>Principal</strong><br>Sobre fundo claro.</figcaption></figure>
        <figure class="sobre-marca"><img data-inteiro src="${d.logos.negativo}" alt="Logotipo negativo"><figcaption><strong>Negativo</strong><br>Sobre fundo escuro ou sobre a cor da marca.</figcaption></figure>
        <figure class="sobre-claro"><img data-inteiro src="${d.logos.lockupHorizontal}" alt="Assinatura horizontal"><figcaption><strong>Assinatura</strong><br>Símbolo e nome, para barra de topo e e-mail.</figcaption></figure>
      </div>`,
    ),
  );

  // 04 — Favicon e redução
  paginas.push(
    pagina(
      'Redução',
      `<h2>Como ele se comporta pequeno</h2>
      <p class="chamada">Cada um abaixo está no <strong>tamanho real</strong>. É onde se vê
      se a forma sobrevive: numa aba de navegador o símbolo tem 16 pixels de lado.</p>
      <div class="favicons">
        ${d.favicons
          .map(
            (f) =>
              `<figure><span class="moldura"><img style="width:${f.lado}px;height:${f.lado}px" src="${f.imagem}" alt="${f.lado} pixels"></span><figcaption>${f.lado}px</figcaption></figure>`,
          )
          .join('')}
      </div>
      <p class="nota">O arquivo <code>favicon.ico</code> carrega 16, 32 e 48 juntos: o
      sistema escolhe entre eles conforme o lugar. Com um tamanho só, ele reduz por conta
      e a forma some.</p>`,
    ),
  );

  // 05 — Paleta
  paginas.push(
    pagina(
      'Paleta',
      `<h2>As cores, e o papel de cada uma</h2>
      <div class="paleta">
        ${d.paleta
          .map(
            (c) =>
              `<figure><span class="amostra" style="background:${c.hex}"></span>
              <figcaption><strong>${esc(c.nome)}</strong><br><code>${esc(c.hex)}</code><br>
              <span class="papel">${esc(c.papel)}</span><br>
              <span class="medida">${c.sobreBranco.toFixed(2)}:1 sobre branco</span></figcaption></figure>`,
          )
          .join('')}
      </div>
      <p class="nota">O número embaixo de cada cor é o contraste MEDIDO contra branco. O
      piso para texto é 3:1 — abaixo disso a cor serve de fundo, não de tinta.</p>
      <p class="nota">Conversão para impressão (CMYK) não está aqui de propósito: ela
      depende do perfil da gráfica, e um valor não verificado sai errado no papel.</p>`,
    ),
  );

  // 06 — Tipografia
  if (d.fonte !== null) {
    paginas.push(
      pagina(
        'Tipografia',
        `<h2>${esc(d.fonte.familia)}</h2>
        <div class="tipo">
          <p class="amostra-tipo" style="font-weight:700;font-size:52px">Aa Bb Cc 0123</p>
          <p class="amostra-tipo" style="font-weight:600;font-size:30px">Títulos e chamadas</p>
          <p class="amostra-tipo" style="font-weight:400;font-size:18px">Texto corrido, o peso que carrega parágrafo. Acentuação completa: ação, coração, você, três.</p>
        </div>
        <p class="nota">Licença: fonte do catálogo Google Fonts, de uso livre inclusive
        comercial. O arquivo viaja embutido nas peças, então elas não dependem de a fonte
        estar instalada em quem abrir.</p>`,
      ),
    );
  }

  // 07 — Direção de imagem
  if (d.direcaoDeImagem.length > 0) {
    paginas.push(
      pagina(
        'Direção de imagem',
        `<h2>Como as imagens desta marca são</h2>
        <p class="chamada">Não é uma galeria: são o padrão a seguir quando alguém for
        escolher ou produzir uma foto para a marca.</p>
        <div class="tres">
          ${d.direcaoDeImagem
            .map(
              (a) =>
                `<figure><img class="cheia" src="${a.imagem}" alt="${esc(a.titulo)}"><figcaption><strong>${esc(a.titulo)}</strong><br>${esc(a.legenda)}</figcaption></figure>`,
            )
            .join('')}
        </div>`,
      ),
    );
  }

  // 08+ — Conceitos de banner, um por página
  for (const b of d.banners) {
    paginas.push(
      pagina(
        'Aplicação',
        `<h2>${esc(b.titulo)}</h2>
        <p class="chamada">${esc(b.legenda)}</p>
        <div class="aplicacao"><img class="cheia" data-inteiro src="${b.imagem}" alt="${esc(b.titulo)}"></div>`,
        'escuro',
      ),
    );
  }

  // As coleções da vitrine, todas numa página: elas são um CONJUNTO, e vê-las
  // juntas é o que mostra se elas parecem da mesma marca.
  if (d.colecoes !== null && d.colecoes.itens.length > 0) {
    const raio =
      d.colecoes.formato === 'redonda' ? '50%' : d.colecoes.formato === 'arredondada' ? '12%' : '0';
    paginas.push(
      pagina(
        'Aplicação',
        `<h2>As coleções da vitrine</h2>
        <p class="chamada">${
          d.colecoes.decididoPor === 'orbis'
            ? 'As categorias abaixo fui eu que escolhi, a partir do que a marca faz. Trocar um nome é barato: a capa é a mesma imagem, recortada de novo.'
            : 'As categorias que o senhor pediu, cada uma com a sua capa.'
        } O formato é ${esc(d.colecoes.formato)}, e ele sai por recorte — mudar de ideia não custa geração nova.</p>
        <div class="colecoes">
          ${d.colecoes.itens
            .map(
              (c) =>
                `<figure><img src="${c.imagem}" alt="${esc(c.nome)}" style="border-radius:${raio}"><figcaption>${esc(c.nome)}</figcaption></figure>`,
            )
            .join('')}
        </div>`,
      ),
    );
  }

  // Regras de uso
  paginas.push(
    pagina(
      'Regras de uso',
      `<h2>Faça, e não faça</h2>
      <div class="duas">
        <div class="faca">
          <h3>Faça</h3>
          <ul>
            <li>Use o <strong>negativo</strong> sobre fundo escuro e o <strong>principal</strong> sobre claro. É medido: o logotipo precisa de 3:1 contra o fundo em que pousa.</li>
            <li>Mantenha a proporção. As versões têm altura fixa e largura automática justamente para isso.</li>
            <li>Deixe respiro em volta: pelo menos a altura do próprio símbolo dividida por dez.</li>
            <li>Use a cor da marca como fundo, e a tinta calculada por cima dela.</li>
          </ul>
        </div>
        <div class="evite">
          <h3>Evite</h3>
          <ul>
            <li><strong>Esticar.</strong> Marca deformada é a primeira coisa que o dono dela percebe.</li>
            <li><strong>O logotipo colorido sobre a cor da marca.</strong> Ele some — medido em 1,21:1 numa peça real, e nenhuma leitura de texto percebe.</li>
            <li><strong>Recolorir o símbolo.</strong> Para uma tinta só existe a versão monocromática.</li>
            <li><strong>Redesenhar.</strong> Pedir "o mesmo símbolo, só que…" a um gerador devolve outro desenho.</li>
          </ul>
        </div>
      </div>`,
    ),
  );

  // Pendências
  paginas.push(
    pagina(
      'Decisões pendentes',
      `<h2>O que ainda depende de você</h2>
      ${
        d.pendencias.length === 0
          ? '<p class="chamada">Nada pendente: tudo o que este documento afirma foi medido.</p>'
          : `<ul class="pendencias">${d.pendencias.map((p) => `<li>${esc(p)}</li>`).join('')}</ul>`
      }
      <p class="nota">Esta página existe porque pendência escondida vira surpresa na
      entrega. O que não pôde ser verificado está escrito aqui, e não omitido.</p>`,
      'escuro',
    ),
  );

  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<title>${esc(d.nome)} — apresentação da marca</title>
<style>
  ${d.fonte?.css ?? ''}
  *{margin:0;padding:0;box-sizing:border-box}
  :root{--marca:${d.cor};--tinta:${d.tintaSobreACor};--papel:#ffffff;--grafite:#141414;--cinza:#6b6b6b;--linha:#e6e6e6}
  html{font-family:${familia};color:var(--grafite);-webkit-font-smoothing:antialiased}
  /* A4 paisagem em 96dpi. As páginas são irmãs, e cada uma quebra depois de si. */
  .p{width:1123px;height:794px;padding:56px 72px;display:flex;flex-direction:column;
     background:var(--papel);page-break-after:always;break-after:page;position:relative;overflow:hidden}
  .p:last-child{page-break-after:auto;break-after:auto}
  .p.escuro{background:var(--grafite);color:#f4f4f4}
  .p.marca{background:var(--marca);color:var(--tinta)}
  header{display:flex;justify-content:space-between;align-items:baseline;
         padding-bottom:14px;border-bottom:1px solid var(--linha);font-size:11px;
         letter-spacing:.14em;text-transform:uppercase;opacity:.65}
  .escuro header,.marca header{border-color:rgba(255,255,255,.22)}
  footer{display:flex;justify-content:space-between;font-size:10px;letter-spacing:.1em;
         text-transform:uppercase;opacity:.45;padding-top:14px}
  .corpo{flex:1;display:flex;flex-direction:column;justify-content:center;padding:28px 0}
  h1{font-size:64px;line-height:1.02;letter-spacing:-.03em;font-weight:700}
  h2{font-size:34px;line-height:1.1;letter-spacing:-.02em;font-weight:700;margin-bottom:18px}
  h3{font-size:15px;letter-spacing:.12em;text-transform:uppercase;margin-bottom:12px;opacity:.7}
  p{font-size:15px;line-height:1.62;max-width:62ch}
  p + p{margin-top:12px}
  .chamada{font-size:18px;line-height:1.5;max-width:70ch;margin-bottom:26px}
  .nota{font-size:12.5px;line-height:1.6;color:var(--cinza);margin-top:20px;max-width:78ch}
  .escuro .nota,.marca .nota{color:rgba(255,255,255,.62)}
  code{font-family:ui-monospace,monospace;font-size:12px}
  /* Capa */
  .capa{display:flex;flex-direction:column;justify-content:center;height:100%}
  /* O align-self é o que impede o esticamento. Num flex em coluna o padrão é
     stretch: a imagem obedece a altura, ignora a largura automática e se estica
     pela largura toda. Saía a 10,2 de proporção onde o arquivo é 1,0 — uma logo
     deformada na CAPA, e eu não tinha visto. Quem viu foi a medida. */
  .capa-logo{height:96px;width:auto;align-self:flex-start;margin-bottom:34px}
  .capa .sub{font-size:19px;line-height:1.5;max-width:56ch;margin-top:18px;opacity:.85}
  .capa .meta{font-size:11px;letter-spacing:.16em;text-transform:uppercase;margin-top:34px;opacity:.6}
  /* Grades */
  .duas{display:grid;grid-template-columns:1fr 1fr;gap:44px}
  .tres{display:grid;grid-template-columns:repeat(3,1fr);gap:26px;align-items:start}
  figure{display:flex;flex-direction:column;gap:12px}
  figcaption{font-size:12.5px;line-height:1.55;color:var(--cinza)}
  .escuro figcaption{color:rgba(255,255,255,.62)}
  .tres figure img{max-width:100%;max-height:190px;width:auto;object-fit:contain;align-self:flex-start}
  .tres figure.sobre-claro{background:#f6f5f2;padding:26px;border:1px solid var(--linha)}
  .tres figure.sobre-marca{background:var(--marca);padding:26px}
  .tres figure.sobre-marca figcaption{color:rgba(255,255,255,.72)}
  /* A referência de imagem pode ser recortada: ela mostra o PADRÃO, e o
     enquadramento não é o assunto. */
  img.cheia{width:100%;height:210px;object-fit:cover;display:block}
  /* A aplicação NÃO pode. Ela existe para mostrar a peça inteira, e o recorte
     cortava a headline no meio — o mesmo defeito que a régua das peças pega,
     acontecendo dentro do documento que explica a marca. */
  .aplicacao{display:flex;justify-content:center}
  .aplicacao img.cheia{width:auto;max-width:100%;height:auto;max-height:400px;object-fit:contain}
  /* Favicons no tamanho real */
  .favicons{display:flex;gap:38px;align-items:flex-end;margin:12px 0 8px}
  /* As capas em GRADE, e não em fila: elas são um conjunto, e ver uma ao lado
     da outra é o que mostra se elas parecem da mesma marca. O auto-fit deixa
     quatro caberem numa linha e oito em duas, sem número cravado.
     (Sem crase neste comentário: ela FECHA o template literal que segura este
     CSS inteiro, e o erro sai como "; expected" quinze linhas abaixo.) */
  .colecoes{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:30px;margin:22px 0}
  .colecoes figure{margin:0;text-align:center}
  .colecoes img{width:100%;aspect-ratio:1;object-fit:cover;display:block}
  .colecoes figcaption{margin-top:10px;font-size:12px;letter-spacing:.04em}
  .favicons figure{align-items:center;gap:10px}
  .moldura{display:flex;align-items:center;justify-content:center;min-width:64px;min-height:64px;
           background:#f6f5f2;border:1px solid var(--linha)}
  .favicons figcaption{font-size:11px}
  /* Paleta */
  .paleta{display:grid;grid-template-columns:repeat(4,1fr);gap:22px}
  .amostra{display:block;height:96px;border:1px solid var(--linha)}
  .papel{font-size:11.5px}
  .medida{font-size:11px;opacity:.75}
  /* Tipografia */
  .tipo{display:flex;flex-direction:column;gap:16px;margin:8px 0 4px}
  .amostra-tipo{max-width:none;line-height:1.25}
  /* Faça/evite */
  .faca h3{color:#1f7a43}
  .evite h3{color:#a32020}
  ul{margin-left:18px}
  li{font-size:14px;line-height:1.6;margin-bottom:10px}
  .pendencias li{font-size:15px}
</style></head><body>
${paginas.join('\n')}
</body></html>`;
};
