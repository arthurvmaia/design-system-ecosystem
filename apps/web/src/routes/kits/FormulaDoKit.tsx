import { Mascote } from '@/components/Mascote';
import { Modal } from '@/components/Modal';
import { PreviewFrame } from '@/components/PreviewFrame';
import {
  type KitComponentRef,
  type KitDesignSystem,
  type KitRecord,
  api,
  previewComponentUrl,
  previewSegmentHoverUrl,
  previewSegmentReplayUrl,
} from '@/lib/api';
import { conta } from '@/lib/orbis';
import { rotuloDaCategoria } from '@ds/shared/schemas';
import { useQuery } from '@tanstack/react-query';
import { ExternalLink } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { type QuadroDeEstado, pecaDeAbertura, tiraDeEstados } from './estados-da-peca';
import { rotaDaFormula } from './rota-da-formula';

/**
 * A FÓRMULA: o kit inteiro numa página, do jeito que ele vai reger a síntese.
 *
 * A queixa era "não sei como o site gerado vai ficar", e a resposta que faltava
 * não é uma prévia do site — é ver a MATÉRIA antes da mistura. Quem olhou a
 * tipografia, as cores com o papel de cada uma e as peças rodando de verdade já
 * sabe o que vai sair, porque é disso que o site é feito.
 *
 * O material já existia todo: o design system consolidado (cores por papel,
 * fontes, tema) vinha num acordeão de 230px dentro do editor de kit, fechado, e
 * as peças só apareciam como linha de lista. Aqui é a mesma informação com o
 * espaço que ela precisa para ser lida.
 *
 * Segue o molde do material do professor — tipografia como espécime, cores e
 * superfícies, componentes com o render real — porque é a forma canônica de
 * apresentar um design system, e ela existe há tempo demais para ser reinventada
 * aqui.
 */
/**
 * As famílias que são fim de pilha de fallback, não escolha de tipografia.
 *
 * Elas entram no inventário porque estão mesmo escritas no CSS — o inventário
 * está certo. Errado seria a tela apresentá-las como decisão de design ao lado
 * da fonte que a pessoa de fato veio ver.
 */
const FONTES_DE_SISTEMA = [
  'apple color emoji',
  'segoe ui emoji',
  'segoe ui symbol',
  'noto color emoji',
  'sfmono-regular',
  'ui-sans-serif',
  'ui-serif',
  'ui-monospace',
  'system-ui',
  '-apple-system',
  'blinkmacsystemfont',
  'sans-serif',
  'serif',
  'monospace',
  'inherit',
  'initial',
];

