import { loadFont } from '@/lib/font-loader';
import { fontStack } from '@ds/shared/fonts';
import { useEffect } from 'react';

/**
 * Preview tipográfico: título, parágrafo e botão nas fontes realmente
 * escolhidas. Atualiza sem recarregar a página e carrega as famílias pelo
 * loader central (deduplicado). É a mesma pilha de fallback que o site gerado
 * usa, então o preview corresponde ao resultado.
 */
export function FontPreview({
  heading,
  body,
  texto,
}: {
  heading: string;
  body: string;
  texto?: string;
}) {
  useEffect(() => {
    loadFont(heading);
    loadFont(body);
  }, [heading, body]);

  const h = fontStack(heading);
  const b = fontStack(body);

  return (
    <div
      className="rounded-lg border p-5"
      style={{ borderColor: 'var(--color-border)', backgroundColor: 'rgba(255,255,255,0.02)' }}
    >
      <div
        className="text-[26px] leading-tight"
        style={{ fontFamily: h, color: 'var(--color-fg)', fontWeight: 700 }}
      >
        {texto ?? 'Título principal do site'}
      </div>
      <p
        className="mt-3 text-[14px] leading-relaxed"
        style={{ fontFamily: b, color: 'var(--color-fg-muted)' }}
      >
        Texto de exemplo mostrando como a fonte de corpo será aplicada em parágrafos, descrições e
        textos auxiliares do site.
      </p>
      <button
        type="button"
        className="mt-4 rounded-md px-4 py-2 text-[13px]"
        style={{
          fontFamily: b,
          backgroundColor: 'var(--color-primary)',
          color: 'var(--color-bone-1)',
        }}
      >
        Botão de exemplo
      </button>
    </div>
  );
}
