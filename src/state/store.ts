import { startDrill, stepDrill, undoDrill, type Drill, type DrillError } from '../core/drill';
import { buildGraph, type Graph } from '../core/graph';
import { findRoute } from '../core/routing';
import type { ValidationIssue } from '../core/validate';
import type { Building, Hazards, Lang, RouteResult } from '../types';

export type ClickMode = 'start' | 'hazard';
export type MapView = '2d' | '3d';

/** What just happened; the UI uses it to animate only the element that changed. */
export type AppEvent =
  | { type: 'init' }
  | { type: 'load' }
  | { type: 'start'; id: string }
  | { type: 'toggle-node'; id: string }
  | { type: 'toggle-edge'; id: string }
  | { type: 'reset' }
  | { type: 'drill'; step: 'start' | 'move' | 'undo' | 'end' }
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
  view: MapView;
  /** The escape-drill game in the 3D view; null when no drill is running. */
  drill: Drill | null;
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
    view: '2d',
    drill: null,
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
      state.drill = null;
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
      state.drill = null; // a new start ends any drill
      emit({ type: 'start', id });
      return 'ok';
    },

    /** Blocks/unblocks a room or junction, or closes/reopens an exit. */
    toggleNode(id: string): void {
      const node = state.graph?.nodes.get(id);
      if (!node) return;
      toggle(node.type === 'exit' ? state.hazards.closedExits : state.hazards.blockedNodes, id);
      state.drill = null; // changed hazards invalidate the drill's score
      emit({ type: 'toggle-node', id });
    },

    toggleEdge(id: string): void {
      if (!state.graph?.edges.has(id)) return;
      toggle(state.hazards.blockedEdges, id);
      state.drill = null;
      emit({ type: 'toggle-edge', id });
    },

    /** Restores the file's original initial_state (not "everything open"). */
    resetHazards(): void {
      if (!state.building) return;
      state.hazards = hazardsFromBuilding(state.building);
      state.drill = null;
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

    setView(view: MapView): void {
      state.view = view;
      if (view === '2d') state.drill = null; // the drill is played in the 3D view
      emit({ type: 'ui' });
    },

    setHighContrast(on: boolean): void {
      state.highContrast = on;
      emit({ type: 'ui' });
    },

    /** Starts an escape drill from the current start. Needs a reachable exit to score against. */
    startDrill(): boolean {
      const route = getRoute();
      if (route.status !== 'ok') return false;
      state.drill = startDrill(route.start, route.path, route.totalCost);
      emit({ type: 'drill', step: 'start' });
      return true;
    },

    /** Moves the drill evacuee; returns why a move was refused, or null when it succeeded. */
    drillStep(to: string): DrillError | null {
      if (!state.drill || !state.graph) return null;
      const result = stepDrill(state.graph, state.hazards, state.drill, to);
      if (!result.ok) return result.reason;
      state.drill = result.drill;
      emit({ type: 'drill', step: 'move' });
      return null;
    },

    drillUndo(): void {
      if (!state.drill || !state.graph) return;
      state.drill = undoDrill(state.graph, state.drill);
      emit({ type: 'drill', step: 'undo' });
    },

    endDrill(): void {
      if (!state.drill) return;
      state.drill = null;
      emit({ type: 'drill', step: 'end' });
    },
  };
}

export type Store = ReturnType<typeof createStore>;
