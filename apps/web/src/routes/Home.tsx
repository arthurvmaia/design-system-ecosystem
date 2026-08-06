import { Mascote } from '@/components/Mascote';
import { api } from '@/lib/api';
import { primaryNav } from '@/lib/nav';
import { ORBIS, TRATAMENTO, saudacaoCompleta } from '@/lib/orbis';
import { useReveal } from '@/lib/use-reveal';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';

/**
 * A primeira tela: o que este laboratório faz, e por onde se começa.
 *
 * Ela existe porque o app abria direto em "Extrair" — uma tela de formulário,
 * pedindo uma URL, sem dizer o que ia acontecer com ela nem por quê. Quem chega
 * pela primeira vez precisa da ideia antes da tarefa.
 *
 * Duas decisões de conteúdo:
 *
 * O fluxo é descrito com o **estado real** do acervo em cada etapa, não com
 * texto genérico. "Biblioteca — 13 peças suas" diz onde você está; "guarde os
 * componentes que gostou" diz só o que o botão faz. Enquanto os números não
 * chegam, cada etapa mostra a própria descrição — a página nunca espera o
 * servidor para ser útil.
 *
 * E as etapas saem de `primaryNav`, a mesma fonte da barra lateral. Duas listas
 * de etapas em lugares diferentes acabariam discordando na primeira mudança.
 */
/**
 * Os três modos de uso do produto.
 *
 * O primeiro é o fluxo que a interface já mostrava. Os outros dois existiam no
 * dado e no motor e não existiam na tela — e o terceiro, o redesign, é o caso
 * mais vendável do produto: trazer um site antigo, trocar a marca, receber um
 * novo. Ninguém descobria isso sozinho porque nada dizia.
 */
/**
 * As três palavras do app, ditas antes de serem usadas.
 *
 * Quem chega de fora encontra "captura", "peça" e "kit" em toda tela e tem de
 * adivinhar o que significam pelo contexto. Adivinhar dá certo na terceira
 * tela, e até lá a pessoa acha que o app é confuso quando o confuso era só o
 * vocabulário. São três linhas, e elas economizam a terceira tela.
 */
const PALAVRAS: readonly { palavra: string; e: string; exemplo: string }[] = [
  {
    palavra: 'captura',
    e: 'um site inteiro que eu trouxe de fora, do jeito que ele aparece no navegador.',
    exemplo: 'você me dá um endereço, eu devolvo uma captura',
  },
  {
    palavra: 'peça',
    e: 'um pedaço reusável de uma captura: uma dobra da página, ou um botão de dentro dela.',
    exemplo: 'de uma captura saem 10 a 30 peças',
  },
  {
    palavra: 'kit',
    e: 'o conjunto de peças que você escolheu. É dele que eu tiro a cara do site novo.',
    exemplo: 'um kit pode misturar peças de capturas diferentes',
  },
];

const MODOS: readonly { titulo: string; explica: string; acao: string; para: string }[] = [
  {
    titulo: 'Montar com peças',
    explica:
      'Traga vários sites, escolha as peças que gostou de cada um e monte um kit só seu. É o caminho completo, e o que faz a biblioteca crescer.',
    acao: 'começar pela captura',
    para: '/extract',
  },
  {
    titulo: 'Partir de um kit pronto',
    explica:
      'Já tem um kit montado? Vá direto para a estrutura e a sua marca. O visual já está decidido, só falta o seu conteúdo.',
    acao: 'ver os kits',
    para: '/design-systems',
  },
  {
    titulo: 'Redesenhar um site antigo',
    explica:
      'Traga o site que você já tem, escolha um kit com a cara nova e gere de novo com a sua marca. O conteúdo é seu, o jeito visual é o do kit.',
    acao: 'trazer o site antigo',
    para: '/extract',
  },
];

