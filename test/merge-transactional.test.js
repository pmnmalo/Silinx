// Merge Contribution and Undo Merge transactional (#4757, core/merge-apply.js on server/merge-projects.js): a merge
// that stops halfway keeps the project as it was before it (another merge refused until Undo Merge puts it back); an
// undo that stops halfway is done again until it ends; both hold the project's lock (another write waits for them);
// a binary file of the project is never merged, nor written back decoded as text.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { scratchEnv } from './server-helpers.js';

let tmp;
before(async () => { tmp = fs.realpathSync(await scratchEnv('silinx-merge-tx-')); });
after(() => fs.rmSync(tmp, { recursive: true, force: true }));

const P = await import('../server/projects.js');
const { exportProjectZip, importProjectEntries } = await import('../server/project-zip.js');
const { mergeStorage } = await import('../server/merge-projects.js');
const { applyMerge, undoMerge } = await import('../core/merge-apply.js');
const { contributionOf } = await import('../core/project-merge.js');
const { gateZip } = await import('../core/import-gate.js');
const { NODE_CODEC } = await import('../server/impl-routes.js');
const S = mergeStorage(P);
const file = (name, rel) => fs.readFileSync(path.join(P.projectDir(name), rel), 'utf8');
const put = (name, rel, text) => fs.writeFileSync(path.join(P.projectDir(name), rel), text);
const contribution = async (zip) => contributionOf(await gateZip(zip, NODE_CODEC));
const tree = async (name) => Object.fromEntries(await Promise.all((await P.fileTree(name)).map(async (f) => [f, fs.readFileSync(path.join(P.projectDir(name), f)).toString('base64')])));
const BIN = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0xff, 0xfe, 0x80, 0xc3]);   // (no UTF-8 text)

// a teacher's project (gates, with a binary file), a student's copy changing two files, given back
async function setup(teacher) {
  await P.createProject({ name: teacher, template: 'gates' });
  fs.mkdirSync(path.join(P.projectDir(teacher), 'doc'), { recursive: true });
  fs.writeFileSync(path.join(P.projectDir(teacher), 'doc', 'logo.png'), BIN);
  const copy = (await exportProjectZip(P, teacher, 'silinx', { copy: true })).zip;
  const student = `${teacher}Copy`;
  await importProjectEntries(P, student, await gateZip(copy, NODE_CODEC), (m) => new Error(m));
  // (two text files no drawing makes: the test bench, the constraints)
  const srcs = ['sim/tb_gates.vhd', 'constraints/gates.ucf'];
  for (const f of srcs) put(student, f, `${file(student, f)}${f.endsWith('.ucf') ? '#' : '--'} the student's\n`);
  return { back: (await exportProjectZip(P, student, 'silinx', { copy: true })).zip, srcs };
}
// the storage, its writes failing at the n-th (once)
const failingAt = (n) => { let k = 0; return { ...S, write: (name, rel, text) => (++k === n ? Promise.reject(Object.assign(new Error('EIO: i/o error, write'), { code: 'EIO' })) : S.write(name, rel, text)) }; };

test('#4757 a merge that stops halfway: the project as it was kept; another merge refused until Undo Merge puts it back', async () => {
  const { back, srcs } = await setup('Half');
  const was = await tree('Half');
  await assert.rejects(applyMerge(failingAt(2), 'Half', await contribution(back)), /EIO/);
  assert.notDeepEqual(await tree('Half'), was, 'its first file written');
  // the merge done again: refused, the backup kept as it was
  await assert.rejects(applyMerge(S, 'Half', await contribution(back)), (e) => e.status === 409
    && e.message === "project 'Half': the last merge did not finish (some of its files may be written): Undo Merge puts the project back as it was before it, then merge again");
  const r = await undoMerge(S, 'Half');
  assert.ok(r.restored.length >= 1);
  assert.deepEqual(await tree('Half'), was, 'back as it was, byte for byte');
  const m = await applyMerge(S, 'Half', await contribution(back));
  assert.deepEqual(m.written.sort(), [...srcs].sort());
});

test('#4757 an undo that stops halfway: done again, it ends; the project as it was before the merge', async () => {
  const { back } = await setup('Undo');
  const was = await tree('Undo');
  const m = await applyMerge(S, 'Undo', await contribution(back));
  assert.equal(m.written.length, 2);
  await assert.rejects(undoMerge(failingAt(2), 'Undo'), /EIO/);
  const r = await undoMerge(S, 'Undo');
  assert.equal(r.restored.length, 1, 'the file the first undo did not put back');
  assert.deepEqual(await tree('Undo'), was);
  await assert.rejects(undoMerge(S, 'Undo'), (e) => e.status === 404, 'nothing left to undo');
  // an undo stopped halfway: a merge refused until it ends
  await applyMerge(S, 'Undo', await contribution(back));
  await assert.rejects(undoMerge(failingAt(1), 'Undo'), /EIO/);
  await assert.rejects(applyMerge(S, 'Undo', await contribution(back)), (e) => e.status === 409 && /the last Undo Merge did not finish: Undo Merge again, then merge$/.test(e.message));
  await undoMerge(S, 'Undo');
  assert.deepEqual(await tree('Undo'), was);
});

test('#4757 a binary file: never merged nor written back decoded as text; a merge and its undo keep it byte for byte', async () => {
  const { back } = await setup('Bin');
  const read = () => fs.readFileSync(path.join(P.projectDir('Bin'), 'doc', 'logo.png'));
  assert.equal((await S.read('Bin')).files['doc/logo.png'], undefined, 'not in what is merged');
  const m = await applyMerge(S, 'Bin', await contribution(back));
  assert.deepEqual(m.removed, []);
  assert.deepEqual(read(), BIN);
  await undoMerge(S, 'Bin');
  assert.deepEqual(read(), BIN);
});

test('#4757 a merge holds the project\'s lock: another write waits for it to end', async () => {
  const { back } = await setup('Locked');
  const order = [];
  let go;
  const paused = new Promise((r) => { go = r; });
  const slow = { ...S, write: async (name, rel, text) => { order.push(`merge ${rel}`); await paused; return S.write(name, rel, text); } };
  const merging = applyMerge(slow, 'Locked', await contribution(back));
  while (!order.length) await new Promise((r) => setTimeout(r, 5));
  const other = P.writeFile('Locked', 'src/other.vhd', '-- another tab\n').then(() => order.push('other write'));
  await new Promise((r) => setTimeout(r, 100));
  assert.deepEqual(order.filter((x) => x === 'other write'), [], 'waiting while the merge holds the project');
  go();
  await merging;
  await other;
  assert.equal(order.at(-1), 'other write');
  // and Undo Merge refused: the project changed since (the other write), as before
  await assert.rejects(undoMerge(S, 'Locked'), (e) => e.status === 409);
});
