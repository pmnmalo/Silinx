// Silinx's documents' envelope (#5906, core/doc-envelope.js): each kind's format and version the ones its module writes;
// a document read current, older (its migrations, in memory), newer (read only), too old, with no version or damaged,
// each said in its exact words; the migrations run in order, never changing the document given; every document of the
// repository (the examples, the test designs, the fixtures) read as it is, none newer or damaged; a version of the
// project kept before a document's first save in a newer format, by the local server and the browser edition's
// stores, once; the MCP's project_info says what the documents' formats say.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { DOCUMENTS, documentKind, checkEnvelope, migrateDocument, runMigrations, chainGaps, versionField } from '../core/doc-envelope.js';
import { formatVersion, newerDrawing, olderDrawing, migratingWrite, downgradeRefusal, documentNotices, PROJECT_VERSION } from '../core/doc-format.js';
import { newDoc, normalizeDoc, DOC_VERSION } from '../core/schdoc.js';
import { newFsm } from '../core/fsm.js';
import { newModel } from '../core/asm.js';
import { newTable } from '../core/logic.js';
import { newPetri } from '../core/petri.js';
import { newCircuit } from '../core/circuit.js';
import { newRegmap } from '../core/regmap.js';
import { newSymbol } from '../core/symbol-layout.js';
import { newSystem } from '../core/system-doc.js';
import { newStimulus } from '../core/system-stimulus.js';
import { browserStore, folderStore, projectOps } from '../web/js/project-store.js';
import { fakeDirectory } from './fixtures/fs-access-fake.js';
import { memStorage } from './fixtures/mem-storage.js';
import { scratchEnv, ROOT } from './server-helpers.js';

let tmp, P, V, handle;
before(async () => {
  tmp = await scratchEnv('silinx-doc-envelope-');
  P = await import('../server/projects.js');
  V = await import('../server/versions.js');
  ({ handle } = await import('../server/mcp.js'));
});
after(() => fs.rm(tmp, { recursive: true, force: true }));

const kind = type => DOCUMENTS.find(d => d.type === type);

test('each kind: the version and format its module writes; every path to its kind; every chain whole', () => {
  const made = { schematic: newDoc(), fsm: newFsm(), asm: newModel(), 'truth-table': newTable(), petri: newPetri(), circuit: newCircuit(),
    regmap: newRegmap('r'), symbol: newSymbol({ name: 'm', ports: [] }), system: newSystem('s'), stimulus: JSON.parse(newStimulus()) };
  for (const [type, doc] of Object.entries(made)) {
    assert.equal(kind(type).version, doc.version, type);
    assert.equal(kind(type).format, doc.format, `${type}: its format`);
  }
  assert.equal(kind('schematic').version, DOC_VERSION);
  assert.equal(kind('project').version, PROJECT_VERSION);
  assert.deepEqual(DOCUMENTS.map(d => d.type).sort(), ['asm', 'circuit', 'fsm', 'petri', 'project', 'regmap', 'schematic', 'stimulus', 'symbol', 'system', 'truth-table', 'versions']);
  for (const [p, type] of [['src/a.sch.json', 'schematic'], ['a.FSM.json', 'fsm'], ['b.bool.json', 'truth-table'], ['b.tt.json', 'truth-table'], ['x.regs.json', 'regmap'],
    ['m.sym.json', 'symbol'], ['s.sys.json', 'system'], ['s.stim.json', 'stimulus'], ['silinx.json', 'project'], ['.silinx/versions/index.json', 'versions']]) assert.equal(documentKind(p)?.type, type, p);
  for (const p of ['src/a.vhd', 'a.json', 'labs/x.lab.json', 'src/sch.json']) assert.equal(documentKind(p), null, p);
  assert.deepEqual(chainGaps(), []);
  // (the stores' guards: the project's files, not silinx.json nor the versions' index; now the symbols, Systems, stimuli too)
  assert.equal(formatVersion('silinx.json'), null);
  assert.equal(formatVersion('.silinx/versions/index.json'), null);
  assert.deepEqual(['m.sym.json', 's.sys.json', 's.stim.json'].map(formatVersion), [1, 2, 1]);
});

