import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import Anthropic from '@anthropic-ai/sdk';
import {
  BUILTIN_BLUEPRINTS,
  type GeneratePayload,
  type LayoutBlueprint,
  type ProjectBranding,
  buildTypographyCss,
  getBlueprint,
  libraryComponentBundleDir,
  pickCreativeDirection,
  projectGeneratedVersionDir,
  resolveSlots,
} from '@ds/shared';
import { z } from 'zod';

/**
 * Gerador de site.
 *
 * Fluxo:
 * 1. O usuário escolhe um blueprint (estrutura de página com slots ordenados).
 * 2. LLM recebe: os slots a preencher + catálogo da library + conteúdo + branding.
 * 3. LLM retorna: qual componente ocupa cada slot e o conteúdo interpolado.
 * 4. Post-processing: monta o HTML final, mescla CSS, aplica tokens da marca.
 *
 * O risco histórico desta fase era o site sair incoerente ("Frankenstein"),
 * porque o modelo inventava a estrutura a cada geração. O blueprint remove essa
 * liberdade: a estrutura vem pronta e o modelo só faz curadoria dentro dela.
 *
 * A segunda defesa é a coerência de origem — `preferDesignSystemId` faz o
 * gerador priorizar peças do mesmo design system, evitando colar componentes
 * de linguagens visuais que não conversam.
 */

const CompositionPlan = z.object({
  sections: z.array(
    z.object({
      componentId: z.string().startsWith('cmp_'),
      role: z.string(),
      substitutions: z.record(z.string(), z.string()).optional(),
    }),
  ),
});
export type CompositionPlan = z.infer<typeof CompositionPlan>;

export type LibraryCatalogItem = {
  id: string;
  name: string;
  category: string;
  htmlPreview: string;
  designSystemId?: string | null;
};

/**
 * O gerador consome o CONTRATO de geração — o mesmo payload que a fila grava
 * no job (`GeneratePayload` em @ds/shared). Fila e API deixam de divergir: a
 * mídia, o kit com `bundlePath` e o layout chegam idênticos nos dois modos.
 */
export type GenerateInput = GeneratePayload;

export type GenerateOptions = {
  apiKey: string;
  model: string;
  onProgress?: (msg: string) => void;
};

export type GenerateResult = {
  outputDir: string;
  plan: CompositionPlan;
  totalBytes: number;
};

/**
 * Ordena o catálogo colocando primeiro as peças do design system preferido.
 * O modelo lê de cima para baixo, então a ordem já é um viés de coerência —
 * sem excluir as demais, que continuam disponíveis se nada servir.
 */
const buildCatalog = (items: LibraryCatalogItem[], preferDesignSystemId: string | null): string => {
  const ordered =
    preferDesignSystemId === null
      ? items
      : [
          ...items.filter((c) => c.designSystemId === preferDesignSystemId),
          ...items.filter((c) => c.designSystemId !== preferDesignSystemId),
        ];

  return ordered
    .map((c) => {
      const origem =
        preferDesignSystemId !== null && c.designSystemId === preferDesignSystemId
          ? ' | origem: PREFERIDA'
          : '';
      return `- ID ${c.id} | category: ${c.category} | name: "${c.name}"${origem}\n  preview: ${c.htmlPreview.slice(0, 300)}...`;
    })
    .join('\n');
};

const FORMATO = `Formato:
{
  "sections": [
    {"componentId": "cmp_...", "role": "hero", "substitutions": {"texto original": "texto novo"}},
    ...
  ]
}`;

const REGRAS_COMUNS = `- Só use componentes da biblioteca, por ID. Nunca invente um ID.
- Prefira componentes marcados como "origem: PREFERIDA" — vêm do mesmo design
  system e mantêm a página visualmente coerente. Só saia deles se nenhum servir.
- Substitua textos genéricos do preview por textos do conteúdo do usuário via
  mapa de substituições. Nunca invente fatos que não estejam no conteúdo.
- Retorne SÓ JSON, sem markdown.`;

/** Blueprint efetivo do payload: id declarado > id do layout > primeiro builtin. */
const blueprintDe = (input: GenerateInput): LayoutBlueprint =>
  getBlueprint(input.blueprintId ?? input.layout.blueprintId) ??
  (BUILTIN_BLUEPRINTS[0] as LayoutBlueprint);

