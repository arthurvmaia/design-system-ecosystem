import { ALCANCE_DA_MARCA } from '@ds/shared/schemas';
import type { KitContratoResumo, Recolorabilidade } from './api';

/**
 * O alcance da paleta do usuário sobre uma peça, em linguagem de tela: o número,
 * a faixa, o MOTIVO do que ficou de fora e o que dá para fazer a respeito.
 *
 * ## O defeito que este arquivo fecha
 *
 * A conta já existia e já era honesta (`medirRecolorabilidade`, no composer) e
 * conta por MOTIVO desde o primeiro dia, no campo `fora`. O produto usava só o
 * total: o selo da Galeria dizia "marca 46%" e parava ali, o editor de kit não
 * dizia nada, e a revisão do wizard só abria a boca abaixo de 35%. As três telas
 * tinham `fora` na mão e nenhuma lia.
 *
 * "46%" sem motivo não é acionável. Os 54% que sobraram podem ser uma borda
 * branca de scrollbar, que ninguém vê, ou o fundo inteiro em `var(--tw-bg)`, que
 * faz a peça sair com a cara do site de origem. São decisões opostas com o mesmo
 * número na tela.
 *
 * ## Os limiares moram aqui, e só aqui
 *
 * Antes: `0.8` e `0.35` digitados dentro do `MarcaBadge` da Galeria, e `0.35`
 * digitado de novo dentro do `Wizard`. Dois lugares, o mesmo número, nenhuma
 * garantia de que continuariam iguais. Agora quem precisa do corte chama
 * `faixaDeAlcance`, e o número aparece uma vez só, aqui embaixo.
 */

/**
 * Onde ficam os cortes, e por quê.
 *
 * - **`veste` (0,8)**: daqui para cima o que sobra é detalhe. Uma borda, um
 *   `white` de barra de rolagem, uma sombra de foco. A peça veste a marca e
 *   avisar sobre ela seria ruído que ensina a ignorar todo aviso.
 * - **`origem` (0,35)**: daqui para baixo a peça é a de origem pintada por fora.
 *   A maior parte da cor que a pessoa vai ver não é dela.
 *
 * Os dois números vêm de `nivelDeMarca` (`packages/composer`), que os escolheu e
 * os documentou primeiro. Aqui eles são repetidos porque `apps/web` não depende
 * do composer, e não de um segundo critério: mudar um sem o outro é o defeito que
 * a PENDÊNCIA de mover a constante para o `@ds/shared` existe para acabar.
 *
 * ## O que mudou na revisão do wizard
 *
 * O wizard usava `taxa < 0.35` como corte BINÁRIO: abaixo disso avisava, acima
 * disso ficava calado. Uma peça com 40% de alcance, então, passava sem uma
 * palavra, e 40% quer dizer que três de cada cinco cores da peça saem do site de
 * origem. O selo da Galeria já chamava isso de "parcial" e mostrava o número; a
 * tela onde a decisão custa dinheiro era a única que não dizia nada.
 *
 * O corte binário virou FAIXA, e nenhum número novo foi inventado para isso:
 * abaixo de 0,35 o aviso diz que a peça sai com as cores da origem; entre 0,35 e
 * 0,8 ele diz quanto ela veste, peça por peça, com o número medido à vista. O que
 * some é o silêncio da faixa do meio, que era o defeito.
 *
 * Subir o corte único para 0,8 foi considerado e recusado: transformaria em
 * alerta uma peça com 79% de alcance, onde o que sobra é mesmo detalhe, e um
 * aviso que aparece sempre não avisa nada.
 */
/**
 * Os cortes moram em `@ds/shared`, não aqui. Reexportados com o nome que esta
 * tela usa para não espalhar o import, mas o NÚMERO tem um dono só: o motor e a
 * tela precisam chamar a mesma peça da mesma coisa.
 */
export const LIMIAR_DE_ALCANCE = ALCANCE_DA_MARCA;

