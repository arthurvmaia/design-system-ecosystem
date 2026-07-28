import assert from 'node:assert/strict';
import { test } from 'node:test';
import { subdividirSecao } from './subdividir.js';

/**
 * A subdivisão fina roda sobre o `htmlSnippet` de uma seção JÁ aprovada e
 * devolve as peças de dentro — um exemplar por estilo, com contagem no nome.
 * Os testes usam HTML realista (Tailwind, como os sites que o motor captura).
 */

// ── Seção de pricing: o caso completo ───────────────────────────────────────

const SECAO_PRICING = `
<section id="pricing" class="py-24 bg-neutral-950">
  <div class="mx-auto max-w-6xl">
    <h2 class="text-4xl font-bold">Planos e preços</h2>
    <p class="mt-2 text-neutral-400">Comece de graça e cresça quando fizer sentido.</p>
    <div class="mt-12 grid grid-cols-3 gap-6">
      <div class="card rounded-2xl border border-neutral-800 p-8">
        <h3 class="text-lg font-semibold">Início</h3>
        <p class="mt-2 text-sm text-neutral-400">Para experimentar o produto sem compromisso.</p>
        <p class="mt-6 text-3xl font-bold">R$ 0/mês</p>
        <a href="#" class="btn mt-6 rounded-lg border border-neutral-700 px-4 py-2">Começar agora</a>
      </div>
      <div class="card rounded-2xl border border-neutral-800 p-8">
        <span class="badge rounded-full bg-red-500/10 px-3 py-1 text-xs">Mais popular</span>
        <h3 class="text-lg font-semibold">Profissional</h3>
        <p class="mt-2 text-sm text-neutral-400">Para equipes que publicam toda semana.</p>
        <p class="mt-6 text-3xl font-bold">R$ 79/mês</p>
        <a href="#" class="btn mt-6 rounded-lg bg-red-600 px-4 py-2 text-white">Assinar o Profissional</a>
      </div>
      <div class="card rounded-2xl border border-neutral-800 p-8">
        <h3 class="text-lg font-semibold">Empresa</h3>
        <p class="mt-2 text-sm text-neutral-400">Para operações com requisitos próprios.</p>
        <p class="mt-6 text-3xl font-bold">R$ 249/mês</p>
        <a href="#" class="btn mt-6 rounded-lg border border-neutral-700 px-4 py-2">Falar com vendas</a>
      </div>
    </div>
  </div>
</section>`;

test('seção de pricing rende botões, cards e badge — um exemplar por estilo', () => {
  const filhos = subdividirSecao({ category: 'pricing', htmlSnippet: SECAO_PRICING });

  const botoes = filhos.filter((f) => f.category === 'button');
  const cards = filhos.filter((f) => f.category === 'card');
  const badges = filhos.filter((f) => f.category === 'badge');

  // Dois estilos de botão (contorno ×2 e sólido ×1), do mais usado ao menos.
  assert.equal(botoes.length, 2, `botões: ${botoes.map((f) => f.name).join(' | ')}`);
  assert.match(botoes[0]?.name ?? '', /^Botão primário \(×2\)$/);
  assert.equal(botoes[1]?.name, 'Botão secundário');

  // Três cards do MESMO estilo: um exemplar só, com a contagem no nome.
  assert.equal(cards.length, 1, `cards: ${cards.map((f) => f.name).join(' | ')}`);
  assert.equal(cards[0]?.name, 'Card (×3)');

  assert.equal(badges.length, 1);
  assert.equal(badges[0]?.name, 'Selo');
  assert.ok(badges[0]?.htmlSnippet.includes('Mais popular'));

  // Todo filho é component e sai embrulhado em [data-ds-amostra].
  for (const f of filhos) {
    assert.equal(f.kind, 'component');
    assert.ok(f.htmlSnippet.includes('data-ds-amostra'), `sem embrulho: ${f.name}`);
  }
});

// ── Acordeão / FAQ ──────────────────────────────────────────────────────────

test('três <details> iguais viram UM item de acordeão com contagem', () => {
  const faq = `
<section class="faq py-16">
  <h2>Perguntas frequentes</h2>
  <details class="faq-item"><summary>Como funciona?</summary><p>Assim e assado, com passos claros.</p></details>
  <details class="faq-item"><summary>Posso cancelar?</summary><p>Quando quiser, sem multa.</p></details>
  <details class="faq-item"><summary>Tem teste grátis?</summary><p>Quatorze dias, sem cartão.</p></details>
</section>`;
  const filhos = subdividirSecao({ category: 'faq', htmlSnippet: faq });
  const itens = filhos.filter((f) => f.category === 'accordion');
  assert.equal(itens.length, 1, `acordeões: ${itens.map((f) => f.name).join(' | ')}`);
  assert.equal(itens[0]?.name, 'Item de acordeão (×3)');
});

test('gatilho [aria-expanded] com alvo sobe ao item que contém o painel', () => {
  const acc = `
<section class="acc-sec py-16">
  <h2>Perguntas</h2>
  <div class="acc-item"><button aria-expanded="false" aria-controls="p1" class="acc-btn">Pergunta um?</button><div id="p1" class="acc-painel">Resposta um bem explicada.</div></div>
  <div class="acc-item"><button aria-expanded="false" aria-controls="p2" class="acc-btn">Pergunta dois?</button><div id="p2" class="acc-painel">Resposta dois bem explicada.</div></div>
</section>`;
  const filhos = subdividirSecao({ category: 'faq', htmlSnippet: acc });
  const item = filhos.find((f) => f.category === 'accordion');
  assert.ok(item, `filhos: ${filhos.map((f) => `${f.category}:${f.name}`).join(' | ')}`);
  assert.equal(item.name, 'Item de acordeão (×2)');
  assert.ok(
    item.htmlSnippet.includes('acc-painel'),
    'o item leva o painel junto, não só o gatilho',
  );
});