/** Catálogo para o planejador, nascido do KIT com bundle em disco. */
const catalogoDoKit = (input: GenerateInput): LibraryCatalogItem[] =>
  input.kit.components.map((cmp) => {
    const htmlPath = join(cmp.bundlePath, 'index.html');
    const preview = existsSync(htmlPath) ? readFileSync(htmlPath, 'utf8').slice(0, 500) : '';
    return {
      id: cmp.id,
      name: cmp.name,
      category: cmp.category,
      htmlPreview: preview,
      designSystemId: cmp.designSystemId ?? null,
    };
  });

/** Modo blueprint: a estrutura vem pronta, o modelo só preenche. */
const promptBlueprint = (
  input: GenerateInput,
  blueprint: LayoutBlueprint,
): { system: string; user: string } => {
  const slots = resolveSlots(blueprint, input.layout);
  const slotList = slots
    .map((s, i) => `${i + 1}. role "${s.role}" — ${s.label}: ${s.hint}`)
    .join('\n');

  return {
    system: `Você compõe sites a partir de uma biblioteca de componentes pré-existentes.

A ESTRUTURA DA PÁGINA JÁ ESTÁ DECIDIDA. Você não escolhe quais seções existem
nem em que ordem aparecem — isso vem do blueprint. Sua tarefa é escolher, para
cada slot, o componente da biblioteca que melhor cumpre aquele papel.

Regras:
- Retorne exatamente um item por slot, na mesma ordem em que os slots aparecem.
- Use o valor de "role" exatamente como fornecido no slot.
${REGRAS_COMUNS}

${FORMATO}`,
    user: `ESTRUTURA ESCOLHIDA: ${blueprint.name} — ${blueprint.description}

SLOTS A PREENCHER (nesta ordem, um componente para cada):
${slotList}`,
  };
};

/** Modo criativo: o modelo decide a estrutura, mas só com o material curado. */
const promptCriativo = (input: GenerateInput): { system: string; user: string } => {
  const direcao = pickCreativeDirection(input.layout.creativeSeed);

  return {
    system: `Você compõe sites a partir de uma biblioteca de componentes pré-existentes.

A ESTRUTURA DA PÁGINA É SUA DECISÃO. Não existe fórmula obrigatória, e você não
deve cair no padrão automático "hero → features → preço → depoimentos → rodapé"
a menos que ele seja genuinamente o melhor para este conteúdo.

O que NÃO é negociável: você só pode usar os componentes da biblioteca abaixo.
Eles foram escolhidos a dedo pelo usuário. Trabalhe com esse material — a
liberdade é de arranjo, não de invenção.

Regras:
- Escolha quantas seções fizerem sentido para este conteúdo. Nem toda página
  precisa de todas as seções possíveis; uma página curta e certa vence uma
  página longa e genérica.
- Defina o "role" de cada seção você mesmo, descrevendo a função dela na página.
- Ordene as seções de forma que a página tenha começo, meio e fim coerentes.
${REGRAS_COMUNS}

${FORMATO}`,
    user: `DIREÇÃO CRIATIVA DESTA GERAÇÃO: ${direcao.name}
${direcao.guidance}

Comprometa-se com essa direção. Uma execução clara de uma ideia vence uma
mistura morna de várias.`,
  };
};

const planSite = async (input: GenerateInput, opts: GenerateOptions): Promise<CompositionPlan> => {
  const client = new Anthropic({ apiKey: opts.apiKey });
  const blueprint = blueprintDe(input);
  const { system, user: modoUser } =
    input.layout.mode === 'criativo' ? promptCriativo(input) : promptBlueprint(input, blueprint);

  const midias =
    input.media.length === 0
      ? 'nenhuma enviada'
      : input.media
          .map(
            (m) => `- ${m.kind} "${m.originalName}"${m.slotRole ? ` → seção ${m.slotRole}` : ''}`,
          )
          .join('\n');

  const user = `PROJETO: ${input.projectName}

${modoUser}

DENSIDADE: ${input.layout.density}
MOVIMENTO: ${input.layout.motion}

CONTEÚDO DO USUÁRIO:
${JSON.stringify(input.content, null, 2)}

IDENTIDADE VISUAL:
${JSON.stringify(input.branding, null, 2)}

MÍDIA DO USUÁRIO (prefira seções que aproveitem o que existe):
${midias}

BIBLIOTECA DISPONÍVEL:
${buildCatalog(catalogoDoKit(input), input.layout.preferDesignSystemId)}

Componha o site.`;

  const response = await client.messages.create({
    model: opts.model,
    max_tokens: 16000,
    system,
    messages: [{ role: 'user', content: user }],
  });

  const text = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('\n');

  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error(`Composição não retornou JSON: ${text.slice(0, 200)}`);
  return CompositionPlan.parse(JSON.parse(match[0]));
};

