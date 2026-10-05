import type { Building, BuildingEdge, BuildingNode } from '../types';

export interface Neighbor {
  to: string;
  edgeId: string;
  cost: number;
}

/** Lookup structures built once per building. */
export interface Graph {
  nodes: Map<string, BuildingNode>;
  edges: Map<string, BuildingEdge>;
  adjacency: Map<string, Neighbor[]>;
  /** Maps an unordered node pair to the corridor id joining them. */
  edgeByPair: Map<string, string>;
}

/** Order-independent key for a pair of node ids (corridors are undirected). */
export function pairKey(a: string, b: string): string {
  return a < b ? `${a}\u0000${b}` : `${b}\u0000${a}`;
}

export function buildGraph(building: Building): Graph {
  const nodes = new Map<string, BuildingNode>();
  const adjacency = new Map<string, Neighbor[]>();
  for (const node of building.nodes) {
    nodes.set(node.id, node);
    adjacency.set(node.id, []);
  }

  const edges = new Map<string, BuildingEdge>();
  const edgeByPair = new Map<string, string>();
  for (const edge of building.edges) {
    edges.set(edge.id, edge);
    edgeByPair.set(pairKey(edge.from, edge.to), edge.id);
    adjacency.get(edge.from)?.push({ to: edge.to, edgeId: edge.id, cost: edge.cost });
    adjacency.get(edge.to)?.push({ to: edge.from, edgeId: edge.id, cost: edge.cost });
  }

  return { nodes, edges, adjacency, edgeByPair };
}
