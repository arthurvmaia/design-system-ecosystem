import type { NormalizedBox, NormalizedPoint, PointerPathKind } from '@ds/shared';

/**
 * Geradores de trajetória do ponteiro — funções puras em coordenada normalizada.
 *
 * Por que normalizada (0..1) e não px: a mesma trajetória tem de valer em
 * 1440x900, num notebook 1280x720, com zoom e com `deviceScaleFactor` diferente.
 * A conversão para px acontece na execução, contra a viewport daquele momento.
 *
 * Por que uma curva de cobertura e não círculos: o V1 nunca movia o ponteiro pela
 * viewport — só dava `hover` na caixa do elemento. Cena que reage ao cursor
 * (partículas, tilt, câmera, campo magnético, hover em região de canvas sem DOM)
 * nunca era provocada. A trajetória PRINCIPAL precisa cobrir a área
 * uniformemente; os círculos são COMPLEMENTARES, e existem porque efeito radial,
 * cena orbital e globo só se revelam com movimento angular.
 *
 * Nenhum destes toca no mouse do sistema: o consumidor dirige o mouse do
 * Chromium (`page.mouse`) com os pontos daqui.
 */

const clamp01 = (n: number): number => (n < 0 ? 0 : n > 1 ? 1 : n);

const ponto = (x: number, y: number): NormalizedPoint => ({ x: clamp01(x), y: clamp01(y) });

/** Remove pontos consecutivos praticamente iguais (não vale mover 0.001). */
const semRepeticao = (pts: NormalizedPoint[], epsilon = 0.004): NormalizedPoint[] => {
  const out: NormalizedPoint[] = [];
  for (const p of pts) {
    const ultimo = out[out.length - 1];
    if (ultimo && Math.abs(ultimo.x - p.x) < epsilon && Math.abs(ultimo.y - p.y) < epsilon)
      continue;
    out.push(p);
  }
  return out;
};

// ── Hilbert ──────────────────────────────────────────────────────────────────

/**
 * Índice → coordenada na curva de Hilbert de ordem `order`.
 *
 * Escolhida como trajetória principal porque tem a propriedade que interessa
 * aqui: **localidade**. Pontos vizinhos na curva são vizinhos na tela, então o
 * ponteiro nunca teleporta de um canto ao outro — o que importa porque muitos
 * efeitos precisam de movimento CONTÍNUO para reagir (um `mousemove` com delta
 * gigante é ignorado por vários runtimes, e cursor magnético/parallax de mouse
 * interpola em cima do delta).
 */
const hilbertD2XY = (order: number, d: number): { x: number; y: number } => {
  const n = 1 << order;
  let rx = 0;
  let ry = 0;
  let t = d;
  let x = 0;
  let y = 0;
  for (let s = 1; s < n; s *= 2) {
    rx = 1 & (t / 2);
    ry = 1 & (t ^ rx);
    // rotação
    if (ry === 0) {
      if (rx === 1) {
        x = s - 1 - x;
        y = s - 1 - y;
      }
      const tmp = x;
      x = y;
      y = tmp;
    }
    x += s * rx;
    y += s * ry;
    t = Math.floor(t / 4);
  }
  return { x, y };
};

/**
 * Curva de Hilbert cobrindo a viewport. `order` 3 = 64 pontos, 4 = 256, 5 = 1024.
 * O default 4 cobre bem sem estourar orçamento (256 movimentos ≈ alguns segundos).
 */
export const trajetoriaHilbert = (order = 4): NormalizedPoint[] => {
  const n = 1 << order;
  const total = n * n;
  const pts: NormalizedPoint[] = [];
  for (let d = 0; d < total; d++) {
    const { x, y } = hilbertD2XY(order, d);
    // Centro da célula: evita as bordas exatas (0 e 1), onde o ponteiro pode
    // sair da viewport e o hover não registra.
    pts.push(ponto((x + 0.5) / n, (y + 0.5) / n));
  }
  return pts;
};

// ── Serpentina e grade ───────────────────────────────────────────────────────

/** Serpentina: linhas alternando direção. Cobertura uniforme e barata. */
export const trajetoriaSerpentina = (linhas = 8, colunas = 12): NormalizedPoint[] => {
  const pts: NormalizedPoint[] = [];
  for (let r = 0; r < linhas; r++) {
    const y = (r + 0.5) / linhas;
    for (let c = 0; c < colunas; c++) {
      const i = r % 2 === 0 ? c : colunas - 1 - c;
      pts.push(ponto((i + 0.5) / colunas, y));
    }
  }
  return pts;
};

/** Grade contínua (sem alternar): útil quando o efeito depende do sentido. */
export const trajetoriaGrade = (linhas = 6, colunas = 8): NormalizedPoint[] => {
  const pts: NormalizedPoint[] = [];
  for (let r = 0; r < linhas; r++) {
    for (let c = 0; c < colunas; c++) {
      pts.push(ponto((c + 0.5) / colunas, (r + 0.5) / linhas));
    }
  }
  return pts;
};

