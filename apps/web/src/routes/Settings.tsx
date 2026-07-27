/**
 * Configurações — por enquanto uma página honesta e limpa; as preferências
 * reais (aparência, movimento, confirmações) entram na sequência da
 * refatoração. Nada de diagnóstico técnico aqui: infraestrutura é conversa
 * interna do sistema, não do usuário.
 */
export function SettingsPage() {
  return (
    <div className="mx-auto max-w-[720px] px-8 py-16">
      <h1
        className="ds-slide-up ds-text-glow text-[36px] font-medium leading-[1.1] tracking-tight"
        style={{ color: 'var(--color-fg)', fontFamily: 'var(--font-display)' }}
      >
        Do seu jeito.
      </h1>
      <p
        className="ds-slide-up ds-d1 mt-4 max-w-[56ch] text-[15px] leading-[1.7]"
        style={{ color: 'var(--color-fg-muted)' }}
      >
        Em breve você escolhe aqui como o aplicativo se comporta: menos movimento na tela,
        confirmações antes de ações importantes e preferências de geração. Tudo o que você fizer
        continua salvo automaticamente — não há nada para configurar antes de começar.
      </p>
    </div>
  );
}
