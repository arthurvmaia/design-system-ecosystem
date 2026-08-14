import { api } from '@/lib/api';
import { conta } from '@/lib/orbis';
import { toast } from '@/lib/toast';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, ExternalLink, GraduationCap, Info } from 'lucide-react';

/**
 * As pendências dos SITES GERADOS: o que a regra de aceite não deixou passar.
 *
 * Mora dentro da tela de Pendências, ao lado dos segmentos que a extração
 * rejeitou. São a mesma área de exceção vista dos dois lados — o que a Galeria
 * não soube ler, e o que o site entregue ficou devendo. Criar uma segunda tela
 * com o mesmo nome teria dividido a atenção de quem procura o que resolver.
 *
 * O dono pediu isto junto com as regras: "o que não passar você vai estudar
 * e tentar passar, mas se não tiver como pode seguir e deixar ela na tela de
 * pendências". Ela é o oposto de esconder — o site sobe, e o que ele deve fica
 * visível até alguém resolver ou aceitar.
 *
 * Os dois estados são separados porque pedem coisas diferentes de quem lê:
 *
 * - **reprovou** é DEFEITO. Consertar o motor resolve para todos os sites, não
 *   só para aquele. É o que merece atenção primeiro, e por isso vem em cima.
 * - **pendente** é limite conhecido: uma cena que depende de runtime remoto
 *   proprietário não reproduz sozinha, e nenhum conserto muda isso. Fica
 *   declarado para ninguém descobrir no cliente.
 *
 * O botão "faça-me aprender" é o convite a tentar de novo com outra abordagem —
 * e ele existe em cada item, e não uma vez na tela, porque cada caso é um
 * problema diferente.
 */

type Veredito = { codigo: string; titulo: string; estado: string; motivo: string };
type ItemDePendencia = {
  projectId: string;
  projectName: string;
  versao: string;
  vereditos: Veredito[];
};

export function PendenciasDeSites() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['pendencias'],
    queryFn: () => api.pendencias(),
  });

  const aprender = useMutation({
    mutationFn: (v: { id: string; versao: string; codigo: string; motivo: string }) =>
      api.pedirAprendizado(v.id, v.versao, v.codigo, v.motivo),
    onSuccess: () => {
      toast.ok('Pedido na fila. Vou estudar este caso e tentar outra abordagem.');
      void qc.invalidateQueries({ queryKey: ['queue'] });
    },
    onError: (e) => toast.erro(e instanceof Error ? e.message : 'Não consegui registrar.'),
  });

  const itens = data?.itens ?? [];
  // Sem pendência nenhuma o bloco some: um cabeçalho anunciando o vazio ocuparia
  // espaço acima dos segmentos rejeitados, que é o que a pessoa veio ver.
  if (!isLoading && itens.length === 0) return null;
  const reprovados = itens.flatMap((i) =>
    i.vereditos.filter((v) => v.estado === 'reprovou').map((v) => ({ item: i, v })),
  );
  const pendentes = itens.flatMap((i) =>
    i.vereditos.filter((v) => v.estado === 'pendente').map((v) => ({ item: i, v })),
  );

  return (
    <div className="mx-auto max-w-4xl px-6 py-10">
      <h1 className="text-[22px] font-medium" style={{ color: 'var(--color-fg)' }}>
        Pendências
      </h1>
      <p
        className="mt-2 max-w-2xl text-[13px] leading-relaxed"
        style={{ color: 'var(--color-fg-muted)' }}
      >
        O que a conferência não deixou passar. Nada foi escondido: o site subiu e o que ele deve
        está aqui, até alguém resolver ou aceitar.
      </p>

      {isLoading && (
        <div className="mt-8 text-[13px]" style={{ color: 'var(--color-fg-subtle)' }}>
          Lendo o que cada site declarou…
        </div>
      )}

      {reprovados.length > 0 && (
        <Bloco
          titulo="Defeito"
          explica="Consertar o motor resolve para todos os sites, não só para este."
          cor="var(--color-signal)"
          Icone={AlertTriangle}
          quantos={reprovados.length}
        >
          {reprovados.map(({ item, v }) => (
            <Linha
              key={`${item.projectId}-${item.versao}-${v.codigo}`}
              item={item}
              v={v}
              ocupado={aprender.isPending}
              aoAprender={() =>
                aprender.mutate({
                  id: item.projectId,
                  versao: item.versao,
                  codigo: v.codigo,
                  motivo: v.motivo,
                })
              }
            />
          ))}
        </Bloco>
      )}

      {pendentes.length > 0 && (
        <Bloco
          titulo="Limite declarado"
          explica="Pode não ter conserto. Fica visível para ninguém descobrir no cliente."
          cor="var(--color-fg-muted)"
          Icone={Info}
          quantos={pendentes.length}
        >
          {pendentes.map(({ item, v }) => (
            <Linha
              key={`${item.projectId}-${item.versao}-${v.codigo}`}
              item={item}
              v={v}
              ocupado={aprender.isPending}
              aoAprender={() =>
                aprender.mutate({
                  id: item.projectId,
                  versao: item.versao,
                  codigo: v.codigo,
                  motivo: v.motivo,
                })
              }
            />
          ))}
        </Bloco>
      )}
    </div>
  );
}