test('checkEnvelope: current, older, newer, too old, missing, damaged; each said in its words', () => {
  const c = (p, d) => { const r = checkEnvelope(p, d); return r && { state: r.state, version: r.version, message: r.message }; };
  assert.deepEqual(c('a.fsm.json', { version: 1 }), { state: 'current', version: 1, message: null });
  assert.deepEqual(c('a.fsm.json', {}), { state: 'missing', version: 1, message: null });
  assert.deepEqual(c('src/a.sch.json', { version: 4 }), { state: 'older', version: 4,
    message: 'a.sch.json is in an older format (4; this Silinx writes 7): it is read in the new one and written so on its next save, a version of the project kept first' });
  assert.equal(c('a.sch.json', {}).state, 'older', 'a schematic with none: version 1, as normalizeDoc reads it');
  assert.deepEqual(c('a.pn.json', { version: '3' }), { state: 'newer', version: 3,
    message: 'a.pn.json was saved by a newer Silinx (its format 3; this one reads up to 1): opened read-only, so that it is not saved in the older format and loses nothing: update Silinx to change it' });
  assert.deepEqual(c('s.sys.json', { format: 'silinx-system', version: 1 }), { state: 'too-old', version: 1, message: 's.sys.json is a System document of version 1: this Silinx reads versions 2 to 2' });
  assert.deepEqual(c('a.circ.json', [1]), { state: 'damaged', version: null, message: 'a.circ.json is not a circuit: not a JSON object' });
  assert.deepEqual(c('a.circ.json', null), { state: 'damaged', version: null, message: 'a.circ.json is not a circuit: not a JSON object' });
  assert.deepEqual(c('a.circ.json', { format: 'silinx-regmap', version: 1 }), { state: 'damaged', version: null, message: "a.circ.json is not a circuit: its format is 'silinx-regmap', not 'silinx-circuit'" });
  assert.deepEqual(c('a.asm.json', { version: 'two' }), { state: 'damaged', version: null, message: "a.asm.json is not an ASM chart this Silinx reads: its version 'two' is not a number" });
  assert.deepEqual(c('a.asm.json', { version: 0 }).state, 'damaged');
  assert.equal(c('src/a.vhd', {}), null);
  assert.equal(versionField({ version: 2.5 }), null);
});

test('migrations: in order, each its version, the document given unchanged; a gap is an error, never half a migration', () => {
  const k = { type: 't', what: 'test document', version: 4, migrate: { 1: d => ({ ...d, a: 1 }), 2: d => { d.b = d.a + 1; return d; }, 3: d => ({ ...d, c: d.b + 1 }) } };
  const doc = { version: 1, keep: 'x' };
  const r = runMigrations(k, doc, 1);
  assert.deepEqual(r, { doc: { version: 4, keep: 'x', a: 1, b: 2, c: 3 }, from: 1, to: 4, steps: [2, 3, 4] });
  assert.deepEqual(doc, { version: 1, keep: 'x' }, 'the document given: unchanged');
  assert.deepEqual(runMigrations(k, { version: 3, b: 5 }, 3).doc, { version: 4, b: 5, c: 6 });
  assert.throws(() => runMigrations({ ...k, migrate: { 1: k.migrate[1] } }, doc, 1, 'x.t.json'), { message: 'x.t.json: no migration of a test document from version 2 to 3' });
  // (the real documents: current ones as they are; the schematic upgraded by its own reader, normalizeDoc)
  const fsm = newFsm();
  assert.equal(migrateDocument('a.fsm.json', fsm).doc, fsm);
  const v4 = { version: 4, symbols: [] };
  assert.deepEqual(migrateDocument('a.sch.json', v4), { doc: v4, from: 4, to: 4, steps: [] });
  assert.equal(normalizeDoc(v4).version, 7);
  assert.equal(migrateDocument('a.vhd', 'x').doc, 'x');
});

test('the repository\'s documents (examples, test designs, fixtures): read as they are, none newer, too old or damaged', () => {
  const files = execFileSync('git', ['ls-files', '*.json'], { cwd: ROOT, encoding: 'utf8' }).split('\n').filter(f => formatVersion(f) !== null);
  assert.ok(files.length > 60, `${files.length} documents`);
  const seen = {};
  const texts = {};
  for (const f of files) {
    const text = execFileSync('git', ['show', `HEAD:${f}`], { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 << 20 });
    let doc;
    try { doc = JSON.parse(text); } catch { continue; }   // (a test's fixture of a document that is not JSON, on purpose)
    texts[f] = text;
    const c = checkEnvelope(f, doc);
    seen[c.state] = (seen[c.state] || 0) + 1;
    if (c.state === 'damaged' || c.state === 'newer' || c.state === 'too-old') continue;   // (fixtures of those cases: below)
    const m = migrateDocument(f, doc);
    assert.equal(m.doc, doc, `${f}: opened unchanged`);
  }
  assert.ok(seen.current > 50 && seen.older >= 8, JSON.stringify(seen));
  // (the examples': all current)
  for (const f of Object.keys(texts).filter(p => p.startsWith('examples/'))) assert.equal(checkEnvelope(f, JSON.parse(texts[f])).state, 'current', f);
});

