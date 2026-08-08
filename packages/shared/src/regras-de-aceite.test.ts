import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  type PecaParaAceite,
  type SiteParaAceite,
  conferirPecaDaGaleria,
  conferirSiteGerado,
} from './regras-de-aceite.js';

const peca = (over: Partial<PecaParaAceite> = {}): PecaParaAceite => ({
  categoria: 'hero',
  kind: 'component',
  htmlSnippet: '<section>'.padEnd(400, 'x'),
  representacao: 'componente-portatil',
  runtimes: [],
  movimentoProprio: false,
  classesDeRevelacao: [],
  temObservadorDeRolagem: false,
  refsQuebradas: [],
  assetsNaOrigem: [],
  ...over,
});

const site = (over: Partial<SiteParaAceite> = {}): SiteParaAceite => ({
  html: '<html><head><title>Ourivés</title></head><body></body></html>',
  nomeDaMarca: 'Ourivés',
  refsQuebradas: [],
  fotosDaOrigemMantidas: 0,
  videosDaOrigemMantidos: 0,
  nomesDaOrigemNoTexto: [],
  rastreadoresDaOrigem: 0,
  gridMedido: true,
  secoesVazias: [],
  contrastesAbaixoDoPiso: 0,
  temFavicon: true,
  pecasComMovimento: 2,
  ...over,
});

const cod = (r: ReturnType<typeof conferirPecaDaGaleria>, c: string) =>
  r.vereditos.find((v) => v.codigo === c);

// ── Galeria ─────────────────────────────────────────────────────────────────

test('peça íntegra passa em tudo', () => {
  const r = conferirPecaDaGaleria(peca());
  assert.ok(r.aprovado);
  assert.ok(!r.comPendencia);
});

test('G1: runtime sem o script que o inicia é PENDÊNCIA, não reprovação', () => {
  // A distinção decide o que fazer: reprovar manda consertar o motor; pendência
  // admite que uma cena proprietária e remota talvez nunca reproduza. Marcar
  // isso como defeito faria alguém "consertar" o que não tem conserto.
  const r = conferirPecaDaGaleria(
    peca({ runtimes: [{ kind: 'webgl-cru', temScriptLocal: false }] }),
  );
  assert.equal(cod(r, 'G1')?.estado, 'pendente');
  assert.ok(r.aprovado, 'pendência não reprova');
  assert.ok(r.comPendencia, 'mas fica declarada');
});

test('G1: runtime que só DESENHA não exige script', () => {
  // `iconify` e `tailwind-cdn` produzem conteúdo, não movimento. Exigir o script
  // deles reprovaria metade do acervo por um motivo que não existe.
  const r = conferirPecaDaGaleria(
    peca({
      runtimes: [
        { kind: 'iconify', temScriptLocal: false },
        { kind: 'tailwind-cdn', temScriptLocal: false },
      ],
    }),
  );
  assert.equal(cod(r, 'G1')?.estado, 'passou');
});

test('G2: peça que se mexe na origem e saiu foto congelada REPROVA', () => {
  const r = conferirPecaDaGaleria(
    peca({ movimentoProprio: true, kind: 'animation', representacao: 'referencia-visual' }),
  );
  assert.equal(cod(r, 'G2')?.estado, 'reprovou');
  assert.ok(!r.aprovado);
});

test('G2: foto congelada de peça PARADA não reprova', () => {
  // A regra é sobre movimento perdido, não sobre a representação em si.
  const r = conferirPecaDaGaleria(
    peca({ movimentoProprio: false, representacao: 'referencia-visual' }),
  );
  assert.equal(cod(r, 'G2')?.estado, 'passou');
});

test('G3: classe de revelação já aplicada com observador junto REPROVA', () => {
  const r = conferirPecaDaGaleria(
    peca({ temObservadorDeRolagem: true, classesDeRevelacao: ['is-visible', 'is-visible'] }),
  );
  assert.equal(cod(r, 'G3')?.estado, 'reprovou');
});

