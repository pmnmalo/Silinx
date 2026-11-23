// Usability (#5206, phase 6): a person with a keyboard and no mouse (lib/key-actions.js: Tab, the arrows, Enter; the ISE
// style's menu bar by F10, the command palette by Ctrl+K where the Silinx interface has no menu bar), the sessions of
// phases 1 and 3: the counter typed in its empty file (lib/hdl-session.js: its characters, Enter, the indentation by
// Backspace and Tab, a completion by Enter), Check Syntax from the Process menu, the mistake found and fixed by the
// arrows, Edit ▸ Undo to the start and Redo; the traffic's state diagram opened from the Design tree (↓, Enter), zoomed
// by its keys (+, -, F), a state renamed and a condition edited in its transition table (Tab, Enter), Check (Tab,
// Enter), Edit ▸ Undo and Redo; the gates' bench simulated from the menus and its waves read by the keys (↓ a row, → and
// ← its changes, + zoom, M a marker, F the full view), the values at the cursor the reference simulator's. The console's
// lines exactly. In both interfaces (SILINX_UI_INTERFACE=ise) and in Portuguese (SILINX_USABILITY_LANG=pt).
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject, readWs } from '../ui/harness.js';
import { Session, RUN } from './lib/session.js';
import { HdlSession } from './lib/hdl-session.js';
import { DESIGNS } from './lib/hdl-designs.js';
import { editorState, tr } from './lib/hdl-actions.js';
import { drawKit } from './lib/draw-kit.js';
import { keyActions } from './lib/key-actions.js';
import { viewOfTransform } from './lib/touch-actions.js';
import { waveKit, waveReference } from './lib/wave-kit.js';
import { consoleCount } from './lib/project-actions.js';
import { sameLines, diskFiles } from './lib/hier-kit.js';

const FILE = 'test/usability/keyboard.test.js';
let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const near = (a, b, tol, what) => assert.ok(Math.abs(a - b) <= tol, `${what}: ${a} is not ${b} ± ${tol}`);

/** A project opened in the run's language, the keyboard on the page (nothing focused), its menus by the keyboard (the
 *  page's `menu`, which the sessions' Edit ▸ Undo and Redo use, too); the console's lines checked from there on. */
async function keyProject(page, name, files) {
  await makeProject(env, { name, ...files });
  await page.openProject(name);
  if (RUN.lang !== 'en') await page.eval(async (l) => { (await import('/js/i18n.js')).setLanguage(l); }, RUN.lang);
  const K = keyActions(page);
  page.menu = (m, i) => K.menu(m, i);
  let n = await consoleCount(page);
  for (let k = 0, m = -1; k < 40 && n !== m; k++) { await sleep(250); m = n; n = await consoleCount(page); }
  await page.eval(() => document.activeElement?.blur());
  const lines = async (want) => { await sameLines(page, n, want); n = await consoleCount(page); };
  return { K, lines };
}

// Check Syntax of the counter, from the Process menu: its lines with the mistake (a ';' left out: not elaborated), and
// once fixed
const D = DESIGNS.vhdl;
const CHECKED = ['Started : "Check Syntax".', 'Parsing VHDL file "src/counter.vhd" into library work'];
const FAILED = [...CHECKED, 'ERROR:HDLCompiler - "src/counter.vhd" Line 21: expected \';\' after \'1\'', 'Process "Check Syntax" failed (1 error(s), 0 warning(s))'];
const CLEAN = [...CHECKED, 'Elaborating top module <counter>: 5 signals, 2 processes.', 'Process "Check Syntax" completed successfully'];

