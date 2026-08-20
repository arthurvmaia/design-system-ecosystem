import { homedir } from 'node:os';
import { isAbsolute, join, relative, resolve } from 'node:path';
import type { ComponentId, DesignSystemId, ProjectId, TaskId } from './ids.js';

/**
 * Contrato de storage do ecossistema.
 *
 * Toda pasta e arquivo do sistema é resolvido por esta camada.
 * Nunca hardcode paths fora daqui: se a raiz mudar (variável de ambiente,
 * futuro empacotamento Tauri), tudo continua funcionando.
 */

const DEFAULT_ROOT = join(homedir(), 'design-system-ecosystem');

export const getRoot = (): string => {
  return process.env.DS_ECOSYSTEM_ROOT ?? DEFAULT_ROOT;
};

// ── Guarda de id ───────────────────────────────────────────────────────────
/**
 * Um id só vira caminho de disco se tiver a FORMA de um id: prefixo do tipo e
 * miolo alfanumérico, nada mais. `..`, separador de caminho, barra que chegou
 * codificada na URL e foi decodificada pelo roteador — tudo reprova.
 *
 * A regra mora aqui, e não em cada rota, porque cada rota validando do próprio
 * jeito deixou quatro formatos coexistirem — e dois deles (`startsWith` e cast
 * puro) não barravam travessia. As funções de caminho abaixo RECUSAM id fora
 * da regra, então rota nova nasce protegida sem depender de disciplina.
 *
 * O comprimento fica livre de propósito: os ids reais são ULID de 26
 * caracteres, mas os testes usam ids curtos (`ds_A`) e um acervo importado
 * pode trazer ids de outra geração. O que protege o disco é o alfanumérico
 * ancorado: separador nenhum passa.
 */
export const ehDesignSystemId = (valor: string): valor is DesignSystemId =>
  /^ds_[A-Za-z0-9]+$/.test(valor);
export const ehProjectId = (valor: string): valor is ProjectId => /^prj_[A-Za-z0-9]+$/.test(valor);
export const ehComponentId = (valor: string): valor is ComponentId =>
  /^cmp_[A-Za-z0-9]+$/.test(valor);
export const ehTaskId = (valor: string): valor is TaskId => /^task_[A-Za-z0-9]+$/.test(valor);
/** Id de job da fila (`job_` + base36). Vira nome de arquivo em `queue/`. */
export const ehJobId = (valor: string): boolean => /^job_[A-Za-z0-9]+$/.test(valor);
/** Id de rascunho de criativo: onde o upload espera antes de existir job. */
export const ehRascunhoId = (valor: string): boolean => /^rasc_[A-Za-z0-9]+$/.test(valor);
/** Chave de segmento em disco: tanto `seg_<ulid>` quanto a pasta `seg_3` do bundle. */
export const ehChaveDeSegmento = (valor: string): boolean => /^seg_[A-Za-z0-9]+$/.test(valor);
/** Nome de versão gerada (`2026-07-29T02-16-11-833Z`): só caracteres de nome simples. */
export const ehNomeDeVersao = (valor: string): boolean =>
  /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(valor) && !valor.includes('..');

// ── Guarda de contenção ────────────────────────────────────────────────────
/**
 * O alvo ABSOLUTO está dentro da raiz ABSOLUTA?
 *
 * A conta é feita com `relative()`, e não com `startsWith()` de texto, por um
 * motivo que já estava vivo numa rota: `startsWith(raiz)` sem separador aprova
 * um IRMÃO com prefixo comum. Com a raiz em `criativos/job_ab`, o caminho
 * `criativos/job_abc/segredo.png` passa — são strings diferentes que começam
 * igual, e o disco não tem nada a ver com isso.
 *
 * A raiz não conta como estando dentro de si mesma: servir um diretório não é
 * servir um arquivo.
 *
 * O que ela NÃO faz: seguir link simbólico. Um link dentro da raiz apontando
 * para fora passa por aqui. Hoje nada no ecossistema cria link; se um dia
 * criar, esta função precisa de `realpathSync` e de decidir o que fazer quando
 * o alvo ainda não existe.
 */
