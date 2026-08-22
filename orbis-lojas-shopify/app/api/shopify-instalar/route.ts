import { env } from "cloudflare:workers";
import { z } from "zod";
import { getIdentity } from "@/lib/auth";
import { ensureDatabase, ensureUser, getD1 } from "@/lib/data";
import { PRODUTOS_POR_NICHO } from "@/lib/catalogo-nichos";
import { descricaoDoProduto, nomeDeVitrine } from "@/lib/nome-de-produto";
import { IDIOMA_PADRAO } from "@/lib/idiomas.mjs";
import { nichoPorId } from "@/lib/marca-generator.mjs";
import { zipSync } from "fflate";
import { montarTemaShopify } from "@/lib/pacote-da-loja";
import { ARQUIVO_DA_LOJA, marcadorDaLoja, type ShopifyThemeImport } from "@/lib/shopify-theme";
import { PREFIXO_DO_PACOTE, enderecoDoPacote, novaChaveDePacote, prazoDoPacote } from "@/lib/pacote-publico";
import {
  appConfigurado, conferirLoja, credenciaisDoApp, criarColecoes, criarProdutos, enviarArquivos, instalarTema,
  normalizarDominio, obterToken,
  type ArquivoParaLoja, type LojaShopify, type ProdutoParaLoja,
} from "@/lib/shopify-admin";

/**
 * INSTALAR a loja na conta Shopify do cliente.
 *
 * É o mesmo destino do ZIP, por outro caminho. O pacote continua existindo e
 * continua sendo a reserva: se a instalação falhar no meio, o cliente baixa e
 * sobe à mão como sempre fez. O que muda é que, dando certo, ele não abre o
 * admin da Shopify uma vez sequer.
 *
 * ## Por que aqui, e não no navegador
 *
 * A Shopify recusa chamada de Admin API vinda do browser. E mesmo que aceitasse,
 * a chave de escrita da loja de alguém não pode passar pelo front. Então a
 * chamada sai daqui — que hoje é o `workerd` da máquina do dono e amanhã é o
 * mesmo código hospedado.
 *
 * ## Ninguém cola chave nenhuma
 *
 * O cliente informa o endereço da loja e mais nada. Quem se identifica é o APP,
 * com as credenciais do dono (`SHOPIFY_CLIENT_ID` e `SHOPIFY_CLIENT_SECRET`, em
 * `.dev.vars`), e a Shopify devolve um token de 24 horas para aquela loja.
 *
 * A versão anterior desta rota pedia uma chave `shpat_` colada no formulário.
 * Ela existiu por dois dias e morreu por um motivo simples: a Shopify aposentou
 * os apps personalizados criados no admin, e essa chave não é mais emitida para
 * app novo. O caminho de hoje é melhor de qualquer forma — some um campo da
 * tela e some um passo a passo de quatro etapas do colo do cliente.
 *
 * O token não é guardado: vale 24 horas, a instalação leva segundos, e pedir de
 * novo custa uma chamada.
 */

const pedido = z.object({
  acao: z.enum(["conferir", "instalar"]),
  dominio: z.string().min(1).max(120),
  projectId: z.string().min(1).max(80),
  /**
   * O `state` de uma conexão que o CLIENTE aprovou (OAuth).
   *
   * Presente, o token vem dela: é a loja de um terceiro, e é ele quem
   * autorizou. Ausente, o app se identifica com as credenciais do dono — que
   * só funcionam dentro da mesma organização Shopify, e por isso servem para
   * testar, não para atender.
   */
  estado: z.string().length(32).optional(),
});

type Relatorio = {
  loja: { nome: string; dominio: string; plano: string };
  colecoes: { criadas: number; nomes: string[] };
  produtos: { criados: number; semColecao: number; jaExistiam: number };
  arquivos: { enviados: number; falhas: string[]; jaExistiam: number };
  tema: { instalado: boolean; nome?: string; id?: number; motivo?: string; substituidos?: number };
  avisos: string[];
};

/** O tema do projeto, que é onde a marca aplicada mora. */
async function temaDoProjeto(viewerId: string, projectId: string): Promise<ShopifyThemeImport | null> {
  const linha = await getD1()
    .prepare("SELECT customization AS payload FROM projects WHERE id = ? AND user_id = ?")
    .bind(projectId, viewerId)
    .first<{ payload: string }>();
  if (!linha) return null;
  try { return (JSON.parse(linha.payload) as { shopify?: ShopifyThemeImport }).shopify ?? null; } catch { return null; }
}

/**
 * Os produtos da loja, na MESMA distribuição do CSV.
 *
 * Rodízio de coleção, nome de vitrine e descrição saem das mesmas funções que
 * montam o arquivo. Não é economia de código: é a garantia de que instalar pela
 * API e importar o CSV produzem a mesma loja. Duas portas para o mesmo lugar
 * que entregassem lojas diferentes seriam duas verdades sobre o que o cliente
 * aprovou.
 */
