import { MAX_FILE_BYTES, parseBuildingJson } from '../../core/validate';
import { describeIssue, t } from '../../i18n';
import { $, h } from '../dom';
import type { Ctx, Render } from './types';

const MAX_LISTED_ISSUES = 8;

export function mountImportPanel({ store, toast }: Ctx): Render {
  const input = $<HTMLInputElement>('#file-input');
  const dropzone = $('#dropzone');
  const status = $('#import-status');

  function importText(text: string, name: string): void {
    const result = parseBuildingJson(text);
    if (result.ok) {
      store.loadBuilding(result.building, name);
      toast(t(store.getState().lang, 'import.success'));
    } else {
      store.rejectImport(result.issues, name);
    }
  }

  async function importFile(file: File): Promise<void> {
    if (file.size > MAX_FILE_BYTES) {
      store.rejectImport([{ code: 'file_too_large' }], file.name);
      return;
    }
    try {
      importText(await file.text(), file.name);
    } catch {
      toast(t(store.getState().lang, 'import.readFailed'), 'error');
    }
  }

  async function loadSample(): Promise<void> {
    try {
      const response = await fetch(`${import.meta.env.BASE_URL}samples/building.json`);
      if (!response.ok) throw new Error(String(response.status));
      importText(await response.text(), 'building.json');
    } catch {
      toast(t(store.getState().lang, 'import.readFailed'), 'error');
    }
  }

  $('#choose-file').addEventListener('click', () => input.click());
  $('#load-sample').addEventListener('click', () => void loadSample());
  input.addEventListener('change', () => {
    const file = input.files?.[0];
    if (file) void importFile(file);
    input.value = ''; // allows re-importing the same file after editing it
  });

  dropzone.addEventListener('dragenter', (event) => {
    event.preventDefault();
    dropzone.classList.add('is-over');
  });
  dropzone.addEventListener('dragover', (event) => {
    event.preventDefault();
    dropzone.classList.add('is-over');
  });
  dropzone.addEventListener('dragleave', (event) => {
    if (!dropzone.contains(event.relatedTarget as Node | null))
      dropzone.classList.remove('is-over');
  });
  dropzone.addEventListener('drop', (event) => {
    event.preventDefault();
    dropzone.classList.remove('is-over');
    const file = event.dataTransfer?.files[0];
    if (file) void importFile(file);
  });
  // A file dropped outside the zone must not make the browser navigate away from the app.
  window.addEventListener('dragover', (event) => event.preventDefault());
  window.addEventListener('drop', (event) => event.preventDefault());

  return (state) => {
    const { lang, importIssues, building, sourceName } = state;
    if (importIssues) {
      const shown = importIssues.slice(0, MAX_LISTED_ISSUES);
      const hidden = importIssues.length - shown.length;
      status.replaceChildren(
        h(
          'div',
          { class: 'notice notice-error', role: 'alert' },
          h('strong', {}, `${t(lang, 'import.errorTitle')}${sourceName ? ` — ${sourceName}` : ''}`),
          h('ul', {}, ...shown.map((issue) => h('li', {}, describeIssue(lang, issue)))),
          hidden > 0
            ? h('p', { class: 'muted' }, t(lang, 'import.errorMore', { count: hidden }))
            : null,
        ),
      );
    } else if (building && sourceName) {
      status.replaceChildren(
        h(
          'div',
          { class: 'notice notice-ok' },
          h('strong', {}, t(lang, 'import.loaded', { name: sourceName })),
          h('span', {}, building.building),
          h(
            'span',
            { class: 'muted' },
            t(lang, 'import.stats', { nodes: building.nodes.length, edges: building.edges.length }),
          ),
        ),
      );
    } else {
      status.replaceChildren();
    }
  };
}
