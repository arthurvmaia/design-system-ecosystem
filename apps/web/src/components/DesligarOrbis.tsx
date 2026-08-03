import { Modal } from '@/components/Modal';
import { TRATAMENTO } from '@/lib/orbis';
import { Power } from 'lucide-react';
import { useState } from 'react';

/**
 * Desligar a suíte inteira, de dentro do app.
 *
 * O INICIAR sobe quatro processos, e até agora o jeito de encerrar era achar a
 * janela preta certa e fechá-la. Quem usa o app pelo navegador em modo `--app`
 * nem vê essa janela: fecha o navegador e deixa tudo rodando atrás, segurando
 * as portas e a memória. Este botão é a saída explícita, e ele fica fixo na
 * coluna, alcançável de qualquer tela.
 *
 * ## Por que pergunta antes
 *
 * Porque não tem volta e derruba as três frentes de uma vez. O diálogo diz o
 * que vai cair, nomeando cada peça: "desligar" é uma palavra pequena para uma
 * ação grande, e a pessoa precisa reconhecer o tamanho antes de confirmar.
 *
 * ## Por que a tela some depois
 *
 * Porque o servidor morre e a tela vira uma casca que não responde a nada. Sem
 * este aviso final, a pessoa continuaria clicando numa interface morta,
 * achando que o desligamento falhou.
 */
export function DesligarOrbis({ compacto = false }: { compacto?: boolean }) {
  const [aberto, setAberto] = useState(false);
  const [desligando, setDesligando] = useState(false);
  const [pronto, setPronto] = useState(false);

  const desligar = () => {
    setDesligando(true);
    // O servidor cai no meio da resposta: erro de rede aqui é o resultado
    // esperado, e não uma falha para mostrar.
    void fetch('/api/desligar', { method: 'POST', credentials: 'include' })
      .catch(() => {})
      .finally(() => {
        setPronto(true);
        setDesligando(false);
      });
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setAberto(true)}
        title="Encerrar o Orbis inteiro: servidor, telas e o app de lojas"
        className={
          compacto
            ? 'flex h-9 w-9 items-center justify-center rounded-none transition-colors'
            : 'flex w-full items-center gap-2.5 rounded-none px-3 py-2 text-[13px] transition-colors hover:bg-white/[0.04]'
        }
        style={{ color: 'var(--color-fg-subtle)' }}
      >
        <Power size={15} strokeWidth={1.75} />
        {!compacto && (
          <span className="min-w-0 truncate" style={{ fontFamily: 'var(--font-body)' }}>
            Desligar o Orbis
          </span>
        )}
      </button>

      <Modal
        open={aberto}
        onClose={() => {
          if (!pronto) setAberto(false);
        }}
        title="Desligar o Orbis"
        size="sm"
      >
        <div className="flex flex-col gap-4 p-6">
          {pronto ? (
            <>
              <p className="text-[14px] leading-relaxed" style={{ color: 'var(--color-fg)' }}>
                Desliguei tudo, {TRATAMENTO}. Pode fechar esta janela.
              </p>
              <p className="text-[13px] leading-relaxed" style={{ color: 'var(--color-fg-muted)' }}>
                Esta tela ainda está aberta, mas já não fala com ninguém. Quando quiser voltar, é só
                clicar no INICIAR de novo.
              </p>
            </>
          ) : (
            <>
              <p className="text-[14px] leading-relaxed" style={{ color: 'var(--color-fg)' }}>
                Encerro tudo agora, {TRATAMENTO}?
              </p>
              <p className="text-[13px] leading-relaxed" style={{ color: 'var(--color-fg-muted)' }}>
                Caem as quatro peças de uma vez: o portal, esta tela, o servidor e o app de lojas
                Shopify. O que está salvo continua salvo; o que estiver no meio de uma captura se
                perde.
              </p>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  className="ds-tag rounded-none border px-3.5 py-2 text-[12px]"
                  style={{ borderColor: 'var(--color-border-strong)', color: 'var(--color-fg)' }}
                  onClick={() => setAberto(false)}
                  disabled={desligando}
                >
                  Deixa para depois
                </button>
                <button
                  type="button"
                  className="rounded-none border px-3.5 py-2 text-[12px]"
                  style={{ borderColor: 'var(--color-ion-3)', color: 'var(--color-ion-3)' }}
                  onClick={desligar}
                  disabled={desligando}
                >
                  {desligando ? 'Desligando' : 'Desligar tudo'}
                </button>
              </div>
            </>
          )}
        </div>
      </Modal>
    </>
  );
}
