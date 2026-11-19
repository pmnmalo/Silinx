// UI: a Cloudflare relay of one's own set up from the Collaboration tab (#4574, web/js/relay-setup.js), on the Silinx
// site (the browser edition), in both interfaces: the Cloudflare Relay box with none set; Set Up a Cloudflare Relay…:
// its key made in the page (43 characters), Show, Copy (said in the console), New Key, the Deploy to Cloudflare button
// (a new tab), Cloudflare's screens step by step (#4630: open until a relay is set, in order); a relay that does not let the site in refused, the exact ORIGINS line in the console and the window,
// nothing kept; once it does, checked and kept: the box shows it; Share Project… ▸ Live via your Cloudflare relay
// chosen, the relay shown (#4634); Check Cloudflare Relay; Forget Cloudflare Relay; the key in no console line; in Portuguese, the box and the
// window translated. The relay is the real Worker (packages/silinx-relay-cloudflare) on the Workers shim
// (test/workers-shim.js), among the site's relays. No warnings but those asserted.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest } from './harness.js';
import { buildSite } from './site-lib.js';
import { serveWorker } from '../workers-shim.js';
import worker, { RelayRoom } from '../../packages/silinx-relay-cloudflare/src/worker.js';
import { DEPLOY_URL } from '../../core/relay-setup.js';

const KEY = 'a-relay-key-of-24-characters-or-more';
// Cloudflare's screens, step by step (#4630), in order: English, Portuguese
const STEPS = [
  'Deploy to Cloudflare opens Cloudflare\'s "Set up your application" page in a new tab: sign in, or create a free account.',
  'Git account: choose your GitHub account, or New GitHub connection (GitLab works too). An account already connected needs nothing more. The first time, GitHub asks to install Cloudflare\'s app: if Only select repositories does not let Cloudflare create the new repository, give it All repositories, and narrow it afterwards in GitHub\'s Settings ▸ Applications.',
  'Tick Create private Git repository: Cloudflare makes your copy of the relay there. The key is a secret of Cloudflare\'s, not in the repository.',
  'Project name: leave silinx-relay. Your relay\'s address will be https://silinx-relay.<your subdomain>.workers.dev.',
  'RELAY_KEY: paste the key copied in step 1.',
  'ORIGINS: leave https://pmnmalo.github.io, the Silinx site. To use the relay from Silinx\'s local server too, add it after a space: https://pmnmalo.github.io http://127.0.0.1:8642.',
  'Build command empty, Deploy command npm run deploy, preview builds off: leave them as they are.',
  'Click Deploy. Cloudflare sets up the repository, then builds the relay (Initializing, Cloning, Installing, Deploying): about 2 to 3 minutes. Wait for "Success! Build completed."',
  'The address: in the build log, under "Deployed silinx-relay triggers", or the Worker\'s Overview ▸ Domains & Routes. Paste it below and click Check and Save.',
];
const TRAPS = 'Use the Deploy to Cloudflare button: Cloudflare\'s Create ▸ Import a repository only lists the repositories you already have. Your copy does not follow Silinx\'s: to update the relay, push the relay\'s new files to your repository, and Cloudflare deploys it again.';
const PASSOS = [
  'Instalar no Cloudflare abre a página "Set up your application" do Cloudflare num separador novo: entre, ou crie uma conta gratuita.',
  'Conta Git: escolha a sua conta do GitHub, ou New GitHub connection (o GitLab também serve). Uma conta já ligada não precisa de mais nada. Da primeira vez, o GitHub pede para instalar a aplicação do Cloudflare: se Only select repositories não deixar o Cloudflare criar o repositório novo, dê-lhe All repositories, e restrinja-a depois em Settings ▸ Applications do GitHub.',
  'Marque Create private Git repository: o Cloudflare faz lá a sua cópia do retransmissor. A chave é um segredo do Cloudflare, não está no repositório.',
  'Project name: deixe silinx-relay. O endereço do seu retransmissor será https://silinx-relay.<o seu subdomínio>.workers.dev.',
  'RELAY_KEY: cole a chave copiada no passo 1.',
  'ORIGINS: deixe https://pmnmalo.github.io, o sítio do Silinx. Para usar o retransmissor também a partir do servidor local do Silinx, acrescente-o depois de um espaço: https://pmnmalo.github.io http://127.0.0.1:8642.',
  'Build command vazio, Deploy command npm run deploy, builds de pré-visualização desligados: deixe-os como estão.',
  'Carregue em Deploy. O Cloudflare prepara o repositório e depois constrói o retransmissor (Initializing, Cloning, Installing, Deploying): cerca de 2 a 3 minutos. Espere por "Success! Build completed."',
  'O endereço: no registo da construção, em "Deployed silinx-relay triggers", ou em Overview ▸ Domains & Routes do Worker. Cole-o abaixo e carregue em Verificar e Guardar.',
];
// the step-by-step: [summary, open, its steps, its paragraphs]
const stepsOf = (page) => page.eval(() => { const d = document.querySelector('.dlg-overlay details.relay-setup-steps'); return d && [d.querySelector('summary').textContent, d.open, [...d.querySelectorAll('li')].map((l) => l.textContent), [...d.querySelectorAll('p')].map((p) => p.textContent)]; });
let env, site, relay;
before(async () => {
  env = await setupUi({ server: false });
  if (env.skip) return;
  relay = await serveWorker({ worker, env: { RELAY_KEY: KEY, ORIGINS: 'https://pmnmalo.github.io' }, objects: { ROOMS: ctx => new RelayRoom(ctx, {}) } });
  site = await buildSite(env.tmp, { relays: [relay.url] });
});
after(async () => { site?.close?.(); await relay?.close(); await env?.teardown?.(); });
const E = () => (site?.skip ? { skip: site.skip } : env);

