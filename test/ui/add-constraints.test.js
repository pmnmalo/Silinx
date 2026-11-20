// UI: Add to Project of a constraints file of any family's format (#4733): the Files view's Add to Project makes an
// iCE40's PCF (and an XDC) the project's constraints when it has none, as the MCP's add_to_project does (core/
// project-entries.js); the .ucf alone did. Remove from Project leaves the project with none. No warnings.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject } from './harness.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;

async function fileMenu(page, file, item) {
  const i = await page.waitFor((f) => { const k = [...document.querySelectorAll('#files-page tr')].findIndex((tr) => tr.dataset.file === f); return k >= 0 ? k + 1 : 0; }, [file], { what: file }).then((k) => k - 1);
  await page.rightClick('#files-page tr', { index: i });
  await page.waitForSelector('body > .menu-popup');
  const items = await page.eval(() => [...document.querySelectorAll('body > .menu-popup .mi')].map((m) => m.textContent.trim()));
  assert.ok(items.includes(item), `${file}: ${items.join(' | ')}`);
  await page.click('body > .menu-popup .mi', { text: item });
}
// (the Files view's row of `file` in the project again, or not)
const association = (page, file, not) => page.waitFor((f, n) => { const t = document.querySelector(`#files-page tr[data-file="${f}"] td:nth-child(2)`)?.textContent; return t && (t === 'Not in project') === n; }, [file, not], { what: `${file} ${not ? 'not ' : ''}in the project` });
const constraints = (page) => page.eval(() => window.Silinx.project.constraints || '');
const warnings = async (page) => (await page.consoleText()).split('\n').filter((l) => /^(WARNING|ERROR)\b/.test(l));

uiTest('#4733 Add to Project: a PCF, an XDC is the project\'s constraints when it has none; Remove from Project leaves none', E, async (page) => {
  const A = 'library ieee; use ieee.std_logic_1164.all;\nentity a is port (x : in std_logic; y : out std_logic); end a;\narchitecture r of a is begin y <= x; end r;\n';
  await makeProject(env, { name: 'PcfPj', board: 'icebreaker', top: 'a', constraints: 'pins.pcf', files: { 'src/a.vhd': A, 'pins.pcf': 'set_io x 10\nset_io y 11\n', 'other.xdc': '' } });
  await page.openProject('PcfPj');
  await page.leftTab('files');
  assert.equal(await constraints(page), 'pins.pcf');
  await fileMenu(page, 'pins.pcf', 'Remove from Project');
  await page.waitDialog('Remove Source');
  await page.dialogButton('Yes');
  await page.waitFor(() => !window.Silinx.project.constraints, [], { what: 'no constraints' });
  await page.waitFor(() => document.querySelector('#files-page tr[data-file="pins.pcf"] td:nth-child(2)')?.textContent === 'Not in project', [], { what: 'not in the project' });
  await fileMenu(page, 'pins.pcf', 'Add to Project');
  await page.waitFor(() => window.Silinx.project.constraints === 'pins.pcf', [], { what: 'the PCF the constraints again' });
  await association(page, 'pins.pcf', false);
  assert.deepEqual((await env.server.api('GET', '/api/projects/PcfPj')).excluded || [], []);
  // (an XDC, the project with none)
  await fileMenu(page, 'pins.pcf', 'Remove from Project');
  await page.waitDialog('Remove Source');
  await page.dialogButton('Yes');
  await page.waitFor(() => !window.Silinx.project.constraints, [], { what: 'no constraints' });
  await association(page, 'pins.pcf', true);
  await fileMenu(page, 'other.xdc', 'Remove from Project');
  await page.waitDialog('Remove Source');
  await page.dialogButton('Yes');
  await page.waitFor(() => document.querySelector('#files-page tr[data-file="other.xdc"] td:nth-child(2)')?.textContent === 'Not in project', [], { what: 'the XDC not in the project' });
  await fileMenu(page, 'other.xdc', 'Add to Project');
  await page.waitFor(() => window.Silinx.project.constraints === 'other.xdc', [], { what: 'the XDC the constraints' });
  assert.deepEqual(await warnings(page), []);
});
