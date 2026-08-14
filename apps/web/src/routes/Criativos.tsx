import { ConfirmarAcaoCara } from '@/components/ConfirmarAcaoCara';
import { Mascote } from '@/components/Mascote';
import { api } from '@/lib/api';
import { TRATAMENTO } from '@/lib/orbis';
import { toast } from '@/lib/toast';
import { mediaUrl } from '@/routes/projects/partes';
import {
  CorDaPaleta,
  DIMENSAO_DO_FORMATO,
  FormatoCriativo,
  OrigemDaImagem,
  PedidoCriativo,
  TextoDaPeca,
  normalizarProjectBranding,
} from '@ds/shared/schemas';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Clapperboard,
  Coins,
  Image as IconeImagem,
  Sparkles,
  Upload,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

/**
 * /criativos — a ala de criativos, no passo 2 da espec
 * (`references/12-frente-criativos-mvp.md`): a TELA dos quatro passos com
 * dados falsos, para validar a experiência ANTES de gastar crédito. Formulário
 * ruim descoberto depois do backend custa os dois.
 *
 * O que é de verdade aqui: a validação (o contrato `PedidoCriativo` decide o
 * que trava, e a mensagem aparece na tela) e a marca pré-preenchida do projeto
 * mais recente — perguntar de novo o que o app já sabe é o erro que faz a
 * experiência parecer burocracia.
 *
 * O que é de ensaio: o custo (número marcado como estimativa) e o botão final,
 * que só avisa o que ACONTECERIA. Nenhum job entra na fila, nenhum crédito é
 * gasto e o arquivo escolhido no upload nunca sai desta tela.
 *
 * A rota ainda não aparece em navegação nenhuma: ligar o
 * `ConviteOrbisCriativos` é o passo 6 da espec, depois que o motor existir.
 * Até lá ela vive por URL.
 */

// ── Vocabulário da tela ──────────────────────────────────────────────────────

/**
 * Só o RÓTULO mora aqui; a medida sai de `DIMENSAO_DO_FORMATO`, no contrato.
 * Dois lados mostrando números digitados em lugares diferentes é como a medida
 * diverge sem ninguém errar — a mesma razão que pôs a dimensão no shared.
 */
const ROTULO_DO_FORMATO: Record<FormatoCriativo, string> = {
  'feed-1x1': 'Feed 1:1',
  'story-9x16': 'Story 9:16',
  'reels-9x16': 'Reels 9:16',
  'banner-3x1': 'Banner 3:1',
};

const OBJETIVOS_DA_PECA = [
  'vender produto',
  'apresentar serviço',
  'captar contato',
  'divulgar novidade',
] as const;
type ObjetivoDaPeca = (typeof OBJETIVOS_DA_PECA)[number];

/** Espec, "assume e registra": objetivo vazio vira "apresentar" — e o resumo declara. */
const OBJETIVO_ASSUMIDO: ObjetivoDaPeca = 'apresentar serviço';

/**
 * O padrão de variações vem do CONTRATO, não de um número redigitado aqui: se
 * o default do schema mudar, esta tela muda junto sem ninguém lembrar dela.
 */
const VARIACOES_PADRAO: number = PedidoCriativo.shape.variacoes.parse(undefined);

/**
 * Custo de ENSAIO por variação, em créditos. Números de mentira, e a tela diz
 * isso por extenso: 75 é o que a via expressa já mostra para uma imagem no
 * Magnific; o de vídeo é chute deliberado. O valor real sai do `simulate_cost`
 * quando o motor entrar (passo 3 da espec) — até lá, fingir precisão seria o
 * Orbis prometendo o que não entrega.
 */
const CUSTO_FALSO_POR_VARIACAO: Record<'imagem' | 'video', number> = {
  imagem: 75,
  video: 300,
};

const PASSOS = ['o pedido', 'sua marca', 'a peça', 'conferir'] as const;

/**
 * Issues do contrato que nasceram SEM voz (min/max genéricos do Zod) ganham a
 * frase do Orbis aqui, chaveadas pelo campo. As de `superRefine` já vêm
 * escritas no contrato e passam direto — a fonte da mensagem é uma só.
 */
