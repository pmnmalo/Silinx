// UI: no HDL in a design and simulation project's editors (#3891, after #3780): the schematic's sheet (no HDL kept with
// it), its I/O markers (no HDL type), its palette (no HDL BLOCK, no device primitives, a module's ports alone) and its
// tips; a flip-flop's and an instance's properties; the state diagram's description, the ASM chart's parameters, the
// truth table's tick boxes; nothing of an editor (its text, tips, placeholders) names HDL, VHDL, Verilog or std_logic;
// in Portuguese; no warnings. An FPGA project keeps them (test/ui/diagrams.test.js, test/ui/fsm-side.test.js…). Both
// interfaces.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { setupUi, uiTest, makeProject, ROOT } from './harness.js';
import { newDoc } from '../../core/schdoc.js';
import { newModel } from '../../core/asm.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;

const FSM = fs.readFileSync(path.join(ROOT, 'examples/traffic/src/traffic.fsm.json'), 'utf8');
const BOOL = fs.readFileSync(path.join(ROOT, 'examples/traffic/src/lamps.bool.json'), 'utf8');
const D = '.doc:not([hidden])';
const HDL_WORDS = /\b(HDL|VHDL|Verilog|std_logic\w*|generics?|Xilinx)\b/i;
const warnings = async (page) => (await page.consoleText()).split('\n').filter((l) => /WARNING|ERROR/.test(l));
// every text of the document in front: its text, its tips, its placeholders, its options (the hidden ones too)
const texts = (page) => page.eval((d) => {
  const el = document.querySelector(d);
  const out = [];
  const walk = (n) => {
    if (n.nodeType === 3) { const t = n.textContent.trim(); if (t) out.push(t); return; }
    if (n.nodeType !== 1 || n.tagName === 'svg' || n.tagName === 'SCRIPT') return;
    for (const a of ['title', 'placeholder', 'aria-label']) if (n.getAttribute(a)) out.push(n.getAttribute(a));
    for (const c of n.childNodes) walk(c);
  };
  walk(el);
  return out;
}, D);
const hdlTexts = async (page) => (await texts(page)).filter((t) => HDL_WORDS.test(t));
const open = async (page, file, id) => {
  await page.eval((f) => window.SilinxApp.openFile(f), file);
  await page.waitFor((x) => window.Silinx.active?.id === x && document.querySelector('.doc:not([hidden])'), [id], { what: id });
};

