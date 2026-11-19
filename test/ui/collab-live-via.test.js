// UI: Share Project…'s three ways on the Silinx site (#4640, #4634: web/js/share-how.js, web/js/share-via.js), in
// both interfaces: the Share: row's A copy, Live via your Cloudflare relay, Live peer to peer (no relay), each with its
// note, no other row of choices; Live's window opened by default peer to peer with no Cloudflare relay set up; the
// Cloudflare one chosen from A copy's window: none set up said below the row (where to set one up, Set Up a Cloudflare
// Relay… opening the guide), Start Sharing disabled; peer to peer chosen in the same window (not reopened), its
// explanation; the relay set up while the window is open (as the Collaboration tab's Relay box does): its address shown
// with Change…, its key nowhere, Start Sharing through it (the page meeting its followers at the relay), the other way
// locked while shared; the way chosen remembered; the window's size the same throughout (#4617); in Portuguese. The
// relay is the real Worker (packages/silinx-relay-cloudflare) on the Workers shim (test/workers-shim.js), among the
// site's relays. No warnings.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest } from './harness.js';
import { buildSite } from './site-lib.js';
import { serveWorker } from '../workers-shim.js';
import worker, { RelayRoom } from '../../packages/silinx-relay-cloudflare/src/worker.js';

const KEY = 'a-relay-key-of-24-characters-or-more';
let env, site, relay;
before(async () => {
  env = await setupUi({ server: false });
  if (env.skip) return;
  relay = await serveWorker({ worker, env: { RELAY_KEY: KEY, ORIGINS: 'https://pmnmalo.github.io' }, objects: { ROOMS: ctx => new RelayRoom(ctx, {}) } });
  site = await buildSite(env.tmp, { relays: [relay.url] });
  if (!site.skip) relay.env.ORIGINS = `https://pmnmalo.github.io ${new URL(site.url).origin}`;
});
after(async () => { site?.close?.(); await relay?.close(); await env?.teardown?.(); });
const E = () => (site?.skip ? { skip: site.skip } : env);

