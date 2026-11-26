// UI: the Board Emulator's Zynq-7000 boards drawn as the real ones (#4684, web/js/emulator-zybo-z7.js, emulator-arty-z7.js):
// the Digilent Zybo Z7 (dark green) and Arty Z7 (white), each part where it is, the RGB LEDs' three colours, the
// processing system's parts drawn and not wired, the Z7-10's differences; each control what is at its centre; in
// Portuguese. Both interfaces.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject } from './harness.js';
import { resolveBoard } from '../../server/devices.js';
import { TEXTS, untranslated } from './i18n-check.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;

// the boards' own parts: the LEDs a counter, the switches and buttons on the LEDs and the RGB LEDs
const design = (board) => {
  const zybo = board === 'zybo-z7', nsw = zybo ? 4 : 2;
  return `library ieee; use ieee.std_logic_1164.all; use ieee.numeric_std.all;
entity zy is
  port (clk : in std_logic; sw : in std_logic_vector(${nsw - 1} downto 0); btn : in std_logic_vector(3 downto 0);
        led : out std_logic_vector(3 downto 0); ${zybo ? 'led6_rgb' : 'led4_rgb, led5_rgb'} : out std_logic_vector(2 downto 0));
end zy;
architecture rtl of zy is
  signal q : unsigned(27 downto 0) := (others => '0');
begin
  process (clk) begin if rising_edge(clk) then q <= q + 1; end if; end process;
  led <= std_logic_vector(q(27 downto 26)) & sw(1 downto 0);
  ${zybo ? 'led6_rgb <= btn(2 downto 0);' : 'led4_rgb <= btn(2 downto 0); led5_rgb <= sw(1) & sw(0) & btn(3);'}
end rtl;
`;
};

/** The emulator open on `board` (its part: the variant's) with the board's own design. */
async function emulatorOn(page, board, name, part) {
  const device = { ...resolveBoard(board).device, ...(part ? { part } : {}) };
  await makeProject(env, { name, board, device, files: { 'src/zy.vhd': design(board) }, top: 'zy' });
  await page.openProject(name);
  assert.equal(await page.eval(() => window.SilinxApp.regenerateUcf()), true);
  await page.eval(() => window.SilinxApp.openFile('src/zy.vhd'));
  await page.menu('Tools', 'Board Emulator');
  await page.waitFor(() => window.Silinx.active?.id === 'emulator' && window.Silinx.active.view?.outputs, [], { what: 'emulator running' });
}
/** The board's parts ([data-part]) in the board's own units (the view may scale it): { W, H, name: { x, y, w, h } }. */
const geometry = (page) => page.eval(() => {
  const pcb = document.querySelector('.doc:not([hidden]) .emu-pcb'), r0 = pcb.getBoundingClientRect(), k = pcb.offsetWidth / r0.width;
  const g = { W: pcb.offsetWidth, H: pcb.offsetHeight };
  for (const el of pcb.querySelectorAll('[data-part]')) {
    const r = el.firstElementChild.getBoundingClientRect();
    g[el.dataset.part] = { x: (r.x + r.width / 2 - r0.x) * k, y: (r.y + r.height / 2 - r0.y) * k, w: r.width * k, h: r.height * k };
  }
  return g;
});
const artTexts = (page) => page.eval(() => Object.fromEntries([...document.querySelectorAll('.doc:not([hidden]) .emu-pcb-art text')].map((t) => [t.textContent, [+t.getAttribute('x'), +t.getAttribute('y')]])));
const silkOf = (page, cls) => page.eval((c) => [...document.querySelectorAll(`.doc:not([hidden]) .emu-pcb .${c}`)].map((e) => e.textContent), cls);
// the PCB's colour (its gradient's first stop)
const pcbColour = (page) => page.eval(() => document.querySelector('.doc:not([hidden]) .emu-pcb-art linearGradient stop').getAttribute('stop-color'));
const MAKERS = /xilinx|digilent|micron|issi|analog devices|realtek/i;
const leftToRight = (g, names) => names.every((n, i) => !i || g[names[i - 1]].x < g[n].x);
const noWarnings = (page) => assert.deepEqual(page.console.filter((c) => c.type === 'warning' || c.type === 'warn' || c.type === 'error').map((c) => c.text), []);
// the RGB LED `name`'s three LEDs: red, green, blue left to right, in one package (within 20 units), lit as the design drives them
async function rgb(page, g, name) {
  const parts = ['red', 'green', 'blue'].map((c) => `${name}_${c}`);
  assert.ok(leftToRight(g, parts) && Math.abs(g[parts[2]].x - g[parts[0]].x) < 20 && parts.every((p) => Math.abs(g[p].y - g[parts[0]].y) < 1), JSON.stringify(parts.map((p) => g[p])));
  assert.deepEqual(await page.eval((ps) => ps.map((p) => document.querySelector(`.doc:not([hidden]) [data-part="${p}"] .emu-led`).dataset.colour), parts), ['red', 'green', 'blue']);
}

