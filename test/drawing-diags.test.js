// A drawing that makes no module (#3934, core/drawing-diags.js): its errors as Check Syntax's (Check Design's)
// diagnostics, on the drawing, the fix said, its module (the top) not elaborated; the MCP server's check_syntax as the
// interface's (test/ui/check-drawing-errors.test.js), in an FPGA project and in a design and simulation project.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { scratchEnv, ROOT } from './server-helpers.js';

let tmp;
before(async () => {
  tmp = await scratchEnv('silinx-drawing-diags-');
  fs.mkdirSync(path.join(tmp, 'exchange'));
  process.env.SILINX_MCP_FOLDER = path.join(tmp, 'exchange');
});
after(() => fs.rmSync(tmp, { recursive: true, force: true }));

const { handle } = await import('../server/mcp.js');
const P = await import('../server/projects.js');
let id = 0;
async function call(name, args = {}) {
  const r = (await handle({ jsonrpc: '2.0', id: ++id, method: 'tools/call', params: { name, arguments: args } })).result;
  return { text: r.content[0].text, data: r.structuredContent, isError: r.isError };
}
const ok = async (name, args) => { const r = await call(name, args); assert.equal(r.isError, false, r.text); return r; };
const fails = async (name, args, message) => { const r = await call(name, args); assert.equal(r.isError, true, r.text); assert.equal(r.text, `${name}: ${message}`); };
const FSM = fs.readFileSync(path.join(ROOT, 'examples/traffic/src/traffic.fsm.json'), 'utf8');

const { drawingDiags, failedModule } = await import('../core/drawing-diags.js');
const BAD = (() => { const m = JSON.parse(FSM); m.states[1].name = m.states[0].name; delete m.generatedFile; return JSON.stringify(m, null, 2); })();
const WHY = 'Two states are named \'CARS\' (letter case does not count)';

test('drawingDiags: a failed drawing\'s errors, its path left out of them, the fix; a design project\'s module; failedModule', () => {
  const failed = [{ path: 'src/a.fsm.json', module: 'a', errors: ['src/a.fsm.json: x is wrong', 'src/a.fsm.json: y too'] }, { path: 'src/b.sch.json', module: 'b', errors: [] }];
  assert.deepEqual(drawingDiags(failed), [{ severity: 'error', file: 'src/a.fsm.json', line: 0, col: 0, tool: 'Silinx', drawn: true,
    message: 'its HDL cannot be made: x is wrong; y too. Fix src/a.fsm.json (its HDL is then made).' }]);
  assert.equal(drawingDiags(failed, { design: true })[0].message, 'its module is not made: x is wrong; y too. Fix src/a.fsm.json.');
  assert.deepEqual([drawingDiags(), drawingDiags([null])], [[], []]);
  assert.deepEqual([failedModule(failed, 'A'), failedModule(failed, 'b'), failedModule(failed, 'c'), failedModule(undefined, 'a')], [true, false, false, false]);
});

for (const [design, proc, message] of [
  [false, 'Check Syntax', `its HDL cannot be made: ${WHY}. Fix src/traffic.fsm.json (its HDL is then made).`],
  [true, 'Check Design', `its module is not made: ${WHY}. Fix src/traffic.fsm.json.`],
]) {
  test(`check_syntax of a drawing that makes no module (${design ? 'a design project' : 'an FPGA project'}): its errors on the drawing, as the interface's`, async () => {
    const name = design ? 'dd' : 'df';
    await ok('new_project', design ? { name, design_only: true } : { name });
    // (its top set while it was correct)
    await ok('write_file', { project: name, path: 'src/traffic.fsm.json', text: (() => { const m = JSON.parse(FSM); delete m.generatedFile; return JSON.stringify(m, null, 2); })() });
    await ok('set_top', { project: name, top: 'traffic' });
    await call('delete_file', { project: name, path: 'src/traffic.vhd' });
    await ok('write_file', { project: name, path: 'src/traffic.fsm.json', text: BAD });
    const r = await call('check_syntax', { project: name });
    assert.equal(r.text, `ERROR:Silinx - "src/traffic.fsm.json": ${message}\nProcess "${proc}" of <traffic> failed (1 error(s), 0 warning(s)).`);
    assert.deepEqual(r.data.errors.map(e => [e.file, e.tool, e.message]), [['src/traffic.fsm.json', 'Silinx', message]]);
  });
}

