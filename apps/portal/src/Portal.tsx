import { useCallback, useEffect, useRef, useState } from 'react';
import { Mascote } from './Mascote';
import { type Sessao, api } from './api';

/**
 * O vestíbulo da suíte Orbis: a credencial e três portas.
 *
 * ## Por que o portal existe
 *
 * Os três produtos são independentes — código, interface e dados separados —
 * mas a pessoa é uma só, e clicar em INICIAR devia levar a UM lugar, não a três
 * endereços que ela precisa decorar. O portal é esse lugar, e nada além disso:
 * ele não sabe o que os apps fazem, não importa código deles e não guarda dado
 * nenhum.
 *
 * ## A senha
 *
 * É a mesma do servidor Orbis, e continua morando só lá. O portal desenha o
 * campo e pergunta; quem confere é o servidor. Como o cookie de sessão vale
 * para `localhost` inteiro (cookie ignora porta), entrar aqui já vale para o app
 * de design system: a pessoa digita uma vez.
 *
 * Vale o contrário também, e é bom saber: o app de design system encerra a
 * sessão quando a aba dele sai de vista. Voltar de lá para cá pede a credencial
 * de novo — decisão de segurança que foi mantida de propósito.
 */

type Destino = { porta: number; caminho?: string };

type Porta = {
  id: string;
  marca: string;
  titulo: string;
  fala: string;
  detalhes: string[];
  destino: Destino | null;
};

const PORTAS: Porta[] = [
  {
    id: 'design-system',
    marca: 'ORBIS',
    titulo: 'Criação de Design System',
    fala: 'Capturo um site inteiro, separo em peças reaproveitáveis e monto o seu design system.',
    detalhes: ['Captura e curadoria', 'Kits de peças', 'Geração de site com a sua marca'],
    destino: { porta: 5173 },
  },
  {
    id: 'lojas-shopify',
    marca: 'ORBIS',
    titulo: 'Criação de Lojas Shopify',
    fala: 'Instalo o tema Shopify de verdade, edito com paridade ao editor da Shopify e devolvo um ZIP instalável.',
    detalhes: ['Importação do tema', 'Editor com prévia ao vivo', 'Site do cliente em um arquivo'],
    destino: { porta: 3000 },
  },
  {
    id: 'criativos',
    marca: 'ORBIS',
    titulo: 'Criativos',
    fala: 'Geração de criativos para anúncio e redes, a partir da mesma marca que já vive aqui.',
    detalhes: ['Ainda em construção'],
    destino: null,
  },
];

/**
 * O endereço sai do host de onde o portal foi aberto, e não de `localhost` fixo.
 *
 * É o que faz a suíte funcionar quando o senhor abre pelo celular apontando para
 * o IP da máquina: com `localhost` no card, o telefone tentaria falar consigo
 * mesmo e não acharia nada.
 */
const enderecoDe = (destino: Destino): string =>
  `${window.location.protocol}//${window.location.hostname}:${destino.porta}${destino.caminho ?? ''}`;

export function Portal() {
  const [sessao, setSessao] = useState<Sessao | null>(null);
  const [falhaDeServidor, setFalhaDeServidor] = useState(false);
  const [emConstrucao, setEmConstrucao] = useState<Porta | null>(null);

  const conferir = useCallback(async () => {
    try {
      setSessao(await api.sessao());
      setFalhaDeServidor(false);
    } catch {
      // Servidor mudo é outra conversa: dizer "credencial inválida" aqui
      // mandaria a pessoa digitar de novo uma senha que está certa.
      setFalhaDeServidor(true);
    }
  }, []);

  useEffect(() => {
    void conferir();
  }, [conferir]);

  if (falhaDeServidor) return <ServidorMudo aoTentar={() => void conferir()} />;
  if (sessao === null) return <Espera />;
  if (!sessao.dentro) return <Portao sessao={sessao} aoEntrar={() => void conferir()} />;

  return (
    <main className="portal">
      <div className="portal-brilho" aria-hidden="true" />
      <div className="portal-conteudo">
        <header className="portal-cabecalho">
          <Mascote tamanho={72} alt="Orbis, o núcleo do sistema" />
          <h1 className="portal-marca">ORBIS</h1>
          <p className="portal-fala">
            Às ordens, senhor. Três frentes abertas — diga por onde começamos hoje.
          </p>
          {sessao.nivel === 'visita' && (
            <p className="portal-nota">
              Esta credencial abre para ver. Deixo o senhor navegar tudo; mudanças no acervo eu
              recuso.
            </p>
          )}
        </header>

        <div className="portal-portas">
          {PORTAS.map((porta) => (
            <Cartao key={porta.id} porta={porta} aoPedirEmBreve={() => setEmConstrucao(porta)} />
          ))}
        </div>

        <p className="portal-rodape">
          Os três são independentes: cada um com o seu banco, a sua interface e o seu ritmo. Aqui é
          só a porta.
        </p>
      </div>

      {emConstrucao !== null && (
        <EmConstrucao porta={emConstrucao} aoFechar={() => setEmConstrucao(null)} />
      )}
    </main>
  );
}

