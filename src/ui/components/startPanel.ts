import { t } from '../../i18n';
import { $, h } from '../dom';
import { nodeTitle } from '../format';
import type { Ctx, Render } from './types';

export function mountStartPanel({ store, toast }: Ctx): Render {
  const select = $<HTMLSelectElement>('#start-select');

  select.addEventListener('change', () => {
    if (select.value === '') return;
    const outcome = store.selectStart(select.value);
    const { lang, start } = store.getState();
    if (outcome === 'blocked') toast(t(lang, 'start.cannotBlocked'), 'warn');
    if (outcome === 'not-selectable') toast(t(lang, 'start.cannotExit'), 'warn');
    select.value = start ?? '';
  });

  return (state) => {
    const { building, lang, hazards, start } = state;
    select.disabled = building === null;
    const options = [h('option', { value: '' }, t(lang, 'start.placeholder'))];
    for (const node of building?.nodes ?? []) {
      if (node.type === 'exit') continue;
      const blocked = hazards.blockedNodes.has(node.id);
      const title = nodeTitle(node);
      options.push(
        h(
          'option',
          { value: node.id, disabled: blocked },
          blocked ? t(lang, 'start.blockedOption', { name: title }) : title,
        ),
      );
    }
    select.replaceChildren(...options);
    select.value = start ?? '';
  };
}
