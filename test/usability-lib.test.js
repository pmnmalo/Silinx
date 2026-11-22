// The usability tests' own logic (#5148, test/usability/lib/): the seeded generator, the shrinking of a failing sequence,
// and the schematic's invariants on drawings made for each (a wire's end on nothing, a net name's stub, a wire come off
// its pin, a diagonal, overlapping symbols, the junction dots, the nets, the HDL); the HDL editor's typing model and the
// wave window's values against the reference simulator (#5206); the model of a project's lifecycle (#5206, phase 2); the
// drawings' random steps on their models (#5206, phase 3): the same from a seed, each a person's, the drawing sound.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { prng, seeds, shrink } from './usability/lib/random.js';
import { danglingEnds, detachedEnds, badSegments, overlaps, junctionPoints, nets, schInvariants, hdlErrors } from './usability/lib/sch-invariants.js';
import { newDoc, normalizeDoc } from '../core/schdoc.js';
import { TypingModel, pieces, plain, fileOf, typeDesign } from './usability/lib/hdl-typing.js';
import { DESIGNS } from './usability/lib/hdl-designs.js';
import { shownValue, wrongValues, waveReference } from './usability/lib/wave-kit.js';
import { compile, elaborate } from '../core/compile.js';
import { mk, allX, format, toDec } from '../core/values.js';
import { ProjectModel, KIND_NAMES } from './usability/lib/project-model.js';
import { ANY, modelDiff, freshName, segDist, modelRun } from './usability/lib/draw-random.js';
import { drawDiagnostics, drawHdlErrors } from './usability/lib/draw-kit.js';
import { FSM_VOCAB, fsmModel, fsmTolerate } from './usability/lib/fsm-random.js';
import { ASM_VOCAB, asmModel, asmTolerate } from './usability/lib/asm-random.js';
import { PN_VOCAB, pnModel } from './usability/lib/pn-random.js';
import { TT_VOCAB, ttModel, column } from './usability/lib/tt-random.js';
import { STATE_R } from '../core/fsm.js';
import { shapeTable, parseExpr, exprColumn, normalizeTable } from '../core/logic.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const inv = (id, name, x, y) => ({ id, type: 'inv', x, y, rot: 0, mirror: false, name, params: { width: 1 } });
const P = (x, y) => ({ x, y });
// U1 at (80, 90): I (80, 100), O (160, 100); U2 at (300, 90): I (300, 100), O (380, 100)
function two() {
  const d = newDoc('two', 'vhdl');
  d.symbols.push(inv('S1', 'U1', 80, 90), inv('S2', 'U2', 300, 90));
  d.ports.push({ id: 'P1', name: 'a', dir: 'in', width: 1, x: 40, y: 100 }, { id: 'P2', name: 'y', dir: 'out', width: 1, x: 440, y: 100 });
  d.wires.push({ id: 'W1', points: [P(40, 100), P(80, 100)] }, { id: 'W2', points: [P(160, 100), P(300, 100)] }, { id: 'W3', points: [P(380, 100), P(440, 100)] });
  return normalizeDoc(d);
}

test('usability: the seeded generator: the same numbers from a seed on every machine, others from another; int, pick, weighted', () => {
  const a = prng(8), b = prng(8), c = prng(9);
  const xs = Array.from({ length: 5 }, () => a.next());
  assert.deepEqual(Array.from({ length: 5 }, () => b.next()), xs);
  assert.notDeepEqual(Array.from({ length: 5 }, () => c.next()), xs);
  // (mulberry32's first number of seed 1, as its reference implementation gives it)
  assert.equal(prng(1).next(), 0.6270739405881613);
  const r = prng(3);
  for (let i = 0; i < 200; i++) { const n = r.int(-3, 3); assert.ok(Number.isInteger(n) && n >= -3 && n <= 3); }
  assert.equal(r.pick([]), undefined);
  const w = prng(4), count = { a: 0, b: 0 };
  for (let i = 0; i < 1000; i++) count[w.weighted([{ k: 'a', weight: 9 }, { k: 'b', weight: 1 }]).k]++;
  assert.ok(count.a > 800 && count.b > 50, JSON.stringify(count));
});

