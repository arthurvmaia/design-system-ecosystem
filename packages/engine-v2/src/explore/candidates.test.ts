import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { ElementDescriptor } from '@ds/explorer';
import {
  type SinaisCandidato,
  acaoEhReversivel,
  acoesProvaveis,
  candidatosSemDom,
  descobrirCandidatos,
  filtrarAcoes,
  pontuarCandidato,
} from './candidates.js';

const BASE_URL = 'https://exemplo.test/pagina';

const desc = (over: Partial<ElementDescriptor> = {}): ElementDescriptor => ({
  ref: '0',
  tag: 'button',
  role: null,
  type: null,
  href: null,
  text: '',
  ariaLabel: null,
  classes: [],
  id: null,
  tabindex: null,
  cursor: 'pointer',
  hasListeners: false,
  listenerTypes: [],
  disabled: false,
  ariaExpanded: null,
  ariaHaspopup: null,
  ariaControls: null,
  download: false,
  targetBlank: false,
  box: { x: 0, y: 0, w: 100, h: 40 },
  inViewport: true,
  dataAttrs: {},
  ...over,
});

const sin = (over: Partial<SinaisCandidato> = {}): SinaisCandidato => ({
  hash: 'h1',
  descriptor: desc(),
  reagiuAoPonteiro: false,
  deltaPonteiro: 0,
  emShadow: false,
  visivel: true,
  areaShare: 0.05,
  controlePor: null,
  controlaAlvoExistente: false,
  ...over,
});

test('reação MEDIDA ao ponteiro pesa mais que qualquer atributo', () => {
  const medido = pontuarCandidato(sin({ reagiuAoPonteiro: true, deltaPonteiro: 0.2 }));
  const soAria = pontuarCandidato(sin({ descriptor: desc({ ariaHaspopup: 'menu' }) }));
  assert.ok(
    medido.score > soAria.score,
    `medido=${medido.score} deveria vencer aria=${soAria.score}`,
  );
  assert.ok(medido.evidencias.some((e) => /reagiu ao ponteiro/.test(e)));
});

test('container grande sem evidência é penalizado', () => {
  const container = pontuarCandidato(
    sin({ areaShare: 0.9, descriptor: desc({ tag: 'div', cursor: 'auto' }) }),
  );
  assert.ok(container.evidencias.some((e) => /prov[áa]vel container/.test(e)));
});

test('aria-expanded gera abrir/fechar coerente com o estado atual', () => {
  const fechado = acoesProvaveis(
    sin({ descriptor: desc({ ariaExpanded: 'false', role: 'button', text: 'Menu' }) }),
  );
  assert.ok(fechado.includes('abrir-menu'));
  const aberto = acoesProvaveis(
    sin({ descriptor: desc({ ariaExpanded: 'true', role: 'button', text: 'Menu' }) }),
  );
  assert.ok(aberto.includes('fechar-menu'));
});

test('role=tab gera trocar-tab; details gera expandir-accordion', () => {
  assert.ok(acoesProvaveis(sin({ descriptor: desc({ role: 'tab' }) })).includes('trocar-tab'));
  assert.ok(
    acoesProvaveis(sin({ descriptor: desc({ tag: 'summary' }) })).includes('expandir-accordion'),
  );
});

test('hover é sempre proposto e sempre permitido', () => {
  const acoes = acoesProvaveis(sin());
  assert.equal(acoes[0], 'hover');
  const { permitidas } = filtrarAcoes(sin(), acoes, BASE_URL);
  assert.ok(permitidas.includes('hover'));
});

test('rótulo de compra barra o clique — reusa a guarda do V1', () => {
  const s = sin({ descriptor: desc({ text: 'Finalizar compra' }) });
  const { permitidas, barradas } = filtrarAcoes(s, ['revelar-conteudo', 'hover'], BASE_URL);
  assert.deepEqual(permitidas, ['hover']);
  assert.equal(barradas.length, 1);
  assert.equal(barradas[0]?.acao, 'revelar-conteudo');
});

