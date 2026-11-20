// UI: a drawing's HDL made again as its editor saves it (#4750), through core/drawing-sync.js syncDrawing, the MCP's: a
// state diagram's, an ASM chart's and a truth table's errors said in the console in the words of the MCP's write_file on
// a twin project (the ASM chart's were said nowhere, the others in words of their own), once, and on its HDL editor's
// banner; fixed, its HDL the twin's again, nothing stale. A drawing saved while a Rename runs gets its HDL made after it
// (S.syncing, a flag, skipped its sync).
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, readWs } from './harness.js';

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
  return r;
};
const warnings = async (page) => (await page.consoleText()).split('\n').filter((l) => /^(WARNING|ERROR)\b/.test(l));
const pause = (page, ms) => page.eval((t) => new Promise((r) => setTimeout(r, t)), ms);

// the drawing open in its editor saved with the model `m` (as an edit of it would)
async function saveAs(page, kind, path, m) {
  await page.eval(async (k, p, model) => {
    const { findDoc, setDirty, flushDoc } = await import('/js/app.js');
    const d = findDoc(`${k}:${p}`);
    const ed = d.asmEditor || d.fsmEditor || d.ttEditor;
    ed.getModel = () => model;
    setDirty(d, true);
    await flushDoc(d);
  }, kind, path, m);
}
async function open(page, name, kind, path, hdl) {
  await page.openProject(name);
  await page.waitFor((h) => window.Silinx.modules?.some((x) => x.file === h), [hdl], { what: 'the project' });
  await page.eval(async (p) => (await import('/js/app.js')).openFile(p), path);
  await page.waitFor((i) => window.Silinx.docs.some((d) => d.id === i), [`${kind}:${path}`], { what: 'the editor' });
}

const KINDS = [
  { what: 'state diagram', example: 'traffic', kind: 'fsm', path: 'src/traffic.fsm.json', hdl: 'src/traffic.vhd',
    bad: (m) => ({ ...m, states: m.states.map((s, i) => (i === 1 ? { ...s, name: m.states[0].name } : s)) }) },
  { what: 'ASM chart', example: 'blinky', kind: 'asm', path: 'src/speed_ctrl.asm.json', hdl: 'src/speed_ctrl.vhd',
    bad: (m) => ({ ...m, outputs: [...m.outputs, { ...m.outputs[0] }] }) },
  { what: 'truth table', example: 'traffic', kind: 'tt', path: 'src/lamps.bool.json', hdl: 'src/lamps.vhd',
    bad: (m) => ({ ...m, outputs: [...m.outputs, m.outputs[0]] }) },
];

