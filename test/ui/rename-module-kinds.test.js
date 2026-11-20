// UI: Rename of a drawn module (#4731) through core/rename-module.js, the MCP's rename_module's: a Petri net's and a
// circuit's module renamed with its file (the drawing, named after it, following it), its HDL made again by the drawing's
// kind (the interface sent anything not an ASM chart, a truth table or a state diagram to the schematic's generator, its
// error swallowed); the same files as the MCP's rename_module on a twin project; a rename refused (a reserved word) changes
// nothing. The console's line, no warnings.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject, readWs } from './harness.js';
import fs from 'node:fs/promises';
import path from 'node:path';
import { newPetri } from '../../core/petri.js';

let env, handle;
before(async () => {
  env = await setupUi();
  if (env.server?.workspace) {
    process.env.SILINX_WORKSPACE = env.server.workspace;
    ({ handle } = await import('../../server/mcp.js'));
  }
});
after(async () => { await env?.teardown?.(); });
const E = () => env;
let id = 0;
const mcp = async (name, args) => {
  const r = (await handle({ jsonrpc: '2.0', id: ++id, method: 'tools/call', params: { name, arguments: args } })).result;
  assert.equal(r.isError, false, r.content[0].text);
  return r.structuredContent;
};
const pj = (name) => env.server.api('GET', `/api/projects/${encodeURIComponent(name)}`);
const warnings = async (page) => (await page.consoleText()).split('\n').filter((l) => /^(WARNING|ERROR)\b/.test(l));

// Rename… of module `mod` (its file `file`) to `to`, as the dialog does
async function rename(page, file, mod, to) {
  page.eval(async (f, m) => (await import('/js/rename.js')).renameDialog(f, m), file, mod).catch(() => {});
  await page.waitDialog('Rename');
  await page.eval((t) => { const i = document.querySelector('.dlg-overlay .form-grid input'); i.value = t; i.dispatchEvent(new Event('input')); }, to);
  await page.dialogButton('Rename');
  await page.waitNoDialog();
}

const KINDS = [
  { kind: 'Petri net', make: async (name) => makeProject(env, { name, top: 'ctl', files: { 'src/ctl.pn.json': JSON.stringify(newPetri('ctl', 'vhdl'), null, 2) } }),
    drawing: 'src/ctl.pn.json', mod: 'ctl', to: 'ctrl', after: 'src/ctrl.pn.json' },
  { kind: 'circuit', make: async (name) => mcp('new_project_from_example', { name, example: 'breadboard' }),
    drawing: 'src/breadboard.circ.json', mod: 'breadboard', to: 'board1', after: 'src/board1.circ.json' },
];

for (const k of KINDS) {
  uiTest(`#4731 Rename of a ${k.kind}'s module: its file and its HDL made again by its kind, as the MCP's rename_module`, E, async (page) => {
    const name = `Ren_${k.mod}`, twin = `Twin_${k.mod}`;
    await k.make(name);
    await page.openProject(name);
    await page.waitFor((m) => window.Silinx.modules?.some((x) => x.name === m), [k.mod], { what: 'the module' });
    const hdl = await page.eval((m) => window.Silinx.modules.find((x) => x.name === m).file, k.mod);
    await page.waitFor((h, d) => window.Silinx.hdlToSch?.[h] === d, [hdl, k.drawing], { what: 'the drawing linked' });
    // a name taken: refused in the dialog, nothing changed
    page.eval(async (f, m) => (await import('/js/rename.js')).renameDialog(f, m), hdl, k.mod).catch(() => {});
    await page.waitDialog('Rename');
    // (the module's own name, another letter case: allowed; an HDL keyword: refused)
    await page.eval(() => { const i = document.querySelector('.dlg-overlay .form-grid input'); i.value = 'entity'; i.dispatchEvent(new Event('input')); });
    await page.dialogButton('Rename');
    await page.waitFor(() => /reserved word/i.test(document.querySelector('.dlg-overlay .hint:last-child')?.textContent || ''), [], { what: 'the refusal' });
    await page.dialogButton('Cancel');
    await page.waitNoDialog();
    assert.equal(JSON.parse(await readWs(env, name, k.drawing)).generatedFile, hdl);
    // (its twin for the MCP: a copy of the project as it is now)
    await fs.cp(path.join(env.server.workspace, name), path.join(env.server.workspace, twin), { recursive: true });
    const tj = path.join(env.server.workspace, twin, 'silinx.json');
    await fs.writeFile(tj, JSON.stringify({ ...JSON.parse(await fs.readFile(tj, 'utf8')), name: twin }, null, 2));
    // renamed
    await rename(page, hdl, k.mod, k.to);
    await page.waitConsole(new RegExp(`^Rename: module '${k.mod}' renamed to '${k.to}'`, 'm'));
    const newHdl = hdl.replace(new RegExp(`${k.mod}(\\.\\w+)$`), `${k.to}$1`);
    await page.waitFor((h, d) => window.Silinx.hdlToSch?.[h] === d, [newHdl, k.after], { what: 'the renamed drawing linked' });
    const line = (await page.consoleText()).split('\n').find((l) => /^Rename: /.test(l));
    assert.match(line, new RegExp(`^Rename: module '${k.mod}' renamed to '${k.to}' \\(\\d+ file\\(s\\) updated\\); ${k.drawing.replace('.', '\\.')} → ${k.after.replace('.', '\\.')}; ${hdl.replace('.', '\\.')} → ${newHdl.replace('.', '\\.')}\\.$`));
    const project = await pj(name);
    assert.equal(project.top, k.to);
    assert.ok(project.files.some((f) => f.path === newHdl) && !project.files.some((f) => f.path === hdl), JSON.stringify(project.files));
    // the MCP's rename_module on a twin: the same drawing and HDL text (its project's name aside)
    await mcp('rename_module', { project: twin, module: k.mod, to: k.to });
    const { readFile } = await import('../../server/projects.js');
    assert.equal(await readWs(env, name, k.after), await readFile(twin, k.after), 'the drawing');
    assert.equal(await readWs(env, name, newHdl), await readFile(twin, newHdl), 'its HDL');
    assert.match(await readWs(env, name, newHdl), new RegExp(`\\b(entity|module) ${k.to}\\b`));
    assert.deepEqual(await warnings(page), []);
  });
}
