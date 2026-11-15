// UI: the Design pane's rows of device primitives (#4188): a primitive placed in a schematic (RAMB16_S9, BUFG) or
// instantiated in HDL (Verilog's BUFG, VHDL's DCM_SP) is a leaf marked "(primitive)" with the chip's icon, on a Basys2's
// Spartan-3E and a Nexys3's Spartan-6; a module that is not in the project stays "(missing)", with the error's icon;
// in Portuguese too; no warnings.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject } from './harness.js';
import { newDoc } from '../../core/schdoc.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;

const VLOG = `module clk_top(input clk, input a, output y);
  wire g;
  BUFG ub (.I(clk), .O(g));
  gone ux (.a(a), .y(y));
endmodule
`;
const VHDL = `library ieee; use ieee.std_logic_1164.all;
library unisim; use unisim.vcomponents.all;
entity dcm_top is port (clk : in std_logic; o : out std_logic); end entity;
architecture rtl of dcm_top is
begin
  ud : DCM_SP port map (CLKIN => clk, CLKFB => '0', RST => '0', PSEN => '0', PSINCDEC => '0', PSCLK => '0', DSSEN => '0', CLK0 => o);
end architecture;
`;
const warnings = (page) => page.eval(() => [...document.querySelectorAll('#console-log .ln.warn, #console-log .ln.error')].map((l) => l.textContent));

for (const [board, device] of [
  ['basys2', { family: 'spartan3e', part: 'xc3s250e', package: 'cp132', speed: '-4' }],
  ['nexys3', { family: 'spartan6', part: 'xc6slx16', package: 'csg324', speed: '-3' }],
]) {
  uiTest(`#4188 the Design pane: a device primitive's instance is "(primitive)", a module not in the project "(missing)" (${board}), Portuguese`, E, async (page) => {
    const doc = newDoc('mem', 'vhdl');
    doc.symbols.push({ id: 'S1', type: 'bufg', x: 300, y: 200, rot: 0, mirror: false, name: 'U1', params: {} });
    if (device.family === 'spartan3e') doc.symbols.push({ id: 'S2', type: 'ramb16_s', x: 700, y: 200, rot: 0, mirror: false, name: 'U2', params: { portWidth: '9' } });
    const name = `Prim_${board}`;
    await makeProject(env, { name, top: 'mem', board, device, files: { 'src/mem.sch.json': JSON.stringify(doc), 'src/clk_top.v': VLOG, 'src/dcm_top.vhd': VHDL } });
    const before = (await warnings(page)).length;   // (the machine's own: no ISE, no programmer)
    await page.openProject(name);
    const want = ['u1 - BUFG (primitive)', ...(device.family === 'spartan3e' ? ['u2 - RAMB16_S9 (primitive)'] : []), 'ub - BUFG (primitive)', 'ux - gone (missing)', 'ud - DCM_SP (primitive)'];
    const text = () => page.eval(() => [...document.querySelectorAll('#hier .row')].filter((r) => /^u/.test(r.querySelector('.lbl').textContent))
      .map((r) => `${r.querySelector('.lbl').textContent} ${r.querySelector('.meta')?.textContent}`));
    await page.waitFor((n) => [...document.querySelectorAll('#hier .row .lbl')].filter((l) => /^u/.test(l.textContent)).length === n, [want.length], { what: 'the instances\' rows' });
    assert.deepEqual((await text()).sort(), [...want].sort());
    // (the primitives a leaf with the chip's icon; the missing module the error's)
    const look = await page.eval(() => Object.fromEntries([...document.querySelectorAll('#hier .row')].filter((r) => /^u/.test(r.querySelector('.lbl').textContent))
      .map((r) => [r.querySelector('.lbl').textContent, { leaf: r.querySelector('.twisty').textContent, ico: r.children[1].outerHTML }])));
    for (const [k, v] of Object.entries(look)) {
      assert.equal(v.leaf, '', `${k}: a leaf`);
      assert.equal(v.ico.includes('fill="#444"'), k !== 'ux - gone', `${k}: its icon`);
    }
    assert.deepEqual((await warnings(page)).slice(before), []);   // (no warnings)
    await page.eval(async () => (await import('/js/i18n.js')).setLanguage('pt'));
    try {
      await page.waitFor(() => [...document.querySelectorAll('#hier .row .meta')].some((m) => m.textContent === '(primitiva)'), [], { what: 'the PT rows' });
      assert.deepEqual((await text()).sort(), want.map((w) => w.replace('(primitive)', '(primitiva)').replace('(missing)', '(em falta)')).sort());
    } finally {
      await page.eval(async () => (await import('/js/i18n.js')).setLanguage('en'));
    }
  });
}
