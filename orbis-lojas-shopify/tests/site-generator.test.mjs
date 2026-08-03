import assert from "node:assert/strict";
import test from "node:test";
import { strToU8, strFromU8, unzipSync, zipSync } from "fflate";
import { SITE_TEMPLATES, brandCustomization, generateClientSite, sanitizeBrand, slugify } from "../lib/site-generator.mjs";

const BRAND = {
  name: "Aurora Café",
  slogan: "Cafés especiais torrados na hora",
  primaryColor: "#7c3aed",
  backgroundColor: "#faf8ff",
  whatsapp: "5551999998888",
  instagram: "@auroracafe",
  email: "oi@auroracafe.com.br",
};

test("cada template contém exatamente as suas seções", () => {
  const essencial = generateClientSite({ brand: BRAND, templateId: "essencial" }).files["index.html"];
  const vitrine = generateClientSite({ brand: BRAND, templateId: "vitrine" }).files["index.html"];

  assert.ok(essencial.includes('class="faq"'), "Essencial leva FAQ");
  assert.ok(essencial.includes('class="benefits"'), "Essencial leva benefícios");
  assert.ok(!essencial.includes('class="compare"'), "Essencial não leva comparação");

  assert.ok(vitrine.includes('class="compare"'), "Vitrine leva comparação");
  assert.ok(vitrine.includes("COMPRE JUNTO"), "Vitrine leva o conjunto promocional");
  assert.ok(!vitrine.includes('class="faq"'), "Vitrine não leva FAQ");
  assert.ok(!vitrine.includes('class="benefits"'), "Vitrine não leva benefícios");
});

test("a marca aparece no site: nome, cores e contatos", () => {
  const { files } = generateClientSite({ brand: BRAND, templateId: "essencial" });
  const html = files["index.html"];
  assert.ok(html.includes("Aurora Café"));
  assert.ok(html.includes("#7c3aed"), "cor principal aplicada");
  assert.ok(html.includes("#faf8ff"), "cor de fundo aplicada");
  assert.ok(html.includes("wa.me/5551999998888"), "botão de WhatsApp presente");
  assert.ok(html.includes("instagram.com/auroracafe"), "Instagram sem @ duplicado");
  assert.ok(html.includes("mailto:oi@auroracafe.com.br"));
  assert.ok(files["produto.html"].includes("Aurora Café"), "página de produto também leva a marca");
});

test("input malicioso não sobrevive no HTML gerado", () => {
  const { files } = generateClientSite({
    brand: { name: '<script>alert("x")</script>Loja "Maligna"', slogan: "<img onerror=hack>", logoDataUri: "javascript:alert(1)" },
    templateId: "essencial",
  });
  const html = files["index.html"] + files["produto.html"];
  assert.ok(!html.includes("<script>alert"), "script não entra");
  assert.ok(!html.includes("<img onerror"), "atributo de evento não entra");
  assert.ok(!html.includes("javascript:alert"), "logo inválida é descartada");
});

test("sanitizeBrand normaliza campos e rejeita o que não presta", () => {
  const brand = sanitizeBrand({
    name: "  Café & Prosa  ",
    primaryColor: "roxo",
    whatsapp: "+55 (51) 99999-8888",
    instagram: "@minha.marca",
    email: "não-é-email",
    logoDataUri: "data:text/html;base64,PGh0bWw+",
  });
  assert.equal(brand.name, "Café & Prosa");
  assert.equal(brand.primaryColor, "#0e7490", "cor inválida cai no padrão");
  assert.equal(brand.whatsapp, "+5551999998888".replace("+", "+"), "whatsapp só com dígitos e +");
  assert.equal(brand.instagram, "minha.marca");
  assert.equal(brand.email, "", "e-mail inválido vira vazio");
  assert.equal(brand.logoDataUri, "", "data URI que não é imagem é descartado");
  assert.equal(slugify("Café & Prosa"), "cafe-prosa");
});

test("customização da marca passa pelo normalizador do editor", () => {
  const customization = brandCustomization(BRAND);
  assert.equal(customization.header.brand, "Aurora Café");
  assert.equal(customization.header.accentColor, "#7c3aed");
  assert.equal(customization.footer.whatsapp, "5551999998888");
  assert.ok(customization.footer.copyright.includes("Aurora Café"));
});

test("o ZIP faz round-trip com as duas páginas dentro", () => {
  const { files, brand } = generateClientSite({ brand: BRAND, templateId: "vitrine" });
  const zip = zipSync(Object.fromEntries(Object.entries(files).map(([path, content]) => [path, strToU8(content)])));
  const extracted = unzipSync(zip);
  assert.deepEqual(Object.keys(extracted).sort(), ["index.html", "produto.html"]);
  assert.ok(strFromU8(extracted["index.html"]).startsWith("<!doctype html>"));
  assert.equal(brand.slug, "aurora-cafe");
});

test("logo do cliente vira arquivo em assets/ referenciado pelas páginas", () => {
  const TINY_PNG_BASE64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
  const { files } = generateClientSite({
    brand: { ...BRAND, logoDataUri: `data:image/png;base64,${TINY_PNG_BASE64}` },
    templateId: "essencial",
  });

  assert.ok(files["assets/logo.png"] instanceof Uint8Array, "logo vira arquivo binário");
  assert.ok(files["assets/logo.png"].length > 0);
  assert.ok(files["index.html"].includes('src="assets/logo.png"'), "cabeçalho referencia o arquivo");
  assert.ok(files["index.html"].includes('href="assets/logo.png"'), "favicon referencia o arquivo");
  assert.ok(files["produto.html"].includes('src="assets/logo.png"'), "página de produto também");
  assert.ok(!files["index.html"].includes("base64"), "nenhum data URI sobra no HTML");

  /* o ZIP entregue leva páginas (string) e logo (binário) do jeito que a rota monta */
  const zip = zipSync(Object.fromEntries(
    Object.entries(files).map(([path, content]) => [path, typeof content === "string" ? strToU8(content) : content]),
  ));
  const extracted = unzipSync(zip);
  assert.deepEqual(Object.keys(extracted).sort(), ["assets/logo.png", "index.html", "produto.html"]);
});

test("todo template declarado tem seções renderizáveis e começa no announcement", () => {
  for (const template of SITE_TEMPLATES) {
    assert.ok(template.sections.length >= 8);
    assert.equal(template.sections[0], "announcement");
    assert.equal(template.sections.at(-1), "footer");
    const html = generateClientSite({ brand: BRAND, templateId: template.id }).files["index.html"];
    assert.ok(html.includes("<footer"), `${template.id} fecha com rodapé`);
  }
});
