import type { BuildingNode } from '../types';

/** "Junction B (C2)" - label plus id, since routes are reported by id. */
export function nodeTitle(node: BuildingNode): string {
  return `${node.label} (${node.id})`;
}
