import { describe, expect, it } from 'vitest';
import { comparePaths } from '../src/core/routing';
import { hazards, loadSample, makeBuilding, route } from './helpers';

describe('official sample checks (building.json)', () => {
  const sample = loadSample();

  it('baseline: R1 -> R1-C1-C2-E1, cost 7', () => {
    expect(route(sample, 'R1')).toMatchObject({
      status: 'ok',
      path: ['R1', 'C1', 'C2', 'E1'],
      exitId: 'E1',
      totalCost: 7,
    });
  });

  it('blocked junction: R1 with C2 blocked -> R1-C1-C3-C4-E2, cost 11', () => {
    expect(route(sample, 'R1', hazards(['C2']))).toMatchObject({
      status: 'ok',
      path: ['R1', 'C1', 'C3', 'C4', 'E2'],
      totalCost: 11,
    });
  });

  it('exits closed: R1 with E1 and E2 closed -> no route', () => {
    expect(route(sample, 'R1', hazards([], [], ['E1', 'E2'])).status).toBe('no-route');
  });

  it('different start: R2 -> R2-C3-C4-E2, cost 7', () => {
    expect(route(sample, 'R2')).toMatchObject({
      status: 'ok',
      path: ['R2', 'C3', 'C4', 'E2'],
      totalCost: 7,
    });
  });

  it('blocked start: R1 blocked -> start-blocked', () => {
    expect(route(sample, 'R1', hazards(['R1'])).status).toBe('start-blocked');
  });

  it('reports corridor ids and per-corridor costs that add up to the total', () => {
    const result = route(sample, 'R1');
    expect(result).toMatchObject({ edgeIds: ['L01', 'L02', 'L03'], costs: [2, 3, 2] });
  });
});

describe('tie-breaking', () => {
  it('equal-cost exits: smallest exit id wins (even if listed last)', () => {
    const b = makeBuilding(
      ['S:room', 'E9:exit', 'E2:exit'],
      [
        ['S', 'E9', 5],
        ['S', 'E2', 5],
      ],
    );
    expect(route(b, 'S')).toMatchObject({ exitId: 'E2', path: ['S', 'E2'] });
  });

  it('equal-cost paths to one exit: lexicographically smallest node sequence wins', () => {
    // S-B-E and S-A-E both cost 4; "A" < "B".
    const b = makeBuilding(
      ['S:room', 'B:junction', 'A:junction', 'E:exit'],
      [
        ['S', 'B', 2],
        ['B', 'E', 2],
        ['S', 'A', 2],
        ['A', 'E', 2],
      ],
    );
    expect(route(b, 'S')).toMatchObject({ path: ['S', 'A', 'E'], totalCost: 4 });
  });

  it('sample trap: with C2 blocked the cost-11 tie is resolved to the C1 route', () => {
    // R1-R2-C3-C4-E2 also costs 11, but "C1" < "R2".
    const result = route(loadSample(), 'R1', hazards(['C2']));
    expect(result).toMatchObject({ path: ['R1', 'C1', 'C3', 'C4', 'E2'] });
  });

  it('a tie in the middle of a path is resolved by the smaller prefix, not by arrival order', () => {
    // Two cost-2 ways to reach M (via Z or via B); the route to E must use "B".
    const b = makeBuilding(
      ['S:room', 'Z:junction', 'B:junction', 'M:junction', 'E:exit'],
      [
        ['S', 'Z', 1],
        ['Z', 'M', 1],
        ['S', 'B', 1],
        ['B', 'M', 1],
        ['M', 'E', 1],
      ],
    );
    expect(route(b, 'S')).toMatchObject({ path: ['S', 'B', 'M', 'E'], totalCost: 3 });
  });

  it('ids are compared case-sensitively by code unit ("B" < "a")', () => {
    const b = makeBuilding(
      ['S:room', 'a:junction', 'B:junction', 'E:exit'],
      [
        ['S', 'a', 1],
        ['a', 'E', 1],
        ['S', 'B', 1],
        ['B', 'E', 1],
      ],
    );
    expect(route(b, 'S')).toMatchObject({ path: ['S', 'B', 'E'] });
  });

  it('compares numerically-looking ids as strings ("10" < "9")', () => {
    expect(comparePaths(['S', '10'], ['S', '9'])).toBeLessThan(0);
  });
});

