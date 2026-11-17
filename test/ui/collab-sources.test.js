// UI: an editor of a shared project changes its sources (#4418), the owner and an editor in one test, in both
// interfaces: the editor's New Source… (a module), Rename… (a module, its file following it), Remove from Project and
// Delete File…, each written by the owner's page to the disk and into its project (the Design pane's files), the
// project untrusted by the first; the owner's Add to Project seen at the editor's. The exact console lines; no warnings
// but those asserted.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { setupUi, uiTest, makeProject, readWs } from './harness.js';
import { pickSourceType, waitNewSourcePage } from './new-source-helpers.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;

const TOP = 'library ieee;\nuse ieee.std_logic_1164.all;\n\nentity top is\n  port (a : in std_logic; y : out std_logic);\nend top;\n\narchitecture rtl of top is\nbegin\n  y <= not a;\nend rtl;\n';
const PASS = 'library ieee;\nuse ieee.std_logic_1164.all;\n\nentity pass1 is\n  port (a : in std_logic; y : out std_logic);\nend pass1;\n\narchitecture rtl of pass1 is\nbegin\n  y <= a;\nend rtl;\n';
const lines = async (page, re) => (await page.consoleText()).split('\n').map((l) => l.trim()).filter((l) => re.test(l));
const warnings = (page) => lines(page, /^(WARNING|AVISO|ERROR|ERRO)/);
const onDisk = (f) => fs.access(path.join(env.server.workspace, 'Srcs', f)).then(() => true, () => false);
const listed = async (f) => JSON.parse(await readWs(env, 'Srcs', 'silinx.json')).files.some((x) => x.path === f);
const until = async (fn, what, ms = 15000) => { for (const t = Date.now(); !(await fn());) { if (Date.now() - t > ms) throw new Error(`timed out: ${what}`); await new Promise((r) => setTimeout(r, 100)); } };
async function fileMenu(page, file, item) {
  const i = await page.waitFor((f) => { const k = [...document.querySelectorAll('#files-page tr')].findIndex((tr) => tr.dataset.file === f); return k >= 0 ? k + 1 : 0; }, [file], { what: file }).then((k) => k - 1);
  await page.rightClick('#files-page tr', { index: i });
  await page.waitForSelector('body > .menu-popup');
  await page.click('body > .menu-popup .mi', { text: item });
}

