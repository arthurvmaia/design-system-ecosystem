import { ConfirmarAcaoCara } from '@/components/ConfirmarAcaoCara';
import { Mascote } from '@/components/Mascote';
import { type KitAutomaticoSugestao, PrecisaDaSenhaDeAcao, api } from '@/lib/api';
import { TRATAMENTO } from '@/lib/orbis';
import { toast } from '@/lib/toast';
import { useReveal } from '@/lib/use-reveal';
import { OBJETIVOS, type ObjetivoDoSite } from '@ds/shared/schemas';
import { useMutation } from '@tanstack/react-query';
import { ArrowRight, Zap } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';

/**
 * A VIA EXPRESSA: para quem não quer as etapas e quer clicar para ver o site.
 *
 * Mora entre o Início e a Extração de propósito: é a segunda pergunta que o
 * app faz ("quer o caminho completo ou o atalho?"), antes de qualquer tela de
 * trabalho. Um pedido só faz o que as telas fazem separado, na mesma ordem:
 * monta o kit pela sequência do objetivo, cria o projeto com essa estrutura,
 * veste a marca automática (mídias por seção incluídas) e dispara a geração.
 *
 * O botão exige a credencial de ação: um clique que faz três coisas caras
 * merece a mesma assinatura que cada uma delas exigiria sozinha.
 */

type Resultado = {
  projectId: string;
  marca: string;
  midias: number;
  passos: KitAutomaticoSugestao['passos'];
  avisos: string[];
  entrega: 'fila' | 'tarefa';
};

