/**
 * Abas de verdade, CONSTRUÍDAS pelo compositor — o contorno que salva a ideia.
 *
 * ## Por que existe
 *
 * O dono quer, do mesmo componente, várias copies com clique e transição:
 * *"daria para aproveitar 1 componente e ter 3 copys nele"*. O caminho óbvio era
 * reproduzir a interação que a origem tinha, e ele foi tentado: `estados.ts` lê
 * os estados capturados e deriva qual elemento os dispara.
 *
 * **A medição matou aquele caminho, e vale registrar o número:** dos 100 estados
 * do acervo, **75 são idênticos ao HTML base** e 8 são duplicata byte a byte de
 * outro. A captura grava que houve clique e um HTML que não mudou. Não há
 * informação para consumir, e um consumidor que "ligasse" isso entregaria
 * exatamente os dois defeitos proibidos: clique que não faz nada, e clique que
 * faz a coisa errada.
 *
 * Medido também no site do clube: **zero `role="tab"`, zero `aria-selected`**.
 * Os três ícones que pareciam abas eram desenho. A interação nunca esteve lá.
 *
 * ## O contorno
 *
 * Em vez de DERIVAR interação de uma captura vazia, o compositor a CONSTRÓI: o
 * criativo escreve marcação de abas padrão e acessível dentro de uma seção
 * criada, e daqui saem o estilo e o comportamento — uma vez por página, na
 * paleta e no ritmo do kit.
 *
 * Isso serve a qualquer site, não depende de captura nenhuma, e cai justamente
 * onde a página precisa: as sequências passaram de 7-9 para 11-12 etapas, então
 * sobram seções sem peça que encaixe — e uma delas pode ser esta.
 *
 * ## O contrato com o criativo
 *
 * Marcação padrão da plataforma, porque acessibilidade não pode depender de
 * cada autor lembrar:
 *
 * ```html
 * <div role="tablist" aria-label="...">
 *   <button role="tab" id="ab-1" aria-controls="pn-1" aria-selected="true">Rótulo</button>
 *   ...
 * </div>
 * <div role="tabpanel" id="pn-1" aria-labelledby="ab-1">…a copy desta aba…</div>
 * ```
 *
 * O criativo escreve só isso. O painel que não é o primeiro nasce escondido pelo
 * CSS daqui, e não por `hidden` na marcação — assim, **sem JavaScript o conteúdo
 * de todas as abas continua legível**, empilhado. Degradar para o conteúdo
 * inteiro é melhor que degradar para uma aba só.
 */

/** A página tem abas escritas pelo criativo? */
export const temAbasCriadas = (html: string): boolean => /\brole="tablist"/i.test(html);

/**
 * O estilo das abas, na paleta e no ritmo MEDIDOS do kit.
 *
 * Nada de hex solto: tudo sai de `var(--marca-*)`, que é o que faz a seção
 * criada parecer do mesmo site. A transição usa a duração e a curva que o
 * compositor mediu no CSS do próprio kit — a mesma fonte que a camada de
 * movimento usa, para o site inteiro andar no mesmo compasso.
 */
export const cssDasAbas = (duracaoMs: number, easing: string): string =>
  `/* Abas criadas pelo compositor. Estilo na paleta da marca, ritmo medido no kit. */
[role="tablist"]{display:flex;flex-wrap:wrap;gap:.5rem;margin-bottom:1.5rem}
[role="tab"]{
  appearance:none;border:1px solid var(--marca-border,transparent);
  background:transparent;color:var(--marca-body,inherit);
  padding:.7rem 1.1rem;border-radius:var(--marca-raio-5,9999px);
  font:inherit;font-size:.95rem;cursor:pointer;
  /* 44px é o alvo de toque digno; a aba é o elemento mais clicado da seção. */
  min-height:44px;
  transition:background-color ${duracaoMs}ms ${easing},color ${duracaoMs}ms ${easing},border-color ${duracaoMs}ms ${easing};
}
[role="tab"]:hover{border-color:var(--marca-accent,var(--marca-primary,currentColor))}
[role="tab"][aria-selected="true"]{
  background:var(--marca-primary,currentColor);
  color:var(--marca-primary-foreground,#fff);
  border-color:var(--marca-primary,currentColor);
}
[role="tab"]:focus-visible{outline:2px solid var(--marca-focus,var(--marca-accent,currentColor));outline-offset:2px}
/*
  O painel escondido some pelo CSS, nunca por \`hidden\` na marcação: sem
  JavaScript, esta regra não se aplica e TODO o conteúdo continua legível,
  empilhado. Degradar para a página inteira é melhor que degradar para uma aba.
*/
[data-orbis-abas="ligado"] [role="tabpanel"][data-orbis-oculto]{display:none}
[role="tabpanel"]{animation:orbis-aba-entra ${duracaoMs}ms ${easing} both}
@keyframes orbis-aba-entra{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
@media (prefers-reduced-motion:reduce){
  [role="tab"]{transition:none}
  [role="tabpanel"]{animation:none}
}
`;

/**
 * O alternador: nosso, sem framework, e acessível pelo teclado.
 *
 * Ele LIGA o modo escondido antes de esconder qualquer coisa
 * (`data-orbis-abas="ligado"`), na mesma disciplina da camada de movimento: se
 * este script não rodar, nada fica escondido.
 *
 * As setas do teclado andam entre as abas porque é o que a norma de `tablist`
 * espera, e porque o alvo de toque de 44px não ajuda quem navega por teclado.
 */
export const SCRIPT_DAS_ABAS = `<script>
(function(){
  var listas = document.querySelectorAll('[role="tablist"]');
  if (!listas.length) return;
  document.documentElement.setAttribute('data-orbis-abas','ligado');
  listas.forEach(function(lista){
    var abas = [].slice.call(lista.querySelectorAll('[role="tab"]'));
    if (abas.length < 2) return;
    var paineis = abas.map(function(a){
      var id = a.getAttribute('aria-controls');
      return id ? document.getElementById(id) : null;
    });
    function mostrar(i){
      abas.forEach(function(a, j){
        var sel = i === j;
        a.setAttribute('aria-selected', sel ? 'true' : 'false');
        a.setAttribute('tabindex', sel ? '0' : '-1');
        var p = paineis[j];
        if (!p) return;
        if (sel) { p.removeAttribute('data-orbis-oculto'); }
        else { p.setAttribute('data-orbis-oculto',''); }
      });
    }
    abas.forEach(function(a, i){
      a.addEventListener('click', function(){ mostrar(i); });
      a.addEventListener('keydown', function(e){
        var d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
        if (!d) return;
        e.preventDefault();
        var n = (i + d + abas.length) % abas.length;
        abas[n].focus();
        mostrar(n);
      });
    });
    var inicial = abas.findIndex(function(a){ return a.getAttribute('aria-selected') === 'true'; });
    mostrar(inicial < 0 ? 0 : inicial);
  });
})();
</script>`;
