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
