// UI: a viewer sees the owner's selection while following them (#4192), two participants in one test, in both
// interfaces: in a state diagram (a state, then a transition, then none), in an HDL editor (a range),
// in a schematic (a symbol, then that symbol deleted), each marked in the owner's presence colour, the viewer's own
// selection unchanged; browsing alone clears it. A truth table (#4193): the owner's SOP / POS, its Karnaugh map and
// Quine-McCluskey's shown are followed, and a change of the owner's is applied in place (the viewer's editor not made
// again, its map still shown). No warnings at either page.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject } from './harness.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const warnings = async (page) => (await page.consoleText()).split('\n').map((l) => l.trim()).filter((l) => /^(WARNING|AVISO|ERROR|ERRO)/.test(l));
const DOC = '.doc:not([hidden])';
async function join(link, name) {
  const p = await env.newPage(env.server.url);
  await p.waitFor(() => window.SilinxApp && window.Silinx?.startupChecked, [], { what: 'app boot' });
  await p.goto(`${new URL(link).origin}/?f=1${new URL(link).hash}`);
  await p.waitDialog('Follow a Shared Project');
  await p.fill('.dlg-overlay input[data-field=name]', name);
  await p.dialogButton('Follow');
  await p.waitFor(() => window.Silinx?.project?.name && window.Silinx.startupChecked, [], { what: 'the project open', timeout: 30000 });
  return p;
}
const shareNow = (page) => page.eval(async () => { const m = await import('/js/collab-share.js'); await m.startSharing('Ana'); return m.sharedLink(); });
const centre = (page, sel) => page.eval((s) => { const b = document.querySelector(s).getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; }, sel);
// the objects marked with the owner's selection at the viewer's: [[their selector's attribute, the colour]]
const marked = (page) => page.eval((d) => [...document.querySelectorAll(`${d} [data-peer-sel]`)].map((e) => [e.dataset.state || e.dataset.trans || e.dataset.id || e.dataset.out, e.dataset.peerSel, e.style.getPropertyValue('--peer-sel')]), DOC);
// Follow Ana, in the presence's menu: ticked (browsing alone) or unticked (following again)
async function followAna(p) {
  await p.click('.collab-presence .collab-btn');
  await p.waitForSelector('body > .menu-popup');
  const at = await p.eval(() => { const m = [...document.querySelectorAll('body > .menu-popup .mi')].find((e) => e.querySelector('.lbl')?.textContent === 'Follow Ana'); const b = m.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; });
  await p.click(at);
}
const ownerColour = (page) => page.eval(async () => (await import('/js/collab-state.js')).collab.session.owner().color);