uiTest('#4418 an editor adds, renames, removes and deletes sources: the owner\'s page writes each to the disk and its project, untrusted; the owner\'s Add to Project at the editor\'s', E, async (page) => {
  await makeProject(env, { name: 'Srcs', top: 'top', files: { 'src/top.vhd': TOP, 'src/pass1.vhd': PASS } });
  await page.openProject('Srcs');
  const edit = await page.eval(async () => { const m = await import('/js/collab-share.js'); await m.startSharing('Ana'); return m.editorsLink(); });
  const ep = await env.newPage(env.server.url);
  try {
    await ep.waitFor(() => window.SilinxApp && window.Silinx?.startupChecked, [], { what: 'app boot' });
    await ep.goto(`${new URL(edit).origin}/?f=1${new URL(edit).hash}`);
    await ep.waitDialog('Follow a Shared Project');
    await ep.fill('.dlg-overlay input[data-field=name]', 'Rui');
    await ep.dialogButton('Follow');
    await ep.waitFor(() => window.Silinx?.project?.name === 'Srcs' && window.Silinx.startupChecked, [], { what: 'the project open', timeout: 30000 });
    await page.waitConsole(/^Rui edits your project "Srcs" with you\.$/m);
    // New Source… at the editor's (a module): on the owner's disk, in its project, in the owner's page
    await ep.menu('Project', 'New Source…');
    await ep.waitDialog('New Source');
    await pickSourceType(ep, 'Module (HDL)');
    await ep.dialogButton('Next >');
    await waitNewSourcePage(ep, 'File Name and Location');
    await ep.fill('.dlg-overlay .wiz-main input[type=text]', 'blink');
    await ep.dialogButton('Next >');
    await waitNewSourcePage(ep, 'Define Module');
    await ep.dialogButton('Next >');
    await waitNewSourcePage(ep, 'Summary');
    await ep.dialogButton('Finish');
    await ep.waitNoDialog();
    await until(async () => await onDisk('src/blink.vhd') && await listed('src/blink.vhd'), 'the new source at the owner\'s');
    assert.match(await readWs(env, 'Srcs', 'src/blink.vhd'), /entity blink is/);
    await page.waitFor(() => window.Silinx.project.files.some((f) => f.path === 'src/blink.vhd') && window.Silinx.fileTree.includes('src/blink.vhd'), [], { what: 'the new source in the owner\'s page' });
    assert.deepEqual(await page.eval(() => [window.Silinx.project.trusted, window.Silinx.project.madeBy]), [false, 'editor']);
    const pj = JSON.parse(await readWs(env, 'Srcs', 'silinx.json'));
    assert.deepEqual([pj.name, pj.trusted, pj.madeBy], ['Srcs', false, 'editor']);
    // Rename… of a module at the editor's: its file following it, its text changed
    ep.eval(async () => (await import('/js/rename.js')).renameDialog('src/pass1.vhd', 'pass1')).catch(() => {});
    await ep.waitDialog('Rename');
    await ep.eval(() => { const i = document.querySelector('.dlg-overlay .form-grid input'); i.value = 'pass2'; i.dispatchEvent(new Event('input')); });
    await ep.dialogButton('Rename');
    await ep.waitNoDialog();
    await until(async () => !(await onDisk('src/pass1.vhd')) && await onDisk('src/pass2.vhd') && /entity pass2 is/.test(await readWs(env, 'Srcs', 'src/pass2.vhd')) && await listed('src/pass2.vhd') && !(await listed('src/pass1.vhd')), 'renamed at the owner\'s');
    await page.waitFor(() => window.Silinx.fileTree.includes('src/pass2.vhd') && !window.Silinx.fileTree.includes('src/pass1.vhd'), [], { what: 'renamed in the owner\'s page' });
    // Remove from Project at the editor's: out of the owner's project, the file kept
    await ep.leftTab('files');
    await fileMenu(ep, 'src/pass2.vhd', 'Remove from Project');
    await ep.waitDialog('Remove Source');
    await ep.dialogButton('Yes');
    await until(async () => !(await listed('src/pass2.vhd')), 'removed from the owner\'s project');
    assert.ok(await onDisk('src/pass2.vhd'), 'the file kept');
    // the owner's Add to Project: at the editor's
    await page.eval(async () => (await import('/js/app.js')).addToProject('src/pass2.vhd'));
    await ep.waitFor(() => window.Silinx.project.files.some((f) => f.path === 'src/pass2.vhd'), [], { what: 'added back at the editor\'s', timeout: 15000 });
    // Delete File… at the editor's: off the owner's disk (into the .trash) and its project
    await fileMenu(ep, 'src/blink.vhd', 'Delete File…');
    await ep.waitDialog('Delete File');
    await ep.dialogButton('Yes');
    await until(async () => !(await onDisk('src/blink.vhd')) && !(await listed('src/blink.vhd')), 'deleted at the owner\'s');
    await page.waitFor(() => !window.Silinx.fileTree.includes('src/blink.vhd'), [], { what: 'deleted in the owner\'s page' });
    const trash = (await fs.readdir(path.join(env.server.workspace, '.trash')).catch(() => [])).filter((d) => d.startsWith('Srcs-'));
    assert.ok((await Promise.all(trash.map((d) => fs.access(path.join(env.server.workspace, '.trash', d, 'src/blink.vhd')).then(() => true, () => false)))).includes(true), 'in the .trash');
    // the owner's console: each change said, by an editor; no warnings but the project untrusted, on either side
    const changed = await lines(page, /^Changed by an editor: /);
    assert.ok(changed.includes('Changed by an editor: src/blink.vhd (created).'), changed.join('\n'));
    assert.ok(changed.includes('Changed by an editor: src/blink.vhd (deleted).'), changed.join('\n'));
    assert.ok(changed.every((l) => /^Changed by an editor: ((silinx\.json|src\/(blink|pass1|pass2)\.vhd( \((created|deleted)\))?)(, |\.$))+$/.test(l)), changed.join('\n'));
    assert.deepEqual(await warnings(ep), []);
    assert.deepEqual(await warnings(page), ['WARNING: Project "Srcs" was changed by an editor of its shared link: it is edited, checked, simulated and implemented with the Silinx toolchain; Xilinx ISE and programming a board or a PROM run only once you trust it. Trust Project']);
    assert.deepEqual(ep.errors, []);
  } finally { await ep.close(); await page.eval(async () => (await import('/js/collab-share.js')).stopSharing()); }
});