export const estaContido = (raiz: string, alvo: string): boolean => {
  const rel = relative(resolve(raiz), resolve(alvo));
  return rel !== '' && !rel.startsWith('..') && !isAbsolute(rel);
};

/**
 * Resolve um caminho RELATIVO dentro de uma raiz, ou devolve `null` se ele
 * escapar.
 *
 * Existe para ser o único idioma de contenção do servidor. Havia quatro
 * escritos à mão — `vault`, `site` e `asset` conferiam com `relative()`, e
 * `criativos` conferia com `startsWith()` de texto. Quatro cópias de uma regra
 * de segurança acabam divergindo, e a que divergir primeiro é a que vaza.
 *
 * Recusa antes de resolver o que já se sabe errado: caminho vazio, caminho
 * absoluto, e qualquer segmento `..` — inclusive com barra invertida, que é o
 * separador do Windows e não seria pego por uma conta feita só com `/`.
 */
export const dentroDaRaiz = (raiz: string, relativo: string): string | null => {
  if (relativo === '') return null;
  if (isAbsolute(relativo)) return null;
  if (relativo.split(/[/\\]/).includes('..')) return null;
  const alvo = resolve(raiz, relativo);
  return estaContido(raiz, alvo) ? alvo : null;
};

const conferido = (valor: string, ok: boolean): string => {
  if (!ok) {
    throw new Error(
      `Recusei montar um caminho com "${valor}": não tem a forma de um id do ecossistema.`,
    );
  }
  return valor;
};

/** Arquivo do índice SQLite. */
export const dbPath = (): string => join(getRoot(), 'ecosystem.db');

/** Config JSON com preferências do usuário. */
export const configPath = (): string => join(getRoot(), 'ecosystem.config.json');

// ── Vault ──────────────────────────────────────────────────────────────────
export const vaultDir = (): string => join(getRoot(), 'vault');
export const vaultDsDir = (id: DesignSystemId): string =>
  join(vaultDir(), conferido(id, ehDesignSystemId(id)));
export const vaultSourceDir = (id: DesignSystemId): string => join(vaultDsDir(id), 'source');
export const vaultExtractedDir = (id: DesignSystemId): string => join(vaultDsDir(id), 'extracted');
/**
 * Saída do motor de exploração (`@ds/explorer`): o manifesto rico da captura por
 * navegador e os assets baixados. Fica separado de `extracted/` porque é
 * material de origem diferente — o snapshot instrumentado, não o HTML reescrito.
 */
export const vaultCaptureDir = (id: DesignSystemId): string => join(vaultDsDir(id), 'capture');
export const vaultCaptureManifest = (id: DesignSystemId): string =>
  join(vaultCaptureDir(id), 'manifest.json');
export const vaultCaptureAssetsDir = (id: DesignSystemId): string =>
  join(vaultCaptureDir(id), 'assets');

/**
 * Saída do motor V2 (`@ds/engine-v2`). Pasta SEPARADA da `capture/` do V1 de
 * propósito: durante a migração os dois motores podem ter rodado no mesmo design
 * system, e comparar V1 com V2 exige que nenhum sobrescreva o outro. O leitor
 * escolhe: existe `capture-v2/manifest.json`? usa o V2; senão, o V1 de sempre.
 */
export const vaultCaptureV2Dir = (id: DesignSystemId): string => join(vaultDsDir(id), 'capture-v2');
export const vaultCaptureV2Manifest = (id: DesignSystemId): string =>
  join(vaultCaptureV2Dir(id), 'manifest.json');
export const vaultCaptureV2AssetsDir = (id: DesignSystemId): string =>
  join(vaultCaptureV2Dir(id), 'assets');
/**
 * Frames guardados pela observação temporal e pelos estados. Ficam fora do
 * manifesto porque são binários e pesados — o manifesto guarda só o caminho
 * relativo, já deduplicado por hash.
 */
