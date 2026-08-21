/**
 * A LOJA DO CLIENTE, pela API de administração da Shopify.
 *
 * Até aqui a entrega terminava num pacote: o cliente baixava um ZIP e fazia
 * três coisas à mão — subir o tema, importar um CSV de produtos e enviar as
 * imagens uma a uma para Content › Files. Funciona, e continua existindo como
 * reserva, mas são três telas do admin da Shopify explicadas por WhatsApp.
 *
 * Este módulo faz as mesmas três coisas por API, na loja dele.
 *
 * ## O que muda entre rodar aqui e rodar hospedado: nada
 *
 * Toda chamada daqui é de SAÍDA — nós ligamos para a Shopify, ela nunca liga
 * para nós. É por isso que isto funciona num computador sem endereço público, e
 * é por isso que o mesmo código serve depois: o que hospedar acrescenta é o
 * OAuth (a Shopify precisa REDIRECIONAR de volta, e para redirecionar precisa de
 * um endereço). O token muda de origem; as chamadas são as mesmas.
 *
 * A ÚNICA exceção está declarada em `instalarTema`, e é uma limitação da
 * plataforma, não nossa.
 *
 * ## O token nunca chega ao navegador
 *
 * A Shopify recusa chamada de Admin API vinda do browser, e com razão: chave de
 * escrita no front é chave vazada. Este módulo roda no servidor — mesmo quando
 * o servidor é o `workerd` da máquina do dono.
 */

/** A versão da API que este módulo fala. Mudar aqui é mudar em todo lugar. */
export const VERSAO_DA_API = "2026-07";

export type LojaShopify = {
  /** Sempre `algo.myshopify.com`, normalizado por `normalizarDominio`. */
  dominio: string;
  /** O token de 24 horas que `obterToken` pediu para esta loja. */
  token: string;
};

export type ErroDaShopify = {
  passo: string;
  mensagem: string;
  /** O status HTTP, quando houve resposta. */
  status?: number;
};

/**
 * O endereço da loja, do jeito que a pessoa digitar.
 *
 * Ela vai colar `https://minha-loja.myshopify.com/admin`, ou escrever só
 * `minha-loja`, ou pôr um espaço no fim. Todos são a mesma loja, e recusar por
 * causa de um `https://` é atrito sem motivo. O que NÃO se aceita é domínio
 * próprio (`minhaloja.com.br`): a API só atende pelo `.myshopify.com`, e trocar
 * um pelo outro daria um erro de autenticação que ninguém entenderia.
 */
