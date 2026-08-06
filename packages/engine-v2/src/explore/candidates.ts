import { type ElementDescriptor, ehCandidatoInterativo, ehSeguroClicar } from '@ds/explorer';
import type { NormalizedBox, SafeActionKind } from '@ds/shared';

/**
 * Descoberta de candidatos interativos — função pura.
 *
 * A regra do pedido é dupla: **não clicar aleatoriamente em coordenadas** e
 * **priorizar candidatos com evidência real**. O V1 acertava a primeira metade e
 * errava a segunda: ele ordenava por uma pontuação de ARIA/semântica e ia
 * descendo a lista até o orçamento acabar — sem nunca usar o que a varredura de
 * ponteiro tinha descoberto (porque não havia varredura).
 *
 * Aqui a evidência de que o elemento REAGIU pesa mais que qualquer atributo:
 * um `<div>` sem ARIA que mudou de transform quando o ponteiro passou é um
 * candidato melhor que um `<button>` decorativo.
 *
 * A política de segurança é a do V1, reusada de propósito (`ehSeguroClicar`) —
 * ela já foi testada e cobre compra/logout/submit/download/navegação externa.
 * O V2 acrescenta a lista de ações NOMEADAS e as barreiras que o V1 não tinha
 * (clipboard, permissões, protocolo externo, alteração persistente).
 */

/** Sinais que a coleta in-page entrega sobre um candidato. */
export type SinaisCandidato = {
  /** Hash do fingerprint. */
  hash: string;
  /** Descritor no formato do V1 — para reusar as guardas de segurança já testadas. */
  descriptor: ElementDescriptor;
  /** O elemento reagiu durante a varredura de ponteiro? */
  reagiuAoPonteiro: boolean;
  /** Fração de pixels que mudou quando o ponteiro passou. */
  deltaPonteiro: number;
  /** Está dentro de Shadow DOM aberto. */
  emShadow: boolean;
  /** Está visível na viewport atual. */
  visivel: boolean;
  /** Área que ocupa, em fração da viewport. */
  areaShare: number;
  /** Papel ARIA de controle detectado (`tab`, `menuitem`, …). */
  controlePor: string | null;
  /** Tem `aria-controls` apontando para um alvo existente. */
  controlaAlvoExistente: boolean;
};

/** Uma região de canvas que reagiu ao ponteiro, sem DOM por baixo. */
export type RegiaoReativa = {
  id: string;
  regiao: NormalizedBox;
  delta: number;
  /** Hash do canvas/cena dona da região. */
  cena: string;
};

export type Candidato = {
  hash: string;
  descriptor: ElementDescriptor;
  /** Pontuação de prioridade — maior primeiro. */
  score: number;
  /** Por que este elemento é candidato (auditável). */
  evidencias: string[];
  /** Ações a tentar, na ordem. */
  acoes: SafeActionKind[];
  /** Ações barradas e por quê (log seguro). */
  barradas: Array<{ acao: SafeActionKind; motivo: string }>;
};

/**
 * Ações que a política permite executar. A lista é FECHADA de propósito: o motor
 * só faz o que está aqui, e o que não está nem é tentado.
 */
const REVERSIVEIS: ReadonlySet<SafeActionKind> = new Set<SafeActionKind>([
  'abrir-menu',
  'fechar-menu',
  'abrir-submenu',
  'expandir-accordion',
  'recolher-accordion',
  'trocar-tab',
  'abrir-modal',
  'fechar-modal',
  'avancar-carousel',
  'voltar-carousel',
  'abrir-tooltip',
  'alternar-tema',
  'pausar-animacao',
  'iniciar-animacao',
  'focar-campo',
  'revelar-conteudo',
  'alternar-switch',
  'hover',
  'teclado',
]);

export const acaoEhReversivel = (a: SafeActionKind): boolean => REVERSIVEIS.has(a);

/**
 * Barreiras que o V1 não tinha. Cada uma é um verbo/atributo que denuncia efeito
 * fora da página — clipboard, permissão de dispositivo, protocolo externo,
 * instalação, alteração persistente.
 */
