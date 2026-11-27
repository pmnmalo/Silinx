// UI: a drawing a newer Silinx saved (#4756, core/doc-format.js): opened read-only, its notice at the end of its toolbar
// ("Read-only, saved by a newer Silinx"), why in the console's warnings; never saved in the older format; a project
// a newer Silinx saved, said when it opens; one in an older format said, written in the new one on its next save, a
// version kept first (#5906); in both interfaces (SILINX_UI_INTERFACE); in Portuguese.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { setupUi, uiTest, makeProject } from './harness.js';
import { newDoc } from '../../core/schdoc.js';
import { newFsm } from '../../core/fsm.js';
import { newRegmap } from '../../core/regmap.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;
const logText = (page) => page.eval(() => document.getElementById('console-log').textContent);
const count = (text, re) => (text.match(re) || []).length;
const notice = (page) => page.eval(() => document.querySelector('.doc.active [data-newer-notice], [data-newer-notice]')?.textContent ?? null);

uiTest('#4756 #5737 a schematic, a state diagram and a register map a newer Silinx saved: read-only, said; a project a newer Silinx saved, said; Portuguese', E, async (page) => {
  await makeProject(env, { name: 'Newer', files: {
    'src/a.sch.json': JSON.stringify({ ...newDoc('a', 'vhdl'), version: 99 }),
    'src/ok.sch.json': JSON.stringify(newDoc('ok', 'vhdl')),
    'src/m.fsm.json': JSON.stringify({ ...newFsm('m'), version: 5 }),
    'src/r.regs.json': JSON.stringify({ ...newRegmap('r'), version: 99 }),
  } });
  await page.openProject('Newer');
  await page.eval(() => window.SilinxApp.openSch('src/ok.sch.json'));
  await page.waitFor(() => !!window.Silinx.active?.id?.startsWith('sch:'));
  assert.equal(await notice(page), null, 'its own format: editable');
  await page.eval(() => window.SilinxApp.openSch('src/a.sch.json'));
  await page.waitFor(() => !!document.querySelector('[data-newer-notice]'));
  assert.equal(await notice(page), 'Read-only, saved by a newer Silinx');
  assert.ok((await logText(page)).includes('WARNING: a.sch.json was saved by a newer Silinx (its format 99; this one reads up to 7): opened read-only, so that it is not saved in the older format and loses nothing: update Silinx to change it'));
  assert.equal(count(await logText(page), /saved by a newer Silinx/g), 1, 'its own format\'s: nothing said');
  await page.eval(() => import('/js/drawings.js').then((m) => m.openFsm('src/m.fsm.json')));
  await page.waitFor(() => document.querySelectorAll('[data-newer-notice]').length === 2);
  assert.ok((await logText(page)).includes('WARNING: m.fsm.json was saved by a newer Silinx (its format 5; this one reads up to 1)'));
  // a register map (#5737): opened read-only too, not refused
  await page.eval(() => import('/js/drawings-regs.js').then((m) => m.openRegs('src/r.regs.json')));
  await page.waitFor(() => document.querySelectorAll('[data-newer-notice]').length === 3);
  assert.equal(await page.eval(() => window.Silinx.active?.id), 'regs:src/r.regs.json');
  assert.equal(await notice(page), 'Read-only, saved by a newer Silinx');
  assert.ok((await logText(page)).includes('WARNING: r.regs.json was saved by a newer Silinx (its format 99; this one reads up to 1): opened read-only, so that it is not saved in the older format and loses nothing: update Silinx to change it'));
  assert.ok(!(await logText(page)).includes('cannot open'), 'not refused');
  assert.equal(await page.eval(() => document.querySelector('.doc.active .regs-add, .regs-add')), null, 'no + Register: read-only');
  // a project a newer Silinx saved: said when it opens
  await makeProject(env, { name: 'NewerPj' });
  const pjFile = path.join(env.server.workspace, 'NewerPj', 'silinx.json');
  fs.writeFileSync(pjFile, JSON.stringify({ ...JSON.parse(fs.readFileSync(pjFile, 'utf8')), version: 3 }));
  await page.openProject('NewerPj');
  await page.waitFor(() => /the project was saved by a newer Silinx/.test(document.getElementById('console-log').textContent));
  assert.ok((await logText(page)).includes('WARNING: the project was saved by a newer Silinx (its format 3; this one reads up to 1): what that Silinx added to it may be lost when it is saved here: update Silinx'));
  // in Portuguese (its drawings reopened with the project, said again)
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('pt'));
  try {
    await page.openProject('Newer');
    await page.eval(() => window.SilinxApp.openSch('src/a.sch.json'));
    await page.waitFor(() => /Só de leitura, guardado por um Silinx mais recente/.test(document.querySelector('[data-newer-notice]')?.textContent || ''));
    assert.match(await logText(page), /a\.sch\.json foi guardado por um Silinx mais recente \(o seu formato 99; este lê até ao 7\): aberto só de leitura/);
    await page.eval(() => import('/js/drawings-regs.js').then((m) => m.openRegs('src/r.regs.json')));
    await page.waitFor(() => /r\.regs\.json foi guardado por um Silinx mais recente/.test(document.getElementById('console-log').textContent));
    assert.match(await logText(page), /r\.regs\.json foi guardado por um Silinx mais recente \(o seu formato 99; este lê até ao 1\): aberto só de leitura/);
  } finally {
    await page.eval(async () => (await import('/js/i18n.js')).setLanguage('en'));
  }
});