uiTest('#3891 a design project\'s editors: no HDL in the schematic\'s, the state diagram\'s, the ASM chart\'s and the truth table\'s panels and tips; Portuguese; no warnings', E, async (page) => {
  const sch = newDoc('board', 'vhdl');
  sch.ports.push({ id: 'P1', name: 'a', dir: 'in', width: 1, x: 100, y: 200, rot: 0 });
  sch.symbols.push({ id: 'S1', type: 'fdce', x: 400, y: 300, rot: 0, mirror: false, name: 'U1', params: { init: '0' } });
  const asm = newModel('seq', 'vhdl');
  asm.generics = [{ name: 'N', default: 4 }];
  await makeProject(env, { name: 'DrawnEd', kind: 'design', top: 'traffic',
    files: { 'src/traffic.fsm.json': FSM, 'src/lamps.bool.json': BOOL, 'src/board.sch.json': JSON.stringify(sch), 'src/seq.asm.json': JSON.stringify(asm) } });
  await page.openProject('DrawnEd');
  await page.waitFor(() => document.documentElement.dataset.projectKind === 'design' && window.Silinx.modules.some((m) => m.name === 'seq'), [], { what: 'the design project' });

  // the schematic: its sheet's properties, the palette (no HDL BLOCK, no Device Primitives, a module's ports alone)
  await open(page, 'src/board.sch.json', 'sch:src/board.sch.json');
  await page.waitFor((d) => document.querySelector(`${d} .se-symrow`), [D], { what: 'the palette' });
  const sheet = await page.eval((d) => ({ fields: [...document.querySelectorAll(`${d} .se-props .se-field > label`)].map((l) => l.textContent), sections: [...document.querySelectorAll(`${d} .se-props summary`)].map((s) => s.textContent),
    cats: [...document.querySelectorAll(`${d} .se-cat option`)].map((o) => o.textContent) }), D);
  assert.deepEqual(sheet.fields, ['Module name', 'Description', 'Sheet size']);
  assert.deepEqual(sheet.sections, []);
  assert.ok(!sheet.cats.some((c) => /Device Primitives/.test(c)), sheet.cats.join(' | '));
  await page.fill(`${D} .se-search`, 'HDL');
  assert.deepEqual(await page.eval((d) => [...document.querySelectorAll(`${d} .se-symrow`)].filter((r) => r.getClientRects().length).map((r) => r.textContent), D), []);
  await page.fill(`${D} .se-search`, 'traffic');
  await page.click(`${D} .se-symrow`, { text: 'traffic' });
  assert.match(await page.eval((d) => document.querySelector(`${d} .se-sum`).textContent, D), /^\d+ ports$/);
  // an I/O marker's properties: no HDL type; the flip-flop's
  await page.key('Escape');   // (the palette's symbol no longer being placed)
  await page.click(`${D} g.port[data-id="P1"] .iomark`);
  const fields = () => page.eval((d) => [...document.querySelectorAll(`${d} .se-props .se-field > label`)].map((l) => l.textContent), D);
  await page.waitFor((d) => [...document.querySelectorAll(`${d} .se-props .se-ptitle`)].some((t) => t.textContent === 'I/O Marker'), [D], { what: 'the marker\'s properties' });
  assert.deepEqual(await fields(page), ['Name', 'Direction', 'Width']);
  assert.deepEqual(await hdlTexts(page), []);

  // the state diagram, the ASM chart, the truth table: nothing names HDL
  for (const [file, id] of [['src/traffic.fsm.json', 'fsm:src/traffic.fsm.json'], ['src/seq.asm.json', 'asm:src/seq.asm.json'], ['src/lamps.bool.json', 'tt:src/lamps.bool.json']]) {
    await open(page, file, id);
    await page.waitFor(() => (document.querySelector('.doc:not([hidden])')?.textContent || '').length > 20, [], { what: `${id} drawn` });
    assert.deepEqual(await hdlTexts(page), [], id);
  }
  // the truth table's tick boxes: the output's logic
  const ticks = await page.eval((d) => [...new Set([...document.querySelectorAll(`${d} .tt-hdl`)].map((e) => e.title))], D);
  assert.deepEqual(ticks, ['The logic of this output: its module and its schematic in this form']);
  // the ASM chart's parameters
  await open(page, 'src/seq.asm.json', 'asm:src/seq.asm.json');
  assert.ok((await texts(page)).includes('Registers are internal: assign them like registered outputs (next value at the clock edge, they hold otherwise) and read them anywhere. Parameters are integers, usable in expressions (e.g. cnt == N - 1).'));

  // in Portuguese
  await page.eval(() => Promise.all(window.Silinx.docs.filter((d) => d.id === 'asm:src/seq.asm.json').map((d) => window.SilinxApp.closeDoc(d))));
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('pt'));
  try {
    await open(page, 'src/seq.asm.json', 'asm:src/seq.asm.json');
    await page.waitFor((d) => document.querySelector(d).textContent.includes('Os parâmetros são inteiros, usáveis em expressões (p. ex. cnt == N - 1).'), [D], { what: 'the ASM chart\'s hint in Portuguese' });
    assert.deepEqual(await hdlTexts(page), []);
  } finally {
    await page.eval(async () => (await import('/js/i18n.js')).setLanguage('en'));
  }
  assert.deepEqual(await warnings(page), []);
});