for (const k of KINDS) {
  uiTest(`#4750 a ${k.what} saved with errors: the MCP's words in the console, once; fixed, its HDL made again`, E, async (page) => {
    const name = `Sync_${k.kind}`, twin = `SyncTwin_${k.kind}`;
    await mcp('new_project_from_example', { name, example: k.example });
    await mcp('new_project_from_example', { name: twin, example: k.example });
    const good = JSON.parse(await readWs(env, name, k.path));
    const hdl = await readWs(env, name, k.hdl);
    await open(page, name, k.kind, k.path, k.hdl);
    assert.deepEqual(await warnings(page), []);
    const bad = k.bad(good);
    await saveAs(page, k.kind, k.path, bad);
    await page.waitFor((h) => !!window.Silinx.outOfSync?.[h], [k.hdl], { what: 'out of sync' });
    // the MCP's write_file on the twin: the same warning
    const said = (await mcp('write_file', { project: twin, path: k.path, text: JSON.stringify(bad, null, 2) })).content[0].text
      .split('\n').filter((l) => /^WARNING/.test(l));
    assert.equal(said.length, 1, said.join('\n'));
    assert.ok(said[0].startsWith(`WARNING: ${k.hdl} not updated: ${k.path} has errors: `), said[0]);
    const why = said[0].slice(`WARNING: ${k.hdl} not updated: ${k.path} has errors: `.length);
    await page.waitConsole(/^WARNING: /m);
    assert.deepEqual(await warnings(page), said);
    assert.equal(await readWs(env, name, k.hdl), hdl, 'its HDL left as it was');
    const st = await page.eval((h) => ({ stale: window.Silinx.staleHdl?.[h], why: window.Silinx.outOfSync?.[h] }), k.hdl);
    assert.deepEqual(st, { stale: { from: k.path, why: `it has errors: ${why}` }, why: `the ${k.what} has errors: ${why}` });
    // its HDL editor's banner says it
    await page.eval(async (p) => (await import('/js/app.js')).openFile(p), k.hdl);
    await page.waitFor((h) => window.Silinx.active?.id === `file:${h}`, [k.hdl], { what: 'the HDL editor' });
    const banner = await page.eval(() => document.querySelector('.doc:not([hidden]) .gen-banner')?.textContent);
    assert.equal(banner, `Read-only, not in sync with ${k.path.split('/').pop()} — the ${k.what} has errors: ${why}`);
    // saved again as it is: said once
    await saveAs(page, k.kind, k.path, bad);
    await pause(page, 300);
    assert.deepEqual(await warnings(page), said);
    // fixed: its HDL made again (the twin's), nothing stale, nothing more said
    await saveAs(page, k.kind, k.path, good);
    await page.waitFor((h) => !window.Silinx.outOfSync?.[h] && !window.Silinx.staleHdl?.[h], [k.hdl], { what: 'in sync again' });
    await mcp('write_file', { project: twin, path: k.path, text: JSON.stringify(good, null, 2) });
    assert.equal(await readWs(env, name, k.hdl), await readWs(env, twin, k.hdl));
    assert.deepEqual(await warnings(page), said);
  });
}

uiTest('#4750 a drawing saved while a Rename runs: its HDL made again once the Rename is done', E, async (page) => {
  const name = 'Sync_rename';
  await mcp('new_project_from_example', { name, example: 'traffic' });
  const table = JSON.parse(await readWs(env, name, 'src/lamps.bool.json'));
  const hdl = await readWs(env, name, 'src/lamps.vhd');
  await open(page, name, 'tt', 'src/lamps.bool.json', 'src/lamps.vhd');
  // the state diagram's module renamed (the dialog), the table edited and saved while the rename runs
  page.eval(async () => (await import('/js/rename.js')).renameDialog('src/traffic.vhd', 'traffic')).catch(() => {});
  await page.waitDialog('Rename');
  const edited = { ...table, table: { ...table.table, car_r: table.table.car_r.replace(/X/g, '0') } };
  assert.notEqual(edited.table.car_r, table.table.car_r);
  await page.eval(async (model) => {
    const i = document.querySelector('.dlg-overlay .form-grid input');
    i.value = 'crossing'; i.dispatchEvent(new Event('input'));
    const button = [...document.querySelectorAll('.dlg-overlay button')].find((b) => b.textContent === 'Rename');
    const { findDoc, setDirty, flushDoc } = await import('/js/app.js');
    const { api } = await import('/js/api.js');
    const d = findDoc('tt:src/lamps.bool.json');
    // (the rename's writes slowed: the table saved while it runs)
    const write = api.writeFile;
    window.__write = write;
    api.writeFile = async (n, p, t) => { if (!/lamps/.test(p)) await new Promise((r) => setTimeout(r, 400)); return write(n, p, t); };
    button.click();
    await new Promise((r) => setTimeout(r, 200));
    d.ttEditor.getModel = () => model;
    setDirty(d, true);
    await flushDoc(d);
  }, edited);
  await page.waitConsole(/^Rename: module 'traffic' renamed to 'crossing'/m);
  await page.eval(async () => { (await import('/js/api.js')).api.writeFile = window.__write; });
  const deadline = Date.now() + 10000;
  while (await readWs(env, name, 'src/lamps.vhd') === hdl && Date.now() < deadline) await pause(page, 100);
  assert.notEqual(await readWs(env, name, 'src/lamps.vhd'), hdl, 'the table\'s HDL made again');
  assert.equal(JSON.parse(await readWs(env, name, 'src/lamps.bool.json')).table.car_r, edited.table.car_r);
  assert.deepEqual(await warnings(page), []);
});
