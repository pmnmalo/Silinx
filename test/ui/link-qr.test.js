// UI: the QR code of the sharing dialogs' links (#3637, web/js/link-qr.js, core/qr.js) and the link hidden (#3995,
// web/js/link-field.js): Share Project…'s full link, masked until Show, its QR code only by Show QR Code (decoded back:
// the link), as large as the window, no small one in the window; the short link's (#3223) once Generate has made it
// (Show QR Code disabled before), the one Copy then copies (no second gist); a link too long for a QR code (an
// example's full link): Show QR Code disabled, its reason its tip, a line in the console suggesting the short link
// (information: the dialog's default, no warning); the labels in Portuguese (Share Project Live…'s:
// link-qr-live.test.js). Both interfaces; the exact warnings.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest } from './harness.js';
import { decodeSvg } from '../qr-helpers.js';
import { QR_MAX_BYTES } from '../../core/qr.js';

let env;
const TOKEN = 'gho_faketokenofthetests0123456789';   // (test/fake-github.mjs's)
before(async () => {
  Object.assign(process.env, { SILINX_UI_GITHUB: '1', GH_TOKEN: TOKEN });
  env = await setupUi();
});
after(async () => { await env?.teardown?.(); delete process.env.SILINX_UI_GITHUB; delete process.env.GH_TOKEN; });
const E = () => env;
const warnings = async (page) => (await page.consoleText()).split('\n').filter((l) => /^(WARNING|AVISO)/.test(l.trim())).map((l) => l.trim());
const fakeApi = (page) => page.eval(() => { window.SILINX_GITHUB = { api: `${location.origin}/fake-github` }; });
const startCopy = (page) => page.eval(() => { window.__copied = import('/js/link-copy.js').then((m) => m.copyLinkDialog()); });
const copied = (page) => page.eval(() => window.__copied);
// (an empty project's full link fits a QR code; an example's is longer)
const make = (page, name, template = null) => page.eval(async (n, t) => { const { api } = await import('/js/api.js'); await api.createProject({ name: n, ...(t ? { template: t } : {}) }); }, name, template);
// the text of the QR image in a dialog (its SVG decoded back), and its width on the screen
const qrOf = async (page, sel) => {
  const r = await page.eval((s) => { const i = [...document.querySelectorAll(s)].pop(); return i ? { src: i.getAttribute('src'), width: i.getBoundingClientRect().width } : null; }, sel);
  return r && { text: decodeSvg(decodeURIComponent(r.src.replace(/^data:image\/svg\+xml,/, ''))), width: r.width };
};
const gists = (page) => page.eval(async (t) => (await (await fetch('/fake-github/gists', { headers: { Authorization: `Bearer ${t}` } })).json()).length, TOKEN);

// the link made by Generate (#4073: none before)
const gen = async (page) => { await page.click('.dlg-overlay .link-generate'); return page.waitFor(() => document.querySelector('.dlg-overlay .link-out').value || null, [], { what: 'the link generated' }); };
const state = (page) => page.eval(() => {
  const o = document.querySelector('.dlg-overlay .link-out');
  return { type: o.type, buttons: [...document.querySelectorAll('.dlg-overlay .link-buttons .btn')].map((b) => `${b.textContent}${b.disabled ? ' (off)' : ''}`), small: document.querySelectorAll('.dlg-overlay .qr-img, .dlg-overlay .qr-box').length };
});

