import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { listarAssetsFaltando } from '@ds/shared';

export type ValidationResult = {
  ok: boolean;
  errors: string[];
  warnings: string[];
  stats: {
    designSystemBytes: number;
    stackItems: number;
    cssFiles: number;
    jsFiles: number;
    svgFiles: number;
  };
};

/** Valida que o extrator produziu os artefatos esperados. */
export const validateExtraction = (workDir: string): ValidationResult => {
  const errors: string[] = [];
  const warnings: string[] = [];

  const dsPath = join(workDir, 'design-system.html');
  const stackPath = join(workDir, 'STACK.md');

  let designSystemBytes = 0;
  let stackItems = 0;

  if (!existsSync(dsPath)) {
    errors.push('design-system.html não foi gerado');
  } else {
    const content = readFileSync(dsPath, 'utf8');
    designSystemBytes = content.length;
    if (content.length < 200) {
      errors.push('design-system.html tem menos de 200 bytes (provavelmente vazio)');
    }
    // Não pode ter blocos <style> ou <script> com JS inline no output final.
    if (/<style[^>]*>[\s\S]+?<\/style>/i.test(content)) {
      warnings.push('design-system.html ainda tem blocos <style> inline');
    }
    const inlineJs = content.match(
      /<script(?![^>]*type=["']application\/ld\+json["'])[^>]*>[\s\S]+?<\/script>/gi,
    );
    if (inlineJs?.some((s) => s.replace(/<script[^>]*>|<\/script>/g, '').trim().length > 0)) {
      warnings.push('design-system.html ainda tem <script> com código inline');
    }

    // Erro, não aviso: um design system cujo CSS não existe em disco abre sem
    // estilo nenhum. Ele fica bonito na listagem e quebrado na prévia, que é o
    // pior dos dois mundos — melhor falhar aqui e refazer a extração.
    const faltando = listarAssetsFaltando(workDir, content);
    if (faltando.length > 0) {
      const amostra = faltando.slice(0, 6).join(', ');
      const resto = faltando.length > 6 ? ` (e mais ${faltando.length - 6})` : '';
      errors.push(
        `design-system.html referencia ${faltando.length} arquivo(s) que não existem: ${amostra}${resto}. Provavelmente os STEPs 2 a 4 não gravaram os assets antes do HTML ser escrito.`,
      );
    }
  }

  if (!existsSync(stackPath)) {
    warnings.push('STACK.md não foi gerado (não bloqueia, mas é esperado)');
  } else {
    const stack = readFileSync(stackPath, 'utf8');
    stackItems = (stack.match(/^\s*-\s+\*\*/gm) ?? []).length;
    if (stackItems === 0) {
      warnings.push('STACK.md não tem itens no formato esperado');
    }
  }

  const cssFiles = countFilesUnder(join(workDir, 'assets/css'));
  const jsFiles = countFilesUnder(join(workDir, 'assets/js'));
  const svgFiles = countFilesUnder(join(workDir, 'assets/images/svg'));

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    stats: { designSystemBytes, stackItems, cssFiles, jsFiles, svgFiles },
  };
};

const countFilesUnder = (dir: string): number => {
  if (!existsSync(dir)) return 0;
  return readdirSync(dir).filter((f) => !f.startsWith('.')).length;
};

/** Faz o parse leve do STACK.md em StackManifest. */
export const parseStackManifest = (workDir: string): { name: string; description: string }[] => {
  const stackPath = join(workDir, 'STACK.md');
  if (!existsSync(stackPath)) return [];
  const body = readFileSync(stackPath, 'utf8');
  const lines = body.split('\n');
  const items: { name: string; description: string }[] = [];
  for (const line of lines) {
    // Formato: `- **Nome** — descrição` (ou variações do dash).
    const match = line.match(/^\s*-\s+\*\*([^*]+)\*\*\s*[—–\-:]\s*(.+)$/);
    if (match?.[1] && match[2]) {
      items.push({ name: match[1].trim(), description: match[2].trim() });
    }
  }
  return items;
};
