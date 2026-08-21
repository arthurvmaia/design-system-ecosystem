import { strToU8, zipSync } from "fflate";
import { z } from "zod";
import { getIdentity } from "@/lib/auth";
import { ensureDatabase, ensureUser, getD1, saveProject, unlockTheme } from "@/lib/data";
import { brandCustomization, generateClientSite, sanitizeBrand } from "@/lib/site-generator.mjs";
import { gerarMarca, logoDaMarca } from "@/lib/marca-generator.mjs";
import { aplicarMarcaNoTema, handleDeColecao } from "@/lib/shopify-brand";
import { ARQUIVO_DA_LOJA, marcadorDaLoja, type ShopifyThemeImport } from "@/lib/shopify-theme";
import { pecasDaMarca } from "@/lib/marca-imagens";
import { csvDeProdutos } from "@/lib/catalogo-csv";
import { kitDeLogo } from "@/lib/kit-de-logo";
import { montarTemaShopify } from "@/lib/pacote-da-loja";

/**
 * Solicitação de loja do Fluxo Cliente.
 *
 * Conversa com o backend admin de verdade: desbloqueia o tema escolhido (os
 * triggers criam o projeto atomicamente), salva a customização com a marca
 * aplicada e devolve o site em ZIP. O ZIP vai para o navegador e é ele quem
 * grava: aqui é workerd, sem filesystem, e o app não escreve mais nada em
 * disco por fora do download.
 *
 * ## A marca é regerada aqui, não recebida pronta
 *
 * O navegador manda o nicho, a semente e o que a pessoa digitou. O servidor roda
 * o MESMO gerador determinístico e chega na mesma marca da prévia. Isso evita
 * confiar em SVG e em cores vindos do cliente, e mantém a prévia honesta: o que
 * ela viu é o que foi gerado.
 *
 * ## Tema qualquer, não só o ShrinePro
 *
 * O cliente escolhe entre todos os temas publicados do estúdio. Quando o tema
 * tem dados Shopify importados, a marca é aplicada sobre os settings reais dele
 * (`aplicarMarcaNoTema`) e o projeto nasce já com a cara da marca; o ZIP
 * entregue continua sendo o site navegável, para a pessoa ver o resultado sem
 * depender de nada instalado.
 */

