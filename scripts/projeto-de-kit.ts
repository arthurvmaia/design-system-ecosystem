/**
 * Cria um projeto A PARTIR DE UM KIT ESCOLHIDO, com marca e mídia automáticas.
 *
 * Uso:
 *   pnpm projeto:de-kit "<nome do kit>" "<Nome da marca>" "<nicho>" [objetivo]
 *
 * ## Por que existe, ao lado da via expressa
 *
 * A via expressa monta o PRÓPRIO kit a cada site — é o que faz dela um clique
 * só. Aqui o kit já existe e foi escolhido: os dez que a leva montou cobrem
 * nichos diferentes, e o pedido é usar um deles, não sortear outro.
 *
 * O resto do caminho é o mesmo, e de propósito: `criarMarcaAutomatica` cria a
 * identidade e busca as fotos ancoradas nas seções, exatamente como a expressa
 * faz. Duplicar isso aqui seria a segunda implementação da mesma coisa, e a que
 * fica para trás quando a outra melhora.
 */
/**
 * O `.env` do servidor, carregado ANTES de qualquer import que o leia.
 *
 * Este script usa as bibliotecas do servidor, e uma delas busca foto na Pexels
 * com a chave que mora naquele arquivo. Sem esta linha a chave não existe no
 * processo, `buscarFotos` volta vazio, e a marca automática cai no desenho —
 * em silêncio, porque ela nunca falha por causa de foto. O resultado foi um
 * site de clínica com trinta SVGs e nenhuma fotografia, e nada no log dizia por
 * quê.
 */
