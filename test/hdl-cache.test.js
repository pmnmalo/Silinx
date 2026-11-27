// A drawing's HDL file as a cache of it, checked by hashes (#5872, core/hdl-cache.js, core/drawing-sync.js
// checkDrawings): its last line, the drawing's hash and its own text's; a drawing replaced in the project's folder (its
// ports changed) makes its HDL again; an HDL file edited by hand is kept in a version and made again, the drawing
// winning, with a warning; a drawing with errors leaves its file, stale; a file of before the line is stamped quietly, or
// kept in a version when it is not the drawing's; every kind of drawing; the HDL made again compiled and simulated, in
// VHDL and in Verilog.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { scratchEnv } from './server-helpers.js';
import { cacheState, drawingHash, hashText, readStamp, sameBody, stampHdl } from '../core/hdl-cache.js';
import { compile, elaborate } from '../core/compile.js';
import { Simulator } from '../core/simulator.js';

let tmp;
before(async () => { tmp = await scratchEnv('silinx-hdl-cache-'); });
after(() => fs.rmSync(tmp, { recursive: true, force: true }));

const P = await import('../server/projects.js');
const D = await import('../server/drawing-sync.js');
const { serverVersions } = await import('../server/versions.js');
const file = (name, f) => path.join(P.projectDir(name), f);
const read = (name, f) => fs.readFileSync(file(name, f), 'utf8');
// (written in the folder, as another program writes it: not through Silinx)
const put = (name, f, text) => fs.writeFileSync(file(name, f), text);
const LINE = /^(--|\/\/) silinx-sync drawing:[0-9a-f]{16} hdl:[0-9a-f]{16} \(generated from the drawing: edit it, not this file\)$/;

test('hashes: the drawing\'s canonical (its keys\' order, its spacing and its link aside), the line read back, the states', async () => {
  assert.match(await hashText('x'), /^[0-9a-f]{16}$/);
  const h = await drawingHash({ b: 1, a: { d: [1, { f: 2, e: 3 }], c: 'x' }, generatedFile: 'a.vhd' });
  assert.equal(await drawingHash('{"a":{"c":"x","d":[1,{"e":3,"f":2}]},\n  "b":1}'), h);
  assert.notEqual(await drawingHash({ b: 2, a: { d: [1, { f: 2, e: 3 }], c: 'x' } }), h);
  assert.equal(await drawingHash('not json'), null);
  const body = 'entity e is\nend;\n';
  const vhd = await stampHdl(body, h, 'vhdl');
  assert.match(vhd.split('\n').at(-2), LINE);
  assert.ok(vhd.startsWith(body) && vhd.endsWith(')\n'));
  assert.deepEqual(readStamp(vhd), { body, drawing: h, hdl: await hashText(body) });
  assert.match((await stampHdl('module m; endmodule', h, 'verilog')).split('\n').at(-2), /^\/\/ silinx-sync/);
  // (a text with no line end, stamped again: its body ended, one line)
  assert.equal(await stampHdl(vhd, h, 'vhdl'), vhd);
  assert.deepEqual(readStamp('entity e is end;'), { body: 'entity e is end;\n', drawing: null, hdl: null });
  const model = { a: { c: 'x', d: [1, { e: 3, f: 2 }] }, b: 1 };
  assert.equal(await cacheState(vhd, model), 'fresh');
  assert.equal(await cacheState(vhd, { ...model, b: 2 }), 'drawing');
  assert.equal(await cacheState(vhd.replace('end;', 'end e;'), model), 'edited');
  assert.equal(await cacheState(body, model), 'unknown');
  assert.ok(sameBody(vhd, body) && !sameBody(vhd, 'x\n'));
});

test('the examples\' HDL files carry their drawing\'s line: nothing to make, nothing said', async () => {
  await P.createProject({ name: 'lock', template: 'lock-circuit' });
  assert.deepEqual(await D.checkDrawings(P, 'lock'), { results: [], written: [], messages: [] });
  for (const f of ['alarm', 'control', 'digit_ok', 'lock', 'safe', 'sync', 'timer']) assert.match(read('lock', `src/${f}.vhd`).split('\n').at(-2), LINE, f);
});

