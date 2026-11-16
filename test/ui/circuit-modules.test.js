// UI: a digital circuit is one module of the project (#4216): a 7-segment assembly (a 7447) and an older circuit (the
// half adder of a 7486 and a 7408), each one row of the Design pane, no row of its ICs' modules (in its generated HDL),
// in the Implementation and the Simulation view (the ISE interface's switch); the Test Bench's Associate Source lists
// the circuits, not their ICs. No warnings. Both interfaces.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject } from './harness.js';
import { pickSourceType, waitNewSourcePage } from './new-source-helpers.js';
import { circuitTemplate } from '../../core/circuit-templates.js';
import { halfAdder } from '../circuit-helpers.mjs';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;
const rows = (page) => page.eval(() => [...document.querySelectorAll('#hier .row')].map((r) => r.querySelector('.lbl').textContent));
const view = async (page, v) => { await page.click(`input[name=view][value=${v}]`); await page.waitFor((x) => window.Silinx.view === x, [v]); };

uiTest('#4216 a circuit one row of the Design pane, its ICs none; the Test Bench\'s Associate Source the circuits only', E, async (page) => {
  await makeProject(env, { name: 'CircMods', top: '', files: {
    'src/disp.circ.json': JSON.stringify(circuitTemplate('seg7', { display: 'ca' }, { name: 'disp' }), null, 2),
    'src/half_adder.circ.json': JSON.stringify(halfAdder(), null, 2) } });
  await page.setViewport(1440, 900);
  await page.openProject('CircMods');
  await page.waitFor(() => ['src/disp.vhd', 'src/half_adder.vhd'].every((f) => window.Silinx.fileTree.includes(f)), [], { what: 'their HDL' });
  await page.waitFor(() => [...document.querySelectorAll('#hier .row .lbl')].some((l) => l.textContent === 'half_adder'), [], { what: 'the rows' });
  const want = ['CircMods', 'xc3s250e-4-cp132', 'disp', 'half_adder'];
  assert.deepEqual(await rows(page), want);
  // (the Simulation view: its switch the ISE interface's)
  if (await page.eval(() => !!document.querySelector('input[name=view][value=sim]')?.offsetParent)) {
    await view(page, 'sim');
    await page.waitFor(() => [...document.querySelectorAll('#hier .row .lbl')].some((l) => l.textContent === 'Behavioral'), [], { what: 'the Simulation view' });
    assert.deepEqual(await rows(page), ['CircMods', 'Behavioral', 'disp', 'half_adder']);
    await view(page, 'impl');
  }
  assert.deepEqual((await rows(page)).filter((r) => /sn74/.test(r)), []);
  // the Test Bench's module to test: the circuits
  await page.menu('Project', 'New Source…');
  await page.waitDialog('New Source');
  await pickSourceType(page, 'Test Bench');
  await page.dialogButton('Next >');
  await waitNewSourcePage(page, 'File Name and Location');
  await page.fill('.dlg-overlay .wiz-main input[type=text]', 'tb_disp');
  await page.dialogButton('Next >');
  await waitNewSourcePage(page, 'Associate Source');
  assert.deepEqual(await page.eval(() => [...document.querySelectorAll('.dlg-overlay .src-types .st')].map((e) => e.lastChild.textContent.trim())),
    ['disp (src/disp.vhd)', 'half_adder (src/half_adder.vhd)']);
  await page.dialogButton('Cancel');
  await page.waitNoDialog();
  assert.deepEqual(page.console.filter((c) => c.type === 'warning' || c.type === 'warn' || c.type === 'error').map((c) => c.text), []);
}, { timeout: 120000 });
