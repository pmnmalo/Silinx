// UI: the main toolbar's buttons (#5114, web/js/menus.js setupToolbar): the ISE style interface's without New ASM State
// Diagram, its Emulate Behavioral Model (RTL) between Simulate Behavioral Model and Configure Target Device (the Processes
// pane's process: the top module's Board Emulator), disabled with no project, hidden in a design and simulation project,
// in Portuguese; the Silinx interface's toolbar as it was. Both interfaces.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject } from './harness.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;

// the toolbar's own buttons shown, in order (a project's live sharing adds one of its own)
const buttons = page => page.eval(() => [...document.querySelectorAll('#toolbar .tb-btn[data-cmd]')].filter(b => !b.hidden && getComputedStyle(b).display !== 'none').map(b => b.dataset.cmd));
const emulate = page => page.eval(() => { const b = document.querySelector('#toolbar .tb-btn[data-cmd=board]'); return b && { title: b.title, disabled: b.disabled, hidden: b.hidden }; });

uiTest('#5114 the ISE style toolbar: no New ASM State Diagram, Emulate Behavioral Model between Simulate and Configure Target Device; the Silinx toolbar unchanged', E, async (page) => {
  const silinx = await page.eval(() => document.documentElement.dataset.ui === 'silinx');
  assert.equal(await page.eval(() => document.querySelector('#toolbar .tb-btn[data-cmd=asm]')), null, 'no New ASM State Diagram button');
  // (no project: disabled)
  assert.deepEqual(await emulate(page), { title: 'Emulate Behavioral Model (RTL)', disabled: true, hidden: false });
  await makeProject(env, { name: 'TbEmu', template: 'blinky' });
  await page.openProject('TbEmu');
  await page.waitFor(() => window.SilinxApp.S.project?.top && !document.querySelector('#toolbar .tb-btn[data-cmd=board]').disabled, [], { what: 'Emulate on with a top module' });
  if (silinx) {
    // (the Silinx interface: its buttons and its design flow's steps as they were, the emulator's its Emulate step)
    assert.deepEqual(await buttons(page), ['newProject', 'open', 'closeProject', 'share', 'print', 'undo', 'redo', 'cut', 'copy', 'paste', 'find']);
    assert.deepEqual(await page.eval(() => [...document.querySelectorAll('#toolbar .m-step')].filter(b => !b.hidden).map(b => b.dataset.step)), ['check', 'simulate', 'implement', 'emulate', 'program']);
    return;
  }
  assert.deepEqual(await buttons(page), ['newProject', 'open', 'closeProject', 'share', 'print', 'undo', 'redo', 'cut', 'copy', 'paste', 'find',
    'run', 'stop', 'wave', 'board', 'impact', 'gear', 'help']);
  // its tooltip in Portuguese, the process's
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('pt'));
  await page.waitFor(() => document.querySelector('#toolbar .tb-btn[data-cmd=board]').title === 'Emular Modelo Comportamental (RTL)', [], { what: 'Emular Modelo Comportamental (RTL)' });
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('en'));
  await page.waitFor(() => document.querySelector('#toolbar .tb-btn[data-cmd=board]').title === 'Emulate Behavioral Model (RTL)', [], { what: 'back in English' });
  // the click: the top module's Board Emulator, as the process
  await page.click('#toolbar .tb-btn[data-cmd=board]');
  await page.waitFor(() => window.SilinxApp.S.active?.id === 'emulator', [], { what: 'the Board Emulator opened' });
  assert.equal(await page.eval(() => window.SilinxApp.S.active.title), 'Board Emulator (top)');
  const lines = (await page.consoleText()).split('\n').filter(l => /WARNING|ERROR/.test(l));
  assert.deepEqual(lines, [], 'no warnings');
});

uiTest('#5114 a design and simulation project: no Emulate button (no board), as Implement and Configure Target Device', E, async (page) => {
  await makeProject(env, { name: 'TbEmuDrawn', kind: 'design' });
  await page.openProject('TbEmuDrawn');
  await page.waitFor(() => document.documentElement.dataset.projectKind === 'design', [], { what: 'the design project open' });
  assert.equal((await emulate(page)).hidden, true);
  assert.ok(!(await buttons(page)).some(c => ['board', 'run', 'impact'].includes(c)));
});
