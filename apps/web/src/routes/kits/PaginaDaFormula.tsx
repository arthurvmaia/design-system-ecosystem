import { Mascote } from '@/components/Mascote';
import { api } from '@/lib/api';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { CorpoDaFormula } from './FormulaDoKit';

/**
 * A fórmula como PÁGINA, com endereço próprio.
 *
 * Ela nasceu modal atrás de um ícone que só aparecia no hover do card: sem URL,
 * não dava para mandar para alguém, não dava para voltar nela, e ela não podia
 * ser mostrada em nenhuma outra tela — inclusive no wizard de Gerar site, que é
 * exatamente onde a pergunta "como vai ficar" é feita. Um destino com endereço
 * resolve os três de uma vez.
 *
 * O conteúdo é o mesmo objeto (`CorpoDaFormula`), não uma cópia: a fórmula que a
 * pessoa manda por link tem de ser, letra por letra, a que ela viu no modal.
 */
export function PaginaDaFormulaDoKit() {
  const { kitId } = useParams<{ kitId: string }>();
  const kit = useQuery({
    // A mesma chave do wizard: quem chega vindo de lá não recarrega o kit.
    queryKey: ['kit', kitId],
    queryFn: () => api.getKit(kitId ?? ''),
    enabled: kitId !== undefined && kitId !== '',
  });

  return (
    <div className="mx-auto max-w-[1100px] px-4 py-10 sm:px-8">
      <Link
        to="/design-systems"
        className="ds-data inline-flex items-center gap-1.5 text-[11px] uppercase tracking-[0.14em]"
        style={{ color: 'var(--color-fg-muted)' }}
      >
        <ArrowLeft size={12} />
        Kits
      </Link>

      <div className="mt-6">
        {kit.isPending && (
          <div
            className="flex items-center gap-2 text-[13px]"
            style={{ color: 'var(--color-fg-muted)' }}
          >
            <Mascote tamanho={13} girando />
            Abrindo a fórmula.
          </div>
        )}

        {/* Endereço que não resolve é dito por extenso, e não redirecionado em
            silêncio: quem chegou por um link colado precisa saber que o link é
            que está velho, não a tela. */}
        {kit.isError && (
          <div>
            <h1
              className="text-[22px] font-medium"
              style={{ color: 'var(--color-fg)', fontFamily: 'var(--font-display)' }}
            >
              Não achei este kit
            </h1>
            <p
              className="mt-2 max-w-[60ch] text-[13px] leading-relaxed"
              style={{ color: 'var(--color-fg-muted)' }}
            >
              O endereço aponta para um kit que não está mais no acervo, ou o nome dele mudou de id.
              A lista de kits continua inteira.
            </p>
          </div>
        )}

        {kit.data !== undefined && <CorpoDaFormula kit={kit.data.item} />}
      </div>
    </div>
  );
}
