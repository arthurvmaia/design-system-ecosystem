/**
 * Segurança do download de assets — guardas puros e testáveis.
 *
 * Baixar uma URL que veio de uma página é uma porta de SSRF: a página poderia
 * apontar para `http://localhost`, para a rede interna, ou para o endpoint de
 * metadados da nuvem (169.254.169.254). Aqui ficam as decisões — protocolo,
 * host, IP, tamanho — separadas da mecânica de rede, para serem testadas sem
 * abrir socket nenhum.
 *
 * Default: SÓ http/https para hosts públicos. Um flag de ambiente
 * (`DS_ASSET_ALLOW_LOCAL=1`) libera localhost/rede privada — apenas para
 * fixtures/dev, nunca em produção.
 */

/** Protocolos que podem virar asset. Nada de file:, ftp:, gopher:, data: aqui. */
const PROTO_PERMITIDOS = new Set(['http:', 'https:']);

/** Motivo pelo qual uma URL foi barrada (ou `null` se passou). */
export type MotivoBloqueio =
  | 'protocolo'
  | 'url-invalida'
  | 'host-local'
  | 'ip-privado'
  | 'metadata'
  | null;

const ehIpv4Privado = (host: string): boolean => {
  const m = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!m) return false;
  const [a, b] = [Number(m[1]), Number(m[2])];
  if (a === 10) return true; // 10.0.0.0/8
  if (a === 127) return true; // loopback
  if (a === 0) return true; // 0.0.0.0/8
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
  if (a === 192 && b === 168) return true; // 192.168.0.0/16
  if (a === 169 && b === 254) return true; // link-local (inclui metadata 169.254.169.254)
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT 100.64.0.0/10
  return false;
};

const HOSTS_LOCAIS = new Set([
  'localhost',
  'localhost.localdomain',
  'ip6-localhost',
  '[::1]',
  '::1',
]);

/** É endereço de metadados de nuvem? (AWS/GCP/Azure usam 169.254.169.254). */
const ehMetadata = (host: string): boolean =>
  host === '169.254.169.254' || host === 'metadata.google.internal';

/** Permite localhost/rede privada? Só com o flag explícito (fixtures/dev). */
export const permiteLocal = (): boolean => process.env.DS_ASSET_ALLOW_LOCAL === '1';

/**
 * Julga uma URL de asset. Devolve o motivo do bloqueio, ou `null` se é segura.
 * Puro: recebe a URL (e, opcionalmente, se local é permitido) e decide.
 */
export const avaliarUrlAsset = (url: string, permitirLocal = permiteLocal()): MotivoBloqueio => {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return 'url-invalida';
  }
  if (!PROTO_PERMITIDOS.has(u.protocol)) return 'protocolo';

  const host = u.hostname.toLowerCase();
  if (ehMetadata(host)) return 'metadata';
  if (permitirLocal) return null;

  if (HOSTS_LOCAIS.has(host) || host.endsWith('.local') || host.endsWith('.internal')) {
    return 'host-local';
  }
  if (ehIpv4Privado(host)) return 'ip-privado';
  // IPv6 loopback/ULA/link-local.
  if (host === '[::1]' || /^\[(fc|fd|fe80)/i.test(host)) return 'ip-privado';
  return null;
};

export const urlAssetSegura = (url: string, permitirLocal = permiteLocal()): boolean =>
  avaliarUrlAsset(url, permitirLocal) === null;

/**
 * O MIME devolvido bate com o que a extensão/kind promete? Barra "conteúdo
 * disfarçado" — um `.png` que volta `text/html` é um link, não um asset.
 */
export const mimeCoerente = (mime: string, kind: string): boolean => {
  const m = mime.split(';')[0]?.trim().toLowerCase() ?? '';
  if (m === '' || m === 'application/octet-stream') return true; // desconhecido: tolera
  if (/^text\/html/.test(m)) return false; // uma página nunca é asset
  const familia = m.split('/')[0];
  if (kind === 'image' || kind === 'svg') return familia === 'image';
  if (kind === 'font') return familia === 'font' || m.includes('font') || familia === 'application';
  if (kind === 'video') return familia === 'video';
  if (kind === 'css') return m.includes('css');
  if (kind === 'json') return m.includes('json');
  return true;
};