// ── Círculos (complementares) ────────────────────────────────────────────────

/**
 * Anéis concêntricos. `fechando` vai do maior raio ao menor; `expandindo`, o
 * contrário. Existem para provocar o que a cobertura uniforme não provoca:
 * gradiente radial que segue o cursor, campo de partículas com atração,
 * câmera orbital, globo que gira, card com tilt.
 *
 * O raio é medido em fração da MENOR dimensão para o círculo continuar círculo
 * numa viewport larga; o desenho na tela vira elipse, e é isso que se quer (cobre
 * a área útil em vez de um disco no meio).
 */
const aneis = (
  fechando: boolean,
  voltas: number,
  porVolta: number,
  raioMax: number,
  raioMin: number,
): NormalizedPoint[] => {
  const pts: NormalizedPoint[] = [];
  for (let v = 0; v < voltas; v++) {
    const t = voltas === 1 ? 0 : v / (voltas - 1);
    const raio = fechando ? raioMax - t * (raioMax - raioMin) : raioMin + t * (raioMax - raioMin);
    for (let i = 0; i <= porVolta; i++) {
      const ang = (i / porVolta) * Math.PI * 2;
      pts.push(ponto(0.5 + Math.cos(ang) * raio, 0.5 + Math.sin(ang) * raio));
    }
  }
  return pts;
};

export const trajetoriaCirculoFechando = (voltas = 4, porVolta = 24): NormalizedPoint[] =>
  aneis(true, voltas, porVolta, 0.46, 0.08);

export const trajetoriaCirculoExpandindo = (voltas = 4, porVolta = 24): NormalizedPoint[] =>
  aneis(false, voltas, porVolta, 0.46, 0.08);

// ── Retas ────────────────────────────────────────────────────────────────────

export const trajetoriaDiagonal = (passos = 24): NormalizedPoint[] => {
  const pts: NormalizedPoint[] = [];
  for (let i = 0; i <= passos; i++) pts.push(ponto(i / passos, i / passos));
  for (let i = 0; i <= passos; i++) pts.push(ponto(1 - i / passos, i / passos));
  return pts;
};

export const trajetoriaHorizontal = (linhas = 3, passos = 24): NormalizedPoint[] => {
  const pts: NormalizedPoint[] = [];
  for (let r = 0; r < linhas; r++) {
    const y = (r + 0.5) / linhas;
    for (let i = 0; i <= passos; i++) pts.push(ponto(r % 2 === 0 ? i / passos : 1 - i / passos, y));
  }
  return pts;
};

export const trajetoriaVertical = (colunas = 3, passos = 24): NormalizedPoint[] => {
  const pts: NormalizedPoint[] = [];
  for (let c = 0; c < colunas; c++) {
    const x = (c + 0.5) / colunas;
    for (let i = 0; i <= passos; i++) pts.push(ponto(x, c % 2 === 0 ? i / passos : 1 - i / passos));
  }
  return pts;
};

/** Espiral para o centro (e a inversa). Provoca efeito de profundidade/zoom. */
const espiral = (paraDentro: boolean, voltas = 3, passos = 90): NormalizedPoint[] => {
  const pts: NormalizedPoint[] = [];
  for (let i = 0; i <= passos; i++) {
    const t = i / passos;
    const raio = paraDentro ? 0.46 * (1 - t) : 0.46 * t;
    const ang = t * Math.PI * 2 * voltas;
    pts.push(ponto(0.5 + Math.cos(ang) * raio, 0.5 + Math.sin(ang) * raio));
  }
  return pts;
};

export const trajetoriaAproximarCentro = (): NormalizedPoint[] => espiral(true);
export const trajetoriaAfastarCentro = (): NormalizedPoint[] => espiral(false);

// ── Refinamento ──────────────────────────────────────────────────────────────

/**
 * Segunda passada, densa, dentro de uma região que já reagiu. É o que substitui
 * "percorrer cada pixel": a primeira passada é esparsa e barata, e só onde houve
 * reação o ponteiro volta com resolução alta.
 */
export const trajetoriaRefinamento = (regiao: NormalizedBox, densidade = 5): NormalizedPoint[] => {
  const pts: NormalizedPoint[] = [];
  const n = Math.max(2, densidade);
  for (let r = 0; r < n; r++) {
    const y = regiao.y + ((r + 0.5) / n) * regiao.h;
    for (let c = 0; c < n; c++) {
      const i = r % 2 === 0 ? c : n - 1 - c;
      pts.push(ponto(regiao.x + ((i + 0.5) / n) * regiao.w, y));
    }
  }
  return pts;
};

// ── Fábrica ──────────────────────────────────────────────────────────────────