export function normalizarDominio(bruto: string): string {
  const texto = String(bruto ?? "").trim().toLowerCase();
  if (!texto) return "";
  const semProtocolo = texto.replace(/^https?:\/\//, "").split("/")[0];
  const nome = semProtocolo.replace(/\.myshopify\.com$/, "");
  if (!/^[a-z0-9][a-z0-9-]{0,58}[a-z0-9]$/.test(nome)) return "";
  return `${nome}.myshopify.com`;
}

/**
 * O RITMO das chamadas.
 *
 * A API REST da Shopify é um balde que vaza: cabem 40 chamadas e ele devolve
 * duas por segundo. Uma instalação dispara umas trinta — coleções, produtos,
 * vínculos, arquivos — e disparadas juntas as últimas voltam 429. Esperar meio
 * segundo entre elas mantém o ritmo dentro do que a plataforma dá, e a
 * instalação inteira ainda cabe em poucos segundos.
 */
const INTERVALO_MS = 520;
let proximaChamada = 0;

async function respeitarORitmo(agora: () => number, dormir: (ms: number) => Promise<void>) {
  const espera = proximaChamada - agora();
  if (espera > 0) await dormir(espera);
  proximaChamada = Math.max(proximaChamada, agora()) + INTERVALO_MS;
}

/** Injetáveis para o teste não esperar meio segundo por chamada. */
export type Relogio = { agora: () => number; dormir: (ms: number) => Promise<void> };
const RELOGIO_REAL: Relogio = {
  agora: () => Date.now(),
  dormir: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
};

export type Ambiente = { buscar?: typeof fetch; relogio?: Relogio };

/**
 * Uma chamada à API, com ritmo e com erro legível.
 *
 * A Shopify responde erro de três jeitos diferentes — `errors` string, `errors`
 * objeto por campo, e `error` — e quem lê a tela precisa de UMA frase. Aqui os
 * três viram texto, e o status vem junto porque 401 e 422 pedem conversas
 * diferentes: um é chave errada, o outro é dado recusado.
 */
async function chamar(
  loja: LojaShopify,
  caminho: string,
  init: RequestInit & { passo: string },
  ambiente: Ambiente = {},
): Promise<unknown> {
  const buscar = ambiente.buscar ?? fetch;
  const relogio = ambiente.relogio ?? RELOGIO_REAL;
  await respeitarORitmo(relogio.agora, relogio.dormir);
  const url = `https://${loja.dominio}/admin/api/${VERSAO_DA_API}${caminho}`;
  let resposta: Response;
  try {
    resposta = await buscar(url, {
      ...init,
      headers: {
        "X-Shopify-Access-Token": loja.token,
        "content-type": "application/json",
        accept: "application/json",
        ...(init.headers ?? {}),
      },
    });
  } catch (erro) {
    throw falha(init.passo, `não consegui falar com ${loja.dominio}: ${(erro as Error).message}`);
  }
  /* 429 é ritmo, não defeito: a própria resposta diz quanto esperar */
  if (resposta.status === 429) {
    const espera = Number(resposta.headers.get("retry-after") ?? 2) * 1000;
    await relogio.dormir(Math.min(10_000, Math.max(1000, espera)));
    return chamar(loja, caminho, init, ambiente);
  }
  const corpo = await resposta.text();
  const dados = corpo ? seguroJson(corpo) : {};
  if (!resposta.ok) throw falha(init.passo, mensagemDeErro(dados, resposta.status), resposta.status);
  /* GraphQL responde 200 com o erro dentro: sem isto, falha vira sucesso */
  const comErros = dados as { errors?: unknown };
  if (comErros?.errors) throw falha(init.passo, mensagemDeErro(dados, 200), 200);
  return dados;
}

function seguroJson(texto: string): unknown {
  try { return JSON.parse(texto); } catch { return { errors: texto.slice(0, 200) }; }
}

function falha(passo: string, mensagem: string, status?: number): ErroDaShopify & Error {
  const erro = new Error(mensagem) as ErroDaShopify & Error;
  erro.passo = passo;
  erro.mensagem = mensagem;
  erro.status = status;
  return erro;
}

function mensagemDeErro(dados: unknown, status: number): string {
  const corpo = dados as { errors?: unknown; error?: unknown };
  const bruto = corpo?.errors ?? corpo?.error;
  if (typeof bruto === "string") return bruto;
  if (Array.isArray(bruto)) return bruto.map((item) => (typeof item === "string" ? item : (item as { message?: string })?.message ?? "")).filter(Boolean).join("; ");
  if (bruto && typeof bruto === "object") {
    return Object.entries(bruto as Record<string, unknown>)
      .map(([campo, valor]) => `${campo}: ${Array.isArray(valor) ? valor.join(", ") : String(valor)}`)
      .join("; ");
  }
  if (status === 401 || status === 403) return "a chave não tem permissão para isto (confira os escopos do app)";
  return `a Shopify respondeu ${status}`;
}

/* ----------------------------------------------------------------- token */

export type CredenciaisDoApp = { clientId: string; clientSecret: string };

/**
 * As credenciais como o worker precisa delas: SEM o que veio de brinde do arquivo.
 *
 * Isto não é zelo defensivo, é um bug pago. O `.dev.vars` num Windows nasce
 * CRLF, e cada valor chegava aqui com um `
` colado no fim — 39 bytes onde o
 * Client Secret tem 38.
 *
 * O sintoma foi cruel porque o `
` não atrapalha em quase lugar nenhum: a
 * Shopify o tolera no endpoint de token (o `client_credentials` devolvia 200 e
 * a loja era instalada inteira), e o parser de URL descarta controle no fim
 * sozinho (o redirecionamento funcionava). Só a assinatura HMAC usa a chave
 * byte a byte — e por um caractere invisível ela NUNCA batia, com a tela
 * dizendo apenas "a assinatura não confere".
 *
 * Por isso a limpeza mora na leitura, e não no arquivo: o arquivo volta a ser
 * CRLF na próxima vez que alguém o editar.
 */
export function credenciaisDoApp(clientId: unknown, clientSecret: unknown): CredenciaisDoApp {
  return { clientId: String(clientId ?? "").trim(), clientSecret: String(clientSecret ?? "").trim() };
}

/** Sem as duas, não há instalação: o painel diz isso em vez de pedir e falhar. */
export function appConfigurado(credenciais: Partial<CredenciaisDoApp> | undefined): boolean {
  return Boolean(credenciais?.clientId?.trim() && credenciais?.clientSecret?.trim());
}

/**
 * O TOKEN de acesso à loja, pedido pelo app.
 *
 * Ninguém cola chave nenhuma. O app apresenta as credenciais DELE e a Shopify
 * devolve um token para aquela loja, válido por 24 horas. É o `client
 * credentials grant`, e ele existe justamente para o caso em que não há um
 * navegador para redirecionar.
 *
 * ## O limite, e ele é intransponível
 *
 * Isto só funciona quando o app e a loja pertencem à MESMA organização Shopify.
 * Serve para o dono testar nas lojas dele; não serve para atender cliente. Loja
 * de cliente pede OAuth, e OAuth pede um endereço público para a Shopify
 * redirecionar de volta. É a mesma fronteira que separa rodar aqui de rodar
 * hospedado, e nenhum código deste lado a atravessa.
 *
 * ## Por que não guardamos o token
 *
 * Ele vale 24 horas e uma instalação leva segundos. Guardar exigiria decidir
 * onde, por quanto tempo e como invalidar; pedir de novo custa uma chamada. A
 * troca é boa enquanto a instalação for um gesto, e ela é.
 */
export async function obterToken(
  dominio: string,
  credenciais: CredenciaisDoApp,
  ambiente: Ambiente = {},
): Promise<{ token: string; escopos: string; expiraEm: number }> {
  const buscar = ambiente.buscar ?? fetch;
  const alvo = normalizarDominio(dominio);
  if (!alvo) throw falha("pedir o token", "o endereço da loja não é um .myshopify.com válido");
  let resposta: Response;
  try {
    /* fora de `/admin/api/<versão>`: o endereço do token é outro, e por isso
       esta é a única chamada que não passa por `chamar` */
    resposta = await buscar(`https://${alvo}/admin/oauth/access_token`, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({
        client_id: credenciais.clientId.trim(),
        client_secret: credenciais.clientSecret.trim(),
        grant_type: "client_credentials",
      }),
    });
  } catch (erro) {
    throw falha("pedir o token", `não consegui falar com ${alvo}: ${(erro as Error).message}`);
  }
  const corpo = await resposta.text();
  const dados = corpo ? seguroJson(corpo) : {};
  if (!resposta.ok) {
    /* 401 aqui quase sempre é uma de duas coisas, e dizer QUAIS poupa a tarde
       de quem está configurando */
    const dica = resposta.status === 401 || resposta.status === 400
      ? " (confira o Client ID e o Secret, e se o app está instalado nesta loja)"
      : "";
    throw falha("pedir o token", `${mensagemDeErro(dados, resposta.status)}${dica}`, resposta.status);
  }
  const conteudo = dados as { access_token?: string; scope?: string; expires_in?: number };
  if (!conteudo.access_token) throw falha("pedir o token", "a Shopify não devolveu token");
  return {
    token: conteudo.access_token,
    escopos: conteudo.scope ?? "",
    expiraEm: Number(conteudo.expires_in) || 0,
  };
}

