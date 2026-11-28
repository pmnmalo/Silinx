// Silinx - Copyright 2026 Pedro Maló - AGPL-3.0-only
// A System's register maps (#5288, docs/SYSTEMS.md): a map (.regs.json, core/regmap.js) opened in its editor
// (web/js/regmap-editor.js) and kept in sync with its HDL module, the FPGA's slave (the map its base, as a drawing's:
// core/view-hdl.js); its problems in the console's Errors and Warnings as it is edited, its Check's lines as the MCP
// server's check_drawing says them; its Header button the Arduino's header (core/regmap-c.js), the MCP's
// related_view header's text, written.
import { S, activateDoc, findDoc, openDoc, setDirty } from './app.js';
import { h, popupMenu } from './ui.js';
import { api } from './api.js';
import { log, logError } from './console.js';
import { editorProblems } from './editor-problems.js';
import { hdlWarning } from './design-only.js';
import { removeModule, topMenuItem, renderHierarchy } from './design.js';
import { renameDialog } from './rename.js';
import { clashItem, drawnTop, newerOnly, setViewAsTop, syncDrawingHdl } from './drawings.js';
import { following, followNotice } from './collab-state.js';
import { phoneOnly } from './phone-readonly.js';
import { designState } from './state-design.js';
import { readRegmap, writeRegmap, checkRegmap } from '/core/regmap.js';

// where the editor's Header button writes the map's header (`path`: the map's): its System's first microcontroller's
// folder (#5488, <id>/<name>.h), else firmware/<name>.h; an AXI4-Lite map's its Zynq node's ps/ (#4688: the node whose
// folder holds the map, <id>/ps/<name>.h; a Board project's ps/<name>.h)
const headerPath = async (m, path) => {
  const D = await import('./design-system.js');
  if (m.bus === 'axi') {
    const id = String(path).includes('/') ? String(path).split('/')[0] : null;
    return `${id && D.shownSystem()?.system?.nodes.some(n => n.id === id && n.kind === 'fpga') ? `${id}/` : ''}ps/${m.name}.h`;
  }
  return `${D.mcuFolder() ?? 'firmware'}/${m.name}.h`;
};

export async function openRegs(path) {
  const id = `regs:${path}`;
  if (findDoc(id)) return activateDoc(findDoc(id));
  const pj = S.project.name;
  let r;
  try { r = readRegmap(await api.readFile(pj, path)); }
  catch (e) { logError(`cannot open ${path}: ${e.message}`); return; }
  if (r.error) { logError(`cannot open ${path}: ${r.error}`); return; }
  const { mountRegmapEditor } = await import('./regmap-editor.js');
  if (S.project?.name !== pj) return;   // another project opened meanwhile: not its map (#1231)
  const name = path.split('/').pop();
  openDoc({
    id, path, title: name, icon: 'regmap',
    create(el, d) {
      const host = h('div', { class: 'doc-body' });
      el.append(host);
      const problems = editorProblems({ file: path, tool: 'Register Map', what: 'Check Register Map', goto: () => activateDoc(d) });
      const ed = mountRegmapEditor(host, {
        model: r.regmap,
        onChange: () => setDirty(d, true),
        onProblems: diags => problems.set(diags),
        onCheck: diags => problems.log(diags),
        onHeader: () => writeHeader(path, ed.getModel()),
        ...(following() ? { readOnly: true, banner: followNotice() } : { ...phoneOnly(), ...newerOnly(path, r.regmap) }),
      });
      d.regsEditor = ed;
      return {
        save: async () => {
          const text = writeRegmap(ed.getModel());
          await api.writeFile(S.project.name, path, text); setDirty(d, false);
          designState.viewTexts = { ...designState.viewTexts, [path]: text };
          syncDrawingHdl(path).catch(e => log(hdlWarning(`WARNING: HDL not synchronized: ${e.message}`, path, e.message), 'warn'));
          renderHierarchy();
        },
        destroy: () => { problems.clear(); ed.destroy?.(); },
      };
    },
  });
}

// the Arduino's header written (its node's folder's <name>.h, headerPath), the MCP's related_view header's text; a map in error: none, said why
async function writeHeader(path, m) {
  const errors = checkRegmap(m).filter(x => x.severity === 'error');
  if (errors.length) { logError(`${path.split('/').pop()}: ${errors.map(x => x.message).join('; ')}: no header written`); return; }
  const { regmapHeader } = await import('/core/regmap-c.js');
  const file = await headerPath(m, path);
  await api.writeFile(S.project.name, file, regmapHeader(m).code);
  log(`Wrote ${file}, the header of ${path.split('/').pop()}.`, 'ok');
}

/** A register map's row's menu in the Design pane. */
export function regsContextMenu(e, file) {
  popupMenu([
    { label: 'Open', action: () => openRegs(file) },
    designState.view === 'sim' ? null : topMenuItem(drawnTop(file), () => setViewAsTop(file)),
    { label: 'Rename…', action: () => renameDialog(file) },
    { label: 'Duplicate…', action: () => import('./design-duplicate.js').then(m => m.duplicateDialog(file)) },   // (#5862)
    { label: 'Remove…', command: 'Remove from Project', action: () => removeModule(file) },   // (after Duplicate, #5897)
    clashItem(file),
  ].filter(Boolean), e.clientX, e.clientY);
}
