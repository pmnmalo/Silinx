// UI: Undo in a project shared live with an editor (#5739, phase 1 of #5743): the owner's Undo of a command of theirs
// (Edit ▸ Undo) reverts the command's own change only, merged into the project as it is now: a line the editor wrote
// since in the same file stays, on the disk and in both editors; Redo makes the command's change again, the editor's
// line still there; a change of the editor's in the same lines refuses the Undo, said in the console (in English and in
// Portuguese), nothing written. The owner's save of a file its editor has open keeps the editor's change that arrived
// meanwhile. An editor's own command undone on its page (#5760): its change reverted, the owner's later one kept. The
// exact console lines; no warnings but those asserted.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject, readWs } from './harness.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;

const TOP = 'library ieee;\nuse ieee.std_logic_1164.all;\n\nentity top is\n  port (a : in std_logic; y : out std_logic);\nend top;\n\narchitecture rtl of top is\nbegin\n  y <= not a;\nend rtl;\n';
const PASS = 'library ieee;\nuse ieee.std_logic_1164.all;\n\nentity pass1 is\n  port (a : in std_logic; y : out std_logic);\nend pass1;\n\narchitecture rtl of pass1 is\nbegin\n  y <= a;\nend rtl;\n';
const P = 'src/pass1.vhd';
const warnings = async (page) => (await page.consoleText()).split('\n').map((l) => l.trim()).filter((l) => /^(WARNING|AVISO|ERROR|ERRO)/.test(l));
const type = (page, line, ch, s) => page.eval((l, c, t) => { const ed = window.Silinx.active.editor; ed.setCursor({ line: l, ch: c }); ed.replaceSelection(t); }, line, ch, s);
// a command of the owner's (recorded as Rename… is: one step of the project's history) writing the file
const command = (page, text) => page.eval(async (p, t) => {
  const [{ runAction }, { api }] = await Promise.all([import('/js/ui.js'), import('/js/api.js')]);
  await runAction('Rename…', () => api.writeFile(window.Silinx.project.name, p, t));
}, P, text);
const until = async (fn, what, ms = 10000) => { for (let t = Date.now(); Date.now() - t < ms;) { if (await fn()) return; await new Promise((r) => setTimeout(r, 100)); } assert.fail(`timed out: ${what}`); };

