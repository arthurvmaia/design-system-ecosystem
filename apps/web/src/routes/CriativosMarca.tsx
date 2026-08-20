import { ConfirmarAcaoCara } from '@/components/ConfirmarAcaoCara';
import { Mascote } from '@/components/Mascote';
import { PrecisaDaSenhaDeAcao, api } from '@/lib/api';
import { useChaveDeEnvio } from '@/lib/chave-de-envio';
import { TRATAMENTO } from '@/lib/orbis';
import { toast } from '@/lib/toast';
import {
  CorDaPaleta,
  FamiliaDoSimbolo,
  LIMITES_DA_MARCA,
  PedidoDeMarca,
  ROTULO_DA_FAMILIA,
} from '@ds/shared/schemas';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, Check, Sparkles } from 'lucide-react';
import { useState } from 'react';

/**
 * A CRIAÇÃO DE MARCA, pela tela.
 *
 * ## Por que ela é uma tela própria, e não um terceiro passo do wizard
 *
 * O wizard de peça pergunta formato, origem da imagem, headline e CTA. Uma
 * marca não tem nenhum dos quatro: não há canal com dimensão, não há foto do
 * cliente, e o texto que importa é o NOME, não a copy. Enfiar a marca ali
 * obrigaria metade dos passos a se esconderem conforme o tipo — e passo que
 * some é passo que alguém preenche sem saber que não vale.
 *
 * ## O que trava, e o que se assume
 *
 * O mesmo critério do resto da casa. O nome com a grafia exata trava: é ele que
 * vai desenhado no logotipo. O que a marca faz trava: sem isso o símbolo é
 * sorteio, e descobrir custa outra geração. Tom, o que evitar e a cor são
 * DIREÇÃO — guiam e ficam registrados, e a cor que o cliente não escolher é
 * escolhida pelo Orbis com o motivo escrito ao lado.
 */
