/**
 * Orbis: quem fala com quem usa o app.
 *
 * O orbe já era a cara do produto (a marca, a espera, as telas vazias). Faltava
 * a voz. A partir daqui o app não descreve o que acontece em terceira pessoa;
 * é o Orbis que se dirige a quem está do outro lado, e ele fala de si na
 * primeira pessoa.
 *
 * ## Por que a voz mora AQUI, e não espalhada nas telas
 *
 * Uma persona escrita tela a tela vira sete personas em três semanas: uma
 * formal, uma engraçadinha, uma que esqueceu de existir. É o mesmo padrão que
 * já mordeu este repo em outras formas (duas listas que precisam concordar e
 * discordam em silêncio). Aqui a saudação, o tratamento e o nome saem de um
 * lugar só, e mudar o tom é mudar um arquivo.
 *
 * ## Como o Orbis fala
 *
 * 1. **Primeira pessoa, sempre.** "Capturei 13 peças", não "13 peças foram
 *    capturadas". Se ele fez, ele assume; se falhou, também.
 * 2. **Curto.** Uma frase, no máximo duas. Ele é um instrumento de precisão,
 *    não um assistente tagarela. Frase longa em tela cheia de dados é ruído.
 * 3. **`senhor` é tempero, não tique.** Uma vez por tela, na abertura ou num
 *    momento que importa. Em toda frase, vira paródia e cansa na terceira.
 * 4. **Número em vez de adjetivo.** "Faltaram 4 ícones" vale mais que "quase
 *    tudo veio". É a mesma regra que o resto do app já segue: cobertura parcial
 *    é declarada, nunca arredondada para cima.
 * 5. **Nunca promete o que não entrega.** Se a captura saiu pela metade, ele
 *    diz que saiu pela metade. Um assistente que só dá boa notícia é um
 *    assistente em quem não se confia.
 * 6. **Sem travessão e sem tom de máquina.** Nada de "Ótimo!", "Perfeito!",
 *    "Vamos lá!". Ele é seguro, não animado.
 *
 * ## O que ele NUNCA faz
 *
 * Falar por cima do conteúdo do usuário. A prévia de um site e o card de uma
 * peça são da pessoa, não dele. A mesma regra que o `Mascote.tsx` já impõe ao
 * desenho vale para a voz.
 */

/** O nome. Uma constante porque ele aparece em tela, no título e na abertura. */
export const ORBIS = 'Orbis';

/**
 * Como o Orbis se dirige a quem usa o app.
 *
 * Fica isolado de propósito: trocar por `chefe`, pelo primeiro nome da pessoa
 * ou por nada é mudar esta linha, não caçar strings por sete telas.
 */
export const TRATAMENTO = 'senhor';

/** `Bom dia` / `Boa tarde` / `Boa noite`, pelo relógio de quem está lendo. */
export const saudacao = (agora: Date = new Date()): string => {
  const h = agora.getHours();
  if (h < 12) return 'Bom dia';
  if (h < 18) return 'Boa tarde';
  return 'Boa noite';
};

/** `Boa noite, senhor.` A abertura de uma tela, quando ela merece uma. */
export const saudacaoCompleta = (agora: Date = new Date()): string =>
  `${saudacao(agora)}, ${TRATAMENTO}.`;

/**
 * Plural que não sai errado no singular.
 *
 * Existe porque "1 peças" numa frase do Orbis estraga a ilusão inteira: quem
 * fala assim é um sistema, não alguém.
 */
export const conta = (n: number, um: string, varios: string): string =>
  `${n} ${n === 1 ? um : varios}`;

/**
 * O que o Orbis diz enquanto trabalha.
 *
 * A espera é o momento em que a pessoa mais olha para a tela. Um "Carregando..."
 * gasta esse momento; dizer o que está sendo feito, não.
 */
export const TRABALHANDO = {
  extraindo: 'Abrindo a página num navegador de verdade. Isso leva alguns minutos.',
  carregandoCapturas: 'Buscando o que já capturei.',
  carregandoPecas: `Reunindo as peças que o ${TRATAMENTO} guardou.`,
  carregandoKits: 'Conferindo os kits montados.',
  carregandoSites: 'Vendo quais sites já estão prontos em disco.',
  salvando: 'Guardando.',
  gerando: 'Montando o site com as peças do kit.',
} as const;

/**
 * O que o Orbis diz quando não há nada.
 *
 * Cada uma tem duas partes: o estado (o que ele vê) e o convite (o que fazer
 * agora). Tela vazia sem saída é beco.
 */
export const VAZIO = {
  capturas: {
    titulo: 'Ainda não capturei nada.',
    corpo: `Me dê o endereço de um site de que o ${TRATAMENTO} goste e eu trago o visual dele inteiro.`,
  },
  biblioteca: {
    titulo: 'A biblioteca está vazia.',
    corpo: `Triei o que capturei, mas o ${TRATAMENTO} ainda não guardou nenhuma peça.`,
  },
  kits: {
    titulo: 'Nenhum kit montado.',
    corpo: 'Um kit é o conjunto de peças que vira a base visual do seu site.',
  },
  sites: {
    titulo: 'Nenhum site pronto ainda.',
    corpo: `Assim que o ${TRATAMENTO} montar um projeto, ele aparece aqui para ver e baixar.`,
  },
} as const;
