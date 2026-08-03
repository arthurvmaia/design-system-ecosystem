/**
 * A conversa do portal com o portão.
 *
 * O portal NÃO sabe a senha, e é assim de propósito: ele manda o que a pessoa
 * digitou e recebe um sim ou um não. A credencial vive numa variável de ambiente
 * do servidor Hono, que é o mesmo que já guarda o portão do app de design
 * system — por isso entrar aqui vale lá também, sem uma segunda senha para
 * manter em dia.
 *
 * As chamadas vão por caminho relativo e o Vite as encaminha para a porta 8787.
 * Assim o navegador enxerga tudo na mesma origem: sem CORS, e o cookie da
 * sessão viaja sozinho.
 */

export type EstadoDoPortao = 'ativo' | 'desligado' | 'sem-credencial';
export type NivelDeAcesso = 'admin' | 'visita';

export type Sessao = {
  estado: EstadoDoPortao;
  dentro: boolean;
  nivel: NivelDeAcesso | null;
  temVisita?: boolean;
};

/** O servidor sempre manda uma frase pronta para a pessoa ler; nunca despejamos status cru na tela. */
const pedir = async <T>(url: string, init?: RequestInit): Promise<T> => {
  const resposta = await fetch(url, {
    ...init,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  });
  if (!resposta.ok) {
    let mensagem = 'Não consegui concluir agora. Tente de novo em instantes.';
    try {
      const corpo = (await resposta.json()) as { message?: string };
      if (typeof corpo.message === 'string' && corpo.message.trim() !== '')
        mensagem = corpo.message;
    } catch {
      // corpo ilegível: fica a mensagem genérica
    }
    throw new Error(mensagem);
  }
  return (await resposta.json()) as T;
};

export const api = {
  sessao: () => pedir<Sessao>('/api/orbis/sessao'),
  entrar: (senha: string) =>
    pedir<{ dentro: boolean; nivel: NivelDeAcesso }>('/api/orbis/entrar', {
      method: 'POST',
      body: JSON.stringify({ senha }),
    }),
};
