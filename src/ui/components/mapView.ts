import { t } from '../../i18n';
import type { AppEvent, AppState } from '../../state/store';
import type { Building, RouteResult } from '../../types';
import { $, h, prefersReducedMotion, svg } from '../dom';
import { nodeTitle } from '../format';
import { activateEdge, activateNode } from '../actions';
import { createBadges, createShape } from '../shapes';
import type { Ctx, Render } from './types';

/** Pixel sizes of the drawing. They are converted to SVG units so text stays readable at any width. */
const PX = {
  radius: 18,
  padX: 52,
  padXCompact: 40,
  padTop: 40,
  padBottom: 64,
  pillHeight: 20,
  maxGraphHeight: 720,
  /** Minimum on-screen corridor length (px) for horizontal / vertical corridors. */
  minEdgeH: 72,
  minEdgeV: 104,
  /** The map may be drawn at most this many times larger than "fit to width". */
  maxZoom: 2.2,
};
const POP_MS = 260;
const ROUTE_DRAW_MS = 420;

interface NodeEls {
  group: SVGGElement;
  body: SVGGElement;
  ring: SVGElement;
}

interface EdgeEls {
  /** The corridor line (below the route). */
  group: SVGGElement;
  /** The cost label (above the route, so costs stay readable on the highlighted path). */
  label: SVGGElement;
  pill: SVGGElement;
}

/** Hazard state as a short string, used to detect which elements changed since the last render. */
type Snapshot = Map<string, string>;

