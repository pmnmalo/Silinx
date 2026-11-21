// Silinx Project Navigator - the implemented design's documents: View Implemented Design (FPGA) and its selection kept in
// step with the Design pane's, the Design Summary, I/O Pin Planning, iMPACT (moved from web/js/app.js as they were, #4765).
import { api } from './api.js';
import { confirmDlg } from './ui.js';
import { openOnlyDevice } from '/packages/silinx-fpga/src/parts.js';
import { commandError, commandInfo, commandWarning } from './console.js';
import { FLOW_UP_TO, runImpl } from './implement.js';
import { projectTool } from './processes.js';
import { S, activateDoc, closeDoc, findDoc, instancesOf, moduleInfo, openDoc } from './app.js';
import { panes } from './state-panes.js';
import { docsState } from './state-docs.js';
import { procState } from './state-proc.js';

// ---- View Implemented Design (FPGA): web/js/fpgaview.js over the XDL of the routed design
// The hierarchy paths of the design as XST names them ('Inst_data/u1', from the top's instance
// labels) -> entity / module name, for the legend of the view.
function hierarchyEntities(top) {
  const out = new Map();
  const walk = (modName, prefix, depth) => {
    const info = moduleInfo(modName);
    if (!info || depth > 30) return;
    for (const k of instancesOf(info.mod)) {
      const p = prefix ? `${prefix}/${k.name}` : k.name;
      out.set(p.toLowerCase(), k.module);
      walk(k.module, p, depth + 1);
    }
  };
  if (top) walk(top, '', 0);
  return out;
}
export async function openFpgaView(mod = S.project?.top) {
  if (!S.project || !mod) return;
  const title = 'View Implemented Design (FPGA)';
  let m = await api.fpgaView(S.project.name).catch(e => ({ available: false, reason: 'error', error: e.message }));
  if (!m.available) {
    if (m.reason === 'error') { commandError(title, m.error); return; }
    if (m.reason === 'no-top') { commandInfo(title, 'Set the top module of the project first.'); return; }
    // placed and routed and up to date: only the XDL export; otherwise the flow up to Place & Route first
    const routed = m.reason !== 'no-ncd' && ['ok', 'warn'].includes(procState.status.par);
    if (!routed && !await confirmDlg(title, 'The FPGA view shows the design after Place & Route. Run Implement Design (Synthesize, Translate, Map, Place & Route) now?')) return;
    if (!await runImpl(mod, routed ? ['fpgaview'] : [...FLOW_UP_TO.par, 'fpgaview'])) return;
    m = await api.fpgaView(S.project.name).catch(e => ({ available: false, error: e.message }));
    if (!m.available) { commandError(title, `The implemented design could not be read${m.error ? `: ${m.error}` : ''}.`); return; }
  }
  const { mountFpgaView } = await import('./fpgaview.js');
  const old = findDoc('fpgaview');
  if (old) await closeDoc(old);
  const top = S.project.top;
  openDoc({ id: 'fpgaview', title: `FPGA (${top})`, icon: 'chip', printFit: 'page', tooltip: `${title}: ${m.device.part}`,
    create: el => {
      const view = mountFpgaView(el, { model: m, top, entities: hierarchyEntities(top), stale: procState.status.par === 'stale',
        onSelectModule: path => selectHierarchyPath(path) });
      return { view, destroy: () => view.destroy() };
    } });
  syncFpgaView(panes.sel);
}
// stage 4: the Design hierarchy and the FPGA view select each other's modules
export function syncFpgaView(sel) {
  const v = findDoc('fpgaview')?.view;
  if (!v || panes.fpgaSyncing) return;
  const top = S.project?.top;
  if (sel?.type !== 'module' || !sel.path) return;
  const [root, ...rest] = sel.path.split('/');
  if (root !== top) return;
  v.highlightModule(rest.length ? rest.join('/') : null);
}
function selectHierarchyPath(path) {
  const top = S.project?.top;
  if (!top) return;
  const want = `m:${top}${path ? `/${path}` : ''}`.toLowerCase();
  const row = [...document.querySelectorAll('#hier .row[data-key^="m:"]')].find(r => r.dataset.key.toLowerCase() === want);
  if (!row) return;
  // show it: expand its ancestors
  for (let ul = row.parentElement.parentElement; ul && ul.id !== 'hier'; ul = ul.parentElement) if (ul.tagName === 'UL' && ul.hidden) { ul.hidden = false; const tw = ul.previousElementSibling?.querySelector('.twisty'); if (tw) tw.textContent = '▾'; }
  panes.fpgaSyncing = true;
  try { row.click(); } finally { panes.fpgaSyncing = false; }
  row.scrollIntoView({ block: 'nearest' });
}

// wanted: asked again once summary.js is loaded (its first load may take a while: #4021), the summary opened only if
// it still is (the Tasks layout's Implement brought forward: still in front); resolved once the summary is drawn with the
// reports as they are now (#4287: not its drawing of before, from the project's opening)
export async function openSummary({ background = false, wanted } = {}) {
  const was = docsState.active;
  const { mountSummary } = await import('./summary.js');
  if (wanted && !wanted()) return;
  // another document brought to the front meanwhile (by the user, or the project's opened with it): it stays in front,
  // the summary opened behind it, not over it (#4021: over the UCF just opened, a simulation just started)
  const keep = docsState.active && docsState.active !== was && docsState.active.id !== 'summary' ? docsState.active : null;
  const old = findDoc('summary');
  if (keep && old) { await old.refresh?.(); return; }
  const d = openDoc({ id: 'summary', title: 'Design Summary', icon: 'summary', background: background || !!keep, create: el => mountSummary(el) });
  const drawn = d.refresh?.();
  if (keep && docsState.docs.includes(keep)) activateDoc(keep);
  await drawn;
}
export function refreshSummary() { const d = findDoc('summary'); d?.refresh?.(); }

export async function openPinPlanner(mod) {
  const { mountPinPlanner } = await import('./pinplanner.js');
  const top = mod || S.project.top;
  if (!top) { commandWarning('I/O Pin Planning', 'Select a top-level module first.'); return; }
  const old = findDoc('pins');
  if (old) await closeDoc(old);
  openDoc({ id: 'pins', title: 'I/O Pin Planning', icon: 'pins', create: (el, d) => mountPinPlanner(el, d, top) });
}

export async function openImpact() {
  const { mountImpact } = await import('./impact.js');
  // (an open family's: its page, titled by its flow's programming (the iCE40's Program Flash, the ECP5's Program FPGA), no
  // iMPACT, #2298)
  openDoc({ id: 'impact', title: openOnlyDevice(S.project?.device) ? projectTool().program?.title || 'iMPACT' : 'iMPACT', icon: 'impact', create: (el, d) => mountImpact(el, d) });
}
