// UI: the Board Emulator's push buttons on the event-driven engine (#5849): a button clicked and let go is held down,
// lit, as a real press (#3109) but never longer than a second of the user's time at the rate the board runs
// (core/emulate-press.js pressEnd's rate): the old emulator held it until the design had seen 100 ms of the board's
// time, 5,000,000 cycles at 50 MHz, a minute or more of the event-driven engine's, the button seen stuck. Every board's
// buttons are emulator-board.js's mkButton: on the boards of every family (Spartan-3E, Spartan-6, 7-series, Zynq-7000,
// iCE40, ECP5, Gowin, Intel; active-low buttons and LEDs too), the design's LED following its button. On the Basys2
// too a long press (let go at once), a release away from the button (the pointer captured), a pointer cancel, and a
// finger on the phone's strip (web/js/emulator-touch.js). No warnings. In both interfaces (SILINX_UI_INTERFACE).
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject, chromeOnly } from './harness.js';
import { resolveBoard } from '../../server/devices.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;

// BTN0 and BTN1 on LD0 and LD1 (as the board's input and output levels are: active-low ones too), a counter on LD2, LD3
// (the clock running: the event-driven engine's cycles)
const DESIGN = `library ieee; use ieee.std_logic_1164.all; use ieee.numeric_std.all;
entity btns is
  port (clk : in std_logic; btn : in std_logic_vector(1 downto 0); led : out std_logic_vector(3 downto 0));
end btns;
architecture rtl of btns is
  signal q : unsigned(23 downto 0) := (others => '0');
begin
  process (clk) begin
    if rising_edge(clk) then q <= q + 1; end if;
  end process;
  led <= std_logic_vector(q(23 downto 22)) & btn;
end rtl;
`;
// (a board drawn: its part's data-part; a board with no drawing, the DE boards': the generic rows' cells, #5849)
const part = (name, label, cls) => `.doc:not([hidden]) [data-part=${name}] .${cls}, .doc:not([hidden]) .emu-cell[title^="${label} = "] .${cls}`;
const BTN = part('btn0', 'BTN0', 'emu-btn');
const LED = part('led0', 'LD0', 'emu-led');
const STRIP_BTN = '.doc:not([hidden]) .emu-touch button:last-child';   // (BTN0: the board's order, SW7 … BTN0)
const down = (page) => page.eval((b) => document.querySelector(b).classList.contains('on'), BTN);
const led0 = (page) => page.eval((l) => document.querySelector(l).style.background, LED);
const centre = (page, sel) => page.eval((s) => {
  const el = document.querySelector(s);
  el.scrollIntoView({ block: 'center', inline: 'center' });
  const r = el.getBoundingClientRect();
  return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
}, sel);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// let go: within a second and a half (a second's hold, a frame's slack); the old emulator's: a minute or more
const LET_GO_MS = 1500;
async function letGo(page, what) {
  const t = Date.now();
  await page.waitFor((b) => !document.querySelector(b).classList.contains('on'), [BTN], { what: `${what}: BTN0 let go`, timeout: 2 * LET_GO_MS });
  assert.ok(Date.now() - t <= LET_GO_MS + 300, `${what}: let go after ${Date.now() - t} ms`);
}

async function emulatorOn(page, board, name) {
  await makeProject(env, { name, board, device: resolveBoard(board).device, files: { 'src/btns.vhd': DESIGN }, top: 'btns' });
  await page.openProject(name);
  assert.equal(await page.eval(() => window.SilinxApp.regenerateUcf()), true);
  await page.eval(() => localStorage.setItem('silinx.emulator.engine', 'event'));
  await page.eval(async () => (await import('/js/viewers.js')).openEmulator(window.Silinx.project.top));
  await page.waitFor(() => window.Silinx.active?.id === 'emulator' && window.Silinx.active.view?.outputs && window.Silinx.active.view.engine === 'event',
    [], { what: 'the emulator on the event-driven engine', timeout: 30000 });
  assert.equal(await page.eval(() => document.querySelector('.doc:not([hidden]) .emu-speed').value), 'max', 'Max speed: the event-driven engine\'s');
  await sleep(1200);   // (running a second: its rate measured)
}

