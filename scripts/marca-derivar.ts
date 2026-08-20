/**
 * As versões da logo, a partir de UM símbolo, por cálculo.
 *
 * Uso:
 *   pnpm marca:derivar <arquivo do símbolo> [--saida <pasta>]
 *
 * Grava três arquivos ao lado do símbolo (ou na pasta pedida):
 *   logotipo.png              — o símbolo recortado, fundo transparente
 *   logotipo-fundo-branco.png — o mesmo símbolo sobre branco
 *   logotipo-fundo-preto.png  — a silhueta, branca sobre preto
 *
 * ## Por que isto é um comando, e por que ele não gera nada
 *
 * Porque é a metade DETERMINÍSTICA da criação de marca, e ela não pode depender
 * de quem está processando lembrar de fazê-la. O símbolo é gerado UMA vez (isso
 * custa crédito e passa pelo razão); as versões saem daqui, de graça, do mesmo
 * arquivo.
 *
 * Pedi-las ao gerador seria abrir três pedidos NOVOS, e o modelo desenha outro
 * símbolo a cada um — foi assim que a marca chegava em três modelos diferentes
 * em vez de uma marca em três roupas. É o `CLAUDE.md` ao pé da letra: recorte,
 * máscara, escala e exportação são calculados, nunca gerados.
 *
 * O mesmo motor atende as três frentes: o site precisa das versões da marca, a
 * loja precisa, e o criativo precisa. Uma implementação, verificada.
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { derivarLogosDaMarca } from '@ds/creative';
import { chromium } from 'playwright';
import { executadoDireto } from './executado-direto.js';

const USO = 'Uso: pnpm marca:derivar <arquivo do símbolo> [--saida <pasta>]';

const morrer = (msg: string): never => {
  console.error(`\n  ${msg}\n`);
  process.exit(1);
};

const principal = async (): Promise<void> => {
  const args = process.argv.slice(2);
  const alvo = args.find((a) => !a.startsWith('--') && args[args.indexOf(a) - 1] !== '--saida');
  const iSaida = args.indexOf('--saida');
  if (alvo === undefined) morrer(`Falta o arquivo do símbolo.\n\n${USO}`);

  const simbolo = resolve(alvo as string);
  if (!existsSync(simbolo)) morrer(`Não achei o símbolo em ${simbolo}.`);
  const saida = iSaida >= 0 ? resolve(args[iSaida + 1] ?? '') : dirname(simbolo);
  mkdirSync(saida, { recursive: true });

  const navegador = await chromium.launch({ args: ['--no-sandbox'] });
  try {
    const versoes = await derivarLogosDaMarca(navegador, simbolo);
    const gravar = (nome: string, bytes: Uint8Array): void => {
      const destino = join(saida, nome);
      writeFileSync(destino, bytes);
      console.log(`  ${nome.padEnd(28)} ${Math.round(bytes.byteLength / 1024)} KB`);
    };
    console.log(`\n  De ${basename(simbolo)}, por cálculo:\n`);
    gravar('logotipo.png', versoes.transparente);
    gravar('logotipo-fundo-branco.png', versoes.fundoBranco);
    gravar('logotipo-fundo-preto.png', versoes.fundoPreto);
    console.log('\n  Nenhum crédito gasto: as três saíram do mesmo arquivo.\n');
  } catch (err) {
    /**
     * O recorte falhou — quase sempre porque o fundo do símbolo não era liso.
     *
     * Não invento uma saída: entregar um recorte que comeu metade do desenho é
     * pior que entregar o símbolo como ele veio. Quem chamou decide, sabendo.
     */
    morrer(
      `Não consegui recortar o fundo deste símbolo (${err instanceof Error ? err.message : String(err)}).\n  ` +
        'O recorte pressupõe fundo LISO de cor única, bem separado do símbolo — é o que o pedido de geração pede.\n  ' +
        'Use o símbolo como ele veio, e registre que as versões ficaram de fora.',
    );
  } finally {
    await navegador.close();
  }
};

if (executadoDireto(import.meta.url)) void principal();
