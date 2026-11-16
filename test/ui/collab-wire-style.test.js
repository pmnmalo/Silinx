// UI (#4239): the wires' style each participant's own in a shared project, both ways, in both interfaces. A schematic
// shared with an editor: the editor's ⋮ Wires ▸ Curved draws it curved there, nothing sent (the owner's view and file
// keep Orthogonal, the editor's document not dirty); the owner's Direct, saved, leaves the editor's Curved, and the
// owner's move of a symbol still arrives there; the editor's choice is remembered for that shared project (the
// schematic closed and opened again: Curved). A circuit followed read only: its ⋮ Wires enabled, the follower's Curved
// theirs alone, the owner's Orthogonal saved does not change it, the owner's view untouched. The exact console lines;
// no warnings but those asserted.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject, readWs } from './harness.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const warnings = async (page) => (await page.consoleText()).split('\n').map((l) => l.trim()).filter((l) => /^(WARNING|AVISO|ERROR|ERRO)/.test(l));
const until = async (fn, what, ms = 10000) => { for (const t = Date.now(); ;) { const v = await fn(); if (v) return v; if (Date.now() - t > ms) throw new Error(`timed out: ${what}`); await sleep(100); } };

// a page following a link (its name asked), the project open
async function follow(link, name, project) {
  const fp = await env.newPage(env.server.url);
  await fp.waitFor(() => window.SilinxApp && window.Silinx?.startupChecked, [], { what: 'app boot' });
  await fp.goto(`${new URL(link).origin}/?f=1${new URL(link).hash}`);
  await fp.waitDialog('Follow a Shared Project');
  await fp.fill('.dlg-overlay input[data-field=name]', name);
  await fp.dialogButton('Follow');
  await fp.waitFor((p) => window.Silinx?.project?.name === p && window.Silinx.startupChecked, [project], { what: 'the project open', timeout: 30000 });
  return fp;
}
// the ⋮ menu's Wires item of a style clicked, as the user does (the menu opened first): the schematic's (its toolbar's
// ⋮, its Wires group) or the circuit's
const MENU = { '.sch-editor': ['.se-btn[data-act=more]', '.se-wires'], '.circuit-editor': ['.tb-more-btn', '.tb-more-menu'] };
const menuOf = (ed) => MENU[ed.split(' ').at(-1)];
async function choose(page, ed, style) {
  const [btn, items] = menuOf(ed);
  await page.eval((b) => { const x = document.querySelector(b); if (x.getAttribute('aria-expanded') !== 'true') x.click(); }, `${ed} ${btn}`);
  await page.click(`${ed} ${items} [data-value=${style}]`);
}
const ticked = (page, ed) => page.eval((s) => document.querySelector(s)?.dataset.value, `${ed} ${menuOf(ed)[1]} [data-value][aria-checked=true]`);

