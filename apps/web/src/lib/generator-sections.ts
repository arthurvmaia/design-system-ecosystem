import { familyName } from '@ds/shared/fonts';
import { contarRedes } from './social';

/**
 * Status de preenchimento das subseções da Marca — função pura.
 *
 * Comunica o estado sem depender só de cor (cada status tem um rótulo textual).
 * É o que alimenta os pontinhos e resumos da navegação interna da Marca.
 */
export type SecaoStatus = 'nao-iniciado' | 'configurado' | 'opcional';

export type MarcaSubId = 'marca' | 'paleta' | 'tipografia' | 'redes';

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
};

export const STATUS_LABEL: Record<SecaoStatus, string> = {
  'nao-iniciado': 'Não iniciado',
  configurado: 'Configurado',
  opcional: 'Opcional',
};

export const marcaSectionStatus = (b: BrandStatusInput): Record<MarcaSubId, SecaoInfo> => {
  const cores = [b.primary, b.background, b.foreground, b.accent].filter(
    (c) => (c ?? '').trim() !== '',
  ).length;
  const nRedes = contarRedes(b.social);

  return {
    marca: b.brandName?.trim()
      ? { status: 'configurado', resumo: b.brandName.trim() }
      : { status: 'nao-iniciado', resumo: 'Nome, tom e logo' },
    paleta:
      cores >= 3
        ? { status: 'configurado', resumo: `${cores} cores definidas` }
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
