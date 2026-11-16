// UI (#4244): the owner's Try it followed, the owner's and a viewer's pages, in both interfaces. A state diagram: the
// owner opens its Try it, sets an input and takes clock edges; the viewer's Try it is open with the same state, inputs,
// cycle, outputs and trace (a run's edges too); closed when the owner closes it; opened again by the owner, then the
// viewer's own click on an input is browsing alone (the owner's next edge not followed); Follow Ana catches up; the
// panel's labels in Portuguese. The exact console lines; no warnings.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject } from './harness.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;

const warnings = async (page) => (await page.consoleText()).split('\n').map((l) => l.trim()).filter((l) => /^(WARNING|AVISO|ERROR|ERRO)/.test(l));
async function join(link, name, project) {
  const p = await env.newPage(env.server.url);
  await p.waitFor(() => window.SilinxApp && window.Silinx?.startupChecked, [], { what: 'app boot' });
  await p.goto(`${new URL(link).origin}/?f=1${new URL(link).hash}`);
  await p.waitDialog('Follow a Shared Project');
  await p.fill('.dlg-overlay input[data-field=name]', name);
  await p.dialogButton('Follow');
  await p.waitFor((pj) => window.Silinx?.project?.name === pj && window.Silinx.startupChecked, [project], { what: 'the project open', timeout: 30000 });
  return p;
}
async function followAgain(fp, owner) {
  await fp.click('.collab-presence .collab-btn');
  await fp.waitForSelector('body > .menu-popup');
  await fp.click('body > .menu-popup .mi', { text: `Follow ${owner}` });
}
const browsingAlone = /^Browsing alone: Ana is no longer followed \(Follow Ana, in the toolbar, follows them again\)\.$/m;

const FSM = 'src/traffic.fsm.json', FD = '.doc:not([hidden]) ';
// its Try it as it shows it: open, the state, the outputs, the trace's rows, the inputs pressed
const fsmTry = (page) => page.eval((p) => {
  const d = window.SilinxApp.findDoc(`fsm:${p}`), t = d?.fsmEditor?.tryState();
  if (!d) return 'not open';
  if (!t) return null;
  const shown = (s) => [...document.querySelectorAll(s)].filter((e) => e.offsetParent);
  return { sum: t.sum, snap: t.snap, shown: shown('.fsm-sim-state, .fsm-sim-outputs .fsm-led, .fsm-trace tr').map((e) => e.textContent).join('|'),
    pressed: shown('.fsm-bit.on').map((b) => b.dataset.input) };
}, FSM);
// (text: false, the pages in two languages: their state only)
const sameTry = async (page, fp, what, { text = true } = {}) => {
  const strip = (x) => (x && !text ? { ...x, shown: null } : x);
  const want = strip(await fsmTry(page));
  for (const t = Date.now(); ;) {
    const got = strip(await fsmTry(fp));
    if (JSON.stringify(got) === JSON.stringify(want)) return want;
    if (Date.now() - t > 15000) throw new Error(`timed out: ${what}: ${JSON.stringify(got)} vs ${JSON.stringify(want)}`);
    await new Promise((r) => setTimeout(r, 100));
  }
};

