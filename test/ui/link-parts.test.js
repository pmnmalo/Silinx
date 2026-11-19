// UI: Share Project…'s copy of a project whose imported KiCad libraries made its link too long (#4573,
// web/js/link-copy.js, core/link-parts.js), in the server edition with no GitHub token: the full link made by Generate,
// the part files no drawing uses left out and said in the console; a project still too large for a link: why, red,
// above the link's box, and an ERROR in the console; a short link that cannot be made (no GH_TOKEN): an ERROR in the
// console too. Both interfaces; the exact console lines, no warnings.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest } from './harness.js';
import { kicadPartsProject } from '../link-parts-helpers.js';

let env;
const saved = { GH_TOKEN: process.env.GH_TOKEN, GITHUB_TOKEN: process.env.GITHUB_TOKEN };
before(async () => { delete process.env.GH_TOKEN; delete process.env.GITHUB_TOKEN; env = await setupUi(); });
after(async () => { await env?.teardown?.(); for (const [k, v] of Object.entries(saved)) if (v !== undefined) process.env[k] = v; });
const E = () => env;

const write = (page, name, files) => page.eval(async (n, f) => { const { api } = await import('/js/api.js'); for (const [p, t] of Object.entries(f)) await api.writeFile(n, p, t); }, name, files);
const share = async (page) => { await page.menu('File', 'Share Project…'); await page.waitDialog('Share Project'); };
const close = async (page) => { await page.dialogButton('Close'); await page.waitNoDialog(); };
// the console's lines that are Share Project's, and its warnings (none expected)
const shareLines = async (page) => (await page.consoleText()).split('\n').map((l) => l.trim()).filter((l) => /^(ERROR: )?Share Project: /.test(l));
async function noWarnings(page) {
  assert.deepEqual(page.console.filter((c) => c.type === 'warning' || c.type === 'warn').map((c) => c.text), []);
  assert.deepEqual((await page.consoleText()).split('\n').filter((l) => /^WARNING/.test(l.trim())), []);
}

uiTest('#4573 Share Project… a copy: a project with imported KiCad libraries has its full link (the parts no drawing uses left out); a project too large: why, red above the box, an ERROR; no short link: an ERROR', E, async (page) => {
  await page.eval(async () => { const { api } = await import('/js/api.js'); await api.createProject({ name: 'kparts', template: 'blinky' }); });
  const { files } = kicadPartsProject();
  await write(page, 'kparts', files);
  await page.openProject('kparts');
  await share(page);
  // the full link, made by Generate (before #4573: "the design is too large for a link", no link)
  assert.equal(await page.eval(() => document.querySelector('.dlg-overlay .link-error').textContent), '');
  await page.click('.dlg-overlay .link-generate');
  const link = await page.waitFor(() => document.querySelector('.dlg-overlay .link-out').value || null, [], { what: 'the full link' });
  assert.match(link, /#design=[A-Za-z0-9_-]+(&ui=[A-Za-z0-9_-]+)?$/);
  assert.ok(link.length < 64000, `${link.length} characters`);
  assert.equal(await page.eval(() => document.querySelector('.dlg-overlay .link-info').textContent), `${link.length} characters: some slide tools cut a link longer than 2000 (export the project as a .zip, host it, and link to it with #open=).`);
  // the short link, with no GitHub token on the server: not made, said in the window and as an ERROR
  await page.click('.dlg-overlay input[data-field="short"]');
  await page.click('.dlg-overlay .link-generate');
  const NO_TOKEN = 'A short link needs a GitHub token on the Silinx server (GH_TOKEN): choose the full link, or start the server with one.';
  await page.waitFor((t) => document.querySelector('.dlg-overlay .link-error').textContent === t, [NO_TOKEN], { what: 'the short link refused' });
  await page.waitConsole(/ERROR: Share Project: no short link of 'kparts'/);
  await close(page);
  assert.deepEqual(await shareLines(page), [
    'Share Project: the link of \'kparts\' leaves out 61 files of its KiCad parts that no drawing uses (parts/).',
    `Share Project: the link of 'kparts' is ${link.length} characters, too long for a QR code (at most 2953): the short link has one.`,
    `ERROR: Share Project: no short link of 'kparts': ${NO_TOKEN}`,
  ]);

  // a project too large for a link even so (a file hard to compress): why, red, above the link's box; an ERROR
  await page.eval(async () => { const { api } = await import('/js/api.js'); await api.createProject({ name: 'big', template: 'blinky' }); });
  let x = 7, noise = '';
  while (noise.length < 120000) { x = (Math.imul(x, 1664525) + 1013904223) >>> 0; noise += x.toString(16).padStart(8, '0'); }
  await write(page, 'big', { 'src/noise.txt': noise });
  await page.openProject('big');
  await share(page);
  const err = await page.waitFor(() => document.querySelector('.dlg-overlay .link-error').textContent || null, [], { what: 'why there is no link' });
  assert.match(err, /^The design is too large for a link \((\d+) characters, at most 64000\): export it as a \.zip \(Export Project \(\.zip\)…, Silinx\) and link to that\.$/);
  const look = await page.eval(() => {
    const e = document.querySelector('.dlg-overlay .link-error'), f = document.querySelector('.dlg-overlay .link-field');
    const probe = document.createElement('span'); probe.style.color = 'var(--error-fg)'; document.body.append(probe);
    const red = getComputedStyle(probe).color; probe.remove();
    return { color: getComputedStyle(e).color === red, bold: Number(getComputedStyle(e).fontWeight) >= 600, above: e.getBoundingClientRect().bottom <= f.getBoundingClientRect().top, shown: e.getClientRects().length > 0 };
  });
  assert.deepEqual(look, { color: true, bold: true, above: true, shown: true });
  // (Generate makes nothing)
  await page.click('.dlg-overlay .link-generate');
  assert.equal(await page.eval(() => document.querySelector('.dlg-overlay .link-out').value), '');
  await close(page);
  assert.deepEqual((await shareLines(page)).slice(3), [`ERROR: Share Project: no link of 'big': ${err[0].toLowerCase()}${err.slice(1)}`]);
  await noWarnings(page);
});