uiTest('#4192 #4193 a viewer sees the owner\'s selection in a state diagram and an HDL editor, follows their truth table\'s look, a change applied in place; browsing alone clears it', E, async (page) => {
  await makeProject(env, { name: 'SelFsm', template: 'traffic' });
  await page.openProject('SelFsm');
  await page.eval(() => window.SilinxApp.openFile('src/traffic.fsm.json'));
  await page.waitFor(() => window.Silinx.active?.fsmEditor?.fitted(), [], { what: 'the diagram open' });
  const link = await shareNow(page);
  const fp = await join(link, 'Rui');
  try {
    await fp.waitFor(() => window.Silinx.active?.fsmEditor?.fitted(), [], { what: 'the owner\'s diagram followed' });
    const colour = await ownerColour(fp);
    // a state selected by the owner: marked at the viewer's, in the owner's colour; the viewer's own selection none
    await page.click(await centre(page, `${DOC} [data-state="s3"] .fsm-circle`));
    await fp.waitFor((d) => !!document.querySelector(`${d} [data-state="s3"][data-peer-sel]`), [DOC], { what: 'the state marked' });
    assert.deepEqual(await marked(fp), [['s3', 'Ana', colour]]);
    assert.equal(await fp.eval(() => window.Silinx.active.fsmEditor.sharedSelection()), null);
    // a transition instead: the state no longer marked
    const tr = await page.eval((d) => document.querySelector(`${d} [data-trans]`).dataset.trans, DOC);
    await page.eval((t) => window.Silinx.active.fsmEditor.focus({ transition: t }), tr);
    await fp.waitFor((d, t) => { const m = [...document.querySelectorAll(`${d} [data-peer-sel]`)]; return m.length === 1 && m[0].dataset.trans === t; }, [DOC, tr], { what: 'the transition marked' });
    // the selection again a state, then browsing alone (Follow Ana unticked): none shown
    await page.click(await centre(page, `${DOC} [data-state="s3"] .fsm-circle`));
    await fp.waitFor((d) => !!document.querySelector(`${d} [data-state="s3"][data-peer-sel]`), [DOC], { what: 'the state marked again' });
    await followAna(fp);
    await fp.waitFor((d) => !document.querySelector(`${d} [data-peer-sel]`), [DOC], { what: 'cleared while browsing alone' });
    await followAna(fp);
    await fp.waitFor((d) => !!document.querySelector(`${d} [data-state="s3"][data-peer-sel]`), [DOC], { what: 'marked again, followed' });

    // an HDL editor: the owner's range marked, the text it selects
    await page.eval(() => window.SilinxApp.openFile('src/traffic.vhd'));
    await page.waitFor(() => window.Silinx.active?.path === 'src/traffic.vhd' && window.Silinx.active.editor, [], { what: 'the HDL open' });
    await fp.waitFor(() => window.Silinx.active?.path === 'src/traffic.vhd' && window.Silinx.active.editor, [], { what: 'the HDL followed' });
    await fp.waitFor((d) => !document.querySelector(`${d} [data-peer-sel]`), [DOC], { what: 'the diagram\'s mark gone (another document)' });
    // (one range, selected backwards: the editor has no multiple selections; several ranges, core/collab-select.js's tests)
    await page.eval(() => {
      const v = window.Silinx.active.editor.view, b = v.state.doc.toString().indexOf('architecture');
      v.dispatch({ selection: { anchor: b + 12, head: b } });
    });
    await fp.waitFor((d) => document.querySelector(`${d} .cm-peer-sel`)?.textContent === 'architecture', [DOC], { what: 'the range marked' });
    assert.equal(await fp.eval((d) => document.querySelectorAll(`${d} .cm-peer-sel`).length, DOC), 1);
    assert.deepEqual(await fp.eval(() => window.Silinx.active.editor.view.state.selection.ranges.map((r) => r.empty)), [true], 'the viewer\'s own selection: its cursor');
    const rgb = [1, 3, 5].map((i) => parseInt(colour.slice(i, i + 2), 16)).join(', ');
    assert.equal(await fp.eval((d) => getComputedStyle(document.querySelector(`${d} .cm-peer-sel`)).backgroundColor, DOC), `rgba(${rgb}, 0.25)`, 'in the owner\'s colour');
    // deselected (a cursor): no range marked
    await page.eval(() => window.Silinx.active.editor.view.dispatch({ selection: { anchor: 0 } }));
    await fp.waitFor((d) => !document.querySelector(`${d} .cm-peer-sel`), [DOC], { what: 'the ranges cleared' });

    // a truth table: the owner's POS, Karnaugh map and Quine-McCluskey's POS followed (#4193)
    await page.eval(() => window.SilinxApp.openFile('src/lamps.bool.json'));
    await page.waitFor(() => !!window.Silinx.active?.ttEditor, [], { what: 'the table open' });
    await fp.waitFor(() => !!window.Silinx.active?.ttEditor, [], { what: 'the table followed' });
    await page.click(`${DOC} .tt-kmap-res .tt-kmap-on`);
    await page.click(`${DOC} .tt-kmap-res .tt-kind-pos`);
    const look = (p) => p.eval((d) => ({ map: !!document.querySelector(`${d} .tt-kmap-res .tt-kmap-on.active`), pos: !!document.querySelector(`${d} .tt-kmap-res .tt-kind-pos.active`), sel: window.Silinx.active.ttEditor.sharedSelection() }), DOC);
    await fp.waitFor((d) => !!document.querySelector(`${d} .tt-kmap-res .tt-kmap-on.active`) && !!document.querySelector(`${d} .tt-kmap-res .tt-kind-pos.active`), [DOC], { what: 'the map and its POS followed' });
    assert.deepEqual(await look(fp), await look(page));
    // a cell changed by the owner: the viewer's table changed in place, its map still shown in POS
    await fp.eval(() => { window.__tt = window.Silinx.active.ttEditor; });
    const out = (await page.eval(() => window.Silinx.active.ttEditor.sharedSelection())).items[0].slice(4);
    const cell = `${DOC} td.tt-cell[data-out="${out}"][data-row="0"]`;
    const before0 = await fp.eval((s) => document.querySelector(s).textContent, cell);
    await page.click(cell);
    await fp.waitFor((s, b) => document.querySelector(s)?.textContent !== b, [cell, before0], { what: 'the owner\'s change', timeout: 15000 });
    await fp.waitConsole(/^src\/lamps\.bool\.json reloaded: changed by Ana\.$/m);
    assert.equal(await fp.eval(() => window.Silinx.active.ttEditor === window.__tt), true, 'the same editor, not made again');
    assert.deepEqual(await look(fp), await look(page), 'its map still shown, in POS');
    assert.deepEqual(await warnings(fp), []);
    assert.deepEqual(await warnings(page), []);
    assert.deepEqual(fp.errors, []);
  } finally { await fp.close(); await page.eval(async () => (await import('/js/collab-share.js')).stopSharing()); }
}, { timeout: 150000 });

