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

// #4809: a multiplexer pushed into as the adder is: M4_1 of three M2_1, down to its gates; during a Try it, S = 2 picks D2
uiTest('#4809 an M4_1 pushed into: three M2_1, then the gates; its values from the Try it', E, async (page) => {
  const doc = newDoc('top', 'vhdl');
  const s = { id: 'S1', type: 'mux4', x: 400, y: 300, rot: 0, mirror: false, name: 'U1', params: { width: 1, en: false, selBus: false, bits: false } };
  doc.symbols.push(s);
  for (const q of symbolPins(s)) {
    const [dx, dy] = q.side === 'S' ? [0, 80] : q.dir === 'in' ? [-80, 0] : [80, 0];
    doc.ports.push({ id: `P${q.name}`, name: q.name, dir: q.dir, width: 1, x: q.x + dx, y: q.y + dy });
    doc.wires.push({ id: `W${q.name}`, points: [{ x: q.x + dx, y: q.y + dy }, { x: q.x, y: q.y }] });
  }
  await makeProject(env, { name: 'CompMux', files: { 'src/top.sch.json': JSON.stringify(normalizeDoc(doc)) } });
  await page.openProject('CompMux');
  await page.eval(() => window.SilinxApp.openSch('src/top.sch.json'));
  await page.waitFor((ed) => document.querySelector(`${ed} svg .sym[data-id="S1"]`), [ED], { what: 'drawn' });
  // a Try it: D2 = 1, the others 0, S = 2 (S1 = 1, S0 = 0)
  await page.eval(async () => {
    const ed = window.Silinx.active.schEditor, one = (v) => ({ width: 1, value: BigInt(v) });
    await ed.tryWith({ PD0: one(0), PD1: one(0), PD2: one(1), PD3: one(0), PS0: one(0), PS1: one(1) });
  });
  await page.waitFor(() => window.Silinx.active?.schEditor?.simulating, [], { what: 'Try it' });
  await page.dblclick(`${ED} svg .sym[data-id="S1"] .hitbox`);
  await page.waitFor(() => window.Silinx.active?.id === 'comp:M4_1' && window.Silinx.active.viewer?.simulating, [], { what: 'its composition, simulated' });
  const out = () => page.eval(() => { const d = window.Silinx.active, L = d.viewer.liveSim; const p = d.viewer.getDoc().ports.find((x) => x.name === 'O'); return L?.portValue(p.id)?.v?.toString(); });
  await page.waitFor(async () => { const d = window.Silinx.active, L = d.viewer.liveSim; return L?.portValue(d.viewer.getDoc().ports.find((x) => x.name === 'O').id)?.v === 1n; }, [], { what: 'O = D2 = 1' });
  assert.equal((await comp(page)).banner, 'Read-only, how M4_1 is built: M4_1, its values U1\'s in the Try it of top');
  // into U1 (D2, D3), an M2_1: S0 = 0 picks its D0, D2 of the top
  await page.dblclick(`${ED} svg .sym[data-id="S2"] .hitbox`);
  await page.waitFor(() => window.Silinx.active?.composition?.path.join('/') === 'M4_1/M2_1', [], { what: 'into U1' });
  await page.waitFor(async () => { const d = window.Silinx.active, L = d.viewer.liveSim; return L?.portValue(d.viewer.getDoc().ports.find((x) => x.name === 'D0').id)?.v === 1n; }, [], { what: 'its D0 = D2 = 1' });
  assert.equal(await out(), '1');
  assert.deepEqual(await page.eval(() => window.Silinx.active.viewer.getDoc().symbols.map((x) => x.type).sort()), ['and2', 'and2', 'inv', 'or2']);
});

