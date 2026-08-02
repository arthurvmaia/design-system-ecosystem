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

const ehProducao = (): boolean => process.env.NODE_ENV === 'production';

const senhaConfigurada = (): string | null => {
  const s = process.env.ORBIS_SENHA;
  return typeof s === 'string' && s !== '' ? s : null;
};

export const estadoDoPortao = (): EstadoDoPortao => {
  if (senhaConfigurada() !== null) return 'ativo';
  return ehProducao() ? 'sem-credencial' : 'desligado';
};

/**
 * A senha bate?
 *
 * Comparação de tempo constante. Um `===` vaza o tamanho e o prefixo da senha
 * pelo tempo de resposta, e é o tipo de detalhe que ninguém percebe faltando.
 * Fora do estado `ativo` a resposta é sempre `false`: sem credencial no
 * servidor não existe senha certa.
 */
export const senhaConfere = (tentativa: string): boolean => {
  const esperada = senhaConfigurada();
  if (esperada === null) return false;
  const a = Buffer.from(tentativa, 'utf8');
  const b = Buffer.from(esperada, 'utf8');
  // `timingSafeEqual` exige o mesmo tamanho. Comparar o comprimento antes
  // vazaria justamente o comprimento, então os dois lados viram um HMAC de
  // tamanho fixo e a comparação acontece sobre ele.
  const chave = segredoDeSessao();
  const ha = createHmac('sha256', chave).update(a).digest();
  const hb = createHmac('sha256', chave).update(b).digest();
  return timingSafeEqual(ha, hb);
};

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
 * O valor do cookie: `<expira em segundos>.<assinatura>`.
 *
 * A validade viaja junto e é ASSINADA, então esticar o prazo pela metade do
 * caminho quebra a assinatura. Sem isso, um cookie roubado valeria para sempre.
 */
export const assinarSessao = (expiraEmS: number): string => {
  const assinatura = createHmac('sha256', segredoDeSessao())
    .update(String(expiraEmS))
    .digest('hex');
  return `${expiraEmS}.${assinatura}`;
};

export const sessaoValida = (cookie: string | undefined, agoraS: number): boolean => {
  if (cookie === undefined || cookie === '') return false;
  const ponto = cookie.indexOf('.');
  if (ponto <= 0) return false;
  const expira = Number(cookie.slice(0, ponto));
  if (!Number.isFinite(expira) || expira <= agoraS) return false;
  const esperado = assinarSessao(expira);
  const a = Buffer.from(cookie, 'utf8');
  const b = Buffer.from(esperado, 'utf8');
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
};

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
}): string => {
  const partes = [
    `${NOME_DO_COOKIE}=${opts.valor}`,
    'HttpOnly',
    'Path=/',
    `Max-Age=${opts.maxAgeS}`,
  ];
  if (opts.origemCruzada) partes.push('SameSite=None', 'Secure');
  else partes.push('SameSite=Lax');
  return partes.join('; ');
};

/** Lê o cookie da sessão do cabeçalho bruto. */
export const lerCookieDaSessao = (cabecalho: string | undefined): string | undefined => {
  if (cabecalho === undefined) return undefined;
  for (const parte of cabecalho.split(';')) {
    const [nome, ...resto] = parte.trim().split('=');
    if (nome === NOME_DO_COOKIE) return resto.join('=');
  }
  return undefined;
};
