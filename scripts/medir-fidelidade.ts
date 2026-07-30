/**
 * Mede a fidelidade do acervo inteiro e grava a linha de base.
 *
 * Uso:
 *   pnpm medir-fidelidade              # mede e grava/compara com a linha de base
 *   pnpm medir-fidelidade --gravar     # força regravar a linha de base
 *   pnpm medir-fidelidade --falhar-se-piorar   # PORTÃO: sai 1 se alguma regra
 *                                              # absoluta for violada, 2 se não
 *                                              # deu para verificar
 *   pnpm medir-fidelidade --falhar-se-piorar --exigir-base   # sem base também reprova
 *
 * Existe porque "melhorou" precisa ser um número. Antes de mexer no motor,
 * rode uma vez: o resultado fica em `~/design-system-ecosystem/fidelidade.json`
 * e vira o ponto de comparação. Depois de mexer, rode de novo — a saída mostra
 * as duas colunas lado a lado.
 *
 * Mede os bundles de segmento no vault (o que a Galeria mostra) e os bundles da
 * Biblioteca (o que o site gerado leva). Os dois importam por razões
 * diferentes: o primeiro é o que a pessoa vê na hora de escolher, o segundo é o
 * que ela entrega ao cliente.
 */
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  type LinhaDeBase,
  type MedidaDeBundle,
  avaliarPortao,
  bundlesEm,
  comparar,
  linhasDeContexto,
  medirBundle,
  resumir,
} from '@ds/generator';
import {
  getRoot,
  libraryComponentMetadata,
  libraryDir,
  vaultCaptureV2AssetsDir,
  vaultDir,
  vaultExtractedDir,
  vaultSegmentBundlesDir,
} from '@ds/shared';
import { executadoDireto } from './executado-direto.js';

const arquivoDaLinhaDeBase = (): string => join(getRoot(), 'fidelidade.json');

/** Nome legível de um segmento, lido do manifesto do próprio bundle. */
const nomeDoBundle = (dir: string, prefixo: string): string => {
  try {
    const m = JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8')) as { name?: string };
    if (typeof m.name === 'string' && m.name.length > 0) return `${prefixo} ${m.name}`;
  } catch {
    // sem manifesto o nome da pasta serve
  }
  return `${prefixo} ${dir.split(/[\\/]/).slice(-1)[0]}`;
};

export const medirAcervo = (): LinhaDeBase => {
  const medidas: MedidaDeBundle[] = [];

  // Bundles de segmento, por design system. O denominador da retenção é o CSS
  // da captura daquele design system — cada um tem o seu.
  const raizVault = vaultDir();
  if (existsSync(raizVault)) {
    for (const dsId of readdirSync(raizVault)) {
      if (!dsId.startsWith('ds_')) continue;
      const id = dsId as `ds_${string}`;
      const origem = {
        dirAssetsCaptura: vaultCaptureV2AssetsDir(id),
        htmlDaPagina: join(vaultExtractedDir(id), 'design-system.html'),
      };
      for (const dir of bundlesEm(vaultSegmentBundlesDir(id))) {
        const m = medirBundle(dir, {
          nome: nomeDoBundle(dir, `${dsId.slice(0, 11)}…`),
          ...origem,
        });
        if (m !== null) medidas.push(m);
      }
    }
  }

  // Bundles da Biblioteca. A extração de origem fica registrada no metadata do
  // componente — quando ela ainda existe no vault, dá para medir a retenção
  // contra a mesma página. Quando não existe (o componente sobrevive à exclusão
  // da extração, de propósito), a retenção fica nula e o que se mede é o resto.
  const raizLib = libraryDir();
  if (existsSync(raizLib)) {
    for (const cmpId of readdirSync(raizLib)) {
      if (!cmpId.startsWith('cmp_')) continue;
      let origem: { dirAssetsCaptura?: string; htmlDaPagina?: string } = {};
      try {
        const meta = JSON.parse(
          readFileSync(libraryComponentMetadata(cmpId as `cmp_${string}`), 'utf8'),
        ) as { origin?: { designSystemId?: string } };
        const dsId = meta.origin?.designSystemId;
        if (typeof dsId === 'string' && dsId.startsWith('ds_')) {
          const id = dsId as `ds_${string}`;
          origem = {
            dirAssetsCaptura: vaultCaptureV2AssetsDir(id),
            htmlDaPagina: join(vaultExtractedDir(id), 'design-system.html'),
          };
        }
      } catch {
        // sem metadata dá para medir o resto
      }
      const m = medirBundle(join(raizLib, cmpId, 'bundle'), {
        nome: `lib ${cmpId.slice(0, 12)}…`,
        ...origem,
      });
      if (m !== null) medidas.push(m);
    }
  }

  return resumir(medidas);
};

const pct = (n: number | null): string => (n === null ? '—' : `${n}%`);

