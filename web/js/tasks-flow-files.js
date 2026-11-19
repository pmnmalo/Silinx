// Silinx - Copyright 2026 Pedro Maló - AGPL-3.0-only
// Implement's and Emulate's Files page (#4609): a tab beside the task's own (Implementation, Emulate), as Simulate's Files
// beside Simulation (#1395, web/js/tasks-sim-files.js), listing the files of that flow beside the design (#4622; the
// sources are the Design page's): the project's constraints and the memory images (core/flow-files.js). A double-click
// opens a file, its menu is the file's. The page in front is the same in both tasks. The ISE style interface has none:
// its Implementation view lists them under the top (#4591).

import { h } from './ui.js';
import { icon, icons } from './icons.js';
import { designKind } from './project-kind-flag.js';
import { flowFiles } from '../../core/flow-files.js';

let page = 'procs';   // ('procs': the task's processes; 'files')
let app = null;

/** The Files tab in `tabs` (#left-tabs: after Implement's and Emulate's, the same page; its lists the panels' .task-flow-files). */
export function mountFlowFiles(a, { tabs }) {
  app = a;
  const tab = h('div', { id: 'task-flow-files-tab', class: 'tab', role: 'tab', 'data-flow-page': 'files', title: 'Files' },
    h('span', { class: 'ico-inline tab-ico', html: icons.mFiles }), h('span', { class: 'tab-lbl' }, 'Files'));
  tabs.append(tab);
  for (const t of [...tabs.querySelectorAll('#task-procs-tab, #task-emu-tab')]) t.dataset.flowPage = 'procs';
  tabs.addEventListener('click', e => { const t = e.target.closest('.tab[data-flow-page]'); if (t) show(t.dataset.flowPage); });
  apply();
}

function show(to) { page = to; apply(); }
// (the page in front: #left's data-flow-page, web/css/tasks.css)
function apply() {
  if (designKind() && page === 'files') page = 'procs';
  const tab = document.getElementById('task-flow-files-tab');
  if (tab) tab.hidden = designKind();
  for (const t of document.querySelectorAll('#left-tabs .tab[data-flow-page]')) t.classList.toggle('flow-front', t.dataset.flowPage === page);
  document.getElementById('left').dataset.flowPage = page;
  renderFlowFiles();
}

/** The Files page drawn again (the project's files changed): web/js/design.js's renderHierarchy calls it. */
export function renderFlowFiles() {
  const S = app?.S;
  for (const ul of document.querySelectorAll('.task-flow-files')) {
    const files = S?.project ? flowFiles(S.project, S.fileTree || []) : [];
    const key = files.map(f => f.path).join();
    if (ul.dataset.key === key && ul.childElementCount === files.length) continue;
    ul.dataset.key = key;
    ul.replaceChildren(...files.map(({ path, kind }) => {
      const row = h('div', { class: 'row', 'data-file': path, 'data-kind': kind }, h('span', { class: 'twisty' }), icon(kind === 'constraints' ? 'ucf' : 'file'),
        h('span', { class: 'lbl', 'data-no-i18n': '' }, path.split('/').pop()), h('span', { class: 'meta', 'data-no-i18n': '' }, `(${path})`));
      row.addEventListener('click', () => { for (const r of ul.querySelectorAll('.row.sel')) r.classList.remove('sel'); row.classList.add('sel'); });
      row.addEventListener('dblclick', () => open(path));
      row.addEventListener('contextmenu', e => { e.preventDefault(); row.click(); menu(e, path); });
      return h('li', {}, row);
    }));
  }
}
const open = path => app.openFile(path);
const menu = (e, path) => import('./design.js').then(d => d.fileContextMenu(e, path));
