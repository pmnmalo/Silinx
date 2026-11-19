// UI: the Collaboration tab's messages under the console's Design filter (#4632, web/js/collab-log.js), in both
// interfaces: a process's header written last (its lines Implementation's), then, with Design picked, the tab's commands
// on a project opened from a local "GitHub" repository (SILINX_UI_GIT_REMOTES of test/ui/serve.js): Commit…, Push to
// GitHub, GitHub Checks (GitHub's answer mocked: a failed run, its ERROR in the Errors tab too), Share Live… and Stop
// Sharing; on the site (the browser edition), Check Cloudflare Relay (the real Worker on the Workers shim). Every one of
// their lines shown under Design, the header's hidden; the exact errors and warnings asserted.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { setupUi, uiTest, readWs, ROOT } from './harness.js';
import { buildSite } from './site-lib.js';
import { serveWorker } from '../workers-shim.js';
import worker, { RelayRoom } from '../../packages/silinx-relay-cloudflare/src/worker.js';

const KEY = 'a-relay-key-of-24-characters-or-more';
let env, tmp, remotes, site, relay;
const sh = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
// a bare repository on "GitHub", with blinky committed
function bare(name) {
  const dir = path.join(remotes, `${name}.git`);
  fs.mkdirSync(dir, { recursive: true });
  sh(dir, 'init', '--quiet', '--bare');
  sh(dir, 'symbolic-ref', 'HEAD', 'refs/heads/main');
  const work = path.join(tmp, 'seed', name);
  fs.cpSync(path.join(ROOT, 'examples', 'blinky'), work, { recursive: true });
  sh(work, 'init', '--quiet');
  sh(work, 'symbolic-ref', 'HEAD', 'refs/heads/main');
  sh(work, 'add', '-A');
  sh(work, 'commit', '--quiet', '-m', 'Starter');
  sh(work, 'push', '--quiet', dir, 'main');
  return dir;
}

before(async () => {
  tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'silinx-ui-collab-design-')));
  remotes = path.join(tmp, 'remotes');
  fs.writeFileSync(path.join(tmp, 'gitconfig'), '[user]\n\tname = Ana Aluna\n\temail = ana@example.com\n[init]\n\tdefaultBranch = main\n');
  Object.assign(process.env, { GIT_CONFIG_GLOBAL: path.join(tmp, 'gitconfig'), GIT_CONFIG_NOSYSTEM: '1', SILINX_UI_GIT_REMOTES: remotes });
  env = await setupUi();
  if (env.skip) return;
  relay = await serveWorker({ worker, env: { RELAY_KEY: KEY, ORIGINS: '' }, objects: { ROOMS: ctx => new RelayRoom(ctx, {}) } });
  site = await buildSite(env.tmp, { relays: [relay.url] });
  if (site?.url) relay.env.ORIGINS = new URL(site.url).origin;   // (the relay lets the site in)
});
after(async () => {
  site?.close?.();
  await relay?.close();
  await env?.teardown?.();
  delete process.env.SILINX_UI_GIT_REMOTES;
  fs.rmSync(tmp, { recursive: true, force: true });
});
const E = () => env;
const ES = () => (site?.skip ? { skip: site.skip } : env);

// the console's lines: [text, source, shown]
const consoleLines = (page) => page.eval(() => [...document.getElementById('console-log').children].filter((l) => l.textContent.trim())
  .map((l) => [l.textContent.trim(), l.dataset.src, !l.classList.contains('mc-off')]));
// the filter picked: Design
const pickDesign = async (page) => {
  await page.click('#mc-filters .filt[data-src=check]');
  assert.deepEqual(await page.eval(() => [...document.querySelectorAll('#mc-filters .filt')].filter((b) => b.getAttribute('aria-pressed') === 'true').map((b) => b.textContent)), ['Design']);
};
// a process run before (its header: the lines after it are its process's), then Design picked
const afterAProcess = async (page) => {
  await page.eval(() => window.SilinxApp.log('Started : "Synthesize - XST".'));
  await pickDesign(page);
  const hdr = (await consoleLines(page)).filter(([t]) => t === 'Started : "Synthesize - XST".');
  assert.deepEqual(hdr, [['Started : "Synthesize - XST".', 'impl', false]]);
};
// each line (a RegExp or its text) shown under Design; returns how many lines matched
async function underDesign(page, expected) {
  const re = expected instanceof RegExp ? expected : new RegExp(`^${expected.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`);
  await page.waitFor((src) => [...document.getElementById('console-log').children].some((l) => new RegExp(src).test(l.textContent.trim())), [re.source], { what: String(re) });
  const found = (await consoleLines(page)).filter(([t]) => re.test(t));
  assert.ok(found.length, String(re));
  assert.deepEqual(found.filter(([, src, shown]) => src !== 'check' || !shown), [], `${re}: not under Design`);
}
const tabCommand = (page, label) => page.click('#collab-page .entry a', { text: label });
const diags = (page, which) => page.eval((w) => [...document.querySelectorAll(`#console-${w} .diag`)].map((d) => d.textContent), which);

