/**
 * Fotos REAIS para as mídias automáticas, via Pexels.
 *
 * O dono foi claro: mídia de produto tem de parecer produto de verdade, não
 * desenho. Sem API paga (a trava de custo do projeto segue valendo), a fonte é
 * a Pexels: banco gratuito, busca por termo, licença livre para uso comercial
 * sem atribuição obrigatória. Pinterest foi descartado: não existe API pública
 * gratuita de busca, e raspar viola os termos deles.
 *
 * A chave é gratuita (pexels.com/api) e mora em `PEXELS_API_KEY` no `.env` do
 * servidor. SEM chave ou SEM rede, nada aqui é chamado — o chamador degrada
 * para o desenho de cena por nicho, que continua existindo exatamente para
 * isso. A falha de rede nunca derruba a marca automática.
 */

export type FotoBaixada = {
  bytes: Buffer;
  /** "Nome do fotógrafo / Pexels" — a licença não exige, mas honestidade sim. */
  credito: string;
  ext: 'jpg';
  mime: 'image/jpeg';
};

/** A chave da Pexels, se o dono configurou. */
export const chavePexels = (): string | null => {
  const chave = process.env.PEXELS_API_KEY?.trim();
  return chave !== undefined && chave.length > 0 ? chave : null;
};

type RespostaPexels = {
  photos?: Array<{
    src?: { large2x?: string; large?: string };
    photographer?: string;
  }>;
};

/**
 * Fotos que já saíram nesta execução, por URL: duas seções com a mesma busca
 * não podem estampar a mesma foto (a vitrine com quatro produtos iguais é o
 * mesmo defeito da "mídia de teste", com outra roupa).
 */
const jaUsadas = new Set<string>();

/**
 * A degradação para desenho é silenciosa PARA O USUÁRIO — foto nunca derruba a
 * marca automática, e essa decisão fica. Mas silêncio total esconde defeito de
 * infraestrutura: com a chave configurada e certa, as buscas falhavam TODAS por
 * `unable to get local issuer certificate` (o Turbo roda em modo `strict` e não
 * repassava o `NODE_EXTRA_CA_CERTS` da máquina, então o servidor não validava
 * o certificado que a rede corporativa inspeciona), e a única evidência era um
 * site cheio de desenho sem ninguém saber por quê.
 *
 * Uma reclamação por processo: quem está com a chave posta merece saber que ela
 * não está funcionando, e repetir a cada imagem viraria ruído no console.
 */
let jaReclamou = false;
const reclamarUmaVez = (motivo: string): void => {
  if (jaReclamou) return;
  jaReclamou = true;
  console.warn(
    `[pexels] ${motivo}. As mídias saem como desenho de cena. Se a chave está certa, confira se o processo enxerga o NODE_EXTRA_CA_CERTS da máquina.`,
  );
};

/**
 * Busca e BAIXA até `quantas` fotos para um termo. Qualquer falha (sem rede,
 * chave inválida, cota, resposta estranha) devolve o que conseguiu — inclusive
 * lista vazia. O chamador completa o que faltar com o desenho de cena.
 */
export const buscarFotos = async (
  termo: string,
  quantas: number,
  opcoes?: { retrato?: boolean },
): Promise<FotoBaixada[]> => {
  const chave = chavePexels();
  if (chave === null || quantas <= 0) return [];
  const url = new URL('https://api.pexels.com/v1/search');
  url.searchParams.set('query', termo);
  // Margem sobre o pedido: parte dos resultados cai no dedupe entre seções.
  url.searchParams.set('per_page', String(Math.min(quantas * 3, 30)));
  url.searchParams.set('orientation', opcoes?.retrato === true ? 'portrait' : 'landscape');

  const saida: FotoBaixada[] = [];
  try {
    const resposta = await fetch(url, {
      headers: { Authorization: chave },
      signal: AbortSignal.timeout(10_000),
    });
    if (!resposta.ok) {
      reclamarUmaVez(`a Pexels respondeu HTTP ${resposta.status} à busca "${termo}"`);
      return [];
    }
    const corpo = (await resposta.json()) as RespostaPexels;
    for (const foto of corpo.photos ?? []) {
      if (saida.length >= quantas) break;
      const src = foto.src?.large2x ?? foto.src?.large;
      if (src === undefined || jaUsadas.has(src)) continue;
      try {
        const r = await fetch(src, { signal: AbortSignal.timeout(15_000) });
        if (!r.ok) continue;
        jaUsadas.add(src);
        saida.push({
          bytes: Buffer.from(await r.arrayBuffer()),
          credito: `${foto.photographer ?? 'autor desconhecido'} / Pexels`,
          ext: 'jpg',
          mime: 'image/jpeg',
        });
      } catch {
        // uma foto que não baixa não derruba as outras
      }
    }
  } catch (erro) {
    const causa = (erro as { cause?: { message?: string } }).cause?.message;
    reclamarUmaVez(`não consegui falar com a Pexels (${causa ?? (erro as Error).message})`);
  }
  return saida;
};