export function HomePage() {
  const ds = useQuery({ queryKey: ['design-systems'], queryFn: api.listDesignSystems });
  const lib = useQuery({ queryKey: ['library'], queryFn: api.listLibrary });
  const kits = useQuery({ queryKey: ['kits'], queryFn: api.listKits });
  const meus = useQuery({
    queryKey: ['meus-projetos'],
    queryFn: api.listMeusProjetos,
  });

  useReveal([ds.data, lib.data, kits.data, meus.data]);

  const conta = (n: number | undefined, um: string, varios: string): string | null =>
    n === undefined ? null : n === 0 ? null : `${n} ${n === 1 ? um : varios}`;

  /** O que cada etapa faz, e como ela está agora. */
  const estado: Record<string, string | null> = {
    '/expresso': null,
    '/extract': null,
    '/gallery': conta(ds.data?.items.length, 'captura para triar', 'capturas para triar'),
    '/library': conta(lib.data?.items.length, 'peça guardada', 'peças guardadas'),
    '/design-systems': conta(kits.data?.items.length, 'kit montado', 'kits montados'),
    '/projects': null,
    '/meus-projetos': conta(meus.data?.items.length, 'site pronto', 'sites prontos'),
  };

  const oQueFaz: Record<string, string> = {
    '/expresso':
      'O atalho: me diga o objetivo e eu monto o kit, crio uma marca de teste e gero o site de uma vez. Tudo fica salvo para ajustar depois.',
    '/extract': 'Me dê o endereço. Abro a página num navegador de verdade e capturo o visual dela.',
    '/gallery': 'Mostro peça por peça o que capturei, e o que ficou de fora. A escolha é sua.',
    '/library': 'Guardo aqui as peças escolhidas, com nome e etiqueta.',
    '/design-systems': 'Junte as peças num kit. É dele que eu tiro a base visual do seu site.',
    '/projects':
      'Desenhe a estrutura e traga a sua marca e o seu texto. Do kit eu uso só o visual.',
    '/meus-projetos': 'Deixo o site pronto para ver, baixar em .zip e subir onde quiser.',
  };

  const etapas = primaryNav.filter((n) => n.to !== '/inicio');

  return (
    <div className="mx-auto max-w-[980px] px-4 sm:px-8 py-8 sm:py-14">
      {/* Abertura: o mascote e a ideia, em uma frase que cabe na cabeça. */}
      <div className="ds-slide-up flex items-center gap-3">
        <span className="ds-label" style={{ color: 'var(--color-ion-4)' }}>
          início · 00
        </span>
        <span className="ds-hairline flex-1" aria-hidden />
      </div>

      <div className="mt-8 flex flex-col items-start gap-8 md:flex-row md:items-center">
        <div className="ds-scale-in relative shrink-0">
          <span className="ds-home-halo" aria-hidden />
          <Mascote
            tamanho={132}
            alt={`${ORBIS}, o núcleo do sistema`}
            className="ds-home-nucleo relative"
          />
        </div>

        <div className="min-w-0">
          <h1
            className="ds-slide-up ds-d1 ds-text-glow text-[26px] sm:text-[40px] leading-[1.05] font-medium tracking-tight"
            style={{ color: 'var(--color-fg)', fontFamily: 'var(--font-display)' }}
          >
            {saudacaoCompleta()} Por onde começamos?
          </h1>
          <p
            className="ds-slide-up ds-d2 mt-4 max-w-[60ch] text-[15px] leading-[1.7]"
            style={{ color: 'var(--color-fg-muted)' }}
          >
            Sou o {ORBIS}, e faço uma coisa só: transformo sites que já existem em material para
            você montar o seu. Me dê o endereço de um site de que goste, que eu abro num navegador
            de verdade, capturo como ele é e recorto em peças. Você escolhe as que servem, junta num
            kit, e eu monto um site novo em cima dele com a{' '}
            <strong style={{ color: 'var(--color-fg)' }}>sua</strong> marca e o{' '}
            <strong style={{ color: 'var(--color-fg)' }}>seu</strong> texto.
          </p>
          <p
            className="ds-slide-up ds-d3 mt-3 max-w-[60ch] text-[14px] leading-[1.7]"
            style={{ color: 'var(--color-fg-subtle)' }}
          >
            Do site de origem eu empresto só o jeito visual: o espaçamento, a cor, o movimento, o
            jeito de a coisa se comportar. Nome, texto, logo e identidade eu nunca copio,{' '}
            {TRATAMENTO}. Isso vem de você, e é o que separa inspiração de cópia.
          </p>

          <Link
            to="/extract"
            className="ds-btn ds-glow ds-scale-in ds-d4 mt-7 inline-flex items-center gap-2 rounded-none px-5 py-2.5 text-[13px] font-medium"
            style={{ backgroundColor: 'var(--color-primary)', color: 'var(--color-bone-1)' }}
          >
            Trazer o primeiro site
            <ArrowRight size={13} />
          </Link>
        </div>
      </div>

      {/* ── O vocabulário, antes do fluxo ────────────────────────────────────
          Três palavras aparecem em toda tela do app. Quem não as tem fica
          adivinhando por três telas e conclui que o app é confuso, quando o
          confuso era só o vocabulário. */}
      <div className="mt-16 flex items-center gap-3">
        <span className="ds-label">as três palavras que eu uso</span>
        <span className="ds-hairline flex-1" aria-hidden />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
        {PALAVRAS.map((p, i) => (
          <div
            key={p.palavra}
            className={`ds-reveal ds-d${i + 1} rounded-none border p-4`}
            style={{ borderColor: 'var(--color-border)' }}
          >
            <span
              className="ds-data text-[12px] uppercase tracking-[0.2em]"
              style={{ color: 'var(--color-ion-3)' }}
            >
              {p.palavra}
            </span>
            <p className="mt-2 text-[13px] leading-relaxed" style={{ color: 'var(--color-fg)' }}>
              {p.e}
            </p>
            <p
              className="mt-2 text-[12px] leading-relaxed"
              style={{ color: 'var(--color-fg-subtle)' }}
            >
              {p.exemplo}
            </p>
          </div>
        ))}
      </div>

      {/* O caminho. Numerado, como a barra lateral — a mesma leitura nos dois. */}
      <div className="mt-16 flex items-center gap-3">
        <span className="ds-label">como funciona, do começo ao fim</span>
        <span className="ds-hairline flex-1" aria-hidden />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-3 md:grid-cols-2">
        {etapas.map((etapa, i) => {
          const Icone = etapa.icon;
          const agora = estado[etapa.to] ?? null;
          return (
            <Link
              key={etapa.to}
              to={etapa.to}
              className={`ds-reveal ds-card ds-d${Math.min(i + 1, 6)} group rounded-xl p-4`}
            >
              <div className="ds-card-content flex items-start gap-3.5">
                <span
                  className="ds-data mt-0.5 shrink-0 text-[11px]"
                  style={{ color: 'var(--color-ion-4)' }}
                >
                  {String(i + 1).padStart(2, '0')}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <Icone size={14} style={{ color: 'var(--color-fg-muted)' }} />
                    <span
                      className="text-[15px] font-medium"
                      style={{ color: 'var(--color-fg)', fontFamily: 'var(--font-display)' }}
                    >
                      {etapa.label}
                    </span>
                  </span>
                  <span
                    className="mt-1.5 block text-[13px] leading-relaxed"
                    style={{ color: 'var(--color-fg-muted)' }}
                  >
                    {oQueFaz[etapa.to]}
                  </span>
                  {agora !== null && (
                    <span
                      className="ds-data mt-2 block text-[11px]"
                      style={{ color: 'var(--color-ion-3)' }}
                    >
                      {agora}
                    </span>
                  )}
                </span>
                <ArrowRight
                  size={13}
                  className="mt-1 shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
                  style={{ color: 'var(--color-ion-4)' }}
                />
              </div>
            </Link>
          );
        })}
      </div>

      {/* ── Os três jeitos de usar ────────────────────────────────────────────
          Dois deles não apareciam em lugar nenhum da interface, e o terceiro é
          o mais vendável do produto: pegar um site antigo, trocar a marca e
          receber um novo. Estavam no dado e no motor, não na tela — e o que a
          tela não diz, ninguém descobre. */}
      <div className="mt-16 flex items-center gap-3">
        <span className="ds-label">três jeitos de usar</span>
        <span className="ds-hairline flex-1" aria-hidden />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-3 md:grid-cols-3">
        {MODOS.map((modo, i) => (
          <Link
            key={modo.titulo}
            to={modo.para}
            className={`ds-reveal ds-card ds-d${i + 1} group flex flex-col rounded-none p-4`}
          >
            <span className="ds-card-content flex min-h-0 flex-1 flex-col">
              <span
                className="text-[15px] font-medium"
                style={{ color: 'var(--color-fg)', fontFamily: 'var(--font-display)' }}
              >
                {modo.titulo}
              </span>
              <span
                className="mt-2 block flex-1 text-[13px] leading-relaxed"
                style={{ color: 'var(--color-fg-muted)' }}
              >
                {modo.explica}
              </span>
              <span
                className="ds-data mt-3 flex items-center gap-1.5 text-[11px]"
                style={{ color: 'var(--color-ion-4)' }}
              >
                {modo.acao}
                <ArrowRight
                  size={11}
                  className="transition-transform group-hover:translate-x-0.5"
                />
              </span>
            </span>
          </Link>
        ))}
      </div>

      {/* O argumento do produto, que não estava dito: o acervo é cumulativo. */}
      <p
        className="ds-reveal mt-6 text-[13px] leading-relaxed"
        style={{ color: 'var(--color-fg-subtle)' }}
      >
        Cada site que você traz aumenta a sua biblioteca para sempre. O segundo site custa menos que
        o primeiro, e o décimo custa quase nada: as peças já estão aqui.
      </p>

      {/* A regra que mais confunde quem chega, dita uma vez, no lugar certo. */}
      <div
        className="ds-reveal mt-10 flex items-start gap-3 rounded-lg border px-4 py-3.5 text-[13px] leading-relaxed"
        style={{ borderColor: 'var(--color-border)', color: 'var(--color-fg-muted)' }}
      >
        <Mascote tamanho={30} esmaecido className="mt-0.5" />
        <span>
          <strong style={{ color: 'var(--color-fg)' }}>
            O trabalho pesado não acontece na hora, e isso é de propósito.
          </strong>{' '}
          Capturar um site ou gerar outro custa dinheiro por uso. Então, quando o senhor pede, eu
          anoto o pedido numa fila e paro ali. Ele só roda quando alguém abre o{' '}
          <span className="ds-data" style={{ color: 'var(--color-fg)' }}>
            PROCESSAR
          </span>{' '}
          na máquina onde eu moro e escolhe o que rodar. Ninguém gasta a conta de ninguém por
          engano, e nada dispara sozinho no meio da noite.
        </span>
      </div>

      {/* O que um visitante conclui errado se ninguém disser. Fica no fim porque
          é a última coisa a saber, não a primeira. */}
      <p
        className="ds-reveal mt-4 text-[13px] leading-relaxed"
        style={{ color: 'var(--color-fg-subtle)' }}
      >
        Na prática: navegar, ver as capturas, abrir as peças, montar e editar kits, desenhar a
        estrutura de um site e baixar o que já ficou pronto, tudo isso funciona agora. Pedir uma
        captura nova ou mandar gerar um site entra na fila e espera.
      </p>
    </div>
  );
}
