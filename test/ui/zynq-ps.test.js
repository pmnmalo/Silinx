// UI (#4686, part 2b): a Zynq board's processing system in the interface. A Board project on the Zybo Z7: New Source's
// PS Program (Zynq) (none on another board) writes ps/main.c, its starter, the project's `ps`; the Design pane shows
// its PS (Cortex-A9) with its program, which is no HLS module. A System project: an FPGA node on the Zybo Z7 has its PS
// program in its Properties (none on another board), New PS Program names ps/main.c, its starter written when the
// System is saved; the node's row shows its PS. No warnings; Portuguese; both interfaces.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject, readWs } from './harness.js';
import { pickSourceType, waitNewSourcePage } from './new-source-helpers.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;
const ED = '.doc:not([hidden]) .system-editor';
const types = (page) => page.eval(() => [...document.querySelectorAll('.dlg-overlay .src-types .st')].map((e) => e.lastChild.textContent.trim()));
const rows = (page) => page.eval(() => [...document.querySelectorAll('#hier .row .lbl')].map((l) => l.textContent.trim()));
const problems = (page) => page.eval(() => [...document.querySelectorAll('#console-log .ln')].map((l) => l.textContent).filter((l) => /^(WARNING|ERROR)/.test(l)));

uiTest('#4686 a Board project on the Zybo Z7: New Source\'s PS Program, its starter, the project\'s `ps`; the Design pane\'s PS; Portuguese', E, async (page) => {
  await makeProject(env, { name: 'ZyboPs', template: 'empty', board: 'basys3' });
  await page.openProject('ZyboPs');
  await page.menu('Project', 'New Source…');
  await page.waitDialog('New Source');
  assert.ok(!(await types(page)).includes('PS Program (Zynq)'), 'no PS program on the Basys 3');
  await page.eval(() => document.querySelector('.dlg-overlay .dlg-x').click());
  await makeProject(env, { name: 'ZyboPs2', template: 'empty', board: 'zybo-z7' });
  await page.openProject('ZyboPs2');
  await page.leftTab('design');
  await page.menu('Project', 'New Source…');
  await page.waitDialog('New Source');
  await pickSourceType(page, 'PS Program (Zynq)');
  await page.dialogButton('Next >');
  await waitNewSourcePage(page, 'File Name and Location');
  await page.fill('.dlg-overlay .wiz-main input[type=text]', 'main');
  await page.dialogButton('Next >');
  await waitNewSourcePage(page, 'Summary');
  await page.dialogButton('Finish');
  await page.waitNoDialog();
  // (New Source's line, after the project's save and reload: silinx.json written, not only the page's project)
  await page.waitConsole(/^Created PS Program \(Zynq\) 'ps\/main\.c'\.$/m);
  await page.waitFor(() => window.SilinxApp.S.fileTree.includes('ps/main.c') && window.SilinxApp.S.project.ps === 'ps/main.c', [], { what: 'ps/main.c, the project\'s PS program' });
  assert.match(await readWs(env, 'ZyboPs2', 'ps/main.c'), /Hello from the Cortex-A9 of Digilent Zybo Z7/);
  assert.equal(JSON.parse(await readWs(env, 'ZyboPs2', 'silinx.json')).ps, 'ps/main.c');
  // (the Design pane: the PS, its program under it; no HLS module of it)
  await page.waitFor(() => [...document.querySelectorAll('#hier .row .lbl')].some((l) => l.textContent.trim() === 'PS'), [], { what: 'the PS\'s row' });
  const r = await rows(page);
  assert.ok(r.includes('main.c') && !r.includes('main'), r.join(', '));
  assert.deepEqual(await problems(page), []);
  // in Portuguese: the type in New Source
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('pt'));
  await page.menu('Projeto', 'Nova Fonte…');
  await page.waitDialog();
  assert.ok((await types(page)).includes('Programa do PS (Zynq)'));
  await page.eval(() => document.querySelector('.dlg-overlay .dlg-x').click());
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('en'));
  assert.deepEqual(page.console.filter((c) => c.type === 'warning' || c.type === 'warn' || c.type === 'error').map((c) => c.text), []);
});

const SYS = JSON.stringify({ format: 'silinx-system', version: 2, name: 'zynq', nodes: [
  { id: 'zybo', kind: 'fpga', module: 'uart', board: 'zybo-z7', variant: '20', interfaces: [], x: 0, y: 0 },
  { id: 'b2', kind: 'fpga', module: 'uart', board: 'basys2', variant: '250', interfaces: [], x: 300, y: 0 },
], links: [] }, null, 2);
const side = (page) => page.eval((ed) => {
  const s = document.querySelector(`${ed} .asm-side`), ps = s.querySelector('.sys-ps');
  return { title: s.querySelector('.sys-selection h3')?.textContent, ps: ps ? [...ps.options].map((o) => o.value) : null,
    hint: ps?.closest('.asm-field').querySelector('.asm-fhint')?.textContent ?? null, add: s.querySelector('.sys-new-ps')?.textContent.trim() ?? null };
}, ED);

