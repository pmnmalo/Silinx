// UI: the open project kept as it is on disk (#2843). What the MCP server (another process, the same functions of
// server/projects.js) changes in the project shows up without opening it again: a source written, its editor and the
// Design pane updated; a new source, its row in the Design pane; a source changed in the editor and on disk, the
// question asked (in Portuguese too), each answer kept; a run made outside the page, the processes' marks and the
// Design Summary updated. Both interfaces; no warnings.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { setupUi, uiTest, makeProject, readWs, writeWs } from './harness.js';

let env, P;
before(async () => {
  env = await setupUi();
  // (the MCP server's own functions, on the server's workspace)
  process.env.SILINX_WORKSPACE = env.server.workspace;
  P = await import('../../server/projects.js');
});
after(async () => { await env?.teardown?.(); });
const E = () => env;

const A = (port = 'y') => `library ieee; use ieee.std_logic_1164.all;\nentity a is port (x : in std_logic; ${port} : out std_logic); end a;\narchitecture r of a is begin ${port} <= x; end r;\n`;
const C = 'module c(input x, output y); assign y = ~x; endmodule\n';
const warnings = (page) => page.console.filter((c) => c.type === 'warning' || c.type === 'warn').map((c) => c.text);
const editorText = (page, path) => page.eval((p) => window.SilinxApp.S.docs.find((d) => d.path === p)?.editor?.getValue(), path);
// a change of the user in the editor, not saved yet (its autosave held: the disk's change comes first)
const editUnsaved = (page, path, text) => page.eval((p, t) => {
  const d = window.SilinxApp.S.docs.find((o) => o.path === p);
  d.editor.setValue(t);
  clearTimeout(d._autosave);
  return d.dirty;
}, path, text);

uiTest('#2843 a source written and one made outside the page: its editor and the Design pane updated; one deleted, its editor closed; the page\'s own save not told back', E, async (page) => {
  await makeProject(env, { name: 'WatchPj', top: 'a', files: { 'src/a.vhd': A() } });
  await page.openProject('WatchPj');
  await page.eval(() => window.SilinxApp.openFile('src/a.vhd'));
  await page.waitFor(() => !!window.SilinxApp.S.docs.find((d) => d.path === 'src/a.vhd')?.editor, [], { what: 'the editor' });
  // written by the MCP server (write_file): the editor shows it, clean; the module's ports too
  await P.writeFile('WatchPj', 'src/a.vhd', A('z'));
  await page.waitFor((t) => window.SilinxApp.S.docs.find((d) => d.path === 'src/a.vhd')?.editor?.getValue() === t, [A('z')], { what: 'the editor reloaded' });
  await page.waitConsole(/src\/a\.vhd reloaded: changed outside Silinx\./);
  assert.equal(await page.eval(() => window.SilinxApp.S.docs.find((d) => d.path === 'src/a.vhd').dirty), false);
  await page.waitFor(() => window.SilinxApp.S.modules.find((m) => m.name === 'a')?.portList?.some((p) => p.name === 'z'), [], { what: 'the module\'s new port' });
  // a new source (new_source): its row in the Design pane
  await P.writeFile('WatchPj', 'src/c.v', C);
  await page.waitFor(() => /\bc\b/.test(document.getElementById('hier').textContent) && window.SilinxApp.S.modules.some((m) => m.name === 'c'), [], { what: 'the new module\'s row' });
  await page.waitConsole(/Changed outside Silinx: .*src\/c\.v \(created\)/);
  // deleted outside (delete_file), not changed in the editor: closed
  await page.eval(() => window.SilinxApp.openFile('src/c.v'));
  await page.waitFor(() => !!window.SilinxApp.S.docs.find((d) => d.path === 'src/c.v')?.editor, [], { what: 'its editor' });
  await P.deleteFile('WatchPj', 'src/c.v');
  await page.waitFor(() => !window.SilinxApp.S.docs.some((d) => d.path === 'src/c.v') && !window.SilinxApp.S.modules.some((m) => m.name === 'c'), [], { what: 'closed, its row gone' });
  await page.waitConsole(/src\/c\.v was deleted outside Silinx: closed\./);
  // the page's own save: not told back (no reload line for it)
  const lines = () => page.eval(() => window.__console());
  const told0 = (await lines()).match(/(reloaded: changed outside Silinx|Changed outside Silinx)/g)?.length;
  await page.eval(() => { const d = window.SilinxApp.S.docs.find((o) => o.path === 'src/a.vhd'); d.editor.setValue(d.editor.getValue() + '-- mine\n'); });
  await page.waitFor(() => !window.SilinxApp.S.docs.find((d) => d.path === 'src/a.vhd').dirty, [], { what: 'saved' });
  await new Promise((r) => setTimeout(r, 1500));
  assert.equal((await lines()).match(/(reloaded: changed outside Silinx|Changed outside Silinx)/g)?.length, told0, 'the page\'s own write not told back');
  assert.equal(await readWs(env, 'WatchPj', 'src/a.vhd'), `${A('z')}-- mine\n`);
  assert.deepEqual(warnings(page), []);
});

