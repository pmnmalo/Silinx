// UI: Sign out of GitHub asks first (#4256, web/js/git-signin.js), in the browser edition: the site (test/ui/site-lib.js)
// with a stand-in for GitHub (test/fake-github.mjs), no network. Its dialog by how the user signed in: a pasted fine-grained
// personal access token (forgotten here, signing in again needs it or a new one, still valid on GitHub until deleted
// there: its page linked) or the device flow (sign in again with Sign in with GitHub…, the authorization kept on GitHub
// until revoked under Settings ▸ Applications: linked); Cancel the default button (Enter, Escape and Cancel keep the
// sign-in), Sign Out forgetting it; the console's exact lines, the token never in one; from the File menu and the
// Collaboration tab (a project open: no tabs with none, #4257); in Portuguese. Both interfaces; no warnings.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest } from './harness.js';
import { buildSite } from './site-lib.js';
import { fakeGitHub } from '../fake-github.mjs';

let env, site, gh;
before(async () => {
  env = await setupUi({ server: false });
  if (env.skip) return;
  gh = fakeGitHub({ interval: 1 });
  site = await buildSite(env.tmp, { route: (req, res, body) => gh.route('/fake-github')(req, res, body) });
});
after(async () => { site?.close?.(); await env?.teardown?.(); });
const E = () => (site?.skip ? { skip: site.skip } : env);

const TOKEN_WAY = 'REPLACE-ME-with-the-client-ID-of-Silinx-GitHub-OAuth-App';   // (the placeholder: a pasted token)
const boot = async (page, { clientId = gh.clientId } = {}) => {
  await page.goto(`${site.url}index.html`);
  await page.waitFor(() => window.SilinxApp && document.querySelector('#menubar .item') && window.Silinx?.startupChecked, [], { what: 'site boot', timeout: 60000 });
  await page.eval((u, id) => { window.SILINX_GITHUB = { api: u, login: u, clientId: id }; }, `${site.url}fake-github`, clientId);
};
// a project made with File ▸ New Project… (the Collaboration tab is a project's: no tabs with none, #4257)
const L = { en: ['New Project Wizard', 'Next >', 'Finish'], pt: ['Assistente de Novo Projeto', 'Seguinte >', 'Concluir'] };
const newProject = async (page, name, lang = 'en') => {
  const [wizard, next, finish] = L[lang];
  // (File ▸ New Project…, by the menu's own item: its labels the same in either language)
  await page.eval(() => { window.SilinxApp.S.menus.find((m) => m.label === 'File').items().find((x) => x?.label === 'New Project…').action(); });
  await page.waitDialog(wizard);
  await page.fill('.dlg-overlay .wiz-main input[type=text]', name);
  await page.dialogButton(next);
  await page.dialogButton(next);
  await page.dialogButton(finish);
  await page.waitNoDialog();
  // (the wizard done: its toast, its last step, after the project opened and its Design page shown; a tab chosen before
  // it was left for Design)
  await page.waitFor((n) => window.Silinx.project?.name === n && [...document.querySelectorAll('.toast')].some((t) => t.textContent.includes(n)), [name], { what: `${name} made` });
};
const warnings = (page) => page.console.filter((c) => c.type === 'warning' || c.type === 'warn').map((c) => c.text);
const kept = (page) => page.eval(() => [sessionStorage.getItem('silinx.github-token'), localStorage.getItem('silinx.github-token'), sessionStorage.getItem('silinx.github-sign-in'), localStorage.getItem('silinx.github-sign-in')]);
// (clicked once the page is shown and holds still: with a project open it is drawn again as git's status comes, #4257)
const tabCommand = async (page, label) => {
  await page.waitFor((l) => {
    const now = document.getElementById('collab-page').innerHTML;
    const same = now === window.__collabLast && performance.now() - window.__collabSince > 300;
    if (now !== window.__collabLast) { window.__collabLast = now; window.__collabSince = performance.now(); }
    return same && [...document.querySelectorAll('#collab-page .entry a')].some((a) => a.textContent === l && a.getClientRects().length);
  }, [label], { what: `the Collaboration page still, with ${label}` });
  await page.click('#collab-page .entry a', { text: label });
};
const tabState = (page, text) => page.waitFor((t) => [...document.querySelectorAll('#collab-page .collab-github .entry.hint')].some((e) => e.textContent === t), [text], { what: text });
// the sign-out dialog as shown: its texts, its link, its buttons (the default one marked), the focused one
const shown = (page) => page.eval(() => {
  const d = [...document.querySelectorAll('.dlg-overlay')].pop();
  const a = d.querySelector('.git-sign-out-keep a');
  return {
    title: d.querySelector('.dlg-title span').textContent,
    forget: d.querySelector('.git-sign-out-forget').textContent,
    keep: d.querySelector('.git-sign-out-keep').textContent,
    link: [a.href, a.target, a.rel],
    buttons: [...d.querySelectorAll('.dlg-buttons .btn')].map((b) => b.textContent + (b.classList.contains('primary') ? ' (default)' : '')),
    focused: document.activeElement?.textContent,
  };
});
const TOKEN_TEXT = {
  title: 'Sign out of GitHub',
  forget: 'Silinx forgets the personal access token in this browser. Signing in again needs that token (keep a copy of it) or a new one.',
  keep: 'The token stays valid on GitHub until it is deleted there: https://github.com/settings/personal-access-tokens',
  link: ['https://github.com/settings/personal-access-tokens', '_blank', 'noopener noreferrer'],
  buttons: ['Sign Out', 'Cancel (default)'], focused: 'Cancel',
};
const DEVICE_TEXT = {
  title: 'Sign out of GitHub',
  forget: 'Silinx forgets the sign-in in this browser. You can sign in again at any time with Sign in with GitHub…',
  keep: 'Silinx\'s authorization stays on GitHub until it is revoked under Settings ▸ Applications: https://github.com/settings/applications',
  link: ['https://github.com/settings/applications', '_blank', 'noopener noreferrer'],
  buttons: ['Sign Out', 'Cancel (default)'], focused: 'Cancel',
};
const CANCELLED = 'Sign out of GitHub was cancelled: still signed in.';
const OUT_TOKEN = 'Signed out of GitHub: this browser no longer keeps the personal access token, which stays valid on GitHub until it is deleted at https://github.com/settings/personal-access-tokens.';
const OUT_DEVICE = 'Signed out of GitHub: this browser no longer keeps the sign-in, whose authorization stays on GitHub until it is revoked at https://github.com/settings/applications.';
// the console's lines from a mark on
const linesSince = async (page, mark) => (await page.consoleText()).slice(mark.length).split('\n').map((l) => l.replace(/^\[[\d:]+\]\s*/, '').trim()).filter(Boolean);