test('Pedro\'s case: a state diagram replaced in the folder with other ports: its HDL made again, said; the HDL compiled and simulated in VHDL and in Verilog', async () => {
  await P.createProject({ name: 'tr', template: 'traffic' });
  const fsm = JSON.parse(read('tr', 'src/traffic.fsm.json'));
  // (an input more, hold: the walk phase held while it is 1)
  fsm.inputs.push({ name: 'hold', width: 1 });
  const t3 = fsm.transitions.find(t => t.id === 't3');
  t3.cond = 'done && !hold';
  put('tr', 'src/traffic.fsm.json', JSON.stringify(fsm, null, 2));
  assert.doesNotMatch(read('tr', 'src/traffic.vhd'), /\bhold\b/);
  assert.deepEqual(await D.checkDrawings(P, 'tr'), { results: [{ path: 'src/traffic.fsm.json', target: 'src/traffic.vhd', written: 'src/traffic.vhd', removed: null, stale: null,
    messages: ['src/traffic.vhd updated from src/traffic.fsm.json (the drawing was changed outside Silinx)'] }], written: ['src/traffic.vhd'], messages: ['src/traffic.vhd updated from src/traffic.fsm.json (the drawing was changed outside Silinx)'] });
  assert.match(read('tr', 'src/traffic.vhd'), /hold\s+: in\s+std_logic;/);
  assert.equal(await cacheState(read('tr', 'src/traffic.vhd'), fsm), 'fresh');
  // (checked again: nothing)
  assert.deepEqual((await D.checkDrawings(P, 'tr')).results, []);
  const phaseOf = id => Number(fsm.states.find(s => s.id === id).outputs.phase);
  const simulate = (hdl, lang) => {
    const tb = `module tb;
  reg clk = 0, rst = 1, req = 1, done = 1, night = 0, hold = 1;
  wire [2:0] phase;
  traffic uut (.clk(clk), .rst(rst), .req(req), .done(done), .night(night), .hold(hold), .phase(phase));
  always #5 clk = ~clk;
  initial begin
    @(negedge clk) rst = 0;
    repeat (6) @(negedge clk);
    if (phase !== ${phaseOf(t3.from)}) $display("ERROR: held: phase %0d", phase);
    hold = 0;
    @(negedge clk);
    if (phase !== ${phaseOf(t3.to)}) $display("ERROR: released: phase %0d", phase);
    $display("Simulation finished OK");
    $finish;
  end
endmodule
`;
    const all = [{ path: `traffic.${lang === 'verilog' ? 'v' : 'vhd'}`, lang, text: hdl }, { path: 'tb.v', lang: 'verilog', role: 'sim', text: tb }];
    const lib = compile(all);
    const des = elaborate(lib, 'tb');
    assert.deepEqual([...lib.errors, ...des.diags].map(d => d.message), [], lang);
    const sim = new Simulator(des, { files: new Map(all.map(s => [s.path, s.text])) });
    sim.run(1e6);
    const log = sim.log.map(e => e.text);
    assert.deepEqual(log.filter(l => /ERROR/.test(l)), [], lang);
    assert.ok(log.includes('Simulation finished OK'), `${lang}: ${log.slice(-3).join('\n')}`);
  };
  simulate(read('tr', 'src/traffic.vhd'), 'vhdl');
  // in Verilog: its line a Verilog comment, the same checks
  await D.setSourceLanguage(P, 'tr', 'src/traffic.fsm.json', 'verilog');
  const v = read('tr', 'src/traffic.v');
  assert.match(v.split('\n').at(-2), LINE);
  assert.ok(v.split('\n').at(-2).startsWith('//'));
  assert.deepEqual((await D.checkDrawings(P, 'tr')).results, []);
  simulate(v, 'verilog');
  const edited = v.replace('module traffic', '// a line of mine\nmodule traffic');
  put('tr', 'src/traffic.v', edited);
  const r = await D.checkDrawings(P, 'tr');
  assert.deepEqual(r.messages, ['WARNING: src/traffic.v was changed outside Silinx: made again from src/traffic.fsm.json, the drawing being its source; the changed file is kept in version 1 ("src/traffic.v changed outside Silinx").']);
  assert.equal(read('tr', 'src/traffic.v'), v);
});