function Bloco({
  titulo,
  explica,
  cor,
  Icone,
  quantos,
  children,
}: {
  titulo: string;
  explica: string;
  cor: string;
  Icone: typeof AlertTriangle;
  quantos: number;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-8">
      <div className="flex items-center gap-2">
        <Icone size={14} style={{ color: cor }} />
        <h2 className="text-[14px] font-medium" style={{ color: 'var(--color-fg)' }}>
          {titulo}
        </h2>
        <span className="text-[11px]" style={{ color: 'var(--color-fg-subtle)' }}>
          {conta(quantos, 'item', 'itens')}
        </span>
      </div>
      <p className="mt-1 text-[12px]" style={{ color: 'var(--color-fg-subtle)' }}>
        {explica}
      </p>
      <div className="mt-3 space-y-2">{children}</div>
    </section>
  );
}

function Linha({
  item,
  v,
  ocupado,
  aoAprender,
}: {
  item: ItemDePendencia;
  v: Veredito;
  ocupado: boolean;
  aoAprender: () => void;
}) {
  return (
    <div
      className="ds-glass-static rounded-lg p-3.5"
      style={{ border: '1px solid rgba(255,255,255,0.06)' }}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span
          className="ds-data px-1.5 py-px text-[10px] uppercase tracking-[0.1em]"
          style={{ color: 'var(--color-fg-muted)', border: '1px solid currentColor' }}
        >
          {v.codigo}
        </span>
        <span className="text-[13px] font-medium" style={{ color: 'var(--color-fg)' }}>
          {v.titulo}
        </span>
        <span className="text-[11px]" style={{ color: 'var(--color-fg-subtle)' }}>
          {item.projectName}
        </span>
      </div>
      <p className="mt-1.5 text-[12px] leading-relaxed" style={{ color: 'var(--color-fg-muted)' }}>
        {v.motivo}
      </p>
      <div className="mt-2.5 flex items-center gap-2">
        <button
          type="button"
          disabled={ocupado}
          onClick={aoAprender}
          className="ds-btn ds-glow-border flex items-center gap-1.5 rounded-none px-3 py-1.5 text-[12px] disabled:opacity-40"
          style={{ backgroundColor: 'rgba(255,255,255,0.04)', color: 'var(--color-fg)' }}
        >
          <GraduationCap size={12} />
          Faça-me aprender
        </button>
        <a
          href={`/site/${item.projectId}/${encodeURIComponent(item.versao)}/index.html`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 text-[12px] transition-colors hover:text-[var(--color-fg)]"
          style={{ color: 'var(--color-fg-muted)' }}
        >
          <ExternalLink size={12} />
          Ver o site
        </a>
      </div>
    </div>
  );
}