test('usability: the seeds: the fixed ones and the week\'s, or SILINX_USABILITY_SEED\'s alone', () => {
  const day = 864e5, t = Date.UTC(2026, 10, 22);
  const saved = process.env.SILINX_USABILITY_SEED;
  delete process.env.SILINX_USABILITY_SEED;
  try {
    assert.deepEqual(seeds([1, 2], t), [1, 2, Math.floor(t / (7 * day))]);
    assert.deepEqual(seeds([1, 2], t + day).at(-1), seeds([1, 2], t).at(-1), 'the same week');
    assert.notEqual(seeds([], t + 7 * day)[0], seeds([], t)[0], 'the next week');
    process.env.SILINX_USABILITY_SEED = '2968';
    assert.deepEqual(seeds([1, 2], t), [2968]);
  } finally {
    if (saved == null) delete process.env.SILINX_USABILITY_SEED; else process.env.SILINX_USABILITY_SEED = saved;
  }
});

test('usability: a failing sequence shrunk to the steps that still fail; a sequence that fails at once kept; the time bounded', async () => {
  // it fails when 'b' comes after 'a' (with anything between)
  const fails = (l) => { const i = l.indexOf('a'); return i >= 0 && l.indexOf('b', i) > i; };
  assert.deepEqual(await shrink(['x', 'a', 'y', 'z', 'b', 'w'], async (l) => fails(l)), ['a', 'b']);
  assert.deepEqual(await shrink(['a', 'b'], async (l) => fails(l)), ['a', 'b']);
  let tries = 0;
  assert.deepEqual(await shrink(['x', 'a', 'b'], async (l) => { tries++; return fails(l); }, { ms: -1 }), ['x', 'a', 'b'], 'no time: as it was');
  assert.equal(tries, 0);
});

test('usability: the schematic\'s invariants: a sound drawing holds them all, its nets, its HDL in VHDL and Verilog', () => {
  const d = two();
  assert.deepEqual(schInvariants(d), {});
  assert.deepEqual(danglingEnds(d), []);
  assert.deepEqual(nets(d), ['U1.I port:a', 'U1.O U2.I', 'U2.O port:y']);
  assert.deepEqual(hdlErrors(d), []);
  // the gates example as shipped
  const gates = JSON.parse(fs.readFileSync(path.join(ROOT, 'examples/gates/src/gates.sch.json'), 'utf8'));
  assert.deepEqual(schInvariants(gates), {});
  assert.deepEqual(danglingEnds(gates), [], 'its net names\' stubs are no loose ends');
  assert.equal(nets(gates).length, 22);
});

test('usability: the schematic\'s invariants: a loose end, a wire come off its pin, a diagonal, overlapping symbols said', () => {
  const d = two();
  // W2 ends 10 short of U2's input: a loose end, and a wire come off its pin since the drawing before
  const e = structuredClone(d);
  e.wires[1].points[1] = P(290, 100);
  assert.deepEqual(danglingEnds(e).map((x) => x.text), ["wire W2's end (290, 100) on nothing"]);
  assert.deepEqual(detachedEnds(d, e), ["wire W2's last end came off its pin"]);
  assert.deepEqual(detachedEnds(d, e, { except: ['W2'] }), [], 'a wire the step may free');
  // a net name on it: no loose end (its net joined by its name)
  e.labels.push({ id: 'L1', x: 200, y: 100, net: 'n' });
  assert.deepEqual(danglingEnds(e), []);
  // a diagonal, a segment of no length
  const f = structuredClone(d);
  f.wires[1].points = [P(160, 100), P(160, 100), P(300, 120)];
  assert.deepEqual(badSegments(f), ['wire W2: a segment of no length at (160, 100)', 'wire W2: a diagonal segment (160, 100) to (300, 120)']);
  // U2 dropped onto U1
  const g = structuredClone(d);
  g.symbols[1].x = 100;
  assert.deepEqual(overlaps(g), ['symbols U1 and U2 overlap']);
  assert.ok(Object.keys(schInvariants(g)).includes('overlapping symbols'));
});

