import { GOOGLE_FONTS } from '@ds/shared/fonts';
import { CorDaPaleta } from '@ds/shared/schemas';
import { Upload, X } from 'lucide-react';
import type { Dispatch, SetStateAction } from 'react';

/**
 * A DIREÇÃO DA MARCA, no caminho de quem não tem projeto.
 *
 * ## O que este bloco conserta
 *
 * O passo 2 pedia duas coisas: o nome da marca e uma cor. Com isso a peça só
 * podia sair com o nome escrito numa fonte de sistema sobre um retângulo
 * colorido, e era exatamente isso que ela fazia. Quem tem projeto via logotipo,
 * paleta, tipografia e voz na tela e lia "paleta, tipografia e voz vêm junto";
 * não vinham, porque o pedido não tinha onde carregá-las.
 *
 * ## O critério do que entra aqui
 *
 * Um criativo de tráfego pago tem cinco segundos e um objetivo. Cada campo
 * abaixo existe porque a COMPOSIÇÃO usa e a RÉGUA mede:
 *
 * - **logotipo**: assina a peça no lugar do texto. É a maior diferença entre um
 *   banner genérico e o anúncio de uma marca.
 * - **cores de apoio**: a primeira que se lê vira o BOTÃO, que é o elemento de
 *   conversão da peça.
 * - **fonte**: o título na letra da marca.
 * - **assinatura**: para onde ir. Anúncio que não diz isso gasta a impressão.
 * - **tom** e **estilo**: direção para quem escreve e para quem pede o pixel.
 *   Nunca viram texto na peça.
 *
 * Campo que não vira pixel é formulário cobrando trabalho e devolvendo nada, e
 * por isso nenhum outro está aqui.
 */
