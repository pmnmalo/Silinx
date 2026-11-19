// UI: every task's side panel resized by dragging its right edge (#4627): Design's, Implement's and Emulate's (#left,
// its splitter #v-split) and Simulate's, with nothing simulated (#task-sim-panel) and with a simulation open (SSim's
// Instances and Objects), by the same splitter (web/js/ui.js splitter, LEFT_SPLIT; Simulate's handle
// web/js/tasks-sim-split.js): one width for every task, between 180 px and 700 px (at most 45 % of the work area),
// remembered across a task switch and a reload; folded or maximized, no handle; on a narrow screen dragged too. The ISE
// style interface: its side panel's splitter and SSim's own as they were. No warnings.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject } from './harness.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;
// the Tasks interface is a development build's only, for now (#838)
const DEV = { commit: 'abc1234', date: '2026-10-21 12:00' };

async function boot(page, ui) {
  await page.eval((u) => localStorage.setItem('silinx.ui', u), ui);
  await page.reload();
  await page.waitFor(() => window.SilinxApp && document.querySelector('#menubar .item') && window.Silinx?.startupChecked, [], { what: 'app boot' });
}
async function noWarnings(page) {
  assert.deepEqual(page.console.filter((c) => c.type === 'warning' || c.type === 'warn').map((c) => c.text), []);
  assert.deepEqual(await page.eval(() => [document.getElementById('warn-count').textContent, ...[...document.querySelectorAll('#console-warnings .diag')].map((d) => d.textContent)]), ['']);
}
// (the header's switcher, or on a narrow screen the tab bar at the bottom)
const task = async (page, t) => {
  const bar = await page.eval(() => (document.getElementById('task-switch').getClientRects().length ? '#task-switch' : '#task-tabs'));
  await page.click(`${bar} .task-btn[data-task="${t}"]`);
  await page.waitFor((t) => document.documentElement.dataset.task === t, [t], { what: t });
};
// the side panel shown now (Simulate's: its own, or SSim's), its width and what is under its right edge (after two frames:
// the handle follows the edge, a ResizeObserver's)
const side = (page) => page.eval(async () => {
  await new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res)));
  const shown = (e) => !!e && e.getClientRects().length > 0 && e.getBoundingClientRect().width > 0;
  const sim = document.documentElement.dataset.task === 'sim';
  const el = sim ? [document.getElementById('task-sim-panel'), document.querySelector('.doc:not([hidden]) .isim .isim-left')].find(shown)
    : document.getElementById('left-pages')?.closest('#left');
  if (!shown(el)) return { width: 0, handle: false };
  const r = el.getBoundingClientRect(), x = Math.round(r.right), y = Math.round(r.top + r.height / 2), at = document.elementFromPoint(x, y);
  return { what: el.id || el.className, width: Math.round(r.width), x, y, handle: !!at && getComputedStyle(at).cursor === 'col-resize', on: at?.id || at?.className,
    ws: document.getElementById('workspace').clientWidth };
});
const stored = (page) => page.eval(async () => localStorage.getItem((await import('/js/prefs.js')).prefKey('xl.leftW')));
const near = (a, b, d = 2) => Math.abs(a - b) <= d;
// dragged by `dx`: the panel's width after
async function drag(page, dx) {
  const g = await side(page);
  assert.ok(g.handle, `a handle on the side panel's edge: ${JSON.stringify(g)}`);
  await page.drag({ x: g.x, y: g.y }, { x: g.x + dx, y: g.y });
  return side(page);
}
// the panel dragged 40 px wider: its width, the one kept
async function widen(page, what) {
  const g0 = await side(page), g1 = await drag(page, 40);
  assert.ok(near(g1.width, g0.width + 40), `${what}: 40 px wider ${JSON.stringify([g0, g1])}`);
  assert.ok(near(Number.parseFloat(await stored(page)), g1.width), `${what}: remembered ${await stored(page)} ${g1.width}`);
  return g1.width;
}