const PADROES_BARRADOS: Array<{ re: RegExp; motivo: string }> = [
  { re: /\b(copiar|copy to clipboard|copy code)\b/i, motivo: 'clipboard' },
  { re: /\b(permitir|allow|habilitar notifica|enable notifications)\b/i, motivo: 'permissao' },
  { re: /\b(usar minha localiza|use my location|compartilhar local)\b/i, motivo: 'geolocalizacao' },
  { re: /\b(abrir c[âa]mera|open camera|tirar foto)\b/i, motivo: 'camera' },
  { re: /\b(gravar [áa]udio|usar microfone|record audio)\b/i, motivo: 'microfone' },
  { re: /\b(instalar|install|add to home)\b/i, motivo: 'instalacao' },
  { re: /\b(abrir no app|open in app|abrir aplicativo)\b/i, motivo: 'abrir-aplicativo' },
  {
    re: /\b(salvar altera|save changes|aplicar|apply changes)\b/i,
    motivo: 'alteracao-persistente',
  },
  { re: /\b(enviar mensagem|send message|responder|reply)\b/i, motivo: 'envio-mensagem' },
];

/** Protocolos que nunca devem ser acionados como navegação. */
const PROTO_EXTERNO =
  /^(mailto:|tel:|sms:|whatsapp:|intent:|market:|itms-apps:|javascript:|file:|data:|blob:)/i;

/**
 * A ação nomeada que este elemento provavelmente realiza. Sai de evidência
 * declarada (ARIA/`data-*`/role), não de palpite sobre a classe — um nome de
 * classe pode dizer "modal" e ser o gatilho, não o modal.
 */
export const acoesProvaveis = (s: SinaisCandidato): SafeActionKind[] => {
  const d = s.descriptor;
  const out: SafeActionKind[] = [];
  const dataKeys = Object.keys(d.dataAttrs).join(' ').toLowerCase();
  const texto = `${d.text} ${d.ariaLabel ?? ''}`.toLowerCase();

  // Hover primeiro: nunca tem efeito colateral e revela tooltip/submenu.
  out.push('hover');

  if (d.ariaExpanded !== null) {
    // `aria-expanded` é o sinal mais confiável que existe para abrir/fechar.
    const aberto = d.ariaExpanded === 'true';
    if (/menu|nav/.test(`${d.role ?? ''} ${dataKeys} ${texto}`)) {
      out.push(aberto ? 'fechar-menu' : 'abrir-menu');
    } else if (/accordion|collapse|sanfona|details/.test(`${dataKeys} ${d.classes.join(' ')}`)) {
      out.push(aberto ? 'recolher-accordion' : 'expandir-accordion');
    } else {
      out.push('revelar-conteudo');
    }
  }
  if (d.tag === 'summary' || d.tag === 'details') {
    out.push('expandir-accordion');
  }
  if (d.role === 'tab' || /\btab\b/.test(dataKeys)) out.push('trocar-tab');
  if (d.ariaHaspopup === 'dialog' || /\bmodal|dialog|lightbox\b/.test(dataKeys)) {
    out.push('abrir-modal');
  }
  if (d.ariaHaspopup === 'menu' || d.role === 'menuitem') out.push('abrir-submenu');
  if (/tooltip/.test(`${d.role ?? ''} ${dataKeys}`)) out.push('abrir-tooltip');
  if (/carousel|slider|swiper|splide|embla/.test(dataKeys)) {
    // Direção: `next`/`prev` costuma estar no rótulo acessível ou no data.
    if (/prev|anterior|voltar|back/.test(texto) || /prev/.test(dataKeys))
      out.push('voltar-carousel');
    else out.push('avancar-carousel');
  }
  if (d.role === 'switch' || /\btheme|tema|dark|light\b/.test(`${dataKeys} ${texto}`)) {
    out.push(
      /\btheme|tema|dark|light\b/.test(`${dataKeys} ${texto}`)
        ? 'alternar-tema'
        : 'alternar-switch',
    );
  }
  if (/\b(pause|pausar|play|reproduzir)\b/.test(texto)) {
    out.push(/pause|pausar/.test(texto) ? 'pausar-animacao' : 'iniciar-animacao');
  }
  if (d.tag === 'input' || d.tag === 'textarea' || d.tag === 'select') out.push('focar-campo');

  // Nenhuma ação nomeada, mas há evidência de interatividade: revelar conteúdo é
  // a hipótese neutra — clicar e ver o que muda, sem afirmar o que é.
  if (out.length === 1 && (d.cursor === 'pointer' || d.hasListeners || s.reagiuAoPonteiro)) {
    out.push('revelar-conteudo');
  }
  if (d.tabindex !== null && d.tabindex >= 0 && !out.includes('teclado')) out.push('teclado');

  return [...new Set(out)];
};

