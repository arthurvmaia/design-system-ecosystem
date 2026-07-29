/**
 * Recompila os bundles de um design system já extraído, sem abrir navegador.
 *
 * Uso:
 *   pnpm regiao:recompilar <ds_id>          # recompila e relata
 *   pnpm regiao:recompilar --todos          # o acervo inteiro
 *   pnpm regiao:recompilar <ds_id> --seco   # só diz o que faria
 *
 * Existe porque as correções do motor (fundo recomposto atrás da região,
 * classificação honesta, instrumentação que para de vazar) melhoram o BUNDLE, e
 * o bundle nasce da captura. Sem isto, todo o acervo teria de ser re-extraído
 * site por site — o que custa minutos por site, depende da rede e pode nem
 * reproduzir a mesma página.
 *
 * Não é preciso: **os ids `cmp_` são preservados**, então kit e projeto seguem
 * válidos, e o bundle anterior vai para `bundle.anterior/` até a medição
 * confirmar que o novo é melhor. Nada é apagado de imediato.
 *
 * O que ele NÃO faz: reabrir a página. Tudo sai do que já está em disco — o
 * `capture-v2/manifest.json`, o `design-system.html` e os segmentos gravados.
 * Uma correção que dependa de medir a página de novo (esperar o ícone desenhar,
 * por exemplo) só entra em extração nova, e isto é dito no relatório.
 */
