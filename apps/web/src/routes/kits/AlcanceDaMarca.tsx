import {
  type FaixaDeAlcance,
  LIMIAR_DE_ALCANCE,
  faixaDeAlcance,
  fraseDoSelo,
  linhaDeMotivos,
  pctInteiro,
  pecasForaDaMarca,
} from '@/lib/alcance-da-marca';
import { type KitContratoResumo, type Recolorabilidade, api } from '@/lib/api';
import { conta } from '@/lib/orbis';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, Palette } from 'lucide-react';
import { useMemo } from 'react';

/**
 * O aviso de alcance da marca DENTRO do editor de kit.
 *
 * ## Por que aqui
 *
 * A mistura de origens é decidida nesta tela. A Galeria já dizia, peça a peça,
 * que a paleta não alcançava tudo, e a revisão do wizard dizia de novo, tarde
 * demais: no fim do wizard, trocar uma peça custa voltar cinco etapas. No meio
 * do caminho, exatamente onde a pessoa escolhe o que entra e o que sai, o app
 * não dizia nada. A rota `GET /api/kits/:id/contratos` já devolvia `marca` por
 * peça desde que nasceu; faltava alguém ler.
 *
 * ## O aviso aponta a peça, não o kit
 *
 * "Este kit tem cores fixas" não é acionável: não dá para agir sobre um kit. O
 * painel nomeia cada peça, diz quanto dela a paleta alcança, por que o resto
 * ficou de fora, e põe do lado o botão que resolve, que é tirar aquela peça.
 *
 * ## O que ele NÃO finge saber
 *
 * A medida vem do kit SALVO. Peça adicionada agora ainda não passou pela
 * medição, e o painel diz isso por extenso em vez de contá-la como aprovada,
 * que é o mesmo contrato do painel de design system consolidado logo abaixo.
 */

/** Selo compacto para a linha da peça na lista "No kit". */
export function SeloDeAlcance({
  marca,
  medida = true,
}: {
  marca?: Recolorabilidade;
  /** `false` quando a peça entrou agora e ainda não foi medida. */
  medida?: boolean;
}) {
  const faixa: FaixaDeAlcance = medida ? faixaDeAlcance(marca) : 'nao-medido';
  if (faixa === 'aplicavel') return null;
  if (faixa === 'nao-medido') {
    return (
      <span
        className="ds-data shrink-0 rounded-none px-1.5 py-px text-[9px]"
        style={{ color: 'var(--color-fg-subtle)', border: '1px solid var(--color-border)' }}
        title={
          medida
            ? fraseDoSelo(marca)
            : 'Esta peça entrou agora. Eu meço o alcance da paleta quando o kit for salvo.'
        }
      >
        sem medida
      </span>
    );
  }
  const fixas = faixa === 'cores-fixas';
  const cor = fixas ? '#dc2626' : '#d97706';
  return (
    <span
      className="ds-data inline-flex shrink-0 items-center gap-1 rounded-none px-1.5 py-px text-[9px]"
      style={{ backgroundColor: `${cor}22`, color: cor, border: `1px solid ${cor}55` }}
      title={fraseDoSelo(marca)}
    >
      <Palette size={9} />
      {fixas ? 'cores fixas' : `marca ${pctInteiro(marca?.taxa ?? 0)}`}
    </span>
  );
}

export type AlcanceDoKit = {
  /** Os contratos da seleção atual que já foram medidos, na ordem do servidor. */
  daSelecao: KitContratoResumo[];
  /** A medida por peça, para o selo de cada linha. */
  porPeca: Map<string, Recolorabilidade | undefined>;
  /** Ids que estão na seleção e ainda não têm medida (entraram agora). */
  semMedidaAinda: string[];
  /**
   * A medição ainda está vindo do servidor.
   *
   * Precisa existir separado de "não tem medida": enquanto a busca não volta,
   * TODAS as peças ficariam em `semMedidaAinda` e a tela acusaria o kit inteiro
   * de não ter sido medido. Calar durante o carregamento é a única resposta
   * honesta, porque não há resposta ainda.
   */
  carregando: boolean;
};

/**
 * O alcance da paleta em cada peça da SELEÇÃO ATUAL.
 *
 * Compartilha a chave `['kit-contratos', kitId]` com o wizard de propósito: as
 * duas telas falam do mesmo kit e precisam dizer o mesmo número. Duas buscas
 * separadas acabariam discordando na primeira vez que uma delas revalidasse.
 */
export const useAlcanceDoKit = (
  kitId: string | null,
  selecionados: readonly string[],
): AlcanceDoKit => {
  const contratos = useQuery({
    queryKey: ['kit-contratos', kitId],
    queryFn: () => api.getKitContratos(kitId as string),
    enabled: kitId !== null,
  });
  const itens = contratos.data?.items;
  const carregando = kitId !== null && itens === undefined;

  return useMemo(() => {
    const lista = itens ?? [];
    const conhecidas = new Map(lista.map((c) => [c.id, c.marca]));
    return {
      daSelecao: lista.filter((c) => selecionados.includes(c.id)),
      porPeca: conhecidas,
      semMedidaAinda: carregando ? [] : selecionados.filter((id) => !conhecidas.has(id)),
      carregando,
    };
  }, [itens, selecionados, carregando]);
};

