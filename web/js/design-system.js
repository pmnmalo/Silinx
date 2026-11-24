// The Design pane's row of a System project's System (#4700, docs/SYSTEMS.md): the project's one System document
// (.sys.json), its top, shown as `<name> [System]` in place of the device, the FPGA nodes' modules under it (their rows
// as any module's) and the project's other rows after them. Its text is read with the project's drawings
// (project.js's viewTexts).
import { S } from './app.js';
import { designState } from './state-design.js';
import { filesState } from './state-files.js';
import { SYSTEM_KIND } from '/core/project-kind.js';
import { systemsOn } from '/core/build-channel.js';
import { isSystemFile, readSystem } from '/core/system-doc.js';
import { openSystem, systemContextMenu } from './system-open.js';

/** Whether the project open is a System project (and Systems are on in this build, #5202). */
export const systemProject = () => S.project?.kind === SYSTEM_KIND && systemsOn();
/** The System project's System document (its path), or null. */
const systemFile = () => (filesState.fileTree || []).find(isSystemFile) || null;

/** The System's row (`treeItem`, design.js's) and its FPGA nodes' modules: { item, modules }, or null (no System). */
export function systemRow(treeItem, select) {
  const f = systemFile();
  if (!f) return null;
  const sys = readSystem(designState.viewTexts?.[f] || '').system;
  const menu = e => systemContextMenu(e, f);
  const item = treeItem({ label: sys?.name || f.split('/').pop(), ico: 'system', open: true, key: `sys:${f}`, cls: 'top-mod',
    badges: [{ text: 'System', base: true, title: 'Open', open: () => openSystem(f), context: menu }],
    onSelect: () => select({ type: 'file', file: f }), onOpen: () => openSystem(f), onContext: menu });
  return { item, modules: sys ? [...new Set(sys.nodes.filter(n => n.kind === 'fpga' && n.module).map(n => String(n.module)))] : [] };
}
