import { api } from '@/lib/api';
import { ORBIS } from '@/lib/orbis';
import { usePreferencias } from '@/lib/preferencias';
import { useQuery } from '@tanstack/react-query';
import { SkipForward, Volume2, VolumeX } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

/**
 * Abertura do app: uma sequência de inicialização.
 *
 * A anterior era um typemark surgindo sobre brasas — bonita e muda. Esta conta
 * uma coisa: o que existe no seu laboratório. As linhas trazem os números REAIS
 * do acervo, lidos das mesmas rotas que a barra lateral usa, então além de abrir
 * o app ela já aquece o cache do react-query para a primeira tela.
 *
 * Regra acima de tudo: **a abertura nunca espera o servidor**. Se uma contagem
 * não chegou até a hora daquela linha aparecer, ela entra com um traço e a
 * sequência segue. Cortina que trava porque o backend demorou é pior que
 * cortina nenhuma.
 *
 * O vídeo do mascote entra como CENÁRIO, não no lugar do log. Antes era um ou
 * outro; ficou os dois. Trocar os números reais do acervo por uma animação seria
 * trocar informação por enfeite, e um vídeo de 7 s sozinho é tempo parado. Juntos,
 * o vídeo dá a cara e o log dá a notícia.
 *
 * Quem quiser outra abertura troca o `/intro.mp4` em `public/` (ver
 * `intro.README.md`) — o mecanismo é o mesmo.
 */

const VIDEO_SRC = '/intro.mp4';
/** A voz do Orbis, gerada por `pnpm voz`. */
const VOZ_SRC = '/orbis-voz.wav';
/** Sem vídeo, a abertura dura isto. Com vídeo, quem manda é o `onEnded`. */
const DURACAO_MS = 5200;
const DURACAO_REDUZIDA_MS = 2000;
/** Intervalo entre as linhas do log. */
const PASSO_S = 0.42;

type Modo = 'descobrindo' | 'canvas' | 'video';
type Linha = { rotulo: string; valor: string | undefined };

