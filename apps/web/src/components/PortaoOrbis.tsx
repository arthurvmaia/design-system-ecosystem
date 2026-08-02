import { Mascote } from '@/components/Mascote';
import { api } from '@/lib/api';
import { ORBIS, TRATAMENTO, saudacaoCompleta } from '@/lib/orbis';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';

/**
 * O portão: a credencial antes de tudo.
 *
 * Vem ANTES da abertura, e isso é decisão de produto, não de código. A abertura
 * é apresentação — mostrar o app inteiro se apresentando para quem ainda não
 * provou que pode entrar seria dar o passeio antes de pedir o convite.
 *
 * ## O que esta tela sabe e o que ela NÃO sabe
 *
 * Ela não sabe a senha. Manda o que a pessoa digitou para o servidor e recebe
 * de volta um sim ou um não. Quem abrir o JavaScript deste app não encontra
 * credencial nenhuma — ela vive numa variável de ambiente do servidor, e o
 * repositório é público.
 *
 * Ela também não tenta adivinhar se já está dentro: pergunta ao servidor
 * (`/api/orbis/sessao`). Guardar "já entrei" no navegador seria uma tranca cuja
 * chave está do lado de fora.
 */
export function PortaoOrbis({ children }: { children: React.ReactNode }) {
  const qc = useQueryClient();
  const sessao = useQuery({
    queryKey: ['orbis-sessao'],
    queryFn: api.sessao,
    retry: false,
    staleTime: 60_000,
  });

  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const campo = useRef<HTMLInputElement>(null);

  const entrar = useMutation({
    mutationFn: (s: string) => api.entrar(s),
    onSuccess: () => {
      setErro(null);
      setSenha('');
      // Tudo que já falhou com 401 precisa ser buscado de novo: sem isto o app
      // entra e mostra telas vazias, que é pior que não entrar.
      void qc.invalidateQueries();
    },
    onError: (e) => {
      setErro(e instanceof Error ? e.message : 'Essa credencial não é a minha.');
      setSenha('');
      campo.current?.focus();
    },
  });

  useEffect(() => {
    if (sessao.data?.dentro === false) campo.current?.focus();
  }, [sessao.data?.dentro]);

  // Enquanto pergunto ao servidor, não mostro nem o app nem o portão: piscar a
  // tela de senha para quem já entrou é ruído, e piscar o app para quem não
  // entrou é vazamento.
  if (sessao.isPending) return <TelaDeEspera />;

  // Servidor fora do ar é outra conversa: dizer "credencial inválida" aqui
  // mandaria a pessoa digitar de novo uma senha que está certa.
  if (sessao.isError) return <ServidorMudo />;

  if (sessao.data?.dentro === true) return <>{children}</>;

  const semCredencial = sessao.data?.estado === 'sem-credencial';

  return (
    <div className="portao">
      <div className="portao-brilho" aria-hidden />
      <div className="portao-caixa">
        <div className="portao-orbe">
          <Mascote tamanho={72} girando={entrar.isPending} alt={`${ORBIS}, o núcleo do sistema`} />
        </div>

        <div className="portao-marca">{ORBIS}</div>

        <p className="portao-fala">
          {semCredencial ? (
            <>
              Fui publicado sem credencial, {TRATAMENTO}, então não deixo ninguém entrar. Quem me
              colocou no ar precisa definir <span className="ds-data">ORBIS_SENHA</span> no
              servidor.
            </>
          ) : (
            <>
              {saudacaoCompleta()} Guardo capturas que não são minhas e uma conta que alguém paga.
              Antes de abrir, preciso da credencial.
            </>
          )}
        </p>

        {!semCredencial && (
          <form
            className="portao-form"
            onSubmit={(e) => {
              e.preventDefault();
              if (senha.trim() === '' || entrar.isPending) return;
              entrar.mutate(senha);
            }}
          >
            <input
              ref={campo}
              type="password"
              value={senha}
              onChange={(e) => {
                setSenha(e.target.value);
                if (erro !== null) setErro(null);
              }}
              placeholder="credencial"
              autoComplete="current-password"
              aria-label="Credencial de administrador"
              aria-invalid={erro !== null}
              className="portao-campo"
              disabled={entrar.isPending}
            />
            <button
              type="submit"
              className="portao-btn"
              disabled={entrar.isPending || senha.trim() === ''}
            >
              {entrar.isPending ? 'Conferindo' : 'Entrar'}
            </button>
          </form>
        )}

        {erro !== null && (
          <p className="portao-erro" role="alert">
            {erro}
          </p>
        )}

        {/* O aviso de beta fica no portão porque é aqui que a expectativa se
            forma. Dizer depois, com a pessoa já achando um defeito, é tarde. */}
        <div className="portao-beta">
          <span className="portao-beta-selo">beta</span>
          <span>
            Ainda estou em ajuste, {TRATAMENTO}. Tem coisa pela metade e tem coisa que vai mudar de
            lugar. Se algo parecer errado aqui, provavelmente está.
          </span>
        </div>
      </div>
    </div>
  );
}

/** Enquanto pergunto ao servidor se esta sessão vale. */
function TelaDeEspera() {
  return (
    <div className="portao">
      <div className="portao-caixa portao-caixa-quieta">
        <Mascote tamanho={56} girando />
        <p className="portao-fala">Conferindo se o senhor já esteve aqui.</p>
      </div>
    </div>
  );
}

/** O servidor não respondeu. Não é senha errada, e a tela não pode confundir. */
function ServidorMudo() {
  return (
    <div className="portao">
      <div className="portao-caixa portao-caixa-quieta">
        <Mascote tamanho={56} esmaecido />
        <p className="portao-fala">
          Não consigo falar com o servidor, {TRATAMENTO}. Não é a sua credencial: sou eu que estou
          sem resposta do outro lado.
        </p>
        <button type="button" className="portao-btn" onClick={() => window.location.reload()}>
          Tentar de novo
        </button>
      </div>
    </div>
  );
}
