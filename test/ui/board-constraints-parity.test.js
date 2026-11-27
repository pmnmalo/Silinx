// UI: Update Constraints and Check Constraints give what the MCP's set_top update_constraints and check_constraints give
// (#4732: core/board-constraints.js, core/constraints-diagnostics.js), on the examples and a student's design (a, b, y:
// no board name, pins by direction; the MCP gave them none) on a Spartan-3E's, an iCE40's and an ECP5's board: the same
// file, the same problems. No warnings.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest } from './harness.js';

let env, handle;
before(async () => {
  env = await setupUi();
  if (env.server?.workspace) {
    process.env.SILINX_WORKSPACE = env.server.workspace;
    ({ handle } = await import('../../server/mcp.js'));
  }
});
after(async () => { await env?.teardown?.(); });
const E = () => env;
let id = 0;
const mcp = async (name, args) => {
  const r = (await handle({ jsonrpc: '2.0', id: ++id, method: 'tools/call', params: { name, arguments: args } })).result;
  assert.equal(r.isError, false, r.content[0].text);
  return r.structuredContent;
};
const P = () => import('../../server/projects.js');

const GATE = 'library ieee; use ieee.std_logic_1164.all;\nentity g is port (a, b : in std_logic; y : out std_logic); end g;\narchitecture r of g is begin y <= a and b; end r;\n';
// a constraints file with a name that is no port, in each format
const BAD = { ucf: 'NET "zz" LOC = "P11";\n', pcf: 'set_io zz 10\n', lpf: 'LOCATE COMP "zz" SITE "B2";\n' };
const CASES = [['basys2', 'ucf'], ['icebreaker', 'pcf'], ['ulx3s', 'lpf']];

// the interface's Update Constraints of the open project: its file's text
const uiUpdate = (page, name) => page.eval(async (n) => {
  await window.SilinxApp.regenerateUcf();
  const { api } = await import('/js/api.js');
  return api.readFile(n, window.Silinx.project.constraints);
}, name);
const uiCheck = (page, file, text) => page.eval(async (f, t) => (await import('/js/implement.js')).ucfDiagnostics(t, f).then((d) => d.map((x) => ({ severity: x.severity, line: x.line, message: x.message, file: x.file, tool: x.tool }))), file, text);
const mcpCheck = async (project, file) => { const r = await mcp('check_constraints', { project, file }); return [...r.errors, ...r.warnings].map((x) => ({ severity: x.severity, line: x.line, message: x.message, file: x.file, tool: x.tool })); };
const sorted = (a) => [...a].sort((x, y) => JSON.stringify(x).localeCompare(JSON.stringify(y)));

uiTest('#4732 Update Constraints and Check Constraints: the interface\'s and the MCP\'s the same, on the examples and a student\'s design', E, async (page) => {
  const { readFile, readProject } = await P();
  for (const [board, ext] of CASES) {
    for (const example of ['gates', 'traffic', 'blinky', null]) {
      const name = `${board}_${example || 'student'}`;
      if (example) await mcp('new_project_from_example', { name, example, board });
      else {
        await mcp('new_project', { name, board });
        await mcp('write_file', { project: name, path: 'src/g.vhd', text: GATE });
        await mcp('set_top', { project: name, top: 'g' });
      }
      const top = (await readProject(name)).top;
      await page.openProject(name);
      const ui = await uiUpdate(page, name);
      await mcp('set_top', { project: name, top, update_constraints: true });
      const pj = await readProject(name);
      assert.equal(await readFile(name, pj.constraints), ui, `${name}: the same file`);
      if (!example) for (const p of ['a', 'b', 'y']) assert.match(ui, new RegExp(`\\b${p}\\b`), `${name}: ${p} has a pin`);
      // Check Constraints of the file, and of one with a name that is no port
      assert.deepEqual(sorted(await uiCheck(page, pj.constraints, ui)), sorted(await mcpCheck(name, pj.constraints)), `${name}: its check`);
      await mcp('write_file', { project: name, path: `bad.${ext}`, text: BAD[ext] });
      const bad = await uiCheck(page, `bad.${ext}`, BAD[ext]);
      assert.ok(bad.length >= 1, `${name}: ${JSON.stringify(bad)}`);
      assert.deepEqual(sorted(bad), sorted(await mcpCheck(name, `bad.${ext}`)), `${name}: bad.${ext}'s check`);
    }
  }
  const warnings = (await page.consoleText()).split('\n').filter((l) => /^(WARNING|ERROR)\b/.test(l));
  assert.deepEqual(warnings, []);
});

// #5765: a top's btn0 and btn3 (a button by its number) on BTN0 and BTN3 (G12, A7; not the next free button, C11),
// in the interface's Update Constraints as in the MCP's. No warnings.
uiTest('#5765 Update Constraints: a port named after a button by its number goes on that button', E, async (page) => {
  const { readFile, readProject } = await P();
  const KEYS = 'library ieee; use ieee.std_logic_1164.all;\nentity k is port (btn0, btn3, a : in std_logic; led0, y : out std_logic); end k;\narchitecture r of k is begin led0 <= btn0 and not btn3; y <= a; end r;\n';
  await mcp('new_project', { name: 'keys5765', board: 'basys2' });
  await mcp('write_file', { project: 'keys5765', path: 'src/k.vhd', text: KEYS });
  await mcp('set_top', { project: 'keys5765', top: 'k' });
  await page.openProject('keys5765');
  const ui = await uiUpdate(page, 'keys5765');
  for (const [net, loc] of [['btn0', 'G12'], ['btn3', 'A7'], ['led0', 'M5'], ['a', 'P11'], ['y', 'M11']]) assert.match(ui, new RegExp(`NET "${net}"\\s+LOC = "${loc}"`), net);
  await mcp('set_top', { project: 'keys5765', top: 'k', update_constraints: true });
  assert.equal(await readFile('keys5765', (await readProject('keys5765')).constraints), ui);
  const warnings = (await page.consoleText()).split('\n').filter((l) => /^(WARNING|ERROR)\b/.test(l));
  assert.deepEqual(warnings, []);
});
