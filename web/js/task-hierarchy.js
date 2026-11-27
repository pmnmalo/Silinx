// The hierarchy the Tasks interface's Implement, Emulate and Simulate side panels show above their own rows (#5789), as
// the Design pane shows it: the project, its device (none in a Circuit project: its drawings simulated with no board),
// then the task's own rows: Implement's and Emulate's, the top module (no source's badge) and its processes; Simulate's,
// each test bench with its objects under it (its unit under test, their submodules down the hierarchy, what the bench
// instantiates). The hierarchy's rows are names (not translated) and run nothing. The ISE style interface keeps ISE's
// own panes: its Design pane shows the hierarchy above its Processes pane, as ISE's does.
// - hierarchyDefs / topDef: process trees' rows (web/js/processes.js renderProcessTree draws them);
// - objectsOf: a module's objects, its instances down its hierarchy;
// - hierarchyTree: rows of the same shape drawn as a tree of their own (Simulate's, web/js/tasks-sim-panel.js).
import { h } from './ui.js';
import { icon } from './icons.js';
import { instancesOf, moduleInfo } from './app.js';
import { designState } from './state-design.js';
import { instanceOrder } from '/core/hier-order.js';
import { isDesignOnly } from '/core/project-kind.js';

/** A device as the Design pane names it: xc3s250e-4-cp132. */
const deviceName = d => `${d.part}${d.speed}-${d.package}`;
const row = (id, label, ico, children) => ({ id, label, ico, children, raw: true });

/** The project's row, its device's under it (none in a Circuit project), `rows` under that; `task` keeps each task's
 *  rows folded apart (their ids). */
export function hierarchyDefs(pj, rows, task) {
  const under = isDesignOnly(pj) || !pj.device?.part ? rows : [row(`${task}-device`, deviceName(pj.device), 'chip', rows)];
  return [row(`${task}-project`, pj.name, 'project', under)];
}
/** The top module `top`'s row (no source's badge), its processes `procs` under it. */
export const topDef = (top, procs, task) => row(`${task}-top`, top, 'moduleTop', procs);

/** The objects of the module `name`: its instances (`inst - module`, as the Design pane names them), each with its own
 *  under it; a circuit's parts none (#4216). */
export function objectsOf(name, depth = 0) {
  const info = moduleInfo(name);
  if (!info?.mod || depth > 30) return [];
  return instanceOrder(instancesOf(info.mod)).filter(k => !designState.partModules?.has(String(k.module).toLowerCase())).map(k => ({
    label: String(k.name).toLowerCase() !== String(k.module).toLowerCase() ? `${k.name} - ${k.module}` : k.module,
    ico: 'module', raw: true, children: objectsOf(k.module, depth + 1),
  }));
}

/** Rows ({ label, ico, children, cls, raw, row(el) }: row decorates the row drawn) drawn as a tree's items: a group
 *  folded and unfolded by its twisty (`folded`: the set of its folded labels' paths, kept across drawings). */
export function hierarchyTree(defs, folded = new Set(), path = '') {
  return defs.map(d => {
    const key = `${path}/${d.label}`, kids = d.children || [];
    const tw = h('span', { class: 'twisty' }, kids.length ? (folded.has(key) ? '▸' : '▾') : '');
    const r = h('div', { class: `row${d.cls ? ` ${d.cls}` : ''}` }, tw, icon(d.ico), h('span', { class: 'lbl', ...(d.raw ? { 'data-no-i18n': '' } : {}) }, d.label));
    const sub = h('ul', { hidden: folded.has(key) }, ...hierarchyTree(kids, folded, key));
    tw.addEventListener('click', e => {
      e.stopPropagation();
      if (folded.has(key)) folded.delete(key); else folded.add(key);
      sub.hidden = folded.has(key);
      tw.textContent = sub.hidden ? '▸' : '▾';
    });
    d.row?.(r);
    return h('li', { class: d.li || null, ...(d.data || {}) }, r, sub);   // (its list even empty: rows may be put in it)
  });
}
