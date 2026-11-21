// UI (#5111): the lock example, every kind of source in one project: New Project lists it last of the examples, in
// Portuguese too; made from it, the Design pane shows each module once, its drawing first (the schematic, the state
// diagram, the truth table, the Petri net, the ASM chart, the circuit; the C and the C++), its HDL's badge last; its
// test bench run (Simulate Behavioral Model, run all): Simulation finished OK. Both interfaces. No warnings.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest } from './harness.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;

const SEL = '.dlg-overlay .wiz-main select';
const rows = (page) => page.eval(() => [...document.querySelectorAll('#hier .row')].filter((r) => r.querySelector('.badge'))
  .map((r) => `${r.querySelector('.lbl').textContent.trim()} ${[...r.querySelectorAll('.badge')].map((b) => `[${b.textContent}${b.classList.contains('base') ? '*' : ''}]`).join(' ')}`));
const setLanguage = (page, l) => page.eval(async (x) => (await import('/js/i18n.js')).setLanguage(x), l);

uiTest('#5111 New Project from the lock example: every kind of source in the Design pane, its test bench passes; Portuguese', E, async (page) => {
  await page.menu('File', 'New Project…');
  await page.waitDialog('New Project Wizard');
  await page.dialogButton('Next >');   // (its kind: With an FPGA)
  await page.waitFor((s) => document.querySelector(s)?.options.length > 1, [SEL], { what: 'Start from' });
  const last = () => page.eval((s) => { const o = document.querySelector(s).options; return o[o.length - 1].textContent; }, SEL);
  assert.equal(await last(), 'Example: lock');
  await setLanguage(page, 'pt');
  await page.waitFor((s) => { const o = document.querySelector(s).options; return o[o.length - 1].textContent === 'Exemplo: lock'; }, [SEL], { what: 'Portuguese' });
  await setLanguage(page, 'en');
  await page.waitFor((s) => { const o = document.querySelector(s).options; return o[o.length - 1].textContent === 'Example: lock'; }, [SEL], { what: 'English again' });
  await page.fill(SEL, 'lock', { index: 0 });
  await page.fill('.dlg-overlay .wiz-main input[type=text]', 'Lock');
  await page.dialogButton('Next >');
  await page.waitFor(() => document.querySelector('.dlg-overlay .wiz-main h3')?.textContent === 'Project Settings');
  await page.dialogButton('Next >');
  await page.waitFor(() => document.querySelector('.dlg-overlay .wiz-main h3')?.textContent === 'Project Summary');
  await page.dialogButton('Finish');
  await page.waitNoDialog();
  await page.waitFor(() => window.Silinx.project?.name === 'Lock', [], { what: 'the project open' });
  await page.waitFor(() => ['top', 'control', 'lock', 'digit_ok', 'alarm', 'timer', 'sync', 'penalty', 'typed', 'debounce', 'sevenseg'].every((n) => window.SilinxApp.S.modules.some((m) => m.name === n)), [], { what: 'every module', timeout: 30000 });
  assert.deepEqual(await rows(page), ['top [VHDL*]', 'u_clear - debounce [VHDL*]', 'u_control - control [Schematic*] [VHDL]', 'u_alarm - alarm [Petri*] [FSM] [VHDL]',
    'u_check - digit_ok [Algebra*] [Schematic] [VHDL]', 'u_lock - lock [FSM*] [Schematic] [VHDL]', 'u_timer - timer [ASM*] [VHDL]', 'u_display - sevenseg [Verilog*] [VHDL]',
    'u_enter - debounce [VHDL*]', 'u_penalty - penalty [C*] [ASM] [VHDL]', 'u_sync - sync [Circuit*] [Schematic] [VHDL]', 'u_u1 - sync_sn74ls175 [VHDL*]',
    'u_core - sync_sn74ls175_core [VHDL*]', 'u_typed - typed [C++*] [ASM] [VHDL]']);
  // the test bench, Simulate Behavioral Model (longer than ISim's first run: run all)
  await page.setView('sim');
  await page.treeRow('#hier', 'tb_lock');
  await page.treeRow('#procs', 'Simulate Behavioral Model', { dbl: true, exact: true });
  await page.waitFor(() => /^isim:/.test(window.Silinx.active?.id || '') && window.Silinx.active.view && !window.Silinx.active.view.state.running, [], { timeout: 30000, what: 'ISim ready' });
  await page.fill('.doc:not([hidden]) .isim-cmdline input', 'run all');
  await page.key('Enter');
  const out = await page.waitFor(() => { const t = Array.from(document.querySelector('.doc:not([hidden]) .isim-console')?.children || [], (e) => e.textContent).join('\n'); return /^isim:/.test(window.Silinx.active?.id || '') && /Simulation finished OK|ERROR/.test(t) ? t : null; }, [], { timeout: 90000, what: 'the simulation' });
  assert.match(out, /Simulation finished OK/);
  assert.doesNotMatch(out, /ERROR|Warning/i);
  assert.doesNotMatch(await page.consoleText(), /WARNING|ERROR/);
  assert.deepEqual(page.console.filter((c) => c.type === 'warning' || c.type === 'warn').map((c) => c.text), []);
});
