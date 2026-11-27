// Silinx - Copyright 2026 Pedro Maló - AGPL-3.0-only
// Open Project's list of the projects (#5785): several selected, as a file manager's list, and Delete.
//   - a click selects a project alone, Ctrl+click (Cmd+click on a Mac) adds it to the selection or takes it out,
//     Shift+click selects the projects from the last one clicked to this one; on a touch screen a long press does what
//     Ctrl+click does, and, several selected, a tap too. The keyboard: the arrows (Shift: the selection extended),
//     Ctrl/Cmd+A all of them, Delete the selection. The rows selected are .sel and aria-selected.
//   - Delete asks first, the projects named, that it cannot be undone (Cancel the default, core/project-delete.js
//     deleteQuestion); the open project is closed first, said in the console; one whose process runs, shared live or
//     followed is not deleted (why in the console). Each one deleted where it is kept (api.deleteProject: the local
//     server's workspace into its .trash with the MCP's delete_project's checks, the browser's storage, a workspace
//     folder on the disk), the console's line the MCP's.
import { api } from './api.js';
import { h, dialog } from './ui.js';
import { appLog, commandError, commandInfo } from './console.js';
import { S } from './app.js';
import { prefKey } from './prefs.js';
import { closeProject, renderStartPage } from './project.js';
import { collab, following } from './collab-state.js';
import { closedMessage, deletedMessage, deleteList, deleteQuestion, followedProblem, runningProblem, sharedProblem } from '/core/project-delete.js';
import { runState } from './state-run.js';
import { procState } from './state-proc.js';

const LONG_PRESS = 500;

/** The selection of Open Project's table `tbl`, its rows `rows` ({ tr, name }): onChange(names) after each change,
 *  onDelete(names) for the Delete key. -> { names(), set(names) } */
export function listSelection(tbl, rows, { onChange = () => {}, onDelete = () => {} } = {}) {
  let sel = new Set(), anchor = -1, cur = -1;
  const names = () => rows.filter(r => sel.has(r.name)).map(r => r.name);
  const paint = () => {
    rows.forEach((r, i) => { const on = sel.has(r.name); r.tr.classList.toggle('sel', on); r.tr.classList.toggle('cur', i === cur); r.tr.setAttribute('aria-selected', String(on)); });
    onChange(names());
  };
  const one = i => { sel = new Set([rows[i].name]); anchor = cur = i; paint(); };
  const toggle = i => { if (sel.has(rows[i].name)) sel.delete(rows[i].name); else sel.add(rows[i].name); anchor = cur = i; paint(); };
  const range = i => {
    const a = anchor < 0 ? i : anchor, [lo, hi] = [Math.min(a, i), Math.max(a, i)];
    sel = new Set(rows.slice(lo, hi + 1).map(r => r.name)); cur = i; paint();
  };
  tbl.setAttribute('tabindex', '0');
  tbl.setAttribute('aria-multiselectable', 'true');
  rows.forEach((r, i) => {
    r.tr.setAttribute('aria-selected', 'false');
    let timer = null, pressed = false, touch = false, at = null;
    r.tr.addEventListener('click', e => {
      tbl.focus({ preventScroll: true });   // (the keyboard's then: the arrows, Ctrl / Cmd+A, Delete)
      if (pressed) { pressed = false; return; }   // (a long press's click: done)
      if (e.shiftKey) range(i);
      else if (e.ctrlKey || e.metaKey || (touch && sel.size > 1)) toggle(i);
      else one(i);
    });
    // (a finger's: pointerType touch at its pointerdown, a click's own pointerType not in every browser)
    r.tr.addEventListener('pointerdown', e => {
      touch = e.pointerType === 'touch';
      clearTimeout(timer);
      if (!touch) return;
      at = { x: e.clientX, y: e.clientY };
      timer = setTimeout(() => { pressed = true; if (!sel.size && cur >= 0) sel.add(rows[cur].name); toggle(i); }, LONG_PRESS);
    });
    r.tr.addEventListener('pointermove', e => { if (at && Math.hypot(e.clientX - at.x, e.clientY - at.y) > 8) clearTimeout(timer); });
    for (const ev of ['pointerup', 'pointercancel']) r.tr.addEventListener(ev, () => { clearTimeout(timer); at = null; });
    r.tr.addEventListener('contextmenu', e => { if (touch) e.preventDefault(); });
  });
  tbl.addEventListener('keydown', e => {
    if (!rows.length) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const i = Math.max(0, Math.min(rows.length - 1, cur + (e.key === 'ArrowDown' ? 1 : -1)));
      if (e.shiftKey) range(i); else one(i);
      rows[i].tr.scrollIntoView?.({ block: 'nearest' });
    } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a') {
      e.preventDefault();
      sel = new Set(rows.map(r => r.name)); paint();
    } else if ((e.key === 'Delete' || e.key === 'Backspace') && sel.size) {
      e.preventDefault();
      onDelete(names());
    }
  });
  return { names, set: list => { sel = new Set(list); paint(); } };
}