function Cartao({ porta, aoPedirEmBreve }: { porta: Porta; aoPedirEmBreve: () => void }) {
  const indisponivel = porta.destino === null;
  return (
    <button
      type="button"
      className={indisponivel ? 'porta porta-em-breve' : 'porta'}
      onClick={() => {
        if (porta.destino === null) {
          aoPedirEmBreve();
          return;
        }
        // Mesma aba: o Voltar do navegador traz a pessoa de volta para cá.
        window.location.href = enderecoDe(porta.destino);
      }}
    >
      <span className="porta-marca">{porta.marca}</span>
      <strong className="porta-titulo">{porta.titulo}</strong>
      <span className="porta-fala">{porta.fala}</span>
      <ul className="porta-detalhes">
        {porta.detalhes.map((detalhe) => (
          <li key={detalhe}>{detalhe}</li>
        ))}
      </ul>
      <span className="porta-acao">{indisponivel ? 'Em construção' : 'Entrar →'}</span>
    </button>
  );
}

function Portao({ sessao, aoEntrar }: { sessao: Sessao; aoEntrar: () => void }) {
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [conferindo, setConferindo] = useState(false);
  const campo = useRef<HTMLInputElement>(null);

  useEffect(() => {
    campo.current?.focus();
  }, []);

  const semCredencial = sessao.estado === 'sem-credencial';

  return (
    <main className="portal portal-portao">
      <div className="portal-brilho" aria-hidden="true" />
      <div className="portao-caixa">
        <Mascote tamanho={72} girando={conferindo} alt="Orbis, o núcleo do sistema" />
        <h1 className="portal-marca">ORBIS</h1>
        <p className="portal-fala">
          {semCredencial ? (
            <>
              Fui publicado sem credencial, senhor, então não deixo ninguém entrar. Quem me colocou
              no ar precisa definir <code>ORBIS_SENHA</code> no servidor.
            </>
          ) : (
            'Antes de abrir as portas, preciso da credencial.'
          )}
        </p>

        {!semCredencial && (
          <form
            className="portao-form"
            onSubmit={(evento) => {
              evento.preventDefault();
              if (senha.trim() === '' || conferindo) return;
              setConferindo(true);
              setErro(null);
              api
                .entrar(senha)
                .then(() => {
                  setSenha('');
                  aoEntrar();
                })
                .catch((causa: unknown) => {
                  setErro(
                    causa instanceof Error ? causa.message : 'Essa credencial não é a minha.',
                  );
                  setSenha('');
                  campo.current?.focus();
                })
                .finally(() => setConferindo(false));
            }}
          >
            <input
              ref={campo}
              type="password"
              className="portao-campo"
              value={senha}
              onChange={(evento) => {
                setSenha(evento.target.value);
                if (erro !== null) setErro(null);
              }}
              placeholder="credencial"
              autoComplete="current-password"
              aria-label="Credencial do Orbis"
              aria-invalid={erro !== null}
              disabled={conferindo}
            />
            <button
              type="submit"
              className="portao-btn"
              disabled={conferindo || senha.trim() === ''}
            >
              {conferindo ? 'Conferindo' : 'Entrar'}
            </button>
          </form>
        )}

        {erro !== null && (
          <p className="portao-erro" role="alert">
            {erro}
          </p>
        )}

        {sessao.temVisita === true && !semCredencial && (
          <p className="portal-nota">
            Há duas credenciais. Uma abre tudo; a outra abre para ver, e recusa mudanças no acervo.
          </p>
        )}
      </div>
    </main>
  );
}

/**
 * A porta que ainda não abre.
 *
 * É um `<dialog>` de verdade, e não uma div fingindo de modal: o elemento nativo
 * já traz armadilha de foco, fechamento no Esc e inércia do resto da página —
 * três coisas que uma div só simula, e mal.
 */
function EmConstrucao({ porta, aoFechar }: { porta: Porta; aoFechar: () => void }) {
  const dialogo = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const elemento = dialogo.current;
    if (elemento !== null && !elemento.open) elemento.showModal();
  }, []);

  return (
    <dialog
      ref={dialogo}
      className="modal"
      aria-labelledby="modal-titulo"
      onClose={aoFechar}
      // Clique no fundo: no `<dialog>` nativo o ::backdrop conta como o próprio
      // elemento, então o alvo ser o dialog significa "clicou fora da caixa".
      onMouseDown={(evento) => {
        if (evento.target === dialogo.current) aoFechar();
      }}
    >
      <div className="modal-caixa">
        <Mascote tamanho={56} girando alt="" />
        <span className="porta-marca">{porta.marca}</span>
        <h2 className="modal-titulo" id="modal-titulo">
          {porta.titulo}
        </h2>
        <p className="portal-fala">
          Esta ala ainda está em obra, senhor. A porta já existe e o lugar está reservado — quando o
          app estiver de pé, ele entra aqui sem que nada mais precise mudar.
        </p>
        <button type="button" className="portao-btn" onClick={aoFechar}>
          Entendido
        </button>
      </div>
    </dialog>
  );
}

function Espera() {
  return (
    <main className="portal portal-portao">
      <div className="portao-caixa portao-caixa-quieta">
        <Mascote tamanho={56} girando alt="" />
        <p className="portal-fala">Conferindo se o senhor já esteve aqui.</p>
      </div>
    </main>
  );
}

function ServidorMudo({ aoTentar }: { aoTentar: () => void }) {
  return (
    <main className="portal portal-portao">
      <div className="portao-caixa portao-caixa-quieta">
        <Mascote tamanho={56} alt="" />
        <p className="portal-fala">
          Não consigo falar com o servidor, senhor. Não é a sua credencial: sou eu que estou sem
          resposta do outro lado. Se o INICIAR ainda está subindo, é só esperar alguns segundos.
        </p>
        <button type="button" className="portao-btn" onClick={aoTentar}>
          Tentar de novo
        </button>
      </div>
    </main>
  );
}
