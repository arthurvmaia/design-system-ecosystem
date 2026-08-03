import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { getRoot } from '@ds/shared/paths';
import { Hono } from 'hono';

/**
 * Onde cada frente da suíte atende, vista de fora.
 *
 * ## O problema que isto resolve
 *
 * O portal monta os endereços das três portas a partir do host de onde ele
 * mesmo foi aberto, trocando só a porta: `localhost:5173`, `localhost:3000`.
 * Isso funciona na máquina e quebra no túnel, porque lá fora não existe porta
 * 5173 nenhuma: cada frente sai por um endereço `trycloudflare` próprio, com
 * nome sorteado na hora.
 *
 * Um túnel aponta para UM endereço. Servir as três por caminho (`/lojas`,
 * `/design-system`) exigiria ensinar cada app a viver debaixo de um
 * sub-caminho, e os dois assumem que moram na raiz: o endereço de cada arquivo
 * deles quebraria. Três túneis custam três processos e nenhuma reescrita.
 *
 * ## Por que um arquivo, e não uma variável de ambiente
 *
 * Porque os endereços só existem DEPOIS que o `cloudflared` sobe, e o servidor
 * já está de pé a essa altura. O `publicar.ts` escreve o arquivo quando os três
 * nomes aparecem; esta rota lê a cada pedido. Sem arquivo, a resposta é vazia e
 * o portal volta a usar as portas locais, que é o certo quando não há túnel.
 */

export type EnderecosPublicos = {
  portal?: string;
  designSystem?: string;
  lojas?: string;
  /** Quando o arquivo foi escrito, para a tela poder desconfiar de um túnel velho. */
  gravadoEm?: number;
};

export const arquivoDeEnderecos = (): string => join(getRoot(), 'tunel.json');

export const enderecosRoute = new Hono();

enderecosRoute.get('/', (c) => {
  const caminho = arquivoDeEnderecos();
  if (!existsSync(caminho)) return c.json({ enderecos: null });
  try {
    const bruto = JSON.parse(readFileSync(caminho, 'utf8')) as EnderecosPublicos;
    // Só devolve o que é endereço de verdade: um campo com lixo dentro viraria
    // um cartão que leva a lugar nenhum, e isso é pior que o cartão local.
    const limpo: EnderecosPublicos = {};
    for (const chave of ['portal', 'designSystem', 'lojas'] as const) {
      const valor = bruto[chave];
      if (typeof valor === 'string' && /^https?:\/\/[^\s]+$/.test(valor)) limpo[chave] = valor;
    }
    if (typeof bruto.gravadoEm === 'number') limpo.gravadoEm = bruto.gravadoEm;
    return c.json({ enderecos: Object.keys(limpo).length > 0 ? limpo : null });
  } catch {
    // Arquivo ilegível é o mesmo que arquivo ausente: o portal usa o local.
    return c.json({ enderecos: null });
  }
});
