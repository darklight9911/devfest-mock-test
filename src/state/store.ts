import { buildGraph, type Graph } from '../core/graph';
import { findRoute } from '../core/routing';
import type { ValidationIssue } from '../core/validate';
import type { Building, Hazards, Lang, RouteResult } from '../types';

export type ClickMode = 'start' | 'hazard';

/** What just happened; the UI uses it to animate only the element that changed. */
export type AppEvent =
  | { type: 'init' }
  | { type: 'load' }
  | { type: 'start'; id: string }
  | { type: 'toggle-node'; id: string }
  | { type: 'toggle-edge'; id: string }
  | { type: 'reset' }
  | { type: 'ui' };

export interface AppState {
  building: Building | null;
  graph: Graph | null;
  sourceName: string | null;
  /** Problems found in the most recently rejected file (null when the last import was fine). */
  importIssues: ValidationIssue[] | null;
  start: string | null;
  hazards: Hazards;
  lang: Lang;
  mode: ClickMode;
  highContrast: boolean;
  lastEvent: AppEvent;
}

export type StartOutcome = 'ok' | 'blocked' | 'not-selectable';

type Listener = (state: AppState, route: RouteResult, event: AppEvent) => void;

function emptyHazards(): Hazards {
  return { blockedNodes: new Set(), blockedEdges: new Set(), closedExits: new Set() };
}

/** Fresh sets copied from the file's initial_state (used on load and on reset). */
function hazardsFromBuilding(building: Building): Hazards {
  return {
    blockedNodes: new Set(building.initial_state.blocked_nodes),
    blockedEdges: new Set(building.initial_state.blocked_edges),
    closedExits: new Set(building.initial_state.closed_exits),
  };
}

function toggle(set: Set<string>, id: string): void {
  if (!set.delete(id)) set.add(id);
}

/**
 * Minimal observable store. Every action mutates state, recomputes the route and notifies
 * listeners once, which is what makes every change update the route immediately.
 */
export function createStore(initial: Partial<Pick<AppState, 'lang' | 'highContrast'>> = {}) {
  const state: AppState = {
    building: null,
    graph: null,
    sourceName: null,
    importIssues: null,
    start: null,
    hazards: emptyHazards(),
    lang: initial.lang ?? 'en',
    mode: 'start',
    highContrast: initial.highContrast ?? false,
    lastEvent: { type: 'init' },
  };
  const listeners = new Set<Listener>();

  function getRoute(): RouteResult {
    if (!state.graph) return { status: 'no-building' };
    return findRoute(state.graph, state.hazards, state.start);
  }

  function emit(event: AppEvent): void {
    state.lastEvent = event;
    const route = getRoute();
    for (const listener of listeners) listener(state, route, event);
  }

  return {
    getState: (): AppState => state,
    getRoute,

    /** Subscribes and immediately delivers the current state. */
    subscribe(listener: Listener): () => void {
      listeners.add(listener);
      listener(state, getRoute(), state.lastEvent);
      return () => listeners.delete(listener);
    },

    loadBuilding(building: Building, sourceName: string): void {
      state.building = building;
      state.graph = buildGraph(building);
      state.sourceName = sourceName;
      state.importIssues = null;
      state.start = null;
      state.hazards = hazardsFromBuilding(building);
      emit({ type: 'load' });
    },

    /** A rejected file leaves the previously loaded building untouched. */
    rejectImport(issues: ValidationIssue[], sourceName: string): void {
      state.importIssues = issues;
      if (!state.building) state.sourceName = sourceName;
      emit({ type: 'ui' });
    },

    selectStart(id: string): StartOutcome {
      const node = state.graph?.nodes.get(id);
      if (!node || node.type === 'exit') return 'not-selectable';
      if (state.hazards.blockedNodes.has(id)) return 'blocked';
      state.start = id;
      emit({ type: 'start', id });
      return 'ok';
    },

    /** Blocks/unblocks a room or junction, or closes/reopens an exit. */
    toggleNode(id: string): void {
      const node = state.graph?.nodes.get(id);
      if (!node) return;
      toggle(node.type === 'exit' ? state.hazards.closedExits : state.hazards.blockedNodes, id);
      emit({ type: 'toggle-node', id });
    },

    toggleEdge(id: string): void {
      if (!state.graph?.edges.has(id)) return;
      toggle(state.hazards.blockedEdges, id);
      emit({ type: 'toggle-edge', id });
    },

    /** Restores the file's original initial_state (not "everything open"). */
    resetHazards(): void {
      if (!state.building) return;
      state.hazards = hazardsFromBuilding(state.building);
      emit({ type: 'reset' });
    },

    setLang(lang: Lang): void {
      state.lang = lang;
      emit({ type: 'ui' });
    },

    setMode(mode: ClickMode): void {
      state.mode = mode;
      emit({ type: 'ui' });
    },

    setHighContrast(on: boolean): void {
      state.highContrast = on;
      emit({ type: 'ui' });
    },
  };
}

export type Store = ReturnType<typeof createStore>;
