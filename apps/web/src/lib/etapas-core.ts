/**
 * As etapas do wizard e o que cada uma exige para liberar a próxima.
 *
 * Fonte única dos índices. Eles viviam duplicados aqui e no `revisao-core`, e
 * dois mapas que precisam concordar acabam discordando: o botão "Corrigir" da
 * Revisão navega pelo número, então uma divergência mandaria a pessoa para a
 * etapa errada sem erro nenhum.
 *
 * O gate trava a NAVEGAÇÃO, nunca a gravação. O autosave continua salvando
 * estados incompletos (é o que permite fechar o navegador no meio e voltar
 * depois); o que ele não faz é deixar seguir adiante com o essencial em branco.
 */

export const ETAPAS = ['Projeto', 'Marca', 'Estrutura', 'Mídia e produtos', 'Revisão'] as const;

export const ETAPA = {
  projeto: 0,
  marca: 1,
  estrutura: 2,
  midia: 3,
  revisao: 4,
} as const;

export type Pendencia = {
  etapa: number;
  /** O que fazer, na voz de quem lê. Nunca vazio: é o texto do botão travado. */
  mensagem: string;
};

export type DadosDasEtapas = {
  nome: string;
  kitId: string | null;
  brandName: string;
  secoes: readonly { nome: string }[];
  produtos: readonly { nome: string }[];
};

const ordinal = (i: number): string => `${i + 1}ª`;

/**
 * O que falta nesta etapa. Lista vazia libera o avanço.
 *
 * O que NÃO entra aqui, de propósito: seção sem peça (é a forma de pedir uma
 * seção criada no estilo do kit), seção sem texto (é a forma de delegar o
 * conteúdo) e mídia (a etapa se anuncia como opcional). Travar por essas seria
 * confundir "não preenchido" com "escolhido em branco".
 */
export const pendenciasDaEtapa = (etapa: number, d: DadosDasEtapas): Pendencia[] => {
  const p: Pendencia[] = [];
  const falta = (mensagem: string): void => {
    p.push({ etapa, mensagem });
  };

  if (etapa === ETAPA.projeto) {
    if (d.nome.trim() === '') falta('Dê um nome ao projeto.');
    if (d.kitId === null) falta('Escolha o kit que vai servir de base visual.');
  }

  if (etapa === ETAPA.marca) {
    if (d.brandName.trim() === '') {
      falta('Escreva o nome da marca. Ele aparece no site inteiro.');
    }
  }

  if (etapa === ETAPA.estrutura) {
    if (d.secoes.length === 0) {
      falta('Seu site precisa de pelo menos uma seção.');
    }
    const semNome = d.secoes.findIndex((s) => s.nome.trim() === '');
    if (semNome !== -1) {
      falta(`A ${ordinal(semNome)} seção está sem nome.`);
    }
  }

  if (etapa === ETAPA.midia) {
    // Produto sem nome não é só feio: `Produto.nome` exige texto, e o conteúdo
    // do projeto inteiro é validado de uma vez na leitura. Um produto em branco
    // derruba a validação e leva junto tudo o que estava escrito.
    const semNome = d.produtos.findIndex((x) => x.nome.trim() === '');
    if (semNome !== -1) {
      falta(`O ${ordinal(semNome)} produto está sem nome.`);
    }
  }

  return p;
};

export const podeAvancar = (etapa: number, d: DadosDasEtapas): boolean =>
  pendenciasDaEtapa(etapa, d).length === 0;

/**
 * Até onde dá para navegar: a primeira etapa que ainda tem pendência.
 *
 * Um projeto salvo pela metade reabre com todas as etapas visitadas, e é este
 * teto que volta a trancar o que de fato ficou incompleto.
 */
export const maiorEtapaLiberada = (d: DadosDasEtapas): number => {
  for (let i = 0; i < ETAPAS.length; i++) {
    if (pendenciasDaEtapa(i, d).length > 0) return i;
  }
  return ETAPAS.length - 1;
};
