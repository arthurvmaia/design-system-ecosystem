import { Mascote } from '@/components/Mascote';
import { Modal } from '@/components/Modal';
import { PreviewFrame } from '@/components/PreviewFrame';
import { Select } from '@/components/seletores';
import {
  type KitComponentRef,
  type KitContratoResumo,
  type MediaItem,
  api,
  previewComponentUrl,
} from '@/lib/api';
import { ehVideoEscolhido, medirProporcao } from '@/lib/arquivo-escolhido';
import { soltarSecaoSobre } from '@/lib/arrastar-secao';
import { avaliarMidia, oQueCabe } from '@/lib/cabe-na-secao';
import {
  CORPO_NA_PREVIA,
  type EstiloDoEsqueleto,
  type FormaDaSecao,
  type LeituraDoEstilo,
  type TracoDoEsqueleto,
  escalaDoNome,
  estiloDoEsqueleto,
  formaDoPapel,
  formaEscreveONome,
  raioNaPrevia,
} from '@/lib/esqueleto-da-secao';
import {
  type FundoEmUso,
  MOTIVO_DO_PAPEL,
  type PecaDoKit,
  adicionarFundo,
  agruparPecasParaSecao,
  ehFundo,
  fundosDisponiveis,
  moverSecaoVisivel,
  papeisObrigatoriosFaltantes,
  papelEfetivoDaSecao,
  resumirSugestao,
  selinhoDaPeca,
  separarFundos,
  tirarFundo,
} from '@/lib/estrutura-checagens';
import { ORBIS } from '@/lib/orbis';
import { toast } from '@/lib/toast';
import {
  EXPLICA_AIDA,
  type EspacosDaPeca,
  type EtapaAida,
  type ObjetivoDoSite,
  ROTULO_AIDA,
  ROTULO_DE_PAPEL,
  type SecaoDoSite,
  type SecaoResolvida,
  SectionRole,
  adicionarSecao,
  explicarPapel,
  removerSecao,
  resolverSecoes,
  sugerirMidiaDaSecao,
  sugerirSecoes,
} from '@ds/shared/schemas';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  ChevronDown,
  ChevronUp,
  GripVertical,
  Layers,
  Plus,
  RotateCcw,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { type CSSProperties, useEffect, useRef, useState } from 'react';
import { INPUT, inputStyle, mediaUrl, rotulo } from '../partes';

const AUTOMATICO = '__automatico__';

/**
 * "Monte a sua estrutura" — agora um editor visual, no espírito do editor de
 * temas da Shopify.
 *
 * A versão anterior era uma lista de texto: nome, nome da peça em fonte mono,
 * "1 peça". Quem não decorou o kit não sabia QUAL componente era cada um, e
 * nada dizia onde cada peça funciona melhor. Aqui cada linha carrega a
 * miniatura real da primeira peça e a frase do que a seção faz; à direita, as
 * miniaturas empilhadas na ordem viram uma prévia da página inteira, sem gerar
 * nada. A troca de peça é por grade de miniaturas, não por lista de nomes.
 *
 * Três coisas que a tela apresenta diferente SEM mudar o modelo de dados:
 * peça de fundo sai da lista e ganha o bloco "Fundo da página" (por baixo ela
 * continua numa seção de `layout.secoes`); papéis obrigatórios que faltam
 * viram um aviso com a permissão `criarSecoesFaltantes`; e seção sem peça
 * segue sendo decisão legítima, mostrada como bloco pontilhado na prévia.
 *
 * Cada linha carrega duas orientações da etapa de marketing, com hierarquia
 * fixa: a frase `faz` diz o que a seção FAZ na página (sempre visível), e a
 * `sugestao` é a observação do Orbis sobre que TIPO de peça encaixar ali —
 * escrita sem olhar o kit, mostrada enquanto a seção está vazia, que é quando
 * a pessoa ainda não sabe o que procurar. O chip AIDA ao lado do papel situa
 * a seção no argumento (Atenção → Interesse → Desejo → Ação).
 */
