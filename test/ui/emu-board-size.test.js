// UI: the Board Emulator's board drawn at the same size in both interfaces (#5118): the ISE style interface fits it to
// its room as the Silinx interface does (web/js/tasks-emu.js, the Silinx interface's size the reference), refitted when
// the window changes or the emulator's tab is brought to the front again.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject } from './harness.js';
import { resolveBoard } from '../../server/devices.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;

// a counter on the 8 LEDs
const BLINK = `library ieee; use ieee.std_logic_1164.all; use ieee.numeric_std.all;
entity blink is
  port (clk : in std_logic; led : out std_logic_vector(7 downto 0));
end blink;
architecture rtl of blink is
  signal q : unsigned(31 downto 0) := (others => '0');
begin
  process (clk) begin
    if rising_edge(clk) then q <= q + 1; end if;
  end process;
  led <= std_logic_vector(q(31 downto 24));
end rtl;
`;

/** The emulator open on `board` with the counter. */
async function emulatorOn(page, board, name) {
  await makeProject(env, { name, board, device: resolveBoard(board).device, files: { 'src/blink.vhd': BLINK }, top: 'blink' });
  await page.openProject(name);
  assert.equal(await page.eval(() => window.SilinxApp.regenerateUcf()), true);
  await page.eval(() => window.SilinxApp.openFile('src/blink.vhd'));
  await page.menu('Tools', 'Board Emulator');
  await page.waitFor(() => window.Silinx.active?.id === 'emulator' && window.Silinx.active.view?.outputs, [], { what: 'emulator running' });
}

/** The board once it is fitted to its room, its zoom the one `boardZoom` gives that room (measured as web/js/tasks-emu.js
 *  measures it, the board's zoom taken off for the measure): { w, h, zoom } (its size on the screen). The room
 *  depends on the browser's fonts and scrollbars, so the zoom is not a fixed number. */
const fitted = (page, what) => page.waitFor(async () => {
  const { boardZoom } = await import('/js/tasks-emu.js');
  const emu = [...document.querySelectorAll('#workspace .doc .emu')].find((e) => e.getClientRects().length), wrap = emu?.querySelector('.emu-board-wrap');
  if (!wrap?.style.zoom) return false;
  const zoom = wrap.style.zoom, r = wrap.querySelector('.emu-pcb').getBoundingClientRect();
  wrap.style.zoom = '';
  const main = emu.querySelector('.emu-main'), bar = emu.querySelector('.emu-bar'), line = emu.querySelector(':scope > .doc-status');
  const room = { w: main.clientWidth - 24 - 16, h: emu.clientHeight - (bar?.offsetHeight || 0) - (line?.offsetHeight || 0) - 24 };
  const want = String(boardZoom(room, { w: wrap.offsetWidth, h: wrap.offsetHeight }));
  wrap.style.zoom = zoom;
  return zoom === want && { w: Math.round(r.width), h: Math.round(r.height), zoom: +zoom };
}, [], { what: `the board fitted to its room (${what})` });

const toInterface = async (page, ui) => {
  await page.eval(async (u) => (await import('/js/silinx.js')).setInterface(u), ui);
  await page.waitFor((u) => document.documentElement.dataset.ui === u, [ui], { what: `the ${ui} interface` });
};

// each board in each window measured in the Silinx interface, then in the ISE style one (the same page): fitted to its
// room in both. In a large window both at the largest zoom, 1.5: the same size. In a laptop's the room of the ISE
// style interface may differ by a few pixels (its Design pane, its Console below the emulator), the board's size too:
// the width decides the Basys2's, as wide in both (within a hundredth of the zoom); the height the Nexys2's, lower in
// the ISE style interface (its Console).
const CASES = [['basys2', 2560, 1600], ['nexys2', 2560, 1600], ['basys2', 1400, 900], ['nexys2', 1400, 900], ['basys2', 1100, 700]];
uiTest('#5118 the emulator\'s board fitted to the window in both interfaces, as large in the ISE style one as in the Silinx one', E, async (page) => {
  for (const [board, w, h] of CASES) {
    await toInterface(page, 'silinx');
    await page.setViewport(w, h);
    await emulatorOn(page, board, `Size-${board}-${w}`);
    const silinx = await fitted(page, `${board}, ${w}×${h}, Silinx`);
    await toInterface(page, 'ise');
    const ise = await fitted(page, `${board}, ${w}×${h}, ISE style`);
    const what = `${board} in ${w}×${h}: ${JSON.stringify({ silinx, ise })}`;
    if (w === 2560) assert.deepEqual(ise, { ...silinx, zoom: 1.5 }, what);
    else if (board === 'basys2') assert.ok(Math.abs(ise.zoom - silinx.zoom) <= 0.011 && ise.zoom < 1, what);
    else assert.ok(ise.zoom <= silinx.zoom && ise.zoom >= 0.7 && ise.zoom < 1, what);
  }
  // the window made smaller while the HDL file is in front: the emulator fitted again once its tab is clicked
  await page.setViewport(2560, 1600);
  await fitted(page, 'a large window');
  await page.eval(() => window.SilinxApp.openFile('src/blink.vhd'));
  await page.waitFor(() => window.Silinx.active?.id !== 'emulator', [], { what: 'the HDL file in front' });
  await page.setViewport(1400, 900);
  await page.click('#doc-tabs .tab .tlabel', { text: 'Board Emulator (blink)' });
  await page.waitFor(() => window.Silinx.active?.id === 'emulator', [], { what: 'the emulator in front' });
  assert.ok((await fitted(page, 'smaller again')).zoom < 1);
  assert.deepEqual(page.console.filter((c) => c.type === 'warning' || c.type === 'warn' || c.type === 'error').map((c) => c.text), []);
}, { ui: 'silinx', timeout: 300000 });
