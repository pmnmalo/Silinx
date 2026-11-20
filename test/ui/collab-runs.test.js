// UI: a viewer follows the processes the owner runs (#4002, part 2), two participants in one test, in both interfaces:
// the owner synthesizes (the Silinx toolchain): the viewer's Processes show the same marks, its console the run's
// lines (each once), the owner's Design Summary opens there with the same tables, and the report the owner opens (the
// synthesis's statistics) opens there with the same text; a second run's lines follow the first's; the owner's computer's
// paths (the workspace, the home folder) replaced in what the viewer gets. No warnings at either page.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { setupUi, uiTest, makeProject } from './harness.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;

const warnings = async (page) => (await page.consoleText()).split('\n').map((l) => l.trim()).filter((l) => /^(WARNING|AVISO|ERROR|ERRO)/.test(l));
async function join(link, name) {
  const p = await env.newPage(env.server.url);
  await p.waitFor(() => window.SilinxApp && window.Silinx?.startupChecked, [], { what: 'app boot' });
  await p.goto(`${new URL(link).origin}/?f=1${new URL(link).hash}`);
  await p.waitDialog('Follow a Shared Project');
  await p.fill('.dlg-overlay input[data-field=name]', name);
  await p.dialogButton('Follow');
  await p.waitFor(() => window.Silinx?.project?.name && window.Silinx.startupChecked, [], { what: 'the project open', timeout: 30000 });
  return p;
}
const synth = (page) => page.eval(async () => (await import('/js/implement.js')).runImpl('gates', ['synth']));
const marks = (page) => page.eval(() => ({ status: { ...window.SilinxApp.S.status }, icon: document.querySelector('#procs li[data-proc="synth"] > .row .status')?.innerHTML ?? null }));
const tables = (page) => page.eval(() => [...(window.SilinxApp.findDoc('summary')?.el.querySelectorAll('.summary-table') || [])].map((t) => t.textContent));
const count = (text, re) => text.split('\n').filter((l) => re.test(l)).length;