test('usability: the junction dots: where three branches meet, wires\' and a pin\'s; none where two wires only meet or cross', () => {
  const d = two();
  assert.deepEqual(junctionPoints(d), []);
  // a T on W2 at (230, 100) down to (230, 160): a dot there
  d.wires.push({ id: 'W4', points: [P(230, 100), P(230, 160)] });
  assert.deepEqual(junctionPoints(d), ['230,100']);
  // a second wire on U1's output pin: the pin and two wires, a dot
  d.wires.push({ id: 'W5', points: [P(160, 100), P(160, 160)] });
  assert.deepEqual(junctionPoints(d), ['160,100', '230,100']);
  // a wire crossing W2 (no vertex there): no dot
  d.wires.push({ id: 'W6', points: [P(260, 60), P(260, 140)] });
  assert.deepEqual(junctionPoints(d), ['160,100', '230,100']);
});

test('usability: the circuit\'s invariants: the breadboard example holds them; a wire come off, a loose end, a short said', async () => {
  const { circInvariants, circDangling, circDetached, circNets, circHdlErrors, circDiagnostics } = await import('./usability/lib/circ-invariants.js');
  const m = JSON.parse(fs.readFileSync(path.join(ROOT, 'examples/breadboard/src/breadboard.circ.json'), 'utf8'));
  assert.deepEqual(circInvariants(m), {});
  assert.deepEqual(circDangling(m), []);
  assert.deepEqual(circDiagnostics(m), []);
  assert.deepEqual(circHdlErrors(m), []);
  assert.equal(circNets(m).length, 30);
  // U2's VCC wire (w11: its pin 14 at (19, 4) to the + rail) moved off the board: its end on nothing, come off its pin
  const e = structuredClone(m);
  e.wires.find((w) => w.id === 'w11').points[0] = [19, 30];
  assert.deepEqual(circDangling(e).map((x) => x.text), ["wire w11's end (19, 30) on nothing"]);
  assert.deepEqual(circDetached(m, e), ["wire w11's first end came off its pin"]);
  assert.deepEqual(circDetached(m, e, { except: ['w11'] }), []);
  assert.deepEqual(Object.keys(circInvariants(e)), ['errors'], 'U2 not powered');
  // the top rails' + and − joined: a short circuit, an error
  const f = structuredClone(m);
  f.wires.push({ id: 'w99', points: [[10, -4], [10, -3]] });
  assert.match(circInvariants(f).errors[0], /^error: Short circuit: the supply's \+ and − are joined/);
});

test('usability: the HDL editor\'s typing model: brackets and quotes closed and typed over, Enter carrying the rest, a completion, a line\'s end', () => {
  const m = new TypingModel();
  // ( closed before the end of the line; ) typed over the one it put
  m.typeAll('f(a)');
  assert.deepEqual([m.text, m.pos], ['f(a)', 4]);
  // a quote after a space closed, typed over; after a word's letter not (4'd0); ( before a closing one closed too
  m.typeAll(" <= '1'; x = 4'd0; (others => '0')");
  assert.equal(m.text, "f(a) <= '1'; x = 4'd0; (others => '0')");
  // ( before a letter not closed
  const n = new TypingModel('ab');
  n.pos = 1;
  n.type('(');
  assert.deepEqual([n.text, n.pos], ['a(b', 2]);
  // Enter: the text after the cursor carried to the new line, its spaces dropped, the line indented as given
  const e = new TypingModel();
  e.typeAll('port (clk : in std_logic;');
  assert.equal(e.text, 'port (clk : in std_logic;)');
  e.enter(8);
  assert.deepEqual([e.text, e.pos], ['port (clk : in std_logic;\n        )', 34]);
  e.typeAll('q : out bit);');
  assert.equal(e.text, 'port (clk : in std_logic;\n        q : out bit);');
  // Enter on a line of spaces only: it is emptied
  e.enter(2);
  e.enter(0);
  assert.equal(e.text, 'port (clk : in std_logic;\n        q : out bit);\n\n');
  // a completion's rest inserted; the end of a line
  const c = new TypingModel('a\nbc\n');
  c.endOf(2);
  assert.equal(c.pos, 4);
  c.typeAll(' std_logic_v');
  c.complete('ector');
  assert.equal(c.text, 'a\nbc std_logic_vector\n');
  c.endOf(1);
  c.type(';');
  assert.equal(c.text, 'a;\nbc std_logic_vector\n');
});

test('usability: the lines typed with completions: their pieces, their text; the designs typed by the model are their files, and compile', () => {
  assert.deepEqual(pieces('q : out [[std_logic_v|ector]](3 downto 0));'), [{ type: 'q : out ' }, { prefix: 'std_logic_v', rest: 'ector' }, { type: '(3 downto 0));' }]);
  assert.deepEqual(pieces('[[pose|dge]]'), [{ prefix: 'pose', rest: 'dge' }]);
  assert.equal(plain('use [[ieee.nu|meric_std.all]];'), 'use ieee.numeric_std.all;');
  assert.equal(fileOf([{ indent: 0, line: 'a' }, { indent: 2, line: '[[b|c]]' }]), 'a\n  bc\n');
  for (const [lang, D] of Object.entries(DESIGNS)) {
    // the model, every line as intended: the design's file; with its mistake: the file without the fix, the fix then
    assert.equal(typeDesign(D.lines.map((l) => ({ ...l, typed: undefined }))).text, D.text, lang);
    const m = typeDesign(D.lines);
    assert.notEqual(m.text, D.text, `${lang}: the mistake`);
    m.endOf(D.fix.line);
    m.typeAll(D.fix.type);
    assert.equal(m.text, D.text, `${lang}: fixed`);
    // the design compiles and elaborates, no warnings; with its mistake, an error
    const lib = compile([{ path: D.file, text: D.text }]);
    assert.deepEqual([...lib.errors, ...elaborate(lib, 'counter').diags].filter((d) => d.severity !== 'note').map((d) => d.message), [], lang);
    const bad = compile([{ path: D.file, text: typeDesign(D.lines).text }]);
    assert.ok(bad.errors.some((d) => d.severity === 'error'), `${lang}: the mistake an error`);
  }
});

test('usability: the wave window\'s values: written in each radix, against core\'s formats; the reference\'s at a time; a wrong one said', () => {
  const v = mk(8, 0x2An), b = mk(1, 1n);
  assert.deepEqual(['default', 'hex', 'bin', 'udec'].map((r) => shownValue(v, { kind: 'logic' }, r)), ['2A', '2A', '00101010', '42']);
  assert.equal(shownValue(v, { kind: 'logic' }, 'hex'), format(v, 'hex').toUpperCase());
  assert.equal(shownValue(v, { kind: 'logic' }, 'udec'), toDec(v, false));
  assert.equal(shownValue(mk(6, 0x05n), { kind: 'logic' }, 'hex'), '05');
  assert.equal(shownValue(b, { kind: 'logic' }), '1');
  assert.equal(shownValue(mk(1, 1n), { kind: 'bool' }), 'TRUE');
  assert.equal(shownValue(mk(32, 0xFFFFFFFFn), { kind: 'int' }), '-1');
  assert.equal(shownValue([mk(1)], { kind: 'array' }), '(array)');
  assert.deepEqual(['hex', 'bin', 'udec'].map((r) => shownValue(allX(4), { kind: 'logic' }, r)), ['X', 'XXXX', 'X']);
  assert.equal(shownValue(mk(8, 0x0Fn, 0xF0n), { kind: 'logic' }, 'hex'), 'XF');
  // the reference: a counter's bench run 100 ns, its values at times; a window showing another value said
  const TB = 'module tb; reg clk = 0; wire [3:0] q; reg rst = 1, en = 1;\n  counter uut (.clk(clk), .rst(rst), .en(en), .q(q));\n  always #5 clk = ~clk;\n  initial #12 rst = 0;\nendmodule\n';
  const ref = waveReference([{ path: DESIGNS.verilog.file, text: DESIGNS.verilog.text }, { path: 'tb.v', text: TB }], 'tb', 100000);
  assert.deepEqual(ref.rows, ['tb.clk', 'tb.q', 'tb.rst', 'tb.en']);
  // (the rising edges at 5, 15, 25… ns: reset at 5, then counted from 15)
  assert.deepEqual([4000, 5000, 15000, 44999, 45000].map((t) => shownValue(ref.at('tb.q', t).v, ref.at('tb.q', t).t, 'udec')), ['X', '0', '1', '3', '4']);
  const doc = { rows: [['tb.q', 'udec'], ['tb.clk', 'default']], cursor: 45000, values: ['4', '1'] };
  assert.deepEqual(wrongValues(doc, ref), []);
  assert.deepEqual(wrongValues({ ...doc, values: ['3', '1'] }, ref), ['tb.q at 45000 ps (udec): shown "3", the reference\'s "4"']);
  assert.deepEqual(wrongValues({ ...doc, rows: [['tb.nope', 'default']], values: [''] }, ref), ['tb.nope: not in the reference']);
});

// a project with a source of each kind, as the lifecycle's scenario makes them
function everyKind() {
  const m = new ProjectModel('P');
  for (const [k, n, o] of [['vhdl', 'alu'], ['verilog', 'cnt'], ['sch', 'sheet'], ['fsm', 'ctl'], ['asm', 'seq'], ['tt', 'dec'], ['pn', 'net'], ['circ', 'board'],
    ['tb', 'tb_alu', { uut: 'alu' }], ['ucf', 'pins'], ['mem', 'rom'], ['c', 'add'], ['cpp', 'mul'], ['lab', 'lab1'], ['clock', 'clkgen'], ['bram', 'ram']]) m.add(k, n, o);
  return m;
}

test('usability: the project\'s model: a source of each kind: the Design pane\'s rows, the files on disk and silinx.json\'s, the modules, the editors', () => {
  const m = everyKind();
  assert.deepEqual(KIND_NAMES.length, 16);
  // (one row per module by name, the drawing's badge first, [VHDL] last; the wizards' instances under theirs; the empty
  // ASM chart and state diagram rows of their files)
  assert.deepEqual(m.rows(), ['add [C*] [VHDL] (add.c)', 'alu [VHDL*] (alu.vhd)', 'board [Circuit*] [Schematic] [VHDL] (board.circ.json)',
    'clkgen [Clocking Wizard*] [VHDL] (clkgen.vhd)', '  u_bufg_clk0 - BUFG (primitive)', '  u_dcm - DCM_SP (primitive)', '  u_ibufg - IBUFG (primitive)',
    'cnt [Verilog*] [VHDL] (cnt.v)', 'dec [Algebra*] [Schematic] [VHDL] (dec.bool.json)', 'mul [C++*] [VHDL] (mul.cpp)', 'net [Petri*] [FSM] [VHDL] (net.pn.json)',
    'ram [Block Memory*] [VHDL] (ram.vhd)', '  u_ram_0_0 - RAMB16_S9 (primitive)', 'sheet [Schematic*] [VHDL] (sheet.sch.json)', 'seq.asm.json', 'ctl.fsm.json']);
  assert.deepEqual(m.tree(), ['constraints/pins.ucf', 'labs/lab1.lab.json', 'sim/tb_alu.vhd', 'src/add.c', 'src/alu.vhd', 'src/board.circ.json', 'src/board.vhd', 'src/clkgen.vhd',
    'src/cnt.v', 'src/ctl.fsm.json', 'src/dec.bool.json', 'src/dec.vhd', 'src/mul.cpp', 'src/net.pn.json', 'src/net.vhd', 'src/ram.vhd', 'src/rom.mem', 'src/seq.asm.json',
    'src/sheet.sch.json', 'src/sheet.vhd']);
  assert.deepEqual(m.files(), ['sim/tb_alu.vhd:sim', 'src/alu.vhd:design', 'src/board.vhd:design', 'src/clkgen.vhd:design', 'src/cnt.v:design', 'src/dec.vhd:design',
    'src/net.vhd:design', 'src/ram.vhd:design', 'src/sheet.vhd:design']);
  assert.deepEqual(m.modules(), ['alu', 'board', 'clkgen', 'cnt', 'dec', 'net', 'ram', 'sheet', 'tb_alu']);
  assert.deepEqual([m.top, m.simTop, m.constraints, m.excluded()], ['', 'tb_alu', 'constraints/pins.ucf', []]);
  // (the wizards' modules open no editor: the guided lab's still in front)
  assert.deepEqual([m.docs.length, m.active], [14, 'file:labs/lab1.lab.json']);
  assert.deepEqual(m.errors(), [['ERROR:FSM - "src/ctl.fsm.json": ', 'The diagram has no states: double-click the drawing to add one'],
    ['ERROR:ASM - "src/seq.asm.json": ', 'The chart has no states'], ['ERROR:ASM - "src/seq.asm.json": ', 'No initial (reset) state selected']]);
  assert.throws(() => m.add('vhdl2', 'x'), /no kind vhdl2/);
  assert.throws(() => m.setTop('nothing'), /no source nothing/);
});

test('usability: the project\'s model: the top first, a source removed and back, a module renamed (its file, its editor, the bench\'s unit under test), a clone', () => {
  const m = everyKind();
  m.setTop('cnt');
  assert.equal(m.rows()[0], '▲cnt [Verilog*] [VHDL] (cnt.v)');
  m.closeDoc('file:labs/lab1.lab.json');
  assert.equal(m.active, 'file:src/mul.cpp', 'the tab before it in front');
  m.remove('net');
  assert.ok(!m.rows().some((r) => r.startsWith('net ')));
  assert.deepEqual([m.excluded(), m.files().includes('src/net.vhd:design'), m.tree().includes('src/net.vhd'), m.docs.includes('pn:src/net.pn.json')], [['src/net.pn.json'], false, true, false]);
  m.restore('net');
  assert.deepEqual([m.excluded(), m.files().includes('src/net.vhd:design')], [[], true]);
  m.openDoc('file:src/alu.vhd');
  m.rename('alu', 'alu2');
  assert.deepEqual([m.active, m.docs.includes('file:src/alu.vhd'), m.source('tb_alu').uut, m.files().includes('src/alu2.vhd:design'), m.modules().includes('alu2')],
    ['file:src/alu2.vhd', false, 'alu2', true, true]);
  m.rename('cnt', 'cnt2');
  assert.equal(m.top, 'cnt2');
  const c = m.clone('Q');
  assert.deepEqual([c.name, c.docs, c.active, c.rows(), c.tree(), c.files()], ['Q', [], null, m.rows(), m.tree(), m.files()]);
  c.remove('dec');
  assert.ok(m.rows().some((r) => r.startsWith('dec ')), 'the clone\'s sources its own');
});

test('usability: the project\'s model: the ISE style\'s Design pane: the Simulation view\'s bench and its unit under test, the flow\'s files under the top', () => {
  const m = new ProjectModel('P');
  m.flowFiles = true;
  m.add('vhdl', 'alu'); m.add('verilog', 'cnt'); m.add('tb', 'tb_alu', { uut: 'alu', simTop: false }); m.add('ucf', 'pins'); m.add('mem', 'rom');
  assert.equal(m.simTop, '', 'the bench selected in the view, not set');
  m.view = 'sim';
  assert.deepEqual(m.rows(), ['cnt [Verilog*] [VHDL] (cnt.v)', 'tb_alu [VHDL*] (tb_alu.vhd)', '  uut - alu [VHDL*] (alu.vhd)']);
  m.view = 'impl';
  // (no top: the constraints and the memory files after the modules; under the top once there is one)
  assert.deepEqual(m.rows(), ['alu [VHDL*] (alu.vhd)', 'cnt [Verilog*] [VHDL] (cnt.v)', 'pins.ucf', 'rom.mem']);
  m.setTop('cnt');
  assert.deepEqual(m.rows(), ['▲cnt [Verilog*] [VHDL] (cnt.v)', '  pins.ucf', '  rom.mem', 'alu [VHDL*] (alu.vhd)']);
  // (the project's own constraints file, not written: none listed)
  const n = new ProjectModel('N');
  n.flowFiles = true;
  n.add('vhdl', 'top');
  assert.deepEqual([n.constraints, n.rows()], ['constraints/top.ucf', ['top [VHDL*] (top.vhd)']]);
});

test('usability: the drawings\' models: the first difference said where, ANY matching anything; the editors\' new names; a point\'s distance to a segment', () => {
  assert.equal(modelDiff({ a: [{ id: ANY, x: 1 }] }, { a: [{ id: 's9', x: 1 }] }), null);
  assert.equal(modelDiff({ a: [{ id: ANY, x: 1 }] }, { a: [{ id: 's9', x: 2 }] }), 'a[0].x: 2, expected 1');
  assert.equal(modelDiff({ a: [1, 2] }, { a: [1] }), 'a: 1 items, expected 2 ([1])');
  assert.equal(modelDiff({ o: { k: 1 } }, { o: { k: 1, j: 2 } }), 'o.j: 2, expected undefined');
  assert.equal(freshName('s', ['S0', 'IDLE', 's1']), 'S2');
  assert.equal(freshName('p', ['none', 'P1'], 1, 'p'), 'p2');
  assert.equal(segDist({ x: 5, y: 5 }, { x: 0, y: 0 }, { x: 10, y: 0 }), 5);
  assert.equal(segDist({ x: -3, y: 4 }, { x: 0, y: 0 }, { x: 10, y: 0 }), 5);
});

/** A model on its example's document: the full document again, for the editors' checks and the HDL. */
const asDoc = (doc, m) => {
  const out = { ...doc };
  for (const [k, v] of Object.entries(m)) out[k] = Array.isArray(v) ? v.map((x) => (x && typeof x === 'object' ? { ...(doc[k]?.find?.((y) => y.id === x.id) || {}), ...x } : x)) : v;
  return out;
};
const example = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, 'examples', p), 'utf8'));
/** A vocabulary's sequences on its example's model, seeds 1 to 6, 40 steps: the same steps from a seed, others from
 *  another; every model sound (the drawing's check: no errors but the tolerated, its HDL compiled and elaborated when it
 *  has none) and `each(model)` holding. */
