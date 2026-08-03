import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Home } from 'lucide-react';
import { type NavItemDef, primaryNav, secondaryNav } from './nav.js';
import { itemDaRota, leituraDeAcervo, rotuloDaRota } from './topo-core.js';

const item = (to: string, label: string): NavItemDef => ({
  to,
  label,
  icon: Home,
  description: null,
});

test('o título do topo é o mesmo nome do link, para toda etapa do fluxo', () => {
  for (const etapa of primaryNav) {
    assert.equal(
      rotuloDaRota(etapa.to).title,
      etapa.label,
      `${etapa.to} deve se chamar igual na barra e no link`,
    );
  }
});

test('as telas auxiliares também herdam o nome da navegação', () => {
  for (const aux of secondaryNav) {
    assert.equal(rotuloDaRota(aux.to).title, aux.label);
  }
});

test('toda etapa do fluxo diz para que serve', () => {
  for (const etapa of primaryNav) {
    assert.notEqual(rotuloDaRota(etapa.to).section, '', `${etapa.to} está sem propósito no topo`);
  }
});

test('rota filha continua sendo a etapa da mãe', () => {
  assert.equal(itemDaRota('/projects/prj_123')?.to, '/projects');
  assert.equal(rotuloDaRota('/library/seg_9').title, 'Biblioteca');
});

test('prefixo parecido não sequestra a etapa', () => {
  assert.equal(itemDaRota('/projects-antigos'), null);
  assert.equal(itemDaRota('/librarian'), null);
});

test('entre mãe e filha declaradas, ganha a mais específica — em qualquer ordem', () => {
  const mae = item('/projects', 'Gerar site');
  const filha = item('/projects/novo', 'Novo site');
  assert.equal(itemDaRota('/projects/novo', [mae, filha])?.to, '/projects/novo');
  assert.equal(itemDaRota('/projects/novo', [filha, mae])?.to, '/projects/novo');
  assert.equal(itemDaRota('/projects', [mae, filha])?.to, '/projects');
});

test('caminho desconhecido antecipa o destino do roteador, sem propósito inventado', () => {
  const r = rotuloDaRota('/rota-que-nao-existe');
  assert.equal(r.title, 'Início');
  assert.equal(r.section, '');
});

test('acervo vazio mostra 0, não some da barra', () => {
  const l = leituraDeAcervo({ total: 0, isError: false, isPending: false });
  assert.equal(l.texto, '0');
  assert.equal(l.estado, 'contado');
  assert.equal(l.destaque, false, 'zero aparece, mas não pede atenção');
  assert.equal(l.explicacao, null);
});

test('número real aparece aceso', () => {
  const l = leituraDeAcervo({ total: 13, isError: false, isPending: false });
  assert.equal(l.texto, '13');
  assert.equal(l.destaque, true);
});

test('enquanto conta, mostra o traço e diz que está contando', () => {
  const l = leituraDeAcervo({ total: undefined, isError: false, isPending: true });
  assert.equal(l.texto, '—');
  assert.equal(l.estado, 'aguardando');
  assert.equal(l.explicacao, 'ainda contando');
});

test('falha ao contar não vira zero nem se disfarça de espera', () => {
  const erro = leituraDeAcervo({ total: undefined, isError: true, isPending: false });
  const zero = leituraDeAcervo({ total: 0, isError: false, isPending: false });
  const esperando = leituraDeAcervo({ total: undefined, isError: false, isPending: true });
  assert.equal(erro.estado, 'indisponivel');
  assert.notEqual(erro.texto, zero.texto, 'não pode dizer 0 quando não contou');
  assert.notEqual(erro.explicacao, esperando.explicacao, 'falhar e esperar não são a mesma coisa');
});

test('dado ausente sem erro e sem espera também não vira zero', () => {
  const l = leituraDeAcervo({ total: undefined, isError: false, isPending: false });
  assert.equal(l.texto, '—');
  assert.equal(l.destaque, false);
});
