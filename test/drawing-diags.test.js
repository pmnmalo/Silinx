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
    // (its top set while it was correct: set_top refuses a top that does not elaborate, saying why)
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