uiTest('#4632 the Collaboration tab\'s messages under Design: Commit…, Push to GitHub, GitHub Checks, Share Live…, Stop Sharing', E, async (page) => {
  bare('designlab');
  await page.menu('File', 'Open from GitHub Repository…');
  await page.waitDialog('Open from GitHub Repository');
  await page.fill('.dlg-overlay .git-url', 'https://github.com/test/designlab');
  await page.dialogButton('Open');
  await page.waitNoDialog();
  await page.waitFor(() => window.Silinx.project?.name === 'designlab' && document.querySelector('#hier .row'), [], { what: 'designlab open' });
  await underDesign(page, "Project 'designlab' opened from the GitHub repository test/designlab.");
  await afterAProcess(page);
  // Commit… and Push to GitHub, from the Collaboration tab
  await page.eval(async (t) => { const { api } = await import('/js/api.js'); await api.writeFile('designlab', 'src/counter.v', t); }, `${await readWs(env, 'designlab', 'src/counter.v')}// changed\n`);
  await page.waitFor(() => !!document.querySelector('#hier .git-mark'), [], { what: 'a mark' });
  await page.leftTab('collab');
  await tabCommand(page, 'Commit…');
  await page.waitDialog('Commit');
  await page.fill('.dlg-overlay .git-message', 'Counter changed');
  await page.dialogButton('Commit');
  await page.waitNoDialog();
  await underDesign(page, /^Committed [0-9a-f]{7} on main: 2 file\(s\)\.$/);
  await underDesign(page, 'src/counter.v (changed)');
  await page.leftTab('collab');
  await tabCommand(page, 'Push to GitHub');
  await underDesign(page, 'Pushed main to local/designlab.');
  await underDesign(page, 'GitHub runs the repository\'s checks on the push (a Classroom assignment\'s visible tests): Git ▸ GitHub Checks says their result.');
  // GitHub Checks: GitHub's answer mocked, a failed run (an ERROR line, in the Errors tab too)
  await page.eval(() => {
    const real = window.fetch;
    window.fetch = (url, o) => (/\/git\/checks$/.test(String(url))
      ? Promise.resolve(new Response(JSON.stringify({ commit: 'abcdef1234567', state: 'failure', conclusion: 'failure', runs: [{ name: 'Autograding', status: 'completed', conclusion: 'failure', title: '1 of 2 tests passed', annotations: [] }] }), { headers: { 'Content-Type': 'application/json' } }))
      : real(url, o));
  });
  await page.menu('File', 'GitHub Checks');
  await underDesign(page, 'GitHub\'s checks of \'designlab\'…');
  await underDesign(page, 'ERROR: Autograding: failure (1 of 2 tests passed) (commit abcdef1)');
  await page.waitFor(() => document.getElementById('err-count').textContent === '(1)', [], { what: 'the Errors tab\'s count' });
  assert.deepEqual(await diags(page, 'errors'), ['ERROR:Silinx - Autograding: failure (1 of 2 tests passed) (commit abcdef1)']);
  // Share Live… and Stop Sharing
  await page.leftTab('collab');
  await tabCommand(page, 'Share Live…');
  await page.waitDialog('Share Project');
  await page.fill('.dlg-overlay input[data-field=name]', 'Ana');
  await page.dialogButton('Start Sharing');
  await underDesign(page, 'Sharing project "designlab": anyone with its link follows it live, read only (Share Project… shows the link; Stop Sharing ends it).');
  await page.dialogButton('Close');
  await page.waitNoDialog();
  await page.leftTab('collab');
  await tabCommand(page, 'Stop Sharing');
  await underDesign(page, 'Stopped sharing "designlab": its followers no longer see it.');
  // the header's line still hidden; the lines after it that are not the collaboration's still its process's
  assert.deepEqual((await consoleLines(page)).filter(([t]) => t === 'Started : "Synthesize - XST".'), [['Started : "Synthesize - XST".', 'impl', false]]);
  // exact warnings and errors: none but the failed check
  assert.deepEqual(page.console.filter((c) => c.type === 'warning' || c.type === 'warn').map((c) => c.text), []);
  assert.deepEqual(await diags(page, 'warnings'), []);
  assert.deepEqual((await consoleLines(page)).filter(([t]) => /^(WARNING|ERROR)/.test(t)).map(([t]) => t), ['ERROR: Autograding: failure (1 of 2 tests passed) (commit abcdef1)']);
});

uiTest('#4632 the site\'s Check Cloudflare Relay under Design', ES, async (page) => {
  await page.goto(`${site.url}index.html`);
  await page.waitFor(() => window.SilinxApp && document.querySelector('#menubar .item') && window.Silinx?.startupChecked, [], { what: 'site boot', timeout: 60000 });
  await page.eval((r, k) => { for (const key of ['silinx.collab.relay', 'silinx.dev.collab.relay']) localStorage.setItem(key, JSON.stringify({ address: r, key: k })); }, relay.url, KEY);
  await page.goto(`${site.url}index.html`);
  await page.waitFor(() => window.SilinxApp && document.querySelector('#menubar .item') && window.Silinx?.startupChecked, [], { what: 'site boot', timeout: 60000 });
  await afterAProcess(page);
  await page.leftTab('collab');
  await tabCommand(page, 'Check Cloudflare Relay');
  await underDesign(page, `Relay: The relay at ${new URL(relay.url).host} answers, lets this site in and takes its key. Share Project… ▸ Live meets your followers there.`);
  assert.deepEqual((await consoleLines(page)).filter(([t]) => /^(WARNING|ERROR)/.test(t)).map(([t]) => t), []);
  assert.deepEqual(await diags(page, 'warnings'), []);
});
