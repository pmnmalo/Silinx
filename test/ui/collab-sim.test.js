// UI: a viewer follows the owner's simulation (#4002, part 3), two participants in one test, in both interfaces: the
// owner simulates, then runs on and moves its cursor, then restarts: the viewer's own SSim runs to the same time
// (the same values), shows the same cursor, signals and zoom, and restarts too; the viewer's own click on its waves (its
// cursor moved) is browsing alone (the owner's next run not followed), Follow Ana catches up. No warnings at either page.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject } from './harness.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;

const warnings = async (page) => (await page.consoleText()).split('\n').map((l) => l.trim()).filter((l) => /^(WARNING|AVISO|ERROR|ERRO)/.test(l));
async function join(link, name) {
  const p = await env.newPage(env.server.url);
  await p.waitFor(() => window.SilinxApp && window.Silinx?.startupChecked, [], { what: 'app boot' });
  await p.goto(`${new URL(link).origin}/?f=1${new URL(link).hash}`);
  await p.waitDialog('Follow a Shared Project');
  await p.fill('.dlg-overlay input[data-field=name]', name);
  await p.dialogButton('Follow');
  await p.waitFor(() => window.Silinx?.project?.name && window.Silinx.startupChecked, [], { what: 'the project open', timeout: 30000 });
  return p;
}
// the SSim of tb_gates: its time, view, and its Objects' values (when no run goes on)
const ssim = (page) => page.eval(() => {
  const v = window.SilinxApp.findDoc('isim:tb_gates')?.view;
  if (!v?.state || v.state.running) return null;
  const s = v.getState();
  return { now: v.now, cursor: s.cursor, rows: s.rows.map((r) => r.path || r.name), scale: s.scale, fit: s.fit, values: [...v.state.rows].map((r) => r.sig?.path).join(','), objects: [...document.querySelectorAll('.doc:not([hidden]) .isim-objs tbody tr')].map((t) => t.textContent).join('|') };
});
// the viewer's SSim as the owner's: both read again at each look (#4210: the owner's own Objects are drawn at its next
// frame, after a run or a restart, so what it showed at first may not be what it settles on)
const same = async (page, fp, what, timeout = 20000) => {
  const t0 = Date.now();
  for (;;) {
    const want = await ssim(page), got = await ssim(fp);
    if (want && JSON.stringify(got) === JSON.stringify(want)) return want;
    if (Date.now() - t0 > timeout) throw new Error(`timed out after ${timeout} ms waiting for ${what}: ${JSON.stringify(got)}, the owner's ${JSON.stringify(want)}`);
    await new Promise((r) => setTimeout(r, 50));
  }
};
const owner = (page, fn, ...a) => page.eval(fn, ...a);

uiTest('#4002 a viewer follows the owner\'s simulation: run on, the cursor, a restart; its own click on the waves browses alone; Follow Ana catches up', E, async (page) => {
  await makeProject(env, { name: 'GatesSim', template: 'gates' });
  await page.openProject('GatesSim');
  const link = await page.eval(async () => { const m = await import('/js/collab-share.js'); await m.startSharing('Ana'); return m.sharedLink(); });
  const fp = await join(link, 'Rui');
  try {
    await page.eval(() => window.SilinxApp.runSimulation('tb_gates'));
    await page.waitFor(() => window.SilinxApp.findDoc('isim:tb_gates')?.view?.now >= 1_000_000 && !window.SilinxApp.findDoc('isim:tb_gates').view.state.running, [], { what: 'the owner\'s SSim', timeout: 30000 });
    const first = await same(page, fp, 'the viewer\'s SSim as the owner\'s');
    assert.equal(first.now, 1_000_000);
    // the owner runs on and moves its cursor
    await owner(page, () => window.SilinxApp.findDoc('isim:tb_gates').view.runFor(500_000));
    await page.waitFor(() => window.SilinxApp.findDoc('isim:tb_gates').view.now === 1_500_000 && !window.SilinxApp.findDoc('isim:tb_gates').view.state.running, [], { what: 'run on' });
    await owner(page, () => window.SilinxApp.findDoc('isim:tb_gates').view.setState({ cursor: 80_000 }));
    const on = await same(page, fp, 'run on, the cursor moved');
    assert.deepEqual([on.now, on.cursor], [1_500_000, 80_000]);
    // the owner restarts: the viewer too
    await owner(page, () => window.SilinxApp.findDoc('isim:tb_gates').view.restart());
    const back = await same(page, fp, 'restarted');
    assert.equal(back.now, 0);
    // the viewer's click on its waves: browsing alone; the owner's next run not followed
    await owner(page, () => window.SilinxApp.findDoc('isim:tb_gates').view.runFor(300_000));
    await same(page, fp, 'run again');
    await fp.click('.doc:not([hidden]) .isim-waves');
    await fp.waitConsole(/^Browsing alone: Ana is no longer followed \(Follow Ana, in the toolbar, follows them again\)\.$/m);
    await owner(page, () => window.SilinxApp.findDoc('isim:tb_gates').view.runFor(200_000));
    await page.waitFor(() => window.SilinxApp.findDoc('isim:tb_gates').view.now === 500_000 && !window.SilinxApp.findDoc('isim:tb_gates').view.state.running, [], { what: 'the owner ran on' });
    await new Promise((r) => setTimeout(r, 1000));
    assert.equal(await fp.eval(() => window.SilinxApp.findDoc('isim:tb_gates').view.now), 300_000, 'not followed while browsing alone');
    // Follow Ana: caught up
    await fp.click('.collab-presence .collab-btn');
    await fp.waitForSelector('body > .menu-popup');
    await fp.click('body > .menu-popup .mi', { text: 'Follow Ana' });
    const caught = await same(page, fp, 'caught up');
    assert.equal(caught.now, 500_000);
    assert.deepEqual(await warnings(fp), []);
    assert.deepEqual(await warnings(page), []);
    assert.deepEqual(fp.errors, []);
  } finally { await fp.close(); await page.eval(async () => (await import('/js/collab-share.js')).stopSharing()); }
});