/**
 * Em que faixa a peça caiu.
 *
 * `nao-medido` não é um quarto nível de qualidade: é a ausência de medida. O
 * servidor devolve a medida ausente em duas situações que o cliente não
 * distingue (a peça não trouxe folha de estilo própria, ou a folha não abriu), e
 * por isso todo texto daqui fala em "não tenho medida" e nunca acusa a peça de
 * um defeito. Devolver `aplicavel` nesse caso, que é o que a Galeria fazia ao
 * esconder o selo, seria prometer uma coisa que ninguém conferiu.
 */
export type FaixaDeAlcance = 'aplicavel' | 'parcial' | 'cores-fixas' | 'nao-medido';

export const faixaDeAlcance = (marca: Recolorabilidade | null | undefined): FaixaDeAlcance => {
  if (marca === null || marca === undefined) return 'nao-medido';
  // Peça sem cor nenhuma não tem o que perder: a conta do composer devolve taxa
  // 1 para ela, e o mesmo contrato vale aqui.
  if (marca.total === 0 || marca.taxa >= LIMIAR_DE_ALCANCE.veste) return 'aplicavel';
  if (marca.taxa < LIMIAR_DE_ALCANCE.origem) return 'cores-fixas';
  return 'parcial';
};

/** Os motivos reais que a medição conta. Espelha `MotivoInalcancavel`. */
export type MotivoDeExclusao = 'palavra' | 'funcao-dinamica' | 'dentro-de-imagem';

/**
 * A ordem em que os motivos aparecem quando empatam na contagem.
 *
 * Existe para a lista não sacudir a cada render: `Object.entries` não promete
 * ordem estável entre execuções, e um painel que troca a ordem sozinho parece
 * estar mudando de resposta.
 */
const ORDEM: readonly MotivoDeExclusao[] = ['palavra', 'funcao-dinamica', 'dentro-de-imagem'];

const ROTULO: Record<MotivoDeExclusao, readonly [string, string]> = {
  palavra: ['cor escrita por nome', 'cores escritas por nome'],
  'funcao-dinamica': ['cor calculada na hora', 'cores calculadas na hora'],
  'dentro-de-imagem': ['cor dentro de um desenho', 'cores dentro de desenhos'],
};

/** O rótulo do motivo, já no singular ou no plural da contagem. */
export const rotuloDoMotivo = (motivo: MotivoDeExclusao, quantas: number): string =>
  ROTULO[motivo][quantas === 1 ? 0 : 1];

/**
 * Por que aquelas cores ficam de fora.
 *
 * Cada exclusão está certa, e a explicação diz o certo dela em vez de pedir
 * desculpa: quem lê precisa entender que não é falha do app, é a única resposta
 * possível ali. O texto não cita nome de função interna nem fase de pipeline.
 */
export const EXPLICACAO_DO_MOTIVO: Record<MotivoDeExclusao, string> = {
  palavra:
    'São cores escritas como palavra, do tipo white, black e transparent. Trocar essas atinge também a barra de rolagem e o brilho de foco, que não são decisão de marca.',
  'funcao-dinamica':
    'São cores que o navegador calcula na hora, com var() ou color-mix(). O valor final depende do contexto da página, e sem resolver esse contexto não existe cor certa para colocar no lugar.',
  'dentro-de-imagem':
    'São cores que moram dentro de um desenho embutido no arquivo. Ali a cor é conteúdo da imagem, não estilo da página.',
};

export type MotivoContado = {
  motivo: MotivoDeExclusao;
  quantas: number;
  /** Já no plural certo da contagem. */
  rotulo: string;
  explicacao: string;
};

