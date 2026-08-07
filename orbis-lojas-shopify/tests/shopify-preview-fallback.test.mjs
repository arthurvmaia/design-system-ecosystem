import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const previewUrl = new URL("../app/ShopifyStorePreview.tsx", import.meta.url);
const appShellUrl = new URL("../app/AppShell.tsx", import.meta.url);
const renderUrl = new URL("../lib/theme-render.ts", import.meta.url);

test("o fallback do preview não contém conteúdo inventado pelo app", async () => {
  const source = await readFile(previewUrl, "utf8");
  /* frases que já apareceram como se fossem do tema — proibidas de voltar */
  assert.doesNotMatch(source, /GUIA SHRINE/);
  assert.doesNotMatch(source, /Como criar uma rotina que funciona/);
  assert.doesNotMatch(source, /Envios e entregas/);
  assert.doesNotMatch(source, /Produtos essenciais, selecionados com cuidado/);
  assert.doesNotMatch(source, /Perceberam melhora na rotina/);
  assert.doesNotMatch(source, /Produto excelente e entrega muito rápida/);
  assert.doesNotMatch(source, /Compra segura/);
  /* frete grátis fixo de R$199 morreu: a meta só existe se o tema declarar */
  assert.doesNotMatch(source, /total >= 199|199 - total/);
  assert.match(source, /freeShippingGoalFrom/);
  /* dados de loja simulados aparecem declarados, não disfarçados */
  assert.match(source, /shopify-demo-flag/);
});

test("a paleta do fallback nasce dos color schemes reais do tema", async () => {
  const source = await readFile(previewUrl, "utf8");
  assert.match(source, /export function schemePalette/);
  assert.match(source, /section\.settings\.color_scheme/);
  /* o primeiro scheme do tema tem prioridade sobre as heurísticas de nome */
  assert.match(source, /scheme\.background \?\? firstNamedColor/);
});

test("o editor expõe os controles de paridade com a Shopify", async () => {
  const source = await readFile(appShellUrl, "utf8");
  assert.match(source, /function ShopifySchemeSelect/);
  assert.match(source, /function ShopifyHandleListField/);
  assert.match(source, /function ShopifyFontPickerControl/);
  /* presets: cada preset do schema é uma opção própria ao adicionar seção */
  assert.match(source, /schema\.presets\.length > 1/);
  assert.match(source, /presetIndex/);
  /* contador de blocos x\/y */
  assert.match(source, /className="block-count"/);
  /* radio de verdade quando o schema traz opções */
  assert.match(source, /type === "radio" && setting\.options/);
  /* miniaturas derivam do tema importado */
  assert.match(source, /shopifyPalette\?\.accent \?\? palette\.hero\.accentColor/);
  /* sementes demo só quando o tema não referencia recursos */
  assert.match(source, /if \(!handles\.size\)/);
});

test("a ponte do preview sincroniza nos dois sentidos", async () => {
  const render = await readFile(renderUrl, "utf8");
  assert.match(render, /orbisSection/);
  assert.match(render, /orbisScrollTo/);
  /* links do tema navegam o preview (rotas reais, não âncoras mortas) */
  assert.match(render, /orbisNavigate/);
  assert.match(render, /cart_url: "\/cart"/);
  assert.match(render, /all_products_collection_url: "\/collections\/all"/);
  const preview = await readFile(previewUrl, "utf8");
  assert.match(preview, /postMessage\(\{ orbisScrollTo: selectedSectionId \}/);
  assert.match(preview, /export function resolvePreviewPageId/);
});

test("a aba Editar código existe com explorer e gravação", async () => {
  const appShell = await readFile(appShellUrl, "utf8");
  assert.match(appShell, /id: "code" as const, label: "Editar código"/);
  assert.match(appShell, /function ThemeCodeView/);
  assert.match(appShell, /\/api\/theme-code/);
  /* o card do tema tem o atalho, como o menu do tema na Shopify */
  assert.match(appShell, /onEditCode/);
});