uiTest('#4256 Sign out of GitHub with a pasted token: asked first (Cancel the default: Enter, Escape, Cancel keep it), Sign Out forgets it, the console says it stays valid on GitHub', E, async (page) => {
  await boot(page, { clientId: TOKEN_WAY });
  await newProject(page, 'SignOut');
  await page.leftTab('collab');
  await tabCommand(page, 'Sign in with GitHub…');
  await page.waitDialog('Sign in with GitHub');
  await page.fill('.dlg-overlay .git-token', gh.token);
  await page.dialogButton('Sign In');
  await page.waitNoDialog();
  await tabState(page, 'Signed in to GitHub.');
  assert.deepEqual(await kept(page), [null, gh.token, null, 'token']);
  // asked: Enter (the default, Cancel), Escape, Cancel keep the sign-in
  let mark = await page.consoleText();
  for (const how of ['Enter', 'Escape', 'Cancel']) {
    await tabCommand(page, 'Sign out of GitHub');
    await page.waitDialog('Sign out of GitHub');
    assert.deepEqual(await shown(page), TOKEN_TEXT);
    if (how === 'Cancel') await page.dialogButton('Cancel'); else await page.key(how);
    await page.waitNoDialog();
  }
  await page.waitFor((m, n) => window.__console().slice(m.length).split(n).length === 4, [mark, CANCELLED], { what: 'three cancels' });
  assert.deepEqual(await linesSince(page, mark), [CANCELLED, CANCELLED, CANCELLED]);
  assert.deepEqual(await kept(page), [null, gh.token, null, 'token']);
  await tabState(page, 'Signed in to GitHub.');
  // Sign Out: forgotten, the tab offers the sign-in again
  mark = await page.consoleText();
  await tabCommand(page, 'Sign out of GitHub');
  await page.waitDialog('Sign out of GitHub');
  await page.dialogButton('Sign Out');
  await page.waitNoDialog();
  await page.waitConsole(new RegExp(OUT_TOKEN.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')));
  assert.deepEqual(await linesSince(page, mark), [OUT_TOKEN]);
  assert.deepEqual(await kept(page), [null, null, null, null]);
  await tabState(page, 'Not signed in to GitHub.');
  assert.ok(!(await page.consoleText()).includes(gh.token));
  assert.deepEqual(warnings(page), []);
}, { url: () => 'about:blank', timeout: 180000 });

uiTest('#4256 Sign out of GitHub after the device flow (File ▸ Git): its dialog says the authorization stays on GitHub, Settings ▸ Applications linked; Sign Out forgets it', E, async (page) => {
  await boot(page);
  await page.menu('File', 'New Project…');
  await page.waitDialog('New Project Wizard');
  await page.fill('.dlg-overlay .wiz-main input[type=text]', 'SignOutDev');
  await page.fill('.dlg-overlay .wiz-main select', 'gates', { index: 0 });
  await page.dialogButton('Next >');
  await page.dialogButton('Next >');
  await page.dialogButton('Finish');
  await page.waitNoDialog();
  await page.waitFor(() => window.Silinx.project?.name === 'SignOutDev', [], { what: 'SignOutDev open' });
  await page.menu('File', 'Sign in with GitHub…');
  await page.waitDialog('Sign in with GitHub');
  await page.dialogButton('Get a Code');
  await page.waitFor(() => /^WDJB-\d{4}$/.test(document.querySelector('.dlg-overlay .git-user-code')?.textContent || ''), [], { what: 'the code' });
  gh.authorize(await page.eval(() => document.querySelector('.dlg-overlay .git-user-code').textContent));
  await page.waitNoDialog({ timeout: 15000 });
  await page.waitConsole(/Signed in to GitHub: the sign-in is kept in this browser/);
  assert.deepEqual(await kept(page), [null, gh.token, null, 'device']);
  let mark = await page.consoleText();
  await page.menu('File', 'Sign out of GitHub');
  await page.waitDialog('Sign out of GitHub');
  assert.deepEqual(await shown(page), DEVICE_TEXT);
  await page.dialogButton('Cancel');
  await page.waitNoDialog();
  await page.waitConsole(/Sign out of GitHub was cancelled: still signed in\./);
  assert.deepEqual(await linesSince(page, mark), [CANCELLED]);
  assert.deepEqual(await kept(page), [null, gh.token, null, 'device']);
  mark = await page.consoleText();
  await page.menu('File', 'Sign out of GitHub');
  await page.waitDialog('Sign out of GitHub');
  await page.dialogButton('Sign Out');
  await page.waitNoDialog();
  await page.waitConsole(/Signed out of GitHub: this browser no longer keeps the sign-in, whose authorization/);
  assert.deepEqual(await linesSince(page, mark), [OUT_DEVICE]);
  assert.deepEqual(await kept(page), [null, null, null, null]);
  // (the menu offers the sign-in again)
  await page.menu('File', 'Sign in with GitHub…');
  await page.waitDialog('Sign in with GitHub');
  await page.dialogButton('Cancel');
  await page.waitNoDialog();
  assert.ok(!(await page.consoleText()).includes(gh.token));
  assert.deepEqual(warnings(page), []);
}, { url: () => 'about:blank', timeout: 180000 });

uiTest('#4256 Sign out of GitHub in Portuguese: the dialog of each way translated, the links as they are; a sign-in kept before its way was recorded: the edition\'s', E, async (page) => {
  await page.goto(`${site.url}index.html`);
  // (a pasted token kept)
  await page.eval((t) => { localStorage.setItem('silinx.lang', 'pt'); localStorage.setItem('silinx.github-token', t); localStorage.setItem('silinx.github-sign-in', 'token'); }, gh.token);
  try {
    await boot(page, { clientId: TOKEN_WAY });
    await page.waitFor(() => document.documentElement.lang === 'pt', [], { what: 'Portuguese' });
    await newProject(page, 'SignOutPt', 'pt');
    await page.leftTab('collab');
    const ask = async () => {
      await tabCommand(page, 'Terminar sessão no GitHub');
      await page.waitDialog('Terminar sessão no GitHub');
      return shown(page);
    };
    await tabState(page, 'Com sessão iniciada no GitHub.');
    assert.deepEqual(await ask(), {
      title: 'Terminar sessão no GitHub',
      forget: 'O Silinx esquece o token de acesso pessoal neste navegador. Para voltar a iniciar sessão é preciso esse token (guarde uma cópia dele) ou um novo.',
      keep: 'O token continua válido no GitHub até ser apagado lá: https://github.com/settings/personal-access-tokens',
      link: TOKEN_TEXT.link, buttons: ['Terminar Sessão', 'Cancelar (default)'], focused: 'Cancelar',
    });
    await page.dialogButton('Cancelar');
    await page.waitNoDialog();
    // the device flow's
    await page.eval(() => localStorage.setItem('silinx.github-sign-in', 'device'));
    const DEVICE_PT = {
      title: 'Terminar sessão no GitHub',
      forget: 'O Silinx esquece a sessão neste navegador. Pode voltar a iniciar sessão a qualquer momento com Iniciar sessão no GitHub…',
      keep: 'A autorização do Silinx continua no GitHub até ser revogada em Settings ▸ Applications: https://github.com/settings/applications',
      link: DEVICE_TEXT.link, buttons: ['Terminar Sessão', 'Cancelar (default)'], focused: 'Cancelar',
    };
    assert.deepEqual(await ask(), DEVICE_PT);
    await page.dialogButton('Cancelar');
    await page.waitNoDialog();
    // (one kept before its way was recorded: the edition's, here the device flow)
    await page.eval((id) => { localStorage.removeItem('silinx.github-sign-in'); window.SILINX_GITHUB.clientId = id; }, gh.clientId);
    assert.deepEqual(await ask(), DEVICE_PT);
    const mark = await page.consoleText();
    await page.dialogButton('Terminar Sessão');
    await page.waitNoDialog();
    await page.waitConsole(/Signed out of GitHub: this browser no longer keeps the sign-in, whose authorization/);
    assert.deepEqual(await linesSince(page, mark), [OUT_DEVICE]);
    assert.deepEqual(await kept(page), [null, null, null, null]);
    await tabState(page, 'Sem sessão iniciada no GitHub.');
  } finally {
    await page.eval(() => localStorage.removeItem('silinx.lang'));
  }
  assert.deepEqual(warnings(page), []);
}, { url: () => 'about:blank', timeout: 180000 });
