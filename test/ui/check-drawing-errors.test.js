// UI: Check Syntax (Check Design in a design and simulation project) of a drawing that makes no module (#3934): a state
// diagram with two states of one name and no HDL file yet, the top: its errors on the drawing, the fix, no "top module
// not found"; in an FPGA project and in a design project; the Errors tab; the exact errors. Both interfaces.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { setupUi, uiTest, makeProject, ROOT } from './harness.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;

const BAD = (() => { const m = JSON.parse(fs.readFileSync(path.join(ROOT, 'examples/traffic/src/traffic.fsm.json'), 'utf8')); m.states[1].name = m.states[0].name; return JSON.stringify(m); })();
const WHY = 'Two states are named \'CARS\' (letter case does not count)';

for (const [kind, label, error] of [
  [undefined, 'Check Syntax', `ERROR:Silinx - "src/traffic.fsm.json": its HDL cannot be made: ${WHY}. Fix src/traffic.fsm.json (its HDL is then made).`],
  ['design', 'Check Design', `ERROR:Silinx - "src/traffic.fsm.json": its module is not made: ${WHY}. Fix src/traffic.fsm.json.`],
]) {
  uiTest(`#3934 ${label} of a drawing that makes no module (${kind ? 'a design project' : 'an FPGA project'}): its errors on the drawing, no "top module not found"`, E, async (page) => {
    const name = kind ? 'BadDrawn' : 'BadFpga';
    await makeProject(env, { name, kind, files: { 'src/traffic.fsm.json': BAD }, top: 'traffic' });
    await page.openProject(name);
    await page.waitFor(() => window.SilinxApp.S.failedDrawings?.length === 1, [], { what: 'the drawing that makes no module' });
    await page.eval(async () => (await import('/js/processes.js')).checkSyntax('traffic'));
    await page.waitConsole(/Process "Check (Syntax|Design)" failed/);
    const lines = (await page.consoleText()).split('\n').filter((l) => /WARNING|ERROR/.test(l));
    assert.deepEqual(lines, [error]);
    assert.ok((await page.consoleText()).includes(`Process "${label}" failed (1 error(s), 0 warning(s))`));
    // the Errors tab: the drawing, no line
    assert.deepEqual(await page.eval(() => [...document.querySelectorAll('#console-errors .diag .loc')].map((e) => e.textContent)), ['"src/traffic.fsm.json"']);
  });
}

// #5799: a drawing with errors whose HDL is still made (a schematic whose net y has two drivers), no HDL file: Check
// Syntax says its errors on it, not its HDL compiled (it passed, its errors unsaid), as the MCP's check_syntax
const TWO = JSON.stringify({ version: 7, name: 'both', lang: 'vhdl', sheet: { w: 1700, h: 1100 },
  symbols: [{ id: 'S1', type: 'inv', x: 200, y: 100, rot: 0, mirror: false, name: 'U1', params: { width: 1 } }, { id: 'S2', type: 'inv', x: 200, y: 200, rot: 0, mirror: false, name: 'U2', params: { width: 1 } }],
  wires: [{ id: 'W1', points: [{ x: 280, y: 110 }, { x: 320, y: 110 }] }, { id: 'W2', points: [{ x: 280, y: 210 }, { x: 320, y: 210 }] }],
  labels: [{ id: 'L1', x: 300, y: 210, net: 'y' }],
  ports: [{ id: 'P1', name: 'a', dir: 'in', width: 1, x: 200, y: 110 }, { id: 'P2', name: 'b', dir: 'in', width: 1, x: 200, y: 210 }, { id: 'P3', name: 'y', dir: 'out', width: 1, x: 320, y: 110 }] });
const TOP = 'library ieee; use ieee.std_logic_1164.all;\nentity top is port (a, b : in std_logic; y : out std_logic); end top;\narchitecture s of top is begin\n  u: entity work.both port map (a => a, b => b, y => y);\nend s;\n';
uiTest('#5799 Check Syntax of a drawing with errors whose HDL is still made: its errors on the drawing, the top and an instance', E, async (page) => {
  await makeProject(env, { name: 'TwoDrv', files: { 'src/both.sch.json': TWO, 'src/top.vhd': TOP }, top: 'top' });
  await page.openProject('TwoDrv');
  await page.waitFor(() => window.SilinxApp.S.failedDrawings?.length === 1, [], { what: 'the drawing with errors' });
  const ERR = 'ERROR:Silinx - "src/both.sch.json": its HDL cannot be made: net \'y\' has 2 drivers (U1.O, U2.O). Fix src/both.sch.json (its HDL is then made).';
  for (const top of ['top', 'both']) {
    const start = (await page.consoleText()).split('\n').length;
    await page.eval(async (t) => (await import('/js/processes.js')).checkSyntax(t), top);
    await page.waitFor((n) => window.__console().split('\n').slice(n).some((l) => /Process "Check Syntax" (failed|completed)/.test(l)), [start], { what: 'Check Syntax done' });
    const lines = (await page.consoleText()).split('\n').slice(start);
    assert.deepEqual(lines.filter((l) => /WARNING|ERROR/.test(l)), [ERR], top);
    assert.ok(lines.some((l) => l.includes('Process "Check Syntax" failed (1 error(s), 0 warning(s))')), `${top}: ${lines.join('\n')}`);
  }
});
