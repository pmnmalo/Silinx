// UI: a viewer follows what the owner does, not only its files (#4002, part 1), two participants in one test, in both
// interfaces: the owner's Design pane (the row selected, a row collapsed), its simulation (the viewer's page runs it
// again, its own, from the same files: the same SSim in front), its documents closed, its view (the ISE style
// interface: the Simulation view) or its task (the Silinx interface: Simulate); the viewer's own click in the Design
// pane is browsing alone, the owner's selection then not followed, Follow <owner> follows it again; in Portuguese (the
// presence's labels). No warnings at either page.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject } from './harness.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;

const warnings = async (page) => (await page.consoleText()).split('\n').map((l) => l.trim()).filter((l) => /^(WARNING|AVISO|ERROR|ERRO)/.test(l));
const tasks = (page) => page.eval(() => document.documentElement.dataset.layout === 'tasks');
// a participant opens a link in a page of their own (pt: in Portuguese)
async function join(link, name, { pt = false } = {}) {
  const p = await env.newPage(env.server.url);
  await p.waitFor(() => window.SilinxApp && window.Silinx?.startupChecked, [], { what: 'app boot' });
  if (pt) await p.eval(() => localStorage.setItem('silinx.lang', 'pt'));
  await p.goto(`${new URL(link).origin}/?f=1${new URL(link).hash}`);
  await p.waitDialog(pt ? 'Seguir um Projeto Partilhado' : 'Follow a Shared Project');
  await p.fill('.dlg-overlay input[data-field=name]', name);
  await p.dialogButton(pt ? 'Seguir' : 'Follow');
  await p.waitFor(() => window.Silinx?.project?.name && window.Silinx.startupChecked, [], { what: 'the project open', timeout: 30000 });
  return p;
}
const shareNow = (page) => page.eval(async () => { const m = await import('/js/collab-share.js'); await m.startSharing('Ana'); return m.sharedLink(); });
// a module's row of the Design pane: its key (the first of that module's)
const rowKey = (page, mod) => page.waitFor((m) => document.querySelector(`#hier .row[data-module="${m}"]`)?.dataset.key || null, [mod], { what: `${mod}'s row` });
const selected = (page) => page.eval(() => [window.SilinxApp.S.selKey, document.querySelector('#hier .row.sel')?.dataset.key || null]);
const presence = (page) => page.eval(() => document.querySelector('.collab-presence .collab-btn')?.textContent);