const loaded = async (page) => {
  await page.goto(`${site.url}index.html`);
  await page.waitFor(() => window.SilinxApp && document.querySelector('#menubar .item') && window.Silinx?.startupChecked, [], { what: 'site boot', timeout: 60000 });
};
const boot = async (page, pt = false) => {
  await loaded(page);
  await page.eval((p) => { localStorage.removeItem('silinx.collab.relay'); localStorage.removeItem('silinx.dev.collab.relay'); if (p) localStorage.setItem('silinx.lang', 'pt'); }, pt);
  if (pt) await loaded(page);   // (the language read when the page loads)
};
const newProject = async (page, name, pt = false) => {
  // (a menu shown, the ISE style's: its item as shown; one hidden, the Silinx style's: by its English label)
  if (pt) await page.menu('Ficheiro', 'New Project…').catch(() => page.menu('Ficheiro', 'Novo Projeto…'));
  else await page.menu('File', 'New Project…');
  await page.waitFor(() => !!document.querySelector('.dlg-overlay .wiz-main input[type=text]'), [], { what: 'the New Project Wizard' });
  await page.fill('.dlg-overlay .wiz-main input[type=text]', name);
  await page.fill('.dlg-overlay .wiz-main select', 'blinky', { index: 0 });
  await page.click('.dlg-overlay .dlg-buttons button', { index: 1 });   // (Next >)
  await page.fill('.dlg-overlay .wiz-main select', 'basys2', { index: 0 });
  await page.click('.dlg-overlay .dlg-buttons button', { index: 1 });
  await page.click('.dlg-overlay .dlg-buttons button.primary');          // (Finish)
  await page.waitNoDialog();
  await page.waitFor((n) => window.Silinx.project?.name === n && window.Silinx.project.top, [name]);
};
// the box's entries (an entry's parts joined by a space), or null
const boxOf = (page, heading) => page.eval((hd) => {
  const b = [...document.querySelectorAll('#collab-page .start-box')].find((x) => x.querySelector('h3').textContent === hd);
  return b ? [...b.querySelectorAll('.entry')].map((e) => [...e.childNodes].filter((n) => !n.classList?.contains('ico')).map((n) => n.textContent).filter(Boolean).join(' ')) : null;
}, heading);
const waitBox = async (page, heading, entries) => {
  try { await page.waitFor((hd, en) => JSON.stringify((() => { const b = [...document.querySelectorAll('#collab-page .start-box')].find((x) => x.querySelector('h3').textContent === hd); return b ? [...b.querySelectorAll('.entry')].map((e) => [...e.childNodes].filter((n) => !n.classList?.contains('ico')).map((n) => n.textContent).filter(Boolean).join(' ')) : null; })()) === JSON.stringify(en), [heading, entries], { what: `the ${heading} box` }); } catch (e) { assert.deepEqual(await boxOf(page, heading), entries, e.message); throw e; }
};
const lines = async (page) => (await page.consoleText()).split('\n').map((l) => l.trim()).filter(Boolean);
const warnings = async (page) => (await lines(page)).filter((l) => /^(WARNING|AVISO|ERROR|ERRO)/.test(l));
const tabCommand = (page, label) => page.click('#collab-page .entry a', { text: label });