uiTest('#3637 #3995 Share Project: the full link hidden, Show and Copy; its QR code by Show QR Code; the short link\'s once generated, the one copied', E, async (page) => {
  await fakeApi(page);
  await make(page, 'qrlamp');
  await page.openProject('qrlamp');
  await startCopy(page);
  await page.waitDialog('Share Project');
  // (#4073: no link before Generate; its buttons Generate, Copy, Show, Show QR Code, the box as tall as them)
  assert.deepEqual(await state(page), { type: 'password', buttons: ['Generate', 'Copy (off)', 'Show (off)', 'Show QR Code (off)'], small: 0 });
  assert.equal(await page.eval(() => document.querySelector('.dlg-overlay .link-out').value), '');
  assert.equal(await page.eval(() => Math.abs(document.querySelector('.dlg-overlay .link-out').getBoundingClientRect().height - document.querySelector('.dlg-overlay .link-buttons').getBoundingClientRect().height) < 2), true);
  const link = await gen(page);
  assert.ok(link.length <= QR_MAX_BYTES, `${link.length}`);
  // hidden, no small QR code; Show shows it, Hide hides it again
  assert.deepEqual(await state(page), { type: 'password', buttons: ['Generate (off)', 'Copy', 'Show', 'Show QR Code'], small: 0 });
  await page.click('.dlg-overlay .link-show');
  assert.deepEqual(await state(page), { type: 'text', buttons: ['Generate (off)', 'Copy', 'Hide', 'Show QR Code'], small: 0 });
  await page.click('.dlg-overlay .link-show');
  assert.equal((await state(page)).type, 'password');
  // Show QR Code: a dialog of its own, over the other, as large as the window
  await page.click('.dlg-overlay .link-qr');
  await page.waitFor(() => !!document.querySelector('.dlg-overlay .qr-large-img'), [], { what: 'the QR code shown' });
  const large = await qrOf(page, '.dlg-overlay .qr-large-img');
  assert.equal(large.text, link);
  assert.ok(large.width > 300, `${large.width}`);
  assert.equal([...await page.eval(() => [...document.querySelectorAll('.qr-large-link')].map((e) => e.textContent))].pop(), link);
  await page.eval(() => [...document.querySelectorAll('.dlg-overlay')].pop().querySelector('.dlg-buttons .btn').click());
  await page.waitFor(() => !document.querySelector('.qr-large-img'), [], { what: 'the QR code closed' });
  // copied without showing it
  await page.click('.dlg-overlay .link-copy');
  await page.waitConsole(new RegExp(`Share Project: the link of 'qrlamp' copied, ${link.length} characters\\.`));
  // another link (the current view left out): the QR code follows it
  await page.click('.dlg-overlay input[data-field="ui"]');
  assert.equal(await page.eval(() => document.querySelector('.dlg-overlay .link-out').value), '', 'a choice changed: Generate again');
  const bare = await gen(page);
  assert.notEqual(bare, link);
  await page.click('.dlg-overlay .link-qr');
  await page.waitFor(() => !!document.querySelector('.dlg-overlay .qr-large-img'), [], { what: 'the QR code shown' });
  assert.equal((await qrOf(page, '.dlg-overlay .qr-large-img')).text, bare);
  await page.eval(() => [...document.querySelectorAll('.dlg-overlay')].pop().querySelector('.dlg-buttons .btn').click());
  await page.waitFor(() => !document.querySelector('.qr-large-img'), [], { what: 'the QR code closed' });
  // the short link: nothing until Generate (Show QR Code disabled); Generate makes it once
  await page.click('.dlg-overlay input[data-field="short"]');
  assert.deepEqual(await state(page), { type: 'password', buttons: ['Generate', 'Copy (off)', 'Show (off)', 'Show QR Code (off)'], small: 0 });
  const before = await gists(page);
  await page.click('.dlg-overlay .link-generate');
  await page.waitFor(() => !!document.querySelector('.dlg-overlay .link-out').value, [], { what: 'the short link made' });
  const shortLink = await page.eval(() => document.querySelector('.dlg-overlay .link-out').value);
  assert.match(shortLink, /#gist=[0-9a-f]{32}\.[A-Za-z0-9_-]{43}/);
  assert.deepEqual(await state(page), { type: 'password', buttons: ['Generate (off)', 'Copy', 'Show', 'Show QR Code'], small: 0 });
  await page.click('.dlg-overlay .link-qr');
  await page.waitFor(() => !!document.querySelector('.dlg-overlay .qr-large-img'), [], { what: 'the QR code shown' });
  assert.equal((await qrOf(page, '.dlg-overlay .qr-large-img')).text, shortLink);
  await page.eval(() => [...document.querySelectorAll('.dlg-overlay')].pop().querySelector('.dlg-buttons .btn').click());
  await page.waitFor(() => !document.querySelector('.qr-large-img'), [], { what: 'the QR code closed' });
  // Copy copies that one: no second gist; Close, the window's one button
  await page.click('.dlg-overlay .link-copy');
  assert.deepEqual(await page.eval(() => [...document.querySelector('.dlg-overlay').querySelectorAll('.dlg-buttons .btn')].map((b) => b.textContent)), ['Close']);
  await page.dialogButton('Close');
  await page.waitNoDialog();
  assert.equal(await copied(page), shortLink);
  assert.equal(await gists(page), before + 1);
  assert.deepEqual(await warnings(page), []);
}, { timeout: 120000 });

uiTest('#3637 Share Project: a link too long for a QR code: Show QR Code disabled, a line in the console suggesting the short link', E, async (page) => {
  await make(page, 'qrbig', 'gates');
  await page.openProject('qrbig');
  await startCopy(page);
  await page.waitDialog('Share Project');
  const n = (await gen(page)).length;
  assert.ok(n > QR_MAX_BYTES, `${n}`);
  assert.deepEqual(await page.eval(() => { const b = document.querySelector('.dlg-overlay .link-qr'); return [b.disabled, b.title]; }), [true, `The link is ${n} characters, too long for a QR code`]);
  const said = `Share Project: the link of 'qrbig' is ${n} characters, too long for a QR code (at most ${QR_MAX_BYTES}): the short link has one.`;
  await page.waitConsole(new RegExp(said.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  // (said once: the link made again, the same)
  await page.click('.dlg-overlay input[data-field="ui"]');
  await page.click('.dlg-overlay input[data-field="short"]');
  await page.dialogButton('Close');
  await page.waitNoDialog();
  assert.equal((await page.consoleText()).split('\n').filter((l) => l.includes('too long for a QR code (at most')).length, 1);
  assert.deepEqual(await warnings(page), []);
}, { timeout: 120000 });

uiTest('#3637 #3995 the link\'s buttons and the QR code\'s labels in Portuguese', E, async (page) => {
  await make(page, 'qrluz');
  await page.openProject('qrluz');
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('pt'));
  await startCopy(page);
  await page.waitDialog('Partilhar Projeto');
  assert.deepEqual((await state(page)).buttons, ['Gerar', 'Copiar (off)', 'Mostrar (off)', 'Mostrar o Código QR (off)']);
  await gen(page);
  await page.click('.dlg-overlay .link-show');
  assert.deepEqual((await state(page)).buttons, ['Gerar (off)', 'Copiar', 'Ocultar', 'Mostrar o Código QR']);
  await page.click('.dlg-overlay .link-qr');
  await page.waitDialog('Código QR');
  assert.equal(await page.eval(() => document.querySelector('.qr-large-img').getAttribute('aria-label')), 'Código QR da ligação');
  await page.dialogButton('Fechar');
  await page.waitDialog('Partilhar Projeto');
  await page.click('.dlg-overlay input[data-field="short"]');
  assert.deepEqual((await state(page)).buttons, ['Gerar', 'Copiar (off)', 'Mostrar (off)', 'Mostrar o Código QR (off)']);
  await page.dialogButton('Fechar');
  await page.waitNoDialog();
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('en'));
  assert.deepEqual(await warnings(page), []);
});