export const vaultCaptureV2FramesDir = (id: DesignSystemId): string =>
  join(vaultCaptureV2Dir(id), 'frames');

export const vaultSegmentsDir = (id: DesignSystemId): string => join(vaultDsDir(id), 'segments');
/**
 * Bundle compilado de um segmento — a saída do Design System Compiler:
 * `index.html`, `manifest.json`, `STACK.md`, `assets/**`, `validation.json`.
 * É o que a Biblioteca copia quando o item é curado, e é o que faz o item
 * sobreviver sozinho depois que a extração original for apagada.
 */
export const vaultSegmentBundlesDir = (id: DesignSystemId): string =>
  join(vaultSegmentsDir(id), 'bundles');
export const vaultSegmentBundleDir = (id: DesignSystemId, segId: string): string =>
  join(vaultSegmentBundlesDir(id), conferido(segId, ehChaveDeSegmento(segId)));
export const vaultSegmentsManifest = (id: DesignSystemId): string =>
  join(vaultSegmentsDir(id), 'manifest.json');
/**
 * HTML dos estados capturados de um segmento. Fica fora do manifesto de
 * propósito: o manifesto é o índice (leve, lido em toda listagem), e o HTML de
 * cada estado pode ser pesado. Banco/manifesto indexam; o vault guarda o blob.
 */
export const vaultSegmentStatesDir = (id: DesignSystemId): string =>
  join(vaultSegmentsDir(id), 'states');
export const vaultSegmentStates = (id: DesignSystemId, segId: string): string =>
  join(vaultSegmentStatesDir(id), `${conferido(segId, ehChaveDeSegmento(segId))}.json`);
/** Comportamentos de scroll de um segmento (para o preview reproduzir). */
export const vaultSegmentScrollDir = (id: DesignSystemId): string =>
  join(vaultSegmentsDir(id), 'scroll');
export const vaultSegmentScroll = (id: DesignSystemId, segId: string): string =>
  join(vaultSegmentScrollDir(id), `${conferido(segId, ehChaveDeSegmento(segId))}.json`);
/**
 * Registro do que foi validado em navegador (replay executado e conferido).
 * Fica separado dos insights: os insights saem da segmentação; a validação é um
 * passo posterior que promove `replayable` → `validated`.
 */
export const vaultSegmentValidation = (id: DesignSystemId): string =>
  join(vaultSegmentsDir(id), 'validation.json');
/** Candidatos que não passaram na validação — o par do manifest. */
export const vaultRejeitadosPath = (id: DesignSystemId): string =>
  join(vaultSegmentsDir(id), 'rejeitados.json');

// ── Library ────────────────────────────────────────────────────────────────
export const libraryDir = (): string => join(getRoot(), 'library');
export const librarySharedDir = (): string => join(libraryDir(), '_shared');
export const libraryComponentDir = (id: ComponentId): string =>
  join(libraryDir(), conferido(id, ehComponentId(id)));
export const libraryComponentBundleDir = (id: ComponentId): string =>
  join(libraryComponentDir(id), 'bundle');
export const libraryComponentMetadata = (id: ComponentId): string =>
  join(libraryComponentDir(id), 'metadata.json');
export const libraryComponentTokens = (id: ComponentId): string =>
  join(libraryComponentDir(id), 'tokens.json');

/**
 * Este diretório de design system pode ser apagado do disco?
 *
 * A ÚLTIMA coisa entre um engano e os arquivos de alguém. Mora aqui, e não em
 * quem apaga, porque dois lugares apagam — a rota de exclusão do servidor e o
 * `pnpm acervo:limpar-orfas` — e cada um tinha a sua versão escrita à mão.
 * Duas guardas que precisam concordar acabam discordando, e a que discordar
 * primeiro leva arquivo junto.
 *
 * Duas condições, as duas obrigatórias:
 *
 * - o alvo está DENTRO do vault: não é o próprio vault, não é irmão dele, e não
 *   sobe por `..`;
 * - o nome é um id de design system, e nada mais — `..`, `*`, vazio ou nome com
 *   separador de caminho reprovam.
 */
