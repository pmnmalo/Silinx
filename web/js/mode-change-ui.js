// Silinx - Project ▸ Change Mode… (#5755, roadmap #5753): the project's mode changed by the plan the MCP's set_design_properties mode makes
// (core/mode-change.js). The three modes as New Project's cards (web/js/project-kind-step.js), the project's checked; below
// them what the change does, as it is chosen: going up, what is done (nothing lost; Circuit → Board's board to choose);
// going down, a warning with each thing lost (System down: the node kept, to choose); a refusal disables Change Mode.
// Done: the files moved into the node's folder, the drawings' HDL paths followed, the System document written, the
// project saved and opened again, each line in the console (a loss a WARNING). A version is kept first (#5740: its label).
import { MODES, modeOf, modeOn } from '/core/project-mode.js';
import { modeChange, modeChangeText, relinked } from '/core/mode-change.js';
import { isSystemFile, readSystem } from '/core/system-doc.js';
import { VIEW_RE } from '/core/view-hdl.js';
import { SYSTEMS_OFF } from '/core/build-channel.js';
import { art } from './project-kind-step.js';
import { boardOptions } from './device-picker.js';
import { filesState } from './state-files.js';
import { designState } from './state-design.js';
import { api } from './api.js';
import { S, app } from './app.js';
import { dialog, h } from './ui.js';
import { appLog } from './console.js';

// the project's files, its System document's text, the paths its drawings generate
async function context() {
  const files = (filesState.fileTree || []).filter(f => !/^build\//.test(f));
  const sys = files.find(isSystemFile);
  const texts = sys ? { [sys]: await api.readFile(S.project.name, sys).catch(() => '') } : {};
  return { files, texts, generated: Object.keys(designState.hdlToSch || {}) };
}

/** The plan done on the project (`name`): its files moved, its drawings' HDL paths followed, its System written, its
 *  silinx.json saved; the project opened again. */
async function apply(name, plan) {
  for (const m of plan.moves) await api.renameFile(name, m.from, m.to);
  if (plan.relink) {
    for (const f of ((await api.project(name)).fileTree || []).filter(x => VIEW_RE.test(x))) {
      const text = relinked(f, await api.readFile(name, f).catch(() => ''), plan.moves);
      if (text != null) await api.writeFile(name, f, text);
    }
  }
  if (plan.write) await api.writeFile(name, plan.write.path, plan.write.text);
  await api.saveProject(name, plan.project);
  await app.openProject(name);
}

/** Project ▸ Change Mode…: the dialog, then the change. */
export async function changeModeDialog() {
  const pj = S.project;
  if (!pj) return;
  const from = modeOf(pj), ctx = await context();
  const { constraintsExtOf } = await import('/packages/silinx-fpga/src/parts.js');
  const db = S.devices || (S.devices = await api.devices().catch(() => null));
  let to = from;
  // (System down: the FPGA and design nodes, one kept)
  const sys = Object.values(ctx.texts)[0];
  const nodes = sys ? (readSystem(sys).system?.nodes ?? []).filter(n => n.kind === 'fpga' || n.kind === 'design') : [];
  const boardSel = h('select', {}, ...(db ? boardOptions(db) : [['', 'None Specified']]).map(([v, l]) => h('option', { value: v }, l)));
  const keepSel = h('select', {}, ...nodes.map(n => h('option', { value: n.id }, `${n.id} (${n.kind}${n.board ? `, ${n.board}` : ''})`)));
  const boardRow = h('div', { class: 'form-grid mode-board' }, h('label', {}, 'Evaluation Development Board:'), boardSel);
  const keepRow = h('div', { class: 'form-grid mode-keep' }, h('label', {}, 'Node Kept:'), keepSel);
  const note = h('div', { class: 'hint mode-note' });
  const buttons = [{ label: 'Change Mode', value: true, primary: true, disabled: true }, { label: 'Cancel', value: null }];
  const plan = () => {
    const b = boardSel.value ? db?.boards.find(x => x.id === boardSel.value) : null;
    return modeChange(pj, to, { ...ctx, board: b?.id ?? null, device: b ? { ...b.device } : null, ext: constraintsExtOf(b ? b.device : pj.device), keep: nodes.length ? keepSel.value : null });
  };
  const show = () => {
    boardRow.style.display = from === 'circuit' && to === 'board' ? '' : 'none';
    keepRow.style.display = from === 'system' && to !== 'system' && nodes.length > 1 ? '' : 'none';
    note.replaceChildren();
    const r = to === from ? null : plan();
    note.classList.toggle('kind-refused', !!r?.error);
    note.classList.toggle('mode-down', !!r?.down);
    if (r?.error) note.append(r.error);
    else if (r?.down) note.append(h('div', {}, 'Going down loses (nothing is deleted from the disk):'), h('ul', {}, ...r.lost.map(l => h('li', {}, l))));
    else if (r) note.append(h('div', {}, 'Nothing is lost:'), h('ul', {}, ...r.done.map(l => h('li', {}, l))));
    if (buttons[0].el) buttons[0].el.disabled = !r || !!r.error;
  };
  const card = m => {
    const off = !modeOn(m.id);
    const input = h('input', { type: 'radio', name: 'project-mode', value: m.id, disabled: off, checked: m.id === from });
    input.addEventListener('change', () => { if (input.checked) { to = m.id; show(); } });
    return h('label', { class: `kind-card${off ? ' off' : ''}`, 'data-mode': m.id }, input, art(m.id),
      h('div', { class: 'kind-text' }, h('div', { class: 'kind-name' }, m.label), h('div', { class: 'kind-about' }, m.about),
        off ? h('div', { class: 'kind-not-yet' }, SYSTEMS_OFF) : null));
  };
  boardSel.addEventListener('change', show);
  keepSel.addEventListener('change', show);
  const body = h('div', {}, h('div', { class: 'hint' }, 'Choose the project\'s mode.'),
    h('div', { class: 'kind-cards', role: 'radiogroup' }, ...MODES.map(card)), boardRow, keepRow, note);
  show();
  const ok = await dialog({ title: 'Change Mode', body, width: 600, buttons, onOpen: show });
  if (!ok) return;
  const r = plan();
  if (r.error) return;
  await apply(pj.name, r);
  // (Circuit → Board with a board: its constraints from the board's pins, as Design Properties writes them)
  const board = from === 'circuit' && r.project.board ? app.projectBoard() : null;
  if (board && r.project.top) await app.regenerateUcf(board);
  for (const line of modeChangeText(pj.name, to, r).split('\n')) appLog(line.trim(), line.startsWith('WARNING') ? 'warn' : 'info');
}
