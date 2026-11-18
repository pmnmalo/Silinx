// UI (#4451): an instance's Width defines its pins' widths, the wires adapt: a REG1bit's instance r, its Q wired to the
// net name dout (no range), its C and CE to 1-bit I/O markers, D open, given Width 8 in its Properties: Q drawn the bus
// Q(7:0), its wire a bus; an I/O marker added on D with the Add I/O Marker tool 8 bits wide, D the bus D(7:0); C and CE
// shared on their 1-bit markers, Check Schematic says so in a warning each, none once ticked in Shared pins; the HDL
// dout and d 8 bits wide. In both interfaces.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject, readWs } from './harness.js';
import { normalizeDoc, symbolPins } from '../../core/schdoc.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;
const ED = '.doc:not([hidden]) .sch-editor';

const REG = `library ieee;\nuse ieee.std_logic_1164.all;\n\nentity REG1bit is\n  port (D, CE, C : in std_logic; Q : out std_logic);\nend entity REG1bit;\n\narchitecture rtl of REG1bit is\nbegin\n  process (C) begin\n    if rising_edge(C) then\n      if CE = '1' then Q <= D; end if;\n    end if;\n  end process;\nend architecture rtl;\n`;
const PORTS = ['D', 'CE', 'C', 'Q'].map((n) => ({ name: n, dir: n === 'Q' ? 'out' : 'in', width: 1 }));
const MODS = { REG1bit: { name: 'REG1bit', lang: 'vhdl', ports: PORTS } };
const S = { id: 'U', type: 'module', x: 300, y: 200, rot: 0, mirror: false, name: 'r', params: { module: 'REG1bit', generics: {}, ports: PORTS } };
const PIN = Object.fromEntries(symbolPins(S, MODS).map((p) => [p.name, p]));
// r: Q on the net dout, C and CE on 1-bit markers clk and ce, D open
function top() {
  const wires = [], ports = [], labels = [];
  for (const n of ['CE', 'C', 'Q']) {
    const p = PIN[n], b = { x: p.x + (p.side === 'W' ? -60 : 60), y: p.y };
    wires.push({ id: `w_${n}`, points: [{ x: p.x, y: p.y }, b] });
    if (n === 'Q') labels.push({ id: 'L1', x: b.x, y: b.y, net: 'dout' });
    else ports.push({ id: `m_${n}`, name: n === 'C' ? 'clk' : 'ce', dir: 'in', width: 1, x: b.x, y: b.y });
  }
  return normalizeDoc({ version: 4, name: 'top', lang: 'vhdl', generatedFile: 'src/top.vhd', symbols: [{ ...S }], wires, ports, labels });
}
// screen position of a sheet point (through the view transform)
const at = (page, x, y) => page.eval((px, py) => {
  const svg = document.querySelector('.doc:not([hidden]) .se-svg');
  const r = svg.getBoundingClientRect();
  const m = /translate\(([-\d.]+),([-\d.]+)\) scale\(([\d.]+)\)/.exec(svg.querySelector('.se-vp').getAttribute('transform'));
  return { x: r.left + +m[1] + px * +m[3], y: r.top + +m[2] + py * +m[3] };
}, x, y);

