import { familyName } from '@ds/shared/fonts';
import { ARQUETIPOS, TONS_DE_VOZ } from '@ds/shared/schemas';
import { contarRedes } from './social';

/**
 * Status de preenchimento das subseções da Marca — função pura.
 *
 * Comunica o estado sem depender só de cor (cada status tem um rótulo textual).
 * É o que alimenta os pontinhos e resumos da navegação interna da Marca.
 */
export type SecaoStatus = 'nao-iniciado' | 'configurado' | 'opcional';

export type MarcaSubId = 'marca' | 'voz' | 'paleta' | 'tipografia' | 'redes';

export type SecaoInfo = { status: SecaoStatus; resumo: string };

export type BrandStatusInput = {
  brandName?: string;
  primary?: string;
  background?: string;
  foreground?: string;
  accent?: string;
  fontDisplay?: string;
  fontBody?: string;
  social?: Record<string, string>;
  // ── Campos novos (A5) — todos opcionais para o legado seguir válido ──
  logos?: readonly { tipo: string }[];
  identidadeVerbal?: {
    tons: readonly string[];
    arquetipos: readonly string[];
    observacao?: string;
  };
  paleta?: { cores: readonly unknown[] };
  sociais?: readonly { url: string; visivel: boolean }[];
};

export const STATUS_LABEL: Record<SecaoStatus, string> = {
  'nao-iniciado': 'Não iniciado',
  configurado: 'Configurado',
  opcional: 'Opcional',
};

const nomeDoTom = (id: string | undefined): string | null =>
  TONS_DE_VOZ.find((t) => t.id === id)?.nome ?? null;

const nomeDoArquetipo = (id: string | undefined): string | null =>
  ARQUETIPOS.find((a) => a.id === id)?.nome ?? null;

export const marcaSectionStatus = (b: BrandStatusInput): Record<MarcaSubId, SecaoInfo> => {
  const nLogos = b.logos?.length ?? 0;
  const nCores =
    b.paleta !== undefined && b.paleta.cores.length > 0
      ? b.paleta.cores.length
      : [b.primary, b.background, b.foreground, b.accent].filter((c) => (c ?? '').trim() !== '')
          .length;

  const iv = b.identidadeVerbal;
  const vozPrincipal = [nomeDoTom(iv?.tons[0]), nomeDoArquetipo(iv?.arquetipos[0])]
    .filter((x): x is string => x !== null)
    .join(' · ');

  const nRedes =
    b.sociais !== undefined && b.sociais.length > 0
      ? b.sociais.filter((s) => s.visivel && s.url.trim() !== '').length
      : contarRedes(b.social);

  return {
    marca: b.brandName?.trim()
      ? {
          status: 'configurado',
          resumo:
            nLogos > 0
              ? `${b.brandName.trim()} · ${nLogos} logo${nLogos > 1 ? 's' : ''}`
              : b.brandName.trim(),
        }
      : { status: 'nao-iniciado', resumo: 'Nome e logos' },
    voz: vozPrincipal
      ? { status: 'configurado', resumo: vozPrincipal }
      : iv?.observacao?.trim()
        ? { status: 'configurado', resumo: iv.observacao.trim() }
        : { status: 'nao-iniciado', resumo: 'Tom de voz e postura' },
    paleta:
      nCores >= 3
        ? { status: 'configurado', resumo: `${nCores} cores definidas` }
        : { status: 'nao-iniciado', resumo: 'Defina as cores' },
    tipografia:
      (b.fontDisplay ?? '').trim() && (b.fontBody ?? '').trim()
        ? {
            status: 'configurado',
            resumo: `${familyName(b.fontDisplay ?? '')} + ${familyName(b.fontBody ?? '')}`,
          }
        : { status: 'nao-iniciado', resumo: 'Escolha as fontes' },
    redes:
      nRedes > 0
        ? { status: 'configurado', resumo: `${nRedes} ${nRedes === 1 ? 'canal' : 'canais'}` }
        : { status: 'opcional', resumo: 'Nenhuma rede (opcional)' },
  };
};