function soundRuns(kind, vocab, model, doc, { tolerate = () => false, each = () => {} }) {
  const run = (seed) => modelRun(vocab, model(doc), { seed, n: 40, prng });
  assert.deepEqual(run(1).steps, run(1).steps);
  assert.notDeepEqual(run(1).steps, run(2).steps);
  const names = new Set();
  for (let seed = 1; seed <= 6; seed++) {
    const { steps, models } = run(seed);
    assert.equal(steps.length, 40, `seed ${seed}: a step at every draw`);
    for (const st of steps) names.add(st.name);
    models.forEach((m, i) => {
      const d = asDoc(doc, m), errs = drawDiagnostics(kind, d).filter((x) => x.startsWith('error'));
      assert.ok(!errs.length || tolerate(errs), `seed ${seed}, model ${i}: ${errs}`);
      if (!errs.length) assert.deepEqual(drawHdlErrors(kind, d), [], `seed ${seed}, model ${i}: its HDL`);
      each(m, `seed ${seed}, model ${i}`);
    });
  }
  // (every action drawn, but those a step does only after another)
  assert.deepEqual([...names].sort(), vocab.filter((v) => v.weight).map((v) => v.name).sort());
}
const apart = (list, min, what) => list.forEach((a, i) => list.slice(i + 1).forEach((b) => assert.ok(Math.hypot(a.x - b.x, a.y - b.y) >= min, `${what}: ${a.id} and ${b.id} too close`)));
const unique = (names, what) => assert.equal(new Set(names.map((x) => x.toLowerCase())).size, names.length, `${what}: a name twice: ${names}`);