uiTest('#4192 a viewer sees the owner\'s selection in a schematic; the symbol deleted, its mark gone', E, async (page) => {
  await makeProject(env, { name: 'SelSch', template: 'gates' });
  await page.openProject('SelSch');
  await page.eval(() => window.SilinxApp.openFile('src/gates.sch.json'));
  await page.waitFor(() => !!window.Silinx.active?.schEditor && !!document.querySelector('.doc:not([hidden]) [data-kind="sym"]'), [], { what: 'the schematic open' });
  const link = await shareNow(page);
  const fp = await join(link, 'Rui');
  try {
    await fp.waitFor((d) => !!window.Silinx.active?.schEditor && !!document.querySelector(`${d} [data-kind="sym"]`), [DOC], { what: 'the owner\'s schematic followed' });
    const colour = await ownerColour(fp);
    const id = await page.eval((d) => document.querySelector(`${d} [data-kind="sym"]`).dataset.id, DOC);
    await page.click(await centre(page, `${DOC} [data-kind="sym"][data-id="${id}"]`));
    await page.waitFor((i) => window.Silinx.active.schEditor.sharedSelection()?.items.includes(`sym:${i}`), [id], { what: 'selected at the owner\'s' });
    await fp.waitFor((d, i) => !!document.querySelector(`${d} [data-kind="sym"][data-id="${i}"][data-peer-sel]`), [DOC, id], { what: 'the symbol marked' });
    assert.deepEqual((await marked(fp)).find((m) => m[0] === id), [id, 'Ana', colour]);
    assert.equal(await fp.eval(() => window.Silinx.active.schEditor.sharedSelection()), null, 'the viewer\'s own selection none');
    // deleted by the owner: gone at the viewer's, nothing marked
    await page.eval(() => window.Silinx.active.schEditor.deleteSelection());
    await fp.waitFor((d, i) => !document.querySelector(`${d} [data-kind="sym"][data-id="${i}"]`), [DOC, id], { what: 'the symbol deleted', timeout: 15000 });
    await sleep(700);
    assert.deepEqual(await marked(fp), []);
    assert.deepEqual(fp.errors, []);
    assert.deepEqual(await warnings(fp), []);
  } finally { await fp.close(); await page.eval(async () => (await import('/js/collab-share.js')).stopSharing()); }
}, { timeout: 120000 });