test('the console\'s and the MCP\'s notices: newer, older, damaged, by path; current and new documents say nothing', () => {
  assert.equal(olderDrawing('src/a.sch.json', { version: 6 }), 'a.sch.json is in an older format (6; this Silinx writes 7): it is read in the new one and written so on its next save, a version of the project kept first');
  assert.equal(olderDrawing('src/a.sch.json', { version: 7 }), null);
  assert.equal(olderDrawing('src/a.sch.json', { version: 8 }), null);
  assert.equal(newerDrawing('m.sym.json', { version: 2, kind: 'symbol' }).message, 'm.sym.json was saved by a newer Silinx (its format 2; this one reads up to 1): opened read-only, so that it is not saved in the older format and loses nothing: update Silinx to change it');
  assert.deepEqual(documentNotices({ 'src/b.fsm.json': '{"version":1}', 'src/a.sch.json': '{"version":4}', 'src/c.stim.json': '{"format":"silinx-stimulus","version":2}', 'src/d.pn.json': '{', 'src/e.vhd': '{' }), [
    { path: 'src/a.sch.json', state: 'older', message: 'a.sch.json is in an older format (4; this Silinx writes 7): it is read in the new one and written so on its next save, a version of the project kept first' },
    { path: 'src/c.stim.json', state: 'newer', message: 'c.stim.json was saved by a newer Silinx (its format 2; this one reads up to 1): opened read-only, so that it is not saved in the older format and loses nothing: update Silinx to change it' },
    { path: 'src/d.pn.json', state: 'damaged', message: 'd.pn.json is not a Petri net: not JSON' },
  ]);
  assert.deepEqual(documentNotices({}), []);
});

test('migratingWrite: an older document written in a newer format; a new file, the same format, a downgrade, not JSON: not', () => {
  const v4 = JSON.stringify({ version: 4 }), v7 = JSON.stringify(newDoc());
  assert.deepEqual(migratingWrite('src/a.sch.json', v4, v7), { kind: 'schematic', from: 4, to: 7 });
  assert.deepEqual(migratingWrite('src/a.sch.json', '{}', v7), { kind: 'schematic', from: 1, to: 7 });
  assert.deepEqual(migratingWrite('s.sys.json', '{"format":"silinx-system","version":1}', JSON.stringify(newSystem('s'))), { kind: 'system', from: 1, to: 2 });
  assert.equal(migratingWrite('src/a.sch.json', null, v7), null);
  assert.equal(migratingWrite('src/a.sch.json', v7, v7), null);
  assert.equal(migratingWrite('src/a.sch.json', v4, v4), null);
  assert.equal(migratingWrite('src/a.sch.json', 'not json', v7), null);
  assert.equal(migratingWrite('src/a.sch.json', v4, '[1]'), null);
  assert.equal(migratingWrite('src/a.vhd', v4, v7), null);
  // (and a symbol, a System, a stimulus a newer Silinx saved: never written over in the older format, as the drawings)
  assert.match(downgradeRefusal('m.sym.json', '{"version":2,"kind":"symbol","x":1}', JSON.stringify(newSymbol({ name: 'm', ports: [] }))), /^'m\.sym\.json' was saved by a newer Silinx \(its format 2; this one writes 1\)/);
  assert.match(downgradeRefusal('s.sys.json', '{"format":"silinx-system","version":3}', JSON.stringify(newSystem('s'))), /^'s\.sys\.json' was saved by a newer Silinx \(its format 3; this one writes 2\)/);
  assert.match(downgradeRefusal('s.stim.json', '{"format":"silinx-stimulus","version":2}', newStimulus()), /^'s\.stim\.json' was saved by a newer Silinx \(its format 2; this one writes 1\)/);
});

const OLD_SCH = `${JSON.stringify({ version: 4, name: 'old', lang: 'vhdl', sheet: { w: 1700, h: 1100 }, symbols: [], wires: [], labels: [], ports: [] }, null, 1)}\n`;