// #5906: a schematic in an older format (core/doc-envelope.js): opened editable, said in the console's information, the
// file as it was until it is saved; its first save writes the new format, a version of the project ('before a document's
// new format', the old form in it) kept first; in Portuguese
uiTest('#5906 a schematic in an older format: said, not written on open; its first save in the new one, a version kept first; Portuguese', E, async (page) => {
  const old = `${JSON.stringify({ version: 4, name: 'old', lang: 'vhdl', sheet: { w: 1700, h: 1100 }, symbols: [], wires: [], labels: [], ports: [] }, null, 1)}\n`;
  await makeProject(env, { name: 'Older', files: { 'src/old.sch.json': old } });
  const file = path.join(env.server.workspace, 'Older', 'src', 'old.sch.json');
  const index = path.join(env.server.workspace, 'Older', '.silinx', 'versions', 'index.json');
  const migrations = () => (fs.existsSync(index) ? JSON.parse(fs.readFileSync(index, 'utf8')).versions : []).filter(v => v.reason === 'before-migrate');
  await page.openProject('Older');
  await page.eval(() => window.SilinxApp.openSch('src/old.sch.json'));
  await page.waitFor(() => /old\.sch\.json is in an older format/.test(document.getElementById('console-log').textContent));
  assert.ok((await logText(page)).includes('old.sch.json is in an older format (4; this Silinx writes 7): it is read in the new one and written so on its next save, a version of the project kept first'));
  assert.ok(!(await logText(page)).includes('WARNING: old.sch.json'), 'information, not a warning');
  assert.equal(await notice(page), null, 'editable');
  // (linked to its HDL as the project opens: its generatedFile; its format as it was)
  const was = fs.readFileSync(file, 'utf8');
  const { generatedFile, ...rest } = JSON.parse(was);
  assert.deepEqual({ rest, generatedFile }, { rest: JSON.parse(old), generatedFile: 'src/old.vhd' }, 'not written in the new format on open');
  assert.deepEqual(migrations(), [], 'no version yet');
  await page.eval(() => { const d = window.Silinx.active, m = d.schEditor.getDoc(); m.name = 'old'; d.schEditor.setDoc(m); window.SilinxApp.setDirty(d, true); return window.SilinxApp.saveAll(); });
  await page.waitFor(() => !window.Silinx.active?.dirty);
  assert.equal(JSON.parse(fs.readFileSync(file, 'utf8')).version, 7, 'saved in the new format');
  const [v, ...more] = migrations();
  assert.equal(more.length, 0, 'one');
  assert.equal(fs.readFileSync(path.join(path.dirname(index), 'texts', v.files['src/old.sch.json']), 'utf8'), was, 'the old form kept');
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('pt'));
  try {
    fs.writeFileSync(file, old);
    await page.openProject('Older');
    await page.eval(() => window.SilinxApp.openSch('src/old.sch.json'));
    await page.waitFor(() => /old\.sch\.json está num formato antigo/.test(document.getElementById('console-log').textContent));
    assert.match(await logText(page), /old\.sch\.json está num formato antigo \(4; este Silinx escreve o 7\): é lido no novo e escrito assim ao guardá-lo, guardada antes uma versão do projeto/);
  } finally {
    await page.eval(async () => (await import('/js/i18n.js')).setLanguage('en'));
  }
});