import { config as carregarEnv } from 'dotenv';
carregarEnv({
  path: new URL('../apps/server/.env', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'),
});

import { mkdirSync } from 'node:fs';
import { getDb, tables } from '@ds/indexer';
import {
  DEFAULT_PROJECT_CONTENT,
  type ObjetivoDoSite,
  ProjectLayout,
  ROLE_CATEGORIES,
  ROTULO_DE_PAPEL,
  SEQUENCIAS,
  newProjectId,
  newSectionId,
  normalizarProjectBranding,
  projectBrandingDir,
  projectContentDir,
  projectMediaDir,
} from '@ds/shared';
import { asc, eq } from 'drizzle-orm';
import { criarMarcaAutomatica } from '../apps/server/src/lib/marca-automatica.js';
import { gravarConfig, secoesQueAceitamMidia } from '../apps/server/src/routes/projects.js';

const principal = async (): Promise<void> => {
  const [nomeDoKit, nomeDaMarca, nicho, objetivoArg] = process.argv.slice(2);
  if (!nomeDoKit || !nomeDaMarca) {
    console.log('\n  uso: pnpm projeto:de-kit "<kit>" "<marca>" "<nicho>" [objetivo]\n');
    process.exit(1);
  }

  const db = getDb();
  const kit = db
    .select()
    .from(tables.kits)
    .all()
    .find((k) => k.name.toLowerCase().includes(nomeDoKit.toLowerCase()));
  if (kit === undefined) {
    console.log(`\n  Kit "${nomeDoKit}" não existe. Kits:`);
    for (const k of db.select().from(tables.kits).all()) console.log(`    ${k.name}`);
    console.log('');
    process.exit(1);
  }

  const componentIds = db
    .select({ id: tables.kitComponents.componentId })
    .from(tables.kitComponents)
    .where(eq(tables.kitComponents.kitId, kit.id))
    .orderBy(asc(tables.kitComponents.position))
    .all()
    .map((r) => r.id);
  const pecas = db.select().from(tables.libraryComponents).all();
  const porId = new Map(pecas.map((p) => [p.id, p]));

  const objetivo = (objetivoArg ?? 'captar-contato') as ObjetivoDoSite;

  /**
   * A estrutura vem da SEQUÊNCIA do objetivo, e cada etapa recebe a peça do kit
   * que serve àquele papel. Etapa sem peça vira seção criada no estilo do kit —
   * ela fica na página com o problema à vista, em vez de sumir e ninguém saber
   * que faltou.
   */
  const usados = new Set<string>();
  const secoes = SEQUENCIAS[objetivo].map((etapa) => {
    // `ROLE_CATEGORIES` é o mapa papel→categorias. Eu tinha escrito
    // `ROTULO_DE_PAPEL` aqui, que é o mapa papel→NOME EM PORTUGUÊS — a
    // comparação nunca casava para papel nenhum cujo nome de categoria fosse
    // diferente do papel, e quatro seções saíram vazias no primeiro site.
    const cats = ROLE_CATEGORIES[etapa.papel] ?? [etapa.papel];
    const escolhida = componentIds.find((id) => {
      if (usados.has(id)) return false;
      const p = porId.get(id);
      if (p === undefined) return false;
      return p.category === etapa.papel || cats.includes(p.category);
    });
    if (escolhida !== undefined) usados.add(escolhida);
    return {
      id: newSectionId(),
      nome: ROTULO_DE_PAPEL[etapa.papel],
      papel: etapa.papel,
      componentIds: escolhida !== undefined ? [escolhida] : [],
    };
  });
  // O que sobrou do kit entra no fim: peça curada que não achou papel é peça
  // paga e não usada, e comportamento de página (animação, ponteiro) mora fora
  // da sequência por natureza.
  const sobrando = componentIds.filter((id) => !usados.has(id));
  if (sobrando.length > 0) {
    secoes.push({
      id: newSectionId(),
      nome: 'Extras do kit',
      papel: 'about' as const,
      componentIds: sobrando,
    });
  }

  /**
   * As permissões saem LIGADAS, como na via expressa.
   *
   * O comentário da montagem logo acima promete que "etapa sem peça vira seção
   * criada no estilo do kit" — e é `criarSecoesFaltantes` que autoriza isso. Sem
   * ela o schema cai no padrão `false`, a promessa não se cumpre e a seção sai
   * VAZIA: medido no primeiro site, "Prova social" e "Contato" chegaram assim à
   * página, com o aceite S9 pendente.
   *
   * A via expressa liga as duas na criação (`routes/projects.ts`) pelo mesmo
   * motivo, e este script existe para ser a expressa com kit escolhido. Quem
   * quiser um site só com o que o kit entrega desliga na tela.
   */
  const layout = ProjectLayout.parse({
    secoes,
    objetivo,
    preferDesignSystemId: null,
    permissoes: { criarSecoesFaltantes: true, criarArteDeApoio: true },
  });
  const projectId = newProjectId();
  const agora = Date.now();

  // As pastas do projeto, como a rota de criar faz: a marca automática grava
  // logo e foto dentro delas, e `gravarConfig` escreve o content e o branding.
  mkdirSync(projectContentDir(projectId), { recursive: true });
  mkdirSync(projectBrandingDir(projectId), { recursive: true });
  mkdirSync(projectMediaDir(projectId), { recursive: true });

  db.insert(tables.projects)
    .values({
      id: projectId,
      name: `${nomeDaMarca} · ${kit.name}`,
      kitId: kit.id,
      createdAt: agora,
      updatedAt: agora,
      layoutJson: JSON.stringify(layout),
      contentJson: JSON.stringify(DEFAULT_PROJECT_CONTENT),
      brandingJson: null,
      mediaManifestJson: null,
      status: 'rascunho',
    })
    .run();

  console.log(`\n  Projeto ${projectId} — ${nomeDaMarca}, kit "${kit.name}"`);
  console.log(`  ${secoes.length} seção(ões), ${componentIds.length} peça(s) do kit`);
  console.log('  Criando marca e buscando fotos…');

  const marca = await criarMarcaAutomatica(projectId, {
    nicho: nicho?.trim() || null,
    nomeDaMarca: nomeDaMarca.trim(),
    secoes: secoesQueAceitamMidia({ layoutJson: JSON.stringify(layout), kitId: kit.id }),
  });
  const b = marca.branding;
  const branding = normalizarProjectBranding(
    JSON.stringify({
      brandName: b.brandName,
      nicho: b.nicho ?? undefined,
      tone: b.tone,
      logoPath: b.logoPath,
      faviconPath: b.faviconPath,
      palette: {
        primary: b.primary,
        background: b.background,
        foreground: b.foreground,
        accent: b.accent,
      },
      typography: { display: b.fontDisplay, body: b.fontBody },
      contact: b.contact,
      social: b.social,
      mainCta: b.mainCta,
      identidadeVerbal: b.identidadeVerbal,
      logos: b.logos,
      logosLocais: b.logosLocais,
      paleta: b.paleta,
      tipografia: b.tipografia,
      sociais: b.sociais,
    }),
  );
  db.update(tables.projects)
    .set({
      brandingJson: JSON.stringify(branding),
      mediaManifestJson: JSON.stringify(marca.media),
      updatedAt: Date.now(),
    })
    .where(eq(tables.projects.id, projectId))
    .run();
  gravarConfig(projectId, DEFAULT_PROJECT_CONTENT, branding);

  console.log(`  Marca: ${b.brandName} · ${marca.media.length} mídia(s)`);
  console.log(`  ${projectId}\n`);
};

void principal();
