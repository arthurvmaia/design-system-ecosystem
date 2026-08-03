import { type SessaoDoPortao, api } from '@/lib/api';
import { useQuery } from '@tanstack/react-query';

/**
 * O nível desta sessão, para a interface.
 *
 * ATENÇÃO ao que isto NÃO é: não é a tranca. A tranca está no servidor, que
 * recusa qualquer escrita de uma sessão de visita com 403. Isto aqui só evita
 * oferecer o que vai ser negado — botão que existe para dar erro é pior do que
 * botão que não existe.
 *
 * Enquanto a resposta não chega, o padrão é `visita`: prometer menos e cumprir é
 * melhor que oferecer o mundo e recuar meio segundo depois.
 */
export const useNivel = (): 'admin' | 'visita' => {
  const sessao = useQuery<SessaoDoPortao>({
    queryKey: ['orbis-sessao'],
    queryFn: api.sessao,
    retry: false,
    staleTime: 60_000,
  });
  return sessao.data?.nivel === 'admin' ? 'admin' : 'visita';
};