function produtosDoNicho(nicheId: string | undefined, colecoes: readonly string[], idioma: string = IDIOMA_PADRAO): ProdutoParaLoja[] {
  /* a loja instalada na conta do cliente recebe os produtos NO IDIOMA dela:
     era a ultima ponta em portugues de uma loja escolhida em ingles */
  const fonte = nicheId ? PRODUTOS_POR_NICHO[nicheId] : undefined;
  if (!fonte?.length) return [];
  const destinos = colecoes.map((nome) => String(nome ?? "").trim()).filter(Boolean);
  return fonte.map((produto, indice) => ({
    handle: produto.handle,
    titulo: nomeDeVitrine(produto, idioma),
    descricaoHtml: descricaoDoProduto(produto, idioma),
    precoCentavos: produto.price,
    precoComparadoCentavos: produto.compareAtPrice,
    imagens: produto.images ?? [],
    colecao: destinos.length ? destinos[indice % destinos.length] : "",
  }));
}

/**
 * As artes da marca que precisam existir em Content › Files.
 *
 * O tema procura por elas pelo NOME — é assim que a Shopify funciona, e é o
 * mesmo motivo de o pacote trazer a pasta com "não renomeie nenhum". Aqui o
 * nome vai igual, senão a ligação quebra e a loja abre com quadro em branco.
 */
const ARTE_DA_MARCA = /^assets\/orbis-.*\.(png|jpe?g|webp|gif|svg|avif)$/i;

function artesDaMarca(tema: Record<string, Uint8Array> | null): ArquivoParaLoja[] {
  if (!tema) return [];
  const tipo = (caminho: string) => {
    const ext = caminho.split(".").pop()?.toLowerCase() ?? "";
    if (ext === "png") return "image/png";
    if (ext === "webp") return "image/webp";
    if (ext === "svg") return "image/svg+xml";
    if (ext === "gif") return "image/gif";
    if (ext === "avif") return "image/avif";
    return "image/jpeg";
  };
  return Object.entries(tema)
    .filter(([caminho]) => ARTE_DA_MARCA.test(caminho))
    .map(([caminho, dados]) => ({ nome: caminho.slice("assets/".length), tipo: tipo(caminho), dados }));
}

/**
 * PUBLICA o pacote por minutos, e devolve o endereço.
 *
 * Só existe porque a Shopify instala tema buscando uma URL. Sem `ORBIS_PUBLIC_URL`
 * configurado, devolve vazio e o tema fica declaradamente de fora: um endereço
 * que a Shopify não alcança não adianta nada, e `localhost` ela não alcança.
 *
 * O ZIP montado aqui é o MESMO do botão de download, pelas mesmas regras: sem a
 * pasta de prévia (não é conteúdo de tema) e sem as artes da marca em `assets/`
 * (elas vão para Content › Files, e duplicá-las estoura o teto de 50 MB).
 */
async function publicarPacote(tema: Record<string, Uint8Array>, base: string | undefined, marcador: string) {
  const chave = novaChaveDePacote();
  const endereco = enderecoDoPacote(base, chave);
  if (!endereco || !env.MEDIA) return { endereco: "", chave: "" };
  const arquivos: Record<string, Uint8Array> = {};
  for (const [caminho, dados] of Object.entries(tema)) {
    if (caminho.startsWith("previa-local/")) continue;
    if (ARTE_DA_MARCA.test(caminho)) continue;
    arquivos[caminho] = dados;
  }
  /* o tema sai sabendo de que loja ele é, como no pacote baixado: sem isto,
     reimportar a própria loja traria o catálogo de demonstração de volta */
  if (marcador) arquivos[ARQUIVO_DA_LOJA] = new TextEncoder().encode(marcador);
  const zip = zipSync(arquivos, { level: 6 });
  await env.MEDIA.put(`${PREFIXO_DO_PACOTE}${chave}.zip`, zip.slice().buffer as ArrayBuffer, {
    httpMetadata: { contentType: "application/zip" },
    customMetadata: { expiraEm: prazoDoPacote() },
  });
  return { endereco, chave };
}

