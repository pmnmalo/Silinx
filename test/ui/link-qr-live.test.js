// UI: Share Project…'s live window (#3996, #4073, web/js/collab-share.js; #3181): the name on it, the cursor in it (an
// empty one said beside it; once shared, shown, not a field), Start Sharing, then in the same window the viewers' and
// the editors' links, each made by its own Generate (none before), different (#view=, #edit=), hidden (Generate, Copy,
// Show, Show QR Code) with its QR code by Show QR Code only (#3637, decoded back: the link; no small one in the window);
// Stop Sharing keeps the window, Start Sharing again; no Add a User… in it: the toolbar's Sharing menu's (Viewer or
// Editor, that role's link by Generate), and its Copy View Link; Share Module…'s links (#3631, opening on the module);
// the labels in Portuguese. A server with its relay. Both interfaces; no warnings.
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

const gen = async (page, field) => {
  await page.click(`.dlg-overlay .link-field:has([data-field="${field}"]) .link-generate`);
  return page.waitFor((f) => [...document.querySelectorAll(`.dlg-overlay input[data-field="${f}"]`)].pop()?.value || null, [field], { what: `the ${field} generated` });
};
const fieldButtons = (page, field) => page.eval((f) => [...document.querySelectorAll(`.dlg-overlay .link-field:has([data-field="${f}"]) .link-buttons .btn`)].map((b) => `${b.textContent}${b.disabled ? ' (off)' : ''}`), field);
const menuPick = async (page, label) => {
  await page.click('.collab-presence .collab-btn');
  await page.waitForSelector('body > .menu-popup');
  await page.click('body > .menu-popup .mi', { text: label });
};

