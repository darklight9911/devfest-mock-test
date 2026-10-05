import { t, type MessageKey } from '../../i18n';
import { $, h, svg } from '../dom';
import { createBadges, createShape } from '../shapes';
import type { NodeType } from '../../types';
import type { Ctx, Render } from './types';

const ICON_R = 9;

function nodeIcon(type: NodeType, stateClass = ''): SVGElement {
  const node = svg(
    'g',
    { class: `node type-${type} ${stateClass}` },
    svg('circle', { class: 'ring', r: ICON_R + 4 }),
    createShape(type, ICON_R),
    ...createBadges(ICON_R),
  );
  return svg(
    'svg',
    {
      class: 'legend-icon map-svg',
      viewBox: '-16 -16 32 32',
      'aria-hidden': 'true',
      style: '--s:0.7',
    },
    node,
  );
}

function edgeIcon(stateClass: string): SVGElement {
  return svg(
    'svg',
    {
      class: 'legend-icon map-svg',
      viewBox: '-16 -8 32 16',
      'aria-hidden': 'true',
      style: '--s:0.7',
    },
    svg(
      'g',
      { class: `edge ${stateClass}` },
      svg('line', { class: 'edge-line', x1: -13, y1: 0, x2: 13, y2: 0 }),
    ),
  );
}

function routeIcon(): SVGElement {
  return svg(
    'svg',
    {
      class: 'legend-icon map-svg',
      viewBox: '-16 -8 32 16',
      'aria-hidden': 'true',
      style: '--s:0.7',
    },
    svg('line', { class: 'route-path', x1: -13, y1: 0, x2: 13, y2: 0 }),
  );
}

const ITEMS: { icon: () => SVGElement; key: MessageKey }[] = [
  { icon: () => nodeIcon('room'), key: 'legend.room' },
  { icon: () => nodeIcon('junction'), key: 'legend.junction' },
  { icon: () => nodeIcon('exit'), key: 'legend.exit' },
  { icon: () => nodeIcon('room', 'is-start'), key: 'legend.start' },
  { icon: () => nodeIcon('junction', 'is-blocked'), key: 'legend.blockedNode' },
  { icon: () => nodeIcon('exit', 'is-closed'), key: 'legend.closedExit' },
  { icon: () => edgeIcon('is-blocked'), key: 'legend.blockedEdge' },
  { icon: () => edgeIcon('is-inactive'), key: 'legend.unusableEdge' },
  { icon: routeIcon, key: 'legend.route' },
];

export function mountLegend(_ctx: Ctx): Render {
  const list = $('#legend-list');
  const labels = ITEMS.map(({ icon, key }) => {
    const label = h('span', {}, '');
    list.append(h('li', {}, icon(), label));
    return { label, key };
  });
  const note = h('li', { class: 'legend-note' }, '');
  list.append(note);

  return (state) => {
    for (const { label, key } of labels) label.textContent = t(state.lang, key);
    note.textContent = t(state.lang, 'legend.cost');
  };
}