export function CriativosMarcaPage() {
  const [chaveDeEnvio, renovarChaveDeEnvio] = useChaveDeEnvio('criativos:marca');
  const [nome, setNome] = useState('');
  const [oQueFaz, setOQueFaz] = useState('');
  const [familia, setFamilia] = useState<FamiliaDoSimbolo>('decida-por-mim');
  const [tom, setTom] = useState('');
  const [evitar, setEvitar] = useState('');
  const [corPreferida, setCorPreferida] = useState('');
  const [mostrarPendencias, setMostrarPendencias] = useState(false);
  const [confirmando, setConfirmando] = useState(false);
  const [erroDaSenha, setErroDaSenha] = useState<string | null>(null);
  const [jobCriado, setJobCriado] = useState<string | null>(null);

  const cliente = useQueryClient();
  const custos = useQuery({
    queryKey: ['marcas', 'custos'],
    queryFn: api.custosDaMarca,
    staleTime: 60 * 60 * 1000,
  });

  const corValida = CorDaPaleta.shape.hex.safeParse(corPreferida).success;

  const montarPedido = (): unknown => ({
    nome: nome.trim(),
    oQueFaz: oQueFaz.trim(),
    familia,
    tom: tom.trim(),
    evitar: evitar.trim(),
    // Vazio é "escolha por mim", que é diferente de uma cor inválida: o
    // contrato aceita null e o motor registra a escolha com o motivo.
    corPreferida: corValida ? corPreferida : null,
    tetoDeCreditos: custos.data?.teto ?? 0,
    estimativa: custos.data?.teto ?? null,
    preset: 'imagem-marca',
  });

  /** O que trava o envio, com o contrato decidindo as frases. */
  const pendencias = ((): string[] => {
    const m: string[] = [];
    if (nome.trim() === '') {
      m.push('Preciso do nome da marca com a grafia exata: é ele que vai desenhado no logotipo.');
    }
    if (oQueFaz.trim() === '') {
      m.push(
        'Preciso saber o que a marca faz e para quem. Sem isso o símbolo vira sorteio, e descobrir custa outra geração.',
      );
    }
    if (custos.data === undefined) {
      m.push('Ainda estou buscando quanto a marca custa. Sem o teto eu não abro pedido.');
    }
    const r = custos.data === undefined ? null : PedidoDeMarca.safeParse(montarPedido());
    if (r !== null && !r.success) {
      for (const i of r.error.issues) if (m.length < 4) m.push(i.message);
    }
    return m;
  })();

  const enviar = useMutation({
    mutationFn: async (senhaDeAcao?: string) =>
      await api.criarPedidoDeMarca(chaveDeEnvio, montarPedido(), senhaDeAcao),
    onSuccess: (res) => {
      setConfirmando(false);
      setErroDaSenha(null);
      setJobCriado(res.job.id);
      renovarChaveDeEnvio();
      void cliente.invalidateQueries({ queryKey: ['marcas'] });
    },
    onError: (e) => {
      if (e instanceof PrecisaDaSenhaDeAcao) {
        setErroDaSenha('Preciso da senha de ação: este pedido gasta crédito.');
        return;
      }
      setConfirmando(false);
      toast.erro(e instanceof Error ? e.message : 'Não consegui registrar o pedido.');
    },
  });

  const campo = {
    borderColor: 'var(--color-border)',
    color: 'var(--color-fg)',
    background: 'transparent',
  };

  if (jobCriado !== null) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-16">
        <div className="ds-glass-static rounded-xl p-8">
          <Check size={22} style={{ color: 'var(--color-primary)' }} />
          <h1 className="mt-3 text-[22px] font-medium" style={{ color: 'var(--color-fg)' }}>
            Pedido de marca registrado.
          </h1>
          <p
            className="mt-3 text-[14px] leading-relaxed"
            style={{ color: 'var(--color-fg-muted)' }}
          >
            Ele entra na fila. Nada foi gerado ainda e nenhum crédito saiu: a produção começa quando
            você abrir o PROCESSAR e escolher este pedido.
          </p>
          <p
            className="mt-2 text-[13px] leading-relaxed"
            style={{ color: 'var(--color-fg-subtle)' }}
          >
            A marca sai com o símbolo, as versões da logo, os favicons, os criativos de aplicação e
            a apresentação em PDF. Marca sem apresentação não é marca pronta, então ela vem junto.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <header className="flex items-start gap-4">
        <Mascote tamanho={40} />
        <div>
          <h1
            className="text-[28px] leading-tight font-medium"
            style={{ color: 'var(--color-fg)' }}
          >
            Uma marca inteira, {TRATAMENTO}.
          </h1>
          <p
            className="mt-2 text-[14px] leading-relaxed"
            style={{ color: 'var(--color-fg-muted)' }}
          >
            O símbolo nasce uma vez e todo o resto sai dele por cálculo: as versões da logo, os
            favicons, a paleta e a apresentação. Preciso de duas coisas obrigatórias e três que
            ajudam.
          </p>
        </div>
      </header>

      <section className="ds-fade-in mt-8 grid grid-cols-1 gap-5">
        <div>
          <span className="ds-label">nome da marca, com a grafia exata</span>
          <input
            type="text"
            value={nome}
            maxLength={LIMITES_DA_MARCA.nome}
            onChange={(e) => setNome(e.target.value)}
            placeholder="é ele que vai desenhado no logotipo"
            className="mt-2 w-full rounded-none border px-3 py-2 text-[14px] outline-none focus:border-[var(--color-signal)]"
            style={campo}
          />
        </div>

        <div>
          <span className="ds-label">o que a marca faz, e para quem</span>
          <textarea
            value={oQueFaz}
            maxLength={LIMITES_DA_MARCA.oQueFaz}
            onChange={(e) => setOQueFaz(e.target.value)}
            rows={3}
            placeholder="clínica odontológica de bairro que atende famílias, com foco em prevenção"
            className="mt-2 w-full rounded-none border px-3 py-2 text-[14px] leading-relaxed outline-none focus:border-[var(--color-signal)]"
            style={campo}
          />
          <p className="mt-1.5 text-[11.5px]" style={{ color: 'var(--color-fg-subtle)' }}>
            Isto trava porque sem ele o símbolo é sorteio, e descobrir que saiu errado custa outra
            geração.
          </p>
        </div>

        <div>
          <span className="ds-label">que tipo de símbolo</span>
          <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {FamiliaDoSimbolo.options.map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setFamilia(f)}
                aria-pressed={familia === f}
                className="border px-3 py-2.5 text-left text-[12.5px] leading-snug transition-colors"
                style={{
                  borderColor: familia === f ? 'var(--color-signal)' : 'var(--color-border)',
                  color: familia === f ? 'var(--color-fg)' : 'var(--color-fg-muted)',
                }}
              >
                {ROTULO_DA_FAMILIA[f]}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <div>
            <span className="ds-label">como a marca fala (opcional)</span>
            <input
              type="text"
              value={tom}
              maxLength={LIMITES_DA_MARCA.tom}
              onChange={(e) => setTom(e.target.value)}
              placeholder="acolhedora, direta, sem jargão"
              className="mt-2 w-full rounded-none border px-3 py-2 text-[13px] outline-none focus:border-[var(--color-signal)]"
              style={campo}
            />
          </div>
          <div>
            <span className="ds-label">a cor, se você já tem uma (opcional)</span>
            <div className="mt-2 flex items-center gap-2">
              <input
                type="color"
                value={corValida ? corPreferida : '#0F4C81'}
                onChange={(e) => setCorPreferida(e.target.value)}
                aria-label="Escolher a cor da marca"
                className="h-9 w-9 shrink-0 cursor-pointer rounded-none border"
                style={{ borderColor: 'var(--color-border)', background: 'transparent' }}
              />
              <input
                type="text"
                value={corPreferida}
                onChange={(e) => setCorPreferida(e.target.value)}
                placeholder="deixe vazio e eu escolho"
                className="w-full rounded-none border px-3 py-2 text-[13px] outline-none focus:border-[var(--color-signal)]"
                style={campo}
              />
            </div>
            <p className="mt-1.5 text-[11.5px]" style={{ color: 'var(--color-fg-subtle)' }}>
              Vazio, eu escolho e escrevo o porquê na apresentação. Trocar depois é barato: todas as
              versões saem do mesmo símbolo.
            </p>
          </div>
        </div>

        <div>
          <span className="ds-label">o que ela NÃO pode parecer (opcional)</span>
          <input
            type="text"
            value={evitar}
            maxLength={LIMITES_DA_MARCA.evitar}
            onChange={(e) => setEvitar(e.target.value)}
            placeholder="dente desenhado, cruz de saúde, azul de consultório"
            className="mt-2 w-full rounded-none border px-3 py-2 text-[13px] outline-none focus:border-[var(--color-signal)]"
            style={campo}
          />
          <p className="mt-1.5 text-[11.5px]" style={{ color: 'var(--color-fg-subtle)' }}>
            É o campo que mais economiza tentativa: cada uma custa crédito.
          </p>
        </div>
      </section>

      {/* O custo, com a conta aberta por estágio. */}
      {custos.data !== undefined && (
        <section className="ds-glass-static mt-8 rounded-none p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <span className="text-[15px] font-medium" style={{ color: 'var(--color-fg)' }}>
              {custos.data.teto} créditos, no máximo
            </span>
            <span className="text-[12px]" style={{ color: 'var(--color-fg-subtle)' }}>
              {custos.data.geracoes} imagens geradas
            </span>
          </div>
          <ul className="mt-3 flex flex-col gap-1.5">
            {custos.data.estagios.map((e) => (
              <li
                key={e.id}
                className="flex justify-between text-[12.5px]"
                style={{ color: 'var(--color-fg-muted)' }}
              >
                <span>{e.rotulo}</span>
                <span className="ds-data">{e.creditos}</span>
              </li>
            ))}
          </ul>
          <p
            className="mt-3 text-[11.5px] leading-relaxed"
            style={{ color: 'var(--color-fg-subtle)' }}
          >
            Cada estágio é empenhado separado. Uma marca que erra no símbolo para no primeiro, e não
            queima o teto inteiro para descobrir no fim.
          </p>
        </section>
      )}

      {mostrarPendencias && pendencias.length > 0 && (
        <ul className="mt-5 flex flex-col gap-2">
          {pendencias.map((p) => (
            <li
              key={p}
              className="text-[13px] leading-snug"
              style={{ color: 'var(--color-signal)' }}
            >
              {p}
            </li>
          ))}
        </ul>
      )}

      <div className="mt-8 flex items-center gap-3">
        <button
          type="button"
          onClick={() => {
            if (pendencias.length > 0) {
              setMostrarPendencias(true);
              return;
            }
            setConfirmando(true);
          }}
          className="flex items-center gap-2 px-5 py-2.5 text-[14px]"
          style={{ background: 'rgb(var(--acento))', color: 'var(--color-bg)' }}
        >
          <Sparkles size={15} />
          Criar a marca
          <ArrowRight size={15} />
        </button>
      </div>

      <ConfirmarAcaoCara
        aberto={confirmando}
        oQueVaiFazer={
          custos.data === undefined
            ? ''
            : `Produzir a marca "${nome.trim()}": símbolo, versões da logo, favicons, artes de aplicação e a apresentação em PDF. Teto de ${custos.data.teto} créditos, empenhados por estágio.`
        }
        ocupado={enviar.isPending}
        erro={erroDaSenha}
        aoConfirmar={(senha) => enviar.mutate(senha)}
        aoFechar={() => {
          setConfirmando(false);
          setErroDaSenha(null);
        }}
      />
    </div>
  );
}
