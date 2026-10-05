import { $, h } from './dom';

export type ToastKind = 'info' | 'warn' | 'error';
export type ToastFn = (message: string, kind?: ToastKind) => void;

const VISIBLE_MS = 3200;

/** Short, non-blocking message. The region is aria-live so screen readers announce it. */
export function createToaster(): ToastFn {
  const region = $('#toast-region');
  return (message, kind = 'info') => {
    const toast = h('div', { class: `toast toast-${kind}` }, message);
    region.replaceChildren(toast);
    window.setTimeout(() => toast.remove(), VISIBLE_MS);
  };
}