uiTest('#3996 #4073 Share Project, live: the name on the window, Start Sharing, each link made by its Generate, hidden, its QR code; Stop Sharing; Add a User… in the menu', E, async (page) => {
  await make(page, 'qrlive', 'gates');
  await page.openProject('qrlive');
  await page.eval(() => localStorage.removeItem('silinx.collab.name'));
  await page.eval(() => { window.__shared = import('/js/collab-share.js').then((m) => m.shareProjectDialog()); });
  await page.waitDialog('Share Project');
  // before: the name (the cursor in it), Start Sharing, no link; no Add a User… (#4073)
  await page.waitFor(() => document.activeElement?.dataset?.field === 'name', [], { what: 'the cursor in the name' });
  assert.deepEqual(await top(page), ['Share Project', ['Start Sharing *', 'Stop Sharing (off)', 'Close']]);
  assert.equal(await page.eval(() => document.querySelector('.dlg-overlay .collab-links').hidden), true);
  await page.dialogButton('Start Sharing');
  assert.equal(await page.eval(() => document.querySelector('.dlg-overlay .collab-name-error').textContent), 'Your name first: the others see it.');
  await page.fill('.dlg-overlay input[data-field=name]', 'Teacher');
  await page.dialogButton('Start Sharing');
  await page.waitFor(() => !document.querySelector('.dlg-overlay .collab-links').hidden, [], { what: 'shared' });
  // shared: the name shown, not a field; the links not made yet
  assert.deepEqual(await page.eval(() => [document.querySelector('.dlg-overlay input[data-field=name]').hidden, document.querySelector('.dlg-overlay .collab-name').hidden, document.querySelector('.dlg-overlay .collab-name').textContent]), [true, false, 'Teacher']);
  assert.deepEqual(await top(page), ['Share Project', ['Start Sharing (off)', 'Stop Sharing', 'Close *']]);
  for (const f of ['link', 'edit-link']) assert.deepEqual(await fieldButtons(page, f), ['Generate', 'Copy (off)', 'Show (off)', 'Show QR Code (off)']);
  assert.deepEqual(await page.eval(() => [...document.querySelectorAll('.dlg-overlay .link-out')].map((o) => o.value)), ['', '']);
  // each made by its Generate: different, the viewers' #view=, the editors' #edit=
  const link = await gen(page, 'link');
  assert.equal(await page.eval(() => document.querySelector('.dlg-overlay input[data-field="edit-link"]').value), '', 'the editors\' link not made by the viewers\' Generate');
  const editLink = await gen(page, 'edit-link');
  assert.match(link, /^http:\/\/[^/]+\/#view=[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{43}$/);
  assert.match(editLink, /#edit=/);
  assert.notEqual(link, editLink);
  assert.ok(!link.includes(editLink.split('.').pop()), 'nothing of the editors\' key in the viewers\' link');
  // hidden, no small QR code, the box as tall as its buttons
  assert.deepEqual(await fieldButtons(page, 'link'), ['Generate (off)', 'Copy', 'Show', 'Show QR Code']);
  assert.deepEqual(await page.eval(() => [...document.querySelectorAll('.dlg-overlay .link-out')].map((o) => o.type)), ['password', 'password']);
  assert.equal(await page.eval(() => document.querySelectorAll('.dlg-overlay .qr-img, .dlg-overlay .qr-box').length), 0);
  assert.equal(await page.eval(() => [...document.querySelectorAll('.dlg-overlay .link-field')].every((f) => Math.abs(f.querySelector('.link-out').getBoundingClientRect().height - f.querySelector('.link-buttons').getBoundingClientRect().height) < 2)), true);
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
  // closed and opened again: the links made kept
  await page.dialogButton('Close');
  await page.waitNoDialog();
  await page.eval(() => { window.__shared = import('/js/collab-share.js').then((m) => m.shareProjectDialog()); });
  await page.waitDialog('Share Project');
  assert.deepEqual(await page.eval(() => [...document.querySelectorAll('.dlg-overlay .link-out')].map((o) => o.value)), [link, editLink]);
  await page.dialogButton('Close');
  await page.waitNoDialog();
  // the toolbar's menu: Copy View Link; Add a User…: Viewer first, its link by Generate; Editor, the editors' link
  await menuPick(page, 'Copy View Link');
  await page.waitConsole(/^Shared project's link copied: whoever opens it follows it live, read only\.$/m);
  await menuPick(page, 'Add a User…');
  await page.waitDialog('Add a User');
  assert.deepEqual(await fieldButtons(page, 'user-link'), ['Generate', 'Copy (off)', 'Show (off)', 'Show QR Code (off)']);
  assert.equal(await gen(page, 'user-link'), link);
  await page.click('.dlg-overlay input[data-field="role-editor"]');
  assert.equal(await page.eval(() => document.querySelector('.dlg-overlay input[data-field="user-link"]').value), '', 'another role: Generate again');
  assert.equal(await gen(page, 'user-link'), editLink);
  await page.click('.dlg-overlay .link-field:has([data-field="user-link"]) .link-copy');
  await page.waitConsole(/^Add a User: the editors' link copied: whoever opens it edits the project's text files and drawings with you\.$/m);
  await page.dialogButton('Close');
  await page.waitNoDialog();
  // Stop Sharing: the window kept, its links gone, the name a field again; Start Sharing again, new links (Generate)
  await page.eval(() => { window.__shared = import('/js/collab-share.js').then((m) => m.shareProjectDialog()); });
  await page.waitDialog('Share Project');
  await page.dialogButton('Stop Sharing');
  await page.waitConsole(/Stopped sharing "qrlive"/);
  assert.deepEqual(await top(page), ['Share Project', ['Start Sharing *', 'Stop Sharing (off)', 'Close']]);
  assert.deepEqual(await page.eval(() => [document.querySelector('.dlg-overlay .collab-links').hidden, document.querySelector('.dlg-overlay input[data-field=name]').hidden]), [true, false]);
  await page.dialogButton('Start Sharing');
  await page.waitFor(() => !document.querySelector('.dlg-overlay .collab-links').hidden, [], { what: 'shared again' });
  const again = await gen(page, 'link');
  assert.notEqual(again, link);
  await page.dialogButton('Close');
  await page.waitNoDialog();
  assert.equal(await page.eval(() => window.__shared), again);
  // Share Module… (#3631): its links, opening on the module
  await page.eval(() => { window.__shared = import('/js/collab-share.js').then((m) => m.shareProjectDialog({ module: 'gates' })); });
  await page.waitDialog('Share Module');
  assert.equal(await page.eval(() => document.querySelector('.dlg-overlay input[data-field=link]').value), `${again}&top=gates`);
  assert.match(await gen(page, 'edit-link'), /#edit=[^&]+&top=gates$/);
  assert.equal((await qrOfField(page, 'link')).text, `${again}&top=gates`);
  await page.dialogButton('Stop Sharing');
  await page.waitConsole(/Stopped sharing "qrlive"/);
  await page.dialogButton('Close');
  await page.waitNoDialog();
  assert.deepEqual(await warnings(page), []);
}, { timeout: 120000 });

uiTest('#3996 #4073 Share Project, live, in Portuguese: its buttons, the name\'s message, the menu\'s Add a User…', E, async (page) => {
  await make(page, 'qrlivept', 'gates');
  await page.openProject('qrlivept');
  await page.eval(async () => { localStorage.removeItem('silinx.collab.name'); (await import('/js/i18n.js')).setLanguage('pt'); });
  try {
    await page.eval(() => { window.__shared = import('/js/collab-share.js').then((m) => m.shareProjectDialog()); });
    await page.waitDialog('Partilhar Projeto');
    assert.deepEqual((await top(page))[1], ['Começar a Partilhar *', 'Parar de Partilhar (off)', 'Fechar']);
    await page.dialogButton('Começar a Partilhar');
    assert.equal(await page.eval(() => document.querySelector('.dlg-overlay .collab-name-error').textContent), 'O seu nome primeiro: os outros veem-no.');
    await page.fill('.dlg-overlay input[data-field=name]', 'Ana');
    await page.dialogButton('Começar a Partilhar');
    await page.waitFor(() => !document.querySelector('.dlg-overlay .collab-links').hidden, [], { what: 'shared' });
    assert.deepEqual(await fieldButtons(page, 'link'), ['Gerar', 'Copiar (off)', 'Mostrar (off)', 'Mostrar o Código QR (off)']);
    assert.equal(await page.eval(() => document.querySelector('.dlg-overlay .collab-edit-about').textContent), 'Quem tiver a ligação de editores edita os ficheiros de texto e os desenhos consigo, em direto.');
    await page.dialogButton('Fechar');
    await page.waitNoDialog();
    await page.click('.collab-presence .collab-btn');
    await page.waitForSelector('body > .menu-popup');
    assert.ok((await page.eval(() => [...document.querySelectorAll('body > .menu-popup .mi .lbl')].map((l) => l.textContent))).includes('Copiar Ligação de Visualização'));
    await page.click('body > .menu-popup .mi', { text: 'Adicionar um Utilizador…' });
    await page.waitDialog('Adicionar um Utilizador');
    assert.deepEqual(await page.eval(() => [...document.querySelectorAll('.dlg-overlay .share-how label')].map((l) => l.textContent)), ['Papel:', 'Espectador', 'Editor']);
    await page.dialogButton('Fechar');
    await page.waitNoDialog();
    await page.eval(async () => (await import('/js/collab-share.js')).stopSharing());
  } finally { await page.eval(async () => (await import('/js/i18n.js')).setLanguage('en')); }
  assert.deepEqual(await warnings(page), []);
}, { timeout: 120000 });
