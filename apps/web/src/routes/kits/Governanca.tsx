import { Select } from '@/components/seletores';
import { type KitRecord, api } from '@/lib/api';
import { cn } from '@/lib/cn';
import { TRATAMENTO, conta } from '@/lib/orbis';
import { useNomeDaOrigem } from '@/lib/origem';
import { REGRA_EXPLICA, regraDaCategoria, rotuloDaCategoria } from '@ds/shared/schemas';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, Compass, Lock, Shuffle } from 'lucide-react';

/**
 * As três zonas de um kit.
 *
 * O kit era uma lista ordenada, e a tela mostrava uma lista. Mas as peças de um
 * kit não são todas iguais: umas dão a língua do site, outras precisam vir de um
 * lugar só, e outras são justamente onde a mistura é o produto. Mostrar as três
 * do mesmo jeito é o que fazia o kit parecer um monte de peças.
 *
 * | zona        | regra                    | por quê |
 * |-------------|--------------------------|---------|
 * | Base        | uma captura              | duas escalas não alinham |
 * | Peças       | uma captura por categoria| todos os botões de um lugar |
 * | Composição  | livre                    | hero de um, preços de outro |
 *
 * A tela NÃO corrige nada sozinha. Kit montado antes desta camada pode estar
 * fora da regra, e as violações aparecem por extenso — quem decide é a pessoa.
 * Só o servidor recusa, e só no momento de gravar.
 */