export function Intro({ onFinish }: { onFinish: () => void }) {
  const [saindo, setSaindo] = useState(false);
  /**
   * O navegador segurou o som e a imagem está esperando junto.
   *
   * Não é um detalhe de áudio: enquanto isso for verdade, o vídeo fica PARADO
   * no primeiro quadro de propósito, porque som e imagem desta abertura foram
   * sincronizados quadro a quadro e deixar um correr sem o outro entrega as
   * duas coisas erradas.
   */
  const [somTravado, setSomTravado] = useState(false);
  const [modo, setModo] = useState<Modo>('descobrindo');
  const jaFinalizou = useRef(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const pararSom = useRef<(() => void) | null>(null);

  const somLigado = usePreferencias((s) => s.somDaIntro);
  const definir = usePreferencias((s) => s.definir);

  const reduzido =
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
  const duracao = reduzido ? DURACAO_REDUZIDA_MS : DURACAO_MS;

  // `retry: false` de propósito: rota que falhou vira traço na linha e a
  // abertura segue. Repetir só atrasaria o que já está decidido.
  const opcoes = { retry: false as const, staleTime: 30_000 };
  const ds = useQuery({ queryKey: ['design-systems'], queryFn: api.listDesignSystems, ...opcoes });
  const lib = useQuery({ queryKey: ['library'], queryFn: api.listLibrary, ...opcoes });
  const kits = useQuery({ queryKey: ['kits'], queryFn: api.listKits, ...opcoes });
  const saude = useQuery({ queryKey: ['health'], queryFn: api.health, ...opcoes });

  const conta = (n: number | undefined, um: string, varios: string): string | undefined =>
    n === undefined ? undefined : `${n} ${n === 1 ? um : varios}`;

  const linhas: Linha[] = [
    {
      rotulo: 'orbis',
      valor: saude.isLoading ? undefined : saude.data?.status === 'ok' ? 'no ar' : 'fora do ar',
    },
    { rotulo: 'acervo', valor: conta(ds.data?.items.length, 'sistema', 'sistemas') },
    { rotulo: 'biblioteca', valor: conta(lib.data?.items.length, 'peça', 'peças') },
    { rotulo: 'design systems', valor: conta(kits.data?.items.length, 'kit', 'kits') },
  ];

  const finalizar = (): void => {
    if (jaFinalizou.current) return;
    jaFinalizou.current = true;
    pararSom.current?.();
    setSaindo(true);
    window.setTimeout(onFinish, 800);
  };

  // Descobre se há vídeo. Com movimento reduzido nem pergunta: quem pediu menos
  // movimento não deve receber sete segundos de animação em tela cheia.
  useEffect(() => {
    if (reduzido) {
      setModo('canvas');
      return;
    }
    let vivo = true;
    fetch(VIDEO_SRC, { method: 'HEAD' })
      .then((r) => {
        const tipo = r.headers.get('content-type') ?? '';
        if (vivo) setModo(r.ok && tipo.startsWith('video') ? 'video' : 'canvas');
      })
      .catch(() => {
        if (vivo) setModo('canvas');
      });
    return () => {
      vivo = false;
    };
  }, [reduzido]);

  // O relógio da abertura. No modo vídeo quem manda é o `onEnded`, e este timer é
  // rede de segurança: vídeo que não dispara `ended` — codec sem suporte, arquivo
  // truncado, aba em segundo plano — deixaria a cortina na tela para sempre.
  // biome-ignore lint/correctness/useExhaustiveDependencies: `finalizar` é idempotente por guarda de ref (`jaFinalizou`), então não precisa reagendar quando a identidade dela muda
  useEffect(() => {
    if (modo === 'descobrindo') return;
    const t = window.setTimeout(finalizar, modo === 'video' ? 20000 : duracao);
    return () => window.clearTimeout(t);
  }, [duracao, modo]);

  // O som é SEMPRE o sintetizado, e o vídeo fica sempre mudo.
  //
  // Duas razões. A primeira é técnica: vídeo com áudio não roda sem gesto do
  // usuário, e um vídeo que não roda é uma tela preta — mudo, ele sempre toca.
  // A segunda é de projeto: a ignição é escrita para acompanhar o que a tela
  // faz (as falhas, a pegada, o regime, um bipe por linha do log), coisa que a
  // trilha embutida num vídeo qualquer não teria como fazer.
  useEffect(() => {
    if (modo === 'descobrindo' || !somLigado || reduzido) return;
    const parar = tocarIgnicao(
      modo === 'video' ? 7000 : duracao,
      modo === 'video' ? BATIDAS_VIDEO : BATIDAS_CANVAS,
      {
        aoBloquear: () => {
          setSomTravado(true);
          const v = videoRef.current;
          if (v !== null) {
            v.pause();
            v.currentTime = 0;
          }
        },
        // Voltam JUNTOS, do zero. Retomar de onde a imagem parou deixaria a
        // ignição do som acontecendo depois da ignição da tela.
        aoDestravar: () => {
          setSomTravado(false);
          const v = videoRef.current;
          if (v !== null) {
            v.currentTime = 0;
            void v.play().catch(() => {});
          }
        },
      },
    );
    pararSom.current = parar;
    return () => {
      parar();
      pararSom.current = null;
    };
  }, [modo, somLigado, reduzido, duracao]);

  const atraso = (i: number): string => (reduzido ? '0s' : `${0.35 + i * PASSO_S}s`);
  const atrasoMarca = (extra: number): string =>
    reduzido ? '0s' : `${0.35 + linhas.length * PASSO_S + extra}s`;

  return (
    <div className={`intro-root${saindo ? ' intro-out' : ''}`} role="presentation">
      {modo === 'video' ? (
        <>
          {/* Mudo sempre, de propósito: o navegador bloqueia autoplay com som, e
              o bloqueio é silencioso — o vídeo fica parado no primeiro quadro e
              a abertura parece não ter vídeo nenhum. Quem faz o som aqui é a
              ignição sintetizada, que também acompanha o log. */}
          <video
            ref={videoRef}
            src={VIDEO_SRC}
            autoPlay
            muted
            playsInline
            preload="auto"
            onEnded={finalizar}
            className="intro-video"
          />
          {/* O véu existe para o log ser legível por cima de qualquer quadro do
              vídeo. Sem ele, um trecho claro apaga o texto e a informação vira
              enfeite ilegível — que é o oposto do que ela está fazendo ali. */}
          <div className="intro-veu" aria-hidden />
        </>
      ) : (
        <>
          <div className="intro-halo" aria-hidden />
          <div className="intro-bg" aria-hidden />
          <div className="intro-scan" aria-hidden />
        </>
      )}

      {/* Mudo sem explicação parece app quebrado. Uma linha, discreta, dizendo
          o que falta e o que fazer. Some sozinha no primeiro toque. */}
      {somTravado && somLigado && (
        <button
          type="button"
          className="intro-destravar"
          onClick={() => {
            /* o ouvinte de pointerdown do próprio som faz o trabalho */
          }}
        >
          Toque para ouvir o {ORBIS}
        </button>
      )}

      {/* O log vale nos DOIS modos: é ele que carrega a notícia. */}
      {modo !== 'descobrindo' && (
        <div className="intro-stage">
          <div className="intro-log">
            {linhas.map((l, i) => (
              <div key={l.rotulo} className="intro-linha" style={{ animationDelay: atraso(i) }}>
                <span className="rotulo">&gt; {l.rotulo}</span>
                <span className="pontos" aria-hidden />
                <span className="valor">{l.valor ?? '—'}</span>
              </div>
            ))}
          </div>

          <div className="intro-marca">
            <div className="intro-line1" style={{ animationDelay: atrasoMarca(0) }}>
              Design System
            </div>
            <div className="intro-underline" style={{ animationDelay: atrasoMarca(0.15) }} />
            <div className="intro-line2" style={{ animationDelay: atrasoMarca(0.35) }}>
              <span className="intro-dot" aria-hidden />
              extrai · cura · gera
            </div>
          </div>
        </div>
      )}

      <div className="intro-controls">
        <button
          type="button"
          className="intro-btn"
          onClick={() => definir({ somDaIntro: !somLigado })}
          aria-pressed={!somLigado}
          title={somLigado ? 'Silenciar a abertura' : 'Ligar o som da abertura'}
        >
          {somLigado ? <Volume2 size={12} /> : <VolumeX size={12} />}
          {somLigado ? 'som' : 'mudo'}
        </button>
        <button type="button" className="intro-btn" onClick={finalizar}>
          <SkipForward size={12} />
          pular
        </button>
      </div>
    </div>
  );
}

/**
 * O som de um sistema tentando ligar.
 *
 * Sintetizado, não gravado: a abertura não depende de baixar nada, e dá para
 * cortar no meio sem estalo. Devolve a função que corta — quem aperta "pular"
 * não pode continuar ouvindo o fim de um som que já não tem imagem.
 *
 * A dramaturgia é a de uma máquina antiga acordando, e é feita de três partes:
 *
 * 1. **A ignição falha duas vezes.** Um zumbido grave sobe, engasga e morre.
 *    É o que faz o terceiro ser um alívio em vez de só um começo.
 * 2. **A pegada.** Varredura de frequência subindo com o filtro abrindo junto,
 *    mais um golpe grave — o instante em que o núcleo pega.
 * 3. **O regime.** Duas ondas quase afinadas, batendo lentamente entre si. O
 *    batimento é o que soa "ligado" em vez de "nota musical parada".
 *
 * Sobre o autoplay: o navegador cria o contexto suspenso enquanto não houve
 * gesto do usuário. Em vez de fingir que tocou, o retorno inclui o religamento
 * no primeiro clique ou tecla — o som entra atrasado, mas entra.
 */

/**
 * As batidas da ignicao, em segundos.
 *
 * O som conta uma historia (falha, falha, pega, regime) e ela so funciona se
 * cair EM CIMA do que a tela faz. Com a animacao em canvas quem manda e o som,
 * porque o canvas foi desenhado em volta dele. Com video quem manda e o video,
 * e ai os numeros nao podem ser inventados.
 *
 * Os do video foram MEDIDOS: abri o intro.mp4 num navegador, amostrei o brilho
 * medio do quadro a cada 0,25 s e li a curva. Ela diz, sem ambiguidade:
 *
 *   0,00 a 1,25 s   escuro (brilho ~3)
 *   1,50 s          um tremeluzir (5,3) que morre logo depois
 *   2,50 s em diante subida continua (5,3 → 9 → 16 → 23)
 *   4,00 a 4,25 s   o estouro (67 → 73), o instante em que ele liga
 *   4,50 s adiante  estavel, camera se aproximando
 *
 * Antes desta medicao o som acendia em 1,5 s e a voz falava em 3,0 s: o Orbis
 * se apresentava 1,1 s ANTES de acender na tela.
 *
 * Trocar o video sem refazer essa leitura devolve o desencontro. O jeito de
 * refazer esta em `docs/` junto do intro.README.md.
 */
type Batidas = {
  /** As duas ignicoes que falham. */
  falha1: number;
  falha2: number;
  /** Quando a luz comeca a subir de verdade. */
  pega: number;
  /** Quanto tempo a subida leva ate o estouro. */
  subida: number;
  /** Quanto tempo depois do estouro o Orbis fala. */
  vozApos: number;
};

const BATIDAS_CANVAS: Batidas = {
  falha1: 0.15,
  falha2: 0.85,
  pega: 1.5,
  subida: 1.1,
  vozApos: 0.4,
};
const BATIDAS_VIDEO: Batidas = { falha1: 0.5, falha2: 1.35, pega: 2.5, subida: 1.6, vozApos: 0.3 };

function tocarIgnicao(
  duracaoMs: number,
  batidas: Batidas,
  avisos?: { aoBloquear?: () => void; aoDestravar?: () => void },
): () => void {
  let ctx: AudioContext;
  try {
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (Ctor === undefined) return () => {};
    ctx = new Ctor();
  } catch {
    return () => {};
  }

  const t0 = ctx.currentTime;
  const fim = t0 + duracaoMs / 1000;
  const mestre = ctx.createGain();
  mestre.gain.value = 0.9;
  mestre.connect(ctx.destination);

  /** Uma tentativa que não pega: sobe, engasga, morre. */
  const tentativa = (quando: number, dur: number): void => {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(300, quando);
    f.frequency.linearRampToValueAtTime(900, quando + dur * 0.6);
    f.frequency.linearRampToValueAtTime(180, quando + dur);
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(38, quando);
    osc.frequency.linearRampToValueAtTime(84, quando + dur * 0.6);
    osc.frequency.linearRampToValueAtTime(30, quando + dur);
    g.gain.setValueAtTime(0.0001, quando);
    g.gain.exponentialRampToValueAtTime(0.12, quando + 0.06);
    g.gain.exponentialRampToValueAtTime(0.0001, quando + dur);
    osc.connect(f);
    f.connect(g);
    g.connect(mestre);
    osc.start(quando);
    osc.stop(quando + dur + 0.05);
  };

  tentativa(t0 + batidas.falha1, 0.42);
  tentativa(t0 + batidas.falha2, 0.34);

  // A pegada: varredura subindo com o filtro abrindo junto.
  const pega = t0 + batidas.pega;
  /** O instante do estouro: onde o golpe grave e a voz se penduram. */
  const estouro = pega + batidas.subida;
  const sweep = ctx.createOscillator();
  const sweepG = ctx.createGain();
  const sweepF = ctx.createBiquadFilter();
  sweepF.type = 'lowpass';
  sweepF.frequency.setValueAtTime(220, pega);
  sweepF.frequency.exponentialRampToValueAtTime(4200, estouro);
  sweep.type = 'sawtooth';
  sweep.frequency.setValueAtTime(40, pega);
  sweep.frequency.exponentialRampToValueAtTime(220, estouro);
  sweepG.gain.setValueAtTime(0.0001, pega);
  sweepG.gain.exponentialRampToValueAtTime(0.16, pega + 0.5);
  sweepG.gain.exponentialRampToValueAtTime(0.02, estouro + 0.4);
  sweep.connect(sweepF);
  sweepF.connect(sweepG);
  sweepG.connect(mestre);
  sweep.start(pega);
  sweep.stop(estouro + 0.5);

  // O golpe grave do instante em que pega.
  const golpe = ctx.createOscillator();
  const golpeG = ctx.createGain();
  golpe.type = 'sine';
  golpe.frequency.setValueAtTime(160, estouro);
  golpe.frequency.exponentialRampToValueAtTime(38, estouro + 0.5);
  golpeG.gain.setValueAtTime(0.0001, estouro);
  golpeG.gain.exponentialRampToValueAtTime(0.3, estouro + 0.07);
  golpeG.gain.exponentialRampToValueAtTime(0.0001, estouro + 0.75);
  golpe.connect(golpeG);
  golpeG.connect(mestre);
  golpe.start(estouro);
  golpe.stop(estouro + 0.85);

  // O regime: duas ondas quase afinadas, batendo devagar entre si.
  const regime = estouro - 0.5;
  const droneG = ctx.createGain();
  const droneF = ctx.createBiquadFilter();
  droneF.type = 'lowpass';
  droneF.frequency.value = 620;
  droneG.gain.setValueAtTime(0.0001, regime);
  droneG.gain.exponentialRampToValueAtTime(0.11, regime + 1.2);
  droneG.gain.exponentialRampToValueAtTime(0.0001, fim);
  droneF.connect(droneG);
  droneG.connect(mestre);
  for (const hz of [55, 55.7, 110.4]) {
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.value = hz;
    osc.connect(droneF);
    osc.start(regime);
    osc.stop(fim + 0.1);
  }

  // Um bipe por linha do log, subindo de tom — amarra o som ao que acontece na
  // tela, em vez de ser trilha por cima.
  for (let i = 0; i < 4; i++) {
    const t = regime + 0.5 + i * PASSO_S;
    if (t > fim - 0.3) break;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = 880 + i * 130;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.05, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
    osc.connect(g);
    g.connect(mestre);
    osc.start(t);
    osc.stop(t + 0.18);
  }

  // ── A voz ────────────────────────────────────────────────────────────────
  //
  // O Orbis se apresenta no instante em que o núcleo pega. Antes disso a
  // máquina ainda está tentando ligar, e falar por cima das duas ignições
  // falhadas desmontaria a dramaturgia: quem fala já acordou.
  //
  // O timbre de robô é feito AQUI, e não no arquivo. A gravação sai limpa do
  // sintetizador do Windows (`pnpm voz`) e o caráter vem de duas coisas:
  //
  // 1. **Modulação em anel.** Um oscilador grave multiplica a amplitude da voz.
  //    É o efeito clássico de voz de máquina, e é o que tira dela o "alguém
  //    lendo uma frase".
  // 2. **Banda estreita.** Passa-faixa de 300 a 3400 Hz, a banda de um alto
  //    falante de comunicação. Tirar o grave e o brilho é metade do efeito.
  //
  // A mistura é 55% seca e 45% modulada, medida de ouvido: no anel puro a frase
  // fica mecânica e ILEGÍVEL, e uma boas-vindas que ninguém entende não é
  // boas-vindas.
  //
  // Falha em silêncio de propósito. Sem o arquivo, sem `decodeAudioData` ou com
  // a aba em segundo plano, a abertura segue com o som de ignição: a voz é
  // acabamento, e acabamento não derruba a entrada do app.
  const anelOsc = ctx.createOscillator();
  fetch(VOZ_SRC)
    .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error('sem voz'))))
    .then((buf) => ctx.decodeAudioData(buf))
    .then((audio) => {
      // Quando a fala entra: depois da pegada, e cedo o bastante para CABER.
      //
      // O primeiro corte foi por tempo: a voz entrava num instante fixo e a
      // cortina saía por cima da última sílaba. Afinar os dois à mão resolveria
      // esta frase e quebraria na próxima, porque o arquivo é gerado por
      // comando (`pnpm voz`) e muda de tamanho com o texto.
      //
      // Então a hora sai da duração real do buffer: o ideal é logo depois do
      // golpe grave, mas se a frase for longa ela entra antes para terminar
      // junto com a cena. Se não couber nem começando agora, não toca. Meia
      // apresentação é pior que nenhuma.
      const ideal = estouro + batidas.vozApos;
      const ultimoPossivel = fim - audio.duration - 0.15;
      const quando = Math.min(ideal, ultimoPossivel);
      if (quando < ctx.currentTime) return;

      const fonte = ctx.createBufferSource();
      fonte.buffer = audio;

      const banda = ctx.createBiquadFilter();
      banda.type = 'bandpass';
      banda.frequency.value = 1500;
      banda.Q.value = 0.7;

      const seca = ctx.createGain();
      seca.gain.value = 0.55;
      const modulada = ctx.createGain();
      modulada.gain.value = 0;

      // O oscilador vai para o GANHO do nó, não para a entrada de áudio: é isso
      // que multiplica um sinal pelo outro em vez de somar os dois.
      const profundidade = ctx.createGain();
      profundidade.gain.value = 0.45;
      anelOsc.type = 'sine';
      anelOsc.frequency.value = 47;
      anelOsc.connect(profundidade);
      profundidade.connect(modulada.gain);

      const voz = ctx.createGain();
      voz.gain.value = 1.15;

      fonte.connect(banda);
      banda.connect(seca);
      banda.connect(modulada);
      seca.connect(voz);
      modulada.connect(voz);
      voz.connect(mestre);

      anelOsc.start(quando);
      anelOsc.stop(fim + 0.2);
      fonte.start(quando);
    })
    .catch(() => {
      /* sem voz: a ignição sozinha continua contando a história */
    });

  // ── Quando o navegador segura o som ──────────────────────────────────────
  //
  // O contexto nasce suspenso enquanto não houve gesto do usuário. O que isso
  // provoca é pior do que silêncio, e foi medido: `ctx.currentTime` NÃO ANDA
  // enquanto ele está suspenso, mas o vídeo anda. Quem clicava aos 4 s ouvia a
  // ignição começar do zero com a imagem já perto do fim, as duas contando
  // histórias diferentes ao mesmo tempo.
  //
  // Primeiro tentamos destravar sozinhos: às vezes a permissão já existe (o
  // navegador aberto pelo INICIAR, ou uma origem em que a pessoa já interagiu
  // antes) e o `resume()` simplesmente funciona.
  //
  // Se não funcionar, quem chamou é avisado para SEGURAR A IMAGEM também. Só
  // assim as duas voltam juntas no primeiro toque.
  const destravar = (): void => {
    ctx
      .resume()
      .then(() => {
        if (ctx.state === 'running') avisos?.aoDestravar?.();
      })
      .catch(() => {});
  };

  void ctx
    .resume()
    .catch(() => {})
    .finally(() => {
      if (ctx.state === 'running') return;
      avisos?.aoBloquear?.();
      window.addEventListener('pointerdown', destravar, { once: true });
      window.addEventListener('keydown', destravar, { once: true });
    });

  return () => {
    window.removeEventListener('pointerdown', destravar);
    window.removeEventListener('keydown', destravar);
    try {
      mestre.gain.cancelScheduledValues(ctx.currentTime);
      mestre.gain.setValueAtTime(mestre.gain.value, ctx.currentTime);
      mestre.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.15);
      window.setTimeout(() => void ctx.close(), 200);
    } catch {
      /* contexto já fechado */
    }
  };
}
