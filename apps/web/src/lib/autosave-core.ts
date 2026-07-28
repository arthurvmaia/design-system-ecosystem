/**
 * Núcleo PURO do autosave do wizard — a máquina de estados e as decisões de
 * quando salvar, sem React e sem rede, para o teste cobrir sem navegador.
 *
 * Regras de produto:
 * - Sem request por tecla: alteração marca `pendente` e o salvamento só
 *   dispara depois da janela de silêncio (debounce) OU na troca de etapa.
 * - Falha não perde trabalho: volta para `pendente` (o conteúdo continua
 *   sujo) e a próxima janela tenta de novo.
 * - `salvo` só depois de confirmação; alteração durante o salvamento deixa o
 *   resultado `pendente` de novo (o snapshot salvo já nasceu velho).
 */

export type EstadoAutosave = 'ocioso' | 'pendente' | 'salvando' | 'salvo' | 'falha';

export type EventoAutosave =
  | 'alterou'
  | 'comecou-salvar'
  | 'salvou'
  | 'falhou'
  | 'alterou-durante-salvar';

export const ROTULO_AUTOSAVE: Record<EstadoAutosave, string> = {
  ocioso: '',
  pendente: 'Alterações pendentes',
  salvando: 'Salvando…',
  salvo: 'Salvo',
  falha: 'Não deu para salvar. Vamos tentar de novo',
};

export const reduzirAutosave = (estado: EstadoAutosave, evento: EventoAutosave): EstadoAutosave => {
  switch (evento) {
    case 'alterou':
      return estado === 'salvando' ? 'salvando' : 'pendente';
    case 'comecou-salvar':
      return 'salvando';
    case 'salvou':
      return 'salvo';
    case 'falhou':
      // Falha NÃO descarta: o estado volta a pendente para a próxima janela.
      return 'pendente';
    case 'alterou-durante-salvar':
      // O snapshot em voo já nasceu velho: ao terminar, continua pendente.
      return 'pendente';
  }
};

export const DEBOUNCE_AUTOSAVE_MS = 1200;

/**
 * Deve disparar o salvamento agora?
 * - Só com alteração pendente e sem salvamento em voo.
 * - Só depois da janela de silêncio (ou imediatamente na troca de etapa).
 * - Nunca antes de o rascunho existir: o rascunho nasce no primeiro
 *   "Próximo" (decisão de produto — digitar a primeira letra do nome não
 *   pode criar um projeto).
 */
export const deveSalvar = (opts: {
  estado: EstadoAutosave;
  temRascunho: boolean;
  msDesdeUltimaAlteracao: number;
  trocouDeEtapa?: boolean;
  debounceMs?: number;
}): boolean => {
  if (!opts.temRascunho) return false;
  if (opts.estado !== 'pendente') return false;
  if (opts.trocouDeEtapa === true) return true;
  return opts.msDesdeUltimaAlteracao >= (opts.debounceMs ?? DEBOUNCE_AUTOSAVE_MS);
};