test('G3: sem observador, a classe aplicada é o único estado possível', () => {
  // Tirar a classe sem o script deixaria o elemento invisível para sempre —
  // medido num site gerado. Aqui ela é o certo.
  const r = conferirPecaDaGaleria(
    peca({ temObservadorDeRolagem: false, classesDeRevelacao: ['is-visible'] }),
  );
  assert.equal(cod(r, 'G3')?.estado, 'passou');
});

test('G5: recorte curto reprova, mas comportamento e cursor escapam', () => {
  assert.equal(
    cod(conferirPecaDaGaleria(peca({ htmlSnippet: '<div/>' })), 'G5')?.estado,
    'reprovou',
  );
  for (const categoria of ['interaction', 'cursor']) {
    const r = conferirPecaDaGaleria(peca({ categoria, htmlSnippet: '<div class="cursor"/>' }));
    assert.equal(cod(r, 'G5')?.estado, 'passou', `${categoria} é pequeno por natureza`);
  }
});

test('G6: card com fade-in continua sendo card, e isso PASSA', () => {
  // A primeira versão da regra exigia `kind: animation` de toda peça com
  // movimento e reprovou 162 do acervo. O movimento é adjetivo do card, não a
  // identidade dele — reclassificar encheria a Galeria de "animações" que são
  // cartões e rodapés.
  const r = conferirPecaDaGaleria(peca({ movimentoProprio: true, kind: 'component' }));
  assert.equal(cod(r, 'G6')?.estado, 'passou');
});

test('G6: comportamento de página TEM de ser classificado como animação', () => {
  // Aqui a classificação é a identidade: sem ela a peça nunca é encontrada por
  // quem procura um efeito para o site.
  const r = conferirPecaDaGaleria(peca({ categoria: 'interaction', kind: 'component' }));
  assert.equal(cod(r, 'G6')?.estado, 'reprovou');
});

test('G6: movimento promovido a imagem congelada reprova', () => {
  const r = conferirPecaDaGaleria(peca({ movimentoProprio: true, kind: 'asset' }));
  assert.equal(cod(r, 'G6')?.estado, 'reprovou');
});

// ── Site gerado ─────────────────────────────────────────────────────────────

test('site íntegro passa em tudo', () => {
  const r = conferirSiteGerado(site());
  assert.ok(r.aprovado);
  assert.ok(!r.comPendencia);
});

test('S2: mídia da origem que sobrou é PENDÊNCIA, não reprovação', () => {
  // Apagar deixaria buraco e quebraria a essência (S1). A saída é a mídia da
  // marca, e quem entrega precisa saber que ela ainda não chegou.
  const r = conferirSiteGerado(site({ fotosDaOrigemMantidas: 3 }));
  assert.equal(r.vereditos.find((v) => v.codigo === 'S2')?.estado, 'pendente');
  assert.ok(r.aprovado);
  assert.ok(r.comPendencia);
});

test('S2: nome da empresa de origem no texto REPROVA', () => {
  // Foi o defeito que o dono viu: "CANVAS" gigante no rodapé de um site de
  // clínica. Diferente da foto, nome não abre buraco ao sair — o motor troca
  // pelo da marca. Então é defeito, e defeito reprova.
  const r = conferirSiteGerado(site({ nomesDaOrigemNoTexto: ['canvas'] }));
  assert.equal(r.vereditos.find((v) => v.codigo === 'S2')?.estado, 'reprovou');
  assert.ok(!r.aprovado);
});

test('S2: nome no texto pesa mais que foto pendente, e os dois aparecem no motivo', () => {
  const r = conferirSiteGerado(
    site({ nomesDaOrigemNoTexto: ['canvas'], fotosDaOrigemMantidas: 2 }),
  );
  const s2 = r.vereditos.find((v) => v.codigo === 'S2');
  assert.equal(s2?.estado, 'reprovou');
  assert.ok(s2?.motivo.includes('canvas'), 'o nome achado é dito');
  assert.ok(s2?.motivo.includes('2 foto(s)'), 'a foto pendente não some do motivo');
});