/** Os motivos com contagem, do que mais pesa para o que menos pesa. */
export const motivosDe = (marca: Recolorabilidade | null | undefined): MotivoContado[] => {
  if (marca === null || marca === undefined) return [];
  return ORDEM.map((motivo) => ({ motivo, quantas: marca.fora[motivo] ?? 0 }))
    .filter((m) => m.quantas > 0)
    .sort((a, b) => b.quantas - a.quantas || ORDEM.indexOf(a.motivo) - ORDEM.indexOf(b.motivo))
    .map((m) => ({
      ...m,
      rotulo: rotuloDoMotivo(m.motivo, m.quantas),
      explicacao: EXPLICACAO_DO_MOTIVO[m.motivo],
    }));
};

/** Uma fração 0..1 como percentual inteiro. O número vai para frase corrida. */
export const pctInteiro = (v: number): string => `${Math.round(v * 100)}%`;

/**
 * Os motivos numa linha só, para caber em tooltip e em rodapé de card:
 * "23 cores escritas por nome, 8 cores calculadas na hora".
 */
export const linhaDeMotivos = (motivos: readonly MotivoContado[]): string =>
  motivos.map((m) => `${m.quantas} ${m.rotulo}`).join(', ');

/** O mesmo, partindo da medida bruta. */
export const motivosEmLinha = (marca: Recolorabilidade | null | undefined): string =>
  linhaDeMotivos(motivosDe(marca));

/**
 * A frase inteira do selo da Galeria.
 *
 * Mora aqui e não no componente porque é texto que afirma uma medida, e texto
 * que afirma medida precisa de teste. Devolve vazio para `aplicavel`: peça que
 * veste a marca não ganha selo, e o silêncio ali é a promessa honesta.
 */
export const fraseDoSelo = (marca: Recolorabilidade | null | undefined): string => {
  const faixa = faixaDeAlcance(marca);
  if (faixa === 'aplicavel') return '';
  if (faixa === 'nao-medido' || marca == null) {
    return 'Não tenho medida do alcance da sua paleta nesta peça: ou ela não trouxe folha de estilo própria, ou a folha não abriu. Não dá para dizer o que ela vai vestir.';
  }
  const porque = motivosEmLinha(marca);
  const cauda = porque === '' ? '' : ` O que fica de fora: ${porque}.`;
  if (faixa === 'cores-fixas') {
    return `As cores desta peça são fixas: só ${marca.alcancavel} de ${marca.total} aceitam a sua paleta.${cauda} Ela vai sair com as cores do site de origem.`;
  }
  return `${marca.alcancavel} de ${marca.total} cores desta peça aceitam a sua paleta.${cauda} O resto sai como está no site de origem.`;
};

// ── O aviso do editor de kit e da revisão do wizard ──────────────────────────

/**
 * Uma peça do kit que não veste a marca inteira.
 *
 * Guarda o dado, não a frase: as duas telas que consomem isto têm espaços muito
 * diferentes (um painel no editor, uma linha de aviso na revisão) e cada uma
 * monta o texto que cabe nela, a partir dos mesmos números.
 */
export type PecaForaDaMarca = {
  id: string;
  nome: string;
  faixa: Exclude<FaixaDeAlcance, 'aplicavel'>;
  /** `null` quando não deu para medir. Nunca 0 fingindo ser medida. */
  taxa: number | null;
  alcancavel: number;
  total: number;
  motivos: MotivoContado[];
};

/** Pior primeiro: cores fixas antes de parcial, e dentro de cada uma a de menor alcance na frente. */
const PESO_DA_FAIXA: Record<Exclude<FaixaDeAlcance, 'aplicavel'>, number> = {
  'cores-fixas': 0,
  parcial: 1,
  'nao-medido': 2,
};

/**
 * As peças do kit sobre as quais há algo a dizer, da pior para a melhor.
 *
 * Peça que veste a marca fica de fora da lista de propósito: o painel existe
 * para apontar o que decide, e listar as boas junto obrigaria a pessoa a
 * procurar a ruim no meio.
 */
