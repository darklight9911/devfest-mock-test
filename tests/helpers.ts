import { readFileSync } from 'node:fs';
import { buildGraph } from '../src/core/graph';
import { findRoute } from '../src/core/routing';
import { parseBuildingJson } from '../src/core/validate';
import type { Building, BuildingEdge, BuildingNode, Hazards, NodeType } from '../src/types';

export function loadSample(): Building {
  const text = readFileSync(new URL('../public/samples/building.json', import.meta.url), 'utf8');
  const result = parseBuildingJson(text);
  if (!result.ok) throw new Error('sample building.json failed validation');
  return result.building;
}

export function hazards(
  blockedNodes: string[] = [],
  blockedEdges: string[] = [],
  closedExits: string[] = [],
): Hazards {
  return {
    blockedNodes: new Set(blockedNodes),
    blockedEdges: new Set(blockedEdges),
    closedExits: new Set(closedExits),
  };
}

/** Compact graph builder: nodes as "ID:type", edges as [from, to, cost]. */
export function makeBuilding(nodeSpecs: string[], edgeSpecs: [string, string, number][]): Building {
  const nodes: BuildingNode[] = nodeSpecs.map((spec, i) => {
    const [id, type] = spec.split(':') as [string, NodeType];
    return { id, label: id, type, x: i * 10, y: 0 };
  });
  const edges: BuildingEdge[] = edgeSpecs.map(([from, to, cost], i) => ({
    id: `e${i + 1}`,
    from,
    to,
    cost,
  }));
  return {
    building: 'Test',
    nodes,
    edges,
    initial_state: { blocked_nodes: [], blocked_edges: [], closed_exits: [] },
  };
}

export function route(building: Building, start: string | null, h: Hazards = hazards()) {
  return findRoute(buildGraph(building), h, start);
}
