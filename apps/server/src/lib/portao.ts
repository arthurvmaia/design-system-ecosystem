import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * O portão do Orbis: a credencial que separa quem pode usar este servidor de
 * quem só achou a URL.
 *
 * ## Onde a senha mora, e por que não aqui
 *
 * Ela mora em `ORBIS_SENHA`, variável de ambiente do SERVIDOR. Nunca no código,
 * nunca no bundle do navegador, nunca num arquivo versionado — este repositório
 * é público, e senha em repositório público é senha vazada no minuto seguinte,
 * inclusive depois de apagada (o histórico do git guarda).
 *
 * O navegador nunca recebe a senha nem nada derivado dela: ele manda o que a
 * pessoa digitou e recebe de volta um cookie assinado, que só diz "esta sessão
 * passou". Quem ler o JavaScript do app não encontra credencial nenhuma.
 *
 * ## Quando o portão está de pé
 *
 * - `ORBIS_SENHA` definida → portão ativo, sempre.
 * - Sem `ORBIS_SENHA`, em desenvolvimento → portão desligado. É a sua máquina,
 *   e trancar o localhost só ensinaria a contornar.
 * - Sem `ORBIS_SENHA`, em produção → portão FECHADO, e ninguém entra. Um
 *   servidor publicado que esqueceu a senha não pode abrir para todo mundo: o
 *   erro cai sobre quem publicou, e não sobre a conta de quem paga.
 */

export type EstadoDoPortao = 'ativo' | 'desligado' | 'sem-credencial';

/**
 * Duas senhas, dois níveis.
 *
 * `admin` (`ORBIS_SENHA`) é você: o app inteiro, todos os botões.
 * `visita` (`ORBIS_SENHA_VISITA`) é quem você convidou para OLHAR. Vê tudo,
 * navega tudo, e não muda nada: o servidor recusa qualquer escrita.
 *
 * Existe porque o túnel expõe o sistema REAL. Sem esta separação, "dá uma olhada
 * no app" e "apaga uma captura minha sem querer" são o mesmo clique. A tranca
 * fica no SERVIDOR e não na interface — esconder o botão não impede ninguém de
 * chamar a rota, e uma tranca que só existe na tela não é tranca.
 *
 * `ORBIS_SENHA_VISITA` é opcional. Sem ela, existe só o nível admin, e o app se
 * comporta como antes.
 */
export type NivelDeAcesso = 'admin' | 'visita';

const ehProducao = (): boolean => process.env.NODE_ENV === 'production';

const naoVazia = (v: string | undefined): string | null =>
  typeof v === 'string' && v !== '' ? v : null;

const senhaConfigurada = (): string | null => naoVazia(process.env.ORBIS_SENHA);
const senhaDeVisita = (): string | null => naoVazia(process.env.ORBIS_SENHA_VISITA);

export const estadoDoPortao = (): EstadoDoPortao => {
  if (senhaConfigurada() !== null) return 'ativo';
  return ehProducao() ? 'sem-credencial' : 'desligado';
};

/** O nível de visita está configurado neste servidor? */
export const temNivelDeVisita = (): boolean => senhaDeVisita() !== null;

/** Comparação de tempo constante sobre HMAC dos dois lados. */
const igual = (tentativa: string, esperada: string): boolean => {
  // `timingSafeEqual` exige o mesmo tamanho. Comparar o comprimento antes
  // vazaria justamente o comprimento, então os dois lados viram um HMAC de
  // tamanho fixo e a comparação acontece sobre ele.
  const chave = segredoDeSessao();
  const ha = createHmac('sha256', chave).update(Buffer.from(tentativa, 'utf8')).digest();
  const hb = createHmac('sha256', chave).update(Buffer.from(esperada, 'utf8')).digest();
  return timingSafeEqual(ha, hb);
};

/**
 * Que nível esta senha abre? `null` quando não abre nenhum.
 *
 * A senha de admin é conferida PRIMEIRO. Se alguém configurar as duas iguais
 * (por descuido), o acesso maior vence — o contrário daria a você mesmo uma
 * sessão capada sem explicação.
 *
 * As duas são sempre conferidas, mesmo depois de a primeira bater: sair cedo
 * faria o tempo de resposta dizer QUAL das duas foi digitada.
 */
export const nivelDaSenha = (tentativa: string): NivelDeAcesso | null => {
  const admin = senhaConfigurada();
  const visita = senhaDeVisita();
  const ehAdmin = admin !== null && igual(tentativa, admin);
  const ehVisita = visita !== null && igual(tentativa, visita);
  if (ehAdmin) return 'admin';
  if (ehVisita) return 'visita';
  return null;
};

/** A senha bate em algum nível? Mantido para quem só quer o sim ou não. */
export const senhaConfere = (tentativa: string): boolean => nivelDaSenha(tentativa) !== null;

/**
 * O segredo que assina o cookie de sessão.
 *
 * De `ORBIS_SEGREDO` quando existe; senão, um valor sorteado no boot. O sorteio
 * tem uma consequência declarada: reiniciar o servidor invalida as sessões
 * abertas, e todo mundo digita a senha de novo. Para um app de time pequeno
 * isso é aceitável; para não ser, basta definir a variável.
 */
let segredoSorteado: string | null = null;
const segredoDeSessao = (): string => {
  const doAmbiente = process.env.ORBIS_SEGREDO;
  if (typeof doAmbiente === 'string' && doAmbiente !== '') return doAmbiente;
  if (segredoSorteado === null) segredoSorteado = randomBytes(32).toString('hex');
  return segredoSorteado;
};

/** Quanto tempo uma sessão dura. Uma semana: o sócio testa sem redigitar todo dia. */
export const DURACAO_DA_SESSAO_S = 7 * 24 * 60 * 60;

