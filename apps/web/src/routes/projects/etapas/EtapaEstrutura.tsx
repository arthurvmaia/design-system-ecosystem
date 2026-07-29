import { Select } from '@/components/seletores';
import type { KitComponentRef } from '@/lib/api';
import {
  ROLE_CATEGORIES,
  ROTULO_DE_PAPEL,
  type SecaoDoSite,
  SectionRole,
  adicionarSecao,
  moverSecao,
  removerSecao,
  resolverSecoes,
  sugerirSecoes,
} from '@ds/shared/schemas';
import { ChevronDown, ChevronUp, Plus, RotateCcw, Trash2, X } from 'lucide-react';
import { useState } from 'react';
import { INPUT, inputStyle, rotulo } from '../partes';

const AUTOMATICO = '__automatico__';

/**
 * "Monte a sua estrutura."
 *
 * A tela anterior fazia escolher entre cinco estruturas prontas e depois trocar
 * a peça de cada posição fixa. O dono da arquitetura da página era o molde.
 *
 * Aqui a lista é do usuário: ele decide quantas seções existem, em que ordem,
 * quais peças compõem cada uma (mais de uma, se quiser) e o que cada seção deve
 * ou não comunicar. O kit continua sendo o DNA visual; o esqueleto passou a ser
 * dele.
 *
 * Nada aqui é obrigatório além do nome. Seção sem peça quer dizer "crie no
 * estilo do kit" e seção sem texto quer dizer "escreva você" — as duas são
 * decisões, não campos esquecidos.
 */