/* ------------------------------------------------------------- conferência */

export type DadosDaLoja = { nome: string; dominio: string; plano: string; email: string };

/**
 * A loja existe e a chave abre a porta?
 *
 * É a primeira coisa a perguntar, e ela vale por três: prova o domínio, prova o
 * token e prova a conexão — antes de qualquer escrita. Instalar metade de uma
 * loja e descobrir no meio que a chave era de outra é o pior desfecho possível.
 */
export async function conferirLoja(loja: LojaShopify, ambiente: Ambiente = {}): Promise<DadosDaLoja> {
  const dados = (await chamar(loja, "/shop.json", { method: "GET", passo: "conferir a loja" }, ambiente)) as {
    shop?: { name?: string; myshopify_domain?: string; plan_display_name?: string; email?: string };
  };
  const shop = dados?.shop;
  if (!shop) throw falha("conferir a loja", "a resposta não trouxe os dados da loja");
  return {
    nome: shop.name ?? loja.dominio,
    dominio: shop.myshopify_domain ?? loja.dominio,
    plano: shop.plan_display_name ?? "",
    email: shop.email ?? "",
  };
}

/* --------------------------------------------------------------- coleções */

/**
 * As coleções, uma por nome, devolvidas por NOME.
 *
 * A coleção precisa existir antes dos produtos: é ela que dá aos cartões da
 * home um destino, e o tema já aponta para o handle dela. Coleção que já existe
 * na loja é reaproveitada em vez de duplicada — o cliente pode estar instalando
 * pela segunda vez, e duas "Ofertas" na lista é sujeira que ele teria de apagar
 * à mão.
 */