test('usability: the state diagram\'s random steps (traffic): the same from a seed; states in free room, names unique, the initial state kept; the check and the HDL sound', () => {
  const doc = example('traffic/src/traffic.fsm.json');
  soundRuns('fsm', FSM_VOCAB, fsmModel, doc, {
    tolerate: fsmTolerate,
    each(m, at) {
      apart(m.states, 2 * STATE_R + 50, at);
      unique(m.states.map((s) => s.name), at);
      assert.equal(m.initial, 's1', at);
      for (const t of m.transitions) assert.ok(m.states.some((s) => s.id === t.from) && m.states.some((s) => s.id === t.to), `${at}: ${t.id}'s states`);
    },
  });
  // (the errors tolerated: two "otherwise" transitions, a transition drawn before its condition is typed; no other)
  assert.ok(fsmTolerate(['error: State CARS has 2 otherwise transitions (else, @else, default, others, otherwise, true, 1 or no condition), to NIGHT, WALK; a state has one at most']));
  assert.ok(!fsmTolerate(["error: Two states are named 'GO' (letter case does not count)"]));
});

test('usability: the ASM chart\'s random steps (the lock\'s timer): the same from a seed; boxes apart, exits to state boxes, names unique; Validate and the HDL sound', () => {
  const doc = example('lock/src/timer.asm.json');
  const base = new Set(doc.edges.map((e) => `${e.from}.${e.port}>${e.to}`));
  soundRuns('asm', ASM_VOCAB, asmModel, doc, {
    tolerate: asmTolerate,
    each(m, at) {
      m.nodes.forEach((a, i) => m.nodes.slice(i + 1).forEach((b) => assert.ok(Math.abs(a.x - b.x) >= 140 || Math.abs(a.y - b.y) >= 60, `${at}: ${a.id} on ${b.id}`)));
      unique(m.nodes.filter((n) => n.type === 'state').map((n) => n.name), at);
      // (an arrow the steps drew: to a state box, or to the box added on its exit)
      for (const e of m.edges) {
        const to = m.nodes.find((n) => n.id === e.to);
        assert.ok(base.has(`${e.from}.${e.port}>${e.to}`) || to.type === 'state' || /new/.test(to.id), `${at}: ${e.id} to ${to.type} ${to.id}`);
      }
    },
  });
  assert.ok(asmTolerate(["error: Decision 'tick' has no 0 (false) branch", "error: State 'S0' has no exit (next state path)"]));
  assert.ok(!asmTolerate(["error: Loop through decision/output boxes without a state (in the block of state 'IDLE')"]));
});

