import { ConfirmarAcaoCara } from '@/components/ConfirmarAcaoCara';
import { Mascote } from '@/components/Mascote';
import { PrecisaDaSenhaDeAcao, api } from '@/lib/api';
import { useChaveDeEnvio } from '@/lib/chave-de-envio';
import { loadFont } from '@/lib/font-loader';
import { TRATAMENTO } from '@/lib/orbis';
import { useExigeCredencialDeAcao } from '@/lib/sessao';
import { toast } from '@/lib/toast';
import { DirecaoManual } from '@/routes/criativos/DirecaoManual';
import {
  ROTULO_DO_FORMATO,
  VARIACOES_PADRAO,
  VOZ_POR_CAMPO,
  marcaHerdadaDeProjetos,
  vozDaIssue,
} from '@/routes/criativos/partes';
import { SecaoCabecalho } from '@/routes/projects/etapas/marca/partes';
import { familyName } from '@ds/shared/fonts';
import {
  CAMPOS_DO_PEDIDO,
  CorDaPaleta,
  DIMENSAO_DO_FORMATO,
  FormatoCriativo,
  OrigemDaImagem,
  PedidoCriativo,
  TextoDaPeca,
  coresDerivadas,
  tetoComFolga,
} from '@ds/shared/schemas';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
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
import { Link } from 'react-router-dom';

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
 * O botão final REGISTRA o pedido: ele pede a credencial da ação, o servidor a
 * confere (428) e o job entra na fila com o id derivado da chave deste envio,
 * de modo que clicar duas vezes devolve o mesmo pedido em vez de abrir dois e
 * cobrar duas vezes. O custo mostrado é o MEDIDO, vindo do servidor.
 *
 * O upload também é real: o arquivo vai para o servidor no ato de escolher, e o
 * que fica guardado é o caminho que ele devolveu. Antes só o `file.name` ficava
 * na tela, e o pedido nascia citando um arquivo que não existia em lugar
 * nenhum: "upload vence geração" era uma promessa que só cairia na hora de
 * produzir, depois de a pessoa ter confirmado o gasto.
 *
 * Quem chega aqui vem de duas portas: o `ConviteOrbisCriativos` na etapa de
 * Marca do wizard (a porta que a espec previu no passo 6, já ligada) e a
 * navegação da própria casca (`CriativosShell`).
 */

// ── Vocabulário da tela ──────────────────────────────────────────────────────
// O que as DUAS telas da frente compartilham (rótulo de formato, custo de
// ensaio, voz das issues, marca herdada) mora em `criativos/partes.ts`: o
// expresso monta o MESMO pedido, e vocabulário digitado duas vezes diverge sem
// ninguém errar. Aqui fica só o que é exclusivo dos 4 passos.

const OBJETIVOS_DA_PECA = [
  'vender produto',
  'apresentar serviço',
  'captar contato',
  'divulgar novidade',
] as const;
type ObjetivoDaPeca = (typeof OBJETIVOS_DA_PECA)[number];

/** Espec, "assume e registra": objetivo vazio vira "apresentar" — e o resumo declara. */
const OBJETIVO_ASSUMIDO: ObjetivoDaPeca = 'apresentar serviço';

const PASSOS = ['o pedido', 'sua marca', 'a peça', 'conferir'] as const;

// ── A tela ───────────────────────────────────────────────────────────────────

