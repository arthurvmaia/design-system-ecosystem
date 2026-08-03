/**
 * O que dá para saber de um arquivo ANTES de ele subir.
 *
 * Duas perguntas, e as duas já eram respondidas dentro da etapa Mídia, coladas
 * no `onChange` do input: "isto é vídeo?" e "qual é a proporção?". O inspetor da
 * etapa Estrutura passou a receber upload também, e a alternativa era uma
 * terceira cópia das mesmas dez linhas — a versão que diverge na primeira
 * afinação e faz a MESMA escolha de arquivo ser aceita numa tela e recusada na
 * outra.
 */

/**
 * As extensões que contam como vídeo quando o navegador não diz o MIME.
 *
 * `file.type` vem VAZIO em alguns sistemas (é o caso conhecido do Windows com
 * associação de arquivo quebrada), e aí todo vídeo cairia em `image`: o thumb
 * renderizaria um `<img>` de `.mp4` e a checagem de contrato compararia o
 * arquivo com os espaços errados. O servidor aplica a mesma regra.
 */
export const EXTENSOES_DE_VIDEO = ['.mp4', '.webm', '.mov', '.ogv', '.m4v'] as const;

/** O arquivo escolhido é vídeo? MIME quando existe, extensão quando não. */
export const ehVideoEscolhido = (arquivo: { type?: string; name: string }): boolean => {
  if (arquivo.type !== undefined && arquivo.type !== '') return arquivo.type.startsWith('video/');
  const ponto = arquivo.name.lastIndexOf('.');
  if (ponto < 0) return false;
  const ext = arquivo.name.slice(ponto).toLowerCase();
  return (EXTENSOES_DE_VIDEO as readonly string[]).includes(ext);
};

/**
 * Teto para medir. Passar disto, o aviso de proporção some e o envio segue.
 *
 * Um arquivo que o navegador não consegue decodificar (codec que ele não tem,
 * arquivo truncado) deixaria a promessa pendurada para sempre, e o botão de
 * enviar ficaria parado sem ninguém saber por quê. Aviso atrasado é pior que
 * aviso nenhum.
 */
const LIMITE_PARA_MEDIR_MS = 4000;

/**
 * A proporção largura/altura do arquivo, quando o navegador consegue lê-la.
 *
 * `undefined` é resposta legítima e frequente: sem ela, `avaliarMidia` cala o
 * aviso de proporção em vez de chutar. Precisa do DOM, então não tem teste em
 * `node:test` — o que dava para separar em lógica pura (a decisão vídeo/imagem)
 * está em `ehVideoEscolhido`, e é o que o teste cobre.
 */
export const medirProporcao = (file: File, ehVideo: boolean): Promise<number | undefined> =>
  new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    let respondido = false;
    const responder = (p: number | undefined): void => {
      if (respondido) return;
      respondido = true;
      URL.revokeObjectURL(url);
      resolve(p);
    };
    const daMedida = (largura: number, altura: number): void =>
      responder(largura > 0 && altura > 0 ? largura / altura : undefined);
    setTimeout(() => responder(undefined), LIMITE_PARA_MEDIR_MS);

    if (ehVideo) {
      const v = document.createElement('video');
      v.preload = 'metadata';
      v.onloadedmetadata = () => daMedida(v.videoWidth, v.videoHeight);
      v.onerror = () => responder(undefined);
      v.src = url;
      return;
    }
    const img = new Image();
    img.onload = () => daMedida(img.naturalWidth, img.naturalHeight);
    img.onerror = () => responder(undefined);
    img.src = url;
  });