uiTest('usability: keyboard: the counter typed in its file, Check Syntax from the Process menu, the mistake fixed by the arrows, Undo to the start and Redo; no mouse', E, async (page) => {
  const { K, lines } = await keyProject(page, 'UsabKeyHdl', { files: { [D.file]: '' }, top: 'counter' });
  // the file from the Design tree (↓ to its row, Enter): its text editor, then Tab to it (the keyboard left in the
  // tree, #5300)
  await K.treeTo('counter.vhd');
  await page.key('Enter');
  await page.waitFor((p) => window.Silinx.active?.id === `file:${p}` && window.Silinx.active.editor?.view, [D.file], { what: 'the file in its editor' });
  await K.tabTo('.doc:not([hidden]) .cm-content');
  const s = new HdlSession(page, env, { file: FILE, title: 'keyboard: the counter' });
  s.docs.push(await s.settled());
  await s.typeDesign('vhdl');
  await lines([]);
  // Check Syntax from the Process menu (the module's row selected in the Design tree first: ↓ to it): the error
  const check = async (want) => {
    let got;
    await s.step('Check Syntax', {}, async () => {
      const n = await consoleCount(page);
      await K.menuEn('Process', 'Check Syntax');
      await page.waitFor((k) => [...document.querySelectorAll('#console-log .ln')].slice(k).some((l) => /^(Process|Processo) "/.test(l.textContent)), [n], { what: 'Check Syntax done', timeout: 30000 });
      got = n;
    }, { changes: false, expect: () => sameLines(page, got, want) });
    await lines(want);
  };
  await K.treeTo('counter');
  await check(FAILED);
  // back in the editor (Tab to it), up to the line with the arrows, End, the ';' typed
  const before = s.doc;
  await s.step('fix', D.fix, async () => {
    await K.tabTo('.doc:not([hidden]) .cm-content');
    for (let k = (await editorState(page)).line; k > D.fix.line; k--) await page.key('ArrowUp');
    for (let k = (await editorState(page)).line; k < D.fix.line; k++) await page.key('ArrowDown');
    await page.key('End');
    await s.a.typeLine(D.fix.type);
    s.model.endOf(D.fix.line);
    s.model.typeAll(D.fix.type);
  }, { expect: (text) => assert.equal(text, D.text) });
  await K.treeTo('counter', { up: true });
  await check(CLEAN);
  // Edit ▸ Undo to the empty file (the first from the menu, by the keyboard; then Ctrl+Z), Redo to the end
  await K.tabTo('.doc:not([hidden]) .cm-content');
  await s.undoRedo({ first: before });
  await lines([]);
  await page.waitFor(async (p, f, t) => (await (await fetch(`/api/projects/${p}/file?path=${encodeURIComponent(f)}`)).text()) === t, ['UsabKeyHdl', D.file, D.text], { what: 'the file saved', timeout: 15000 });
  assert.equal(await readWs(env, 'UsabKeyHdl', D.file), D.text);
}, { timeout: 180000 });

// the state diagram's kit, its Check its button reached by Tab and pressed by Enter
const FSM_KIT = drawKit('fsm', (page, b) => {
  const K = keyActions(page);
  return {
    async check() {
      const n0 = await page.eval(() => document.getElementById('console-log').textContent.length);
      await K.tabTo(`${b.ed} .fsm-check`, { back: true });
      await page.key('Enter');
      await page.waitFor((n) => document.getElementById('console-log').textContent.length > n, [n0], { what: 'checked' });
      await sleep(300);
      return page.eval((n) => document.getElementById('console-log').textContent.slice(n), n0);
    },
  };
});
const state = (d, name) => d.states.find((x) => x.name === name);

uiTest('usability: keyboard: the traffic\'s state diagram: opened from the Design tree, zoomed by its keys, a state renamed and a condition edited in its transition table, Check, Undo and Redo; no mouse', E, async (page) => {
  const { K, lines } = await keyProject(page, 'UsabKeyFsm', { template: 'traffic' });
  await K.treeTo('u_fsm');
  await page.key('Enter');
  await page.waitFor(() => window.Silinx.active?.fsmEditor, [], { what: 'the state diagram' });
  await sleep(300);
  const s = new Session(page, env, { file: FILE, title: 'keyboard: traffic: the state diagram', kit: FSM_KIT });
  s.docs.push(await s.settled());
  const ed = '.doc:not([hidden]) .fsm-editor';
  // the diagram's own keys (Tab to it): + zooms in, - out, F the full view; the diagram as it was
  await K.tabTo(ed);
  const view = async () => viewOfTransform(await page.eval((e) => document.querySelector(`${e} .fsm-vp`).getAttribute('transform'), ed));
  let v0;
  for (const [key, k] of [['+', 1.2], ['-', 1 / 1.2]]) {
    await s.step('key', { key }, async () => { v0 = await view(); await page.key(key); }, { changes: false, expect: async () => near((await view()).s / v0.s, k, 0.01, `${key}: the zoom`) });
  }
  await s.step('key', { key: 'f' }, () => page.key('f'), { changes: false });
  // the transition table: its button (Tab), Enter
  await K.tabTo(`${ed} .fsm-tab-btn:not(.try-btn)`);
  await page.key('Enter');
  await page.waitFor((e) => document.querySelector(`${e} .fsm-tt-state`), [ed], { what: 'the transition table' });
  // CARS renamed: Tab to its name's field (its text selected), GO typed, Tab
  await s.step('rename in the table', { state: 'CARS', to: 'GO' }, async () => {
    await K.tabTo(`${ed} .fsm-tt-state`);
    assert.equal(await page.eval(() => document.activeElement.value), 'CARS');
    await page.type('GO');
    await page.key('Tab');
  }, { expect: (d) => assert.equal(state(d, 'GO')?.id, 's1') });
  // the first condition: Tab to its cell, Enter, the field's text (selected) typed again in brackets, Enter
  let cond, id;
  await s.step('condition in the table', {}, async () => {
    await K.tabTo(`${ed} .fsm-tt-condcell`);
    id = await page.eval(() => document.activeElement.closest('tr').dataset.trans);
    await page.key('Enter');
    cond = await page.eval(() => document.activeElement.value);
    await page.type(`(${cond})`);
    await page.key('Enter');
  }, { expect: (d) => assert.equal(d.transitions.find((x) => x.id === id).cond, `(${cond})`) });
  await s.warnings([]);
  const stays = (st, when) => `INFO: State ${st}: no transition is true when ${when}; the machine stays in ${st}`;
  await lines(['Started : "Check State Diagram" of traffic.fsm.json.', stays('GO', 'req=0, done=0, night=0 (and 2 other combination(s))'),
    ...['CARS_YELLOW', 'ALL_RED', 'WALK', 'WALK_END', 'ALL_RED_2'].map((st) => stays(st, 'done=0')), stays('NIGHT', 'night=1'), 'Process "Check State Diagram" completed successfully']);
  await s.undoRedo();
  await lines([]);
}, { timeout: 180000 });

// the gates' bench simulated: its Check Syntax, the model built, SSim's lines (the Silinx interface's Simulate: the bench
// its top first)
const GATES_SIM = (silinx) => [...(silinx ? ["Top-level simulation module set to 'tb_gates'."] : []), 'Started : "Behavioral Check Syntax".',
  'Parsing VHDL file "src/gates.vhd" into library work', 'Parsing VHDL file "sim/tb_gates.vhd" into library work', 'Elaborating top module <tb_gates>: 22 signals, 22 processes.',
  'Process "Check Syntax" completed successfully', 'Started : "Simulate Behavioral Model".', "Building simulation model for top 'tb_gates'...",
  'Simulation model ready: 22 signals, 22 processes. Launching SSim view.', 'SSim (Silinx behavioural simulator)', 'Time resolution is 1 ps',
  'Simulator is doing circuit initialization process.', 'Finished circuit initialization process.', 'SSim> run 1 us', 'at 160 ns: Note: Simulation finished OK (tb_gates.vhd:49)'];

uiTest('usability: keyboard: the gates\' bench simulated from the menus, its waves read by the keys (a row, its changes, zoom, a marker, the full view); no mouse', E, async (page) => {
  const { K, lines } = await keyProject(page, 'UsabKeyWaves', { template: 'gates' });
  // the ISE style: View ▸ Simulation, the bench's row (↓), Process ▸ Simulate Behavioral Model; the Silinx interface:
  // the Simulate task's button (Tab, Enter), its panel's Simulate tb_gates
  if (await page.eval(() => document.documentElement.dataset.layout === 'tasks')) {
    await K.tabTo('#task-switch .task-btn[data-task="sim"]');
    await page.key('Enter');
    const [simL] = await tr(page, ['Simulate tb_gates']);
    await page.waitFor((l) => [...document.querySelectorAll('#task-sim-panel [role=button]')].some((b) => (b.getAttribute('aria-label') || b.title || b.textContent).trim() === l), [simL], { what: simL });
    await K.tabTo('#task-sim-panel [role=button]', { text: simL });
    await page.key('Enter');
  } else {
    await K.menuEn('View', 'Simulation');
    await K.treeTo('tb_gates');
    await K.menuEn('Process', 'Simulate Behavioral Model');
  }
  await page.waitFor(() => /^isim:/.test(window.Silinx.active?.id || '') && window.Silinx.active.view && !window.Silinx.active.view.state.running, [], { what: 'the bench simulated', timeout: 60000 });
  await sleep(300);
  await lines(GATES_SIM(await page.eval(() => document.documentElement.dataset.layout === 'tasks')));
  const files = Object.entries(await diskFiles(env, 'UsabKeyWaves')).map(([path, text]) => ({ path, text }));
  const ref = waveReference(files, 'tb_gates', await page.eval(() => window.Silinx.active.view.state.now ?? window.Silinx.active.view.sim?.now));
  const s = new Session(page, env, { file: FILE, title: 'keyboard: gates: the waves', hdl: false, kit: waveKit(ref) });
  s.docs.push(await s.settled());
  // the waves (Tab to them): ↓ selects the first row; ← and → its changes before and after the cursor
  await K.tabTo('.doc:not([hidden]) .isim-waves');
  await s.step('key', { key: 'ArrowDown' }, () => page.key('ArrowDown'), { changes: false });
  for (const key of ['ArrowLeft', 'ArrowLeft', 'ArrowRight']) {
    await s.step('key', { key }, () => page.key(key), { expect: (d, b) => assert.ok(key === 'ArrowLeft' ? d.cursor < b.cursor : d.cursor > b.cursor, `the cursor from ${b.cursor} to ${d.cursor}`) });
  }
  await s.step('key', { key: '+' }, () => page.key('+'), { expect: (d, b) => near(b.scale / d.scale, 2, 1e-9, 'zoomed in') });
  await s.step('key', { key: 'm' }, () => page.key('m'), { expect: (d) => assert.deepEqual(d.markers, [d.cursor]) });
  await s.step('key', { key: 'f' }, () => page.key('f'), { expect: (d) => assert.equal(d.fit, true) });
  await lines([]);
}, { timeout: 120000 });

// (#5300: a file opened from the command palette left the keyboard on the page, not in its editor)
uiTest('usability: keyboard: a file opened from the command palette has the keyboard in its editor (#5300)', E, async (page, _env, t) => {
  t.todo('#5300: the keyboard left on the page after the palette opened a file');
  const { K } = await keyProject(page, 'UsabKeyPalette', { files: { [D.file]: D.text }, top: 'counter' });
  await K.palette('counter.vhd', D.file);
  await page.waitFor((p) => window.Silinx.active?.id === `file:${p}`, [D.file], { what: 'the file in its editor' });
  assert.ok(await page.eval(() => !!document.activeElement?.closest('.doc:not([hidden]) .cm-editor')), `the keyboard on ${await K.where()}, not in the editor`);
});