uiTest('#4574 Collaboration tab ▸ Cloudflare Relay: Set Up a Cloudflare Relay… (its key made, copied; Deploy to Cloudflare), a site it does not let in (the ORIGINS line), checked and kept, Share Project… filled, Check, Forget; the key in no line', E, async (page) => {
  relay.env.ORIGINS = 'https://pmnmalo.github.io';
  await boot(page);
  await newProject(page, 'Relayed');
  await page.leftTab('collab');
  await waitBox(page, 'Cloudflare Relay', ['No Cloudflare relay: your followers find you at the public meeting point.', 'Set Up a Cloudflare Relay…']);
  await tabCommand(page, 'Set Up a Cloudflare Relay…');
  await page.waitDialog('Set Up a Cloudflare Relay');
  const key0 = await page.eval(() => document.querySelector('.dlg-overlay input[data-field=relay-key]').value);
  assert.match(key0, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(await page.eval(() => document.querySelector('.dlg-overlay input[data-field=relay-key]').type), 'password');
  await page.click('.dlg-overlay button[data-action=show-key]');
  assert.equal(await page.eval(() => document.querySelector('.dlg-overlay input[data-field=relay-key]').type), 'text');
  await page.click('.dlg-overlay button[data-action=new-key]');
  const key = await page.eval(() => document.querySelector('.dlg-overlay input[data-field=relay-key]').value);
  assert.match(key, /^[A-Za-z0-9_-]{43}$/);
  assert.notEqual(key, key0);
  await page.click('.dlg-overlay button[data-action=copy-key]');
  await page.waitConsole(/Relay key copied: give it to Cloudflare when it asks for RELAY_KEY, and keep it somewhere safe\./);
  assert.deepEqual(await page.eval(() => { const a = document.querySelector('.dlg-overlay a.relay-deploy'); return [a.textContent, a.href, a.target, a.rel]; }), ['Deploy to Cloudflare', DEPLOY_URL, '_blank', 'noopener noreferrer']);
  // Cloudflare's screens, step by step, in order: open, as no relay is set yet (#4630)
  assert.deepEqual(await stepsOf(page), ["Cloudflare's screens, step by step", true, STEPS, [TRAPS]]);
  // (Cloudflare's relay deployed with the key: here, the shim's, whose key is KEY)
  await page.fill('.dlg-overlay input[data-field=relay-key]', KEY);
  await page.fill('.dlg-overlay input[data-field=relay]', relay.url);
  // a relay that does not let this site in: refused, the line to set
  const origin = new URL(site.url).origin, host = new URL(relay.url).host;
  const refused = `the relay at ${host} does not let this site in (${origin}): add it to its ORIGINS (in Cloudflare: the Worker's Settings ▸ Variables and Secrets, or wrangler.toml, then deploy it again): ORIGINS = "https://pmnmalo.github.io ${origin}"`;
  await page.dialogButton('Check and Save');
  await page.waitConsole(/does not let this site in/);
  assert.equal(await page.topDialogTitle(), 'Set Up a Cloudflare Relay');
  assert.equal(await page.eval(() => document.querySelector('.dlg-overlay .relay-setup-error').textContent), refused);
  assert.equal(await page.eval(() => localStorage.getItem('silinx.collab.relay')), null);
  // the line set: checked, kept
  relay.env.ORIGINS = `https://pmnmalo.github.io ${origin}`;
  await page.dialogButton('Check and Save');
  await page.waitNoDialog();
  const ok = `Relay: The relay at ${host} answers, lets this site in and takes its key. Share Project… ▸ Live meets your followers there.`;
  await page.waitConsole(new RegExp(ok.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.deepEqual(JSON.parse(await page.eval(() => localStorage.getItem('silinx.collab.relay'))), { address: relay.url, key: KEY });
  await waitBox(page, 'Cloudflare Relay', [`Cloudflare relay: ${host}`, 'Check Cloudflare Relay', 'Change Cloudflare Relay…', 'Forget Cloudflare Relay']);
  // Change Cloudflare Relay…: the same window, its step by step folded (a relay is set), its address and key kept
  await tabCommand(page, 'Change Cloudflare Relay…');
  await page.waitDialog('Set Up a Cloudflare Relay');
  assert.deepEqual(await stepsOf(page), ["Cloudflare's screens, step by step", false, STEPS, [TRAPS]]);
  assert.deepEqual(await page.eval(() => [document.querySelector('.dlg-overlay input[data-field=relay]').value, document.querySelector('.dlg-overlay input[data-field=relay-key]').value]), [relay.url, KEY]);
  await page.dialogButton('Cancel');
  await page.waitNoDialog();
  // Share Project… ▸ Live: via your Cloudflare relay, chosen, the relay shown by its address (#4634)
  await page.menu('File', 'Share Project…');
  await page.waitDialog('Share Project');
  if (!await page.eval(() => document.querySelector('.dlg-overlay input[data-field=how-live-relay]')?.checked)) await page.click('.dlg-overlay input[data-field=how-live-relay]');
  await page.waitFor(() => !!document.querySelector('.dlg-overlay .collab-dlg .share-via'), [], { what: 'the live window' });
  assert.deepEqual(await page.eval(() => [document.querySelector('.dlg-overlay input[name=share-how]:checked').value, document.querySelector('.dlg-overlay .share-via-at').textContent, document.querySelector('.dlg-overlay [data-action=relay-change]').textContent]), ['live-relay', host, 'Change…']);
  await page.dialogButton('Close');
  await page.waitNoDialog();
  // Check Cloudflare Relay; Forget Cloudflare Relay
  await tabCommand(page, 'Check Cloudflare Relay');
  await page.waitFor((t) => window.__console().split(t).length === 3, [ok], { what: 'the relay checked again' });
  await tabCommand(page, 'Forget Cloudflare Relay');
  await page.waitConsole(/Relay forgotten: Share Project… ▸ Live meets your followers at the public meeting point\./);
  await waitBox(page, 'Cloudflare Relay', ['No Cloudflare relay: your followers find you at the public meeting point.', 'Set Up a Cloudflare Relay…']);
  assert.equal(await page.eval(() => localStorage.getItem('silinx.collab.relay')), null);
  assert.ok(!(await page.consoleText()).includes(KEY) && !(await page.consoleText()).includes(key), 'the key in no console line');
  assert.deepEqual(await warnings(page), [`ERROR: Relay: ${refused}.`]);
}, { url: () => 'about:blank', timeout: 180000 });

uiTest('#4574 in Portuguese: the Cloudflare Relay box and its window translated; a wrong key refused, said', E, async (page) => {
  relay.env.ORIGINS = 'https://pmnmalo.github.io';
  await boot(page, true);
  await newProject(page, 'Retransmitido', true);
  await page.leftTab('collab');
  await waitBox(page, 'Retransmissor Cloudflare', ['Sem retransmissor Cloudflare: quem o segue encontra-o no ponto de encontro público.', 'Configurar um Retransmissor Cloudflare…']);
  await tabCommand(page, 'Configurar um Retransmissor Cloudflare…');
  await page.waitDialog('Configurar um Retransmissor Cloudflare');
  assert.deepEqual(await page.eval(() => [...document.querySelectorAll('.dlg-overlay .relay-setup-body > p')].map((p) => p.textContent)), [
    'Um retransmissor seu, no plano gratuito do Cloudflare: quem o segue encontra-o lá, e liga-se através dele quando não se consegue ligar diretamente a si.',
    '1. A sua chave, feita aqui: copie-a e guarde-a num lugar seguro.',
    '2. Instale-o: entre no Cloudflare (ou registe-se, é gratuito) e dê a chave quando lhe pedir RELAY_KEY.',
    'Instalar no Cloudflare',
    '3. O seu endereço, que o Cloudflare mostra no fim:']);
  assert.deepEqual(await stepsOf(page), ['Os ecrãs do Cloudflare, passo a passo', true, PASSOS, [
    'Use o botão Instalar no Cloudflare: Create ▸ Import a repository do Cloudflare só lista os repositórios que já tem. A sua cópia não segue a do Silinx: para atualizar o retransmissor, envie (push) os novos ficheiros do retransmissor para o seu repositório, e o Cloudflare instala-o de novo.']]);
  assert.deepEqual(await page.eval(() => [...document.querySelectorAll('.dlg-overlay button')].map((b) => b.textContent).filter((t) => t !== '✕')), ['Mostrar', 'Copiar', 'Nova Chave', 'Verificar e Guardar', 'Cancelar']);
  await page.fill('.dlg-overlay input[data-field=relay]', relay.url);
  await page.dialogButton('Verificar e Guardar');
  // (the site let in first, then a key made here, not the relay's: refused)
  await page.waitConsole(/does not let this site in/);
  const refused = `ERROR: Relay: the relay at ${new URL(relay.url).host} does not let this site in`;
  assert.ok((await warnings(page))[0].startsWith(refused), (await warnings(page))[0]);
  relay.env.ORIGINS = `https://pmnmalo.github.io ${new URL(site.url).origin}`;
  await page.dialogButton('Verificar e Guardar');
  await page.waitConsole(/refused its key/);
  assert.deepEqual((await warnings(page)).slice(1), [`ERROR: Relay: the relay at ${new URL(relay.url).host} refused its key: sharing a project needs this relay's key.`]);
  await page.dialogButton('Cancelar');
  await page.waitNoDialog();
  assert.equal(await page.eval(() => localStorage.getItem('silinx.collab.relay')), null);
}, { url: () => 'about:blank', timeout: 180000 });
