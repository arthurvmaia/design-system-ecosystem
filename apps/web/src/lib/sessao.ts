import { type SessaoDoPortao, api } from '@/lib/api';
import { useQuery } from '@tanstack/react-query';

/**
 * A sessão, buscada UMA vez e compartilhada.
 *
 * Os dois ganchos abaixo leem a mesma resposta: mesma `queryKey`, mesma
 * `staleTime`, uma requisição só. Duas queries separadas dariam duas idas ao
 * servidor para responder duas perguntas do mesmo objeto.
 */
const useSessao = () =>
  useQuery<SessaoDoPortao>({
    queryKey: ['orbis-sessao'],
    queryFn: api.sessao,
    retry: false,
    staleTime: 60_000,
  });

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
  const sessao = useSessao();
  return sessao.data?.nivel === 'admin' ? 'admin' : 'visita';
};

/**
 * Este servidor exige a credencial DA AÇÃO em cada gasto?
 *
 * Mesma advertência do `useNivel`: isto não é a tranca. O servidor recusa com
 * 428 de qualquer jeito. Isto só evita pedir uma credencial que ele não vai
 * conferir — o que obrigava quem usa a máquina local a digitar qualquer coisa
 * para o botão habilitar.
 *
 * Enquanto a resposta não chega, `true`: pedir a mais e não precisar é melhor
 * que deixar passar sem perguntar.
 */
export const useExigeCredencialDeAcao = (): boolean => {
  const sessao = useSessao();
  return sessao.data?.exigeAcao !== false;
};
