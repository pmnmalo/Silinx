// UI: the Errors / Warnings tabs' entries with their file and line, a click taking there (#4746). A simulation's
// assertions (VHDL's `severity error`, `severity warning`) listed with the test bench's file and line, once each, the
// simulation run again replacing them; a process's message naming a file of the project (ISE's `"…/f.v" Line 2`,
// Vivado's `[…/f.v:2]`) opening it at its line, one naming no file of the project not clickable; a drawing's Check's
// entry showing its item. Both interfaces (SILINX_UI_INTERFACE).
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject } from './harness.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;

const BLINK = 'module blink(input clk, output reg led);\n  always @(posedge clk) led <= ~led;\nendmodule\n';
const TB = [
  'library ieee; use ieee.std_logic_1164.all;',
  'entity tb_chk is end;',
  'architecture sim of tb_chk is',
  '  signal a : std_logic := \'0\';',
  'begin',
  '  process begin',
  '    for i in 1 to 5 loop',
  '      wait for 10 ns;',
  '      assert a = \'1\' report "a is not 1" severity error;',
  '    end loop;',
  '    assert false report "check the wiring" severity warning;',
  '    wait;',
  '  end process;',
  'end;',
].join('\n') + '\n';
const settled = (page) => page.eval(() => new Promise((r) => setTimeout(r, 120)));   // (the tabs drawn at most every 50 ms)
const entries = (page) => page.eval(() => window.Silinx.diags.map((d) => ({ severity: d.severity, tool: d.tool, message: d.message, file: d.file, line: d.line })));
const rows = (page, tab = 'errors') => page.eval((t) => [...document.querySelectorAll(`#console-${t} .diag`)].map((d) => d.textContent), tab);
const clickRow = (page, tab, re) => page.eval((t, src) => {
  const row = [...document.querySelectorAll(`#console-${t} .diag`)].find((d) => new RegExp(src).test(d.textContent));
  row.click();
  return !!row;
}, tab, re.source);
const simulate = async (page) => {
  await page.eval(() => window.SilinxApp.runSimulation('tb_chk'));
  await page.waitFor(() => window.Silinx.active?.id === 'isim:tb_chk' && window.Silinx.active.view && !window.Silinx.active.view.state.running, [], { what: 'SSim ran', timeout: 30000 });
  await settled(page);
};

uiTest('#4746 a simulation\'s assertions in the Errors / Warnings tabs with their file and line, once each, a click opening it; run again, replaced', E, async (page) => {
  await makeProject(env, { name: 'AssertPj', top: 'blink', simTop: 'tb_chk', files: { 'src/blink.v': BLINK, 'sim/tb_chk.vhd': TB }, roles: { 'sim/tb_chk.vhd': 'sim' } });
  await page.openProject('AssertPj');
  await simulate(page);
  const sim = (await entries(page)).filter((d) => d.tool === 'SSim');
  // (the error of the loop's five turns: once)
  assert.deepEqual(sim, [{ severity: 'error', tool: 'SSim', message: 'a is not 1', file: 'sim/tb_chk.vhd', line: 9 },
    { severity: 'warning', tool: 'SSim', message: 'check the wiring', file: 'sim/tb_chk.vhd', line: 11 }]);
  assert.deepEqual((await rows(page)).filter((r) => /SSim/.test(r)), ['ERROR:SSim - "sim/tb_chk.vhd" Line 9: a is not 1']);
  assert.deepEqual((await rows(page, 'warnings')).filter((r) => /SSim/.test(r)), ['WARNING:SSim - "sim/tb_chk.vhd" Line 11: check the wiring']);
  // clicked: the test bench open at the assertion's line
  assert.ok(await clickRow(page, 'errors', /a is not 1/));
  // (its cursor's line counted from 0)
  await page.waitFor(() => window.Silinx.active?.path === 'sim/tb_chk.vhd' && window.Silinx.active.editor?.getCursor().line === 8, [], { what: 'the test bench at line 9' });
  // simulated again: the same entries, not twice
  await simulate(page);
  assert.deepEqual((await entries(page)).filter((d) => d.tool === 'SSim'), sim);
});

uiTest('#4746 a process\'s message naming a file of the project opens it at its line; one naming none is no link; a drawing\'s Check\'s entry shows its item', E, async (page) => {
  await makeProject(env, { name: 'LocPj', top: 'blink', files: { 'src/blink.v': BLINK } });
  await page.openProject('LocPj');
  await page.eval(() => import('/js/console.js').then((c) => {
    c.log('\nStarted : "Synthesize - XST".', 'hdr');
    c.logLine('ERROR:HDLCompiler:806 - "/remote/LocPj/src/blink.v" Line 2: Syntax error near "always".');
    c.logLine('WARNING: [Synth 8-3331] design blink has unconnected port clk [/p/src/blink.v:1]');
    c.logLine('ERROR:Pack:198 - NCD was not produced. All logic was removed from the design.');
    c.logLine('ERROR:HDLCompiler:806 - "/remote/LocPj/src/other.v" Line 4: Syntax error.');
  }));
  await settled(page);
  assert.deepEqual((await entries(page)).map((d) => [d.file, d.line]), [['src/blink.v', 2], ['src/blink.v', 1], [null, 0], [null, 0]]);
  // (its location written once: its text's)
  assert.deepEqual(await rows(page), [
    'ERROR:HDLCompiler:806 - "/remote/LocPj/src/blink.v" Line 2: Syntax error near "always".',
    'ERROR:Pack:198 - NCD was not produced. All logic was removed from the design.',
    'ERROR:HDLCompiler:806 - "/remote/LocPj/src/other.v" Line 4: Syntax error.',
  ]);
  assert.ok(await clickRow(page, 'errors', /Line 2/));
  await page.waitFor(() => window.Silinx.active?.path === 'src/blink.v' && window.Silinx.active.editor?.getCursor().line === 1, [], { what: 'blink.v at line 2' });
  await page.eval(() => window.SilinxApp.closeDoc?.(window.Silinx.active));
  assert.ok(await clickRow(page, 'warnings', /blink\.v:1/));
  await page.waitFor(() => window.Silinx.active?.path === 'src/blink.v' && window.Silinx.active.editor?.getCursor().line === 0, [], { what: 'blink.v at line 1' });
  // a drawing's Check: its entry clicked shows its item (the editor's focus)
  await page.eval(() => {
    window.__focused = [];
    const d = { severity: 'error', message: 'The input a of g1 is not connected', ref: { kind: 'symbol', id: 'g1' } };
    document.getElementById('workspace').dispatchEvent(new CustomEvent('silinx-diagnostics', { bubbles: true,
      detail: { what: 'Check Schematic', name: 'gates', diags: [d], focus: (x) => window.__focused.push(x.ref.id) } }));
  });
  await settled(page);
  assert.ok(await clickRow(page, 'errors', /g1 is not connected/));
  await page.waitFor(() => window.__focused.length === 1, [], { what: 'the item shown' });
  assert.deepEqual(await page.eval(() => window.__focused), ['g1']);
});
