// Trust recorded outside the project (#4735, server/trust-store.js, server/projects.js): a project is trusted only with a
// record of its folder (and of its id, when the record names one) in the configuration folder. The first time, the
// workspace's projects trusted until then are recorded once (the migration); one untrusted stays so. Then a project the
// user makes is recorded, the MCP's and an import's are not; Trust Project records it; a rename takes the record along,
// a delete removes it. Every way a folder reaches the workspace outside Silinx is untrusted, whatever its silinx.json
// says: unzipped by hand, cloned by command-line git, restored from the workspace's .trash, put at a deleted or renamed
// project's place with another id. Its mark is no part of its silinx.json (never written there); Xilinx ISE and
// programming are refused for it, the console's notice and the refusal saying why.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { scratchEnv } from './server-helpers.js';
import { isTrusted, untrustedNotice, untrustedMessage, refusedProject, UNRECORDED } from '../core/trust.js';

let tmp, ws;
const P = await import('../server/projects.js');
const T = await import('../server/trust-store.js');
const pjText = (name, extra = {}) => JSON.stringify({ name, version: 1, device: { family: 'spartan3e', part: 'xc3s100e', package: 'cp132', speed: '-4' }, board: null, top: '', simTop: '', files: [], ...extra }, null, 2) + '\n';
// a project folder put in the workspace by hand (unzipped by the system, copied): its silinx.json as given
const byHand = (name, extra = {}) => { const d = path.join(ws, name); fs.mkdirSync(path.join(d, 'src'), { recursive: true }); fs.writeFileSync(path.join(d, 'silinx.json'), pjText(name, extra)); return d; };
const records = () => JSON.parse(fs.readFileSync(path.join(process.env.SILINX_CONFIG_DIR, T.TRUST_FILE), 'utf8')).projects;
const onDisk = name => JSON.parse(fs.readFileSync(path.join(ws, name, 'silinx.json'), 'utf8'));
const trusted = async name => isTrusted(await P.readProject(name));

before(async () => {
  tmp = fs.realpathSync(await scratchEnv('silinx-trust-record-'));
  ws = process.env.SILINX_WORKSPACE;
  fs.mkdirSync(ws, { recursive: true });
});
after(() => fs.rmSync(tmp, { recursive: true, force: true }));

test('#4735 the migration: the workspace\'s projects trusted until then recorded once; an untrusted one, an MCP\'s, a clone\'s stay untrusted', async () => {
  byHand('Old');
  byHand('OldWithId', { id: 'a'.repeat(22) });
  byHand('Imported', { trusted: false });
  byHand('ByMcp', { trusted: false, madeBy: 'mcp' });
  const cloned = byHand('Cloned');
  fs.mkdirSync(path.join(cloned, '.git'));
  fs.writeFileSync(path.join(cloned, P.CLONE_TRUST), '{"trusted":false}\n');
  fs.mkdirSync(path.join(ws, '.trash'));   // (no project)
  assert.equal(fs.existsSync(path.join(process.env.SILINX_CONFIG_DIR, T.TRUST_FILE)), false);
  assert.deepEqual(await Promise.all(['Old', 'OldWithId', 'Imported', 'ByMcp', 'Cloned'].map(trusted)), [true, true, false, false, false]);
  const real = d => fs.realpathSync.native(path.join(ws, d));
  assert.deepEqual(records(), [{ dir: real('Old'), id: null }, { dir: real('OldWithId'), id: 'a'.repeat(22) }]);
  // (once: a project put there afterwards is not migrated)
  byHand('Later');
  assert.equal(await trusted('Later'), false);
  assert.equal(records().length, 2);
});

test('#4735 a folder unzipped by hand: untrusted, why said; its mark never written into its silinx.json; Trust Project records it', async () => {
  byHand('Unzipped');
  const pj = await P.readProject('Unzipped');
  assert.deepEqual([pj.trusted, pj.madeBy], [false, UNRECORDED]);
  assert.equal(untrustedNotice('Unzipped', pj), 'Project "Unzipped" was not made in Silinx nor trusted here (its folder reached the workspace outside Silinx): it is edited, checked, simulated and implemented with the Silinx toolchain; Xilinx ISE and programming a board or a PROM run only once you trust it.');
  const refusal = untrustedMessage('Unzipped', 'Xilinx ISE', pj);
  assert.equal(refusal, "project 'Unzipped' was not made in Silinx nor trusted here (its folder reached the workspace outside Silinx): Xilinx ISE runs only once you trust it (Trust Project, in the console when the project opens)");
  assert.equal(refusedProject(`ERROR: ${refusal}`), 'Unzipped');
  // (saved by the interface, as it read it: nothing of the mark written, still untrusted)
  await P.writeProject('Unzipped', { ...pj, top: 'x' });
  assert.deepEqual([onDisk('Unzipped').trusted, onDisk('Unzipped').madeBy, onDisk('Unzipped').top], [undefined, undefined, 'x']);
  assert.equal(await trusted('Unzipped'), false);
  await P.updateProject('Unzipped', p => ({ ...p, simTop: 'y' }));
  assert.deepEqual([onDisk('Unzipped').trusted, onDisk('Unzipped').madeBy], [undefined, undefined]);
  // Trust Project: recorded
  await P.trustProject('Unzipped');
  assert.equal(await trusted('Unzipped'), true);
  assert.ok(records().some(r => r.dir === fs.realpathSync.native(path.join(ws, 'Unzipped'))));
});