describe('cost, not distance or hop count', () => {
  it('prefers a cheaper route with more corridors', () => {
    const b = makeBuilding(
      ['S:room', 'A:junction', 'B:junction', 'E:exit'],
      [
        ['S', 'E', 10],
        ['S', 'A', 1],
        ['A', 'B', 1],
        ['B', 'E', 1],
      ],
    );
    expect(route(b, 'S')).toMatchObject({ path: ['S', 'A', 'B', 'E'], totalCost: 3 });
  });

  it('ignores display coordinates entirely', () => {
    const b = makeBuilding(
      ['S:room', 'A:junction', 'E:exit'],
      [
        ['S', 'A', 1],
        ['A', 'E', 1],
      ],
    );
    b.nodes[1]!.x = 9999;
    expect(route(b, 'S')).toMatchObject({ totalCost: 2 });
  });
});

describe('hazards', () => {
  it('a closed exit cannot be passed through as an intermediate node', () => {
    // The only way to E2 is through E1; closing E1 must cut E2 off too.
    const b = makeBuilding(
      ['S:room', 'E1:exit', 'E2:exit'],
      [
        ['S', 'E1', 1],
        ['E1', 'E2', 1],
      ],
    );
    expect(route(b, 'S', hazards([], [], ['E1'])).status).toBe('no-route');
  });

  it('an open exit may still be reached when another exit is closed', () => {
    const b = makeBuilding(
      ['S:room', 'E1:exit', 'E2:exit'],
      [
        ['S', 'E1', 1],
        ['S', 'E2', 3],
      ],
    );
    expect(route(b, 'S', hazards([], [], ['E1']))).toMatchObject({ exitId: 'E2', totalCost: 3 });
  });

  it('a blocked corridor removes only that connection', () => {
    const b = makeBuilding(
      ['S:room', 'A:junction', 'E:exit'],
      [
        ['S', 'A', 1],
        ['A', 'E', 1],
        ['S', 'E', 9],
      ],
    );
    // e2 = A-E blocked: A is still reachable, but the route must use the direct corridor.
    expect(route(b, 'S', hazards([], ['e2']))).toMatchObject({ path: ['S', 'E'], totalCost: 9 });
  });

  it('a blocked node removes its incident corridors', () => {
    const b = makeBuilding(
      ['S:room', 'A:junction', 'E:exit'],
      [
        ['S', 'A', 1],
        ['A', 'E', 1],
      ],
    );
    expect(route(b, 'S', hazards(['A'])).status).toBe('no-route');
  });

  it('disconnected area: start cut off from every exit has no route', () => {
    const b = makeBuilding(
      ['S:room', 'T:room', 'E:exit'],
      [['S', 'T', 1]], // E is isolated
    );
    expect(route(b, 'S').status).toBe('no-route');
  });

  it('disconnected graph: a start in the connected part still finds its exit', () => {
    const b = makeBuilding(
      ['S:room', 'E:exit', 'X:room', 'Y:room'],
      [
        ['S', 'E', 2],
        ['X', 'Y', 1],
      ],
    );
    expect(route(b, 'S')).toMatchObject({ status: 'ok', totalCost: 2 });
    expect(route(b, 'X').status).toBe('no-route');
  });
});

describe('start handling', () => {
  const sample = loadSample();
  it('no start selected', () => expect(route(sample, null).status).toBe('no-start'));
  it('unknown start id', () => expect(route(sample, 'nope').status).toBe('no-start'));
  it('an exit cannot be a start', () => expect(route(sample, 'E1').status).toBe('no-start'));
});
