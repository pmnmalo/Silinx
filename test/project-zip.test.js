// A whole project as a zip, out and in (#2674, server/project-zip.js: out of server/xise-routes.js's export.zip and
// import-zip routes, which call it): the two kinds of export of the examples (a schematic as an ISE schematic, a C
// source as its HDL), an import of each, and an import's error through the caller's bad().
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { scratchEnv } from './server-helpers.js';

let tmp;
before(async () => { tmp = await scratchEnv('silinx-project-zip-'); });
after(() => fs.rmSync(tmp, { recursive: true, force: true }));

const P = await import('../server/projects.js');
const { exportProjectZip, importProjectEntries, sourcesOf } = await import('../server/project-zip.js');
const { gateEntries, gateZip } = await import('../core/import-gate.js');
const { readZip } = await import('../core/zip.js');
const { NODE_CODEC } = await import('../server/impl-routes.js');
const names = async zip => (await readZip(zip, NODE_CODEC)).map(e => e.path).sort();

test('exportProjectZip: a Xilinx ISE project (the schematic as an ISE schematic), a Silinx one as it is', async () => {
  await P.createProject({ name: 'gates', template: 'gates' });
  const x = await exportProjectZip(P, 'gates');
  assert.equal(x.file, 'gates.zip');
  assert.deepEqual(x.warnings, []);
  const xn = await names(x.zip);
  assert.ok(xn.includes('gates.xise') && xn.some(n => /\.sch$/.test(n)), xn.join());
  assert.ok(!xn.includes('silinx.json') && !xn.includes('src/gates.sch.json'));
  const s = await exportProjectZip(P, 'gates', 'silinx');
  assert.equal(s.file, 'gates-silinx.zip');
  assert.deepEqual(await names(s.zip), ['constraints/gates.ucf', 'silinx.json', 'sim/tb_gates.vhd', 'src/gates.sch.json', 'src/gates.vhd']);
  assert.deepEqual(Object.keys(await sourcesOf(P, 'gates', await P.readProject('gates'))).sort(), ['sim/tb_gates.vhd', 'src/gates.vhd']);
});

test('exportProjectZip: a C source goes out as its HDL', async () => {
  await P.createProject({ name: 'fir', template: 'fir' });
  const n = await names((await exportProjectZip(P, 'fir')).zip);
  assert.ok(n.includes('fir.xise') && n.some(f => /\.c\.vhd$/.test(f)) && !n.some(f => /\.c$/.test(f)), n.join());
});

test('importProjectEntries: the two exports back as projects; no project in the entries: bad()', async () => {
  const back = async (from, to, kind) => importProjectEntries(P, to, await gateZip((await exportProjectZip(P, from, kind)).zip, NODE_CODEC), m => new Error(m));
  const x = await back('gates', 'gates_x', 'xilinx');
  assert.deepEqual([x.project.top, x.project.simTop, x.missing, x.warnings], ['gates', 'tb_gates', [], []]);
  const s = await back('gates', 'gates_s', 'silinx');
  assert.deepEqual([s.project.top, s.project.board, s.missing, s.warnings], ['gates', 'basys2', [], []]);
  assert.ok(s.extra.includes('src/gates.sch.json'));
  await assert.rejects(importProjectEntries(P, 'none', gateEntries([{ path: 'a.txt', data: new Uint8Array(1) }]), m => Object.assign(new Error(m), { mine: true })),
    { mine: true, message: 'the zip contains no .xise (ISE project) and no silinx.json' });
  // entries that did not pass the import gate (#2830): refused
  await assert.rejects(importProjectEntries(P, 'none', [{ path: 'silinx.json', data: new Uint8Array(2) }], m => new Error(m)),
    { message: 'importProjectEntries: the entries must pass the import gate (core/import-gate.js)' });
});

// #4276 regression: a new project's constraints file, not written yet, is not listed in the .xise; imported back with
// no warning, its constraints file not written either; once written, listed and imported back with it
test('#4276 exportProjectZip: a constraints file not written yet left out of the .xise; imported back with no warnings', async () => {
  await P.createProject({ name: 'fresh', board: 'basys2' });
  await P.writeFile('fresh', 'src/top.vhd', 'entity top is end;\narchitecture a of top is begin end;\n');
  await P.updateProject('fresh', pj => ({ ...pj, top: 'top', files: [{ path: 'src/top.vhd', lang: 'vhdl', role: 'design' }] }));
  assert.equal((await P.readProject('fresh')).constraints, 'constraints/top.ucf');
  const xml = async () => Buffer.from((await readZip((await exportProjectZip(P, 'fresh')).zip, NODE_CODEC)).find(e => e.path === 'fresh.xise').data).toString('utf8');
  const back = async to => importProjectEntries(P, to, await gateZip((await exportProjectZip(P, 'fresh')).zip, NODE_CODEC), m => new Error(m));
  assert.doesNotMatch(await xml(), /FILE_UCF/);
  const b = await back('fresh_x');
  // (the project imported: a new project's constraints path, its file not written, as the one exported)
  assert.deepEqual([b.project.top, b.project.constraints, b.missing, b.warnings], ['top', 'constraints/top.ucf', [], []]);
  assert.ok(!(await P.fileTree('fresh_x')).includes('constraints/top.ucf'));
  await P.writeFile('fresh', 'constraints/top.ucf', 'NET "a" LOC = "B8";\n');
  assert.match(await xml(), /<file xil_pn:name="constraints\/top\.ucf" xil_pn:type="FILE_UCF">/);
  const u = await back('fresh_u');
  assert.deepEqual([u.project.constraints, u.missing, u.warnings], ['constraints/top.ucf', [], []]);
});