export function CriativosPage() {
  const exigeCredencial = useExigeCredencialDeAcao();
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

  // passo 2 — a direção da marca
  const [marcaNome, setMarcaNome] = useState('');
  const [corPrincipal, setCorPrincipal] = useState('');
  const [editandoMarca, setEditandoMarca] = useState(false);
  const [marcaSemeada, setMarcaSemeada] = useState(false);
  /**
   * O resto da direção: o que a peça precisa saber para parecer daquela marca.
   *
   * A tela mostrava logotipo, paleta, tipografia e voz e escrevia "paleta,
   * tipografia e voz vêm junto". Não vinham: o pedido levava `marca` e
   * `corPrincipal`, e todo o resto morria aqui. Agora cada um destes viaja.
   */
  const [coresDeApoio, setCoresDeApoio] = useState<string[]>([]);
  const [fonteTitulos, setFonteTitulos] = useState('');
  const [tom, setTom] = useState('');
  const [estiloVisual, setEstiloVisual] = useState('');
  const [assinatura, setAssinatura] = useState('');
  /** O caminho que o servidor devolveu para o logotipo, na gaveta do rascunho. */
  const [logotipoNome, setLogotipoNome] = useState<string | null>(null);

  // passo 3 — a peça
  const [formato, setFormato] = useState<FormatoCriativo | null>(null);
  const [origem, setOrigem] = useState<'upload' | 'gerar' | null>(null);
  /**
   * O caminho que o SERVIDOR devolveu depois de receber o arquivo.
   *
   * Guardar `file.name` era o defeito: o pedido nascia citando um arquivo que
   * não existia em lugar nenhum, e a promessa "upload vence geração" só cairia
   * na hora de produzir, depois de a pessoa já ter confirmado o gasto.
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
  const [erroDaSenha, setErroDaSenha] = useState<string | null>(null);
  /**
   * A chave DESTE envio. Ela viaja com o pedido e o servidor deriva o id do job
   * dela, então repetir o clique devolve o mesmo job em vez de abrir outro e
   * cobrar duas vezes. Só troca quando um envio dá certo: enquanto a pessoa
   * corrige e tenta de novo, continua sendo o mesmo pedido.
   */
  const [chaveDeEnvio, renovarChaveDeEnvio] = useChaveDeEnvio('criativos:quatro-passos');
  const qc = useQueryClient();

  // A mesma api da tela de projetos: a marca vem preenchida de lá, com um
  // "mudar" discreto — não cobrar de quem já tem.
  const projetos = useQuery({ queryKey: ['projects'], queryFn: api.listProjects });

  // A marca herdada sai da MESMA função que o expresso usa: são dois caminhos
  // de tela, mas uma regra só de qual projeto empresta a marca.
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
    // As cores de apoio são o resto da paleta, na ordem do projeto. A principal
    // sai da lista: ela já tem dono, e guardá-la duas vezes é como as duas
    // cópias divergem.
    setCoresDeApoio(
      marcaDoProjeto.amostras
        .map((c) => c.hex)
        .filter((hex) => hex.toLowerCase() !== marcaDoProjeto.corPrimaria.toLowerCase()),
    );
    setFonteTitulos(marcaDoProjeto.fonteTitulos);
    // A voz vira UMA frase de direção. Ela guia quem escreve; nunca vira texto
    // na peça.
    setTom(
      [...marcaDoProjeto.tons, ...marcaDoProjeto.arquetipos, marcaDoProjeto.vozObservacao ?? '']
        .filter((p) => p.trim() !== '')
        .join(', '),
    );
    setMarcaSemeada(true);
  }, [marcaSemeada, marcaDoProjeto]);

  /**
   * O logotipo herdado do projeto vira arquivo na gaveta do rascunho.
   *
   * A tela conhece o logotipo por URL do projeto, e a composição precisa de um
   * arquivo dentro da pasta do job — é o que o contrato quer dizer com
   * "relativo à pasta do job". Buscar e reenviar usa o mesmo caminho já testado
   * do upload da peça, em vez de abrir um segundo jeito de um arquivo chegar.
   *
   * Falhar aqui não trava o pedido: a marca volta a assinar em texto, que é
   * como toda peça assinava antes. O que não pode é o pedido DIZER que tem
   * logotipo sem o arquivo ter chegado, e disso o servidor cuida.
   */
  useEffect(() => {
    const url = marcaDoProjeto?.logoUrl ?? null;
    if (url === null || editandoMarca || logotipoNome !== null) return;
    let cancelado = false;
    void (async () => {
      try {
        const res = await fetch(url, { credentials: 'include' });
        if (!res.ok) return;
        const blob = await res.blob();
        const nome = url.split('/').pop() ?? 'logotipo.png';
        const enviado = await api.subirArquivoCriativo(
          chaveDeEnvio,
          new File([blob], nome, { type: blob.type }),
          'logotipo',
        );
        if (!cancelado) setLogotipoNome(enviado.caminho);
      } catch {
        // Sem logotipo, a marca assina em texto. O passo 4 mostra qual dos dois
        // vai acontecer, então ninguém confirma achando outra coisa.
      }
    })();
    return () => {
      cancelado = true;
    };
  }, [marcaDoProjeto, editandoMarca, logotipoNome, chaveDeEnvio]);

  // A prévia da tipografia usa a fonte REAL do projeto. O font-loader deduplica
  // (pedir 2 vezes não repete <link>), e fonte fora do catálogo Google cai no
  // fallback da própria pilha: a prévia degrada, nunca quebra a tela.
  useEffect(() => {
    if (marcaDoProjeto === null) return;
    loadFont(marcaDoProjeto.fonteTitulos);
    loadFont(marcaDoProjeto.fonteCorpo);
  }, [marcaDoProjeto]);

  /**
   * O custo vem do servidor, que o lê da tabela MEDIDA. Ele não muda enquanto a
   * pessoa preenche o formulário, então uma hora de cache é folgado.
   */
  const custos = useQuery({
    queryKey: ['criativos', 'custos'],
    queryFn: api.custosCriativos,
    staleTime: 60 * 60 * 1000,
  });
  const porVariacao = tipo === null ? 0 : (custos.data?.porVariacao[tipo] ?? 0);
  const custoEstimado = porVariacao * VARIACOES_PADRAO;
  const tetoDoJob = tetoComFolga(porVariacao, VARIACOES_PADRAO);

  /**
   * Declarado ANTES de `montarPedido` de propósito: as pendências do passo 4
   * chamam `montarPedido()` durante o render, e uma const declarada depois
   * estouraria em zona morta — um erro que o TypeScript não acusa porque a
   * leitura acontece dentro de uma função.
   */
  const corValida = CorDaPaleta.shape.hex.safeParse(corPrincipal).success;

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
    tetoDeCreditos: tetoDoJob,
    estimativa: custoEstimado,
    // A peça é COMPOSTA por nós, e compor sem a cor da marca significaria
    // escolher uma. A tela já tinha a cor; ela só não viajava.
    corPrincipal: corValida ? corPrincipal : null,
    /**
     * A direção de marca. Cada campo só entra se tiver valor: string vazia
     * viraria "o cliente digitou nada", e o contrato trata ausência e vazio
     * como coisas diferentes de propósito.
     */
    direcao: {
      coresDeApoio: coresDeApoio.filter(
        (hex) => CorDaPaleta.shape.hex.safeParse(hex).success && hex !== corPrincipal,
      ),
      logotipo: logotipoNome,
      fonteTitulos: fonteTitulos.trim() === '' ? null : fonteTitulos.trim(),
      tom: tom.trim(),
      estiloVisual: estiloVisual.trim(),
      assinatura: assinatura.trim() === '' ? null : assinatura.trim(),
    },
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
      if (!CAMPOS_DO_PEDIDO.tipo.safeParse(tipo).success)
        m.push('Escolha entre imagem e vídeo: essa escolha muda todo o resto do pedido.');
    }
    if (p === 1) {
      const nome = CAMPOS_DO_PEDIDO.marca.safeParse(marcaNome.trim());
      if (!nome.success) {
        m.push(
          marcaNome.trim() === ''
            ? 'Preciso do nome da marca com a grafia exata: é ele que aparece na peça.'
            : (VOZ_POR_CAMPO.marca as string),
        );
      }
      // A cor só trava no caminho MANUAL: sem projeto de onde herdar a paleta,
      // ou com a pessoa editando por cima ("mudar") — a mesma condição do
      // expresso, senão a mesma regra trava numa tela e passa na outra. A espec
      // pede o mínimo de quem chega vazio: nome e uma cor.
      if (
        (marcaDoProjeto === null || editandoMarca) &&
        !CorDaPaleta.shape.hex.safeParse(corPrincipal).success
      )
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
      const rr = CAMPOS_DO_PEDIDO.restricoes.safeParse(restricoes.trim());
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
   * O arquivo vai para o servidor no ATO de escolher, e o que fica guardado é o
   * caminho que ele devolveu. O pedido passa a citar algo que existe.
   */
  const subirArquivo = useMutation({
    mutationFn: async (file: File) => await api.subirArquivoCriativo(chaveDeEnvio, file),
    onSuccess: (r) => setArquivoNome(r.caminho),
    onError: (e) => {
      setArquivoNome(null);
      toast.erro(e instanceof Error ? e.message : 'Não consegui receber o arquivo.');
    },
  });
  const subindoArquivo = subirArquivo.isPending;

  /**
   * O logotipo sobe pela MESMA rota do arquivo da peça, num papel diferente.
   *
   * Papéis separados porque cada um tem sua gaveta no rascunho: com um slot só,
   * mandar a foto apagaria a logo e o pedido nasceria prometendo uma marca que
   * não está lá.
   */
  const subirLogotipo = useMutation({
    mutationFn: async (file: File) =>
      await api.subirArquivoCriativo(chaveDeEnvio, file, 'logotipo'),
    onSuccess: (r) => setLogotipoNome(r.caminho),
    onError: (e) => {
      setLogotipoNome(null);
      toast.erro(e instanceof Error ? e.message : 'Não consegui receber o logotipo.');
    },
  });

  /**
   * Qual cor VAI virar o botão, pela mesma conta que o compositor usa.
   *
   * Sai do contrato, e não de uma segunda implementação aqui: a prévia que
   * promete uma cor e a peça que entrega outra é o defeito que só aparece
   * depois de pago.
   */
  const corDoBotao = useMemo(
    () => (corValida ? coresDerivadas(corPrincipal, coresDeApoio) : null),
    [corValida, corPrincipal, coresDeApoio],
  );

  /**
   * A credencial vai ao SERVIDOR, que é quem decide (428). O diálogo coletava a
   * senha e jogava fora o que foi digitado: o gesto existia e não valia nada.
   */
  const enviar = useMutation({
    mutationFn: async (senhaDeAcao?: string) =>
      await api.criarPedidoCriativo(chaveDeEnvio, montarPedido(), senhaDeAcao),
    onSuccess: (res) => {
      setConfirmando(false);
      setErroDaSenha(null);
      qc.invalidateQueries({ queryKey: ['queue'] });
      qc.invalidateQueries({ queryKey: ['criativos'] });
      const d = pedidoConferido === null ? null : DIMENSAO_DO_FORMATO[pedidoConferido.formato];
      toast.ok(
        res.repetido
          ? 'Este pedido já estava na fila: reaproveitei o mesmo, em vez de abrir outro e cobrar duas vezes.'
          : `Pedido na fila${d === null ? '' : ` (${d.largura}×${d.altura})`}. Quem produz é o estúdio, então ele não sai na hora: acompanhe em Minhas peças.`,
      );
      // Chave nova: o próximo envio é outro pedido, e não uma repetição deste.
      renovarChaveDeEnvio();
    },
    onError: (e) => {
      // 428 é o servidor pedindo a confirmação do gasto, não uma falha.
      if (e instanceof PrecisaDaSenhaDeAcao) {
        setErroDaSenha(e.message);
        setConfirmando(true);
        return;
      }
      setConfirmando(false);
      toast.erro(e instanceof Error ? e.message : 'Não consegui registrar o pedido.');
    },
  });

  const bordaDeChip = (ativo: boolean) => (ativo ? 'var(--color-primary)' : 'var(--color-border)');

  // A amostra que corresponde à cor eleita, para a tela dizer o NOME dela.
  // Cor digitada à mão no caminho manual pode não casar com amostra nenhuma;
  // nesse caso só o hex aparece.
  const amostraEleita =
    marcaDoProjeto?.amostras.find((c) => c.hex.toLowerCase() === corPrincipal.toLowerCase()) ??
    null;

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
        {/* O atalho é discreto de propósito: os 4 passos seguem sendo o caminho
            principal, e o expresso existe para o teste de 1 tela que o dono
            pediu, no molde da via expressa do design system. O rótulo diz o
            número (1 tela), não o adjetivo ("rápido"): é a régua da voz. */}
        <Link
          to="/criativos/expresso"
          className="text-[11px] underline underline-offset-2"
          style={{ color: 'var(--color-fg-muted)' }}
        >
          teste em 1 tela
        </Link>
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
          <span className="ds-label">o que você precisa?</span>
          <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
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

            {/*
              A terceira porta: quem AINDA NÃO TEM marca.

              Ela já existia, e não aqui: era uma faixa larga DEPOIS do objetivo
              da peça. A decisão anterior estava escrita e a razão dela continua
              certa — "uma marca não tem formato de canal, nem origem de imagem,
              nem copy: nada do que os passos 2 a 4 perguntam", então ela não
              pode ser um terceiro `tipo`, senão metade do wizard teria de se
              esconder conforme a escolha.

              O que mudou foi a evidência: o dono olhou esta grade, contou dois
              cartões e perguntou onde estava o terceiro. A faixa ficava abaixo
              da dobra e não era encontrada por quem chega sem marca — que é
              exatamente quem ela existe para atender. E o contrato já dizia onde
              ela deveria estar: "a porta fica no passo 1, ao lado de imagem e
              vídeo".

              Então ela sobe para a grade e continua sendo LINK, não escolha: a
              borda tracejada e a seta dizem que daqui se SAI, enquanto os dois
              cartões cheios dizem o que esta peça vai ser. A objeção antiga era
              ao terceiro TIPO, e essa continua valendo — este não é um.
            */}
            <Link
              to="/criativos/marca"
              className="flex items-start gap-3 rounded-none border border-dashed p-4 text-left transition-colors hover:border-[var(--color-signal)]"
              style={{ borderColor: 'var(--color-border)', background: 'transparent' }}
            >
              <span
                className="grid h-10 w-10 shrink-0 place-items-center"
                style={{ background: 'rgb(var(--acento) / 0.12)', color: 'rgb(var(--acento))' }}
                aria-hidden
              >
                <Sparkles size={18} strokeWidth={1.6} />
              </span>
              <span className="min-w-0">
                <span
                  className="block text-[14px] font-medium"
                  style={{ color: 'var(--color-fg)' }}
                >
                  Ainda não tenho marca
                </span>
                <span
                  className="mt-0.5 block text-[12px]"
                  style={{ color: 'var(--color-fg-muted)' }}
                >
                  Símbolo, logo, cores e a apresentação em PDF. Depois as peças saem dela.
                </span>
                <span
                  className="mt-1.5 inline-flex items-center gap-1 text-[12px]"
                  style={{ color: 'rgb(var(--acento))' }}
                >
                  Criar a marca
                  <ArrowRight size={13} strokeWidth={1.8} />
                </span>
              </span>
            </Link>
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
            /* O mesmo desenho da tela de Marca do wizard (painel de vidro,
               SecaoCabecalho por bloco), ADAPTADO ao propósito daqui: esta tela
               ESCOLHE a marca da peça e mostra o que vem junto. Editar marca é
               no wizard do projeto; por isso nenhum bloco tem campo de edição,
               e o único gesto é eleger a cor principal. */
            <div className="ds-glass-static rounded-none p-5 md:p-6">
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
                    className="block text-[16px] font-medium"
                    style={{ color: 'var(--color-fg)' }}
                  >
                    {marcaNome}
                  </span>
                  <span
                    className="mt-0.5 block text-[12px]"
                    style={{ color: 'var(--color-fg-muted)' }}
                  >
                    Trouxe do projeto "{marcaDoProjeto.projetoNome}": paleta, tipografia e voz vêm
                    junto. Editar a marca é no projeto; aqui ela só assina a peça.
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

              <div className="mt-5 border-t pt-5" style={{ borderColor: 'var(--color-border)' }}>
                <SecaoCabecalho
                  titulo="Paleta"
                  descricao="A paleta vem do projeto. Clique na cor que vai ser a principal da peça."
                />
                <div className="flex flex-wrap gap-2">
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
                <p className="ds-data mt-2 text-[11px]" style={{ color: 'var(--color-fg-subtle)' }}>
                  cor principal:{' '}
                  {amostraEleita !== null
                    ? `${amostraEleita.nome} · ${corPrincipal}`
                    : corPrincipal}
                </p>
              </div>

              <div className="mt-5 border-t pt-5" style={{ borderColor: 'var(--color-border)' }}>
                <SecaoCabecalho
                  titulo="Tipografia"
                  descricao="As 2 fontes do projeto: uma titula, a outra explica. A prévia abaixo usa a própria fonte."
                />
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <div
                    className="rounded-none border p-3"
                    style={{ borderColor: 'var(--color-border)' }}
                  >
                    <span className="text-[12px]" style={{ color: 'var(--color-fg-muted)' }}>
                      Títulos:{' '}
                      <strong style={{ color: 'var(--color-fg)' }}>
                        {familyName(marcaDoProjeto.fonteTitulos)}
                      </strong>
                    </span>
                    <div
                      className="mt-1.5 truncate text-[20px] leading-tight"
                      style={{ fontFamily: marcaDoProjeto.fonteTitulos, color: 'var(--color-fg)' }}
                    >
                      {marcaNome || marcaDoProjeto.brandName}
                    </div>
                  </div>
                  <div
                    className="rounded-none border p-3"
                    style={{ borderColor: 'var(--color-border)' }}
                  >
                    <span className="text-[12px]" style={{ color: 'var(--color-fg-muted)' }}>
                      Corpo:{' '}
                      <strong style={{ color: 'var(--color-fg)' }}>
                        {familyName(marcaDoProjeto.fonteCorpo)}
                      </strong>
                    </span>
                    <p
                      className="mt-1.5 text-[13px] leading-relaxed"
                      style={{
                        fontFamily: marcaDoProjeto.fonteCorpo,
                        color: 'var(--color-fg-muted)',
                      }}
                    >
                      O texto de apoio da peça fica assim.
                    </p>
                  </div>
                </div>
              </div>

              {/* A voz entra no resumo porque é o tom que guia o texto da peça.
                  Projeto antigo sem tons/arquétipos mostra a observação livre
                  (o `tone` legado migrado); sem nada, o bloco não aparece, em
                  vez de um painel vazio cobrando o que ninguém definiu. */}
              {(marcaDoProjeto.tons.length > 0 ||
                marcaDoProjeto.arquetipos.length > 0 ||
                marcaDoProjeto.vozObservacao !== null) && (
                <div className="mt-5 border-t pt-5" style={{ borderColor: 'var(--color-border)' }}>
                  <SecaoCabecalho
                    titulo="Voz"
                    descricao="O tom que guia o texto da peça. O primeiro de cada lista domina."
                  />
                  {(marcaDoProjeto.tons.length > 0 || marcaDoProjeto.arquetipos.length > 0) && (
                    <div className="flex flex-wrap gap-2">
                      {marcaDoProjeto.tons.map((t, i) => (
                        <span
                          key={`tom-${t}`}
                          title={i === 0 ? 'tom principal' : 'tom de apoio'}
                          className="ds-tag rounded-none border px-2.5 py-1 text-[12px]"
                          style={{
                            borderColor: i === 0 ? 'var(--color-signal)' : 'var(--color-border)',
                            color: i === 0 ? 'var(--color-fg)' : 'var(--color-fg-muted)',
                          }}
                        >
                          {t}
                        </span>
                      ))}
                      {marcaDoProjeto.arquetipos.map((a, i) => (
                        <span
                          key={`postura-${a}`}
                          title={i === 0 ? 'postura principal' : 'postura de apoio'}
                          className="ds-tag rounded-none border px-2.5 py-1 text-[12px]"
                          style={{
                            borderColor: 'var(--color-border)',
                            color: 'var(--color-fg-muted)',
                          }}
                        >
                          postura: {a}
                        </span>
                      ))}
                    </div>
                  )}
                  {marcaDoProjeto.vozObservacao !== null && (
                    <p
                      className="mt-2 text-[12px] leading-relaxed"
                      style={{ color: 'var(--color-fg-muted)' }}
                    >
                      "{marcaDoProjeto.vozObservacao}"
                    </p>
                  )}
                </div>
              )}
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
              <DirecaoManual
                corDoBotao={corDoBotao}
                coresDeApoio={coresDeApoio}
                setCoresDeApoio={setCoresDeApoio}
                logotipoNome={logotipoNome}
                subindoLogotipo={subirLogotipo.isPending}
                onLogotipo={(file) => subirLogotipo.mutate(file)}
                onTirarLogotipo={() => setLogotipoNome(null)}
                fonteTitulos={fonteTitulos}
                setFonteTitulos={setFonteTitulos}
                assinatura={assinatura}
                setAssinatura={setAssinatura}
                tom={tom}
                setTom={setTom}
                estiloVisual={estiloVisual}
                setEstiloVisual={setEstiloVisual}
                mostraEstilo={origem !== 'upload'}
              />
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
                {subindoArquivo ? 'Recebendo o arquivo…' : (arquivoNome ?? 'Escolher o arquivo')}
              </span>
              <input
                type="file"
                accept={midia.aceita}
                className="hidden"
                disabled={subindoArquivo}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f !== undefined) subirArquivo.mutate(f);
                }}
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
                {custos.isPending
                  ? 'Consultando o custo…'
                  : `${custoEstimado} créditos estimados · teto do job: ${tetoDoJob}`}
              </span>
              <p className="mt-0.5 text-[12px]" style={{ color: 'var(--color-fg-muted)' }}>
                {custos.data === undefined ? (
                  'Sem o custo medido eu não deixo confirmar: pedir sem saber quanto custa é o que este teto existe para impedir.'
                ) : (
                  <>
                    {tipo === 'video' ? custos.data.detalhe.video : custos.data.detalhe.imagem},
                    medido em {custos.data.medidoEm}. O teto tem folga de uma variação: é o tamanho
                    exato da tentativa a mais que você pode pedir depois de ver o resultado. Esta
                    tela ainda não cobra nada.
                  </>
                )}
              </p>
            </div>
            <span
              className="ds-tag rounded-none border px-2 py-0.5 text-[10px]"
              style={{ borderColor: 'rgb(var(--acento) / 0.5)', color: 'rgb(var(--acento))' }}
            >
              medido
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
              Este botão pede a credencial de ação e registra o pedido na fila. Quem produz é o
              estúdio, então a peça não sai na hora: ela aparece em Minhas peças quando ficar
              pronta.
            </p>
          </div>
        )}
      </div>

      <ConfirmarAcaoCara
        exigeCredencial={exigeCredencial}
        aberto={confirmando}
        oQueVaiFazer={
          pedidoConferido !== null
            ? `Produzir ${pedidoConferido.variacoes} variações de ${ROTULO_DO_FORMATO[pedidoConferido.formato]} para "${pedidoConferido.marca}". Estimativa: ${custoEstimado} créditos, com teto de ${tetoDoJob}.`
            : ''
        }
        ocupado={enviar.isPending}
        erro={erroDaSenha}
        aoConfirmar={(senha) => enviar.mutate(senha)}
        aoFechar={() => setConfirmando(false)}
      />
    </div>
  );
}