uiTest('#4686 a System\'s Zynq node: its PS program in its Properties, New PS Program, its starter written when saved; its row\'s PS; Portuguese', E, async (page) => {
  await makeProject(env, { name: 'ZynqSys', template: 'uart', files: { 'zynq.sys.json': SYS } });
  const pj = await env.server.api('GET', '/api/projects/ZynqSys');
  delete pj.fileTree;
  await env.server.api('PUT', '/api/projects/ZynqSys', { ...pj, kind: 'system', board: null, constraints: null, top: null });
  await page.openProject('ZynqSys');
  await page.leftTab('design');
  await page.waitFor(() => [...document.querySelectorAll('#hier .row .badge')].some((b) => b.textContent === 'System'), [], { what: 'the System\'s row' });
  await page.click('#hier .row .badge', { text: 'System' });
  await page.waitFor((ed) => document.querySelector(ed), [ED], { what: 'the System editor' });
  // (the Basys 2's node: no PS)
  await page.click(`${ED} .sys-node[data-id="b2"] .sys-head`);
  await page.waitFor((ed) => document.querySelector(`${ed} .sys-selection h3`)?.textContent === 'FPGA b2', [ED], { what: 'b2\'s properties' });
  assert.deepEqual(await side(page), { title: 'FPGA b2', ps: null, hint: null, add: null });
  await page.click(`${ED} .sys-node[data-id="zybo"] .sys-head`);
  await page.waitFor((ed) => document.querySelector(`${ed} .sys-selection h3`)?.textContent === 'FPGA zybo', [ED], { what: 'zybo\'s properties' });
  assert.deepEqual(await side(page), { title: 'FPGA zybo', ps: [''], hint: 'a .c of its ps/: the Cortex-A9\'s program, its starter written when the System is saved', add: 'New PS Program' });
  // in Portuguese
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('pt'));
  await page.waitFor((ed) => document.querySelector(`${ed} .asm-side .sys-new-ps`)?.textContent.trim() === 'Novo Programa do PS', [ED], { what: 'Portuguese' });
  assert.equal((await side(page)).hint, 'um .c da sua pasta ps/: o programa do Cortex-A9, o inicial escrito quando o Sistema é guardado');
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('en'));
  await page.waitFor((ed) => document.querySelector(`${ed} .asm-side .sys-new-ps`)?.textContent.trim() === 'New PS Program', [ED], { what: 'English' });
  await page.click(`${ED} .asm-side .sys-new-ps`);
  await page.waitFor((ed) => document.querySelector(`${ed} .asm-side .sys-ps`)?.value === 'zybo/ps/main.c', [ED], { what: 'its PS program named' });
  assert.equal((await side(page)).add, null);
  await page.eval(() => window.SilinxApp.saveAll());
  await page.waitConsole(/^zynq\.sys\.json: zybo\/ps\/main\.c: the PS's starter program written$/m);
  await page.waitFor(() => window.SilinxApp.S.fileTree.includes('zybo/ps/main.c'), [], { what: 'the starter in the project' });
  assert.equal(JSON.parse(await readWs(env, 'ZynqSys', 'zynq.sys.json')).nodes[0].ps, 'zybo/ps/main.c');
  assert.match(await readWs(env, 'ZynqSys', 'zybo/ps/main.c'), /Hello from the Cortex-A9 of Digilent Zybo Z7/);
  // (the node's row: its PS, its program under it; no HLS module of it)
  await page.waitFor(() => [...document.querySelectorAll('#hier .row .lbl')].some((l) => l.textContent.trim() === 'PS'), [], { what: 'the node\'s PS row' });
  const r = await rows(page);
  assert.ok(r.includes('main.c') && !r.includes('main'), r.join(', '));
  // (the System's check: its nodes unlinked and with no pins yet, no PS problem)
  assert.deepEqual(await problems(page), ['WARNING: zybo joins nothing: no link reaches it', 'WARNING: b2 joins nothing: no link reaches it',
    'WARNING: zybo: no constraints file zybo/uart.xdc yet: its module\'s ports are on no pin of its board (its I/O Pin Planning)',
    'WARNING: b2: no constraints file b2/uart.ucf yet: its module\'s ports are on no pin of its board (its I/O Pin Planning)']);
  assert.deepEqual(page.console.filter((c) => c.type === 'warning' || c.type === 'warn' || c.type === 'error').map((c) => c.text), []);
});
