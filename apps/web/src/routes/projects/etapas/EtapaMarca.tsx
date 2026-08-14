import { ConviteOrbisCriativos } from '@/components/ConviteOrbisCriativos';
import { api } from '@/lib/api';
import {
  type MarcaSubId,
  STATUS_LABEL,
  type SecaoInfo,
  type SecaoStatus,
  marcaSectionStatus,
} from '@/lib/generator-sections';
import { toast } from '@/lib/toast';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ChevronRight, Sparkles, X } from 'lucide-react';
import { useState } from 'react';
import type { WizardBranding } from '../partes';
import { PainelContato } from './marca/PainelContato';
import { PainelMarca } from './marca/PainelMarca';
import { PainelPaleta } from './marca/PainelPaleta';
import { PainelRedes } from './marca/PainelRedes';
import { PainelTipografia } from './marca/PainelTipografia';
import { PainelVoz } from './marca/PainelVoz';

/**
 * A etapa "Marca" como BANCADA: uma coluna de instrumentos fechados, e um
 * aberto por vez.
 *
 * A versão anterior punha os seis painéis abertos numa grade de duas colunas,
 * com o argumento de que ver tudo de uma vez evita a caça ao painel escondido.
 * O argumento tem um lado certo e um errado, e o dono nomeou o errado: com tudo
 * aberto ao mesmo tempo, nada tem peso maior que nada. Três a seis campos por
 * bloco, seis blocos, nenhum indicando por onde começar nem o que é obrigatório.
 * Uma tela em que tudo tem a mesma importância não tem hierarquia, e sem
 * hierarquia até uma paleta vibrante lê como morta — que foi a queixa exata.
 *
 * Fechados, os instrumentos mostram só o que importa para decidir onde mexer: o
 * nome, o estado e o resumo do que já está preenchido. Aberto, o painel tem a
 * largura toda para o preview conviver com os controles, em vez de disputar
 * meia coluna.
 *
 * Nada do estado, do salvamento ou dos painéis mudou: o que muda é quantos
 * falam ao mesmo tempo.
 */

type Instrumento = { id: MarcaSubId; nome: string; oQueFaz: string };

const INSTRUMENTOS: readonly Instrumento[] = [
  { id: 'marca', nome: 'Marca', oQueFaz: 'O nome que vai no site e os logos' },
  { id: 'voz', nome: 'Voz da marca', oQueFaz: 'Como os textos falam com quem lê' },
  { id: 'paleta', nome: 'Paleta', oQueFaz: 'As cores que o site inteiro usa' },
  { id: 'tipografia', nome: 'Tipografia', oQueFaz: 'As fontes de título e de corpo' },
  { id: 'contato', nome: 'Contato', oQueFaz: 'Email, telefone e a chamada principal' },
  { id: 'redes', nome: 'Redes', oQueFaz: 'Os perfis que aparecem no rodapé' },
];

