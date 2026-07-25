import { createHash } from 'node:crypto';
import type { ElementFingerprint, NormalizedBox } from '@ds/shared';

/**
 * Identidade estável de elemento — função pura.
 *
 * O V1 endereçava elementos por `data-dsx-ref`, um índice atribuído durante a
 * coleta. Bastava uma interação inserir um nó para o índice deixar de significar
 * o que significava, e bastava um novo carregamento para ele apontar para outro
 * elemento. `nth-child`, caminho CSS absoluto e XPath têm o mesmo defeito por
 * outro caminho.
 *
 * Aqui a identidade sai de sinais que **sobrevivem a mudanças provocadas por
 * interação**: o que o elemento É (tag, role, ARIA), o que ele declara
 * (`data-*`), o que ele diz (texto resumido), as classes que não parecem
 * geradas, o ancestral semântico, a posição entre irmãos do MESMO tipo e a forma
 * da subárvore. Posição na tela entra no registro para auditoria, mas **não entra
 * no hash** — um elemento que se move num parallax continua o mesmo elemento.
 *
 * Nada aqui lê valor de campo: um `<input>` contribui com tipo e rótulo, nunca
 * com o que foi digitado.
 */

/**
 * Classes que não sobrevivem a um rebuild — e portanto não podem entrar numa
 * identidade estável. Cobrem as fábricas usuais: CSS Modules, emotion,
 * styled-components, styled-jsx, Svelte, Vue scoped e hashes soltos.
 *
 * O teste é conservador: na dúvida a classe é MANTIDA. Descartar uma classe
 * estável só enfraquece o fingerprint; manter uma instável o quebra entre
 * sessões — mas dentro de UMA sessão de captura (que é onde ele é usado para
 * religar) o custo é baixo, e entre sessões os outros sinais seguram.
 */
const PADROES_GERADOS: RegExp[] = [
  /^css-[0-9a-z]{5,}$/i, // emotion
  /^sc-[0-9a-z]{6,}$/i, // styled-components
  /^jsx-\d{6,}$/, // styled-jsx
  /^svelte-[0-9a-z]{6,}$/i,
  /^data-v-[0-9a-f]{8}$/i, // vue scoped (aparece como classe em alguns setups)
  /^[\w-]+__[\w-]+___[0-9a-z]{5,}$/i, // css-modules verboso
  /^[\w-]{1,20}_[\w-]{1,20}__[0-9a-z]{5,}$/i, // css-modules (next)
  /^[0-9a-f]{8,}$/i, // hash puro
  /^[a-z]{1,4}[-_][0-9a-f]{6,}$/i, // prefixo curto + hash
  /^(?=.{12,})(?=(?:.*\d){4,})[a-z0-9]+$/i, // sequência longa com muitos dígitos
];

export const pareceGerada = (cls: string): boolean => PADROES_GERADOS.some((re) => re.test(cls));

/** Classes que valem como identidade: as que não parecem geradas. */
export const classesEstaveis = (classes: readonly string[]): string[] =>
  classes.filter((c) => c.length > 0 && !pareceGerada(c));

/** Texto normalizado e limitado — sinal de identidade, não conteúdo. */
export const resumirTexto = (texto: string, max = 120): string => {
  const limpo = texto.replace(/\s+/g, ' ').trim();
  return limpo.length > max ? limpo.slice(0, max) : limpo;
};

/**
 * `data-*` que declaram INTENÇÃO. Um `data-toggle="modal"` diz o que o elemento
 * faz e é ótima identidade; um `data-reactid="17"` ou `data-key="a3f9"` é índice
 * de framework e muda. Os valores de campo nunca entram.
 */
const DATA_RUIDO = /^data-(reactid|react-|v-|key|index|idx|uid|uuid|hash|testid|cy|qa)/i;

export const dataAttrsDeIntencao = (
  attrs: Readonly<Record<string, string>>,
): Record<string, string> => {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(attrs)) {
    if (k.startsWith('data-dsx')) continue;
    if (DATA_RUIDO.test(k)) continue;
    // Valor longo é conteúdo (JSON de config, base64), não identidade.
    out[k] = v.length > 64 ? '' : v;
  }
  return out;
};

/** Sinais crus que a coleta in-page entrega. Sem hash — ele nasce aqui. */
export type SinaisFingerprint = {
  tag: string;
  role: string | null;
  aria: Record<string, string>;
  dataAttrs: Record<string, string>;
  text: string;
  classes: string[];
  id: string | null;
  semanticAncestor: string | null;
  siblingIndex: number;
  structuralSignature: string;
  box?: NormalizedBox;
  listeners: string[];
  cursor?: string;
};

/**
 * A string canônica que vira hash. A ordem e a normalização são o contrato: dois
 * elementos iguais têm de produzir a MESMA string em qualquer sessão.
 *
 * Deliberadamente FORA daqui: a caixa (o elemento se move) e as classes
 * instáveis (o build muda). Deliberadamente DENTRO: o id, porque quando existe é
 * o sinal mais forte que há.
 */
