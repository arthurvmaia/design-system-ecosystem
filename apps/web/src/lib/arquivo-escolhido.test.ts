import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ehVideoEscolhido } from './arquivo-escolhido.js';

/**
 * A decisão vídeo/imagem é a que decide COM QUE ESPAÇOS o contrato da seção vai
 * comparar o arquivo. Errar aqui faz um `.mp4` ser conferido contra os espaços
 * de imagem e passar numa seção onde ele não toca.
 *
 * `medirProporcao`, no mesmo módulo, precisa de `Image`/`<video>` e não tem
 * teste aqui: sem DOM não há o que medir. O que dava para separar em lógica pura
 * é justamente esta função.
 */

test('o MIME decide quando o navegador o informa', () => {
  assert.equal(ehVideoEscolhido({ type: 'video/mp4', name: 'clipe.mp4' }), true);
  assert.equal(ehVideoEscolhido({ type: 'image/png', name: 'foto.png' }), false);
});

test('MIME vazio cai na extensão, que é o caso real do Windows', () => {
  // Sem isto todo vídeo caía em `image`: o thumb virava um <img> de .mp4 e a
  // conferência de contrato comparava com os espaços errados.
  assert.equal(ehVideoEscolhido({ type: '', name: 'gravacao.MOV' }), true);
  assert.equal(ehVideoEscolhido({ type: '', name: 'foto.JPG' }), false);
});

test('sem campo de MIME nenhum, a extensão continua valendo', () => {
  assert.equal(ehVideoEscolhido({ name: 'abertura.webm' }), true);
});

test('MIME mentiroso não é corrigido pela extensão, e é de propósito', () => {
  // O navegador é a fonte melhor: quando ele afirma o tipo, quem manda é ele.
  // O servidor aplica a mesma ordem, e divergir aqui faria a tela aceitar o que
  // o servidor recusa.
  assert.equal(ehVideoEscolhido({ type: 'image/png', name: 'disfarce.mp4' }), false);
});

test('arquivo sem extensão não vira vídeo por chute', () => {
  assert.equal(ehVideoEscolhido({ type: '', name: 'CAPTURA' }), false);
});