uiTest('#4451 Width 8 on r wired to dout and 1-bit markers: Q and its wire a bus; a marker added on D 8 bits wide; the shared pins said', E, async (page) => {
  await makeProject(env, { name: 'SchArrAd', top: 'top', files: { 'src/REG1bit.vhd': REG, 'src/top.vhd': 'entity top is end top;\narchitecture a of top is begin end a;\n', 'src/top.sch.json': JSON.stringify(top()) } });
  await page.openProject('SchArrAd');
  await page.eval(() => window.SilinxApp.openSch('src/top.sch.json'));
  await page.waitFor((ed) => document.querySelector(`${ed} svg .sym[data-id="U"]`), [ED], { what: 'drawn' });
  const log0 = () => page.eval(() => document.getElementById('console-log').textContent.length);
  const check = async () => {
    const n0 = await log0();
    await page.click(`${ED} .se-btn[data-act=check]`);
    await page.waitFor((n) => document.getElementById('console-log').textContent.length > n, [n0], { what: 'checked' });
    await new Promise((r) => setTimeout(r, 300));
    // (its messages: the log's text, each from its WARNING: or ERROR: to the next one or the process's line)
    return page.eval((k) => document.getElementById('console-log').textContent.slice(k).match(/(WARNING|ERROR): .*?(?=WARNING: |ERROR: |Process "|$)/g) || [], n0);
  };
  const getDoc = () => page.eval(() => window.Silinx.active.schEditor.getDoc());
  const drawn = () => page.eval((ed) => {
    const g = document.querySelector(`${ed} svg .sym[data-id="U"]`), txt = (c) => [...g.querySelectorAll(c)].map((t) => t.textContent);
    return { pins: txt('.pname'), buses: g.querySelectorAll('line.pin.bus').length};
  }, ED);
  const busWires = () => page.eval((ed) => [...document.querySelectorAll(`${ed} svg .wire.bus`)].length, ED);
  // Width 8, its wires there already
  await page.click(`${ED} svg .sym[data-id="U"] .hitbox`);
  await page.waitFor((ed) => document.querySelector(`${ed} .se-props input[data-param=arrayWidth]`), [ED], { what: 'its Width' });
  await page.eval((ed) => { const i = document.querySelector(`${ed} .se-props input[data-param=arrayWidth]`); i.focus(); i.value = '8'; i.dispatchEvent(new Event('change')); }, ED);
  await page.waitFor((ed) => document.querySelector(`${ed} svg .sym[data-id="U"] .stitle`)?.textContent === 'REG1bit ×8', [ED], { what: 'drawn as the array' });
  const d0 = await drawn();
  assert.deepEqual([d0.pins, d0.buses], [['D(7:0)', 'CE', 'C', 'Q(7:0)'], 2], 'Q on dout a bus, D open a bus, CE and C on their 1-bit markers single pins');
  assert.equal(await busWires(), 1, 'the wire of dout a bus');
  // an I/O marker added on D: 8 bits wide
  await page.key('Escape');
  await page.click(`${ED} .se-btn[data-act=io]`);
  await page.click(await at(page, PIN.D.x, PIN.D.y));
  await page.waitFor(() => document.activeElement?.matches('.se-prompt input'), [], { what: 'port name prompt focused' });
  await page.eval(() => { const i = document.querySelector('.se-prompt input'); i.value = 'd'; i.dispatchEvent(new Event('input')); });
  await page.key('Enter');
  await page.waitFor(() => window.Silinx.active.schEditor.getDoc().ports.some((p) => p.name === 'd'), [], { what: 'd placed' });
  assert.equal((await getDoc()).ports.find((p) => p.name === 'd').width, 8);
  await page.key('Escape');
  const d1 = await drawn();
  assert.deepEqual([d1.pins, d1.buses], [['D(7:0)', 'CE', 'C', 'Q(7:0)'], 2]);
  // Check: C and CE shared on their 1-bit markers, a warning each (and dout read by nothing)
  assert.deepEqual(await check(), [
    "WARNING: r(7:0): pin CE is shared by its 8 copies: its net 'ce' is 1 bit wide; tick it in Shared pins, or connect it to a 8-bit bus",
    "WARNING: r(7:0): pin C is shared by its 8 copies: its net 'clk' is 1 bit wide; tick it in Shared pins, or connect it to a 8-bit bus",
    "WARNING: net 'dout' connects only r(7:0).Q"]);
  // ticked in Shared pins: those warnings gone
  await page.click(`${ED} .se-btn[data-act=select]`);
  await page.click(`${ED} svg .sym[data-id="U"] .hitbox`);
  await page.waitFor((ed) => document.querySelector(`${ed} .se-props .se-shared`), [ED], { what: 'its Shared pins' });
  // (set on the panel shown, again until the document has it: the panel is drawn again after an edit)
  const tick = async (pin) => {
    for (let t = 0; t < 40 && !((await getDoc()).symbols[0].params.shared || []).includes(pin); t++) {
      await page.eval((ed, p) => { const i = document.querySelector(`${ed} .se-props .se-shared input[data-pin="${p}"]`); if (i && !i.checked) { i.checked = true; i.dispatchEvent(new Event('change')); } }, ED, pin);
      await new Promise((r) => setTimeout(r, 250));
    }
    assert.ok(((await getDoc()).symbols[0].params.shared || []).includes(pin), `${pin} ticked`);
  };
  await tick('CE');
  await tick('C');
  assert.deepEqual(await check(), ["WARNING: net 'dout' connects only r(7:0).Q"]);
  // the HDL: d and dout 8 bits wide, each copy its bit
  await page.waitFor(async () => /signal dout : std_logic_vector\(7 downto 0\);/.test(await (await fetch('/api/projects/SchArrAd/file?path=src%2Ftop.vhd')).text()), [], { what: 'the HDL follows the schematic', timeout: 15000 });
  const vhd = await readWs(env, 'SchArrAd', 'src/top.vhd');
  assert.match(vhd, /\n {4}d : in std_logic_vector\(7 downto 0\)\n/);
  assert.match(vhd, /D => d\(7\),\n {6}CE => ce,\n {6}C => clk,\n {6}Q => dout\(7\)/);
  assert.deepEqual(page.console.filter((c) => c.type === 'warning' || c.type === 'warn' || c.type === 'error').map((c) => c.text), []);
}, { timeout: 120000 });