uiTest('#2843 a source changed in the editor and on disk: which to keep asked, each answer kept; in Portuguese', E, async (page) => {
  await makeProject(env, { name: 'Clash', top: 'a', files: { 'src/a.vhd': A() } });
  await page.openProject('Clash');
  await page.eval(() => window.SilinxApp.openFile('src/a.vhd'));
  await page.waitFor(() => !!window.SilinxApp.S.docs.find((d) => d.path === 'src/a.vhd')?.editor, [], { what: 'the editor' });
  // Load from Disk: the disk's text in the editor
  assert.equal(await editUnsaved(page, 'src/a.vhd', `${A()}-- editor 1\n`), true);
  await P.writeFile('Clash', 'src/a.vhd', `${A()}-- disk 1\n`);
  assert.equal(await page.waitDialog('File Changed on Disk'), 'File Changed on Disk');
  assert.match(await page.eval(() => document.querySelector('.dlg-overlay .dlg-body').textContent), /src\/a\.vhd.*This file was changed outside Silinx, and it has changes in the editor not saved yet\.\s*Which version do you keep\?/);
  await page.dialogButton('Load from Disk');
  await page.waitNoDialog();
  await page.waitFor((t) => window.SilinxApp.S.docs.find((d) => d.path === 'src/a.vhd').editor.getValue() === t, [`${A()}-- disk 1\n`], { what: 'the disk\'s text' });
  assert.equal(await page.eval(() => window.SilinxApp.S.docs.find((d) => d.path === 'src/a.vhd').dirty), false);
  // Keep the Editor's, in Portuguese: the editor's text written over the disk's
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('pt'));
  try {
    await editUnsaved(page, 'src/a.vhd', `${A()}-- editor 2\n`);
    await P.writeFile('Clash', 'src/a.vhd', `${A()}-- disk 2\n`);
    assert.equal(await page.waitDialog('Ficheiro Alterado no Disco'), 'Ficheiro Alterado no Disco');
    assert.match(await page.eval(() => document.querySelector('.dlg-overlay .dlg-body').textContent), /Este ficheiro foi alterado fora do Silinx e tem alterações no editor ainda não guardadas\.\s*Que versão mantém\?/);
    assert.deepEqual(await page.eval(() => [...document.querySelectorAll('.dlg-overlay .dlg-buttons button')].map((b) => b.textContent)), ['Manter a do Editor', 'Carregar do Disco']);
    await page.dialogButton('Manter a do Editor');
    await page.waitNoDialog();
  } finally {
    await page.eval(async () => (await import('/js/i18n.js')).setLanguage('en'));
  }
  await page.waitFor(() => !window.SilinxApp.S.docs.find((d) => d.path === 'src/a.vhd').dirty, [], { what: 'saved' });
  assert.equal(await readWs(env, 'Clash', 'src/a.vhd'), `${A()}-- editor 2\n`);
  assert.equal(await editorText(page, 'src/a.vhd'), `${A()}-- editor 2\n`);
  await page.waitConsole(/src\/a\.vhd: the editor's version kept, written over the disk's\./);
  assert.deepEqual(warnings(page), []);
});

