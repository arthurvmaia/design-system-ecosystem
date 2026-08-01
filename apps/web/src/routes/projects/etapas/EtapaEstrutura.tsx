import { Modal } from '@/components/Modal';
import { PreviewFrame } from '@/components/PreviewFrame';
import { Select } from '@/components/seletores';
import { type KitComponentRef, previewComponentUrl } from '@/lib/api';
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
import { ChevronDown, ChevronUp, Layers, Plus, RotateCcw, Trash2, X } from 'lucide-react';
import { useState } from 'react';
import { INPUT, inputStyle, rotulo } from '../partes';

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
}: {
  secoes: SecaoDoSite[];
  onSecoes: (s: SecaoDoSite[]) => void;
  components: KitComponentRef[];
  /** Decide qual sequência de marketing explica cada seção. */
  objetivo: ObjetivoDoSite | null;
  /** Os espaços REAIS de imagem de cada peça, do contrato do kit. */
  espacos: readonly EspacosDaPeca[];
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
    <div className="gap-6 md:grid md:grid-cols-[minmax(0,1fr)_260px] md:items-start">
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
            Você monta a página: adiciona seções, muda a ordem e escolhe as peças vendo cada uma. A
            prévia ao lado empilha as seções na ordem em que o site vai sair. Seção sem peça é
            criada no estilo do kit, e onde você não escrever o texto, eu escrevo no tom da sua
            marca.
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
        aoAbrir={(id) => setAberta(id)}
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
}) {
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
      className="rounded-lg border"
      style={{
        borderColor: expandida ? 'var(--color-signal)' : 'var(--color-border)',
        backgroundColor: 'rgba(255,255,255,0.02)',
      }}
    >
      <div className="flex items-center gap-1 px-2 py-2">
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
 * - **seção sem peça diz o que vai nascer ali**: o bloco pontilhado carrega o
 *   nome e o resumo da sugestão de peça, em vez de só "criada no estilo" —
 *   que descrevia o COMO e escondia o quê.
 */
function PreviaEmpilhada({
  secoes,
  fundos,
  ativa,
  objetivo,
  aoAbrir,
}: {
  secoes: readonly SecaoResolvida[];
  fundos: readonly FundoEmUso[];
  ativa: string | null;
  objetivo: ObjetivoDoSite | null;
  aoAbrir: (id: string) => void;
}) {
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
          className="max-h-[70vh] scroll-smooth overflow-y-auto overscroll-contain rounded-lg border"
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
                onClick={() => aoAbrir(r.id)}
                title={`Abrir a seção ${r.nome || 'sem nome'}`}
                className="block w-full px-1 pb-1.5 text-left"
                style={{
                  backgroundColor: ativa === r.id ? 'rgba(34,211,238,0.1)' : 'transparent',
                }}
              >
                {r.pecas.length === 0 ? (
                  <div
                    className="mt-1.5 rounded-md border border-dashed px-3 py-4 text-center leading-relaxed"
                    style={{ borderColor: 'rgba(255,255,255,0.16)' }}
                  >
                    <div className="text-[11px]" style={{ color: 'var(--color-fg-muted)' }}>
                      {nome}
                    </div>
                    <div className="text-[10px]" style={{ color: 'var(--color-fg-subtle)' }}>
                      criada no estilo do kit
                    </div>
                    {etapa !== undefined && (
                      <div
                        className="mt-1 text-[10px] italic leading-snug"
                        style={{ color: 'var(--color-ion-3)' }}
                      >
                        {resumirSugestao(etapa.sugestao)}
                      </div>
                    )}
                  </div>
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
      </div>
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
