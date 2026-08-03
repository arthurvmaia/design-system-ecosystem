import { create } from 'zustand';

/**
 * Toasts: feedback curto de ação concluída ou falha.
 *
 * Store próprio de propósito — isto é infraestrutura de feedback, não estado de
 * negócio, e não deve criar acoplamento com ele.
 */

export type ToastKind = 'ok' | 'erro' | 'info';
export type Toast = { id: number; kind: ToastKind; texto: string };

type ToastState = {
  list: Toast[];
  push: (kind: ToastKind, texto: string) => void;
  dismiss: (id: number) => void;
};

let seq = 0;

export const useToasts = create<ToastState>((set) => ({
  list: [],
  push: (kind, texto) => {
    const id = ++seq;
    set((s) => ({ list: [...s.list, { id, kind, texto }] }));
    // Erros ficam mais tempo: são os que a pessoa precisa conseguir ler.
    const ttl = kind === 'erro' ? 6000 : 3600;
    setTimeout(() => {
      set((s) => ({ list: s.list.filter((t) => t.id !== id) }));
    }, ttl);
  },
  dismiss: (id) => set((s) => ({ list: s.list.filter((t) => t.id !== id) })),
}));

/** Atalhos para chamar de qualquer lugar (inclusive fora de componente). */
export const toast = {
  ok: (texto: string) => useToasts.getState().push('ok', texto),
  erro: (texto: string) => useToasts.getState().push('erro', texto),
  info: (texto: string) => useToasts.getState().push('info', texto),
};