uiTest('#4244 a viewer follows the owner\'s Try it of a state diagram: opened, an input, clock edges, a run, closed; its own click browses alone; Follow Ana catches up; Portuguese', E, async (page) => {
  await makeProject(env, { name: 'TryFsm', template: 'traffic' });
  await page.openProject('TryFsm');
  await page.eval((p) => window.SilinxApp.openFsm(p), FSM);
  await page.waitFor(() => window.Silinx.active?.fsmEditor?.fitted(), [], { what: 'the diagram open' });
  const link = await page.eval(async () => { const m = await import('/js/collab-share.js'); await m.startSharing('Ana'); return m.sharedLink(); });
  const fp = await join(link, 'Rui', 'TryFsm');
  try {
    await fp.waitFor((p) => window.Silinx.active?.path === p && window.Silinx.active.fsmEditor?.fitted(), [FSM], { what: 'the owner\'s diagram followed' });
    assert.equal(await fsmTry(fp), null, 'no Try it yet');
    // the owner opens Try it, presses req and takes two clock edges
    await page.click(`${FD}.try-btn`);
    await page.click(`${FD}.fsm-bit[data-input=req]`);
    await page.click(`${FD}.fsm-sim-step`);
    await page.click(`${FD}.fsm-sim-step`);
    await page.waitFor((p) => window.SilinxApp.findDoc(`fsm:${p}`).fsmEditor.tryState()?.snap.cycle === 2, [FSM], { what: 'the owner\'s two edges' });
    const two = await sameTry(page, fp, 'the owner\'s Try it, two edges');
    assert.equal(two.snap.cycle, 2);
    assert.deepEqual(two.pressed, ['req']);
    assert.equal(two.snap.trace.length, 2);
    assert.equal(two.sum.steps, 2);
    // a run: its edges followed (coalesced, as they come)
    await page.click(`${FD}.fsm-sim-step ~ .asm-small`, { text: '▶ Run' });
    await page.waitFor((p) => window.SilinxApp.findDoc(`fsm:${p}`).fsmEditor.tryState().snap.cycle >= 4, [FSM], { what: 'two edges of the run', timeout: 6000 });
    await page.click(`${FD}.fsm-sim-step ~ .asm-small`, { text: '■ Stop' });
    const ran = await sameTry(page, fp, 'the run\'s edges');
    assert.ok(ran.snap.cycle >= 4);
    // closed by the owner: closed here
    await page.click(`${FD}.try-btn`);
    await fp.waitFor((p) => window.SilinxApp.findDoc(`fsm:${p}`).fsmEditor.tryState() === null, [FSM], { what: 'closed at the viewer\'s' });
    // opened again (its inputs at 0 again, as a Try it opened); the viewer's own click on an input: browsing alone, the
    // owner's next edge not followed
    await page.click(`${FD}.try-btn`);
    assert.deepEqual((await sameTry(page, fp, 'opened again')).snap, { state: 's1', inputs: { req: 0, done: 0, night: 0 }, cycle: 0, trace: [] });
    await fp.click(`${FD}.fsm-bit[data-input=done]`);
    await fp.waitConsole(browsingAlone);
    const mine = await fsmTry(fp);
    assert.deepEqual(mine.pressed, ['done']);
    await page.click(`${FD}.fsm-sim-step`);
    await new Promise((r) => setTimeout(r, 1200));
    assert.deepEqual((await fsmTry(fp)).snap, mine.snap, 'not followed while browsing alone');
    // Follow Ana: her Try it again
    await followAgain(fp, 'Ana');
    await fp.waitConsole(/^Following Ana: their documents, views and selection\.$/m);
    const caught = await sameTry(page, fp, 'caught up');
    assert.deepEqual([caught.pressed, caught.snap.cycle], [[], 1]);
    // its labels in Portuguese, the owner's steps still followed
    await fp.eval(async () => (await import('/js/i18n.js')).setLanguage('pt'));
    await page.click(`${FD}.fsm-sim-step`);
    await sameTry(page, fp, 'followed in Portuguese', { text: false });
    assert.deepEqual(await fp.eval(() => [...document.querySelectorAll('.doc:not([hidden]) .fsm-sim .asm-label')].map((e) => e.textContent)), ['Estado', 'Entradas', 'Saídas']);
    assert.equal(await fp.eval(() => document.querySelector('.doc:not([hidden]) .try-btn span').textContent), 'Experimentar');
    await fp.eval(async () => (await import('/js/i18n.js')).setLanguage('en'));
    assert.deepEqual(await warnings(fp), []);
    assert.deepEqual(await warnings(page), []);
    assert.deepEqual(fp.errors, []);
  } finally { await fp.close(); await page.eval(async () => (await import('/js/collab-share.js')).stopSharing()); }
}, { timeout: 150000 });

const SCH = 'src/gates.sch.json';
// a schematic's Try it as the page shows it: open, its steps and values, each I/O marker's level drawn
const schTry = (page) => page.eval((p) => {
  const ed = window.SilinxApp.findDoc(`sch:${p}`)?.schEditor;
  if (!ed) return 'not open';
  const t = ed.tryState();
  if (!t) return null;
  return { sum: t.sum, levels: [...document.querySelectorAll('.doc:not([hidden]) .lv-ctl[data-port], .doc:not([hidden]) .lv-out[data-port]')].map((e) => `${e.dataset.port}:${e.getAttribute('class')}`).sort() };
}, SCH);
const sameSch = async (page, fp, what) => {
  const want = await schTry(page);
  for (const t = Date.now(); ;) {
    const got = await schTry(fp);
    if (JSON.stringify(got) === JSON.stringify(want)) return want;
    if (Date.now() - t > 15000) throw new Error(`timed out: ${what}: ${JSON.stringify(got)} vs ${JSON.stringify(want)}`);
    await new Promise((r) => setTimeout(r, 100));
  }
};

