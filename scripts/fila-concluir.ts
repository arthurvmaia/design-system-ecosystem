/**
 * Fecha um job da fila depois que o trabalho foi produzido.
 *
 * Uso: pnpm fila:concluir <job_id> [--erro "mensagem"]
 *
 * Este script NÃO chama a API da Anthropic. Ele registra que um job terminou,
 * validando que o que foi produzido existe em disco antes de marcar como
 * concluído — para um job não ser fechado sem entrega. Ao fechar uma extração,
 * ele também segmenta e roda a validação do replay no navegador (passo do
 * processamento, não trabalho de LLM) para promover o que reproduz de verdade.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  finishJob,
  getJob,
  listarAssetsFaltando,
  projectGeneratedDir,
  vaultDsDir,
  vaultExtractedDir,
} from '@ds/shared';
import { avisoSpa, segmentarEIndexar } from './segmentar.js';

const [, , jobId, ...rest] = process.argv;

if (jobId === undefined) {
  console.error('Uso: pnpm fila:concluir <job_id> [--erro "mensagem"]');
  process.exit(1);
}

const erroIdx = rest.indexOf('--erro');
const erro = erroIdx >= 0 ? rest[erroIdx + 1] : undefined;

const job = getJob(jobId);
if (job === null) {
  console.error(`Job não encontrado: ${jobId}`);
  process.exit(1);
}
if (job.status !== 'pendente') {
  console.error(`Job já está como "${job.status}".`);
  process.exit(1);
}

if (erro !== undefined) {
  finishJob(jobId, { error: erro });
  console.log(`Job marcado como erro: ${job.label}`);
  process.exit(0);
}

// Verifica que a entrega existe antes de fechar.
const problemas: string[] = [];

/** Preenchido quando o job é de extração e passou na validação. */
let paraSegmentar: `ds_${string}` | null = null;

if (job.type === 'extract') {
  const dsId = job.result?.designSystemId ?? job.payload.designSystemId;
  if (typeof dsId === 'string' && dsId.startsWith('ds_')) {
    paraSegmentar = dsId as `ds_${string}`;
  }
  if (typeof dsId !== 'string') {
    problemas.push('designSystemId não informado — grave o id do design system no job.');
  } else if (!existsSync(vaultDsDir(dsId as `ds_${string}`))) {
    problemas.push(`pasta do vault não existe: ${vaultDsDir(dsId as `ds_${string}`)}`);
  } else {
    // A pasta existir não quer dizer nada. O que interessa é o HTML estar lá e
    // os arquivos que ele promete existirem de verdade — foi por não checar
    // isso que uma extração sem CSS entrou na galeria como se estivesse pronta.
    const extraido = vaultExtractedDir(dsId as `ds_${string}`);
    const htmlPath = join(extraido, 'design-system.html');

    if (!existsSync(htmlPath)) {
      problemas.push(`design-system.html não existe em ${extraido}`);
    } else {
      const html = readFileSync(htmlPath, 'utf8');

      if (html.length < 200) {
        problemas.push('design-system.html tem menos de 200 bytes — está praticamente vazio.');
      }

      const faltando = listarAssetsFaltando(extraido, html);
      if (faltando.length > 0) {
        problemas.push(
          `o HTML referencia ${faltando.length} arquivo(s) que não existem: ${faltando.slice(0, 6).join(', ')}${faltando.length > 6 ? ` (e mais ${faltando.length - 6})` : ''}`,
        );
        problemas.push(
          'Isso significa que os STEPs 2 a 4 não gravaram os assets. Sem eles o design system abre sem estilo.',
        );
      }
    }
  }
}

