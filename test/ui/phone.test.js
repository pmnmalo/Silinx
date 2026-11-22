// UI: a phone's screen (#5121, web/js/phone.js, web/css/phone.css): under 600 px wide (375 × 812 and 430 × 932, with
// touch) one pane at a time, the whole width: the side panel, the document or the console, switched by taps on the bar
// of panes at the bottom. A project opened shows the side panel, a document opened shows it, a task chosen (Simulate)
// its document; a new error or warning (the start-up checks') marks the Console button until the console is shown or
// none is left; the page never scrolls sideways; at 768 px (a tablet in portrait) no bar, the narrow screen's layout.
// In both interfaces (SILINX_UI_INTERFACE) and in Portuguese.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject } from './harness.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;
const DOC = '.doc:not([hidden])';

// shown on the page (displayed, with a size)
const shown = (page, sel) => page.eval((s) => { const e = document.querySelector(s); return !!e && e.getClientRects().length > 0 && e.getBoundingClientRect().width > 0; }, sel);
const box = (page, sel) => page.eval((s) => { const r = document.querySelector(s).getBoundingClientRect(); return { left: Math.round(r.left), width: Math.round(r.width), height: Math.round(r.height) }; }, sel);
// the pane shown, the bar's buttons (their labels, the pressed one, the marked one) and whether the page scrolls sideways
const panes = (page) => page.eval(() => {
  const b = [...document.querySelectorAll('#phone-panes .phone-pane')].filter((x) => x.getClientRects().length);
  return {
    pane: document.documentElement.dataset.pane,
    buttons: b.map((x) => x.textContent),
    pressed: b.filter((x) => x.getAttribute('aria-pressed') === 'true').map((x) => x.dataset.pane),
    news: b.filter((x) => x.classList.contains('news')).map((x) => x.dataset.pane),
    sideScroll: document.documentElement.scrollWidth > innerWidth || document.body.scrollWidth > innerWidth,
  };
});
const tapPane = (page, p) => page.tap(`#phone-panes [data-pane="${p}"]`);
// no warning: the page's console (console.warn) and the Warnings tab
async function noWarnings(page) {
  assert.deepEqual(page.console.filter((c) => c.type === 'warning' || c.type === 'warn').map((c) => c.text), []);
  assert.deepEqual(await page.eval(() => [document.getElementById('warn-count').textContent, ...[...document.querySelectorAll('#console-warnings .diag')].map((d) => d.textContent)]), ['']);
}

for (const [w, h] of [[375, 812], [430, 932]]) {
  uiTest(`#5121 phone ${w}×${h}: one pane at a time, the whole width, switched by taps; a project, a document, the console`, E, async (page) => {
    await page.setViewport(w, h);
    const silinx = await page.eval(() => document.documentElement.dataset.ui === 'silinx');
    // the Start page: the side panel, the whole width; no document, no console, no drawer button nor splitters. The
    // start-up checks' warnings (no ISE, no programmer here) in the Warnings tab until a project opens (#339): the
    // Console button marked
    await page.waitFor(() => document.querySelector('#phone-panes')?.getClientRects().length && window.Silinx.startupChecked, [], { what: 'the bar of panes, the start-up checks' });
    await page.waitFor(() => document.getElementById('warn-count').textContent === '(2)', [], { what: 'the start-up checks\' warnings' });
    const startWarnings = await page.eval(() => [...document.querySelectorAll('#console-warnings .diag')].map((d) => d.textContent));
    assert.equal(startWarnings.length, 2, startWarnings.join(' | '));
    assert.match(startWarnings[0], /^WARNING:Silinx - Toolchain: ISE not available \(local: .+\)\.$/);
    assert.equal(startWarnings[1], 'WARNING:Silinx - Programmers found: none (install openFPGALoader, xc3sprog, Digilent Adept or ISE iMPACT)');
    assert.deepEqual(await panes(page), { pane: 'side', buttons: ['Panels', 'Document', 'Console'], pressed: ['side'], news: ['console'], sideScroll: false });
    const left = await box(page, '#left');
    assert.ok(left.left === 0 && left.width === w, JSON.stringify(left));
    for (const s of ['#center', '#console-wrap', '#drawer-btn', '#v-split', '#h-split', '#task-view']) assert.ok(!(await shown(page, s)), s);
    // a project opened: its Design page
    await makeProject(env, { name: `Phone_${w}`, template: 'gates' });
    await page.openProject(`Phone_${w}`);
    // (the tabs cleared by the project opened: the mark gone with their warnings)
    assert.deepEqual(await panes(page), { pane: 'side', buttons: ['Panels', 'Document', 'Console'], pressed: ['side'], news: [], sideScroll: false });
    assert.ok(await shown(page, '#hier'));
    // the schematic opened from it: the document, the whole width
    await page.treeRow('#hier', 'gates', { dbl: true, exact: true });
    await page.waitFor((d) => document.querySelector(`${d} .sch-editor .se-canvas`), [DOC], { what: 'the schematic editor' });
    assert.deepEqual(await panes(page), { pane: 'doc', buttons: ['Panels', 'Document', 'Console'], pressed: ['doc'], news: [], sideScroll: false });
    assert.ok(!(await shown(page, '#left')) && !(await shown(page, '#console-wrap')));
    const canvas = await box(page, `${DOC} .se-canvas`);
    assert.ok(canvas.left <= 2 && canvas.width >= w - 4, JSON.stringify(canvas));
    // the console: the whole height between the header and the bars, its lines
    await tapPane(page, 'console');
    assert.deepEqual(await panes(page), { pane: 'console', buttons: ['Panels', 'Document', 'Console'], pressed: ['console'], news: [], sideScroll: false });
    assert.ok(!(await shown(page, '#main')));
    const con = await box(page, '#console-wrap');
    assert.ok(con.width === w && con.height >= 0.6 * h, JSON.stringify(con));
    await page.waitFor((n) => [...document.querySelectorAll('#console-log .ln')].some((l) => l.textContent.includes(`Project "${n}" opened`) && l.getClientRects().length), [`Phone_${w}`], { what: 'the console\'s lines' });
    // back to the side panel, then the document as it was
    await tapPane(page, 'side');
    assert.equal((await panes(page)).pane, 'side');
    assert.ok(await shown(page, '#hier') && !(await shown(page, '#center')));
    await tapPane(page, 'doc');
    assert.equal((await box(page, `${DOC} .se-canvas`)).width, canvas.width);
    if (silinx) {
      // Simulate: its document (its side panel is in it): no Panels button; Design again: the pane kept
      await page.tap('#task-tabs .task-btn[data-task="sim"]');
      await page.waitFor(() => document.documentElement.dataset.task === 'sim', [], { what: 'Simulate' });
      assert.deepEqual(await panes(page), { pane: 'doc', buttons: ['Document', 'Console'], pressed: ['doc'], news: [], sideScroll: false });
      await tapPane(page, 'console');
      await page.tap('#task-tabs .task-btn[data-task="edit"]');
      await page.waitFor(() => document.documentElement.dataset.task === 'edit', [], { what: 'Design' });
      assert.deepEqual(await panes(page), { pane: 'console', buttons: ['Panels', 'Document', 'Console'], pressed: ['console'], news: [], sideScroll: false });
    }
    // a tablet in portrait: no bar, the narrow screen's layout (the document and the console together)
    await page.setViewport(768, 1024);
    await page.waitFor(() => !document.getElementById('phone-panes').getClientRects().length, [], { what: 'the bar hidden' });
    assert.ok(await shown(page, '#center') && await shown(page, '#console-wrap'));
    await page.setViewport(w, h);
    await page.waitFor(() => document.getElementById('phone-panes').getClientRects().length, [], { what: 'the bar again' });
    assert.equal((await panes(page)).sideScroll, false);
    await noWarnings(page);
  }, { tablet: 'portrait' });
}

