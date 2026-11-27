// UI: Open Project's list (#5785): several projects selected, as a file manager's list (Ctrl / Cmd+click, Shift+click,
// the arrows, Shift+arrows, Ctrl / Cmd+A, a touch's long press and then taps), Open for one project only, Delete for one
// or more. Delete asks first, the projects named, that it cannot be undone, Cancel the default (Enter cancels); then
// each project's folder goes to the workspace's .trash, its row leaves the list, the console says it in the MCP's words;
// the open project is closed first, said in the console; one whose process runs is refused, why in the console. In
// Portuguese too.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { setupUi, uiTest, makeProject } from './harness.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;

// (Cmd on a Mac, whose Ctrl+click is the right button's; CDP's modifier bits: 2 Ctrl, 4 Meta, 8 Shift)
const CTRL = process.platform === 'darwin' ? 4 : 2, SHIFT = 8;
const vhdl = (name) => `library ieee; use ieee.std_logic_1164.all;\nentity ${name} is port (x : in std_logic; y : out std_logic); end ${name};\narchitecture rtl of ${name} is begin y <= x; end rtl;\n`;
const make = (name) => makeProject(env, { name, top: 'a', files: { 'src/a.vhd': vhdl('a') } });
const there = (name) => fs.existsSync(path.join(env.server.workspace, name));
const trashed = (name) => fs.readdirSync(path.join(env.server.workspace, '.trash')).filter((n) => n.startsWith(`${name}-`)).length;
const consoleLines = async (page, re) => (await page.consoleText()).split('\n').filter((l) => re.test(l));
const warnings = async (page) => (await page.consoleText()).split('\n').filter((l) => /^(WARNING|ERROR)\b/.test(l));

async function openDialog(page) {
  await page.eval(() => { import('/js/wizards.js').then((m) => m.openProjectDialog()); });
  await page.waitDialog('Open Project');
  await page.waitFor(() => document.querySelector('.dlg .open-project-list tr[data-project]'), [], { what: 'the list' });
}
const row = (name) => `.dlg tr[data-project="${name}"] td`;
// the projects selected, the buttons (* the default, - disabled)
const state = (page) => page.eval(() => {
  const d = [...document.querySelectorAll('.dlg-overlay')].pop();
  return {
    sel: [...d.querySelectorAll('tr[data-project][aria-selected="true"]')].map((r) => r.dataset.project).sort(),
    buttons: [...d.querySelectorAll('.dlg-buttons .btn')].map((b) => `${b.textContent}${b.classList.contains('primary') ? '*' : ''}${b.disabled ? '-' : ''}`),
  };
});
const listed = (page) => page.eval(() => [...document.querySelectorAll('.dlg tr[data-project]')].map((r) => r.dataset.project).sort());
const question = (page) => page.eval(() => [...document.querySelectorAll('.dlg-overlay')].pop().querySelector('.msg-text').textContent);
const buttons = (page) => page.eval(() => [...[...document.querySelectorAll('.dlg-overlay')].pop().querySelectorAll('.dlg-buttons .btn')].map((b) => `${b.textContent}${b.classList.contains('primary') ? '*' : ''}${b.classList.contains('danger') ? '!' : ''}`));

