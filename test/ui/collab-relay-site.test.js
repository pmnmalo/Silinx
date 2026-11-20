// UI: a live share of the Silinx site through a relay of the owner's settings (#4543), in both interfaces: Share
// Project… ▸ Live via your Cloudflare relay (#4634: the relay set in this browser's settings, as the Collaboration tab's
// Relay box sets it, chosen by default and shown by its address, the choice remembered); the page hosts the room, its followers met at the relay (#4542: directly when they can, through it otherwise), the link
// naming it (…host.<owner's key>&relay=…); the follower, in Portuguese, opens the link (the relay named, no public
// tracker), finds the owner and follows the project; a relay that is not one of the site's nor a Cloudflare Worker's
// refused, why said. The relay is Silinx's (server/collab-relay.js) on this computer, the site built with it among its
// relays (SILINX_SITE_RELAYS; a Cloudflare one: test/relay-cloudflare.test.js). No warnings but those asserted.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { setupUi, uiTest } from './harness.js';
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

const boot = async (page, pt = false) => {
  await page.goto(`${site.url}index.html`);
  await page.waitFor(() => window.SilinxApp && document.querySelector('#menubar .item') && window.Silinx?.startupChecked, [], { what: 'site boot', timeout: 60000 });
  // (no STUN server: this computer's own addresses; Portuguese for the follower)
  await page.eval((pt) => { for (const k of ['silinx.collab.stun', 'silinx.dev.collab.stun']) localStorage.setItem(k, '[]'); if (pt) localStorage.setItem('silinx.lang', 'pt'); }, pt);
};
const newProject = async (page, name, template) => {
  await page.menu('File', 'New Project…');
  await page.waitDialog('New Project Wizard');
  await page.fill('.dlg-overlay .wiz-main input[type=text]', name);
  await page.fill('.dlg-overlay .wiz-main select', template, { index: 0 });
  await page.dialogButton('Next >');
  await page.fill('.dlg-overlay .wiz-main select', 'basys2', { index: 0 });
  await page.dialogButton('Next >');
  await page.dialogButton('Finish');
  await page.waitNoDialog();
  await page.waitFor((n) => window.Silinx.project?.name === n && window.Silinx.project.top, [name]);
};
const warnings = async (page) => (await page.consoleText()).split('\n').map((l) => l.trim()).filter((l) => /^(WARNING|AVISO|ERROR|ERRO)/.test(l));
const live = async (page) => {
  await page.menu('File', 'Share Project…');
  await page.waitDialog('Share Project');
  // (#4640: Live via your Cloudflare relay, one of the Share: row's three)
  if (!await page.eval(() => document.querySelector('.dlg-overlay input[data-field=how-live-relay]')?.checked)) await page.click('.dlg-overlay input[data-field=how-live-relay]');
  await page.waitFor(() => !!document.querySelector('.dlg-overlay .collab-dlg .share-via'), [], { what: 'the live window, its way explained' });
};
// the relay set in this browser's settings, as the Collaboration tab's Relay box sets it (#4574)
const setRelay = (page, address, key) => page.eval((a, k) => { localStorage.setItem('silinx.collab.relay', JSON.stringify({ address: a, key: k })); dispatchEvent(new CustomEvent('silinx:relay-changed')); }, address, key);
// the live window's way chosen, the relay it shows, Start Sharing's state
const ways = (page) => page.eval(() => ({ via: document.querySelector('.dlg-overlay input[name=share-how]:checked')?.value, relay: document.querySelector('.dlg-overlay .share-via-at')?.textContent ?? null, start: !document.querySelector('.dlg-overlay .dlg-buttons button.primary')?.disabled }));

