// UI: Share Project…'s live window (#3996, web/js/collab-share.js; #3181): the name on it, the cursor in it (an empty
// one said beside it), Start Sharing, then in the same window the viewers' and the editors' links, different, each
// hidden (Show, Copy) with its QR code by Show QR Code only (#3637, decoded back: the link; no small one in the window);
// Stop Sharing keeps the window, Start Sharing again; Add a User… (Viewer or Editor, that role's link); Share Module…'s
// links (#3631, opening on the module); the labels in Portuguese. A server with its relay. Both interfaces; no warnings.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest } from './harness.js';
import { decodeSvg } from '../qr-helpers.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;
const warnings = async (page) => (await page.consoleText()).split('\n').filter((l) => /^(WARNING|AVISO)/.test(l.trim())).map((l) => l.trim());
const make = (page, name, template) => page.eval(async (n, t) => { const { api } = await import('/js/api.js'); await api.createProject({ name: n, template: t }); }, name, template);
// the text of the QR image in the top dialog (its SVG decoded back), and its width on the screen
const qrOf = async (page, sel) => {
  const r = await page.eval((s) => { const i = [...document.querySelectorAll(s)].pop(); return i ? { src: i.getAttribute('src'), width: i.getBoundingClientRect().width } : null; }, sel);
  return r && { text: decodeSvg(decodeURIComponent(r.src.replace(/^data:image\/svg\+xml,/, ''))), width: r.width };
};

const top = (page) => page.eval(() => { const d = [...document.querySelectorAll('.dlg-overlay')].pop(); return [d.querySelector('.dlg-title span').textContent, [...d.querySelectorAll('.dlg-buttons .btn')].map((b) => `${b.textContent}${b.disabled ? ' (off)' : ''}${b.classList.contains('primary') ? ' *' : ''}`)]; });
const closeTop = (page) => page.eval(() => [...document.querySelectorAll('.dlg-overlay')].pop().querySelector('.dlg-buttons .btn:last-child').click());
const qrOfField = async (page, field) => {
  await page.click(`.dlg-overlay .link-field:has([data-field="${field}"]) .link-qr`);
  await page.waitFor(() => !!document.querySelector('.dlg-overlay .qr-large-img'), [], { what: 'the QR code shown' });
  const q = await qrOf(page, '.dlg-overlay .qr-large-img');
  await closeTop(page);
  await page.waitFor(() => !document.querySelector('.qr-large-img'), [], { what: 'the QR code closed' });
  return q;
};

