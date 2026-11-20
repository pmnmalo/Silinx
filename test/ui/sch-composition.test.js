// UI: a palette symbol's composition (#4808, web/js/sch-composition.js): an ADD8 of a schematic pushed into from its
// Properties (Push into) opens a read-only tab of how it is built, its notice at the end of the toolbar; ⬇ Push into
// (a double-click) goes down to an ADD4 and ⬆ Up (Backspace) back. Pushed into during a Try it, its values are the
// symbol's there, through the levels below, and follow them; Symbol Info's Composition section lists the levels and
// opens it; in Portuguese. Both interfaces.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject } from './harness.js';
import { newDoc, normalizeDoc, symbolPins } from '../../core/schdoc.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;
const ED = '.doc:not([hidden]) .sch-editor';

// a schematic of one ADD8 (carries in and out), U1, each pin on a marker of its name
function adderDoc() {
  const doc = newDoc('top', 'vhdl');
  const s = { id: 'S1', type: 'add', x: 400, y: 300, rot: 0, mirror: false, name: 'U1', params: { width: 8, cin: true, cout: true, bits: false } };
  doc.symbols.push(s);
  for (const q of symbolPins(s)) {
    const dx = q.dir === 'in' ? -80 : 80;
    doc.ports.push({ id: `P${q.name}`, name: q.name, dir: q.dir, width: q.width || 1, x: q.x + dx, y: q.y });
    doc.wires.push({ id: `W${q.name}`, points: [{ x: q.x + dx, y: q.y }, { x: q.x, y: q.y }] });
  }
  return normalizeDoc(doc);
}

// the composition's tab: its level's path, its notice, the value of a marker of the level shown (its Try it)
const comp = (page) => page.eval(() => {
  const d = window.Silinx.active, L = d?.viewer?.liveSim;
  const val = (n) => { const p = d?.viewer?.getDoc().ports.find((x) => x.name === n); const v = p && L?.portValue(p.id); return v ? v.v.toString(16) : null; };
  return { id: d?.id, title: d?.title, path: d?.composition?.path.join('/'), banner: document.querySelector('.doc:not([hidden]) .se-banner')?.textContent, S: val('S'), CO: val('CO') };
});