test('usability: the Petri net\'s random steps (the lock\'s alarm): the same from a seed; nodes apart, names unique, tokens within capacity, no two arcs the same way, arcs back drawn; Check and the HDL sound', () => {
  const doc = example('lock/src/alarm.pn.json');
  let back = 0;
  soundRuns('pn', PN_VOCAB, pnModel, doc, {
    each(m, at) {
      apart([...m.places, ...m.transitions], 90, at);
      unique([...m.places, ...m.transitions].map((n) => n.name).concat(['fail', 'opened', 'fails', 'alarm']), at);
      for (const p of m.places) assert.ok(p.tokens <= p.capacity, `${at}: ${p.name}'s tokens`);
      for (const a of m.arcs) assert.ok(!m.arcs.some((b) => b !== a && b.from === a.from && b.to === a.to), `${at}: ${a.id} twice`);
      // (an arc back beside another, one each way: the two drawn apart, #5266)
      if (m.arcs.some((a) => m.arcs.some((b) => b.from === a.to && b.to === a.from))) back++;
    },
  });
  assert.ok(back > 0, 'an arc drawn back beside another');
});

test('usability: the truth table\'s random steps (the traffic lamps): the same from a seed; each step\'s table as core\'s (shapeTable, the expressions\' columns), the HDL sound', () => {
  const doc = normalizeTable(example('traffic/src/lamps.bool.json'));
  soundRuns('tt', TT_VOCAB, ttModel, doc, { each: (m, at) => { for (const o of m.outputs) assert.match(m.table[o], new RegExp(`^[01X]{${1 << m.inputs.length}}$`), `${at}: ${o}`); } });
  // each step's model against core's own table for the same step (its Inputs and Outputs boxes' shapeTable, an
  // expression's parseExpr and exprColumn): the model computed apart from it, the same
  const shaped = { addInput: 1, removeInput: 1, renameInput: 1, addOutput: 1, removeOutput: 1, renameOutput: 1 };
  for (let seed = 1; seed <= 6; seed++) {
    const r = prng(seed);
    let d = doc;
    for (let i = 0; i < 40; i++) {
      const m = ttModel(d);
      const opts = TT_VOCAB.filter((v) => v.weight && !/^(undo|redo)$/.test(v.name)).map((v) => ({ v, args: v.gen(d, r) })).filter((x) => x.args);
      const { v, args } = r.weighted(opts.map((x) => ({ ...x, weight: x.v.weight })));
      const want = v.apply(JSON.parse(JSON.stringify(m)), args, { id: () => '?', any: (x) => x });
      if (shaped[v.name]) {
        const ins = v.name.endsWith('Input') ? want.inputs : m.inputs, outs = v.name.endsWith('Output') ? want.outputs : m.outputs;
        d = shapeTable(d, ins, outs);
      } else if (v.name === 'expr') {
        assert.equal(column(m, args.text), exprColumn(parseExpr(args.text, { vars: m.inputs }), m.inputs), `${args.text} on ${m.inputs}`);
        d = normalizeTable({ ...d, table: want.table, exprs: want.exprs });
      } else d = normalizeTable({ ...d, table: want.table, exprs: want.exprs, forms: want.forms });
      assert.equal(modelDiff(want, ttModel(d)), null, `seed ${seed}, step ${i}: ${v.name} ${JSON.stringify(args)}`);
    }
  }
});