const ehFonteDeSistema = (familia: string): boolean => {
  const f = familia
    .trim()
    .toLowerCase()
    .replace(/^["']|["']$/g, '');
  return FONTES_DE_SISTEMA.includes(f);
};

/**
 * A fórmula como ATALHO: o mesmo conteúdo da página, aberto por cima do kit.
 *
 * O modal continua existindo porque ele é o gesto certo para quem já está na
 * lista de kits e só quer conferir. O que ele não podia continuar sendo é o
 * ÚNICO caminho: sem URL não dá para mandar a fórmula para alguém, não dá para
 * voltar nela, e ela não podia aparecer no wizard, que é onde a pergunta "como
 * vai ficar" de fato é feita. Daí o link para a página, no topo.
 */
export function FormulaDoKit({ kit, onClose }: { kit: KitRecord; onClose: () => void }) {
  return (
    <Modal open onClose={onClose} size="xl" title={`A fórmula de ${kit.name}`}>
      <div className="p-6 md:p-8">
        <div className="mb-4 flex justify-end">
          <Link
            to={rotaDaFormula(kit.id)}
            onClick={onClose}
            className="ds-tag flex items-center gap-1.5 rounded-none border px-3 py-1.5 text-[11px]"
            style={{ borderColor: 'var(--color-border)', color: 'var(--color-fg-muted)' }}
          >
            <ExternalLink size={11} />
            Abrir como página
          </Link>
        </div>
        <CorpoDaFormula kit={kit} />
      </div>
    </Modal>
  );
}

/**
 * O conteúdo da fórmula, sem moldura: serve o modal e a página sem ser escrito
 * duas vezes. Quem chama decide o respiro em volta.
 */
export function CorpoDaFormula({ kit }: { kit: KitRecord }) {
  const ds = useQuery({
    queryKey: ['kit-design-system', kit.id],
    queryFn: () => api.getKitDesignSystem(kit.id),
  });
  const sistemas = useQuery({ queryKey: ['design-systems'], queryFn: api.listDesignSystems });
  const item = ds.data?.item ?? null;

  const nomeDaOrigem = (id: string): string =>
    sistemas.data?.items.find((s) => s.id === id)?.name ?? 'origem que não reconheci';

  // As fontes de todas as origens, sem repetir e sem os fallbacks do sistema:
  // `Apple Color Emoji` e `SFMono-Regular` aparecem em quase toda folha porque
  // são o fim da pilha de fallback, e não descrevem a tipografia de ninguém.
  // Mostrá-las aqui é dar peso de decisão a algo que ninguém decidiu.
  const fontes = [
    ...new Set((item?.origens ?? []).flatMap((o) => o.fontes.map((f) => f.familia))),
  ].filter((f) => !ehFonteDeSistema(f));
  // As cores COM papel primeiro: são as que dialogam com a marca. Depois as
  // outras, que descrevem o resto da superfície.
  const clusters = (item?.origens ?? []).flatMap((o) =>
    o.clusters.map((c) => ({ ...c, origem: o.designSystemId })),
  );
  const comPapel = clusters.filter((c) => c.papel !== null);
  const semPapel = clusters.filter((c) => c.papel === null);

  return (
    <div>
      <div className="ds-label">a fórmula</div>
      <h2
        className="ds-text-glow mt-1 text-[26px] font-medium"
        style={{ color: 'var(--color-fg)', fontFamily: 'var(--font-display)' }}
      >
        {kit.name}
      </h2>
      <p
        className="mt-2 max-w-[70ch] text-[13px] leading-relaxed"
        style={{ color: 'var(--color-fg-muted)' }}
      >
        É isto que vai reger o seu site: estas fontes, estas cores e estas peças. O seu texto e a
        sua marca entram por cima; daqui sai só o jeito visual.
      </p>

      {ds.isPending && (
        <div
          className="mt-8 flex items-center gap-2 text-[13px]"
          style={{ color: 'var(--color-fg-muted)' }}
        >
          <Mascote tamanho={13} girando />
          Consolidando as cores e as fontes das peças.
        </div>
      )}

      {/* ── Tipografia ─────────────────────────────────────────────────── */}
      {fontes.length > 0 && (
        <section className="mt-9">
          <Titulo>Tipografia</Titulo>
          <div className="mt-3 space-y-3">
            {fontes.map((familia) => (
              <div
                key={familia}
                className="border p-4"
                style={{ borderColor: 'var(--color-border)' }}
              >
                <div className="ds-data text-[11px]" style={{ color: 'var(--color-ion-3)' }}>
                  {familia}
                </div>
                {/* O espécime: o mesmo texto em três tamanhos diz mais sobre
                      uma fonte do que qualquer descrição dela. */}
                <div style={{ fontFamily: familia }}>
                  <div
                    className="mt-2 text-[21px] sm:text-[28px] leading-tight"
                    style={{ color: 'var(--color-fg)' }}
                  >
                    Um título como sairia aqui
                  </div>
                  <div className="mt-1 text-[15px]" style={{ color: 'var(--color-fg-muted)' }}>
                    E o texto corrido logo abaixo, no tamanho de leitura.
                  </div>
                  <div className="mt-1 text-[12px]" style={{ color: 'var(--color-fg-subtle)' }}>
                    Os detalhes miúdos, que é onde a fonte costuma quebrar.
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── A escala ───────────────────────────────────────────────────── */}
      {(item?.origens ?? []).length > 0 && (
        <section className="mt-9">
          <Titulo>A escala</Titulo>
          <p
            className="mt-1 max-w-[70ch] text-[12.5px] leading-relaxed"
            style={{ color: 'var(--color-fg-muted)' }}
          >
            Os degraus de tamanho, respiro e canto que cada origem usa. Medidos no navegador, na
            captura: é o tamanho que a página de fato pintou, não o que a folha declarou.
          </p>
          <div className="mt-3 space-y-3">
            {(item?.origens ?? []).map((o) => (
              <div
                key={o.designSystemId}
                className="border p-4"
                style={{ borderColor: 'var(--color-border)' }}
              >
                <div className="ds-data text-[11px]" style={{ color: 'var(--color-ion-3)' }}>
                  {nomeDaOrigem(o.designSystemId)}
                </div>

                {o.escala === undefined || o.escala.degraus.length === 0 ? (
                  // A ausência tem de aparecer como ausência. Uma rampa vazia
                  // desenhada como se fosse rampa diria que o site não tem
                  // escala, e o que houve foi que ninguém mediu.
                  <p className="mt-2 text-[12.5px]" style={{ color: 'var(--color-fg-subtle)' }}>
                    Esta origem foi capturada antes de eu medir escala. Extraia o site de novo e eu
                    meço.
                  </p>
                ) : (
                  <>
                    <div className="mt-3 flex flex-wrap items-baseline gap-x-4 gap-y-2">
                      {o.escala.degraus.map((d) => (
                        <span
                          key={d}
                          title={`${d}px${
                            d === o.escala?.corpo
                              ? ', o tamanho em que está a maior parte do texto'
                              : d === o.escala?.display
                                ? ', o degrau de destaque'
                                : ''
                          }`}
                          style={{
                            // O degrau mostrado NO tamanho dele, com teto: uma
                            // escala vista em números não é uma escala vista.
                            fontSize: Math.min(d, 44),
                            lineHeight: 1,
                            color:
                              d === o.escala?.corpo || d === o.escala?.display
                                ? 'var(--color-fg)'
                                : 'var(--color-fg-subtle)',
                          }}
                        >
                          Aa
                        </span>
                      ))}
                    </div>
                    <div
                      className="ds-data mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[10px]"
                      style={{ color: 'var(--color-fg-subtle)' }}
                    >
                      <span>
                        texto {o.escala.corpo === null ? 'não medido' : `${o.escala.corpo}px`}
                      </span>
                      <span>
                        destaque{' '}
                        {o.escala.display === null ? 'sem degrau próprio' : `${o.escala.display}px`}
                      </span>
                      {o.escala.espacos.length > 0 && (
                        <span>respiros {o.escala.espacos.join(' · ')}</span>
                      )}
                      {o.escala.raios.length > 0 && (
                        <span>cantos {o.escala.raios.join(' · ')}</span>
                      )}
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── Cores ──────────────────────────────────────────────────────── */}
      {clusters.length > 0 && (
        <section className="mt-9">
          <Titulo>Cores e superfícies</Titulo>
          {comPapel.length > 0 && (
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
              {comPapel.map((c) => (
                <Amostra key={`${c.origem}-${c.corCanonica}`} hex={c.corCanonica} papel={c.papel} />
              ))}
            </div>
          )}
          {semPapel.length > 0 && (
            <>
              <p className="mt-4 text-[12px]" style={{ color: 'var(--color-fg-subtle)' }}>
                As demais, que compõem a superfície e não recebem papel da marca:
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {semPapel.slice(0, 24).map((c) => (
                  <span
                    key={`${c.origem}-${c.corCanonica}`}
                    title={c.corCanonica}
                    className="h-6 w-6 shrink-0 border"
                    style={{ backgroundColor: c.corCanonica, borderColor: 'var(--color-border)' }}
                  />
                ))}
              </div>
            </>
          )}
        </section>
      )}

      {/* ── Peças ──────────────────────────────────────────────────────── */}
      <section className="mt-9">
        <Titulo>{conta(kit.components.length, 'peça neste kit', 'peças neste kit')}</Titulo>
        <div className="mt-3 grid grid-cols-1 gap-4 md:grid-cols-2">
          {kit.components.map((cmp) => (
            <div key={cmp.id} className="border" style={{ borderColor: 'var(--color-border)' }}>
              {/* O render REAL, não uma maquete: é o mesmo arquivo que vai
                    para o site. Ver a peça rodando é o que responde "como vai
                    ficar" sem precisar gerar nada. */}
              <PreviewFrame src={previewComponentUrl(cmp.id)} title={cmp.name} ajuste="conter" />
              <div className="border-t px-3 py-2.5" style={{ borderColor: 'var(--color-border)' }}>
                <div className="truncate text-[13px]" style={{ color: 'var(--color-fg)' }}>
                  {cmp.name}
                </div>
                <div className="ds-data text-[10px]" style={{ color: 'var(--color-fg-subtle)' }}>
                  {rotuloDaCategoria(cmp.category)}
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Os estados ─────────────────────────────────────────────────── */}
      {kit.components.length > 0 && <TiraDosEstados pecas={kit.components} />}

      {/* ── O que este kit não consegue ────────────────────────────────── */}
      {item !== null && item.limitacoes.length > 0 && (
        <section className="mt-9">
          <Titulo>O que eu não consegui consolidar</Titulo>
          <ul className="mt-3 space-y-1.5">
            {item.limitacoes.map((l) => (
              <li
                key={l}
                className="text-[12px] leading-relaxed"
                style={{ color: 'var(--color-fg-muted)' }}
              >
                {l}
              </li>
            ))}
          </ul>
        </section>
      )}

      {item !== null && item.origens.length > 0 && (
        <p className="mt-8 text-[11px]" style={{ color: 'var(--color-fg-subtle)' }}>
          As peças vieram de {item.origens.map((o) => nomeDaOrigem(o.designSystemId)).join(', ')}.
          Do que veio de lá eu uso só o jeito visual.
        </p>
      )}
    </div>
  );
}

function Titulo({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3">
      <span className="ds-label">{children}</span>
      <span className="ds-hairline flex-1" aria-hidden />
    </div>
  );
}

/**
 * Os estados de uma peça, ao mesmo tempo na tela.
 *
 * A escolha de mostrar UMA peça por vez não é economia de espaço: dois estados
 * de peças diferentes lado a lado não se comparam, e é a comparação que carrega
 * toda a informação aqui. A peça que abre é uma peça de interface, porque é nela
 * que estado quer dizer alguma coisa.
 */
function TiraDosEstados({ pecas }: { pecas: KitComponentRef[] }) {
  const [escolhida, setEscolhida] = useState<string | null>(null);
  const peca = pecas.find((p) => p.id === escolhida) ?? pecaDeAbertura(pecas);
  if (peca === null) return null;

  return (
    <section className="mt-9">
      <Titulo>Os estados</Titulo>
      <p
        className="mt-1 max-w-[70ch] text-[12.5px] leading-relaxed"
        style={{ color: 'var(--color-fg-muted)' }}
      >
        O que a peça faz quando alguém encosta nela. Cada quadro é um estado que eu medi na captura,
        reproduzido do mesmo jeito que na Galeria. O que muda aqui é que eles ficam juntos, que é a
        única disposição em que a diferença entre dois estados se enxerga.
      </p>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {pecas.map((p) => {
          const ativa = p.id === peca.id;
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => setEscolhida(p.id)}
              aria-pressed={ativa}
              className="ds-tag max-w-[240px] truncate rounded-none border px-2.5 py-1.5 text-[11px]"
              style={{
                borderColor: ativa ? 'var(--color-primary)' : 'var(--color-border)',
                color: ativa ? 'var(--color-primary)' : 'var(--color-fg-muted)',
              }}
            >
              {p.name}
            </button>
          );
        })}
      </div>

      {/* A `key` derruba os iframes ao trocar de peça: reaproveitá-los deixaria o
          estado fixado da peça anterior por um quadro, e um quadro errado aqui é
          pior do que um quadro em branco. */}
      <EstadosDaPeca key={peca.id} peca={peca} />
    </section>
  );
}

/**
 * A medição de UMA peça: de qual bloco ela saiu e o que aquele bloco tem gravado.
 *
 * O caminho é o mesmo da Galeria de propósito. O que a Biblioteca guarda é o
 * vínculo (`segmentId`); o que sabe dos estados é o segmento. Sem um dos dois a
 * tela não chuta: ela diz qual dos dois faltou.
 */
function EstadosDaPeca({ peca }: { peca: KitComponentRef }) {
  const cmp = useQuery({
    queryKey: ['library-component', peca.id],
    queryFn: () => api.getLibraryComponent(peca.id),
  });
  const dsId = peca.designSystemId;
  const segs = useQuery({
    // A MESMA chave da Galeria: quem vem de lá não paga a listagem de novo.
    queryKey: ['segments', dsId],
    queryFn: () => api.listSegments(dsId ?? ''),
    enabled: dsId !== null,
  });

  const aviso = (texto: string) => (
    <p className="mt-3 text-[12.5px] leading-relaxed" style={{ color: 'var(--color-fg-subtle)' }}>
      {texto}
    </p>
  );

  if (cmp.isPending || (dsId !== null && segs.isPending)) {
    return (
      <div
        className="mt-4 flex items-center gap-2 text-[13px]"
        style={{ color: 'var(--color-fg-muted)' }}
      >
        <Mascote tamanho={13} girando />
        Procurando o que eu gravei dos estados desta peça.
      </div>
    );
  }
  // Erro de leitura NÃO é ausência de medida. Dizer "sem estado medido" aqui
  // seria afirmar sobre a captura uma coisa que ninguém chegou a conferir.
  if (cmp.isError) {
    return aviso('Não consegui ler o registro desta peça agora, então não afirmo nada sobre ela.');
  }
  if (dsId !== null && segs.isError) {
    return aviso(
      'Não consegui ler a captura de origem agora. Os estados podem existir; só não deu para conferir nesta tentativa.',
    );
  }

  const segmentId = cmp.data?.item.segmentId ?? null;
  const segmento = segs.data?.items.find((s) => s.id === segmentId);
  const tira = tiraDeEstados(
    segmentId === null
      ? { tipo: 'sem-vinculo' }
      : segmento === undefined
        ? { tipo: 'origem-ausente' }
        : { tipo: 'medida', fidelity: segmento.fidelity },
  );

  return (
    <>
      <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
        {tira.quadros.map((q) => (
          <QuadroDaPeca
            key={q.chave}
            quadro={q}
            nome={peca.name}
            cmpId={peca.id}
            segmentId={segmentId}
          />
        ))}
      </div>
      {tira.declaracao !== null && aviso(tira.declaracao)}
    </>
  );
}

/** A largura da captura. Reduzir aqui reflui o layout e mostra outra peça. */
const LARGURA_VIRTUAL = 1440;

/**
 * Um quadro da tira: a peça reduzida para caber, já FIXADA no estado.
 *
 * Não é o `PreviewFrame` porque aqui o pai precisa entrar no documento depois de
 * ele carregar: o estado gravado só se fixa clicando o botão que a barra de
 * replay desenha, e não há parâmetro de URL para pedir um estado só. É o mesmo
 * gesto que o validador do servidor já usa para conferir cada estado
 * (`validate-preview.ts`, `frame.click('[data-estado=...]')`), e o `PreviewFrame`
 * não expõe o iframe — nem deveria, porque em nenhuma outra tela isso é preciso.
 *
 * Quando não dá para entrar (documento de outra origem, botão que não existe
 * mais, bloco que virou cápsula de runtime), o quadro DIZ que não conseguiu
 * fixar. Mostrar o estado inicial sob a legenda do estado pedido seria a
 * invenção mais fácil de acreditar desta tela inteira.
 */
function QuadroDaPeca({
  quadro,
  nome,
  cmpId,
  segmentId,
}: {
  quadro: QuadroDeEstado;
  nome: string;
  cmpId: string;
  segmentId: string | null;
}) {
  const moldura = useRef<HTMLDivElement>(null);
  const iframe = useRef<HTMLIFrameElement>(null);
  const [caixa, setCaixa] = useState({ w: 0, h: 0 });
  const [alturaDoDoc, setAlturaDoDoc] = useState<number | null>(null);
  const [fundoDoDoc, setFundoDoDoc] = useState<string | null>(null);
  const [naoFixou, setNaoFixou] = useState(false);

  useEffect(() => {
    const el = moldura.current;
    if (el === null) return;
    const ro = new ResizeObserver((entradas) => {
      const r = entradas[0]?.contentRect;
      const w = r?.width ?? el.clientWidth;
      const h = r?.height ?? el.clientHeight;
      if (w > 0) setCaixa({ w, h });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // A altura real chega do próprio documento da prévia. A checagem é a janela
  // que enviou ser a DESTE iframe: nenhum outro documento consegue forjar isso.
  useEffect(() => {
    const aoReceber = (e: MessageEvent) => {
      if (iframe.current === null || e.source !== iframe.current.contentWindow) return;
      const d = e.data as { tipo?: unknown; altura?: unknown; fundo?: unknown } | null;
      if (d?.tipo !== 'ds-preview-altura' || typeof d.altura !== 'number') return;
      if (Number.isFinite(d.altura)) setAlturaDoDoc(d.altura);
      if (typeof d.fundo === 'string' && d.fundo !== '') setFundoDoDoc(d.fundo);
    };
    window.addEventListener('message', aoReceber);
    return () => window.removeEventListener('message', aoReceber);
  }, []);

  const src =
    quadro.fonte === 'repouso'
      ? previewComponentUrl(cmpId)
      : quadro.fonte === 'hover'
        ? previewSegmentHoverUrl(segmentId ?? '')
        : previewSegmentReplayUrl(segmentId ?? '');

  const fixarEstado = () => {
    if (quadro.estadoId === null) return;
    let doc: Document | null = null;
    try {
      doc = iframe.current?.contentDocument ?? null;
    } catch {
      doc = null;
    }
    const botao =
      doc?.querySelector<HTMLButtonElement>(
        `.ds-rp-btn[data-estado="${CSS.escape(quadro.estadoId)}"]`,
      ) ?? null;
    if (doc === null || botao === null) {
      setNaoFixou(true);
      return;
    }
    botao.click();
    // A barra de replay é do modo "um de cada vez"; aqui o quadro JÁ é o estado,
    // e ela comeria metade da miniatura repetindo o que a legenda diz.
    const barra = doc.getElementById('ds-rp-bar');
    if (barra !== null) barra.style.display = 'none';
    const alvo = doc.getElementById('ds-rp-alvo');
    if (alvo !== null) alvo.style.paddingTop = '0';
    setNaoFixou(false);
  };

  const alturaVirtual = alturaDoDoc ?? Math.round(LARGURA_VIRTUAL / (16 / 10));
  const escala =
    caixa.w > 0 && caixa.h > 0 ? Math.min(caixa.w / LARGURA_VIRTUAL, caixa.h / alturaVirtual) : 0;
  const sobraX = Math.max(0, (caixa.w - LARGURA_VIRTUAL * escala) / 2);
  const sobraY = Math.max(0, (caixa.h - alturaVirtual * escala) / 2);

  return (
    <figure className="border" style={{ borderColor: 'var(--color-border)' }}>
      <div
        ref={moldura}
        className="relative h-[240px] overflow-hidden"
        style={{ backgroundColor: fundoDoDoc ?? 'var(--color-ink-0)' }}
      >
        {escala > 0 && (
          <iframe
            ref={iframe}
            title={`${nome}: ${quadro.rotulo}`}
            src={src}
            onLoad={fixarEstado}
            // Mesmo isolamento da prévia: quem protege é a CSP da resposta do
            // servidor, e `allow-same-origin` é o que faz o cookie do portão
            // acompanhar o CSS e o JS do documento.
            sandbox="allow-scripts allow-same-origin"
            className="absolute top-0 left-0 origin-top-left border-0"
            style={{
              width: LARGURA_VIRTUAL,
              height: alturaVirtual,
              transform: `translate(${sobraX}px, ${sobraY}px) scale(${escala})`,
              // Só a demonstração de hover aceita ponteiro: ela tem um botão de
              // tocar/parar que serve para quem pediu movimento reduzido. Nos
              // outros, um clique perdido navegaria o quadro para fora do estado.
              pointerEvents: quadro.fonte === 'hover' ? 'auto' : 'none',
            }}
          />
        )}
      </div>
      <figcaption className="border-t px-3 py-2" style={{ borderColor: 'var(--color-border)' }}>
        <div className="truncate text-[13px]" style={{ color: 'var(--color-fg)' }}>
          {quadro.rotulo}
        </div>
        <div className="ds-data text-[10px]" style={{ color: 'var(--color-fg-subtle)' }}>
          {quadro.gatilho === '' ? quadro.nota : `${quadro.gatilho} · ${quadro.nota}`}
        </div>
        {naoFixou && (
          <div className="mt-1 text-[11px] leading-relaxed" style={{ color: 'var(--color-ion-3)' }}>
            Não consegui fixar este estado aqui. Ele está na medição; para vê-lo, abra a peça na
            Galeria.
          </div>
        )}
      </figcaption>
    </figure>
  );
}

/** Uma cor com o papel que ela ocupa: é o papel que diz o que vai acontecer. */
function Amostra({
  hex,
  papel,
}: { hex: string; papel: KitDesignSystem['origens'][number]['clusters'][number]['papel'] }) {
  return (
    <div className="border" style={{ borderColor: 'var(--color-border)' }}>
      <div className="h-14 w-full" style={{ backgroundColor: hex }} />
      <div className="px-2.5 py-2">
        <div className="text-[12px]" style={{ color: 'var(--color-fg)' }}>
          {papel}
        </div>
        <div className="ds-data text-[10px]" style={{ color: 'var(--color-fg-subtle)' }}>
          {hex}
        </div>
      </div>
    </div>
  );
}
