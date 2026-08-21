/**
 * O TEXTO DO BANNER, escrito por nós na própria arte.
 *
 * Antes o título, o subtítulo e o botão eram campos do tema, desenhados por
 * cima da foto na hora de renderizar. Funciona, mas a composição não é nossa:
 * cada tema põe o bloco onde quer, e em tela estreita ele escorrega para fora
 * da foto. O banner deixa de ser uma peça e vira dois pedaços que às vezes se
 * encontram.
 *
 * Aqui o banner vira UM arquivo fechado, como na referência que o dono
 * apontou: a foto, o véu de leitura e a tipografia, tudo assado junto. O tema
 * recebe só a imagem, com os campos de texto vazios, e não tem como
 * desalinhar.
 *
 * Por que compor e não pedir o texto ao gerador
 * ---------------------------------------------
 * Modelo de imagem erra letra: devolve palavra inventada e acento no lugar
 * errado, e o nome da loja de alguém sai escrito torto. A foto é gerada SEM
 * letra nenhuma (é o que os prompts pedem) e a escrita entra aqui, medida.
 *
 * Roda no NAVEGADOR: precisa de canvas, e o servidor deste app é workerd.
 */

/** Os dois formatos, nas medidas que a Shopify recomenda para banner. */
export const FORMATOS = {
  desktop: { largura: 3000, altura: 1000 },
  mobile: { largura: 1080, altura: 1350 },
} as const;

export type FormatoDeBanner = keyof typeof FORMATOS;

export type TextoDoBanner = {
  titulo: string;
  subtitulo?: string;
  cta?: string;
};

export type CoresDoBanner = {
  /** A cor do véu de leitura: o escuro da marca, não um preto qualquer. */
  veu: string;
  /** A cor da letra sobre o véu. */
  texto: string;
  /** O traço do botão e o filete de apoio. */
  destaque: string;
};

/**
 * O CORTE MAIS ESTREITO que a arte precisa aguentar.
 *
 * O arquivo é 3:1, mas o tema mostra a dobra na altura DELE e o navegador come
 * as laterais para preencher. Quanto da largura sobra é uma conta: a proporção
 * da dobra dividida por 3. Numa dobra de 2,3:1 sobram 77%; numa de 16:9, 59%.
 * Defender até 16:9 cobre o que os temas usam, e a folga de 5% é para o corte
 * não passar rente à letra.
 */
const CORTE_MAIS_ESTREITO = 16 / 9;
const FAIXA_SEGURA = (CORTE_MAIS_ESTREITO / 3) * 0.95;

function carregar(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("FOTO_NAO_CARREGOU"));
    img.src = url;
  });
}

/**
 * A pilha de fontes, com reserva SEMPRE.
 *
 * Canvas não avisa quando a família não existe: ele desenha na fonte padrão e
 * segue. Uma reserva declarada é o que impede o banner de sair numa fonte
 * qualquer sem ninguém perceber.
 */
function pilha(familia: string | undefined, serifada: boolean) {
  const reserva = serifada ? "Georgia, 'Times New Roman', serif" : "'Helvetica Neue', Arial, sans-serif";
  const nome = String(familia ?? "").trim();
  return nome ? `'${nome}', ${reserva}` : reserva;
}

/** Quebra o texto em linhas que cabem na largura, medindo cada palavra. */
function quebrar(ctx: CanvasRenderingContext2D, texto: string, largura: number, maxLinhas: number) {
  const palavras = String(texto ?? "").trim().split(/\s+/).filter(Boolean);
  const linhas: string[] = [];
  let atual = "";
  for (const palavra of palavras) {
    const tentativa = atual ? `${atual} ${palavra}` : palavra;
    if (ctx.measureText(tentativa).width <= largura || !atual) atual = tentativa;
    else { linhas.push(atual); atual = palavra; }
    if (linhas.length === maxLinhas) break;
  }
  if (atual && linhas.length < maxLinhas) linhas.push(atual);
  /* a última linha ganha reticências quando sobrou palavra: cortar no meio de
     uma frase sem avisar faz o banner parecer defeito de renderização */
  const sobrou = palavras.join(" ").length > linhas.join(" ").length;
  if (sobrou && linhas.length) {
    let ultima = linhas[linhas.length - 1];
    while (ultima && ctx.measureText(`${ultima}…`).width > largura) ultima = ultima.slice(0, -1).trimEnd();
    linhas[linhas.length - 1] = `${ultima}…`;
  }
  return linhas;
}

function paraBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("CANVAS_SEM_BLOB"))), "image/jpeg", 0.92);
  });
}

/**
 * Compõe um banner: foto recortada, véu de leitura e a escrita por cima.
 *
 * O véu não é enfeite. Texto claro sobre foto clara some, e o gerador não tem
 * como garantir que aquela região saia escura. Um degradê do lado da escrita
 * resolve isso sem apagar a foto — a parte que importa dela continua limpa.
 *
 * A escrita fica à ESQUERDA no formato largo e EM CIMA no alto, que é onde a
 * mesma cena cabe nos dois cortes.
 */
