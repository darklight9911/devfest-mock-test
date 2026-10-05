import { $ } from '../dom';
import type { Ctx, Render } from './types';

export function mountHeader({ store }: Ctx): Render {
  const buttons = Array.from(
    document.querySelectorAll<HTMLButtonElement>('#lang-switch [data-lang]'),
  );
  const contrast = $<HTMLButtonElement>('#contrast-toggle');

  for (const button of buttons) {
    button.addEventListener('click', () =>
      store.setLang(button.dataset.lang === 'bn' ? 'bn' : 'en'),
    );
  }
  contrast.addEventListener('click', () => store.setHighContrast(!store.getState().highContrast));

  return (state) => {
    for (const button of buttons) {
      button.setAttribute('aria-pressed', String(button.dataset.lang === state.lang));
    }
    contrast.setAttribute('aria-pressed', String(state.highContrast));
  };
}