/**
 * O valor do cookie: `<expira em segundos>.<nível>.<assinatura>`.
 *
 * Os dois campos viajam ASSINADOS. É o que impede as duas fraudes óbvias:
 * esticar o prazo e promover-se de `visita` para `admin` editando o cookie.
 */
export const assinarSessao = (expiraEmS: number, nivel: NivelDeAcesso): string => {
  const corpo = `${expiraEmS}.${nivel}`;
  const assinatura = createHmac('sha256', segredoDeSessao()).update(corpo).digest('hex');
  return `${corpo}.${assinatura}`;
};

/** O nível desta sessão, ou `null` se ela não vale. */
export const nivelDaSessao = (cookie: string | undefined, agoraS: number): NivelDeAcesso | null => {
  if (cookie === undefined || cookie === '') return null;
  const partes = cookie.split('.');
  if (partes.length !== 3) return null;
  const [bruto, nivel] = partes;
  const expira = Number(bruto);
  if (!Number.isFinite(expira) || expira <= agoraS) return null;
  if (nivel !== 'admin' && nivel !== 'visita') return null;
  const esperado = assinarSessao(expira, nivel);
  const a = Buffer.from(cookie, 'utf8');
  const b = Buffer.from(esperado, 'utf8');
  if (a.length !== b.length) return null;
  return timingSafeEqual(a, b) ? nivel : null;
};

export const sessaoValida = (cookie: string | undefined, agoraS: number): boolean =>
  nivelDaSessao(cookie, agoraS) !== null;

export const NOME_DO_COOKIE = 'orbis_sessao';

/**
 * O `Set-Cookie` da sessão.
 *
 * `HttpOnly` para o JavaScript da página não conseguir ler (nem o do app, nem o
 * de um script injetado). `SameSite=None; Secure` quando o app e a API moram em
 * domínios diferentes — que é exatamente o caso de front na Vercel e servidor
 * noutro lugar, e sem isso o navegador descarta o cookie sem avisar.
 */
export const cookieDeSessao = (opts: {
  valor: string;
  maxAgeS: number;
  origemCruzada: boolean;
  /** A conexão chegou por HTTPS? Pelo túnel, sim; em `localhost`, não. */
  seguro?: boolean;
  /**
   * Cookie de SESSÃO: sem `Max-Age`, o navegador o descarta ao fechar.
   *
   * É o que faz "fechei o link" virar "preciso da credencial de novo" sem
   * depender de o JavaScript da página conseguir avisar o servidor — e ele
   * frequentemente não consegue, porque a aba morre antes de a requisição sair.
   * A tranca não pode depender de uma despedida educada.
   */
  duraSoAteFechar?: boolean;
}): string => {
  const partes = [`${NOME_DO_COOKIE}=${opts.valor}`, 'HttpOnly', 'Path=/'];
  // Apagar o cookie exige `Max-Age=0` explícito, mesmo no modo sessão.
  if (!opts.duraSoAteFechar || opts.maxAgeS === 0) partes.push(`Max-Age=${opts.maxAgeS}`);
  // `SameSite=None` EXIGE `Secure`, e `Secure` em http é descartado. Por isso os
  // dois andam juntos, e `Secure` sozinho entra sempre que a conexão for HTTPS
  // — pelo túnel ela é, mesmo com o app e a API na mesma origem.
  if (opts.origemCruzada) partes.push('SameSite=None', 'Secure');
  else {
    partes.push('SameSite=Lax');
    if (opts.seguro === true) partes.push('Secure');
  }
  return partes.join('; ');
};

// ── A segunda tranca: as ações que custam dinheiro ──────────────────────────

/**
 * Extrair um site e gerar outro são as duas operações que gastam.
 *
 * Todo o resto do app é barato: navegar, curtir, montar kit, escrever texto.
 * Essas duas põem uma máquina para trabalhar por minutos e, no modo `api`,
 * consomem crédito de quem paga a conta. Entrar no app e disparar um gasto são
 * decisões de peso diferente, e uma sessão aberta não devia autorizar as duas.
 *
 * Por isso a credencial é pedida NA HORA, a cada disparo, e não vira sessão. O
 * atrito é o ponto: é o que separa "cliquei sem querer" de "eu quis".
 *
 * `ORBIS_SENHA_ACAO` é opcional. Sem ela esta tranca não existe e o app se
 * comporta como antes — quem já entrou, dispara.
 */

/** O cabeçalho onde a credencial da ação viaja. Nunca na URL: URL vai para log. */
export const CABECALHO_DA_ACAO = 'x-orbis-acao';

export const senhaDeAcaoConfere = (tentativa: string | undefined): boolean => {
  const esperada = naoVazia(process.env.ORBIS_SENHA_ACAO);
  if (esperada === null) return true; // tranca desligada
  if (tentativa === undefined || tentativa === '') return false;
  return igual(tentativa, esperada);
};

/**
 * Este método MUDA alguma coisa?
 *
 * A lista de leitura é fechada de propósito. Um método desconhecido conta como
 * escrita: a dúvida tem de cair para o lado que não estraga o acervo de
 * ninguém.
 */
export const ehLeitura = (metodo: string): boolean =>
  metodo === 'GET' || metodo === 'HEAD' || metodo === 'OPTIONS';

/** Lê o cookie da sessão do cabeçalho bruto. */
export const lerCookieDaSessao = (cabecalho: string | undefined): string | undefined => {
  if (cabecalho === undefined) return undefined;
  for (const parte of cabecalho.split(';')) {
    const [nome, ...resto] = parte.trim().split('=');
    if (nome === NOME_DO_COOKIE) return resto.join('=');
  }
  return undefined;
};
