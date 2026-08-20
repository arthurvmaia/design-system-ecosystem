import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import {
  DURACAO_DA_SESSAO_S,
  assinarSessao,
  cookieDeSessao,
  ehLeitura,
  estadoDoPortao,
  lerCookieDaSessao,
  nivelDaSenha,
  nivelDaSessao,
  senhaConfere,
  senhaDeAcaoConfere,
  sessaoValida,
  temNivelDeVisita,
  trancaDeAcaoAtiva,
} from './portao.js';

/**
 * O portão que separa quem pode usar este servidor de quem só achou a URL.
 *
 * O caso que mais importa aqui é o do meio: servidor PUBLICADO e sem credencial
 * configurada. Abrir nesse caso seria o pior dos mundos — a conta de quem paga
 * fica exposta por um esquecimento de quem publicou.
 */

const ambienteOriginal = { ...process.env };
afterEach(() => {
  process.env.ORBIS_SENHA = ambienteOriginal.ORBIS_SENHA;
  process.env.ORBIS_SENHA_VISITA = ambienteOriginal.ORBIS_SENHA_VISITA;
  process.env.ORBIS_SEGREDO = ambienteOriginal.ORBIS_SEGREDO;
  process.env.NODE_ENV = ambienteOriginal.NODE_ENV;
  process.env.ORBIS_LOCAL = ambienteOriginal.ORBIS_LOCAL;
  process.env.ORBIS_SENHA_ACAO = ambienteOriginal.ORBIS_SENHA_ACAO;
});

test('sem credencial em produção o portão FECHA, não abre', () => {
  process.env.ORBIS_SENHA = '';
  process.env.NODE_ENV = 'production';
  assert.equal(estadoDoPortao(), 'sem-credencial');
  // E nenhuma senha confere: sem credencial no servidor não existe senha certa.
  assert.equal(senhaConfere(''), false);
  assert.equal(senhaConfere('qualquer'), false);
});

/**
 * O caso que o desenho existia para proteger, e que nunca acontecia.
 *
 * A regra era "em desenvolvimento, desligado", e desenvolvimento era
 * `NODE_ENV !== 'production'`. Como NADA neste repositório define `NODE_ENV`, um
 * servidor publicado por túnel sem senha caía em "desenvolvimento" e servia o
 * acervo inteiro para quem achasse o endereço.
 */
test('PROVA: sem senha e sem NODE_ENV, o portao FECHA em vez de abrir', () => {
  process.env.ORBIS_SENHA = '';
  process.env.ORBIS_LOCAL = '';
  process.env.NODE_ENV = undefined;
  assert.equal(estadoDoPortao(), 'sem-credencial');
});

test('sem credencial, a maquina local abre quando DECLARADA', () => {
  process.env.ORBIS_SENHA = '';
  process.env.NODE_ENV = 'development';
  process.env.ORBIS_LOCAL = '1';
  // É a sua máquina, e você disse isso. Trancar o localhost só ensinaria a
  // contornar — mas quem trabalha nele afirma que é ele, em vez de o servidor
  // adivinhar.
  assert.equal(estadoDoPortao(), 'desligado');
});

test('ORBIS_LOCAL nao abre um servidor declarado como producao', () => {
  process.env.ORBIS_SENHA = '';
  process.env.ORBIS_LOCAL = '1';
  process.env.NODE_ENV = 'production';
  assert.equal(estadoDoPortao(), 'sem-credencial', 'producao vence a declaracao de local');
});

test('com credencial o portão está ativo nos dois ambientes', () => {
  process.env.ORBIS_SENHA = 'uma-senha';
  process.env.NODE_ENV = 'development';
  assert.equal(estadoDoPortao(), 'ativo');
  process.env.NODE_ENV = 'production';
  assert.equal(estadoDoPortao(), 'ativo');
});

test('a senha certa entra, a errada não, e quase-certa também não', () => {
  process.env.ORBIS_SENHA = 'abertura-do-cofre';
  assert.equal(senhaConfere('abertura-do-cofre'), true);
  assert.equal(senhaConfere('abertura-do-cofr'), false);
  assert.equal(senhaConfere('abertura-do-cofre '), false);
  assert.equal(senhaConfere('ABERTURA-DO-COFRE'), false);
  assert.equal(senhaConfere(''), false);
});

