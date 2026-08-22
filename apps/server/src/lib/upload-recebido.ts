import { extname } from 'node:path';
import { analisarVideo } from '@ds/shared';

/**
 * As regras de um arquivo que chega de fora.
 *
 * Estavam escritas dentro da rota de mídia de projetos, e a frente Criativos
 * precisa exatamente das mesmas: o mesmo teto, a mesma correção de tipo pelo
 * nome, a mesma recusa de vídeo que o navegador não toca. Copiar seria criar a
 * segunda cópia de uma regra que protege o disco e a entrega — e duas cópias
 * divergem sem ninguém errar de propósito.
 */

/**
 * 200 MB. O número existe por causa de vídeo: foto de produto não chega perto,
 * e um vídeo de campanha passa fácil de 100.
 */
export const TAMANHO_MAXIMO_BYTES = 200 * 1024 * 1024;

export const EXT_VIDEO = new Set(['.mp4', '.webm', '.mov', '.ogv', '.m4v']);
export const EXT_IMAGEM = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg', '.ico']);

/**
 * O nome com que o arquivo vai para o disco.
 *
 * O nome ORIGINAL é do cliente e pode conter qualquer coisa — separador de
 * caminho, `..`, dois-pontos de unidade no Windows. Aqui ele vira um nome
 * simples, e o carimbo de tempo evita que dois envios com o mesmo nome se
 * sobrescrevam: o segundo arquivo do cliente não pode apagar o primeiro.
 */
export const nomeSeguro = (original: string): string => {
  const simples = (original === '' ? 'arquivo' : original).replace(/[^\w.-]/g, '_');
  return `${Date.now().toString(36)}-${simples}`;
};

export type RecusaDeUpload = {
  readonly status: 400 | 413 | 415;
  readonly error: string;
  readonly message: string;
};

/**
 * O arquivo pode entrar? `null` quando sim.
 *
 * A conferência do vídeo é a que menos parece necessária e a que mais salvou:
 * `.mp4` é um CONTAINER, e o nome não diz o codec. Um HEVC entra sem reclamar,
 * vira um retângulo preto na tela e no site entregue, e nada avisa. `analisarVideo`
 * só recusa quando TEM CERTEZA; o que ela não sabe afirmar, passa.
 */
/**
 * A assinatura de cada formato de imagem, nos primeiros bytes do arquivo.
 *
 * Chamam-se "números mágicos" e existem porque a extensão é o que o REMETENTE
 * diz, e o conteúdo é o que o arquivo É. Um HTML com script dentro salvo como
 * `foto.png` passava por aqui: o nome dizia imagem, ninguém abria o arquivo, e
 * ele ia parar servido pelo mesmo servidor que o app.
 *
 * O `nosniff` global impede que o navegador o EXECUTE como página, e essa é a
 * defesa que vale mesmo — mas ela é do navegador do usuário. Uma segunda
 * conferência aqui não custa nada e não depende de cliente nenhum se comportar.
 */
const ASSINATURAS: readonly { readonly nome: string; readonly bytes: readonly number[] }[] = [
  { nome: 'png', bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
  { nome: 'jpeg', bytes: [0xff, 0xd8, 0xff] },
  { nome: 'gif', bytes: [0x47, 0x49, 0x46, 0x38] },
  // BMP, que aparece em captura de tela de Windows.
  { nome: 'bmp', bytes: [0x42, 0x4d] },
];

/** WebP e AVIF vivem dentro de um contêiner, então a marca não fica no byte 0. */
const contemNoInicio = (bytes: Uint8Array, texto: string, ate: number): boolean => {
  const alvo = [...texto].map((ch) => ch.charCodeAt(0));
  for (let i = 0; i + alvo.length <= Math.min(bytes.length, ate); i += 1) {
    if (alvo.every((b, j) => bytes[i + j] === b)) return true;
  }
  return false;
};

/**
 * Estes bytes são de uma imagem que a web abre?
 *
 * `null` quando o arquivo é curto demais para afirmar — e aí ele PASSA, pela
 * mesma regra do vídeo logo abaixo: recusar o que não se sabe afirmar
 * transformaria esta conferência numa fonte de recusa injusta.
 */
export const pareceImagem = (bytes: Uint8Array): boolean | null => {
  if (bytes.length < 12) return null;
  for (const a of ASSINATURAS) {
    if (a.bytes.every((b, i) => bytes[i] === b)) return true;
  }
  // WebP: "RIFF" no começo e "WEBP" no byte 8. AVIF/HEIC: "ftyp" perto do topo.
  if (contemNoInicio(bytes, 'WEBP', 16) || contemNoInicio(bytes, 'ftyp', 16)) return true;
  return false;
};

export const conferirUpload = (opts: {
  readonly nome: string;
  readonly tamanho: number;
  readonly bytes: Uint8Array;
}): RecusaDeUpload | null => {
  if (opts.tamanho > TAMANHO_MAXIMO_BYTES) {
    return {
      status: 413,
      error: 'arquivo_grande_demais',
      message:
        'Esse arquivo passa de 200 MB. Comprima antes de enviar, ou suba para um serviço de vídeo e cole o link.',
    };
  }

  const ext = extname(opts.nome).toLowerCase();

  /**
   * A extensão diz IMAGEM? Então o conteúdo tem de ser imagem.
   *
   * A recusa é 415 e a frase diz o que houve de verdade: "o nome termina em
   * .png e o conteúdo não é de imagem" é acionável; "arquivo inválido" manda a
   * pessoa adivinhar.
   */
  if (EXT_IMAGEM.has(ext) && pareceImagem(opts.bytes) === false) {
    return {
      status: 415,
      error: 'conteudo_nao_e_imagem',
      message: `O nome termina em ${ext}, mas o conteúdo do arquivo não é de imagem. Reenvie o arquivo original, ou exporte de novo a partir do editor.`,
    };
  }

  if (EXT_VIDEO.has(ext)) {
    const analise = analisarVideo(opts.bytes);
    if (!analise.tocaNaWeb && analise.motivo !== null) {
      return { status: 415, error: 'codec_nao_suportado', message: analise.motivo };
    }
  }
  return null;
};

/** É imagem ou vídeo, pelo NOME? `null` quando o nome não diz. */
export const tipoPelaExtensao = (nome: string): 'imagem' | 'video' | null => {
  const ext = extname(nome).toLowerCase();
  if (EXT_VIDEO.has(ext)) return 'video';
  if (EXT_IMAGEM.has(ext)) return 'imagem';
  return null;
};