export async function POST(request: Request) {
  try {
    const identity = await getIdentity();
    if (!identity) return Response.json({ error: "AUTHENTICATION_REQUIRED" }, { status: 401 });
    const viewer = await ensureUser(identity);
    await ensureDatabase();

    const parsed = pedido.safeParse(await request.json());
    if (!parsed.success) return Response.json({ error: "INVALID_REQUEST", issues: parsed.error.flatten() }, { status: 400 });

    /* domínio e chave são conferidos ANTES de qualquer escrita: descobrir no
       meio da instalação que a chave era de outra loja deixa metade de uma loja
       montada na conta errada */
    const dominio = normalizarDominio(parsed.data.dominio);
    if (!dominio) return Response.json({ error: "DOMINIO_INVALIDO", mensagem: "Use o endereço .myshopify.com da loja." }, { status: 400 });
    /* as credenciais são do DONO do app, não do cliente: quem não as configurou
       precisa de uma frase que diga isso, e não de um erro da Shopify */
    const credenciais = credenciaisDoApp(env.SHOPIFY_CLIENT_ID, env.SHOPIFY_CLIENT_SECRET);
    /* sem credencial não há caminho nenhum: nem o do dono, nem o do cliente —
       o OAuth também precisa delas para trocar o código por token */
    if (!appConfigurado(credenciais)) {
      return Response.json({
        error: "APP_NAO_CONFIGURADO",
        mensagem: "O app ainda não tem as credenciais da Shopify configuradas (SHOPIFY_CLIENT_ID e SHOPIFY_CLIENT_SECRET).",
      }, { status: 400 });
    }

    /**
     * DE ONDE VEM O TOKEN, e são dois lugares possíveis.
     *
     * Com `estado`, veio de uma autorização do cliente e está guardado por
     * segundos na tabela de conexões. Sem, o app pede um com as credenciais do
     * dono — e a Shopify só concede dentro da mesma organização.
     *
     * O instalador daqui para baixo não sabe a diferença, e é esse o ponto: um
     * caminho só de instalação, duas portas de entrada.
     */
    let conexao: { token: string; loja: string } | null = null;
    if (parsed.data.estado) {
      const linha = await getD1()
        .prepare("SELECT loja, token FROM shopify_conexoes WHERE estado = ? AND user_id = ? AND status = 'conectado'")
        .bind(parsed.data.estado, viewer.id)
        .first<{ loja: string; token: string }>();
      if (!linha?.token) {
        return Response.json({ error: "CONEXAO_NAO_ENCONTRADA", mensagem: "Essa autorização não está mais válida. Conecte a loja de novo." }, { status: 400 });
      }
      if (linha.loja !== dominio) {
        return Response.json({ error: "LOJA_DIVERGENTE", mensagem: "A loja autorizada não é a mesma do pedido." }, { status: 400 });
      }
      conexao = { token: linha.token, loja: linha.loja };
    }

    let loja: LojaShopify;
    let dados;
    try {
      const token = conexao?.token ?? (await obterToken(dominio, credenciais)).token;
      loja = { dominio, token };
      dados = await conferirLoja(loja);
    } catch (erro) {
      const detalhe = erro as { mensagem?: string; status?: number };
      return Response.json({
        error: "CONEXAO_RECUSADA",
        mensagem: detalhe.mensagem ?? "Não consegui entrar nessa loja com essa chave.",
        status: detalhe.status,
      }, { status: 400 });
    }

    const tema = await temaDoProjeto(viewer.id, parsed.data.projectId);
    if (!tema) return Response.json({ error: "PROJECT_NOT_FOUND" }, { status: 404 });

    const colecoes = (tema.orbisColecoes ?? nichoPorId(tema.orbisNicheId).colecoes ?? []).slice(0, 12);
    const produtos = produtosDoNicho(tema.orbisNicheId, colecoes, tema.orbisIdioma);

    /* CONFERIR não escreve nada: diz o que vai acontecer, para a pessoa
       aprovar sabendo o tamanho do que autorizou */
    if (parsed.data.acao === "conferir") {
      return Response.json({
        loja: { nome: dados.nome, dominio: dados.dominio, plano: dados.plano },
        vaiCriar: { colecoes: colecoes.length, produtos: produtos.length },
      });
    }

    const relatorio: Relatorio = {
      loja: { nome: dados.nome, dominio: dados.dominio, plano: dados.plano },
      colecoes: { criadas: 0, nomes: [] },
      produtos: { criados: 0, semColecao: 0, jaExistiam: 0 },
      arquivos: { enviados: 0, falhas: [], jaExistiam: 0 },
      tema: { instalado: false },
      avisos: [],
    };

    /* a ORDEM importa: coleção antes de produto (o vínculo precisa do id dela),
       e o tema por último — ele é o que a pessoa vai olhar, e olhar um tema
       cuja vitrine ainda não existe parece defeito */
    const mapaDeColecoes = await criarColecoes(loja, colecoes);
    relatorio.colecoes = { criadas: mapaDeColecoes.size, nomes: [...mapaDeColecoes.keys()] };

    if (produtos.length) {
      const resultado = await criarProdutos(loja, produtos, mapaDeColecoes);
      relatorio.produtos = resultado;
      if (resultado.semColecao) relatorio.avisos.push(`${resultado.semColecao} produto(s) entraram sem coleção.`);
      /* repetir a instalação não pode encher a loja: dizer quantos já estavam
         lá explica um placar de zero sem parecer defeito */
      if (resultado.jaExistiam) relatorio.avisos.push(`${resultado.jaExistiam} produto(s) já estavam na loja e não foram duplicados.`);
    } else {
      relatorio.avisos.push("Esta loja não tem nicho declarado, então não há catálogo para instalar.");
    }

    /* UMA montagem serve às duas coisas: as artes que sobem para Files e o ZIP
       que a Shopify vai baixar. Montar duas vezes leria o mesmo ZIP do R2 de
       novo, e ele é o arquivo mais pesado deste caminho. */
    const arquivosDoTema = await montarTemaShopify(viewer.id, tema);
    const arquivos = artesDaMarca(arquivosDoTema);
    if (arquivos.length) {
      const resultado = await enviarArquivos(loja, arquivos);
      relatorio.arquivos = resultado;
      if (resultado.falhas.length) relatorio.avisos.push(`${resultado.falhas.length} imagem(ns) não subiram; o tema mostra o quadro vazio no lugar delas.`);
    }

    /**
     * O TEMA, e o endereço público que ele exige.
     *
     * A Shopify instala tema de um jeito só: recebe uma URL e vai buscar o
     * arquivo. Rodando na máquina do dono, `localhost` ela não alcança, e por
     * isso o tema fica de fora com o motivo escrito. Com `ORBIS_PUBLIC_URL`
     * apontando para um endereço que ela alcance (um túnel hoje, o domínio do
     * app quando hospedado), este passo fecha sozinho.
     */
    if (arquivosDoTema) {
      const marcador = marcadorDaLoja(tema.orbisNicheId ?? "", tema.orbisCapas ?? {}, {
        ...(tema.orbisLoja ?? {}),
        colecoes: tema.orbisColecoes,
        sorteio: tema.orbisSorteio,
      });
      const publicado = await publicarPacote(arquivosDoTema, env.ORBIS_PUBLIC_URL, marcador);
      if (publicado.endereco) {
        try {
          const instalado = await instalarTema(loja, { nome: `${dados.nome} · Orbis`, zipUrl: publicado.endereco });
          relatorio.tema = { instalado: true, id: instalado.id, nome: instalado.nome, substituidos: instalado.substituidos.length };
          relatorio.avisos.push("O tema entrou SEM publicar: confira e publique quando quiser trocar a loja no ar.");
          /* recolher em silêncio faria o cliente achar que perdeu um tema */
          if (instalado.substituidos.length)
            relatorio.avisos.push(`${instalado.substituidos.length} instalação(ões) anterior(es) desta loja foram recolhidas; a publicada, se houver, ficou onde estava.`);
        } catch (erro) {
          relatorio.tema = { instalado: false, motivo: (erro as { mensagem?: string }).mensagem ?? "a instalação do tema falhou" };
        }
      } else {
        relatorio.tema = { instalado: false, motivo: "sem endereço público para o pacote; suba o tema pelo ZIP" };
      }
    } else {
      relatorio.tema = { instalado: false, motivo: "não encontrei o ZIP de origem deste tema" };
    }
    /**
     * O pacote NÃO é apagado aqui, e apagar seria um defeito.
     *
     * `themes.json` responde assim que aceita o pedido; o download e o
     * processamento do ZIP acontecem DEPOIS, do lado da Shopify. Apagar ao
     * receber a resposta puxaria o arquivo de baixo dos pés dela, e o tema
     * chegaria quebrado ou não chegaria.
     *
     * Quem recolhe é o prazo: quinze minutos, conferidos a cada pedido, e o
     * arquivo some na primeira tentativa de uso depois disso.
     */

    /**
     * A CONEXÃO É CONSUMIDA aqui, e o token morre com ela.
     *
     * Ele viveu o tempo entre o cliente aprovar e a loja ficar montada, e não
     * há motivo para durar mais. Token de escrita guardado exige cifra, rotação
     * e o webhook de desinstalação para apagá-lo quando o cliente for embora;
     * token que não sobrevive à instalação não exige nada disso.
     *
     * Quando o app virar hospedado e precisar voltar à loja depois (para
     * atualizar um tema, por exemplo), isto muda — e aí muda junto com as três
     * responsabilidades que vêm no pacote.
     */
    if (parsed.data.estado) {
      await getD1().prepare("DELETE FROM shopify_conexoes WHERE estado = ? AND user_id = ?")
        .bind(parsed.data.estado, viewer.id).run();
    }

    return Response.json(relatorio);
  } catch (erro) {
    return Response.json({ error: "INSTALL_FAILED", mensagem: (erro as Error).message }, { status: 500 });
  }
}
