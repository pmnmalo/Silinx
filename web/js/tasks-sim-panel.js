// Simulate's side panel with nothing simulated yet (#1376), under a Simulation tab as SSim's own, the page beside it
// (web/css/tasks.css):
// - under the project and its device (none in a Circuit project), as the Design pane shows them (#5789,
//   web/js/task-hierarchy.js), the project's test benches, a row each: one clicked is simulated (#1378); its objects under
//   it (its unit under test, their submodules, what it instantiates; no source's badge);
// - with none, the module to simulate and the model, each on its prompt, under the device, the simulation run once both
//   are chosen (#1378); the Test Bench Wizard is the bar's New Test Bench… (#1385); the page beside says what to do.
// A simulation open, the side panel is SSim's tree.

import { h, popupMenu } from './ui.js';
import { icon } from './icons.js';
import { benchSelect, modelSelect, promptChoices, refreshBench, simChoices, simTarget } from './tasks-sim.js';
import { benchItems, treeBar, treeItems } from './tasks-sim-tree.js';
import { mountSimPages } from './tasks-sim-files.js';
import { designState } from './state-design.js';
import { hierarchyDefs, hierarchyTree, objectsOf } from './task-hierarchy.js';
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

  // a test bench's row (simulated when clicked, its menu), its objects under it
  const bench = name => ({ label: name, ico: 'moduleTop', raw: true, li: 'task-sim-bench', data: { 'data-bench': name }, children: objectsOf(app, name), row: r => {
    r.title = `Simulate ${name}`;
    clickable(r, () => app.setTop(name, true).then(() => simulate()));   // (its twisty folds it: not a click of the row)
    r.addEventListener('contextmenu', e => { e.preventDefault(); popupMenu(benchItems(app, name), e.clientX, e.clientY); });
  } });
  const prompts = [...choices.children], folded = new Set();
  return {
    /** Its rows as the project is now (`shown`: the panel shown, else as it is). */
    refresh(shown = !panel.hidden) {
      pages.refresh();
      const S = app.S, sys = systemTree(S.project), names = S.project && !sys ? simChoices(S.project, designState.modules).benches : [];
      promptChoices(shown && !names.length && !sys);
      panel.hidden = !shown;
      choices.hidden = true;
      benches.hidden = !S.project || sys;
      system.hidden = !sys;
      refreshBench(app);
      // (drawn again when the project, its device, its test benches or their objects change; the prompts, with no test
      // bench, under the device)
      const defs = S.project && !sys ? hierarchyDefs(S.project, names.map(bench), 'sim') : [];
      const key = JSON.stringify(defs, (k, v) => (k === 'row' ? undefined : v));
      if (benches.dataset.key !== key) {
        benches.dataset.key = key;
        choices.append(...prompts);
        benches.replaceChildren(...hierarchyTree(defs, folded));
        if (defs.length && !names.length) [...benches.querySelectorAll('ul')].pop()?.append(...prompts);
      }
      const cur = S.project ? simTarget(S.project, designState.modules) : null;
      for (const li of benches.querySelectorAll('li.task-sim-bench')) li.firstChild.classList.toggle('sel', li.dataset.bench === cur);
    },
  };
}