export const chaveCanonica = (s: SinaisFingerprint): string => {
  const aria = Object.entries(s.aria)
    .filter(([, v]) => v.length <= 64)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join(',');
  const data = Object.entries(dataAttrsDeIntencao(s.dataAttrs))
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join(',');
  const cls = classesEstaveis(s.classes).slice().sort().join(' ');
  return [
    `tag:${s.tag.toLowerCase()}`,
    `role:${s.role ?? ''}`,
    `aria:${aria}`,
    `data:${data}`,
    `id:${s.id ?? ''}`,
    `cls:${cls}`,
    `txt:${resumirTexto(s.text, 80)}`,
    `anc:${s.semanticAncestor ?? ''}`,
    `sib:${s.siblingIndex}`,
    `sig:${s.structuralSignature}`,
  ].join('|');
};

/** Hash curto e estável (sha256 truncado — colisão irrelevante nesta escala). */
export const hashFingerprint = (s: SinaisFingerprint): string =>
  createHash('sha256').update(chaveCanonica(s)).digest('hex').slice(0, 16);

/** Monta o `ElementFingerprint` completo a partir dos sinais crus. */
export const montarFingerprint = (s: SinaisFingerprint): ElementFingerprint => ({
  hash: hashFingerprint(s),
  tag: s.tag.toLowerCase(),
  role: s.role,
  aria: s.aria,
  dataAttrs: dataAttrsDeIntencao(s.dataAttrs),
  text: resumirTexto(s.text),
  stableClasses: classesEstaveis(s.classes),
  id: s.id,
  semanticAncestor: s.semanticAncestor,
  siblingIndex: s.siblingIndex,
  structuralSignature: s.structuralSignature,
  box: s.box,
  listeners: [...new Set(s.listeners)].sort(),
  cursor: s.cursor,
});

/**
 * Similaridade 0..1 entre dois fingerprints — para religar quando o hash não
 * casa exatamente (uma interação mexeu numa classe, o texto trocou de idioma).
 *
 * Os pesos refletem a força do sinal: id casado é quase prova; tag+ancestral+
 * assinatura estrutural juntos também. Texto pesa pouco porque é o que mais muda.
 */
export const similaridade = (a: ElementFingerprint, b: ElementFingerprint): number => {
  if (a.hash === b.hash) return 1;
  let pontos = 0;
  let total = 0;
  const soma = (peso: number, igual: boolean): void => {
    total += peso;
    if (igual) pontos += peso;
  };

  soma(4, a.id !== null && a.id === b.id);
  soma(3, a.tag === b.tag);
  soma(2, a.role === b.role);
  soma(2, a.semanticAncestor === b.semanticAncestor);
  soma(2, a.structuralSignature === b.structuralSignature);
  soma(1, a.siblingIndex === b.siblingIndex);
  soma(1, a.text.length > 0 && a.text === b.text);

  // Classes: interseção sobre união (Jaccard), com peso alto porque é o sinal
  // que o V1 já usava e que funciona quando existe.
  const ca = new Set(a.stableClasses);
  const cb = new Set(b.stableClasses);
  const uniao = new Set([...ca, ...cb]);
  if (uniao.size > 0) {
    let inter = 0;
    for (const c of ca) if (cb.has(c)) inter++;
    total += 4;
    pontos += 4 * (inter / uniao.size);
  }

  // `data-*` de intenção: casar `data-toggle=modal` nos dois é forte.
  const da = Object.entries(a.dataAttrs);
  if (da.length > 0) {
    let casados = 0;
    for (const [k, v] of da) if (b.dataAttrs[k] === v) casados++;
    total += 2;
    pontos += 2 * (casados / da.length);
  }

  return total === 0 ? 0 : pontos / total;
};

/** Limiar acima do qual duas identidades são consideradas a mesma coisa. */
export const LIMIAR_MESMO_ELEMENTO = 0.78;

/**
 * Acha o melhor par para `alvo` numa lista. Devolve `null` quando nada passa do
 * limiar — deixar sem associação é melhor que grudar no elemento errado (foi
 * assim que backgrounds foram para a seção errada no V1).
 */
export const melhorPar = (
  alvo: ElementFingerprint,
  candidatos: readonly ElementFingerprint[],
): { fingerprint: ElementFingerprint; score: number } | null => {
  let melhor: { fingerprint: ElementFingerprint; score: number } | null = null;
  for (const c of candidatos) {
    const score = similaridade(alvo, c);
    if (melhor === null || score > melhor.score) melhor = { fingerprint: c, score };
  }
  return melhor !== null && melhor.score >= LIMIAR_MESMO_ELEMENTO ? melhor : null;
};