uiTest('#4627 Tasks: every task\'s side panel resized by its edge, Simulate\'s too (nothing simulated, a simulation open), one width remembered', E, async (page) => {
  await makeProject(env, { name: 'TasksSideResize', template: 'blinky' });
  await page.setViewport(1366, 768);
  await boot(page, 'tasks');
  await page.eval(async () => localStorage.removeItem((await import('/js/prefs.js')).prefKey('xl.leftW')));
  await page.openProject('TasksSideResize');
  // each task in turn: its panel as wide as the last one left it, dragged wider
  let w = null;
  for (const t of ['edit', 'impl', 'emu', 'sim', 'edit']) {
    await task(page, t);
    const g = await side(page);
    if (w != null) assert.ok(near(g.width, w), `${t}: the width the other task left ${g.width} ${w}`);
    w = await widen(page, t);
  }
  // Simulate's own panel: the limits (180 px; 700 px, at most 45 % of the work area)
  await task(page, 'sim');
  assert.ok(near(await side(page).then((g) => g.width), w), 'sim: the width Design left');
  assert.equal((await drag(page, -2000)).width, 180, 'sim: the minimum');
  const gMax = await drag(page, 3000);
  assert.ok(near(gMax.width, Math.min(700, Math.round(gMax.ws * 0.45))), `sim: the maximum ${JSON.stringify(gMax)}`);
  await drag(page, -(gMax.width - 400));
  w = (await side(page)).width;
  assert.ok(near(w, 400), `sim: back to 400 px: ${w}`);
  // folded, then maximized: no handle; open again, the width kept
  await page.click('#task-view [data-act="side"]');
  await page.waitFor(() => document.documentElement.dataset.side === 'folded', [], { what: 'folded' });
  assert.equal(await page.eval(() => getComputedStyle(document.getElementById('task-sim-split')).display), 'none', 'folded: no handle');
  await page.click('#task-view [data-act="side"]');
  await page.click('#task-view [data-act="max"]');
  assert.equal(await page.eval(() => getComputedStyle(document.getElementById('task-sim-split')).display), 'none', 'maximized: no handle');
  await page.click('#task-view [data-act="max"]');
  assert.ok(near((await side(page)).width, w), 'open again: the width kept');
  // a simulation open: SSim's Instances and Objects as wide, dragged by the same handle (SSim's own splitter not shown)
  await page.click('#task-sim-panel .task-sim-bench .row.sel');
  await page.waitFor(() => document.querySelector('.doc:not([hidden]) .isim .isim-wavewin') && /Sim Time: 1,000,000 ps/.test(document.querySelector('.doc:not([hidden]) .isim-st-time')?.textContent || '')
    && !window.Silinx.active.view.state.running, [], { what: 'ISim ran', timeout: 30000 });
  const gs = await side(page);
  assert.ok(near(gs.width, w, 4) && /isim-left/.test(gs.what), `the simulation's side panel as wide ${JSON.stringify(gs)} ${w}`);
  assert.equal(gs.on, 'task-sim-split', 'the same handle');
  assert.equal(await page.eval(() => getComputedStyle(document.querySelector('.doc:not([hidden]) .isim-split-main')).display), 'none', 'SSim\'s own splitter not shown');
  w = await widen(page, 'a simulation');
  // the waves and the simulations' tabs beside it
  const gap = await page.eval(() => Math.round(document.querySelector('.doc:not([hidden]) .isim-wavewin').getBoundingClientRect().left - document.querySelector('.doc:not([hidden]) .isim-left').getBoundingClientRect().right));
  assert.ok(gap >= 0 && gap <= 6, `the waves beside the panel: ${gap}`);
  // Implement as wide; after a reload too, Simulate's as wide
  await task(page, 'impl');
  assert.ok(near((await side(page)).width, w, 4), 'impl: the simulation\'s width');
  await boot(page, 'tasks');
  await page.waitFor(() => document.documentElement.dataset.task === 'impl' && document.getElementById('left')?.offsetWidth > 0, [], { what: 'impl again' });
  assert.ok(near((await side(page)).width, w, 4), 'reloaded: impl\'s width');
  await task(page, 'sim');
  assert.ok(near((await side(page)).width, w, 4), 'reloaded: Simulate\'s width');
  await noWarnings(page);
}, { build: DEV, timeout: 150000 });

uiTest('#4627 Tasks ▸ Simulate on a narrow screen: its side panel dragged too (at most 45 % of the work area)', E, async (page) => {
  await makeProject(env, { name: 'TasksSideNarrow', template: 'blinky' });
  await page.setViewport(900, 700);
  await boot(page, 'tasks');
  await page.openProject('TasksSideNarrow');
  await task(page, 'sim');
  const g0 = await side(page), g1 = await drag(page, -60);
  assert.ok(near(g1.width, g0.width - 60), `narrower ${JSON.stringify([g0, g1])}`);
  const g2 = await drag(page, 2000);
  assert.ok(near(g2.width, Math.round(g2.ws * 0.45)), `at most 45 % ${JSON.stringify(g2)}`);
  await noWarnings(page);
}, { build: DEV });

uiTest('#4627 ISE style: the side panel\'s splitter and SSim\'s own as they were', E, async (page) => {
  await makeProject(env, { name: 'IseSideResize', template: 'blinky' });
  await page.setViewport(1366, 768);
  await boot(page, 'ise');
  await page.openProject('IseSideResize');
  const left = () => page.eval(() => document.getElementById('left').offsetWidth);
  const w0 = await left(), v = await page.eval(() => { const r = document.getElementById('v-split').getBoundingClientRect(); return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }; });
  await page.drag(v, { x: v.x + 50, y: v.y });
  assert.ok(near(await left(), w0 + 50), 'the side panel 50 px wider');
  assert.ok(near(Number.parseFloat(await stored(page)), w0 + 50), 'remembered');
  await page.eval(() => import('/js/viewers.js').then((v) => v.runSimulation(window.Silinx.project.simTop || 'blinky_tb')));
  await page.waitFor(() => document.querySelector('.doc:not([hidden]) .isim .isim-split-main')?.getClientRects().length > 0, [], { what: 'ISim', timeout: 30000 });
  const sp = await page.eval(() => { const r = document.querySelector('.doc:not([hidden]) .isim-split-main').getBoundingClientRect(); return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2), w: document.querySelector('.doc:not([hidden]) .isim-left').offsetWidth }; });
  assert.equal(sp.w, 290, 'SSim\'s Instances and Objects: 290 px, as ISim\'s');
  await page.drag(sp, { x: sp.x + 30, y: sp.y });
  assert.equal(await page.eval(() => document.querySelector('.doc:not([hidden]) .isim-left').offsetWidth), 320, 'SSim\'s own splitter');
  assert.equal(await page.eval(() => document.getElementById('task-sim-split')), null, 'no Simulate handle');
  await noWarnings(page);
});
