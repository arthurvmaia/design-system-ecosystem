import { ConfirmarAcaoCara } from '@/components/ConfirmarAcaoCara';
import { Mascote } from '@/components/Mascote';
import { api } from '@/lib/api';
import { TRATAMENTO } from '@/lib/orbis';
import { toast } from '@/lib/toast';
import {
  CUSTO_FALSO_POR_VARIACAO,
  ROTULO_DO_FORMATO,
  VARIACOES_PADRAO,
  VOZ_POR_CAMPO,
  marcaHerdadaDeProjetos,
  vozDaIssue,
} from '@/routes/criativos/partes';
import {
  CorDaPaleta,
  DIMENSAO_DO_FORMATO,
  FormatoCriativo,
  OrigemDaImagem,
  PedidoCriativo,
} from '@ds/shared/schemas';
import { useQuery } from '@tanstack/react-query';
import { Coins, Zap } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

/**
 * /criativos/expresso — o CRIATIVO EXPRESSO, no molde da via expressa do
 * design system (`Expresso.tsx`): para quem não quer os 4 passos e quer um
 * teste em 1 tela. O pedido do dono, por escrito: "quero que nessa parte da
 * orbis criativo tenha algo tipo a do expresso da de design system para eu
 * fazer um teste rapido".
 *
 * O que a via expressa do DS ensina, aplicado aqui: o atalho ASSUME as
 * decisões que dá para assumir (a marca do projeto mais recente, o formato
 * feed 1:1, a peça sem texto na arte) e SÓ pergunta o que não tem como
 * inventar: a cena que a peça mostra. Cada suposição fica declarada na tela e
 * no resumo, nunca escondida.
 *
 * Expresso é atalho de TELA, nunca contrato paralelo: o pedido montado aqui é
 * o MESMO `PedidoCriativo` dos 4 passos, conferido com `safeParse` antes do
 * diálogo de confirmação. O que o contrato reprova aparece com a voz do Orbis,
 * pela mesma tabela da tela completa (`criativos/partes.ts`).
 *
 * Tudo é ENSAIO, como no resto da frente: custo falso rotulado, credencial de
 * ação ensaiada no diálogo e um aviso do que ENTRARIA na fila. Nenhum job
 * entra, nenhum crédito é gasto. E a trava do dono continua valendo na
 * produção real: geração paga nunca sai em silêncio — a tela diz isso por
 * extenso ao lado do custo.
 */
