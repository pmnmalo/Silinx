// The menus of the Tasks interface's hierarchy rows (#5878, web/js/task-hierarchy.js hierarchyDefs: `<task>-project`,
// `<task>-device`): the project's and the device's, as the Design pane's, the task's own items first (#5939) (web/js/design.js, web/js/device-menu.js, loaded
// when used: this module loads in Node too, as web/js/tasks.js, #4843). `menu` for a process tree, `row` for Simulate's.
import { longPressMenu } from './ui.js';

/** `defs` with the project's and the device's menus (`tags`: the device's, Emulate's [I/O Pins]). Returns `defs`. */
export function withMenus(defs, task, { tags = [] } = {}) {
  for (const d of defs) {
    // (each the task's own items first, its bar's before #5939: web/js/device-menu.js taskItems)
    if (d.id === `${task}-project`) d.menu = e => Promise.all([import('./design.js'), import('./device-menu.js')]).then(([m, dm]) => m.projectContextMenu(e, dm.taskItems(task)));
    else if (d.id === `${task}-device`) {
      d.menu = e => import('./device-menu.js').then(m => m.deviceMenu(e, { task: task === 'emu' ? 'emu' : undefined, extra: m.taskItems(task, { pins: false }) }));
      if (tags.length) d.tags = tags;
    } else continue;
    d.row = r => { r.addEventListener('contextmenu', e => { e.preventDefault(); d.menu(e); }); longPressMenu(r); };
    withMenus(d.children || [], task, { tags });
  }
  return defs;
}