const VOZ_POR_CAMPO: Record<string, string> = {
  headline: 'A headline passou de 200 caracteres. Nesse tamanho ela não fica legível na peça.',
  cta: 'O CTA passou de 80 caracteres. Botão é uma ordem curta.',
  descricaoParaGerar: 'A descrição passou de 2000 caracteres. Me diga o essencial da cena.',
  restricoes: 'As restrições passaram de 2000 caracteres.',
  marca: 'O nome da marca passa de 80 caracteres: na peça ele não cabe assim.',
};

const vozDaIssue = (issue: { code: string; message: string; path: (string | number)[] }): string =>
  issue.code === 'custom'
    ? issue.message
    : (VOZ_POR_CAMPO[String(issue.path[issue.path.length - 1] ?? '')] ??
      `O contrato reprovou "${issue.path.join('.')}". Volte ao passo desse campo e complete.`);

// ── A marca que o app já conhece ─────────────────────────────────────────────

type MarcaHerdada = {
  projetoNome: string;
  brandName: string;
  /** Amostras clicáveis: clicar elege a cor principal da peça. */
  amostras: Array<{ nome: string; hex: string }>;
  corPrimaria: string;
  logoUrl: string | null;
};

// ── A tela ───────────────────────────────────────────────────────────────────

export function CriativosPage() {
  const [passo, setPasso] = useState(0);
  /**
   * As pendências só aparecem depois de a pessoa TENTAR avançar. Abrir o passo
   * já coberto de vermelho cobra erro de quem ainda nem começou a preencher.
   */
  const [mostrarPendencias, setMostrarPendencias] = useState(false);

  // passo 1 — o pedido
  const [tipo, setTipo] = useState<'imagem' | 'video' | null>(null);
  /**
   * O vocabulário do passo 3 SEGUE o tipo — o dono escolheu vídeo e a tela
   * continuou pedindo "a foto": rótulo, regra, botão, accept e resumo falavam
   * de imagem cravada. Uma fonte só para as palavras, e o accept do arquivo
   * acompanha, senão o seletor de arquivo recusa exatamente o que se pediu.
   */
  const eVideo = tipo === 'video';
  const midia = {
    rotulo: eVideo ? 'o vídeo' : 'a imagem',
    regra: eVideo
      ? 'Se o vídeo existe, ele vence: eu só crio quando não há vídeo.'
      : 'Se a foto existe, ela vence: eu só crio quando não há imagem.',
    tenho: eVideo ? 'Tenho o vídeo' : 'Tenho a foto',
    aceita: eVideo ? 'video/*' : 'image/*',
    origemPergunta: eVideo
      ? 'O vídeo vem de onde? Ou o arquivo que a marca já tem, ou eu crio um.'
      : 'A imagem vem de onde? Ou a foto que a marca já tem, ou eu crio uma.',
    enviada: eVideo ? 'o vídeo enviado' : 'a foto enviada',
  };
  const [objetivo, setObjetivo] = useState<ObjetivoDaPeca | null>(null);

  // passo 2 — sua marca
  const [marcaNome, setMarcaNome] = useState('');
  const [corPrincipal, setCorPrincipal] = useState('');
  const [editandoMarca, setEditandoMarca] = useState(false);
  const [marcaSemeada, setMarcaSemeada] = useState(false);

  // passo 3 — a peça
  const [formato, setFormato] = useState<FormatoCriativo | null>(null);
  const [origem, setOrigem] = useState<'upload' | 'gerar' | null>(null);
  /**
   * Só o NOME do arquivo fica aqui: nesta fase nada sobe para lugar nenhum.
   * O upload de verdade é do handler do job (passo 3 da espec).
   */
  const [arquivoNome, setArquivoNome] = useState<string | null>(null);
  const [descricao, setDescricao] = useState('');
  const [semTexto, setSemTexto] = useState(false);
  const [headline, setHeadline] = useState('');
  const [cta, setCta] = useState('');
  const [restricoes, setRestricoes] = useState('');

  // passo 4 — conferir
  const [confirmando, setConfirmando] = useState(false);
  const [pedidoConferido, setPedidoConferido] = useState<PedidoCriativo | null>(null);

  // A mesma api da tela de projetos: a marca vem preenchida de lá, com um
  // "mudar" discreto — não cobrar de quem já tem.
  const projetos = useQuery({ queryKey: ['projects'], queryFn: api.listProjects });

  const marcaDoProjeto = useMemo<MarcaHerdada | null>(() => {
    const itens = projetos.data?.items ?? [];
    const ordenados = [...itens].sort((a, b) => b.updatedAt - a.updatedAt);
    for (const p of ordenados) {
      if (p.brandingJson === null) continue;
      const b = normalizarProjectBranding(p.brandingJson);
      const nome = (b.brandName ?? '').trim();
      // Marca sem nome não pré-preenche nada útil: o nome é o único campo que
      // trava, e é justamente o que faltaria.
      if (nome === '') continue;

      const amostrasNovas = (b.paleta?.cores ?? []).map((c) => ({ nome: c.nome, hex: c.hex }));
      const amostrasLegado = [
        { nome: 'principal', hex: b.palette.primary },
        ...(b.palette.accent !== undefined ? [{ nome: 'acento', hex: b.palette.accent }] : []),
        { nome: 'fundo', hex: b.palette.background },
        { nome: 'texto', hex: b.palette.foreground },
      ];
      const vistos = new Set<string>();
      const amostras = (amostrasNovas.length > 0 ? amostrasNovas : amostrasLegado).filter((c) => {
        const chave = c.hex.toLowerCase();
        if (vistos.has(chave)) return false;
        vistos.add(chave);
        return true;
      });

      const logoPath = b.logoPath ?? b.logos?.[0]?.path ?? null;
      return {
        projetoNome: p.name,
        brandName: nome,
        amostras,
        corPrimaria: amostras[0]?.hex ?? b.palette.primary,
        logoUrl: logoPath != null ? mediaUrl(p.id, logoPath) : null,
      };
    }
    return null;
  }, [projetos.data]);

  // Semeia UMA vez: depois disso o campo é da pessoa, e recarregar a query não
  // pode apagar o que ela digitou por cima.
  useEffect(() => {
    if (marcaSemeada || marcaDoProjeto === null) return;
    setMarcaNome(marcaDoProjeto.brandName);
    setCorPrincipal(marcaDoProjeto.corPrimaria);
    setMarcaSemeada(true);
  }, [marcaSemeada, marcaDoProjeto]);

  const custoEstimado = tipo === null ? 0 : CUSTO_FALSO_POR_VARIACAO[tipo] * VARIACOES_PADRAO;

  /** O payload como o contrato o quer — vazio vira null, nunca string oca. */
  const montarPedido = (): unknown => ({
    marca: marcaNome.trim(),
    tipo,
    formato,
    imagem: {
      origem,
      caminhoDoUpload: origem === 'upload' ? arquivoNome : null,
      descricaoParaGerar: origem === 'gerar' && descricao.trim() !== '' ? descricao.trim() : null,
    },
    texto: {
      semTexto,
      // A chave "sem texto" decide: ligada, o que estiver digitado fica de
      // fora do pedido (o contrato recusaria os dois juntos como ambíguo).
      headline: semTexto || headline.trim() === '' ? null : headline.trim(),
      cta: semTexto || cta.trim() === '' ? null : cta.trim(),
    },
    restricoes: restricoes.trim(),
    variacoes: VARIACOES_PADRAO,
    tetoDeCreditos: custoEstimado,
    // Nenhum campo de claim na tela = nenhum claim autorizado. É o único
    // default seguro: sem digitação, a peça não afirma preço, desconto, prazo
    // nem frete.
  });

  /**
   * O que trava ESTE passo, com o contrato decidindo. As frases dos
   * `superRefine` do schema saem como estão; o que o Zod reprova sem voz
   * (enum vazio, min/max) ganha a frase do Orbis.
   */
  const pendenciasDoPasso = (p: number): string[] => {
    const m: string[] = [];
    if (p === 0) {
      if (!PedidoCriativo.shape.tipo.safeParse(tipo).success)
        m.push('Escolha entre imagem e vídeo: essa escolha muda todo o resto do pedido.');
    }
    if (p === 1) {
      const nome = PedidoCriativo.shape.marca.safeParse(marcaNome.trim());
      if (!nome.success) {
        m.push(
          marcaNome.trim() === ''
            ? 'Preciso do nome da marca com a grafia exata: é ele que aparece na peça.'
            : (VOZ_POR_CAMPO.marca as string),
        );
      }
      // A cor só trava quando não há projeto de onde herdar a paleta — a
      // espec pede o mínimo de quem chega vazio: nome e uma cor.
      if (marcaDoProjeto === null && !CorDaPaleta.shape.hex.safeParse(corPrincipal).success)
        m.push('Sem projeto de onde herdar a paleta, preciso de 1 cor no formato #RRGGBB.');
    }
    if (p === 2) {
      if (!FormatoCriativo.safeParse(formato).success)
        m.push('Escolha o formato: a medida decide onde a peça entra.');
      if (origem === null) {
        m.push(midia.origemPergunta);
      } else {
        const ri = OrigemDaImagem.safeParse({
          origem,
          caminhoDoUpload: origem === 'upload' ? arquivoNome : null,
          descricaoParaGerar:
            origem === 'gerar' && descricao.trim() !== '' ? descricao.trim() : null,
        });
        if (!ri.success) for (const issue of ri.error.issues) m.push(vozDaIssue(issue));
      }
      const rt = TextoDaPeca.safeParse({
        semTexto,
        headline: semTexto || headline.trim() === '' ? null : headline.trim(),
        cta: semTexto || cta.trim() === '' ? null : cta.trim(),
      });
      if (!rt.success) for (const issue of rt.error.issues) m.push(vozDaIssue(issue));
      const rr = PedidoCriativo.shape.restricoes.safeParse(restricoes.trim());
      if (!rr.success) for (const issue of rr.error.issues) m.push(vozDaIssue(issue));
    }
    if (p === 3) {
      const r = PedidoCriativo.safeParse(montarPedido());
      if (!r.success) for (const issue of r.error.issues) m.push(vozDaIssue(issue));
    }
    return m;
  };

  const pendencias = pendenciasDoPasso(passo);

  const avancar = () => {
    if (pendencias.length > 0) {
      setMostrarPendencias(true);
      return;
    }
    setMostrarPendencias(false);
    setPasso((p) => Math.min(p + 1, PASSOS.length - 1));
  };

  const voltar = () => {
    setMostrarPendencias(false);
    setPasso((p) => Math.max(0, p - 1));
  };

  const conferirEGerar = () => {
    const r = PedidoCriativo.safeParse(montarPedido());
    if (!r.success) {
      setMostrarPendencias(true);
      return;
    }
    setPedidoConferido(r.data);
    setConfirmando(true);
  };

  /**
   * A credencial não é conferida aqui de propósito: nesta fase nada dispara,
   * então não há gasto para assinar. Quando o job real existir, quem confere é
   * o servidor (428), como nas outras frentes — o diálogo já ensaia o gesto.
   */
  const confirmar = () => {
    setConfirmando(false);
    if (pedidoConferido === null) return;
    const d = DIMENSAO_DO_FORMATO[pedidoConferido.formato];
    toast.ok(
      `Conferi o pedido: ${pedidoConferido.variacoes} variações de ${ROTULO_DO_FORMATO[pedidoConferido.formato]} (${d.largura}×${d.altura}) para "${pedidoConferido.marca}" entrariam na fila agora. Não enfileirei nada: esta tela ainda ensaia com dados falsos.`,
    );
  };

  const bordaDeChip = (ativo: boolean) => (ativo ? 'var(--color-primary)' : 'var(--color-border)');

  const corValida = CorDaPaleta.shape.hex.safeParse(corPrincipal).success;

  return (
    <div className="mx-auto max-w-[860px] px-4 py-10 sm:px-8">
      <div className="ds-slide-up flex items-center gap-3">
        <span className="ds-label" style={{ color: 'rgb(var(--acento))' }}>
          orbis criativos
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
            Uma peça para a sua marca, {TRATAMENTO}.
          </h1>
          <p
            className="mt-3 max-w-[62ch] text-[14px] leading-[1.7]"
            style={{ color: 'var(--color-fg-muted)' }}
          >
            São 4 passos, e eu confiro cada um contra o contrato antes de seguir. Nesta fase nenhum
            crédito é gasto e nenhum pedido entra na fila: estou ensaiando a experiência.
          </p>
        </div>
      </div>

      {/* A régua dos passos: número + nome, o feito ganha o check. Voltar é
          livre; avançar só pelo botão, que valida. */}
      <div className="mt-8 flex flex-wrap items-center gap-x-4 gap-y-2">
        {PASSOS.map((nome, i) => (
          <button
            key={nome}
            type="button"
            disabled={i >= passo}
            onClick={() => {
              setMostrarPendencias(false);
              setPasso(i);
            }}
            className="flex items-center gap-1.5 disabled:cursor-default"
          >
            <span
              className="ds-data text-[10px]"
              style={{ color: i === passo ? 'var(--color-ion-4)' : 'var(--color-fg-subtle)' }}
            >
              {String(i + 1).padStart(2, '0')}
            </span>
            <span
              className="ds-label"
              style={{
                color:
                  i === passo
                    ? 'var(--color-fg)'
                    : i < passo
                      ? 'var(--color-fg-muted)'
                      : 'var(--color-fg-subtle)',
              }}
            >
              {nome}
            </span>
            {i < passo && <Check size={11} style={{ color: 'var(--color-primary)' }} />}
          </button>
        ))}
        <span className="ds-hairline min-w-[40px] flex-1" aria-hidden />
      </div>

      {/* ── Passo 1: o pedido ─────────────────────────────────────────────── */}
      {passo === 0 && (
        <section className="ds-fade-in mt-6">
          <span className="ds-label">imagem ou vídeo?</span>
          <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
            {(
              [
                {
                  v: 'imagem',
                  titulo: 'Imagem',
                  explica: 'Uma arte parada: post, story, banner.',
                  Icone: IconeImagem,
                },
                {
                  v: 'video',
                  titulo: 'Vídeo',
                  explica: 'Movimento curto: reels, story em vídeo.',
                  Icone: Clapperboard,
                },
              ] as const
            ).map(({ v, titulo, explica, Icone }) => (
              <button
                key={v}
                type="button"
                onClick={() => setTipo(v)}
                aria-pressed={tipo === v}
                className="flex items-start gap-3 rounded-none border p-4 text-left transition-colors hover:border-[var(--color-signal)]"
                style={{
                  borderColor: bordaDeChip(tipo === v),
                  background: tipo === v ? 'rgb(var(--acento) / 0.06)' : 'transparent',
                }}
              >
                <span
                  className="grid h-10 w-10 shrink-0 place-items-center"
                  style={{
                    background: 'rgb(var(--acento) / 0.12)',
                    color: 'rgb(var(--acento))',
                  }}
                  aria-hidden
                >
                  <Icone size={18} strokeWidth={1.6} />
                </span>
                <span className="min-w-0">
                  <span
                    className="block text-[14px] font-medium"
                    style={{ color: 'var(--color-fg)' }}
                  >
                    {titulo}
                  </span>
                  <span
                    className="mt-0.5 block text-[12px]"
                    style={{ color: 'var(--color-fg-muted)' }}
                  >
                    {explica}
                  </span>
                </span>
              </button>
            ))}
          </div>

          <div className="mt-6">
            <span className="ds-label">objetivo da peça</span>
            <p className="mt-1 text-[12px]" style={{ color: 'var(--color-fg-subtle)' }}>
              Sem escolha, assumo "{OBJETIVO_ASSUMIDO}", e o resumo registra que fui eu.
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {OBJETIVOS_DA_PECA.map((o) => (
                <button
                  key={o}
                  type="button"
                  onClick={() => setObjetivo(objetivo === o ? null : o)}
                  aria-pressed={objetivo === o}
                  className="rounded-none border px-3 py-1.5 text-[12.5px] transition-colors hover:border-[var(--color-signal)]"
                  style={{ borderColor: bordaDeChip(objetivo === o), color: 'var(--color-fg)' }}
                >
                  {o}
                </button>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ── Passo 2: sua marca ────────────────────────────────────────────── */}
      {passo === 1 && (
        <section className="ds-fade-in mt-6">
          {projetos.isLoading ? (
            <p className="text-[13px]" style={{ color: 'var(--color-fg-muted)' }}>
              Buscando a marca que o app já conhece.
            </p>
          ) : marcaDoProjeto !== null && !editandoMarca ? (
            <div
              className="ds-glass-static rounded-none border p-4"
              style={{ borderColor: 'var(--color-border)' }}
            >
              <div className="flex items-start gap-3">
                {marcaDoProjeto.logoUrl !== null && (
                  <img
                    src={marcaDoProjeto.logoUrl}
                    alt={`Logotipo de ${marcaDoProjeto.brandName}`}
                    className="h-10 w-10 shrink-0 border object-contain"
                    style={{ borderColor: 'var(--color-border)' }}
                  />
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
                    Trouxe do projeto "{marcaDoProjeto.projetoNome}": a paleta e a tipografia vêm
                    junto.
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

              <div className="mt-4">
                <span className="ds-label">paleta · clique na cor principal da peça</span>
                <div className="mt-2 flex flex-wrap gap-2">
                  {marcaDoProjeto.amostras.map((c) => (
                    <button
                      key={`${c.nome}-${c.hex}`}
                      type="button"
                      onClick={() => setCorPrincipal(c.hex)}
                      aria-pressed={corPrincipal === c.hex}
                      aria-label={`Cor ${c.nome} (${c.hex})`}
                      title={`${c.nome} · ${c.hex}`}
                      className="h-9 w-9 rounded-none border-2 transition-transform hover:scale-105"
                      style={{
                        background: c.hex,
                        borderColor:
                          corPrincipal === c.hex ? 'var(--color-signal)' : 'var(--color-border)',
                      }}
                    />
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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
        </section>
      )}

      {/* ── Passo 3: a peça ───────────────────────────────────────────────── */}
      {passo === 2 && (
        <section className="ds-fade-in mt-6">
          <span className="ds-label">formato</span>
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
                    borderColor: bordaDeChip(formato === f),
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

          <span className="ds-label mt-6 block">{midia.rotulo}</span>
          <p className="mt-1 text-[12px]" style={{ color: 'var(--color-fg-subtle)' }}>
            {midia.regra}
          </p>
          <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => setOrigem('upload')}
              aria-pressed={origem === 'upload'}
              className="flex items-center gap-2.5 rounded-none border px-4 py-3 text-left transition-colors hover:border-[var(--color-signal)]"
              style={{ borderColor: bordaDeChip(origem === 'upload'), color: 'var(--color-fg)' }}
            >
              <Upload size={15} style={{ color: 'rgb(var(--acento))' }} />
              <span className="text-[13px] font-medium">{midia.tenho}</span>
            </button>
            <button
              type="button"
              onClick={() => setOrigem('gerar')}
              aria-pressed={origem === 'gerar'}
              className="flex items-center gap-2.5 rounded-none border px-4 py-3 text-left transition-colors hover:border-[var(--color-signal)]"
              style={{ borderColor: bordaDeChip(origem === 'gerar'), color: 'var(--color-fg)' }}
            >
              <Sparkles size={15} style={{ color: 'rgb(var(--acento))' }} />
              <span className="text-[13px] font-medium">O Orbis cria</span>
            </button>
          </div>

          {origem === 'upload' && (
            <label
              className="mt-2 flex cursor-pointer items-center gap-2.5 rounded-none border border-dashed px-4 py-3"
              style={{ borderColor: 'var(--color-border)', color: 'var(--color-fg-muted)' }}
            >
              <Upload size={14} />
              <span className="text-[12.5px]">
                {arquivoNome ?? 'Escolher o arquivo. Nesta fase ele fica só aqui na tela'}
              </span>
              <input
                type="file"
                accept={midia.aceita}
                className="hidden"
                onChange={(e) => setArquivoNome(e.target.files?.[0]?.name ?? null)}
              />
            </label>
          )}

          {origem === 'gerar' && (
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
          )}

          <span className="ds-label mt-6 block">o texto na peça</span>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setSemTexto(!semTexto)}
              aria-pressed={semTexto}
              className="rounded-none border px-3 py-1.5 text-[12.5px] transition-colors hover:border-[var(--color-signal)]"
              style={{ borderColor: bordaDeChip(semTexto), color: 'var(--color-fg)' }}
            >
              sem texto
            </button>
            <span className="text-[12px]" style={{ color: 'var(--color-fg-subtle)' }}>
              Ou o texto literal, ou "sem texto": vazio o contrato recusa.
            </span>
          </div>
          {!semTexto && (
            <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <span className="ds-label">headline, literal</span>
                <input
                  type="text"
                  value={headline}
                  onChange={(e) => setHeadline(e.target.value)}
                  placeholder="como vai aparecer, letra por letra"
                  className="mt-2 w-full rounded-none border px-3 py-2 text-[13px] outline-none focus:border-[var(--color-signal)]"
                  style={{
                    borderColor: 'var(--color-border)',
                    color: 'var(--color-fg)',
                    background: 'transparent',
                  }}
                />
              </div>
              <div>
                <span className="ds-label">cta (opcional)</span>
                <input
                  type="text"
                  value={cta}
                  onChange={(e) => setCta(e.target.value)}
                  placeholder='ex.: "Peça o seu"'
                  className="mt-2 w-full rounded-none border px-3 py-2 text-[13px] outline-none focus:border-[var(--color-signal)]"
                  style={{
                    borderColor: 'var(--color-border)',
                    color: 'var(--color-fg)',
                    background: 'transparent',
                  }}
                />
              </div>
            </div>
          )}

          <span className="ds-label mt-6 block">o que não pode aparecer (opcional)</span>
          <textarea
            value={restricoes}
            onChange={(e) => setRestricoes(e.target.value)}
            rows={2}
            placeholder="ex.: concorrentes, bebida alcoólica, a fachada antiga"
            className="mt-2 w-full rounded-none border px-3 py-2 text-[13px] outline-none focus:border-[var(--color-signal)]"
            style={{
              borderColor: 'var(--color-border)',
              color: 'var(--color-fg)',
              background: 'transparent',
            }}
          />
        </section>
      )}

      {/* ── Passo 4: conferir ─────────────────────────────────────────────── */}
      {passo === 3 && (
        <section className="ds-fade-in mt-6">
          <span className="ds-label">o que eu entendi</span>
          <dl
            className="ds-glass-static mt-3 rounded-none border"
            style={{ borderColor: 'var(--color-border)' }}
          >
            {(
              [
                ['peça', tipo === 'video' ? 'vídeo' : 'imagem'],
                ['objetivo', objetivo ?? `${OBJETIVO_ASSUMIDO} (assumi, porque ficou sem escolha)`],
                ['marca', marcaNome.trim()],
                [
                  'formato',
                  formato !== null
                    ? `${ROTULO_DO_FORMATO[formato]} · ${DIMENSAO_DO_FORMATO[formato].largura}×${DIMENSAO_DO_FORMATO[formato].altura}`
                    : 'sem escolha',
                ],
                [
                  'imagem',
                  origem === 'upload'
                    ? `${midia.enviada} (${arquivoNome ?? 'sem arquivo'}): eu não gero por cima de material real`
                    : 'eu crio, a partir da descrição',
                ],
                [
                  'texto',
                  semTexto
                    ? 'sem texto, por decisão'
                    : `"${headline.trim()}"${cta.trim() !== '' ? ` · botão "${cta.trim()}"` : ''}`,
                ],
                [
                  'não pode aparecer',
                  restricoes.trim() === '' ? 'nada declarado' : restricoes.trim(),
                ],
                ['variações', `${VARIACOES_PADRAO} (o padrão do contrato)`],
                [
                  'paleta e tipografia',
                  marcaDoProjeto !== null && !editandoMarca
                    ? `herdadas do projeto "${marcaDoProjeto.projetoNome}"; cor principal ${corPrincipal}`
                    : `cor principal ${corValida ? corPrincipal : 'sem escolha'}; tipografia segura do sistema`,
                ],
                ['claims', 'nenhum autorizado: a peça não afirma preço, desconto, prazo nem frete'],
              ] as Array<[string, string]>
            ).map(([k, v]) => (
              <div
                key={k}
                className="flex gap-3 border-b px-4 py-2.5 last:border-b-0"
                style={{ borderColor: 'var(--color-border)' }}
              >
                <dt className="ds-label w-[150px] shrink-0 pt-0.5">{k}</dt>
                <dd className="min-w-0 flex-1 text-[13px]" style={{ color: 'var(--color-fg)' }}>
                  {v}
                </dd>
              </div>
            ))}
          </dl>

          <div
            className="mt-4 flex flex-wrap items-center gap-3 rounded-none border p-4"
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
                Número de ensaio: o valor real sai do simulate_cost quando o motor entrar. Esta tela
                não cobra nada.
              </p>
            </div>
            <span
              className="ds-tag rounded-none border px-2 py-0.5 text-[10px]"
              style={{ borderColor: 'rgb(var(--acento) / 0.5)', color: 'rgb(var(--acento))' }}
            >
              estimativa
            </span>
          </div>
        </section>
      )}

      {mostrarPendencias && pendencias.length > 0 && (
        <div
          role="alert"
          className="mt-4 rounded-none border px-4 py-3"
          style={{ borderColor: 'var(--color-danger)' }}
        >
          {pendencias.map((p) => (
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

      <div className="mt-8 flex items-center gap-3">
        {passo > 0 && (
          <button
            type="button"
            onClick={voltar}
            className="inline-flex items-center gap-2 px-3 py-2 text-[13px]"
            style={{ color: 'var(--color-fg-muted)' }}
          >
            <ArrowLeft size={13} />
            Voltar
          </button>
        )}
        {passo < PASSOS.length - 1 ? (
          <button
            type="button"
            onClick={avancar}
            className="ds-btn inline-flex items-center gap-2 rounded-none px-5 py-2.5 text-[13px] font-medium"
            style={{ backgroundColor: 'var(--color-primary)', color: 'var(--color-bone-1)' }}
          >
            Avançar
            <ArrowRight size={13} />
          </button>
        ) : (
          <div>
            <button
              type="button"
              onClick={conferirEGerar}
              className="ds-btn ds-glow inline-flex items-center gap-2 rounded-none px-6 py-3 text-[14px] font-medium"
              style={{ backgroundColor: 'var(--color-primary)', color: 'var(--color-bone-1)' }}
            >
              <Sparkles size={14} />
              Conferir e gerar
            </button>
            <p className="mt-2 text-[12px]" style={{ color: 'var(--color-fg-subtle)' }}>
              Este botão pede a credencial de ação. Nesta fase da construção, nada entra na fila: eu
              só mostro o aviso do que aconteceria.
            </p>
          </div>
        )}
      </div>

      <ConfirmarAcaoCara
        aberto={confirmando}
        oQueVaiFazer={
          pedidoConferido !== null
            ? `Produzir ${pedidoConferido.variacoes} variações de ${ROTULO_DO_FORMATO[pedidoConferido.formato]} para "${pedidoConferido.marca}". Estimativa de ensaio: ${custoEstimado} créditos.`
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
