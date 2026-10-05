/** Shared domain types. Field names mirror the building.json schema. */

export type NodeType = 'room' | 'junction' | 'exit';

export interface BuildingNode {
  id: string;
  label: string;
  type: NodeType;
  x: number;
  y: number;
}

export interface BuildingEdge {
  id: string;
  from: string;
  to: string;
  /** Positive integer. Route cost is the sum of these, never of distances. */
  cost: number;
}

export interface InitialState {
  blocked_nodes: string[];
  blocked_edges: string[];
  closed_exits: string[];
}

export interface Building {
  building: string;
  nodes: BuildingNode[];
  edges: BuildingEdge[];
  initial_state: InitialState;
}

/** The hazards the user can change at runtime. */
export interface Hazards {
  blockedNodes: Set<string>;
  blockedEdges: Set<string>;
  closedExits: Set<string>;
}

export type Lang = 'en' | 'bn';

export type RouteResult =
  | { status: 'no-building' }
  | { status: 'no-start' }
  | { status: 'start-blocked'; start: string }
  | { status: 'no-route'; start: string }
  | {
      status: 'ok';
      start: string;
      exitId: string;
      /** Node ids from start to exit, inclusive. */
      path: string[];
      /** Corridor ids in travel order (path.length - 1 entries). */
      edgeIds: string[];
      /** Cost of each corridor in travel order. */
      costs: number[];
      totalCost: number;
    };
