import type { ResultadoDeAceite, VereditoDaRegra } from './regras-de-aceite.js';
import { contrasteRatio } from './schemas/brand.js';
import type { PecaDaMarca } from './schemas/marca.js';

/**
 * As regras de aceite da MARCA CRIADA, executáveis.
 *
 * ## Por que ela é diferente da régua da peça
 *
 * Uma peça criativa erra e vira lixo de uma campanha. Uma marca errada é
 * carregada por tudo o que a empresa faz depois — o site, a loja, a assinatura
 * de e-mail, o bordado do uniforme — e o erro só é notado quando já está em
 * todos eles. Por isso o que esta régua mede não é "ficou bonito", que ninguém
 * mede, e sim as coisas que fazem uma marca ser INUTILIZÁVEL e que se medem
 * exatamente:
 *
 * - as versões são o MESMO símbolo, e não três desenhos parecidos;
 * - a transparente é transparente de verdade;
 * - a monocromática é silhueta, e não a foto dessaturada;
 * - a cor tem contraste para o logotipo se ler onde ele vai ser usado;
 * - dá para reproduzir a marca, porque o prompt e o modelo ficaram registrados.
 *
 * ## O mesmo princípio da outra régua
 *
 * O que não se mede não fica verde. Campo ausente vira `pendente`, nunca
 * `passou`. Uma conferência que recebe um objeto vazio sai com zero aprovações.
 */

/** Os códigos que esta régua produz, na ordem. */
export const CODIGOS_DA_REGUA_DE_MARCA = ['M1', 'M2', 'M3', 'M4', 'M5', 'M6'] as const;

/** O lado que as versões derivadas têm de ter. O motor as desenha em 1024. */
export const LADO_DA_LOGO = 1024;

/**
 * O piso de contraste do logotipo contra o fundo em que ele vai ser usado.
 *
 * É o mesmo 3:1 do resto da casa, e vale aqui pelo mesmo motivo com um agravo:
 * uma peça de campanha ilegível se refaz, e um logotipo ilegível vai para a
 * fachada.
 */
export const PISO_DE_CONTRASTE_DA_MARCA = 3;

/** O que a conferência precisa saber sobre a marca produzida. */
export type MarcaParaAceite = {
  /**
   * O que cada peça tem, MEDIDO no arquivo. `null` quando a peça não saiu.
   *
   * `alfaMinimo`/`alfaMaximo` são o menor e o maior valor do canal de
   * transparência; `fracaoIntermediaria` é quanto do desenho é meio-tom.
   */
  readonly pecas: Readonly<
    Partial<
      Record<
        PecaDaMarca,
        {
          readonly largura: number;
          readonly altura: number;
          readonly alfaMinimo: number;
          readonly alfaMaximo: number;
          readonly fracaoIntermediaria: number;
        }
      >
    >
  > | null;
  /**
   * A distância entre as versões e o símbolo de origem, de 0 (idênticas) a 1.
   *
   * É o que separa "a mesma marca em três roupas" de "três marcas". `null` =
   * ninguém comparou.
   */
  readonly distanciaEntreVersoes: number | null;
  /** A cor da marca, e contra o que ela precisa se ler. */
  readonly cor: string | null;
  /** O prompt e a procedência, para a marca ser reproduzível. */
  readonly promptDoSimbolo: string | null;
  readonly procedencia: { readonly modelo: string; readonly preset: string } | null;
  /** A cor foi decidida por quem? Quando foi o Orbis, o motivo tem de existir. */
  readonly decisaoDaCor: { readonly por: 'cliente' | 'orbis'; readonly motivo: string } | null;
};

/**
 * Quanto as versões podem diferir do símbolo de origem.
 *
 * Elas são recortadas e recentradas do MESMO arquivo, então a diferença
 * esperada é de borda e de escala. 0,35 é folgado para isso e apertado para
 * "outro desenho": geração independente produz distâncias muito acima.
 */
const DISTANCIA_MAXIMA = 0.35;

/**
 * Quanto do desenho pode ser meio-tom antes de deixar de ser silhueta.
 *
 * A borda macia do recorte, que é o que faz a logo não parecer recorte de
 * tesoura, é meio-tom por natureza, e ela é uma faixa fina em volta da forma.
 * 12% acomoda essa faixa com folga e ainda reprova uma foto dessaturada, em que
 * o meio-tom é o desenho inteiro.
 *
 * A primeira versão desta regra contava "quantos tons distintos existem" e
 * reprovava toda silhueta correta, porque contava o antialiasing como tinta.
 */
const MEIO_TOM_MAXIMO = 0.12;