// sw (a 4-bit bus) given a value in Try it's editor of it, as the user does: its marker clicked, the value typed, Enter
async function setSw(p, v) {
  await p.click(`${FD}.lv-ctl[data-port=P1]`);
  await p.waitForSelector(`${FD}.lv-edit-in`);
  await p.eval((x) => { const f = document.querySelector('.doc:not([hidden]) .lv-edit-in'); f.value = x; f.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); }, v);
}

uiTest('#4244 a viewer follows the owner\'s Try it of a schematic: started, its input set (its steps replayed), stopped; its own click browses alone; Follow Ana catches up', E, async (page) => {
  await makeProject(env, { name: 'TrySch', template: 'gates' });
  await page.openProject('TrySch');
  await page.eval((p) => window.SilinxApp.openSch(p), SCH);
  await page.waitFor(() => !!window.Silinx.active?.schEditor, [], { what: 'the schematic open' });
  const link = await page.eval(async () => { const m = await import('/js/collab-share.js'); await m.startSharing('Ana'); return m.sharedLink(); });
  const fp = await join(link, 'Rui', 'TrySch');
  try {
    await fp.waitFor((p) => window.Silinx.active?.path === p && !!window.Silinx.active.schEditor, [SCH], { what: 'the owner\'s schematic followed' });
    assert.equal(await schTry(fp), null, 'no Try it yet');
    // the owner starts Try it: the viewer's too, sw at 0
    await page.click(`${FD}.se-btn[data-act=sim]`);
    await page.waitFor(() => !!window.Silinx.active.schEditor.tryState(), [], { what: 'the owner\'s Try it' });
    const s0 = await sameSch(page, fp, 'the owner\'s Try it started');
    assert.deepEqual([s0.sum.inputs, s0.sum.steps], [{ sw: '0' }, 0]);
    // sw set to 1, 0, then 1: the steps replayed, its markers' levels and the LEDs the owner's
    for (const v of ['1', '0', '1']) await setSw(page, v);
    await page.waitFor(() => window.Silinx.active.schEditor.tryState().sum.steps === 3, [], { what: 'three values' });
    const s3 = await sameSch(page, fp, 'three values');
    const one = s3.sum.inputs.sw;
    assert.notEqual(one, s0.sum.inputs.sw);
    // stopped by the owner: stopped here
    await page.key('Escape');
    await fp.waitFor((p) => window.SilinxApp.findDoc(`sch:${p}`).schEditor.tryState() === null, [SCH], { what: 'stopped at the viewer\'s' });
    // started again: its sw kept from the last Try it, as the owner's (#2106); the viewer's own flip browses alone
    await page.click(`${FD}.se-btn[data-act=sim]`);
    await page.waitFor(() => !!window.Silinx.active.schEditor.tryState(), [], { what: 'the owner\'s Try it again' });
    const again = await sameSch(page, fp, 'started again');
    assert.deepEqual([again.sum.inputs, again.sum.steps], [{ sw: one }, 0]);
    await setSw(fp, '0');
    await fp.waitConsole(browsingAlone);
    await setSw(page, '0');
    await setSw(page, '1');
    await new Promise((r) => setTimeout(r, 1200));
    assert.deepEqual((await schTry(fp)).sum.inputs, s0.sum.inputs, 'its own value, the owner\'s not followed');
    // Follow Ana: her Try it again (replayed from its start)
    await followAgain(fp, 'Ana');
    const caught = await sameSch(page, fp, 'caught up');
    assert.deepEqual([caught.sum.inputs, caught.sum.steps], [{ sw: one }, 2]);
    assert.deepEqual(await warnings(fp), []);
    assert.deepEqual(await warnings(page), []);
    assert.deepEqual(fp.errors, []);
  } finally { await fp.close(); await page.eval(async () => (await import('/js/collab-share.js')).stopSharing()); }
}, { timeout: 150000 });