export function Governanca({
  kit,
  aoMudar,
  salvando,
}: {
  kit: KitRecord;
  aoMudar: (patch: {
    origemBase?: string | null;
    origemPorCategoria?: Record<string, string>;
  }) => void;
  salvando?: boolean;
}) {
  const nomeDaOrigem = useNomeDaOrigem();
  const sistemas = useQuery({ queryKey: ['design-systems'], queryFn: api.listDesignSystems });

  // As origens que este kit REALMENTE usa. Oferecer o acervo inteiro deixaria
  // escolher uma captura que não tem peça nenhuma aqui dentro.
  const origensDoKit = [
    ...new Set(kit.components.map((c) => c.designSystemId).filter((x): x is string => x != null)),
  ];

  const categoriasDePeca = [
    ...new Set(
      kit.components
        .map((c) => c.category)
        .filter((cat) => regraDaCategoria(cat) === 'origem-por-categoria'),
    ),
  ].sort();

  const opcoesDeOrigem = origensDoKit.map((id) => ({ valor: id, rotulo: nomeDaOrigem(id) }));

  return (
    <div className="flex flex-col gap-4">
      {kit.violacoes.length > 0 && (
        <div
          className="flex items-start gap-2 rounded-none border px-3.5 py-3 text-[12.5px] leading-relaxed"
          style={{
            borderColor: 'rgba(245,158,11,0.45)',
            backgroundColor: 'rgba(245,158,11,0.1)',
            color: 'var(--color-fg)',
          }}
        >
          <AlertTriangle
            size={13}
            className="mt-0.5 shrink-0"
            style={{ color: 'var(--color-warn)' }}
          />
          <div className="min-w-0">
            <div>
              {conta(kit.violacoes.length, 'peça está', 'peças estão')} fora da regra deste kit,{' '}
              {TRATAMENTO}.
            </div>
            <ul className="mt-1.5 space-y-1" style={{ color: 'var(--color-fg-muted)' }}>
              {kit.violacoes.slice(0, 4).map((v) => (
                <li key={v.componentId}>{v.motivo}</li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {/* ── Zona 1: a base ─────────────────────────────────────────────── */}
      <Zona
        icone={<Compass size={12} />}
        titulo="Base"
        regra={REGRA_EXPLICA['origem-unica']}
        detalhe="Dela vêm o espaçamento, o layout, o raio, a sombra e o movimento. A cor e a tipografia são da sua marca, sempre."
      >
        <div className="max-w-[320px]">
          <Select
            rotulo="Captura que dá o ritmo do kit"
            valor={kit.governanca.origemBase ?? ''}
            aoMudar={(v) => aoMudar({ origemBase: v === '' ? null : v })}
            desabilitado={salvando === true || opcoesDeOrigem.length === 0}
            opcoes={[{ valor: '', rotulo: 'em aberto — nenhuma escolhida' }, ...opcoesDeOrigem]}
          />
        </div>
      </Zona>

      {/* ── Zona 2: as peças, uma origem por categoria ─────────────────── */}
      <Zona
        icone={<Lock size={12} />}
        titulo="Peças"
        regra={REGRA_EXPLICA['origem-por-categoria']}
        detalhe="Botão, card, campo, navegação. Misturar origens aqui é o que vira bagunça — então eu recuso."
      >
        {categoriasDePeca.length === 0 ? (
          <p className="text-[12.5px]" style={{ color: 'var(--color-fg-subtle)' }}>
            Este kit ainda não tem peça nenhuma dessas categorias.
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {categoriasDePeca.map((cat) => {
              const daCategoria = kit.components.filter((c) => c.category === cat);
              const origens = [...new Set(daCategoria.map((c) => c.designSystemId))];
              return (
                <div key={cat} className="flex flex-wrap items-center gap-3">
                  <span
                    className="w-[110px] shrink-0 text-[13px]"
                    style={{ color: 'var(--color-fg)' }}
                  >
                    {rotuloDaCategoria(cat)}
                  </span>
                  <div className="min-w-[200px] flex-1">
                    <Select
                      rotulo={`Captura de ${rotuloDaCategoria(cat)}`}
                      valor={kit.governanca.origemPorCategoria[cat] ?? ''}
                      aoMudar={(v) => {
                        const mapa = { ...kit.governanca.origemPorCategoria };
                        if (v === '') delete mapa[cat];
                        else mapa[cat] = v;
                        aoMudar({ origemPorCategoria: mapa });
                      }}
                      desabilitado={salvando === true}
                      opcoes={[
                        {
                          valor: '',
                          rotulo: `livre — hoje ${conta(origens.length, 'origem', 'origens')}`,
                        },
                        ...opcoesDeOrigem,
                      ]}
                    />
                  </div>
                  <span className="ds-data text-[11px]" style={{ color: 'var(--color-fg-subtle)' }}>
                    {conta(daCategoria.length, 'peça', 'peças')}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </Zona>

      {/* ── Zona 3: composição livre ───────────────────────────────────── */}
      <Zona
        icone={<Shuffle size={12} />}
        titulo="Composição"
        regra={REGRA_EXPLICA.livre}
        detalhe="Dobras e efeitos. Abertura de um site, preços de outro, parallax de um terceiro — é para isto que o app existe."
      >
        <ListaDeLivres kit={kit} nomeDaOrigem={nomeDaOrigem} />
      </Zona>

      {sistemas.isError && (
        <p className="text-[12px]" style={{ color: 'var(--color-fg-subtle)' }}>
          Não consegui ler os nomes das capturas agora. As regras continuam valendo.
        </p>
      )}
    </div>
  );
}

function Zona({
  icone,
  titulo,
  regra,
  detalhe,
  children,
}: {
  icone: React.ReactNode;
  titulo: string;
  regra: string;
  detalhe: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-none border" style={{ borderColor: 'var(--color-border)' }}>
      <header className="border-b px-4 py-3" style={{ borderColor: 'var(--color-border)' }}>
        <div className="flex items-center gap-2">
          <span style={{ color: 'var(--color-ion-4)' }}>{icone}</span>
          <span
            className="text-[13px] font-medium"
            style={{ color: 'var(--color-fg)', fontFamily: 'var(--font-display)' }}
          >
            {titulo}
          </span>
          <span className="ds-label">{regra}</span>
        </div>
        <p className="mt-1 text-[12px] leading-relaxed" style={{ color: 'var(--color-fg-muted)' }}>
          {detalhe}
        </p>
      </header>
      <div className="p-4">{children}</div>
    </section>
  );
}

/** As peças que não têm regra: mostradas com a origem, sem seletor nenhum. */
function ListaDeLivres({
  kit,
  nomeDaOrigem,
}: {
  kit: KitRecord;
  nomeDaOrigem: (id: string | null | undefined) => string;
}) {
  const livres = kit.components.filter((c) => regraDaCategoria(c.category) === 'livre');
  if (livres.length === 0) {
    return (
      <p className="text-[12.5px]" style={{ color: 'var(--color-fg-subtle)' }}>
        Nenhuma dobra nem efeito neste kit ainda.
      </p>
    );
  }
  return (
    <div className="flex flex-wrap gap-2">
      {livres.map((c) => (
        <span
          key={c.id}
          className={cn(
            'ds-tag flex items-center gap-1.5 rounded-none border px-2.5 py-1 text-[11.5px]',
          )}
          style={{ borderColor: 'var(--color-border)', color: 'var(--color-fg-muted)' }}
          title={`${rotuloDaCategoria(c.category)} · ${nomeDaOrigem(c.designSystemId)}`}
        >
          <span style={{ color: 'var(--color-fg)' }}>{c.name}</span>
          <span className="ds-data text-[10px]" style={{ color: 'var(--color-ion-4)' }}>
            {nomeDaOrigem(c.designSystemId)}
          </span>
        </span>
      ))}
    </div>
  );
}
