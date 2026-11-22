// UI: simulating on a phone (#5121, web/css/phone.css, web/js/phone.js): under 600 px (375 × 812 and 430 × 932, with
// touch) Simulate's side panel is the Panels pane, the whole width (what to simulate; then SSim's Instances and
// Objects), and the waves the Document pane, the whole width, the names and values columns narrower (isim.js); in the
// ISE style interface SSim's window keeps its Instances and Objects, above its waves. The waves by touch: a finger
// places the cursor, two fingers scroll the time, a pinch zooms it (#674). A task with no document yet opens on its
// side panel. No warnings. In both interfaces (SILINX_UI_INTERFACE).
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject } from './harness.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;

const box = (page, sel) => page.eval((s) => { const e = document.querySelector(s); if (!e || !e.getClientRects().length) return null; const r = e.getBoundingClientRect(); return { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height), bottom: Math.round(r.bottom) }; }, sel);
const pane = (page) => page.eval(() => [document.documentElement.dataset.pane, [...document.querySelectorAll('#phone-panes .phone-pane')].filter((b) => b.getClientRects().length).map((b) => b.dataset.pane)]);
const frame = (page) => page.eval(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(true)))));
const state = (page) => page.eval(() => { const s = window.Silinx.active.view.state; return { t0: s.t0, scale: s.scale, cursor: s.cursor }; });
const near = (a, b, tol, what) => assert.ok(Math.abs(a - b) <= tol, `${what}: ${a} is not ${b} ± ${tol}`);
const plus = (p, dx, dy = 0) => ({ x: p.x + dx, y: p.y + dy });
async function noWarnings(page) {
  assert.deepEqual(page.console.filter((c) => c.type === 'warning' || c.type === 'warn').map((c) => c.text), []);
  assert.deepEqual(await page.eval(() => [document.getElementById('warn-count').textContent, ...[...document.querySelectorAll('#console-warnings .diag')].map((d) => d.textContent)]), ['']);
}
const ran = (page) => page.waitFor(() => /^isim:/.test(window.Silinx.active?.id || '') && window.Silinx.active.view && !window.Silinx.active.view.state.running
  && /Sim Time: 1,000,000 ps/.test(document.querySelector('.doc:not([hidden]) .isim-st-time')?.textContent || ''), [], { what: 'SSim ran 1 us', timeout: 30000 });