export const podeApagarDesignSystem = (dir: string, raizDoVault: string, id: string): boolean => {
  if (!ehDesignSystemId(id)) return false;
  return estaContido(raizDoVault, dir);
};

// ── Projects ───────────────────────────────────────────────────────────────
export const projectsDir = (): string => join(getRoot(), 'projects');
export const projectDir = (id: ProjectId): string =>
  join(projectsDir(), conferido(id, ehProjectId(id)));
export const projectContentDir = (id: ProjectId): string => join(projectDir(id), 'content');
export const projectBrandingDir = (id: ProjectId): string => join(projectDir(id), 'branding');
export const projectMediaDir = (id: ProjectId): string => join(projectDir(id), 'media');
export const projectGeneratedDir = (id: ProjectId): string => join(projectDir(id), 'generated');
export const projectGeneratedVersionDir = (id: ProjectId, isoTimestamp: string): string =>
  join(projectGeneratedDir(id), conferido(isoTimestamp, ehNomeDeVersao(isoTimestamp)));

// ── Criativos ──────────────────────────────────────────────────────────────
/**
 * Saída de um job `criativo`: as variações de imagem/vídeo que o cliente
 * baixa. Fica fora do repo, ao lado dos outros dados, indexada pelo id do
 * JOB — não há projeto nem banco no MVP, e o job é a única identidade que o
 * pedido tem. A rota de download do servidor lê daqui.
 *
 * O id passa pela mesma guarda dos vizinhos porque também vira caminho de
 * disco: um `jobId` vindo de URL com `..` dentro não pode subir de pasta.
 */
/**
 * A RAIZ dos criativos existe como função porque o bootstrap e a rota de
 * download precisam dela SEM job na mão — e sem a função, quem lista os jobs
 * produzidos redigita `join(getRoot(), 'criativos')` fora desta camada,
 * exatamente o que o contrato do arquivo proíbe. Achado do revisor do MVP.
 */
export const criativosRootDir = (): string => join(getRoot(), 'criativos');
export const criativosDir = (jobId: string): string =>
  join(criativosRootDir(), conferido(jobId, ehJobId(jobId)));

/**
 * O RETRATO do pedido, gravado ao lado da saída.
 *
 * A fila é uma caixa de entrada, não um arquivo: o `fila:limpar` a esvazia e o
 * job some. Enquanto o pedido morava só lá, esvaziar a fila apagava o teto de
 * créditos, os claims autorizados e a própria existência da peça na tela — os
 * arquivos ficavam órfãos numa pasta que ninguém mais alcançava.
 *
 * Aqui ele fica ao lado do que produziu, e sobrevive à faxina. É a mesma ideia
 * do `ajustes.json` viajando dentro da versão gerada: o que pertence à entrega
 * mora com a entrega.
 */
export const criativoPedidoPath = (jobId: string): string =>
  join(criativosDir(jobId), 'pedido.json');

/**
 * O arquivo que o cliente enviou, dentro da pasta do job.
 *
 * Subpasta própria porque ele é MATERIAL DELE, e não saída nossa: quando a
 * pasta for varrida para empacotar ou para limpar derivados, o que veio de fora
 * fica visivelmente separado do que o motor produziu. É a mesma distinção que o
 * contrato faz quando diz que o upload vence a geração.
 */
export const criativoUploadDir = (jobId: string): string => join(criativosDir(jobId), 'upload');

// ── Marcas criadas ─────────────────────────────────────────────────────────
/**
 * As MARCAS criadas ficam fora de `criativos/`, e de propósito.
 *
 * Uma marca não é uma peça: ela não tem canal, não vence, e é INSUMO das outras
 * duas frentes — o site e a loja vão buscar as versões da logo aqui. Guardá-la
 * junto das peças de tráfego faria a faxina de criativos levar embora o que o
 * resto do portal depende.
 */
export const marcasRootDir = (): string => join(getRoot(), 'marcas');
export const marcaDir = (jobId: string): string =>
  join(marcasRootDir(), conferido(jobId, ehJobId(jobId)));

