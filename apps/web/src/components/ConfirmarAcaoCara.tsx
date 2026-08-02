import { Mascote } from '@/components/Mascote';
import { Modal } from '@/components/Modal';
import { TRATAMENTO } from '@/lib/orbis';
import { useEffect, useRef, useState } from 'react';

/**
 * A confirmação das duas ações que custam: extrair um site e gerar outro.
 *
 * Não é uma segunda tela de login. É uma assinatura: a sessão já é legítima, e
 * o que falta é a pessoa dizer que quis ESTE gasto. Por isso a credencial é
 * pedida toda vez e não vira sessão — se virasse, o segundo disparo passaria
 * sozinho, que é justamente o que se quer impedir.
 *
 * A tranca de verdade está no servidor, que recusa a rota com 428. Este diálogo
 * é a maneira educada de pedir o que o servidor vai exigir de qualquer jeito.
 */
export function ConfirmarAcaoCara({
  aberto,
  oQueVaiFazer,
  ocupado,
  erro,
  aoConfirmar,
  aoFechar,
}: {
  aberto: boolean;
  /** A frase que descreve o gasto. "Abrir este site num navegador e capturá-lo." */
  oQueVaiFazer: string;
  ocupado?: boolean;
  /** Mensagem do servidor quando a credencial não bateu. */
  erro?: string | null;
  aoConfirmar: (senha: string) => void;
  aoFechar: () => void;
}) {
  const [senha, setSenha] = useState('');
  const campo = useRef<HTMLInputElement>(null);

  // Fechou e reabriu: campo limpo. Deixar a credencial digitada esperando na
  // caixa desfaz o motivo de ela existir.
  useEffect(() => {
    if (aberto) {
      setSenha('');
      window.setTimeout(() => campo.current?.focus(), 80);
    }
  }, [aberto]);

  return (
    <Modal open={aberto} onClose={aoFechar} title="Confirmar" size="sm">
      <form
        className="flex flex-col gap-4 p-6"
        onSubmit={(e) => {
          e.preventDefault();
          if (senha.trim() === '' || ocupado === true) return;
          aoConfirmar(senha);
        }}
      >
        <div className="flex items-start gap-3">
          <Mascote tamanho={30} girando={ocupado === true} className="mt-0.5 shrink-0" />
          <div className="min-w-0">
            <p className="text-[14px] leading-relaxed" style={{ color: 'var(--color-fg)' }}>
              Esta é das caras, {TRATAMENTO}.
            </p>
            <p
              className="mt-1 text-[13px] leading-relaxed"
              style={{ color: 'var(--color-fg-muted)' }}
            >
              {oQueVaiFazer} Antes de eu pôr a máquina para trabalhar, me confirme a credencial.
            </p>
          </div>
        </div>

        <input
          ref={campo}
          type="password"
          value={senha}
          onChange={(e) => setSenha(e.target.value)}
          placeholder="credencial"
          autoComplete="off"
          aria-label="Credencial para esta ação"
          aria-invalid={erro != null}
          className="portao-campo"
          disabled={ocupado === true}
        />

        {erro != null && (
          <p className="text-[12.5px]" role="alert" style={{ color: 'var(--color-danger)' }}>
            {erro}
          </p>
        )}

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={aoFechar}
            className="ds-tag rounded-none border px-4 py-2 text-[12px]"
            style={{ borderColor: 'var(--color-border)', color: 'var(--color-fg-muted)' }}
          >
            Deixa para depois
          </button>
          <button
            type="submit"
            disabled={ocupado === true || senha.trim() === ''}
            className="ds-btn ds-gradient-ion rounded-none px-4 py-2 text-[12px] font-medium disabled:opacity-45"
            style={{ color: 'var(--color-bone-1)' }}
          >
            {ocupado === true ? 'Conferindo' : 'Pode ir'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
