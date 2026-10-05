import type { Building, BuildingEdge, BuildingNode, InitialState, NodeType } from '../types';
import { pairKey } from './graph';

export const LIMITS = { minNodes: 2, maxNodes: 60, minEdges: 1, maxEdges: 150 } as const;

/** Files bigger than this are rejected before parsing (a valid file is a few KB). */
export const MAX_FILE_BYTES = 1_000_000;

/**
 * Machine-readable problems. The UI turns each code into a sentence in the active language
 * (see i18n), so validation itself stays language-free and easy to test.
 */
export type IssueCode =
  | 'file_too_large'
  | 'invalid_json'
  | 'not_object'
  | 'missing_field'
  | 'bad_field_type'
  | 'empty_building'
  | 'node_count'
  | 'edge_count'
  | 'node_not_object'
  | 'node_bad_id'
  | 'node_dup_id'
  | 'node_bad_label'
  | 'node_bad_type'
  | 'node_bad_coords'
  | 'edge_not_object'
  | 'edge_bad_id'
  | 'edge_dup_id'
  | 'edge_unknown_node'
  | 'edge_self_loop'
  | 'edge_dup_pair'
  | 'edge_bad_cost'
  | 'no_open_location'
  | 'no_exit'
  | 'state_bad_list'
  | 'state_unknown_id'
  | 'state_wrong_category';

export interface ValidationIssue {
  code: IssueCode;
  params?: Record<string, string | number>;
}

export type ValidationResult =
  { ok: true; building: Building } | { ok: false; issues: ValidationIssue[] };

const NODE_TYPES: readonly NodeType[] = ['room', 'junction', 'exit'];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/** Parses raw file text and validates it. */
export function parseBuildingJson(text: string): ValidationResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, issues: [{ code: 'invalid_json' }] };
  }
  return validateBuilding(raw);
}

