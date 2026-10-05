import { t } from '../../i18n';
import { $, h } from '../dom';
import { nodeTitle } from '../format';
import type { Ctx, Render } from './types';

export function mountRoutePanel({ store }: Ctx): Render {
  const container = $('#route-result');
  let lastSignature = '';

  return (state, route) => {
    const { lang, graph } = state;
    // While an escape drill is being played the answer is hidden (one click reveals it).
    const drillHidesRoute = state.drill !== null && !state.drill.escaped;
    // Re-render only when the visible result changes, so the entrance animation plays once per change.
    const signature = `${lang}|${drillHidesRoute}|${JSON.stringify(route)}`;
    if (signature === lastSignature) return;
    lastSignature = signature;

    if (drillHidesRoute) {
      container.replaceChildren(
        h(
          'div',
          { class: 'status status-info', 'data-testid': 'route-status' },
          h('p', {}, t(lang, 'route.drillHidden')),
          h(
            'button',
            { type: 'button', class: 'btn btn-sm', onclick: () => store.endDrill() },
            t(lang, 'route.reveal'),
          ),
        ),
      );
      return;
    }

    const nameOf = (id: string) => {
      const node = graph?.nodes.get(id);
      return node ? nodeTitle(node) : id;
    };

    switch (route.status) {
      case 'no-building':
        container.replaceChildren(h('p', { class: 'muted' }, t(lang, 'route.noBuilding')));
        break;
      case 'no-start':
        container.replaceChildren(h('p', { class: 'muted' }, t(lang, 'route.pickStart')));
        break;
      case 'start-blocked':
        container.replaceChildren(
          h(
            'div',
            { class: 'status status-warn', 'data-testid': 'route-status' },
            h('strong', {}, t(lang, 'route.startBlocked')),
            h('p', {}, t(lang, 'route.startBlockedHelp', { name: nameOf(route.start) })),
          ),
        );
        break;
      case 'no-route':
        container.replaceChildren(
          h(
            'div',
            { class: 'status status-error', 'data-testid': 'route-status' },
            h('strong', {}, t(lang, 'route.noRoute')),
            h('p', {}, t(lang, 'route.noRouteHelp')),
          ),
        );
        break;
      case 'ok': {
        const chips = route.path.map((id, index) =>
          h(
            'li',
            { class: index === route.path.length - 1 ? 'is-exit' : '' },
            h('span', { class: 'chip' }, id),
            h('small', {}, graph?.nodes.get(id)?.label ?? ''),
          ),
        );
        container.replaceChildren(
          h(
            'div',
            { class: 'status status-ok', 'data-testid': 'route-status' },
            h('strong', {}, t(lang, 'route.found')),
          ),
          h(
            'dl',
            { class: 'facts' },
            h(
              'div',
              {},
              h('dt', {}, t(lang, 'route.exit')),
              h('dd', { 'data-testid': 'route-exit' }, nameOf(route.exitId)),
            ),
            h(
              'div',
              {},
              h('dt', {}, t(lang, 'route.cost')),
              h('dd', { class: 'cost', 'data-testid': 'route-cost' }, route.totalCost),
            ),
          ),
          h('p', { class: 'field-label' }, t(lang, 'route.sequence')),
          h(
            'ol',
            {
              class: 'path',
              'data-testid': 'route-sequence',
              'data-route': route.path.join(' - '),
            },
            ...chips,
          ),
          h(
            'p',
            { class: 'muted', 'data-testid': 'route-breakdown' },
            t(lang, 'route.breakdown', { sum: `${route.costs.join(' + ')} = ${route.totalCost}` }),
          ),
        );
        break;
      }
    }
  };
}