uiTest('#3996 Share Project, live: the name on the window, Start Sharing, the two links hidden, each with its QR code; Stop Sharing; Add a User…', E, async (page) => {
  await make(page, 'qrlive', 'gates');
  await page.openProject('qrlive');
  await page.eval(() => localStorage.removeItem('silinx.collab.name'));
  await page.eval(() => { window.__shared = import('/js/collab-share.js').then((m) => m.shareProjectDialog()); });
  await page.waitDialog('Share Project');
  // before: the name (the cursor in it), Start Sharing, no link
  await page.waitFor(() => document.activeElement?.dataset?.field === 'name', [], { what: 'the cursor in the name' });
  assert.deepEqual(await top(page), ['Share Project', ['Start Sharing *', 'Stop Sharing (off)', 'Add a User… (off)', 'Close']]);
  assert.equal(await page.eval(() => document.querySelector('.dlg-overlay .collab-links').hidden), true);
  await page.dialogButton('Start Sharing');
  assert.equal(await page.eval(() => document.querySelector('.dlg-overlay .collab-name-error').textContent), 'Your name first: the others see it.');
  await page.fill('.dlg-overlay input[data-field=name]', 'Teacher');
  await page.dialogButton('Start Sharing');
  const link = await page.waitFor(() => document.querySelector('.dlg-overlay input[data-field=link]')?.value || null, [], { what: 'the link' });
  const editLink = await page.eval(() => document.querySelector('.dlg-overlay input[data-field="edit-link"]').value);
  assert.match(link, /#follow=/);
  assert.match(editLink, /#edit=/);
  assert.notEqual(link, editLink);
  assert.equal(await page.eval(() => document.querySelector('.dlg-overlay .collab-name-error').textContent), '');
  // the same window: its links hidden, no small QR code; the name kept, read only
  assert.deepEqual(await top(page), ['Share Project', ['Start Sharing (off)', 'Stop Sharing', 'Add a User…', 'Close *']]);
  assert.deepEqual(await page.eval(() => [...document.querySelectorAll('.dlg-overlay .link-out')].map((o) => o.type)), ['password', 'password']);
  assert.equal(await page.eval(() => document.querySelectorAll('.dlg-overlay .qr-img, .dlg-overlay .qr-box').length), 0);
  assert.equal(await page.eval(() => document.querySelector('.dlg-overlay input[data-field=name]').readOnly), true);
  assert.equal(await page.eval(() => document.querySelector('.dlg-overlay .collab-about').textContent), 'Anyone with this link follows "qrlive" live, read only, as long as you share it.');
  // Show, Copy; each link's QR code, as large as the window
  await page.click('.dlg-overlay .link-field:has([data-field="edit-link"]) .link-show');
  assert.deepEqual(await page.eval(() => [...document.querySelectorAll('.dlg-overlay .link-out')].map((o) => o.type)), ['password', 'text']);
  await page.click('.dlg-overlay .link-field:has([data-field="link"]) .link-copy');
  await page.waitConsole(/^Shared project's link copied: whoever opens it follows it live, read only\.$/m);
  await page.click('.dlg-overlay .link-field:has([data-field="edit-link"]) .link-copy');
  await page.waitConsole(/^Shared project's editors' link copied: whoever opens it edits its text files and drawings with you\.$/m);
  const qv = await qrOfField(page, 'link');
  assert.equal(qv.text, link);
  assert.ok(qv.width > 300, `${qv.width}`);
  assert.equal((await qrOfField(page, 'edit-link')).text, editLink);
  // Add a User…: Viewer first, its link; Editor, the editors' link
  await page.dialogButton('Add a User…');
  await page.waitDialog('Add a User');
  const userLink = () => page.eval(() => [...document.querySelectorAll('.dlg-overlay')].pop().querySelector('input[data-field="user-link"]').value);
  assert.equal(await userLink(), link);
  assert.equal((await top(page))[1].join(), 'Close *');
  await page.click('.dlg-overlay input[data-field="role-editor"]');
  assert.equal(await userLink(), editLink);
  await page.click('.dlg-overlay:last-child .link-copy');
  await page.waitConsole(/^Add a User: the editors' link copied: whoever opens it edits the project's text files and drawings with you\.$/m);
  await closeTop(page);
  await page.waitFor(() => document.querySelectorAll('.dlg-overlay').length === 1, [], { what: 'Add a User closed' });
  // Stop Sharing: the window kept, its links gone; Start Sharing again, new links
  await page.dialogButton('Stop Sharing');
  await page.waitConsole(/Stopped sharing "qrlive"/);
  assert.deepEqual(await top(page), ['Share Project', ['Start Sharing *', 'Stop Sharing (off)', 'Add a User… (off)', 'Close']]);
  assert.equal(await page.eval(() => document.querySelector('.dlg-overlay .collab-links').hidden), true);
  await page.dialogButton('Start Sharing');
  const again = await page.waitFor((l) => { const v = document.querySelector('.dlg-overlay input[data-field=link]')?.value; return v && v !== l ? v : null; }, [link], { what: 'the new link' });
  await page.dialogButton('Close');
  await page.waitNoDialog();
  assert.equal(await page.eval(() => window.__shared), again);
  // Share Module… (#3631): its links, opening on the module
  await page.eval(() => { window.__shared = import('/js/collab-share.js').then((m) => m.shareProjectDialog({ module: 'gates' })); });
  await page.waitDialog('Share Module');
  const mod = await page.eval(() => document.querySelector('.dlg-overlay input[data-field=link]').value);
  assert.equal(mod, `${again}&top=gates`);
  assert.match(await page.eval(() => document.querySelector('.dlg-overlay input[data-field="edit-link"]').value), /#edit=[^&]+&top=gates$/);
  assert.equal((await qrOfField(page, 'link')).text, mod);
  await page.dialogButton('Stop Sharing');
  await page.waitConsole(/Stopped sharing "qrlive"/);
  await page.dialogButton('Close');
  await page.waitNoDialog();
  assert.deepEqual(await warnings(page), []);
}, { timeout: 120000 });

uiTest('#3996 Share Project, live, in Portuguese: its buttons, the name\'s message, Add a User…', E, async (page) => {
  await make(page, 'qrlivept', 'gates');
  await page.openProject('qrlivept');
  await page.eval(async () => { localStorage.removeItem('silinx.collab.name'); (await import('/js/i18n.js')).setLanguage('pt'); });
  try {
    await page.eval(() => { window.__shared = import('/js/collab-share.js').then((m) => m.shareProjectDialog()); });
    await page.waitDialog('Partilhar Projeto');
    assert.deepEqual((await top(page))[1], ['Começar a Partilhar *', 'Parar de Partilhar (off)', 'Adicionar um Utilizador… (off)', 'Fechar']);
    await page.dialogButton('Começar a Partilhar');
    assert.equal(await page.eval(() => document.querySelector('.dlg-overlay .collab-name-error').textContent), 'O seu nome primeiro: os outros veem-no.');
    await page.fill('.dlg-overlay input[data-field=name]', 'Ana');
    await page.dialogButton('Começar a Partilhar');
    await page.waitFor(() => document.querySelector('.dlg-overlay input[data-field=link]')?.value || null, [], { what: 'the link' });
    assert.deepEqual(await page.eval(() => [...document.querySelectorAll('.dlg-overlay .link-buttons')].map((b) => [...b.children].filter((c) => c.tagName === 'BUTTON').map((c) => c.textContent))), [['Mostrar', 'Copiar', 'Mostrar o Código QR'], ['Mostrar', 'Copiar', 'Mostrar o Código QR']]);
    assert.equal(await page.eval(() => document.querySelector('.dlg-overlay .collab-edit-about').textContent), 'Quem tiver a ligação de editores edita os ficheiros de texto e os desenhos consigo, em direto.');
    await page.dialogButton('Adicionar um Utilizador…');
    await page.waitDialog('Adicionar um Utilizador');
    assert.deepEqual(await page.eval(() => [...[...document.querySelectorAll('.dlg-overlay')].pop().querySelectorAll('.share-how label')].map((l) => l.textContent)), ['Papel:', 'Espectador', 'Editor']);
    await closeTop(page);
    await page.dialogButton('Parar de Partilhar');
    await page.dialogButton('Fechar');
    await page.waitNoDialog();
  } finally { await page.eval(async () => (await import('/js/i18n.js')).setLanguage('en')); }
  assert.deepEqual(await warnings(page), []);
}, { timeout: 120000 });
