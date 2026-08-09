/**
 * Monta uma LEVA de kits, cada um com uma combinação diferente da Biblioteca.
 *
 * Uso:
 *   pnpm kits --seco          # mostra o que montaria
 *   pnpm kits                 # monta
 *   pnpm kits --apagar-antes  # apaga os kits atuais antes de montar
 *
 * ## Por que uma leva, e não um kit
 *
 * Um kit serve a um objetivo e a um visual. Dez kits cobrem nichos diferentes —
 * é a diferença entre ter uma resposta e ter um acervo de respostas, e foi o
 * pedido do dono: "monte 10 kits que combinem para diferentes nichos e estrutura
 * de projeto".
 *
 * ## Como cada kit sai diferente do outro
 *
 * A montagem em si é a que o app já usa (`montarKitAutomatico`: sequência
 * argumentativa do objetivo + pareamento máximo peça×etapa). O que muda entre um
 * kit e outro são duas alavancas:
 *
 * 1. **O objetivo** decide a SEQUÊNCIA de seções — captar contato não argumenta
 *    como vender produto.
 * 2. **A origem preferida** decide o VISUAL — é ela que faz a mesma Biblioteca
 *    render kits com caras diferentes. Sem ela, os dez sairiam iguais: a origem
 *    de maior cobertura venceria sempre, que é exatamente o "vc sempre escolhe
 *    os mesmos componentes" que o dono cobrou.
 *
 * As origens são escolhidas por COBERTURA (quantos papéis cada uma consegue
 * preencher sozinha), do maior para o menor: um kit cuja origem principal cobre
 * três papéis é uma colcha de retalhos com nome de kit.
 *
 * ## Apagar os kits antigos não toca nos sites já gerados
 *
 * Verificado e garantido em `montarPaginaDoKit`: o site entregue carrega cópia
 * própria de todos os assets, e a montagem confere isso (`independente.
 * fechadoEmSi`). Um site gerado não volta a olhar para o kit que o originou.
 */
import { getDb, tables } from '@ds/indexer';
import {
  type ObjetivoDoSite,
  ROLE_CATEGORIES,
  SEQUENCIAS,
  libraryComponentBundleDir,
  newKitId,
} from '@ds/shared';
import { eq } from 'drizzle-orm';
import { consolidarEGravar } from '../apps/server/src/lib/consolidar-kit.js';
import { montarKitAutomatico } from '../apps/server/src/lib/montar-kit-automatico.js';
import { recolorabilidadeDoBundle } from '../apps/server/src/lib/recolorabilidade-do-bundle.js';

/**
 * Os nichos, cada um com o objetivo que a estrutura dele pede.
 *
 * O nome não é enfeite: é o que a pessoa lê na hora de escolher um kit para um
 * cliente novo, e "Kit vender produto 3" não ajuda ninguém a decidir.
 */
const NICHOS: { nome: string; objetivo: ObjetivoDoSite; descricao: string }[] = [
  {
    nome: 'Clínica e consultório',
    objetivo: 'captar-contato',
    descricao: 'Confiança e agendamento: prova, equipe e um caminho curto até o contato.',
  },
  {
    nome: 'Loja de produto físico',
    objetivo: 'vender-produto',
    descricao: 'Vitrine, detalhe do produto e preço à vista de quem decide comprar.',
  },
  {
    nome: 'Serviço profissional',
    objetivo: 'apresentar-servico',
    descricao: 'O que se faz, para quem, e por que confiar em quem faz.',
  },
  {
    nome: 'Portfólio e estúdio',
    objetivo: 'mostrar-trabalho',
    descricao: 'O trabalho em primeiro plano; o texto explica só o que a imagem não diz.',
  },
  {
    nome: 'Software e assinatura',
    objetivo: 'vender-produto',
    descricao: 'Funcionalidade, plano e a objeção respondida antes de virar dúvida.',
  },
  {
    nome: 'Evento e clube',
    objetivo: 'captar-contato',
    descricao: 'Pertencimento: o que acontece, quem vai, e como entrar.',
  },
  {
    nome: 'Restaurante e cafeteria',
    objetivo: 'apresentar-servico',
    descricao: 'Ambiente e cardápio; a foto carrega o argumento.',
  },
  {
    nome: 'Imóvel e arquitetura',
    objetivo: 'mostrar-trabalho',
    descricao: 'Espaço em imagem grande, ficha técnica ao lado, visita como chamada.',
  },
  {
    nome: 'Educação e curso',
    objetivo: 'vender-produto',
    descricao: 'Ementa, resultado de quem fez, e matrícula sem fricção.',
  },
  {
    nome: 'Marca pessoal',
    objetivo: 'captar-contato',
    descricao: 'Uma voz só, do começo ao fim, com o contato sempre a um passo.',
  },
];

/** Quantos papéis do objetivo esta origem consegue cobrir sozinha. */
const coberturaDaOrigem = (
  dsId: string,
  objetivo: ObjetivoDoSite,
  pecas: readonly { category: string; designSystemId: string }[],
): number => {
  const daOrigem = pecas.filter((p) => p.designSystemId === dsId);
  let n = 0;
  for (const etapa of SEQUENCIAS[objetivo]) {
    const cats = ROLE_CATEGORIES[etapa.papel] ?? [etapa.papel];
    if (daOrigem.some((p) => cats.includes(p.category) || p.category === etapa.papel)) n++;
  }
  return n;
};