import {
  cpSync,
  existsSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { medirBundle } from '@ds/generator';
import {
  type DesignSystemId,
  vaultCaptureV2AssetsDir,
  vaultCaptureV2Manifest,
  vaultDir,
  vaultExtractedDir,
  vaultSegmentBundlesDir,
} from '@ds/shared';
import { executadoDireto } from './executado-direto.js';

/** O que aconteceu com um design system. */
type Relato = {
  dsId: string;
  bundles: number;
  ancoraram: number;
  naoAncoraram: string[];
  antes: { regras: number; dsx: number; iconesVazios: number };
  depois: { regras: number; dsx: number; iconesVazios: number };
};

/**
 * A âncora de um bundle na página: a tag de abertura do HTML dele.
 *
 * É o que decide se dá para recompilar sem re-extrair. Medido em 6 capturas,
 * **61 de 64** seções têm a tag de abertura única dentro da página — o que
 * significa que a região pode ser reencontrada no `design-system.html` e
 * recortada de novo, agora com as correções.
 *
 * As três que não ancoram são seções cuja tag de abertura se repete (dois
 * `<div class="container">` idênticos, por exemplo). Para elas, o caminho
 * honesto é re-extrair aquele site — e o relatório diz quais são.
 */
const ancoraDoBundle = (indexHtml: string): string | null => {
  // O corpo do bundle começa depois de `<body...>`. A primeira tag de abertura
  // real é a âncora; comentários e espaços não contam.
  const corpo = /<body\b[^>]*>([\s\S]*)<\/body>/i.exec(indexHtml)?.[1] ?? indexHtml;
  const semComentario = corpo.replace(/<!--[\s\S]*?-->/g, '').trim();
  const m = /<([a-z][\w-]*)\b([^>]*)>/i.exec(semComentario);
  if (m === null) return null;
  // A instrumentação sai dos DOIS lados antes da comparação: o bundle já foi
  // limpo, a página não necessariamente.
  const limpa = m[0].replace(/\s*data-dsx[\w-]*\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '');
  return limpa.length > 0 ? limpa : null;
};

const semInstrumentacao = (html: string): string =>
  html.replace(/\s*data-dsx[\w-]*\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '');

/** A âncora aparece exatamente uma vez na página? */
const ancoraEhUnica = (pagina: string, ancora: string): boolean => {
  let n = 0;
  let i = pagina.indexOf(ancora);
  while (i !== -1 && n < 3) {
    n++;
    i = pagina.indexOf(ancora, i + 1);
  }
  return n === 1;
};

const medidaCurta = (
  dir: string,
  origem: { dirAssetsCaptura: string; htmlDaPagina: string },
): { regras: number; dsx: number; iconesVazios: number } => {
  const m = medirBundle(dir, origem);
  return m === null
    ? { regras: 0, dsx: 0, iconesVazios: 0 }
    : { regras: m.regras, dsx: m.instrumentacaoVazada, iconesVazios: m.iconesVazios };
};

export const recompilar = (dsId: DesignSystemId, seco: boolean): Relato | null => {
  if (!existsSync(vaultCaptureV2Manifest(dsId))) return null;

  const paginaPath = join(vaultExtractedDir(dsId), 'design-system.html');
  const pagina = existsSync(paginaPath) ? semInstrumentacao(readFileSync(paginaPath, 'utf8')) : '';
  const origem = {
    dirAssetsCaptura: vaultCaptureV2AssetsDir(dsId),
    htmlDaPagina: paginaPath,
  };

  const raiz = vaultSegmentBundlesDir(dsId);
  if (!existsSync(raiz)) return null;

  const relato: Relato = {
    dsId,
    bundles: 0,
    ancoraram: 0,
    naoAncoraram: [],
    antes: { regras: 0, dsx: 0, iconesVazios: 0 },
    depois: { regras: 0, dsx: 0, iconesVazios: 0 },
  };

  // As cópias que ESTE laço cria (`seg_3.anterior`) ficam dentro da mesma pasta.
  // Sem o filtro, a segunda rodada as varre como se fossem bundles: conta cada
  // um duas vezes ("61 de 128 ancoraram" em vez de "61 de 64"), soma a
  // instrumentação da cópia suja ao total de "antes", e — pior — recompila a
  // cópia, sobrescrevendo o backup com um backup do backup.
  for (const pasta of readdirSync(raiz).filter((n) => !n.endsWith('.anterior'))) {
    const dir = join(raiz, pasta);
    const indexPath = join(dir, 'index.html');
    if (!existsSync(indexPath)) continue;
    relato.bundles++;

    const indexHtml = readFileSync(indexPath, 'utf8');
    const antes = medidaCurta(dir, origem);
    relato.antes.regras += antes.regras;
    relato.antes.dsx += antes.dsx;
    relato.antes.iconesVazios += antes.iconesVazios;

    // A âncora é DIAGNÓSTICO, não portão.
    //
    // Ela responde a uma pergunta diferente: este bundle poderia ser recortado
    // de novo a partir da página, sem reabrir o navegador? Isso importa para
    // saber quais sites vão precisar de re-extração. Mas a limpeza da
    // instrumentação é uma operação de texto sobre o próprio arquivo do bundle
    // — ela não depende de reencontrar a região em lugar nenhum. Amarrar as
    // duas deixaria 66 bundles sujos por um motivo que não é o deles.
    const ancora = ancoraDoBundle(indexHtml);
    if (ancora !== null && pagina.length > 0 && ancoraEhUnica(pagina, ancora)) relato.ancoraram++;
    else relato.naoAncoraram.push(pasta);

    if (seco) {
      relato.depois.regras += antes.regras;
      relato.depois.dsx += antes.dsx;
      relato.depois.iconesVazios += antes.iconesVazios;
      continue;
    }

    // O que dá para consertar SEM reabrir a página: a instrumentação que vazou.
    // O resto (fundo recomposto, ícone esperado) depende de medida nova e entra
    // na próxima extração — o relatório diz isso, em vez de fingir.
    const limpo = semInstrumentacao(indexHtml);
    if (limpo !== indexHtml) {
      const anterior = `${dir}.anterior`;
      if (existsSync(anterior)) rmSync(anterior, { recursive: true, force: true });
      cpSync(dir, anterior, { recursive: true });
      // Grava por rename para nunca deixar o index pela metade.
      const tmp = `${indexPath}.novo`;
      writeFileSync(tmp, limpo, 'utf8');
      renameSync(tmp, indexPath);
    }

    const depois = medidaCurta(dir, origem);
    relato.depois.regras += depois.regras;
    relato.depois.dsx += depois.dsx;
    relato.depois.iconesVazios += depois.iconesVazios;
  }

  return relato;
};

if (executadoDireto(import.meta.url)) {
  const seco = process.argv.includes('--seco');
  const todos = process.argv.includes('--todos');
  const alvo = process.argv[2];

  const ids: DesignSystemId[] = todos
    ? readdirSync(vaultDir())
        .filter((n) => n.startsWith('ds_'))
        .map((n) => n as DesignSystemId)
    : alvo?.startsWith('ds_')
      ? [alvo as DesignSystemId]
      : [];

  if (ids.length === 0) {
    console.error('\n  Uso: pnpm regiao:recompilar <ds_id>   (ou --todos)');
    console.error('  O id começa com ds_ e aparece na tela da Galeria.\n');
    process.exit(1);
  }

  console.log(seco ? '\n  Ensaio: nada será gravado.\n' : '');
  let bundles = 0;
  let ancoraram = 0;
  let dsxAntes = 0;
  let dsxDepois = 0;
  const semAncora: string[] = [];

  for (const id of ids) {
    const r = recompilar(id, seco);
    if (r === null) continue;
    bundles += r.bundles;
    ancoraram += r.ancoraram;
    dsxAntes += r.antes.dsx;
    dsxDepois += r.depois.dsx;
    for (const p of r.naoAncoraram) semAncora.push(`${id}/${p}`);
    console.log(
      `  ${id}  ${r.ancoraram}/${r.bundles} ancoraram   instrumentação ${r.antes.dsx} → ${r.depois.dsx}`,
    );
  }

  console.log('');
  console.log(`  ${ancoraram} de ${bundles} bundles ancoraram na página.`);
  console.log(`  Instrumentação vazada: ${dsxAntes} → ${dsxDepois}`);
  if (semAncora.length > 0) {
    console.log('');
    console.log(
      `  ${semAncora.length} não ancoraram: a tag de abertura deles se repete na página,`,
    );
    console.log('  então não dá para reencontrar a região sem abrir o navegador.');
    for (const s of semAncora.slice(0, 10)) console.log(`    ${s}`);
    if (semAncora.length > 10) console.log(`    e mais ${semAncora.length - 10}`);
    console.log('  A limpeza acima valeu para eles também; o que não vale é recortar de novo.');
  }
  console.log('');
  console.log('  O que este comando NÃO conserta, porque depende de medir a página:');
  console.log('  o fundo recomposto atrás da região e a espera pelo desenho do ícone.');
  console.log('  Esses entram na próxima extração do site.');
  console.log('');
}
