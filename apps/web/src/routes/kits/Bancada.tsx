import { Mascote } from '@/components/Mascote';
import { api, kitPreviewAvisos, previewKitUrl } from '@/lib/api';
import { TRATAMENTO, conta } from '@/lib/orbis';
import { useNomeDaOrigem } from '@/lib/origem';
import { useQuery } from '@tanstack/react-query';
import { ChevronDown, ChevronRight, Monitor, RefreshCw, Smartphone } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';

/**
 * A bancada: as peças escolhidas, montadas juntas, com a marca aplicada.
 *
 * ## O que ela responde que nada respondia
 *
 * O app sabia mostrar cada peça sozinha (Galeria, Confronto) e sabia resumir o
 * que o kit consolidou (a Fórmula). Não sabia mostrar as peças JUNTAS. Uma
 * abertura de um site e uma tabela de preços de outro podem ser lindas
 * separadas e brigar lado a lado — e até aqui isso só aparecia depois de gerar
 * o site inteiro, quando corrigir já custava caro.
 *
 * ## A prévia é a montagem de verdade
 *
 * O iframe aponta para `montarPaginaDoKit`, o mesmo caminho da geração final:
 * escopo por origem, recoloração, retipografia, proxies, a cascata das quatro
 * folhas. Uma prévia "aproximada" mentiria exatamente onde mais dói — no
 * conflito entre origens, que é o que se está tentando enxergar.
 *
 * O que se vê aqui é o que sai.
 *
 * ## Ela prevê o que ainda não foi salvo
 *
 * A seleção viaja na URL. Quem está escolhendo precisa ver o efeito da escolha,
 * não o efeito da escolha anterior — uma prévia que só acompanha depois de
 * salvar transforma cada tentativa em dois cliques e uma dúvida.
 */
