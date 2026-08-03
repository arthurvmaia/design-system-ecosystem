# HANDOFF — onde o trabalho está

*Atualizado em 2026-08-02. Main em `1cfa5ea`, CI verde, 1.086 testes passando.*

Este arquivo é para quem senta amanhã: o que está pronto, o que ficou pelo
caminho e **por que** cada coisa que falta foi deixada para depois. O registro
histórico da reforma de julho continua em `docs/HANDOFF.md`.

---

## 1. Onde o produto está

O fluxo inteiro funciona ponta a ponta:

```
Extrair → Galeria (triagem) → Biblioteca (acervo) → Kits (design system final)
→ Gerar site (marca + conteúdo do usuário) → Meus sites
```

O acervo tem **2 origens capturadas** (`ds.asimov.academy` e `futureui`), 13
peças na Biblioteca, 3 kits e 5 projetos. O app roda local (`pnpm dev`) e sai
para os sócios por túnel Cloudflare, atrás de duas credenciais: uma para entrar,
outra para as ações que gastam (Extrair e Gerar site).

---

## 2. O que esta sessão entregou

Doze commits, de `66706c8` a `1cfa5ea`. Em ordem de importância, não de data.

### O kit deixou de ser uma lista e virou um sistema

O plano da arquitetura (as 6 fatias) foi executado inteiro. Ele existia para
realizar a ideia central: **pegar uma peça de um site, outra de outro, e montar
um site com o design system dos dois — com precisão sobre o que vem de onde.**

| Fatia | O que mudou |
|---|---|
| 1 | Cada peça diz de onde veio, e o **Confronto** põe as origens de uma categoria lado a lado, por conjunto e não peça a peça |
| 2 | Apagar ou editar uma peça reconsolida os kits que a usavam — antes o kit seguia descrevendo cores de uma peça apagada |
| 3 | Duas origens que declaram `@font-face` com o mesmo nome pararam de colidir |
| 4 | **Governança**: cada família tem regra de mistura (fundamentos = 1 origem, peças = 1 origem por categoria, dobras e efeitos = livres), com recusa em `PATCH` e motivo |
| 5 | A fonte da marca passa a valer DENTRO das peças, por token no ponto de uso — não por regra que disputa a cascata |
| 6 | O motor mede **linguagem visual**: as rampas de tamanho, respiro e raio de cada site |

### A bancada com prévia

No editor de kit, a coluna direita alterna entre **Biblioteca** e **Como vai
ficar**. A prévia monta pelo `montarPaginaDoKit`, o mesmo caminho da geração
final, e acompanha a seleção antes de salvar. É onde duas origens brigando
aparecem em um segundo, em vez de depois de gerar o site inteiro.

### Dois defeitos sérios encontrados no caminho

**Toda prévia do app estava sem CSS.** Desde que o portão de credencial entrou.
A CSP declarava `sandbox`, o que dá origem opaca ao documento; de origem opaca,
pedir o próprio `assets/styles.css` é um pedido cross-site, o cookie
`SameSite=Lax` não viaja, o servidor respondia 401 e o Chrome bloqueava
(`ERR_BLOCKED_BY_ORB`). Na tela: caixa branca com texto preto miúdo em cada peça
da Galeria, da Biblioteca e do kit. Corrigido; `preview.csp.test.ts` trava a
regra.

**O CI estava vermelho desde a fatia 1.** `library/` no `.gitignore`, sem barra
na frente, casa em qualquer profundidade e engolia
`apps/web/src/routes/library/`. O `Confronto.tsx` nunca entrou no repositório e
a compilação quebrava só no runner. Os cinco padrões de dado de runtime foram
ancorados na raiz (`/vault/`, `/library/`…), o que mata a classe inteira.

### Faxina

Saiu a segunda implementação da composição (`lerPecaDoBundle` /
`comporPecasDoKit`, sem chamada de produção), a tabela morta
`project_components` (migração 0006, zero linhas conferidas com backup antes), e
a lista de categorias de peça passou a ser derivada da taxonomia com teste
amarrando as duas.

---

## 3. O que está em andamento

**Nada.** A árvore está limpa, o CI verde, e não há trabalho começado pela
metade. O que segue abaixo é escolha do dono, não pendência de execução.

---

## 4. O que falta, em ordem de retorno

### 4.1 A marca governar TAMANHO, não só família

**O passo natural depois da fatia 6, e o mais valioso.**

Hoje `retipografar.ts` reescreve apenas `font-family` — a fonte da marca vale
dentro das peças, o tamanho não. A rampa que a fatia 6 passou a medir é
exatamente o insumo que faltava: com `designTokens` no manifesto e
`OrigemConsolidada.escala` no kit, dá para emitir `--marca-passo-N` e reescrever
`font-size: var(--marca-passo-5, 3rem)` no ponto de uso, com o literal original
como reserva.

