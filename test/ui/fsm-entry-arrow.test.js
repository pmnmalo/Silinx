// Copyright 2026 Pedro Maló
// SPDX-License-Identifier: AGPL-3.0-only
// UI: the reset's arrow into the initial state dragged around it (#4903), off the arrows of its other transitions: on
// the left at first (where B's arrows come in), dragged above the state, the reset's name with it; Undo and Redo; saved
// with the diagram (entryAngle), its HDL unchanged; no warning in the console.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject } from './harness.js';
import { normalizeFsm, generateFsm } from '../../core/fsm.js';
import { readStamp } from '../../core/hdl-cache.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;
const ED = '.doc:not([hidden]) .fsm-editor';

// A (initial, on the right) <-> B (on its left): B's arrows come into A where its reset arrow is at first
const machine = (lang) => normalizeFsm({
  name: 'ea', lang, inputs: [{ name: 'go', width: 1 }], outputs: [{ name: 'z', width: 1, default: '0' }],
  states: [{ id: 'a', name: 'A', x: 360, y: 200 }, { id: 'b', name: 'B', x: 120, y: 200, outputs: { z: '1' } }],
  transitions: [{ id: 't1', from: 'a', to: 'b', cond: 'go' }, { id: 't2', from: 'b', to: 'a', cond: '' }], initial: 'a',
});
const warnings = (page) => page.eval(() => [...document.querySelectorAll('#console-log .ln.warn, #console-log .ln.err')].map((l) => l.textContent).filter((t) => /^(WARNING|ERROR)/.test(t)));

for (const lang of ['vhdl', 'verilog']) {
  const pj = `FsmEntry${lang}`, hdl = `src/ea.${lang === 'vhdl' ? 'vhd' : 'v'}`;
  uiTest(`#4903 FSM (${lang === 'vhdl' ? 'VHDL' : 'Verilog'}): the reset's arrow dragged around the initial state, undone and redone, saved; the HDL unchanged`, E, async (page) => {
    await makeProject(env, { name: pj, files: { 'src/ea.fsm.json': JSON.stringify(machine(lang), null, 2) } });
    await page.openProject(pj);
    await page.eval(() => window.SilinxApp.openFsm('src/ea.fsm.json'));
    await page.waitFor(() => window.Silinx.active?.id === 'fsm:src/ea.fsm.json' && window.Silinx.active.fsmEditor?.fitted(), [], { what: 'the editor, fitted' });
    // (where the arrow, its name and the state are on the screen)
    const where = () => page.eval((ed) => {
      const c = (el) => { const b = el.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2, top: b.top, bottom: b.bottom, left: b.left, right: b.right }; };
      const g = document.querySelector(`${ed} [data-state=a]`);
      return { state: c(g.querySelector('.fsm-circle')), arrow: c(g.querySelector('.fsm-entry')), hit: c(g.querySelector('.fsm-entry-hit')), name: c(g.querySelector('.fsm-reset')) };
    }, ED);
    const angle = () => page.eval(() => window.Silinx.active.fsmEditor.getModel().entryAngle ?? null);

    // ---- at first on the left of A, level with it, its name above it
    let w = await where();
    assert.ok(w.arrow.right <= w.state.left + 1 && Math.abs(w.arrow.y - w.state.y) < 2, JSON.stringify(w));
    assert.ok(w.name.bottom <= w.arrow.y + 1, 'the name above the arrow');
    assert.equal(await angle(), null);

    // ---- dragged above A: the arrow from above, its name beside it, A selected
    await page.drag({ x: w.hit.x, y: w.hit.y }, { x: w.state.x, y: w.state.top - 60 });
    assert.equal(await angle(), -90);
    w = await where();
    assert.ok(w.arrow.bottom <= w.state.top + 1 && Math.abs(w.arrow.x - w.state.x) < 2, JSON.stringify(w));
    assert.ok(w.name.left >= w.arrow.x && w.name.bottom <= w.state.top, 'the name beside the arrow');
    assert.ok(await page.eval((ed) => document.querySelector(`${ed} [data-state=a]`).classList.contains('sel'), ED), 'A selected');

    // ---- Undo: on the left again; Redo: above
    await page.eval(() => window.Silinx.active.fsmEditor.undo());
    assert.equal(await angle(), null);
    await page.eval(() => window.Silinx.active.fsmEditor.redo());
    assert.equal(await angle(), -90);

    // ---- saved with the diagram; its HDL the same as before
    const saved = await page.waitFor(async (p) => {
      const m = await (await fetch(`/api/projects/${p}/file?path=src%2Fea.fsm.json`)).json();
      return m.entryAngle === -90 && m;
    }, [pj], { what: 'the diagram saved', timeout: 15000 });
    assert.deepEqual(normalizeFsm(saved), { ...machine(lang), entryAngle: -90, generatedFile: hdl });
    const code = await page.eval(async (p, h) => (await fetch(`/api/projects/${p}/file?path=${encodeURIComponent(h)}`)).text(), pj, hdl);
    assert.equal(readStamp(code).body, generateFsm(machine(lang), lang).code);   // (its silinx-sync line aside, #5872, #6028)
    assert.deepEqual(await warnings(page), []);
  });
}