const imprimir = (l: LinhaDeBase): void => {
  const r = l.resumo;
  console.log('');
  console.log(`  ${r.total} bundles medidos`);
  console.log('');
  console.log(
    `  CSS retido        média ${pct(r.retencaoMedia)}   ` +
      `(de ${pct(r.retencaoMinima)} a ${pct(r.retencaoMaxima)})`,
  );
  console.log(`  Seletor morto     ${r.comSeletorMorto} bundles`);
  console.log(`  Instrumentação    ${r.comInstrumentacao} bundles`);
  console.log(`  Script ausente    ${r.comScriptAusente} bundles`);
  console.log(`  Ícone vazio       ${r.comIconeVazio} bundles`);
  console.log('');

  // Os cinco piores em retenção: é onde o problema mora.
  const piores = l.bundles
    .filter((b) => b.retencao !== null)
    .sort((a, b) => (a.retencao ?? 0) - (b.retencao ?? 0))
    .slice(0, 5);
  if (piores.length > 0) {
    console.log('  Os cinco com menos CSS:');
    for (const b of piores) {
      console.log(
        `    ${pct(b.retencao).padStart(6)}  ${b.regras}/${b.regrasNaOrigem} regras   ${b.nome}`,
      );
    }
    console.log('');
  }
};

/**
 * O modo portão: a medição deixa de relatar e passa a reprovar.
 *
 * Três códigos de saída, e o terceiro é o que impede a verificação de mentir:
 *
 * - `0` passou
 * - `1` reprovou (uma regra absoluta foi violada, ou `--exigir-base` e não há base)
 * - `2` não deu para verificar (sem base, sem acervo, base ilegível)
 *
 * Sem o `2`, "não consegui medir" viraria "está bom" — que é exatamente o que
 * acontece hoje, quando o comando compara populações disjuntas e imprime
 * "72,6% → 0%" como se fosse conquista.
 *
 * Sob esta flag a linha de base NUNCA é gravada. Gravar na primeira execução
 * petrificaria o estado atual como régua sem ninguém olhar, e foi assim que um
 * acervo com 2908 instrumentações vazadas viraria "o bom".
 */
const rodarPortao = (base: LinhaDeBase | null, agora: LinhaDeBase, exigirBase: boolean): never => {
  const v = avaliarPortao(base, agora);

  console.log('');
  for (const l of linhasDeContexto(v.contexto)) console.log(`  ${l}`);
  console.log('');

  if (v.estado === 'reprovou') {
    console.log(`  REPROVOU. ${v.resumo}\n`);
    for (const x of v.violacoes.slice(0, 20)) {
      console.log(`    ${x.bundle}: ${x.explicacao}`);
    }
    if (v.violacoes.length > 20) console.log(`    ... e mais ${v.violacoes.length - 20}.`);
    console.log('');
    process.exit(1);
  }

  if (v.estado === 'nao-deu-para-verificar') {
    console.log(`  NÃO DEU PARA VERIFICAR. ${v.resumo}\n`);
    process.exit(exigirBase ? 1 : 2);
  }

  console.log(`  Passou. ${v.resumo}\n`);
  process.exit(0);
};

/** Lê a linha de base do disco. `null` quando não existe ou não dá para ler. */
const lerLinhaDeBase = (caminho: string): LinhaDeBase | null => {
  if (!existsSync(caminho)) return null;
  try {
    const lida = JSON.parse(readFileSync(caminho, 'utf8')) as LinhaDeBase;
    return Array.isArray(lida?.bundles) ? lida : null;
  } catch {
    return null;
  }
};

if (executadoDireto(import.meta.url)) {
  const forcarGravar = process.argv.includes('--gravar');
  const portao = process.argv.includes('--falhar-se-piorar');
  const exigirBase = process.argv.includes('--exigir-base');
  const caminho = arquivoDaLinhaDeBase();
  const agora = medirAcervo();

  if (portao) {
    // O acervo vazio é tratado DENTRO do portão, que o chama de "não deu para
    // verificar". Sair 0 aqui, como o modo relatório faz, seria dizer que um
    // acervo sem nada passou em tudo.
    rodarPortao(lerLinhaDeBase(caminho), agora, exigirBase);
  }

  if (agora.resumo.total === 0) {
    console.log('\n  Nenhum bundle no acervo. Extraia algum site primeiro.\n');
    process.exit(0);
  }

  if (existsSync(caminho) && !forcarGravar) {
    const antes = lerLinhaDeBase(caminho);
    if (antes !== null) {
      const quando = new Date(antes.gravadoEm).toLocaleString('pt-BR');
      console.log(`\n  Comparando com a linha de base de ${quando}:\n`);
      // O contexto vem ANTES dos números, porque sem ele os números mentem: uma
      // base de 23 sites que não existem mais contra 2 sites novos produz
      // "instrumentação 72,6% → 0%", que parece conquista e é troca de acervo.
      for (const l of linhasDeContexto(avaliarPortao(antes, agora).contexto)) {
        console.log(`    ${l}`);
      }
      console.log('');
      for (const { linha, melhorou } of comparar(antes, agora)) {
        console.log(`    ${melhorou ? '+' : ' '} ${linha}`);
      }
      imprimir(agora);
      console.log('  Para adotar este resultado como nova base: pnpm medir-fidelidade --gravar\n');
      process.exit(0);
    }
  }

  writeFileSync(caminho, `${JSON.stringify(agora, null, 2)}\n`, 'utf8');
  imprimir(agora);
  console.log(`  Linha de base gravada em ${caminho}\n`);
}