test('check_syntax of an HDL top whose instance is a drawing that makes no module: that drawing\'s errors for "not found"; an unused empty drawing says nothing', async () => {
  await ok('new_project', { name: 'di' });
  await ok('write_file', { project: 'di', path: 'src/top.v', text: 'module top(input clk, rst, req, night, output [1:0] phase);\n  traffic u(.clk(clk), .rst(rst), .req(req), .night(night), .phase(phase));\nendmodule\n' });
  await ok('write_file', { project: 'di', path: 'src/traffic.fsm.json', text: BAD });
  await ok('new_source', { project: 'di', type: 'fsm', name: 'later' });
  const r = await call('check_syntax', { project: 'di', top: 'top' });
  const errs = r.data.errors.map(e => `${e.file}: ${e.message}`);
  assert.ok(errs.includes(`src/traffic.fsm.json: its HDL cannot be made: ${WHY}. Fix src/traffic.fsm.json (its HDL is then made).`), errs.join('\n'));
  assert.ok(!errs.some(e => /not found/.test(e) && /traffic/.test(e)), errs.join('\n'));
  assert.ok(!errs.some(e => /later/.test(e)), errs.join('\n'));
});

// #5799: a drawing with errors whose HDL is still made (a schematic whose net y has two drivers) and no HDL file: its
// HDL not compiled, its errors Check Syntax's, as a drawing that makes none (#3934); the top, or an instance of an HDL
// top; write_file says why it has no HDL file. Fixed, it gets its HDL file and Check Syntax passes (its one warning, an unused net).
const TWO = JSON.stringify({ version: 7, name: 'both', lang: 'vhdl', sheet: { w: 1700, h: 1100 },
  symbols: [{ id: 'S1', type: 'inv', x: 200, y: 100, rot: 0, mirror: false, name: 'U1', params: { width: 1 } }, { id: 'S2', type: 'inv', x: 200, y: 200, rot: 0, mirror: false, name: 'U2', params: { width: 1 } }],
  wires: [{ id: 'W1', points: [{ x: 280, y: 110 }, { x: 320, y: 110 }] }, { id: 'W2', points: [{ x: 280, y: 210 }, { x: 320, y: 210 }] }],
  labels: [{ id: 'L1', x: 300, y: 210, net: 'y' }],
  ports: [{ id: 'P1', name: 'a', dir: 'in', width: 1, x: 200, y: 110 }, { id: 'P2', name: 'b', dir: 'in', width: 1, x: 200, y: 210 }, { id: 'P3', name: 'y', dir: 'out', width: 1, x: 320, y: 110 }] });
const TWO_WHY = "net 'y' has 2 drivers (U1.O, U2.O)";

test('#5799 check_syntax of a drawing with errors whose HDL is still made: its errors, not its HDL compiled; write_file says why', async () => {
  await ok('new_project', { name: 'two' });
  const w = await ok('write_file', { project: 'two', path: 'src/both.sch.json', text: TWO });
  assert.equal(w.text, `Created src/both.sch.json (${TWO.length} characters).\nWARNING: src/both.sch.json has no HDL file yet: it has errors: ${TWO_WHY}`);
  assert.deepEqual(w.data.hdl, { file: null, written: false, removed: null, stale: TWO_WHY });
  assert.equal(fs.existsSync(path.join(P.projectDir('two'), 'src/both.vhd')), false);
  const ERR = `src/both.sch.json: its HDL cannot be made: ${TWO_WHY}. Fix src/both.sch.json (its HDL is then made).`;
  // the top
  const r = await call('check_syntax', { project: 'two', top: 'both' });
  assert.deepEqual([r.data.errors.map(e => `${e.file}: ${e.message}`), r.data.warnings], [[ERR], []]);
  assert.match(r.text, /^ERROR:Silinx - "src\/both\.sch\.json": its HDL cannot be made: net 'y' has 2 drivers \(U1\.O, U2\.O\)\. Fix src\/both\.sch\.json \(its HDL is then made\)\.\nProcess "Check Syntax" of <both> failed \(1 error\(s\), 0 warning\(s\)\)\.$/);
  // an instance of an HDL top: its errors for "not found"
  await ok('write_file', { project: 'two', path: 'src/top.vhd', text: 'library ieee; use ieee.std_logic_1164.all;\nentity top is port (a, b : in std_logic; y : out std_logic); end top;\narchitecture s of top is begin\n  u: entity work.both port map (a => a, b => b, y => y);\nend s;\n' });
  const t = await call('check_syntax', { project: 'two', top: 'top' });
  assert.deepEqual([t.data.errors.map(e => `${e.file}: ${e.message}`), t.data.warnings], [[ERR], []]);
  // fixed (U2's output its own net): its HDL file made, Check Syntax clean
  const fixed = JSON.parse(TWO);
  fixed.labels[0].net = 'z';
  const f = await ok('write_file', { project: 'two', path: 'src/both.sch.json', text: JSON.stringify(fixed) });
  assert.equal(f.text.split('\n')[1], 'src/both.vhd generated from src/both.sch.json');
  const c = await call('check_syntax', { project: 'two', top: 'top' });
  // (its one warning: U2's output z drives nothing)
  assert.deepEqual([c.isError, c.data.errors, c.data.warnings.map(w => `${w.file}: ${w.message}`)], [false, [], ['src/both.vhd: Signal <z> is assigned but never used. This unconnected signal will be trimmed during the optimization process.']]);
});