// #4811: a counter pushed into during a Try it: its count is the symbol's (forced: the composition's own register starts
// at 0), its incrementer computing the next one, both following the clock edges of the schematic's Try it
uiTest('#4811 a CB4CE pushed into: its count the symbol\'s in the Try it, its INC4 the next value, following the clock', E, async (page) => {
  const doc = newDoc('top', 'vhdl');
  const s = { id: 'S1', type: 'counter', x: 400, y: 300, rot: 0, mirror: false, name: 'U1', params: { width: 4, en: true, reset: 'async', dir: 'up', bits: false } };
  doc.symbols.push(s);
  for (const q of symbolPins(s)) {
    const dx = q.dir === 'in' ? -80 : 80;
    doc.ports.push({ id: `P${q.name}`, name: q.name, dir: q.dir, width: q.width || 1, x: q.x + dx, y: q.y });
    doc.wires.push({ id: `W${q.name}`, points: [{ x: q.x + dx, y: q.y }, { x: q.x, y: q.y }] });
  }
  await makeProject(env, { name: 'CompCnt', files: { 'src/top.sch.json': JSON.stringify(normalizeDoc(doc)) } });
  await page.openProject('CompCnt');
  await page.eval(() => window.SilinxApp.openSch('src/top.sch.json'));
  await page.waitFor((ed) => document.querySelector(`${ed} svg .sym[data-id="S1"]`), [ED], { what: 'drawn' });
  // a Try it, CE = 1, three clock edges: Q = 3
  const edges = (k) => page.eval(async (n) => { const d = window.Silinx.docs.find((x) => x.id === 'sch:src/top.sch.json'), L = d.schEditor.liveSim; for (let i = 0; i < n; i++) L.cycle('PC'); d.schEditor.tryState?.(); }, k);
  await page.eval(async () => { await window.Silinx.active.schEditor.tryWith({ PCE: { width: 1, value: 1n }, PCLR: { width: 1, value: 0n } }); });
  await page.waitFor(() => window.Silinx.active?.schEditor?.simulating, [], { what: 'Try it' });
  await edges(3);
  await page.dblclick(`${ED} svg .sym[data-id="S1"] .hitbox`);
  const val = (name) => page.eval((n) => { const d = window.Silinx.docs.find((x) => x.id === 'comp:CB4CE'), L = d?.viewer?.liveSim; const p = d?.viewer?.getDoc().ports.find((x) => x.name === n); return p && L?.portValue(p.id)?.v?.toString(); }, name);
  await page.waitFor(async () => { const d = window.Silinx.docs.find((x) => x.id === 'comp:CB4CE'), L = d?.viewer?.liveSim; const p = d?.viewer?.getDoc().ports.find((x) => x.name === 'Q'); return L?.portValue(p.id)?.v === 3n; }, [], { what: 'its Q = 3, the symbol\'s' });
  // into its INC4: A = 3, S = 4
  await page.dblclick(`${ED} svg .sym[data-id="S1"] .hitbox`);
  await page.waitFor(() => window.Silinx.active?.composition?.path.join('/') === 'CB4CE/INC4', [], { what: 'into U0' });
  await page.waitFor(async () => { const d = window.Silinx.active, L = d.viewer.liveSim; return L?.portValue(d.viewer.getDoc().ports.find((x) => x.name === 'S').id)?.v === 4n; }, [], { what: 'S = 4' });
  assert.equal(await val('A'), '3');
  // two more edges in the schematic's Try it: A = 5, S = 6
  await edges(2);
  await page.eval(async () => (await import('/js/sch-composition.js')).liveUpdated(window.Silinx.docs.find((x) => x.id === 'sch:src/top.sch.json').schEditor));
  await page.waitFor(async () => { const d = window.Silinx.active, L = d.viewer.liveSim; return L?.portValue(d.viewer.getDoc().ports.find((x) => x.name === 'A').id)?.v === 5n; }, [], { what: 'A follows: 5' });
  assert.equal(await val('S'), '6');
});

// #4981: a double-click on a palette symbol built of others enters it, as on a module's instance (#2046); its
// Properties a click's; a gate's double-click as before (its first field); in Portuguese
uiTest('#4981 a double-click on an ADD8 enters its composition; on a gate, its Properties; Portuguese', E, async (page) => {
  const doc = adderDoc();
  doc.symbols.push({ id: 'S2', type: 'and2', x: 400, y: 600, rot: 0, mirror: false, name: 'G1', params: { width: 1, bits: false } });
  await makeProject(env, { name: 'CompDbl', files: { 'src/top.sch.json': JSON.stringify(normalizeDoc(doc)) } });
  await page.openProject('CompDbl');
  for (const lang of ['en', 'pt']) {
    await page.eval(async (l) => (await import('/js/i18n.js')).setLanguage(l), lang);
    await page.eval(() => window.SilinxApp.openSch('src/top.sch.json'));
    await page.waitFor((ed) => document.querySelector(`${ed} svg .sym[data-id="S1"]`), [ED], { what: 'drawn' });
    // a click: its Properties, with its Push into
    await page.click(`${ED} svg .sym[data-id="S1"] .hitbox`);
    await page.waitFor((ed) => document.querySelector(`${ed} .se-pushinto`), [ED], { what: 'its Properties' });
    await page.dblclick(`${ED} svg .sym[data-id="S1"] .hitbox`);
    await page.waitFor(() => window.Silinx.active?.id === 'comp:ADD8', [], { what: 'entered' });
    // (its tab's title as shown, translated)
    await page.waitFor((t) => document.querySelector('#doc-tabs .tab.active')?.textContent.includes(t), [lang === 'en' ? 'ADD8 (composition)' : 'ADD8 (composição)'], { what: `its tab (${lang})` });
    const c = await comp(page);
    assert.deepEqual([c.path, c.banner], lang === 'en' ? ['ADD8', 'Read-only, how ADD8 is built: ADD8'] : ['ADD8', 'Só de leitura, como ADD8 é construído: ADD8'], lang);
  }
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('en'));
  // a gate: no composition, its first field in focus, the tab the schematic's
  await page.eval(() => window.SilinxApp.openSch('src/top.sch.json'));
  await page.waitFor((ed) => document.querySelector(`${ed} svg .sym[data-id="S2"]`), [ED], { what: 'drawn again' });
  await page.dblclick(`${ED} svg .sym[data-id="S2"] .hitbox`);
  await page.waitFor((ed) => document.activeElement?.closest?.(`${ed} .se-props`) && document.activeElement.tagName === 'INPUT', [ED], { what: 'the gate\'s first field' });
  assert.equal(await page.eval(() => window.Silinx.active.id), 'sch:src/top.sch.json');
});