export const pecasForaDaMarca = (contratos: readonly KitContratoResumo[]): PecaForaDaMarca[] => {
  const fora: PecaForaDaMarca[] = [];
  for (const c of contratos) {
    const faixa = faixaDeAlcance(c.marca);
    if (faixa === 'aplicavel') continue;
    fora.push({
      id: c.id,
      nome: c.nome?.trim() === '' || c.nome === undefined ? 'Peça sem nome' : c.nome,
      faixa,
      taxa: c.marca?.taxa ?? null,
      alcancavel: c.marca?.alcancavel ?? 0,
      total: c.marca?.total ?? 0,
      motivos: motivosDe(c.marca),
    });
  }
  return fora.sort(
    (a, b) => PESO_DA_FAIXA[a.faixa] - PESO_DA_FAIXA[b.faixa] || (a.taxa ?? 1) - (b.taxa ?? 1),
  );
};

/** "Peça A (12%), Peça B (28%) e mais 2" — a lista curta que cabe numa frase. */
const listar = (pecas: readonly PecaForaDaMarca[], comPct: boolean): string => {
  const primeiras = pecas
    .slice(0, 3)
    .map((p) => (comPct && p.taxa !== null ? `${p.nome} (${pctInteiro(p.taxa)})` : p.nome))
    .join(', ');
  return pecas.length > 3 ? `${primeiras} e mais ${pecas.length - 3}` : primeiras;
};

/**
 * O aviso da revisão do wizard, em uma frase por faixa.
 *
 * Uma frase por FAIXA e não uma por peça: um kit de doze peças mistas produziria
 * doze avisos iguais e a revisão viraria uma parede que ninguém lê. Dentro de
 * cada frase as peças são nomeadas com o número de cada uma, que é o que permite
 * ir lá e trocar a certa.
 *
 * Toda frase termina com o que fazer. Aviso sem saída é só má notícia.
 */
export const frasesDeAlcanceDoKit = (pecas: readonly PecaForaDaMarca[]): string[] => {
  const frases: string[] = [];
  const fixas = pecas.filter((p) => p.faixa === 'cores-fixas');
  const parciais = pecas.filter((p) => p.faixa === 'parcial');
  const semMedida = pecas.filter((p) => p.faixa === 'nao-medido');

  if (fixas.length === 1 && fixas[0] !== undefined) {
    const p = fixas[0];
    frases.push(
      `A peça "${p.nome}" veste ${pctInteiro(p.taxa ?? 0)} da sua paleta: o resto sai com as cores do site de origem. Troque essa peça no kit, ou siga sabendo que ela fica com a cara da origem.`,
    );
  } else if (fixas.length > 1) {
    frases.push(
      `${fixas.length} peças deste kit vestem quase nada da sua paleta (${listar(fixas, true)}). Elas saem com as cores do site de origem. Troque no kit as que não puderem sair assim.`,
    );
  }

  if (parciais.length === 1 && parciais[0] !== undefined) {
    const p = parciais[0];
    frases.push(
      `A peça "${p.nome}" veste ${pctInteiro(p.taxa ?? 0)} da sua paleta. O resto vem do site de origem, e aparece mais em fundo e borda. Veja a prévia do kit com a marca deste projeto antes de gerar.`,
    );
  } else if (parciais.length > 1) {
    frases.push(
      `${parciais.length} peças vestem só parte da sua paleta (${listar(parciais, true)}). A cor que sobra vem do site de origem. Veja a prévia do kit com a marca deste projeto antes de gerar.`,
    );
  }

  if (semMedida.length > 0) {
    frases.push(
      `Não tenho medida do alcance da paleta em ${semMedida.length === 1 ? 'uma peça' : `${semMedida.length} peças`} (${listar(semMedida, false)}): ou elas não trouxeram folha de estilo própria, ou a folha não abriu. Confira essas na prévia do kit, que é o único jeito de saber.`,
    );
  }

  return frases;
};
