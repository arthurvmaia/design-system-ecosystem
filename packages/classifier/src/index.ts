import Anthropic from '@anthropic-ai/sdk';
import { CATEGORIAS_DE_PECA } from '@ds/shared';
import { z } from 'zod';

/**
 * Classifica segmentos em (category, kind) usando um LLM.
 * Envia em batches para eficiência de tokens.
 */

const CATEGORIES = [
  'hero',
  'header',
  'nav',
  'footer',
  'background',
  'overlay',
  'card',
  'feature',
  'pricing',
  'testimonial',
  'faq',
  'cta',
  'form',
  'button',
  'badge',
  'input',
  'accordion',
  'gallery',
  'stats',
  'logo-cloud',
  'team',
  'timeline',
  'other',
] as const;

const KINDS = ['component', 'layout', 'animation', 'effect', 'asset'] as const;

const ClassificationOutput = z.object({
  classifications: z.array(
    z.object({
      id: z.string(),
      category: z.enum(CATEGORIES),
      kind: z.enum(KINDS),
      suggestedName: z.string().min(1),
    }),
  ),
});

export type Classification = z.infer<typeof ClassificationOutput>['classifications'][number];

export type ClassifyInput = {
  id: string;
  currentName: string;
  htmlSnippet: string;
  /**
   * Subcomponente extraído de dentro de uma seção (tem `parentId`). Vira uma
   * dica no prompt — peça pede categoria de peça — sem mudar a saída; o clamp
   * final de categoria é do servidor.
   */
  subcomponente?: boolean;
};

export type ClassifyOptions = {
  apiKey: string;
  model: string;
  onProgress?: (done: number, total: number) => void;
};

const BATCH_SIZE = 8;

const SYSTEM_PROMPT = `Você é um classificador de componentes de interface web.

Recebe uma lista de segmentos HTML e classifica cada um em:
- category: uma de [${CATEGORIES.join(', ')}]
- kind: uma de [${KINDS.join(', ')}] (quase sempre 'component' para blocos visuais)
- suggestedName: o nome que descreve a FORMA da peça (regra completa abaixo)

REGRA DO NOME, que é a mais importante deste trabalho:

O nome descreve a ESTRUTURA da peça mais o traço visual que a distingue. Nunca o
assunto do texto que está dentro dela. Quem vai ler esse nome está escolhendo uma
peça para reusar num site COMPLETAMENTE diferente: o assunto do site de origem
não interessa e atrapalha, porque descreve justamente o que não vai junto.

- máximo de 40 caracteres
- comece pela estrutura, termine pelo traço distintivo
- em português, sem jargão de código

certo: "Grade de 3 cartões com ícone"
certo: "Barra fixa com hover magnético"
certo: "Fundo animado em canvas"
certo: "Formulário de 2 campos em linha"

errado: "Recursos — IA por muito tempo foi coisa só…"   (é o texto de dentro)
errado: "Sistemas de IA que tornam suas pessoas melhores" (é a manchete deles)
errado: "Seção 3"                                        (não descreve nada)
errado: "Hero Split 01"                                  (jargão, e sem o traço)

Se o segmento não tiver traço distintivo nenhum, só a estrutura já basta:
"Cartão com imagem no topo".

Um segmento marcado como SUBCOMPONENTE é uma peça extraída de dentro de uma
seção (um botão, um selo, um campo) — não a seção. Para ele, category tem de ser
de peça: [${[...CATEGORIAS_DE_PECA].join(', ')}]. Um botão dentro do hero é
'button', nunca 'hero'.

Responde APENAS com JSON válido no formato:
{
  "classifications": [
    {"id": "...", "category": "...", "kind": "...", "suggestedName": "..."}
  ]
}

Sem texto antes ou depois. Sem markdown fences.`;

export const classifySegments = async (
  segments: ClassifyInput[],
  opts: ClassifyOptions,
): Promise<Classification[]> => {
  const client = new Anthropic({ apiKey: opts.apiKey });
  const all: Classification[] = [];
  let done = 0;

  for (let i = 0; i < segments.length; i += BATCH_SIZE) {
    const batch = segments.slice(i, i + BATCH_SIZE);
    const user = batch
      .map(
        (s) =>
          `ID: ${s.id}\nNome atual: ${s.currentName}\n${
            s.subcomponente
              ? 'Subcomponente de uma seção: use categoria de peça (button, badge, input, accordion, card, nav, other).\n'
              : ''
          }HTML (primeiros 2000 chars):\n${s.htmlSnippet.slice(0, 2000)}\n---`,
      )
      .join('\n\n');

    const response = await client.messages.create({
      model: opts.model,
      max_tokens: 16000,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: user }],
    });

    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('\n');

    // Tenta parsear com tolerância a fences ou preâmbulos.
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error(`Classifier não retornou JSON: ${text.slice(0, 200)}`);
    const parsed = ClassificationOutput.parse(JSON.parse(jsonMatch[0]));

    all.push(...parsed.classifications);
    done += batch.length;
    opts.onProgress?.(done, segments.length);
  }

  return all;
};
