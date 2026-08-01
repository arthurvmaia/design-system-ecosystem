import { Mascote } from '@/components/Mascote';
import { api } from '@/lib/api';
import { primaryNav } from '@/lib/nav';
import { ORBIS, saudacaoCompleta } from '@/lib/orbis';
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
    '/extract': null,
    '/gallery': conta(ds.data?.items.length, 'extração para triar', 'extrações para triar'),
    '/library': conta(lib.data?.items.length, 'peça guardada', 'peças guardadas'),
    '/design-systems': conta(kits.data?.items.length, 'kit montado', 'kits montados'),
    '/projects': null,
    '/meus-projetos': conta(meus.data?.items.length, 'site pronto', 'sites prontos'),
  };

  const oQueFaz: Record<string, string> = {
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
    <div className="mx-auto max-w-[980px] px-8 py-14">
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
            className="ds-slide-up ds-d1 ds-text-glow text-[40px] leading-[1.05] font-medium tracking-tight"
            style={{ color: 'var(--color-fg)', fontFamily: 'var(--font-display)' }}
          >
            {saudacaoCompleta()} Por onde começamos?
          </h1>
          <p
            className="ds-slide-up ds-d2 mt-4 max-w-[60ch] text-[15px] leading-[1.7]"
            style={{ color: 'var(--color-fg-muted)' }}
          >
            Sou o {ORBIS}. Traga os sites de que gosta, que eu capturo o visual deles, guardo as
            peças que passarem na sua triagem e monto o site em cima do kit, com a{' '}
            <strong style={{ color: 'var(--color-fg)' }}>sua</strong> marca e o{' '}
            <strong style={{ color: 'var(--color-fg)' }}>seu</strong> texto.
          </p>
          <p
            className="ds-slide-up ds-d3 mt-3 max-w-[60ch] text-[14px] leading-[1.7]"
            style={{ color: 'var(--color-fg-subtle)' }}
          >
            Do site de origem eu tiro só o jeito visual. Nome, texto e identidade eu nunca copio.
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

      {/* O caminho. Numerado, como a barra lateral — a mesma leitura nos dois. */}
      <div className="mt-16 flex items-center gap-3">
        <span className="ds-label">como funciona</span>
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

      {/* A regra que mais confunde quem chega, dita uma vez, no lugar certo. */}
      <div
        className="ds-reveal mt-10 flex items-start gap-3 rounded-lg border px-4 py-3.5 text-[13px] leading-relaxed"
        style={{ borderColor: 'var(--color-border)', color: 'var(--color-fg-muted)' }}
      >
        <Mascote tamanho={30} esmaecido className="mt-0.5" />
        <span>
          Trabalho pesado, extrair um site ou gerar outro, eu não faço sozinho: o pedido fica na
          fila até alguém abrir o{' '}
          <span className="ds-data" style={{ color: 'var(--color-fg)' }}>
            PROCESSAR
          </span>{' '}
          na pasta do aplicativo e escolher o que rodar. A conta continua no seu controle.
        </span>
      </div>
    </div>
  );
}
