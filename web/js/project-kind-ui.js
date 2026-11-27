// Silinx - the project's kind in New Project and Design Properties (#3780, core/project-kind.js): an FPGA project (a
// board and a device), or a design and simulation project (no board, no device, no flow, no HDL shown). New Project
// asks it on its first page (web/js/project-kind-step.js, #5041); Design Properties as its Project Kind field too (#4103), both ways: FPGA
// design (a board, or None Specified and a device) makes a design project an FPGA project, the reverse is refused while
// the project has HDL or C sources of its own (the console says which). Design Properties says what a change of kind
// does as it is chosen (#5041): the refusal and its sources, OK disabled; or what leaves the project, none deleted.
import { exampleModes } from '/core/examples.js';
import { SYSTEM_KIND, DESIGN_KIND, DESIGN_ONLY_LABEL, DESIGN_ONLY_MESSAGES, isSystemProject, newSystemKind, ownSources, toDesignProject } from '/core/project-kind.js';
import { profileChangedText, profileNote, profileOf, profileOn } from '/core/project-profile.js';
import { changeProfile } from '/core/profile-change.js';
import { filesState } from './state-files.js';
import { isSystemFile } from '/core/system-doc.js';
import { api } from './api.js';
import { S, app } from './app.js';
import { h } from './ui.js';
import { appLog, logError } from './console.js';
import { designState } from './state-design.js';

/** Design Properties' Project Kind choices: New Project's first page's (#5041), the profiles (#5440: Embedded / SoC and
 *  System a profile change, nothing converted; off in a release, #5202). */
export const KIND_OPTIONS = [[DESIGN_KIND, DESIGN_ONLY_LABEL], ['fpga', 'FPGA'], ['embedded', 'Embedded / SoC'], [SYSTEM_KIND, 'System']];
/** A Project Kind choice's profile (#5440: Digital Logic's kind design). */
const kindProfile = v => (v === DESIGN_KIND ? 'logic' : v);
/** The Project Kind choice of the project `pj`: its profile's. */
export const kindOf = pj => (profileOf(pj) === 'logic' ? DESIGN_KIND : profileOf(pj));
// the project's profile changed to `to` (core/profile-change.js), its files and its System read: { project } or { error }
const profileChange = (pj, to) => changeProfile(pj, kindProfile(to), { files: filesState.fileTree || [], texts: designState.viewTexts || {}, generated: Object.keys(designState.hdlToSch || {}) });

/**
 * Design Properties' note under its Project Kind (`kindSel`, the project `pj`): what the kind chosen does to the project,
 * or why it cannot (its HDL or C sources of its own, the console's message). Returns { el, update(), refused() }:
 * update() when the choice changes; refused() whether OK must stay disabled.
 */
export function kindNote(kindSel, pj) {
  // (the Systems' profiles where they are on, #5202: hidden in a release)
  for (const o of kindSel.options) if (!profileOn(kindProfile(o.value))) o.hidden = o.disabled = true;
  const el = h('div', { class: 'hint kind-note', style: { gridColumn: '1 / -1', marginTop: '-4px' } });
  const from = kindOf(pj);
  let refused = false;
  const update = () => {
    const to = kindSel.value;
    // (a System's profile, to or from: core/profile-change.js's refusal, the node named, #5440)
    const sys = newSystemKind(to) || newSystemKind(from);
    const r = sys && to !== from ? profileChange(pj, to) : null;
    const own = !sys && to === DESIGN_KIND && from !== DESIGN_KIND ? ownSources(pj, Object.keys(designState.hdlToSch || {})) : [];
    refused = own.length > 0 || !!r?.error;
    el.textContent = to === from ? '' : r?.error ? r.error : refused ? DESIGN_ONLY_MESSAGES.toDesign(pj.name, own)
      : newSystemKind(to) ? profileNote(to) : to === DESIGN_KIND ? DESIGN_ONLY_MESSAGES.toDesignNote : DESIGN_ONLY_MESSAGES.toFpgaNote;
    el.classList.toggle('kind-refused', refused);
    el.style.display = el.textContent ? '' : 'none';
  };
  update();
  return { el, update, refused: () => refused };
}

/**
 * Shows the fields of an FPGA project (`fpga`: the inputs of a form-grid, each after its label) only when `isDesign()`
 * says no (nor `isSystem()`, a System's profile chosen). Returns the function that applies it (called again when the
 * choice changes).
 */
export function kindFields(isDesign, fpga, isSystem = () => false) {
  const apply = () => {
    const off = isDesign() || isSystem();   // (a System's profile, #5440: its nodes name their boards)
    for (const el of fpga) for (const x of [el, el.previousElementSibling]) if (x) x.style.display = off ? 'none' : '';
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

/** New Project's Start from for the mode chosen (#4702, #5757: core/examples.js exampleModes): a System project's the
 *  System examples, a Circuit project's the Circuit examples, a Board project's the others (the test designs: a Board
 *  project's); an option hidden and disabled, the one chosen, hidden, back to Empty. */
export function syncTemplates(tplSel, mode) {
  for (const o of tplSel.options) o.hidden = o.disabled = o.value !== 'empty' && !exampleModes(o.value).includes(mode);
  if (tplSel.selectedOptions[0]?.disabled) tplSel.value = 'empty';
}

/** A new System project's System opened in its editor (#4702): its top. */
export async function openNewSystem(name) {
  const f = ((await api.project(name)).fileTree || []).find(isSystemFile);
  if (f) await app.openFile(f);
}

/** Design Properties' profile change (#5440) to a System's profile, or from one: the project's profile changed as the
 *  MCP's set_design_properties does (core/profile-change.js), its line in the console; or the refusal there. Returns
 *  whether it was changed. */
export async function applyProfile(to) {
  const pj = S.project, r = profileChange(pj, to);
  if (r.error) { logError(r.error); return false; }
  for (const k of Object.keys(pj)) if (!(k in r.project)) delete pj[k];
  Object.assign(pj, r.project);
  await app.saveProjectJson();
  await app.reloadProject();
  appLog(profileChangedText(pj.name, kindProfile(to)), 'info');
  return true;
}