export function ExpressoPage() {
  const [objetivo, setObjetivo] = useState<ObjetivoDoSite | null>(null);
  const [nicho, setNicho] = useState('');
  const [marca, setMarca] = useState('');
  const [nome, setNome] = useState('');
  const [pedindoSenha, setPedindoSenha] = useState(false);
  const [erroDaSenha, setErroDaSenha] = useState<string | null>(null);
  const [resultado, setResultado] = useState<Resultado | null>(null);

  useReveal([resultado]);

  const disparar = useMutation({
    mutationFn: async (senhaDeAcao?: string) => {
      if (objetivo === null) throw new Error('Escolha o objetivo do site primeiro.');
      const prep = await api.expresso(
        {
          objetivo,
          nicho: nicho.trim() === '' ? undefined : nicho.trim(),
          marca: marca.trim() === '' ? undefined : marca.trim(),
          nome: nome.trim() === '' ? undefined : nome.trim(),
        },
        senhaDeAcao,
      );
      const geracao = await api.generateProject(prep.projectId, senhaDeAcao);
      return { prep, geracao };
    },
    onSuccess: ({ prep, geracao }) => {
      setPedindoSenha(false);
      setErroDaSenha(null);
      setResultado({
        projectId: prep.projectId,
        marca: prep.marca,
        midias: prep.midias,
        passos: prep.passos,
        avisos: prep.avisos,
        entrega: 'queued' in geracao ? 'fila' : 'tarefa',
      });
    },
    onError: (e) => {
      if (e instanceof PrecisaDaSenhaDeAcao) {
        setErroDaSenha(pedindoSenha ? e.message : null);
        setPedindoSenha(true);
        return;
      }
      setPedindoSenha(false);
      toast.erro(e instanceof Error ? e.message : 'Não consegui abrir a via expressa.');
    },
  });

  const objetivos = Object.keys(OBJETIVOS) as ObjetivoDoSite[];

  return (
    <div className="mx-auto max-w-[860px] px-4 py-10 sm:px-8">
      <div className="ds-slide-up flex items-center gap-3">
        <span className="ds-label" style={{ color: 'var(--color-ion-4)' }}>
          via expressa
        </span>
        <span className="ds-hairline flex-1" aria-hidden />
      </div>

      <div className="mt-6 flex items-start gap-4">
        <Mascote tamanho={64} girando={disparar.isPending} className="shrink-0" />
        <div className="min-w-0">
          <h1
            className="ds-slide-up text-[24px] font-medium leading-tight sm:text-[32px]"
            style={{ color: 'var(--color-fg)', fontFamily: 'var(--font-display)' }}
          >
            Sem etapas: eu monto, {TRATAMENTO}.
          </h1>
          <p
            className="mt-3 max-w-[62ch] text-[14px] leading-[1.7]"
            style={{ color: 'var(--color-fg-muted)' }}
          >
            Me diga o objetivo e, se quiser, o nicho. Eu escolho as peças da Biblioteca que
            combinam, monto o kit na ordem certa, crio uma marca de teste com logos e imagens por
            seção, e já disparo a geração do site. Tudo fica salvo como kit e projeto normais:
            depois o senhor troca a marca, as peças e o texto quando quiser.
          </p>
        </div>
      </div>

      {resultado === null ? (
        <>
          <div className="mt-8">
            <span className="ds-label">1 · qual é o objetivo do site?</span>
            <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
              {objetivos.map((o) => (
                <button
                  key={o}
                  type="button"
                  onClick={() => setObjetivo(o)}
                  aria-pressed={objetivo === o}
                  className="rounded-none border px-4 py-3 text-left transition-colors hover:border-[var(--color-signal)]"
                  style={{
                    borderColor: objetivo === o ? 'var(--color-primary)' : 'var(--color-border)',
                    color: 'var(--color-fg)',
                  }}
                >
                  <span className="block text-[13px] font-medium">{OBJETIVOS[o].rotulo}</span>
                  <span
                    className="mt-1 block text-[12px]"
                    style={{ color: 'var(--color-fg-muted)' }}
                  >
                    {OBJETIVOS[o].explica}
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <span className="ds-label">2 · nicho do produto (opcional)</span>
              <input
                type="text"
                value={nicho}
                onChange={(e) => setNicho(e.target.value)}
                placeholder="ex.: barbearia, cafeteria, app de treino"
                className="mt-2 w-full rounded-none border px-3 py-2 text-[13px] outline-none focus:border-[var(--color-signal)]"
                style={{
                  borderColor: 'var(--color-border)',
                  color: 'var(--color-fg)',
                  background: 'transparent',
                }}
              />
            </div>
            <div>
              <span className="ds-label">3 · nome da marca (opcional)</span>
              <input
                type="text"
                value={marca}
                onChange={(e) => setMarca(e.target.value)}
                placeholder="dele saem o logo e as imagens"
                className="mt-2 w-full rounded-none border px-3 py-2 text-[13px] outline-none focus:border-[var(--color-signal)]"
                style={{
                  borderColor: 'var(--color-border)',
                  color: 'var(--color-fg)',
                  background: 'transparent',
                }}
              />
            </div>
            <div>
              <span className="ds-label">4 · nome do projeto (opcional)</span>
              <input
                type="text"
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                placeholder="eu invento um se ficar vazio"
                className="mt-2 w-full rounded-none border px-3 py-2 text-[13px] outline-none focus:border-[var(--color-signal)]"
                style={{
                  borderColor: 'var(--color-border)',
                  color: 'var(--color-fg)',
                  background: 'transparent',
                }}
              />
            </div>
          </div>

          <button
            type="button"
            disabled={objetivo === null || disparar.isPending}
            onClick={() => disparar.mutate(undefined)}
            className="ds-btn ds-glow mt-8 inline-flex items-center gap-2 rounded-none px-6 py-3 text-[14px] font-medium disabled:opacity-40"
            style={{ backgroundColor: 'var(--color-primary)', color: 'var(--color-bone-1)' }}
          >
            <Zap size={14} />
            {disparar.isPending ? 'Montando tudo…' : 'Gerar meu site agora'}
          </button>
          <p className="mt-2 text-[12px]" style={{ color: 'var(--color-fg-subtle)' }}>
            Este botão pede a credencial de ação: ele monta kit, marca e dispara a geração de uma
            vez.
          </p>
        </>
      ) : (
        <div
          className="ds-fade-in mt-8 rounded-none border p-5"
          style={{ borderColor: 'var(--color-border)' }}
        >
          <h2 className="text-[16px] font-medium" style={{ color: 'var(--color-fg)' }}>
            Em andamento: criei a marca "{resultado.marca}" e{' '}
            {resultado.entrega === 'fila'
              ? 'o site entrou na fila de geração.'
              : 'já estou gerando o site.'}
          </h2>
          <p className="mt-2 text-[13px]" style={{ color: 'var(--color-fg-muted)' }}>
            {resultado.midias} mídia(s) de teste criadas. O kit e o projeto ficaram salvos: dá para
            ajustar qualquer coisa depois e gerar de novo.
          </p>
          <ul className="mt-3 space-y-0.5">
            {resultado.passos.map((p) => (
              <li
                key={`${p.papel}-${p.etapa}`}
                className="text-[12px]"
                style={{ color: 'var(--color-fg)' }}
              >
                <span style={{ color: 'var(--color-fg-muted)' }}>{p.etapa}:</span>{' '}
                {p.nome ?? (
                  <em style={{ color: 'var(--color-fg-muted)' }}>criada no estilo do kit</em>
                )}
              </li>
            ))}
          </ul>
          {resultado.avisos.map((a) => (
            <p key={a} className="mt-2 text-[12px]" style={{ color: 'var(--color-ion-3)' }}>
              {a}
            </p>
          ))}
          <div className="mt-4 flex flex-wrap gap-3">
            <Link
              to="/meus-projetos"
              className="ds-btn inline-flex items-center gap-2 rounded-none px-4 py-2 text-[13px]"
              style={{ backgroundColor: 'var(--color-primary)', color: 'var(--color-bone-1)' }}
            >
              Acompanhar em Meus sites
              <ArrowRight size={12} />
            </Link>
            <button
              type="button"
              onClick={() => setResultado(null)}
              className="px-3 py-2 text-[13px]"
              style={{ color: 'var(--color-fg-muted)' }}
            >
              montar outro
            </button>
          </div>
        </div>
      )}

      <ConfirmarAcaoCara
        aberto={pedindoSenha}
        oQueVaiFazer="Montar o kit, criar a marca e gerar o site, tudo de uma vez."
        ocupado={disparar.isPending}
        erro={erroDaSenha}
        aoConfirmar={(senha) => disparar.mutate(senha)}
        aoFechar={() => setPedindoSenha(false)}
      />
    </div>
  );
}
