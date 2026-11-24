// Silinx - the project's kind in New Project and Design Properties (#3780, core/project-kind.js): an FPGA project (a
// board and a device), or a design and simulation project (no board, no device, no flow, no HDL shown). New Project
// asks it on its first page (web/js/project-kind-step.js, #5041); Design Properties as its Project Kind field too (#4103), both ways: FPGA
// design (a board, or None Specified and a device) makes a design project an FPGA project, the reverse is refused while
// the project has HDL or C sources of its own (the console says which). Design Properties says what a change of kind
// does as it is chosen (#5041): the refusal and its sources, OK disabled; or what leaves the project, none deleted.
import { SYSTEM_EXAMPLES, SYSTEM_KIND, DESIGN_KIND, DESIGN_ONLY_LABEL, DESIGN_ONLY_MESSAGES, ownSources, toDesignProject } from '/core/project-kind.js';
import { isSystemFile } from '/core/system-doc.js';
import { api } from './api.js';
import { HDL_TOP_TYPES } from '/core/top-types.js';
import { SYSTEM_TOP } from '/core/system-top.js';
import { S, app } from './app.js';
import { h } from './ui.js';
import { logError } from './console.js';
import { designState } from './state-design.js';

/** Design Properties' Project Kind choices: New Project's first page's (#5041); System, New Project's only (#4702). */
export const KIND_OPTIONS = [[DESIGN_KIND, DESIGN_ONLY_LABEL], ['fpga', 'FPGA'], [SYSTEM_KIND, 'System (New Project only)']];

/**
 * Design Properties' note under its Project Kind (`kindSel`, the project `pj`): what the kind chosen does to the project,
 * or why it cannot (its HDL or C sources of its own, the console's message). Returns { el, update(), refused() }:
 * update() when the choice changes; refused() whether OK must stay disabled.
 */
export function kindNote(kindSel, pj) {
  for (const o of kindSel.options) if (o.value === SYSTEM_KIND) o.disabled = true;
  const el = h('div', { class: 'hint kind-note', style: { gridColumn: '1 / -1', marginTop: '-4px' } });
  const from = pj.kind === DESIGN_KIND ? DESIGN_KIND : 'fpga';
  let refused = false;
  const update = () => {
    const to = kindSel.value;
    const own = to === DESIGN_KIND && from !== DESIGN_KIND ? ownSources(pj, Object.keys(designState.hdlToSch || {})) : [];
    refused = own.length > 0;
    el.textContent = to === from ? '' : refused ? DESIGN_ONLY_MESSAGES.toDesign(pj.name, own)
      : to === DESIGN_KIND ? DESIGN_ONLY_MESSAGES.toDesignNote : DESIGN_ONLY_MESSAGES.toFpgaNote;
    el.classList.toggle('kind-refused', refused);
    el.style.display = el.textContent ? '' : 'none';
  };
  update();
  return { el, update, refused: () => refused };
}

/**
 * Shows the fields of an FPGA project (`fpga`: the inputs of a form-grid, each after its label) only when `isDesign()`
 * says no, and a Top-Level Source Type (`topType`) without HDL nor C / C++ then (a Schematic instead). Returns the function that
 * applies it (called again when the choice changes).
 */
export function kindFields(isDesign, fpga, topType = null) {
  const apply = () => {
    const d = isDesign();
    for (const el of fpga) for (const x of [el, el.previousElementSibling]) if (x) x.style.display = d ? 'none' : '';
    if (!topType) return;
    // (no HDL nor C / C++ top: a drawing's, #4105; nor a System, a System project's, #5402)
    for (const o of topType.options) if (HDL_TOP_TYPES.includes(o.value) || o.value === SYSTEM_TOP) o.hidden = o.disabled = d;
    if (d && HDL_TOP_TYPES.includes(topType.value)) { topType.value = 'sch'; topType.dispatchEvent(new Event('change')); }
  };
  apply();
  return apply;
}

/** Design Properties' "Design and simulation only" on an FPGA project: the project made a design project, or the
 *  refusal in the console (its HDL or C sources of its own). Returns whether it was made one. */
export async function makeDesignProject(pj) {
  const r = toDesignProject(pj, Object.keys(designState.hdlToSch || {}));
  if (r.error) { logError(r.error); return false; }
  Object.assign(S.project, r.project);
  await app.saveProjectJson();
  await app.reloadProject();
  app.log(`${pj.name}: a design and simulation project now (no FPGA): no board, no constraints.`, 'info');
  return true;
}

/** New Project's settings page of a System project (#4702): what stands for the device and the flow. */
export const SYSTEM_NOTE = 'A System project has no board of its own: each FPGA node of its System names its board and pins, each microcontroller its firmware.';

/** New Project's Start from for the kind chosen (#4702): a System project's the System examples, the others' the
 *  other examples (an option hidden and disabled; the one chosen, hidden, back to Empty). */
export function syncTemplates(tplSel, system) {
  for (const o of tplSel.options) { const cx = SYSTEM_EXAMPLES.includes(o.value); o.hidden = o.disabled = o.value !== 'empty' && (system ? !cx : cx); }
  if (tplSel.selectedOptions[0]?.disabled) tplSel.value = 'empty';
}

/** A new System project's System opened in its editor (#4702): its top. */
export async function openNewSystem(name) {
  const f = ((await api.project(name)).fileTree || []).find(isSystemFile);
  if (f) await app.openFile(f);
}