uiTest('#5785 Open Project\'s list: one project or several (Ctrl / Cmd+click, Shift+click, the keyboard, a touch); Open for one, Delete for one or more', E, async (page) => {
  for (const n of ['sel_a', 'sel_b', 'sel_c']) await make(n);
  await openDialog(page);
  assert.equal(await page.eval(() => document.querySelector('.dlg .open-project-list').getAttribute('aria-multiselectable')), 'true');
  assert.deepEqual(await state(page), { sel: [], buttons: ['Open*-', 'Delete-', 'Cancel'] });
  await page.click(row('sel_a'));
  assert.deepEqual(await state(page), { sel: ['sel_a'], buttons: ['Open*', 'Delete', 'Cancel'] });
  await page.click(row('sel_c'), { modifiers: CTRL });
  assert.deepEqual(await state(page), { sel: ['sel_a', 'sel_c'], buttons: ['Open*-', 'Delete', 'Cancel'] });
  await page.click(row('sel_a'), { modifiers: CTRL });
  assert.deepEqual((await state(page)).sel, ['sel_c']);
  // (Shift+click: the range from the last one clicked, whatever the list's order)
  await page.click(row('sel_c'));
  const order = await page.eval(() => [...document.querySelectorAll('.dlg tr[data-project]')].map((r) => r.dataset.project));
  const i = order.indexOf('sel_c'), far = order[i === 0 ? order.length - 1 : 0];
  await page.click(row(far), { modifiers: SHIFT });
  assert.deepEqual((await state(page)).sel, order.slice(Math.min(i, order.indexOf(far)), Math.max(i, order.indexOf(far)) + 1).sort());
  // the keyboard: Ctrl / Cmd+A all, an arrow one, Shift+arrow two
  await page.click(row(order[0]));
  await page.key('a', { modifiers: CTRL });
  assert.deepEqual((await state(page)).sel, [...order].sort());
  await page.key('ArrowDown');
  assert.deepEqual((await state(page)).sel, [order[1]]);
  await page.key('ArrowDown', { modifiers: SHIFT });
  assert.deepEqual((await state(page)).sel, [order[1], order[2]].sort());
  await page.key('ArrowUp');
  assert.deepEqual((await state(page)).sel, [order[1]]);
  // a touch: a long press adds a project, a tap then toggles one (the pointer events a finger fires)
  const touch = (n, ms) => page.eval(async (name, wait) => {
    const r = document.querySelector(`.dlg tr[data-project="${name}"]`);
    const fire = (type) => r.dispatchEvent(new PointerEvent(type, { pointerType: 'touch', bubbles: true, clientX: 5, clientY: 5 }));
    fire('pointerdown'); await new Promise((d) => setTimeout(d, wait)); fire('pointerup'); r.click();
  }, n, ms);
  await touch(order[0], 700);
  assert.deepEqual((await state(page)).sel, [order[0], order[1]].sort());
  await touch(order[2], 10);
  assert.deepEqual((await state(page)).sel, [...order].slice(0, 3).sort());
  await touch(order[0], 10);
  assert.deepEqual((await state(page)).sel, [order[1], order[2]].sort());
  // Open: one project, by a double-click
  await page.dblclick(row('sel_b'));
  await page.waitNoDialog();
  await page.waitFor(() => window.Silinx.project?.name === 'sel_b', [], { what: 'sel_b open' });
  assert.deepEqual(await warnings(page), []);
});

