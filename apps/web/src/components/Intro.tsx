import { api } from '@/lib/api';
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
 * O modo vídeo continua existindo: quem largar um `/intro.mp4` em `public/`
 * (ver `intro.README.md`) tem a própria abertura no lugar desta.
 */

const VIDEO_SRC = '/intro.mp4';
const DURACAO_MS = 5200;
const DURACAO_REDUZIDA_MS = 2000;
/** Intervalo entre as linhas do log. */
const PASSO_S = 0.42;

type Modo = 'descobrindo' | 'canvas' | 'video';
type Linha = { rotulo: string; valor: string | undefined };

export function Intro({ onFinish }: { onFinish: () => void }) {
  const [saindo, setSaindo] = useState(false);
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
      rotulo: 'núcleo',
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

  // Descobre se há um vídeo próprio; senão, a sequência de boot.
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

  // O relógio da abertura. No modo vídeo quem manda é o `onEnded`, mas o timer
  // fica de rede: vídeo que não dispara `ended` deixaria a cortina para sempre.
  // biome-ignore lint/correctness/useExhaustiveDependencies: `finalizar` é idempotente por guarda de ref (`jaFinalizou`), então não precisa reagendar quando a identidade dela muda
  useEffect(() => {
    const t = window.setTimeout(finalizar, duracao + (modo === 'video' ? 20000 : 0));
    return () => window.clearTimeout(t);
  }, [duracao, modo]);

  useEffect(() => {
    if (modo !== 'canvas' || !somLigado || reduzido) return;
    const parar = tocarBoot(duracao);
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
        <video
          ref={videoRef}
          src={VIDEO_SRC}
          autoPlay
          muted={!somLigado}
          playsInline
          onEnded={finalizar}
          className="absolute inset-0 h-full w-full object-cover"
        />
      ) : (
        <>
          <div className="intro-halo" aria-hidden />
          <div className="intro-bg" aria-hidden />
          <div className="intro-scan" aria-hidden />

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
        </>
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
 * A trilha, sintetizada em Web Audio.
 *
 * Sintetizada em vez de arquivo por dois motivos: a abertura não depende de
 * baixar nada, e dá para cortar no meio sem estalo. Devolve a função que corta —
 * quem clica em "pular" não pode continuar ouvindo o fim de um som que já não
 * tem imagem. O ganho desce em rampa antes de parar, porque cortar um oscilador
 * no seco produz um clique audível.
 */
function tocarBoot(duracaoMs: number): () => void {
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

  const agora = ctx.currentTime;
  const fim = agora + duracaoMs / 1000;
  const mestre = ctx.createGain();
  mestre.gain.value = 0.0001;
  mestre.connect(ctx.destination);
  mestre.gain.exponentialRampToValueAtTime(0.16, agora + 1.2);
  mestre.gain.exponentialRampToValueAtTime(0.0001, fim);

  // Drone: duas ondas quase afinadas. O batimento lento entre elas é o que dá a
  // sensação de máquina ligada, em vez de uma nota musical parada.
  const filtro = ctx.createBiquadFilter();
  filtro.type = 'lowpass';
  filtro.frequency.value = 520;
  filtro.connect(mestre);

  for (const hz of [55, 55.6, 110]) {
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.value = hz;
    osc.connect(filtro);
    osc.start(agora);
    osc.stop(fim + 0.1);
  }

  // Um bipe curto por linha do log, subindo de tom: é o que amarra o som ao que
  // está acontecendo na tela, em vez de ser trilha por cima.
  for (let i = 0; i < 4; i++) {
    const t = agora + 0.35 + i * PASSO_S;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = 880 + i * 110;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.06, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
    osc.connect(g);
    g.connect(mestre);
    osc.start(t);
    osc.stop(t + 0.2);
  }

  return () => {
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