const passou = (codigo: string, titulo: string): VereditoDaRegra => ({
  codigo,
  titulo,
  estado: 'passou',
  motivo: '',
});
const reprovou = (codigo: string, titulo: string, motivo: string): VereditoDaRegra => ({
  codigo,
  titulo,
  estado: 'reprovou',
  motivo,
});
const pendente = (codigo: string, titulo: string, motivo: string): VereditoDaRegra => ({
  codigo,
  titulo,
  estado: 'pendente',
  motivo,
});

export const conferirMarca = (m: MarcaParaAceite): ResultadoDeAceite => {
  const vereditos: VereditoDaRegra[] = [];
  const p = m.pecas;

  // M1 ─────────────────────────────────────────────────────────────────────
  const TITULO_M1 = 'As três versões saíram, na medida';
  const ESPERADAS: PecaDaMarca[] = ['logotipo', 'logotipo-fundo-branco', 'logotipo-fundo-preto'];
  if (p === null) {
    vereditos.push(pendente('M1', TITULO_M1, 'Ninguém mediu os arquivos.'));
  } else {
    const faltando = ESPERADAS.filter((peca) => p[peca] === undefined);
    const foraDeMedida = ESPERADAS.filter((peca) => {
      const d = p[peca];
      return d !== undefined && (d.largura !== LADO_DA_LOGO || d.altura !== LADO_DA_LOGO);
    });
    if (faltando.length > 0) {
      vereditos.push(
        reprovou(
          'M1',
          TITULO_M1,
          `Faltou: ${faltando.join(', ')}. Uma marca com metade das versões obriga quem recebe a improvisar a outra metade, que é exatamente o trabalho que ela veio evitar.`,
        ),
      );
    } else if (foraDeMedida.length > 0) {
      vereditos.push(
        reprovou(
          'M1',
          TITULO_M1,
          `Fora de ${LADO_DA_LOGO}×${LADO_DA_LOGO}: ${foraDeMedida.join(', ')}.`,
        ),
      );
    } else {
      vereditos.push(passou('M1', TITULO_M1));
    }
  }

  // M2 ─────────────────────────────────────────────────────────────────────
  // A transparente é o arquivo que vai por cima de qualquer coisa. Se o recorte
  // não pegou, ela sai com o retângulo do fundo em volta — e isso não aparece
  // em cima de fundo branco, que é onde quase todo mundo abre um PNG.
  const TITULO_M2 = 'A transparente é transparente de verdade';
  const transparente = p?.logotipo;
  if (p === null || transparente === undefined) {
    vereditos.push(pendente('M2', TITULO_M2, 'Ninguém mediu o canal de transparência.'));
  } else if (transparente.alfaMinimo > 0) {
    vereditos.push(
      reprovou(
        'M2',
        TITULO_M2,
        `O menor alfa do arquivo é ${transparente.alfaMinimo}: não há um pixel sequer vazado. O recorte não pegou, e a logo sai com o retângulo do fundo em volta — que é invisível justamente sobre branco, onde quase todo mundo abre um PNG.`,
      ),
    );
  } else if (transparente.alfaMaximo === 0) {
    vereditos.push(
      reprovou('M2', TITULO_M2, 'O arquivo está inteiro vazado: o recorte comeu o desenho.'),
    );
  } else {
    vereditos.push(passou('M2', TITULO_M2));
  }

  // M3 ─────────────────────────────────────────────────────────────────────
  // A monocromática existe para bordado, carimbo e uma tinta só. Saindo da
  // dessaturação, o símbolo vira cinza médio e a forma some — e ela parece
  // certa na tela, que é onde ninguém a usa.
  const TITULO_M3 = 'A monocromática é silhueta, não foto sem cor';
  const mono = p?.['logotipo-fundo-preto'];
  if (p === null || mono === undefined) {
    vereditos.push(pendente('M3', TITULO_M3, 'Ninguém mediu a monocromática.'));
  } else if (mono.fracaoIntermediaria > MEIO_TOM_MAXIMO) {
    vereditos.push(
      reprovou(
        'M3',
        TITULO_M3,
        `${(mono.fracaoIntermediaria * 100).toFixed(1)}% do desenho é meio-tom, acima de ${(MEIO_TOM_MAXIMO * 100).toFixed(0)}%. Silhueta tem dois tons, a forma e o fundo, e o meio-tom nela é só a borda. Com o desenho inteiro em cinza ela não sobrevive a bordado nem a carimbo, e o defeito não aparece na tela, que é o único lugar onde ela não é usada.`,
      ),
    );
  } else {
    vereditos.push(passou('M3', TITULO_M3));
  }

  // M4 ─────────────────────────────────────────────────────────────────────
  // A queixa que originou tudo isto: pedir "o mesmo símbolo em fundo branco" ao
  // gerador abre um pedido NOVO, e a marca chega em três modelos diferentes.
  const TITULO_M4 = 'As versões são o MESMO símbolo';
  if (m.distanciaEntreVersoes === null) {
    vereditos.push(
      pendente(
        'M4',
        TITULO_M4,
        'Ninguém comparou as versões com o símbolo de origem. É a diferença entre uma marca em três roupas e três marcas.',
      ),
    );
  } else if (!Number.isFinite(m.distanciaEntreVersoes)) {
    vereditos.push(pendente('M4', TITULO_M4, 'A comparação não deu um número.'));
  } else if (m.distanciaEntreVersoes > DISTANCIA_MAXIMA) {
    vereditos.push(
      reprovou(
        'M4',
        TITULO_M4,
        `As versões estão a ${m.distanciaEntreVersoes.toFixed(2)} do símbolo de origem, acima de ${DISTANCIA_MAXIMA}. Elas deviam ser recorte do mesmo arquivo: esta distância é de outro desenho.`,
      ),
    );
  } else {
    vereditos.push(passou('M4', TITULO_M4));
  }

  // M5 ─────────────────────────────────────────────────────────────────────
  // Uma peça de campanha ilegível se refaz. Um logotipo ilegível vai para a
  // fachada.
  //
  // A conferência é contra o BRANCO, e não contra "o melhor dos dois fundos".
  // A primeira versão pedia 3:1 contra branco OU contra preto, e nenhuma cor
  // reprova nas duas ao mesmo tempo — a conta não permite: para perder das duas
  // seria preciso ter luminância acima de 0,30 e abaixo de 0,12. Era uma regra
  // que não podia disparar, que é o mesmo que não existir, e foi um teste
  // tentando reprová-la com um cinza médio que mostrou isso.
  //
  // O branco é o caso universal (papel, e-mail, documento) e esta marca ENTREGA
  // um `logotipo-fundo-branco`: cor que não se lê ali torna aquele arquivo
  // inútil, e isso se mede.
  const TITULO_M5 = 'A cor da marca se lê sobre branco';
  if (m.cor === null) {
    vereditos.push(pendente('M5', TITULO_M5, 'A marca não declarou cor.'));
  } else {
    const contraBranco = contrasteRatio(m.cor, '#ffffff');
    if (!Number.isFinite(contraBranco)) {
      vereditos.push(pendente('M5', TITULO_M5, `Não deu para calcular o contraste de ${m.cor}.`));
    } else if (contraBranco < PISO_DE_CONTRASTE_DA_MARCA) {
      vereditos.push(
        reprovou(
          'M5',
          TITULO_M5,
          `A cor ${m.cor} tem ${contraBranco.toFixed(2)}:1 sobre branco, abaixo de ${PISO_DE_CONTRASTE_DA_MARCA}:1. O "logotipo-fundo-branco" que esta marca entrega sairia ilegível, e branco é o fundo de papel, de e-mail e de documento.`,
        ),
      );
    } else {
      vereditos.push(passou('M5', TITULO_M5));
    }
  }

  // M6 ─────────────────────────────────────────────────────────────────────
  // Marca que não se reproduz é marca que morre na primeira variação pedida.
  const TITULO_M6 = 'A marca é reproduzível e a decisão está escrita';
  const faltaProcedencia = m.procedencia === null || m.promptDoSimbolo === null;
  const corSemMotivo =
    m.decisaoDaCor !== null &&
    m.decisaoDaCor.por === 'orbis' &&
    m.decisaoDaCor.motivo.trim() === '';
  if (faltaProcedencia) {
    vereditos.push(
      pendente(
        'M6',
        TITULO_M6,
        'Falta o prompt ou a procedência do símbolo: sem os dois, pedir uma variação desta marca é começar de novo e receber outro desenho.',
      ),
    );
  } else if (corSemMotivo) {
    vereditos.push(
      reprovou(
        'M6',
        TITULO_M6,
        'O Orbis escolheu a cor e não disse por quê. Escolher pelo cliente é legítimo aqui, porque é o que se está pedindo; escolher em silêncio não é.',
      ),
    );
  } else if (m.decisaoDaCor === null) {
    vereditos.push(pendente('M6', TITULO_M6, 'Ninguém registrou quem decidiu a cor.'));
  } else {
    vereditos.push(passou('M6', TITULO_M6));
  }

  return {
    aprovado: !vereditos.some((v) => v.estado === 'reprovou'),
    comPendencia: vereditos.some((v) => v.estado === 'pendente'),
    vereditos,
  };
};
