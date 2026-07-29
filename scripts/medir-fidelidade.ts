/**
 * Mede a fidelidade do acervo inteiro e grava a linha de base.
 *
 * Uso:
 *   pnpm medir-fidelidade              # mede e grava/compara com a linha de base
 *   pnpm medir-fidelidade --gravar     # força regravar a linha de base
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
  bundlesEm,
  comparar,
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

if (executadoDireto(import.meta.url)) {
  const forcarGravar = process.argv.includes('--gravar');
  const caminho = arquivoDaLinhaDeBase();
  const agora = medirAcervo();

  if (agora.resumo.total === 0) {
    console.log('\n  Nenhum bundle no acervo. Extraia algum site primeiro.\n');
    process.exit(0);
  }

  if (existsSync(caminho) && !forcarGravar) {
    let antes: LinhaDeBase | null = null;
    try {
      antes = JSON.parse(readFileSync(caminho, 'utf8')) as LinhaDeBase;
    } catch {
      antes = null;
    }
    if (antes !== null) {
      const quando = new Date(antes.gravadoEm).toLocaleString('pt-BR');
      console.log(`\n  Comparando com a linha de base de ${quando}:\n`);
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