// #4288 regression: a new project's Silinx zip (its constraints file not written yet, its path in silinx.json) imported
// back with no warning: the constraints path is not a file the project lists, not missing
test('#4288 exportProjectZip silinx: a new project with no constraints file written imported back, nothing missing, no warnings', async () => {
  await P.createProject({ name: 'freshs', board: 'basys2' });
  await P.writeFile('freshs', 'src/top.vhd', 'entity top is end;\narchitecture a of top is begin end;\n');
  await P.updateProject('freshs', pj => ({ ...pj, top: 'top', files: [{ path: 'src/top.vhd', lang: 'vhdl', role: 'design' }] }));
  const x = await exportProjectZip(P, 'freshs', 'silinx');
  assert.deepEqual(x.warnings, []);
  assert.deepEqual((await readZip(x.zip, NODE_CODEC)).map(e => e.path).sort(), ['silinx.json', 'src/top.vhd']);
  const b = await importProjectEntries(P, 'freshs_x', await gateZip(x.zip, NODE_CODEC), m => new Error(m));
  assert.deepEqual([b.project.top, b.project.constraints, b.missing, b.warnings], ['top', 'constraints/top.ucf', [], []]);
  assert.ok(!(await P.fileTree('freshs_x')).includes('constraints/top.ucf'));
  // (a listed file not in the zip is still missing)
  await P.updateProject('freshs', pj => ({ ...pj, files: [...pj.files, { path: 'src/gone.vhd', lang: 'vhdl', role: 'design' }] }));
  const g = await importProjectEntries(P, 'freshs_g', await gateZip((await exportProjectZip(P, 'freshs', 'silinx')).zip, NODE_CODEC), m => new Error(m));
  assert.deepEqual([g.missing, g.warnings], [['src/gone.vhd'], []]);
});

// #4356 regression: a constraints file not in the zip is missing, but the device's default (a new project's, not
// written yet, #4288): constraints/top.ucf on a Spartan-3E, constraints/top.pcf on an iCE40
test('#4356 importProjectEntries: a constraints file of its own not in the zip is missing; the device\'s default path is not', async () => {
  const S3E = { family: 'spartan3e', part: 'xc3s250e', package: 'cp132', speed: '-4' };
  const ICE = { family: 'ice40', part: 'up5k', package: 'sg48', speed: '' };
  const enc = s => new TextEncoder().encode(s);
  let n = 0;
  const imp = async (pj, more = []) => importProjectEntries(P, `cons${n++}`, gateEntries([{ path: 'silinx.json', data: enc(JSON.stringify({ name: 'c', top: '', files: [], ...pj })) }, ...more]), m => new Error(m));
  for (const [pj, missing] of [
    [{ device: S3E, constraints: 'constraints/board.ucf' }, ['constraints/board.ucf']],
    [{ device: S3E, constraints: 'constraints/top.ucf' }, []],
    [{ device: S3E, constraints: 'constraints/top.pcf' }, ['constraints/top.pcf']],
    [{ device: ICE, constraints: 'constraints/top.pcf' }, []],
    [{ device: ICE, constraints: 'constraints/top.ucf' }, ['constraints/top.ucf']],
  ]) {
    const r = await imp(pj);
    assert.deepEqual([r.project.constraints, r.missing, r.warnings], [pj.constraints, missing, []], JSON.stringify(pj));
  }
  // (in the zip: not missing; listed among the files too: named once)
  assert.deepEqual((await imp({ device: S3E, constraints: 'constraints/board.ucf' }, [{ path: 'constraints/board.ucf', data: enc('NET "a" LOC = "P11";\n') }])).missing, []);
  assert.deepEqual((await imp({ device: S3E, constraints: 'constraints/board.ucf', files: [{ path: 'constraints/board.ucf', lang: 'ucf', role: 'constraints' }] })).missing, ['constraints/board.ucf']);
});

// #4760: a listed file missing, a schematic not read: said in the export's warnings, not left out silently (an
// import's silinx.json that is not JSON: #4755's)
test('#4760 exportProjectZip: a file left out said, a schematic not read said', async () => {
  await P.createProject({ name: 'gz', template: 'gates' });
  await P.updateProject('gz', p => ({ ...p, files: [...p.files, { path: 'src/gone.vhd' }] }));
  fs.writeFileSync(`${P.projectDir('gz')}/src/broken.sch.json`, '{ not json');
  const x = await exportProjectZip(P, 'gz');
  assert.deepEqual(x.warnings, ['src/gone.vhd: not read (not found): left out of the export', 'src/broken.sch.json: not read (not JSON): no ISE schematic made of it']);
  assert.ok((await names(x.zip)).includes('gz.xise'));
});
