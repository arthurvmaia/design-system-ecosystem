import { loadFont } from '@/lib/font-loader';
import { type FontCategory, type FontDef, GOOGLE_FONTS, familyName } from '@ds/shared/fonts';
import { Check, Search } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';

/**
 * Seletor visual de Google Fonts.
 *
 * O usuário CLICA na fonte (não digita o nome). Cada opção mostra o próprio nome
 * renderizado na fonte real — carregada só quando o card entra na viewport, e
 * deduplicada pelo `font-loader`, para não baixar dezenas de arquivos de uma vez
 * nem repetir `<link>`. Busca com debounce e filtro por categoria; as
 * recomendadas aparecem primeiro antes de qualquer busca.
 *
 * Acessível: opções são `<button>` reais com `aria-pressed`, operáveis por
 * teclado; o estado é anunciado por texto, não só por cor.
 */

const CATEGORIAS: Array<{ id: 'all' | FontCategory; label: string }> = [
  { id: 'all', label: 'Todas' },
  { id: 'sans-serif', label: 'Sans' },
  { id: 'serif', label: 'Serif' },
  { id: 'display', label: 'Display' },
  { id: 'handwriting', label: 'Manuscrita' },
  { id: 'monospace', label: 'Mono' },
];

const CAT_LABEL: Record<FontCategory, string> = {
  'sans-serif': 'Sans serif',
  serif: 'Serif',
  display: 'Display',
  handwriting: 'Manuscrita',
  monospace: 'Monospace',
};

export function GoogleFontsPicker({
  value,
  onChange,
  ariaLabel,
}: {
  value: string;
  onChange: (family: string) => void;
  ariaLabel?: string;
}) {
  const [busca, setBusca] = useState('');
  const [buscaDeb, setBuscaDeb] = useState('');
  const [categoria, setCategoria] = useState<'all' | FontCategory>('all');
  const selecionada = familyName(value);

  // Debounce da busca — não filtra a cada tecla.
  useEffect(() => {
    const t = window.setTimeout(() => setBuscaDeb(busca.trim().toLowerCase()), 180);
    return () => window.clearTimeout(t);
  }, [busca]);

  const lista = useMemo(() => {
    let fs = GOOGLE_FONTS;
    if (categoria !== 'all') fs = fs.filter((f) => f.category === categoria);
    if (buscaDeb) return fs.filter((f) => f.family.toLowerCase().includes(buscaDeb));
    // Sem busca: recomendadas primeiro.
    return [...fs].sort((a, b) => (b.recommended ? 1 : 0) - (a.recommended ? 1 : 0));
  }, [categoria, buscaDeb]);

  return (
    <div>
      <div className="relative">
        <Search
          size={13}
          className="-translate-y-1/2 pointer-events-none absolute top-1/2 left-3"
          style={{ color: 'var(--color-fg-subtle)' }}
        />
        <input
          type="text"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="buscar fonte..."
          aria-label="Buscar fonte pelo nome"
          className="w-full rounded-md border py-2 pr-3 pl-8 text-[13px] outline-none transition-colors focus:border-[var(--color-signal)]"
          style={{
            borderColor: 'var(--color-border-strong)',
            backgroundColor: 'rgba(0,0,0,0.35)',
            color: 'var(--color-fg)',
          }}
        />
      </div>

      <div className="mt-2 flex flex-wrap gap-1.5">
        {CATEGORIAS.map((c) => (
          <button
            type="button"
            key={c.id}
            onClick={() => setCategoria(c.id)}
            aria-pressed={categoria === c.id}
            className="ds-tag rounded-none border px-2.5 py-1 text-[11px]"
            style={{
              borderColor: categoria === c.id ? 'var(--color-signal)' : 'var(--color-border)',
              color: categoria === c.id ? 'var(--color-fg)' : 'var(--color-fg-muted)',
            }}
          >
            {c.label}
          </button>
        ))}
      </div>

      <div
        className="mt-3 max-h-[280px] space-y-1 overflow-y-auto pr-1"
        aria-label={ariaLabel ?? 'Lista de fontes'}
      >
        {lista.map((f) => (
          <FontOption
            key={f.family}
            font={f}
            selected={f.family === selecionada}
            onSelect={() => {
              loadFont(f.family);
              onChange(f.family);
            }}
          />
        ))}
        {lista.length === 0 && (
          <div className="py-8 text-center text-[12px]" style={{ color: 'var(--color-fg-subtle)' }}>
            Nenhuma fonte encontrada para “{busca}”.
          </div>
        )}
      </div>
    </div>
  );
}

function FontOption({
  font,
  selected,
  onSelect,
}: {
  font: FontDef;
  selected: boolean;
  onSelect: () => void;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  const [carregada, setCarregada] = useState(false);

  // Carrega a fonte só quando o card entra na viewport.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          loadFont(font.family, [400]);
          setCarregada(true);
          io.disconnect();
        }
      },
      { rootMargin: '120px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [font.family]);

  return (
    <button
      ref={ref}
      type="button"
      onClick={onSelect}
      onMouseEnter={() => loadFont(font.family, [400])}
      aria-pressed={selected}
      className="flex w-full items-center justify-between gap-3 rounded-md border px-3 py-2.5 text-left transition-colors"
      style={{
        borderColor: selected ? 'var(--color-signal)' : 'var(--color-border)',
        backgroundColor: selected ? 'rgba(6,182,212,0.14)' : 'rgba(255,255,255,0.02)',
      }}
    >
      <span className="min-w-0 flex-1">
        <span
          className="block truncate text-[17px] leading-tight"
          style={{
            color: 'var(--color-fg)',
            // Só aplica a família depois de carregada, para não piscar em fallback.
            fontFamily: carregada ? `"${font.family}", sans-serif` : undefined,
          }}
        >
          {font.family}
        </span>
        <span className="ds-data text-[10px]" style={{ color: 'var(--color-fg-subtle)' }}>
          {CAT_LABEL[font.category]}
        </span>
      </span>
      {selected && (
        <Check size={15} className="shrink-0" style={{ color: 'var(--color-signal)' }} />
      )}
    </button>
  );
}