export function DirecaoManual({
  corDoBotao,
  coresDeApoio,
  setCoresDeApoio,
  logotipoNome,
  subindoLogotipo,
  onLogotipo,
  onTirarLogotipo,
  fonteTitulos,
  setFonteTitulos,
  assinatura,
  setAssinatura,
  tom,
  setTom,
  estiloVisual,
  setEstiloVisual,
  mostraEstilo,
}: {
  /** A cor que o botão VAI ter, já decidida pela mesma conta do compositor. */
  corDoBotao: { readonly acento: string; readonly acentoVeioDaMarca: boolean } | null;
  coresDeApoio: string[];
  setCoresDeApoio: Dispatch<SetStateAction<string[]>>;
  logotipoNome: string | null;
  subindoLogotipo: boolean;
  onLogotipo: (file: File) => void;
  onTirarLogotipo: () => void;
  fonteTitulos: string;
  setFonteTitulos: Dispatch<SetStateAction<string>>;
  assinatura: string;
  setAssinatura: Dispatch<SetStateAction<string>>;
  tom: string;
  setTom: Dispatch<SetStateAction<string>>;
  estiloVisual: string;
  setEstiloVisual: Dispatch<SetStateAction<string>>;
  /** O estilo só guia o que é GERADO: com foto do cliente, ele não tem uso. */
  mostraEstilo: boolean;
}) {
  const campo = {
    borderColor: 'var(--color-border)',
    color: 'var(--color-fg)',
    background: 'transparent',
  };
  const trocarApoio = (i: number, hex: string) =>
    setCoresDeApoio((atual) => atual.map((c, j) => (j === i ? hex : c)));

  return (
    <>
      {/* ── Logotipo ────────────────────────────────────────────────────── */}
      <div className="sm:col-span-2">
        <span className="ds-label">logotipo (opcional)</span>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <label
            className="flex cursor-pointer items-center gap-2 border px-3 py-2 text-[12px]"
            style={{ borderColor: 'var(--color-border)', color: 'var(--color-fg-muted)' }}
          >
            <Upload size={13} />
            {subindoLogotipo ? 'recebendo' : logotipoNome !== null ? 'trocar' : 'escolher arquivo'}
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f !== undefined) onLogotipo(f);
              }}
            />
          </label>
          {logotipoNome !== null && (
            <span
              className="ds-data flex items-center gap-2 text-[11px]"
              style={{ color: 'var(--color-fg-subtle)' }}
            >
              {logotipoNome}
              <button
                type="button"
                onClick={onTirarLogotipo}
                aria-label="Tirar o logotipo do pedido"
                style={{ color: 'var(--color-fg-muted)' }}
              >
                <X size={12} />
              </button>
            </span>
          )}
        </div>
        <p className="mt-1.5 text-[11.5px]" style={{ color: 'var(--color-fg-subtle)' }}>
          {logotipoNome === null
            ? 'Sem logotipo, a marca assina com o nome escrito. Com ele, o logotipo entra no lugar do nome, na proporção do arquivo.'
            : 'Ele entra no lugar do nome escrito, na proporção exata do arquivo. Fundo transparente funciona melhor.'}
        </p>
      </div>

      {/* ── Cores de apoio ──────────────────────────────────────────────── */}
      <div className="sm:col-span-2">
        <span className="ds-label">outras cores da marca (opcional)</span>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {coresDeApoio.map((hex, i) => (
            <div
              // A posição É a identidade aqui: duas cores podem ser iguais
              // enquanto a pessoa digita, e a lista é curta.
              // biome-ignore lint/suspicious/noArrayIndexKey: a posição é a identidade
              key={`apoio-${i}`}
              className="flex items-center gap-1.5 border px-2 py-1.5"
              style={{ borderColor: 'var(--color-border)' }}
            >
              <input
                type="color"
                value={CorDaPaleta.shape.hex.safeParse(hex).success ? hex : '#D0B178'}
                onChange={(e) => trocarApoio(i, e.target.value)}
                aria-label={`Cor de apoio ${i + 1}`}
                className="h-7 w-7 shrink-0 cursor-pointer rounded-none border"
                style={{ borderColor: 'var(--color-border)', background: 'transparent' }}
              />
              <input
                type="text"
                value={hex}
                onChange={(e) => trocarApoio(i, e.target.value)}
                placeholder="#D0B178"
                className="ds-data w-[86px] bg-transparent text-[12px] outline-none"
                style={{ color: 'var(--color-fg)' }}
              />
              <button
                type="button"
                onClick={() => setCoresDeApoio((a) => a.filter((_, j) => j !== i))}
                aria-label={`Tirar a cor de apoio ${i + 1}`}
                style={{ color: 'var(--color-fg-muted)' }}
              >
                <X size={12} />
              </button>
            </div>
          ))}
          {coresDeApoio.length < 3 && (
            <button
              type="button"
              onClick={() => setCoresDeApoio((a) => [...a, '#D0B178'])}
              className="border px-3 py-2 text-[12px]"
              style={{ borderColor: 'var(--color-border)', color: 'var(--color-fg-muted)' }}
            >
              + cor
            </button>
          )}
        </div>
        <p className="mt-1.5 text-[11.5px]" style={{ color: 'var(--color-fg-subtle)' }}>
          {corDoBotao === null
            ? 'A primeira que se separar da cor principal e aceitar texto legível vira o botão.'
            : corDoBotao.acentoVeioDaMarca
              ? 'A primeira que se lê vira o botão. Nesta paleta, vai ser esta:'
              : 'Nenhuma destas se separa da cor principal e aceita texto legível ao mesmo tempo, então o botão sai numa cor calculada:'}
          {corDoBotao !== null && (
            <span
              className="ml-1.5 inline-block h-3 w-6 translate-y-[2px] border"
              style={{ background: corDoBotao.acento, borderColor: 'var(--color-border)' }}
            />
          )}
        </p>
      </div>

      {/* ── Fonte e assinatura ──────────────────────────────────────────── */}
      <div>
        <span className="ds-label">fonte dos títulos (opcional)</span>
        <select
          value={fonteTitulos}
          onChange={(e) => setFonteTitulos(e.target.value)}
          className="mt-2 w-full rounded-none border px-3 py-2 text-[13px] outline-none focus:border-[var(--color-signal)]"
          style={campo}
        >
          <option value="">a fonte da casa</option>
          {GOOGLE_FONTS.map((f) => (
            <option key={f.family} value={f.family}>
              {f.family}
            </option>
          ))}
        </select>
      </div>
      <div>
        <span className="ds-label">onde te encontram (opcional)</span>
        <input
          type="text"
          value={assinatura}
          onChange={(e) => setAssinatura(e.target.value)}
          placeholder="@suamarca ou suamarca.com.br"
          className="mt-2 w-full rounded-none border px-3 py-2 text-[13px] outline-none focus:border-[var(--color-signal)]"
          style={campo}
        />
        <p className="mt-1.5 text-[11.5px]" style={{ color: 'var(--color-fg-subtle)' }}>
          Entra literal, embaixo do botão. Anúncio que não diz para onde ir gasta a impressão.
        </p>
      </div>

      {/* ── Direção, e não fato ─────────────────────────────────────────── */}
      <div className={mostraEstilo ? '' : 'sm:col-span-2'}>
        <span className="ds-label">como a marca fala (opcional)</span>
        <input
          type="text"
          value={tom}
          onChange={(e) => setTom(e.target.value)}
          placeholder="direta, calorosa, sem gíria"
          className="mt-2 w-full rounded-none border px-3 py-2 text-[13px] outline-none focus:border-[var(--color-signal)]"
          style={campo}
        />
        <p className="mt-1.5 text-[11.5px]" style={{ color: 'var(--color-fg-subtle)' }}>
          Guia quem escreve. Não vira texto na peça: só aparece o que você digitou como headline e
          botão.
        </p>
      </div>
      {mostraEstilo && (
        <div>
          <span className="ds-label">como as imagens dela são (opcional)</span>
          <input
            type="text"
            value={estiloVisual}
            onChange={(e) => setEstiloVisual(e.target.value)}
            placeholder="luz natural, fundo claro, sem gente posando"
            className="mt-2 w-full rounded-none border px-3 py-2 text-[13px] outline-none focus:border-[var(--color-signal)]"
            style={campo}
          />
          <p className="mt-1.5 text-[11.5px]" style={{ color: 'var(--color-fg-subtle)' }}>
            Guia a imagem que eu criar. Com foto sua, ela vence e isto não se aplica.
          </p>
        </div>
      )}
    </>
  );
}
