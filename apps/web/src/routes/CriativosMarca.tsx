import { ConfirmarAcaoCara } from '@/components/ConfirmarAcaoCara';
import { Mascote } from '@/components/Mascote';
import { PrecisaDaSenhaDeAcao, api } from '@/lib/api';
import { useChaveDeEnvio } from '@/lib/chave-de-envio';
import { TRATAMENTO } from '@/lib/orbis';
import { useExigeCredencialDeAcao } from '@/lib/sessao';
import { toast } from '@/lib/toast';
import {
  COLECOES_QUANDO_O_ORBIS_DECIDE,
  CorDaPaleta,
  FamiliaDoSimbolo,
  FormatoDaColecao,
  LIMITES_DA_MARCA,
  LIMITE_DE_COLECOES,
  LIMITE_DE_CORES_DE_APOIO,
  LIMITE_DO_NOME_DA_COLECAO,
  PedidoDeMarca,
  ROTULO_DA_FAMILIA,
  custosDaMarca,
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
  const exigeCredencial = useExigeCredencialDeAcao();
  const [chaveDeEnvio, renovarChaveDeEnvio] = useChaveDeEnvio('criativos:marca');
  const [nome, setNome] = useState('');
  const [oQueFaz, setOQueFaz] = useState('');
  const [familia, setFamilia] = useState<FamiliaDoSimbolo>('decida-por-mim');
  const [tom, setTom] = useState('');
  const [evitar, setEvitar] = useState('');
  const [corPreferida, setCorPreferida] = useState('');
  /**
   * As outras cores da paleta. Uma marca não é uma cor.
   *
   * A principal continua separada porque ela decide tudo o que sai por cálculo:
   * é dela que a tinta e o acento derivam. As de apoio entram na paleta da
   * apresentação e são candidatas a botão — a mesma regra da peça criativa,
   * porque `coresDerivadas` é uma função só.
   */
  const [coresDeApoio, setCoresDeApoio] = useState<string[]>([]);
  /**
   * As COLEÇÕES: as categorias que a vitrine da marca mostra.
   *
   * Lista vazia = "o Orbis escolhe", a mesma convenção da cor. Não há um botão
   * separado de "faça por mim" porque ele seria um segundo jeito de dizer a
   * mesma coisa, e dois jeitos divergem: alguém marcaria o botão E digitaria
   * nomes, e nada diria qual vence.
   */
  const [colecoes, setColecoes] = useState<string[]>([]);
  const [formatoDasColecoes, setFormatoDasColecoes] = useState<FormatoDaColecao | null>(null);
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

  /**
   * A conta ESCALADA pela quantidade de coleções que a pessoa nomeou.
   *
   * O endpoint devolve o padrão (quatro capas, que é o que o Orbis escolhe
   * quando ninguém disse quantas), e ele é o certo enquanto ninguém escolheu.
   * Escolhendo oito, a conta muda — e ela não pode mudar só no fim: é este
   * número que vira `tetoDeCreditos` do pedido, e um teto curto faz o razão
   * recusar as últimas capas no meio do job.
   *
   * A aritmética é do contrato, não daqui: `custosDaMarca` é a mesma soma que
   * o servidor usa.
   */
  const nomeadas = colecoes.map((c) => c.trim()).filter((c) => c !== '');
  const conta = custos.data === undefined ? undefined : custosDaMarca(nomeadas.length);

  const montarPedido = (): unknown => ({
    nome: nome.trim(),
    oQueFaz: oQueFaz.trim(),
    familia,
    tom: tom.trim(),
    evitar: evitar.trim(),
    // Vazio é "escolha por mim", que é diferente de uma cor inválida: o
    // contrato aceita null e o motor registra a escolha com o motivo.
    corPreferida: corValida ? corPreferida : null,
    // Só as que passam no contrato: um hex pela metade viraria erro de parse
    // depois de a pessoa ter clicado em criar.
    coresDeApoio: coresDeApoio.filter((c) => CorDaPaleta.shape.hex.safeParse(c).success),
    // Nome em branco não vira coleção: ele viraria uma capa sem título e uma
    // geração paga sem assunto.
    colecoes: colecoes.map((c) => c.trim()).filter((c) => c !== ''),
    formatoDasColecoes,
    tetoDeCreditos: conta?.teto ?? 0,
    estimativa: conta?.teto ?? null,
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

            {/*
              As OUTRAS cores da paleta.

              O formulário pedia uma só, e quem já tinha as suas cores era
              obrigado a jogar fora todas menos uma — a apresentação saía
              dizendo que a marca tem uma cor.

              A principal fica separada de propósito, e não vira "a primeira da
              lista": é dela que a tinta e o acento saem por cálculo, e as de
              apoio são candidatas a botão. Misturá-las apagaria essa diferença
              e o brandbook não saberia qual é a cor da marca.
            */}
            <div className="mt-3">
              <span className="ds-label">e as outras, se houver</span>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                {coresDeApoio.map((cor, i) => (
                  <span
                    // A posição É a identidade aqui: duas cores iguais são duas
                    // entradas legítimas, e o valor como chave faria o React
                    // fundir as duas.
                    // biome-ignore lint/suspicious/noArrayIndexKey: ver acima
                    key={i}
                    className="flex items-center gap-1 border px-1.5 py-1"
                    style={{ borderColor: 'var(--color-border)' }}
                  >
                    <input
                      type="color"
                      value={CorDaPaleta.shape.hex.safeParse(cor).success ? cor : '#888888'}
                      onChange={(e) =>
                        setCoresDeApoio((atual) =>
                          atual.map((c, j) => (j === i ? e.target.value : c)),
                        )
                      }
                      aria-label={`Cor de apoio ${i + 1}`}
                      className="h-6 w-6 shrink-0 cursor-pointer rounded-none border-0 bg-transparent"
                    />
                    <span className="text-[12px]" style={{ color: 'var(--color-fg-muted)' }}>
                      {cor}
                    </span>
                    <button
                      type="button"
                      onClick={() => setCoresDeApoio((atual) => atual.filter((_, j) => j !== i))}
                      aria-label={`Tirar a cor de apoio ${i + 1}`}
                      className="px-1 text-[13px] leading-none"
                      style={{ color: 'var(--color-fg-subtle)' }}
                    >
                      ×
                    </button>
                  </span>
                ))}
                {coresDeApoio.length < LIMITE_DE_CORES_DE_APOIO && (
                  <button
                    type="button"
                    onClick={() => setCoresDeApoio((atual) => [...atual, '#888888'])}
                    className="border border-dashed px-3 py-1.5 text-[12px] transition-colors hover:border-[var(--color-signal)]"
                    style={{ borderColor: 'var(--color-border)', color: 'var(--color-fg-muted)' }}
                  >
                    + cor
                  </button>
                )}
              </div>
              <p className="mt-1.5 text-[11.5px]" style={{ color: 'var(--color-fg-subtle)' }}>
                Até {LIMITE_DE_CORES_DE_APOIO}. Elas entram na paleta da apresentação, e a primeira
                que se separar da principal e aceitar texto legível vira o botão das peças.
              </p>
            </div>
          </div>
        </div>

        {/*
          As COLEÇÕES da marca.

          Elas são as categorias que a vitrine mostra, e cada uma ganha uma capa
          própria que entra na entrega e na apresentação. Uma marca de loja sem
          as capas obriga quem recebe a inventar a vitrine sozinho.

          O campo é opcional e o vazio TEM significado: sem nome nenhum, o Orbis
          escolhe as categorias a partir do que a marca faz, e escreve a decisão
          no resultado. É a mesma convenção da cor.
        */}
        <div>
          <span className="ds-label">as coleções da sua vitrine (opcional)</span>
          <div className="mt-2 flex flex-col gap-2">
            {colecoes.map((nome, i) => (
              // A posição É a identidade: duas coleções com o mesmo nome (ou
              // duas vazias, recém-criadas) são entradas legítimas, e o valor
              // como chave faria o React fundir as duas.
              // biome-ignore lint/suspicious/noArrayIndexKey: ver acima
              <div key={i} className="flex items-center gap-2">
                <input
                  type="text"
                  value={nome}
                  maxLength={LIMITE_DO_NOME_DA_COLECAO}
                  onChange={(e) =>
                    setColecoes((atual) => atual.map((c, j) => (j === i ? e.target.value : c)))
                  }
                  placeholder={`coleção ${i + 1}`}
                  className="w-full rounded-none border px-3 py-2 text-[13px] outline-none focus:border-[var(--color-signal)]"
                  style={campo}
                />
                <button
                  type="button"
                  onClick={() => setColecoes((atual) => atual.filter((_, j) => j !== i))}
                  aria-label={`Tirar a coleção ${i + 1}`}
                  className="shrink-0 border px-2.5 py-2 text-[13px] leading-none"
                  style={{ borderColor: 'var(--color-border)', color: 'var(--color-fg-subtle)' }}
                >
                  ×
                </button>
              </div>
            ))}
            {colecoes.length < LIMITE_DE_COLECOES && (
              <button
                type="button"
                onClick={() => setColecoes((atual) => [...atual, ''])}
                className="self-start border border-dashed px-3 py-1.5 text-[12px] transition-colors hover:border-[var(--color-signal)]"
                style={{ borderColor: 'var(--color-border)', color: 'var(--color-fg-muted)' }}
              >
                + coleção
              </button>
            )}
          </div>
          <p className="mt-1.5 text-[11.5px]" style={{ color: 'var(--color-fg-subtle)' }}>
            {colecoes.length === 0
              ? `Vazio, eu escolho ${COLECOES_QUANDO_O_ORBIS_DECIDE} categorias a partir do que a marca faz, e escrevo quais na apresentação.`
              : `${colecoes.length} capa${colecoes.length === 1 ? '' : 's'}, uma geração cada. Cada nome vira a capa daquela categoria.`}
          </p>

          <div className="mt-3">
            <span className="ds-label">o formato das capas</span>
            <div className="mt-2 flex flex-wrap gap-2">
              {([null, ...FormatoDaColecao.options] as const).map((f) => (
                <button
                  key={f ?? 'orbis'}
                  type="button"
                  onClick={() => setFormatoDasColecoes(f)}
                  aria-pressed={formatoDasColecoes === f}
                  className="rounded-none border px-3 py-1.5 text-[12.5px] transition-colors hover:border-[var(--color-signal)]"
                  style={{
                    borderColor:
                      formatoDasColecoes === f ? 'rgb(var(--acento))' : 'var(--color-border)',
                    color: 'var(--color-fg)',
                  }}
                >
                  {f === null ? 'decida por mim' : f}
                </button>
              ))}
            </div>
            <p className="mt-1.5 text-[11.5px]" style={{ color: 'var(--color-fg-subtle)' }}>
              O formato sai por recorte da mesma imagem, então trocar depois não custa crédito
              nenhum. Ele vale para todas: capas misturadas não parecem variedade, parecem descuido.
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
              {conta?.teto ?? custos.data.teto} créditos, no máximo
            </span>
            <span className="text-[12px]" style={{ color: 'var(--color-fg-subtle)' }}>
              {conta?.geracoes ?? custos.data.geracoes} imagens geradas
            </span>
          </div>
          <ul className="mt-3 flex flex-col gap-1.5">
            {(conta?.estagios ?? custos.data.estagios).map((e) => (
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
        exigeCredencial={exigeCredencial}
        aberto={confirmando}
        oQueVaiFazer={
          custos.data === undefined
            ? ''
            : `Produzir a marca "${nome.trim()}": símbolo, versões da logo, favicons, artes de aplicação e a apresentação em PDF. Teto de ${conta?.teto ?? custos.data.teto} créditos, empenhados por estágio.`
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