test('a sessão vale até expirar, e a validade é assinada', () => {
  process.env.ORBIS_SEGREDO = 'segredo-de-teste';
  const agora = 1_000_000;
  const cookie = assinarSessao(agora + 60, 'admin');
  assert.equal(sessaoValida(cookie, agora), true);
  assert.equal(sessaoValida(cookie, agora + 61), false);

  // Esticar o prazo à mão quebra a assinatura — sem isso um cookie roubado
  // valeria para sempre.
  const esticado = `${agora + 99999}.admin.${cookie.split('.')[2]}`;
  assert.equal(sessaoValida(esticado, agora), false);
});

test('cookie forjado ou lixo não vira sessão', () => {
  process.env.ORBIS_SEGREDO = 'segredo-de-teste';
  const agora = 1_000_000;
  assert.equal(sessaoValida(undefined, agora), false);
  assert.equal(sessaoValida('', agora), false);
  assert.equal(sessaoValida('sem-ponto', agora), false);
  assert.equal(sessaoValida('.assinatura', agora), false);
  assert.equal(sessaoValida(`${agora + 60}.admin.assinatura-inventada`, agora), false);
});

test('trocar o segredo invalida as sessões abertas', () => {
  process.env.ORBIS_SEGREDO = 'primeiro';
  const cookie = assinarSessao(2_000_000, 'admin');
  process.env.ORBIS_SEGREDO = 'segundo';
  assert.equal(sessaoValida(cookie, 1_000_000), false);
});

// ── Os dois níveis ──────────────────────────────────────────────────────────

test('cada senha abre o seu nível, e a de admin vence quando as duas coincidem', () => {
  process.env.ORBIS_SENHA = 'a-do-dono';
  process.env.ORBIS_SENHA_VISITA = 'a-do-convidado';
  assert.equal(nivelDaSenha('a-do-dono'), 'admin');
  assert.equal(nivelDaSenha('a-do-convidado'), 'visita');
  assert.equal(nivelDaSenha('nenhuma-das-duas'), null);

  // Configurar as duas iguais é descuido, e o acesso MAIOR vence: o contrário
  // daria ao dono uma sessão capada sem explicação nenhuma.
  process.env.ORBIS_SENHA_VISITA = 'a-do-dono';
  assert.equal(nivelDaSenha('a-do-dono'), 'admin');
});

test('sem ORBIS_SENHA_VISITA existe só o nível admin', () => {
  process.env.ORBIS_SENHA = 'a-do-dono';
  process.env.ORBIS_SENHA_VISITA = '';
  assert.equal(temNivelDeVisita(), false);
  assert.equal(nivelDaSenha('a-do-dono'), 'admin');
  assert.equal(nivelDaSenha(''), null);
});

test('o nível viaja assinado: não dá para se promover editando o cookie', () => {
  process.env.ORBIS_SEGREDO = 'segredo-de-teste';
  const agora = 1_000_000;
  const visita = assinarSessao(agora + 60, 'visita');
  assert.equal(nivelDaSessao(visita, agora), 'visita');

  // A fraude óbvia: trocar a palavra no cookie e continuar com a assinatura.
  const promovido = visita.replace('.visita.', '.admin.');
  assert.equal(nivelDaSessao(promovido, agora), null);
});

test('leitura e escrita: a dúvida cai para o lado que não estraga nada', () => {
  assert.equal(ehLeitura('GET'), true);
  assert.equal(ehLeitura('HEAD'), true);
  assert.equal(ehLeitura('OPTIONS'), true);
  assert.equal(ehLeitura('POST'), false);
  assert.equal(ehLeitura('PATCH'), false);
  assert.equal(ehLeitura('DELETE'), false);
  // Método que ninguém previu conta como escrita.
  assert.equal(ehLeitura('PROPFIND'), false);
  assert.equal(ehLeitura('get'), false);
});

test('em HTTPS de mesma origem o cookie sai Lax e Secure', () => {
  // O caso do túnel: a Cloudflare termina o TLS, o app e a API vêm do mesmo
  // endereço. `Lax` basta (é o modo restrito) e `Secure` entra porque é HTTPS.
  const tunel = cookieDeSessao({ valor: 'v', maxAgeS: 60, origemCruzada: false, seguro: true });
  assert.match(tunel, /SameSite=Lax/);
  assert.match(tunel, /Secure/);

  // Em localhost, `Secure` faria o navegador descartar o cookie.
  const local = cookieDeSessao({ valor: 'v', maxAgeS: 60, origemCruzada: false, seguro: false });
  assert.doesNotMatch(local, /Secure/);
});

