import { criarEmbers } from '@/lib/embers';
import { SkipForward } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

/**
 * Abertura do app (INICIAR).
 *
 * É a intro DO app — não redireciona para lugar nenhum: ao terminar (ou ao
 * pular), entra direto na aplicação. Conteúdo original na paleta obsidian +
 * crimson + bone: brasas em canvas atrás do typemark da marca, com trilha
 * gerada por Web Audio. Nada de vídeo de terceiros embutido.
 *
 * Vídeo próprio (opcional): se existir um arquivo em `public/intro.mp4`, a intro
 * toca esse vídeo no lugar da animação — é onde você pluga a SUA abertura, se
 * tiver os direitos dela.
 *
 * Som: começa COM som. O navegador bloqueia autoplay com áudio sem um gesto, e
 * isso não dá para burlar por código; então, se ele barrar, o som entra no
 * PRIMEIRO toque/tecla em qualquer lugar — sem botão de mudo. Só há o de pular.
 * Para autoplay-com-som garantido, abra o app com
 * `--autoplay-policy=no-user-gesture-required` (ver o INICIAR).
 */

const VIDEO_SRC = '/intro.mp4';
const DURACAO_MS = 7200;
const DURACAO_REDUZIDA_MS = 2600;

type Modo = 'checando' | 'canvas' | 'video';

/**
 * Trilha original: um drone grave que cresce, um "whoosh" de ruído filtrado e um
 * impacto grave no momento da revelação. Tudo sintetizado — sem sample de
 * terceiros. Devolve um `stop` que faz fade-out.
 */
const tocarSting = (ctx: AudioContext, master: GainNode, reduzido: boolean): (() => void) => {
  const now = ctx.currentTime;

  // Drone (55 + 110 Hz) que cresce e sustenta.
  const droneGain = ctx.createGain();
  droneGain.gain.setValueAtTime(0.0001, now);
  droneGain.gain.exponentialRampToValueAtTime(0.06, now + 2.2);
  droneGain.gain.setValueAtTime(0.06, now + 5.0);
  droneGain.gain.exponentialRampToValueAtTime(0.0001, now + 6.6);
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 600;
  droneGain.connect(lp);
  lp.connect(master);
  for (const f of [55, 110]) {
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.value = f;
    o.connect(droneGain);
    o.start(now);
    o.stop(now + 6.8);
  }

  // Impacto grave alinhado com a revelação do typemark.
  const tImp = now + (reduzido ? 0.2 : 0.4);
  const impGain = ctx.createGain();
  impGain.gain.setValueAtTime(0.0001, tImp);
  impGain.gain.exponentialRampToValueAtTime(0.16, tImp + 0.02);
  impGain.gain.exponentialRampToValueAtTime(0.0001, tImp + 0.9);
  impGain.connect(master);
  const oi = ctx.createOscillator();
  oi.type = 'sine';
  oi.frequency.setValueAtTime(150, tImp);
  oi.frequency.exponentialRampToValueAtTime(50, tImp + 0.4);
  oi.connect(impGain);
  oi.start(tImp);
  oi.stop(tImp + 1.0);

  // Whoosh de ruído com passa-banda subindo.
  const dur = 1.4;
  const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * dur), ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  const noise = ctx.createBufferSource();
  noise.buffer = buf;
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.setValueAtTime(300, now + 0.4);
  bp.frequency.exponentialRampToValueAtTime(2400, now + 1.6);
  bp.Q.value = 0.8;
  const nGain = ctx.createGain();
  nGain.gain.setValueAtTime(0.0001, now + 0.4);
  nGain.gain.exponentialRampToValueAtTime(0.05, now + 1.0);
  nGain.gain.exponentialRampToValueAtTime(0.0001, now + 1.9);
  noise.connect(bp);
  bp.connect(nGain);
  nGain.connect(master);
  noise.start(now + 0.4);
  noise.stop(now + 2.0);

  return () => {
    try {
      const t = ctx.currentTime;
      master.gain.cancelScheduledValues(t);
      master.gain.setValueAtTime(Math.max(0.0001, master.gain.value), t);
      master.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
    } catch {
      // contexto já encerrado
    }
  };
};

const criarAudioContext = (): AudioContext | null => {
  const w = window as unknown as {
    AudioContext?: typeof AudioContext;
    webkitAudioContext?: typeof AudioContext;
  };
  const AC = w.AudioContext ?? w.webkitAudioContext;
  return AC ? new AC() : null;
};