const applySubstitutions = (html: string, subs?: Record<string, string>): string => {
  if (!subs) return html;
  let out = html;
  for (const [from, to] of Object.entries(subs)) {
    out = out.split(from).join(to);
  }
  return out;
};

/**
 * CSS da marca aplicado ao site gerado.
 *
 * A tipografia sai de `buildTypographyCss` (fonte da verdade compartilhada):
 * declara `--font-display`/`--font-body` com pilha de fallback e — o que faltava
 * — aplica a fonte de títulos aos headings e a de corpo ao body. A importação da
 * família em si entra por um `<link>` no head (ver `generateSite`), carregando
 * só os pesos usados.
 */
export const buildBrandingCss = (branding: ProjectBranding): string => {
  const typo = buildTypographyCss(branding.typography);
  return `${typo.css}
:root {
  --brand-primary: ${branding.palette.primary};
  ${branding.palette.secondary ? `--brand-secondary: ${branding.palette.secondary};` : ''}
  --brand-bg: ${branding.palette.background};
  --brand-fg: ${branding.palette.foreground};
  ${branding.palette.accent ? `--brand-accent: ${branding.palette.accent};` : ''}
}
/* Override dos --primary do componente para casar com a marca. */
:root { --primary: var(--brand-primary); }
body { background: var(--brand-bg); color: var(--brand-fg); }
`;
};

/** Gera o site final e escreve em projects/{id}/generated/{iso}/ */
export const generateSite = async (
  input: GenerateInput,
  opts: GenerateOptions,
): Promise<GenerateResult> => {
  opts.onProgress?.('Planejando composição via LLM');
  const plan = await planSite(input, opts);

  const iso = new Date().toISOString().replace(/[:.]/g, '-');
  const outputDir = projectGeneratedVersionDir(input.projectId as `prj_${string}`, iso);
  mkdirSync(outputDir, { recursive: true });
  mkdirSync(join(outputDir, 'assets'), { recursive: true });

  // Concatena HTML e CSS dos componentes do plano.
  let bodyHtml = '';
  let concatCss = '';
  for (const section of plan.sections) {
    const bundleDir = libraryComponentBundleDir(section.componentId as `cmp_${string}`);
    const htmlPath = join(bundleDir, 'index.html');
    const cssPath = join(bundleDir, 'styles.css');
    if (!existsSync(htmlPath)) {
      opts.onProgress?.(`Componente ${section.componentId} não achado, pulando`);
      continue;
    }
    const html = readFileSync(htmlPath, 'utf8');
    const css = existsSync(cssPath) ? readFileSync(cssPath, 'utf8') : '';
    bodyHtml += `\n<!-- ${section.role} · ${section.componentId} -->\n`;
    bodyHtml += applySubstitutions(html, section.substitutions);
    bodyHtml += '\n';
    concatCss += `\n/* ${section.role} · ${section.componentId} */\n${css}`;
    opts.onProgress?.(`Adicionado: ${section.role} (${section.componentId})`);
  }

  const brandingCss = buildBrandingCss(input.branding);
  writeFileSync(join(outputDir, 'assets/styles.css'), `${brandingCss}\n${concatCss}`, 'utf8');

  // Importa as fontes escolhidas (só os pesos usados) via <link> no head — a
  // aplicação aos títulos/corpo está no styles.css. Preconnect para acelerar.
  const fontImportUrl = buildTypographyCss(input.branding.typography).importUrl;
  const fontLinks = fontImportUrl
    ? `<link rel="preconnect" href="https://fonts.googleapis.com"/>
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin/>
<link rel="stylesheet" href="${fontImportUrl}"/>
`
    : '';

  const finalHtml = `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1.0"/>
<title>${input.projectName}</title>
${fontLinks}<link rel="stylesheet" href="assets/styles.css"/>
</head>
<body>
${bodyHtml}
</body>
</html>`;

  writeFileSync(join(outputDir, 'index.html'), finalHtml, 'utf8');
  writeFileSync(join(outputDir, 'plan.json'), JSON.stringify(plan, null, 2), 'utf8');

  return { outputDir, plan, totalBytes: finalHtml.length + concatCss.length + brandingCss.length };
};
