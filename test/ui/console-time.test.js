// Copyright 2026 Pedro Maló
// SPDX-License-Identifier: AGPL-3.0-only
// UI: each line of the console, and each entry of its Errors and Warnings tabs, with the time it was written (#5035):
// a short muted `14:03:27` before it (its data-time, drawn by the CSS: not part of its text, which the searches, its
// message and the tests read as before), an empty line none; a line of a shared project's owner with the owner's time,
// the day too when it is of another day; in Portuguese the same; a narrow screen the same.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest } from './harness.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;

const CLOCK = /^\d\d:\d\d:\d\d$/;
/** The lines (or the entries) written since `from`: [text, its data-time, what its ::before draws, its colour]. */
const shown = (page, sel) => page.eval((s) => [...document.querySelectorAll(s)].map((l) => {
  const b = getComputedStyle(l, '::before');
  return [l.textContent, l.dataset.time ?? null, b.content, b.color];
}), sel);

uiTest('#5035 the Console, Errors and Warnings tabs: each line\'s time before it, muted, not its text; an owner\'s time, the day of another day; Portuguese; narrow', E, async (page) => {
  await page.eval(() => window.SilinxApp.closeProject?.());
  await page.eval(async () => {
    const c = await import('/js/console.js');
    c.clearConsole();
    c.log('INFO: one line\n', 'info', { src: 'app' });
    c.log('WARNING: a warning', 'warn', { src: 'app' });
    c.log('ERROR: an error', 'err', { src: 'app' });
    // (a shared project's owner's line, of another day: its time, the day too)
    c.log('INFO: the owner\'s line', 'info', { src: 'app', time: new Date(2026, 10, 19, 23, 58, 1).getTime() });
  });
  await page.waitFor(() => document.querySelectorAll('#console-log .ln').length >= 5, [], { what: 'the lines' });
  const lines = await shown(page, '#console-log .ln');
  assert.deepEqual(lines.map((l) => l[0]), ['INFO: one line', '', 'WARNING: a warning', 'ERROR: an error', 'INFO: the owner\'s line']);
  assert.ok(CLOCK.test(lines[0][1]) && CLOCK.test(lines[2][1]) && CLOCK.test(lines[3][1]), JSON.stringify(lines));
  assert.equal(lines[1][1], null);   // (an empty line: none)
  assert.equal(lines[4][1], '19/11 23:58:01');
  assert.equal(lines[0][2], `"${lines[0][1]}"`);
  assert.equal(lines[1][2], 'none');
  // muted: not the line's colour
  const lineColor = await page.eval(() => getComputedStyle(document.querySelectorAll('#console-log .ln')[3]).color);
  assert.notEqual(lines[3][3], lineColor);
  // its message's text: the line's, without its time
  assert.deepEqual(await page.eval(() => [...document.querySelectorAll('#console-log .ln')].map((l) => l.message.text)), lines.map((l) => l[0]));
  assert.equal(typeof (await page.eval(() => document.querySelector('#console-log .ln').message.time)), 'number');

  // ---- the Errors and Warnings tabs: each entry's time, its message's
  await page.waitFor(() => document.querySelectorAll('#console-errors .diag').length === 1 && document.querySelectorAll('#console-warnings .diag').length === 1, [], { what: 'the entries' });
  const errs = await shown(page, '#console-errors .diag'), warns = await shown(page, '#console-warnings .diag');
  assert.deepEqual([errs[0][0], errs[0][1]], ['ERROR:Silinx - an error', lines[3][1]]);
  assert.deepEqual([warns[0][0], warns[0][1]], ['WARNING:Silinx - a warning', lines[2][1]]);
  assert.equal(errs[0][2], `"${lines[3][1]}"`);

  // ---- in Portuguese: the same times, the lines translated
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('pt'));
  try {
    const pt = await shown(page, '#console-log .ln');
    assert.deepEqual(pt.map((l) => l[1]), lines.map((l) => l[1]));
  } finally { await page.eval(async () => (await import('/js/i18n.js')).setLanguage('en')); }

  // ---- a narrow screen: the same times, drawn the same
  await page.setViewport(390, 800);
  try {
    assert.deepEqual((await shown(page, '#console-log .ln')).map((l) => [l[1], l[2]]), lines.map((l) => [l[1], l[2]]));
  } finally { await page.setViewport(1280, 800); }
  await page.eval(async () => (await import('/js/console.js')).clearConsole());
});
