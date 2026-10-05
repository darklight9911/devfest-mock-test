import { t } from '../../i18n';
import type { Building } from '../../types';
import { $, h } from '../dom';
import { nodeTitle } from '../format';
import type { AppState } from '../../state/store';
import type { Ctx, Render } from './types';

type Kind = 'node' | 'exit' | 'edge';

interface Item {
  kind: Kind;
  id: string;
  /** Accessible name used inside the button's aria-label. */
  title: string;
  row: HTMLLIElement;
  badge: HTMLElement;
  button: HTMLButtonElement;
}

interface Group {
  kind: Kind;
  count: HTMLElement;
  heading: HTMLElement;
}

const GROUP_HEADINGS = {
  node: 'hazards.locations',
  edge: 'hazards.corridors',
  exit: 'hazards.exits',
} as const;

export function mountHazardPanel({ store }: Ctx): Render {
  const container = $('#hazard-lists');
  let builtFor: Building | null = null;
  let items: Item[] = [];
  let groups: Group[] = [];

  function build(building: Building): void {
    items = [];
    groups = [];
    const sections: HTMLElement[] = [];

    const addGroup = (kind: Kind, rows: Item[]): void => {
      const heading = h('span', {});
      const count = h('span', { class: 'count' });
      const list = h('ul', { class: 'hz-list' }, ...rows.map((item) => item.row));
      groups.push({ kind, count, heading });
      sections.push(
        h('details', { class: 'group', open: true }, h('summary', {}, heading, count), list),
      );
    };

    const makeItem = (kind: Kind, id: string, title: string, sub: string, extra?: string): Item => {
      const badge = h('span', { class: 'state-badge' });
      const button = h('button', { type: 'button', class: 'btn btn-sm', 'aria-pressed': 'false' });
      button.addEventListener('click', () => {
        if (kind === 'edge') store.toggleEdge(id);
        else store.toggleNode(id);
      });
      const row = h(
        'li',
        { class: 'hz-item' },
        h(
          'div',
          { class: 'hz-name' },
          h('strong', {}, id),
          h('span', {}, sub),
          extra ? h('span', { class: 'cost-chip' }, extra) : null,
        ),
        badge,
        button,
      );
      const item: Item = { kind, id, title, row, badge, button };
      items.push(item);
      return item;
    };

    const locations = building.nodes
      .filter((n) => n.type !== 'exit')
      .map((n) => makeItem('node', n.id, nodeTitle(n), n.label));
    const exits = building.nodes
      .filter((n) => n.type === 'exit')
      .map((n) => makeItem('exit', n.id, nodeTitle(n), n.label));
    const nodeLabel = new Map(building.nodes.map((n) => [n.id, n.label]));
    const corridors = building.edges.map((e) =>
      makeItem(
        'edge',
        e.id,
        `${e.id}: ${e.from} – ${e.to}`,
        `${nodeLabel.get(e.from) ?? e.from} ↔ ${nodeLabel.get(e.to) ?? e.to}`,
        String(e.cost),
      ),
    );

    addGroup('node', locations);
    addGroup('edge', corridors);
    addGroup('exit', exits);
    container.replaceChildren(...sections);
  }

  function isActive(state: AppState, item: Item): boolean {
    const { hazards } = state;
    if (item.kind === 'node') return hazards.blockedNodes.has(item.id);
    if (item.kind === 'exit') return hazards.closedExits.has(item.id);
    return hazards.blockedEdges.has(item.id);
  }

  function isUnusable(state: AppState, item: Item): boolean {
    if (item.kind !== 'edge') return false;
    const edge = state.graph?.edges.get(item.id);
    if (!edge) return false;
    const { blockedNodes, closedExits } = state.hazards;
    return [edge.from, edge.to].some((id) => blockedNodes.has(id) || closedExits.has(id));
  }

  return (state) => {
    if (state.building !== builtFor) {
      builtFor = state.building;
      if (state.building) build(state.building);
      else {
        items = [];
        groups = [];
        container.replaceChildren();
      }
    }

    const { lang } = state;
    const activeCount = new Map<Kind, number>();
    for (const item of items) {
      const active = isActive(state, item);
      const unusable = !active && isUnusable(state, item);
      if (active) activeCount.set(item.kind, (activeCount.get(item.kind) ?? 0) + 1);

      const exit = item.kind === 'exit';
      const actionKey = exit
        ? active
          ? 'hazards.reopen'
          : 'hazards.close'
        : active
          ? 'hazards.unblock'
          : 'hazards.block';
      const ariaKey = exit
        ? active
          ? 'hazards.reopenAria'
          : 'hazards.closeAria'
        : active
          ? 'hazards.unblockAria'
          : 'hazards.blockAria';
      item.button.textContent = t(lang, actionKey);
      item.button.setAttribute('aria-label', t(lang, ariaKey, { name: item.title }));
      item.button.setAttribute('aria-pressed', String(active));
      item.row.classList.toggle('is-active', active);
      item.row.classList.toggle('is-unusable', unusable);
      item.badge.textContent = active
        ? t(lang, exit ? 'hazards.stateClosed' : 'hazards.stateBlocked')
        : unusable
          ? t(lang, 'hazards.stateUnusable')
          : t(lang, 'hazards.stateOpen');
    }
    for (const group of groups) {
      group.heading.textContent = t(lang, GROUP_HEADINGS[group.kind]);
      group.count.textContent = t(lang, 'hazards.active', {
        count: activeCount.get(group.kind) ?? 0,
      });
    }
  };
}
