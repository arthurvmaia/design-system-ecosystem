import { createReadStream, existsSync, statSync } from 'node:fs';
import { type Server, createServer } from 'node:http';
import { extname, join, normalize, resolve } from 'node:path';

/**
 * Servidor de fixtures para os testes de navegador.
 *
 * Existe por três motivos que `file://` não resolve:
 *
 * 1. **Origem.** Um `file://` não tem origem HTTP, e metade do que se testa aqui
 *    (mesma-origem de iframe, política de asset, `fetch`) depende disso.
 * 2. **Resposta que nunca termina.** O pedido exige a fixture "resposta de rede
 *    que nunca termina", e só um servidor pode produzi-la. `/nunca-termina`
 *    responde os cabeçalhos e nunca fecha o corpo — é o que prova que a drenagem
 *    encerra por timeout em vez de segurar o pipeline.
 * 3. **Assets binários gerados.** GIF e WebP animados são gerados em memória, sem
 *    binário comitado no repositório.
 *
 * Escuta em `127.0.0.1` numa porta efêmera. Não é servidor de produção e não deve
 * sair dos testes.
 */

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
  '.mp4': 'video/mp4',
};

/**
 * GIF89a animado de 2x2 com dois quadros de cores diferentes.
 *
 * Construído byte a byte de propósito: é o menor arquivo que prova a detecção de
 * "imagem animada", e gerá-lo evita um binário no repositório — que é exatamente
 * o tipo de artefato acidental que a regra de commit proíbe.
 */
export const gifAnimado = (): Buffer => {
  const bytes: number[] = [];
  const push = (...b: number[]): void => {
    for (const x of b) bytes.push(x);
  };
  // Header + Logical Screen Descriptor (2x2, tabela global de 4 cores).
  push(0x47, 0x49, 0x46, 0x38, 0x39, 0x61); // GIF89a
  push(0x02, 0x00, 0x02, 0x00); // 2x2
  push(0xf1, 0x00, 0x00); // GCT presente, 4 cores
  // Paleta: roxo, carmim, branco, preto.
  push(0x7c, 0x3a, 0xed, 0xb9, 0x1c, 0x1c, 0xff, 0xff, 0xff, 0x00, 0x00, 0x00);
  // Application Extension NETSCAPE 2.0 — o loop infinito.
  push(0x21, 0xff, 0x0b);
  for (const c of 'NETSCAPE2.0') push(c.charCodeAt(0));
  push(0x03, 0x01, 0x00, 0x00, 0x00);

  /** Um quadro de 2x2 com um índice de cor sólido, comprimido em LZW mínimo. */
  const quadro = (indice: number, atrasoCs: number): void => {
    // Graphic Control Extension: atraso, sem transparência.
    push(0x21, 0xf9, 0x04, 0x00, atrasoCs & 0xff, (atrasoCs >> 8) & 0xff, 0x00, 0x00);
    // Image Descriptor.
    push(0x2c, 0x00, 0x00, 0x00, 0x00, 0x02, 0x00, 0x02, 0x00, 0x00);
    // LZW com code size 2: clear(4) + 4 pixels + end(5), empacotados em 3 bits.
    const codeSize = 2;
    const clear = 1 << codeSize; // 4
    const end = clear + 1; // 5
    const codigos = [clear, indice, indice, indice, indice, end];
    let acumulador = 0;
    let bits = 0;
    const saida: number[] = [];
    for (const c of codigos) {
      acumulador |= c << bits;
      bits += codeSize + 1; // 3 bits por código
      while (bits >= 8) {
        saida.push(acumulador & 0xff);
        acumulador >>= 8;
        bits -= 8;
      }
    }
    if (bits > 0) saida.push(acumulador & 0xff);
    push(codeSize, saida.length, ...saida, 0x00);
  };

  quadro(0, 20); // roxo, 200ms
  quadro(1, 20); // carmim, 200ms
  push(0x3b); // trailer
  return Buffer.from(bytes);
};

