// Copyright 2026 Pedro Maló
// SPDX-License-Identifier: AGPL-3.0-only
// UI: a state diagram's schematic (#4910, web/js/drawings-fsm-sch.js), its gate-level implementation, not the RTL. The
// Schematic badge of its row in the Design pane (between the drawing's and the HDL's) opens it read-only: the state
// flip-flops and the gates, the banner naming the diagram; it follows the diagram when it changes, and says so when the
// diagram can no longer be drawn; Show Schematic Beside opens it beside the diagram. A diagram that cannot be drawn
// (one-hot): no view, why said in the console. In a design and simulation project too, and in Portuguese. No warnings.
// Both interfaces.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { setupUi, uiTest, makeProject, ROOT } from './harness.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;

const FSM = JSON.parse(fs.readFileSync(path.join(ROOT, 'examples/traffic/src/traffic.fsm.json'), 'utf8'));
const HOT = JSON.stringify({ ...FSM, name: 'hot', encoding: 'onehot' }, null, 2);
const ID = 'fsmsch:src/traffic.fsm.json';
const problems = async (page) => (await page.consoleText()).split('\n').filter((l) => /WARNING|ERROR/.test(l));
const badges = (page, label) => page.eval((l) => {
  const r = [...document.querySelectorAll('#hier .row')].find((x) => x.querySelector('.lbl')?.textContent === l);
  return r ? [...r.querySelectorAll('.badge')].map((b) => [b.textContent, b.title]) : null;
}, label);
const clickBadge = async (page, label, text) => {
  const at = await page.waitFor((l, t) => {
    const r = [...document.querySelectorAll('#hier .row')].find((x) => x.querySelector('.lbl')?.textContent === l && x.getClientRects().length);
    const b = r && [...r.querySelectorAll('.badge')].find((x) => x.textContent === t);
    if (!b) return null;
    b.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    const k = b.getBoundingClientRect();
    return { x: k.left + k.width / 2, y: k.top + k.height / 2 };
  }, [label, text], { what: `badge ${text} of ${label}` });
  return page.click(at);
};
// the schematic view: its flip-flops, its gates' count, its banner
const view = (page) => page.eval((id) => {
  const d = window.Silinx.docs.find((x) => x.id === id);
  if (!d) return null;
  const doc = d.viewer.getDoc();
  return { title: d.title, ffs: doc.symbols.filter((s) => /^fd/.test(s.type)).map((s) => s.type), gates: doc.symbols.filter((s) => /^(and|or|inv|buf|nand|nor|xor)/.test(s.type)).length,
    ports: doc.ports.map((p) => p.name), banner: d.el.querySelector('.gen-banner')?.textContent || '', key: JSON.stringify(doc.symbols.map((s) => s.type)) };
}, ID);