uiTest('#4239 a schematic shared with an editor: each one\'s wires\' style their own, both ways, nothing sent; the editor\'s remembered for the project', E, async (page) => {
  const F = 'src/gates.sch.json', ED = '.doc:not([hidden]) .sch-editor';
  const sch = (p) => p.eval(() => window.Silinx.active.schEditor);
  const style = (p) => p.eval(() => window.Silinx.active.schEditor.wireStyle());
  // (each wire's line as drawn: a polyline's points, a path's d)
  const drawn = (p) => p.eval((e) => [...document.querySelectorAll(`${e} svg .wire .wline`)].map((l) => l.getAttribute('d') ?? l.getAttribute('points')), ED);
  const disk = async () => JSON.parse(await readWs(env, 'WireSch', F));
  await makeProject(env, { name: 'WireSch', template: 'gates' });
  await page.openProject('WireSch');
  await page.eval((p) => window.SilinxApp.openSch(p), F);
  await page.waitFor(() => !!window.Silinx.active?.schEditor, [], { what: 'the schematic open' });
  assert.equal(await style(page), 'orthogonal');
  const edit = await page.eval(async () => { const m = await import('/js/collab-share.js'); await m.startSharing('Ana'); return m.editorsLink(); });
  let ep;
  try {
    ep = await follow(edit, 'Rui', 'WireSch');
    await ep.waitFor((p) => window.Silinx.active?.path === p && !!window.Silinx.active.schEditor, [F], { what: 'the owner\'s schematic followed' });
    assert.ok(await sch(ep));
    await sleep(700);   // (both bound: their track)
    const ownerDrawn = await drawn(page), ruiDrawn = await drawn(ep);
    assert.deepEqual(ruiDrawn, ownerDrawn);
    // Rui: ⋮ Wires ▸ Curved, his alone: his view curved, his document not dirty; Ana's view and file still Orthogonal
    await choose(ep, ED, 'curved');
    assert.equal(await style(ep), 'curved');
    assert.equal(await ticked(ep, ED), 'curved');
    assert.notDeepEqual(await drawn(ep), ruiDrawn);
    await sleep(1500);
    assert.equal(await ep.eval((p) => !!window.SilinxApp.findDoc(`sch:${p}`).dirty, F), false, 'not dirty');
    assert.equal(await style(page), 'orthogonal');
    assert.deepEqual(await drawn(page), ownerDrawn);
    assert.equal((await disk()).wireStyle, undefined);
    assert.equal(await ep.eval(() => localStorage.getItem('silinx.collab.wireStyles')), JSON.stringify({ [JSON.stringify(['Ana', 'WireSch', F])]: 'curved' }));
    // Ana: Direct, saved: her file has it; Rui's view stays Curved; her move of S5 still arrives at Rui's
    await choose(page, ED, 'direct');
    await page.eval(() => window.SilinxApp.saveAll());
    await until(async () => (await disk()).wireStyle === 'direct', 'Ana\'s style in her file');
    const y5 = await ep.eval(() => window.Silinx.active.schEditor.getDoc().symbols.find((s) => s.id === 'S5').y);
    await page.eval(() => { const ed = window.Silinx.active.schEditor; const d = ed.getDoc(); d.symbols.find((s) => s.id === 'S5').y += 40; ed.applyModel(d, { mine: true }); });
    await page.eval(() => window.SilinxApp.saveAll());
    await until(async () => (await ep.eval(() => window.Silinx.active.schEditor.getDoc().symbols.find((s) => s.id === 'S5').y)) === y5 + 40, 'Ana\'s move at Rui\'s');
    await sleep(700);
    assert.equal(await style(ep), 'curved');
    assert.equal(await style(page), 'direct');
    // Rui's choice remembered for this shared project: the schematic closed and opened again, Curved
    await ep.eval(() => window.SilinxApp.closeDoc(window.Silinx.active, { force: true }));
    await ep.eval((p) => window.SilinxApp.openSch(p), F);
    await ep.waitFor(() => window.Silinx.active?.schEditor?.wireStyle() === 'curved', [], { what: 'Rui\'s Curved again' });
    assert.equal((await disk()).wireStyle, 'direct');
    assert.deepEqual(await warnings(ep), []);
    assert.deepEqual(await warnings(page), [], 'no warning: the editor changed nothing');
    assert.deepEqual(ep.errors, []);
  } finally { await ep?.close(); await page.eval(async () => (await import('/js/collab-share.js')).stopSharing()); }
}, { timeout: 150000 });

uiTest('#4239 a circuit followed read only: the follower\'s wires\' style theirs, the owner\'s saved style leaves it, the owner\'s view untouched', E, async (page) => {
  const F = 'src/breadboard.circ.json', ED = '.doc:not([hidden]) .circuit-editor';
  const style = (p) => p.eval(() => window.Silinx.active.circuitEditor.wireStyle());
  const disk = async () => JSON.parse(await readWs(env, 'WireCirc', F));
  await makeProject(env, { name: 'WireCirc', template: 'breadboard', board: 'basys2' });
  await page.openProject('WireCirc');
  await page.eval((p) => window.SilinxApp.openFile(p), F);
  await page.waitFor(() => !!window.Silinx.active?.circuitEditor, [], { what: 'the circuit open' });
  assert.equal(await style(page), 'direct');
  const link = await page.eval(async () => { const m = await import('/js/collab-share.js'); await m.startSharing('Ana'); return m.sharedLink(); });
  let fp;
  try {
    fp = await follow(link, 'Eva', 'WireCirc');
    await fp.waitFor((p) => window.Silinx.active?.path === p && !!window.Silinx.active.circuitEditor, [F], { what: 'the owner\'s circuit followed' });
    await sleep(700);
    // Eva: the Wires enabled though read only; Curved, hers alone
    assert.equal(await fp.eval((e) => [...document.querySelectorAll(`${e} .tb-more-menu [data-value]`)].some((b) => b.disabled), ED), false);
    await choose(fp, ED, 'curved');
    assert.equal(await style(fp), 'curved');
    assert.equal(await ticked(fp, ED), 'curved');
    await sleep(1000);
    assert.equal(await style(page), 'direct');
    assert.equal((await disk()).wireStyle, undefined);
    // Ana: Orthogonal, saved: her file; Eva's view stays Curved, the file arrived
    await choose(page, ED, 'orthogonal');
    await page.eval(() => window.SilinxApp.saveAll());
    await until(async () => (await disk()).wireStyle === 'orthogonal', 'Ana\'s style in her file');
    await sleep(1500);
    assert.equal(await style(fp), 'curved');
    assert.equal(await style(page), 'orthogonal');
    assert.deepEqual(await warnings(fp), []);
    assert.deepEqual(await warnings(page), []);
    assert.deepEqual(fp.errors, []);
  } finally { await fp?.close(); await page.eval(async () => (await import('/js/collab-share.js')).stopSharing()); }
}, { timeout: 150000 });
