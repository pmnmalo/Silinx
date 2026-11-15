// UI (#3966): an arrayed instance's Shared pins in its Properties, under Width: r(7:0) of a REG1bit, CE open drawn as a
// bus until ticked, then a single pin (params.shared ['CE']), Check Schematic its one warning (CE not connected); its
// inputs alone listed, not the output Q (#4053); Undo back to none; a single instance has none; in Portuguese; in both interfaces.
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
// r(7:0): D and Q on 8-bit markers, C on a 1-bit one, CE open
function top() {
  const s = { id: 'U', type: 'module', x: 300, y: 200, rot: 0, mirror: false, name: 'r(7:0)', params: { module: 'REG1bit', generics: {}, ports: PORTS } };
  const wires = [], ports = [];
  for (const p of symbolPins(s, MODS).filter((q) => q.name !== 'CE')) {
    const b = { x: p.x + (p.side === 'W' ? -60 : 60), y: p.y };
    wires.push({ id: `w_${p.name}`, points: [{ x: p.x, y: p.y }, b] });
    ports.push({ id: `m_${p.name}`, name: p.name.toLowerCase(), dir: p.dir === 'out' ? 'out' : 'in', width: p.name === 'D' || p.name === 'Q' ? 8 : 1, x: b.x, y: b.y });
  }
  return normalizeDoc({ version: 4, name: 'top', lang: 'vhdl', generatedFile: 'src/top.vhd', symbols: [s], wires, ports, labels: [] });
}


uiTest('#3966 Shared pins of r(7:0): CE ticked drawn a single pin while open; Q ticked an error; Undo; in Portuguese', E, async (page) => {
  await makeProject(env, { name: 'SchArrSh', top: 'top', files: { 'src/REG1bit.vhd': REG, 'src/top.vhd': 'entity top is end top;\narchitecture a of top is begin end a;\n', 'src/top.sch.json': JSON.stringify(top()) } });
  await page.openProject('SchArrSh');
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
  const shared = () => page.eval(() => window.Silinx.active.schEditor.getDoc().symbols[0].params.shared ?? null);
  // (its marks as wanted, polled here: the edit lands after the change event)
  const sharedIs = async (want) => { for (let t = 0; t < 100 && JSON.stringify(await shared()) !== JSON.stringify(want); t++) await new Promise((r) => setTimeout(r, 50)); assert.deepEqual(await shared(), want); };
  const ticks = () => page.eval((ed) => [...document.querySelectorAll(`${ed} .se-props .se-shared input[type=checkbox]`)].map((i) => `${i.dataset.pin}:${i.checked ? 1 : 0}`), ED);
  const tick = (pin) => page.eval((ed, p) => { const i = document.querySelector(`${ed} .se-props .se-shared input[data-pin="${p}"]`); i.checked = !i.checked; i.dispatchEvent(new Event('change')); }, ED, pin);
  const drawn = () => page.eval((ed) => {
    const g = document.querySelector(`${ed} svg .sym[data-id="U"]`), txt = (c) => [...g.querySelectorAll(c)].map((t) => t.textContent);
    return { pins: txt('.pname'), widths: txt('.pwidth'), buses: g.querySelectorAll('line.pin.bus').length };
  }, ED);
  const select = async () => {
    await page.click(`${ED} svg .sym[data-id="U"] .hitbox`);
    await page.waitFor((ed) => document.querySelector(`${ed} .se-props .se-shared`), [ED], { what: 'its Shared pins' });
  };
  await select();
  assert.equal(await page.eval((ed) => document.querySelector(`${ed} .se-props .se-shared`).closest('.se-field').querySelector('label').textContent, ED), 'Shared pins');
  assert.deepEqual(await ticks(), ['D:0', 'CE:0', 'C:0'], 'its inputs alone (#4053)');
  // CE open: a bus, until ticked
  assert.deepEqual(await drawn(), { pins: ['D(7:0)', 'CE(7:0)', 'C', 'Q(7:0)'], widths: ['8', '8', '8'], buses: 3 });
  await tick('CE');
  await sharedIs(['CE']);
  await page.waitFor((ed) => document.querySelectorAll(`${ed} svg .sym[data-id="U"] line.pin.bus`).length === 2, [ED], { what: 'CE a single pin' });
  assert.deepEqual(await drawn(), { pins: ['D(7:0)', 'CE', 'C', 'Q(7:0)'], widths: ['8', '8'], buses: 2 });
  assert.deepEqual(await ticks(), ['D:0', 'CE:1', 'C:0'], 'the Properties redrawn with it');
  const log = await check();
  assert.doesNotMatch(log, /ERROR|width mismatch/, log);
  assert.deepEqual(log.match(/WARNING: .*?(?=WARNING|ERROR|Process)/g), ['WARNING: input pin CE of r(7:0) (REG1bit) is not connected'], log);
  assert.match(log, /completed successfully with 1 warning\(s\)/, log);
  // C ticked too, then Undo, twice: CE alone, then none (a bus again)
  await tick('C');
  await sharedIs(['CE', 'C']);
  for (const [want, buses] of [[['CE'], 2], [null, 3]]) {
    await page.eval((ed) => document.querySelector(ed).focus(), ED);
    await page.key('z', { modifiers: 2 });
    await sharedIs(want);
    await page.waitFor((ed, b) => document.querySelectorAll(`${ed} svg .sym[data-id="U"] line.pin.bus`).length === b, [ED, buses], { what: `${buses} buses` });
  }
  // a single instance: no Shared pins
  await select();
  await page.eval((ed) => { const i = document.querySelector(`${ed} .se-props input[data-param=arrayWidth]`); i.focus(); i.value = '1'; i.dispatchEvent(new Event('change')); }, ED);
  await page.waitFor((ed) => document.querySelector(`${ed} .se-props input[data-param=arrayWidth]`)?.value === '1' && !document.querySelector(`${ed} .se-props .se-shared`), [ED], { what: 'no Shared pins' });
  await page.eval((ed) => document.querySelector(ed).focus(), ED);
  await page.key('z', { modifiers: 2 });
  // in Portuguese: the field and its note
  await select();
  await page.eval(async () => { (await import('/js/i18n.js')).setLanguage('pt'); });
  await page.waitFor((ed) => [...document.querySelectorAll(`${ed} .se-props .se-field label`)].some((l) => l.textContent === 'Pinos partilhados'), [ED], { what: 'in Portuguese' });
  assert.ok(await page.eval((ed) => [...document.querySelectorAll(`${ed} .se-props .se-note`)].some((n) => n.textContent === 'marcado: um só pino para todas as cópias, a sua rede da largura do pino'), ED));
  assert.deepEqual(await ticks(), ['D:0', 'CE:0', 'C:0'], 'the pins\' names as they are');
  await page.eval(async () => { (await import('/js/i18n.js')).setLanguage('en'); });
  assert.deepEqual(page.console.filter((c) => c.type === 'warning' || c.type === 'warn' || c.type === 'error').map((c) => c.text), []);
}, { timeout: 120000 });