// ── Campos ──────────────────────────────────────────────────────────────────

test('campo sobe ao wrapper com <label>; input hidden não vira filho', () => {
  const form = `
<section class="contato py-16">
  <h2>Fale conosco</h2>
  <div class="campo"><label for="email">Seu e-mail</label><input id="email" type="email" class="input rounded border"></div>
  <input type="hidden" name="token" value="x">
  <button class="btn bg-black text-white rounded">Enviar</button>
</section>`;
  const filhos = subdividirSecao({ category: 'form', htmlSnippet: form });
  const campos = filhos.filter((f) => f.category === 'input');
  assert.equal(campos.length, 1, `campos: ${campos.map((f) => f.name).join(' | ')}`);
  assert.ok(campos[0]?.htmlSnippet.includes('<label'), 'o rótulo viaja com o campo');
  assert.ok(
    filhos.some((f) => f.category === 'button'),
    'o botão de enviar também sai',
  );
});

test('<label> ENVOLVENDO o input também é o wrapper — o rótulo não fica para trás', () => {
  // O outro padrão comum de formulário. Com dois campos, a subida parava no
  // <form> (mais de um controle) e devolvia o input pelado, sem rótulo.
  const form = `
<section class="contato py-16">
  <h2>Fale conosco</h2>
  <form>
    <label class="campo">Seu nome <input type="text" class="input rounded border"></label>
    <label class="campo">Seu e-mail <input type="email" class="input rounded border"></label>
  </form>
  <p>Respondemos em até um dia útil, de segunda a sexta, no horário comercial.</p>
</section>`;
  const campos = subdividirSecao({ category: 'form', htmlSnippet: form }).filter(
    (f) => f.category === 'input',
  );
  assert.equal(campos.length, 1, `campos: ${campos.map((f) => f.name).join(' | ')}`);
  assert.equal(campos[0]?.name, 'Campo (×2)');
  assert.ok(campos[0]?.htmlSnippet.includes('<label'), 'o rótulo viaja com o campo');
  assert.ok(campos[0]?.htmlSnippet.includes('Seu nome'), 'o texto do rótulo viaja junto');
});

// ── Itens de navegação ──────────────────────────────────────────────────────

const NAV = `
<nav class="topo border-b">
  <ul class="flex gap-6">
    <li class="item"><a href="/">Início</a></li>
    <li class="item"><a href="/precos">Preços</a></li>
    <li class="item"><a href="/sobre">Sobre</a></li>
  </ul>
</nav>`;

test('li > a só vira item de navegação em seção de nav/header/footer', () => {
  const deNav = subdividirSecao({ category: 'nav', htmlSnippet: NAV });
  const item = deNav.find((f) => f.category === 'nav');
  assert.ok(item, `filhos: ${deNav.map((f) => f.category).join(', ')}`);
  assert.equal(item.name, 'Item de navegação (×3)');

  // A MESMA marcação numa seção comum não rende itens de nav.
  const dePricing = subdividirSecao({ category: 'pricing', htmlSnippet: NAV });
  assert.ok(!dePricing.some((f) => f.category === 'nav'));
});

// ── Descartes ───────────────────────────────────────────────────────────────

test('filho que é quase a seção inteira é descartado — seria a seção de novo', () => {
  const secao = `
<section class="faq">
  <details class="faq-item unica"><summary>A única pergunta desta seção inteira?</summary><p>Uma resposta comprida o bastante para o details dominar o HTML da seção com folga.</p></details>
</section>`;
  const filhos = subdividirSecao({ category: 'faq', htmlSnippet: secao });
  assert.ok(
    !filhos.some((f) => f.category === 'accordion'),
    `filhos: ${filhos.map((f) => f.name).join(' | ')}`,
  );
});

test('filho sem texto e sem função é decoração — não entra', () => {
  const secao = `
<section class="faq py-16">
  <h2>Perguntas frequentes</h2>
  <p>O conteúdo desta seção existe para o wrapper vazio abaixo não dominar o HTML.</p>
  <div data-accordion class="acc-vazio rounded"></div>
  <p>Mais texto de contexto, comprido o bastante para diluir a fatia do vazio.</p>
</section>`;
  const filhos = subdividirSecao({ category: 'faq', htmlSnippet: secao });
  assert.equal(filhos.length, 0, `filhos: ${filhos.map((f) => f.name).join(' | ')}`);
});

test('card sem irmãos do mesmo estilo não é card — é decoração da seção', () => {
  const secao = `
<section class="sobre py-16">
  <h2>Sobre nós</h2>
  <div class="card rounded-xl border p-8">Uma superfície única com texto suficiente para passar na faixa de card, mas sem nenhuma repetição por perto.</div>
  <p>Texto da seção para diluir a fatia do bloco acima e manter o descarte pelo motivo certo.</p>
</section>`;
  const filhos = subdividirSecao({ category: 'other', htmlSnippet: secao });
  assert.ok(!filhos.some((f) => f.category === 'card'));
});

test('teto de 8 filhos por seção', () => {
  const botoes = Array.from(
    { length: 12 },
    (_, i) => `<button class="btn estilo-${i} rounded">Ação ${i}</button>`,
  ).join('\n  ');
  const secao = `<section class="cta py-16">\n  <h2>Chamada</h2>\n  ${botoes}\n</section>`;
  const filhos = subdividirSecao({ category: 'cta', htmlSnippet: secao });
  assert.equal(filhos.length, 8);
});
