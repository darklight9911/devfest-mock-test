import { t, type MessageKey } from '../i18n';
import type { Lang } from '../types';

/** Translates static markup: data-i18n -> text, data-i18n-aria -> aria-label. */
export function applyStaticI18n(lang: Lang, root: ParentNode = document): void {
  for (const el of root.querySelectorAll<HTMLElement>('[data-i18n]')) {
    el.textContent = t(lang, el.dataset.i18n as MessageKey);
  }
  for (const el of root.querySelectorAll<HTMLElement>('[data-i18n-aria]')) {
    el.setAttribute('aria-label', t(lang, el.dataset.i18nAria as MessageKey));
  }
}
