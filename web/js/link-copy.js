// Share Project… and Share Module…'s copy (#2826, #3628, #3698: web/js/share-how.js): the link that opens the project
// in Silinx (for lecture slides), the whole project inside it
// (core/design-link.js encodeDesign), and what it opens: the project only, Try it (a schematic's), the simulation (the
// test bench), the board emulator; the module; the current view (#2886). The link is made as the choices change, its
// length with it, made by Generate and hidden (#3995, #4073, link-field.js: Generate, Copy, Show, Show QR Code); one too large for a link (a zip hosted
// elsewhere then) or a view the design does not have is said in the dialog, each copy in the console. Anyone with the
// link has the whole project, its comments too: the window says so first (#2829). The link is the full one (the project
// inside it) or a short one (#3223, core/gist-link.js): the project encrypted here and saved as a secret gist of the
// user's GitHub account by Generate (a choice changed: Generate again, the same gist for the same expiry), its key in the link; the account and the project's repository said (#3995); with
// no GitHub sign-in (the browser edition's) or token (a server's GH_TOKEN), the dialog offers the sign-in, or the full
// link. (A link that opens a guided lab, #3179, is the MCP's project_link's: the window has no Lab row, #3995.)
import { api } from './api.js';
import { h, dialog } from './ui.js';
import { S, app } from './app.js';
import { writeClip } from './clipboard.js';
import { LINK_LIMITS, encodeDesign, encodeUi, makeLink, viewProblem } from '/core/design-link.js';
import { currentViewState } from './view-state.js';
import { layoutNow } from './tasks.js';
import { browserCodec, textOf } from '/core/zip.js';
import { gateZip } from '/core/import-gate.js';
import { ANCESTOR_FILE } from '/core/project-rev.js';
import { naturalCompare } from '/core/hier-order.js';
import { EXPIRY_DAYS } from '/core/gist-link.js';
import { rememberLink, shortLinksDialog } from './short-links.js';
import { linkField } from './link-field.js';
import { QR_MAX_BYTES, qrSvg } from '/core/qr.js';
import { howRow, shareTitle } from './share-how.js';

const VIEWS = [['', 'Open the project only'], ['try', 'Try it (a drawing\'s simulation)'], ['simulate', 'Simulation'], ['emulate', 'Board Emulator']];
/** The address of this app, the base of its links (its hash, a token or a link, left out). */
const linkBase = () => location.origin + location.pathname;

/** Share Project…'s window, a copy of the open project (Share Module…: module and view chosen first, a module's
 *  context menu). Resolves, once closed, to the link last copied, or null (or the live window's, the way switched). */
