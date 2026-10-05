import { t, type MessageKey } from '../i18n';
import type { Ctx } from './components/types';

/**
 * What a click on a location means. Shared by the 2D and 3D maps so both behave identically:
 * during an escape drill it moves the evacuee, otherwise it follows the map click mode.
 */
export function activateNode({ store, toast }: Ctx, id: string): void {
  const state = store.getState();
  const { drill, lang } = state;

  if (drill && !drill.escaped) {
    const from = drill.path[drill.path.length - 1] ?? '';
    const error = store.drillStep(id);
    if (error) toast(t(lang, `game.err.${error}` as MessageKey, { from, to: id }), 'warn');
    return;
  }

  if (state.mode === 'hazard') {
    store.toggleNode(id);
    return;
  }
  const outcome = store.selectStart(id);
  if (outcome === 'blocked') toast(t(lang, 'start.cannotBlocked'), 'warn');
  if (outcome === 'not-selectable') toast(t(lang, 'start.cannotExit'), 'warn');
}

/** Corridors can only be toggled, and never while a drill is being played. */
export function activateEdge({ store }: Ctx, id: string): void {
  const state = store.getState();
  if (state.drill && !state.drill.escaped) return;
  if (state.mode === 'hazard') store.toggleEdge(id);
}
