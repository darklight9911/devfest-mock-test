import { isLang, t } from './i18n';
import { createStore } from './state/store';
import { mountHazardPanel } from './ui/components/hazardPanel';
import { mountHeader } from './ui/components/header';
import { mountImportPanel } from './ui/components/importPanel';
import { mountLegend } from './ui/components/legend';
import { mountMapToolbar } from './ui/components/mapToolbar';
import { mountMapView } from './ui/components/mapView';
import { mountRoutePanel } from './ui/components/routePanel';
import { mountStartPanel } from './ui/components/startPanel';
import { mountView3D } from './ui/components/view3d';
import type { Ctx, Render } from './ui/components/types';
import { applyStaticI18n } from './ui/i18n-dom';
import { createToaster } from './ui/toast';
import { readStorage, writeStorage } from './utils/storage';

const LANG_KEY = 'smart-escape:lang';
const CONTRAST_KEY = 'smart-escape:contrast';

/** Wires the store to every UI component. Called once from main.ts. */
export function startApp(): void {
  const savedLang = readStorage(LANG_KEY);
  const store = createStore({
    lang: isLang(savedLang) ? savedLang : 'en',
    highContrast: readStorage(CONTRAST_KEY) === '1',
  });
  const ctx: Ctx = { store, toast: createToaster() };

  const renderers: Render[] = [
    mountHeader(ctx),
    mountImportPanel(ctx),
    mountStartPanel(ctx),
    mountMapToolbar(ctx),
    mountLegend(ctx),
    mountMapView(ctx),
    mountView3D(ctx),
    mountRoutePanel(ctx),
    mountHazardPanel(ctx),
  ];

  let appliedLang: string | null = null;
  let appliedContrast: boolean | null = null;

  store.subscribe((state, route, event) => {
    if (state.lang !== appliedLang) {
      appliedLang = state.lang;
      document.documentElement.lang = state.lang;
      document.title = `${t(state.lang, 'app.title')} — ${t(state.lang, 'app.subtitle')}`;
      applyStaticI18n(state.lang);
      writeStorage(LANG_KEY, state.lang);
    }
    if (state.highContrast !== appliedContrast) {
      appliedContrast = state.highContrast;
      document.documentElement.dataset.contrast = state.highContrast ? 'high' : 'normal';
      writeStorage(CONTRAST_KEY, state.highContrast ? '1' : '0');
    }
    for (const render of renderers) render(state, route, event);
  });
}