/** Validates the parsed JSON and returns every problem found, not just the first. */
export function validateBuilding(raw: unknown): ValidationResult {
  if (!isRecord(raw)) return { ok: false, issues: [{ code: 'not_object' }] };

  const issues: ValidationIssue[] = [];
  const report = (code: IssueCode, params?: ValidationIssue['params']) =>
    issues.push(params ? { code, params } : { code });

  // --- Top-level fields -----------------------------------------------------
  const name = raw.building;
  if (!('building' in raw)) report('missing_field', { field: 'building' });
  else if (typeof name !== 'string')
    report('bad_field_type', { field: 'building', expected: 'string' });
  else if (name.trim().length === 0) report('empty_building');

  const rawNodes = raw.nodes;
  const rawEdges = raw.edges;
  const rawState = raw.initial_state;
  if (!('nodes' in raw)) report('missing_field', { field: 'nodes' });
  else if (!Array.isArray(rawNodes))
    report('bad_field_type', { field: 'nodes', expected: 'array' });
  if (!('edges' in raw)) report('missing_field', { field: 'edges' });
  else if (!Array.isArray(rawEdges))
    report('bad_field_type', { field: 'edges', expected: 'array' });
  if (!('initial_state' in raw)) report('missing_field', { field: 'initial_state' });
  else if (!isRecord(rawState)) {
    report('bad_field_type', { field: 'initial_state', expected: 'object' });
  }

  // --- Nodes ----------------------------------------------------------------
  const nodes: BuildingNode[] = [];
  const nodeIds = new Set<string>();
  if (Array.isArray(rawNodes)) {
    if (rawNodes.length < LIMITS.minNodes || rawNodes.length > LIMITS.maxNodes) {
      report('node_count', { count: rawNodes.length, min: LIMITS.minNodes, max: LIMITS.maxNodes });
    }
    rawNodes.forEach((item: unknown, index: number) => {
      if (!isRecord(item)) return report('node_not_object', { index: index + 1 });
      if (!isNonEmptyString(item.id)) return report('node_bad_id', { index: index + 1 });
      const id = item.id;
      let valid = true;
      if (nodeIds.has(id)) {
        report('node_dup_id', { id });
        valid = false;
      }
      if (!isNonEmptyString(item.label)) {
        report('node_bad_label', { id });
        valid = false;
      }
      if (!NODE_TYPES.includes(item.type as NodeType)) {
        report('node_bad_type', { id, type: String(item.type) });
        valid = false;
      }
      if (!isFiniteNumber(item.x) || !isFiniteNumber(item.y)) {
        report('node_bad_coords', { id });
        valid = false;
      }
      nodeIds.add(id);
      if (valid) {
        nodes.push({
          id,
          label: item.label as string,
          type: item.type as NodeType,
          x: item.x as number,
          y: item.y as number,
        });
      }
    });
    if (nodes.length > 0 || rawNodes.length > 0) {
      if (!nodes.some((n) => n.type === 'room' || n.type === 'junction')) {
        report('no_open_location');
      }
      if (!nodes.some((n) => n.type === 'exit')) report('no_exit');
    }
  }

  // --- Edges ----------------------------------------------------------------
  const edges: BuildingEdge[] = [];
  const edgeIds = new Set<string>();
  const pairOwner = new Map<string, string>();
  if (Array.isArray(rawEdges)) {
    if (rawEdges.length < LIMITS.minEdges || rawEdges.length > LIMITS.maxEdges) {
      report('edge_count', { count: rawEdges.length, min: LIMITS.minEdges, max: LIMITS.maxEdges });
    }
    rawEdges.forEach((item: unknown, index: number) => {
      if (!isRecord(item)) return report('edge_not_object', { index: index + 1 });
      if (!isNonEmptyString(item.id)) return report('edge_bad_id', { index: index + 1 });
      const id = item.id;
      let valid = true;
      if (edgeIds.has(id)) {
        report('edge_dup_id', { id });
        valid = false;
      }
      edgeIds.add(id);

      const from = item.from;
      const to = item.to;
      for (const endpoint of [from, to]) {
        if (typeof endpoint !== 'string' || !nodeIds.has(endpoint)) {
          report('edge_unknown_node', { id, node: String(endpoint) });
          valid = false;
        }
      }
      if (typeof from === 'string' && typeof to === 'string') {
        if (from === to) {
          report('edge_self_loop', { id, node: from });
          valid = false;
        } else {
          const key = pairKey(from, to);
          const owner = pairOwner.get(key);
          if (owner !== undefined) {
            report('edge_dup_pair', { id, a: from, b: to, other: owner });
            valid = false;
          } else {
            pairOwner.set(key, id);
          }
        }
      }
      if (!Number.isSafeInteger(item.cost) || (item.cost as number) <= 0) {
        report('edge_bad_cost', { id });
        valid = false;
      }
      if (valid) {
        edges.push({ id, from: from as string, to: to as string, cost: item.cost as number });
      }
    });
  }

  // --- Initial state --------------------------------------------------------
  const initialState: InitialState = { blocked_nodes: [], blocked_edges: [], closed_exits: [] };
  if (isRecord(rawState)) {
    const typeById = new Map(nodes.map((n) => [n.id, n.type]));
    const lists = ['blocked_nodes', 'blocked_edges', 'closed_exits'] as const;
    for (const list of lists) {
      const entries = rawState[list];
      if (!('initial_state' in raw) || !(list in rawState)) {
        report('missing_field', { field: `initial_state.${list}` });
        continue;
      }
      if (!Array.isArray(entries) || entries.some((entry) => typeof entry !== 'string')) {
        report('state_bad_list', { list });
        continue;
      }
      for (const entry of new Set(entries as string[])) {
        const known = list === 'blocked_edges' ? edgeIds.has(entry) : nodeIds.has(entry);
        if (!known) {
          report('state_unknown_id', { list, id: entry });
          continue;
        }
        const type = typeById.get(entry);
        const allowed =
          list === 'blocked_edges' ||
          (list === 'blocked_nodes' && type !== 'exit') ||
          (list === 'closed_exits' && type === 'exit');
        if (!allowed) {
          report('state_wrong_category', { list, id: entry });
          continue;
        }
        initialState[list].push(entry);
      }
    }
  }

  if (issues.length > 0) return { ok: false, issues };

  return {
    ok: true,
    building: { building: (name as string).trim(), nodes, edges, initial_state: initialState },
  };
}