test('em origem cruzada o cookie sai com SameSite=None e Secure', () => {
  // Front na Vercel e servidor noutro domínio: sem isto o navegador descarta o
  // cookie em silêncio, e o sintoma é a senha ser aceita e a tela voltar a
  // pedir senha.
  const cruzado = cookieDeSessao({ valor: 'v', maxAgeS: 60, origemCruzada: true });
  assert.match(cruzado, /SameSite=None/);
  assert.match(cruzado, /Secure/);
  assert.match(cruzado, /HttpOnly/);

  // Em dev é o contrário: `Secure` em http também seria descartado.
  const local = cookieDeSessao({ valor: 'v', maxAgeS: 60, origemCruzada: false });
  assert.match(local, /SameSite=Lax/);
  assert.doesNotMatch(local, /Secure/);
});

test('a sessão sobrevive a fechar a janela: o cookie leva prazo', () => {
  // A credencial é pedida na primeira entrada, e não a cada volta. Um cookie
  // sem `Max-Age` morre quando o navegador fecha, e era isso que fazia o app
  // pedir a senha de novo depois de minimizar. O prazo aqui e a validade
  // assinada dentro do valor precisam dizer a mesma coisa.
  const entrando = cookieDeSessao({
    valor: 'v',
    maxAgeS: DURACAO_DA_SESSAO_S,
    origemCruzada: false,
  });
  assert.match(entrando, new RegExp(`Max-Age=${DURACAO_DA_SESSAO_S}`));
  assert.equal(DURACAO_DA_SESSAO_S, 7 * 24 * 60 * 60);

  // Sair continua apagando: `Max-Age=0` é o que manda o navegador esquecer.
  const saindo = cookieDeSessao({ valor: '', maxAgeS: 0, origemCruzada: false });
  assert.match(saindo, /Max-Age=0/);
});

test('o cookie é lido no meio de outros', () => {
  assert.equal(lerCookieDaSessao('a=1; orbis_sessao=abc.def; b=2'), 'abc.def');
  assert.equal(lerCookieDaSessao('a=1; b=2'), undefined);
  assert.equal(lerCookieDaSessao(undefined), undefined);
});

/**
 * A segunda tranca — a das ações que custam — e a pergunta que a INTERFACE faz
 * sobre ela.
 *
 * `trancaDeAcaoAtiva` nasceu porque a tela e o servidor discordavam: o diálogo
 * pedia a credencial sempre, inclusive na máquina local sem `ORBIS_SENHA_ACAO`,
 * onde o servidor deixa passar. Quem usava o app tinha de inventar um texto
 * qualquer para o botão habilitar.
 */

test('PROVA: sem ORBIS_SENHA_ACAO a tranca de acao nao existe, e ela DIZ isso', () => {
  process.env.ORBIS_SENHA_ACAO = '';
  assert.equal(trancaDeAcaoAtiva(), false, 'a interface precisa saber para nao pedir a toa');
  assert.equal(senhaDeAcaoConfere(undefined), true, 'e o servidor deixa passar');
  assert.equal(senhaDeAcaoConfere('qualquer coisa'), true);
});

test('PROVA: com ORBIS_SENHA_ACAO a tranca volta, e so a senha certa passa', () => {
  process.env.ORBIS_SENHA_ACAO = 'confirma';
  assert.equal(trancaDeAcaoAtiva(), true);
  assert.equal(senhaDeAcaoConfere('confirma'), true);
  assert.equal(senhaDeAcaoConfere('confirmA'), false, 'quase-certa nao passa');
  assert.equal(senhaDeAcaoConfere(''), false);
  assert.equal(senhaDeAcaoConfere(undefined), false);
});

test('a resposta da tranca acompanha a variavel, e nao um valor lido uma vez', () => {
  // Ela e lida a cada chamada de proposito: um servidor que trocasse a variavel
  // em tempo de execucao passaria a exigir sem precisar reiniciar.
  process.env.ORBIS_SENHA_ACAO = '';
  assert.equal(trancaDeAcaoAtiva(), false);
  process.env.ORBIS_SENHA_ACAO = 'agora sim';
  assert.equal(trancaDeAcaoAtiva(), true);
});