test('#4735 a project cloned by command-line git: untrusted, whatever its silinx.json says', async () => {
  const src = path.join(tmp, 'src-repo');
  fs.mkdirSync(src);
  fs.writeFileSync(path.join(src, 'silinx.json'), pjText('Repo'));
  const git = (cwd, ...a) => execFileSync('git', ['-c', 'user.name=A', '-c', 'user.email=a@example.com', '-c', 'core.hooksPath=', ...a], { cwd, stdio: 'ignore' });
  git(src, 'init', '--quiet');
  git(src, 'add', 'silinx.json');
  git(src, 'commit', '--quiet', '-m', 'p');
  git(ws, 'clone', '--quiet', '--', src, 'Repo');
  assert.equal(await trusted('Repo'), false);
});

test('#4735 the user\'s own recorded (New Project, an example); the MCP\'s and an import\'s not', async () => {
  await P.createProject({ name: 'Mine' });
  await P.createProject({ name: 'MyBlinky', template: 'blinky' });
  await P.createProject({ name: 'MyDesign', kind: 'design' });
  await P.createProject({ name: 'Assistant', madeBy: 'mcp' });
  await P.createProject({ name: 'FromZip', fromOutside: true });
  assert.deepEqual(await Promise.all(['Mine', 'MyBlinky', 'MyDesign', 'Assistant', 'FromZip'].map(trusted)), [true, true, true, false, false]);
  assert.equal((await P.readProject('Assistant')).madeBy, 'mcp');
  assert.equal((await P.readProject('FromZip')).madeBy, undefined);
  for (const n of ['Mine', 'MyBlinky', 'MyDesign']) assert.equal(onDisk(n).trusted, undefined, n);
});

test('#4735 deleted then restored from the .trash: untrusted; a folder put at a deleted project\'s place: untrusted', async () => {
  await P.createProject({ name: 'Gone' });
  assert.equal(await trusted('Gone'), true);
  await P.deleteProject('Gone');
  const [bin] = fs.readdirSync(path.join(ws, '.trash')).filter(n => n.startsWith('Gone-'));
  fs.renameSync(path.join(ws, '.trash', bin), path.join(ws, 'Gone'));
  assert.equal(await trusted('Gone'), false);
  assert.ok(!records().some(r => r.dir === fs.realpathSync.native(path.join(ws, 'Gone'))));
});

test('#4735 a rename takes the record along; the old name\'s folder made again by hand: untrusted', async () => {
  await P.createProject({ name: 'Before' });
  await P.renameProject('Before', 'After');
  assert.equal(await trusted('After'), true);
  byHand('Before');
  assert.equal(await trusted('Before'), false);
  // (a change of case alone too)
  await P.renameProject('After', 'AFTER');
  assert.equal(await trusted('AFTER'), true);
});

test('#4735 a record with an id: another id at its folder (another project put there) is untrusted', async () => {
  byHand('WithId', { id: 'b'.repeat(22) });
  await P.trustProject('WithId');
  assert.equal(await trusted('WithId'), true);
  fs.writeFileSync(path.join(ws, 'WithId', 'silinx.json'), pjText('WithId', { id: 'c'.repeat(22) }));
  assert.equal(await trusted('WithId'), false);
});

test('#4735 a records file that cannot be read: nothing trusted (never the migration again)', async () => {
  const f = path.join(process.env.SILINX_CONFIG_DIR, T.TRUST_FILE), had = fs.readFileSync(f, 'utf8');
  try {
    fs.writeFileSync(f, '{not json');
    assert.equal(await trusted('Mine'), false);
    assert.equal(fs.readFileSync(f, 'utf8'), '{not json');
  } finally { fs.writeFileSync(f, had); }
  assert.equal(await trusted('Mine'), true);
});
