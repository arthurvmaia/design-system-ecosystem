import type { ClusterDeCor, MembroDoCluster, PapelDeCor } from '@ds/shared';
import { type Oklch, distanciaOk, paraOklch } from './cor.js';
import type { OcorrenciaDeCor } from './inventario.js';

/**
 * Consolidação: das ocorrências soltas para clusters com papel.
 *
 * É a única parte do pipeline de cor com JULGAMENTO, e o julgamento segue a
 * regra do desempate honesto que este repo herdou do script do professor: na
 * dúvida, o papel fica `null` e o literal fica em paz. Recolorir errado é pior
 * que não recolorir — errado destrói contraste em silêncio; não recolorir
 * mantém a aparência de origem, que já era boa.
 *
 * O vocabulário de papéis é o MESMO da paleta do usuário (TOKENS_SEMANTICOS):
 * é isso que faz a ponte funcionar sem tabela de tradução — o cluster diz
 * "sou primary" e o marca.css já tem `--marca-primary` com a cor da marca.
 */

export type ConsolidacaoDaOrigem = {
  tema: 'claro' | 'escuro';
  clusters: ClusterDeCor[];
  limitacoes: string[];
};

/** Distância abaixo da qual duas cores são o mesmo cluster. */
const DELTA_MESMA_COR = 0.03;
/** Croma abaixo do qual a cor é neutra (cinza, quase-branco, quase-preto). */
const CROMA_NEUTRO = 0.04;
/** Peso mínimo de um cluster para merecer papel: 1% do total. */
const FRACAO_MINIMA = 0.01;
/**
 * Distância de matiz, em graus, dentro da qual duas cores são a MESMA família.
 *
 * 25 graus é largo o bastante para pegar um hover mais escuro e uma tinta mais
 * clara do mesmo verde, e estreito o bastante para não confundir um verde com
 * um azul (que distam ~120) nem com um amarelo (~90).
 */
const FAIXA_DE_FAMILIA = 25;

/** Distância angular entre dois matizes, pelo caminho curto. */
const distanciaDeMatiz = (a: number, b: number): number => {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
};

type Grupo = {
  centro: Oklch;
  hexCanonico: string;
  membros: MembroDoCluster[];
  peso: number;
  pesoPorContexto: Map<string, number>;
};

const pesoDe = (g: Grupo, contexto: string): number => g.pesoPorContexto.get(contexto) ?? 0;

