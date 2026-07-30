import { ORBIS } from '@/lib/orbis';
import { Mascote } from './Mascote';

/**
 * Marca do produto: o Orbis mais o typemark.
 *
 * O pontinho que existia aqui era um símbolo genérico — servia de âncora visual
 * e não dizia nada. O mascote diz: ele é o núcleo do sistema, e é a mesma coisa
 * que a abertura anuncia na primeira linha (`> núcleo … no ar`). A marca do app
 * passa a ser a cara do app, em vez de um enfeite ao lado do nome.
 *
 * O núcleo respira devagar, sempre — é a única animação permanente da casca, e
 * existe pelo mesmo motivo que um equipamento tem um LED aceso: dizer que está
 * ligado. Sob o cursor, o conjunto inclina.
 */
export function BrandMark() {
  return (
    <div className="ds-marca group flex cursor-default items-center gap-3 select-none">
      {/* O núcleo dentro do seu anel: o anel é do app, o núcleo é o mascote. Os
          dois giram em sentidos opostos e em velocidades diferentes, o que dá
          movimento sem nenhum dos dois sair do lugar. */}
      <span className="ds-marca-nucleo relative grid h-[30px] w-[30px] shrink-0 place-items-center">
        <span className="ds-marca-anel" aria-hidden />
        <Mascote tamanho={22} className="ds-marca-orbe" />
      </span>

      {/* O nome em cima, o que ele faz embaixo.
          Antes eram "Design System" e "Ecosystem", duas metades de um rótulo
          descritivo: diziam a categoria do produto e nenhum nome. Agora o orbe
          tem nome próprio, e é ele que fala com quem usa o app — então é o nome
          que ocupa a linha forte, e a categoria desce para descritor.

          Empilhado, não em linha: em 260px de coluna as duas palavras lado a
          lado quebravam no meio e a segunda linha ficava órfã embaixo. */}
      <span className="flex min-w-0 flex-col leading-none">
        <span
          className="ds-interactive-text text-[15px] font-semibold tracking-[0.22em] uppercase"
          style={{ fontFamily: 'var(--font-display)', color: 'var(--color-fg)' }}
        >
          {ORBIS}
        </span>
        <span
          className="mt-[3px] text-[9px] tracking-[0.3em] uppercase"
          style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-fg-subtle)' }}
        >
          Design System Ecosystem
        </span>
      </span>
    </div>
  );
}
