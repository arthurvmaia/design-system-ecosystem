import { PreviewFrame } from '@/components/PreviewFrame';
import { type LibraryComponentRecord, previewComponentUrl } from '@/lib/api';
import { cn } from '@/lib/cn';
import { origensDe, useNomeDaOrigem } from '@/lib/origem';
import { TRATAMENTO, conta } from '@/lib/orbis';
import { FAMILIA_DA_CATEGORIA, rotuloDaCategoria } from '@ds/shared/schemas';
import { Compass } from 'lucide-react';

/**
 * O Confronto: as peças de uma categoria, agrupadas por ORIGEM, lado a lado.
 *
 * ## Por que existe
 *
 * A Biblioteca em grade responde "o que eu guardei". Ela não responde a pergunta
 * que decide um kit: **de qual site vêm os meus botões**. Numa grade misturada,
 * comparar um botão do site A com um do site B é comparar dois cards que por
 * acaso caíram um do lado do outro.
 *
 * ## Por que por CONJUNTO, e não peça a peça
 *
 * A pergunta não é "qual botão é mais bonito". É "qual site tem o conjunto de
 * botões que eu quero" — porque a regra do kit é que todos os botões venham de
 * um lugar só. Comparar peça a peça responderia a pergunta errada e levaria à
 * bagunça que a regra existe para impedir: o primário de um site, o secundário
 * de outro, e nenhum dos dois combinando com o terceiro.
 *
 * Então cada origem é um bloco com TODAS as peças dela naquela categoria. O que
 * se compara é o vocabulário inteiro de cada site.
 *
 * ## Quando não há o que confrontar
 *
 * Com uma origem só, o Confronto não tem função e diz isso — não desenha uma
 * coluna solitária fingindo que houve escolha.
 */
