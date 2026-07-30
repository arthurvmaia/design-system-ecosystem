import type { LinhaDeBase, MedidaDeBundle } from './fidelidade.js';

/**
 * O portão: a medição deixa de ser relatório e passa a reprovar.
 *
 * `comparar()`, ao lado, existe para IMPRIMIR duas colunas para uma pessoa ler.
 * Aqui a pergunta é outra e mais estreita: **isto pode entrar?** As duas não
 * podem ser a mesma função, por três razões que já estavam no código:
 *
 * - `comparar` devolve `melhorou` como `>` estrito, então uma métrica que ficou
 *   IGUAL volta com `melhorou: false`. Um portão que lesse isso como "piorou"
 *   reprovaria tudo que não mudou, que é a maioria dos dias.
 * - `comparar` coage retenção nula com `?? 0`. Um acervo sem origem para medir
 *   "despencaria" de 82% para 0% — uma falha catastrófica inventada por coerção
 *   de tipo.
 * - `comparar` compara AGREGADOS. Isso é honesto num relatório e é veneno num
 *   portão; a razão está logo abaixo.
 *
 * ## Por que o portão não compara médias
 *
 * A retenção de CSS não é uma propriedade do bundle: é do SITE. Todo bundle de
 * um mesmo design system divide o mesmo denominador (o CSS da captura), e na
 * linha de base medida aqui os 24 grupos têm desvio ZERO dentro de cada site.
 * A média do acervo é só a média ponderada pelo número de segmentos de cada
 * site. Repartir um site em 12 segmentos em vez de 8, sem tocar no motor, move
 * a média vários pontos.
 *
 * Pior: a retenção passa de 100% (o máximo medido na base é 106,5%), porque
 * `contarRegras` é aproximado de propósito. Qualquer limiar absoluto sobre ela
 * seria um número inventado.
 *
 * Então o portão compara **cada bundle com ele mesmo**, e só quando dá para
 * afirmar que é o mesmo: mesmo diretório, dentro de um design system que não
 * foi recapturado. `pnpm reextrair` mantém o `ds_id` e refaz os segmentos, e
 * depois disso `seg_3` é uma VAGA, não uma identidade — o `seg_3` de hoje pode
 * ser outra dobra da página.
 *
 * ## As três regras desta primeira volta
 *
 * Todas ABSOLUTAS: não precisam de par, de história nem de campo novo na linha
 * de base, e o valor certo delas é zero em qualquer acervo.
 *
 * - **A1, instrumentação vazada.** `data-dsx*` no HTML entregue ao cliente. É
 *   andaime do motor, nunca conteúdo.
 * - **A2, script ausente.** O índice pede um `.js` que não existe em disco: o
 *   `.zip` abre com o comportamento morto.
 * - **A3, seletor morto.** Regra cujo seletor exige um ancestral que não veio.
 *
 * Zero é atingível porque já está atingido: a base tinha 2908 instrumentações
 * em 207 bundles e 95 bundles com seletor morto; o acervo de hoje tem zero das
 * duas. Um portão cuja régua ainda não foi alcançada é um portão que se aprende
 * a ignorar.
 */

/** O que o portão decidiu, e por quê. */
export type Veredito = {
  /**
   * `passou` — nada reprovou.
   * `reprovou` — alguma regra absoluta foi violada.
   * `nao-deu-para-verificar` — faltou base, acervo ou coorte comparável.
   *
   * O terceiro estado é de primeira classe de propósito. Sem ele, "não medi"
   * vira "está bom", que é a mentira mais cara que uma verificação pode contar.
   */
  estado: 'passou' | 'reprovou' | 'nao-deu-para-verificar';
  /** Uma linha, para quem só vai ler o fim da saída. */
  resumo: string;
  /** As violações encontradas, uma por bundle e por regra. */
  violacoes: Violacao[];
  /** O contexto que torna o veredito legível. Sempre presente. */
  contexto: Contexto;
};

export type Violacao = {
  regra: 'A1-instrumentacao' | 'A2-script-ausente' | 'A3-seletor-morto';
  bundle: string;
  /** O que se mediu. */
  valor: number;
  /** A frase que a pessoa lê. */
  explicacao: string;
};

export type Contexto = {
  bundlesNaBase: number;
  sitesNaBase: number;
  bundlesAgora: number;
  sitesAgora: number;
  /** Bundles do acervo atual que também existem na base, pelo diretório. */
  comparaveis: number;
  /** Por que a coorte ficou vazia, quando ficou. */
  observacao: string | null;
};