test('an HDL file edited by hand: kept in a version, made again from its drawing, a warning; the version holds the edit', async () => {
  await P.createProject({ name: 'ed', template: 'traffic' });
  const was = read('ed', 'src/lamps.vhd');
  const edited = was.replace('library', '-- my own fix\nlibrary');
  put('ed', 'src/lamps.vhd', edited);
  assert.deepEqual(await D.checkDrawings(P, 'ed'), { results: [{ path: 'src/lamps.bool.json', target: 'src/lamps.vhd', written: 'src/lamps.vhd', removed: null, stale: null, kept: '1',
    messages: ['WARNING: src/lamps.vhd was changed outside Silinx: made again from src/lamps.bool.json, the drawing being its source; the changed file is kept in version 1 ("src/lamps.vhd changed outside Silinx").'] }],
  written: ['src/lamps.vhd'], messages: ['WARNING: src/lamps.vhd was changed outside Silinx: made again from src/lamps.bool.json, the drawing being its source; the changed file is kept in version 1 ("src/lamps.vhd changed outside Silinx").'] });
  assert.equal(read('ed', 'src/lamps.vhd'), was);
  const [v] = await serverVersions(P).list('ed');
  assert.deepEqual([v.id, v.reason, v.label, v.author], ['1', 'before-regenerate', 'src/lamps.vhd changed outside Silinx', 'Silinx']);
  assert.equal((await serverVersions(P).read('ed', '1')).files['src/lamps.vhd'], edited);
  // (its line alone changed by hand: its text the drawing's, made again, said the same)
  put('ed', 'src/lamps.vhd', was.replace(/hdl:[0-9a-f]{16}/, 'hdl:0000000000000000'));
  assert.deepEqual((await D.checkDrawings(P, 'ed')).results.map(r => [r.stamped, r.written, r.messages]), [['src/lamps.vhd', 'src/lamps.vhd', []]]);
  assert.equal(read('ed', 'src/lamps.vhd'), was);
  // with no versions (a store without them): made again all the same, said
  const noVersions = { ...P, saveVersion: undefined };
  put('ed', 'src/lamps.vhd', edited);
  assert.deepEqual((await D.checkDrawings(noVersions, 'ed')).messages, ['WARNING: src/lamps.vhd was changed outside Silinx: made again from src/lamps.bool.json, the drawing being its source; the changed file could not be kept in a version: no versions here.']);
  assert.equal(read('ed', 'src/lamps.vhd'), was);
});

test('a drawing replaced with one with errors: its HDL left as it was, stale, never used (#5799)', async () => {
  await P.createProject({ name: 'bad', template: 'traffic' });
  const hdl = read('bad', 'src/traffic.vhd');
  const fsm = JSON.parse(read('bad', 'src/traffic.fsm.json'));
  fsm.transitions[0].to = 's99';
  put('bad', 'src/traffic.fsm.json', JSON.stringify(fsm, null, 2));
  const why = 'A transition starts or ends at a state that does not exist';
  assert.deepEqual(await D.checkDrawings(P, 'bad'), { results: [{ path: 'src/traffic.fsm.json', target: 'src/traffic.vhd', written: null, removed: null, stale: why, messages: [`WARNING: src/traffic.vhd not updated: src/traffic.fsm.json has errors: ${why}`] }],
    written: [], messages: [`WARNING: src/traffic.vhd not updated: src/traffic.fsm.json has errors: ${why}`] });
  assert.equal(read('bad', 'src/traffic.vhd'), hdl);
  assert.deepEqual(await D.staleDrawings(P, 'bad'), [{ target: 'src/traffic.vhd', from: 'src/traffic.fsm.json', why: `it has errors: ${why}` }]);
  assert.deepEqual(await serverVersions(P).list('bad'), []);
});

test('a project of before the line: stamped quietly when its text is the drawing\'s, else kept in a version and made again', async () => {
  await P.createProject({ name: 'old', template: 'traffic' });
  const was = read('old', 'src/lamps.vhd');
  const legacy = readStamp(was).body;
  put('old', 'src/lamps.vhd', legacy);
  assert.deepEqual(await D.checkDrawings(P, 'old'), { results: [{ path: 'src/lamps.bool.json', target: 'src/lamps.vhd', written: 'src/lamps.vhd', removed: null, stale: null, messages: [], stamped: 'src/lamps.vhd' }], written: ['src/lamps.vhd'], messages: [] });
  assert.equal(read('old', 'src/lamps.vhd'), was);
  assert.deepEqual(await serverVersions(P).list('old'), []);
  put('old', 'src/lamps.vhd', legacy.replace('library', '-- before\nlibrary'));
  assert.deepEqual((await D.checkDrawings(P, 'old')).messages, ['src/lamps.vhd updated from src/lamps.bool.json (its text before, from a file with no silinx-sync line, is kept in version 1)']);
  assert.equal(read('old', 'src/lamps.vhd'), was);
  assert.equal((await serverVersions(P).list('old'))[0].reason, 'before-regenerate');
});