export async function criarColecoes(loja: LojaShopify, nomes: readonly string[], ambiente: Ambiente = {}): Promise<Map<string, number>> {
  const mapa = new Map<string, number>();
  const existentes = (await chamar(loja, "/custom_collections.json?limit=250", { method: "GET", passo: "listar coleções" }, ambiente)) as {
    custom_collections?: Array<{ id: number; title: string }>;
  };
  const porTitulo = new Map((existentes.custom_collections ?? []).map((c) => [c.title.trim().toLowerCase(), c.id]));
  for (const nome of nomes) {
    const titulo = String(nome ?? "").trim();
    if (!titulo) continue;
    const jaTem = porTitulo.get(titulo.toLowerCase());
    if (jaTem) { mapa.set(titulo, jaTem); continue; }
    const criada = (await chamar(loja, "/custom_collections.json", {
      method: "POST",
      body: JSON.stringify({ custom_collection: { title: titulo, published: true } }),
      passo: `criar a coleção "${titulo}"`,
    }, ambiente)) as { custom_collection?: { id: number } };
    if (criada.custom_collection?.id) mapa.set(titulo, criada.custom_collection.id);
  }
  return mapa;
}

/* --------------------------------------------------------------- produtos */

export type ProdutoParaLoja = {
  /** O apelido do produto na loja: é por ele que a repetição é reconhecida. */
  handle: string;
  titulo: string;
  descricaoHtml: string;
  precoCentavos: number;
  precoComparadoCentavos: number | null;
  imagens: string[];
  /** O nome da coleção que recebe este produto; vazio manda para nenhuma. */
  colecao: string;
};

const preco = (centavos: number | null) => (centavos == null || !Number.isFinite(centavos) ? undefined : (centavos / 100).toFixed(2));

/**
 * Os produtos, com foto e com coleção.
 *
 * As fotos vão por URL e quem baixa é a Shopify — o mesmo mecanismo do CSV, e o
 * motivo de a instalação não precisar mandar imagem de produto nenhuma daqui.
 *
 * O vínculo com a coleção é uma chamada à parte (`collects`), e ela vem DEPOIS
 * do produto porque precisa do id dele. Se essa segunda falhar, o produto fica
 * na loja sem coleção: incompleto, mas presente — o contrário (coleção
 * apontando para produto que não existe) deixaria cartão quebrado na home.
 */
export async function criarProdutos(
  loja: LojaShopify,
  produtos: readonly ProdutoParaLoja[],
  colecoes: Map<string, number>,
  ambiente: Ambiente = {},
): Promise<{ criados: number; semColecao: number; jaExistiam: number }> {
  let criados = 0;
  let semColecao = 0;
  let jaExistiam = 0;
  /**
   * O QUE JÁ ESTÁ NA LOJA não entra de novo.
   *
   * Instalar duas vezes é o gesto mais comum de quem está testando, e sem esta
   * conferência a segunda rodada criava dez produtos repetidos para o cliente
   * apagar um a um. As coleções já eram reaproveitadas; os produtos não, e a
   * diferença não tinha motivo.
   *
   * O apelido é a identidade: ele sai do título de origem e é o mesmo em toda
   * instalação da mesma loja.
   */
  const existentes = (await chamar(loja, "/products.json?limit=250&fields=id,handle", { method: "GET", passo: "listar produtos" }, ambiente)) as {
    products?: Array<{ id: number; handle: string }>;
  };
  const porHandle = new Map((existentes.products ?? []).map((p) => [p.handle, p.id]));

  for (const produto of produtos) {
    if (porHandle.has(produto.handle)) { jaExistiam += 1; continue; }
    const resposta = (await chamar(loja, "/products.json", {
      method: "POST",
      body: JSON.stringify({
        product: {
          handle: produto.handle,
          title: produto.titulo,
          body_html: produto.descricaoHtml,
          vendor: "Curadoria da loja",
          status: "active",
          images: produto.imagens.slice(0, 10).map((src) => ({ src })),
          variants: [{
            price: preco(produto.precoCentavos),
            compare_at_price: preco(produto.precoComparadoCentavos),
            inventory_management: null,
          }],
        },
      }),
      passo: `criar o produto "${produto.titulo}"`,
    }, ambiente)) as { product?: { id: number } };
    const id = resposta.product?.id;
    if (!id) continue;
    criados += 1;
    const colecaoId = colecoes.get(produto.colecao.trim());
    if (!colecaoId) { semColecao += 1; continue; }
    try {
      await chamar(loja, "/collects.json", {
        method: "POST",
        body: JSON.stringify({ collect: { product_id: id, collection_id: colecaoId } }),
        passo: `pôr "${produto.titulo}" em "${produto.colecao}"`,
      }, ambiente);
    } catch {
      /* o produto está na loja; só não entrou na coleção. Contar é melhor que
         abortar: quem instala prefere 10 produtos e 1 vínculo faltando a 3
         produtos e uma mensagem de erro */
      semColecao += 1;
    }
  }
  return { criados, semColecao, jaExistiam };
}