export type ServidorFixture = {
  url: string;
  porta: number;
  fechar: () => Promise<void>;
  /** Quantas requisições chegaram, por caminho — útil para asserções. */
  pedidos: Map<string, number>;
};

export const iniciarServidorFixture = async (raiz: string): Promise<ServidorFixture> => {
  const base = resolve(raiz);
  // Raiz inexistente falha AQUI, alto, e não como 28 asserções de conteúdo.
  //
  // Sem esta guarda o servidor subia e respondia 404 para tudo. Quem chamou com
  // o caminho errado não recebia erro nenhum: a captura rodava contra uma
  // página vazia, o primeiro teste passava e os seguintes falhavam por conteúdo
  // ausente — o sintoma apontava para o motor, e a causa era o caminho.
  if (!existsSync(base)) {
    throw new Error(
      `Raiz de fixtures não existe: ${base}. O caminho deve sair de import.meta.url, não de process.cwd().`,
    );
  }
  const pedidos = new Map<string, number>();
  /** Conexões penduradas, para fechar todas no `fechar()` e não vazar o processo. */
  const penduradas = new Set<import('node:http').ServerResponse>();

  const server: Server = createServer((req, res) => {
    const caminho = (req.url ?? '/').split('?')[0] ?? '/';
    pedidos.set(caminho, (pedidos.get(caminho) ?? 0) + 1);

    if (caminho === '/nunca-termina') {
      // Cabeçalhos enviados, corpo nunca fechado. É a fixture de resposta que não
      // termina — a drenagem tem de cortar por timeout.
      res.writeHead(200, { 'content-type': 'image/png', 'cache-control': 'no-store' });
      res.write(Buffer.from([0x89, 0x50, 0x4e, 0x47]));
      penduradas.add(res);
      return;
    }
    if (caminho === '/animado.gif' || caminho === '/v2/animado.gif') {
      const gif = gifAnimado();
      res.writeHead(200, { 'content-type': 'image/gif', 'content-length': String(gif.length) });
      res.end(gif);
      return;
    }
    if (caminho === '/animado.webp' || caminho === '/v2/animado.webp') {
      // Não há WebP animado mínimo trivial de construir à mão. Servir o GIF com o
      // MIME de WebP mentiria; então respondemos 404 e a captura precisa ser
      // HONESTA sobre uma imagem que não carregou — que também é um caso de teste.
      res.writeHead(404, { 'content-type': 'text/plain' }).end('sem webp animado nesta fixture');
      return;
    }
    if (caminho === '/animacao.json' || caminho === '/v2/animacao.json') {
      const lottie = JSON.stringify({
        v: '5.12.2',
        fr: 30,
        ip: 0,
        op: 60,
        w: 120,
        h: 120,
        layers: [],
      });
      res.writeHead(200, { 'content-type': 'application/json' }).end(lottie);
      return;
    }

    const seguro = normalize(caminho).replace(/^([/\\])+/, '');
    const alvo = join(base, seguro);
    // Nada fora da raiz de fixtures — o servidor não deve virar leitura de disco.
    if (!alvo.startsWith(base)) {
      res.writeHead(403).end('fora da raiz');
      return;
    }
    const arquivo =
      existsSync(alvo) && statSync(alvo).isDirectory() ? join(alvo, 'index.html') : alvo;
    if (!existsSync(arquivo)) {
      res.writeHead(404, { 'content-type': 'text/plain' }).end('não encontrado');
      return;
    }
    res.writeHead(200, { 'content-type': MIME[extname(arquivo)] ?? 'application/octet-stream' });
    createReadStream(arquivo).pipe(res);
  });

  await new Promise<void>((ok) => server.listen(0, '127.0.0.1', ok));
  const addr = server.address();
  const porta = typeof addr === 'object' && addr !== null ? addr.port : 0;

  return {
    porta,
    url: `http://127.0.0.1:${porta}`,
    pedidos,
    fechar: async () => {
      for (const r of penduradas) {
        try {
          r.destroy();
        } catch {
          // já fechada
        }
      }
      penduradas.clear();
      await new Promise<void>((ok) => server.close(() => ok()));
    },
  };
};
