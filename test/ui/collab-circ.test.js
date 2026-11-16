// UI: a shared project's breadboard circuit edited live (#4203, after the drawings of #3183), the owner and an editor in
// one test, in both interfaces: the owner shares with the circuit open; the editor opens the editors' link, the circuit
// editable there (no read-only notice); at once each one deletes another wire: the same circuit on both sides with both
// changes; the owner's page writes it to the disk and its HDL generated again from it (as generateCircuit makes it from
// the merged circuit); each one's Undo undoes their own change only. The exact console lines; no warnings but those
// asserted.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject, readWs } from './harness.js';
import { normalizeCircuit } from '../../core/circuit.js';
import { generateCircuit } from '../../core/circuit-hdl.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;

const F = 'src/breadboard.circ.json', ED = '.doc:not([hidden]) .circuit-editor';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const warnings = async (page) => (await page.consoleText()).split('\n').map((l) => l.trim()).filter((l) => /^(WARNING|AVISO|ERROR|ERRO)/.test(l));
const model = (page) => page.eval(() => window.Silinx.active.circuitEditor.getModel());
const disk = async () => normalizeCircuit(JSON.parse(await readWs(env, 'LiveCirc', F)));
const until = async (fn, what, ms = 10000) => { for (const t = Date.now(); ;) { const v = await fn(); if (v) return v; if (Date.now() - t > ms) throw new Error(`timed out: ${what}`); await sleep(100); } };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const ids = (m) => m.wires.map((w) => w.id);
// a wire deleted in the editor, as a click and Delete do: selected, then Edit ▸ Delete
const del = (page, id) => page.eval((x) => { const ed = window.Silinx.active.circuitEditor; ed.select({ kind: 'wire', id: x }); ed.deleteSelection(); }, id);

uiTest('#4203 a circuit edited live by the owner and an editor: a wire deleted on each side at once, on both sides, written with its HDL, each one\'s Undo their own', E, async (page) => {
  await makeProject(env, { name: 'LiveCirc', template: 'breadboard', board: 'basys2' });
  await page.openProject('LiveCirc');
  await page.eval((p) => window.SilinxApp.openFile(p), F);
  await page.waitFor(() => !!window.Silinx.active?.circuitEditor, [], { what: 'the circuit open' });
  const c0 = await disk();
  const hdl = c0.generatedFile;
  const edit = await page.eval(async () => { const m = await import('/js/collab-share.js'); await m.startSharing('Ana'); return m.editorsLink(); });
  const ep = await env.newPage(env.server.url);
  try {
    await ep.waitFor(() => window.SilinxApp && window.Silinx?.startupChecked, [], { what: 'app boot' });
    await ep.goto(`${new URL(edit).origin}/?f=1${new URL(edit).hash}`);
    await ep.waitDialog('Follow a Shared Project');
    await ep.fill('.dlg-overlay input[data-field=name]', 'Rui');
    await ep.dialogButton('Follow');
    await ep.waitFor(() => window.Silinx?.project?.name === 'LiveCirc' && window.Silinx.startupChecked, [], { what: 'the project open', timeout: 30000 });
    await page.waitConsole(/^Rui edits your project "LiveCirc" with you\.$/m);
    await ep.waitFor((p) => window.Silinx.active?.path === p && !!window.Silinx.active.circuitEditor, [F], { what: 'the owner\'s circuit followed' });
    assert.equal(await ep.eval((ed) => !!document.querySelector(`${ed} [data-follow-notice]`), ED), false);
    assert.deepEqual(await model(ep), c0);
    await sleep(700);   // (both bound: their track)
    // at once: Ana deletes the last wire, Rui the one before
    const [wa, wb] = ids(c0).slice(-2).reverse();
    await Promise.all([del(page, wa), del(ep, wb)]);
    const both = (m) => !ids(m).includes(wa) && !ids(m).includes(wb);
    await until(async () => both(await model(page)), 'both changes at the owner\'s');
    await until(async () => both(await model(ep)), 'both changes at the editor\'s');
    const merged = await model(page);
    assert.deepEqual(await model(ep), merged);
    assert.deepEqual(ids(merged), ids(c0).filter((x) => x !== wa && x !== wb));
    // the owner's page writes it to the disk, and its HDL made again from it
    await until(async () => same(await disk(), merged), 'the merge on the disk');
    await until(async () => (await readWs(env, 'LiveCirc', hdl)) === generateCircuit(merged, merged.lang, { source: 'breadboard.circ.json' }).code, 'the HDL made again');
    // each one's Undo: their own change only, on both sides
    await ep.eval(() => window.Silinx.active.circuitEditor.undo());
    await until(async () => { const m = await model(page); return ids(m).includes(wb) && !ids(m).includes(wa); }, 'Rui\'s change undone at the owner\'s');
    await page.eval(() => window.Silinx.active.circuitEditor.undo());
    await until(async () => same(await model(ep), c0), 'Ana\'s change undone at the editor\'s');
    assert.deepEqual(await model(page), c0);
    await until(async () => same(await disk(), c0), 'both undone on the disk');
    const untrusted = 'WARNING: Project "LiveCirc" was changed by an editor of its shared link: it is edited, checked, simulated and implemented with the Silinx toolchain; Xilinx ISE and programming a board or a PROM run only once you trust it. Trust Project';
    assert.deepEqual(await warnings(ep), []);
    assert.deepEqual(await warnings(page), [untrusted]);
    assert.deepEqual(ep.errors, []);
  } finally { await ep.close(); await page.eval(async () => (await import('/js/collab-share.js')).stopSharing()); }
}, { timeout: 150000 });
