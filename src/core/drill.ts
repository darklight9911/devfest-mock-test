import type { Hazards } from '../types';
import type { Graph } from './graph';

/**
 * "Escape drill" mini-game: the player walks the evacuee one corridor at a time and is scored
 * against the lowest-cost route the app computed. Pure logic, no DOM or 3D, so it is unit-tested.
 */
export interface Drill {
  start: string;
  /** Nodes visited by the player, starting with `start`. */
  path: string[];
  edgeIds: string[];
  cost: number;
  /** The app's lowest-cost route when the drill began (used for scoring and the reveal). */
  optimalPath: string[];
  optimalCost: number;
  escaped: boolean;
}

export type DrillError =
  'finished' | 'not-adjacent' | 'visited' | 'blocked' | 'closed' | 'corridor-blocked';

export type DrillStepResult = { ok: true; drill: Drill } | { ok: false; reason: DrillError };

export function startDrill(start: string, optimalPath: string[], optimalCost: number): Drill {
  return { start, path: [start], edgeIds: [], cost: 0, optimalPath, optimalCost, escaped: false };
}

/** Moves the evacuee to `to`, applying exactly the same hazard rules as the route finder. */
export function stepDrill(
  graph: Graph,
  hazards: Hazards,
  drill: Drill,
  to: string,
): DrillStepResult {
  if (drill.escaped) return { ok: false, reason: 'finished' };
  const current = drill.path[drill.path.length - 1] as string;
  const link = graph.adjacency.get(current)?.find((neighbor) => neighbor.to === to);
  if (!link) return { ok: false, reason: 'not-adjacent' };
  if (drill.path.includes(to)) return { ok: false, reason: 'visited' };
  if (hazards.blockedNodes.has(to)) return { ok: false, reason: 'blocked' };
  if (hazards.closedExits.has(to)) return { ok: false, reason: 'closed' };
  if (hazards.blockedEdges.has(link.edgeId)) return { ok: false, reason: 'corridor-blocked' };

  return {
    ok: true,
    drill: {
      ...drill,
      path: [...drill.path, to],
      edgeIds: [...drill.edgeIds, link.edgeId],
      cost: drill.cost + link.cost,
      escaped: graph.nodes.get(to)?.type === 'exit',
    },
  };
}

/** Takes back the last step (not allowed once the evacuee has escaped). */
export function undoDrill(graph: Graph, drill: Drill): Drill {
  if (drill.path.length <= 1 || drill.escaped) return drill;
  const lastEdge = drill.edgeIds[drill.edgeIds.length - 1] as string;
  return {
    ...drill,
    path: drill.path.slice(0, -1),
    edgeIds: drill.edgeIds.slice(0, -1),
    cost: drill.cost - (graph.edges.get(lastEdge)?.cost ?? 0),
  };
}

/** 3 stars for the optimal cost, 2 within 25% of it, 1 for any other escape, 0 while playing. */
export function drillStars(drill: Drill): 0 | 1 | 2 | 3 {
  if (!drill.escaped) return 0;
  if (drill.cost <= drill.optimalCost) return 3;
  if (drill.cost <= drill.optimalCost * 1.25) return 2;
  return 1;
}