/* -------------------------------------------------------- Content › Files */

export type ArquivoParaLoja = { nome: string; tipo: string; dados: Uint8Array };

/**
 * AS ARTES DA MARCA, em Content › Files — e com o nome EXATO.
 *
 * O tema não carrega as próprias imagens: o seletor de imagem da Shopify só
 * enxerga o que está em Files, e é de lá que ele busca pelo NOME. Por isso a
 * loja subia com os quadros em branco, e por isso o pacote traz uma pasta com a
 * instrução "não renomeie nenhum".
 *
 * Aqui é a mesma regra, automatizada: o arquivo sobe com o nome que a
 * referência do tema espera. Renomear seria quebrar a ligação que faz a imagem
 * aparecer.
 *
 * O envio é em duas etapas, e a primeira é a que torna isto possível sem
 * hospedagem: a Shopify devolve um endereço temporário DELA, nós mandamos os
 * bytes para lá, e depois só citamos o recibo. Nada precisa estar público.
 */
export async function enviarArquivos(
  loja: LojaShopify,
  arquivos: readonly ArquivoParaLoja[],
  ambiente: Ambiente = {},
): Promise<{ enviados: number; falhas: string[]; jaExistiam: number }> {
  if (!arquivos.length) return { enviados: 0, falhas: [], jaExistiam: 0 };
  const buscar = ambiente.buscar ?? fetch;
  const falhas: string[] = [];
  let enviados = 0;
  let jaExistiam = 0;

  for (const arquivo of arquivos) {
    try {
      /**
       * O QUE JÁ ESTÁ NA LOJA não sobe de novo — mesma regra de produto e
       * coleção, que já deduplicam.
       *
       * Aqui a identidade é o NOME, e não por falta de coisa melhor: o nome é
       * `orbis-<8 do id da mídia>-<arquivo>`, e esse id é estável por arte
       * guardada. Reinstalar a mesma loja casa; uma arte nova não casa, e sobe,
       * que é o certo. Sem isto, cada reinstalação — o gesto mais comum de quem
       * está testando — deixava mais oito arquivos repetidos em Content › Files
       * para o cliente apagar um a um.
       *
       * O nome volta a ser conferido depois da busca: `filename:` é uma BUSCA,
       * e busca pode aproximar. Pular o envio por um quase-igual deixaria o
       * quadro em branco no tema, que é pior do que o repetido.
       */
      const existente = (await chamar(loja, "/graphql.json", {
        method: "POST",
        body: JSON.stringify({
          query: `query existe($busca: String!) {
            files(first: 5, query: $busca) {
              nodes { ... on MediaImage { id image { url } } ... on GenericFile { id url } }
            }
          }`,
          variables: { busca: `filename:'${arquivo.nome.replace(/'/g, "")}'` },
        }),
        passo: `procurar ${arquivo.nome}`,
      }, ambiente)) as { data?: { files?: { nodes?: Array<{ image?: { url?: string }; url?: string }> } } };

      const nomeDe = (endereco: string) => (endereco.split("/").at(-1) ?? "").split("?")[0];
      const achou = (existente.data?.files?.nodes ?? []).some((no) => nomeDe(no.image?.url ?? no.url ?? "") === arquivo.nome);
      if (achou) { jaExistiam += 1; continue; }

      const alvo = (await chamar(loja, "/graphql.json", {
        method: "POST",
        body: JSON.stringify({
          query: `mutation preparar($input: [StagedUploadInput!]!) {
            stagedUploadsCreate(input: $input) {
              stagedTargets { url resourceUrl parameters { name value } }
              userErrors { field message }
            }
          }`,
          variables: {
            input: [{
              filename: arquivo.nome,
              mimeType: arquivo.tipo,
              httpMethod: "POST",
              resource: "FILE",
              fileSize: String(arquivo.dados.byteLength),
            }],
          },
        }),
        passo: `preparar o envio de ${arquivo.nome}`,
      }, ambiente)) as {
        data?: { stagedUploadsCreate?: { stagedTargets?: Array<{ url: string; resourceUrl: string; parameters: Array<{ name: string; value: string }> }>; userErrors?: Array<{ message: string }> } };
      };
      const erroDaEtapa = alvo.data?.stagedUploadsCreate?.userErrors?.[0]?.message;
      if (erroDaEtapa) throw falha("preparar o envio", erroDaEtapa);
      const destino = alvo.data?.stagedUploadsCreate?.stagedTargets?.[0];
      if (!destino) throw falha("preparar o envio", "a Shopify não devolveu endereço de envio");

      const forma = new FormData();
      for (const parametro of destino.parameters) forma.append(parametro.name, parametro.value);
      forma.append("file", new Blob([arquivo.dados as unknown as BlobPart], { type: arquivo.tipo }), arquivo.nome);
      const envio = await buscar(destino.url, { method: "POST", body: forma });
      if (!envio.ok) throw falha("enviar o arquivo", `o envio de ${arquivo.nome} voltou ${envio.status}`);

      await chamar(loja, "/graphql.json", {
        method: "POST",
        body: JSON.stringify({
          query: `mutation registrar($files: [FileCreateInput!]!) {
            fileCreate(files: $files) { files { id } userErrors { field message } }
          }`,
          variables: { files: [{ originalSource: destino.resourceUrl, contentType: "IMAGE", filename: arquivo.nome }] },
        }),
        passo: `registrar ${arquivo.nome}`,
      }, ambiente);
      enviados += 1;
    } catch (erro) {
      /* um arquivo que não sobe deixa UM quadro em branco; abortar deixaria
         todos. A conta de quem falhou vai para o relatório */
      falhas.push(`${arquivo.nome}: ${(erro as Error).message}`);
    }
  }
  return { enviados, falhas, jaExistiam };
}

