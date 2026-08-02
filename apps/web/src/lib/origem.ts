import { api } from '@/lib/api';
import { useQuery } from '@tanstack/react-query';

export { SEM_ORIGEM, origensDe, type OrigemPresente } from './origem-core';

/**
 * De qual captura veio esta peça.
 *
 * A informação SEMPRE existiu: `library_components.design_system_id` é coluna
 * desde o primeiro dia. O que não existia era mostrá-la — e sem ela a Biblioteca
 * é um monte de peças sem procedência, onde não dá para decidir "todos os botões
 * vêm daqui". A decisão de origem única por categoria depende de enxergar a
 * origem.
 *
 * O resolvedor vivia copiado em dois arquivos (`Kits.tsx` e `FormulaDoKit.tsx`),
 * com a mesma frase de fallback nos dois. Agora mora aqui: quando a terceira
 * tela precisar, ela não vai inventar uma terceira frase.
 *
 * A query compartilha `['design-systems']` com a barra lateral e as outras
 * telas, então isto não gera requisição nova.
 */
export const useNomeDaOrigem = (): ((id: string | null | undefined) => string) => {
  const sistemas = useQuery({ queryKey: ['design-systems'], queryFn: api.listDesignSystems });
  return (id) => {
    if (id == null || id === '') return 'origem desconhecida';
    return sistemas.data?.items.find((s) => s.id === id)?.name ?? 'origem que não reconheci';
  };
};