uiTest('#4684 the Zybo Z7-20 drawn as the real board: dark green, its parts where they are, LD6 an RGB LED, the PS\'s parts drawn, the Zynq under its heat sink', E, async (page) => {
  await emulatorOn(page, 'zybo-z7', 'Emu-zybo20');
  const g = await geometry(page);
  assert.deepEqual([g.W, g.H], [900, 614]);   // (the board's proportions, 122 x 83 mm)
  assert.match(await pcbColour(page), /^#1[0-9a-f]5[0-9a-f]4[0-9a-f]$/);   // (dark green)
  // 4 LEDs and LD6's three, SW3..SW0, BTN3..BTN0, the power switch; no digit
  assert.deepEqual(await page.eval(() => ['.emu-led', '.emu-sw', '.emu-btn', '.emu-power', '.emu-pcb svg[viewBox="0 0 44 64"]'].map((s) => document.querySelectorAll(`.doc:not([hidden]) ${s}`).length)), [7, 4, 4, 1, 0]);
  // the power switch on the left edge, upright, near the top; its LED PGOOD's, right of the middle
  assert.ok(g.power.x < g.W * 0.06 && g.power.y < g.H * 0.2 && g.power.h > 2 * g.power.w, JSON.stringify(g.power));
  // LD3..LD0 over SW3..SW0, upright, left of the middle and over the bottom edge's Pmods; BTN3..BTN0 right of the middle
  const sws = ['sw3', 'sw2', 'sw1', 'sw0'], btns = ['btn3', 'btn2', 'btn1', 'btn0'];
  assert.ok(leftToRight(g, sws) && sws.every((s) => g[s].h > 1.5 * g[s].w && g[s].x < g.W * 0.4 && g[s].y > g.H * 0.65 && g[s].y < g.H * 0.85));
  for (let k = 0; k < 4; k++) assert.ok(Math.abs(g[`led${k}`].x - g[`sw${k}`].x) < 1 && g[`led${k}`].y < g[`sw${k}`].y, `LD${k} over SW${k}`);
  assert.ok(leftToRight(g, btns) && btns.every((b) => g[b].x > g.W * 0.55 && Math.abs(g[b].y - g.btn0.y) < 1));
  // LD6 (red, green, blue) over BTN3 and BTN2
  await rgb(page, g, 'led6');
  assert.ok(g.led6_red.y < g.btn3.y && g.led6_red.x > g.btn3.x && g.led6_blue.x < g.btn1.x);
  const silk = await silkOf(page, 'zy-silk');
  for (const t of ['LD0(M14)', 'LD3(D18)', 'SW0(G15)', 'SW3(T16)', 'BTN0(K18)', 'BTN3(Y16)']) assert.ok(silk.includes(t), t);
  // the connectors on their edges: the power jack, ETH, HDMI TX, SD MICRO and HDMI RX along the top, left to right; the
  // Pmods JE, JD, JC and JB along the bottom; JF (MIO) on the left edge; the audio jacks and JA (XADC) on the right
  const xs = await artTexts(page);
  for (const t of ['ZYBO Z7', 'DDR3L', 'FAN', 'ON', 'OFF', 'PROG', 'UART', 'USB OTG', 'LD4', 'MIO7', 'BTN4', 'BTN5', 'BTN6', 'BTN7', 'PS-SRST', 'PGOOD', 'DONE', 'JP5', 'J13', 'LD5', 'LD6', 'XADC']) assert.ok(t in xs, t);
  assert.ok(['5V ONLY', 'ETH', 'HDMI TX', 'SD MICRO', 'HDMI RX'].every((t, i, a) => xs[t][1] < g.H * 0.27 && (!i || xs[a[i - 1]][0] < xs[t][0])), JSON.stringify(xs));
  assert.ok(['JE', 'JD', 'JC', 'JB'].every((t, i, a) => xs[t][1] > g.H * 0.8 && (!i || xs[a[i - 1]][0] < xs[t][0])));
  assert.ok(xs.JF[0] < g.W * 0.1 && xs.JA[0] > g.W * 0.9 && xs.JA[1] > xs['LINE IN'][1]);
  assert.ok(['HPH OUT', 'MIC IN', 'LINE IN'].every((t, i, a) => xs[t][0] > g.W * 0.85 && (!i || xs[a[i - 1]][1] < xs[t][1])));
  assert.deepEqual(Object.keys(xs).filter((t) => MAKERS.test(t)), []);
  noWarnings(page);
});

uiTest('#4684 the Zybo Z7-10: no Pmod JB, no fan, the Zynq with no heat sink (its name on it)', E, async (page) => {
  await emulatorOn(page, 'zybo-z7', 'Emu-zybo10', 'xc7z010');
  const xs = await artTexts(page);
  assert.deepEqual(['JB', 'FAN', 'ZYNQ', 'XC7Z010', 'JC'].map((t) => t in xs), [false, false, true, true, true]);
  noWarnings(page);
});

uiTest('#4684 the Arty Z7 drawn as the real board: white, its names white on black, LD5 and LD4 RGB LEDs over SW1 and SW0, LD3..LD0 over BTN3..BTN0', E, async (page) => {
  await emulatorOn(page, 'arty-z7', 'Emu-arty20');
  const g = await geometry(page);
  assert.deepEqual([g.W, g.H], [900, 675]);   // (the board's proportions)
  assert.match(await pcbColour(page), /^#f[0-9a-f]f[0-9a-f]f[0-9a-f]$/);   // (white)
  assert.deepEqual(await page.eval(() => ['.emu-led', '.emu-sw', '.emu-btn', '.emu-power'].map((s) => document.querySelectorAll(`.doc:not([hidden]) ${s}`).length)), [10, 2, 4, 1]);
  // no power switch on the board: the emulator's by the power jack (left edge, low), upright
  assert.ok(g.power.x < g.W * 0.2 && g.power.y > g.H * 0.65 && g.power.h > 2 * g.power.w, JSON.stringify(g.power));
  // SW1, SW0 upright left of LD3..LD0 over BTN3..BTN0, all in the bottom fifth
  const cols = [3, 2, 1, 0];
  assert.ok(leftToRight(g, ['sw1', 'sw0', 'btn3']) && ['sw1', 'sw0'].every((s) => g[s].h > 1.5 * g[s].w));
  assert.ok(leftToRight(g, cols.map((k) => `btn${k}`)) && cols.every((k) => Math.abs(g[`led${k}`].x - g[`btn${k}`].x) < 1 && g[`led${k}`].y < g[`btn${k}`].y && g[`btn${k}`].y > g.H * 0.8));
  // LD5 and LD4 (red, green, blue) over SW1 and SW0
  await rgb(page, g, 'ld5');
  await rgb(page, g, 'ld4');
  assert.ok(Math.abs(g.ld5_green.x - g.sw1.x) < 1 && Math.abs(g.ld4_green.x - g.sw0.x) < 6 && g.ld5_green.y < g.sw1.y);
  const silk = await silkOf(page, 'az-silk');
  for (const t of ['LD0(R14)', 'LD3(M14)', 'BTN0(D19)', 'BTN3(L19)', 'SW0', 'SW1', '(M20)', '(M19)']) assert.ok(silk.includes(t), t);
  // the connectors: USB HOST, HDMI OUT, HDMI IN, JA and JB along the top, left to right; PROG UART, ETHERNET, AUDIO OUT,
  // 7-15V and SRST down the left edge
  const xs = await artTexts(page);
  for (const t of ['Arty Z7', 'ZYNQ', 'XC7Z020', 'DDR3', 'JP4', 'SD', 'QSPI', 'JTAG', 'DONE', 'CK_RST', 'SPI', 'SD CARD', 'USB REG', 'LD4', 'LD5', 'TX', 'RX']) assert.ok(t in xs, t);
  assert.ok(['USB HOST', 'HDMI OUT', 'HDMI IN', 'JA', 'JB'].every((t, i, a) => xs[t][1] < g.H * 0.22 && (!i || xs[a[i - 1]][0] < xs[t][0])), JSON.stringify(xs));
  assert.ok(['UART', 'ETHERNET', 'AUDIO OUT', '7-15V', 'SRST'].every((t, i, a) => xs[t][0] < g.W * 0.2 && (!i || xs[a[i - 1]][1] < xs[t][1])));
  // the names white on black boxes
  assert.equal(await page.eval(() => document.querySelector('.doc:not([hidden]) .emu-pcb-art text[fill="#fff"]').previousElementSibling.getAttribute('fill')), '#141414');
  assert.deepEqual(Object.keys(xs).filter((t) => MAKERS.test(t)), []);
  noWarnings(page);
});

// each control is what is at its centre (no label, no other part over it)
for (const board of ['zybo-z7', 'arty-z7']) {
  uiTest(`#4684 the ${board}'s controls: each one is what is at its centre`, E, async (page) => {
    await emulatorOn(page, board, `Emu-aim-${board}`);
    assert.deepEqual(await page.eval(() => [...document.querySelectorAll('.doc:not([hidden]) .emu-pcb .emu-btn, .doc:not([hidden]) .emu-pcb .emu-sw, .doc:not([hidden]) .emu-pcb .emu-power')].filter((c) => {
      c.scrollIntoView({ block: 'center', inline: 'center' });
      const r = c.getBoundingClientRect(), at = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return !(at === c || c.contains(at));
    }).map((c) => c.title)), []);
  });
}

uiTest('#4684 the Zybo Z7 and the Arty Z7 in Portuguese: the controls\' tips translated, the silkscreen as on the board', E, async (page) => {
  const setLang = (l) => page.eval(async (x) => { (await import('/js/i18n.js')).setLanguage(x); }, l);
  await page.eval(TEXTS);
  for (const [board, cls] of [['zybo-z7', 'zy-silk'], ['arty-z7', 'az-silk']]) {
    await emulatorOn(page, board, `Emu-pt-${board}`);
    await setLang('en');
    const en = await page.eval(() => window.__uiTexts(document.querySelector('.doc:not([hidden]) .emu-pcb')));
    const silk = await silkOf(page, cls);
    await setLang('pt');
    const pt = await page.eval(() => window.__uiTexts(document.querySelector('.doc:not([hidden]) .emu-pcb')));
    assert.deepEqual(untranslated(en, pt, [/^\w+<\d+>$/]), [], board);   // (the design's ports on the parts: its names)
    assert.ok(pt.some((t) => /^@.* — (clique para comutar$|carregue e mantenha)/.test(t)), `${board}: ${pt.filter((t) => t.startsWith('@')).slice(0, 3)}`);
    assert.deepEqual(await silkOf(page, cls), silk, `${board}: the silkscreen`);
    await setLang('en');
    await page.eval(() => window.SilinxApp.closeDoc(window.SilinxApp.findDoc('emulator')));
  }
  noWarnings(page);
});