for (const kind of ['fpga', 'design']) {
  uiTest(`#4910 a state diagram's schematic (${kind === 'design' ? 'a design and simulation project' : 'an FPGA project'}): its badge, the flip-flops and the gates, read-only, following the diagram; beside it; one-hot: none, why said; Portuguese; no warnings`, E, async (page) => {
    const name = `FsmSch_${kind}`;
    await makeProject(env, { name, kind: kind === 'design' ? 'design' : undefined, top: 'traffic', files: { 'src/traffic.fsm.json': JSON.stringify(FSM, null, 2), 'src/hot.fsm.json': HOT } });
    await page.openProject(name);
    await page.waitFor(() => ['traffic', 'hot'].every((n) => window.Silinx.modules.some((m) => m.name === n)), [], { what: 'the modules' });
    const tip = 'Its gate-level implementation: the state flip-flops and the logic in gates';
    const hdl = kind === 'design' ? [] : [['VHDL', 'Generated from the state diagram']];
    await page.waitFor((l) => [...document.querySelectorAll('#hier .row')].some((r) => r.querySelector('.lbl')?.textContent === l && r.querySelector('.badge')), ['traffic']);
    const own = kind === 'design' ? 'Open' : 'Base: its HDL is generated from it';
    assert.deepEqual(await badges(page, 'traffic'), [['FSM', own], ['Schematic', tip], ...hdl]);

    // the badge: the schematic, read-only, generated from the diagram
    await clickBadge(page, 'traffic', 'Schematic');
    await page.waitFor((id) => window.Silinx.active?.id === id, [ID], { what: 'the schematic view' });
    const first = await view(page);
    assert.deepEqual({ ...first, gates: first.gates > 5, key: undefined }, { title: 'traffic (Schematic)', ffs: ['fdr', 'fdr', 'fdr'], gates: true, ports: ['req', 'done', 'night', 'clk', 'rst', 'phase'], banner: 'Read-only, generated from traffic.fsm.json', key: undefined });

    // the diagram changes (a state added by a double-click on the drawing): the schematic follows
    await page.eval(() => window.SilinxApp.openFile('src/traffic.fsm.json'));
    await page.waitFor(() => window.Silinx.active?.id === 'fsm:src/traffic.fsm.json' && document.querySelector('.doc:not([hidden]) svg'), [], { what: 'the state diagram' });
    const states = await page.eval(() => window.Silinx.active.fsmEditor.getModel().states.length);
    const spot = await page.eval(() => { const area = (e) => { const r = e.getBoundingClientRect(); return r.width * r.height; };
      const svg = [...document.querySelectorAll('.doc:not([hidden]) svg')].sort((a, b) => area(b) - area(a))[0];
      const r = svg.getBoundingClientRect(); return { x: r.left + 30, y: r.bottom - 30 }; });
    await page.dblclick(spot);
    await page.waitFor((n) => window.Silinx.active.fsmEditor.getModel().states.length === n + 1, [states], { what: 'a state added' });
    await page.key('Escape');   // (its name's field closed)
    await page.waitFor(async (id, k) => { const d = window.Silinx.docs.find((x) => x.id === id); return JSON.stringify(d.viewer.getDoc().symbols.map((s) => s.type)) !== k; }, [ID, first.key], { what: 'the schematic redrawn' });
    // (one-hot now: not in sync, why said)
    await page.eval(() => { const ed = window.Silinx.active.fsmEditor; ed.setModel({ ...ed.getModel(), encoding: 'onehot' }); });
    await page.eval(async () => (await import('/js/drawings-fsm-sch.js')).refreshFsmSchematic('src/traffic.fsm.json', window.Silinx.active.fsmEditor.getModel()));
    await page.waitFor((id) => /not in sync/.test(window.Silinx.docs.find((x) => x.id === id).el.querySelector('.gen-banner')?.textContent || ''), [ID], { what: 'the banner out of sync' });
    assert.equal((await view(page)).banner, 'Read-only, not in sync with traffic.fsm.json — No schematic: the encoded table is made for the binary, gray and user-defined encodings (choose one of them)');
    // (the diagram as it was; the schematic closed)
    await page.eval((m) => window.Silinx.active.fsmEditor.setModel(m), FSM);
    await page.eval((id) => window.SilinxApp.closeDoc(window.Silinx.docs.find((d) => d.id === id)), ID);
    await page.waitFor((id) => !window.Silinx.docs.some((d) => d.id === id), [ID], { what: 'the schematic closed' });

    // beside the diagram: Show Schematic Beside (its tab's menu, View)
    await page.eval(async () => { const { relatedViews } = await import('/js/related-views.js'); await relatedViews(window.Silinx.active).find((e) => e.label === 'Show Schematic Beside').open(); });
    await page.waitFor((id) => window.Silinx.docs.some((x) => x.id === id), [ID], { what: 'the schematic beside' });
    assert.deepEqual((await view(page)).ffs, ['fdr', 'fdr', 'fdr']);

    // one-hot: no schematic, why said in the console (information, no warning)
    await clickBadge(page, 'hot', 'Schematic');
    await page.waitConsole(/hot\.fsm\.json: No schematic: the encoded table is made for the binary, gray and user-defined encodings \(choose one of them\)\./);
    assert.equal(await page.eval(() => window.Silinx.docs.some((x) => x.id === 'fsmsch:src/hot.fsm.json')), false);

    // in Portuguese: the badge and its tip
    await page.eval(async () => (await import('/js/i18n.js')).setLanguage('pt'));
    try {
      await page.waitFor(() => [...document.querySelectorAll('#hier .badge')].some((b) => b.textContent === 'Esquemático'), [], { what: 'the badges in Portuguese' });
      const pt = await badges(page, 'traffic');
      assert.deepEqual(pt[1], ['Esquemático', 'A sua implementação em portas lógicas: os flip-flops do estado e a lógica em portas']);
    } finally {
      await page.eval(async () => (await import('/js/i18n.js')).setLanguage('en'));
    }
    assert.deepEqual(await problems(page), []);
  });
}