export function StepEstrutura({
  secoes,
  onSecoes,
  components,
}: {
  secoes: SecaoDoSite[];
  onSecoes: (s: SecaoDoSite[]) => void;
  components: KitComponentRef[];
}) {
  const [aberta, setAberta] = useState<string | null>(null);

  const { secoes: resolvidas, avisos } = resolverSecoes(secoes, components);
  const porId = new Map(resolvidas.map((r) => [r.id, r]));
  const doKit = resolvidas.filter((r) => r.pecas.length > 0).length;
  const criadas = resolvidas.length - doKit;

  const emUso = new Set(secoes.flatMap((s) => s.componentIds));
  const sobrando = components.filter((c) => !emUso.has(c.id));

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

  return (
    <div className="space-y-5">
      <div>
        <div className="mb-1 flex items-baseline justify-between gap-3">
          <div className="text-[11px] uppercase tracking-[0.2em]" style={rotulo}>
            As seções do seu site
          </div>
          <output className="text-[12px]" style={{ color: 'var(--color-fg-subtle)' }}>
            {secoes.length} {secoes.length === 1 ? 'seção' : 'seções'} · {doKit} do seu kit ·{' '}
            {criadas} {criadas === 1 ? 'criada' : 'criadas'} no estilo
          </output>
        </div>
        <p className="text-[13px] leading-relaxed" style={{ color: 'var(--color-fg-muted)' }}>
          Você monta a página: adiciona seções, muda a ordem e escolhe quais peças entram em cada
          uma. Seção sem peça nenhuma é criada no estilo do kit, e o texto é opcional. Onde você não
          escrever, eu escrevo no tom da sua marca.
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

      <div className="space-y-1.5">
        {secoes.map((s, i) => {
          const r = porId.get(s.id);
          const expandida = aberta === s.id;
          const cats = s.papel !== undefined ? ROLE_CATEGORIES[s.papel] : [];
          const resumo =
            r === undefined || r.pecas.length === 0
              ? 'criada no estilo do kit'
              : r.pecas.map((p) => p.name).join(' + ');

          return (
            <div
              key={s.id}
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
                    onClick={() => onSecoes(moverSecao(secoes, s.id, 'cima'))}
                    disabled={i === 0}
                    aria-label={`Mover ${s.nome || 'esta seção'} para cima`}
                    className="rounded p-0.5 transition-colors hover:bg-white/[0.06] disabled:opacity-20"
                    style={{ color: 'var(--color-fg-muted)' }}
                  >
                    <ChevronUp size={13} />
                  </button>
                  <button
                    type="button"
                    onClick={() => onSecoes(moverSecao(secoes, s.id, 'baixo'))}
                    disabled={i === secoes.length - 1}
                    aria-label={`Mover ${s.nome || 'esta seção'} para baixo`}
                    className="rounded p-0.5 transition-colors hover:bg-white/[0.06] disabled:opacity-20"
                    style={{ color: 'var(--color-fg-muted)' }}
                  >
                    <ChevronDown size={13} />
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => setAberta(expandida ? null : s.id)}
                  aria-expanded={expandida}
                  className="flex min-w-0 flex-1 items-center gap-3 rounded px-1.5 py-1 text-left transition-colors hover:bg-white/[0.03]"
                >
                  <span
                    className="shrink-0 text-[14px] font-medium"
                    style={{
                      color: s.nome.trim() === '' ? 'var(--color-ion-3)' : 'var(--color-fg)',
                    }}
                  >
                    {s.nome.trim() === '' ? 'sem nome' : s.nome}
                  </span>
                  <span
                    className="ds-data min-w-0 flex-1 truncate text-[11px]"
                    style={{ color: 'var(--color-fg-subtle)' }}
                  >
                    {resumo}
                  </span>
                  <span
                    className="shrink-0 text-[10px] uppercase tracking-[0.08em]"
                    style={{
                      color:
                        r !== undefined && r.pecas.length > 0
                          ? 'var(--color-fg-muted)'
                          : 'var(--color-fg-subtle)',
                    }}
                  >
                    {r !== undefined && r.pecas.length > 0
                      ? `${r.pecas.length} ${r.pecas.length === 1 ? 'peça' : 'peças'}`
                      : 'no estilo'}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => onSecoes(removerSecao(secoes, s.id))}
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
                  <label className="block">
                    <span
                      className="mb-1.5 block text-[11px] uppercase tracking-[0.16em]"
                      style={rotulo}
                    >
                      Nome da seção
                    </span>
                    <input
                      type="text"
                      value={s.nome}
                      onChange={(e) => mudar(s.id, { nome: e.target.value })}
                      placeholder="ex.: Abertura, Nossos planos, O que dizem de nós"
                      className={INPUT}
                      style={inputStyle}
                    />
                  </label>

                  <div>
                    <span
                      className="mb-1.5 block text-[11px] uppercase tracking-[0.16em]"
                      style={rotulo}
                    >
                      Peças desta seção
                    </span>
                    {r !== undefined && r.pecas.length > 0 && (
                      <div className="mb-2 flex flex-wrap gap-1.5">
                        {r.pecas.map((p, j) => (
                          <span
                            key={`${p.id}-${j}`}
                            className="flex items-center gap-1 rounded-full border py-1 pl-2.5 pr-1 text-[12px]"
                            style={{
                              borderColor: 'var(--color-border)',
                              color: 'var(--color-fg)',
                            }}
                          >
                            {p.name}
                            {r.pecas.length > 1 && (
                              <>
                                <button
                                  type="button"
                                  onClick={() => moverPeca(s.id, j, -1)}
                                  disabled={j === 0}
                                  aria-label={`Mover ${p.name} para antes`}
                                  className="rounded p-0.5 hover:bg-white/[0.08] disabled:opacity-20"
                                  style={{ color: 'var(--color-fg-subtle)' }}
                                >
                                  <ChevronUp size={11} />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => moverPeca(s.id, j, 1)}
                                  disabled={j === r.pecas.length - 1}
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
                              onClick={() => tirarPeca(s.id, j)}
                              aria-label={`Tirar ${p.name} desta seção`}
                              className="rounded-full p-0.5 hover:bg-[rgba(239,68,68,0.2)]"
                              style={{ color: 'var(--color-fg-muted)' }}
                            >
                              <X size={11} />
                            </button>
                          </span>
                        ))}
                      </div>
                    )}
                    <Select
                      opcoes={components.map((c) => ({
                        valor: c.id,
                        rotulo: c.name,
                        grupo: cats.includes(c.category)
                          ? 'Encaixa nesta seção'
                          : 'Outras peças do kit',
                      }))}
                      valor=""
                      rotulo={`Adicionar peça em ${s.nome || 'esta seção'}`}
                      placeholder={
                        r !== undefined && r.pecas.length > 0
                          ? 'Adicionar outra peça'
                          : 'Adicionar uma peça do kit'
                      }
                      aoMudar={(v) => {
                        if (v !== '') adicionarPeca(s.id, v);
                      }}
                    />
                    <p className="mt-1.5 text-[12px]" style={{ color: 'var(--color-fg-subtle)' }}>
                      Sem nenhuma peça, esta seção é criada do zero no estilo do kit.
                    </p>
                  </div>

                  <label className="block">
                    <span
                      className="mb-1.5 block text-[11px] uppercase tracking-[0.16em]"
                      style={rotulo}
                    >
                      O que esta seção deve dizer? (opcional)
                    </span>
                    <textarea
                      value={s.instrucao ?? ''}
                      onChange={(e) => mudar(s.id, { instrucao: e.target.value })}
                      rows={3}
                      placeholder="ex.: fale do atendimento pelo WhatsApp e não mencione preço"
                      className={`${INPUT} resize-y leading-relaxed`}
                      style={inputStyle}
                    />
                    <span
                      className="mt-1.5 block text-[12px]"
                      style={{ color: 'var(--color-fg-subtle)' }}
                    >
                      Deixe vazio e eu escrevo no tom da sua marca, sem inventar fato, número ou
                      cliente.
                    </span>
                  </label>

                  <div>
                    <span
                      className="mb-1.5 block text-[11px] uppercase tracking-[0.16em]"
                      style={rotulo}
                    >
                      Tipo de seção (opcional)
                    </span>
                    <Select
                      opcoes={[
                        {
                          valor: AUTOMATICO,
                          rotulo: 'Automático, pela peça escolhida',
                        },
                        ...SectionRole.options.map((papel) => ({
                          valor: papel,
                          rotulo: ROTULO_DE_PAPEL[papel],
                        })),
                      ]}
                      valor={s.papel ?? AUTOMATICO}
                      rotulo={`Tipo da seção ${s.nome || 'sem nome'}`}
                      aoMudar={(v) =>
                        mudar(s.id, {
                          papel: v === AUTOMATICO ? undefined : SectionRole.parse(v),
                        })
                      }
                    />
                    <p className="mt-1.5 text-[12px]" style={{ color: 'var(--color-fg-subtle)' }}>
                      Só muda quais peças aparecem sugeridas aqui e como a seção se comporta no
                      celular.
                    </p>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={novaSecao}
          className="ds-btn ds-glow-border ds-backdrop flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[12px]"
          style={{ backgroundColor: 'rgba(255,255,255,0.04)', color: 'var(--color-fg)' }}
        >
          <Plus size={12} />
          Adicionar seção
        </button>
        <button
          type="button"
          onClick={() => onSecoes(sugerirSecoes(components))}
          className="flex items-center gap-1.5 text-[12px] underline"
          style={{ color: 'var(--color-fg-muted)' }}
        >
          <RotateCcw size={11} />
          Voltar para a sugestão do kit
        </button>
      </div>

      {sobrando.length > 0 && (
        <div>
          <div className="mb-1.5 text-[11px] uppercase tracking-[0.2em]" style={rotulo}>
            Peças do kit ainda sem seção
          </div>
          <div className="flex flex-wrap gap-1.5">
            {sobrando.map((c) => (
              <span
                key={c.id}
                className="rounded-full border px-2.5 py-1 text-[12px]"
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
  );
}
