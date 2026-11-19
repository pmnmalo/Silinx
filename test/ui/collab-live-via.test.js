// UI: Share Project… ▸ Live's two ways on the Silinx site (#4634, web/js/share-via.js), in both interfaces: with no
// Cloudflare relay set up, peer to peer chosen, the Cloudflare one saying none is set up yet (where to set one up, Set
// Up a Cloudflare Relay… opening the guide) and Start Sharing disabled while it is chosen; the relay set up while the
// window is open (as the Collaboration tab's Relay box does): its address shown with Change…, its key nowhere, Start
// Sharing through it (the page meeting its followers at the relay); the way chosen remembered, the Cloudflare relay by
// default once set up; the window's size the same in A copy, Live and either way (#4617); in Portuguese. The relay is
// the real Worker (packages/silinx-relay-cloudflare) on the Workers shim (test/workers-shim.js), among the site's
// relays. No warnings.
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
// (no relay set, no way remembered, no STUN server: this computer's own addresses)
const boot = async (page, pt = false) => {
  await loaded(page);
  await page.eval((p) => {
    for (const k of ['collab.relay', 'collab.via']) { localStorage.removeItem(`silinx.${k}`); localStorage.removeItem(`silinx.dev.${k}`); }
    for (const k of ['silinx.collab.stun', 'silinx.dev.collab.stun']) localStorage.setItem(k, '[]');
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
const live = async (page, pt = false) => {
  await page.menu(pt ? 'Ficheiro' : 'File', pt ? 'Partilhar Projeto…' : 'Share Project…').catch(() => page.menu(pt ? 'Ficheiro' : 'File', 'Share Project…'));
  await page.waitDialog(pt ? 'Partilhar Projeto' : 'Share Project');
  if (!await page.eval(() => document.querySelector('.dlg-overlay input[data-field=how-live]')?.checked)) await page.click('.dlg-overlay input[data-field=how-live]');
  await page.waitFor(() => !!document.querySelector('.dlg-overlay .collab-dlg input[data-field=via-relay]'), [], { what: 'the live window, its two ways' });
};
const switchTo = async (page, how) => {
  await page.click(`.dlg-overlay input[data-field="how-${how}"]`);
  await page.waitFor((x) => document.querySelectorAll('.dlg-overlay').length === 1 && document.querySelector(`.dlg-overlay input[data-field="how-${x}"]`)?.checked, [how], { what: `${how} chosen` });
};
const windowBox = (page) => page.eval(() => { const r = [...document.querySelectorAll('.dlg-overlay .dlg')].pop().getBoundingClientRect(); return [r.left, r.top, r.width, r.height].map((v) => Math.round(v)); });
// the two ways: their labels and explanations, the one chosen, the relay's part, Start Sharing's state
const ways = (page) => page.eval(() => {
  const q = (s) => document.querySelector(`.dlg-overlay ${s}`);
  return {
    label: q('.share-via > label').textContent,
    choices: [...document.querySelectorAll('.dlg-overlay .share-via-choices > div')].map((d) => [d.querySelector('label').textContent, d.querySelector('.share-via-about > p').textContent]),
    via: q('input[name=share-via]:checked')?.value,
    relay: [...q('.share-via-status').children].map((e) => e.textContent),
    start: !q('.dlg-buttons button.primary').disabled,
  };
});
const choose = async (page, via) => {
  await page.click(`.dlg-overlay input[data-field="via-${via}"]`);
  await page.waitFor((v) => document.querySelector('.dlg-overlay input[name=share-via]:checked')?.value === v, [via], { what: `${via} chosen` });
};
const warnings = async (page) => (await page.consoleText()).split('\n').map((l) => l.trim()).filter((l) => /^(WARNING|AVISO|ERROR|ERRO)/.test(l));

const EN = [
  ['Live via your Cloudflare relay', 'Your followers meet you at a relay of your own on Cloudflare, then connect to you directly when they can, through the relay otherwise. It works on school and other locked-down networks, and counts against your free Cloudflare plan.'],
  ['Live peer to peer (no relay)', 'No setup: your followers find you at the public meeting point and connect browser to browser (WebRTC), or send you a code, which Add a User… takes. It may fail on networks that block direct connections.'],
];
const NONE = ['No Cloudflare relay is set up yet: set one up first, here or in the Collaboration tab ▸ Cloudflare Relay.', 'Set Up a Cloudflare Relay…'];

uiTest('#4634 Share Project… ▸ Live: through your Cloudflare relay or peer to peer, each explained; none set up: peer to peer, the Cloudflare one saying where to set one up, Start Sharing disabled for it; one set up: its address, Change…, shared through it; remembered; the window\'s size kept', E, async (page) => {
  await boot(page);
  await newProject(page, 'via');
  await live(page);
  const box = await windowBox(page), sizes = [];
  const step = async (name) => sizes.push([name, await windowBox(page)]);
  // no relay set up: peer to peer chosen; the Cloudflare one says none is set up, where, and offers the guide
  assert.deepEqual(await ways(page), { label: 'Connection:', choices: EN, via: 'peer', relay: NONE, start: true });
  await choose(page, 'relay'); await step('Cloudflare, none set up');
  assert.deepEqual(await ways(page), { label: 'Connection:', choices: EN, via: 'relay', relay: NONE, start: false });
  // (Set Up a Cloudflare Relay… opens the guide; cancelled, nothing set)
  await page.click('.dlg-overlay [data-action=relay-setup]');
  await page.waitDialog('Set Up a Cloudflare Relay');
  await page.dialogButton('Cancel');
  await page.waitFor(() => document.querySelectorAll('.dlg-overlay').length === 1, [], { what: 'the guide closed' });
  assert.equal((await ways(page)).start, false);
  await choose(page, 'peer'); await step('peer to peer');
  assert.equal((await ways(page)).start, true);
  await switchTo(page, 'copy'); await step('a copy');
  await switchTo(page, 'live'); await step('live again');
  assert.equal((await ways(page)).via, 'peer', 'peer to peer kept: none set up');
  // a relay set up meanwhile (the Collaboration tab's Relay box): its address, Change…; its key nowhere
  await choose(page, 'relay');
  await page.eval((a, k) => { localStorage.setItem('silinx.collab.relay', JSON.stringify({ address: a, key: k })); dispatchEvent(new CustomEvent('silinx:relay-changed')); }, relay.url, KEY);
  const host = new URL(relay.url).host;
  await page.waitFor(() => !!document.querySelector('.dlg-overlay .share-via-at'), [], { what: 'the relay shown' });
  assert.deepEqual(await ways(page), { label: 'Connection:', choices: EN, via: 'relay', relay: ['Your relay:', host, 'Change…'], start: true });
  assert.equal(await page.eval((k) => document.querySelector('.dlg-overlay .dlg').innerHTML.includes(k), KEY), false, 'the key nowhere in the window');
  await step('Cloudflare, set up');
  assert.deepEqual(sizes, sizes.map(([n]) => [n, box]));
  // Start Sharing through it: the page meets its followers at the relay
  await page.dialogButton('Start Sharing');
  await page.waitFor(() => !document.querySelector('.dlg-overlay .collab-links').hidden, [], { what: 'shared' });
  assert.equal(await page.eval(() => document.querySelector('.dlg-overlay .share-via').hidden), true, 'the ways hidden once shared');
  await page.waitConsole(new RegExp(`^This page hosts the shared project: its followers meet it at the relay at ${host.replace(/\./g, '\\.')}, then connect to it directly when they can, through the relay otherwise; it sees no file\\. It lasts while this page is open\\.$`, 'm'));
  assert.equal(await windowBox(page).then((b) => JSON.stringify(b)), JSON.stringify(box));
  await page.dialogButton('Stop Sharing');
  await page.waitFor(() => document.querySelector('.dlg-overlay .collab-links').hidden, [], { what: 'stopped' });
  await page.dialogButton('Close');
  await page.waitNoDialog();
  // remembered: the Cloudflare relay; peer to peer once chosen, even with a relay set up
  await live(page);
  assert.equal((await ways(page)).via, 'relay');
  await choose(page, 'peer');
  await page.dialogButton('Start Sharing');
  await page.waitFor(() => !document.querySelector('.dlg-overlay .collab-links').hidden, [], { what: 'shared peer to peer' });
  await page.waitConsole(/^This page hosts the shared project: its followers find it at the meeting point when they open the link, or send you a code \(Add a User…, in the toolbar, takes it\); it lasts while this page is open\.$/m);
  await page.dialogButton('Stop Sharing');
  await page.waitFor(() => document.querySelector('.dlg-overlay .collab-links').hidden, [], { what: 'stopped' });
  await page.dialogButton('Close');
  await page.waitNoDialog();
  await live(page);
  assert.equal((await ways(page)).via, 'peer');
  await page.dialogButton('Close');
  await page.waitNoDialog();
  assert.ok(!(await page.consoleText()).includes(KEY), 'the key in no console line');
  assert.deepEqual(await warnings(page), []);
  assert.deepEqual(page.errors, []);
}, { url: () => 'about:blank', timeout: 180000 });

uiTest('#4634 in Portuguese: the two ways and their explanations translated; none set up, said; one set up, its address and Alterar…', E, async (page) => {
  await boot(page, true);
  await newProject(page, 'via-pt', true);
  await live(page, true);
  const PT = [
    ['Em direto pelo seu retransmissor Cloudflare', 'Quem o segue encontra-o num retransmissor seu no Cloudflare e liga-se depois diretamente a si quando pode e, senão, através do retransmissor. Funciona nas redes das escolas e noutras redes restritas, e conta para o seu plano gratuito do Cloudflare.'],
    ['Em direto ponto a ponto (sem retransmissor)', 'Sem configuração: quem o segue encontra-o no ponto de encontro público e liga-se de navegador a navegador (WebRTC), ou envia-lhe um código, que Adicionar um Utilizador… recebe. Pode falhar em redes que bloqueiam ligações diretas.'],
  ];
  assert.deepEqual(await ways(page), { label: 'Ligação:', choices: PT, via: 'peer', relay: ['Ainda não há nenhum retransmissor Cloudflare configurado: configure um primeiro, aqui ou no separador Colaboração ▸ Retransmissor Cloudflare.', 'Configurar um Retransmissor Cloudflare…'], start: true });
  await page.eval((a, k) => { localStorage.setItem('silinx.collab.relay', JSON.stringify({ address: a, key: k })); dispatchEvent(new CustomEvent('silinx:relay-changed')); }, relay.url, KEY);
  await page.waitFor(() => !!document.querySelector('.dlg-overlay .share-via-at'), [], { what: 'the relay shown' });
  assert.deepEqual((await ways(page)).relay, ['O seu retransmissor:', new URL(relay.url).host, 'Alterar…']);
  await page.dialogButton('Fechar');
  await page.waitNoDialog();
  assert.deepEqual(await warnings(page), []);
  assert.deepEqual(page.errors, []);
}, { url: () => 'about:blank', timeout: 120000 });
