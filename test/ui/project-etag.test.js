// UI: the page's description written over the one it read only (#4726). The MCP server (another process: the same
// functions of server/projects.js) registers a file while the page has not heard of it yet; the page then sets the top:
// its stale write is refused (412), its change merged into the current description and written again; the MCP's
// file stays in the project, on disk and in the page's description, and the new top is kept. Both interfaces; no
// warnings.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject, readWs } from './harness.js';

let env, P;
before(async () => {
  env = await setupUi();
  process.env.SILINX_WORKSPACE = env.server.workspace;
  P = await import('../../server/projects.js');
});
after(async () => { await env?.teardown?.(); });
const E = () => env;

const ent = (n) => `library ieee; use ieee.std_logic_1164.all;\nentity ${n} is port (x : in std_logic; y : out std_logic); end ${n};\narchitecture r of ${n} is begin y <= x; end r;\n`;
const warnings = (page) => page.console.filter((c) => c.type === 'warning' || c.type === 'warn').map((c) => c.text);

uiTest('#4726 a file the MCP server registered while the page was stale: kept when the page sets the top (412, merged, written again)', E, async (page) => {
  await makeProject(env, { name: 'StalePj', top: 'a', files: { 'src/a.vhd': ent('a'), 'src/b.vhd': ent('b') } });
  await page.openProject('StalePj');
  // the page hears of nothing from now on (the watcher's 500 ms poll would otherwise race the test)
  await page.eval(async () => (await import('/js/project-watch.js')).stopWatching());
  const puts = await page.eval(() => {
    window.__puts = [];
    const f = window.fetch;
    window.fetch = async (url, opts = {}) => {
      const r = await f(url, opts);
      if (opts.method === 'PUT' && /\/api\/projects\/[^/]+$/.test(String(url))) window.__puts.push(r.status);
      return r;
    };
    return window.__puts.length;
  });
  assert.equal(puts, 0);
  // the MCP's new_source / write_file: registered in silinx.json
  await P.writeFile('StalePj', 'src/mcp.vhd', ent('mcp'));
  assert.ok(!(await page.eval(() => window.SilinxApp.S.project.files.some((f) => f.path === 'src/mcp.vhd'))), 'the page is stale');
  // Set as Top Module, from the page's stale description
  await page.eval(() => window.SilinxApp.setTop('b', false));
  await page.eval(() => import('/js/design.js').then((m) => m.projectSaved()));
  assert.deepEqual(await page.eval(() => window.__puts), [412, 200]);
  const disk = JSON.parse(await readWs(env, 'StalePj', 'silinx.json'));
  assert.equal(disk.top, 'b');
  assert.deepEqual(disk.files.map((f) => f.path).sort(), ['src/a.vhd', 'src/b.vhd', 'src/mcp.vhd']);
  // and the page's description is the one written
  assert.equal(await page.eval(() => window.SilinxApp.S.project.top), 'b');
  assert.ok(await page.eval(() => window.SilinxApp.S.project.files.some((f) => f.path === 'src/mcp.vhd')));
  // a later save of the page keeps it too (its revision is the written one: no 412)
  await page.eval(() => window.SilinxApp.setTop('a', false));
  await page.eval(() => import('/js/design.js').then((m) => m.projectSaved()));
  assert.deepEqual(await page.eval(() => window.__puts), [412, 200, 200]);
  const disk2 = JSON.parse(await readWs(env, 'StalePj', 'silinx.json'));
  assert.equal(disk2.top, 'a');
  assert.ok(disk2.files.some((f) => f.path === 'src/mcp.vhd'));
  await page.waitConsole(/Top-level module set to 'a'\./);
  assert.deepEqual(warnings(page), []);
});
