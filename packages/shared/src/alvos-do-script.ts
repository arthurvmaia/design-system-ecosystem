import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * O script da peça encontra o que procura?
 *
 * ## De onde isto veio
 *
 * O dono reprovou uma linha do tempo que, no site de origem, se preenche
 * conforme a página rola. No site gerado ela saía parada e ligando nada.
 *
 * A causa estava no compilador de bundle, e já foi corrigida: ele prefixava
 * TODOS os ids internos de um SVG (para `url(#gradiente)` de dois segmentos não
 * colidirem) e não reescrevia o JavaScript que procura esses ids. O
 * `getElementById('pipeline-svg')` voltava `null`, o script batia no próprio
 * guarda e desistia na primeira linha, e o desenho congelava na geometria da
 * captura. **Nada aparece no console: o script simplesmente volta.**
 *
 * ## Por que a régua continua existindo depois do conserto
 *
 * Porque o conserto no motor não alcança o que já está em disco. Medido em
 * 2026-08-09, depois de corrigir o compilador e recompilar tudo: a Biblioteca
 * tinha as DUAS cópias da mesma peça — a antiga com o id prefixado e a nova
 * consertada — e o montador de kit escolheu a antiga. O motor estava certo e o
 * site saiu quebrado do mesmo jeito.
 *
 * Uma peça cujo script não acha o próprio alvo é uma peça que não faz o que o
 * nome dela promete. Isso não se descobre olhando: descobre-se contando. E vale
 * para qualquer causa — id renomeado, marcação podada no recorte, script de
 * outra seção que veio junto.
 *
 * ## Só o RENOMEIO, e a medição que ensinou isso
 *
 * A primeira versão acusava todo id literal ausente do HTML. Reprovou **316 de
 * 1396 peças** — e o número estava errado, não o acervo. Os `assets/js` de uma
 * captura são os scripts do SITE INTEIRO, compartilhados entre os segmentos: um
 * `interactions.js` que procura `#mobile-menu` legitimamente não acha esse id
 * numa peça de hero, e corretamente não faz nada. Isso é script bem escrito, não
 * peça quebrada.
 *
 * A assinatura do defeito é outra e é inequívoca: **o elemento ESTÁ ali, sob
 * outro nome.** O HTML tem `seg6-svg1-pipeline-svg` e o script procura
 * `pipeline-svg`. Aí não há leitura benigna — alguém renomeou debaixo do script.
 *
 * Então a régua acusa só quando existe, no HTML, um id que termina em
 * `-<procurado>`. Com isso ela pega os 4 bundles que a medição do acervo tinha
 * apontado, e nenhum a mais. Busca montada em tempo de execução (`'#'+nome`)
 * continua fora: sem executar não se sabe o alvo, e acusar no escuro reprova
 * peça boa.
 */

/** Um alvo que o script procura e que existe no HTML sob outro nome. */
export type AlvoPerdido = {
  /** O id, como está escrito no script. */
  id: string;
  /** O arquivo do script (ou `index.html #n` para script inline). */
  onde: string;
  /** O id que o HTML tem no lugar — a prova de que o elemento está ali. */
  viraram: string;
};

const IGNORAR = new Set(['', 'root', 'app', '__next']);

/** `getElementById('x')` e `querySelector('#x')`, com o id literal. */
const alvosLiterais = (js: string): string[] => {
  const out = new Set<string>();
  for (const m of js.matchAll(/getElementById\(\s*['"`]([^'"`]+)['"`]\s*\)/g)) {
    const id = m[1];
    if (id !== undefined) out.add(id);
  }
  // Só o seletor que é EXATAMENTE um id: `#a .b` depende do documento inteiro e
  // pode legitimamente não casar numa peça recortada.
  for (const m of js.matchAll(/querySelector(?:All)?\(\s*['"`]#([A-Za-z][\w-]*)['"`]\s*\)/g)) {
    const id = m[1];
    if (id !== undefined) out.add(id);
  }
  return [...out].filter((id) => !IGNORAR.has(id));
};

const idsDoHtml = (html: string): Set<string> => {
  const out = new Set<string>();
  for (const m of html.matchAll(/\bid=["']([^"']+)["']/g)) {
    const id = m[1];
    if (id !== undefined) out.add(id);
  }
  return out;
};

const scriptsInline = (html: string): string[] =>
  [...html.matchAll(/<script\b(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1] ?? '');

const lerJs = (dir: string): { nome: string; js: string }[] => {
  const jsDir = join(dir, 'assets', 'js');
  if (!existsSync(jsDir)) return [];
  const out: { nome: string; js: string }[] = [];
  let nomes: string[] = [];
  try {
    nomes = readdirSync(jsDir);
  } catch {
    return [];
  }
  for (const nome of nomes) {
    if (!nome.endsWith('.js')) continue;
    try {
      out.push({ nome: `assets/js/${nome}`, js: readFileSync(join(jsDir, nome), 'utf8') });
    } catch {
      // Arquivo ilegível não vira acusação: a régua só fala do que leu.
    }
  }
  return out;
};

/**
 * Os alvos que o script procura por id literal e que o HTML da peça não tem.
 *
 * Lista vazia = o script acha tudo que procura, ou não procura nada por id.
 */
export const alvosPerdidosDoBundle = (dir: string): AlvoPerdido[] => {
  const indexPath = join(dir, 'index.html');
  if (!existsSync(indexPath)) return [];

  let html = '';
  try {
    html = readFileSync(indexPath, 'utf8');
  } catch {
    return [];
  }

  const presentes = idsDoHtml(html);
  /**
   * O mesmo elemento sob outro nome: um id do HTML que termina em `-<procurado>`.
   *
   * É a única leitura que não tem explicação benigna. Id simplesmente ausente
   * costuma ser script do site inteiro procurando outra seção — ver o cabeçalho.
   */
  const renomeado = (id: string): string | null => {
    const sufixo = `-${id}`;
    for (const p of presentes) if (p.length > sufixo.length && p.endsWith(sufixo)) return p;
    return null;
  };

  const perdidos: AlvoPerdido[] = [];
  const vistos = new Set<string>();

  const pedacos = [
    ...lerJs(dir),
    ...scriptsInline(html).map((js, i) => ({ nome: `index.html #${i + 1}`, js })),
  ];

  for (const { nome, js } of pedacos) {
    for (const id of alvosLiterais(js)) {
      if (presentes.has(id)) continue;
      const viraram = renomeado(id);
      if (viraram === null) continue;
      const chave = `${id}@${nome}`;
      if (vistos.has(chave)) continue;
      vistos.add(chave);
      perdidos.push({ id, onde: nome, viraram });
    }
  }
  return perdidos;
};