export const consolidarCores = (ocorrencias: readonly OcorrenciaDeCor[]): ConsolidacaoDaOrigem => {
  const limitacoes: string[] = [];

  // ── 1. Agregar por hexOpaco ───────────────────────────────────────────────
  // Alfa NÃO separa: `#f69066` e `rgb(246 144 102 / 0.5)` são a mesma decisão
  // de design com opacidades diferentes. Cada literal vira um membro próprio
  // (a recoloração precisa do texto exato), mas o peso soma na mesma cor.
  const porHex = new Map<string, { membros: MembroDoCluster[]; peso: number }>();
  for (const o of ocorrencias) {
    const atual = porHex.get(o.hexOpaco) ?? { membros: [], peso: 0 };
    atual.membros.push({
      literal: o.literal,
      hexOpaco: o.hexOpaco,
      ocorrencias: o.ocorrencias,
      contexto: o.contexto,
    });
    atual.peso += o.ocorrencias;
    porHex.set(o.hexOpaco, atual);
  }

  // ── 2. Cluster greedy em OKLCH ────────────────────────────────────────────
  // Ordena por peso desc: o centro de cada cluster é a cor mais usada dele, e
  // as variações leves (um hover 4% mais escuro gerado por ferramenta) se
  // penduram nela em vez de virarem cluster próprio.
  const cores = [...porHex.entries()].sort((a, b) => b[1].peso - a[1].peso);
  const grupos: Grupo[] = [];
  for (const [hex, dados] of cores) {
    const ok = paraOklch(hex);
    const casa = grupos.find((g) => distanciaOk(g.centro, ok) < DELTA_MESMA_COR);
    const alvo =
      casa ??
      (() => {
        const novo: Grupo = {
          centro: ok,
          hexCanonico: hex,
          membros: [],
          peso: 0,
          pesoPorContexto: new Map(),
        };
        grupos.push(novo);
        return novo;
      })();
    alvo.membros.push(...dados.membros);
    alvo.peso += dados.peso;
    for (const m of dados.membros) {
      alvo.pesoPorContexto.set(m.contexto, pesoDe(alvo, m.contexto) + m.ocorrencias);
    }
  }

  const pesoTotal = grupos.reduce((n, g) => n + g.peso, 0);
  if (pesoTotal === 0) {
    return { tema: 'claro', clusters: [], limitacoes: ['Nenhuma cor inventariada nesta origem.'] };
  }

  // ── 3. Neutros × acentos ──────────────────────────────────────────────────
  const neutros = grupos.filter((g) => g.centro.c < CROMA_NEUTRO);
  const acentos = grupos.filter((g) => g.centro.c >= CROMA_NEUTRO);

  // ── 4. Tema da origem ─────────────────────────────────────────────────────
  // Decidido pelo neutro que mais pinta FUNDO. Um site escuro tem o grosso do
  // peso de `bg` num neutro de L baixa. Sem neutro com fundo, assumir claro e
  // dizer isso é mais honesto que adivinhar.
  const neutrosComBg = neutros.filter((g) => pesoDe(g, 'bg') > 0);
  const fundoDominante = [...neutrosComBg].sort((a, b) => pesoDe(b, 'bg') - pesoDe(a, 'bg'))[0];
  const tema: 'claro' | 'escuro' =
    fundoDominante === undefined ? 'claro' : fundoDominante.centro.l > 0.6 ? 'claro' : 'escuro';
  if (fundoDominante === undefined) {
    limitacoes.push(
      'Nenhum neutro pintando fundo nesta origem: assumi tema claro. Se o site for escuro, os papéis de neutro podem sair invertidos.',
    );
  }

  // ── 5. Papéis ─────────────────────────────────────────────────────────────
  const papelPorGrupo = new Map<Grupo, { papel: PapelDeCor; confianca: number }>();
  const atribuir = (g: Grupo | undefined, papel: PapelDeCor, confianca: number): void => {
    if (g === undefined || papelPorGrupo.has(g)) return;
    if (g.peso / pesoTotal < FRACAO_MINIMA) {
      limitacoes.push(
        `Cluster ${g.hexCanonico} pesa menos de 1% da origem: ficou sem papel (seria ${papel}).`,
      );
      return;
    }
    papelPorGrupo.set(g, { papel, confianca: Math.max(0, Math.min(1, confianca)) });
  };

  // Neutros. A ordenação é por luminância RELATIVA ao fundo: num tema claro o
  // texto é o neutro mais escuro; num escuro, o mais claro. `direcao` aponta
  // do fundo para o texto.
  if (fundoDominante !== undefined) {
    const confBg =
      pesoDe(fundoDominante, 'bg') /
      Math.max(
        1,
        neutrosComBg.reduce((n, g) => n + pesoDe(g, 'bg'), 0),
      );
    atribuir(fundoDominante, 'background', confBg);

    const direcao = tema === 'claro' ? -1 : 1;
    const doLadoDoTexto = neutros
      .filter((g) => g !== fundoDominante)
      .map((g) => ({ g, delta: (g.centro.l - fundoDominante.centro.l) * direcao }))
      .filter((x) => x.delta > 0);

    // Texto: os mais LONGE do fundo, com peso em texto. heading é o extremo.
    const comTexto = doLadoDoTexto
      .filter((x) => pesoDe(x.g, 'text') > 0)
      .sort((a, b) => b.delta - a.delta);
    atribuir(comTexto[0]?.g, 'heading', 0.6 + 0.4 * Math.min(1, comTexto[0]?.delta ?? 0));
    atribuir(comTexto[1]?.g, 'body', 0.55);
    // muted: intermediário, mais perto do fundo que o body.
    const muted = comTexto.slice(2).sort((a, b) => a.delta - b.delta)[0];
    atribuir(muted?.g, 'muted', 0.5);

    // Borda ANTES das superfícies. A ordem importa: um cinza usado só em
    // bordas mora na mesma faixa de luminância que uma superfície, e se as
    // superfícies escolherem primeiro elas o capturam — foi exatamente o que o
    // teste da origem real pegou (#d9d9d9, peso todo em border, saindo como
    // surface-elevated). Quem tem contexto dominante declara o papel.
    const dominanciaEmBorder = (g: Grupo): boolean =>
      pesoDe(g, 'border') > 0 && pesoDe(g, 'border') >= g.peso / 2;
    const borda = neutros
      .filter((g) => !papelPorGrupo.has(g) && pesoDe(g, 'border') > 0)
      .sort((a, b) => pesoDe(b, 'border') - pesoDe(a, 'border'))[0];
    if (borda !== undefined && dominanciaEmBorder(borda)) {
      atribuir(borda, 'border', 0.6);
    }

    // Superfícies: vizinhos do fundo (ΔL pequeno), do lado do texto — num tema
    // claro a superfície é um cinza levemente mais escuro que o fundo. Exigem
    // presença em `bg`: superfície é coisa que PINTA área, e um neutro que
    // nunca pintou fundo nenhum não vira superfície por vizinhança.
    const superficies = doLadoDoTexto
      .filter((x) => x.delta <= 0.15 && !papelPorGrupo.has(x.g) && pesoDe(x.g, 'bg') > 0)
      .sort((a, b) => a.delta - b.delta);
    atribuir(superficies[0]?.g, 'surface', 0.55);
    atribuir(superficies[1]?.g, 'surface-elevated', 0.5);

    // Segunda chance da borda: sem dominância, mas sobrou e tem uso em border.
    if (borda !== undefined && !papelPorGrupo.has(borda)) {
      atribuir(borda, 'border', 0.5);
    }
  }

  // Acentos: score = peso × croma. O croma entra porque um acento lavado com
  // muitas ocorrências (um cinza-azulado de sombra) não é a cor da marca.
  const rank = [...acentos].sort((a, b) => b.peso * b.centro.c - a.peso * a.centro.c);
  const scoreDe = (g: Grupo | undefined): number => (g === undefined ? 0 : g.peso * g.centro.c);

  if (rank[0] !== undefined) {
    // A margem sobre o 2º modula a confiança, mas com piso 0.5: trocar primary
    // por secondary não é catástrofe (os dois recebem cor de marca), então um
    // empate não deve ZERAR a recoloração — foi medido que a fórmula
    // "participação × margem" proposta no desenho anulava o caso real da
    // Pelina (0.42 × 0.2 = 0.08), matando exatamente o que ela deveria salvar.
    const margem1 = 1 - scoreDe(rank[1]) / scoreDe(rank[0]);
    atribuir(rank[0], 'primary', 0.5 + 0.5 * margem1);

    // Variante do primary (mesmo matiz, L deslocada) é hover, não secondary:
    // `#d99a00` ao lado de `#ffb500` é o mesmo botão em dois estados.
    const mesmoMatiz = (a: Grupo, b: Grupo): boolean => {
      const dh = Math.abs(a.centro.h - b.centro.h);
      return Math.min(dh, 360 - dh) < 15;
    };
    const restantes = rank.slice(1).filter((g) => !papelPorGrupo.has(g));
    const hover = restantes.find(
      (g) => rank[0] !== undefined && mesmoMatiz(g, rank[0]) && g.peso < (rank[0]?.peso ?? 0),
    );
    atribuir(hover, 'primary-hover', 0.55);

    const semHover = restantes.filter((g) => g !== hover);
    atribuir(semHover[0], 'secondary', 0.55);
    atribuir(semHover[1], 'accent', 0.5);
    for (const sobra of semHover.slice(2)) {
      if (sobra.peso / pesoTotal >= FRACAO_MINIMA) {
        limitacoes.push(
          `Acento ${sobra.hexCanonico} (peso ${sobra.peso}) ficou sem papel: primary, secondary e accent já estavam tomados.`,
        );
      }
    }
  }

  // ── 6. Montagem ───────────────────────────────────────────────────────────
  // ── 6. Herança por família de matiz ───────────────────────────────────────
  //
  // O passo que faltava, e o defeito era grande: medido no kit real, das 111
  // cores sem papel, 49 eram VARIAÇÕES de uma cor que já tinha papel. O verde
  // `#4a6b5a` (escuro) e o `#8abf9e` (claro) são o mesmo verde do `primary`,
  // usados em hover e em tinta de fundo. Sem esta passada, o `primary` virava
  // a cor da marca e as duas continuavam verdes — o site saía METADE
  // convertido, que é pior do que não converter nada: parece defeito, não
  // parece escolha.
  //
  // A herança carrega a RELAÇÃO, não só o papel. Pintar as três com a mesma
  // cor apagaria a hierarquia da origem (o hover deixaria de ser mais escuro).
  // O que viaja é "quanto mais claro" e "quanto menos saturado", reaplicado
  // sobre a cor da marca.
  //
  // Só entre cromáticos: um neutro perto de um acento não é variação dele, e
  // sombra/overlay não deve virar cor de marca nunca.
  const comPapelCromatico = [...papelPorGrupo.entries()].filter(
    ([g]) => g.centro.c >= CROMA_NEUTRO,
  );
  const derivados = new Map<Grupo, { papel: PapelDeCor; deltaL: number; ratioC: number }>();
  for (const g of grupos) {
    if (papelPorGrupo.has(g) || g.centro.c < CROMA_NEUTRO) continue;
    // O parente é o de matiz mais próxima dentro da faixa: uma variação de
    // tom, não uma cor diferente.
    const candidatos = comPapelCromatico
      .map(([p, atrib]) => ({ p, atrib, dh: distanciaDeMatiz(p.centro.h, g.centro.h) }))
      .filter((x) => x.dh < FAIXA_DE_FAMILIA)
      .sort((a, b) => a.dh - b.dh);
    const escolhido = candidatos[0];
    if (escolhido === undefined) continue;
    derivados.set(g, {
      papel: escolhido.atrib.papel,
      deltaL: g.centro.l - escolhido.p.centro.l,
      // Croma do parente pode ser pequeno; o piso evita razão absurda.
      ratioC: Math.min(4, g.centro.c / Math.max(0.02, escolhido.p.centro.c)),
    });
  }

  // ── 7. Montagem ───────────────────────────────────────────────────────────
  const clusters: ClusterDeCor[] = grupos.map((g) => {
    const atribuicao = papelPorGrupo.get(g);
    if (atribuicao !== undefined) {
      return {
        papel: atribuicao.papel,
        corCanonica: g.hexCanonico,
        membros: g.membros,
        confianca: atribuicao.confianca,
        ajuste: null,
      };
    }
    const derivado = derivados.get(g);
    if (derivado !== undefined) {
      return {
        papel: derivado.papel,
        corCanonica: g.hexCanonico,
        membros: g.membros,
        // Herdado vale um pouco menos que próprio, mas passa do limiar: a
        // evidência (mesmo matiz de uma cor já classificada) é forte.
        confianca: 0.55,
        ajuste: {
          deltaL: Number(derivado.deltaL.toFixed(3)),
          ratioC: Number(derivado.ratioC.toFixed(3)),
        },
      };
    }
    return {
      papel: null,
      corCanonica: g.hexCanonico,
      membros: g.membros,
      confianca: 0,
      ajuste: null,
    };
  });

  return { tema, clusters, limitacoes };
};