/** Why the project `name` is not deleted now (the open one: its process, it shared or followed), or null. */
function deleteRefusal(name) {
  if (S.project?.name !== name) return null;
  if (following()) return followedProblem(name);
  if (collab.role === 'owner') return sharedProblem(name);
  if (procState.busy || runState.currentJob) return runningProblem(name);
  return null;
}

// what this browser keeps by a deleted project's name: Recent Projects, when it was opened
function forgetProjectPrefs(name, local = globalThis.localStorage) {
  try {
    const recent = prefKey('silinx.recent'), opened = prefKey('silinx.opened');
    const r = JSON.parse(local.getItem(recent) || '[]');
    if (Array.isArray(r) && r.includes(name)) local.setItem(recent, JSON.stringify(r.filter(x => x !== name)));
    const o = JSON.parse(local.getItem(opened) || '{}');
    if (o && typeof o === 'object' && name in o) { delete o[name]; local.setItem(opened, JSON.stringify(o)); }
  } catch { /* not kept */ }
}

const trashKept = () => !api.standalone || !!api.keepsTrash;

/** Delete of the projects `names`, asked first: -> the names deleted ([] when cancelled or refused). */
export async function deleteProjects(names) {
  const list = deleteList(names);
  const no = list.map(deleteRefusal).find(Boolean);
  if (no) { commandInfo('Delete Project', `${no}.`); return []; }   // (a refusal: why the command does nothing, #3591)
  const open = list.includes(S.project?.name) ? S.project.name : null;
  const trash = trashKept();
  const yes = await dialog({
    title: list.length === 1 ? 'Delete Project' : 'Delete Projects', width: 480, className: 'delete-project',
    body: h('div', { class: 'msg msg-warn' }, h('div', { class: 'msg-icon' }, '!'), h('div', { class: 'msg-text' }, deleteQuestion(list, { trash, open }))),
    // (Delete the dangerous choice, Cancel the default: Enter cancels)
    buttons: [{ label: 'Delete', value: true }, { label: 'Cancel', value: false, primary: true }],
    onOpen: ({ buttons }) => buttons[0].el.classList.add('danger'),
  });
  if (!yes) return [];
  if (open) {
    await closeProject();
    if (S.project?.name === open) return [];   // (its documents' changes kept: Close Project cancelled)
    appLog(closedMessage(open), 'info');
  }
  const done = [];
  for (const name of list) {
    try { await api.deleteProject(name); } catch (e) { await commandError('Delete Project', `${name}: ${e.message}`); continue; }
    forgetProjectPrefs(name);
    appLog(deletedMessage(name, { trash }), 'ok');
    done.push(name);
  }
  if (done.length && !document.querySelector('.left-page[data-page=start]')?.hidden) renderStartPage();
  return done;
}
