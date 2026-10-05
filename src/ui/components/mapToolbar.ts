import { t } from '../../i18n';
import { $ } from '../dom';
import type { Ctx, Render } from './types';

export function mountMapToolbar({ store, toast }: Ctx): Render {
  const buttons = Array.from(
    document.querySelectorAll<HTMLButtonElement>('#mode-switch [data-mode]'),
  );
  const hint = $('#mode-hint');
  const reset = $<HTMLButtonElement>('#reset-hazards');

  for (const button of buttons) {
    button.addEventListener('click', () =>
      store.setMode(button.dataset.mode === 'hazard' ? 'hazard' : 'start'),
    );
  }
  reset.addEventListener('click', () => {
    store.resetHazards();
    toast(t(store.getState().lang, 'hazards.resetDone'));
  });

  return (state) => {
    for (const button of buttons) {
      button.setAttribute('aria-checked', String(button.dataset.mode === state.mode));
    }
    hint.textContent = t(state.lang, state.mode === 'start' ? 'mode.hintStart' : 'mode.hintHazard');
    for (const button of [reset, ...buttons]) button.disabled = state.building === null;
  };
}
