/**
 * Que codec tem este vídeo, e o navegador consegue tocar?
 *
 * Existe por um caso real: a pessoa subiu um `.mp4` de 29 MB, o app aceitou
 * sem dizer nada, e o vídeo apareceu como um retângulo PRETO — na tela de
 * mídia e no site entregue. O arquivo não estava corrompido: era HEVC (H.265),
 * que o Chrome não decodifica em `<video>`. `.mp4` é um CONTAINER, e o nome do
 * arquivo não diz o que tem dentro.
 *
 * O sintoma é cruel porque parece defeito do app: nada falha, nada avisa, e o
 * quadro fica preto. Detectar na hora do upload e dizer o que fazer é a única
 * saída honesta — transcodificar exigiria ffmpeg, um binário que este repo
 * evita de propósito.
 *
 * A leitura é dos BOXES do container, sem dependência: o `moov` guarda a
 * tabela de amostras, e dentro dela o código de quatro letras do codec.
 */

export type CodecDeVideo = 'h264' | 'hevc' | 'av1' | 'vp9' | 'vp8' | 'mpeg4' | 'desconhecido';

export type AnaliseDeVideo = {
  container: 'mp4' | 'webm' | 'outro';
  codec: CodecDeVideo;
  /** O navegador toca? `false` só quando temos CERTEZA de que não. */
  tocaNaWeb: boolean;
  /** O que dizer para a pessoa quando não toca. Null quando toca. */
  motivo: string | null;
};

/** Códigos de quatro letras que aparecem na tabela de amostras do MP4. */
const CODECS_MP4: ReadonlyArray<[string, CodecDeVideo]> = [
  ['hvc1', 'hevc'],
  ['hev1', 'hevc'],
  ['avc1', 'h264'],
  ['avc3', 'h264'],
  ['av01', 'av1'],
  ['vp09', 'vp9'],
  ['mp4v', 'mpeg4'],
];

/**
 * Os codecs que um navegador moderno toca sem plugin.
 *
 * HEVC fica de fora mesmo onde o sistema operacional o suporta: depende de
 * hardware e de build, então prometer que toca seria apostar no computador de
 * quem abre o site — exatamente o tipo de promessa que este app não faz.
 */
const TOCAM_NA_WEB = new Set<CodecDeVideo>(['h264', 'av1', 'vp9', 'vp8']);

const MOTIVO: Partial<Record<CodecDeVideo, string>> = {
  hevc: 'Este vídeo está em HEVC (H.265). O arquivo é válido, mas os navegadores não tocam esse formato: ele apareceria como um retângulo preto no site. Exporte de novo em H.264 (a opção "MP4" padrão de qualquer editor, ou "Mais compatível" no iPhone) e me mande outra vez.',
  mpeg4:
    'Este vídeo usa um codec antigo (MPEG-4 Parte 2) que os navegadores já não tocam. Exporte de novo em H.264 e me mande outra vez.',
};

/** Lê um inteiro de 32 bits big-endian. */
const u32 = (b: Uint8Array, i: number): number =>
  ((b[i] ?? 0) << 24) | ((b[i + 1] ?? 0) << 16) | ((b[i + 2] ?? 0) << 8) | (b[i + 3] ?? 0);

const texto = (b: Uint8Array, i: number, n: number): string =>
  String.fromCharCode(...b.subarray(i, i + n));

/** Onde está o `moov`? Ele pode vir no fim do arquivo (o caso mais comum). */
const acharMoov = (b: Uint8Array): { inicio: number; fim: number } | null => {
  let pos = 0;
  // Teto de segurança: arquivo com box corrompido não pode virar laço infinito.
  for (let i = 0; i < 64 && pos + 8 <= b.length; i++) {
    let tamanho = u32(b, pos) >>> 0;
    const tipo = texto(b, pos + 4, 4);
    let cabecalho = 8;
    if (tamanho === 1) {
      // Tamanho de 64 bits: só a parte baixa importa aqui (arquivo < 4 GB).
      tamanho = u32(b, pos + 12) >>> 0;
      cabecalho = 16;
    }
    if (tamanho < cabecalho) return null;
    if (tipo === 'moov') return { inicio: pos + cabecalho, fim: Math.min(b.length, pos + tamanho) };
    pos += tamanho;
  }
  return null;
};

export const analisarVideo = (bytes: Uint8Array): AnaliseDeVideo => {
  // WebM/Matroska: assinatura EBML. O container só carrega VP8/VP9/AV1 na
  // prática, e todos tocam — não vale escrever um parser de EBML para isso.
  if (bytes.length > 4 && u32(bytes, 0) >>> 0 === 0x1a45dfa3) {
    return { container: 'webm', codec: 'vp9', tocaNaWeb: true, motivo: null };
  }

  const ehMp4 = bytes.length > 12 && texto(bytes, 4, 4) === 'ftyp';
  if (!ehMp4) {
    // Sem assinatura conhecida não dá para afirmar nada. Deixar passar é o
    // certo: recusar por não reconhecer bloquearia formato válido.
    return { container: 'outro', codec: 'desconhecido', tocaNaWeb: true, motivo: null };
  }

  const moov = acharMoov(bytes);
  // Sem `moov` legível (streaming fragmentado, arquivo truncado no upload) a
  // análise não afirma nada, e o vídeo segue. Um falso "não toca" é pior:
  // recusaria um arquivo bom.
  const area =
    moov === null
      ? bytes.subarray(0, Math.min(bytes.length, 2_000_000))
      : bytes.subarray(moov.inicio, moov.fim);

  for (const [marca, codec] of CODECS_MP4) {
    const alvo = [...marca].map((c) => c.charCodeAt(0));
    for (let i = 0; i + 4 <= area.length; i++) {
      if (
        area[i] === alvo[0] &&
        area[i + 1] === alvo[1] &&
        area[i + 2] === alvo[2] &&
        area[i + 3] === alvo[3]
      ) {
        const toca = TOCAM_NA_WEB.has(codec);
        return {
          container: 'mp4',
          codec,
          tocaNaWeb: toca,
          motivo: toca ? null : (MOTIVO[codec] ?? null),
        };
      }
    }
  }

  return { container: 'mp4', codec: 'desconhecido', tocaNaWeb: true, motivo: null };
};