// a click: pressed, the design's LED0 follows; let go: within a second and a half, LED0 back as it was
async function click(page, what, { hold = 80 } = {}) {
  const rest = await led0(page);
  const at = await centre(page, BTN);
  await page.mouse('mouseMoved', at.x, at.y);
  await page.mouse('mousePressed', at.x, at.y);
  assert.equal(await down(page), true, `${what}: pressed`);
  await page.waitFor((l, r) => document.querySelector(l).style.background !== r, [LED, rest], { what: `${what}: LED0 lit by the press`, timeout: 5000 });
  await sleep(hold);
  await page.mouse('mouseReleased', at.x, at.y);
  return rest;
}
async function backToRest(page, rest, what) {
  await page.waitFor((l, r) => document.querySelector(l).style.background === r, [LED, rest], { what: `${what}: LED0 back`, timeout: 3000 });
}
async function noWarnings(page) {
  assert.deepEqual(page.console.filter((c) => c.type === 'warning' || c.type === 'warn' || c.type === 'error').map((c) => c.text), []);
  assert.equal(await page.eval(() => document.getElementById('warn-count').textContent), '');
  await page.eval(() => localStorage.removeItem('silinx.emulator.engine'));
}

for (const board of ['basys2', 'nexys2', 'nexys3', 'atlys', 'mimas-v2', 'basys3', 'nexys-a7', 'zybo-z7', 'arty-z7', 'icebreaker', 'ulx3s', 'tangnano9k', 'de10-lite']) {
  uiTest(`#5849 the ${board}'s BTN0 on the event-driven engine: clicked and let go, back up within a second, the design's LED0 off`, E, async (page) => {
    await emulatorOn(page, board, `EmuBtnEvent-${board}`);
    const rest = await click(page, 'a click');
    await letGo(page, 'a click');
    await backToRest(page, rest, 'a click');
    if (board === 'basys2') {
      // clicked again at once: a new hold, let go as soon
      const r2 = await click(page, 'clicked again', { hold: 20 });
      await letGo(page, 'clicked again');
      await backToRest(page, r2, 'clicked again');
      // a long press, two seconds: let go at once
      await click(page, 'a long press', { hold: 2000 });
      await page.waitFor((b) => !document.querySelector(b).classList.contains('on'), [BTN], { what: 'a long press: let go at once', timeout: 300 });
      // let go away from the button: the button holds the pointer, its release its own
      const at = await centre(page, BTN);
      await page.mouse('mouseMoved', at.x, at.y);
      await page.mouse('mousePressed', at.x, at.y);
      await page.mouse('mouseMoved', at.x + 200, at.y - 200, { buttons: 1 });
      await page.mouse('mouseReleased', at.x + 200, at.y - 200);
      await letGo(page, 'let go away from it');
      // the pointer cancelled (the browser took the gesture): let go as a release
      await page.mouse('mousePressed', at.x, at.y);
      assert.equal(await down(page), true);
      await page.eval((b) => document.querySelector(b).dispatchEvent(new PointerEvent('pointercancel', { bubbles: true, pointerId: 1 })), BTN);
      await letGo(page, 'the pointer cancelled');
      await page.mouse('mouseReleased', at.x, at.y);
    }
    await noWarnings(page);
  }, { timeout: 90000 });
}

uiTest('#5849 the Basys2\'s BTN0 on the event-driven engine, a finger on the phone\'s strip: tapped, then cancelled, back up within a second', E, async (page) => {
  await page.setViewport(375, 812);
  await emulatorOn(page, 'basys2', 'EmuBtnEvent-touch');
  for (const end of ['touchEnd', 'touchCancel']) {
    const at = await centre(page, STRIP_BTN);
    await page.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: at.x, y: at.y, id: 1, radiusX: 1, radiusY: 1, force: 1 }] });
    await page.waitFor((b) => document.querySelector(b).classList.contains('on'), [BTN], { what: 'BTN0 pressed by the finger' });
    await sleep(80);
    await page.send('Input.dispatchTouchEvent', { type: end, touchPoints: [] });
    await letGo(page, end);
    assert.equal(await page.eval((s) => document.querySelector(s).getAttribute('aria-pressed'), STRIP_BTN), 'false', `${end}: the strip's button up too`);
  }
  await noWarnings(page);
}, { tablet: 'portrait', timeout: 90000, skip: chromeOnly });   // (CDP touch: Chrome only, #2038)