export async function comporBanner(
  urlDaFoto: string,
  texto: TextoDoBanner,
  cores: CoresDoBanner,
  formato: FormatoDeBanner,
  fontes: { titulo?: string; corpo?: string } = {},
): Promise<Blob> {
  const { largura, altura } = FORMATOS[formato];
  const canvas = document.createElement("canvas");
  canvas.width = largura;
  canvas.height = altura;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("CANVAS_INDISPONIVEL");

  /* a foto cobre o quadro inteiro, cortando o excedente pelo lado maior */
  const foto = await carregar(urlDaFoto);
  const escala = Math.max(largura / foto.naturalWidth, altura / foto.naturalHeight);
  const larguraFinal = foto.naturalWidth * escala;
  const alturaFinal = foto.naturalHeight * escala;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(foto, (largura - larguraFinal) / 2, (altura - alturaFinal) / 2, larguraFinal, alturaFinal);

  const deLado = formato === "desktop";
  /**
   * SEM texto, sem véu: a peça é a foto no formato certo.
   *
   * O véu existe para a letra ficar legível. Sem letra ele seria só uma sombra
   * escurecendo a foto sem motivo — e o dono pediu banner sem texto. O que
   * sobra da composição continua valendo, e é o que importa: o corte exato de
   * cada formato, a partir da MESMA foto.
   */
  if (!texto.titulo.trim()) return paraBlob(canvas);
  /**
   * O véu é MEDIDO, não fixo.
   *
   * Uma barra escura sempre igual estraga foto que já era escura e não salva
   * foto clara demais. Aqui a região da escrita é lida de verdade e o véu só
   * cobre o que falta para a letra ficar legível — em foto já escura ele quase
   * some, e a cena continua aparecendo.
   */
  const faixa = deLado ? Math.round(largura * FAIXA_SEGURA) : largura - Math.round(largura * 0.09) * 2;
  const meio = Math.round(largura / 2);
  /**
   * O véu é MEDIDO, e é lido ONDE a letra vai.
   *
   * Uma barra escura sempre igual estraga foto que já era escura e não salva
   * foto clara demais. Aqui a região da escrita é lida de verdade e o véu só
   * cobre o que falta para a letra ficar legível — em foto já escura ele quase
   * some, e a cena continua aparecendo.
   *
   * A leitura mudou para a faixa CENTRAL junto com a escrita: medir a lateral
   * esquerda enquanto a frase é desenhada no meio é medir um pedaço da foto
   * que a letra não encosta.
   */
  const area = deLado
    ? ctx.getImageData(meio - Math.round(faixa / 2), 0, faixa, altura)
    : ctx.getImageData(0, 0, largura, Math.round(altura * 0.4));
  let soma = 0;
  const passo = 4 * 97; /* amostra esparsa: ler pixel a pixel num 3000×1000 é caro e não muda a média */
  for (let i = 0; i < area.data.length; i += passo) {
    soma += 0.2126 * area.data[i] + 0.7152 * area.data[i + 1] + 0.0722 * area.data[i + 2];
  }
  const brilho = soma / Math.ceil(area.data.length / passo) / 255;
  const claro = cores.texto.toLowerCase() !== "#101010";
  /* letra clara sobre foto clara precisa de mais véu; letra escura, o contrário */
  const forca = Math.max(0.28, Math.min(0.82, claro ? brilho * 0.95 : (1 - brilho) * 0.95));
  const alfa = (fracao: number) => Math.round(255 * forca * fracao).toString(16).padStart(2, "0");

  /**
   * E o véu acompanha a POSIÇÃO da escrita.
   *
   * No formato largo a frase é centralizada, então o escuro é um halo no meio
   * que se apaga para as bordas. O degradê que saía da esquerda deixava a
   * letra do meio sem apoio e escurecia um canto onde não há nada escrito. No
   * formato alto a frase continua em cima, e o degradê continua vindo de cima.
   */
  const gradiente = deLado
    ? ctx.createRadialGradient(meio, altura / 2, 0, meio, altura / 2, largura * 0.42)
    : ctx.createLinearGradient(0, 0, 0, altura * 0.68);
  gradiente.addColorStop(0, `${cores.veu}${alfa(1)}`);
  gradiente.addColorStop(0.55, `${cores.veu}${alfa(deLado ? 0.5 : 0.62)}`);
  gradiente.addColorStop(1, `${cores.veu}00`);
  ctx.fillStyle = gradiente;
  ctx.fillRect(0, 0, largura, altura);

  /**
   * A ESCRITA É CENTRALIZADA, numa faixa que sobrevive ao corte.
   *
   * O tema não mostra o arquivo inteiro: a dobra tem a altura DELA e o
   * navegador corta as laterais do 3:1 para preencher. Medido na loja: uma
   * dobra de 2,3:1 mostra 77% da largura, e a frase encostada na margem de 6%
   * saía pela metade — foi o "Tudo para quem late" virando "do para quem".
   * Centralizada em `FAIXA_SEGURA`, ela continua inteira até num corte 16:9.
   */
  const x = meio;
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.fillStyle = cores.texto;

  /**
   * E o CORPO da letra ENCOLHE até a frase caber em duas linhas.
   *
   * Tamanho fixo serve a um slogan e trai o seguinte: "O tempo no seu pulso"
   * assenta numa linha, "Tudo para quem late e ronrona" não — e o mesmo corpo
   * que serve ao primeiro empurra o segundo para três linhas altas demais para
   * o quadro. Encolher é o que faz frases de tamanhos diferentes saírem no
   * mesmo lugar, com o mesmo respiro.
   */
  const corpoMaximo = Math.round(altura * (deLado ? 0.115 : 0.085));
  const corpoMinimo = Math.round(altura * (deLado ? 0.055 : 0.05));
  const quebrarCom = (corpo: number) => {
    ctx.font = `700 ${corpo}px ${pilha(fontes.titulo, true)}`;
    return quebrar(ctx, texto.titulo, faixa, 8);
  };
  let corpoTitulo = corpoMaximo;
  let linhasTitulo = quebrarCom(corpoTitulo);
  while (linhasTitulo.length > 2 && corpoTitulo > corpoMinimo) {
    corpoTitulo = Math.round(corpoTitulo * 0.94);
    linhasTitulo = quebrarCom(corpoTitulo);
  }
  /* no piso, o que ainda não couber ganha reticências em vez de estourar o
     quadro: frase cortada avisa que foi cortada */
  if (linhasTitulo.length > 2) {
    ctx.font = `700 ${corpoTitulo}px ${pilha(fontes.titulo, true)}`;
    linhasTitulo = quebrar(ctx, texto.titulo, faixa, 2);
  }

  /* no alto a letra de apoio precisa ser proporcionalmente MAIOR: a tela é
     estreita e a pessoa lê o celular mais perto, mas com menos largura por
     linha — subtítulo miúdo ali vira ruído cinza em vez de frase */
  const corpoSub = Math.round(corpoTitulo * (deLado ? 0.34 : 0.42));
  const corpoCta = Math.round(corpoTitulo * (deLado ? 0.28 : 0.34));
  ctx.font = `400 ${corpoSub}px ${pilha(fontes.corpo, false)}`;
  const linhasSub = texto.subtitulo ? quebrar(ctx, texto.subtitulo, faixa, 3) : [];

  const alturaTitulo = linhasTitulo.length * corpoTitulo * 1.08;
  const alturaSub = linhasSub.length * corpoSub * 1.4;
  const alturaCta = texto.cta ? corpoCta * 3.2 : 0;
  const bloco = alturaTitulo + (linhasSub.length ? corpoSub * 0.9 + alturaSub : 0) + (texto.cta ? corpoCta * 1.6 + alturaCta : 0);
  /* centralizado na vertical no formato largo; no alto o texto fica em cima,
     que é onde a foto tem menos assunto depois do corte */
  let y = deLado ? Math.round((altura - bloco) / 2) : Math.round(altura * 0.08);

  ctx.font = `700 ${corpoTitulo}px ${pilha(fontes.titulo, true)}`;
  for (const linha of linhasTitulo) { ctx.fillText(linha, x, y); y += corpoTitulo * 1.08; }

  if (linhasSub.length) {
    y += corpoSub * 0.9;
    ctx.font = `400 ${corpoSub}px ${pilha(fontes.corpo, false)}`;
    ctx.globalAlpha = 0.9;
    for (const linha of linhasSub) { ctx.fillText(linha, x, y); y += corpoSub * 1.4; }
    ctx.globalAlpha = 1;
  }

  if (texto.cta) {
    y += corpoCta * 1.6;
    ctx.font = `700 ${corpoCta}px ${pilha(fontes.corpo, false)}`;
    const larguraTexto = ctx.measureText(texto.cta).width;
    const paddingX = corpoCta * 1.5;
    const paddingY = corpoCta * 0.75;
    const larguraBotao = larguraTexto + paddingX * 2;
    const alturaBotao = corpoCta + paddingY * 2;
    /* botão de contorno, não de preenchimento: sobre foto, uma pastilha cheia
       vira um adesivo e briga com a cena */
    ctx.strokeStyle = cores.destaque;
    ctx.lineWidth = Math.max(2, Math.round(corpoCta * 0.08));
    ctx.strokeRect(x - larguraBotao / 2, y, larguraBotao, alturaBotao);
    ctx.fillStyle = cores.texto;
    ctx.fillText(texto.cta, x, y + paddingY);
  }

  return paraBlob(canvas);
}
