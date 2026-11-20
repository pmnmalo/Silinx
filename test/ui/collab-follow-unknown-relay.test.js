// UI: a link to follow whose relay is unknown (#4742), on the Silinx site (the browser edition), in both interfaces: a
// Cloudflare Worker's relay that is neither the site's nor the one of this browser's settings is marked unknown in Follow
// a Shared Project (whoever runs it sees the follower's IP address and name), Follow disabled until the follower ticks
// that they know who runs it; Cancel follows nothing. The relay of this browser's settings is not marked (the relay
// named only); one of the site's neither (test/ui/collab-relay-site.test.js). In English and in Portuguese. No warnings.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest } from './harness.js';
import { buildSite } from './site-lib.js';

const RELAY = 'https://silinx-relay.someone.workers.dev', HOST = 'silinx-relay.someone.workers.dev';
const HASH = `#view=${'A'.repeat(22)}.${'b'.repeat(43)}&relay=${encodeURIComponent(RELAY)}`;
let env, site;
before(async () => {
  env = await setupUi({ server: false });
  if (env.skip) return;
  site = await buildSite(env.tmp, {});
});
after(async () => { site?.close?.(); await env?.teardown?.(); });
const E = () => (site?.skip ? { skip: site.skip } : env);

const boot = async (page, { pt = false, relay = null } = {}) => {
  await page.goto(`${site.url}index.html`);
  await page.waitFor(() => window.SilinxApp && document.querySelector('#menubar .item') && window.Silinx?.startupChecked, [], { what: 'site boot', timeout: 60000 });
  await page.eval((p, r) => {
    for (const k of ['silinx.collab.relay', 'silinx.dev.collab.relay']) { localStorage.removeItem(k); sessionStorage.removeItem(k); }
    if (r) localStorage.setItem('silinx.collab.relay', JSON.stringify({ address: r, key: 'k'.repeat(43) }));
    if (p) localStorage.setItem('silinx.lang', 'pt'); else localStorage.removeItem('silinx.lang');
  }, pt, relay);
};
const follow = (page, n) => page.goto(`${site.url}index.html?f=${n}${HASH}`);
// the dialog's paragraphs, its confirmation (label, ticked) and whether Follow is enabled
const shown = (page) => page.eval(() => {
  const d = document.querySelector('.dlg-overlay .collab-dlg');
  const t = d.querySelector('label.collab-trust-relay');
  return { lines: [...d.querySelectorAll('p')].map((p) => p.textContent), trust: t ? [t.textContent, t.querySelector('input').checked] : null, follow: !document.querySelector('.dlg-overlay .dlg-buttons button.primary').disabled };
});
const warnings = async (page) => (await page.consoleText()).split('\n').map((l) => l.trim()).filter((l) => /^(WARNING|AVISO|ERROR|ERRO)/.test(l));

uiTest('#4742 Follow a Shared Project: an unknown relay marked, Follow only once confirmed; Cancel follows nothing; the relay of this browser\'s settings not marked', E, async (page) => {
  await boot(page);
  await follow(page, 1);
  await page.waitDialog('Follow a Shared Project');
  const unknown = `Through an unknown relay at ${HOST}: it is neither yours nor this Silinx's. Whoever runs it sees your IP address and the name you give here (not the project, which is encrypted).`;
  let s = await shown(page);
  assert.ok(s.lines.includes(unknown), s.lines.join(' | '));
  assert.ok(!s.lines.includes(`Through the relay at ${HOST}.`));
  assert.deepEqual([s.trust, s.follow], [[` I know who runs the relay at ${HOST}: follow through it`, false], false]);
  await page.click('.dlg-overlay input[data-field=trust-relay]');
  assert.equal((await shown(page)).follow, true);
  await page.click('.dlg-overlay input[data-field=trust-relay]');
  assert.equal((await shown(page)).follow, false, 'unticked: disabled again');
  await page.dialogButton('Cancel');
  await page.waitNoDialog();
  assert.equal(await page.eval(() => window.Silinx.project?.name ?? null), null, 'nothing followed');
  assert.deepEqual(await warnings(page), []);
  // the relay of this browser's settings: named, not marked
  await boot(page, { relay: RELAY });
  await follow(page, 2);
  await page.waitDialog('Follow a Shared Project');
  s = await shown(page);
  assert.ok(s.lines.includes(`Through the relay at ${HOST}.`), s.lines.join(' | '));
  assert.ok(!s.lines.some((l) => l.includes('unknown relay')));
  assert.deepEqual([s.trust, s.follow], [null, true]);
  await page.dialogButton('Cancel');
  await page.waitNoDialog();
  assert.deepEqual(await warnings(page), []);
}, { url: () => 'about:blank', timeout: 180000 });

uiTest('#4742 in Portuguese: the unknown relay and its confirmation translated', E, async (page) => {
  await boot(page, { pt: true });
  await follow(page, 3);
  await page.waitDialog('Seguir um Projeto Partilhado');
  const s = await shown(page);
  assert.ok(s.lines.includes(`Através de um retransmissor desconhecido em ${HOST}: não é seu nem deste Silinx. Quem o gere vê o seu endereço IP e o nome que der aqui (não o projeto, que é cifrado).`), s.lines.join(' | '));
  assert.deepEqual([s.trust, s.follow], [[` Sei quem gere o retransmissor em ${HOST}: seguir através dele`, false], false]);
  await page.dialogButton('Cancelar');
  await page.waitNoDialog();
  assert.deepEqual(await warnings(page), []);
}, { url: () => 'about:blank', timeout: 180000 });
