// Simulate's side panel with nothing simulated yet (#1376), under a Simulation tab as SSim's own, the page beside it
// (web/css/tasks.css):
// - the project's test benches, a row each, as SSim's tree: one clicked is simulated (#1378);
// - with none, the module to simulate and the model, each on its prompt, the simulation run once both are chosen
//   (#1378); the Test Bench Wizard is the bar's New Test Bench… (#1385).
// A simulation open, the side panel is SSim's tree.

import { h, popupMenu } from './ui.js';
import { icon } from './icons.js';
import { benchSelect, modelSelect, promptChoices, refreshBench, simChoices, simTarget } from './tasks-sim.js';
import { benchItems, treeBar, treeItems } from './tasks-sim-tree.js';
import { mountSimPages } from './tasks-sim-files.js';
import { designState } from './state-design.js';
import { isSystemProject } from '../../core/project-kind.js';   // (relative: tasks.js loads in Node too, #4843)
import { systemsOn } from '../../core/build-channel.js';

/** The panel, appended to the work area: `simulate` runs the test bench chosen. */
// (a System project's tree in place of the test benches, #5581: its System the top)
export const systemTree = pj => !!pj && isSystemProject(pj) && systemsOn() && !pj.top;

export function mountSimPanel(app, { simulate }) {
  const row = (cls, ico, ...kids) => h('li', {}, h('div', { class: `row ${cls}` }, h('span', { class: 'twisty' }), icon(ico), ...kids));
  const clickable = (r, run) => {
    r.tabIndex = 0;
    r.setAttribute('role', 'button');
    r.addEventListener('click', run);
    r.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); run(); } });
  };
  const choices = h('ul', { class: 'tree task-sim-choices' },
    row('task-sim-choice', 'moduleTop', benchSelect(app)), row('task-sim-choice', 'wave', modelSelect(app)));
  const benches = h('ul', { class: 'tree task-sim-benches' });
  // (a System project's: its System's and its nodes' tree, #5581: web/js/system-simulate-ui.js, drawn by processes.js)
  const system = h('div', { class: 'task-sim-system', hidden: true });
  // (its commands above it, a test bench's menu and the empty space's, as Design's: #1385)
  const tabs = h('div', { class: 'task-sim-tabs', role: 'tablist' }, h('span', { class: 'tab active', role: 'tab' }, h('span', { class: 'tab-lbl' }, 'Simulation')));
  const tree = [treeBar(app), h('div', { class: 'task-sim-trees' }, choices, benches, system)];
  const panel = h('div', { id: 'task-sim-panel', hidden: true }, tabs, ...tree);
  const pages = mountSimPages(app, tabs, tree);   // (and the Files page, #1395)
  panel.addEventListener('contextmenu', e => {
    if (e.defaultPrevented || !e.target.closest('.task-sim-trees') || e.target.closest('.row')) return;
    e.preventDefault();
    popupMenu(treeItems(app), e.clientX, e.clientY);
  });
  document.getElementById('workspace').append(panel);

  const bench = name => {
    const li = h('li', { class: 'task-sim-bench', 'data-bench': name });
    const r = h('div', { class: 'row', title: `Simulate ${name}` }, h('span', { class: 'twisty' }, '▸'), icon('moduleTop'), h('span', { class: 'lbl', 'data-no-i18n': '' }, name));
    clickable(r, () => app.setTop(name, true).then(() => simulate()));
    r.addEventListener('contextmenu', e => { e.preventDefault(); popupMenu(benchItems(app, name), e.clientX, e.clientY); });
    li.append(r);
    return li;
  };
  return {
    /** Its rows as the project is now (`shown`: the panel shown, else as it is). */
    refresh(shown = !panel.hidden) {
      pages.refresh();
      const S = app.S, sys = systemTree(S.project), names = S.project && !sys ? simChoices(S.project, designState.modules).benches : [];
      promptChoices(shown && !names.length && !sys);
      panel.hidden = !shown;
      choices.hidden = !!names.length || sys;
      benches.hidden = !names.length;
      system.hidden = !sys;
      refreshBench(app);
      if (benches.dataset.key !== names.join()) { benches.dataset.key = names.join(); benches.replaceChildren(...names.map(bench)); }
      const cur = S.project ? simTarget(S.project, designState.modules) : null;
      for (const li of benches.children) li.firstChild.classList.toggle('sel', li.dataset.bench === cur);
    },
  };
}