uiTest('#5785 Delete of several projects: asked first (Cancel the default, Enter cancels), then each into the .trash, the console\'s lines; the open one closed first', E, async (page) => {
  for (const n of ['del_a', 'del_b', 'del_c']) await make(n);
  await page.openProject('del_c');
  await openDialog(page);
  await page.click(row('del_a'));
  await page.click(row('del_b'), { modifiers: CTRL });
  await page.dialogButton('Delete');
  await page.waitDialog('Delete Projects');
  // (named in the list's order: the last used first)
  const two = (await page.eval(() => [...document.querySelectorAll('.dlg tr[data-project]')].map((r) => r.dataset.project))).filter((n) => n === 'del_a' || n === 'del_b');
  assert.equal(await question(page), `Delete these 2 projects?\n'${two[0]}'\n'${two[1]}'\n\nTheir folders are moved to the workspace's .trash folder.\nThis cannot be undone.`);
  assert.deepEqual(await buttons(page), ['Delete!', 'Cancel*']);
  assert.equal(await page.eval(() => document.activeElement?.textContent), 'Cancel');
  await page.key('Enter');
  await page.waitDialog('Open Project');
  assert.ok(there('del_a') && there('del_b'));
  // asked again: Delete
  await page.dialogButton('Delete');
  await page.waitDialog('Delete Projects');
  await page.dialogButton('Delete');
  await page.waitFor(() => !document.querySelector('.dlg tr[data-project="del_b"]'), [], { what: 'the rows gone' });
  assert.equal(await page.topDialogTitle(), 'Open Project');
  assert.ok(!(await listed(page)).includes('del_a'));
  assert.deepEqual(await state(page), { sel: [], buttons: ['Open*-', 'Delete-', 'Cancel'] });
  assert.ok(!there('del_a') && !there('del_b') && trashed('del_a') === 1 && trashed('del_b') === 1);
  assert.deepEqual(await consoleLines(page, /^Project '.+' deleted/), two.map((n) => `Project '${n}' deleted (moved to the workspace's .trash folder).`));
  // the open project, by the Delete key: closed first, said
  await page.click(row('del_c'));
  await page.key('Delete');
  await page.waitDialog('Delete Project');
  assert.equal(await question(page), "Delete the project 'del_c'?\n\nIts folder is moved to the workspace's .trash folder.\n'del_c' is open: it is closed first.\nThis cannot be undone.");
  await page.dialogButton('Delete');
  await page.waitConsole(/^Project 'del_c' deleted/m);
  assert.deepEqual(await consoleLines(page, /'del_c'/), ["Project 'del_c' closed, to be deleted.", "Project 'del_c' deleted (moved to the workspace's .trash folder)."]);
  assert.equal(await page.eval(() => window.Silinx.project), null);
  assert.ok(!there('del_c') && trashed('del_c') === 1);
  await page.dialogButton('Cancel');
  await page.waitNoDialog();
  assert.deepEqual(await warnings(page), []);
});

uiTest('#5785 Delete of the open project while its process runs: refused, why in the console; nothing deleted', E, async (page) => {
  await make('del_run');
  await page.openProject('del_run');
  await openDialog(page);
  await page.click(row('del_run'));
  await page.eval(async () => { (await import('/js/state-proc.js')).procState.busy = true; });
  try {
    await page.dialogButton('Delete');
    await page.waitConsole(/^INFO: Delete Project: /m);
    assert.deepEqual(await consoleLines(page, /^INFO: Delete Project/), ["INFO: Delete Project: 'del_run' is not deleted while a process of it runs: stop it (or wait for it to finish) first."]);
    assert.equal(await page.topDialogTitle(), 'Open Project');
    assert.ok(there('del_run'));
  } finally {
    await page.eval(async () => { (await import('/js/state-proc.js')).procState.busy = false; });
  }
  await page.dialogButton('Cancel');
  await page.waitNoDialog();
});

uiTest('#5785 in Portuguese: the buttons, the question, the console\'s lines', E, async (page) => {
  await make('del_pt');
  await page.eval(async () => { (await import('/js/i18n.js')).setLanguage('pt'); });
  try {
    await page.eval(() => { import('/js/wizards.js').then((m) => m.openProjectDialog()); });
    await page.waitDialog('Abrir Projeto');
    await page.click(row('del_pt'));
    assert.deepEqual((await state(page)).buttons, ['Abrir*', 'Apagar', 'Cancelar']);
    await page.dialogButton('Apagar');
    await page.waitDialog('Apagar Projeto');
    assert.equal(await question(page), "Apagar o projeto 'del_pt'?\n\nA sua pasta é movida para a pasta .trash da área de trabalho.\nNão se pode anular.");
    assert.deepEqual(await buttons(page), ['Apagar!', 'Cancelar*']);
    await page.dialogButton('Apagar');
    await page.waitConsole(/^Projeto 'del_pt' apagado/m);
    assert.deepEqual(await consoleLines(page, /'del_pt'/), ["Projeto 'del_pt' apagado (movido para a pasta .trash da área de trabalho)."]);
    await page.dialogButton('Cancelar');
    await page.waitNoDialog();
  } finally {
    await page.eval(async () => { (await import('/js/i18n.js')).setLanguage('en'); });
  }
});