test('S2: rastreador da origem que sobrou REPROVA, e diz o que está acontecendo', () => {
  // Um site gerado carregava a gtag.js e o `gtag('config','G-…')` da empresa de
  // origem: cada visitante do cliente virava evento na conta de outra empresa.
  // Nada quebrava e nada aparecia no console — o estrago só existe do lado de
  // fora, e por isso a regra precisa gritar.
  const r = conferirSiteGerado(site({ rastreadoresDaOrigem: 2 }));
  const s2 = r.vereditos.find((v) => v.codigo === 'S2');
  assert.equal(s2?.estado, 'reprovou');
  assert.ok(s2?.motivo.includes('analytics'), 'o motivo diz onde o dado está indo parar');
  assert.ok(!r.aprovado);
});

test('S4: contraste abaixo do piso reprova', () => {
  const r = conferirSiteGerado(site({ contrastesAbaixoDoPiso: 2 }));
  assert.ok(!r.aprovado);
});

test('S7: título da aba tem de ser o nome da marca e nada mais', () => {
  const comSufixo = conferirSiteGerado(
    site({ html: '<html><head><title>Ourivés · joalheria em SP</title></head></html>' }),
  );
  assert.equal(comSufixo.vereditos.find((v) => v.codigo === 'S7')?.estado, 'reprovou');

  const semFavicon = conferirSiteGerado(site({ temFavicon: false }));
  assert.equal(semFavicon.vereditos.find((v) => v.codigo === 'S7')?.estado, 'reprovou');
});

test('S8: referência quebrada reprova — apagar a origem quebraria o site', () => {
  const r = conferirSiteGerado(site({ refsQuebradas: ['assets/cmp_x/foto.jpg'] }));
  assert.equal(r.vereditos.find((v) => v.codigo === 'S8')?.estado, 'reprovou');
  assert.ok(!r.aprovado);
});

test('S6: kit sem movimento nenhum sobe com pendência, não barrado', () => {
  const r = conferirSiteGerado(site({ pecasComMovimento: 0 }));
  assert.equal(r.vereditos.find((v) => v.codigo === 'S6')?.estado, 'pendente');
  assert.ok(r.aprovado);
});

test('todo veredito reprovado ou pendente explica o motivo em uma frase', () => {
  // Uma reprovação sem motivo legível não serve para nada: quem lê precisa saber
  // o que fazer sem abrir o código.
  const r = conferirSiteGerado(
    site({
      refsQuebradas: ['a.css'],
      contrastesAbaixoDoPiso: 1,
      fotosDaOrigemMantidas: 1,
      temFavicon: false,
      gridMedido: false,
      pecasComMovimento: 0,
      secoesVazias: ['Prova'],
    }),
  );
  for (const v of r.vereditos) {
    if (v.estado === 'passou') continue;
    assert.ok(v.motivo.length > 20, `${v.codigo} sem motivo legível: "${v.motivo}"`);
  }
});

test('G7: card que contém a navegação da página reprova', () => {
  // Achado no acervo: um segmento de `card` de 8,6 KB continha o cabeçalho e a
  // navegação do site inteiro. O corte pegou a seção errada, e ninguém notaria
  // até o site gerado sair com uma segunda barra de menu no meio dos cartões.
  const r = conferirPecaDaGaleria(
    peca({ categoria: 'card', htmlSnippet: `<div><nav><a>Home</a></nav>${'x'.repeat(400)}</div>` }),
  );
  assert.equal(cod(r, 'G7')?.estado, 'reprovou');
  assert.ok(!r.aprovado);
});

test('G7: nav, header, footer e hero podem ter navegação — é o papel deles', () => {
  for (const categoria of ['nav', 'header', 'footer', 'hero']) {
    const r = conferirPecaDaGaleria(
      peca({ categoria, htmlSnippet: `<div><nav><a>Home</a></nav>${'x'.repeat(400)}</div>` }),
    );
    assert.equal(cod(r, 'G7')?.estado, 'passou', `${categoria} carrega navegação por natureza`);
  }
});
