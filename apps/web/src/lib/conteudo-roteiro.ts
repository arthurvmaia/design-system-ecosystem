import type { SectionRole } from '@ds/shared/schemas';

/**
 * O ROTEIRO de conteúdo de cada seção: em vez de um textão genérico, cada
 * papel pergunta exatamente o que precisa. `null` = a seção não pede conteúdo
 * (usa a marca, o contato e as redes). Um teste garante a cobertura de todos
 * os papéis — seção nova sem roteiro quebra antes de chegar na tela.
 */

export type CampoDeBrief = 'mensagem' | 'pontos' | 'provas' | 'cta';

export type RoteiroDaSecao = {
  campos: CampoDeBrief[];
  dica: Partial<Record<CampoDeBrief, { label: string; placeholder: string }>>;
} | null;

const d = (label: string, placeholder: string) => ({ label, placeholder });

export const ROTEIRO_POR_SECAO: Record<SectionRole, RoteiroDaSecao> = {
  nav: null,
  footer: null,
  hero: {
    campos: ['mensagem', 'cta'],
    dica: {
      mensagem: d('A promessa central', 'o que sua marca resolve, em uma ou duas frases'),
      cta: d('Chamada da abertura', 'ex.: Comece grátis (vazio = usa o CTA principal)'),
    },
  },
  logos: {
    campos: ['provas'],
    dica: { provas: d('Quem confia (um por linha)', 'ex.: Empresa X\nSelo Y') },
  },
  features: {
    campos: ['mensagem', 'pontos'],
    dica: {
      mensagem: d('O que esta parte precisa dizer', 'a ideia que amarra os recursos'),
      pontos: d('Um recurso por linha', 'ex.: Relatórios em tempo real — veja tudo num painel'),
    },
  },
  showcase: {
    campos: ['mensagem'],
    dica: { mensagem: d('O que está sendo mostrado', 'o que a pessoa deve perceber ao ver') },
  },
  stats: {
    campos: ['provas'],
    dica: { provas: d('Um número por linha', 'ex.: 1.200 clientes\n98% de satisfação') },
  },
  pricing: {
    campos: ['pontos'],
    dica: {
      pontos: d('Um plano por linha', 'ex.: Essencial — R$49/mês — para quem está começando'),
    },
  },
  testimonials: {
    campos: ['provas'],
    dica: {
      provas: d('Um depoimento por linha', 'ex.: "Mudou nossa operação" — Ana, Diretora'),
    },
  },
  faq: {
    campos: ['pontos'],
    dica: {
      pontos: d('Uma pergunta por linha', 'ex.: Posso cancelar quando quiser? — Sim, sem multa'),
    },
  },
  about: {
    campos: ['mensagem'],
    dica: { mensagem: d('A história em poucas frases', 'quem é, por que existe, para quem') },
  },
  team: {
    campos: ['pontos'],
    dica: { pontos: d('Uma pessoa por linha', 'ex.: Marina — fundadora') },
  },
  gallery: {
    campos: ['mensagem'],
    dica: { mensagem: d('O que a galeria conta', 'o fio que liga os trabalhos mostrados') },
  },
  catalog: {
    campos: ['pontos'],
    dica: { pontos: d('Um produto por linha', 'ex.: Caneca esmaltada — R$59') },
  },
  contact: {
    campos: ['mensagem'],
    dica: { mensagem: d('Convite ao contato', 'ex.: Fale com a gente — respondemos no mesmo dia') },
  },
  cta: {
    campos: ['mensagem', 'cta'],
    dica: {
      mensagem: d('O empurrão final', 'a última frase antes da pessoa decidir'),
      cta: d('Texto do botão', 'vazio = usa o CTA principal'),
    },
  },
};
