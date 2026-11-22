// UI: a phone's editors (#5121, web/js/phone-readonly.js): under 600 px (375 × 812 and 430 × 932, with touch) every
// editor opens read only, as a followed project's: the HDL and constraints text, the schematic, the state diagram, the
// ASM chart, the Petri net, the truth table, the circuit (the lock example has one of each). Its read-only notice,
// "Read-only on a phone", at the right end of its toolbar, its tip saying where to edit it; its editing tools hidden
// (the ASM chart's and the circuit's too, which were shown on every screen, #5228); its view, its Try it kept. At
// 768 px (a tablet) the same documents edit, with no notice (the state diagram checked as it opens, its warnings). In both interfaces (SILINX_UI_INTERFACE) and in Portuguese.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject } from './harness.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;

const FILES = ['src/top.vhd', 'constraints/lock.ucf', 'src/control.sch.json', 'src/lock.fsm.json', 'src/timer.asm.json', 'src/alarm.pn.json', 'src/digit_ok.bool.json', 'src/sync.circ.json'];
// the tools that change a document (their tips' beginnings): add, draw, delete, turn, fill, the language's templates
const EDIT = /^(Add Wire|Delete|Rotate|Click the drawing to add|Click a place then|Fill the|Draw a wire|Turn the selected part|Language Templates)/;

// the document in front: its read-only notices (text, tip, whether nothing of its toolbar's line is right of it but a ⋮
// menu), its editing tools shown, a text editor's read-only state
const docState = (page) => page.eval((edit) => {
  const doc = document.querySelector('.doc:not([hidden])');
  const re = new RegExp(edit);
  const notices = [...doc.querySelectorAll('.gen-banner.read-only')].filter((b) => b.getClientRects().length).map((b) => {
    const r = b.getBoundingClientRect();
    const right = [...b.parentElement.children].filter((e) => e !== b && e.getClientRects().length && !e.matches('.se-more, .tb-more'))
      .every((e) => { const o = e.getBoundingClientRect(); return o.right <= r.left + 0.5 || o.bottom <= r.top + 0.5 || o.top >= r.bottom - 0.5; });
    return [b.textContent, b.title, right];
  });
  const tools = [...doc.querySelectorAll('button')].filter((b) => b.getClientRects().length && re.test(b.title || b.textContent.trim())).map((b) => b.title || b.textContent.trim());
  return { notices, tools, textRo: window.Silinx.active?.editor?.readOnly?.() ?? null };
}, EDIT.source);
async function open(page, f) {
  await page.eval((p) => window.SilinxApp.openFile(p), f);
  await page.waitFor((p) => window.Silinx.active?.path === p && document.querySelector('.doc:not([hidden]) :is(.editor-bar, .asm-toolbar, .se-toolbar, .tt-toolbar, button)'), [f], { what: f });
  // (a drawing's editor made a moment after its document)
  await page.waitFor(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(true)))));
}
async function noWarnings(page) {
  assert.deepEqual(page.console.filter((c) => c.type === 'warning' || c.type === 'warn').map((c) => c.text), []);
  assert.deepEqual(await page.eval(() => [document.getElementById('warn-count').textContent, ...[...document.querySelectorAll('#console-warnings .diag')].map((d) => d.textContent)]), ['']);
}

for (const [w, h] of [[375, 812], [430, 932]]) {
  uiTest(`#5121 #5228 phone ${w}×${h}: every editor read only, its notice at its toolbar's end, its editing tools hidden`, E, async (page) => {
    await page.setViewport(w, h);
    await makeProject(env, { name: `PhoneRo_${w}`, template: 'lock' });
    await page.openProject(`PhoneRo_${w}`);
    for (const f of FILES) {
      await open(page, f);
      const text = /\.(vhd|ucf)$/.test(f);
      assert.deepEqual(await docState(page), { notices: [['Read-only on a phone', 'Edit it on a tablet or a computer', true]], tools: [], textRo: text ? true : null }, f);
      assert.equal(await page.eval(() => document.documentElement.dataset.pane), 'doc', f);
    }
    // nothing changed, nothing to save
    assert.deepEqual(await page.eval(() => window.Silinx.docs.filter((d) => d.dirty).map((d) => d.path)), []);
    await noWarnings(page);
  }, { tablet: 'portrait', timeout: 180000 });
}

uiTest('#5121 a tablet (768 px): the same editors edit, no phone notice', E, async (page) => {
  await page.setViewport(768, 1024);
  await makeProject(env, { name: 'PhoneRoTab', template: 'lock' });
  await page.openProject('PhoneRoTab');
  for (const f of FILES) {
    await open(page, f);
    const s = await docState(page);
    assert.deepEqual([s.notices, s.textRo], [[], /\.(vhd|ucf)$/.test(f) ? false : null], f);
    assert.ok(s.tools.length > 0 || /\.ucf$/.test(f), `${f}: its editing tools (${s.tools.join(' | ')})`);
  }
  // (an editable state diagram checked as it opens: the lock's warnings, its clear taking precedence by design; a
  // read-only one is not checked)
  const F = 'WARNING:FSM - "src/lock.fsm.json": ';
  const both = (s, a, b, when) => `${F}State ${s}: the transitions to ${a[0]} ('${a[1]}') and to ${b[0]} ('${b[1]}') are both true when ${when}; the one listed first (to ${a[0]}) is taken`;
  assert.deepEqual(await page.eval(() => [document.getElementById('warn-count').textContent, ...[...document.querySelectorAll('#console-warnings .diag')].map((d) => d.textContent)]), ['(8)',
    `${F}State ALARM has no exit: once there, the machine stays in it until a reset`,
    ...['D1', 'D2', 'D3'].flatMap((st, i) => [both(st, ['D0', 'clear'], ['FAIL', 'enter && !ok'], 'enter=1, clear=1, ok=0'), both(st, ['D0', 'clear'], [['D2', 'D3', 'OPEN'][i], 'enter && ok'], 'enter=1, clear=1, ok=1')]),
    both('HOLD', ['ALARM', 'alarm'], ['D0', 'done'], 'done=1, alarm=1')]);
  assert.deepEqual(page.console.filter((c) => c.type === 'warning' || c.type === 'warn').map((c) => c.text), []);
}, { tablet: 'portrait', timeout: 180000 });

uiTest('#5121 phone: the read-only notice in Portuguese', E, async (page) => {
  await page.setViewport(375, 812);
  await makeProject(env, { name: 'PhoneRoPt', template: 'lock' });
  await page.openProject('PhoneRoPt');
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('pt'));
  for (const f of ['src/top.vhd', 'src/timer.asm.json']) {
    await open(page, f);
    await page.waitFor(() => document.querySelector('.doc:not([hidden]) [data-phone-notice]')?.textContent === 'Só de leitura num telemóvel', [], { what: 'Portuguese' });
    assert.equal(await page.eval(() => document.querySelector('.doc:not([hidden]) [data-phone-notice]').title), 'Edite-o num tablet ou num computador', f);
  }
  await noWarnings(page);
}, { tablet: 'portrait' });