for (const [w, h] of [[375, 812], [430, 932]]) {
  uiTest(`#5121 phone ${w}×${h}: Simulate's side panel the Panels pane, the waves the Document pane, the waves by touch`, E, async (page) => {
    await page.setViewport(w, h);
    const silinx = await page.eval(() => document.documentElement.dataset.layout === 'tasks');
    await makeProject(env, { name: `PhoneSim_${w}`, template: 'gates' });
    await page.openProject(`PhoneSim_${w}`);
    if (silinx) {
      // Simulate, nothing simulated: its side panel (what to simulate), the whole width
      await page.tap('#task-tabs .task-btn[data-task="sim"]');
      await page.waitFor(() => document.documentElement.dataset.task === 'sim', [], { what: 'Simulate' });
      assert.deepEqual(await pane(page), ['side', ['side', 'doc', 'console']]);
      const panel = await box(page, '#task-sim-panel');
      assert.ok(panel.x === 0 && panel.w === w, JSON.stringify(panel));
      await page.tap('#task-sim-panel .task-sim-bench .row.sel');
    } else {
      await page.setView('sim');
      await page.treeRow('#hier', 'tb_gates');
      await page.treeRow('#procs', 'Simulate Behavioral Model', { dbl: true, exact: true });
    }
    await ran(page);
    // the waves: the Document pane, the whole width; the names and values narrower, the waves most of it
    assert.deepEqual(await pane(page), ['doc', ['side', 'doc', 'console']]);
    const win = await box(page, '.doc:not([hidden]) .isim-wavewin'), waves = await box(page, '.doc:not([hidden]) .isim-waves');
    assert.ok(win.x <= 2 && win.w >= w - 4, JSON.stringify(win));   // (the ISE style's panel's border)
    assert.ok(waves.w >= 0.5 * w, `the waves ${waves.w} px of ${w}`);
    const left = await box(page, '.doc:not([hidden]) .isim-left');
    if (silinx) {
      // (SSim's Instances and Objects: the Panels pane's, the whole width, the waves not shown there)
      assert.equal(left, null);
      await page.tap('#phone-panes [data-pane="side"]');
      const side = await box(page, '.doc:not([hidden]) .isim-left');
      assert.ok(side.x === 0 && side.w === w, JSON.stringify(side));
      assert.equal(await box(page, '.doc:not([hidden]) .isim-wavewin'), null);
      assert.match(await page.eval(() => document.querySelector('.doc:not([hidden]) .isim-left').innerText), /\bsw\b[\s\S]*\bled\b/, 'the objects');
      await page.tap('#phone-panes [data-pane="doc"]');
      await frame(page);
    } else {
      // (the ISE style: above the waves, the whole width)
      assert.ok(left.x <= 2 && left.w >= w - 4 && left.bottom <= win.y + 1, JSON.stringify({ left, win }));
    }
    // the waves by touch: a finger places the cursor where it taps
    const wv = await box(page, '.doc:not([hidden]) .isim-waves');
    const c = { x: wv.x + Math.round(wv.w / 2), y: wv.y + Math.min(wv.h - 10, 60) };
    const s0 = await state(page);
    await page.tap({ x: wv.x + Math.round(wv.w * 0.25), y: c.y });
    await frame(page);
    const s1 = await state(page);
    assert.notEqual(s1.cursor, s0.cursor, 'the cursor placed');
    near(s1.cursor, s0.t0 + Math.round(wv.w * 0.25) * s0.scale, 30 * s0.scale, 'the cursor where the finger tapped (snapped)');
    // a pinch spreading two fingers 2×: the time zoomed in 2×, the cursor where it was
    await page.touchGesture([[plus(c, -30), plus(c, -60)], [plus(c, 30), plus(c, 60)]]);
    await frame(page);
    const s2 = await state(page);
    near(s1.scale / s2.scale, 2, 0.05, 'the time zoomed in by the pinch');
    assert.equal(s2.cursor, s1.cursor, 'the cursor as it was');
    // two fingers dragged 60 px to the left: the time scrolled on, the zoom and the cursor as they were
    await page.touchGesture([[c, plus(c, -60)], [plus(c, 40), plus(c, -20)]]);
    await frame(page);
    const s3 = await state(page);
    near(s3.t0 - s2.t0, 60 * s2.scale, 2 * s2.scale, 'the time scrolled');
    near(s3.scale, s2.scale, 1e-9, 'the zoom kept');
    assert.equal(s3.cursor, s1.cursor, 'the cursor as it was');
    assert.equal(await page.eval(() => document.documentElement.scrollWidth > innerWidth), false, 'no sideways scroll');
    await noWarnings(page);
  }, { tablet: 'portrait', timeout: 180000 });
}

uiTest('#5121 phone: Emulate with no board open starts on its side panel; at 768 px Simulate as before', E, async (page) => {
  await page.setViewport(390, 844);
  await makeProject(env, { name: 'PhoneEmu', template: 'gates' });
  await page.openProject('PhoneEmu');
  await page.tap('#task-tabs .task-btn[data-task="emu"]');
  await page.waitFor(() => document.documentElement.dataset.task === 'emu', [], { what: 'Emulate' });
  assert.deepEqual(await pane(page), ['side', ['side', 'doc', 'console']]);
  assert.ok((await box(page, '#left')).w === 390);
  // a tablet: Simulate's panel beside its page, at most 45 % of the width, no bar of panes
  await page.setViewport(768, 1024);
  await page.tap('#task-tabs .task-btn[data-task="sim"]');
  await page.waitFor(() => document.querySelector('#task-sim-panel')?.getClientRects().length, [], { what: 'Simulate\'s panel' });
  const panel = await box(page, '#task-sim-panel');
  assert.ok(panel.w <= 0.45 * 768 + 1 && (await box(page, '#task-empty')).x >= panel.w - 1, JSON.stringify(panel));
  assert.deepEqual((await pane(page))[1], [], 'no bar of panes');
  await noWarnings(page);
}, { tablet: 'portrait', skip: process.env.SILINX_UI_INTERFACE === 'ise' ? 'the tasks are the Silinx interface\'s' : undefined });
