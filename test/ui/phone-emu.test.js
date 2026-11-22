// UI: the Board Emulator on a phone (#5121, web/js/emulator-touch.js, web/js/tasks-emu.js): under 600 px (375 × 812 and
// 430 × 932, with touch) the board is fitted to the width (no sideways scroll), and its switches and buttons are
// repeated under it, 44 px at least, in the board's order, each with its name and the design's bit it drives: a tap
// toggles the board's switch (the design's input with it), a finger held on a button holds the board's button down
// until it is lifted. At 768 px (a tablet) no strip, the board at its tablet size. No warnings. In both interfaces
// (SILINX_UI_INTERFACE) and in Portuguese.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject, chromeOnly } from './harness.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;

const box = (page, sel) => page.eval((s) => { const r = document.querySelector(s).getBoundingClientRect(); return { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height), right: Math.round(r.right) }; }, sel);
// the strip's buttons: [name, bit] and their least width and height
const strip = (page) => page.eval(() => {
  const bs = [...document.querySelectorAll('.doc:not([hidden]) .emu-touch button')].filter((b) => b.getClientRects().length);
  return { parts: bs.map((b) => [b.querySelector('.res').textContent, b.querySelector('.bit').textContent]),
    least: bs.length ? Math.min(...bs.flatMap((b) => { const r = b.getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)]; })) : 0 };
});
// the board's switch or button `i` (the board's order: SW7 … SW0, BTN3 … BTN0) and the strip's: on or not; the design's input
const onOff = (page, i) => page.eval((k) => {
  const parts = [...document.querySelectorAll('.doc:not([hidden]) :is(.emu-board-wrap, .emu-board) :is(.emu-sw, .emu-btn)')];
  const touch = [...document.querySelectorAll('.doc:not([hidden]) .emu-touch button')];
  return [parts[k].classList.contains('on'), touch[k].classList.contains('on'), touch[k].getAttribute('aria-pressed'), window.SilinxApp.findDoc('emulator').view.inputs[k]];
}, i);
async function openEmulator(page) {
  await page.eval(async () => (await import('/js/viewers.js')).openEmulator(window.Silinx.project.top));
  await page.waitFor(() => window.Silinx.active?.id === 'emulator' && window.Silinx.active.view?.outputs && document.querySelector('.doc:not([hidden]) .emu-board-wrap')?.style.zoom, [], { what: 'the emulator, its board fitted' });
}
async function noWarnings(page) {
  assert.deepEqual(page.console.filter((c) => c.type === 'warning' || c.type === 'warn').map((c) => c.text), []);
  assert.deepEqual(await page.eval(() => [document.getElementById('warn-count').textContent, ...[...document.querySelectorAll('#console-warnings .diag')].map((d) => d.textContent)]), ['']);
}
// the gates example on the Basys2: SW3 … SW0 drive sw<3> … sw<0>, the rest not connected
const GATES = [...[7, 6, 5, 4].map((k) => [`SW${k}`, '—']), ...[3, 2, 1, 0].map((k) => [`SW${k}`, `sw<${k}>`]), ...[3, 2, 1, 0].map((k) => [`BTN${k}`, '—'])];

for (const [w, h] of [[375, 812], [430, 932]]) {
  uiTest(`#5121 phone ${w}×${h}: the Board Emulator's board fitted to the width, its switches and buttons under it by touch`, E, async (page) => {
    await page.setViewport(w, h);
    await makeProject(env, { name: `PhoneEmu_${w}`, template: 'gates' });
    await page.openProject(`PhoneEmu_${w}`);
    await openEmulator(page);
    assert.equal(await page.eval(() => document.documentElement.dataset.pane), 'doc');
    // the board: the width of the board's area, nothing scrolling sideways
    const main = await box(page, '.doc:not([hidden]) .emu-main'), wrap = await box(page, '.doc:not([hidden]) .emu-board-wrap');
    assert.ok(wrap.x >= main.x && wrap.right <= main.right && wrap.w >= 0.8 * main.w, JSON.stringify({ main, wrap }));
    assert.deepEqual(await page.eval(() => { const m = document.querySelector('.doc:not([hidden]) .emu-main'); return [m.scrollWidth <= m.clientWidth + 1, document.documentElement.scrollWidth <= innerWidth]; }), [true, true]);
    // the strip: every switch and button, in the board's order, its name and bit, a finger's size
    const s = await strip(page);
    assert.deepEqual(s.parts, GATES);
    assert.ok(s.least >= 44, `the strip's buttons ${s.least} px`);
    // SW0 (the eighth) tapped: the board's switch on, the design's sw<0> with it; again: off
    const sw0 = '.doc:not([hidden]) .emu-touch button:nth-child(8)';
    await page.tap(sw0);
    await page.waitFor(() => window.SilinxApp.findDoc('emulator').view.inputs[7] === true, [], { what: 'SW0 on' });
    assert.deepEqual(await onOff(page, 7), [true, true, 'true', true]);
    await page.tap(sw0);
    await page.waitFor(() => window.SilinxApp.findDoc('emulator').view.inputs[7] === false, [], { what: 'SW0 off' });
    assert.deepEqual(await onOff(page, 7), [false, false, 'false', false]);
    // BTN0 (the last) held by a finger: the board's button down while it is held, up once it is lifted
    if (!chromeOnly) {
      const b = await box(page, '.doc:not([hidden]) .emu-touch button:last-child');
      const at = [{ x: b.x + b.w / 2, y: b.y + b.h / 2, id: 1, radiusX: 1, radiusY: 1, force: 1 }];
      await page.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: at });
      await page.waitFor(() => window.SilinxApp.findDoc('emulator').view.inputs[11] === true, [], { what: 'BTN0 held' });
      assert.deepEqual(await onOff(page, 11), [true, true, 'true', true]);
      await page.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await page.waitFor(() => window.SilinxApp.findDoc('emulator').view.inputs[11] === false, [], { what: 'BTN0 let go' });
      assert.deepEqual(await onOff(page, 11), [false, false, 'false', false]);
    }
    await noWarnings(page);
  }, { tablet: 'portrait', timeout: 120000 });
}

uiTest('#5121 a tablet (768 px): no strip, the board at its tablet size; the strip in Portuguese on a phone', E, async (page) => {
  await page.setViewport(768, 1024);
  await makeProject(env, { name: 'PhoneEmuTab', template: 'gates' });
  await page.openProject('PhoneEmuTab');
  await openEmulator(page);
  assert.deepEqual((await strip(page)).parts, []);
  assert.ok(+(await page.eval(() => document.querySelector('.doc:not([hidden]) .emu-board-wrap').style.zoom)) >= 0.7);
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('pt'));
  await page.setViewport(375, 812);
  await page.waitFor(() => +document.querySelector('.doc:not([hidden]) .emu-board-wrap').style.zoom < 0.7 && document.querySelector('.doc:not([hidden]) .emu-touch')?.getClientRects().length, [], { what: 'the phone\'s board and strip' });
  assert.equal(await page.eval(() => document.querySelector('.doc:not([hidden]) .emu-touch').getAttribute('aria-label')), 'Interruptores e botões');
  assert.deepEqual((await strip(page)).parts, GATES);
  await noWarnings(page);
}, { tablet: 'portrait' });