/* ------------------------------------------------------------------- tema */

/**
 * O TEMA, e a única coisa aqui que depende de um endereço público.
 *
 * A Shopify instala tema de um jeito só: a gente entrega uma URL e ELA baixa o
 * ZIP. Não existe endpoint que crie tema vazio para receber arquivo depois — a
 * criação e a fonte são a mesma chamada. Isso significa que este passo, e só
 * ele, precisa que o pacote esteja acessível de fora.
 *
 * Rodando na máquina do dono, `localhost` não serve: quem busca o arquivo é o
 * servidor da Shopify. Hospedado, é um link assinado do próprio armazenamento e
 * o passo deixa de ter qualquer particularidade.
 *
 * Por isso ele recebe a URL de fora em vez de montá-la: quem sabe onde o pacote
 * está publicado é quem chamou. Sem URL, o instalador declara que o tema ficou
 * de fora — em vez de fingir que instalou.
 *
 * Nasce SEM PUBLICAR de propósito. Trocar a loja no ar de alguém sem ele pedir
 * seria decidir no lugar dele; o cliente publica quando conferir.
 */
export async function instalarTema(
  loja: LojaShopify,
  { nome, zipUrl }: { nome: string; zipUrl: string },
  ambiente: Ambiente = {},
): Promise<{ id: number; nome: string }> {
  const resposta = (await chamar(loja, "/themes.json", {
    method: "POST",
    body: JSON.stringify({ theme: { name: nome.slice(0, 50), src: zipUrl, role: "unpublished" } }),
    passo: "instalar o tema",
  }, ambiente)) as { theme?: { id: number; name: string } };
  if (!resposta.theme?.id) throw falha("instalar o tema", "a Shopify não devolveu o tema criado");
  return { id: resposta.theme.id, nome: resposta.theme.name };
}
