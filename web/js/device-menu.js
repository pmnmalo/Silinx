// The menu of a device's row (#5878, #5939): the same in the Design pane and in the Tasks interface's Implement, Emulate
// and Simulate trees, each action where it applies: New Source… and Import Source… for the device (core/source-types.js,
// a System node's in its folder, #5873), its I/O Pin Planning (an FPGA's: the project's top on its board, a System's FPGA
// node's), Check Design (the top module's Check Syntax, its whole hierarchy; a System project's row: Check System),
// Design Properties…; and its [I/O Pins] tag (Emulate's: the same I/O Pin Planning, beside the top's row's process).
import { popupMenu } from './ui.js';
import { S, app, findDoc } from './app.js';
import { deviceKind, sourceTypesOf, importsOf } from '/core/source-types.js';
import { projectNodes } from '/core/project-nodes.js';
import { isDesignOnly } from '/core/project-kind.js';
import { designState } from './state-design.js';
import { filesState } from './state-files.js';

// the open project's one implicit node (an FPGA's, a design project's), or null
const implicitNode = () => projectNodes(S.project, { files: filesState.fileTree || [], texts: designState.viewTexts || {} }).nodes.find(n => n.implicit) ?? null;
const wizard = (f, o) => () => import('./wizards.js').then(w => w[f](o));

/** Check Design: the top module's Check Syntax (disabled with no top); `system` a System project's: Check System. */
export function checkItem({ system = null } = {}) {
  if (system) return { label: 'Check System', action: async () => { const o = await import('./system-open.js'); await o.openSystem(system); findDoc(`sys:${system}`)?.checkSystem?.(); } };
  return { label: 'Check Design', disabled: !S.project?.top, action: () => S.project?.top && import('./processes.js').then(p => p.checkSyntax(S.project.top)) };
}

/** I/O Pin Planning of a device (`node`: a System's node, { id, kind, module }; else the project's), opened in `task`: its
 *  menu item, or null when the device has no pins to plan (no FPGA, no top module, a node with no module). */
function pinsItem({ node = null, task } = {}) {
  if (node) return node.kind === 'fpga' && node.module ? { label: 'I/O Pin Planning', action: () => import('./system-constraints-ui.js').then(m => m.openNodePins(node.id, { task })) } : null;
  if (deviceKind(implicitNode()) !== 'fpga' || !S.project?.top) return null;
  return { label: 'I/O Pin Planning', action: () => app.openPinPlanner(undefined, { task }) };
}

/** The items of a device's menu: `node` a System's node ({ id, kind, board }), else the project's own device; `extra` a
 *  task's own first (taskItems). */
export function deviceItems({ node = null, task, extra = [] } = {}) {
  const n = node ?? implicitNode(), kind = deviceKind(n), at = node ? node.id : null;
  return [
    ...extra, ...(extra.length ? ['-'] : []),
    sourceTypesOf(kind).length ? { label: 'New Source…', action: wizard('newSourceWizard', { node: at }) } : null,
    importsOf(kind).length ? { label: `${document.documentElement.dataset.layout === 'tasks' ? 'Import Source' : 'Add Copy of Source'}…`, action: wizard('addSourceDialog', { node: at }) } : null,
    pinsItem({ node, task }),
    node ? null : checkItem(),
    ...(node ? [] : ['-', { label: 'Design Properties…', action: wizard('projectProperties') }]),
  ].filter(Boolean);
}

// Implement's Program FPGA (its bar's before #5939: iMPACT's, opened beside; one opened before without its Program FPGA to
// run from here opened again, #1421)
async function programFpga() {
  if (!S.project) return;
  const old = findDoc('impact');
  if (old && !old.program) await app.closeDoc(old);
  await app.openImpact();
  findDoc('impact')?.program?.();
}
// Simulate's New Test Bench… (`node` a System's: in its folder, of its module)
async function newBench(node) {
  if (!node) return (await import('./tasks-sim.js')).newBench(app);
  const at = (await import('./design-system.js')).newSourcePlace('sim', node.id);
  return (await import('./tbwizard.js')).testBenchWizard({ module: node.module, location: at?.location, task: 'sim' });
}

/** A task's own items of its hierarchy's project and device rows (#5939: its bar's above the tree before): Implement's I/O
 *  Pin Planning and Program FPGA (a System's Build All and Program All), Emulate's I/O Pin Planning and Emulate (a System's
 *  Emulate System), Simulate's New Test Bench… and Import Test Bench… (a System's node's in its folder; a design project's
 *  New Test Bench… only). `pins` false: no I/O Pin Planning (a device's row has its own); `system` a System's row's. */
export function taskItems(task, { node = null, pins = true, system = false } = {}) {
  const top = S.project?.top;
  if (task === 'impl') return system
    ? [{ label: 'Build All', action: () => import('./system-implement-tree.js').then(m => m.buildAll()) }, { label: 'Program All', action: () => import('./system-implement-tree.js').then(m => m.programAll()) }]
    : [pins ? pinsItem({}) : null, { label: 'Program FPGA', action: programFpga }].filter(Boolean);
  if (task === 'emu') return system
    ? [{ label: 'Emulate System', action: () => import('./system-emulate-ui.js').then(m => m.emulateSystem()) }]
    : [pins ? pinsItem({ task: 'emu' }) : null, { label: 'Emulate', disabled: !top, action: () => top && import('./viewers.js').then(m => m.openEmulator(top)) }].filter(Boolean);
  if (task === 'sim') return [{ label: 'New Test Bench…', action: () => newBench(node) },
    isDesignOnly(S.project) ? null : { label: 'Import Test Bench…', action: wizard('addSourceDialog', { role: 'sim', title: 'Import Test Bench', node: node?.id ?? null }) }].filter(Boolean);
  return [];
}

/** A System's row's menu in a task's tree (`task`): the task's own items. */
export function systemTaskMenu(e, task) {
  e.preventDefault?.();
  popupMenu(taskItems(task, { system: true }), e.clientX, e.clientY);
}

/** A device's menu (`e` its row's contextmenu event). */
export function deviceMenu(e, opts) {
  e.preventDefault?.();
  popupMenu(deviceItems(opts), e.clientX, e.clientY);
}

/** The [I/O Pins] tag of a device's row (Emulate's, #5878), or none: a device with no pins to plan. */
export function pinsTags(opts) {
  const it = pinsItem(opts);
  return it ? [{ id: 'pins', text: 'I/O Pins', title: 'I/O Pin Planning', run: it.action }] : [];
}

