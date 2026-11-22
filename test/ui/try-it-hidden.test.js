// UI (#5276): every running Try it held while it is not seen, as the Board Emulator (#719, web/js/when-hidden.js):
// the state diagram's, the ASM chart's and the Petri net's Run, the circuit's clock source and the schematic's clock
// (the lock example's drawings). Running, behind another document tab: it stands still, and goes on when its tab is
// active again; the page hidden (another browser tab): the same; with the Board Emulator's When hidden setting on
// Keep running, it runs on in both. No warnings.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject } from './harness.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;
const DOC = '.doc:not([hidden])';

// the page hidden (another browser tab, a minimised window) or shown again
const setHidden = (page, on) => page.eval((x) => {
  if (x) Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
  else delete document.hidden;
  document.dispatchEvent(new Event('visibilitychange'));
}, on);
// the document tab `id` made the active one, as a click on it does
const activate = (page, id) => page.eval((i) => window.SilinxApp.S.docs.find((d) => d.id === i).tab
  .dispatchEvent(new MouseEvent('mousedown', { button: 0, bubbles: true })), id);
const setPref = (page, v) => page.eval(async (x) => (await import('/js/when-hidden.js')).setHiddenPref(x), v);
const warnings = async (page) => (await page.consoleText()).split('\n').map((l) => l.trim()).filter((l) => /^(WARNING|AVISO|ERROR|ERRO)/.test(l));

// each Try it: its file, its editor, how it is started running, the time between its steps (ms)
const TRIES = [
  { what: 'the state diagram', file: 'src/lock.fsm.json', ed: 'fsmEditor', ms: 1000, async start(page) {
    await page.click(`${DOC} .try-btn`);
    await page.click(`${DOC} .asm-codebar .asm-btn`, { text: '▶ Run' });
  } },
  { what: 'the ASM chart', file: 'src/timer.asm.json', ed: 'asmEditor', ms: 100, async start(page) {
    await page.click(`${DOC} .try-btn`);
    await page.eval((d) => { const s = document.querySelector(`${d} .asm-sim-rate`); s.value = '10'; s.dispatchEvent(new Event('change')); }, DOC);
    await page.click(`${DOC} .asm-sim-run`);
  } },
  { what: 'the Petri net', file: 'src/alarm.pn.json', ed: 'petriEditor', ms: 500, async start(page) {
    await page.click(`${DOC} .try-btn`);
    await page.click(`${DOC} .asm-codebar .asm-btn`, { text: '▶▶ Run' });
  } },
  { what: 'the circuit\'s clock source', file: 'src/sync.circ.json', ed: 'circuitEditor', ms: 500, async start(page) {
    await page.click(`${DOC} .try-btn`);
  } },
  { what: 'the schematic\'s clock', file: 'src/control.sch.json', ed: 'schEditor', ms: 100, async start(page) {
    await page.click(`${DOC} .se-btn[data-act=sim]`);
    await page.waitFor((d) => document.querySelector(`${d} .lv-run`), [DOC], { what: 'Try it' });
    await page.click(`${DOC} .lv-run`);
  } },
];

for (const T of TRIES) {
  uiTest(`#5276 ${T.what}'s Try it: held behind another document tab and while the page is hidden, on again when seen; Keep running runs on`, E, async (page) => {
    const name = `Hid_${T.ed}`;
    await makeProject(env, { name, template: 'lock' });
    await page.openProject(name);
    await page.eval(() => window.SilinxApp.openFile('src/top.vhd'));
    await page.eval((f) => window.SilinxApp.openFile(f), T.file);
    await page.waitFor((e) => window.Silinx.active?.[e], [T.ed], { what: 'the editor', timeout: 20000 });
    const id = await page.eval(() => window.Silinx.active.id);
    const other = await page.eval(() => window.SilinxApp.S.docs.find((d) => d.path === 'src/top.vhd').id);
    // its steps (the schematic's: its simulated time, its clock's cycles are not steps of its own)
    const steps = () => page.eval((i, e) => {
      const ed = window.SilinxApp.S.docs.find((d) => d.id === i)[e];
      return e === 'schEditor' ? Number(ed.liveSim?.now ?? -1) : ed.tryState()?.sum.steps ?? -1;
    }, id, T.ed);
    const advances = async (what) => {
      const n = await steps();
      for (const end = Date.now() + T.ms * 3 + 3000; await steps() <= n;) {
        if (Date.now() > end) throw new Error(`timed out: ${what}`);
        await new Promise((r) => setTimeout(r, 50));
      }
    };
    // (a step in flight let in first; then none for three of its periods)
    const standsStill = async (what) => {
      await new Promise((r) => setTimeout(r, 200));
      const n = await steps();
      await new Promise((r) => setTimeout(r, Math.max(1200, T.ms * 3)));
      assert.equal(await steps(), n, what);
    };
    await T.start(page);
    await advances('running');

    // behind another document tab: held; its tab active again: on
    await activate(page, other);
    await standsStill('held behind another document tab');
    await activate(page, id);
    await advances('running again');
    // the page hidden: held; shown again: on
    await setHidden(page, true);
    await standsStill('held while the page is hidden');
    await setHidden(page, false);
    await advances('running when shown again');

    // Keep running (the Board Emulator's When hidden setting, one for every Try it): it runs on
    await setPref(page, 'run');
    assert.equal(await page.eval(() => localStorage.getItem('silinx.emulator.hidden')), 'run');
    await activate(page, other);
    await advances('running behind another document tab');
    await activate(page, id);
    await setHidden(page, true);
    await advances('running while the page is hidden');
    await setHidden(page, false);
    // Pause again: held at once
    await setPref(page, 'pause');
    await activate(page, other);
    await standsStill('held again');
    await activate(page, id);
    await advances('on again');
    assert.deepEqual(await warnings(page), []);
    assert.deepEqual(page.dialogs, []);
  });
}
