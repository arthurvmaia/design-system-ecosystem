/// <reference lib="dom" />

/**
 * A CAPA DE COLEÇÃO, no formato que a marca escolheu — por cálculo.
 *
 * ## Por que a máscara, e não um pedido novo ao gerador
 *
 * A capa nasce QUADRADA, uma vez. Redonda, quadrada e arredondada saem dela por
 * máscara, que é geometria: trocar de formato depois de pronto não gasta
 * crédito nenhum, porque o pixel já está em disco.
 *
 * Pedir "uma imagem redonda" ao modelo faria o contrário. Cada troca de formato
 * seria uma geração nova, e a borda ficaria por conta dele — que é justamente
 * onde ele mais erra: o círculo sai oval, a borda sai serrilhada, e o conjunto
 * de capas deixa de parecer um conjunto.
 *
 * É a mesma decisão que fez as três versões da logo saírem de um símbolo só, e
 * está no `CLAUDE.md` ao pé da letra: "cor, geometria, recorte, máscara, escala
 * e exportação são calculados, nunca gerados".
 *
 * ## Por que é UMA função com tudo dentro
 *
 * Mesma razão de `derivar-navegador.ts`: ela roda no NAVEGADOR (precisa de
 * canvas) e é injetada numa página pelo `toString()`. Ajudante declarado fora
 * dela não viaja junto, e a chamada quebraria dentro da página com um "não
 * definido" que nenhum teste de tipo pega.
 *
 * ## Por que o nome NÃO é desenhado aqui
 *
 * A capa sai só com a imagem. O nome da coleção é texto da marca — tipografia,
 * cor e grafia exata — e desenhá-lo aqui seria uma segunda implementação do que
 * `comporPeca` já faz e a régua já mede. Quem quiser a capa com o nome por
 * cima compõe; esta função entrega o pixel na forma certa.
 */

/** O formato que a capa vai ter. O mesmo do contrato, repetido para viajar. */
export type FormatoDaCapa = 'redonda' | 'quadrada' | 'arredondada';

export type EntradaDaCapa = {
  /** A imagem gerada, como data URI. Ela pode não ser quadrada: o corte resolve. */
  readonly imagem: string;
  readonly formato: FormatoDaCapa;
  /** O lado do arquivo final, em pixels. */
  readonly lado: number;
};

/**
 * Recorta a capa no formato pedido e devolve um PNG como data URI.
 *
 * O corte é CENTRAL e por `cover`: a imagem entra pelo maior lado e o excedente
 * sai igualmente dos dois lados. Esticar para caber no quadrado deformaria o
 * assunto, e é o tipo de erro que ninguém nota no arquivo e todo mundo nota na
 * vitrine.
 */
export const desenharCapaDeColecao = (entrada: EntradaDaCapa): Promise<string> => {
  const { imagem, formato, lado } = entrada;
  return new Promise<string>((resolver, recusar) => {
    const img = new Image();
    img.onerror = () => recusar(new Error('a imagem da coleção não decodificou'));
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = lado;
      canvas.height = lado;
      const ctx = canvas.getContext('2d');
      if (ctx === null) {
        recusar(new Error('o canvas não abriu'));
        return;
      }

      // A máscara é desenhada ANTES da imagem, e a imagem entra por
      // `source-in`. O caminho contrário — desenhar a imagem e recortar depois —
      // exigiria `destination-in`, que apaga o que já está no canvas e não
      // sobrevive bem a bordas macias em todos os navegadores.
      ctx.fillStyle = '#000';
      if (formato === 'redonda') {
        ctx.beginPath();
        ctx.arc(lado / 2, lado / 2, lado / 2, 0, Math.PI * 2);
        ctx.fill();
      } else if (formato === 'arredondada') {
        // O raio é 12% do lado: o suficiente para ler como "cartão" e pouco o
        // bastante para não virar um círculo mal resolvido.
        const r = Math.round(lado * 0.12);
        ctx.beginPath();
        ctx.moveTo(r, 0);
        ctx.lineTo(lado - r, 0);
        ctx.quadraticCurveTo(lado, 0, lado, r);
        ctx.lineTo(lado, lado - r);
        ctx.quadraticCurveTo(lado, lado, lado - r, lado);
        ctx.lineTo(r, lado);
        ctx.quadraticCurveTo(0, lado, 0, lado - r);
        ctx.lineTo(0, r);
        ctx.quadraticCurveTo(0, 0, r, 0);
        ctx.fill();
      } else {
        ctx.fillRect(0, 0, lado, lado);
      }

      ctx.globalCompositeOperation = 'source-in';

      // `cover`: a MAIOR das duas escalas, e o excedente sai centrado.
      const escala = Math.max(lado / img.naturalWidth, lado / img.naturalHeight);
      const largura = img.naturalWidth * escala;
      const altura = img.naturalHeight * escala;
      ctx.drawImage(img, (lado - largura) / 2, (lado - altura) / 2, largura, altura);

      resolver(canvas.toDataURL('image/png'));
    };
    img.src = imagem;
  });
};