export function Intro({ onFinish }: { onFinish: () => void }) {
  const [modo, setModo] = useState<Modo>('checando');
  const [saindo, setSaindo] = useState(false);

  const jaFinalizou = useRef(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<{
    ctx: AudioContext;
    master: GainNode;
    iniciar: () => void;
    stop: () => void;
  } | null>(null);

  const reduzido =
    typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const finalizar = (): void => {
    if (jaFinalizou.current) return;
    jaFinalizou.current = true;
    setSaindo(true);
    try {
      audioRef.current?.stop();
    } catch {
      // sem áudio ativo
    }
    window.setTimeout(onFinish, 800);
  };

  // Descobre se há um vídeo próprio do usuário; senão, animação.
  useEffect(() => {
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
  }, []);

  // Modo canvas: brasas + timer mestre + trilha.
  // biome-ignore lint/correctness/useExhaustiveDependencies: roda uma vez por modo; incluir finalizar reiniciaria a intro
  useEffect(() => {
    if (modo !== 'canvas') return;
    const cv = canvasRef.current;
    const pararBrasas =
      cv && !reduzido ? criarEmbers(cv, { count: 90, peakAlpha: 0.8, glows: true }) : () => {};

    const ctx = criarAudioContext();
    let onGesto: (() => void) | null = null;
    if (ctx) {
      const master = ctx.createGain();
      master.gain.value = 0.9;
      master.connect(ctx.destination);
      let stopSting: (() => void) | null = null;
      const iniciar = (): void => {
        if (stopSting || jaFinalizou.current) return;
        stopSting = tocarSting(ctx, master, reduzido);
      };
      audioRef.current = { ctx, master, iniciar, stop: () => stopSting?.() };
      // Começa com som na hora. Se o navegador barrar (autoplay), o som entra no
      // primeiro gesto em qualquer lugar — sem botão, sem opção de mudo.
      ctx
        .resume()
        .then(() => {
          if (ctx.state === 'running') iniciar();
        })
        .catch(() => {});
      onGesto = () =>
        ctx
          .resume()
          .then(iniciar)
          .catch(() => {});
      window.addEventListener('pointerdown', onGesto, { once: true });
      window.addEventListener('keydown', onGesto, { once: true });
    }

    const timer = window.setTimeout(finalizar, reduzido ? DURACAO_REDUZIDA_MS : DURACAO_MS);
    return () => {
      window.clearTimeout(timer);
      pararBrasas();
      if (onGesto) {
        window.removeEventListener('pointerdown', onGesto);
        window.removeEventListener('keydown', onGesto);
      }
      const a = audioRef.current;
      audioRef.current = null;
      if (a) {
        try {
          a.stop();
          a.ctx.close();
        } catch {
          // já encerrado
        }
      }
    };
  }, [modo, reduzido]);

  // Modo vídeo: começa com som; se o navegador barrar, toca e desmuta no
  // primeiro gesto (toque ou tecla). Sem botão de mudo.
  useEffect(() => {
    if (modo !== 'video') return;
    const v = videoRef.current;
    if (!v) return;
    v.muted = false;
    let onGesto: (() => void) | null = null;
    v.play().catch(() => {
      v.muted = true;
      v.play().catch(() => {});
      onGesto = () => {
        v.muted = false;
        v.play().catch(() => {});
      };
      window.addEventListener('pointerdown', onGesto, { once: true });
      window.addEventListener('keydown', onGesto, { once: true });
    });
    return () => {
      if (onGesto) {
        window.removeEventListener('pointerdown', onGesto);
        window.removeEventListener('keydown', onGesto);
      }
    };
  }, [modo]);

  return (
    <div className={`intro-root ${saindo ? 'intro-out' : ''}`} aria-label="Abertura do app">
      {modo === 'canvas' && <canvas ref={canvasRef} className="intro-canvas" aria-hidden />}
      {modo === 'video' && (
        // biome-ignore lint/a11y/useMediaCaption: abertura decorativa, sem diálogo
        <video
          ref={videoRef}
          className="intro-canvas"
          src={VIDEO_SRC}
          playsInline
          autoPlay
          onEnded={finalizar}
          onError={() => setModo('canvas')}
          style={{ objectFit: 'cover' }}
        />
      )}

      {modo === 'canvas' && (
        <div className="intro-stage">
          <div className="intro-line1">Design System</div>
          <div className="intro-line2">
            Ecosystem
            <span className="intro-dot" aria-hidden />
          </div>
          <div className="intro-underline" aria-hidden />
          <div className="intro-tag">extrai · cura · gera</div>
        </div>
      )}

      <div className="intro-controls">
        <button type="button" className="intro-btn" onClick={finalizar}>
          Pular intro
          <SkipForward size={14} />
        </button>
      </div>
    </div>
  );
}