/** O id do design system a que um bundle pertence, lido do caminho. */
const dsDoBundle = (dir: string): string | null => {
  const m = dir.replace(/\\/g, '/').match(/\/(ds_[A-Za-z0-9]+)\//);
  return m?.[1] ?? null;
};

/** Quantos design systems distintos há numa lista de medidas. */
const sitesEm = (bundles: readonly MedidaDeBundle[]): number =>
  new Set(bundles.map((b) => dsDoBundle(b.dir)).filter((d): d is string => d !== null)).size;

/**
 * Avalia o acervo atual contra a linha de base.
 *
 * PURA: não lê disco, não escreve, não encerra processo. Quem traduz isto em
 * texto e em código de saída é o script; quem decide é aqui. É essa separação
 * que permite testar o portão com literais, sem acervo — e é por isso que a
 * lógica do portão roda no CI mesmo com os dados morando fora do repo.
 */
export const avaliarPortao = (base: LinhaDeBase | null, agora: LinhaDeBase | null): Veredito => {
  const bundlesBase = base?.bundles ?? [];
  const bundlesAgora = agora?.bundles ?? [];

  const dirsDaBase = new Set(bundlesBase.map((b) => b.dir));
  const comparaveis = bundlesAgora.filter((b) => dirsDaBase.has(b.dir));

  const contexto: Contexto = {
    bundlesNaBase: bundlesBase.length,
    sitesNaBase: sitesEm(bundlesBase),
    bundlesAgora: bundlesAgora.length,
    sitesAgora: sitesEm(bundlesAgora),
    comparaveis: comparaveis.length,
    observacao: null,
  };

  if (base === null) {
    return {
      estado: 'nao-deu-para-verificar',
      resumo: 'Não existe linha de base gravada. Rode `pnpm medir-fidelidade --gravar` uma vez.',
      violacoes: [],
      contexto: { ...contexto, observacao: 'sem linha de base' },
    };
  }
  if (bundlesAgora.length === 0) {
    return {
      estado: 'nao-deu-para-verificar',
      resumo: 'O acervo não tem nenhum bundle para medir.',
      violacoes: [],
      contexto: { ...contexto, observacao: 'acervo vazio' },
    };
  }

  // ── As três regras absolutas ─────────────────────────────────────────────
  //
  // Absolutas quer dizer: valem sobre o acervo de HOJE inteiro, sem precisar
  // que o bundle exista na base. Um bundle novo tem de nascer limpo tanto
  // quanto um antigo tem de continuar limpo.
  const violacoes: Violacao[] = [];
  for (const b of bundlesAgora) {
    if (b.instrumentacaoVazada > 0) {
      violacoes.push({
        regra: 'A1-instrumentacao',
        bundle: b.nome,
        valor: b.instrumentacaoVazada,
        explicacao: `${b.instrumentacaoVazada} marca(s) data-dsx no HTML entregue: andaime do motor vazou para o bundle.`,
      });
    }
    if (b.scriptsAusentes > 0) {
      violacoes.push({
        regra: 'A2-script-ausente',
        bundle: b.nome,
        valor: b.scriptsAusentes,
        explicacao: `${b.scriptsAusentes} script(s) pedidos pelo índice não existem em disco: o bundle abre com o comportamento morto.`,
      });
    }
    // Só onde houve HTML de origem para descontar o que JÁ estava morto lá.
    // Sem esse desconto, o seletor morto do site original seria cobrado do
    // bundle, que não tem culpa nem conserto.
    if (b.seletoresMortos > 0 && b.regrasNaOrigem !== null) {
      violacoes.push({
        regra: 'A3-seletor-morto',
        bundle: b.nome,
        valor: b.seletoresMortos,
        explicacao: `${b.seletoresMortos} regra(s) exigem um ancestral que não veio no bundle.`,
      });
    }
  }

  if (violacoes.length > 0) {
    const porRegra = new Map<string, number>();
    for (const v of violacoes) porRegra.set(v.regra, (porRegra.get(v.regra) ?? 0) + 1);
    const partes = [...porRegra.entries()].map(([r, n]) => `${n} em ${r}`);
    return {
      estado: 'reprovou',
      resumo: `${violacoes.length} violação(ões) de regra absoluta: ${partes.join(', ')}.`,
      violacoes,
      contexto,
    };
  }

  // Passou nas absolutas. A coorte comparável não muda o veredito nesta volta
  // (não há regra pareada ainda), mas o número aparece: é ele que diz se a
  // próxima volta terá com o que trabalhar.
  const observacao =
    comparaveis.length === 0
      ? 'nenhum bundle da base existe no acervo atual: a comparação pareada não tem coorte'
      : null;

  return {
    estado: 'passou',
    resumo:
      comparaveis.length === 0
        ? 'Nenhuma regra absoluta foi violada. (A base é de outro acervo: nada foi comparado par a par.)'
        : 'Nenhuma regra absoluta foi violada.',
    violacoes: [],
    contexto: { ...contexto, observacao },
  };
};

/** As linhas de contexto, para nenhum veredito ser lido fora de escala. */
export const linhasDeContexto = (c: Contexto): string[] => {
  const linhas = [
    `base:  ${c.bundlesNaBase} bundle(s) de ${c.sitesNaBase} site(s)`,
    `agora: ${c.bundlesAgora} bundle(s) de ${c.sitesAgora} site(s)`,
    `comparáveis par a par: ${c.comparaveis}`,
    'regras em uso: A1 instrumentação, A2 script ausente, A3 seletor morto (tolerância zero)',
  ];
  if (c.observacao !== null) linhas.push(`observação: ${c.observacao}`);
  return linhas;
};