test('as barreiras novas do V2: clipboard, permissão, instalação, protocolo externo', () => {
  const casos: Array<[Partial<ElementDescriptor>, string]> = [
    [{ text: 'Copiar código' }, 'clipboard'],
    [{ text: 'Permitir notificações' }, 'permissao'],
    [{ text: 'Instalar app' }, 'instalacao'],
    [{ text: 'Usar minha localização' }, 'geolocalizacao'],
    [{ text: 'Salvar alterações' }, 'alteracao-persistente'],
    [{ text: 'Enviar mensagem' }, 'envio-mensagem'],
    [{ text: 'Falar no WhatsApp', href: 'whatsapp://send?phone=1' }, 'protocolo-externo'],
    [{ text: 'Escrever', href: 'mailto:a@b.c' }, 'protocolo-externo'],
  ];
  for (const [over, motivo] of casos) {
    const { permitidas, barradas } = filtrarAcoes(
      sin({ descriptor: desc(over) }),
      ['abrir-modal'],
      BASE_URL,
    );
    assert.deepEqual(permitidas, [], `"${over.text}" não deveria permitir clique`);
    assert.equal(barradas[0]?.motivo, motivo, `"${over.text}": motivo errado`);
  }
});

test('toggle de UI com verbo no rótulo continua permitido', () => {
  // "Enviar" no rótulo, mas é um aria-expanded: o efeito é abrir/fechar.
  const s = sin({ descriptor: desc({ text: 'Enviar', ariaExpanded: 'false' }) });
  const { permitidas } = filtrarAcoes(s, ['revelar-conteudo'], BASE_URL);
  assert.deepEqual(permitidas, ['revelar-conteudo']);
});

test('focar campo é permitido, salvo em campo sensível', () => {
  const texto = filtrarAcoes(
    sin({ descriptor: desc({ tag: 'input', type: 'text' }) }),
    ['focar-campo'],
    BASE_URL,
  );
  assert.deepEqual(texto.permitidas, ['focar-campo']);

  for (const type of ['file', 'password']) {
    const r = filtrarAcoes(
      sin({ descriptor: desc({ tag: 'input', type }) }),
      ['focar-campo'],
      BASE_URL,
    );
    assert.deepEqual(r.permitidas, [], `input[type=${type}] não deve ser focado`);
    assert.equal(r.barradas[0]?.motivo, 'campo-sensivel');
  }
});

test('link para outro domínio barra o clique', () => {
  const { permitidas, barradas } = filtrarAcoes(
    sin({ descriptor: desc({ tag: 'a', href: 'https://outro.test/x', text: 'Ver' }) }),
    ['revelar-conteudo'],
    BASE_URL,
  );
  assert.deepEqual(permitidas, []);
  assert.ok(/fora|download/.test(barradas[0]?.motivo ?? ''));
});

test('âncora de fragmento é local e segura', () => {
  const { permitidas } = filtrarAcoes(
    sin({ descriptor: desc({ tag: 'a', href: '#recursos', text: 'Recursos' }) }),
    ['revelar-conteudo'],
    BASE_URL,
  );
  assert.deepEqual(permitidas, ['revelar-conteudo']);
});

test('toda ação da lista é reversível — a lista é fechada', () => {
  for (const a of [
    'abrir-menu',
    'fechar-modal',
    'trocar-tab',
    'avancar-carousel',
    'alternar-tema',
    'hover',
    'teclado',
  ] as const) {
    assert.equal(acaoEhReversivel(a), true, a);
  }
});

test('descobrirCandidatos descarta o que não tem evidência e ordena por score', () => {
  const cands = descobrirCandidatos(
    [
      sin({ hash: 'fraco', descriptor: desc({ tag: 'div', cursor: 'auto' }), visivel: false }),
      sin({ hash: 'medio', descriptor: desc({ tag: 'button', text: 'Ok' }) }),
      sin({ hash: 'forte', reagiuAoPonteiro: true, deltaPonteiro: 0.4 }),
    ],
    BASE_URL,
  );
  assert.equal(cands[0]?.hash, 'forte');
  assert.ok(!cands.some((c) => c.hash === 'fraco'), 'candidato sem evidência não deve entrar');
});

test('descobrirCandidatos respeita o limite', () => {
  const muitos = Array.from({ length: 50 }, (_, i) =>
    sin({ hash: `h${i}`, descriptor: desc({ tag: 'button', text: `b${i}` }) }),
  );
  assert.equal(descobrirCandidatos(muitos, BASE_URL, 10).length, 10);
});

test('regiões de canvas viram candidatos SEM DOM, ordenadas por reação', () => {
  const ordenadas = candidatosSemDom([
    { id: 'a', regiao: { x: 0, y: 0, w: 0.1, h: 0.1 }, delta: 0.1, cena: 'c1' },
    { id: 'b', regiao: { x: 0.5, y: 0.5, w: 0.1, h: 0.1 }, delta: 0.6, cena: 'c1' },
  ]);
  assert.equal(ordenadas[0]?.id, 'b');
});
