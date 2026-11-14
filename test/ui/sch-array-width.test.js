// UI (#3950): an instance's Width in its Properties: a REG1bit's instance on 8-bit buses given Width 8 is r(7:0), 8
// copies; drawn as the array (its name with its range above it, REG1bit ×8 in its box, D and Q bus pins D(7:0) and
// Q(7:0) with their width 8, C and CE on 1-bit nets single pins), Check Schematic clean; Undo makes it r again; a
// width not a whole number from 1 to 1024 refused with an error in the console; a rename with a range sets the field;
// in Portuguese; in both interfaces.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject } from './harness.js';
import { normalizeDoc, symbolPins } from '../../core/schdoc.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;
const ED = '.doc:not([hidden]) .sch-editor';

const REG = `library ieee;\nuse ieee.std_logic_1164.all;\n\nentity REG1bit is\n  port (D, CE, C : in std_logic; Q : out std_logic);\nend entity REG1bit;\n\narchitecture rtl of REG1bit is\nbegin\n  process (C) begin\n    if rising_edge(C) then\n      if CE = '1' then Q <= D; end if;\n    end if;\n  end process;\nend architecture rtl;\n`;
const PORTS = ['D', 'CE', 'C', 'Q'].map((n) => ({ name: n, dir: n === 'Q' ? 'out' : 'in', width: 1 }));
const MODS = { REG1bit: { name: 'REG1bit', lang: 'vhdl', ports: PORTS } };
function top() {
  const s = { id: 'U', type: 'module', x: 300, y: 200, rot: 0, mirror: false, name: 'r', params: { module: 'REG1bit', generics: {}, ports: PORTS } };
  const wires = [], ports = [];
  for (const p of symbolPins(s, MODS)) {
    const b = { x: p.x + (p.side === 'W' ? -60 : 60), y: p.y };
    wires.push({ id: `w_${p.name}`, points: [{ x: p.x, y: p.y }, b] });
    ports.push({ id: `m_${p.name}`, name: p.name.toLowerCase(), dir: p.dir === 'out' ? 'out' : 'in', width: p.name === 'D' || p.name === 'Q' ? 8 : 1, x: b.x, y: b.y });
  }
  return normalizeDoc({ version: 4, name: 'top', lang: 'vhdl', generatedFile: 'src/top.vhd', symbols: [s], wires, ports, labels: [] });
}

