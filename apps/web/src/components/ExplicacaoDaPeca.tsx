import { type PecaParaExplicar, explicarPeca } from '@/lib/explicar-peca';
import { HelpCircle } from 'lucide-react';
import { useState } from 'react';

/**
 * "O que é isto?", a um clique de distância.
 *
 * A tela diz o nome da peça, a categoria e os selos de medição, e tudo isso é
 * exato para quem já conhece o vocabulário. Quem chegou agora olha "Colagem" e
 * "dobras" sem saber se aquilo é uma faixa inteira de página ou um botão.
 *
 * Fica fechado por padrão, pelo mesmo motivo do laudo: quem já sabe não precisa
 * ler de novo a cada peça, e a tela não pode virar um manual. O botão é
 * discreto e o texto abre no lugar, sem tirar a pessoa de onde ela está.
 */
export function ExplicacaoDaPeca({ peca }: { peca: PecaParaExplicar }) {
  const [aberto, setAberto] = useState(false);
  const frases = explicarPeca(peca);

  return (
    <div className="mt-2">
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        aria-expanded={aberto}
        className="ds-tag flex items-center gap-1.5 rounded-none border px-2 py-1 text-[10px] transition-colors"
        style={{
          borderColor: aberto ? 'rgb(var(--acento) / 0.5)' : 'var(--color-border)',
          color: aberto ? 'rgb(var(--acento))' : 'var(--color-fg-muted)',
        }}
        title="Uma explicação em português do que esta peça é e para que serve"
      >
        <HelpCircle size={11} />
        {aberto ? 'Fechar' : 'O que é isto'}
      </button>

      {aberto && (
        <div
          className="ds-fade-in mt-2 border-l-2 py-1 pl-3"
          style={{ borderColor: 'rgb(var(--acento) / 0.45)' }}
        >
          {frases.map((frase) => (
            <p
              key={frase}
              className="mb-1.5 text-[12.5px] leading-relaxed last:mb-0"
              style={{ color: 'var(--color-fg-muted)' }}
            >
              {frase}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
