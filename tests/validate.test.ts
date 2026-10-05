import { describe, expect, it } from 'vitest';
import { parseBuildingJson, validateBuilding, type IssueCode } from '../src/core/validate';
import { loadSample } from './helpers';

const base = () => ({
  building: 'T',
  nodes: [
    { id: 'R1', label: 'Room', type: 'room', x: 0, y: 0 },
    { id: 'E1', label: 'Exit', type: 'exit', x: 10, y: 0 },
  ],
  edges: [{ id: 'L1', from: 'R1', to: 'E1', cost: 3 }],
  initial_state: {
    blocked_nodes: [] as string[],
    blocked_edges: [] as string[],
    closed_exits: [] as string[],
  },
});

function codes(raw: unknown): IssueCode[] {
  const result = validateBuilding(raw);
  return result.ok ? [] : result.issues.map((i) => i.code);
}

describe('validateBuilding: accepts valid input', () => {
  it('accepts the supplied sample', () => {
    expect(loadSample().nodes).toHaveLength(8);
  });

  it('accepts empty initial_state arrays', () => {
    expect(validateBuilding(base()).ok).toBe(true);
  });

  it('accepts disconnected graphs', () => {
    const b = base();
    b.nodes.push({ id: 'R2', label: 'Lonely', type: 'room', x: 5, y: 5 });
    expect(validateBuilding(b).ok).toBe(true);
  });

  it('keeps initial hazards that are valid', () => {
    const b = base();
    b.nodes.push({ id: 'J1', label: 'J', type: 'junction', x: 1, y: 1 });
    b.initial_state = { blocked_nodes: ['J1'], blocked_edges: ['L1'], closed_exits: ['E1'] };
    const result = validateBuilding(b);
    expect(result.ok && result.building.initial_state).toEqual(b.initial_state);
  });
});

describe('validateBuilding: rejects bad input', () => {
  it('invalid JSON text', () => {
    expect(parseBuildingJson('{ nope')).toEqual({ ok: false, issues: [{ code: 'invalid_json' }] });
  });

  it.each([null, [], 'text', 5])('non-object top level: %j', (raw) => {
    expect(codes(raw)).toEqual(['not_object']);
  });

  it('missing top-level fields', () => {
    expect(codes({})).toEqual(['missing_field', 'missing_field', 'missing_field', 'missing_field']);
  });

  it('empty building name', () => {
    expect(codes({ ...base(), building: '   ' })).toContain('empty_building');
  });

  it('fewer than 2 nodes', () => {
    const b = base();
    b.nodes = [b.nodes[0]!];
    expect(codes(b)).toContain('node_count');
  });

  it('more than 60 nodes', () => {
    const b = base();
    for (let i = 0; i < 59; i++)
      b.nodes.push({ id: `N${i}`, label: 'n', type: 'room', x: 0, y: 0 });
    expect(codes(b)).toContain('node_count');
  });

  it('no edges / more than 150 edges', () => {
    const none = { ...base(), edges: [] };
    expect(codes(none)).toContain('edge_count');
    const b = base();
    b.edges = Array.from({ length: 151 }, (_, i) => ({
      id: `L${i}`,
      from: 'R1',
      to: 'E1',
      cost: 1,
    }));
    expect(codes(b)).toContain('edge_count');
  });

  it('duplicate node id (case-sensitive: r1 is different from R1)', () => {
    const dup = base();
    dup.nodes.push({ id: 'R1', label: 'again', type: 'room', x: 0, y: 0 });
    expect(codes(dup)).toContain('node_dup_id');
    const caseDiff = base();
    caseDiff.nodes.push({ id: 'r1', label: 'lower', type: 'room', x: 0, y: 0 });
    expect(validateBuilding(caseDiff).ok).toBe(true);
  });

  it('bad node fields', () => {
    const b = base();
    (b.nodes[0] as Record<string, unknown>).label = '';
    (b.nodes[0] as Record<string, unknown>).type = 'closet';
    (b.nodes[1] as Record<string, unknown>).x = 'ten';
    expect(codes(b)).toEqual(
      expect.arrayContaining(['node_bad_label', 'node_bad_type', 'node_bad_coords']),
    );
  });

  it('no exit / no room or junction', () => {
    const noExit = base();
    (noExit.nodes[1] as Record<string, unknown>).type = 'room';
    expect(codes(noExit)).toContain('no_exit');
    const noRoom = base();
    (noRoom.nodes[0] as Record<string, unknown>).type = 'exit';
    expect(codes(noRoom)).toContain('no_open_location');
  });

  it.each([0, -2, 1.5, '3', null])('invalid cost %j', (cost) => {
    const b = base();
    (b.edges[0] as Record<string, unknown>).cost = cost;
    expect(codes(b)).toContain('edge_bad_cost');
  });

  it('corridor to an unknown node', () => {
    const b = base();
    b.edges[0]!.to = 'GHOST';
    expect(codes(b)).toContain('edge_unknown_node');
  });

  it('self-loop', () => {
    const b = base();
    b.edges[0]!.to = 'R1';
    expect(codes(b)).toContain('edge_self_loop');
  });

  it('repeated node pair, in either direction', () => {
    const b = base();
    b.edges.push({ id: 'L2', from: 'E1', to: 'R1', cost: 1 });
    expect(codes(b)).toContain('edge_dup_pair');
  });

  it('duplicate edge id', () => {
    const b = base();
    b.nodes.push({ id: 'J1', label: 'J', type: 'junction', x: 1, y: 1 });
    b.edges.push({ id: 'L1', from: 'R1', to: 'J1', cost: 1 });
    expect(codes(b)).toContain('edge_dup_id');
  });

  it('initial_state: unknown ids and wrong categories', () => {
    const unknown = base();
    unknown.initial_state.blocked_nodes = ['GHOST'];
    expect(codes(unknown)).toContain('state_unknown_id');

    const exitBlocked = base();
    exitBlocked.initial_state.blocked_nodes = ['E1'];
    expect(codes(exitBlocked)).toContain('state_wrong_category');

    const roomClosed = base();
    roomClosed.initial_state.closed_exits = ['R1'];
    expect(codes(roomClosed)).toContain('state_wrong_category');

    const nodeAsEdge = base();
    nodeAsEdge.initial_state.blocked_edges = ['R1'];
    expect(codes(nodeAsEdge)).toContain('state_unknown_id');
  });

  it('initial_state: missing list or non-array list', () => {
    const missing = base();
    delete (missing.initial_state as Record<string, unknown>).closed_exits;
    expect(codes(missing)).toContain('missing_field');
    const notArray = {
      ...base(),
      initial_state: { blocked_nodes: 'R1', blocked_edges: [], closed_exits: [] },
    };
    expect(codes(notArray)).toContain('state_bad_list');
  });

  it('reports several problems at once', () => {
    const b = base();
    b.edges[0]!.cost = 0;
    b.edges[0]!.to = 'GHOST';
    expect(codes(b).length).toBeGreaterThanOrEqual(2);
  });
});