export function StepEstrutura({
  secoes,
  onSecoes,
  components,
  objetivo,
  espacos,
  criarSecoesFaltantes,
  onCriarSecoesFaltantes,
  projectId,
  kitId = null,
  media,
  onMedia,
}: {
  secoes: SecaoDoSite[];
  onSecoes: (s: SecaoDoSite[]) => void;
  components: KitComponentRef[];
  /**
   * O kit do projeto. É o que abre as duas fontes que esta etapa passou a
   * consultar: o design system consolidado (as cores e as fontes que desenham a
   * seção sem peça) e os contratos das peças (o que cada seção aceita de mídia).
   *
   * Opcional porque a etapa continua inteira sem ele: sem kit o esqueleto vira
   * contorno com o motivo escrito, e o inspetor só deixa de saber recusar mídia
   * que não cabe. Nenhum dos dois esconde a falta.
   */
  kitId?: string | null;
  /** Decide qual sequência de marketing explica cada seção. */
  objetivo: ObjetivoDoSite | null;
  /** Os espaços REAIS de imagem de cada peça, do contrato do kit. */
  espacos: readonly EspacosDaPeca[];
  /**
   * A mídia do projeto, para o inspetor mostrar e receber a da seção aberta.
   *
   * O upload passa a acontecer olhando para a seção que vai receber o arquivo,
   * que é a diferença entre escolher uma imagem e escolher uma imagem PARA
   * ALGO. A etapa Mídia continua existindo para as mídias gerais e os produtos.
   */
  projectId: string | null;
  media: MediaItem[];
  onMedia: (m: MediaItem[]) => void;
  /**
   * A permissão `layout.permissoes.criarSecoesFaltantes`, como boolean solto:
   * o Wizard guarda cada permissão do mesmo jeito (é o desenho que a arte de
   * apoio da etapa Mídia já usa), e remonta o objeto na hora de salvar.
   */
  criarSecoesFaltantes: boolean;
  onCriarSecoesFaltantes: (v: boolean) => void;
}) {
  const [aberta, setAberta] = useState<string | null>(null);
  // A seção para a qual a grade de peças está aberta.
  const [escolhendoPara, setEscolhendoPara] = useState<string | null>(null);
  // Qual seção está na mão e sobre qual ela paira. Só o arrasto usa isto; as
  // setas continuam mexendo na lista direto.
  const [arrastando, setArrastando] = useState<string | null>(null);
  const [sobre, setSobre] = useState<string | null>(null);

  // As duas leituras do kit. Mesma chave de cache que a fórmula e a etapa Mídia
  // usam, então abrir o wizard depois de ver a fórmula não refaz pedido nenhum.
  const designSystem = useQuery({
    queryKey: ['kit-design-system', kitId],
    queryFn: () => {
      if (kitId === null) throw new Error('sem kit');
      return api.getKitDesignSystem(kitId);
    },
    enabled: kitId !== null,
  });
  const contratos = useQuery({
    queryKey: ['kit-contratos', kitId],
    queryFn: () => {
      if (kitId === null) throw new Error('sem kit');
      return api.getKitContratos(kitId);
    },
    enabled: kitId !== null,
  });

  // Enquanto o pedido está no ar não há motivo para dizer "não consolidei":
  // seria uma afirmação sobre o kit feita antes de ler o kit. O contorno fica
  // calado até a resposta chegar. (Consulta desligada também conta como pendente
  // no react-query, daí o `kitId` na conta.)
  const estilo: LeituraDoEstilo =
    kitId !== null && designSystem.isPending
      ? { ok: false, porque: '' }
      : estiloDoEsqueleto(designSystem.data?.item ?? null);

  const { secoes: resolvidas, avisos } = resolverSecoes(secoes, components);
  const porId = new Map(resolvidas.map((r) => [r.id, r]));

  // Apresentação: seções que aparecem na lista x fundos com bloco próprio.
  const { visiveis, fundos } = separarFundos(secoes, components);
  const fundosLivres = fundosDisponiveis(components, fundos);
  const faltantes = papeisObrigatoriosFaltantes(secoes, components);

  const doKit = visiveis.filter((s) => (porId.get(s.id)?.pecas.length ?? 0) > 0).length;
  const criadas = visiveis.length - doKit;

  const emUso = new Set(secoes.flatMap((s) => s.componentIds));
  // Fundo sobrando não entra aqui: ele tem oferta própria no bloco de fundo.
  const sobrando = components.filter((c) => !emUso.has(c.id) && !ehFundo(c));

  const mudar = (id: string, patch: Partial<SecaoDoSite>): void => {
    onSecoes(secoes.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  };

  const adicionarPeca = (id: string, componentId: string): void => {
    const s = secoes.find((x) => x.id === id);
    if (s === undefined) return;
    mudar(id, { componentIds: [...s.componentIds, componentId] });
  };

  const tirarPeca = (id: string, indice: number): void => {
    const s = secoes.find((x) => x.id === id);
    if (s === undefined) return;
    mudar(id, { componentIds: s.componentIds.filter((_, i) => i !== indice) });
  };

  const moverPeca = (id: string, indice: number, passo: -1 | 1): void => {
    const s = secoes.find((x) => x.id === id);
    if (s === undefined) return;
    const destino = indice + passo;
    if (destino < 0 || destino >= s.componentIds.length) return;
    const lista = [...s.componentIds];
    const [peca] = lista.splice(indice, 1);
    if (peca !== undefined) lista.splice(destino, 0, peca);
    mudar(id, { componentIds: lista });
  };

  const novaSecao = (): void => {
    const lista = adicionarSecao(secoes);
    onSecoes(lista);
    setAberta(lista[lista.length - 1]?.id ?? null);
  };

  const secaoEscolhendo = escolhendoPara === null ? null : (porId.get(escolhendoPara) ?? null);

  return (
    // TRÊS PAINÉIS, no modelo do editor de tema da Shopify: a árvore que a
    // pessoa monta, a prévia real no meio, e o inspetor da seção escolhida.
    //
    // O que faltava era o terceiro. Os controles de uma seção — qual peça, o
    // texto, a mídia — estavam espalhados por etapas diferentes do wizard, e
    // decidir sobre uma seção obrigava a andar entre telas. Aqui eles ficam ao
    // lado dela, e o upload passa a acontecer olhando para a seção que vai
    // receber o arquivo.
    //
    // Em tela estreita o inspetor some e a lista continua sendo tudo: ela já
    // expande cada seção com os mesmos controles.
    <div className="gap-6 md:grid md:grid-cols-[minmax(0,1fr)_260px] md:items-start xl:grid-cols-[minmax(0,1fr)_260px_300px]">
      <div className="space-y-5">
        <div>
          <div className="mb-1 flex items-baseline justify-between gap-3">
            <div className="text-[11px] uppercase tracking-[0.2em]" style={rotulo}>
              As seções do seu site
            </div>
            <output className="text-[12px]" style={{ color: 'var(--color-fg-subtle)' }}>
              {visiveis.length} {visiveis.length === 1 ? 'seção' : 'seções'} · {doKit} do seu kit ·{' '}
              {criadas} {criadas === 1 ? 'criada' : 'criadas'} no estilo
            </output>
          </div>
          <p className="text-[13px] leading-relaxed" style={{ color: 'var(--color-fg-muted)' }}>
            Você monta a página: adiciona seções, arrasta pela alça para mudar a ordem (ou usa as
            setas) e escolhe as peças vendo cada uma. A prévia ao lado empilha as seções na ordem em
            que o site vai sair. Seção sem peça é criada no estilo do kit, e onde você não escrever
            o texto, eu escrevo no tom da sua marca.
          </p>
        </div>

        {avisos.length > 0 && (
          <div
            className="rounded-lg border px-3.5 py-3 text-[13px]"
            style={{ borderColor: 'var(--color-border)', color: 'var(--color-fg-muted)' }}
          >
            {avisos.map((a) => (
              <div key={a}>{a}</div>
            ))}
          </div>
        )}

        {faltantes.length > 0 && (
          <AvisoObrigatorias
            faltantes={faltantes}
            autorizado={criarSecoesFaltantes}
            aoAutorizar={onCriarSecoesFaltantes}
          />
        )}

        <div className="space-y-1.5">
          {visiveis.map((s, i) => (
            <LinhaDaSecao
              key={s.id}
              secao={s}
              resolvida={porId.get(s.id)}
              expandida={aberta === s.id}
              primeira={i === 0}
              ultima={i === visiveis.length - 1}
              objetivo={objetivo}
              components={components}
              espacos={espacos}
              onExpandir={() => setAberta(aberta === s.id ? null : s.id)}
              onMover={(direcao) => onSecoes(moverSecaoVisivel(secoes, components, s.id, direcao))}
              onRemover={() => onSecoes(removerSecao(secoes, s.id))}
              onMudar={(patch) => mudar(s.id, patch)}
              onEscolherPeca={() => setEscolhendoPara(s.id)}
              onTirarPeca={(j) => tirarPeca(s.id, j)}
              onMoverPeca={(j, passo) => moverPeca(s.id, j, passo)}
              naMao={arrastando === s.id}
              alvoDoArrasto={arrastando !== null && arrastando !== s.id && sobre === s.id}
              recebeArrasto={arrastando !== null && arrastando !== s.id}
              onPegar={() => setArrastando(s.id)}
              onLargar={() => {
                setArrastando(null);
                setSobre(null);
              }}
              // `dragleave` de uma linha chega DEPOIS do `dragenter` da vizinha
              // quando o ponteiro passa direto de uma para a outra. Sem comparar
              // com o id, a saída da primeira apagaria o realce que a segunda
              // acabou de acender.
              onPairar={(dentro) =>
                setSobre((atual) => (dentro ? s.id : atual === s.id ? null : atual))
              }
              onSoltar={() => {
                if (arrastando !== null && arrastando !== s.id) {
                  onSecoes(soltarSecaoSobre(secoes, components, arrastando, s.id));
                }
                setArrastando(null);
                setSobre(null);
              }}
            />
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={novaSecao}
            className="ds-btn ds-glow-border ds-backdrop flex items-center gap-1.5 rounded-none px-3.5 py-1.5 text-[12px]"
            style={{ backgroundColor: 'rgba(255,255,255,0.04)', color: 'var(--color-fg)' }}
          >
            <Plus size={12} />
            Adicionar seção
          </button>
          <button
            type="button"
            onClick={() => onSecoes(sugerirSecoes(components, undefined, objetivo))}
            className="flex items-center gap-1.5 text-[12px] underline"
            style={{ color: 'var(--color-fg-muted)' }}
          >
            <RotateCcw size={11} />
            Voltar para a sugestão do app
          </button>
        </div>

        {(fundos.length > 0 || fundosLivres.length > 0) && (
          <BlocoDeFundo
            fundos={fundos}
            livres={fundosLivres}
            aoUsar={(id) => onSecoes(adicionarFundo(secoes, id))}
            aoTirar={(secaoId, pecaId) => onSecoes(tirarFundo(secoes, components, secaoId, pecaId))}
          />
        )}

        {sobrando.length > 0 && (
          <div>
            <div className="mb-1.5 text-[11px] uppercase tracking-[0.2em]" style={rotulo}>
              Peças do kit ainda sem seção
            </div>
            <div className="flex flex-wrap gap-1.5">
              {sobrando.map((c) => (
                <span
                  key={c.id}
                  className="rounded-none border px-2.5 py-1 text-[12px]"
                  style={{ borderColor: 'var(--color-border)', color: 'var(--color-fg-muted)' }}
                >
                  {c.name}
                </span>
              ))}
            </div>
            <p className="mt-1.5 text-[12px]" style={{ color: 'var(--color-fg-subtle)' }}>
              Nenhuma delas vai aparecer no site. Adicione onde fizer sentido, ou deixe de fora.
            </p>
          </div>
        )}
      </div>

      <PreviaEmpilhada
        secoes={visiveis
          .map((s) => porId.get(s.id))
          .filter((r): r is SecaoResolvida => r !== undefined)}
        fundos={fundos}
        ativa={aberta}
        objetivo={objetivo}
        estilo={estilo}
        aoAbrir={(id) => setAberta(id)}
      />

      <Inspetor
        secao={aberta === null ? null : (secoes.find((s) => s.id === aberta) ?? null)}
        resolvida={aberta === null ? null : (porId.get(aberta) ?? null)}
        objetivo={objetivo}
        projectId={projectId}
        contratos={contratos.data?.items ?? []}
        media={media}
        onMedia={onMedia}
        onMudar={(patch) => aberta !== null && mudar(aberta, patch)}
        onEscolherPeca={() => aberta !== null && setEscolhendoPara(aberta)}
        onTirarPeca={(j) => aberta !== null && tirarPeca(aberta, j)}
      />

      {escolhendoPara !== null && (
        <ModalDePecas
          nomeDaSecao={secaoEscolhendo?.nome ?? ''}
          papel={(() => {
            const s = secoes.find((x) => x.id === escolhendoPara);
            return s === undefined ? undefined : papelEfetivoDaSecao(s, components);
          })()}
          objetivo={objetivo}
          components={components}
          aoEscolher={(id) => {
            adicionarPeca(escolhendoPara, id);
            setEscolhendoPara(null);
          }}
          aoFechar={() => setEscolhendoPara(null)}
        />
      )}
    </div>
  );
}

// ── Uma linha da lista ──────────────────────────────────────────────────────

function LinhaDaSecao({
  secao: s,
  resolvida: r,
  expandida,
  primeira,
  ultima,
  objetivo,
  components,
  espacos,
  onExpandir,
  onMover,
  onRemover,
  onMudar,
  onEscolherPeca,
  onTirarPeca,
  onMoverPeca,
  naMao,
  alvoDoArrasto,
  recebeArrasto,
  onPegar,
  onLargar,
  onPairar,
  onSoltar,
}: {
  secao: SecaoDoSite;
  resolvida: SecaoResolvida | undefined;
  expandida: boolean;
  primeira: boolean;
  ultima: boolean;
  objetivo: ObjetivoDoSite | null;
  components: KitComponentRef[];
  espacos: readonly EspacosDaPeca[];
  onExpandir: () => void;
  onMover: (direcao: 'cima' | 'baixo') => void;
  onRemover: () => void;
  onMudar: (patch: Partial<SecaoDoSite>) => void;
  onEscolherPeca: () => void;
  onTirarPeca: (indice: number) => void;
  onMoverPeca: (indice: number, passo: -1 | 1) => void;
  /** Esta é a linha que está sendo arrastada. */
  naMao: boolean;
  /** O ponteiro está sobre esta linha carregando outra. */
  alvoDoArrasto: boolean;
  /** Há um arrasto em curso e esta linha pode recebê-lo. */
  recebeArrasto: boolean;
  onPegar: () => void;
  onLargar: () => void;
  onPairar: (dentro: boolean) => void;
  onSoltar: () => void;
}) {
  // A moldura da linha vira a IMAGEM do arrasto. Sem isto o Chrome arrasta só o
  // ícone da alça, e a pessoa não vê o que está carregando.
  const moldura = useRef<HTMLDivElement>(null);
  const pecas = r?.pecas ?? [];
  const capa = pecas[0];
  const papel = papelEfetivoDaSecao(s, components);
  // A frase do papel fica VISÍVEL na linha, sem expandir: é o que responde
  // "para que serve esta seção" para quem não conhece o vocabulário.
  const etapa = papel !== undefined ? explicarPapel(papel, objetivo) : undefined;
  const frase =
    etapa !== undefined
      ? `Esta seção ${etapa.faz}.`
      : 'Seção livre. O texto dela me diz o que mostrar.';
  // A observação do Orbis (que tipo de peça encaixar) só aparece enquanto a
  // seção está vazia: é orientação de ANTES da escolha. Com peça dentro, ela
  // viraria o app questionando uma decisão que a pessoa já tomou.
  const observacao =
    etapa !== undefined && pecas.length === 0 ? `Eu poria aqui ${etapa.sugestao}.` : undefined;

  return (
    <div
      ref={moldura}
      // A linha inteira recebe o arrasto, mas só a alça o INICIA: com
      // `draggable` na moldura, selecionar o texto do campo de instrução (que
      // fica dentro dela quando expandida) viraria um arrasto pela metade.
      onDragOver={(e) => {
        if (!recebeArrasto) return;
        // Sem o `preventDefault` o navegador recusa a soltura e o `drop` nunca
        // chega. É a linha que faz o HTML5 drag-and-drop funcionar.
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        onPairar(true);
      }}
      onDragLeave={(e) => {
        // `dragleave` também dispara quando o ponteiro passa da linha para um
        // filho dela, e o alvo continua sendo a mesma linha. Sem esta guarda o
        // realce piscaria a cada elemento atravessado por dentro do mesmo alvo.
        if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
        onPairar(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        onSoltar();
      }}
      className="rounded-lg border transition-colors"
      style={{
        borderColor: alvoDoArrasto
          ? 'var(--color-ion-3)'
          : expandida
            ? 'var(--color-signal)'
            : 'var(--color-border)',
        backgroundColor: alvoDoArrasto ? 'rgba(34,211,238,0.1)' : 'rgba(255,255,255,0.02)',
        // A linha na mão fica apagada: é o que diz "esta saiu do lugar" sem
        // precisar desenhar um espaço vazio na lista.
        opacity: naMao ? 0.4 : 1,
      }}
    >
      <div className="flex items-center gap-1 px-2 py-2">
        {/* A alça é redundante DE PROPÓSITO: quem usa teclado reordena pelas
            setas abaixo, que continuam sendo o caminho completo. Por isso ela
            sai da ordem de foco e do leitor de tela em vez de virar um segundo
            controle que faz a mesma coisa e confunde. */}
        <span
          draggable
          aria-hidden
          title="Arraste para mudar a ordem"
          onDragStart={(e) => {
            e.dataTransfer.effectAllowed = 'move';
            // O Firefox só inicia o arrasto se o evento carregar algum dado.
            e.dataTransfer.setData('text/plain', s.id);
            if (moldura.current !== null) e.dataTransfer.setDragImage(moldura.current, 16, 16);
            onPegar();
          }}
          onDragEnd={onLargar}
          className="shrink-0 cursor-grab rounded p-0.5 transition-colors hover:bg-white/[0.06] active:cursor-grabbing"
          style={{ color: 'var(--color-fg-subtle)' }}
        >
          <GripVertical size={13} />
        </span>
        <div className="flex flex-col">
          <button
            type="button"
            onClick={() => onMover('cima')}
            disabled={primeira}
            aria-label={`Mover ${s.nome || 'esta seção'} para cima`}
            className="rounded p-0.5 transition-colors hover:bg-white/[0.06] disabled:opacity-20"
            style={{ color: 'var(--color-fg-muted)' }}
          >
            <ChevronUp size={13} />
          </button>
          <button
            type="button"
            onClick={() => onMover('baixo')}
            disabled={ultima}
            aria-label={`Mover ${s.nome || 'esta seção'} para baixo`}
            className="rounded p-0.5 transition-colors hover:bg-white/[0.06] disabled:opacity-20"
            style={{ color: 'var(--color-fg-muted)' }}
          >
            <ChevronDown size={13} />
          </button>
        </div>

        <button
          type="button"
          onClick={onExpandir}
          aria-expanded={expandida}
          className="flex min-w-0 flex-1 items-center gap-3 rounded px-1.5 py-1 text-left transition-colors hover:bg-white/[0.03]"
        >
          {/* A miniatura REAL da primeira peça. É o que resolve "qual componente
              é este?" sem abrir nada; seção sem peça mostra o pontilhado. */}
          <div
            className="h-[44px] w-[72px] shrink-0 overflow-hidden rounded-md border"
            style={{ borderColor: 'var(--color-border)' }}
          >
            {capa !== undefined ? (
              <PreviewFrame src={previewComponentUrl(capa.id)} title={capa.name} aspect={72 / 44} />
            ) : (
              <div
                className="flex h-full w-full items-center justify-center rounded-md border border-dashed text-[8px] uppercase tracking-[0.1em]"
                style={{ borderColor: 'rgba(255,255,255,0.14)', color: 'var(--color-fg-subtle)' }}
              >
                estilo
              </div>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline gap-2">
              <span
                className="truncate text-[15px] font-medium"
                style={{
                  color: s.nome.trim() === '' ? 'var(--color-ion-3)' : 'var(--color-fg)',
                }}
              >
                {s.nome.trim() === '' ? 'sem nome' : s.nome}
              </span>
              {papel !== undefined && (
                <span
                  className="ds-data shrink-0 text-[11px] uppercase tracking-[0.08em]"
                  style={{ color: 'var(--color-ion-3)' }}
                >
                  {ROTULO_DE_PAPEL[papel]}
                </span>
              )}
              {etapa !== undefined && <ChipAida momento={etapa.aida} />}
              <span
                className="ml-auto shrink-0 text-[11px] uppercase tracking-[0.08em]"
                style={{
                  color: pecas.length > 0 ? 'var(--color-fg-muted)' : 'var(--color-fg-subtle)',
                }}
              >
                {pecas.length > 0
                  ? `${pecas.length} ${pecas.length === 1 ? 'peça' : 'peças'}`
                  : 'no estilo'}
              </span>
            </div>
            <div
              className="mt-0.5 line-clamp-2 text-[13px] leading-snug"
              style={{ color: 'var(--color-fg-muted)' }}
            >
              {frase}
            </div>
            {observacao !== undefined && (
              <div
                className="mt-0.5 line-clamp-2 text-[12px] italic leading-snug"
                style={{ color: 'var(--color-ion-3)' }}
              >
                {observacao}
              </div>
            )}
          </div>
        </button>

        <button
          type="button"
          onClick={onRemover}
          aria-label={`Remover a seção ${s.nome || 'sem nome'}`}
          className="rounded p-1.5 transition-all hover:scale-110 hover:bg-[rgba(239,68,68,0.16)]"
          style={{ color: 'var(--color-ion-3)' }}
        >
          <Trash2 size={13} />
        </button>
      </div>

      {expandida && (
        <div
          className="space-y-3.5 border-t px-3.5 py-3.5"
          style={{ borderColor: 'var(--color-border)' }}
        >
          {/* O que a seção pede de imagem. A frase do papel já mora na linha;
              aqui fica só o que a etapa de Mídia vai cobrar, para os dois
              números serem o mesmo. */}
          {(() => {
            const midia = sugerirMidiaDaSecao(s, espacos, objetivo);
            if (midia.fonte === 'nenhuma') return null;
            return (
              <div
                className="flex flex-wrap items-baseline gap-x-2 rounded-lg border px-3 py-2.5 text-[13px] leading-relaxed"
                style={{ borderColor: 'var(--color-border)' }}
              >
                <span className="ds-data" style={{ color: 'var(--color-ion-3)' }}>
                  {midia.quantas === 0
                    ? 'sem imagem'
                    : `${midia.quantas} ${midia.quantas === 1 ? 'imagem' : 'imagens'}`}
                </span>
                <span style={{ color: 'var(--color-fg-subtle)' }}>{midia.porque}</span>
              </div>
            );
          })()}

          <label className="block">
            <span className="mb-1.5 block text-[12px] uppercase tracking-[0.16em]" style={rotulo}>
              Nome da seção
            </span>
            <input
              type="text"
              value={s.nome}
              onChange={(e) => onMudar({ nome: e.target.value })}
              placeholder="ex.: Abertura, Nossos planos, O que dizem de nós"
              className={INPUT}
              style={inputStyle}
            />
          </label>

          <div>
            <span className="mb-1.5 block text-[12px] uppercase tracking-[0.16em]" style={rotulo}>
              Peças desta seção
            </span>
            {pecas.length > 0 && (
              <div className="mb-2 space-y-1.5">
                {pecas.map((p, j) => (
                  <div
                    key={`${p.id}-${j}`}
                    className="ds-glass-static flex items-center gap-2.5 rounded-lg p-1.5"
                  >
                    <div className="h-[36px] w-[60px] shrink-0 overflow-hidden rounded">
                      <PreviewFrame
                        src={previewComponentUrl(p.id)}
                        title={p.name}
                        aspect={60 / 36}
                      />
                    </div>
                    <span
                      className="min-w-0 flex-1 truncate text-[13px]"
                      style={{ color: 'var(--color-fg)' }}
                    >
                      {p.name}
                    </span>
                    {pecas.length > 1 && (
                      <>
                        <button
                          type="button"
                          onClick={() => onMoverPeca(j, -1)}
                          disabled={j === 0}
                          aria-label={`Mover ${p.name} para antes`}
                          className="rounded p-0.5 hover:bg-white/[0.08] disabled:opacity-20"
                          style={{ color: 'var(--color-fg-subtle)' }}
                        >
                          <ChevronUp size={11} />
                        </button>
                        <button
                          type="button"
                          onClick={() => onMoverPeca(j, 1)}
                          disabled={j === pecas.length - 1}
                          aria-label={`Mover ${p.name} para depois`}
                          className="rounded p-0.5 hover:bg-white/[0.08] disabled:opacity-20"
                          style={{ color: 'var(--color-fg-subtle)' }}
                        >
                          <ChevronDown size={11} />
                        </button>
                      </>
                    )}
                    <button
                      type="button"
                      onClick={() => onTirarPeca(j)}
                      aria-label={`Tirar ${p.name} desta seção`}
                      className="rounded-none p-1 hover:bg-[rgba(239,68,68,0.2)]"
                      style={{ color: 'var(--color-fg-muted)' }}
                    >
                      <X size={11} />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <button
              type="button"
              onClick={onEscolherPeca}
              className="ds-glow-border flex items-center gap-1.5 rounded-none border px-3.5 py-1.5 text-[12px]"
              style={{ borderColor: 'var(--color-border)', color: 'var(--color-fg)' }}
            >
              <Plus size={12} />
              {pecas.length > 0 ? 'Adicionar outra peça' : 'Escolher uma peça do kit'}
            </button>
            <p className="mt-1.5 text-[13px]" style={{ color: 'var(--color-fg-subtle)' }}>
              Sem nenhuma peça, esta seção é criada do zero no estilo do kit.
            </p>
          </div>

          <label className="block">
            <span className="mb-1.5 block text-[12px] uppercase tracking-[0.16em]" style={rotulo}>
              O que esta seção deve dizer? (opcional)
            </span>
            <textarea
              value={s.instrucao ?? ''}
              onChange={(e) => onMudar({ instrucao: e.target.value })}
              rows={3}
              placeholder="ex.: fale do atendimento pelo WhatsApp e não mencione preço"
              className={`${INPUT} resize-y leading-relaxed`}
              style={inputStyle}
            />
            <span className="mt-1.5 block text-[13px]" style={{ color: 'var(--color-fg-subtle)' }}>
              Deixe vazio e eu escrevo no tom da sua marca, sem inventar fato, número ou cliente.
            </span>
          </label>

          <div>
            <span className="mb-1.5 block text-[12px] uppercase tracking-[0.16em]" style={rotulo}>
              Tipo de seção (opcional)
            </span>
            <Select
              opcoes={[
                { valor: AUTOMATICO, rotulo: 'Automático, pela peça escolhida' },
                ...SectionRole.options.map((p) => ({ valor: p, rotulo: ROTULO_DE_PAPEL[p] })),
              ]}
              valor={s.papel ?? AUTOMATICO}
              rotulo={`Tipo da seção ${s.nome || 'sem nome'}`}
              aoMudar={(v) =>
                onMudar({ papel: v === AUTOMATICO ? undefined : SectionRole.parse(v) })
              }
            />
            <p className="mt-1.5 text-[13px]" style={{ color: 'var(--color-fg-subtle)' }}>
              Só muda quais peças aparecem sugeridas aqui e como a seção se comporta no celular.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

// ── O momento AIDA ──────────────────────────────────────────────────────────

/**
 * A cor de cada momento, nas vars do tema. O caminho é o do funil: os dois
 * primeiros momentos ficam no ciano da marca (a página ainda se apresenta),
 * o desejo esquenta no âmbar e a ação fecha no verde de "pode ir". Dose
 * baixa de propósito: o chip situa a seção no argumento, não compete com o
 * conteúdo dela.
 */
const COR_DA_AIDA: Record<EtapaAida, string> = {
  atencao: 'var(--color-ion-4)',
  interesse: 'var(--color-ion-3)',
  desejo: 'var(--color-warn)',
  acao: 'var(--color-ok)',
};

/** O momento AIDA da seção; o `title` explica o que ele tenta fazer. */
function ChipAida({ momento }: { momento: EtapaAida }) {
  const cor = COR_DA_AIDA[momento];
  return (
    <span
      className="ds-data shrink-0 rounded-none border px-1.5 py-px text-[10px] uppercase tracking-[0.08em]"
      title={EXPLICA_AIDA[momento]}
      style={{
        color: cor,
        // `color-mix` porque as vars são hex: é o jeito de dosar a MESMA cor
        // em borda e fundo sem duplicar valores fora do tema.
        borderColor: `color-mix(in srgb, ${cor} 35%, transparent)`,
        backgroundColor: `color-mix(in srgb, ${cor} 8%, transparent)`,
      }}
    >
      {ROTULO_AIDA[momento]}
    </span>
  );
}

// ── Aviso das seções obrigatórias ───────────────────────────────────────────

function AvisoObrigatorias({
  faltantes,
  autorizado,
  aoAutorizar,
}: {
  faltantes: readonly (keyof typeof MOTIVO_DO_PAPEL)[];
  autorizado: boolean;
  aoAutorizar: (v: boolean) => void;
}) {
  return (
    <div
      className="rounded-lg border px-3.5 py-3"
      style={{ borderColor: 'rgba(34,211,238,0.35)', backgroundColor: 'rgba(34,211,238,0.05)' }}
    >
      <div className="text-[13px] font-medium" style={{ color: 'var(--color-fg)' }}>
        {faltantes.length === 1
          ? 'Falta 1 seção que a página precisa'
          : `Faltam ${faltantes.length} seções que a página precisa`}
      </div>
      <div className="mt-1.5 space-y-1 text-[12px]" style={{ color: 'var(--color-fg-muted)' }}>
        {faltantes.map((p) => (
          <div key={p}>
            <span style={{ color: 'var(--color-ion-3)' }}>{ROTULO_DE_PAPEL[p]}</span>:{' '}
            {MOTIVO_DO_PAPEL[p]}.
          </div>
        ))}
      </div>
      <label className="mt-2.5 flex cursor-pointer items-center gap-2 text-[12px]">
        <input
          type="checkbox"
          checked={autorizado}
          onChange={(e) => aoAutorizar(e.target.checked)}
          className="h-4 w-4 accent-[var(--color-ion-4)]"
        />
        <span style={{ color: 'var(--color-fg)' }}>
          Autorizo o {ORBIS} a criar o que falta no estilo do kit.
        </span>
      </label>
    </div>
  );
}

// ── Fundo da página ─────────────────────────────────────────────────────────

function BlocoDeFundo({
  fundos,
  livres,
  aoUsar,
  aoTirar,
}: {
  fundos: readonly FundoEmUso[];
  livres: readonly PecaDoKit[];
  aoUsar: (componenteId: string) => void;
  aoTirar: (secaoId: string, componenteId: string) => void;
}) {
  return (
    <div className="rounded-lg border px-3.5 py-3" style={{ borderColor: 'var(--color-border)' }}>
      <div
        className="flex items-center gap-1.5 text-[11px] uppercase tracking-[0.2em]"
        style={rotulo}
      >
        <Layers size={11} />
        Fundo da página
      </div>
      <p className="mt-1 text-[12px]" style={{ color: 'var(--color-fg-subtle)' }}>
        Não é uma seção: fica fixo atrás de todas elas, do topo ao rodapé.
      </p>
      <div className="mt-2 space-y-1.5">
        {fundos.map((f) => (
          <div
            key={`${f.secaoId}-${f.peca.id}`}
            className="ds-glass-static flex items-center gap-2.5 rounded-lg p-1.5"
          >
            <div className="h-[36px] w-[60px] shrink-0 overflow-hidden rounded">
              <PreviewFrame
                src={previewComponentUrl(f.peca.id)}
                title={f.peca.name}
                aspect={60 / 36}
              />
            </div>
            <span
              className="min-w-0 flex-1 truncate text-[12px]"
              style={{ color: 'var(--color-fg)' }}
            >
              {f.peca.name}
            </span>
            <button
              type="button"
              onClick={() => aoTirar(f.secaoId, f.peca.id)}
              aria-label={`Tirar o fundo ${f.peca.name}`}
              className="rounded-none p-1 hover:bg-[rgba(239,68,68,0.2)]"
              style={{ color: 'var(--color-fg-muted)' }}
            >
              <X size={11} />
            </button>
          </div>
        ))}
        {livres.map((c) => (
          <div key={c.id} className="flex items-center gap-2.5 rounded-lg p-1.5">
            <div className="h-[36px] w-[60px] shrink-0 overflow-hidden rounded opacity-60">
              <PreviewFrame src={previewComponentUrl(c.id)} title={c.name} aspect={60 / 36} />
            </div>
            <span
              className="min-w-0 flex-1 truncate text-[12px]"
              style={{ color: 'var(--color-fg-muted)' }}
            >
              {c.name}
            </span>
            <button
              type="button"
              onClick={() => aoUsar(c.id)}
              className="ds-glow-border rounded-none border px-2.5 py-1 text-[11px]"
              style={{ borderColor: 'var(--color-border)', color: 'var(--color-fg)' }}
            >
              Usar este fundo
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Inspetor ────────────────────────────────────────────────────────────────

/**
 * O terceiro painel: tudo que decide UMA seção, ao lado dela.
 *
 * Os controles de uma seção estavam espalhados por etapas diferentes do wizard —
 * a peça na Estrutura, o texto na Estrutura, a mídia na etapa seguinte — e
 * decidir sobre uma seção obrigava a andar entre telas e lembrar de qual seção
 * se estava falando. Aqui eles ficam juntos, com o nome da seção no topo.
 *
 * O upload é o que mais ganha: escolher uma imagem para "a abertura" é decisão
 * diferente de escolher uma imagem no meio de uma lista de seis campos iguais.
 *
 * E ganha com a MESMA conferência que a etapa Mídia faz: sem ela, este painel
 * oferecia o mesmo botão "enviar" em toda seção e aceitava calado um vídeo numa
 * seção cujos espaços são todos de imagem parada — uma seção quebrada que só
 * apareceria depois de gerar o site inteiro. As duas telas leem `cabe-na-secao`,
 * então elas nunca discordam sobre o mesmo arquivo.
 */
function Inspetor({
  secao,
  resolvida,
  objetivo,
  projectId,
  contratos,
  media,
  onMedia,
  onMudar,
  onEscolherPeca,
  onTirarPeca,
}: {
  secao: SecaoDoSite | null;
  resolvida: SecaoResolvida | null;
  objetivo: ObjetivoDoSite | null;
  projectId: string | null;
  /** Os espaços reais das peças do kit. Vazio = nada a afirmar, e nada é dito. */
  contratos: readonly KitContratoResumo[];
  media: MediaItem[];
  onMedia: (m: MediaItem[]) => void;
  onMudar: (patch: Partial<SecaoDoSite>) => void;
  onEscolherPeca: () => void;
  onTirarPeca: (indice: number) => void;
}) {
  const upload = useMutation({
    mutationFn: (file: File) => {
      if (!projectId) throw new Error('rascunho ainda não criado');
      if (secao === null) throw new Error('sem seção');
      return api.uploadMedia(projectId, file, {
        kind: ehVideoEscolhido(file) ? 'video' : 'image',
        secaoId: secao.id,
      });
    },
    onSuccess: (res) => {
      onMedia(res.media);
      toast.ok('Mídia enviada para esta seção.');
    },
    onError: (e) => toast.erro(e instanceof Error ? e.message : 'Falha no upload.'),
  });

  if (secao === null || resolvida === null) {
    return (
      <aside className="hidden xl:block">
        <div className="md:sticky md:top-0">
          <div className="mb-1.5 text-[11px] uppercase tracking-[0.2em]" style={rotulo}>
            Detalhes da seção
          </div>
          <div
            className="rounded-none border px-3 py-8 text-center text-[11px] leading-relaxed"
            style={{ borderColor: 'var(--color-border)', color: 'var(--color-fg-subtle)' }}
          >
            Escolha uma seção na lista ou na prévia para mexer nela aqui.
          </div>
        </div>
      </aside>
    );
  }

  const papel = SectionRole.safeParse(resolvida.slug);
  const etapa = papel.success ? explicarPapel(papel.data, objetivo) : undefined;
  const daSecao = media.filter((m) => m.kind !== 'logo' && m.secaoId === secao.id);
  // Os espaços somam TODAS as peças da seção: com duas peças de cards ela aceita
  // o dobro de imagens, e o número de uma só mentiria. Mesma conta da etapa Mídia.
  const contratosDaSecao = resolvida.pecas
    .map((p) => contratos.find((x) => x.id === p.id))
    .filter((c) => c !== undefined);
  const cabe = oQueCabe(contratosDaSecao);

  return (
    <aside className="hidden xl:block">
      <div className="md:sticky md:top-0">
        <div className="mb-1.5 text-[11px] uppercase tracking-[0.2em]" style={rotulo}>
          Detalhes da seção
        </div>
        <div
          className="max-h-[70vh] space-y-4 overflow-y-auto rounded-none border p-3"
          style={{ borderColor: 'var(--color-border)', backgroundColor: 'rgba(0,0,0,0.3)' }}
        >
          <div>
            <div className="truncate text-[14px]" style={{ color: 'var(--color-fg)' }}>
              {secao.nome.trim() === '' ? 'Seção sem nome' : secao.nome}
            </div>
            {etapa !== undefined && (
              <div
                className="mt-0.5 text-[11px] leading-snug"
                style={{ color: 'var(--color-ion-3)' }}
              >
                {etapa.faz}
              </div>
            )}
          </div>

          {/* A peça. Sem peça, a seção nasce no estilo do kit — e o painel diz
              o que vai nascer, em vez de só dizer que está vazia. */}
          <div>
            <div className="ds-label mb-1.5">Peça</div>
            {resolvida.pecas.length === 0 ? (
              <p
                className="text-[11px] leading-relaxed"
                style={{ color: 'var(--color-fg-subtle)' }}
              >
                Criada no estilo do kit.
                {etapa !== undefined && ` ${resumirSugestao(etapa.sugestao)}`}
              </p>
            ) : (
              <div className="space-y-1">
                {resolvida.pecas.map((p, i) => (
                  <div
                    key={`${p.id}-${i}`}
                    className="flex items-center gap-2 border px-2 py-1.5"
                    style={{ borderColor: 'var(--color-border)' }}
                  >
                    <span
                      className="min-w-0 flex-1 truncate text-[11px]"
                      style={{ color: 'var(--color-fg)' }}
                    >
                      {p.name}
                    </span>
                    <button
                      type="button"
                      onClick={() => onTirarPeca(i)}
                      title="Tirar esta peça da seção"
                      className="shrink-0 rounded-none p-1 hover:bg-white/[0.06]"
                    >
                      <X size={11} style={{ color: 'var(--color-fg-subtle)' }} />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <button
              type="button"
              onClick={onEscolherPeca}
              className="ds-tag mt-2 flex w-full items-center justify-center gap-1.5 rounded-none border px-2 py-1.5 text-[11px]"
              style={{ borderColor: 'var(--color-border-strong)', color: 'var(--color-fg-muted)' }}
            >
              <Plus size={11} />
              {resolvida.pecas.length === 0 ? 'Escolher uma peça' : 'Trocar ou somar peça'}
            </button>
          </div>

          {/* O texto desta seção, no mesmo lugar da peça e da mídia. */}
          <div>
            <div className="ds-label mb-1.5">O que dizer aqui</div>
            <textarea
              value={secao.instrucao ?? ''}
              onChange={(e) => onMudar({ instrucao: e.target.value })}
              rows={3}
              placeholder="Deixe em branco e eu escrevo no tom da sua marca."
              className="w-full resize-y rounded-none border px-2 py-1.5 text-[11px] leading-relaxed outline-none focus:border-[var(--color-signal)]"
              style={{
                borderColor: 'var(--color-border)',
                backgroundColor: 'rgba(0,0,0,0.35)',
                color: 'var(--color-fg)',
              }}
            />
          </div>

          {/* A mídia DESTA seção, enviada olhando para ela. */}
          <div>
            <div className="ds-label mb-1.5">Mídia desta seção</div>
            {/* O que cabe, dito ANTES de a pessoa escolher o arquivo. Recusar
                depois sem nunca ter avisado é a ferramenta brigando com quem
                usa. Seção sem contrato legível não promete nada e fica calada. */}
            {cabe !== '' && (
              <p className="mb-1.5 text-[10px]" style={{ color: 'var(--color-fg-subtle)' }}>
                Esta seção {cabe}.
              </p>
            )}
            {daSecao.length > 0 && (
              <div className="mb-2 grid grid-cols-3 gap-1.5">
                {daSecao.map((m) => (
                  <div
                    key={m.path}
                    className="aspect-square overflow-hidden border"
                    style={{ borderColor: 'var(--color-border)' }}
                  >
                    {m.kind === 'video' ? (
                      <div
                        className="flex h-full w-full items-center justify-center text-[9px]"
                        style={{ color: 'var(--color-fg-subtle)' }}
                      >
                        vídeo
                      </div>
                    ) : (
                      <img
                        src={mediaUrl(projectId ?? '', m.path)}
                        alt={m.alt ?? ''}
                        className="h-full w-full object-cover"
                      />
                    )}
                  </div>
                ))}
              </div>
            )}
            <label
              className="ds-tag flex cursor-pointer items-center justify-center gap-1.5 rounded-none border px-2 py-1.5 text-[11px]"
              style={{ borderColor: 'var(--color-border-strong)', color: 'var(--color-fg-muted)' }}
            >
              {upload.isPending ? <Mascote tamanho={11} girando /> : <Upload size={11} />}
              enviar para esta seção
              <input
                type="file"
                accept="image/*,video/*"
                className="hidden"
                disabled={!projectId || upload.isPending}
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  // O input é limpo AGORA, antes do await: escolher o mesmo
                  // arquivo de novo (depois de uma recusa) precisa disparar o
                  // `change`, e ele não dispara se o valor continuar lá.
                  e.target.value = '';
                  if (!f) return;
                  const video = ehVideoEscolhido(f);
                  const proporcao = await medirProporcao(f, video);
                  // Duas saídas, e a fronteira entre elas é o que o app SABE.
                  // Descasamento de tipo recusa: o espaço é `<img>` ou é
                  // `<video>`, e o arquivo do outro tipo não ocupa aquele lugar.
                  // Proporção só avisa, porque o contrato descreve a peça de
                  // origem e a peça de origem não é o limite do que a pessoa
                  // quer fazer.
                  const veredicto = avaliarMidia({
                    tipo: video ? 'video' : 'image',
                    ...(proporcao !== undefined ? { proporcao } : {}),
                    contratos: contratosDaSecao,
                  });
                  if (!veredicto.aceita) {
                    toast.erro(veredicto.texto);
                    return;
                  }
                  if (veredicto.texto !== '') toast.info(veredicto.texto);
                  upload.mutate(f);
                }}
              />
            </label>
            {!projectId && (
              <p className="mt-1.5 text-[10px]" style={{ color: 'var(--color-fg-subtle)' }}>
                O envio abre depois do primeiro avanço, quando o rascunho existe.
              </p>
            )}
          </div>
        </div>
      </div>
    </aside>
  );
}

// ── Prévia empilhada ────────────────────────────────────────────────────────

/**
 * O pseudo-preview do site: as miniaturas das peças, empilhadas na ordem das
 * seções. Nada é gerado — são os mesmos documentos de prévia que a Biblioteca
 * usa, reduzidos. Clicar numa seção a abre na lista, como no editor da Shopify.
 * Só existe em md+; no celular a lista basta.
 *
 * Três escolhas de apresentação, todas vindas de uso real:
 *
 * - **peça nunca é cortada no meio.** A versão anterior recortava cada peça em
 *   240px, e uma seção alta aparecia decapitada — parecia defeito da captura.
 *   Agora a miniatura cresce até a altura REAL do documento na escala da
 *   coluna: a peça sai menor, mas inteira, e a pilha vira a página em
 *   miniatura de verdade.
 * - **o nome da seção é a legenda entre os blocos.** Sem ela, duas peças
 *   vizinhas de seções diferentes liam como uma coisa só.
 * - **seção sem peça é DESENHADA, não descrita.** Ela era um retângulo
 *   pontilhado com o nome, "criada no estilo do kit" e o resumo da sugestão:
 *   metade da coluna renderizava o site e a outra metade contava sobre ele em
 *   três frases. Agora ela sai como bloco nas cores e nas fontes do kit, com a
 *   forma do papel dela. O contorno só volta quando não há design system
 *   consolidado, e então ele diz o motivo.
 */
function PreviaEmpilhada({
  secoes,
  fundos,
  ativa,
  objetivo,
  estilo,
  aoAbrir,
}: {
  secoes: readonly SecaoResolvida[];
  fundos: readonly FundoEmUso[];
  ativa: string | null;
  objetivo: ObjetivoDoSite | null;
  /** O estilo do kit, ou o motivo de não haver um. */
  estilo: LeituraDoEstilo;
  aoAbrir: (id: string) => void;
}) {
  // Quando a seção ativa muda por fora (clique na lista), a prévia rola até
  // ela. Sem isto, escolher a última seção de uma página longa não mudava nada
  // do que estava à vista, e a prévia deixava de ser o espelho da lista.
  const caixa = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (ativa === null || caixa.current === null) return;
    const alvo = caixa.current.querySelector(`[data-secao="${ativa}"]`);
    alvo?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [ativa]);

  return (
    <div className="hidden md:block">
      <div className="md:sticky md:top-0">
        <div className="mb-1.5 flex items-baseline justify-between">
          <span className="text-[11px] uppercase tracking-[0.2em]" style={rotulo}>
            Prévia da página
          </span>
          <span className="text-[10px]" style={{ color: 'var(--color-fg-subtle)' }}>
            na ordem das seções
          </span>
        </div>
        <div
          ref={caixa}
          className="max-h-[70vh] scroll-smooth overflow-y-auto overscroll-contain rounded-none border"
          style={{ borderColor: 'var(--color-border)', backgroundColor: 'rgba(0,0,0,0.3)' }}
        >
          {secoes.length === 0 && (
            <div
              className="px-3 py-10 text-center text-[11px]"
              style={{ color: 'var(--color-fg-subtle)' }}
            >
              Sem seção ainda. O que você montar aparece aqui.
            </div>
          )}
          {secoes.map((r) => {
            const nome = r.nome.trim() === '' ? 'sem nome' : r.nome;
            // O `slug` da resolução é o mesmo papel que o gerador vai usar;
            // tipá-lo de volta dá acesso à etapa de marketing (a sugestão).
            const papel = SectionRole.safeParse(r.slug);
            const etapa = papel.success ? explicarPapel(papel.data, objetivo) : undefined;
            return (
              <button
                key={r.id}
                type="button"
                // A seleção é BIDIRECIONAL: clicar aqui abre a seção na lista, e
                // escolher na lista rola esta prévia até ela. O `data-secao` é o
                // que liga os dois lados sem cada um guardar uma referência do
                // outro — é a mesma peça da página vista de dois ângulos.
                data-secao={r.id}
                onClick={() => aoAbrir(r.id)}
                title={`Abrir a seção ${r.nome || 'sem nome'}`}
                className="block w-full scroll-mt-2 px-1 pb-1.5 text-left"
                style={{
                  backgroundColor: ativa === r.id ? 'rgba(34,211,238,0.1)' : 'transparent',
                }}
              >
                {r.pecas.length === 0 ? (
                  <BlocoSemPeca
                    nome={nome}
                    papel={papel.success ? papel.data : undefined}
                    sugestao={etapa === undefined ? undefined : resumirSugestao(etapa.sugestao)}
                    estilo={estilo}
                    ativa={ativa === r.id}
                  />
                ) : (
                  <>
                    <div
                      className="ds-data truncate pt-1.5 pb-1 text-[10px] uppercase tracking-[0.12em]"
                      style={{
                        color: ativa === r.id ? 'var(--color-ion-3)' : 'var(--color-fg-subtle)',
                      }}
                    >
                      {nome}
                    </div>
                    {/* As peças da MESMA seção ficam coladas: é um trecho
                        contínuo da página, não uma lista de cards. */}
                    <div className="overflow-hidden rounded-sm">
                      {r.pecas.map((p, i) => (
                        <PreviewFrame
                          key={`${p.id}-${i}`}
                          src={previewComponentUrl(p.id)}
                          title={p.name}
                          aspect={16 / 9}
                          autoHeight
                        />
                      ))}
                    </div>
                  </>
                )}
              </button>
            );
          })}
          {fundos.length > 0 && (
            <div
              className="flex items-center gap-1.5 border-t px-2.5 py-2 text-[10px]"
              style={{ borderColor: 'var(--color-border)', color: 'var(--color-fg-subtle)' }}
            >
              <Layers size={10} />
              <span className="truncate">
                Atrás de tudo: {fundos.map((f) => f.peca.name).join(', ')}
              </span>
            </div>
          )}
        </div>
        {/* O que o esqueleto esconde do kit, uma vez só no pé da coluna. Repetir
            em cada bloco criado diria a mesma coisa cinco vezes na mesma tela. */}
        {estilo.ok && estilo.estilo.aviso !== null && secoes.some((r) => r.pecas.length === 0) && (
          <p
            className="mt-1.5 text-[10px] leading-snug"
            style={{ color: 'var(--color-fg-subtle)' }}
          >
            {estilo.estilo.aviso}
          </p>
        )}
      </div>
    </div>
  );
}

// ── Seção sem peça: o esqueleto no estilo do kit ────────────────────────────

/**
 * O bloco de uma seção que ainda não tem peça.
 *
 * Duas saídas, e a fronteira é o que o app leu do kit. Com design system
 * consolidado ele DESENHA: fundo, cor de texto, fonte de título e cantos são os
 * do kit, e a forma é a do papel da seção (`formaDoPapel`). Sem ele o contorno
 * pontilhado fica, com o motivo escrito no lugar de "criada no estilo do kit" —
 * um bloco em cinza genérico diria "o seu kit é assim" sobre um kit que ninguém
 * leu, e é exatamente o tipo de prévia que faz a pessoa desconfiar do resto.
 *
 * O resumo da sugestão de peça só aparece no caminho degradado. Onde há desenho,
 * ele já mostra a forma que a frase descrevia, e a frase continua na linha da
 * árvore e na grade de peças, que é onde ela decide algo.
 */
function BlocoSemPeca({
  nome,
  papel,
  sugestao,
  estilo,
  ativa,
}: {
  nome: string;
  papel: SectionRole | undefined;
  sugestao: string | undefined;
  estilo: LeituraDoEstilo;
  ativa: boolean;
}) {
  const forma = formaDoPapel(papel);

  if (!estilo.ok) {
    return (
      <div
        className="mt-1.5 rounded-md border border-dashed px-3 py-4 text-center leading-relaxed"
        style={{ borderColor: 'rgba(255,255,255,0.16)' }}
      >
        <div className="text-[11px]" style={{ color: 'var(--color-fg-muted)' }}>
          {nome}
        </div>
        {/* Motivo vazio = a leitura do kit ainda está no ar. Aí a frase antiga
            serve: ela não afirma nada sobre o kit, só sobre o que vai acontecer. */}
        <div className="text-[10px] leading-snug" style={{ color: 'var(--color-fg-subtle)' }}>
          {estilo.porque === '' ? 'criada no estilo do kit' : estilo.porque}
        </div>
        {sugestao !== undefined && (
          <div
            className="mt-1 text-[10px] italic leading-snug"
            style={{ color: 'var(--color-ion-3)' }}
          >
            {sugestao}
          </div>
        )}
      </div>
    );
  }

  const escreveONome = formaEscreveONome(forma);
  return (
    <>
      {/* Onde o esqueleto escreve o nome na fonte do kit, a legenda o repetiria
          duas vezes em dois centímetros. */}
      {!escreveONome && (
        <div
          className="ds-data truncate pt-1.5 pb-1 text-[10px] uppercase tracking-[0.12em]"
          style={{ color: ativa ? 'var(--color-ion-3)' : 'var(--color-fg-subtle)' }}
        >
          {nome}
        </div>
      )}
      <div className={`overflow-hidden rounded-sm${escreveONome ? ' mt-1.5' : ''}`}>
        <Esqueleto nome={nome} forma={forma} estilo={estilo.estilo} />
      </div>
    </>
  );
}

/** A largura de um traço em fração da caixa. Nome e moldura ocupam tudo. */
const larguraDoTraco = (t: TracoDoEsqueleto): number =>
  t.tipo === 'nome' || t.tipo === 'moldura' ? 1 : t.largura;

/**
 * O esqueleto desenhado.
 *
 * Nenhum traço carrega texto, com uma exceção: o `nome`, que é o nome que a
 * pessoa deu à seção. Escrever uma chamada de exemplo faria a prévia prometer
 * uma frase que a geração não vai escrever, e prévia que mente é pior que
 * contorno que se cala. O nome existe também porque é o que mostra a TIPOGRAFIA
 * do kit: uma barra cinza não mostra fonte nenhuma.
 */
function Esqueleto({
  nome,
  forma,
  estilo,
}: {
  nome: string;
  forma: FormaDaSecao;
  estilo: EstiloDoEsqueleto;
}) {
  const raio = raioNaPrevia(estilo.raio, estilo.corpoMedido);
  // `color-mix` porque as cores do kit são hex: é o jeito de dosar a MESMA cor
  // em barra, borda e moldura sem inventar um cinza que não está no kit.
  const tenue = (pct: number): string => `color-mix(in srgb, ${estilo.texto} ${pct}%, transparent)`;

  const desenhar = (t: TracoDoEsqueleto): CSSProperties => {
    switch (t.tipo) {
      case 'nome':
        return {};
      case 'linha':
        return {
          height: Math.max(2, Math.round((t.escala ?? 1) * CORPO_NA_PREVIA * 0.62)),
          borderRadius: 1,
          backgroundColor: tenue(26),
        };
      case 'botao':
        return {
          height: Math.round(CORPO_NA_PREVIA * 2.2),
          borderRadius: raio,
          backgroundColor: estilo.destaque,
        };
      case 'campo':
        return {
          height: Math.round(CORPO_NA_PREVIA * 2.4),
          borderRadius: raio,
          border: `1px solid ${estilo.borda ?? tenue(24)}`,
        };
      case 'pastilha':
        return {
          height: Math.round(CORPO_NA_PREVIA * 1.6),
          borderRadius: raio,
          backgroundColor: tenue(20),
        };
      case 'moldura':
        return {
          height: Math.round(t.altura * CORPO_NA_PREVIA * 2),
          borderRadius: raio,
          backgroundColor: tenue(10),
          border: `1px solid ${estilo.borda ?? tenue(16)}`,
        };
    }
  };

  const traco = (t: TracoDoEsqueleto, chave: string, extra?: CSSProperties) => (
    <div key={chave} style={{ width: `${larguraDoTraco(t) * 100}%`, ...extra }}>
      {t.tipo === 'nome' ? (
        <div
          className="truncate"
          style={{
            fontFamily: estilo.fonteTitulo ?? undefined,
            fontSize: Math.round(
              escalaDoNome(t.escala, estilo.destaqueTipografico) * CORPO_NA_PREVIA,
            ),
            lineHeight: 1.15,
            fontWeight: 600,
            color: estilo.texto,
          }}
        >
          {nome}
        </div>
      ) : (
        <div style={desenhar(t)} />
      )}
    </div>
  );

  const empilhados = (tracos: readonly TracoDoEsqueleto[], prefixo: string) => (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: forma.centralizado ? 'center' : 'flex-start',
        textAlign: forma.centralizado ? 'center' : 'left',
        gap: Math.round(CORPO_NA_PREVIA * 0.9),
      }}
    >
      {tracos.map((t, i) => traco(t, `${prefixo}-${i}`))}
    </div>
  );

  const grade = forma.grade;
  return (
    <div
      style={{
        backgroundColor: estilo.fundo,
        fontFamily: estilo.fonteTexto ?? undefined,
        padding: Math.round(CORPO_NA_PREVIA * 2),
        display: 'flex',
        flexDirection: 'column',
        gap: Math.round(CORPO_NA_PREVIA * 1.6),
      }}
    >
      {forma.barra !== null && (
        // Marca à esquerda, o resto à direita: o desenho de toda barra de topo.
        <div style={{ display: 'flex', alignItems: 'center', gap: CORPO_NA_PREVIA }}>
          {forma.barra.map((t, i) =>
            traco(t, `barra-${i}`, i === 0 ? { marginRight: 'auto' } : undefined),
          )}
        </div>
      )}
      {forma.topo.length > 0 && empilhados(forma.topo, 'topo')}
      {grade !== null && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: `repeat(${grade.colunas}, minmax(0, 1fr))`,
            gap: Math.round(CORPO_NA_PREVIA * 1.4),
          }}
        >
          {Array.from({ length: grade.colunas * grade.linhas }, (_, c) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: as células da grade são idênticas e sem estado; a posição É a identidade delas, e não existe outra chave possível.
            <div key={`celula-${c}`}>{empilhados(grade.item, `celula-${c}`)}</div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Grade visual de peças ───────────────────────────────────────────────────

/**
 * A troca de peça deixou de ser uma lista de nomes: é uma grade de miniaturas,
 * agrupada entre o que encaixa no papel da seção e o resto do kit. O selinho
 * "boa para ..." diz onde cada peça costuma funcionar, derivado da mesma tabela
 * que o gerador usa para casar peça e papel.
 */
function ModalDePecas({
  nomeDaSecao,
  papel,
  objetivo,
  components,
  aoEscolher,
  aoFechar,
}: {
  nomeDaSecao: string;
  papel: SectionRole | undefined;
  objetivo: ObjetivoDoSite | null;
  components: KitComponentRef[];
  aoEscolher: (id: string) => void;
  aoFechar: () => void;
}) {
  const { encaixam, outras } = agruparPecasParaSecao(components, papel);
  const vazio = encaixam.length === 0 && outras.length === 0;
  // A observação do Orbis repetida AQUI porque é agora que ela decide algo:
  // a pessoa está com a grade aberta, escolhendo.
  const etapa = papel !== undefined ? explicarPapel(papel, objetivo) : undefined;

  const grade = (pecas: readonly PecaDoKit[]) => (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      {pecas.map((c) => {
        const selinho = selinhoDaPeca(c.category);
        return (
          <button
            key={c.id}
            type="button"
            onClick={() => aoEscolher(c.id)}
            className="ds-card overflow-hidden rounded-lg text-left"
          >
            <PreviewFrame src={previewComponentUrl(c.id)} title={c.name} aspect={16 / 10} />
            <div className="ds-card-content p-2">
              <div className="truncate text-[12px]" style={{ color: 'var(--color-fg)' }}>
                {c.name}
              </div>
              {selinho !== undefined && (
                <span
                  className="ds-data mt-1 inline-block rounded-none border px-1.5 py-0.5 text-[9px]"
                  style={{ borderColor: 'rgba(34,211,238,0.3)', color: 'var(--color-ion-3)' }}
                >
                  {selinho}
                </span>
              )}
            </div>
          </button>
        );
      })}
    </div>
  );

  return (
    <Modal open onClose={aoFechar} size="lg" title={`Peças para ${nomeDaSecao || 'esta seção'}`}>
      <div className="space-y-4 px-5 py-5">
        <div>
          <div className="text-[15px] font-medium" style={{ color: 'var(--color-fg)' }}>
            Peças para {nomeDaSecao.trim() === '' ? 'esta seção' : nomeDaSecao}
          </div>
          <p className="mt-0.5 text-[12px]" style={{ color: 'var(--color-fg-subtle)' }}>
            Toque numa peça para colocá-la na seção.
          </p>
          {etapa !== undefined && (
            <p className="mt-1 text-[12px] italic" style={{ color: 'var(--color-ion-3)' }}>
              Eu poria aqui {etapa.sugestao}.
            </p>
          )}
        </div>

        {vazio && (
          <p className="py-6 text-center text-[13px]" style={{ color: 'var(--color-fg-muted)' }}>
            O kit não tem peça para pôr aqui. A seção sai criada no estilo do kit.
          </p>
        )}

        {encaixam.length > 0 && (
          <div>
            <div className="mb-2 text-[11px] uppercase tracking-[0.2em]" style={rotulo}>
              Encaixam nesta seção
            </div>
            {grade(encaixam)}
          </div>
        )}

        {outras.length > 0 && (
          <div>
            <div className="mb-2 text-[11px] uppercase tracking-[0.2em]" style={rotulo}>
              {encaixam.length > 0 ? 'Outras peças do kit' : 'As peças do kit'}
            </div>
            {grade(outras)}
          </div>
        )}
      </div>
    </Modal>
  );
}