uiTest('#4543 Share Project… via your Cloudflare relay: the page hosts it, its followers meet it at the relay; the link names the relay; a follower in Portuguese follows; remembered; a relay not the site\'s refused', E, async (page) => {
  await boot(page);
  await setRelay(page, relayBase, KEY);
  await newProject(page, 'Shared', 'blinky');
  await live(page);
  const host = new URL(relayBase).host;
  // (#4634: the relay set, chosen by default, shown by its address; its key nowhere in the window)
  assert.deepEqual(await ways(page), { via: 'live-relay', relay: host, start: true });
  assert.equal(await page.eval((k) => document.querySelector('.dlg-overlay .dlg').innerHTML.includes(k), KEY), false);
  await page.fill('.dlg-overlay input[data-field=name]', 'Ana');
  await page.dialogButton('Start Sharing');
  const link = await page.waitFor(() => (document.querySelector('.dlg-overlay .link-field:has([data-field=link]) .link-generate:not(:disabled)')?.click(), document.querySelector('.dlg-overlay input[data-field=link]')?.value) || null, [], { what: 'the link' });
  await page.dialogButton('Close');
  await page.waitNoDialog();
  assert.match(link, new RegExp(`^${re(site.url)}(index\\.html)?#view=[A-Za-z0-9_-]{22}\\.[A-Za-z0-9_-]{43}\\.host\\.[A-Za-z0-9_-]{86}&owner=[A-Za-z0-9_-]{86}&relay=${re(encodeURIComponent(relayBase))}$`));
  await page.waitConsole(new RegExp(`^This page hosts the shared project: its followers meet it at the relay at ${re(host)}, then connect to it directly when they can, through the relay otherwise; it sees no file\\. It lasts while this page is open\\.$`, 'm'));
  await page.waitFor(() => true, []);
  assert.equal(relay.meetings.size, 1, 'the owner\'s page at the relay\'s meeting point');
  // the follower, in Portuguese: the relay named, no public tracker; the owner found, the project followed
  const fp = await env.newPage(`${site.url}index.html`);
  try {
    await boot(fp, true);
    await fp.goto(`${site.url}index.html?f=1${new URL(link).hash}`);
    await fp.waitDialog('Seguir um Projeto Partilhado');
    const lines = await fp.eval(() => [...document.querySelectorAll('.dlg-overlay .collab-dlg p')].map((p) => p.textContent));
    assert.ok(lines.includes(`Através do retransmissor em ${host}.`), lines.join(' | '));
    assert.ok(!lines.some((l) => /tracker/i.test(l)), lines.join(' | '));
    await fp.fill('.dlg-overlay input[data-field=name]', 'Rui');
    await fp.dialogButton('Seguir');
    await fp.waitFor(() => window.Silinx?.project?.name === 'Shared' && window.Silinx.startupChecked, [], { what: 'the project through the relay\'s meeting point', timeout: 30000 });
    await page.waitConsole(/^Rui follows your project "Shared"\.$/m);
    assert.equal([...relay.meetings.values()][0].peers.size, 1);
    assert.deepEqual(await warnings(fp), []);
    // (a relay that is neither the site's nor a Cloudflare Worker's: refused, why said)
    const other = link.replace(encodeURIComponent(relayBase), encodeURIComponent('https://relay.example.org'));
    await fp.goto(`${site.url}index.html?f=2${new URL(other).hash}`);
    await fp.waitFor(() => window.SilinxApp && window.Silinx?.startupChecked, [], { what: 'site boot' });
    const why = 'ERROR: Follow a shared project: the relay at relay.example.org is not among this Silinx\'s relays (the site\'s, set when it is built, or a Cloudflare Worker\'s, https://….workers.dev): not followed.';
    await fp.waitConsole(new RegExp(`^${re(why)}$`, 'm'));
    assert.deepEqual(await warnings(fp), [why]);
    assert.deepEqual(fp.errors, []);
  } finally { await fp.close(); }
  // stopped, then Share Project… again: the relay and the way remembered by this browser
  await page.eval(() => window.SilinxApp.stopSharing?.());
  await page.reload();
  await page.waitFor(() => window.SilinxApp && window.Silinx?.startupChecked, [], { what: 'site boot' });
  await newProject(page, 'Again', 'gates');
  await live(page);
  assert.deepEqual(await ways(page), { via: 'live-relay', relay: host, start: true });
  assert.deepEqual(JSON.parse(await page.eval(() => localStorage.getItem('silinx.collab.relay'))), { address: relayBase, key: KEY });
  await page.dialogButton('Close');
  assert.deepEqual(await warnings(page), []);
}, { url: () => 'about:blank', timeout: 180000 });