const loaded = async (page) => {
  await page.goto(`${site.url}index.html`);
  await page.waitFor(() => window.SilinxApp && document.querySelector('#menubar .item') && window.Silinx?.startupChecked, [], { what: 'site boot', timeout: 60000 });
};
// (no relay set, no way remembered, no STUN server: this computer's own addresses; the meeting point this browser's)
const boot = async (page, pt = false) => {
  await loaded(page);
  await page.eval((p) => {
    for (const k of ['collab.relay', 'collab.via']) { localStorage.removeItem(`silinx.${k}`); localStorage.removeItem(`silinx.dev.${k}`); }
    localStorage.setItem('silinx.share-how', 'live');   // (Share Project… opens Live's window: its way the default)
    for (const k of ['silinx.collab.stun', 'silinx.dev.collab.stun']) localStorage.setItem(k, '[]');
    for (const k of ['silinx.collab.meeting', 'silinx.dev.collab.meeting']) localStorage.setItem(k, 'local');   // (never the public trackers)
    localStorage.setItem('silinx.collab.name', 'Ana');
    if (p) localStorage.setItem('silinx.lang', 'pt');
  }, pt);
  if (pt) await loaded(page);   // (the language read when the page loads)
};
const newProject = async (page, name, pt = false) => {
  // (a menu shown, the ISE style's: its item as shown; one hidden, the Silinx style's: by its English label)
  if (pt) await page.menu('Ficheiro', 'New Project…').catch(() => page.menu('Ficheiro', 'Novo Projeto…'));
  else await page.menu('File', 'New Project…');
  await page.waitFor(() => !!document.querySelector('.dlg-overlay .wiz-main input[type=text]'), [], { what: 'the New Project Wizard' });
  await page.fill('.dlg-overlay .wiz-main input[type=text]', name);
  await page.fill('.dlg-overlay .wiz-main select', 'gates', { index: 0 });
  await page.click('.dlg-overlay .dlg-buttons button', { index: 1 });   // (Next >)
  await page.fill('.dlg-overlay .wiz-main select', 'basys2', { index: 0 });
  await page.click('.dlg-overlay .dlg-buttons button', { index: 1 });
  await page.click('.dlg-overlay .dlg-buttons button.primary');          // (Finish)
  await page.waitNoDialog();
  await page.waitFor((n) => window.Silinx.project?.name === n && window.Silinx.project.top, [name]);
};
const open = async (page, pt = false) => {
  await page.menu(pt ? 'Ficheiro' : 'File', pt ? 'Partilhar Projeto…' : 'Share Project…').catch(() => page.menu(pt ? 'Ficheiro' : 'File', 'Share Project…'));
  await page.waitDialog(pt ? 'Partilhar Projeto' : 'Share Project');
  await page.waitFor(() => !!document.querySelector('.dlg-overlay input[name=share-how]:checked'), [], { what: 'the Share row' });
};
const live = () => document.querySelector('.dlg-overlay .collab-dlg .share-via');
// a way of the Share: row chosen: A copy and Live swap the window; Live's other way keeps it
const choose = async (page, how) => {
  await page.click(`.dlg-overlay input[data-field="how-${how}"]`);
  await page.waitFor((x) => document.querySelectorAll('.dlg-overlay').length === 1 && document.querySelector(`.dlg-overlay input[data-field="how-${x}"]`)?.checked && (x === 'copy' ? !document.querySelector('.dlg-overlay .collab-dlg') : !!document.querySelector('.dlg-overlay .collab-dlg .share-via')), [how], { what: `${how} chosen` });
};
const windowBox = (page) => page.eval(() => { const r = [...document.querySelectorAll('.dlg-overlay .dlg')].pop().getBoundingClientRect(); return [r.left, r.top, r.width, r.height].map((v) => Math.round(v)); });
// the Share: row (its label, each choice and its note), the one chosen, Live's way explained (its paragraphs shown, the
// relay's part), Start Sharing's state; no other row of radios
const ways = (page) => page.eval(() => {
  const q = (s) => document.querySelector(`.dlg-overlay ${s}`);
  const shown = (e) => !!e && !e.closest('[hidden]');
  return {
    row: [q('.share-how > label').textContent, ...[...document.querySelectorAll('.dlg-overlay .share-how-choices > label')].map((l) => [l.firstElementChild.nextElementSibling.textContent, l.querySelector('.share-how-note').textContent])],
    how: q('input[name=share-how]:checked')?.value,
    about: [...document.querySelectorAll('.dlg-overlay .share-via p')].filter(shown).map((p) => p.textContent),
    relay: shown(q('.share-via-status')) ? [...q('.share-via-status').children].map((e) => e.textContent) : null,
    start: !q('.dlg-buttons button.primary').disabled,
    radios: [...new Set([...document.querySelectorAll('.dlg-overlay input[type=radio]')].map((r) => r.name))],
  };
});
const warnings = async (page) => (await page.consoleText()).split('\n').map((l) => l.trim()).filter((l) => /^(WARNING|AVISO|ERROR|ERRO)/.test(l));

const ROW = ['Share:', ['A copy', 'A link with the project in it'], ['Live via your Cloudflare relay', 'Others follow it as you work, on any network'], ['Live peer to peer (no relay)', 'Others follow it as you work, with no setup']];
const RELAY = 'Your followers meet you at a relay of your own on Cloudflare, then connect to you directly when they can, through the relay otherwise. It works on school and other locked-down networks, and counts against your free Cloudflare plan.';
const PEER = 'No setup: your followers find you at the public meeting point and connect browser to browser (WebRTC), or send you a code, which Add a User… takes. It may fail on networks that block direct connections.';
const NONE = ['No Cloudflare relay is set up yet: set one up first, here or in the Collaboration tab ▸ Cloudflare Relay.', 'Set Up a Cloudflare Relay…'];
const SET = (a, k) => { localStorage.setItem('silinx.collab.relay', JSON.stringify({ address: a, key: k })); dispatchEvent(new CustomEvent('silinx:relay-changed')); };

