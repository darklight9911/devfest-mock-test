import type { Hazards, RouteResult } from '../types';
import { pairKey, type Graph } from './graph';

/**
 * Plain code-unit string comparison. Deliberately NOT localeCompare: the rules ask for
 * the lexicographically smallest id, and locale rules would change the answer
 * (case-sensitivity, digit ordering) depending on the user's browser language.
 */
function compareStrings(a: string, b: string): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

/** Compares two node-id sequences element by element, then by length. */
export function comparePaths(a: readonly string[], b: readonly string[]): number {
  const shared = Math.min(a.length, b.length);
  for (let i = 0; i < shared; i++) {
    const diff = compareStrings(a[i] as string, b[i] as string);
    if (diff !== 0) return diff;
  }
  return a.length - b.length;
}

interface Label {
  cost: number;
  path: string[];
}

/** Orders labels by cost, then by lexicographic node-id sequence. */
function compareLabels(a: Label, b: Label): number {
  return a.cost - b.cost || comparePaths(a.path, b.path);
}

/**
 * Finds the lowest-cost route from `start` to an open exit.
 *
 * Usable graph: blocked nodes (and so their corridors), blocked corridors and closed
 * exits are never entered, which also means a closed exit can never be an intermediate stop.
 *
 * Tie-breaking is built into Dijkstra by ordering labels as (cost, node-id sequence).
 * This stays correct because extending two paths to the same node by the same step keeps
 * their relative order, so the best label of every node can be built from the best label
 * of its predecessor. Among reachable open exits the winner is chosen by (cost, exit id).
 *
 * With at most 60 nodes a simple O(V^2) scan is plenty fast and easy to explain.
 */
export function findRoute(graph: Graph, hazards: Hazards, start: string | null): RouteResult {
  if (start === null) return { status: 'no-start' };

  const startNode = graph.nodes.get(start);
  if (!startNode || startNode.type === 'exit') return { status: 'no-start' };
  if (hazards.blockedNodes.has(start)) return { status: 'start-blocked', start };

  const best = new Map<string, Label>([[start, { cost: 0, path: [start] }]]);
  const settled = new Set<string>();

  for (;;) {
    let currentId: string | null = null;
    let current: Label | null = null;
    for (const [id, label] of best) {
      if (settled.has(id)) continue;
      if (current === null || compareLabels(label, current) < 0) {
        currentId = id;
        current = label;
      }
    }
    if (currentId === null || current === null) break;
    settled.add(currentId);

    for (const neighbor of graph.adjacency.get(currentId) ?? []) {
      if (settled.has(neighbor.to)) continue;
      if (hazards.blockedNodes.has(neighbor.to)) continue;
      if (hazards.closedExits.has(neighbor.to)) continue;
      if (hazards.blockedEdges.has(neighbor.edgeId)) continue;

      const candidate: Label = {
        cost: current.cost + neighbor.cost,
        path: [...current.path, neighbor.to],
      };
      const known = best.get(neighbor.to);
      if (!known || compareLabels(candidate, known) < 0) best.set(neighbor.to, candidate);
    }
  }

  let exitId: string | null = null;
  let exitLabel: Label | null = null;
  for (const [id, label] of best) {
    if (graph.nodes.get(id)?.type !== 'exit') continue;
    if (
      exitLabel === null ||
      label.cost < exitLabel.cost ||
      (label.cost === exitLabel.cost && compareStrings(id, exitId as string) < 0)
    ) {
      exitId = id;
      exitLabel = label;
    }
  }

  if (exitId === null || exitLabel === null) return { status: 'no-route', start };

  const edgeIds: string[] = [];
  const costs: number[] = [];
  for (let i = 0; i < exitLabel.path.length - 1; i++) {
    const edgeId = graph.edgeByPair.get(
      pairKey(exitLabel.path[i] as string, exitLabel.path[i + 1] as string),
    ) as string;
    edgeIds.push(edgeId);
    costs.push(graph.edges.get(edgeId)?.cost ?? 0);
  }

  return {
    status: 'ok',
    start,
    exitId,
    path: exitLabel.path,
    edgeIds,
    costs,
    totalCost: exitLabel.cost,
  };
}
