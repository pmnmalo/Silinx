// UI: how a live share reaches each follower (#4643), in the Collaboration tab's Sharing box, in both interfaces: the
// share's mode at the top (Live via your Cloudflare relay, Share Project… ▸ Live's choice, #4634), and beside each
// follower its path, P2P or Relay, with its tip: the Silinx site's page hosts the project, its followers met at the relay
// (#4543): Rui's page connects to it directly (WebRTC: through the relay first, P2P once the channel is open), Eva's has
// no WebRTC (as on a network that lets no direct path through: through the relay all along); no console line about
// their paths (each follower's arrival only); in Portuguese. (A Silinx server's relay, and a long list folded:
// test/ui/collab-tab.test.js.) The relay is Silinx's (server/collab-relay.js) on this computer, the site built with it
// among its relays. No warnings.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { setupUi, uiTest, chromeOnly } from './harness.js';
import { buildSite } from './site-lib.js';
import { attachRelay } from '../../server/collab-relay.js';

const KEY = 'a-relay-key-of-24-characters-or-more';
let env, site, relay, srv, relayBase;
before(async () => {
  env = await setupUi({ server: false });
  if (env.skip) return;
  srv = http.createServer();
  relay = attachRelay(srv, { tokenOk: t => t === KEY });
  await new Promise(r => srv.listen(0, '127.0.0.1', r));
  relayBase = `http://127.0.0.1:${srv.address().port}`;
  site = await buildSite(env.tmp, { relays: [relayBase] });
});
after(async () => { relay?.close(); srv?.closeAllConnections?.(); if (srv) await new Promise(r => srv.close(r)); site?.close?.(); await env?.teardown?.(); });
const E = () => (site?.skip ? { skip: site.skip } : env);
const re = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const boot = async (page) => {
  await page.goto(`${site.url}index.html`);
  await page.waitFor(() => window.SilinxApp && document.querySelector('#menubar .item') && window.Silinx?.startupChecked, [], { what: 'site boot', timeout: 60000 });
  // (no STUN server: this computer's own addresses)
  await page.eval(() => { for (const k of ['silinx.collab.stun', 'silinx.dev.collab.stun']) localStorage.setItem(k, '[]'); });
};
const newProject = async (page, name) => {
  await page.menu('File', 'New Project…');
  await page.waitDialog('New Project Wizard');
  await page.fill('.dlg-overlay .wiz-main input[type=text]', name);
  await page.fill('.dlg-overlay .wiz-main select', 'gates', { index: 0 });
  await page.dialogButton('Next >');
  await page.fill('.dlg-overlay .wiz-main select', 'basys2', { index: 0 });
  await page.dialogButton('Next >');
  await page.dialogButton('Finish');
  await page.waitNoDialog();
  await page.waitFor((n) => window.Silinx.project?.name === n && window.Silinx.project.top, [name]);
};
// View ▸ Language's item run, from the menus' definitions (either interface's; the site's modules bundled: none imported)
const language = (page, name) => page.eval((n) => {
  const find = (items) => {
    for (const it of Array.isArray(items) ? items : []) {
      if (!it || typeof it !== 'object') continue;
      let sub = typeof it.submenu === 'function' ? it.submenu() : it.submenu || it.items;
      if (typeof sub === 'function') sub = sub();
      if (it.label === 'Language') return (sub || []).find((x) => x.label === n);
      const r = find(sub);
      if (r) return r;
    }
    return null;
  };
  const item = find(window.SilinxApp.S.menus);
  if (!item) throw new Error('no View ▸ Language');
  item.action();
}, name);
const warnings = async (page) => (await page.consoleText()).split('\n').map((l) => l.trim()).filter((l) => /^(WARNING|AVISO|ERROR|ERRO)/.test(l));
// the Sharing box: its entries' texts (a badge, a name, a role, a path), each path tag's [text, tip]
const sharing = (page) => page.eval(() => {
  const b = document.querySelector('#collab-page .collab-live');
  return {
    entries: [...b.querySelectorAll('.entry')].map((e) => [...e.childNodes].filter((n) => !n.classList?.contains('ico')).map((n) => n.textContent).filter(Boolean).join(' ')),
    tags: [...b.querySelectorAll('.collab-peer .collab-path')].map((t) => [t.textContent, t.title, t.dataset.path]),
    mode: b.querySelector('.collab-mode')?.dataset.mode ?? null,
  };
});
const waitEntries = (page, entries, what) => page.waitFor((en) => {
  const b = document.querySelector('#collab-page .collab-live');
  return !!b && JSON.stringify([...b.querySelectorAll('.entry')].map((e) => [...e.childNodes].filter((n) => !n.classList?.contains('ico')).map((n) => n.textContent).filter(Boolean).join(' '))) === JSON.stringify(en);
}, [entries], { what, timeout: 30000 }).catch(async (e) => { assert.deepEqual((await sharing(page)).entries, entries, e.message); throw e; });
// a follower's page: the link opened, its name given, the project followed
const follow = async (link, name, { rtc = true } = {}) => {
  const fp = await env.newPage(`${site.url}index.html`);
  // (no WebRTC in this page: its path through the relay, as on a network that lets no direct one through)
  if (!rtc) await fp.send('Page.addScriptToEvaluateOnNewDocument', { source: 'delete window.RTCPeerConnection; delete window.webkitRTCPeerConnection;' });
  await boot(fp);
  await fp.goto(`${site.url}index.html?f=${name}${new URL(link).hash}`);
  await fp.waitDialog('Follow a Shared Project');
  await fp.fill('.dlg-overlay input[data-field=name]', name);
  await fp.dialogButton('Follow');
  await fp.waitFor(() => window.Silinx?.project?.name === 'Paths' && window.Silinx.startupChecked, [], { what: `${name} following`, timeout: 30000 });
  return fp;
};

