// UI: a project's documents reopened as it opens (its kept view, web/js/view-state.js) put the one in front of its view
// unless another document was brought to the front meanwhile: that one stays in front, the kept one behind it (#5627: a
// follower's file covered by the Design Summary its project's opening reopened late, on a loaded machine). The Design
// Summary of a first opening the same: behind a document already in front. In both interfaces; no warnings.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject } from './harness.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;

const warnings = async (page) => (await page.consoleText()).split('\n').map((l) => l.trim()).filter((l) => /^(WARNING|AVISO|ERROR|ERRO)/.test(l));
// the page's next frames, and a while: what an opening still did after its end
const settled = (page) => page.eval(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(r, 400)))));

uiTest('#5627 a document opened while the project\'s kept view reopens (its Design Summary held: a loaded machine) stays in front, the Design Summary behind it', E, async (page) => {
  await makeProject(env, { name: 'FrontKept', template: 'gates' });
  const p = await env.newPage(env.server.url);
  const held = [];
  const off = p.cdp.on((m) => { if (m.sessionId === p.sessionId && m.method === 'Fetch.requestPaused') held.push(m.params.requestId); });
  try {
    await p.waitFor(() => window.SilinxApp && window.Silinx?.startupChecked, [], { what: 'app boot' });
    // (the project's kept view: its Design Summary in front)
    await p.eval(() => localStorage.setItem('silinx.view.FrontKept', JSON.stringify({ open: ['summary'], active: 'summary', page: 'design', view: 'impl', split: null })));
    await p.send('Network.enable');
    await p.send('Network.setCacheDisabled', { cacheDisabled: true });
    await p.send('Fetch.enable', { patterns: [{ urlPattern: '*/js/summary.js*', requestStage: 'Request' }] });
    await p.eval(() => { window.SilinxApp.openProject('FrontKept'); });
    // (the kept view reopening: its Design Summary's module asked for, held)
    await p.waitFor(() => window.Silinx.project?.name === 'FrontKept' && document.documentElement.dataset.restoring !== undefined, [], { what: 'the kept view reopening', timeout: 30000 });
    await p.waitFor(() => !!document.querySelector('#hier .row'), [], { what: 'the Design pane' });
    assert.ok(held.length > 0, 'summary.js held');
    await p.eval(() => window.SilinxApp.openFile('src/gates.vhd'));
    await p.waitFor(() => window.Silinx.active?.id === 'file:src/gates.vhd', [], { what: 'the file in front' });
    off();
    await p.send('Fetch.disable');
    for (const id of held) await p.send('Fetch.continueRequest', { requestId: id }).catch(() => {});
    await p.waitFor(() => window.Silinx.docs.some((d) => d.id === 'summary') && document.documentElement.dataset.restoring === undefined, [], { what: 'the Design Summary reopened' });
    await settled(p);
    assert.equal(await p.eval(() => window.Silinx.active?.id), 'file:src/gates.vhd', 'the file still in front');
    assert.deepEqual(await p.eval(() => [...document.querySelectorAll('.doc:not([hidden])')].length), 1, 'one document shown');
    // (the view kept now: the file in front)
    assert.equal(await p.eval(() => JSON.parse(localStorage.getItem('silinx.view.FrontKept')).active), 'file:src/gates.vhd');
    // a first opening's Design Summary, opened behind the document already in front
    await p.eval(async () => { await window.SilinxApp.closeDoc(window.Silinx.docs.find((d) => d.id === 'summary')); });
    await p.waitFor(() => !window.Silinx.docs.some((d) => d.id === 'summary') && window.Silinx.active?.id === 'file:src/gates.vhd', [], { what: 'the Design Summary closed' });
    await p.eval(() => window.SilinxApp.openSummary({ background: true }));
    await settled(p);
    assert.deepEqual(await p.eval(() => [window.Silinx.active?.id, window.Silinx.docs.some((d) => d.id === 'summary')]), ['file:src/gates.vhd', true]);
    assert.deepEqual(await warnings(p), []);
    assert.deepEqual(p.errors, []);
  } finally { off(); await p.close(); }
});