O que decidir antes de codar: **de quem é a escala do site gerado.** Se for a da
marca, duas origens misturadas passam a alinhar. Se for a de cada origem, cada
peça mantém a proporção que tinha. A segunda é mais fiel e a primeira é mais
coesa, e o app não tem hoje onde a pessoa dizer qual quer.

### 4.2 A captura é PARCIAL nas duas origens

As duas terminam em `parcial-orcamento`: a fase de percurso (que rola a página e
varre o ponteiro em cada parada) não cabe nos 180 s padrão. O que sai é bom —
segmentos com bundle, CSS completo, ícones desenhados; o que falta são
comportamentos das dobras de baixo, e a Galeria declara isso.

Para uma captura inteira:

```powershell
$env:DS_EXPLORER_ORCAMENTO_TOTAL_MS = "900000"; pnpm extrair <job_id>
```

Não vale subir por padrão: a maioria dos sites termina bem dentro dos 180 s e o
custo cairia sobre todos.

### 4.3 `engine.browser.test.ts` reprova 28 de 37 nesta máquina

**Anterior a esta sessão** — confirmado com `git stash`. O primeiro teste passa
(a captura roda e o manifesto valida em 17 s) e os 28 seguintes falham em 0,1 ms
cada, o que tem cara de estado compartilhado vazio e não de 28 defeitos. O job
de navegador não bloqueia o CI. Ninguém investigou.

### 4.4 Escala de espaçamento entre origens

Duas origens com respiros diferentes continuam desalinhadas acima do breakpoint
móvel. O plano já declarava isto como não resolvido e dependente da fatia 6 —
que agora existe. É o mesmo problema do 4.1, no eixo do espaço.

### 4.5 Herdado do diagnóstico anterior, ainda de pé

- **Fatia 7**: a coluna `segments.hash` nunca foi criada. A resolução de bundle
  por identidade funciona lendo o índice hash→pasta dos manifests, sem escrita.
  A coluna só vale quando houver algo que ela destrave.
- **Fatia 8**: os três painéis existem, mas a etapa Mídia continua no wizard —
  removê-la mudaria o gate de etapas.
- **Fatia 13**: a MEDIÇÃO da âncora de scroll existe (`ancorasDeMidia`); a oferta
  de mídia posicional, não. Ela depende de o veredito de cápsula chegar à tela, e
  hoje 8 de 9 reprovam e o resultado é descartado antes da UI. Oferecer mídia
  posicional numa cápsula que ninguém sabe se funciona é vender o que não se pode
  entregar.

### 4.6 Depois que os sócios validarem

`docs/MIGRACAO.md` tem o plano de tirar o MVP do computador do Arthur. Supabase
(o sócio tem plano pago) resolve 3 das 4 restrições; a captura por navegador é a
que não resolve, e o documento diz por quê.

---

## 5. Armadilhas conhecidas

Coisas que já custaram tempo e vão custar de novo se ninguém avisar.

1. **`.gitignore` sem barra na frente casa em qualquer profundidade.** Foi assim
   que uma pasta de código sumiu do repositório por dias. Os padrões de runtime
   agora são ancorados; mantenha assim.
2. **O biome respeita o `.gitignore`.** Arquivo ignorado não é linteado, então
   um arquivo fora do git passa pelo `pnpm lint` local e reprova no CI. Um clone
   limpo é o único teste honesto: `git clone . /tmp/x && cd /tmp/x && pnpm i && pnpm verificar`.
3. **Prévia precisa de MESMA origem.** Enquanto o portão exigir credencial, um
   documento de prévia em origem opaca chega sem CSS. Ver `CSP_PREVIA` em
   `routes/preview.ts` — o porquê está escrito lá por extenso.
4. **`PROCESSAR.bat` aberto duas vezes** põe sessões paralelas no mesmo job.
5. **Copie `ecosystem.db` + `-wal` + `-shm`** antes de qualquer migração. O
   acervo já sumiu uma vez, e a causa nunca foi identificada.
6. **O túnel serve o build antigo até reiniciar.** Depois de qualquer correção
   que os sócios precisem ver, derrube e levante de novo.

---

## 6. Como validar

```powershell
pnpm verificar          # lint + typecheck + suíte rápida + portão de fidelidade
pnpm test:navegador     # os 11 arquivos com Chromium (~4 min) — ver 4.3
```

O portão de fidelidade **não** roda no CI de propósito: ele mede o acervo, que
mora em `~/design-system-ecosystem` e não existe num runner limpo.

---

## 7. Estado do acervo

- **160 MB** em `~/design-system-ecosystem`, fila vazia.
- As duas origens foram **recapturadas** com o motor que mede escala. As cópias
  de segurança seguem em `vault/<ds>/capture-v2.anterior`. Confira a Galeria e,
  quando estiver satisfeito: `pnpm reextrair --descartar-anterior`.
- Existe um kit chamado **"kit misto de teste"**, criado para exercitar a mistura
  de origens. Se não for usar, apague pela tela.