const requestSchema = z.object({
  themeId: z.string().min(1).max(80).optional(),
  templateId: z.enum(["essencial", "vitrine"]),
  /* o que a loja VENDE. Não diz nada sobre quem escreve a marca. */
  nicheId: z.string().min(1).max(40).optional(),
  /**
   * Quem escreve a MARCA: `true` = a Orbis inventa a partir do nicho, `false` =
   * o cliente já tem a dele e só preencheu.
   *
   * Existe porque o servidor deduzia isso da presença do `nicheId`, e as duas
   * coisas não são a mesma pergunta. Com a dedução, um cliente com marca
   * própria que escolhesse o nicho — só para ter catálogo — teria os campos em
   * branco preenchidos com uma identidade inventada. Ausente, a dedução antiga
   * vale, para não quebrar pedido gravado antes disto.
   */
  criarMarca: z.boolean().optional(),
  seed: z.string().min(1).max(40).optional(),
  brand: z.object({
    name: z.string().min(2).max(48),
    slogan: z.string().max(140).optional(),
    description: z.string().max(240).optional(),
    primaryColor: z.string().regex(/^#[0-9a-f]{6}$/i).optional(),
    backgroundColor: z.string().regex(/^#[0-9a-f]{6}$/i).optional(),
    accentColor: z.string().regex(/^#[0-9a-f]{6}$/i).optional(),
    headingFont: z.string().max(60).optional(),
    bodyFont: z.string().max(60).optional(),
    whatsapp: z.string().max(24).optional(),
    instagram: z.string().max(60).optional(),
    email: z.string().max(120).optional(),
    logoDataUri: z.string().max(2_000_000).optional(),
    /**
     * As coleções que o cliente escreveu na bancada.
     *
     * Sem este campo elas eram descartadas na porta: o servidor regerava a
     * marca a partir do nicho e devolvia as coleções PADRÃO dele, então
     * "Moda Fitness" digitado na tela virava "Alfaiataria" no pacote, sem
     * nenhum aviso. Elas decidem as categorias do CSV, os cartões da vitrine e
     * quantas capas a arte precisa cobrir.
     */
    collections: z.array(z.string().max(40)).max(12).optional(),
  }),
  /**
   * Imagens já geradas pelo provedor de IA, por chave de peça, como id de mídia
   * (`/api/media/<id>`). Só chegam quando o cliente pediu a geração; sem elas a
   * loja usa os desenhos locais e nasce completa do mesmo jeito.
   */
  imagens: z.record(z.string().max(40), z.string().regex(/^\/api\/media\/[0-9a-fA-F-]{16,64}$/)).optional(),
  /**
   * Quais chaves de `imagens` a Orbis gerou — o resto foi o cliente que enviou.
   *
   * Serve ao campo de LOGO do tema: arte gerada é um PNG quadrado com fundo
   * próprio e vira um retângulo colado no cabeçalho, então ela não entra ali e
   * o tema escreve o nome da loja. Logo enviado pelo cliente entra.
   */
  imagensGeradas: z.array(z.string().max(40)).max(40).optional(),
});


/** O tema escolhido só entra se estiver publicado — a lista da tela é a mesma. */
async function temaPublicado(themeId: string) {
  const linha = await getD1()
    .prepare("SELECT id, name, default_settings AS defaults FROM themes WHERE id = ? AND status = 'published'")
    .bind(themeId)
    .first<{ id: string; name: string; defaults: string }>();
  return linha ?? null;
}

export async function POST(request: Request) {
  try {
    const identity = await getIdentity();
    if (!identity) return Response.json({ error: "AUTHENTICATION_REQUIRED" }, { status: 401 });
    const viewer = await ensureUser(identity);
    await ensureDatabase();

    const parsed = requestSchema.safeParse(await request.json());
    if (!parsed.success) {
      return Response.json({ error: "INVALID_REQUEST", issues: parsed.error.flatten() }, { status: 400 });
    }

    /* a marca do pedido: gerada a partir do nicho SÓ quando o cliente pediu
       isso, com o que ele digitou vencendo campo a campo. O nicho sozinho não
       autoriza inventar identidade — ele é o catálogo. */
    const criarMarca = parsed.data.criarMarca ?? Boolean(parsed.data.nicheId);
    const marca = criarMarca && parsed.data.nicheId
      ? gerarMarca({ nicheId: parsed.data.nicheId, semente: parsed.data.seed ?? "orbis", sobrescritas: parsed.data.brand })
      : { ...parsed.data.brand, collections: parsed.data.brand.collections ?? [], announcement: "" };
    /* toda loja sai com logo, inclusive a preenchida à mão: sem isto o
       cabeçalho do site entregue ficava com o espaço da marca vazio */
    if (!marca.logoDataUri) marca.logoDataUri = logoDaMarca(marca).dataUri;

    /**
     * As imagens que vão para o TEMA são só as reais: o que o cliente enviou ou
     * o provedor gerou. A arte local da Orbis fica na prévia e no site estático
     * entregue — em setting de tema ela é um data URI, e data URI no
     * `image_picker` derruba o template na Shopify (a home vira 404). Onde não
     * há imagem real, o tema segue com a imagem que ele já trazia.
     */
    const pecas = pecasDaMarca({ ...marca, nicheId: parsed.data.nicheId });
    const imagens: Record<string, string> = {};
    for (const peca of pecas) {
      const enviada = parsed.data.imagens?.[peca.chave];
      if (enviada) imagens[peca.chave] = enviada;
      /**
       * O ACOMPANHANTE de uma peça também entra.
       *
       * A composição do banner devolve dois arquivos por dobra — o largo e o
       * alto —, e o alto se chama `<peça>-mobile`. Ele não está na lista de
       * peças, porque não é uma geração: nasce da arte, no navegador.
       *
       * Sem esta linha ele era descartado aqui, calado, e o efeito era o
       * contrário do pedido: o campo do celular ficava com o corte largo E o
       * tema voltava a escrever o texto por cima, porque o sinal de "a arte já
       * tem texto" nunca chegava. A lista continua fechada: só entra o que é
       * acompanhante de uma peça que existe.
       */
      const acompanhante = parsed.data.imagens?.[`${peca.chave}-mobile`];
      if (acompanhante) imagens[`${peca.chave}-mobile`] = acompanhante;
    }

    /**
     * O TEMA ESCOLHIDO — ou nenhum. Substituto em silêncio, nunca.
     *
     * O id caía num valor de reserva — o ShrinePro — quando o tema escolhido
     * não fosse encontrado, e o remendo mentia de três jeitos ao mesmo tempo.
     * O cliente escolhe um tema na tela, e se ele não
     * estivesse publicado no instante do envio a loja saía sobre OUTRO tema,
     * sem uma palavra. Pior: a marca só era aplicada quando `escolhido`
     * existia, então nesse caso o pacote saía sem tema Shopify nenhum — só a
     * prévia estática, que é justamente a entrega quebrada que o resto deste
     * arquivo existe para não repetir. E hoje o próprio `shrine-pro` está
     * arquivado, então a rede de segurança falha ao ser acionada.
     *
     * A lista que o cliente vê é a área Temas do estúdio (`/api/bootstrap`, só
     * publicados). Se o que ele escolheu não está mais lá, a resposta certa é
     * dizer isso.
     */
    const escolhido = parsed.data.themeId ? await temaPublicado(parsed.data.themeId) : null;
    if (!escolhido) {
      return Response.json(
        { error: parsed.data.themeId ? "THEME_NOT_AVAILABLE" : "THEME_REQUIRED" },
        { status: parsed.data.themeId ? 404 : 400 },
      );
    }
    const themeId = escolhido.id;

    /**
     * Tema sem dados Shopify não entrega loja — e isso se descobre ANTES de
     * cobrar.
     *
     * Uma linha de tema pode existir sem `.shopify`: a semeada, por exemplo,
     * nasce só com o modelo nativo. Seguindo daqui, o pacote sairia sem layout,
     * sem templates e sem seções — um site estático com nome de loja, que a
     * Shopify recusa na importação. Conferir depois do `unlockTheme` deixaria
     * para trás um projeto criado e um desbloqueio cobrado por um pacote que
     * não sobe.
     */
    let shopify: ShopifyThemeImport | null = null;
    try { shopify = (JSON.parse(escolhido.defaults) as { shopify?: ShopifyThemeImport }).shopify ?? null; } catch { shopify = null; }
    if (!shopify) return Response.json({ error: "THEME_WITHOUT_SHOPIFY_DATA" }, { status: 409 });

    const unlocked = await unlockTheme(viewer, themeId, `client-site-${crypto.randomUUID()}`);
    const projectId = unlocked.projectId as string;

    /* a customização base vem do gerador do site; quando o tema tem Shopify
       importado, ela leva junto o tema com a marca já aplicada */
    const customizacao = brandCustomization(marca) as unknown as Record<string, unknown>;
    /**
     * O modelo nativo ANTES de receber o tema.
     *
     * É esta cópia que viaja no marcador, e ela não pode ter o `shopify`
     * dentro: além de a loja carregar duas versões de si mesma, `customizacao`
     * passa a se referenciar e o `JSON.stringify` do marcador estoura em ciclo.
     */
    const modeloNativo = { ...customizacao };
    const brand = sanitizeBrand(marca);
    /**
     * A capa de cada coleção, casada por HANDLE — e gravada, não só usada.
     *
     * Este mapa era montado na hora, dentro do pedido de prévia do fluxo do
     * cliente, e morria com ele. Quem abrisse a MESMA loja no Editor via a
     * vitrine com foto de produto sorteada pelo handle — e, com poucos
     * produtos, a mesma foto repetida em três cartões.
     *
     * A posição é o que liga `colecao-2` a "Armações de grau": as duas listas
     * saem da mesma lista de nomes, na mesma ordem.
     */
    const capasDeColecao: Record<string, string> = {};
    for (const [indice, nome] of (marca.collections ?? []).entries()) {
      const capa = imagens[`colecao-${indice + 1}`];
      const handle = handleDeColecao(String(nome));
      if (capa && handle) capasDeColecao[handle] = capa;
    }
    const resultado = aplicarMarcaNoTema(shopify, {
      ...marca,
      imagens,
      imagensGeradas: parsed.data.imagensGeradas ?? [],
    });
    /* o nicho faz a vitrine mostrar os produtos daquele nicho em toda rota de
       render; as capas fazem cada cartão mostrar a coleção dele; e o NOME
       PRÓPRIO impede que reimportar a loja grave por cima do tema de origem */
    const temaComMarca: ShopifyThemeImport = {
      ...resultado.theme,
      orbisNicheId: parsed.data.nicheId,
      ...(Object.keys(capasDeColecao).length ? { orbisCapas: capasDeColecao } : {}),
      orbisLoja: { nome: brand.name, slug: brand.slug },
      orbisCustomizacao: modeloNativo,
    };
    customizacao.shopify = temaComMarca;
    const alterados = resultado.alterados;
    await saveProject(viewer, projectId, customizacao);

    await getD1()
      .prepare("UPDATE projects SET name = ? WHERE id = ? AND user_id = ?")
      .bind(`Loja de ${brand.name}`, projectId, viewer.id)
      .run();

    const site = generateClientSite({ brand: marca, templateId: parsed.data.templateId });
    /* a prévia local vai numa subpasta: o topo do ZIP tem de ser o tema, senão
       a Shopify recusa com "missing template layout/theme.liquid" */
    const arquivos: Record<string, Uint8Array> = {};
    for (const [caminho, conteudo] of Object.entries(site.files as Record<string, string | Uint8Array>)) {
      arquivos[`previa-local/${caminho}`] = typeof conteudo === "string" ? strToU8(conteudo) : conteudo;
    }

    /**
     * O KIT DE LOGO, desenhado e não gerado.
     *
     * A peça "logo" pedida ao gerador voltava foto de produto — um frasco, uma
     * bolsa — porque é o que um modelo de imagem faz bem; e quando acertava o
     * símbolo, vinha com fundo pintado dentro do arquivo. Logo é geometria e
     * cor, então sai de vetor: exato, reproduzível, com transparência de
     * verdade e no tamanho que se pedir.
     *
     * Nomes de arquivo estáveis, porque a ideia declarada é automatizar a
     * subida depois: adivinhar nome é o que impede automação.
     */
    const kit = kitDeLogo(marca);
    for (const peca of kit) {
      arquivos[`previa-local/logo-da-marca/${peca.arquivo}.svg`] = strToU8(peca.svg);
    }
    arquivos["previa-local/logo-da-marca/COMO-USAR-O-LOGO.txt"] = strToU8(
      [
        "KIT DE LOGO DE " + String(marca.name ?? "").toUpperCase(),
        "",
        "Sao arquivos VETORIAIS (.svg): nao perdem qualidade em tamanho nenhum e",
        "tem fundo transparente de verdade, menos os que dizem 'fundo branco' ou",
        "'fundo preto' no nome.",
        "",
        "ONDE VAI CADA UM",
        ...kit.map((p) => `  ${p.arquivo}.svg  (${p.largura}x${p.altura})  ${p.uso}`),
        "",
        "NA SHOPIFY",
        "  Logo do cabecalho: Tema > Personalizar > Cabecalho > Logo.",
        "    Use logo-horizontal ou logo-extenso.",
        "  Favicon: Tema > Personalizar > Configuracoes do tema > Favicon.",
        "",
        "SE A SHOPIFY RECUSAR O .SVG",
        "  Ela aceita SVG em Files, mas alguns campos so pegam PNG ou JPG.",
        "  Abra o .svg no navegador, clique com o botao direito e salve como",
        "  imagem, ou use qualquer conversor. O vetor e o mestre: converta a",
        "  partir dele, nunca de um PNG ja reduzido.",
      ].join("\r\n"),
    );

    /**
     * O CATÁLOGO, que não cabe no tema.
     *
     * Produto não é arquivo de tema: um ZIP de tema leva Liquid, CSS, JS e
     * configurações, e o catálogo é dado da loja. Por isso a loja subia bonita
     * e vazia, e não havia como consertar isso dentro do tema. O caminho
     * oficial é o CSV de importação, e ele resolve as fotos de brinde: a coluna
     * de imagem aceita URL externa e a Shopify baixa cada uma na importação.
     *
     * Vai dentro de `previa-local/`, que a Shopify ignora ao subir o tema — um
     * arquivo solto na raiz do pacote é risco de a importação do tema recusar.
     */
    /* as coleções vão no CSV: é a importação que as CRIA, e é por isso que o
       tema pode apontar para elas sem deixar cartão vazio */
    const csv = csvDeProdutos(parsed.data.nicheId, marca.collections ?? []);
    if (csv) {
      arquivos["previa-local/produtos-para-importar.csv"] = strToU8(csv);
      arquivos["previa-local/COMO-SUBIR-OS-PRODUTOS.txt"] = strToU8(
        [
          "COMO SUBIR OS PRODUTOS DESTA LOJA",
          "",
          "O tema e o catalogo sao duas coisas separadas na Shopify. O ZIP sobe o tema;",
          "os produtos entram por importacao, e e isso que este arquivo faz.",
          "",
          "1. Na Shopify, abra Produtos e clique em Importar.",
          "2. Escolha o arquivo produtos-para-importar.csv, aqui desta pasta.",
          "3. Confirme. A Shopify baixa as fotos sozinha durante a importacao,",
          "   entao nao e preciso subir imagem nenhuma a mao.",
          "",
          "A importacao TAMBEM cria as colecoes da loja (a coluna Collection do",
          "arquivo). Sem esse passo os cartoes de colecao do tema aparecem",
          "vazios, porque apontam para colecoes que ainda nao existem.",
          "",
          "Depois disso a vitrine do tema mostra os produtos.",
        ].join("\r\n"),
      );
    }

    /* O tema Shopify de verdade: o ZIP tem de subir em Temas → Adicionar tema.
       Sem isto a entrega era um site estático, e a importação falhava. */
    const tema = temaComMarca ? await montarTemaShopify(viewer.id, temaComMarca) : null;
    /**
     * O tema entra SEM a pasta de prévia.
     *
     * `previa-local/` não é conteúdo de tema — é o material que a Orbis põe ao
     * lado dele no pacote. Só que um tema importado a partir de um pacote
     * ENTREGUE pela Orbis carrega essa pasta dentro de si, e como os arquivos
     * do tema são gravados depois, ela sobrescrevia o CSV, o leia-me e as
     * imagens desta entrega com os da entrega ANTERIOR, congelados.
     *
     * Foi um caso real e sorrateiro: o CSV saía sempre no formato antigo por
     * mais que o código estivesse certo, porque o arquivo certo era escrito e
     * logo apagado. O sintoma parecia cache do servidor; a causa era ordem de
     * escrita mais uma pasta que nunca deveria ter entrado no tema.
     */
    /**
     * A arte da marca NÃO entra em `assets/`.
     *
     * A Shopify recusa tema acima de 50 MB, e a arte estava no pacote DUAS
     * vezes: uma em `assets/` e outra na pasta de upload. Seis imagens em 4k
     * passam de 12 MB cada, então o ZIP batia em 140 MB e nem chegava a ser
     * avaliado.
     *
     * A cópia em `assets/` não servia a ninguém: o `image_picker` da Shopify só
     * enxerga o que está em Content → Files, então é de lá que o tema busca a
     * imagem, pelo nome. O arquivo dentro do tema era peso puro.
     */
    const arteDaMarca = (caminho: string) =>
      /^assets\/orbis-/.test(caminho) && /\.(png|jpe?g|webp|gif|svg|avif)$/i.test(caminho);
    if (tema) {
      for (const [caminho, dados] of Object.entries(tema)) {
        if (caminho.startsWith("previa-local/")) continue;
        if (arteDaMarca(caminho)) continue;
        arquivos[caminho] = dados;
      }
    }

    /**
     * AS IMAGENS, numa pasta em que dê para achá-las.
     *
     * A Shopify não deixa um tema carregar as próprias imagens de vitrine: o
     * `image_picker` é populado só com os arquivos de Content → Files, e ZIP de
     * tema não leva imagem de loja (documentado por eles). Por isso a loja
     * subia com os quadros em branco.
     *
     * Só que a saída já estava meio pronta e ninguém sabia: a exportação grava
     * a arte em `assets/` e a referência aponta para o MESMO nome de arquivo.
     * Basta esses arquivos existirem em Files e o tema os encontra sozinho. O
     * que faltava era achá-los no meio de uma centena de CSS e JS, com nome
     * embaralhado. Aqui eles saem separados, com o nome que a referência
     * espera, ao lado da instrução.
     */
    const paraFiles = Object.entries(tema ?? {}).filter(([caminho]) => arteDaMarca(caminho));
    if (paraFiles.length) {
      for (const [caminho, dados] of paraFiles) {
        arquivos[`previa-local/imagens-para-a-shopify/${caminho.slice("assets/".length)}`] = dados;
      }
      arquivos["previa-local/imagens-para-a-shopify/COMO-SUBIR-AS-IMAGENS.txt"] = strToU8(
        [
          "COMO FAZER AS IMAGENS APARECEREM NA SHOPIFY",
          "",
          "A Shopify nao deixa um tema carregar as proprias imagens: o seletor de",
          "imagem so enxerga o que esta em Content > Files. Por isso a loja sobe com os",
          "quadros em branco, e nao ha jeito de resolver isso dentro do tema.",
          "",
          "A boa noticia e que o tema ja procura por estes arquivos, pelo nome exato.",
          "",
          "1. Na Shopify, abra Content > Files.",
          "2. Suba TODOS os arquivos desta pasta (menos este .txt).",
          "3. Nao renomeie nenhum: o tema procura pelo nome que esta aqui.",
          "",
          "Pronto. Recarregue a loja e as imagens aparecem, sem mexer no editor.",
          "",
          `Arquivos desta pasta: ${paraFiles.length}`,
          ...paraFiles.map(([caminho]) => `  ${caminho.slice("assets/".length)}`),
        ].join("\r\n"),
      );
    }

    /* o tema sai sabendo de que loja ele é: reimportar a própria loja tem de
       trazer a vitrine dela de volta, não o catálogo de demonstração */
    arquivos[ARQUIVO_DA_LOJA] = strToU8(marcadorDaLoja(parsed.data.nicheId ?? "", capasDeColecao, {
      nome: brand.name,
      slug: brand.slug,
      customizacao: modeloNativo,
    }));

    const zip = zipSync(arquivos, { level: 6 });
    /**
     * O TETO DA SHOPIFY, medido antes de entregar.
     *
     * Ela recusa upload de tema acima de 50 MB. Um pacote que passa disso não
     * dá erro aqui: dá erro lá, no momento em que a pessoa foi subir a loja, e
     * ela não tem como saber por quê. Medir aqui custa uma subtração.
     *
     * O número vai no cabeçalho SEMPRE, não só quando estoura: é assim que dá
     * para ver a folga encolhendo antes de ela acabar.
     */
    const TETO_DA_SHOPIFY = 50 * 1024 * 1024;
    const megas = (zip.byteLength / (1024 * 1024)).toFixed(1);

    /**
     * O projeto fica FINALIZADO — e só aqui.
     *
     * Não quando o cliente confirma, não quando a montagem começa: quando o
     * pacote existe e está saindo. Marcar antes seria dizer "pronto" sobre uma
     * loja que ainda pode falhar na linha seguinte, e o `catch` abaixo não teria
     * como desdizer sem sobrescrever um estado que talvez já fosse outro.
     */
    await getD1()
      .prepare("UPDATE projects SET status = 'completed', updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?")
      .bind(projectId, viewer.id)
      .run();

    return new Response(zip.slice().buffer, {
      headers: {
        "content-type": "application/zip",
        "content-disposition": `attachment; filename="loja-${site.brand.slug}.zip"`,
        "x-theme-size-mb": megas,
        ...(zip.byteLength > TETO_DA_SHOPIFY ? { "x-theme-too-large": megas } : {}),
        "x-site-name": site.brand.slug,
        "x-project-id": projectId,
        "x-theme-id": themeId,
        "x-brand-settings": String(alterados.length),
        "x-theme-files": String(tema ? Object.keys(tema).length : 0),
        "cache-control": "no-store",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "UNEXPECTED_ERROR";
    return Response.json({ error: message }, { status: message.includes("NOT_FOUND") ? 404 : 500 });
  }
}