const principal = (): void => {
  const args = process.argv.slice(2);
  const seco = args.includes('--seco');
  const apagarAntes = args.includes('--apagar-antes');

  const db = getDb();
  const pecas = db
    .select()
    .from(tables.libraryComponents)
    .all()
    .map((p) => ({
      id: p.id,
      name: p.name,
      category: p.category,
      kind: p.kind,
      designSystemId: p.designSystemId ?? 'sem-origem',
    }));

  if (pecas.length === 0) {
    console.log('\n  A Biblioteca está vazia. Rode `pnpm curar` e materialize as peças antes.\n');
    process.exit(1);
  }

  const marca = (id: string): number | null =>
    recolorabilidadeDoBundle(libraryComponentBundleDir(id as `cmp_${string}`))?.taxa ?? null;

  console.log('');
  console.log(
    `  Biblioteca: ${pecas.length} peça(s), ${new Set(pecas.map((p) => p.designSystemId)).size} origem(ns)`,
  );

  // Uma origem por kit, da mais completa para a menos: é a alavanca que faz os
  // dez kits terem caras diferentes. Origem já usada não se repete enquanto
  // houver origem nova que cubra o objetivo.
  const usadas = new Set<string>();
  /** Quantos kits desta leva já usam cada peça. Ver `usosPorPeca` na montagem. */
  const usosPorPeca = new Map<string, number>();
  const planejados: {
    nicho: (typeof NICHOS)[number];
    origem: string | null;
    componentIds: string[];
    cobertos: number;
    total: number;
  }[] = [];

  for (const nicho of NICHOS) {
    const origens = [...new Set(pecas.map((p) => p.designSystemId))]
      .map((ds) => ({ ds, cob: coberturaDaOrigem(ds, nicho.objetivo, pecas) }))
      .filter((o) => o.cob > 0)
      .sort((a, b) => b.cob - a.cob);
    const nova = origens.find((o) => !usadas.has(o.ds));
    const escolhida = nova ?? origens[0];
    if (escolhida !== undefined) usadas.add(escolhida.ds);

    const r = montarKitAutomatico(nicho.objetivo, pecas, marca, {
      origemPreferida: escolhida?.ds ?? null,
      usosPorPeca,
    });
    // A conta anda ENTRE os kits, e é isso que os faz distintos: o segundo kit
    // já paga por tudo que o primeiro usou. Sem ela, a origem preferida troca
    // só o visual principal e as etapas que ela não cobre repetem o mesmo
    // vencedor global em todos os dez.
    for (const id of r.componentIds) usosPorPeca.set(id, (usosPorPeca.get(id) ?? 0) + 1);
    planejados.push({
      nicho,
      origem: escolhida?.ds ?? null,
      componentIds: r.componentIds,
      cobertos: r.passos.filter((p) => p.componentId !== null).length,
      total: r.passos.length,
    });
  }

  console.log('');
  for (const p of planejados) {
    console.log(
      `    ${p.nicho.nome.padEnd(26)} ${String(p.componentIds.length).padStart(2)} peça(s)  ` +
        `${p.cobertos}/${p.total} etapas  origem …${(p.origem ?? '—').slice(-8)}`,
    );
  }
  console.log('');

  if (seco) {
    console.log('  (--seco: nada foi criado)\n');
    return;
  }

  if (apagarAntes) {
    const antigos = db.select().from(tables.kits).all();
    db.transaction((tx) => {
      for (const k of antigos) {
        tx.delete(tables.kitComponents).where(eq(tables.kitComponents.kitId, k.id)).run();
        tx.delete(tables.kits).where(eq(tables.kits.id, k.id)).run();
      }
    });
    console.log(`  ${antigos.length} kit(s) antigo(s) apagado(s). Os sites já gerados não mudam:`);
    console.log('  eles carregam cópia própria de todos os assets.');
  }

  const agora = Date.now();
  let criados = 0;
  for (const p of planejados) {
    if (p.componentIds.length === 0) {
      console.log(`  (pulado) ${p.nicho.nome}: nenhuma peça cobriu as etapas.`);
      continue;
    }
    const id = newKitId();
    db.transaction((tx) => {
      tx.insert(tables.kits)
        .values({
          id,
          name: p.nicho.nome,
          description: p.nicho.descricao,
          createdAt: agora,
          updatedAt: agora,
        })
        .run();
      p.componentIds.forEach((componentId, position) => {
        tx.insert(tables.kitComponents).values({ kitId: id, componentId, position }).run();
      });
    });
    // A consolidação é o que dá ao kit o design system dele (cores por papel,
    // fontes, escala). Sem ela a geração não tem de onde tirar a paleta.
    consolidarEGravar(db, id);
    criados++;
  }
  console.log(`\n  ${criados} kit(s) criado(s).\n`);
};

principal();
