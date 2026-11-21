// UI: each console line and each entry of the Errors / Warnings tabs with the time it was written (#5035): `14:03:27`
// before it, muted (the theme's --muted colour, drawn by the stylesheet), `20/11 23:58:01` for a line of another day;
// not the line's text (its textContent, its message's text and the console's matching as they were); the same in
// Portuguese. Both interfaces (SILINX_UI_INTERFACE).
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject } from './harness.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;

const BLINK = 'module blink(input clk, output reg led);\n  always @(posedge clk) led <= ~led;\nendmodule\n';
const settled = (page) => page.eval(() => new Promise((r) => setTimeout(r, 120)));   // (the tabs drawn at most every 50 ms)
const HMS = /^\d\d:\d\d:\d\d$/;
// a line's or a row's time as drawn: its ::before's content and colour, the --muted colour, its text
const drawn = (page, sel) => page.eval((s) => {
  const probe = document.createElement('span');
  probe.style.color = 'var(--muted)';
  document.querySelector('#console-body').append(probe);
  const muted = getComputedStyle(probe).color;
  probe.remove();
  return [...document.querySelectorAll(s)].map((el) => {
    const b = getComputedStyle(el, '::before');
    return { time: el.dataset.time, before: b.content, muted: b.color === muted, text: el.textContent, message: el.message?.text ?? null };
  });
}, sel);

uiTest('#5035 every console line and Errors / Warnings entry with its time, muted, not its text; another day\'s with its date; in Portuguese', E, async (page) => {
  await makeProject(env, { name: 'TimePj', top: 'blink', files: { 'src/blink.v': BLINK } });
  await page.openProject('TimePj');
  // (every source's lines and entries: the tabs follow the console's filter, #4749)
  await page.eval(() => document.querySelector('#mc-filters .filt[data-src=all]')?.click());
  const yesterday = await page.eval(() => {
    const d = new Date(); d.setDate(d.getDate() - 1); d.setHours(23, 58, 1, 0);
    return d.getTime();
  });
  await page.eval((y) => import('/js/console.js').then((c) => {
    c.clearConsole();
    c.log('\nStarted : "Synthesize - XST".', 'hdr');
    c.logLine('WARNING:Xst:647 - Input <sw> is never used.');
    c.log('a line of yesterday (a follower\'s owner\'s time)', '', { time: y });
    c.logError('Select the top module first');
  }), yesterday);
  await settled(page);
  const lines = (await drawn(page, '#console-log .ln')).filter((l) => l.text.trim());
  assert.deepEqual(lines.map((l) => l.text), ['Started : "Synthesize - XST".', 'WARNING:Xst:647 - Input <sw> is never used.',
    'a line of yesterday (a follower\'s owner\'s time)', 'ERROR: Select the top module first']);   // (its text: no time in it)
  assert.deepEqual(lines.map((l) => l.message), lines.map((l) => l.text));
  for (const l of [lines[0], lines[1], lines[3]]) {
    assert.match(l.time, HMS, JSON.stringify(l));
    assert.equal(l.before, `"${l.time} "`);
    assert.equal(l.muted, true, 'the theme\'s muted colour');
  }
  const day = await page.eval((y) => { const d = new Date(y); return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`; }, yesterday);
  assert.equal(lines[2].time, `${day} 23:58:01`);
  // (the console's matching: its text, as before)
  await page.waitConsole(/^WARNING:Xst:647 - Input <sw> is never used\.$/m);
  // the Errors and Warnings tabs' entries: their time too
  const rows = [...await drawn(page, '#console-errors .diag'), ...await drawn(page, '#console-warnings .diag')];
  assert.equal(rows.length, 2, JSON.stringify(rows));
  assert.match(rows[0].text, /^ERROR:Silinx - Select the top module first/);
  assert.match(rows[1].text, /^WARNING:Xst(:647)? - Input <sw> is never used\./);
  for (const r of rows) { assert.match(r.time, HMS); assert.equal(r.before, `"${r.time} "`); assert.equal(r.muted, true); }
  // a check's entry: listed with its time
  await page.eval(() => import('/js/console.js').then((c) => c.setDiagnostics([{ severity: 'warning', tool: 'HDLCompiler', message: 'unused signal x', file: 'src/blink.v', line: 2 }])));
  await settled(page);
  assert.match((await drawn(page, '#console-warnings .diag')).find((r) => /unused signal x/.test(r.text)).time, HMS);
  // in Portuguese: the same times, the lines translated as before
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('pt'));
  try {
    await page.eval(() => import('/js/console.js').then((c) => c.logError('Select the top module first')));
    await settled(page);
    const pt = (await drawn(page, '#console-log .ln')).filter((l) => l.text.trim()).at(-1);
    assert.equal(pt.text, 'ERROR: Selecione primeiro o módulo de topo');
    assert.match(pt.time, HMS);
    assert.equal(pt.before, `"${pt.time} "`);
  } finally { await page.eval(async () => (await import('/js/i18n.js')).setLanguage('en')); }
});