uiTest('#4002 a viewer follows the owner\'s runs: the marks, the run\'s lines once each, the Design Summary, a report the owner opens', E, async (page) => {
  await makeProject(env, { name: 'GatesRuns', template: 'gates' });
  // (the Silinx toolchain's synthesis: no ISE here)
  const pj = await env.server.api('GET', '/api/projects/GatesRuns');
  delete pj.fileTree;
  await env.server.api('PUT', '/api/projects/GatesRuns', { ...pj, synthTool: 'silinx' });
  await page.openProject('GatesRuns');
  const link = await page.eval(async () => { const m = await import('/js/collab-share.js'); await m.startSharing('Ana'); return m.sharedLink(); });
  const fp = await join(link, 'Rui');
  try {
    await synth(page);
    const done = await page.waitFor(() => ['ok', 'warn'].includes(window.SilinxApp.S.status.synth) && window.SilinxApp.S.status.synth, [], { what: 'the owner\'s synthesis', timeout: 60000 });
    await fp.waitFor((st) => window.SilinxApp.S.status.synth === st, [done], { what: 'the viewer\'s mark', timeout: 10000 });
    assert.deepEqual(await marks(fp), await marks(page));
    // the run's lines in the viewer's console, each once
    const started = /^Started : "Synthesize/;
    await fp.waitFor(() => /Started : "Synthesize/.test(window.__console()), [], { what: 'the run\'s lines' });
    const end = await page.waitFor(() => !window.SilinxApp.S.busy && window.__console().split('\n').filter((l) => /^Process "Synthesize.*" completed successfully/.test(l)).pop(), [], { what: 'the owner\'s run\'s last line', timeout: 30000 });
    await fp.waitFor((e) => window.__console().split('\n').includes(e), [end], { what: 'the run\'s last line' });
    assert.equal(count(await fp.consoleText(), started), 1);
    // the owner's Design Summary, and the report it opens
    await page.eval(() => window.SilinxApp.openSummary());
    await fp.waitFor(() => window.Silinx.active?.id === 'summary' && window.SilinxApp.findDoc('summary').el.querySelector('.summary-table'), [], { what: 'the viewer\'s Design Summary' });
    await page.waitFor(() => window.SilinxApp.findDoc('summary')?.el.querySelector('.summary-table'), [], { what: 'the owner\'s' });
    const theirs = await tables(page);
    assert.match(theirs[0], /Implementation State:Synthesized/);
    await fp.waitFor((t) => JSON.stringify([...(window.SilinxApp.findDoc('summary')?.el.querySelectorAll('.summary-table') || [])].map((x) => x.textContent)) === t, [JSON.stringify(theirs)], { what: 'the same Design Summary' });
    await page.eval(() => window.SilinxApp.openFile('build/open/gates_stat.txt'));
    const text = await page.waitFor(() => window.Silinx.active?.path === 'build/open/gates_stat.txt' && window.Silinx.active.editor?.getValue(), [], { what: 'the owner\'s report' });
    await fp.waitFor((t) => window.Silinx.active?.path === 'build/open/gates_stat.txt' && window.Silinx.active.editor?.getValue() === t, [text], { what: 'the viewer\'s report' });
    // a second run: its lines after the first's, once each
    await synth(page);
    await fp.waitFor(() => window.__console().split('\n').filter((l) => /^Started : "Synthesize/.test(l)).length === 2, [], { what: 'the second run\'s lines', timeout: 60000 });
    await page.waitFor(() => !window.SilinxApp.S.busy, [], { what: 'the second run ended', timeout: 60000 });
    await new Promise((r) => setTimeout(r, 1500));
    assert.equal(count(await fp.consoleText(), started), 2);
    // this computer's names never reach the viewer: a line of a run that holds the workspace's path (as given and as
    // the system resolves it) or the home folder's, its placeholders there (the server's list, GET /api/toolchain)
    const { folder } = await env.server.api('GET', '/api/workspace');
    const real = fs.realpathSync(folder);
    const home = (await env.server.api('GET', '/api/toolchain')).redact.find(([, l]) => l === '~')[0];   // (the server's home folder)
    await page.eval(async (lines) => {
      const { log } = await import('/js/console.js');
      window.SilinxApp.S.busy = true;
      for (const l of lines) log(l);
      await new Promise((r) => setTimeout(r, 1200));
      window.SilinxApp.S.busy = false;
    }, [`Bitstream: ${folder}/GatesRuns/build/gates.bit`, `Real: ${real}/GatesRuns`, `Home: ${home}/notes`]);
    await fp.waitFor(() => window.__console().includes('Bitstream: <workspace>/GatesRuns/build/gates.bit'), [], { what: 'the line, redacted' });
    const theirsText = await fp.consoleText();
    assert.match(theirsText, /Real: <workspace>\/GatesRuns\n[^]*Home: ~\/notes/);
    for (const secret of [folder, real, home]) assert.equal(theirsText.includes(secret), false, 'no path of the owner\'s computer');
    assert.deepEqual(await warnings(fp), []);
    assert.deepEqual(await warnings(page), []);
    assert.deepEqual(fp.errors, []);
  } finally { await fp.close(); await page.eval(async () => (await import('/js/collab-share.js')).stopSharing()); }
});

// #4862: the owner's run ending while the viewer is on Implement (a report of the owner's in front) does not bring the
// viewer's own Design Summary forward (#802's, the page's own): that was taken, at its next look, for the viewer's
// choice, and it browsed alone, its console then without the owner's lines (a slow page saw the run's running mark).
// The owner's page brings its own forward: the viewer follows it there.
uiTest('#4862 the owner\'s run ending while the viewer follows it on Implement: the viewer still follows, the owner\'s document in front', E, async (page) => {
  await makeProject(env, { name: 'GatesFront', template: 'gates' });
  const pj = await env.server.api('GET', '/api/projects/GatesFront');
  delete pj.fileTree;
  await env.server.api('PUT', '/api/projects/GatesFront', { ...pj, synthTool: 'silinx' });
  await page.openProject('GatesFront');
  await synth(page);
  await page.waitFor(() => ['ok', 'warn'].includes(window.SilinxApp.S.status.synth) && !window.SilinxApp.S.busy, [], { what: 'the owner\'s synthesis', timeout: 60000 });
  const link = await page.eval(async () => { const m = await import('/js/collab-share.js'); await m.startSharing('Ana'); return m.sharedLink(); });
  const fp = await join(link, 'Rui');
  try {
    await page.eval(() => window.SilinxApp.openSummary());
    await page.eval(() => window.SilinxApp.openFile('build/open/gates_stat.txt'));
    await fp.waitFor(() => window.Silinx.active?.path === 'build/open/gates_stat.txt', [], { what: 'the owner\'s report in front at the viewer\'s' });
    const done = await page.eval(() => window.SilinxApp.S.status.synth);
    // a run of the owner's, its running mark seen by the viewer, then its end
    await page.eval(() => { const S = window.SilinxApp.S; S.busy = true; S.status.synth = 'running'; });
    await fp.waitFor(() => window.SilinxApp.S.status.synth === 'running', [], { what: 'the viewer sees it running' });
    await page.eval((d) => { const S = window.SilinxApp.S; S.status.synth = d; S.busy = false; }, done);
    await fp.waitFor((d) => window.SilinxApp.S.status.synth === d, [done], { what: 'the viewer sees it end' });
    await new Promise((r) => setTimeout(r, 2000));   // (a few looks of the follower's)
    const front = await page.eval(() => window.Silinx.active?.id);
    await fp.waitFor((id) => window.Silinx.active?.id === id, [front], { what: 'the owner\'s document in front at the viewer\'s' });
    assert.equal(await fp.eval(() => document.querySelector('.collab-presence .collab-btn')?.textContent), 'Following Ana');
    assert.doesNotMatch(await fp.consoleText(), /Browsing alone/);
    assert.deepEqual(await warnings(fp), []);
    assert.deepEqual(await warnings(page), []);
    assert.deepEqual(fp.errors, []);
  } finally { await fp.close(); await page.eval(async () => (await import('/js/collab-share.js')).stopSharing()); }
});