uiTest('#4002 a viewer follows the owner\'s Design pane, simulation, documents and view or task; its own click is browsing alone; Follow Ana again', E, async (page) => {
  await makeProject(env, { name: 'GatesAct', template: 'gates' });
  await page.openProject('GatesAct');
  if (await tasks(page)) await page.leftTab('design');
  const link = await shareNow(page);
  const fp = await join(link, 'Rui');
  try {
    if (await tasks(fp)) await fp.waitFor(() => document.documentElement.dataset.task === 'edit', [], { what: 'Design, as the owner' });
    // the owner selects a module: the viewer's Design pane selects it too (its Processes the module's)
    const key = await rowKey(page, 'gates');
    await page.click(`#hier .row[data-key="${key}"] .lbl`);
    await fp.waitFor((k) => window.SilinxApp.S.selKey === k && document.querySelector('#hier .row.sel')?.dataset.key === k && window.SilinxApp.S.sel?.module === 'gates', [key], { what: 'the owner\'s selection followed' });
    // the owner collapses the project's row: the viewer's too
    await page.click('#hier .row[data-key="project"] .twisty');
    await fp.waitFor(() => document.querySelector('#hier .row[data-key="project"] + ul')?.hidden === true, [], { what: 'the row collapsed' });
    await page.click('#hier .row[data-key="project"] .twisty');
    await fp.waitFor(() => document.querySelector('#hier .row[data-key="project"] + ul')?.hidden === false, [], { what: 'the row expanded' });
    // the viewer clicks a row of its own: browsing alone; the owner's next selection not followed
    await fp.click('#hier .row[data-key="project"] .lbl');
    await fp.waitConsole(/^Browsing alone: Ana is no longer followed \(Follow Ana, in the toolbar, follows them again\)\.$/m);
    assert.equal(await presence(fp), 'Follow Ana');
    await page.click('#hier .row[data-key="device"] .lbl');
    await new Promise((r) => setTimeout(r, 700));
    assert.deepEqual(await selected(fp), ['project', 'project'], 'not followed while browsing alone');
    // Follow Ana: the owner's selection again
    await fp.click('.collab-presence .collab-btn');
    await fp.waitForSelector('body > .menu-popup');
    await fp.click('body > .menu-popup .mi', { text: 'Follow Ana' });
    await fp.waitConsole(/^Following Ana: their documents, views and selection\.$/m);
    await fp.waitFor(() => window.SilinxApp.S.selKey === 'device', [], { what: 'the owner\'s selection again' });
    assert.equal(await presence(fp), 'Following Ana');
    // the owner simulates: the viewer's page runs the same simulation, its SSim in front
    await page.eval(() => window.SilinxApp.runSimulation('tb_gates'));
    await page.waitFor(() => window.Silinx.active?.id === 'isim:tb_gates' && window.Silinx.active.view && !window.Silinx.active.view.state.running, [], { what: 'the owner\'s SSim', timeout: 30000 });
    await fp.waitFor(() => window.Silinx.active?.id === 'isim:tb_gates' && window.Silinx.active.view && !window.Silinx.active.view.state.running, [], { what: 'the viewer\'s SSim', timeout: 30000 });
    // (the same simulation: its signals shown, its own console's lines, the time it ran to)
    const sim = (p) => p.eval(() => ({ rows: window.Silinx.active.view.state.rows.map((r) => r.sig?.path || r.name), log: [...document.querySelector('.doc:not([hidden]) .isim-console')?.children || []].map((e) => e.textContent), to: window.Silinx.active.view.state.runTarget }));
    const [mine, theirs] = [await sim(fp), await sim(page)];
    assert.ok(mine.rows.length >= 2 && mine.log.some((l) => /Simulation finished OK/.test(l)), JSON.stringify(mine));
    assert.deepEqual(mine, theirs);
    assert.match(await fp.consoleText(), /Simulation model ready: \d+ signals, \d+ processes\. Launching SSim view\./);
    // the owner closes it: closed at the viewer's
    await page.eval(() => window.SilinxApp.closeDoc(window.SilinxApp.findDoc('isim:tb_gates')));
    await fp.waitFor(() => !window.SilinxApp.findDoc('isim:tb_gates'), [], { what: 'the SSim closed' });
    // the owner's view (the ISE style interface) or task (the Silinx interface)
    if (await tasks(page)) {
      await page.click('#task-switch .task-btn[data-task="sim"]');
      await fp.waitFor(() => document.documentElement.dataset.task === 'sim', [], { what: 'Simulate, as the owner' });
    } else {
      await page.click('input[name=view][value=sim]');
      await fp.waitFor(() => window.SilinxApp.S.view === 'sim' && document.querySelector('input[name=view][value=sim]').checked, [], { what: 'the Simulation view, as the owner' });
    }
    assert.deepEqual(await warnings(fp), []);
    assert.deepEqual(await warnings(page), []);
    assert.deepEqual(fp.errors, []);
  } finally { await fp.close(); await page.eval(async () => (await import('/js/collab-share.js')).stopSharing()); }
});

uiTest('#4002 in Portuguese: the viewer follows the owner\'s selection; its own click browses alone (Seguir Ana), Seguir Ana follows again', E, async (page) => {
  await makeProject(env, { name: 'GatesActPt', template: 'gates' });
  await page.openProject('GatesActPt');
  if (await tasks(page)) await page.leftTab('design');
  const link = await shareNow(page);
  const fp = await join(link, 'Rui', { pt: true });
  try {
    if (await tasks(fp)) await fp.waitFor(() => document.documentElement.dataset.task === 'edit', [], { what: 'Design, as the owner' });
    const key = await rowKey(page, 'gates');
    await page.click(`#hier .row[data-key="${key}"] .lbl`);
    await fp.waitFor((k) => window.SilinxApp.S.selKey === k, [key], { what: 'the owner\'s selection followed' });
    assert.equal(await presence(fp), 'A seguir Ana');
    await fp.click('#hier .row[data-key="project"] .lbl');
    await fp.waitFor(() => document.querySelector('.collab-presence .collab-btn')?.textContent === 'Seguir Ana', [], { what: 'browsing alone' });
    await fp.click('.collab-presence .collab-btn');
    await fp.waitForSelector('body > .menu-popup');
    assert.deepEqual(await fp.eval(() => [...document.querySelectorAll('body > .menu-popup .mi .lbl')].map((m) => m.textContent)), ['Ana', 'Rui', 'Seguir Ana', 'Deixar de Seguir']);
    await fp.click('body > .menu-popup .mi', { text: 'Seguir Ana' });
    await fp.waitFor((k) => window.SilinxApp.S.selKey === k && document.querySelector('.collab-presence .collab-btn')?.textContent === 'A seguir Ana', [key], { what: 'following again' });
    assert.deepEqual(await warnings(fp), []);
    assert.deepEqual(fp.errors, []);
  } finally { await fp.close(); await page.eval(async () => (await import('/js/collab-share.js')).stopSharing()); }
});