uiTest('#5739 the owner\'s Undo of a command in a project an editor edits live: the command\'s change only, the editor\'s kept; an overlap refused, said; Portuguese', E, async (page) => {
  await makeProject(env, { name: 'Undo', top: 'top', files: { 'src/top.vhd': TOP, [P]: PASS } });
  await page.openProject('Undo');
  const edit = await page.eval(async () => { const m = await import('/js/collab-share.js'); await m.startSharing('Ana'); return m.editorsLink(); });
  const ep = await env.newPage(env.server.url);
  try {
    await ep.waitFor(() => window.SilinxApp && window.Silinx?.startupChecked, [], { what: 'app boot' });
    await ep.goto(`${new URL(edit).origin}/?f=1${new URL(edit).hash}`);
    await ep.waitDialog('Follow a Shared Project');
    await ep.fill('.dlg-overlay input[data-field=name]', 'Rui');
    await ep.dialogButton('Follow');
    await ep.waitFor(() => window.Silinx?.project?.name === 'Undo' && window.Silinx.startupChecked, [], { what: 'the project open', timeout: 30000 });
    await page.waitConsole(/^Rui edits your project "Undo" with you\.$/m);
    // Ana's command changes the entity's comment line; Rui, with the file open, writes a line of his own further down
    const ana = PASS.replace('entity pass1 is\n', '-- renamed by Ana\nentity pass1 is\n');
    await command(page, ana);
    await ep.eval((p) => window.SilinxApp.openFile(p), P);
    await ep.waitFor((t) => window.Silinx.active?.path === 'src/pass1.vhd' && window.Silinx.active.editor.getValue() === t, [ana], { what: 'Ana\'s command at Rui\'s' });
    await new Promise((r) => setTimeout(r, 700));
    await type(ep, 10, 0, '  -- by Rui\n');
    const both = ana.replace('  y <= a;\n', '  -- by Rui\n  y <= a;\n');
    await until(async () => await readWs(env, 'Undo', P) === both, 'Rui\'s line on the disk');
    // Ana's Undo (Edit ▸ Undo Rename): her line gone, Rui's kept, on the disk and in Rui's editor
    await page.menu('Edit', 'Undo Rename');
    await page.waitConsole(/^Undo: Rename\.$/m);
    const undone = PASS.replace('  y <= a;\n', '  -- by Rui\n  y <= a;\n');
    await until(async () => await readWs(env, 'Undo', P) === undone, 'the Undo merged on the disk');
    await ep.waitFor((t) => window.Silinx.active.editor.getValue() === t, [undone], { what: 'the Undo merged at Rui\'s' });
    // Redo: her line again, Rui's still there
    await page.menu('Edit', 'Redo Rename');
    await page.waitConsole(/^Redo: Rename\.$/m);
    await until(async () => await readWs(env, 'Undo', P) === both, 'the Redo merged on the disk');
    await ep.waitFor((t) => window.Silinx.active.editor.getValue() === t, [both], { what: 'the Redo merged at Rui\'s' });
    // Rui changes Ana's line too: her Undo refused, said, nothing written
    await type(ep, 3, 0, '-- and Rui\'s word on it\n');
    const theirs = both.replace('-- renamed by Ana\n', '-- and Rui\'s word on it\n-- renamed by Ana\n');
    await until(async () => await readWs(env, 'Undo', P) === theirs, 'Rui\'s second line on the disk');
    // (a change next to hers: the same place, as git's merge has it)
    await page.menu('Edit', 'Undo Rename');
    const refused = 'WARNING: Undo: Rename: not undone: src/pass1.vhd changed since in the same places; the project kept as it is.';
    await page.waitConsole(/^WARNING: Undo: Rename: not undone: src\/pass1\.vhd changed since in the same places; the project kept as it is\.$/m);
    assert.equal(await readWs(env, 'Undo', P), theirs);
    assert.equal(await ep.eval(() => window.Silinx.active.editor.getValue()), theirs);
    // in Portuguese
    await page.eval(async () => (await import('/js/i18n.js')).setLanguage('pt'));
    await page.menu('Editar', 'Anular Mudar o Nome');
    await page.waitConsole(/^WARNING: Anular: Mudar o Nome: não anulado: src\/pass1\.vhd alterado desde então nos mesmos sítios; o projeto mantido como está\.$/m);
    await page.eval(async () => (await import('/js/i18n.js')).setLanguage('en'));
    // the owner's save of the file open in her editor, its text read before Rui's next line arrived: the shared text
    // (with his line) kept, on the disk and at both, never the save's over it
    await page.eval((p) => window.SilinxApp.openFile(p), P);
    await page.waitFor((t) => window.Silinx.active?.path === 'src/pass1.vhd' && window.Silinx.active.editor.getValue() === t, [theirs], { what: 'the file open at Ana\'s' });
    await new Promise((r) => setTimeout(r, 700));
    await type(ep, 0, 0, '-- Rui\'s header\n');
    const last = `-- Rui's header\n${theirs}`;
    await page.waitFor((t) => window.Silinx.active.editor.getValue() === t, [last], { what: 'Rui\'s header at Ana\'s' });
    await page.eval(async (p, stale) => {
      const { api } = await import('/js/api.js');
      const d = window.Silinx.active;
      d._saving = Promise.resolve();
      try { await api.writeFile(window.Silinx.project.name, p, stale); } finally { d._saving = null; }
    }, P, theirs);
    await until(async () => await readWs(env, 'Undo', P) === last, 'the shared text written over the stale save');
    await new Promise((r) => setTimeout(r, 500));
    assert.equal(await page.eval(() => window.Silinx.active.editor.getValue()), last);
    assert.equal(await ep.eval(() => window.Silinx.active.editor.getValue()), last);
    // no warnings but those: the project untrusted by Rui's first change, the refusal (said twice, in English and
    // in Portuguese: the distinct lines compared)
    const untrusted = 'WARNING: Project "Undo" was changed by an editor of its shared link: it is edited, checked, simulated and implemented with the Silinx toolchain; Xilinx ISE and programming a board or a PROM run only once you trust it. Trust Project';
    assert.deepEqual([...new Set(await warnings(page))], [untrusted, refused]);
    assert.deepEqual(await warnings(ep), []);
  } finally { await ep.close(); await page.eval(async () => (await import('/js/collab-share.js')).stopSharing()); }
});

