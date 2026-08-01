import { Mascote } from '@/components/Mascote';
import { Modal } from '@/components/Modal';
import { PreviewFrame } from '@/components/PreviewFrame';
import { type KitDesignSystem, type KitRecord, api, previewComponentUrl } from '@/lib/api';
import { conta } from '@/lib/orbis';
import { rotuloDaCategoria } from '@ds/shared/schemas';
import { useQuery } from '@tanstack/react-query';

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

export function FormulaDoKit({ kit, onClose }: { kit: KitRecord; onClose: () => void }) {
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
    <Modal open onClose={onClose} size="xl" title={`A fórmula de ${kit.name}`}>
      <div className="p-6 md:p-8">
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
                      className="mt-2 text-[28px] leading-tight"
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

        {/* ── Cores ──────────────────────────────────────────────────────── */}
        {clusters.length > 0 && (
          <section className="mt-9">
            <Titulo>Cores e superfícies</Titulo>
            {comPapel.length > 0 && (
              <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
                {comPapel.map((c) => (
                  <Amostra
                    key={`${c.origem}-${c.corCanonica}`}
                    hex={c.corCanonica}
                    papel={c.papel}
                  />
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
                <div
                  className="border-t px-3 py-2.5"
                  style={{ borderColor: 'var(--color-border)' }}
                >
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
    </Modal>
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