uiTest('#2843 a run made outside the page: the processes\' marks and the Design Summary updated', E, async (page) => {
  await makeProject(env, { name: 'RunOut', template: 'blinky', board: 'basys2' });
  await page.openProject('RunOut');
  const top = await page.eval(() => window.SilinxApp.S.project.top);
  await page.eval(() => window.SilinxApp.openSummary());
  await page.waitFor(() => !!window.SilinxApp.findDoc('summary'), [], { what: 'the Design Summary' });
  assert.equal(await page.eval(() => window.SilinxApp.S.status.synth ?? null), null, 'not synthesized yet');
  // the MCP server's run_process synthesize writes the run's summary
  const SYNTH = { tool: 'Yosys', cells: 12, warnings: 0, errors: 0, utilization: [{ id: 'luts', name: 'Number of 4 input LUTs', used: 15, total: 4896, percent: 1 }] };
  await writeWs(env, 'RunOut', 'build/reports.json', JSON.stringify({ source: 'open', top, synthesis: SYNTH, simModels: {}, files: {}, summary: { synthesized: true } }));
  await page.waitFor(() => window.SilinxApp.S.status.synth === 'ok', [], { what: 'Synthesize marked done' });
  await page.waitConsole(/A run made outside Silinx: the processes' marks and the Design Summary updated\./);
  await page.waitFor(() => /Implementation State:\s*Synthesized/.test(window.SilinxApp.findDoc('summary').el.textContent) && /Device Utilization Summary \(after synthesis\)/.test(window.SilinxApp.findDoc('summary').el.textContent), [], { what: 'the summary after synthesis' });
  // kept for the next opening (the page's own write of its marks: not told back)
  let saved = null;
  for (let k = 0; k < 50 && saved?.status?.synth !== 'ok'; k++) { await new Promise((r) => setTimeout(r, 100)); try { saved = JSON.parse(await readWs(env, 'RunOut', 'build/silinx-status.json')); } catch { /* not yet */ } }
  assert.equal(saved?.status?.synth, 'ok');
  assert.deepEqual(warnings(page), []);
});

// #3972 regression: with the same project in two tabs, a save in one was not told to the other (every request of a page
// was taken as known to every page), whose next save replaced it, unasked. Now told to the other tab, as another
// process's change is: an editor with no changes of its own reloaded; one with changes, which to keep asked (in
// Portuguese too); the tab that saved not told back, and the two tabs not telling each other over and over.
uiTest('#3972 the same project in two tabs: a save in one is told to the other, its editor reloaded or which to keep asked; in Portuguese', E, async (page) => {
  await makeProject(env, { name: 'TwoTabs', top: 'a', files: { 'src/a.vhd': A() } });
  const other = await env.newPage(undefined, { sibling: page });
  try {
    for (const p of [page, other]) {
      await p.openProject('TwoTabs');
      await p.eval(() => window.SilinxApp.openFile('src/a.vhd'));
      await p.waitFor(() => !!window.SilinxApp.S.docs.find((d) => d.path === 'src/a.vhd')?.editor, [], { what: 'the editor' });
    }
    // (the headlines only: each change told once, its reload's line after it)
    const headlines = (p) => p.eval(() => window.__console().match(/^Changed in another tab:/gm)?.length || 0);
    // A saves: B's editor, with no changes of its own, shows it, clean
    await page.eval((t) => { window.SilinxApp.S.docs.find((d) => d.path === 'src/a.vhd').editor.setValue(t); }, `${A()}-- tab A\n`);
    await page.waitFor(() => !window.SilinxApp.S.docs.find((d) => d.path === 'src/a.vhd').dirty, [], { what: 'A saved' });
    await other.waitFor((t) => window.SilinxApp.S.docs.find((d) => d.path === 'src/a.vhd')?.editor?.getValue() === t, [`${A()}-- tab A\n`], { what: 'B\'s editor reloaded' });
    await other.waitConsole(/src\/a\.vhd reloaded: changed in another tab\./);
    await other.waitConsole(/Changed in another tab: src\/a\.vhd\./);
    assert.equal(await other.eval(() => window.SilinxApp.S.docs.find((d) => d.path === 'src/a.vhd').dirty), false);
    // B edits, not saved yet, and A saves again: B asked which to keep, in Portuguese
    await other.eval(async () => (await import('/js/i18n.js')).setLanguage('pt'));
    try {
      assert.equal(await editUnsaved(other, 'src/a.vhd', `${A()}-- tab B\n`), true);
      await page.eval((t) => { window.SilinxApp.S.docs.find((d) => d.path === 'src/a.vhd').editor.setValue(t); }, `${A()}-- tab A again\n`);
      await page.waitFor(() => !window.SilinxApp.S.docs.find((d) => d.path === 'src/a.vhd').dirty, [], { what: 'A saved again' });
      assert.equal(await other.waitDialog('Ficheiro Alterado no Disco'), 'Ficheiro Alterado no Disco');
      assert.match(await other.eval(() => document.querySelector('.dlg-overlay .dlg-body').textContent), /src\/a\.vhd.*Este ficheiro foi alterado noutro separador e tem alterações no editor ainda não guardadas\.\s*Que versão mantém\?/);
      await other.dialogButton('Manter a do Editor');
      await other.waitNoDialog();
    } finally {
      await other.eval(async () => (await import('/js/i18n.js')).setLanguage('en'));
    }
    // B's kept and written: on disk, and told to A, whose editor reloads it
    await other.waitFor(() => !window.SilinxApp.S.docs.find((d) => d.path === 'src/a.vhd').dirty, [], { what: 'B saved' });
    await other.waitConsole(/src\/a\.vhd: the editor's version kept, written over the disk's\./);
    await page.waitFor((t) => window.SilinxApp.S.docs.find((d) => d.path === 'src/a.vhd')?.editor?.getValue() === t, [`${A()}-- tab B\n`], { what: 'A\'s editor reloaded' });
    assert.equal(await readWs(env, 'TwoTabs', 'src/a.vhd'), `${A()}-- tab B\n`);
    // both tabs save the file at once: whichever is written last, the other tab is told, and both show the disk's text
    const before = [await headlines(page), await headlines(other)];
    await Promise.all([page, other].map((p, k) => p.eval((t) => {
      const d = window.SilinxApp.S.docs.find((o) => o.path === 'src/a.vhd');
      d.editor.setValue(t);
      clearTimeout(d._autosave);
      return window.SilinxApp.saveAll();
    }, `${A()}-- at once ${k}\n`)));
    for (const p of [page, other]) await p.waitFor(() => !window.SilinxApp.S.docs.find((d) => d.path === 'src/a.vhd').dirty, [], { what: 'saved at once' });
    const disk = await readWs(env, 'TwoTabs', 'src/a.vhd');
    assert.match(disk, /-- at once [01]\n$/);
    for (const p of [page, other]) await p.waitFor((t) => window.SilinxApp.S.docs.find((d) => d.path === 'src/a.vhd').editor.getValue() === t, [disk], { what: 'each editor the disk\'s text' });
    // each told of the other's write once (the one written last already shows the disk's text, told later, #4859)
    for (const [k, p] of [page, other].entries()) await p.waitFor((n) => (window.__console().match(/^Changed in another tab:/gm)?.length || 0) > n, [before[k]], { what: 'told of the other tab\'s write' });
    assert.equal(await other.eval(() => !!document.querySelector('.dlg-overlay')), false, 'no File Changed on Disk');
    // settled: neither tab told again (the reloads are not saves), nor of its own saves
    const [a0, b0] = [await headlines(page), await headlines(other)];
    await new Promise((r) => setTimeout(r, 2000));
    assert.deepEqual([await headlines(page), await headlines(other)], [a0, b0]);
    assert.deepEqual(await page.eval(() => window.__console().match(/(?:reloaded|Changed)[^\n]*outside Silinx/g)), null);
    assert.equal(await editorText(other, 'src/a.vhd'), disk);
    assert.deepEqual([warnings(page), warnings(other)], [[], []]);
  } finally { await other.close?.(); }
});

// #4859: two tabs saving at once, the server tells the second writer the first one's write while its own save is on its
// way. That tab waits for its save, reads the disk again and finds its own text: no File Changed on Disk, nothing
// reloaded; the other tab is told of its write and shows it. (The second tab's write held back in the page here, so the
// other's notice always comes first.)
uiTest('#4859 two tabs: a save on its way when the other tab\'s write is told: waited for, no File Changed on Disk asked', E, async (page) => {
  await makeProject(env, { name: 'TwoSaving', top: 'a', files: { 'src/a.vhd': A() } });
  const other = await env.newPage(undefined, { sibling: page });
  try {
    for (const p of [page, other]) {
      await p.openProject('TwoSaving');
      await p.eval(() => window.SilinxApp.openFile('src/a.vhd'));
      await p.waitFor(() => !!window.SilinxApp.S.docs.find((d) => d.path === 'src/a.vhd')?.editor, [], { what: 'the editor' });
    }
    // B's write sent once A's is told to it
    await other.eval(async () => {
      const { api } = await import('/js/api.js');
      const write = api.writeFile;
      window.__toldA = new Promise((r) => { window.__toldAResolve = r; });
      api.writeFile = async (...a) => { await window.__toldA; api.writeFile = write; return write(...a); };
    });
    const B = `${A()}-- B, saved last\n`, Atext = `${A()}-- A, saved first\n`;
    const saving = other.eval((t) => {
      const d = window.SilinxApp.S.docs.find((o) => o.path === 'src/a.vhd');
      d.editor.setValue(t);
      clearTimeout(d._autosave);
      window.SilinxApp.saveAll();
    }, B);
    await saving;
    await other.waitFor(() => !!window.SilinxApp.S.docs.find((d) => d.path === 'src/a.vhd')._saving, [], { what: 'B\'s save on its way' });
    await page.eval((t) => {
      const d = window.SilinxApp.S.docs.find((o) => o.path === 'src/a.vhd');
      d.editor.setValue(t);
      clearTimeout(d._autosave);
      return window.SilinxApp.saveAll();
    }, Atext);
    await other.waitConsole(/^Changed in another tab: src\/a\.vhd\.$/m);
    await other.eval(() => window.__toldAResolve());
    await other.waitFor(() => !window.SilinxApp.S.docs.find((d) => d.path === 'src/a.vhd')._saving, [], { what: 'B saved' });
    await page.waitFor((t) => window.SilinxApp.S.docs.find((d) => d.path === 'src/a.vhd').editor.getValue() === t, [B], { what: 'A\'s editor reloaded' });
    assert.equal(await readWs(env, 'TwoSaving', 'src/a.vhd'), B);
    assert.equal(await other.eval(() => !!document.querySelector('.dlg-overlay')), false, 'no File Changed on Disk');
    assert.equal(await editorText(other, 'src/a.vhd'), B);
    assert.equal(await other.eval(() => window.SilinxApp.S.docs.find((d) => d.path === 'src/a.vhd').dirty), false);
    const lines = (p) => p.eval(() => window.__console().split('\n').filter((l) => /another tab|kept|reloaded/.test(l)));
    assert.deepEqual(await lines(other), ['Changed in another tab: src/a.vhd.']);
    assert.deepEqual(await lines(page), ['Changed in another tab: src/a.vhd.', 'src/a.vhd reloaded: changed in another tab.']);
    assert.deepEqual([warnings(page), warnings(other)], [[], []]);
  } finally { await other.close?.(); }
});

// #4873: another page's save of the file runs past the server's wait (a request of another client held here, its text
// sent 3 s later); this page's save, held anyway, writes first. Their changes not told apart, both pages are told: this
// page's editor shows the later text on disk (told to neither before: the editor left with a text no longer on disk)
uiTest('#4873 two pages\' saves overlapping: the later write on disk told to the page, its editor reloaded', E, async (page) => {
  await makeProject(env, { name: 'Overlap', top: 'a', files: { 'src/a.vhd': A() } });
  await page.openProject('Overlap');
  await page.eval(() => window.SilinxApp.openFile('src/a.vhd'));
  await page.waitFor(() => !!window.SilinxApp.S.docs.find((d) => d.path === 'src/a.vhd')?.editor, [], { what: 'the editor' });
  const later = `${A()}-- the other page's, written last\n`;
  // the other page's request: its headers now (the project held), its text after 3 s
  const { url } = env.server;
  const other = new Promise((resolve, reject) => {
    const req = http.request(`${url}/api/projects/Overlap/file?path=src/a.vhd`, { method: 'PUT', headers: { 'Content-Type': 'text/plain', 'X-Silinx-Client': 'another-page' } }, (res) => { res.resume(); res.on('end', () => resolve(res.statusCode)); });
    req.on('error', reject);
    req.flushHeaders();
    setTimeout(() => req.end(later), 3000);
  });
  await new Promise((r) => setTimeout(r, 300));
  await page.eval((t) => {
    const d = window.SilinxApp.S.docs.find((o) => o.path === 'src/a.vhd');
    d.editor.setValue(t);
    clearTimeout(d._autosave);
    return window.SilinxApp.saveAll();
  }, `${A()}-- this page's\n`);
  assert.equal(await other, 200);
  assert.equal(await readWs(env, 'Overlap', 'src/a.vhd'), later);
  await page.waitFor((t) => window.SilinxApp.S.docs.find((d) => d.path === 'src/a.vhd').editor.getValue() === t, [later], { what: 'the editor the later text on disk' });
  await page.waitConsole(/src\/a\.vhd reloaded: changed in another tab\./);
  assert.equal(await page.eval(() => window.SilinxApp.S.docs.find((d) => d.path === 'src/a.vhd').dirty), false);
  assert.equal(await page.eval(() => !!document.querySelector('.dlg-overlay')), false, 'no File Changed on Disk');
  assert.deepEqual(warnings(page), []);
});
