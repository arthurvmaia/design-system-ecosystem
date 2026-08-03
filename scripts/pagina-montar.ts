/**
 * `pnpm pagina <entrada.json>` — monta um site do kit, determinístico.
 *
 * É o executor do `montarPaginaDoKit` para o modo fila: o agente escreve UM
 * arquivo de entrada com o criativo (textos por seção, HTML das seções sem
 * peça, destino de cada mídia) e roda este comando. Todo o mecânico —
 * composição, escopo, recoloração, fundo, responsivo, marca.css, cópia de
 * assets — acontece aqui dentro, igual para todo site.
 *
 * Antes disto cada geração era um script `_tmp-*.ts` descartável de mais de
 * mil linhas. Se algo determinístico faltar neste caminho, é defeito do
 * `montarPaginaDoKit`, nunca trabalho para um script avulso.
 */
import { existsSync, readFileSync } from 'node:fs';
import { montarPaginaDoKit } from '@ds/generator';
import { GeneratePayload, KitDesignSystem, ProjectBranding, ProjectLayout } from '@ds/shared';
import { z } from 'zod';
import { executadoDireto } from './executado-direto.js';

/**
 * O arquivo de entrada que o agente escreve. Os campos estruturais são os
 * MESMOS do contrato de geração (payload do job); o criativo entra em
 * `secoes`, `cssCriado`, `responsivoExtra` e `midia`.
 */
const EntradaDoComando = z.object({
  projectId: z.string().startsWith('prj_'),
  titulo: z.string().min(1),
  lang: z.string().optional(),
  kit: GeneratePayload.shape.kit,
  designSystem: KitDesignSystem.nullable().optional(),
  layout: ProjectLayout,
  branding: ProjectBranding,
  secoes: z
    .array(
      z.object({
        secaoId: z.string(),
        substituicoes: z.record(z.string(), z.string()).optional(),
        htmlCriado: z.string().optional(),
      }),
    )
    .default([]),
  cssCriado: z.string().optional(),
  responsivoExtra: z.string().optional(),
  midia: z.array(z.object({ de: z.string(), para: z.string() })).default([]),
  outputDir: z.string().optional(),
});

const principal = (): void => {
  const caminho = process.argv[2];
  if (caminho === undefined || !existsSync(caminho)) {
    console.log('');
    console.log('  Uso: pnpm pagina <entrada.json>');
    console.log('  O arquivo traz o payload do job mais o criativo por seção.');
    console.log('');
    process.exit(1);
  }

  const bruto: unknown = JSON.parse(readFileSync(caminho, 'utf8'));
  const parse = EntradaDoComando.safeParse(bruto);
  if (!parse.success) {
    console.log('\n  A entrada não validou:');
    for (const issue of parse.error.issues.slice(0, 12)) {
      console.log(`    ${issue.path.join('.')}: ${issue.message}`);
    }
    console.log('');
    process.exit(1);
  }
  const e = parse.data;

  const r = montarPaginaDoKit({
    projectId: e.projectId as `prj_${string}`,
    titulo: e.titulo,
    lang: e.lang,
    kit: e.kit,
    // O design system pode vir no próprio arquivo ou dentro do kit (payload).
    designSystem: e.designSystem ?? e.kit.designSystem ?? null,
    layout: e.layout,
    branding: e.branding,
    secoes: e.secoes,
    cssCriado: e.cssCriado,
    responsivoExtra: e.responsivoExtra,
    midia: e.midia,
    outputDir: e.outputDir,
  });

  console.log('');
  console.log(`  Site montado em ${r.outputDir}`);
  console.log(`  ${r.arquivos.length} arquivo(s) escritos.`);
  console.log(
    `  Recoloração: ${r.recoloracao.origens} origem(ns), ${r.recoloracao.reescritas} cor(es) apontando para a marca, ${r.recoloracao.mantidas} mantida(s).`,
  );
  console.log(`  Retipografia: ${r.retipografia.reescritas} fonte(s) apontando para a marca.`);
  // `mantidas` sai junto porque é o número que responde "por que o site ainda
  // parece de dois tamanhos": régua que não alcança unidade relativa nem
  // expressão fluida deixa a origem mandar, e isso precisa ser visível.
  console.log(
    `  Escala: ${r.reescala.reescritas} tamanho(s) e respiro(s) na régua da marca, ${r.reescala.mantidas} com o valor da origem.`,
  );
  if (r.faltando.length > 0) {
    console.log(`  Peças sem bundle: ${r.faltando.join(', ')}`);
  }
  if (r.avisos.length > 0) {
    console.log('');
    console.log('  Avisos:');
    for (const a of r.avisos) console.log(`    - ${a}`);
  }
  console.log('');
};

if (executadoDireto(import.meta.url)) principal();