uiTest('#4640 Share Project…: A copy | Live via your Cloudflare relay | Live peer to peer in one row, Live\'s way explained below it; none set up: said, Start Sharing disabled; one set up: its address, Change…, shared through it, the other way locked; remembered; the window\'s size kept', E, async (page) => {
  await boot(page);
  await newProject(page, 'via');
  // Live's window, peer to peer by default (no relay set up): one row of choices, its way explained below
  await open(page);
  await page.waitFor(live, [], { what: 'Live\'s window' });
  const box = await windowBox(page), sizes = [];
  const step = async (name) => sizes.push([name, await windowBox(page)]);
  assert.deepEqual(await ways(page), { row: ROW, how: 'live-peer', about: [PEER], relay: null, start: true, radios: ['share-how'] });
  // A copy: the same row, nothing chosen of Live's
  await choose(page, 'copy'); await step('a copy');
  assert.equal((await ways(page)).how, 'copy');
  assert.deepEqual((await ways(page)).row, ROW);
  // the Cloudflare relay from A copy's window: none set up, said, the guide offered, Start Sharing disabled
  await choose(page, 'live-relay'); await step('Cloudflare, none set up');
  assert.deepEqual(await ways(page), { row: ROW, how: 'live-relay', about: [RELAY], relay: NONE, start: false, radios: ['share-how'] });
  await page.click('.dlg-overlay [data-action=relay-setup]');
  await page.waitDialog('Set Up a Cloudflare Relay');
  await page.dialogButton('Cancel');
  await page.waitFor(() => document.querySelectorAll('.dlg-overlay').length === 1, [], { what: 'the guide closed' });
  assert.equal((await ways(page)).start, false);
  // peer to peer in the same window (not reopened: the name typed kept)
  await page.fill('.dlg-overlay input[data-field=name]', 'Ana Live');
  await choose(page, 'live-peer'); await step('peer to peer');
  assert.deepEqual(await ways(page), { row: ROW, how: 'live-peer', about: [PEER], relay: null, start: true, radios: ['share-how'] });
  assert.equal(await page.eval(() => document.querySelector('.dlg-overlay input[data-field=name]').value), 'Ana Live');
  // a relay set up meanwhile (the Collaboration tab's Relay box): its address, Change…; its key nowhere
  await choose(page, 'live-relay');
  await page.eval(SET, relay.url, KEY);
  const host = new URL(relay.url).host;
  await page.waitFor(() => !!document.querySelector('.dlg-overlay .share-via-at'), [], { what: 'the relay shown' });
  assert.deepEqual(await ways(page), { row: ROW, how: 'live-relay', about: [RELAY], relay: ['Your relay:', host, 'Change…'], start: true, radios: ['share-how'] });
  assert.equal(await page.eval((k) => document.querySelector('.dlg-overlay .dlg').innerHTML.includes(k), KEY), false, 'the key nowhere in the window');
  await step('Cloudflare, set up');
  // Start Sharing through it: the page meets its followers at the relay; the other way locked, the explanation hidden
  await page.dialogButton('Start Sharing');
  await page.waitFor(() => !document.querySelector('.dlg-overlay .collab-links').hidden, [], { what: 'shared' });
  await step('shared');
  assert.deepEqual(await page.eval(() => [document.querySelector('.dlg-overlay .share-via').hidden, ...['copy', 'live-relay', 'live-peer'].map((x) => document.querySelector(`.dlg-overlay input[data-field="how-${x}"]`).disabled)]), [true, false, false, true]);
  await page.waitConsole(new RegExp(`^This page hosts the shared project: its followers meet it at the relay at ${host.replace(/\./g, '\\.')}, then connect to it directly when they can, through the relay otherwise; it sees no file\\. It lasts while this page is open\\.$`, 'm'));
  await page.dialogButton('Stop Sharing');
  await page.waitFor(() => document.querySelector('.dlg-overlay .collab-links').hidden, [], { what: 'stopped' });
  assert.equal(await page.eval(() => document.querySelector('.dlg-overlay input[data-field="how-live-peer"]').disabled), false, 'unlocked once stopped');
  assert.deepEqual(sizes, sizes.map(([n]) => [n, box]));
  await page.dialogButton('Close');
  await page.waitNoDialog();
  // remembered: the Cloudflare relay; peer to peer once shared that way, even with a relay set up
  await open(page);
  assert.equal((await ways(page)).how, 'live-relay');
  await choose(page, 'live-peer');
  await page.dialogButton('Start Sharing');
  await page.waitFor(() => !document.querySelector('.dlg-overlay .collab-links').hidden, [], { what: 'shared peer to peer' });
  await page.waitConsole(/^This page hosts the shared project: its followers find it at the meeting point when they open the link, or send you a code \(Add a User…, in the toolbar, takes it\); it lasts while this page is open\.$/m);
  await page.dialogButton('Stop Sharing');
  await page.waitFor(() => document.querySelector('.dlg-overlay .collab-links').hidden, [], { what: 'stopped' });
  await page.dialogButton('Close');
  await page.waitNoDialog();
  await open(page);
  assert.equal((await ways(page)).how, 'live-peer');
  await page.dialogButton('Close');
  await page.waitNoDialog();
  assert.ok(!(await page.consoleText()).includes(KEY), 'the key in no console line');
  assert.deepEqual(await warnings(page), []);
  assert.deepEqual(page.errors, []);
}, { url: () => 'about:blank', timeout: 180000 });