export function StepMarca({
  branding,
  setB,
  projectId,
}: {
  branding: WizardBranding;
  setB: (p: Partial<WizardBranding>) => void;
  projectId: string | null;
}) {
  const status = marcaSectionStatus(branding);
  const [aberto, setAberto] = useState<MarcaSubId | null>(null);
  const [nicho, setNicho] = useState('');
  const qc = useQueryClient();

  // Marca automática para TESTES de geração: o servidor cria a identidade
  // inteira (receita curada, dirigida pelo nicho quando informado) e as mídias
  // dela: logos + imagens POR SEÇÃO, na conta que cada seção aceita. O patch
  // entra pelo mesmo setB dos painéis, e o autosave grava como se a pessoa
  // tivesse preenchido.
  const marcaAutomatica = useMutation({
    mutationFn: () => {
      if (projectId === null)
        throw new Error('Salve o projeto primeiro: a mídia precisa de um lugar.');
      return api.criarMarcaAutomatica(projectId, nicho.trim() === '' ? undefined : nicho.trim());
    },
    onSuccess: ({ branding: b, media }) => {
      setB(b);
      qc.invalidateQueries({ queryKey: ['project', projectId] });
      toast.ok(
        `Criei a marca "${b.brandName}" com ${media.length} mídia(s), incluindo as das seções. Revise os painéis.`,
      );
    },
    onError: (e) => toast.erro(e instanceof Error ? e.message : 'Não consegui criar a marca.'),
  });

  const painel = (id: MarcaSubId) => {
    switch (id) {
      case 'marca':
        return <PainelMarca branding={branding} setB={setB} projectId={projectId} />;
      case 'voz':
        return <PainelVoz branding={branding} setB={setB} />;
      case 'paleta':
        return <PainelPaleta branding={branding} setB={setB} />;
      case 'tipografia':
        return <PainelTipografia branding={branding} setB={setB} />;
      case 'contato':
        return <PainelContato branding={branding} setB={setB} />;
      case 'redes':
        return <PainelRedes branding={branding} setB={setB} />;
    }
  };

  if (aberto !== null) {
    const inst = INSTRUMENTOS.find((i) => i.id === aberto) as Instrumento;
    return (
      <div className="ds-fade-in">
        <div className="mb-5 flex items-center justify-between gap-4">
          <div className="min-w-0">
            <div className="ds-label">{inst.oQueFaz}</div>
            <h2
              className="mt-0.5 truncate text-[20px] font-medium"
              style={{ color: 'var(--color-fg)', fontFamily: 'var(--font-display)' }}
            >
              {inst.nome}
            </h2>
          </div>
          <button
            type="button"
            onClick={() => setAberto(null)}
            className="ds-tag flex shrink-0 items-center gap-2 rounded-none border px-3.5 py-2 text-[12px]"
            style={{ borderColor: 'var(--color-border-strong)', color: 'var(--color-fg)' }}
          >
            <X size={12} />
            Voltar para a lista
          </button>
        </div>
        <section className="ds-glass-static rounded-none p-5 md:p-6">{painel(aberto)}</section>
      </div>
    );
  }

  return (
    <div className="ds-fade-in mx-auto max-w-[760px]">
      <ConviteOrbisCriativos />
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={marcaAutomatica.isPending || projectId === null}
          onClick={() => marcaAutomatica.mutate()}
          className="flex items-center gap-2 rounded-none border px-3.5 py-2 text-[12px] uppercase tracking-wide transition-colors hover:border-[var(--color-signal)] disabled:opacity-50"
          style={{ borderColor: 'var(--color-border-strong)', color: 'var(--color-fg)' }}
          title={
            projectId === null
              ? 'Salve o projeto primeiro: a mídia precisa de um lugar.'
              : 'Preencho a bancada inteira com uma marca de teste e crio os logos e as imagens por seção.'
          }
        >
          <Sparkles size={12} />
          {marcaAutomatica.isPending ? 'Criando a marca…' : 'Criar uma marca para mim'}
        </button>
        <input
          type="text"
          value={nicho}
          onChange={(e) => setNicho(e.target.value)}
          placeholder="nicho do produto (opcional)"
          className="rounded-none border px-3 py-2 text-[12px] outline-none focus:border-[var(--color-signal)]"
          style={{
            borderColor: 'var(--color-border)',
            color: 'var(--color-fg)',
            background: 'transparent',
          }}
          title="Ex.: barbearia, cafeteria, app de treino. Dirige o nome, o logo e as mídias."
        />
        <span className="text-[12px]" style={{ color: 'var(--color-fg-muted)' }}>
          Identidade completa + mídias por seção, na conta que cada seção aceita.
        </span>
      </div>
      <p className="mb-4 text-[13px]" style={{ color: 'var(--color-fg-muted)' }}>
        Abra um de cada vez. O que o senhor deixar em branco eu resolvo com o kit, e a lista diz o
        que já está definido.
      </p>
      <div className="border-t" style={{ borderColor: 'var(--color-border)' }}>
        {INSTRUMENTOS.map((inst) => (
          <LinhaDeInstrumento
            key={inst.id}
            instrumento={inst}
            info={status[inst.id]}
            onAbrir={() => setAberto(inst.id)}
          />
        ))}
      </div>
    </div>
  );
}

/**
 * Uma linha da bancada: nome, o que o instrumento faz, e o estado da medição.
 *
 * O resumo à direita é o que dispensa abrir: "Marca Teste · 2 logos" responde a
 * pergunta sem clique nenhum. Quando não há nada definido, o texto diz o que
 * acontece se ficar assim — é a pergunta que trava quem está preenchendo, e
 * ficar em silêncio sobre ela empurra a pessoa a abrir os seis painéis para
 * conferir.
 */
function LinhaDeInstrumento({
  instrumento,
  info,
  onAbrir,
}: {
  instrumento: Instrumento;
  info: SecaoInfo;
  onAbrir: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onAbrir}
      className="flex w-full items-center gap-4 border-b px-4 py-4 text-left transition-colors duration-300 hover:bg-white/[0.03]"
      style={{ borderColor: 'var(--color-border)' }}
    >
      <StatusDot status={info.status} resumo={info.resumo} />
      <span className="min-w-0 flex-1">
        <span className="block text-[14px]" style={{ color: 'var(--color-fg)' }}>
          {instrumento.nome}
        </span>
        <span className="block text-[11px]" style={{ color: 'var(--color-fg-subtle)' }}>
          {instrumento.oQueFaz}
        </span>
      </span>
      <span
        className="ds-data hidden max-w-[240px] shrink-0 truncate text-[11px] sm:block"
        style={{
          color: info.status === 'configurado' ? 'var(--color-ion-3)' : 'var(--color-fg-subtle)',
        }}
      >
        {info.resumo}
      </span>
      <ChevronRight size={14} className="shrink-0" style={{ color: 'var(--color-fg-subtle)' }} />
    </button>
  );
}

/** Ponto de status: não depende só de cor — tem título/aria com o rótulo textual. */
function StatusDot({ status, resumo }: { status: SecaoStatus; resumo: string }) {
  const cor =
    status === 'configurado'
      ? 'var(--color-signal)'
      : // `parcial` e `padrao` são "tem algo, mas não é escolha sua": ficam entre
        // o aceso e o apagado, e o resumo ao lado diz o que falta.
        status === 'parcial' || status === 'padrao'
        ? 'var(--color-fg-subtle)'
        : status === 'opcional'
          ? 'var(--color-fg-subtle)'
          : 'var(--color-border-strong)';
  const rotulo = status === 'configurado' ? resumo : `${STATUS_LABEL[status]}: ${resumo}`;
  return (
    <span
      title={rotulo}
      aria-label={rotulo}
      className="inline-block h-[7px] w-[7px] shrink-0 rounded-full"
      style={{
        backgroundColor: cor,
        boxShadow: status === 'configurado' ? '0 0 8px rgba(34,211,238,0.6)' : undefined,
      }}
    />
  );
}
