// UI (#5383): the Board Emulator's oscilloscope on a Basys 3, its event-driven engine: a design whose `tick` toggles every
// 4 clocks of 100 MHz (12.5 MHz, half the time high); CH1 on it, its time base turned down to 100 ns a division: its
// trace, its frequency and duty cycle measured, its note empty (the compiled engine's says it needs the event-driven
// one); in Portuguese. Both interfaces.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject } from './harness.js';
import { resolveBoard } from '../../server/devices.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;
const TOP = `library ieee; use ieee.std_logic_1164.all; use ieee.numeric_std.all;
entity tick8 is
  port (clk : in std_logic; led : out std_logic_vector(7 downto 0));
end tick8;
architecture rtl of tick8 is
  signal cnt : unsigned(7 downto 0) := (others => '0');
  signal tick : std_logic;
begin
  process (clk) begin if rising_edge(clk) then cnt <= cnt + 1; end if; end process;
  tick <= cnt(2);
  led <= std_logic_vector(cnt);
end rtl;
`;
const D = '.doc:not([hidden]) .emu-scope';
const texts = (page) => page.eval((d) => [...document.querySelectorAll(`${d} svg text`)].map((t) => t.textContent), D);
const knob = async (page, input) => page.eval((d, i) => document.querySelector(`${d} [data-input="${i}"] rect`).dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })), D, input);

uiTest('#5383 the Board Emulator\'s oscilloscope: a signal\'s trace, its frequency and duty cycle; the compiled engine said; Portuguese', E, async (page) => {
  await page.eval(() => localStorage.setItem('silinx.emulator.engine', 'event'));
  await makeProject(env, { name: 'EmuScope', board: 'basys3', device: resolveBoard('basys3').device, files: { 'src/tick8.vhd': TOP }, top: 'tick8', constraints: 'constraints/tick8.xdc' });
  await page.openProject('EmuScope');
  assert.equal(await page.eval(() => window.SilinxApp.regenerateUcf()), true);
  await page.setView('impl');
  await page.treeRow('#hier', 'tick8');
  await page.treeRow('#procs', 'Emulate', { dbl: true, exact: true });
  await page.waitFor((d) => window.Silinx.active?.id === 'emulator' && document.querySelector(d), [D], { what: 'the scope box' });
  assert.equal(await page.eval((d) => document.querySelector(`${d} h4`).textContent, D), 'Oscilloscope');
  // the Watch first, the scope right after it (#1399, #5671)
  assert.deepEqual(await page.eval(() => [...document.querySelectorAll('.doc:not([hidden]) .emu-side .emu-box > h4')].slice(0, 2).map((x) => x.textContent)), ['Watch', 'Oscilloscope']);
  // CH1 on tick, 100 ns a division (from 1 µs: three steps down)
  await page.eval((d) => { const s = document.querySelector(`${d} .emu-scope-ch1`); s.value = [...s.options].find((o) => /(^|\.)tick$/.test(o.textContent)).value; s.dispatchEvent(new Event('change')); }, D);
  for (let k = 0; k < 3; k++) await knob(page, 'scope-t-down');
  await page.waitFor((d) => [...document.querySelectorAll(`${d} svg text`)].some((t) => t.textContent === '100 ns/div'), [D], { what: '100 ns/div' });
  await page.waitFor((d) => /^CH1 f 12\.5 MHz T 80 ns D 50 % Vpp 3\.3 V/.test([...document.querySelectorAll(`${d} .circ-scope-meas`)][0]?.textContent ?? ''), [D], { what: 'measured', timeout: 30000 });
  assert.equal(await page.eval((d) => document.querySelectorAll(`${d} .circ-scope-trace`).length, D), 1);
  assert.equal(await page.eval((d) => document.querySelector(`${d} .emu-scope-note`).textContent, D), '');
  // in Portuguese
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('pt'));
  await page.waitFor((d) => document.querySelector(`${d} h4`)?.textContent === 'Osciloscópio', [D], { what: 'Portuguese' });
  assert.equal(await page.eval((d) => document.querySelector(`${d} .emu-scope-ch2 option`).textContent, D), 'CH2: nenhum');
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('en'));
  assert.ok((await texts(page)).includes('100 ns/div'));
  assert.deepEqual(page.console.filter((c) => c.type === 'warning' || c.type === 'warn' || c.type === 'error').map((c) => c.text), []);
}, { timeout: 240000 });
