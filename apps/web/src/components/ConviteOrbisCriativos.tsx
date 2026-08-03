import { Mascote } from '@/components/Mascote';
import { Modal } from '@/components/Modal';
import { TRATAMENTO } from '@/lib/orbis';
import { ArrowRight, Sparkles } from 'lucide-react';
import { useState } from 'react';

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
 * ## Por que abre um aviso em vez de levar a algum lugar
 *
 * A Orbis Criativos ainda não existe. Um botão que leva a uma porta fechada é
 * pior que nenhum botão, então ele diz o que é, diz que ainda está em obra e
 * diz o que fazer enquanto isso. No dia em que a ala abrir, é aqui que ela
 * entra, e nada mais nesta tela precisa mudar.
 */
export function ConviteOrbisCriativos() {
  const [aberto, setAberto] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setAberto(true)}
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
            A gente cria com o senhor: nome, paleta, tipografia e o jeito de falar. Depois é só
            voltar para cá e seguir.
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

      <Modal open={aberto} onClose={() => setAberto(false)} title="Orbis Criativos" size="sm">
        <div className="flex flex-col gap-4 p-6">
          <div className="flex items-start gap-3">
            <Mascote tamanho={30} className="mt-0.5 shrink-0" />
            <div className="min-w-0">
              <p className="text-[14px] leading-relaxed" style={{ color: 'var(--color-fg)' }}>
                Esta ala ainda está em obra, {TRATAMENTO}.
              </p>
              <p
                className="mt-2 text-[13px] leading-relaxed"
                style={{ color: 'var(--color-fg-muted)' }}
              >
                A ideia é o senhor me contar do que trata o negócio e eu devolver nome, paleta,
                tipografia e o jeito de falar, prontos para entrar nesta mesma tela. Quando ficar de
                pé, este botão passa a levar para lá e o senhor não vai precisar aprender nada novo.
              </p>
              <p
                className="mt-2 text-[13px] leading-relaxed"
                style={{ color: 'var(--color-fg-muted)' }}
              >
                Enquanto isso, pode seguir sem medo: o que ficar em branco aqui eu resolvo com o
                kit, e depois o senhor troca no lugar que quiser.
              </p>
            </div>
          </div>
          <div className="flex justify-end">
            <button type="button" className="ds-btn" onClick={() => setAberto(false)}>
              Entendido
            </button>
          </div>
        </div>
      </Modal>
    </>
  );
}