uiTest('#5760 an editor\'s own command undone on its page: its change only, the owner\'s later one kept; Redo; Portuguese', E, async (page) => {
  await makeProject(env, { name: 'EdUndo', top: 'top', files: { 'src/top.vhd': TOP, [P]: PASS } });
  await page.openProject('EdUndo');
  const edit = await page.eval(async () => { const m = await import('/js/collab-share.js'); await m.startSharing('Ana'); return m.editorsLink(); });
  const ep = await env.newPage(env.server.url);
  try {
    await ep.waitFor(() => window.SilinxApp && window.Silinx?.startupChecked, [], { what: 'app boot' });
    await ep.goto(`${new URL(edit).origin}/?f=1${new URL(edit).hash}`);
    await ep.waitDialog('Follow a Shared Project');
    await ep.fill('.dlg-overlay input[data-field=name]', 'Rui');
    await ep.dialogButton('Follow');
    await ep.waitFor(() => window.Silinx?.project?.name === 'EdUndo' && window.Silinx.startupChecked, [], { what: 'the project open', timeout: 30000 });
    await page.waitConsole(/^Rui edits your project "EdUndo" with you\.$/m);
    // Rui's command (recorded on his page, through the room), then Ana's line further down
    const rui = PASS.replace('entity pass1 is\n', '-- renamed by Rui\nentity pass1 is\n');
    await command(ep, rui);
    await until(async () => await readWs(env, 'EdUndo', P) === rui, 'Rui\'s command on the owner\'s disk');
    const both = rui.replace('  y <= a;\n', '  -- by Ana\n  y <= a;\n');
    await page.eval(async (p, t) => { const { api } = await import('/js/api.js'); await api.writeFile('EdUndo', p, t); }, P, both);
    await until(async () => await ep.eval((p) => window.Silinx.project && window.SilinxApp && (async () => { const { api } = await import('/js/api.js'); return api.readFile('EdUndo', p); })(), P) === both, 'Ana\'s line at Rui\'s');
    // Rui's Undo (Edit ▸ Undo Rename): his line gone, Ana's kept, on the owner's disk
    await ep.menu('Edit', 'Undo Rename');
    await ep.waitConsole(/^Undo: Rename\.$/m);
    const undone = PASS.replace('  y <= a;\n', '  -- by Ana\n  y <= a;\n');
    await until(async () => await readWs(env, 'EdUndo', P) === undone, 'Rui\'s Undo merged on the owner\'s disk');
    // Redo: his line again
    await ep.menu('Edit', 'Redo Rename');
    await ep.waitConsole(/^Redo: Rename\.$/m);
    await until(async () => await readWs(env, 'EdUndo', P) === both, 'Rui\'s Redo on the owner\'s disk');
    // in Portuguese, at Rui's: the menu's Undo of his command
    await ep.eval(async () => (await import('/js/i18n.js')).setLanguage('pt'));
    await ep.menu('Editar', 'Anular Mudar o Nome');
    await ep.waitConsole(/^Anular: Mudar o Nome\.$/m);
    await until(async () => await readWs(env, 'EdUndo', P) === undone, 'Rui\'s Undo again');
    await ep.eval(async () => (await import('/js/i18n.js')).setLanguage('en'));
    // no warnings at Rui's; at Ana's, the project untrusted by Rui's change only
    assert.deepEqual(await warnings(ep), []);
    const w = await warnings(page);
    assert.equal(w.length, 1, w.join('\n'));
    assert.match(w[0], /^WARNING: Project "EdUndo" was changed by an editor of its shared link/);
  } finally { await ep.close(); await page.eval(async () => (await import('/js/collab-share.js')).stopSharing()); }
});
