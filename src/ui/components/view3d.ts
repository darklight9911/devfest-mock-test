import { t } from '../../i18n';
import type { AppEvent, AppState } from '../../state/store';
import type { RouteResult } from '../../types';
import { activateEdge, activateNode } from '../actions';
import { $, h } from '../dom';
import type { Scene3D } from '../three/scene3d';
import type { Ctx, Render } from './types';

/**
 * 2D/3D switch plus the 3D "game" HUD. Three.js is loaded on demand the first time the 3D view
 * opens, so the 2D app stays small and keeps working even where WebGL is unavailable.
 */
export function mountView3D(ctx: Ctx): Render {
  const { store, toast } = ctx;
  const viewButtons = Array.from(
    document.querySelectorAll<HTMLButtonElement>('#view-switch [data-view]'),
  );
  const view2d = $('#view2d');
  const view3d = $('#view3d');
  const stage = $('#game-stage');
  const message = $('#game-message');
  const status = $('#game-status');
  const result = $('#game-result');
  const runButton = $<HTMLButtonElement>('#game-run');
  const drillButton = $<HTMLButtonElement>('#game-drill');
  const undoButton = $<HTMLButtonElement>('#game-undo');
  const cameraButton = $<HTMLButtonElement>('#game-camera');

  let scene: Scene3D | null = null;
  let loading = false;
  let failed = false;
  let latest: { state: AppState; route: RouteResult } | null = null;
  let resultSignature = '';

  for (const button of viewButtons) {
    button.addEventListener('click', () =>
      store.setView(button.dataset.view === '3d' ? '3d' : '2d'),
    );
  }
  runButton.addEventListener('click', () => {
    const route = store.getRoute();
    if (route.status === 'ok') scene?.runEvacuation(route.path);
  });
  drillButton.addEventListener('click', () => {
    const { drill, lang } = store.getState();
    if (drill && !drill.escaped) {
      store.endDrill();
    } else if (store.startDrill()) {
      toast(t(lang, 'game.drillIntro'));
    } else {
      toast(t(lang, 'game.needRoute'), 'warn');
    }
  });
  undoButton.addEventListener('click', () => store.drillUndo());
  cameraButton.addEventListener('click', () => scene?.resetCamera());

  async function ensureScene(): Promise<void> {
    if (scene || loading || failed) return;
    loading = true;
    try {
      // Wait for the web fonts so the canvas-drawn name tags use them.
      const [{ Scene3D }] = await Promise.all([import('../three/scene3d'), document.fonts.ready]);
      scene = new Scene3D(stage, {
        onNode: (id) => activateNode(ctx, id),
        onEdge: (id) => activateEdge(ctx, id),
      });
    } catch {
      failed = true;
    }
    loading = false;
    if (latest) render(latest.state, latest.route, { type: 'ui' });
  }

  function statusText(state: AppState, route: RouteResult): { text: string; tone: string } {
    const { lang, drill } = state;
    if (drill && !drill.escaped) {
      return {
        text: t(lang, 'game.drillProgress', { path: drill.path.join(' → '), cost: drill.cost }),
        tone: 'drill',
      };
    }
    switch (route.status) {
      case 'ok':
        return {
          text: `${route.path.join(' → ')} · ${t(lang, 'route.cost')} ${route.totalCost}`,
          tone: 'ok',
        };
      case 'no-route':
        return { text: t(lang, 'route.noRoute'), tone: 'error' };
      case 'start-blocked':
        return { text: t(lang, 'route.startBlocked'), tone: 'warn' };
      case 'no-start':
        return { text: t(lang, 'route.pickStart'), tone: 'info' };
      case 'no-building':
        return { text: t(lang, 'route.noBuilding'), tone: 'info' };
    }
  }

  function renderResult(state: AppState): void {
    const { drill, lang } = state;
    const signature = drill?.escaped ? `${lang}|${drill.path.join(',')}` : '';
    if (signature === resultSignature) return;
    resultSignature = signature;
    if (!drill?.escaped) {
      result.hidden = true;
      result.replaceChildren();
      return;
    }
    const stars =
      drill.cost <= drill.optimalCost ? 3 : drill.cost <= drill.optimalCost * 1.25 ? 2 : 1;
    const perfect = stars === 3;
    result.replaceChildren(
      h('strong', { class: 'game-result-title' }, t(lang, 'game.escaped')),
      h(
        'div',
        { class: 'stars', role: 'img', 'aria-label': t(lang, 'game.stars', { count: stars }) },
        '★'.repeat(stars) + '☆'.repeat(3 - stars),
      ),
      h('p', {}, t(lang, 'game.result', { cost: drill.cost, best: drill.optimalCost })),
      h(
        'p',
        { class: 'muted' },
        perfect
          ? t(lang, 'game.perfect')
          : t(lang, 'game.bestWas', { path: drill.optimalPath.join(' → ') }),
      ),
      h(
        'div',
        { class: 'btn-row' },
        h(
          'button',
          { type: 'button', class: 'btn btn-primary', onclick: () => store.startDrill() },
          t(lang, 'game.playAgain'),
        ),
        h(
          'button',
          { type: 'button', class: 'btn', onclick: () => store.endDrill() },
          t(lang, 'game.close'),
        ),
      ),
    );
    result.hidden = false;
  }

  const render: Render = (state: AppState, route: RouteResult, event: AppEvent) => {
    latest = { state, route };
    const { lang, drill, building } = state;
    const is3d = state.view === '3d';
    const drillActive = drill !== null && !drill.escaped;

    view2d.hidden = is3d;
    view3d.hidden = !is3d;
    for (const button of viewButtons) {
      button.setAttribute('aria-checked', String(button.dataset.view === state.view));
    }
    if (is3d) void ensureScene();

    const messageKey = failed
      ? 'view3d.unsupported'
      : !scene
        ? 'view3d.loading'
        : !building
          ? 'map.empty'
          : null;
    message.hidden = messageKey === null;
    message.textContent = messageKey ? t(lang, messageKey) : '';

    if (scene) {
      scene.setActive(is3d && building !== null);
      if (building) {
        scene.update(state, route, event);
        scene.setAriaLabel(t(lang, 'view3d.aria', { name: building.building }));
      }
    }

    const { text, tone } = statusText(state, route);
    status.textContent = text;
    status.dataset.tone = tone;
    status.hidden = !building;

    runButton.disabled = !scene || route.status !== 'ok' || drillActive;
    drillButton.textContent = t(lang, drillActive ? 'game.stopDrill' : 'game.drill');
    drillButton.setAttribute('aria-pressed', String(drillActive));
    drillButton.disabled = !scene || (!drillActive && route.status !== 'ok');
    undoButton.disabled = !drillActive || (drill?.path.length ?? 0) < 2;
    cameraButton.disabled = !scene || !building;

    renderResult(state);
  };

  return render;
}