/** O href leva ao MESMO documento (só muda o fragmento)? */
const ehSoFragmento = (href: string, baseUrl: string): boolean => {
  if (href.startsWith('#')) return true;
  try {
    const destino = new URL(href, baseUrl);
    const atual = new URL(baseUrl);
    return (
      destino.origin === atual.origin &&
      destino.pathname === atual.pathname &&
      destino.search === atual.search &&
      destino.hash.length > 0
    );
  } catch {
    return false;
  }
};

/**
 * Filtra as ações pela política de segurança. Reusa `ehSeguroClicar` do V1 para
 * as ações que envolvem clique e acrescenta as barreiras novas.
 *
 * `hover`, `focar-campo` (sem preencher) e `teclado` (setas/Escape/Tab) não
 * passam pelo teste de clique — são reversíveis por natureza. `focar-campo` em
 * campo sensível é barrado mesmo assim: focar um `<input type=file>` pode abrir o
 * seletor de arquivo em alguns navegadores.
 */
export const filtrarAcoes = (
  s: SinaisCandidato,
  acoes: readonly SafeActionKind[],
  baseUrl: string,
): { permitidas: SafeActionKind[]; barradas: Array<{ acao: SafeActionKind; motivo: string }> } => {
  const d = s.descriptor;
  const permitidas: SafeActionKind[] = [];
  const barradas: Array<{ acao: SafeActionKind; motivo: string }> = [];
  const texto = `${d.text} ${d.ariaLabel ?? ''}`;

  const barreiraDeTexto = PADROES_BARRADOS.find((p) => p.re.test(texto));
  const protoExterno = d.href !== null && PROTO_EXTERNO.test(d.href);
  const vereditoClique = ehSeguroClicar(d, baseUrl);
  // Link que TROCA DE DOCUMENTO: navegar nunca é um estado DESTA página — o
  // clique destrói o contexto de execução e leva a captura junto (visto em site
  // real: item de menu same-origin derrubava o grafo inteiro). Âncora de
  // fragmento continua permitida: muda estado sem trocar documento.
  const trocaDeDocumento =
    d.tag === 'a' &&
    d.href !== null &&
    d.href.trim().length > 0 &&
    !/^javascript:/i.test(d.href) &&
    !ehSoFragmento(d.href, baseUrl);

  for (const acao of acoes) {
    if (!REVERSIVEIS.has(acao)) {
      barradas.push({ acao, motivo: 'fora da lista de ações reversíveis' });
      continue;
    }
    if (acao === 'hover') {
      permitidas.push(acao);
      continue;
    }
    if (acao === 'focar-campo') {
      if (d.tag === 'input' && (d.type === 'file' || d.type === 'password')) {
        barradas.push({ acao, motivo: 'campo-sensivel' });
      } else {
        permitidas.push(acao);
      }
      continue;
    }
    if (acao === 'teclado') {
      permitidas.push(acao);
      continue;
    }
    // As demais implicam clique.
    if (protoExterno) {
      barradas.push({ acao, motivo: 'protocolo-externo' });
      continue;
    }
    if (barreiraDeTexto !== undefined) {
      barradas.push({ acao, motivo: barreiraDeTexto.motivo });
      continue;
    }
    if (!vereditoClique.safe) {
      barradas.push({ acao, motivo: vereditoClique.motivo ?? 'clique reprovado pela política' });
      continue;
    }
    if (trocaDeDocumento) {
      barradas.push({ acao, motivo: 'navega para outro documento' });
      continue;
    }
    permitidas.push(acao);
  }

  return { permitidas, barradas };
};

/**
 * Pontuação de prioridade.
 *
 * Os pesos vêm da experiência do V1 invertida: lá, ARIA mandava e o orçamento
 * acabava antes de chegar no que importava. Aqui a EVIDÊNCIA MEDIDA vem primeiro
 * (o elemento reagiu de fato), depois a declaração explícita (`aria-expanded`,
 * `aria-controls` com alvo existente), depois a semântica, e por último os
 * palpites (cursor, classe).
 */