export async function copyLinkDialog({ module = null, view = null } = {}) {
  if (!S.project) return null;
  const name = S.project.name;
  const action = shareTitle(module);   // (the window's title, its messages' name, #3698)
  let entries;
  // (a copy given out: its origin in the link, its ancestor kept by the project, not carried by the link, too large: #4205)
  try { entries = (await gateZip(new Uint8Array(await (await api.exportZip(name, 'silinx', { copy: true })).blob.arrayBuffer()), browserCodec())).files.filter(e => e.path !== ANCESTOR_FILE); } catch (e) { app.log(`ERROR: ${action}: ${e.message}`, 'err'); return null; }
  const files = Object.fromEntries(entries.filter(e => e.path !== 'silinx.json').map(e => [e.path, textOf(e)]));
  let design = null, encodeError = null;
  try { design = (await encodeDesign(entries)).design; } catch (e) { encodeError = e.message; }
  // the Module list follows Open in (#2878): the simulation's, the test benches (the project's first); the others', the
  // design's modules (its top first), no test bench
  const pj = S.project;
  const benches = [...new Set([pj.simTop, ...(S.modules || []).filter(m => m.role === 'sim').map(m => m.name).sort(naturalCompare)].filter(Boolean))];
  const designMods = [...new Set([pj.top, ...(S.modules || []).filter(m => m.role !== 'sim').map(m => m.name)].filter(Boolean))];
  const viewSel = h('select', { 'data-field': 'view' }, ...VIEWS.map(([v, l]) => h('option', { value: v, selected: v === (view || '') }, l)));
  const modSel = h('select', { 'data-field': 'module' });
  // (a test bench given, from the Simulation hierarchy's menu: the simulation, that test bench chosen, #2883)
  const givenBench = module && benches.includes(module) ? module : null;
  if (givenBench && !view) viewSel.value = 'simulate';
  let chosen = { design: givenBench ? pj.top : module || pj.top, bench: givenBench || pj.simTop };
  const isSim = () => viewSel.value === 'simulate';
  // (the board emulator emulates the top module, its pins the constraints': the list disabled on it, #2884)
  const isEmu = () => viewSel.value === 'emulate';
  const fillModules = () => {
    const [list, sel, mark, tag] = isSim() ? [benches, chosen.bench, pj.simTop, 'the project\'s'] : [isEmu() ? designMods.slice(0, 1) : designMods, isEmu() ? pj.top : chosen.design, pj.top, 'top'];
    modSel.replaceChildren(...list.map(m => h('option', { value: m, selected: m === sel }, m === mark ? `${m} (${tag})` : m)));
    modSel.disabled = isEmu() || (!viewSel.value && !module);
  };
  fillModules();
  const info = h('div', { class: 'hint link-info' });
  const err = h('div', { class: 'wiz-error link-error' });
  // (where a short link is made, #3995: the GitHub account, the project's repository, private or public)
  const account = h('div', { class: 'hint link-account' });
  // Silinx as it is now (#2886): the open tabs, the one in front, the split, the panels, the task
  const ui = encodeUi(currentViewState(), layoutNow());
  const withView = h('input', { type: 'checkbox', 'data-field': 'ui', checked: true });
  // the link's form: full, or short (a gist, made by Generate)
  const short = h('input', { type: 'radio', name: 'link-form', value: 'short', 'data-field': 'short' });
  const full = h('input', { type: 'radio', name: 'link-form', value: 'full', checked: true, 'data-field': 'full' });
  const signIn = h('a', { href: '#', class: 'link-signin', style: { display: 'none' }, onclick: async e => { e.preventDefault(); if (await (await import('./git-signin.js')).signInDialog()) { said = null; update(); } } }, 'Sign in with GitHub…');
  // (a short link's expiry, #3629: core/gist-link.js EXPIRY_DAYS; the full link's never)
  const EXPIRY = { 0: 'Never', 7: 'In a week', 30: 'In a month', 182: 'In six months', 365: 'In a year' };
  const expiry = h('select', { 'data-field': 'expires', disabled: true }, ...EXPIRY_DAYS.map(d => h('option', { value: String(d) }, EXPIRY[d])));
  let link = null, opts = null, made = null, madeFor = null, saidLong = false, manage = false, closeIt = null, copied = null, said = null;
  const shortLink = () => makeLink(linkBase(), { gist: `${made.id}.${made.key}`, ...opts });
  // (the link, hidden, made by Generate only, #3995, #4073: Generate, Copy, Show, Show QR Code)
  const field = linkField({ field: 'link', onCopy: l => copyNow(l), generate: () => generated() });
  // the link the choices give, made: the full one (its length said; one too long for a QR code, said once), or the short
  // one (its gist made now, or the one made for this expiry); null: not made, said
  const generated = async () => {
    if (!link) return null;
    if (short.checked) return (await makeShort()) ? shortLink() : null;
    if (!qrSvg(link) && !saidLong) {
      saidLong = true;
      app.log(`${action}: the link of '${name}' is ${link.length} characters, too long for a QR code (at most ${QR_MAX_BYTES}): the short link has one.`, 'info');
    }
    info.textContent = link.length > LINK_LIMITS.slides
      ? `${link.length} characters: some slide tools cut a link longer than ${LINK_LIMITS.slides} (export the project as a .zip, host it, and link to it with #open=).`
      : `${link.length} characters.`;
    return link;
  };
  // the short link's gist, made now (with the browser's sign-in, or the server's token); false: why not, said
  const makeShort = async () => {
    if (made && madeFor === expiry.value) return true;
    if (!await api.gistAvailable()) {
      err.textContent = api.standalone ? 'A short link needs your GitHub sign-in: sign in, or choose the full link.' : 'A short link needs a GitHub token on the Silinx server (GH_TOKEN): choose the full link, or start the server with one.';
      if (api.standalone) signIn.style.display = '';
      return false;
    }
    try {
      made = await api.gistSave(design, Number(expiry.value));
      madeFor = expiry.value;
      rememberLink({ id: made.id, link: shortLink(), project: name, expires: made.expires || null });   // (Short Links…, #3635)
      app.log(`${action}: the short link of '${name}' made (the project in a secret gist of your GitHub account${made.expires ? `, until ${made.expires.slice(0, 10)}` : ''}).`, 'ok');
      if (made.deleted) app.log(`${action}: ${made.deleted} expired short link${made.deleted > 1 ? 's' : ''} deleted from your gists.`, 'info');
      return true;
    } catch (e) { err.textContent = e.hint ? `${e.message}: ${e.hint}` : e.message; return false; }
  };
  // the account and the repository, read once (said again after a sign-in)
  const sayAccount = async () => {
    if (said) return;
    said = api.gistAvailable().then(async ok => {
      if (!ok || !api.gistAccount) return '';
      const a = await api.gistAccount(name);
      const where = !a.repository ? 'the project is in no GitHub repository' : `the project is in the repository ${a.repository} (${a.private === true ? 'private' : a.private === false ? 'public' : 'not seen with this sign-in'})`;
      return `Signed in to GitHub as ${a.login || '?'}; ${where}.`;
    }).catch(() => '');
    const text = await said;
    if (short.checked) account.textContent = text;
  };
  // a link copied: said in the console (its length; a short one's gist), kept as the window's result
  const copyNow = l => {
    writeClip('text', l);
    copied = l;
    if (short.checked) {
      rememberLink({ id: made.id, link: l, project: name, expires: made.expires || null });   // (the link as copied: its view)
      app.log(`${action}: the short link of '${name}' copied, ${l.length} characters (the project in a secret gist of your GitHub account${made?.expires ? `, until ${made.expires.slice(0, 10)}` : ''}).`, 'ok');
      return;
    }
    app.log(`${action}: the link of '${name}'${viewSel.value ? ` (${VIEWS.find(([v]) => v === viewSel.value)[1]}, ${modSel.value})` : ''} copied, ${l.length} characters.`, 'ok');
    if (l.length > LINK_LIMITS.slides) app.log(`WARNING: ${action}: the link is ${l.length} characters long: some slide tools cut a link longer than ${LINK_LIMITS.slides}.`, 'warn');
  };
  const update = () => {
    expiry.disabled = !short.checked;
    link = null;
    field.set(null);
    info.textContent = ''; err.textContent = ''; account.textContent = '';
    if (encodeError) { err.textContent = encodeError; return; }
    // (the module: in the link when it is not the project's top, or when the link is a module's: Share Module
    // Copy…, the project then opened on it, #2871; a test bench when it is not the project's, #2878)
    // (Open the project only, from the project's Share Project…: no module, the project opened with no source in
    // front, #3230; a module's Share Module… keeps its module, #2871)
    const top = !modSel.value || isEmu() || (!viewSel.value && !module) ? null : isSim() ? (givenBench || modSel.value !== pj.simTop ? modSel.value : null) : ((module && !givenBench) || modSel.value !== pj.top ? modSel.value : null);
    const problem = viewProblem(S.project, files, { view: viewSel.value || null, top });
    if (problem) { err.textContent = `${problem[0].toUpperCase()}${problem.slice(1)}.`; return; }
    opts = { view: viewSel.value || null, top, ui: withView.checked ? ui : null };
    link = makeLink(linkBase(), { design, ...opts });
    signIn.style.display = 'none';
    if (short.checked) {
      info.textContent = 'A short link, about 140 characters: the project encrypted in this browser and saved as a secret gist of your GitHub account when you generate it; only the link opens it. Your links are your gists, which you list and delete on GitHub.';
      sayAccount();
    }
  };
  viewSel.addEventListener('change', () => { fillModules(); update(); });
  short.addEventListener('change', update);
  expiry.addEventListener('change', update);
  full.addEventListener('change', update);
  withView.addEventListener('change', update);
  modSel.addEventListener('change', () => { if (!isEmu()) chosen = { ...chosen, [isSim() ? 'bench' : 'design']: modSel.value }; update(); });
  update();
  // (a copy, or live: the window's Share: row, #3698, below what the window does, #3995)
  const how = howRow('copy', { module, view, close: () => closeIt?.() });
  await dialog({
    title: action, width: 720,
    onOpen: ({ close }) => { closeIt = () => close(null); },
    body: h('div', {},
      h('div', { class: 'hint' }, `A link that opens '${name}' in Silinx, for slides or a message: the whole project is inside the link (no file to host). Anyone with the link has every file of the project, its comments too.`),
      how.el,
      h('div', { class: 'form-grid', style: { marginTop: '10px' } },
        h('label', {}, 'Open in:'), viewSel,
        h('label', {}, 'Module:'), modSel,
        h('label', {}, 'View:'), h('label', { class: 'link-ui' }, withView, h('span', {}, 'Include the current view: the open tabs, the split, the panels')),
        h('label', {}, 'Link:'), h('div', { class: 'link-forms' },
          h('label', { class: 'link-full' }, full, h('span', {}, 'Full link: the project inside it (needs nothing, but long)')), h('br'),
          h('label', { class: 'link-short' }, short, h('span', {}, 'Short link: the project encrypted in a secret gist of your GitHub account'))),
        h('label', {}, 'Expires:'), expiry),
      field.el, info, account, err, signIn,
      h('div', { class: 'link-manage' }, h('a', { href: '#', onclick: e => { e.preventDefault(); manage = true; closeIt?.(); } }, 'Manage short links…'))),
    buttons: [{ label: 'Close', primary: true, value: true }],
  });
  if (how.wanted) return how.switched();
  if (manage) { shortLinksDialog(); return null; }
  return copied;
}
