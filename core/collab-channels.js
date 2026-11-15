// The channels of a shared project's owner's activity that a follower's page follows (#4002, core/collab-activity.js):
// `ui`, where the owner is (a design link's view, core/design-link.js), and `design`, the Design pane's selection and
// its expanded rows; each value as the owner makes it and as a follower takes it (untrusted input: what is not one left
// out); and the owner's activity in words, for the MCP's follow_project.
import { decodeUi } from './design-link.js';

const ROW_KEY_MAX = 300, ROWS_MAX = 2000;
const rowKey = k => typeof k === 'string' && k.length > 0 && k.length <= ROW_KEY_MAX;

/** The Design pane as the owner has it: { sel (the row selected: its key), open: [[key, expanded]] }. */
export function designActivity(selKey, treeOpen) {
  const open = [];
  for (const [k, on] of treeOpen || []) if (rowKey(k) && open.length < ROWS_MAX) open.push([k, !!on]);
  return { sel: rowKey(selKey) ? selKey : null, open };
}

/** A `design` value as a follower takes it (untrusted): { sel, open } with what is not one left out; null: not one. */
export function followedDesign(v) {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
  const open = Array.isArray(v.open) ? v.open.slice(0, ROWS_MAX).filter(e => Array.isArray(e) && rowKey(e[0])).map(([k, on]) => [k, on === true]) : [];
  return { sel: rowKey(v.sel) ? v.sel : null, open };
}

/** A `ui` value (a design link's view, encodeUi's text) as a follower takes it: decodeUi's { view, layout, dropped };
 *  null: not one. */
export function followedUi(v) {
  try { return typeof v === 'string' ? decodeUi(v) : null; } catch { return null; }
}

/** The owner's activity in words (the MCP's follow_project): its view, documents and selection; [] when none. */
export function activityLines(get) {
  const ui = followedUi(get('ui')), design = followedDesign(get('design'));
  const out = [];
  if (ui) {
    const v = ui.view, l = ui.layout;
    const where = [l ? `the ${TASK_NAMES[l.task]} task` : null, v.view ? `the ${v.view === 'sim' ? 'Simulation' : 'Implementation'} view` : null, v.page ? `the ${v.page} page` : null].filter(Boolean);
    if (where.length) out.push(`The owner is in ${where.join(', ')}.`);
    out.push(v.open.length ? `Their open documents: ${v.open.map(k => (k === v.active ? `${k} (in front)` : k)).join(', ')}.` : 'They have no document open.');
  }
  if (design?.sel) out.push(`Selected in their Design pane: ${design.sel}.`);
  return out;
}
const TASK_NAMES = { edit: 'Design', sim: 'Simulate', emu: 'Emulate', impl: 'Implement' };