export function CriativosExpressoPage() {
  // a marca: herdada do projeto mais recente, ou nome + 1 cor à mão
  const [marcaNome, setMarcaNome] = useState('');
  const [corPrincipal, setCorPrincipal] = useState('');
  const [editandoMarca, setEditandoMarca] = useState(false);
  const [marcaSemeada, setMarcaSemeada] = useState(false);

  // a peça: formato com padrão declarado, e UMA descrição da cena
  const [formato, setFormato] = useState<FormatoCriativo>('feed-1x1');
  const [descricao, setDescricao] = useState('');

  // conferir
  const [mostrarPendencias, setMostrarPendencias] = useState(false);
  const [confirmando, setConfirmando] = useState(false);
  const [pedidoConferido, setPedidoConferido] = useState<PedidoCriativo | null>(null);

  const projetos = useQuery({ queryKey: ['projects'], queryFn: api.listProjects });

  // A MESMA regra do passo 2 dos 4 passos, pela mesma função: qual projeto
  // empresta a marca não pode depender de qual tela perguntou.
  const marcaDoProjeto = useMemo(
    () => marcaHerdadaDeProjetos(projetos.data?.items ?? []),
    [projetos.data],
  );

  // Semeia UMA vez: depois disso o campo é da pessoa, e recarregar a query não
  // pode apagar o que ela digitou por cima.
  useEffect(() => {
    if (marcaSemeada || marcaDoProjeto === null) return;
    setMarcaNome(marcaDoProjeto.brandName);
    setCorPrincipal(marcaDoProjeto.corPrimaria);
    setMarcaSemeada(true);
  }, [marcaSemeada, marcaDoProjeto]);

  const custoEstimado = CUSTO_FALSO_POR_VARIACAO.imagem * VARIACOES_PADRAO;

  /**
   * O payload como o contrato o quer, igual ao dos 4 passos. As decisões do
   * atalho viram DADO declarado: tipo imagem, origem "gerar" (o expresso não
   * tem upload) e `semTexto: true` — sem texto por decisão registrada, não por
   * esquecimento, que é justamente o que `TextoDaPeca` recusa.
   */
  const montarPedido = (): unknown => ({
    marca: marcaNome.trim(),
    tipo: 'imagem',
    formato,
    imagem: {
      origem: 'gerar',
      caminhoDoUpload: null,
      descricaoParaGerar: descricao.trim() === '' ? null : descricao.trim(),
    },
    texto: { semTexto: true, headline: null, cta: null },
    restricoes: '',
    variacoes: VARIACOES_PADRAO,
    tetoDeCreditos: custoEstimado,
    // Nenhum campo de claim na tela = nenhum claim autorizado: sem digitação,
    // a peça não afirma preço, desconto, prazo nem frete.
  });

  /** O que trava a tela, com o contrato decidindo e o Orbis dando a frase. */
  const pendencias = (): string[] => {
    const m: string[] = [];
    const nome = PedidoCriativo.shape.marca.safeParse(marcaNome.trim());
    if (!nome.success) {
      m.push(
        marcaNome.trim() === ''
          ? 'Preciso do nome da marca com a grafia exata: é ele que aparece na peça.'
          : (VOZ_POR_CAMPO.marca as string),
      );
    }
    // A cor só trava no caminho manual: sem projeto de onde herdar a paleta,
    // o mínimo é nome e 1 cor, como na tela completa.
    if (
      (marcaDoProjeto === null || editandoMarca) &&
      !CorDaPaleta.shape.hex.safeParse(corPrincipal).success
    )
      m.push('Sem projeto de onde herdar a paleta, preciso de 1 cor no formato #RRGGBB.');
    const ri = OrigemDaImagem.safeParse({
      origem: 'gerar',
      caminhoDoUpload: null,
      descricaoParaGerar: descricao.trim() === '' ? null : descricao.trim(),
    });
    if (!ri.success) for (const issue of ri.error.issues) m.push(vozDaIssue(issue));
    return m;
  };

  const listaDePendencias = pendencias();

  const conferir = () => {
    const r = PedidoCriativo.safeParse(montarPedido());
    if (listaDePendencias.length > 0 || !r.success) {
      setMostrarPendencias(true);
      return;
    }
    setMostrarPendencias(false);
    setPedidoConferido(r.data);
    setConfirmando(true);
  };

  /**
   * A credencial não é conferida aqui de propósito, como nos 4 passos: nesta
   * fase nada dispara, então não há gasto para assinar. Quando o job real
   * existir, quem confere é o servidor (428) — o diálogo já ensaia o gesto.
   */
  const confirmar = () => {
    setConfirmando(false);
    if (pedidoConferido === null) return;
    const d = DIMENSAO_DO_FORMATO[pedidoConferido.formato];
    toast.ok(
      `Conferi o pedido: ${pedidoConferido.variacoes} variações de ${ROTULO_DO_FORMATO[pedidoConferido.formato]} (${d.largura}×${d.altura}) para "${pedidoConferido.marca}", sem texto na arte, entrariam na fila agora. Não enfileirei nada: esta tela ainda ensaia com dados falsos.`,
    );
  };

  const corValida = CorDaPaleta.shape.hex.safeParse(corPrincipal).success;

  // A amostra que corresponde à cor eleita, para a tela dizer o NOME dela.
  const amostraEleita =
    marcaDoProjeto?.amostras.find((c) => c.hex.toLowerCase() === corPrincipal.toLowerCase()) ??
    null;

  return (
    <div className="mx-auto max-w-[860px] px-4 py-10 sm:px-8">
      <div className="ds-slide-up flex items-center gap-3">
        <span className="ds-label" style={{ color: 'rgb(var(--acento))' }}>
          criativo expresso
        </span>
        <span
          className="ds-tag rounded-none border px-2 py-0.5 text-[10px]"
          style={{ borderColor: 'var(--color-border)', color: 'var(--color-fg-subtle)' }}
        >
          ensaio · nada entra na fila
        </span>
        <span className="ds-hairline flex-1" aria-hidden />
      </div>

      <div className="mt-6 flex items-start gap-4">
        <Mascote tamanho={64} girando={projetos.isLoading} className="shrink-0" />
        <div className="min-w-0">
          <h1
            className="ds-slide-up text-[24px] font-medium leading-tight sm:text-[32px]"
            style={{ color: 'var(--color-fg)', fontFamily: 'var(--font-display)' }}
          >
            Um teste em 1 tela, {TRATAMENTO}.
          </h1>
          <p
            className="mt-3 max-w-[62ch] text-[14px] leading-[1.7]"
            style={{ color: 'var(--color-fg-muted)' }}
          >
            Eu assumo o que dá para assumir: a marca vem do projeto mais recente, o formato começa
            em Feed 1:1 e a peça sai com {VARIACOES_PADRAO} variações, sem texto na arte. Só me
            descreva a cena. O pedido é conferido contra o mesmo contrato dos 4 passos, e nesta fase
            nenhum crédito é gasto e nenhum pedido entra na fila.
          </p>
        </div>
      </div>

      {/* ── A marca que assina a peça ─────────────────────────────────────── */}
      <div className="mt-8">
        <span className="ds-label">a marca que assina a peça</span>
        {projetos.isLoading ? (
          <p className="mt-2 text-[13px]" style={{ color: 'var(--color-fg-muted)' }}>
            Buscando a marca que o app já conhece.
          </p>
        ) : marcaDoProjeto !== null && !editandoMarca ? (
          <div className="ds-glass-static mt-3 rounded-none p-4">
            <div className="flex items-start gap-4">
              {marcaDoProjeto.logoUrl !== null && (
                <div
                  className="flex shrink-0 overflow-hidden border"
                  style={{ borderColor: 'var(--color-border)' }}
                >
                  {/* fundo claro E escuro, como no painel de logos do wizard:
                      a miniatura já diz onde a logo funciona */}
                  <span
                    className="flex h-12 w-14 items-center justify-center"
                    style={{ backgroundColor: '#f5f5f2' }}
                  >
                    <img
                      src={marcaDoProjeto.logoUrl}
                      alt={`Logotipo de ${marcaDoProjeto.brandName} em fundo claro`}
                      className="max-h-10 max-w-12 object-contain"
                    />
                  </span>
                  <span
                    className="flex h-12 w-14 items-center justify-center"
                    style={{ backgroundColor: '#141414' }}
                  >
                    <img
                      src={marcaDoProjeto.logoUrl}
                      alt={`Logotipo de ${marcaDoProjeto.brandName} em fundo escuro`}
                      className="max-h-10 max-w-12 object-contain"
                    />
                  </span>
                </div>
              )}
              <div className="min-w-0 flex-1">
                <span
                  className="block text-[15px] font-medium"
                  style={{ color: 'var(--color-fg)' }}
                >
                  {marcaNome}
                </span>
                <span
                  className="mt-0.5 block text-[12px]"
                  style={{ color: 'var(--color-fg-muted)' }}
                >
                  Trouxe do projeto "{marcaDoProjeto.projetoNome}" e já elegi a cor principal.
                  Editar a marca é no projeto; aqui ela só assina a peça.
                </span>
              </div>
              {/* O "mudar" é discreto de propósito: quem já tem marca não deve
                  ser cobrado de novo, mas a porta de trocar fica à vista. */}
              <button
                type="button"
                onClick={() => setEditandoMarca(true)}
                className="shrink-0 text-[12px] underline underline-offset-2"
                style={{ color: 'var(--color-fg-muted)' }}
              >
                mudar
              </button>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {marcaDoProjeto.amostras.map((c) => (
                <button
                  key={`${c.nome}-${c.hex}`}
                  type="button"
                  onClick={() => setCorPrincipal(c.hex)}
                  aria-pressed={corPrincipal === c.hex}
                  aria-label={`Cor ${c.nome} (${c.hex})`}
                  title={`${c.nome} · ${c.hex}`}
                  className="h-8 w-8 rounded-none border-2 transition-transform hover:scale-105"
                  style={{
                    background: c.hex,
                    borderColor:
                      corPrincipal === c.hex ? 'var(--color-signal)' : 'var(--color-border)',
                  }}
                />
              ))}
              <span className="ds-data text-[11px]" style={{ color: 'var(--color-fg-subtle)' }}>
                cor principal:{' '}
                {amostraEleita !== null ? `${amostraEleita.nome} · ${corPrincipal}` : corPrincipal}
              </span>
            </div>
          </div>
        ) : (
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <span className="ds-label">nome da marca, com a grafia exata</span>
              <input
                type="text"
                value={marcaNome}
                onChange={(e) => setMarcaNome(e.target.value)}
                placeholder="é o que aparece na peça"
                className="mt-2 w-full rounded-none border px-3 py-2 text-[13px] outline-none focus:border-[var(--color-signal)]"
                style={{
                  borderColor: 'var(--color-border)',
                  color: 'var(--color-fg)',
                  background: 'transparent',
                }}
              />
            </div>
            <div>
              <span className="ds-label">uma cor</span>
              <div className="mt-2 flex items-center gap-2">
                <input
                  type="color"
                  value={corValida ? corPrincipal : '#8b5cf6'}
                  onChange={(e) => setCorPrincipal(e.target.value)}
                  aria-label="Escolher a cor principal"
                  className="h-9 w-9 shrink-0 cursor-pointer rounded-none border"
                  style={{ borderColor: 'var(--color-border)', background: 'transparent' }}
                />
                <input
                  type="text"
                  value={corPrincipal}
                  onChange={(e) => setCorPrincipal(e.target.value)}
                  placeholder="#7C3AED"
                  className="w-full rounded-none border px-3 py-2 text-[13px] outline-none focus:border-[var(--color-signal)]"
                  style={{
                    borderColor: 'var(--color-border)',
                    color: 'var(--color-fg)',
                    background: 'transparent',
                  }}
                />
              </div>
            </div>
            {marcaDoProjeto !== null && (
              <button
                type="button"
                onClick={() => {
                  setMarcaNome(marcaDoProjeto.brandName);
                  setCorPrincipal(marcaDoProjeto.corPrimaria);
                  setEditandoMarca(false);
                }}
                className="justify-self-start text-[12px] underline underline-offset-2"
                style={{ color: 'var(--color-fg-muted)' }}
              >
                voltar para a marca do projeto "{marcaDoProjeto.projetoNome}"
              </button>
            )}
          </div>
        )}
      </div>

      {/* ── O formato, com o padrão declarado ─────────────────────────────── */}
      <div className="mt-6">
        <span className="ds-label">formato · começa em Feed 1:1, troque se quiser</span>
        <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {FormatoCriativo.options.map((f) => {
            const d = DIMENSAO_DO_FORMATO[f];
            return (
              <button
                key={f}
                type="button"
                onClick={() => setFormato(f)}
                aria-pressed={formato === f}
                className="rounded-none border px-3 py-2.5 text-left transition-colors hover:border-[var(--color-signal)]"
                style={{
                  borderColor: formato === f ? 'var(--color-primary)' : 'var(--color-border)',
                  background: formato === f ? 'rgb(var(--acento) / 0.06)' : 'transparent',
                }}
              >
                <span
                  className="block text-[13px] font-medium"
                  style={{ color: 'var(--color-fg)' }}
                >
                  {ROTULO_DO_FORMATO[f]}
                </span>
                <span
                  className="ds-data mt-0.5 block text-[11px]"
                  style={{ color: 'var(--color-fg-muted)' }}
                >
                  {d.largura}×{d.altura}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── A única pergunta de verdade: a cena ───────────────────────────── */}
      <div className="mt-6">
        <span className="ds-label">o que a peça mostra</span>
        <p className="mt-1 text-[12px]" style={{ color: 'var(--color-fg-subtle)' }}>
          Uma descrição só: é dela que eu crio a imagem. Foto própria, vídeo, headline e CTA moram
          no{' '}
          <Link to="/criativos" className="underline underline-offset-2">
            fluxo completo
          </Link>
          .
        </p>
        <textarea
          value={descricao}
          onChange={(e) => setDescricao(e.target.value)}
          rows={3}
          placeholder='ex.: "a garrafa do suco sobre uma mesa de madeira, luz de manhã, fundo desfocado"'
          className="mt-2 w-full rounded-none border px-3 py-2 text-[13px] outline-none focus:border-[var(--color-signal)]"
          style={{
            borderColor: 'var(--color-border)',
            color: 'var(--color-fg)',
            background: 'transparent',
          }}
        />
      </div>

      {/* ── O custo de ensaio, com a trava dita por extenso ───────────────── */}
      <div
        className="mt-6 flex flex-wrap items-center gap-3 rounded-none border p-4"
        style={{
          borderColor: 'rgb(var(--acento) / 0.35)',
          background: 'rgb(var(--acento) / 0.06)',
        }}
      >
        <Coins size={16} style={{ color: 'rgb(var(--acento))' }} aria-hidden />
        <div className="min-w-0 flex-1">
          <span className="text-[14px] font-medium" style={{ color: 'var(--color-fg)' }}>
            {custoEstimado} créditos estimados · teto do job: {custoEstimado}
          </span>
          <p className="mt-0.5 text-[12px]" style={{ color: 'var(--color-fg-muted)' }}>
            Número de ensaio: o valor real sai do simulate_cost quando o motor entrar, e esta tela
            não cobra nada. Na produção real, cada imagem gasta crédito do Magnific, na casa de{' '}
            {CUSTO_FALSO_POR_VARIACAO.imagem} por variação, e o motor pergunta antes de gastar:
            geração paga nunca sai em silêncio, nem no expresso.
          </p>
        </div>
        <span
          className="ds-tag rounded-none border px-2 py-0.5 text-[10px]"
          style={{ borderColor: 'rgb(var(--acento) / 0.5)', color: 'rgb(var(--acento))' }}
        >
          estimativa
        </span>
      </div>

      {mostrarPendencias && listaDePendencias.length > 0 && (
        <div
          role="alert"
          className="mt-4 rounded-none border px-4 py-3"
          style={{ borderColor: 'var(--color-danger)' }}
        >
          {listaDePendencias.map((p) => (
            <p
              key={p}
              className="text-[12.5px] leading-relaxed"
              style={{ color: 'var(--color-danger)' }}
            >
              {p}
            </p>
          ))}
        </div>
      )}

      <div className="mt-8">
        <button
          type="button"
          onClick={conferir}
          className="ds-btn ds-glow inline-flex items-center gap-2 rounded-none px-6 py-3 text-[14px] font-medium"
          style={{ backgroundColor: 'var(--color-primary)', color: 'var(--color-bone-1)' }}
        >
          <Zap size={14} />
          Conferir o pedido
        </button>
        <p className="mt-2 text-[12px]" style={{ color: 'var(--color-fg-subtle)' }}>
          Este botão pede a credencial de ação. Nesta fase da construção, nada entra na fila: eu só
          mostro o aviso do que aconteceria.
        </p>
      </div>

      <ConfirmarAcaoCara
        aberto={confirmando}
        oQueVaiFazer={
          pedidoConferido !== null
            ? `Produzir ${pedidoConferido.variacoes} variações de ${ROTULO_DO_FORMATO[pedidoConferido.formato]} para "${pedidoConferido.marca}", sem texto na arte. Estimativa de ensaio: ${custoEstimado} créditos.`
            : ''
        }
        ocupado={false}
        erro={null}
        aoConfirmar={() => confirmar()}
        aoFechar={() => setConfirmando(false)}
      />
    </div>
  );
}