const OWNER = ['Share a Copy…', 'Copy View Link', 'Copy Editor Link', 'Add a User…', 'Stop Sharing'];
const P2P_TIP = 'Peer to peer: directly between your browsers';
const RELAY_TIP = 'Through your Cloudflare relay: no direct path; counts against its free plan';

uiTest('#4643 the Collaboration tab while sharing: the mode at the top; each follower P2P or Relay, with its tip, live as its path changes; no console line for it; in Portuguese', E, async (page) => {
  await boot(page);
  await page.eval((a, k) => { localStorage.setItem('silinx.collab.relay', JSON.stringify({ address: a, key: k })); localStorage.setItem('silinx.collab.name', 'Ana'); dispatchEvent(new CustomEvent('silinx:relay-changed')); }, relayBase, KEY);
  await newProject(page, 'Paths');
  await page.menu('File', 'Share Project…');
  await page.waitDialog('Share Project');
  if (!await page.eval(() => document.querySelector('.dlg-overlay input[data-field=how-live]')?.checked)) await page.click('.dlg-overlay input[data-field=how-live]');
  await page.waitFor(() => document.querySelector('.dlg-overlay input[name=share-via]:checked')?.value === 'relay', [], { what: 'the Cloudflare relay chosen' });
  await page.dialogButton('Start Sharing');
  const link = await page.waitFor(() => (document.querySelector('.dlg-overlay .link-field:has([data-field=link]) .link-generate:not(:disabled)')?.click(), document.querySelector('.dlg-overlay input[data-field=link]')?.value) || null, [], { what: 'the link' });
  await page.dialogButton('Close');
  await page.waitNoDialog();
  await page.leftTab('collab');
  // the mode at the top, before anyone follows
  const MODE = 'Live via your Cloudflare relay';
  await waitEntries(page, [MODE, 'Sharing', 'A Ana you', ...OWNER], 'shared, nobody in');
  assert.equal((await sharing(page)).mode, 'cloudflare');
  const before = (await page.consoleText()).split('\n').length;
  const rui = await follow(link, 'Rui');
  const eva = await follow(link, 'Eva', { rtc: false });
  try {
    // Rui: P2P once his channel is open; Eva: through the relay
    await waitEntries(page, [MODE, 'Sharing (2)', 'A Ana you', 'E Eva ViewerEditor Relay', 'R Rui ViewerEditor P2P', 'Share a Copy…', ...OWNER.slice(1)], 'Rui P2P, Eva through the relay');
    assert.deepEqual((await sharing(page)).tags, [['Relay', RELAY_TIP, 'relay'], ['P2P', P2P_TIP, 'p2p']]);
    // (the relay saw Rui's path switch: its meeting point carried the signalling, then the switch)
    assert.equal([...relay.meetings.values()][0].peers.size, 2);
    // no console line about their paths: the arrivals only
    const added = (await page.consoleText()).split('\n').slice(before).map((l) => l.trim()).filter(Boolean);
    assert.deepEqual(added.sort(), ['Eva follows your project "Paths".', 'Rui follows your project "Paths".']);
    // in Portuguese: the mode, the tags and their tips
    await language(page, 'Português');
    try {
      await page.waitFor(() => document.querySelector('#collab-page .collab-mode')?.textContent === 'Em direto pelo seu retransmissor Cloudflare', [], { what: 'the mode in Portuguese' });
      await page.waitFor(() => [...document.querySelectorAll('#collab-page .collab-path')].map((t) => t.textContent).join() === 'Retransmissor,P2P', [], { what: 'the tags in Portuguese' });
      assert.deepEqual((await sharing(page)).tags, [
        ['Retransmissor', 'Através do seu retransmissor Cloudflare: sem caminho direto; conta para o seu plano gratuito', 'relay'],
        ['P2P', 'Ponto a ponto: diretamente entre os vossos navegadores', 'p2p']]);
    } finally { await language(page, 'English'); }
    // Eva leaves: gone from the list, Rui still P2P
    await eva.close();
    await waitEntries(page, [MODE, 'Sharing (1)', 'A Ana you', 'R Rui ViewerEditor P2P', 'Share a Copy…', ...OWNER.slice(1)], 'Eva gone');
    assert.deepEqual(await warnings(rui), []);
    assert.deepEqual(rui.errors, []);
  } finally { await rui.close(); await eva.close().catch(() => {}); }
  // Stop Sharing from the tab: the mode gone
  await page.eval(() => [...document.querySelectorAll('#collab-page .collab-live .entry a')].find((a) => a.textContent === 'Stop Sharing').click());
  await page.waitFor(() => !document.querySelector('#collab-page .collab-mode') && !!document.querySelector('#collab-page .collab-live'), [], { what: 'the mode gone once stopped' });
  assert.deepEqual(await warnings(page), []);
  assert.deepEqual(page.errors, []);
}, { url: () => 'about:blank', timeout: 240000, skip: chromeOnly });