export const pontuarCandidato = (s: SinaisCandidato): { score: number; evidencias: string[] } => {
  const d = s.descriptor;
  const ev: string[] = [];
  let score = 0;

  if (s.reagiuAoPonteiro) {
    // Medido: o ponteiro passou e algo mudou. É a evidência mais forte que existe.
    const peso = 10 + Math.min(10, s.deltaPonteiro * 100);
    score += peso;
    ev.push(`reagiu ao ponteiro (Δ${(s.deltaPonteiro * 100).toFixed(1)}%)`);
  }
  if (d.ariaExpanded !== null) {
    score += 9;
    ev.push(`aria-expanded="${d.ariaExpanded}"`);
  }
  if (s.controlaAlvoExistente) {
    score += 8;
    ev.push('aria-controls aponta para um alvo presente');
  }
  if (d.ariaHaspopup !== null) {
    score += 7;
    ev.push(`aria-haspopup="${d.ariaHaspopup}"`);
  }
  if (s.controlePor !== null) {
    score += 6;
    ev.push(`role="${s.controlePor}"`);
  }
  if (d.tag === 'summary' || d.tag === 'details') {
    score += 5;
    ev.push('<details>/<summary> nativo');
  }
  const dataDeIntencao = Object.keys(d.dataAttrs).filter((k) =>
    /toggle|tab|accordion|modal|dropdown|menu|carousel|slide|state|open|collapse/i.test(k),
  );
  if (dataDeIntencao.length > 0) {
    score += 5;
    ev.push(`data-* de intenção: ${dataDeIntencao.slice(0, 3).join(', ')}`);
  }
  if (d.hasListeners) {
    const relevantes = d.listenerTypes.filter((t) => /click|pointer|mouse|key|touch/.test(t));
    if (relevantes.length > 0) {
      score += 4;
      ev.push(`listeners: ${relevantes.slice(0, 4).join(', ')}`);
    }
  }
  if (d.tag === 'button' || d.tag === 'a') {
    score += 3;
    ev.push(`<${d.tag}>`);
  }
  if (s.emShadow) {
    score += 2;
    ev.push('dentro de Shadow DOM aberto');
  }
  if (d.cursor === 'pointer') {
    score += 2;
    ev.push('cursor: pointer');
  }
  if (s.visivel) {
    score += 2;
    ev.push('visível na viewport');
  }
  // Área muito grande com pouca evidência costuma ser o container, não o controle.
  if (s.areaShare > 0.5 && score < 8) {
    score -= 3;
    ev.push('área grande com pouca evidência (provável container)');
  }

  return { score, evidencias: ev };
};

/**
 * Monta e ordena os candidatos. Descarta quem não tem NENHUMA evidência — é o
 * que impede o motor de tentar interagir com o documento inteiro.
 */
export const descobrirCandidatos = (
  sinais: readonly SinaisCandidato[],
  baseUrl: string,
  limite = 200,
): Candidato[] => {
  const out: Candidato[] = [];
  for (const s of sinais) {
    // Piso de INTERAÇÃO, não de existência. O piso antigo (score >= 2) não
    // filtrava nada, porque "visível" sozinho já valia 2: medido no acervo, o
    // pool tinha 160 a 283 elementos com 93 a 232 EMPATADOS no score mínimo, e
    // o corte de 120 era decidido pela ordem do DOM — sistematicamente o topo
    // da página. A porta é a mesma política testada do V1: tag/role/tabindex/
    // ARIA/cursor com conteúdo/listener relevante — mais quem provou reação na
    // varredura de ponteiro, que nenhum atributo anuncia.
    if (!ehCandidatoInterativo(s.descriptor) && !s.reagiuAoPonteiro) continue;
    const { score, evidencias } = pontuarCandidato(s);
    if (score < 2 || evidencias.length === 0) continue;
    const provaveis = acoesProvaveis(s);
    const { permitidas, barradas } = filtrarAcoes(s, provaveis, baseUrl);
    // Só hover não justifica um nó no grafo de estados; mas o candidato continua
    // válido para a varredura de ponteiro registrar a reação.
    out.push({
      hash: s.hash,
      descriptor: s.descriptor,
      score,
      evidencias,
      acoes: permitidas,
      barradas,
    });
  }
  out.sort((a, b) => b.score - a.score);
  return out.slice(0, limite);
};

/**
 * Regiões de canvas que reagiram viram candidatos SEM DOM. O pedido é explícito:
 * "não finja que existe um botão DOM dentro de canvas quando isso não for
 * verdade". Elas não entram no grafo de estados como clique — entram como área
 * reativa registrada, com coordenada normalizada e confiança.
 */
export const candidatosSemDom = (regioes: readonly RegiaoReativa[]): RegiaoReativa[] =>
  [...regioes].sort((a, b) => b.delta - a.delta);
