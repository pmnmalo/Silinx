// UI: the Board Emulator's note on its engine (#5292): the display's persistence (each digit keeps its last pattern
// between its refreshes) said only for a design that drives the board's display (a digit's anode on a pin), on the
// compiled engine and on the event-driven one; a design with no display wired (LEDs and switches only) has the note
// without it. The console is tool output, not translated: in Portuguese the same note.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject } from './harness.js';
import { emuNotes, waitEmuNote } from './emu-notes.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;

const LEDS = `library ieee; use ieee.std_logic_1164.all;
entity top is
  port (clk : in std_logic; sw : in std_logic_vector(1 downto 0); led : out std_logic_vector(1 downto 0));
end top;
architecture rtl of top is
begin
  process (clk) begin
    if rising_edge(clk) then led <= sw; end if;
  end process;
end rtl;
`;
// (a digit lit, its segments the switches)
const DISPLAY = `library ieee; use ieee.std_logic_1164.all;
entity top is
  port (clk : in std_logic; sw : in std_logic_vector(6 downto 0); seg : out std_logic_vector(6 downto 0); an : out std_logic_vector(3 downto 0));
end top;
architecture rtl of top is
begin
  process (clk) begin
    if rising_edge(clk) then seg <= not sw; end if;
  end process;
  an <= "1110";
end rtl;
`;
const PERSIST = 'display digit keeps the last pattern it showed between its refreshes, as your eye does on the real board.';
const COMPILED = 'the design is compiled (its netlist, by Yosys) and runs at up to the board\'s clock rate; registers without an initial value start at 0, as on the FPGA; '
  + 'the event-driven engine shows X values and the design\'s messages.';
const EVENT = 'the design is simulated from its HDL (behavioural RTL) at a reduced clock rate; registers without an initial value start at 0, as on the FPGA';
const note = (engine, digits) => engine === 'compiled' ? `${COMPILED}${digits ? ` Each ${PERSIST}` : ''}` : `${EVENT}${digits ? `; each ${PERSIST}` : '.'}`;

const engineItem = (v) => `.doc:not([hidden]) .emu-bar .tb-more-menu [role=menuitemradio][data-value=${v}]`;
const running = (page, engine) => page.waitFor((e) => window.SilinxApp.findDoc('emulator')?.view?.outputs && window.SilinxApp.findDoc('emulator').view.engine === e,
  [engine], { what: `the emulator on the ${engine} engine`, timeout: 60000 });
const closeEmulator = (page) => page.eval(() => window.SilinxApp.closeDoc(window.SilinxApp.findDoc('emulator')));
const setLang = (page, l) => page.eval(async (x) => { (await import('/js/i18n.js')).setLanguage(x); }, l);
const warnings = (page) => page.eval(() => [...document.querySelectorAll('#console-log .ln')].map((l) => l.textContent).filter((t) => /^(WARNING|ERROR)/.test(t)));

/** The emulator's notes on `design`'s project, compiled then event-driven: the first of each (its engine's). */
async function notesOf(page, name, src) {
  await makeProject(env, { name, board: 'basys2', files: { 'src/top.vhd': src }, top: 'top' });
  await page.openProject(name);
  assert.equal(await page.eval(() => window.SilinxApp.regenerateUcf()), true, 'every port is on a board resource');
  const got = {};
  await page.menu('Tools', 'Board Emulator');
  await running(page, 'compiled');
  got.compiled = await waitEmuNote(page, /^the design is compiled/);
  await page.eval((s) => document.querySelector(s).click(), engineItem('event'));
  await running(page, 'event');
  got.event = await waitEmuNote(page, /^the design is simulated/);
  // (in Portuguese: the console's lines as they are)
  await setLang(page, 'pt');
  assert.equal((await emuNotes(page)).find((t) => /^the design is simulated/.test(t)), got.event);
  await setLang(page, 'en');
  await page.eval((s) => document.querySelector(s).click(), engineItem('compiled'));
  await running(page, 'compiled');
  await closeEmulator(page);
  await page.eval(() => localStorage.removeItem('silinx.emulator.engine'));
  return got;
}

uiTest('#5292 the Board Emulator\'s note: the display\'s digits said for a design that drives the display, not for one with none', E, async (page) => {
  assert.deepEqual(await notesOf(page, 'EmuNoteDisplay', DISPLAY), { compiled: note('compiled', true), event: note('event', true) });
  assert.deepEqual(await notesOf(page, 'EmuNoteLeds', LEDS), { compiled: note('compiled', false), event: note('event', false) });
  // no warnings: every port on a board resource
  assert.deepEqual(await warnings(page), []);
  assert.deepEqual(page.dialogs, []);
}, { timeout: 240000 });