test('#5906 the local server: a version kept before a document\'s first save in a newer format, the old form in it; once', async () => {
  await P.createProject({ name: 'Mig' });
  await fs.writeFile(path.join(P.projectDir('Mig'), 'src', 'old.sch.json'), OLD_SCH);
  const versions = () => V.serverVersions(P).list('Mig');
  assert.equal((await versions()).length, 0);
  const v7 = JSON.stringify(normalizeDoc(JSON.parse(OLD_SCH)), null, 1);
  await P.writeFile('Mig', 'src/old.sch.json', v7);
  const [v] = await versions();
  assert.equal(v.reason, 'before-migrate');
  assert.equal((await V.serverVersions(P).read('Mig', v.id)).files['src/old.sch.json'], OLD_SCH, 'the old form kept');
  assert.equal(JSON.parse(await P.readFile('Mig', 'src/old.sch.json')).version, 7);
  await P.writeFile('Mig', 'src/old.sch.json', v7.replace('"old"', '"old2"'));
  await P.writeFile('Mig', 'src/new.sch.json', v7);
  assert.equal((await versions()).length, 1, 'its later saves and a new document: none');
});

test('#5906 the browser edition\'s stores: beforeMigrate before a document\'s first save in a newer format; its error never stops the save', async () => {
  for (const store of [browserStore(memStorage()), folderStore(fakeDirectory('Silinx-projects'))]) {
    const calls = [];
    let fail = false;
    const ops = projectOps(() => store, {}, { beforeMigrate: async name => { calls.push([name, await ops.readFile(name, 'src/a.sch.json')]); if (fail) throw new Error('full'); } });
    await ops.create({ name: 'Mig', template: 'empty' });
    await ops.writeFile('Mig', 'src/a.sch.json', OLD_SCH);
    assert.deepEqual(calls, [], `${store.kind}: a new file`);
    const v7 = JSON.stringify(normalizeDoc(JSON.parse(OLD_SCH)));
    await ops.writeFile('Mig', 'src/a.sch.json', v7);
    assert.deepEqual(calls, [['Mig', OLD_SCH]], `${store.kind}: before the write`);
    await ops.writeFile('Mig', 'src/a.sch.json', v7);
    assert.equal(calls.length, 1, `${store.kind}: once`);
    fail = true;
    await ops.writeFile('Mig', 'src/b.sch.json', OLD_SCH);
    await ops.writeFile('Mig', 'src/b.sch.json', v7);
    assert.equal(JSON.parse(await ops.readFile('Mig', 'src/b.sch.json')).version, 7, `${store.kind}: written`);
  }
});

let rpc = 0;
const call = async (name, args) => { const r = (await handle({ jsonrpc: '2.0', id: ++rpc, method: 'tools/call', params: { name, arguments: args } })).result; return { text: r.content[0].text, data: r.structuredContent, isError: r.isError }; };

test('#5906 the MCP: project_info says the documents\' formats (newer, older, the description); a write over a newer one refused as the page\'s', async () => {
  await P.createProject({ name: 'Info' });
  const clean = await call('project_info', { project: 'Info' });
  assert.equal(clean.data.documents, undefined);
  assert.doesNotMatch(clean.text, /format/);
  await fs.writeFile(path.join(P.projectDir('Info'), 'src', 'old.sch.json'), OLD_SCH);
  await fs.writeFile(path.join(P.projectDir('Info'), 'src', 'm.fsm.json'), JSON.stringify({ ...newFsm('m'), version: 2 }));
  const r = await call('project_info', { project: 'Info' });
  assert.deepEqual(r.data.documents, [
    { path: 'src/m.fsm.json', state: 'newer', message: 'm.fsm.json was saved by a newer Silinx (its format 2; this one reads up to 1): opened read-only, so that it is not saved in the older format and loses nothing: update Silinx to change it' },
    { path: 'src/old.sch.json', state: 'older', message: 'old.sch.json is in an older format (4; this Silinx writes 7): it is read in the new one and written so on its next save, a version of the project kept first' },
  ]);
  assert.match(r.text, /\n {2}m\.fsm\.json was saved by a newer Silinx \(its format 2; this one reads up to 1\): opened read-only.*\n {2}old\.sch\.json is in an older format \(4; this Silinx writes 7\)/s);
  const w = await call('write_file', { project: 'Info', path: 'src/m.fsm.json', text: JSON.stringify(newFsm('m')) });
  assert.equal(w.isError, true);
  assert.match(w.text, /'src\/m\.fsm\.json' was saved by a newer Silinx \(its format 2; this one writes 1\): not written in the older format, which would lose what that Silinx added: update Silinx to change it/);
});