test('every kind of drawing (Petri net, truth table, state diagram, circuit, ASM chart, schematics): its HDL edited, made again; its layout moved, its line only', async () => {
  await P.createProject({ name: 'kinds', template: 'lock-circuit' });
  const files = ['alarm', 'digit_ok', 'lock', 'sync', 'timer', 'control', 'safe'];
  const drawing = { alarm: 'alarm.pn.json', digit_ok: 'digit_ok.bool.json', lock: 'lock.fsm.json', sync: 'sync.circ.json', timer: 'timer.asm.json', control: 'control.sch.json', safe: 'safe.sch.json' };
  const was = Object.fromEntries(files.map(f => [f, read('kinds', `src/${f}.vhd`)]));
  for (const f of files) put('kinds', `src/${f}.vhd`, `-- edited\n${was[f]}`);
  const r = await D.checkDrawings(P, 'kinds');
  // (a design project's: its drawings named, never their HDL, #3891)
  assert.deepEqual(r.messages, files.map((f, i) => `WARNING: src/${drawing[f]}: its module was changed outside Silinx: made again from the drawing; the changed file is kept in version ${i + 1} ("src/${drawing[f]}: its module changed outside Silinx").`));
  for (const f of files) assert.equal(read('kinds', `src/${f}.vhd`), was[f], f);
  // a state moved: the same HDL, its file left as it is (no change in git), nothing said; checked again, the same
  const fsm = JSON.parse(read('kinds', 'src/lock.fsm.json'));
  fsm.states[0].x += 40;
  put('kinds', 'src/lock.fsm.json', JSON.stringify(fsm, null, 2));
  assert.deepEqual(await D.checkDrawings(P, 'kinds'), { results: [], written: [], messages: [] });
  assert.equal(await cacheState(read('kinds', 'src/lock.vhd'), fsm), 'drawing');
  assert.equal(read('kinds', 'src/lock.vhd'), was.lock);
  assert.deepEqual(await D.checkDrawings(P, 'kinds'), { results: [], written: [], messages: [] });
  // (then its HDL edited by hand: noticed all the same)
  put('kinds', 'src/lock.vhd', `-- edited\n${was.lock}`);
  assert.deepEqual((await D.checkDrawings(P, 'kinds')).messages, ['WARNING: src/lock.fsm.json: its module was changed outside Silinx: made again from the drawing; the changed file is kept in version 8 ("src/lock.fsm.json: its module changed outside Silinx").']);
  assert.ok(sameBody(read('kinds', 'src/lock.vhd'), was.lock));
  assert.equal(await cacheState(read('kinds', 'src/lock.vhd'), fsm), 'fresh');
  // a drawing's editor's save (syncDrawing, not a check): the same as before #5872, its file's line kept
  assert.deepEqual(await D.syncDrawing(P, 'kinds', 'src/lock.fsm.json'), { target: 'src/lock.vhd', written: null, removed: null, stale: null, messages: [] });
});

test('a drawing with no HDL file gets one with its line (adoptDrawing); checkDrawings gives it too', async () => {
  await P.createProject({ name: 'adopt', template: 'traffic' });
  const fsm = JSON.parse(read('adopt', 'src/traffic.fsm.json'));
  const { generatedFile, ...alone } = { ...fsm, name: 'walk' };   // eslint-disable-line no-unused-vars
  await P.writeFile('adopt', 'src/walk.fsm.json', JSON.stringify(alone, null, 2));
  const r = await D.checkDrawings(P, 'adopt', { only: ['src/walk.fsm.json'] });
  assert.deepEqual(r.messages, ['src/walk.vhd generated from src/walk.fsm.json']);
  assert.equal(await cacheState(read('adopt', 'src/walk.vhd'), JSON.parse(read('adopt', 'src/walk.fsm.json'))), 'fresh');
});