/** O retrato do pedido de marca, ao lado do que ele produziu. */
export const marcaPedidoPath = (jobId: string): string => join(marcaDir(jobId), 'pedido.json');

// ── Rascunhos de criativo ──────────────────────────────────────────────────
/**
 * Onde o upload espera ANTES de existir job.
 *
 * O contrato exige o caminho do arquivo dentro do próprio pedido, e o job só
 * nasce quando o pedido é aceito. Isso é um ovo e uma galinha: sem um lugar
 * para o arquivo esperar, escolher "tenho a foto" criaria um pedido apontando
 * para um arquivo que não existe em lugar nenhum — uma promessa que só seria
 * descoberta na hora de produzir, depois de a pessoa já ter confirmado.
 *
 * O rascunho é indexado pela CHAVE DO ENVIO, a mesma que dá o id do job. Assim
 * o pedido aceito sabe exatamente qual pasta é a dele, sem inventar vínculo.
 */
export const criativosRascunhosDir = (): string => join(getRoot(), 'criativos-rascunhos');
export const criativoRascunhoDir = (rascunhoId: string): string =>
  join(criativosRascunhosDir(), conferido(rascunhoId, ehRascunhoId(rascunhoId)));

// ── Cache ──────────────────────────────────────────────────────────────────
export const cacheDir = (): string => join(getRoot(), 'cache');
export const cacheThumbnailsDir = (): string => join(cacheDir(), 'thumbnails');
export const cacheLlmDir = (): string => join(cacheDir(), 'llm');
export const cachePlaywrightDir = (): string => join(cacheDir(), 'playwright');

// ── Workspace ──────────────────────────────────────────────────────────────
export const workspaceDir = (): string => join(getRoot(), 'workspace');
export const workspaceTaskDir = (id: TaskId): string =>
  join(workspaceDir(), conferido(id, ehTaskId(id)));
export const workspaceTaskInputDir = (id: TaskId): string => join(workspaceTaskDir(id), 'input');
export const workspaceTaskOutputDir = (id: TaskId): string => join(workspaceTaskDir(id), 'output');
export const workspaceTaskManifest = (id: TaskId): string =>
  join(workspaceTaskDir(id), 'task.json');

// ── Fila (modo queue) ──────────────────────────────────────────────────────
/**
 * A fila é o contrato entre o app e quem processa. O app só escreve pedidos;
 * quem executa lê, trabalha e move para `concluido`. Nada aqui dispara trabalho
 * sozinho — é uma caixa de entrada, não um gatilho.
 */
export const queueDir = (): string => join(getRoot(), 'queue');
export const queuePendingDir = (): string => join(queueDir(), 'pendente');
export const queueDoneDir = (): string => join(queueDir(), 'concluido');

/**
 * Lote em processamento: os ids que o PROCESSAR.bat pegou nesta rodada.
 *
 * Existe porque a fila sozinha não diz quanto falta. Ela só sabe o que ainda
 * está pendente — não sabe de quantos aquela rodada partiu, então não dá para
 * calcular porcentagem. Este arquivo guarda o denominador.
 *
 * Fica na raiz de `queue/`, fora de `pendente/` e `concluido/`, para não ser
 * confundido com um job pela listagem.
 */
export const queueLotePath = (): string => join(queueDir(), 'lote.json');

/** Todas as pastas de topo, na ordem que devem ser criadas no bootstrap. */
export const topLevelDirs = (): readonly string[] => [
  getRoot(),
  vaultDir(),
  libraryDir(),
  librarySharedDir(),
  projectsDir(),
  cacheDir(),
  cacheThumbnailsDir(),
  cacheLlmDir(),
  cachePlaywrightDir(),
  workspaceDir(),
  queueDir(),
  queuePendingDir(),
  queueDoneDir(),
  // Sem ela no bootstrap, a rota de download lê de uma pasta que nunca nasceu.
  criativosRootDir(),
  criativosRascunhosDir(),
];
