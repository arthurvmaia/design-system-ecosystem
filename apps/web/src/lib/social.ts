/**
 * Redes sociais suportadas + validação de URL.
 *
 * Lista em config (não espalhada pelo componente). `branding.social` é um
 * `Record<string,string>` — aceitar uma rede nova é só somar aqui, sem migração.
 * Tudo opcional: nenhuma rede é obrigatória.
 */

export type SocialPlatform = { id: string; label: string; placeholder: string };

export const SOCIAL_PLATFORMS: SocialPlatform[] = [
  { id: 'instagram', label: 'Instagram', placeholder: 'https://instagram.com/sua-marca' },
  { id: 'linkedin', label: 'LinkedIn', placeholder: 'https://linkedin.com/company/...' },
  { id: 'youtube', label: 'YouTube', placeholder: 'https://youtube.com/@sua-marca' },
  { id: 'x', label: 'X', placeholder: 'https://x.com/sua-marca' },
  { id: 'facebook', label: 'Facebook', placeholder: 'https://facebook.com/sua-marca' },
  { id: 'tiktok', label: 'TikTok', placeholder: 'https://tiktok.com/@sua-marca' },
  { id: 'whatsapp', label: 'WhatsApp', placeholder: 'https://wa.me/5511999999999' },
  { id: 'pinterest', label: 'Pinterest', placeholder: 'https://pinterest.com/sua-marca' },
];

/**
 * Valida uma URL de rede social. Devolve `null` quando está OK (inclusive vazio,
 * porque é opcional) ou uma mensagem de erro clara. Aceita URL sem esquema
 * (`instagram.com/x`) tratando como https.
 */
export const validarUrlSocial = (raw: string): string | null => {
  const v = raw.trim();
  if (v === '') return null; // opcional
  let u: URL;
  try {
    u = new URL(/^https?:\/\//i.test(v) ? v : `https://${v}`);
  } catch {
    return 'URL inválida';
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return 'Use um endereço http(s)';
  if (!u.hostname.includes('.')) return 'Domínio incompleto';
  return null;
};

/** Quantas redes têm valor preenchido — para o resumo/status da seção. */
export const contarRedes = (social: Record<string, string> | undefined): number =>
  Object.values(social ?? {}).filter((v) => v.trim() !== '').length;
