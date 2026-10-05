import { describe, expect, it } from 'vitest';
import { createStore } from '../src/state/store';
import { loadSample, makeBuilding } from './helpers';

function loaded() {
  const store = createStore();
  store.loadBuilding(loadSample(), 'building.json');
  return store;
}

describe('store: the five sample scenarios end to end', () => {
  it('baseline', () => {
    const store = loaded();
    store.selectStart('R1');
    expect(store.getRoute()).toMatchObject({
      status: 'ok',
      path: ['R1', 'C1', 'C2', 'E1'],
      totalCost: 7,
    });
  });

  it('block C2 reroutes immediately, unblocking restores the original route', () => {
    const store = loaded();
    store.selectStart('R1');
    store.toggleNode('C2');
    expect(store.getRoute()).toMatchObject({ path: ['R1', 'C1', 'C3', 'C4', 'E2'], totalCost: 11 });
    store.toggleNode('C2');
    expect(store.getRoute()).toMatchObject({ totalCost: 7 });
  });

  it('closing both exits gives no route; reopening one brings it back', () => {
    const store = loaded();
    store.selectStart('R1');
    store.toggleNode('E1');
    store.toggleNode('E2');
    expect(store.getRoute().status).toBe('no-route');
    store.toggleNode('E2');
    expect(store.getRoute()).toMatchObject({ status: 'ok', exitId: 'E2', totalCost: 10 });
  });

  it('different start', () => {
    const store = loaded();
    store.selectStart('R2');
    expect(store.getRoute()).toMatchObject({ path: ['R2', 'C3', 'C4', 'E2'], totalCost: 7 });
  });

  it('blocking the selected start reports start-blocked and unblocking recovers', () => {
    const store = loaded();
    store.selectStart('R1');
    store.toggleNode('R1');
    expect(store.getRoute().status).toBe('start-blocked');
    store.toggleNode('R1');
    expect(store.getRoute().status).toBe('ok');
  });
});

describe('store: selection rules', () => {
  it('refuses a blocked start and an exit as start', () => {
    const store = loaded();
    store.toggleNode('R1');
    expect(store.selectStart('R1')).toBe('blocked');
    expect(store.selectStart('E1')).toBe('not-selectable');
    expect(store.selectStart('nope')).toBe('not-selectable');
    expect(store.getState().start).toBeNull();
  });

  it('blocked corridors reroute and toggle back', () => {
    const store = loaded();
    store.selectStart('R1');
    store.toggleEdge('L02'); // C1-C2
    expect(store.getRoute()).toMatchObject({ status: 'ok', totalCost: 11 });
    store.toggleEdge('L02');
    expect(store.getRoute()).toMatchObject({ totalCost: 7 });
  });
});

describe('store: reset restores the file’s initial_state', () => {
  it('restores hazards that the file started with, not an empty set', () => {
    const building = makeBuilding(
      ['R1:room', 'C1:junction', 'E1:exit', 'E2:exit'],
      [
        ['R1', 'C1', 1],
        ['C1', 'E1', 1],
        ['C1', 'E2', 5],
      ],
    );
    building.initial_state = { blocked_nodes: [], blocked_edges: ['e2'], closed_exits: ['E2'] };
    const store = createStore();
    store.loadBuilding(building, 'custom.json');
    store.selectStart('R1');
    expect(store.getRoute().status).toBe('no-route'); // initial hazards apply on load

    store.toggleEdge('e2'); // unblock
    store.toggleNode('E2'); // reopen
    store.toggleNode('C1'); // new hazard
    store.resetHazards();

    const { hazards } = store.getState();
    expect([...hazards.blockedEdges]).toEqual(['e2']);
    expect([...hazards.closedExits]).toEqual(['E2']);
    expect(hazards.blockedNodes.size).toBe(0);
    expect(store.getRoute().status).toBe('no-route');
  });

  it('reset does not mutate the building’s own initial_state', () => {
    const store = loaded();
    store.toggleNode('C2');
    store.resetHazards();
    store.toggleNode('C1');
    store.resetHazards();
    expect(store.getState().building?.initial_state.blocked_nodes).toEqual([]);
    expect(store.getState().hazards.blockedNodes.size).toBe(0);
  });
});

describe('store: events and rejected imports', () => {
  it('notifies subscribers with the route after each change', () => {
    const store = loaded();
    const seen: string[] = [];
    store.subscribe((_state, route) => seen.push(route.status));
    store.selectStart('R1');
    store.toggleNode('R1');
    expect(seen).toEqual(['no-start', 'ok', 'start-blocked']);
  });

  it('a rejected file keeps the previous building and its state', () => {
    const store = loaded();
    store.selectStart('R1');
    store.rejectImport([{ code: 'invalid_json' }], 'bad.json');
    expect(store.getState().building?.building).toContain('East Annex');
    expect(store.getState().start).toBe('R1');
    expect(store.getState().importIssues).toHaveLength(1);
  });
});
