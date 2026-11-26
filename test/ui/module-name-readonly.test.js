// UI (#5718): a drawing's module name in its Properties is shown, never edited there: the schematic's (the sheet's
// Properties), the ASM chart's, the state diagram's and the Petri net's field read only (not disabled: its name copied, #5736), its tip saying where a module
// is renamed (the Design pane's Rename…), no line under it (no hint line). Changed there, it renamed the drawing alone: its HDL declared another
// module, and the hierarchy showed the one its parent instantiates "(missing)", with the error's red cross. In
// English and in Portuguese.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject, readWs } from './harness.js';
import { newDoc } from '../../core/schdoc.js';
import { newModel } from '../../core/asm.js';
import { newFsm } from '../../core/fsm.js';
import { newPetri } from '../../core/petri.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;
const TIP = 'Renamed with Rename… in the Design pane';
const TOP = `library ieee;
use ieee.std_logic_1164.all;

entity top is
  port (a : in std_logic; y : out std_logic);
end entity top;

architecture rtl of top is
begin
  u1 : entity work.sub port map (i => a, o => y);
end architecture rtl;
`;

// a field of the visible editor's Properties by its label: { readOnly, value, tip, note }
const fieldOf = (page, label) => page.eval((l) => {
  const f = [...document.querySelectorAll('.doc:not([hidden]) .se-field, .doc:not([hidden]) .asm-field')]
    .find((x) => x.querySelector('label, .asm-label')?.textContent === l);
  const i = f?.querySelector('input');
  return i && { readOnly: i.readOnly && !i.disabled, value: i.value, tip: i.title, note: f.querySelector('.se-note, .asm-fhint')?.textContent ?? null };
}, label);
// the Design pane's rows: "label meta"
const rows = (page) => page.eval(() => [...document.querySelectorAll('#hier .row')].map((r) => `${r.querySelector('.lbl').textContent} ${r.querySelector('.meta')?.textContent ?? ''}`.trim()));

uiTest('#5718 a schematic\'s module name in Properties: shown, read only, its tip; used, no module "(missing)" in the hierarchy', E, async (page) => {
  // top (VHDL) instantiates sub, drawn as a schematic: i -> inverter -> o
  const doc = newDoc('sub', 'vhdl');
  doc.symbols.push({ id: 'S1', type: 'inv', name: 'U1', x: 120, y: 90, rot: 0, mirror: false, params: { width: 1 } });
  doc.ports.push({ id: 'P1', name: 'i', dir: 'in', width: 1, x: 60, y: 100 }, { id: 'P2', name: 'o', dir: 'out', width: 1, x: 300, y: 100 });
  doc.wires.push({ id: 'W1', points: [{ x: 60, y: 100 }, { x: 120, y: 100 }] }, { id: 'W2', points: [{ x: 200, y: 100 }, { x: 300, y: 100 }] });
  await makeProject(env, { name: 'ModNamePj', top: 'top', files: { 'src/top.vhd': TOP, 'src/sub.sch.json': JSON.stringify(doc) } });
  await page.openProject('ModNamePj');
  await page.waitFor(() => [...document.querySelectorAll('#hier .row .lbl')].some((l) => l.textContent.startsWith('u1')), [], { what: 'the instance\'s row' });
  const hier = await rows(page);
  assert.ok(hier.some((r) => /^u1 - sub \(/.test(r) && !r.includes('(missing)')), `sub in the hierarchy: ${hier}`);
  await page.eval(() => window.SilinxApp.openSch('src/sub.sch.json'));
  await page.waitFor(() => document.querySelector('.doc:not([hidden]) .sch-editor svg .sym'), [], { what: 'the schematic drawn' });
  await page.waitFor(() => [...document.querySelectorAll('.doc:not([hidden]) .se-field label')].some((l) => l.textContent === 'Module name'), [], { what: 'the sheet\'s Properties' });
  assert.deepEqual(await fieldOf(page, 'Module name'), { readOnly: true, value: 'sub', tip: TIP, note: null });
  // used as before the fix (a value typed, the change sent): nothing renamed
  await page.eval(() => {
    const i = [...document.querySelectorAll('.doc:not([hidden]) .se-field')].find((f) => f.querySelector('label')?.textContent === 'Module name').querySelector('input');
    i.value = 'other'; i.dispatchEvent(new Event('input', { bubbles: true })); i.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await page.eval(() => window.SilinxApp.saveAll());
  assert.equal(await page.eval(() => window.Silinx.active.schEditor.getDoc().name), 'sub');
  assert.equal(JSON.parse(await readWs(env, 'ModNamePj', 'src/sub.sch.json')).name, 'sub');
  assert.match(await readWs(env, 'ModNamePj', 'src/sub.vhd'), /entity sub is/);
  await page.waitFor(() => [...document.querySelectorAll('#hier .row .lbl')].some((l) => l.textContent.startsWith('u1')), [], { what: 'the instance\'s row' });
  const after = await rows(page);
  assert.equal(after.filter((r) => r.includes('(missing)')).length, 0, `no module missing: ${after}`);
  assert.equal(await page.eval(() => document.querySelectorAll('#console-errors .diag').length), 0, 'no errors');
  // in Portuguese: the tip translated
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('pt'));
  try {
    assert.deepEqual(await fieldOf(page, 'Nome do módulo'), { readOnly: true, value: 'sub', tip: 'Muda-se com Mudar o Nome… no painel Design', note: null });
  } finally {
    await page.eval(async () => (await import('/js/i18n.js')).setLanguage('en'));
  }
});

uiTest('#5718 the ASM chart\'s, the state diagram\'s and the Petri net\'s module name: shown, read only, its tip', E, async (page) => {
  await makeProject(env, { name: 'ModNameDrw', files: {
    'src/ctl.asm.json': JSON.stringify(newModel('ctl', 'vhdl')),
    'src/seq.fsm.json': JSON.stringify(newFsm('seq', 'vhdl')),
    'src/net.pn.json': JSON.stringify(newPetri('net', 'vhdl')) } });
  await page.openProject('ModNameDrw');
  for (const [open, label, value] of [['openAsm', 'Module / entity name', 'ctl'], ['openFsm', 'Module name', 'seq'], ['openPetri', 'Module name', 'net']]) {
    const file = { openAsm: 'src/ctl.asm.json', openFsm: 'src/seq.fsm.json', openPetri: 'src/net.pn.json' }[open];
    await page.eval(([o, f]) => window.SilinxApp[o](f), [open, file]);
    await page.waitFor((l) => [...document.querySelectorAll('.doc:not([hidden]) .asm-field .asm-label')].some((x) => x.textContent === l), [label], { what: `${open}'s ${label}` });
    assert.deepEqual(await fieldOf(page, label), { readOnly: true, value, tip: TIP, note: null }, open);
  }
  assert.equal(await page.eval(() => document.querySelectorAll('#console-errors .diag').length), 0, 'no errors');
});