uiTest('#4640 in Portuguese: the Share row\'s three ways, their notes and Live\'s explanations translated; none set up, said; one set up, its address and Alterar…', E, async (page) => {
  await boot(page, true);
  await newProject(page, 'via-pt', true);
  await open(page, true);
  await page.waitFor(live, [], { what: 'Live\'s window' });
  const ROW_PT = ['Partilhar:', ['Uma cópia', 'Uma ligação com o projeto lá dentro'], ['Em direto pelo seu retransmissor Cloudflare', 'Os outros seguem-no enquanto trabalha, em qualquer rede'], ['Em direto ponto a ponto (sem retransmissor)', 'Os outros seguem-no enquanto trabalha, sem configuração']];
  assert.deepEqual(await ways(page), { row: ROW_PT, how: 'live-peer', about: ['Sem configuração: quem o segue encontra-o no ponto de encontro público e liga-se de navegador a navegador (WebRTC), ou envia-lhe um código, que Adicionar um Utilizador… recebe. Pode falhar em redes que bloqueiam ligações diretas.'], relay: null, start: true, radios: ['share-how'] });
  await choose(page, 'live-relay');
  assert.deepEqual(await ways(page), { row: ROW_PT, how: 'live-relay', about: ['Quem o segue encontra-o num retransmissor seu no Cloudflare e liga-se depois diretamente a si quando pode e, senão, através do retransmissor. Funciona nas redes das escolas e noutras redes restritas, e conta para o seu plano gratuito do Cloudflare.'], relay: ['Ainda não há nenhum retransmissor Cloudflare configurado: configure um primeiro, aqui ou no separador Colaboração ▸ Retransmissor Cloudflare.', 'Configurar um Retransmissor Cloudflare…'], start: false, radios: ['share-how'] });
  await page.eval(SET, relay.url, KEY);
  await page.waitFor(() => !!document.querySelector('.dlg-overlay .share-via-at'), [], { what: 'the relay shown' });
  assert.deepEqual((await ways(page)).relay, ['O seu retransmissor:', new URL(relay.url).host, 'Alterar…']);
  await page.dialogButton('Fechar');
  await page.waitNoDialog();
  assert.deepEqual(await warnings(page), []);
  assert.deepEqual(page.errors, []);
}, { url: () => 'about:blank', timeout: 120000 });