uiTest('#5121 phone: a new error marks the Console button until the console is shown, its Errors tab the error', E, async (page) => {
  await page.setViewport(390, 844);
  await makeProject(env, { name: 'PhoneErr', template: 'empty', files: { 'src/bad.vhd': 'library ieee;\nuse ieee.std_logic_1164.all;\nentity bad is port (a : in std_logic; y : out std_logic); end bad;\narchitecture rtl of bad is begin y <= a and ; end rtl;\n' } });
  await page.openProject('PhoneErr');
  assert.deepEqual(await panes(page), { pane: 'side', buttons: ['Panels', 'Document', 'Console'], pressed: ['side'], news: [], sideScroll: false });
  await page.eval(async () => (await import('/js/processes.js')).checkSyntax('bad'));
  await page.waitFor(() => document.getElementById('err-count').textContent === '(1)', [], { what: 'the error' });
  // the pane stays, the Console button marked
  assert.deepEqual(await panes(page), { pane: 'side', buttons: ['Panels', 'Document', 'Console'], pressed: ['side'], news: ['console'], sideScroll: false });
  await tapPane(page, 'console');
  assert.deepEqual(await panes(page), { pane: 'console', buttons: ['Panels', 'Document', 'Console'], pressed: ['console'], news: [], sideScroll: false });
  assert.deepEqual(await page.eval(() => [...document.querySelectorAll('#console-errors .diag')].filter((d) => d.getClientRects().length).map((d) => d.textContent.replace(/▸.*$/, ''))),
    ['ERROR:HDLCompiler - "src/bad.vhd" Line 4: expected expression but found \';\'']);
  await noWarnings(page);
}, { tablet: 'portrait' });

uiTest('#5121 phone: the bar of panes in Portuguese', E, async (page) => {
  await page.setViewport(375, 812);
  await makeProject(env, { name: 'PhonePt', template: 'gates' });
  await page.openProject('PhonePt');
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('pt'));
  await page.waitFor(() => document.querySelector('#phone-panes [data-pane="doc"] .lbl')?.textContent === 'Documento', [], { what: 'Portuguese' });
  assert.deepEqual(await page.eval(() => [document.getElementById('phone-panes').getAttribute('aria-label'), ...[...document.querySelectorAll('#phone-panes .phone-pane')].map((b) => [b.textContent, b.title])]),
    ['Áreas', ['Painéis', 'Painéis'], ['Documento', 'Documento'], ['Consola', 'Consola']]);
  await noWarnings(page);
}, { tablet: 'portrait' });
