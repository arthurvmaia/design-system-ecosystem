/**
 * O que a instrumentação in-page lê de cada elemento candidato.
 *
 * Este tipo é o contrato entre o script que roda DENTRO da página (browser) e as
 * decisões que rodam FORA dela (Node, testáveis). Manter as decisões — é seguro
 * clicar? é interativo? — como funções puras sobre este descritor é o que torna
 * o motor testável sem abrir um navegador.
 */
export type Box = { x: number; y: number; w: number; h: number };

export type ElementDescriptor = {
  /** Caminho estável tipo seletor (`main>section:nth-child(2)>button`). */
  ref: string;
  tag: string;
  role: string | null;
  /** `type` de input/button. */
  type: string | null;
  href: string | null;
  /** Texto visível, aparado e truncado. */
  text: string;
  ariaLabel: string | null;
  classes: string[];
  id: string | null;
  tabindex: number | null;
  /** `cursor` computado — `pointer` é um forte sinal de clicável. */
  cursor: string | null;
  /** Registrou algum listener via addEventListener (capturado no document_start). */
  hasListeners: boolean;
  listenerTypes: string[];
  disabled: boolean;
  ariaExpanded: string | null;
  ariaHaspopup: string | null;
  ariaControls: string | null;
  /** Tem atributo `download`. */
  download: boolean;
  /** `target="_blank"`. */
  targetBlank: boolean;
  box: Box;
  inViewport: boolean;
  /** `data-*` relevantes (state, toggle, tab, index…). */
  dataAttrs: Record<string, string>;
};
