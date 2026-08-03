import { familyName } from '@ds/shared/fonts';
import { ARQUETIPOS, DEFAULT_PROJECT_BRANDING, TONS_DE_VOZ } from '@ds/shared/schemas';
import { contarRedes } from './social';

/**
 * Status de preenchimento das subseções da Marca — função pura.
 *
 * Comunica o estado sem depender só de cor (cada status tem um rótulo textual).
 * É o que alimenta os pontinhos e resumos da navegação interna da Marca.
 *
 * ## Por que `padrao` existe, e por que ele NÃO se chama `herdado do kit`
 *
 * A tela dizia "herdado do kit" para tudo que não estivesse configurado, e a
 * frase era falsa nos dois sentidos possíveis.
 *
 * Falsa por excesso: ela aparecia em Redes, que é opcional, e em Contato e Voz,
 * que não têm o que herdar de kit nenhum — o nome da empresa e o tom de voz são
 * do usuário, não da origem capturada.
 *
 * E falsa na raiz: **nada é herdado do kit hoje.** `buildBrandingCss`
 * (`packages/generator/src/index.ts:309`) recebe SÓ o branding; o kit não é
 * consultado em momento algum. Quem deixa a paleta como veio não recebe as
 * cores do kit — recebe o `#7f1d1d` de fábrica, no site gerado, do jeito que
 * está.
 *
 * Por isso o estado se chama `padrao` e o resumo diz o que de fato acontece.
 * Trocar a frase por "herdado do kit" num lugar mais certo seria trocar uma
 * mentira por outra; herança de verdade é trabalho de motor, não de rótulo.
 */
export type SecaoStatus = 'nao-iniciado' | 'parcial' | 'padrao' | 'configurado' | 'opcional';

export type MarcaSubId = 'marca' | 'voz' | 'paleta' | 'tipografia' | 'contato' | 'redes';

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
  // ── Contato e chamada, que vieram da etapa Conteúdo ──
  contact?: { email: string; phone: string; whatsapp: string; address: string };
  mainCta?: { label: string; href: string };
};

export const STATUS_LABEL: Record<SecaoStatus, string> = {
  'nao-iniciado': 'Não iniciado',
  parcial: 'Parcial',
  padrao: 'No padrão',
  configurado: 'Configurado',
  opcional: 'Opcional',
};

/** As cores de fábrica, em minúsculas, para comparar com o que veio da tela. */
const CORES_DE_FABRICA = new Set(
  Object.values(DEFAULT_PROJECT_BRANDING.palette).map((c) => c.toLowerCase()),
);

const FONTE_DE_FABRICA = new Set(
  [DEFAULT_PROJECT_BRANDING.typography.display, DEFAULT_PROJECT_BRANDING.typography.body].map((f) =>
    familyName(f).toLowerCase(),
  ),
);

/**
 * Nenhuma cor escolhida escapa do conjunto de fábrica.
 *
 * O wizard SEMEIA a paleta com as três cores do `DEFAULT_PROJECT_BRANDING`
 * (`Wizard.tsx:712-719`), então uma paleta intocada chega aqui com três cores e
 * passava por "3 cores definidas" — o não-escolher da pessoa aparecia na tela
 * como escolha feita.
 */
const soTemCorDeFabrica = (hexes: readonly string[]): boolean =>
  hexes.length > 0 && hexes.every((h) => CORES_DE_FABRICA.has(h.trim().toLowerCase()));

const nomeDoTom = (id: string | undefined): string | null =>
  TONS_DE_VOZ.find((t) => t.id === id)?.nome ?? null;

const nomeDoArquetipo = (id: string | undefined): string | null =>
  ARQUETIPOS.find((a) => a.id === id)?.nome ?? null;

export const marcaSectionStatus = (b: BrandStatusInput): Record<MarcaSubId, SecaoInfo> => {
  const nLogos = b.logos?.length ?? 0;
  // O `hex` vem de `unknown` (o schema da paleta é aberto aqui de propósito, para
  // o legado de 4 cores continuar entrando), então é lido com guarda.
  const hexDeCor = (c: unknown): string =>
    typeof c === 'object' && c !== null && 'hex' in c && typeof c.hex === 'string' ? c.hex : '';
  const hexes =
    b.paleta !== undefined && b.paleta.cores.length > 0
      ? b.paleta.cores.map(hexDeCor).filter((h) => h.trim() !== '')
      : [b.primary, b.background, b.foreground, b.accent].filter(
          (c): c is string => (c ?? '').trim() !== '',
        );
  const nCores =
    b.paleta !== undefined && b.paleta.cores.length > 0 ? b.paleta.cores.length : hexes.length;

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
    paleta: soTemCorDeFabrica(hexes)
      ? { status: 'padrao', resumo: 'O site sai com as cores de fábrica' }
      : nCores >= 3
        ? { status: 'configurado', resumo: `${nCores} cores definidas` }
        : nCores > 0
          ? { status: 'parcial', resumo: `${nCores} de 3 cores` }
          : { status: 'nao-iniciado', resumo: 'Defina as cores' },
    tipografia: (() => {
      const display = (b.fontDisplay ?? '').trim();
      const corpo = (b.fontBody ?? '').trim();
      if (display === '' && corpo === '') {
        return { status: 'nao-iniciado' as const, resumo: 'Escolha as fontes' };
      }
      if (display === '' || corpo === '') {
        return {
          status: 'parcial' as const,
          resumo: `Falta a fonte de ${display === '' ? 'títulos' : 'corpo'}`,
        };
      }
      const resumo = `${familyName(display)} + ${familyName(corpo)}`;
      const deFabrica =
        FONTE_DE_FABRICA.has(familyName(display).toLowerCase()) &&
        FONTE_DE_FABRICA.has(familyName(corpo).toLowerCase());
      return deFabrica
        ? { status: 'padrao' as const, resumo: `${resumo}, ainda de fábrica` }
        : { status: 'configurado' as const, resumo };
    })(),
    contato: (() => {
      const cta = b.mainCta?.label.trim() ?? '';
      const canais = [
        b.contact?.email,
        b.contact?.phone,
        b.contact?.whatsapp,
        b.contact?.address,
      ].filter((c) => (c ?? '').trim() !== '').length;
      const plural = `${canais} ${canais === 1 ? 'canal' : 'canais'}`;
      // Chamada sem canal manda a pessoa clicar num botão que não leva a lugar
      // nenhum, e canal sem chamada esconde o contato no rodapé. Os dois são
      // meio caminho, e a tela passa a dizer qual metade falta.
      if (cta !== '' && canais > 0) {
        return { status: 'configurado' as const, resumo: `${cta} · ${plural}` };
      }
      if (cta !== '') return { status: 'parcial' as const, resumo: `${cta}, sem canal` };
      if (canais > 0) return { status: 'parcial' as const, resumo: `${plural}, sem chamada` };
      return { status: 'nao-iniciado' as const, resumo: 'Como falar com você' };
    })(),
    redes:
      nRedes > 0
        ? { status: 'configurado', resumo: `${nRedes} ${nRedes === 1 ? 'canal' : 'canais'}` }
        : { status: 'opcional', resumo: 'Nenhuma rede (opcional)' },
  };
};