export function Bancada({
  kitId,
  kitNome,
  selecionados,
  origemDe,
}: {
  kitId: string;
  kitNome: string;
  /** A seleção AGORA, na ordem, salva ou não. */
  selecionados: readonly string[];
  /** De onde veio cada peça. Serve para avisar quando há mais de uma origem. */
  origemDe: (id: string) => string | null;
}) {
  const nomeDaOrigem = useNomeDaOrigem();
  const projetos = useQuery({ queryKey: ['projects'], queryFn: api.listProjects });
  const [largura, setLargura] = useState<1440 | 390>(1440);
  const [projectId, setProjectId] = useState('');
  const [versao, setVersao] = useState(0);

  // A prévia é remontada a cada pedido, então cada mudança de seleção vira uma
  // montagem. Sem o respiro, reordenar cinco peças dispararia cinco montagens
  // e a última chegaria depois das outras.
  const assinatura = selecionados.join(',');
  const [assinaturaEstavel, setAssinaturaEstavel] = useState(assinatura);
  useEffect(() => {
    const t = window.setTimeout(() => setAssinaturaEstavel(assinatura), 500);
    return () => window.clearTimeout(t);
  }, [assinatura]);

  const src = useMemo(
    () =>
      previewKitUrl(kitId, {
        componentes: assinaturaEstavel === '' ? [] : assinaturaEstavel.split(','),
        projectId: projectId === '' ? undefined : projectId,
        versao,
      }),
    [kitId, assinaturaEstavel, projectId, versao],
  );

  const montando = assinatura !== assinaturaEstavel;

  // A prévia é uma página de 1440 dentro de um painel de uns 550. Sem reduzir,
  // o que se vê é o canto superior esquerdo e duas barras de rolagem — que foi
  // exatamente como saiu na primeira medição. Reduzir mostra a página INTEIRA
  // na largura pedida, que é o ponto: julgar a composição, não ler o texto.
  const [caixa, setCaixa] = useState(0);
  const areaRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = areaRef.current;
    if (el === null) return;
    const ro = new ResizeObserver(([e]) => setCaixa(e?.contentRect.width ?? 0));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const fator = caixa === 0 ? 1 : Math.min(1, caixa / largura);

  // A altura vem do conteúdo montado. É a mesma origem do app (o servidor
  // responde pelo proxy do Vite), então dá para ler direto; se um dia deixar de
  // ser, o `catch` mantém a altura padrão e a prévia rola por dentro.
  const [alturaConteudo, setAlturaConteudo] = useState(900);

  // O que a montagem declarou: peça sem pacote em disco, seção vazia, fundo que
  // não anima, substituição que não casou. O montador sempre escreveu isso e a
  // tela jogava fora; sem os avisos, o senhor julgava o kit sem saber o que
  // ficou de fora. A busca acontece DEPOIS de o iframe carregar, porque é a
  // navegação dele que dispara a montagem que grava os avisos.
  const [ressalvas, setRessalvas] = useState<{ avisos: string[]; faltando: string[] }>({
    avisos: [],
    faltando: [],
  });
  const [ressalvasAbertas, setRessalvasAbertas] = useState(false);
  const quantasRessalvas = ressalvas.avisos.length + ressalvas.faltando.length;
  const medir = (el: HTMLIFrameElement | null) => {
    try {
      const doc = el?.contentDocument;
      if (doc) setAlturaConteudo(Math.max(400, doc.documentElement.scrollHeight));
    } catch {
      /* origem diferente: fica com a altura padrão */
    }
    kitPreviewAvisos(kitId)
      .then(setRessalvas)
      .catch(() => setRessalvas({ avisos: [], faltando: [] }));
  };

  // Quantas origens entram. É a informação que decide se vale olhar com
  // atenção: uma origem só quase nunca briga; duas, às vezes.
  const origens = [
    ...new Set(selecionados.map(origemDe).filter((x): x is string => x != null && x !== '')),
  ];

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div
        className="flex flex-wrap items-center gap-x-3 gap-y-2 px-5 py-3"
        style={{ borderColor: 'var(--color-border)' }}
      >
        <span
          className="text-[10px] uppercase tracking-[0.24em]"
          style={{ color: 'var(--color-fg-subtle)', fontFamily: 'var(--font-display)' }}
        >
          Como vai ficar
        </span>

        {origens.length > 1 && (
          <span
            className="ds-data text-[10px]"
            style={{ color: 'var(--color-fg-muted)' }}
            title="Peças de origens diferentes na mesma página. É aqui que a briga aparece, se houver."
          >
            {conta(origens.length, 'origem misturada', 'origens misturadas')}:{' '}
            {origens.map((o) => nomeDaOrigem(o)).join(' · ')}
          </span>
        )}

        <div className="ml-auto flex items-center gap-1.5">
          {/* Com qual marca. Sem projeto escolhido a prévia usa a marca padrão,
              que é neutra — e aí o que se vê é a cor da origem, não a sua. */}
          <select
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
            title="Prever com a marca de qual projeto"
            className="ds-data rounded-none border bg-transparent px-2 py-1.5 text-[11px] outline-none"
            style={{ borderColor: 'var(--color-border)', color: 'var(--color-fg-muted)' }}
          >
            <option value="">marca padrão</option>
            {(projetos.data?.items ?? []).map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>

          {([1440, 390] as const).map((l) => (
            <button
              key={l}
              type="button"
              onClick={() => setLargura(l)}
              aria-pressed={largura === l}
              title={l === 1440 ? 'No computador' : 'No celular'}
              className="flex items-center gap-1.5 rounded-none border px-2.5 py-1.5 text-[11px]"
              style={{
                borderColor: largura === l ? 'var(--color-primary)' : 'var(--color-border)',
                color: largura === l ? 'var(--color-primary)' : 'var(--color-fg-muted)',
              }}
            >
              {l === 1440 ? <Monitor size={11} /> : <Smartphone size={11} />}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setVersao((v) => v + 1)}
            title="Montar de novo"
            className="rounded-none border px-2.5 py-1.5"
            style={{ borderColor: 'var(--color-border)', color: 'var(--color-fg-muted)' }}
          >
            <RefreshCw size={11} />
          </button>
        </div>
      </div>

      {/*
        As ressalvas ficam RECOLHIDAS, e isso é o conserto de um defeito real.

        Elas moram na mesma coluna da prévia, e a lista não tinha teto: quanto
        melhor a conferência ficou — os vereditos de aceite entraram nela —, mais
        alto o painel, até espremer a prévia contra o `min-h` e sobrar uma tira
        do site. O dono não conseguia ver como o kit ia ficar, que é a única
        coisa que esta tela existe para responder.

        Recolhido, o número já dá o aviso; aberto, a lista rola DENTRO do próprio
        teto. Nenhum dos dois estados tira a prévia da tela, e vale para uma
        ressalva ou para quarenta.
      */}
      {quantasRessalvas > 0 && (
        <div
          className="flex shrink-0 flex-col border-t"
          style={{ borderColor: 'var(--color-border)', backgroundColor: 'rgba(255,180,60,0.04)' }}
        >
          <button
            type="button"
            onClick={() => setRessalvasAbertas((v) => !v)}
            aria-expanded={ressalvasAbertas}
            title="O que a montagem declarou que não conseguiu entregar inteiro"
            className="flex w-full items-center gap-1.5 px-5 py-2 text-left"
            style={{ color: 'var(--color-fg-muted)' }}
          >
            {ressalvasAbertas ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
            <span
              className="text-[10px] uppercase tracking-[0.2em]"
              style={{ fontFamily: 'var(--font-display)' }}
            >
              {conta(quantasRessalvas, 'ressalva', 'ressalvas')}: o que esta montagem não conseguiu
              entregar inteiro
            </span>
          </button>
          {ressalvasAbertas && (
            <ul className="flex max-h-36 list-disc flex-col gap-1 overflow-y-auto pb-2.5 pl-10 pr-5">
              {ressalvas.faltando.map((f) => (
                <li
                  key={`faltando-${f}`}
                  className="text-[11px] leading-relaxed"
                  style={{ color: 'var(--color-fg-muted)' }}
                >
                  {f}
                </li>
              ))}
              {ressalvas.avisos.map((a) => (
                <li
                  key={`aviso-${a}`}
                  className="text-[11px] leading-relaxed"
                  style={{ color: 'var(--color-fg-muted)' }}
                >
                  {a}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div
        ref={areaRef}
        className="relative min-h-[240px] flex-1 overflow-y-auto overflow-x-hidden border-t"
        style={{ borderColor: 'var(--color-border)', backgroundColor: '#0b0b0d' }}
      >
        {selecionados.length === 0 ? (
          <div className="flex h-full items-center justify-center p-8">
            <p
              className="max-w-[38ch] text-center text-[12.5px] leading-relaxed"
              style={{ color: 'var(--color-fg-subtle)' }}
            >
              Escolha as peças, {TRATAMENTO}, e eu monto aqui para o senhor ver como elas ficam
              juntas.
            </p>
          </div>
        ) : (
          <div
            className="mx-auto"
            style={{ width: largura * fator, height: alturaConteudo * fator }}
          >
            {/* A `key` no src força o iframe a recarregar: sem ela, trocar a
                seleção mudaria o atributo e o navegador manteria a página. */}
            <iframe
              key={src}
              src={src}
              title={`Prévia de ${kitNome}`}
              onLoad={(e) => medir(e.currentTarget)}
              // O mesmo isolamento das outras prévias: o HTML vem de site de
              // terceiro e roda sem alcançar a página do app.
              sandbox="allow-scripts allow-same-origin"
              className="border-0"
              style={{
                width: largura,
                height: alturaConteudo,
                transform: `scale(${fator})`,
                transformOrigin: 'top left',
              }}
            />
          </div>
        )}

        {montando && (
          <div className="pointer-events-none absolute top-3 right-3 flex items-center gap-2">
            <Mascote tamanho={13} girando />
            <span className="ds-data text-[10px]" style={{ color: 'var(--color-fg-muted)' }}>
              montando
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