uiTest('#4808 an ADD8 pushed into: its composition, level by level, read-only; during a Try it, its values; Symbol Info; Portuguese', E, async (page) => {
  await makeProject(env, { name: 'Comp', files: { 'src/top.sch.json': JSON.stringify(adderDoc()) } });
  await page.openProject('Comp');
  await page.eval(() => window.SilinxApp.openSch('src/top.sch.json'));
  await page.waitFor((ed) => document.querySelector(`${ed} svg .sym[data-id="S1"]`), [ED], { what: 'drawn' });
  // Properties' Push into
  await page.click(`${ED} svg .sym[data-id="S1"] .hitbox`);
  await page.click(`${ED} .se-pushinto`);
  await page.waitFor(() => window.Silinx.active?.id === 'comp:ADD8', [], { what: 'the composition opened' });
  await page.waitFor((ed) => document.querySelector(`${ed} svg .sym`), [ED], { what: 'its drawing' });
  let c = await comp(page);
  assert.deepEqual([c.title, c.path, c.banner], ['ADD8 (composition)', 'ADD8', 'Read-only, how ADD8 is built: ADD8']);
  assert.ok(await page.eval((ed) => document.querySelector(ed).classList.contains('read-only'), ED), 'read-only');
  // down to an ADD4, then an FA1, and back up
  await page.dblclick(`${ED} svg .sym[data-id="S2"] .hitbox`);
  await page.waitFor(() => window.Silinx.active?.composition?.path.join('/') === 'ADD8/ADD4', [], { what: 'pushed into U0' });
  assert.equal((await comp(page)).banner, 'Read-only, how ADD8 is built: ADD8 › U0 (ADD4)');
  await page.click(`${ED} svg .sym[data-id="S1"] .hitbox`);
  await page.click('.doc:not([hidden]) [data-nav="into"]');
  await page.waitFor(() => window.Silinx.active?.composition?.path.join('/') === 'ADD8/ADD4/FA1', [], { what: '⬇ Push into an FA1' });
  assert.deepEqual(await page.eval(() => window.Silinx.active.viewer.getDoc().symbols.map((x) => x.type).sort()), ['and2', 'and2', 'or2', 'xor2', 'xor2']);
  await page.click('.doc:not([hidden]) [data-nav="up"]');
  await page.waitFor(() => window.Silinx.active?.composition?.path.join('/') === 'ADD8/ADD4', [], { what: '⬆ Up' });
  await page.key('Backspace');
  await page.waitFor(() => window.Silinx.active?.composition?.path.join('/') === 'ADD8', [], { what: 'Backspace: up' });

  // a Try it of the schematic: A = 5F, B = 21, CI = 1; the ADD8 double-clicked: its composition with those values
  await page.eval(() => window.SilinxApp.openSch('src/top.sch.json'));
  const setInputs = (a, b, ci) => page.eval(async (v) => {
    const ed = window.Silinx.active.schEditor;
    await ed.tryWith({ PA: { width: 8, value: BigInt(v[0]) }, PB: { width: 8, value: BigInt(v[1]) }, PCI: { width: 1, value: BigInt(v[2]) } });
  }, [a, b, ci]);
  await setInputs(0x5f, 0x21, 1);
  await page.waitFor(() => window.Silinx.active?.schEditor?.simulating, [], { what: 'Try it' });
  await page.dblclick(`${ED} svg .sym[data-id="S1"] .hitbox`);
  await page.waitFor(() => window.Silinx.active?.id === 'comp:ADD8' && window.Silinx.active.viewer?.simulating, [], { what: 'its composition, simulated' });
  await page.waitFor(async () => { const L = window.Silinx.active.viewer.liveSim; return L && L.portValue(window.Silinx.active.viewer.getDoc().ports.find((p) => p.name === 'S').id)?.v === 0x81n; }, [], { what: 'S = 81' });
  c = await comp(page);
  assert.deepEqual([c.S, c.CO, c.banner], ['81', '0', 'Read-only, how ADD8 is built: ADD8, its values U1\'s in the Try it of top']);
  // pushed into U1 (bits 7:4) in its Try it: A = 5, B = 2, the carry of 0xF + 1 + 1: S = 8
  await page.dblclick(`${ED} svg .sym[data-id="S1"] .hitbox`);
  await page.waitFor(() => window.Silinx.active?.composition?.path.join('/') === 'ADD8/ADD4', [], { what: 'into U1, simulated' });
  await page.waitFor(async () => { const d = window.Silinx.active, L = d.viewer.liveSim; return L && L.portValue(d.viewer.getDoc().ports.find((p) => p.name === 'S').id)?.v === 8n; }, [], { what: 'U1: S = 8' });
  // the schematic's inputs changed (A = 0F, B = 01, CI = 0): U1's follow, A = 0, B = 0 and the carry: S = 1
  await page.eval(() => window.SilinxApp.openSch('src/top.sch.json'));
  await setInputs(0x0f, 0x01, 0);
  await page.waitFor(() => { const d = window.Silinx.docs.find((x) => x.id === 'comp:ADD8'), L = d?.viewer?.liveSim; return L && L.portValue(d.viewer.getDoc().ports.find((p) => p.name === 'S').id)?.v === 1n; }, [], { what: 'U1 follows: S = 1' });
  // the schematic's Try it ended: the composition keeps its own, no longer the symbol's
  await page.eval(() => window.Silinx.active.schEditor.stopSimulation());
  await page.waitFor(() => !/Try it of top/.test(window.Silinx.docs.find((x) => x.id === 'comp:ADD8')?.el?.querySelector('.se-banner')?.textContent || 'Try it of top'), [], { what: 'its notice without the Try it' });

  // the right-click menu's Push into, after Symbol Info…
  await page.eval(() => window.SilinxApp.openSch('src/top.sch.json'));
  await page.rightClick(`${ED} svg .sym[data-id="S1"] .hitbox`);
  await page.waitFor(() => document.querySelector('body > .menu-popup'), [], { what: 'the menu' });
  const items = await page.eval(() => [...document.querySelectorAll('body > .menu-popup .mi .lbl')].map((m) => m.textContent));
  assert.deepEqual(items.slice(0, 2), ['Symbol Info…', 'Push into']);
  await page.click('body > .menu-popup > .mi', { index: 1 });
  await page.waitFor(() => window.Silinx.active?.id === 'comp:ADD8' && window.Silinx.active.composition?.path.join('/') === 'ADD8', [], { what: 'opened from the menu' });
  assert.equal((await comp(page)).banner, 'Read-only, how ADD8 is built: ADD8', 'not from a Try it');
  await page.eval(() => window.SilinxApp.openSch('src/top.sch.json'));
  // Symbol Info: its Composition section; its button opens it
  await page.click(`${ED} svg .sym[data-id="S1"] .hitbox`);
  await page.key('F1');
  await page.waitFor(() => document.querySelector('.se-symdoc .sd-comp'), [], { what: 'Symbol Info' });
  assert.deepEqual(await page.eval(() => [...document.querySelectorAll('.se-symdoc .sd-comp [data-level]')].map((e) => e.textContent)), ['ADD8 = 2 × ADD4', 'ADD4 = 4 × FA1', 'FA1 = 2 × XOR2 + 2 × AND2 + OR2']);
  await page.click('.se-symdoc [data-act="composition"]');
  await page.waitFor(() => window.Silinx.active?.id === 'comp:ADD8' && !document.querySelector('.se-symdoc'), [], { what: 'opened from Symbol Info' });

  // in Portuguese
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('pt'));
  await page.waitFor(() => /Só de leitura, como ADD8 é construído/.test(document.querySelector('.doc:not([hidden]) .se-banner')?.textContent || ''), [], { what: 'the notice in Portuguese' });
  assert.match(await page.eval(() => document.querySelector('.doc:not([hidden]) [data-nav="up"]').textContent), /Subir/);
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('en'));
});