export type OpcoesTrajetoria = {
  /** Só para `refinamento`. */
  regiao?: NormalizedBox;
  /** Densidade/resolução; significa ordem no Hilbert, células nas grades. */
  densidade?: number;
};

/**
 * Constrói a trajetória de um tipo. Centraliza para o executor não precisar
 * conhecer cada gerador — e para o manifesto poder registrar só o `kind` e
 * reconstruir depois.
 */
export const construirTrajetoria = (
  kind: PointerPathKind,
  opts: OpcoesTrajetoria = {},
): NormalizedPoint[] => {
  const d = opts.densidade;
  switch (kind) {
    case 'hilbert':
      return semRepeticao(trajetoriaHilbert(d ?? 4));
    case 'serpentina':
      return semRepeticao(trajetoriaSerpentina(d ?? 8, (d ?? 8) + 4));
    case 'grade':
      return semRepeticao(trajetoriaGrade(d ?? 6, (d ?? 6) + 2));
    case 'circulo-fechando':
      return semRepeticao(trajetoriaCirculoFechando(d ?? 4));
    case 'circulo-expandindo':
      return semRepeticao(trajetoriaCirculoExpandindo(d ?? 4));
    case 'diagonal':
      return semRepeticao(trajetoriaDiagonal(d ?? 24));
    case 'horizontal':
      return semRepeticao(trajetoriaHorizontal(d ?? 3));
    case 'vertical':
      return semRepeticao(trajetoriaVertical(d ?? 3));
    case 'aproximar-centro':
      return semRepeticao(trajetoriaAproximarCentro());
    case 'afastar-centro':
      return semRepeticao(trajetoriaAfastarCentro());
    case 'refinamento':
      return opts.regiao
        ? semRepeticao(trajetoriaRefinamento(opts.regiao, d ?? 5))
        : semRepeticao(trajetoriaGrade(3, 3));
  }
};

/**
 * A ordem em que as trajetórias devem ser tentadas.
 *
 * A primeira é de COBERTURA (obrigatória). As complementares só rodam quando
 * houver orçamento **e** evidência de que a viewport reage ao ponteiro — gastar
 * dez trajetórias numa página de texto é desperdício, e é o tipo de custo que
 * fazia a extração levar minutos sem retorno.
 */
export const TRAJETORIA_COBERTURA: PointerPathKind = 'hilbert';

export const TRAJETORIAS_COMPLEMENTARES: readonly PointerPathKind[] = [
  'circulo-fechando',
  'circulo-expandindo',
  'diagonal',
  'aproximar-centro',
  'horizontal',
  'vertical',
  'afastar-centro',
];

/** Converte um ponto normalizado para px na viewport dada. */
export const paraPixels = (
  p: NormalizedPoint,
  viewport: { width: number; height: number },
): { x: number; y: number } => ({
  // `-1` para nunca cair exatamente na borda direita/inferior, onde o Chromium
  // considera o ponteiro fora da viewport e o `mousemove` não gera hover.
  x: Math.min(viewport.width - 1, Math.max(0, Math.round(p.x * viewport.width))),
  y: Math.min(viewport.height - 1, Math.max(0, Math.round(p.y * viewport.height))),
});

/** Caixa normalizada a partir de px — o inverso, para registrar regiões reativas. */
export const boxNormalizado = (
  box: { x: number; y: number; w: number; h: number },
  viewport: { width: number; height: number },
): NormalizedBox => ({
  x: box.x / viewport.width,
  y: box.y / viewport.height,
  w: box.w / viewport.width,
  h: box.h / viewport.height,
});

/** Junta caixas normalizadas próximas numa só — para não gerar mil regiões. */
export const unirRegioes = (regioes: readonly NormalizedBox[], folga = 0.05): NormalizedBox[] => {
  const restantes = [...regioes];
  const out: NormalizedBox[] = [];
  while (restantes.length > 0) {
    const atual = restantes.shift();
    if (atual === undefined) break;
    let caixa = { ...atual };
    let mudou = true;
    while (mudou) {
      mudou = false;
      for (let i = restantes.length - 1; i >= 0; i--) {
        const r = restantes[i];
        if (r === undefined) continue;
        const perto =
          r.x < caixa.x + caixa.w + folga &&
          r.x + r.w > caixa.x - folga &&
          r.y < caixa.y + caixa.h + folga &&
          r.y + r.h > caixa.y - folga;
        if (!perto) continue;
        const x = Math.min(caixa.x, r.x);
        const y = Math.min(caixa.y, r.y);
        caixa = {
          x,
          y,
          w: Math.max(caixa.x + caixa.w, r.x + r.w) - x,
          h: Math.max(caixa.y + caixa.h, r.y + r.h) - y,
        };
        restantes.splice(i, 1);
        mudou = true;
      }
    }
    out.push(caixa);
  }
  return out;
};