export function mountMapView(ctx: Ctx): Render {
  const { store } = ctx;
  const frame = $('#map-frame');
  const title = $('#map-building-name');

  let svgEl: SVGSVGElement | null = null;
  let routeLayer: SVGGElement | null = null;
  let nodeEls = new Map<string, NodeEls>();
  let edgeEls = new Map<string, EdgeEls>();
  let builtFor: Building | null = null;
  let builtWidth = 0;
  let routeKey = '';
  let prevNodes: Snapshot = new Map();
  let prevEdges: Snapshot = new Map();
  let prevStart: string | null = null;
  let latest: { state: AppState; route: RouteResult } | null = null;

  // ---- Drawing ---------------------------------------------------------------

  function build(building: Building, width: number): void {
    const { nodes, edges } = building;
    const minX = Math.min(...nodes.map((n) => n.x));
    const maxX = Math.max(...nodes.map((n) => n.x));
    const minY = Math.min(...nodes.map((n) => n.y));
    const maxY = Math.max(...nodes.map((n) => n.y));
    const graphW = Math.max(maxX - minX, 1);
    const graphH = Math.max(maxY - minY, 1);
    const byId = new Map(nodes.map((n) => [n.id, n]));

    // s = SVG units per CSS pixel. The graph is stretched to fit the frame width (but never
    // taller than maxGraphHeight), so a 12px label is 12px on screen whatever the dataset's units.
    const padX = width < 480 ? PX.padXCompact : PX.padX;
    const innerW = Math.max(width - 2 * padX, 120);
    const sFit = Math.max(graphW / innerW, graphH / PX.maxGraphHeight);

    // Keep corridors long enough on screen for the cost label and node labels to stay clear of
    // each other (vertical corridors need more room than horizontal ones). If that does not fit
    // the frame, the map scrolls sideways inside its frame instead of cramming everything.
    let sRoomy = Infinity;
    for (const edge of edges) {
      const a = byId.get(edge.from);
      const b = byId.get(edge.to);
      if (!a || !b) continue;
      const length = Math.hypot(a.x - b.x, a.y - b.y);
      if (length === 0) continue;
      const verticalShare = Math.abs(a.y - b.y) / length;
      sRoomy = Math.min(
        sRoomy,
        length / (PX.minEdgeH + (PX.minEdgeV - PX.minEdgeH) * verticalShare),
      );
    }
    const s = Math.max(Math.min(sFit, sRoomy), sFit / PX.maxZoom);

    const pxWidth = Math.max(width, graphW / s + 2 * padX);
    const vbW = pxWidth * s;
    const vbH = graphH + (PX.padTop + PX.padBottom) * s;
    const vbX = minX - (vbW - graphW) / 2;
    const vbY = minY - PX.padTop * s;

    const r = PX.radius * s;

    nodeEls = new Map();
    edgeEls = new Map();
    prevNodes = new Map();
    prevEdges = new Map();
    prevStart = null;
    routeKey = '';

    const edgeLayer = svg('g', { class: 'layer-edges' });
    const costLayer = svg('g', { class: 'layer-costs' });
    const nodeLayer = svg('g', { class: 'layer-nodes' });
    routeLayer = svg('g', { class: 'layer-route', 'pointer-events': 'none' });

    for (const edge of edges) {
      const a = byId.get(edge.from);
      const b = byId.get(edge.to);
      if (!a || !b) continue;
      const pillW = Math.max(24, String(edge.cost).length * 8 + 16) * s;
      const pillH = PX.pillHeight * s;
      const line = { x1: a.x, y1: a.y, x2: b.x, y2: b.y };
      const pill = svg(
        'g',
        { class: 'edge-cost-body' },
        svg('rect', {
          class: 'edge-pill',
          x: -pillW / 2,
          y: -pillH / 2,
          width: pillW,
          height: pillH,
          rx: pillH / 2,
        }),
        svg('text', { class: 'edge-cost-text' }, edge.cost),
      );
      const k = 4.5 * s;
      const group = svg(
        'g',
        { class: 'edge', 'data-edge': edge.id },
        svg('title', {}, `${edge.id}: ${edge.from} – ${edge.to} (${edge.cost})`),
        svg('line', { class: 'edge-hit', ...line }),
        svg('line', { class: 'edge-line', ...line }),
      );
      const label = svg(
        'g',
        {
          class: 'edge-label',
          'data-edge': edge.id,
          transform: `translate(${(a.x + b.x) / 2} ${(a.y + b.y) / 2})`,
        },
        pill,
        svg('path', {
          class: 'edge-x',
          d: `M${-k} ${-k}L${k} ${k}M${k} ${-k}L${-k} ${k}`,
          transform: `translate(0 ${-(pillH / 2 + 8 * s)})`,
        }),
      );
      edgeLayer.append(group);
      costLayer.append(label);
      edgeEls.set(edge.id, { group, label, pill });
    }

    for (const node of nodes) {
      const idPx =
        node.id.length <= 2 ? 13 : node.id.length === 3 ? 11 : node.id.length === 4 ? 9 : 7.5;
      const ring = svg('circle', { class: 'ring', r: r + 7 * s });
      const body = svg(
        'g',
        { class: 'node-body' },
        createShape(node.type, r),
        svg('text', { class: 'node-id', style: `font-size:calc(var(--s) * ${idPx}px)` }, node.id),
        ...createBadges(r),
      );
      const group = svg(
        'g',
        {
          class: `node type-${node.type}`,
          'data-node': node.id,
          transform: `translate(${node.x} ${node.y})`,
          tabindex: '0',
          role: 'button',
        },
        ring,
        body,
        svg('text', { class: 'node-label', y: r + 17 * s }, node.label),
      );
      nodeLayer.append(group);
      nodeEls.set(node.id, { group, body, ring });
    }

    svgEl = svg(
      'svg',
      {
        class: 'map-svg',
        viewBox: `${vbX} ${vbY} ${vbW} ${vbH}`,
        style: `--s:${s};${pxWidth > width + 1 ? `width:${pxWidth}px;max-width:none` : ''}`,
        role: 'group',
        'aria-label': t(store.getState().lang, 'map.aria', { name: building.building }),
      },
      edgeLayer,
      routeLayer,
      costLayer,
      nodeLayer,
    );
    svgEl.addEventListener('click', onClick);
    svgEl.addEventListener('keydown', onKeydown);
    frame.replaceChildren(svgEl);
    builtFor = building;
    builtWidth = width;
  }

  // ---- Interaction -----------------------------------------------------------

  function onClick(event: Event): void {
    const target = event.target as Element;
    const nodeId = target.closest('[data-node]')?.getAttribute('data-node');
    if (nodeId) return activateNode(ctx, nodeId);
    const edgeId = target.closest('[data-edge]')?.getAttribute('data-edge');
    if (edgeId) activateEdge(ctx, edgeId);
  }

  function onKeydown(event: KeyboardEvent): void {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    const nodeId = (event.target as Element).closest('[data-node]')?.getAttribute('data-node');
    if (!nodeId) return;
    event.preventDefault();
    activateNode(ctx, nodeId);
  }

  // ---- Updating --------------------------------------------------------------

  function pop(el: Element, scale = 1.18): void {
    if (prefersReducedMotion()) return;
    el.animate(
      [
        { transform: 'scale(1)' },
        { transform: `scale(${scale})`, offset: 0.4 },
        { transform: 'scale(1)' },
      ],
      { duration: POP_MS, easing: 'ease-out' },
    );
  }

  function drawRoute(state: AppState, route: RouteResult, animate: boolean): void {
    if (!routeLayer) return;
    if (route.status !== 'ok' || !state.graph) {
      routeLayer.replaceChildren();
      routeKey = '';
      return;
    }
    const key = route.path.join('\u0000');
    if (key === routeKey) return;
    routeKey = key;

    const points = route.path
      .map((id) => state.graph?.nodes.get(id))
      .filter((n): n is NonNullable<typeof n> => n !== undefined)
      .map((n, i) => `${i === 0 ? 'M' : 'L'}${n.x} ${n.y}`)
      .join(' ');
    const path = svg('path', { class: 'route-path', d: points, pathLength: 1 });
    routeLayer.replaceChildren(path);
    if (animate && !prefersReducedMotion()) {
      path.animate([{ strokeDashoffset: 1 }, { strokeDashoffset: 0 }], {
        duration: ROUTE_DRAW_MS,
        easing: 'ease-out',
      });
    }
  }

  function update(state: AppState, route: RouteResult, event: AppEvent): void {
    const { hazards, graph, lang } = state;
    if (!graph) return;
    const animate = event.type !== 'ui' && event.type !== 'load' && event.type !== 'init';
    const onRoute = new Set(route.status === 'ok' ? route.path : []);
    const routeEdges = new Set(route.status === 'ok' ? route.edgeIds : []);
    const destination = route.status === 'ok' ? route.exitId : null;

    const nextNodes: Snapshot = new Map();
    for (const [id, els] of nodeEls) {
      const node = graph.nodes.get(id);
      if (!node) continue;
      const blocked = hazards.blockedNodes.has(id);
      const closed = hazards.closedExits.has(id);
      const stateKey = blocked ? 'blocked' : closed ? 'closed' : 'open';
      nextNodes.set(id, stateKey);

      const cls = els.group.classList;
      cls.toggle('is-blocked', blocked);
      cls.toggle('is-closed', closed);
      cls.toggle('is-start', state.start === id);
      cls.toggle('is-destination', destination === id);
      cls.toggle('on-route', onRoute.has(id));

      const stateText = blocked
        ? t(lang, 'hazards.stateBlocked')
        : closed
          ? t(lang, 'hazards.stateClosed')
          : t(lang, 'hazards.stateOpen');
      els.group.setAttribute(
        'aria-label',
        `${nodeTitle(node)}, ${t(lang, `type.${node.type}`)}, ${stateText}`,
      );

      if (animate && prevNodes.has(id) && prevNodes.get(id) !== stateKey) pop(els.body);
    }
    if (animate && state.start && state.start !== prevStart) {
      const els = nodeEls.get(state.start);
      if (els) {
        pop(els.body, 1.22);
        if (!prefersReducedMotion()) {
          els.ring.animate(
            [
              { opacity: 0, transform: 'scale(0.6)' },
              { opacity: 1, transform: 'scale(1)' },
            ],
            {
              duration: POP_MS + 80,
              easing: 'ease-out',
            },
          );
        }
      }
    }
    prevNodes = nextNodes;
    prevStart = state.start;

    const nextEdges: Snapshot = new Map();
    for (const [id, els] of edgeEls) {
      const edge = graph.edges.get(id);
      if (!edge) continue;
      const blocked = hazards.blockedEdges.has(id);
      const unusable =
        !blocked &&
        [edge.from, edge.to].some(
          (end) => hazards.blockedNodes.has(end) || hazards.closedExits.has(end),
        );
      nextEdges.set(id, blocked ? 'blocked' : 'open');
      for (const el of [els.group, els.label]) {
        el.classList.toggle('is-blocked', blocked);
        el.classList.toggle('is-inactive', unusable);
        el.classList.toggle('on-route', routeEdges.has(id));
      }
      if (animate && prevEdges.has(id) && prevEdges.get(id) !== nextEdges.get(id))
        pop(els.pill, 1.25);
    }
    prevEdges = nextEdges;

    drawRoute(state, route, animate);
    if (svgEl) {
      svgEl.setAttribute(
        'aria-label',
        t(lang, 'map.aria', { name: state.building?.building ?? '' }),
      );
    }
  }

  // ---- Render entry point ----------------------------------------------------

  const render: Render = (state, route, event) => {
    latest = { state, route };
    frame.dataset.mode = state.mode;

    if (!state.building) {
      frame.replaceChildren(h('p', { class: 'map-empty' }, t(state.lang, 'map.empty')));
      title.textContent = '';
      svgEl = null;
      builtFor = null;
      return;
    }
    title.textContent = state.building.building;

    const width = frame.clientWidth || 640;
    if (state.building !== builtFor || Math.abs(width - builtWidth) > 1 || !svgEl) {
      build(state.building, width);
    }
    update(state, route, event);
  };

  // Redraw at the new size when the container width changes (rotation, window resize).
  new ResizeObserver(() => {
    if (!latest || !latest.state.building || !builtFor) return;
    if (Math.abs(frame.clientWidth - builtWidth) > 1) {
      render(latest.state, latest.route, { type: 'ui' });
    }
  }).observe(frame);

  return render;
}
