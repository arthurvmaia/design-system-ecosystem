import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

/** Fase 2: a fundação dos previews normaliza Tema e Projeto com dados reais. */

const fakeShopify = {
  format: "shopify-os-2.0",
  themeName: "Tema Real",
  version: "2.0",
  author: "Loja",
  sourceFile: "tema.zip",
  sourceFingerprint: "abcdef0123456789",
  importedAt: new Date().toISOString(),
  summary: { fileCount: 10, templateCount: 7, jsonTemplateCount: 7, liquidTemplateCount: 0, sectionDefinitionCount: 12, editableSettingCount: 40, assetCount: 3, snippetCount: 2, localeCount: 1, layoutCount: 1 },
  sourceFiles: [],
  compatibility: { architecture: "Shopify OS 2.0", preservedSource: true, externalData: [] },
  globalGroups: [],
  globalValues: { colors_accent_1: "#6d388b", colors_background_1: "#ffffff", colors_text: "#121212" },
  sectionSchemas: [],
  pages: [{ id: "index", name: "Página inicial", template: "templates/index.json", sections: [] }],
  assetPreview: "/api/theme-assets?fp=abcdef0123456789&path=assets%2Fbanner.png",
};

test("previewFromTheme e previewFromProject derivam imagem, paleta e status do tema real", async () => {
  const server = await createServer({ configFile: false, root: fileURLToPath(new URL("..", import.meta.url)), server: { middlewareMode: true }, appType: "custom", logLevel: "silent" });
  try {
    const { previewFromTheme, previewFromProject } = await server.ssrLoadModule("/app/preview-model.ts");

    const theme = previewFromTheme({ id: "t1", name: "Tema Real", slug: "tema-real", description: "", category: "Loja virtual", tokenPrice: 0, version: "2.0", author: "Loja", languages: [], sectionCount: 12, featured: 1, badge: "TEMA IMPORTADO", defaultSettings: { shopify: fakeShopify } });
    assert.equal(theme.image, fakeShopify.assetPreview, "a imagem é a foto real eleita na importação");
    assert.equal(theme.palette.accent, "#6d388b", "a paleta vem dos settings reais");
    assert.equal(theme.status?.label, "ZIP preservado");
    assert.ok(theme.meta.includes("7 páginas"));

    const project = previewFromProject({ id: "p1", themeId: "t1", themeName: "Tema Real", name: "Loja Nova", status: "published", customization: { shopify: fakeShopify }, publishedSlug: null, createdAt: "2026-08-01 10:00:00", updatedAt: "2026-08-07 10:00:00" });
    assert.equal(project.palette.accent, "#6d388b");
    assert.equal(project.status?.label, "PUBLICADO");
    assert.equal(project.status?.tone, "ok");
    assert.equal(project.subtitle, "Tema Real");

    /* sem dados Shopify: cai na paleta do caminho legado, sem inventar imagem */
    const semShopify = previewFromTheme({ id: "t2", name: "Sem Dados", slug: "x", description: "", category: "Loja virtual", tokenPrice: 0, version: "1", author: "", languages: [], sectionCount: 0, featured: 0, badge: null, defaultSettings: {} });
    assert.equal(semShopify.image, undefined);
    assert.ok(/^#[0-9a-f]{6}$/i.test(semShopify.palette.accent));
  } finally {
    await server.close();
  }
});

test("PreviewCard cobre carregamento, erro de imagem e fallback com paleta", async () => {
  const source = await readFile(new URL("../app/PreviewCard.tsx", import.meta.url), "utf8");
  assert.match(source, /onError=\{\(\) => setImageState\("erro"\)\}/, "erro de imagem cai no mock");
  assert.match(source, /PreviewMock/, "mock com a paleta real quando não há foto");
  assert.match(source, /PreviewCardSkeleton/, "esqueleto para listas carregando");
  assert.match(source, /--pc-accent/, "o mock é pintado pela paleta do modelo");
  assert.match(source, /aria-label/, "cartão acessível");
});

test("Fase 3: a área de Temas usa a fundação (card grande + biblioteca)", async () => {
  const source = await readFile(new URL("../app/AppShell.tsx", import.meta.url), "utf8");
  assert.match(source, /previewFromTheme\(theme\)/, "ThemeCard nasce do normalizador");
  /* o tema ESCOLHIDO fica em destaque; os demais na biblioteca */
  assert.match(source, /const principal = destaque \?\? data\.themes\[0\];/);
  assert.match(source, /const biblioteca = data\.themes\.filter\(\(theme\) => theme\.id !== principal\.id\);/);
  assert.match(source, /cardFor\(principal, "grande"\)/);
  /* seletores para trocar de tema e de projeto sem sair da tela */
  assert.match(source, /className="theme-switcher"/, "seletor de tema em destaque");
  assert.match(source, /className="editor-project-switch"/, "seletor de projeto no editor");
  assert.doesNotMatch(source, /mini-store/, "o mock antigo do card saiu de cena");
});

test("Fase 4: a área de Projetos usa a fundação com ações próprias", async () => {
  const source = await readFile(new URL("../app/AppShell.tssx".replace("tssx","tsx"), import.meta.url), "utf8");
  assert.match(source, /previewFromProject\(project\)/, "ProjectRow nasce do normalizador");
  assert.match(source, /size="lista"/, "projetos em modo lista");
  assert.match(source, /Tema: \{project\.themeName\}/, "tema relacionado visível");
  assert.doesNotMatch(source, /project-thumb/, "o thumb antigo de três barras saiu");
});

test("RECUPERAÇÃO F2: a miniatura é a home REAL pelo motor existente, não um mock", async () => {
  const card = await readFile(new URL("../app/PreviewCard.tsx", import.meta.url), "utf8");
  assert.match(card, /function RealHomeThumbnail/, "motor de miniatura real existe");
  assert.match(card, /\/api\/theme-render/.source ? /fetch\(src\)/ : /fetch\(src\)/, "busca o HTML real da rota de render");
  assert.match(card, /homeHtmlCache/, "cache por URL, sem regenerar a cada render");
  assert.match(card, /IntersectionObserver/, "carregamento tardio: só quando o card aparece");
  /* o observer sozinho não basta: em aba oculta ele nunca reporta e a
     miniatura ficaria presa em carregando — a geometria é quem decide */
  assert.match(card, /getBoundingClientRect\(\)/, "verificação geométrica como rede de segurança");
  assert.match(card, /addEventListener\("scroll", checar/, "rolagem reavalia sem depender do observer");
  /* nem observer nem eventos chegam em toda situação (aba sem composição,
     viewport trocado por fora, card que ganha layout depois): sem a ronda a
     home fica presa em "carregando" ou na escala antiga */
  assert.match(card, /setInterval\(checar/, "ronda de segurança para a visibilidade");
  assert.match(card, /setInterval\(apply/, "ronda de segurança para a escala");
  assert.match(card, /pointer-events/.source ? /tabIndex=\{-1\}/ : /tabIndex=\{-1\}/, "iframe inerte para foco");
  assert.match(card, /Tentar de novo/, "erro real com nova tentativa, sem imagem falsa");
  assert.match(card, /homeSrc \? \(\s*<RealHomeThumbnail/, "quando a home real existe, o mock NUNCA aparece");
  const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.match(css, /\.home-thumb-frame \{[^}]*pointer-events: none/, "nenhuma interação atravessa a miniatura");
  const route = await readFile(new URL("../app/api/theme-render/route.ts", import.meta.url), "utf8");
  assert.match(route, /projectId/, "a MESMA rota de render serve projetos");
  assert.match(route, /WHERE id = \? AND user_id = \?/, "projeto escopado ao dono");
});

test("RECUPERAÇÃO F3: cada tema mostra a home real DELE na área de Temas", async () => {
  const source = await readFile(new URL("../app/AppShell.tsx", import.meta.url), "utf8");
  /* a URL carrega o id do PRÓPRIO tema — nada de preview compartilhado */
  assert.match(source, /homeSrc = model\.renderable \? `\/api\/theme-render\?themeId=\$\{encodeURIComponent\(theme\.id\)\}&page=index`/);
  assert.match(source, /homeSrc=\{homeSrc\}/, "o card recebe a home real");
  assert.match(source, /unavailableReason=/, "sem ZIP preservado, o motivo é declarado");
  assert.doesNotMatch(source, /previewFromTheme\(theme\)[\s\S]{0,400}PreviewMock/, "o mock não é o preview final de tema");
});

test("RECUPERAÇÃO F4: cada projeto mostra a home do SEU estado atual", async () => {
  const source = await readFile(new URL("../app/AppShell.tsx", import.meta.url), "utf8");
  assert.match(source, /\/api\/theme-render\?projectId=\$\{encodeURIComponent\(project\.id\)\}/, "a home vem do próprio projeto, não do tema de origem");
  /* updatedAt na URL: salvar o projeto invalida o cache da miniatura */
  assert.match(source, /v=\$\{encodeURIComponent\(project\.updatedAt\)\}/);
  assert.match(source, /unavailableReason=\{model\.renderable \? undefined :/, "sem ZIP, motivo declarado");
});

test("RECUPERAÇÃO F5: a escala da miniatura acompanha a largura em qualquer viewport", async () => {
  const card = await readFile(new URL("../app/PreviewCard.tsx", import.meta.url), "utf8");
  /* o ResizeObserver também não entrega callback sem composição: sem o resize
     da janela, a home ficaria na escala da largura anterior ao trocar de
     viewport (cortada no mobile) */
  assert.match(card, /window\.addEventListener\("resize", apply/);
  assert.match(card, /host\.clientWidth \/ baseWidth/, "escala derivada da largura real do card");
});

test("links do tema navegam a prévia em qualquer modo, e Visualizar abre em tela cheia", async () => {
  const render = await readFile(new URL("../lib/theme-render.ts", import.meta.url), "utf8");
  /* o clique em link é tratado à parte do desvio do modo de seleção:
     selecionar a seção não pode impedir a navegação entre páginas */
  assert.match(render, /if\(anchor\)\{var externo=anchor\.getAttribute\("href"\)/);
  assert.match(render, /orbisNavigate:href/);
  const appShell = await readFile(new URL("../app/AppShell.tsx", import.meta.url), "utf8");
  assert.match(appShell, /function ThemeFullscreenPreview/);
  assert.match(appShell, /className="janela-botao janela-fechar fullscreen-preview-close"/, "X de saída");
  assert.match(appShell, /event\.key === "Escape"/, "Esc também fecha");
  /* janela em três tamanhos, para poder mexer no app por trás */
  assert.match(appShell, /useState<"cheia" \| "media" \| "minimizada">/);
  assert.match(appShell, /aria-label=\{minimizada \? "Restaurar prévia" : "Minimizar prévia"\}/);
  assert.match(appShell, /hidden=\{minimizada\}/, "ao minimizar a loja fica montada, sem recarregar");
  assert.match(appShell, /mode="interagir"/, "na tela cheia a loja é navegável");
  assert.doesNotMatch(appShell, /ThemeModalPreview/, "o modal antigo saiu de cena");
  const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.match(css, /\.fullscreen-preview \{[^}]*position: fixed;[^}]*inset: 0/, "ocupa a tela toda");
});

test("a prévia respeita o JS do tema: gaveta do carrinho não vira troca de página", async () => {
  const render = await readFile(new URL("../lib/theme-render.ts", import.meta.url), "utf8");
  /* a decisão de navegar acontece na BOLHA, depois do tema: se ele tratou o
     clique (carrinho que abre a gaveta, menu, modal), a prévia não navega */
  assert.match(render, /if\(!anchor\|\|event\.defaultPrevented\)\{return;\}/);
  /* a captura só impede sair para a internet — não atrapalha o tema */
  assert.match(render, /externo\.indexOf\("https:\/\/"\)===0/);
  const appShell = await readFile(new URL("../app/AppShell.tsx", import.meta.url), "utf8");
  /* o seletor lista TODAS as páginas: cortar fazia o rótulo mentir quando um
     link levava a login/404/cadastro */
  assert.match(appShell, /const paginas = \(shopify\?\.pages \?\? \[\]\)\.filter\(\(item\) => !item\.id\.includes\("-group"\)\);/);
});

test("carrinho do preview: formulário fiel, Ajax Cart API simulada e gaveta com itens", async () => {
  const render = await readFile(new URL("../lib/theme-render.ts", import.meta.url), "utf8");
  /* o {% form %} precisa parecer com o da Shopify, senão o tema nem tenta
     adicionar: é por data-type="add-to-cart-form" que ele acha o formulário */
  assert.match(render, /data-type="add-to-cart-form"/);
  assert.match(render, /name="form_type"/);
  assert.match(render, /product: "\/cart\/add"/);
  /* a compra é tratada pelo próprio preview: cada tema liga o botão de um
     jeito e muitos vêm ofuscados */
  assert.match(render, /function comprar\(form\)/);
  assert.match(render, /secoesDaGaveta/);
  assert.match(render, /function abrirGaveta/);
  /* sem gaveta no tema, o item aparece na página do carrinho */
  assert.match(render, /orbisNavigate:"\/cart"/);
  /* o carrinho renderiza de verdade no Liquid */
  assert.match(render, /function buildCart/);
  /* a vitrine da renderização entra como parâmetro: loja de pet e loja de
     óculos podem renderizar ao mesmo tempo sem trocar de catálogo */
  assert.match(render, /cart: buildCart\(loja, cartItems\)/);
  assert.match(render, /onlySections/, "Section Rendering API para atualizar a gaveta");
  const preview = await readFile(new URL("../app/ShopifyStorePreview.tsx", import.meta.url), "utf8");
  assert.match(preview, /cartRef/, "o carrinho sobrevive à troca de página");
  assert.match(preview, /orbisCartEstado/);
  /* cada rota de conta abre a SUA página */
  assert.match(preview, /register: \["customers\/register"/);
  assert.match(preview, /recover: \["customers\/reset_password"/);
});

test("gaveta do carrinho: blocos reais, abre e fecha, e o selo sai do caminho", async () => {
  const importer = await readFile(new URL("../lib/shopify-theme.ts", import.meta.url), "utf8");
  /* seções globais de tema clássico guardam a configuração (e os blocos) em
     settings_data.current.sections: sem ler isso, a gaveta nascia SEM blocos
     e aparecia vazia mesmo com produto dentro */
  assert.match(importer, /function parseLegacyGlobalGroups\(\s*layout: string,\s*schemaByType[^)]*currentSections/s);
  assert.match(importer, /if \(text\(raw\.type, ""\) === type\) return sectionFromRecord\(key, raw, schemaByType\);/);

  const render = await readFile(new URL("../lib/theme-render.ts", import.meta.url), "utf8");
  /* {% render %} isola escopo: sem section nos globais, o corpo da gaveta
     (montado por blocos dentro de um snippet) saía vazio */
  assert.match(render, /globals\.section = drop;/);
  assert.match(render, /for \(const section of group\.sections\) parts\.push\(await renderSectionInstance\(section\)\);/);
  /* abrir/fechar cobre o custom element E o contêiner interno */
  assert.match(render, /function alvosDaGaveta/);
  assert.match(render, /function fecharGaveta/);
  assert.match(render, /keydown[\s\S]{0,60}Escape[\s\S]{0,40}fecharGaveta/);
  /* a gaveta não precisa estar dentro de uma seção: no Dawn ela é filha direta
     do body, e a exigência antiga deixava a lista vazia — o ícone do carrinho
     não abria nada */
  assert.doesNotMatch(render, /alvosDaGaveta\(\)\{[\s\S]{0,300}?shopify-section/);
  /* o modo de seleção AVISA, não bloqueia: com o clique engolido, o menu de
     três barras, a busca e o carrinho do tema não respondiam */
  const captura = render.match(/CAPTURA \(antes do tema\)[\s\S]*?BOLHA \(depois do tema\)/);
  assert.ok(captura, "o handler de captura sumiu do bridge");
  assert.doesNotMatch(captura[0], /stopPropagation/);
  assert.match(captura[0], /mode==="selecionar"[\s\S]{0,200}orbisSection/);

  const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  /* o selo vira faixa no topo: no canto direito ele cobria o X da gaveta */
  assert.match(css, /\.live-render-badge \{[^}]*top: 0;[^}]*left: 0;[^}]*right: 0/);
  assert.match(css, /\.editor-group \+ \.editor-group \{[^}]*border-left/);
});

test("a barra de ações do editor não pode ser cortada pelo corpo", async () => {
  const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");

  /* A linha da barra no shell precisa ser `auto`. Com altura fixa, o dia em que
     a barra pedir duas linhas ela não cresce: o excedente sai do box e o
     `.editor-body`, que começa exatamente onde a linha acaba, passa por cima.
     Foi o que aconteceu — EXPORTAR ZIP, CRIAR VERSÃO e PUBLICAR ficaram
     cortados ao meio e sem receber clique. O único caminho de saída do produto
     é o ZIP, então o botão dele inalcançável fecha o produto. */
  const shell = css.match(/\.editor-shell \{[^}]*\}/)?.[0] ?? "";
  assert.ok(shell, "regra .editor-shell sumiu");
  assert.match(shell, /grid-template-rows:\s*auto\s/, ".editor-shell não pode fixar a altura da barra em px");

  /* E a barra declara UMA COLUNA POR FILHO: projeto · dispositivo · modo ·
     ações. Um filho a mais que o template cai numa linha implícita que ninguém
     dimensionou, em silêncio — foi assim que o seletor de modo empurrou as
     ações para fora. Se um quinto grupo entrar na barra, este teste reprova
     antes de a tela quebrar. */
  const toolbar = css.match(/\n\.editor-toolbar \{[^}]*\}/)?.[0] ?? "";
  assert.ok(toolbar, "regra .editor-toolbar sumiu");
  const colunas = toolbar.match(/grid-template-columns:([^;]*);/)?.[1] ?? "";
  const trilhas = colunas.trim().split(/\s+(?![^(]*\))/).filter(Boolean).length;
  const shellTsx = await readFile(new URL("../app/AppShell.tsx", import.meta.url), "utf8");
  const marcacao = shellTsx.match(/className="editor-toolbar">[\s\S]*?<div className="editor-controls"/)?.[0] ?? "";
  assert.ok(marcacao, "não achei a marcação da barra no AppShell");
  const filhos = new Set(
    (marcacao.match(/className="(editor-project|device-switch|mode-switch|editor-controls)"/g) ?? []).map((m) => m),
  ).size;
  assert.ok(filhos >= 4, `esperava ao menos 4 grupos na barra, encontrei ${filhos}`);
  assert.equal(trilhas, filhos, `a barra tem ${filhos} grupos e ${trilhas} colunas: o excedente cai numa linha implícita`);

  /* O seletor de modo só existe no fluxo Shopify, então a barra tem 3 ou 4
     filhos. As ações ficam presas na última coluna para não apertarem quando
     for 3. */
  const controles = css.match(/\.editor-controls \{[^}]*\}/)?.[0] ?? "";
  assert.match(controles, /grid-column:\s*-2\s*\/\s*-1/);
});
