// UI: Share Project…'s live window (#3996, #4073, web/js/collab-share.js; #3181): the name on it, the cursor in it (an
// empty one said beside it; once shared, shown, not a field), Start Sharing, then in the same window the viewers' and
// the editors' links, each made by its own Generate (none before), different (#view=, #edit=), hidden (Generate, Copy,
// Show, Show QR Code) with its QR code by Show QR Code only (#3637, decoded back: the link; no small one in the window);
// Stop Sharing keeps the window, Start Sharing again; no Add a User… in it: the toolbar's Sharing menu's (Viewer or
// Editor, that role's link by Generate), and its Copy View Link; Share Module…'s links (#3631, opening on the module);
// the labels in Portuguese; each link's Generate named for it (Generate View-Only, Generate Edit Link: #4613), its buttons in a
// row below a box as tall as the link, hidden or shown (#4190, #4576), on a phone too, a copy's laid out the same (#4612);
// the window's size the same as a copy's, switching, sharing or generating (#4617). A server with its relay. Both
// interfaces; no warnings.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest } from './harness.js';
import { decodeSvg } from '../qr-helpers.js';
import { framesOf, checkFrames, shareAbout } from './share-frames.js';

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

// each way of sharing in one sentence, of the same length (#4712)
const COPY_ABOUT = 'A link that opens the project in Silinx, for slides or a message, with the whole project inside it: no file to host. Whoever opens it gets a copy of every file and its comments, as it is now. Later changes are not in it: share it again to send them.';
const LIVE_ABOUT = 'Others follow the project live, read only: its files and drawings as they change, and what you do. They connect through this Silinx server, with nothing to set up. Anyone who can reach this server and has the link can follow it as you work.';
const COPY_PT = 'Uma ligação que abre o projeto no Silinx, para diapositivos ou uma mensagem, com o projeto todo lá dentro: nenhum ficheiro a alojar. Quem a abre recebe uma cópia de cada ficheiro e dos comentários, tal como está. As alterações seguintes não vão: partilhe-o de novo.';
const LIVE_PT = 'Outros seguem o projeto em direto, só de leitura: os ficheiros e desenhos à medida que mudam, e o que faz. Ligam-se através deste servidor Silinx, sem nada a configurar. Quem consegue chegar a este servidor e tem a ligação pode segui-lo enquanto trabalha.';

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
  // (#4576: each Generate named for its link)
  assert.deepEqual(await fieldButtons(page, 'link'), ['Generate View-Only', 'Copy (off)', 'Show (off)', 'Show QR Code (off)']);
  assert.deepEqual(await fieldButtons(page, 'edit-link'), ['Generate Edit Link', 'Copy (off)', 'Show (off)', 'Show QR Code (off)']);
  assert.deepEqual(await page.eval(() => [...document.querySelectorAll('.dlg-overlay .link-out')].map((o) => o.value)), ['', '']);
  // each made by its Generate: different, the viewers' #view=, the editors' #edit=
  const link = await gen(page, 'link');
  assert.equal(await page.eval(() => document.querySelector('.dlg-overlay input[data-field="edit-link"]').value), '', 'the editors\' link not made by the viewers\' Generate');
  const editLink = await gen(page, 'edit-link');
  assert.match(link, /^http:\/\/[^/]+\/#view=[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{43}$/);
  assert.match(editLink, /#edit=/);
  assert.notEqual(link, editLink);
  assert.ok(!link.includes(editLink.split('.').pop()), 'nothing of the editors\' key in the viewers\' link');
  // hidden, no small QR code (the box and its row of buttons: the #4190 / #4576 test below)
  assert.deepEqual(await fieldButtons(page, 'link'), ['Generate View-Only (off)', 'Copy', 'Show', 'Show QR Code']);
  assert.deepEqual(await page.eval(() => [...document.querySelectorAll('.dlg-overlay .link-out')].map((o) => o.type)), ['password', 'password']);
  assert.equal(await page.eval(() => document.querySelectorAll('.dlg-overlay .qr-img, .dlg-overlay .qr-box').length), 0);
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
    assert.deepEqual(await fieldButtons(page, 'link'), ['Gerar Só de Leitura', 'Copiar (off)', 'Mostrar (off)', 'Mostrar o Código QR (off)']);
    assert.deepEqual(await fieldButtons(page, 'edit-link'), ['Gerar Ligação de Edição', 'Copiar (off)', 'Mostrar (off)', 'Mostrar o Código QR (off)']);
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

// each link field as it looks (#4576: its box above, its buttons in one row below): the box shown, its class, its
// text, its height, whether all of its text is in view (nothing cut off, across or down) and how many lines it takes;
// its buttons' labels, whether they are on one line, below the box and within the field
const boxes = (page) => page.eval(() => [...document.querySelectorAll('.dlg-overlay .link-field')].map((f) => {
  const [b] = [...f.querySelectorAll('.link-out, .link-full')].filter((e) => !e.hidden && e.getClientRects().length);
  const r = b.getBoundingClientRect(), btns = [...f.querySelectorAll('.link-buttons .btn')].map((x) => x.getBoundingClientRect());
  const line = parseFloat(getComputedStyle(b).lineHeight), pad = b.clientHeight - parseFloat(getComputedStyle(b).paddingTop) - parseFloat(getComputedStyle(b).paddingBottom);
  // (the box as wide as the window's content, #4576: the dialog's body less its padding)
  const body = f.closest('.dlg-body'), bs = getComputedStyle(body), content = body.clientWidth - parseFloat(bs.paddingLeft) - parseFloat(bs.paddingRight);
  return { cls: b.className, text: b.value, height: r.height, lines: Math.round(pad / line), whole: b.scrollWidth <= b.clientWidth && b.scrollHeight <= b.clientHeight, wide: Math.abs(r.width - content) < 1.5,
    oneRow: btns.every((x) => Math.abs(x.top - btns[0].top) < 2), below: btns.every((x) => x.top >= r.bottom), inside: btns.every((x) => x.right <= f.getBoundingClientRect().right + 1) };
}));
// the lines a text of n characters takes in a link box as wide as the field's (measured as the box wraps it)
const linesOf = (page, field, n) => page.eval((f, k) => {
  const b = document.querySelector(`.dlg-overlay .link-field:has([data-field="${f}"]) .link-full`), t = document.createElement('textarea');
  t.className = 'link-full'; t.rows = 1; Object.assign(t.style, { position: 'absolute', visibility: 'hidden', width: `${b.getBoundingClientRect().width}px`, height: '0' });
  b.parentNode.append(t); t.value = 'x'.repeat(k);
  const n2 = Math.round((t.scrollHeight - parseFloat(getComputedStyle(t).paddingTop) - parseFloat(getComputedStyle(t).paddingBottom)) / parseFloat(getComputedStyle(t).lineHeight));
  t.remove(); return n2;
}, field, n);

// a link field's layout, to compare a copy's with Live's (#4612): the field's class and direction, its box's font,
// padding and border, its buttons' row (each one's class, Generate's left out, and height); each box as wide as its
// window's content, the windows' widths their own (the boxes' test below)
const layout = (page) => page.eval(() => {
  const f = document.querySelector('.dlg-overlay .link-field:has(input[data-field="link"])'), b = f.querySelector('.link-full'), row = f.querySelector('.link-buttons');
  const [fs, bs, rs] = [f, b, row].map((e) => getComputedStyle(e));
  return { cls: f.className, dir: fs.flexDirection, gap: fs.rowGap, font: bs.font, padding: bs.padding, border: bs.borderWidth,
    row: rs.flexDirection, wrap: rs.flexWrap, rowGap: rs.columnGap, buttons: [...row.querySelectorAll('.btn')].map((x) => [x.className, Math.round(x.getBoundingClientRect().height)]) };
});

uiTest('#4190 #4576 Share Project and Share Module, live: each link\'s buttons in one row below its box, the box as wide as the window\'s content and as tall as the link (before Generate as tall as the link it makes), the whole link in view, hidden or shown; on a phone too', E, async (page) => {
  await make(page, 'linkbox', 'gates');
  await page.openProject('linkbox');
  await page.eval(() => localStorage.setItem('silinx.collab.name', 'Teacher'));
  try {
    for (const [width, module] of [[1400, null], [375, null], [375, 'gates']]) {
      await page.setViewport(width, 900);
      await page.eval((m) => { window.__shared = import('/js/collab-share.js').then((x) => x.shareProjectDialog(m ? { module: m } : {})); }, module);
      await page.waitDialog(module ? 'Share Module' : 'Share Project');
      const fresh = await page.eval(() => !document.querySelector('.dlg-overlay .dlg-buttons .btn.primary')?.textContent.startsWith('Close'));
      if (fresh) {
        await page.dialogButton('Start Sharing');
        await page.waitFor(() => !document.querySelector('.dlg-overlay .collab-links').hidden, [], { what: 'shared' });
      }
      const what = `${module ? 'Share Module' : 'Share Project'}, ${width} px`;
      const liveLayout = await layout(page);
      // before Generate (the first window): empty boxes, as tall as the links they will make
      const before = fresh ? await boxes(page) : null;
      const links = [];
      for (const f of ['link', 'edit-link']) {
        if (!await page.eval((x) => document.querySelector(`.dlg-overlay input[data-field="${x}"]`).value, f)) await gen(page, f);
        links.push(await page.eval((x) => document.querySelector(`.dlg-overlay input[data-field="${x}"]`).value, f));
      }
      const want = [await linesOf(page, 'link', links[0].length), await linesOf(page, 'edit-link', links[1].length)];
      assert.ok(want.every((n) => n >= 1 && n <= 6), `${what}: ${want}`);
      // hidden: a dot for each of the link's characters, all in view, the box as many lines as the link takes; the
      // buttons on one row below it
      const hidden = await boxes(page);
      assert.deepEqual(hidden.map((b) => [b.cls, b.text, b.whole, b.lines, b.oneRow, b.below, b.inside, b.wide]),
        links.map((l, i) => ['link-full link-masked', '•'.repeat(l.length), true, want[i], width > 400, true, true, true]), what);
      if (before) assert.deepEqual(before.map((b) => [b.cls, b.text, Math.round(b.height)]), hidden.map((b) => ['link-full', '', Math.round(b.height)]), `${what}: before Generate`);
      // (on a phone the four buttons wrap to two rows, still below the box)
      if (width <= 400) for (const b of hidden) assert.equal(b.below, true, what);
      // shown: the whole link, as tall as before
      for (const f of ['link', 'edit-link']) await page.click(`.dlg-overlay .link-field:has([data-field="${f}"]) .link-show`);
      const shown = await boxes(page);
      assert.deepEqual(shown.map((b) => [b.cls, b.text, b.whole, b.lines, b.wide]), links.map((l, i) => ['link-full', l, true, want[i], true]), what);
      assert.equal(await page.eval(() => document.documentElement.scrollWidth <= innerWidth), true, `${what}: no horizontal scroll`);
      // hidden again
      for (const f of ['link', 'edit-link']) await page.click(`.dlg-overlay .link-field:has([data-field="${f}"]) .link-show`);
      assert.deepEqual((await boxes(page)).map((b) => [b.cls, b.whole]), [['link-full link-masked', true], ['link-full link-masked', true]], what);
      await page.dialogButton('Close');
      await page.waitNoDialog();
      // a copy's link laid out as Live's (#4612): the same field, box and row of buttons
      if (!module) {
        await page.eval(() => { window.__copied = import('/js/link-copy.js').then((m) => m.copyLinkDialog()); });
        await page.waitDialog('Share Project');
        const copy = await layout(page);
        assert.deepEqual({ ...copy, buttons: copy.buttons.slice(1) }, { ...liveLayout, buttons: liveLayout.buttons.slice(1) }, `${what}: a copy's`);
        assert.deepEqual([copy.cls, copy.buttons[0][0], copy.buttons[0][1]], ['link-field link-row', 'btn link-generate', liveLayout.buttons[0][1]], `${what}: a copy's`);
        await page.dialogButton('Close');
        await page.waitNoDialog();
      }
    }
    await page.eval(async () => (await import('/js/collab-share.js')).stopSharing());
  } finally { await page.setViewport(1400, 900); }
  assert.deepEqual(await warnings(page), []);
  assert.deepEqual(page.errors, []);
}, { timeout: 120000 });

// Share Project…'s window, its place and size on the screen (#4617)
const windowBox = (page) => page.eval(() => { const r = [...document.querySelectorAll('.dlg-overlay .dlg')].pop().getBoundingClientRect(); return [r.left, r.top, r.width, r.height].map((v) => Math.round(v)); });
// (the other way's window opens once it is ready, a copy's once the project is encoded: the old one, its way's radio
// checked by the click, waited out first, #4656)
const switchTo = async (page, how) => {
  await page.eval(() => { document.querySelector('.dlg-overlay').dataset.switchedFrom = '1'; });
  await page.click(`.dlg-overlay input[data-field="how-${how}"]`);
  await page.waitFor((x) => document.querySelectorAll('.dlg-overlay').length === 1 && !document.querySelector('.dlg-overlay[data-switched-from]') && document.querySelector(`.dlg-overlay input[data-field="how-${x}"]`)?.checked, [how], { what: `${how} chosen` });
};

uiTest('#4617 Share Project: the window keeps its place and size switching between A copy and Live, on Start Sharing and on Generate; on a phone too', E, async (page) => {
  await make(page, 'samesize', 'gates');
  await page.openProject('samesize');
  await page.eval(() => localStorage.setItem('silinx.collab.name', 'Teacher'));
  try {
    for (const width of [1400, 375]) {
      await page.setViewport(width, 900);
      await page.eval(async () => { (await import('/js/share-how.js')).shareCopyDialog(); });
      await page.waitDialog('Share Project');
      const box = await windowBox(page), what = `${width} px`;
      // (as wide as the window allows on a phone, as tall as the screen allows)
      assert.equal(box[2], width > 800 ? 720 : Math.round(width * 0.96), what);
      const steps = [];
      const step = async (name) => steps.push([name, await windowBox(page)]);
      await switchTo(page, 'live'); await step('live');
      if (await page.eval(() => document.querySelector('.dlg-overlay .collab-links').hidden)) {
        await page.dialogButton('Start Sharing');
        await page.waitFor(() => !document.querySelector('.dlg-overlay .collab-links').hidden, [], { what: 'shared' });
      }
      await step('live, shared');
      for (const f of ['link', 'edit-link']) if (!await page.eval((x) => document.querySelector(`.dlg-overlay input[data-field="${x}"]`).value, f)) await gen(page, f);
      await step('live, its links generated');
      await switchTo(page, 'copy'); await step('a copy');
      await page.click('.dlg-overlay .link-generate');
      await page.waitFor(() => document.querySelector('.dlg-overlay .link-out').value || null, [], { what: 'the full link generated' });
      await step('a copy, its full link generated');
      await page.click('.dlg-overlay input[data-field="short"]'); await step('a copy, short link chosen');
      await switchTo(page, 'live'); await step('live again');
      await switchTo(page, 'copy'); await step('a copy again');
      assert.deepEqual(steps, steps.map(([n]) => [n, box]), what);
      assert.equal(await page.eval(() => document.documentElement.scrollWidth <= innerWidth), true, `${what}: no horizontal scroll`);
      await page.dialogButton('Close');
      await page.waitNoDialog();
    }
    await page.eval(async () => (await import('/js/collab-share.js')).stopSharing());
  } finally { await page.setViewport(1400, 900); }
  assert.deepEqual(await warnings(page), []);
  assert.deepEqual(page.errors, []);
}, { timeout: 120000 });

// #4668: Share Project… ▸ Live in three parts, a rule before each link's sentence (the viewers', the editors'): the
// name, the view-only link, the editors' link; each rule a thin line as wide as the window's content, a little space
// above and below; on a phone too. (The window's size across A copy and Live: #4617's test above.)
uiTest('#4668 Share Project, live: a rule before the view-only link\'s sentence and before the editors\', as wide as the window\'s content, spaced; on a phone too', E, async (page) => {
  await make(page, 'rules', 'gates');
  await page.openProject('rules');
  await page.eval(() => localStorage.setItem('silinx.collab.name', 'Teacher'));
  try {
    for (const width of [1400, 375]) {
      await page.setViewport(width, 900);
      await page.eval(() => { window.__shared = import('/js/collab-share.js').then((m) => m.shareProjectDialog()); });
      await page.waitDialog('Share Project');
      await page.dialogButton('Start Sharing');
      await page.waitFor(() => !document.querySelector('.dlg-overlay .collab-links').hidden, [], { what: 'shared' });
      const what = `${width} px`;
      const parts = await page.eval(() => {
        const links = document.querySelector('.dlg-overlay .collab-links');
        const body = links.closest('.dlg-body'), bs = getComputedStyle(body), content = body.getBoundingClientRect().width - parseFloat(bs.paddingLeft) - parseFloat(bs.paddingRight) - (body.offsetWidth - body.clientWidth);
        const kids = [...links.children].filter((e) => !e.hidden);
        // (what the window shows above the links: the first rule's space measured from it, its margin collapsing through theirs)
        let before = links.previousElementSibling;
        while (before && !before.getClientRects().length) before = before.previousElementSibling;
        return {
          order: kids.map((e) => (e.tagName === 'HR' ? 'rule' : e.className)),
          sentences: kids.filter((e, i) => kids[i - 1]?.tagName === 'HR').map((e) => e.textContent),
          rules: kids.filter((e) => e.tagName === 'HR').map((r) => {
            const b = r.getBoundingClientRect(), cs = getComputedStyle(r), i = kids.indexOf(r);
            const above = (kids[i - 1] ?? before).getBoundingClientRect().bottom, below = kids[i + 1].getBoundingClientRect().top;
            return { line: cs.borderTopStyle === 'solid' && parseFloat(cs.borderTopWidth) === 1 && b.height <= 2, wide: Math.abs(b.width - content) < 2, spaced: b.top - above >= 6 && below - b.bottom >= 6, visible: r.getClientRects().length > 0 };
          }),
        };
      });
      assert.deepEqual(parts.order, ['rule', 'collab-about', 'link-field link-row', 'rule', 'collab-edit-about', 'link-field link-row'], what);
      assert.deepEqual(parts.sentences, ['Anyone with this link follows "rules" live, read only, as long as you share it.', 'Anyone with the editors\' link edits its text files and drawings with you, live.'], what);
      assert.deepEqual(parts.rules, [{ line: true, wide: true, spaced: true, visible: true }, { line: true, wide: true, spaced: true, visible: true }], what);
      // (no sideways scroll on a phone)
      assert.equal(await page.eval(() => document.documentElement.scrollWidth <= innerWidth), true, what);
      await page.dialogButton('Stop Sharing');
      await page.waitFor(() => document.querySelector('.dlg-overlay .collab-links').hidden, [], { what: 'stopped' });
      await page.dialogButton('Close');
      await page.waitNoDialog();
    }
  } finally { await page.setViewport(1400, 900); }
  assert.deepEqual(await warnings(page), []);
  assert.deepEqual(page.errors, []);
}, { timeout: 120000 });

// #4669: Share Project… opens on A copy, after Live was chosen too; while the project is shared live, on Live, the way
// in use (its links, Stop Sharing); A copy again once stopped. (The Silinx site's three ways: collab-live-via.test.js.)
uiTest('#4669 Share Project… opens on A copy, but on Live while the project is shared live', E, async (page) => {
  await make(page, 'opensas', 'gates');
  await page.openProject('opensas');
  await page.eval(() => localStorage.setItem('silinx.collab.name', 'Teacher'));
  const opened = async (what) => {
    await page.menu('File', 'Share Project…');
    await page.waitDialog('Share Project');
    await page.waitFor(() => !!document.querySelector('.dlg-overlay input[name=share-how]:checked'), [], { what });
    return page.eval(() => ({ how: document.querySelector('.dlg-overlay input[name=share-how]:checked').value, buttons: [...document.querySelectorAll('.dlg-overlay .dlg-buttons button')].map((b) => `${b.textContent}${b.disabled ? ' (off)' : ''}`), links: !!document.querySelector('.dlg-overlay .collab-links:not([hidden])') }));
  };
  const close = async () => { await page.dialogButton('Close'); await page.waitNoDialog(); };
  assert.deepEqual(await opened('nothing shared'), { how: 'copy', buttons: ['Close'], links: false });
  // Live chosen in the window, not shared: the next time, A copy still
  await page.click('.dlg-overlay input[data-field="how-live"]');
  await page.waitFor(() => !!document.querySelector('.dlg-overlay .collab-dlg'), [], { what: 'Live\'s window' });
  await close();
  assert.deepEqual(await opened('Live chosen before'), { how: 'copy', buttons: ['Close'], links: false });
  // shared live: Live's window, its links and Stop Sharing
  await page.click('.dlg-overlay input[data-field="how-live"]');
  await page.waitFor(() => !!document.querySelector('.dlg-overlay .collab-dlg'), [], { what: 'Live\'s window' });
  await page.dialogButton('Start Sharing');
  await page.waitFor(() => !document.querySelector('.dlg-overlay .collab-links').hidden, [], { what: 'shared' });
  await close();
  assert.deepEqual(await opened('shared'), { how: 'live', buttons: ['Start Sharing (off)', 'Stop Sharing', 'Close'], links: true });
  await page.dialogButton('Stop Sharing');
  await page.waitFor(() => document.querySelector('.dlg-overlay .collab-links').hidden, [], { what: 'stopped' });
  await close();
  assert.deepEqual(await opened('stopped'), { how: 'copy', buttons: ['Close'], links: false });
  await close();
  assert.deepEqual(await warnings(page), []);
  assert.deepEqual(page.errors, []);
}, { timeout: 120000 });

// #4676: the switch between A copy and Live drawn with no frame between: recorded each frame (requestAnimationFrame) from
// the click until the other way's window has stayed: one window in every frame (never none, never two), the same box,
// the old way's frames then the new way's only; A copy's link box as tall from its first frame (fitted as it opens).
uiTest('#4676 Share Project: Live to A copy and back, one window in every frame, the same box, A copy whole from its first frame; on a phone too', E, async (page) => {
  await make(page, 'flicker', 'gates');
  await page.openProject('flicker');
  await page.eval(() => localStorage.setItem('silinx.collab.name', 'Teacher'));
  try {
    for (const width of [1400, 375]) {
      await page.setViewport(width, 900);
      await page.eval(async () => { (await import('/js/share-how.js')).shareLiveDialog(); });
      await page.waitDialog('Share Project');
      await page.waitFor(() => !!document.querySelector('.dlg-overlay .collab-dlg'), [], { what: 'Live\'s window' });
      // (#4712: the Share: row first, the way's sentence below it, A copy's and Live's the same number of lines, in
      // English and Portuguese)
      const same = async (what, way, text) => {
        const a = await shareAbout(page);
        assert.deepEqual([a.first, a.way, a.text], [true, way, text], what);
        assert.equal(a.lines.copy, a.lines.live, `${what}: ${JSON.stringify(a.lines)}`);
      };
      await same(`Live, ${width} px`, 'live', LIVE_ABOUT);
      checkFrames(await framesOf(page, 'how-copy', 'copy'), 'live', 'copy', `Live to A copy, ${width} px`);
      await same(`A copy, ${width} px`, 'copy', COPY_ABOUT);
      await page.eval(async () => (await import('/js/i18n.js')).setLanguage('pt'));
      try {
        await page.waitFor(() => /^Uma ligação que abre o projeto no Silinx/.test(document.querySelector('.dlg-overlay .share-about > p[data-way=copy]')?.textContent || ''), [], { what: 'Portuguese' });
        await same(`A copy, ${width} px, Portuguese`, 'copy', COPY_PT);
        checkFrames(await framesOf(page, 'how-live', 'live'), 'copy', 'live', `A copy to Live, ${width} px, Portuguese`);
        await same(`Live, ${width} px, Portuguese`, 'live', LIVE_PT);
        checkFrames(await framesOf(page, 'how-copy', 'copy'), 'live', 'copy', `Live to A copy, ${width} px, Portuguese`);
      } finally { await page.eval(async () => (await import('/js/i18n.js')).setLanguage('en')); }
      checkFrames(await framesOf(page, 'how-live', 'live'), 'copy', 'live', `A copy to Live, ${width} px`);
      await page.dialogButton('Close');
      await page.waitNoDialog();
    }
  } finally { await page.setViewport(1400, 900); }
  assert.deepEqual(await warnings(page), []);
  assert.deepEqual(page.errors, []);
}, { timeout: 120000 });
