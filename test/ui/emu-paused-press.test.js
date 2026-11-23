// UI: a push button of the Board Emulator clicked or tapped while it is paused (#5331): kept down, lit, until the
// design has run with it (100 ms of the board's time, core/emulate-press.js pressEnd, as a click while it runs,
// #3109), so that Run takes it: the old emulator let it go at once, the press never seen. On both engines (compiled,
// event-driven), by the mouse on the board's button and by a finger on the phone's strip (web/js/emulator-touch.js).
// A power cycle lets it go. The synthesis's warning on the unused buttons, no other. In both interfaces (SILINX_UI_INTERFACE).
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject, chromeOnly } from './harness.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;

// a debouncer of 50 cycles on BTN0 (the examples': 20 ms, a million cycles at 50 MHz), LED0 toggled per press
const DEBOUNCED = `library ieee; use ieee.std_logic_1164.all;
entity deb is
  port (clk : in std_logic;
        btn : in std_logic_vector(3 downto 0);
        led : out std_logic_vector(7 downto 0));
end deb;
architecture rtl of deb is
  constant STABLE : integer := 50;
  signal s0, s1, level, toggle : std_logic := '0';
  signal count : integer range 0 to STABLE := 0;
begin
  process (clk) begin
    if rising_edge(clk) then
      s0 <= btn(0); s1 <= s0;
      if s1 = level then count <= 0;
      elsif count = STABLE - 1 then
        count <= 0; level <= s1;
        if s1 = '1' then toggle <= not toggle; end if;
      else count <= count + 1;
      end if;
    end if;
  end process;
  led <= "0000000" & toggle;
end rtl;
`;
const CYCLE = 20000;   // (ps: the Basys2's 50 MHz)
const view = (page, path) => page.eval((p) => p.split('.').reduce((o, k) => o?.[k], window.SilinxApp.findDoc('emulator').view), path);
const settledNow = async (page) => {
  await page.waitFor(() => !window.SilinxApp.findDoc('emulator').view.sim.busy, [], { what: 'the last run in' });
  return view(page, 'sim.now');
};
const BOARD_BTN = '.doc:not([hidden]) [data-part=btn0] .emu-btn';
const STRIP_BTN = '.doc:not([hidden]) .emu-touch button:last-child';   // (BTN0: the board's order, SW7 … BTN0)
const btn0 = (page) => page.eval((b) => document.querySelector(b).classList.contains('on'), BOARD_BTN);
const led0 = (page) => page.eval(() => document.querySelector('.doc:not([hidden]) [data-part=led0] .emu-led').style.background);
const centre = (page, sel) => page.eval((s) => {
  const el = document.querySelector(s);
  el.scrollIntoView({ block: 'center', inline: 'center' });
  const r = el.getBoundingClientRect();
  return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
}, sel);
// the browser's console: no warning; Silinx's: the synthesis's one on the debouncer's BTN3 … BTN1, no other
async function warnings(page) {
  assert.deepEqual(page.console.filter((c) => c.type === 'warning' || c.type === 'warn' || c.type === 'error').map((c) => c.text), []);
  assert.deepEqual(await page.eval(() => [document.getElementById('warn-count').textContent, ...[...document.querySelectorAll('#console-warnings .diag')].map((d) => d.textContent)]),
    ['(1)', 'WARNING:Silinx:647 - "src/deb.vhd" Line 4: Input <btn<3:1>> is never used.▸ Explanation and fix']);
}

for (const engine of ['compiled', 'event']) for (const by of ['mouse', 'touch']) {
  uiTest(`#5331 Board Emulator, ${engine} engine: BTN0 ${by === 'mouse' ? 'clicked' : 'tapped on the strip'} while paused, kept down until the design ran with it, its press taken on Run`, E, async (page) => {
    if (by === 'touch') await page.setViewport(375, 812);
    const name = `EmuPaused_${engine}_${by}`;
    await makeProject(env, { name, board: 'basys2', files: { 'src/deb.vhd': DEBOUNCED }, top: 'deb' });
    await page.openProject(name);
    assert.equal(await page.eval(() => window.SilinxApp.regenerateUcf()), true);
    await page.eval((e) => localStorage.setItem('silinx.emulator.engine', e), engine);
    await page.eval(async () => (await import('/js/viewers.js')).openEmulator(window.Silinx.project.top));
    await page.waitFor((e) => window.Silinx.active?.id === 'emulator' && window.Silinx.active.view?.outputs && window.Silinx.active.view.engine === e, [engine], { what: `the emulator on the ${engine} engine`, timeout: 30000 });
    // 1 kHz: a real press, 100 cycles
    await page.eval(() => { const s = document.querySelector('.doc:not([hidden]) .emu-speed'); s.value = '1000'; s.dispatchEvent(new Event('change')); });
    const off = await led0(page);
    await page.eval(() => window.SilinxApp.findDoc('emulator').view.run(false));
    const t0 = await settledNow(page);
    assert.equal(await view(page, 'running'), false, 'paused');
    // the press while paused: let go, but kept down (lit) since nothing ran with it yet
    if (by === 'mouse') {
      const at = await centre(page, BOARD_BTN);
      await page.mouse('mouseMoved', at.x, at.y);
      await page.mouse('mousePressed', at.x, at.y);
      assert.equal(await btn0(page), true, 'BTN0 pressed');
      await page.mouse('mouseReleased', at.x, at.y);
    } else {
      const at = await centre(page, STRIP_BTN);
      await page.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: at.x, y: at.y, id: 1, radiusX: 1, radiusY: 1, force: 1 }] });
      await page.waitFor((b) => document.querySelector(b).classList.contains('on'), [BOARD_BTN], { what: 'BTN0 pressed' });
      await page.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    }
    await new Promise((r) => setTimeout(r, 300));
    assert.equal(await btn0(page), true, 'let go while paused, kept down');
    assert.equal(await settledNow(page), t0, 'nothing ran while paused');
    assert.equal(await led0(page), off, 'LED0 as it was while paused');
    // Run: the design runs with it, 100 cycles, then it is let go; LED0 toggled by the press
    await page.eval(() => window.SilinxApp.findDoc('emulator').view.run(true));
    await page.waitFor((b) => !document.querySelector(b).classList.contains('on'), [BOARD_BTN], { what: 'BTN0 let go once the design ran with it', timeout: 30000 });
    assert.ok(await view(page, 'sim.now') >= t0 + 100 * CYCLE, 'down for 100 cycles at least');
    await page.waitFor((b) => document.querySelector('.doc:not([hidden]) [data-part=led0] .emu-led').style.background !== b, [off], { what: 'LED0 toggled by the paused press', timeout: 30000 });
    // paused again, a click kept down, then a power cycle (the board's time from 0 again): let go then
    if (by === 'mouse') {
      await page.eval(() => window.SilinxApp.findDoc('emulator').view.run(false));
      await settledNow(page);
      const at = await centre(page, BOARD_BTN);
      await page.mouse('mousePressed', at.x, at.y);
      await page.mouse('mouseReleased', at.x, at.y);
      assert.equal(await btn0(page), true, 'kept down while paused');
      await page.click('.emu-bar button', { text: '⟲ Power cycle' });
      await page.waitFor((b) => !document.querySelector(b).classList.contains('on'), [BOARD_BTN], { what: 'BTN0 let go by the power cycle' });
    }
    await warnings(page);
    await page.eval(() => localStorage.removeItem('silinx.emulator.engine'));
  }, by === 'touch' ? { tablet: 'portrait', timeout: 120000, skip: chromeOnly } : { timeout: 120000 });   // (CDP touch: Chrome only, #2038)
}