uiTest('#3950 Width 8 on a REG1bit\'s instance: r(7:0), drawn as the array, its D and Q bus pins; Undo; the errors said', E, async (page) => {
  await makeProject(env, { name: 'SchArrW', top: 'top', files: { 'src/REG1bit.vhd': REG, 'src/top.vhd': 'entity top is end top;\narchitecture a of top is begin end a;\n', 'src/top.sch.json': JSON.stringify(top()) } });
  await page.openProject('SchArrW');
  await page.eval(() => window.SilinxApp.openSch('src/top.sch.json'));
  await page.waitFor((ed) => document.querySelector(`${ed} svg .sym[data-id="U"]`), [ED], { what: 'drawn' });
  const log0 = () => page.eval(() => document.getElementById('console-log').textContent.length);
  const since = (n) => page.eval((k) => document.getElementById('console-log').textContent.slice(k), n);
  const check = async () => {
    const n0 = await log0();
    await page.click(`${ED} .se-btn[data-act=check]`);
    await page.waitFor((n) => document.getElementById('console-log').textContent.length > n, [n0], { what: 'checked' });
    await new Promise((r) => setTimeout(r, 300));
    return since(n0);
  };
  await page.click(`${ED} svg .sym[data-id="U"] .hitbox`);
  const fieldOf = (label) => page.eval((ed, l) => [...document.querySelectorAll(`${ed} .se-props .se-field`)].find((f) => f.querySelector('label').textContent === l)?.querySelector('input')?.value ?? null, ED, label);
  await page.waitFor((ed) => document.querySelector(`${ed} .se-props input[data-param=arrayWidth]`), [ED], { what: 'its Width' });
  assert.deepEqual([await fieldOf('Instance name'), await fieldOf('Width')], ['r', '1']);
  const setWidth = (v) => page.eval((ed, x) => { const i = document.querySelector(`${ed} .se-props input[data-param=arrayWidth]`); i.focus(); i.value = x; i.dispatchEvent(new Event('change')); }, ED, v);
  const name = () => page.eval(() => window.Silinx.active.schEditor.getDoc().symbols[0].name);
  // the drawing: its name, its title, its bus pins (their leads, names and widths)
  const drawn = () => page.eval((ed) => {
    const g = document.querySelector(`${ed} svg .sym[data-id="U"]`), txt = (c) => [...g.querySelectorAll(c)].map((t) => t.textContent);
    return { name: txt('.iname'), title: txt('.stitle'), pins: txt('.pname'), widths: txt('.pwidth'), buses: g.querySelectorAll('line.pin.bus').length };
  }, ED);
  await setWidth('8');
  await page.waitFor(async () => (await name()) === 'r(7:0)', [], { what: 'r(7:0)' }).catch(() => {});
  assert.equal(await name(), 'r(7:0)');
  await page.waitFor((ed) => document.querySelector(`${ed} svg .sym[data-id="U"] .stitle`)?.textContent === 'REG1bit ×8', [ED], { what: 'drawn as the array' });
  assert.deepEqual(await drawn(), { name: ['r(7:0)'], title: ['REG1bit ×8'], pins: ['D(7:0)', 'CE', 'C', 'Q(7:0)'], widths: ['8', '8'], buses: 2 });
  assert.deepEqual([await fieldOf('Instance name'), await fieldOf('Width')], ['r(7:0)', '8']);
  const log = await check();
  assert.doesNotMatch(log, /width mismatch|ERROR|WARNING/, log);
  // Undo: a single instance again, drawn as one
  await page.eval((ed) => document.querySelector(ed).focus(), ED);
  await page.key('z', { modifiers: 2 });
  await page.waitFor(async () => (await name()) === 'r', [], { what: 'undone' }).catch(() => {});
  assert.equal(await name(), 'r');
  assert.deepEqual(await drawn(), { name: ['r'], title: ['REG1bit'], pins: ['D', 'CE', 'C', 'Q'], widths: [], buses: 0 });
  // a width not a whole number from 1 to 1024: the error in the console, the instance as it was
  await page.click(`${ED} svg .sym[data-id="U"] .hitbox`);
  await page.waitFor((ed) => document.querySelector(`${ed} .se-props input[data-param=arrayWidth]`)?.value === '1', [ED], { what: 'its Width 1' });
  for (const [v, shown] of [['0', '0'], ['2.5', '2.5'], ['2000', '2000']]) {
    const n0 = await log0();
    await setWidth(v);
    await page.waitFor((n) => /ERROR: Width/.test(document.getElementById('console-log').textContent.slice(n)), [n0], { what: `refused ${v}` });
    assert.match(await since(n0), new RegExp(`ERROR: Width ${shown.replace('.', '\\.')}: a whole number from 1 to 1024`));
    assert.equal(await name(), 'r');
    assert.equal(await fieldOf('Width'), '1', 'the field back to its width');
  }
  // a rename with a range: its Width follows
  await page.eval((ed) => { const i = [...document.querySelectorAll(`${ed} .se-props .se-field`)].find((f) => f.querySelector('label').textContent === 'Instance name').querySelector('input'); i.focus(); i.value = 'r(3:0)'; i.dispatchEvent(new Event('change')); }, ED);
  await page.waitFor((ed) => document.querySelector(`${ed} .se-props input[data-param=arrayWidth]`)?.value === '4', [ED], { what: 'its Width 4' });
  // in Portuguese: the field, its note, the error
  await page.eval(async () => { (await import('/js/i18n.js')).setLanguage('pt'); });
  await page.waitFor((ed) => [...document.querySelectorAll(`${ed} .se-props .se-field label`)].some((l) => l.textContent === 'Largura'), [ED], { what: 'in Portuguese' });
  assert.ok(await page.eval((ed) => [...document.querySelectorAll(`${ed} .se-props .se-note`)].some((n) => n.textContent === 'cópias do módulo: os seus pinos em barramentos N vezes mais largos'), ED));
  const n1 = await log0();
  await setWidth('0');
  await page.waitFor((n) => /ERROR: Largura 0: um número inteiro de 1 a 1024/.test(document.getElementById('console-log').textContent.slice(n)), [n1], { what: 'the error in Portuguese' });
  await page.eval(async () => { (await import('/js/i18n.js')).setLanguage('en'); });
  assert.deepEqual(page.console.filter((c) => c.type === 'warning' || c.type === 'warn' || c.type === 'error').map((c) => c.text), []);
}, { timeout: 120000 });