export function Confronto({
  itens,
  categoria,
  onEscolherCategoria,
  onAbrir,
}: {
  /** Todas as peças da Biblioteca, sem filtro de categoria. */
  itens: readonly LibraryComponentRecord[];
  /** `all` = ainda não escolheu; aí a tela oferece onde há decisão a tomar. */
  categoria: string;
  onEscolherCategoria: (c: string) => void;
  onAbrir: (c: LibraryComponentRecord) => void;
}) {
  const nomeDaOrigem = useNomeDaOrigem();

  if (categoria === 'all') {
    return (
      <OndeHaDecisao itens={itens} onEscolher={onEscolherCategoria} nomeDaOrigem={nomeDaOrigem} />
    );
  }

  const daCategoria = itens.filter((i) => i.category === categoria);
  const origens = origensDe(daCategoria);

  if (daCategoria.length === 0) {
    return (
      <Aviso>
        Não guardei nenhuma peça de {rotuloDaCategoria(categoria).toLowerCase()} ainda, {TRATAMENTO}.
      </Aviso>
    );
  }

  if (origens.length === 1) {
    return (
      <Aviso>
        Todas as {conta(daCategoria.length, 'peça', 'peças')} de{' '}
        {rotuloDaCategoria(categoria).toLowerCase()} vêm de{' '}
        <strong style={{ color: 'var(--color-fg)' }}>{nomeDaOrigem(origens[0]?.id)}</strong>. Não há
        o que confrontar: quando houver uma segunda origem, elas aparecem aqui lado a lado.
      </Aviso>
    );
  }

  const ehPeca = FAMILIA_DA_CATEGORIA[categoria as never] === 'pecas';

  return (
    <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-8">
      {ehPeca && (
        <p
          className="mb-5 max-w-[70ch] text-[13px] leading-relaxed"
          style={{ color: 'var(--color-fg-muted)' }}
        >
          {rotuloDaCategoria(categoria)} é peça, e peça vem de uma origem só no kit. O que se compara
          aqui é o CONJUNTO de cada site, não uma peça contra a outra.
        </p>
      )}

      <div className="flex flex-col gap-6">
        {origens.map((o) => {
          const daOrigem = daCategoria.filter((i) => (i.designSystemId ?? 'sem-origem') === o.id);
          return (
            <section
              key={o.id}
              className="rounded-none border"
              style={{ borderColor: 'var(--color-border)' }}
            >
              <header
                className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b px-4 py-3"
                style={{ borderColor: 'var(--color-border)' }}
              >
                <Compass size={12} style={{ color: 'var(--color-ion-4)' }} />
                <span
                  className="text-[14px] font-medium"
                  style={{ color: 'var(--color-fg)', fontFamily: 'var(--font-display)' }}
                >
                  {nomeDaOrigem(o.id === 'sem-origem' ? null : o.id)}
                </span>
                <span className="ds-data text-[11px]" style={{ color: 'var(--color-fg-subtle)' }}>
                  {conta(o.quantas, 'peça', 'peças')}
                </span>
              </header>

              {/* Todas as peças da origem no MESMO tamanho: comparar conjuntos
                  exige que o tamanho não seja uma variável a mais. */}
              <div className="grid grid-cols-2 gap-3 p-3 md:grid-cols-3 xl:grid-cols-4">
                {daOrigem.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => onAbrir(c)}
                    className={cn(
                      'ds-card group block rounded-lg text-left transition-transform',
                      'hover:scale-[1.02]',
                    )}
                    aria-label={`Abrir ${c.name}`}
                  >
                    <span className="ds-card-content block overflow-hidden rounded-lg">
                      <PreviewFrame
                        src={previewComponentUrl(c.id)}
                        title={c.name}
                        aspect={16 / 10}
                      />
                      <span
                        className="block truncate border-t px-2.5 py-2 text-[12px]"
                        style={{
                          borderColor: 'rgba(255,255,255,0.06)',
                          color: 'var(--color-fg)',
                        }}
                      >
                        {c.name}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Sem categoria escolhida, a tela não pede uma: ela mostra ONDE há decisão a
 * tomar — as categorias que já têm mais de uma origem. Uma lista das 25
 * categorias mandaria a pessoa adivinhar; esta lista é o trabalho pendente.
 */
function OndeHaDecisao({
  itens,
  onEscolher,
  nomeDaOrigem,
}: {
  itens: readonly LibraryComponentRecord[];
  onEscolher: (c: string) => void;
  nomeDaOrigem: (id: string | null | undefined) => string;
}) {
  const porCategoria = new Map<string, LibraryComponentRecord[]>();
  for (const i of itens) {
    const atual = porCategoria.get(i.category);
    if (atual) atual.push(i);
    else porCategoria.set(i.category, [i]);
  }

  const disputadas = [...porCategoria.entries()]
    .map(([categoria, lista]) => ({ categoria, origens: origensDe(lista), total: lista.length }))
    .filter((c) => c.origens.length > 1)
    .sort((a, b) => b.origens.length - a.origens.length || b.total - a.total);

  if (disputadas.length === 0) {
    return (
      <Aviso>
        Cada categoria da sua Biblioteca vem de uma origem só, {TRATAMENTO}. Não há nada em disputa —
        quando o senhor trouxer um segundo site com botões, cards ou navegação, as escolhas aparecem
        aqui.
      </Aviso>
    );
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-8">
      <p
        className="mb-5 max-w-[70ch] text-[13px] leading-relaxed"
        style={{ color: 'var(--color-fg-muted)' }}
      >
        Estas categorias têm peças de mais de um site. São as que pedem uma decisão sua antes de
        virar kit.
      </p>
      <div className="flex flex-col gap-2">
        {disputadas.map((d) => (
          <button
            key={d.categoria}
            type="button"
            onClick={() => onEscolher(d.categoria)}
            className="flex flex-wrap items-baseline gap-x-3 gap-y-1 rounded-none border px-4 py-3 text-left transition-colors hover:bg-white/[0.04]"
            style={{ borderColor: 'var(--color-border)' }}
          >
            <span className="text-[14px] font-medium" style={{ color: 'var(--color-fg)' }}>
              {rotuloDaCategoria(d.categoria)}
            </span>
            <span className="ds-data text-[11px]" style={{ color: 'var(--color-ion-3)' }}>
              {conta(d.origens.length, 'origem', 'origens')}
            </span>
            <span
              className="ds-data min-w-0 flex-1 truncate text-[11px]"
              style={{ color: 'var(--color-fg-subtle)' }}
            >
              {d.origens.map((o) => nomeDaOrigem(o.id === 'sem-origem' ? null : o.id)).join(' · ')}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

function Aviso({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto p-8">
      <p
        className="max-w-[62ch] text-[13px] leading-relaxed"
        style={{ color: 'var(--color-fg-muted)' }}
      >
        {children}
      </p>
    </div>
  );
}