/**
 * O painel de aviso, acima das colunas do editor.
 *
 * Abre sozinho quando há peça na faixa das cores fixas, que é o caso em que a
 * pessoa provavelmente vai querer trocar alguma coisa. Nas outras situações fica
 * fechado, mas o resumo já traz a contagem: o aviso nunca depende de alguém
 * abrir para existir.
 */
export function AvisoDeAlcance({
  alcance,
  aoTirar,
  aoVerPrevia,
}: {
  alcance: AlcanceDoKit;
  aoTirar: (id: string) => void;
  aoVerPrevia: () => void;
}) {
  const fora = pecasForaDaMarca(alcance.daSelecao);
  const naFaixaDeOrigem = fora.filter((p) => p.faixa === 'cores-fixas');
  const naoMedidas = alcance.semMedidaAinda;

  if (alcance.carregando) return null;
  if (fora.length === 0 && naoMedidas.length === 0) return null;

  const cor = naFaixaDeOrigem.length > 0 ? 'var(--color-ion-3)' : 'var(--color-warn)';

  return (
    <details
      className="border-b px-5 py-3"
      style={{ borderColor: 'var(--color-border)' }}
      open={naFaixaDeOrigem.length > 0}
    >
      <summary
        className="flex cursor-pointer items-center gap-2 text-[10px] uppercase tracking-[0.24em]"
        style={{ color: 'var(--color-fg-subtle)', fontFamily: 'var(--font-display)' }}
      >
        <AlertTriangle size={12} style={{ color: cor }} />A sua paleta nestas peças
        {fora.length > 0 && (
          <span style={{ color: cor }}>
            · {conta(fora.length, 'peça não veste tudo', 'peças não vestem tudo')}
          </span>
        )}
      </summary>

      {/* Teto com rolagem própria: um kit de vinte peças com metade fora da
          marca faria a lista empurrar as colunas do editor para fora da moldura
          de 88vh, e a pessoa perderia de vista justamente as peças. */}
      <ul className="mt-3 max-h-[220px] space-y-2 overflow-y-auto">
        {fora.map((p) => (
          <li
            key={p.id}
            className="flex flex-wrap items-start justify-between gap-2 border-b pb-2 last:border-b-0"
            style={{ borderColor: 'var(--color-border)' }}
          >
            <div className="min-w-0 flex-1">
              <div className="text-[12px]" style={{ color: 'var(--color-fg)' }}>
                {p.nome}
                <span className="ds-data ml-2 text-[11px]" style={{ color: cor }}>
                  {p.taxa === null ? 'sem medida' : `veste ${pctInteiro(p.taxa)}`}
                </span>
              </div>
              <div
                className="mt-0.5 text-[11px] leading-relaxed"
                style={{ color: 'var(--color-fg-muted)' }}
              >
                {p.taxa === null
                  ? 'Ou esta peça não trouxe folha de estilo própria, ou a folha não abriu. Não dá para dizer o que ela vai vestir.'
                  : `${p.alcancavel} de ${p.total} cores aceitam a sua paleta. Fica de fora: ${linhaDeMotivos(p.motivos)}.`}
              </div>
            </div>
            <button
              type="button"
              onClick={() => aoTirar(p.id)}
              className="ds-tag shrink-0 rounded-none border px-2.5 py-1 text-[11px]"
              style={{ borderColor: 'var(--color-border)', color: 'var(--color-fg-muted)' }}
              title={`Tirar "${p.nome}" do kit`}
            >
              Tirar do kit
            </button>
          </li>
        ))}
      </ul>

      {naoMedidas.length > 0 && (
        <p className="mt-2 text-[11px] leading-relaxed" style={{ color: 'var(--color-fg-subtle)' }}>
          {conta(naoMedidas.length, 'peça entrou agora', 'peças entraram agora')} e ainda
          {naoMedidas.length === 1 ? ' não passou' : ' não passaram'} pela medição. Salve o kit e eu
          meço.
        </p>
      )}

      <p className="mt-2 text-[11px] leading-relaxed" style={{ color: 'var(--color-fg-subtle)' }}>
        Chamo de cores fixas abaixo de {pctInteiro(LIMIAR_DE_ALCANCE.origem)} de alcance, porque ali
        a peça é a de origem pintada por fora, e considero que veste a marca a partir de{' '}
        {pctInteiro(LIMIAR_DE_ALCANCE.veste)}, onde o que sobra é detalhe do tipo borda e barra de
        rolagem.{' '}
        <button
          type="button"
          onClick={aoVerPrevia}
          className="underline underline-offset-2"
          style={{ color: 'var(--color-fg-muted)' }}
        >
          Abra "Como vai ficar" e escolha o projeto
        </button>{' '}
        para ver as peças com a sua cor antes de gerar.
      </p>
    </details>
  );
}