if (job.type === 'generate') {
  const prjId = job.payload.projectId;
  if (typeof prjId !== 'string') {
    problemas.push('projectId ausente no payload.');
  } else {
    const geradosDir = projectGeneratedDir(prjId as `prj_${string}`);

    if (!existsSync(geradosDir)) {
      problemas.push(`nenhuma versão gerada em: ${geradosDir}`);
    } else {
      // Mesma checagem da extração, pelo mesmo motivo: um index.html que
      // aponta para um CSS inexistente abre sem estilo. Aqui dói ainda mais,
      // porque é o arquivo que a pessoa vai baixar e mandar para um cliente.
      const versoes = readdirSync(geradosDir, { withFileTypes: true })
        .filter((e) => e.isDirectory())
        .map((e) => e.name)
        .sort();
      const ultima = versoes.at(-1);

      if (ultima === undefined) {
        problemas.push(`a pasta ${geradosDir} existe mas está vazia.`);
      } else {
        const dir = join(geradosDir, ultima);
        const indexPath = join(dir, 'index.html');

        if (!existsSync(indexPath)) {
          problemas.push(`index.html não existe em ${dir}`);
        } else {
          const html = readFileSync(indexPath, 'utf8');
          const faltando = listarAssetsFaltando(dir, html);
          if (faltando.length > 0) {
            problemas.push(
              `o site gerado referencia ${faltando.length} arquivo(s) que não existem: ${faltando.slice(0, 6).join(', ')}`,
            );
          }
          // A marca precisa VENCER a cascata: quando existe um CSS de marca
          // separado, ele tem que carregar depois do CSS do esqueleto.
          if (existsSync(join(dir, 'assets', 'marca.css'))) {
            const posEsqueleto = html.indexOf('assets/styles.css');
            const posMarca = html.indexOf('assets/marca.css');
            if (posEsqueleto !== -1 && posMarca !== -1 && posMarca < posEsqueleto) {
              problemas.push(
                'assets/marca.css carrega ANTES de assets/styles.css — a identidade do usuário perde a cascata para o esqueleto.',
              );
            }
          }
          // Proveniência explícita é contrato do produto: toda seção declara
          // se veio da biblioteca ou foi criada no estilo.
          if (!/data-origem=/.test(html)) {
            problemas.push(
              'nenhuma seção marca a proveniência (data-origem="biblioteca"|"gerado") no HTML gerado.',
            );
          }
          // Responsividade é REQUISITO: viewport declarado e alguma camada
          // com @media de largura — sem isso o "mobile" é só a página estreitada.
          if (!/name="viewport"/.test(html)) {
            problemas.push('o site gerado não declara a meta viewport — não funciona no celular.');
          }
          const cssDaVersao = ['assets/responsivo.css', 'assets/styles.css', 'assets/marca.css']
            .map((p) => join(dir, p))
            .filter((p) => existsSync(p))
            .map((p) => readFileSync(p, 'utf8'))
            .join('\n');
          if (!/@media[^{]*max-width/.test(cssDaVersao)) {
            problemas.push(
              'nenhum CSS do site tem regra @media de largura — a versão mobile precisa ser pensada, não só espremida.',
            );
          }
        }
      }
    }
  }
}

if (problemas.length > 0) {
  console.error('\nNão dá para concluir este job:\n');
  for (const p of problemas) console.error(`  - ${p}`);
  console.error('\nProduza a saída antes de fechar, ou use --erro para registrar a falha.\n');
  process.exit(1);
}

// Segmentação. Roda aqui, e não a cargo de quem processou, porque é o passo
// que já foi esquecido uma vez: o design system entrou no banco como
// `extracted`, a Galeria abriu com "0 de 0 segmentos" e não havia o que curar.
// Extrair sem segmentar não entrega nada de útil, então os dois andam juntos.
if (paraSegmentar !== null) {
  try {
    const { total, raizes, suspeitoDeSpa } = segmentarEIndexar(paraSegmentar);
    if (total === 0) {
      console.error('\nA segmentação não encontrou nenhum componente.');
      console.error('O design-system.html existe, mas o <body> não tem filhos');
      console.error('diretos que sirvam como segmento. Refaça a extração.\n');
      process.exit(1);
    }
    console.log(`\n${total} segmento(s) prontos na Galeria.`);
    // Aviso, não bloqueio: existe página legítima com poucas seções, e recusar
    // fecharia o job de alguém que sabe o que está fazendo. O número do aviso
    // são as SEÇÕES — contar os filhos da subdivisão inflaria a mensagem.
    if (suspeitoDeSpa) console.log(avisoSpa(raizes));
  } catch (err) {
    console.error(`\nFalha ao segmentar: ${err instanceof Error ? err.message : String(err)}`);
    console.error('O job continua pendente — corrija e rode de novo.\n');
    process.exit(1);
  }
}

/**
 * Validação automática do replay (navegador) + fechamento. Num `main` async
 * (não top-level await: o tsx transpila os scripts para CJS). A validação é
 * passo do processamento, logo após os segmentos indexados — sem comando extra
 * do usuário. Reusa a previewRoute de produção e não bloqueia o fechamento: se
 * falhar ou o navegador faltar, os segmentos seguem `replayable` e a validação
 * pode rodar depois; nunca vira `unsupported` por indisponibilidade.
 */
const finalizar = async (): Promise<void> => {
  if (paraSegmentar !== null) {
    try {
      const { validarPreviews } = await import('@ds/server/validate');
      console.log('\nValidando previews (navegador)…');
      const val = await validarPreviews(paraSegmentar);
      const validadas = val.results.filter((r) => r.ok).length;
      console.log(`  ${val.status}: ${validadas} interação(ões) validada(s).`);
    } catch (err) {
      console.log(`  validação pulada: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  finishJob(jobId, { result: { fechadoEm: new Date().toISOString() } });
  console.log(`\nConcluído: ${job.label}\n`);
};

finalizar().catch((err) => {
  console.error(`\nFalha ao concluir: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
