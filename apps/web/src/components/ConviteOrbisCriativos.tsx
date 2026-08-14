import { ArrowRight, Sparkles } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

/**
 * O convite para quem chega sem marca pronta.
 *
 * A etapa da marca pede nome, paleta, tipografia e voz, e supõe que a pessoa já
 * tenha tudo isso decidido. Uma boa parte não tem: ela veio montar um site
 * justamente porque a marca ainda está por nascer, e a bancada de instrumentos,
 * vista desse lugar, parece um formulário que cobra o que ela não tem.
 *
 * Este convite existe para essa pessoa. Ele não bloqueia nem interrompe quem já
 * sabe o que quer, fica no alto da lista e some do caminho com um clique.
 *
 * ## A ala abriu — e a porta cumpriu a promessa
 *
 * Este convite abria um aviso ("a ala ainda está em obra") com a promessa
 * escrita de que, no dia em que a ala abrisse, era aqui que ela entraria sem
 * que nada mais na tela mudasse. O dia chegou: /criativos existe, com os
 * quatro passos da espec, e o dono apontou a porta fechada com a tela pronta
 * atrás. O aviso saiu; o clique navega.
 */
export function ConviteOrbisCriativos() {
  const navigate = useNavigate();

  return (
    <button
      type="button"
      onClick={() => navigate('/criativos')}
      className="ds-glass-static group mb-5 flex w-full items-center gap-4 rounded-none border p-4 text-left transition-colors md:p-5"
      style={{
        borderColor: 'rgb(var(--acento) / 0.35)',
        background: 'rgb(var(--acento) / 0.06)',
      }}
    >
      <span
        className="grid h-11 w-11 shrink-0 place-items-center rounded-none"
        style={{ background: 'rgb(var(--acento) / 0.14)', color: 'rgb(var(--acento))' }}
        aria-hidden="true"
      >
        <Sparkles size={20} strokeWidth={1.6} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="ds-label block" style={{ color: 'rgb(var(--acento))' }}>
          Orbis Criativos
        </span>
        <strong
          className="mt-1 block text-[15px] leading-snug"
          style={{ color: 'var(--color-fg)' }}
        >
          Ainda não tem uma marca criada?
        </strong>
        <span className="mt-1 block text-[13px]" style={{ color: 'var(--color-fg-muted)' }}>
          A gente cria com o senhor: nome, paleta, tipografia e o jeito de falar. Depois é só voltar
          para cá e seguir.
        </span>
      </span>
      <span
        className="ds-label hidden shrink-0 items-center gap-1.5 sm:flex"
        style={{ color: 'rgb(var(--acento))' }}
      >
        Quero criar
        <ArrowRight size={14} className="transition-transform group-hover:translate-x-0.5" />
      </span>
    </button>
  );
}
