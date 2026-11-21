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

/** The board's size on the screen once it is fitted, its zoom: [width, height, zoom] (the zoom settled for a frame). */
const drawn = (page, zoom) => page.waitFor((z) => {
  const wrap = document.querySelector('#workspace .doc .emu .emu-board-wrap'), r = wrap?.querySelector('.emu-pcb')?.getBoundingClientRect();
  return r?.width > 0 && wrap.style.zoom === z && [Math.round(r.width), Math.round(r.height), wrap.style.zoom];
}, [zoom], { what: `the board at zoom ${zoom}` });

// (in a 1400×900 window the Basys2 fills the width of the room, as large in both: 0.87; in a 2560×1600 one, both
// boards at the largest zoom, 1.5)
const CASES = [['basys2', 1400, 900, '0.87', [731, 484]], ['basys2', 2560, 1600, '1.5', [1260, 834]], ['nexys2', 2560, 1600, '1.5', [1290, 1080]]];
// (the Nexys2 made smaller with the window: its room's height decides, which the ISE style interface's Console makes
// lower, the same rule: not below 0.7)
const SMALLER = { silinx: ['0.75', [645, 540]], ise: ['0.7', [602, 504]] };
for (const ui of ['silinx', 'ise']) {
  uiTest(`#5118 the ${ui} interface: the emulator's boards fitted to the window, as large as in the other interface`, E, async (page) => {
    for (const [board, w, h, zoom, size] of CASES) {
      await page.setViewport(w, h);
      await emulatorOn(page, board, `Size-${ui}-${board}-${w}`);
      assert.deepEqual(await drawn(page, zoom), [...size, zoom], `${board} in ${w}×${h}`);
    }
    // the window made smaller while the HDL file is in front: the emulator fitted again once it is brought back (its
    // tab clicked in the ISE style interface; the Emulate task in the Silinx one)
    await page.eval(() => window.SilinxApp.openFile('src/blink.vhd'));
    await page.waitFor(() => window.Silinx.active?.id !== 'emulator', [], { what: 'the HDL file in front' });
    await page.setViewport(1400, 900);
    if (ui === 'ise') await page.click('#doc-tabs .tab .tlabel', { text: 'Board Emulator (blink)' });
    else await page.menu('Tools', 'Board Emulator');
    await page.waitFor(() => window.Silinx.active?.id === 'emulator', [], { what: 'the emulator in front' });
    const [zoom, size] = SMALLER[ui];
    assert.deepEqual(await drawn(page, zoom), [...size, zoom]);
    assert.deepEqual(page.console.filter((c) => c.type === 'warning' || c.type === 'warn' || c.type === 'error').map((c) => c.text), []);
  }, { ui, timeout: 240000 });
}
