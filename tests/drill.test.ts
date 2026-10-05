import { describe, expect, it } from 'vitest';
import { buildGraph } from '../src/core/graph';
import { drillStars, startDrill, stepDrill, undoDrill, type Drill } from '../src/core/drill';
import { createStore } from '../src/state/store';
import { hazards, loadSample } from './helpers';

const graph = buildGraph(loadSample());

function walk(ids: string[], h = hazards()): Drill {
  let drill = startDrill('R1', ['R1', 'C1', 'C2', 'E1'], 7);
  for (const id of ids) {
    const result = stepDrill(graph, h, drill, id);
    if (!result.ok) throw new Error(`${id}: ${result.reason}`);
    drill = result.drill;
  }
  return drill;
}

describe('escape drill logic', () => {
  it('walking the optimal route escapes with 3 stars', () => {
    const drill = walk(['C1', 'C2', 'E1']);
    expect(drill).toMatchObject({ escaped: true, cost: 7, edgeIds: ['L01', 'L02', 'L03'] });
    expect(drillStars(drill)).toBe(3);
  });

  it('a longer escape earns fewer stars', () => {
    // R1-C1-C2-C4-E2 = 2+3+3+2 = 10 (> 7 * 1.25) -> 1 star
    expect(drillStars(walk(['C1', 'C2', 'C4', 'E2']))).toBe(1);
  });

  it('within 25% of the best cost earns 2 stars', () => {
    const drill = { ...walk(['C1', 'C2', 'E1']), cost: 8 };
    expect(drillStars(drill)).toBe(2);
  });

  it('refuses moves that break the routing rules', () => {
    const start = startDrill('R1', [], 7);
    expect(stepDrill(graph, hazards(), start, 'C2')).toEqual({ ok: false, reason: 'not-adjacent' });
    expect(stepDrill(graph, hazards(['C1']), start, 'C1')).toEqual({
      ok: false,
      reason: 'blocked',
    });
    expect(stepDrill(graph, hazards([], ['L01']), start, 'C1')).toEqual({
      ok: false,
      reason: 'corridor-blocked',
    });
    const atC2 = walk(['C1', 'C2']);
    expect(stepDrill(graph, hazards([], [], ['E1']), atC2, 'E1')).toEqual({
      ok: false,
      reason: 'closed',
    });
    expect(stepDrill(graph, hazards(), atC2, 'C1')).toEqual({ ok: false, reason: 'visited' });
  });

  it('no moves after escaping', () => {
    expect(stepDrill(graph, hazards(), walk(['C1', 'C2', 'E1']), 'C2')).toEqual({
      ok: false,
      reason: 'finished',
    });
  });

  it('undo takes back the last step and its cost', () => {
    const drill = undoDrill(graph, walk(['C1', 'C2']));
    expect(drill).toMatchObject({ path: ['R1', 'C1'], edgeIds: ['L01'], cost: 2 });
    expect(undoDrill(graph, startDrill('R1', [], 7)).path).toEqual(['R1']);
  });
});

describe('escape drill in the store', () => {
  function ready() {
    const store = createStore();
    store.loadBuilding(loadSample(), 'building.json');
    store.selectStart('R1');
    return store;
  }

  it('starts from the current route and scores against it', () => {
    const store = ready();
    expect(store.startDrill()).toBe(true);
    expect(store.getState().drill).toMatchObject({
      optimalCost: 7,
      optimalPath: ['R1', 'C1', 'C2', 'E1'],
    });
    expect(store.drillStep('C2')).toBe('not-adjacent');
    expect(store.drillStep('C1')).toBeNull();
    expect(store.getState().drill?.cost).toBe(2);
  });

  it('cannot start without a reachable exit', () => {
    const store = ready();
    store.toggleNode('E1');
    store.toggleNode('E2');
    expect(store.startDrill()).toBe(false);
  });

  it('any hazard change, new start, reset or switching to 2D ends the drill', () => {
    const store = ready();
    const cases: [string, () => void][] = [
      ['toggle node', () => store.toggleNode('C3')],
      ['toggle edge', () => store.toggleEdge('L09')],
      ['reset', () => store.resetHazards()],
      ['start', () => store.selectStart('R2')],
      ['2d view', () => store.setView('2d')],
    ];
    for (const [name, action] of cases) {
      store.startDrill();
      action();
      expect(store.getState().drill, name).toBeNull();
    }
  });

  it('the drill never changes the computed route', () => {
    const store = ready();
    store.startDrill();
    store.drillStep('R2');
    expect(store.getRoute()).toMatchObject({ path: ['R1', 'C1', 'C2', 'E1'], totalCost: 7 });
  });
});
