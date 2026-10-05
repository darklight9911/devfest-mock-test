import type { AppEvent, AppState, Store } from '../../state/store';
import type { RouteResult } from '../../types';
import type { ToastFn } from '../toast';

/** What every component receives when it is mounted. */
export interface Ctx {
  store: Store;
  toast: ToastFn;
}

/** Each component returns a render function that the app calls after every state change. */
export type Render = (state: AppState, route: RouteResult, event: AppEvent) => void;
