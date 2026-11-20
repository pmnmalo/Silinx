// Unit tests (#4765): core/schdoc-text.js, the HDL text helpers and IR expression printers moved out of core/schdoc.js,
// loaded on its own: every name core/schdoc.js exported before still exported by it (the same functions), the names, the
// constants, the comments, the indentation and the printed expressions and types.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as text from '../core/schdoc-text.js';
import * as schdoc from '../core/schdoc.js';

const MOVED = ['constBits', 'dedent', 'dedentBlock', 'indent', 'offsetOf', 'prVhdl', 'prVlog', 'rangeTextVlog', 'rsvd', 'skipParen',
  'squash', 'stripComments', 'tokAt', 'tokenize', 'toSemi', 'typeTextVhdl', 'unparen', 'validIdent', 'vhdlBits', 'vlogBits',
  'vStmt', 'vStmtStart', 'withComments'];

test('core/schdoc.js still exports every moved name, the same functions (#4765)', () => {
  assert.deepEqual(Object.keys(text).sort(), [...MOVED].sort());
  for (const k of MOVED) assert.equal(schdoc[k], text[k], k);
});

test('validIdent and rsvd: each language\'s names and reserved words', () => {
  assert.equal(text.validIdent('count_1', 'vhdl'), true);
  assert.equal(text.validIdent('count__1', 'vhdl'), false);
  assert.equal(text.validIdent('_c', 'vhdl'), false);
  assert.equal(text.validIdent('_c', 'verilog'), true);
  assert.equal(text.validIdent('Signal', 'vhdl'), false);
  assert.equal(text.validIdent('signal', 'verilog'), true);
  assert.equal(text.validIdent('logic', 'verilog'), false);
  assert.ok(!text.rsvd('count'));
  assert.ok(text.rsvd('wire'));
});

test('constBits: every notation to bits of a width; vhdlBits and vlogBits', () => {
  assert.equal(text.constBits('5', 4), '0101');
  assert.equal(text.constBits('-1', 4), '1111');
  assert.equal(text.constBits('0x1F', 8), '00011111');
  assert.equal(text.constBits("8'hFF", 4), '1111');
  assert.equal(text.constBits("'1'", 1), '1');
  assert.equal(text.constBits('x"0F"', 8), '00001111');
  assert.equal(text.constBits('"zz"', 4), 'zzzz');
  assert.equal(text.constBits("4'b1_0", 4), '0010');
  assert.equal(text.constBits('abc', 4), null);
  assert.equal(text.vhdlBits('01x', false), '"01X"');
  assert.equal(text.vhdlBits('1', true), "'1'");
  assert.equal(text.vlogBits('0101'), "4'b0101");
});

test('comments, spaces and indentation', () => {
  assert.equal(text.stripComments('a <= b; -- c\nd', 'vhdl'), 'a <= b; \nd');
  assert.equal(text.stripComments('a = b; // c\n/* d\n */e', 'verilog'), 'a = b; \ne');
  assert.equal(text.squash('  a \n\t b  '), 'a b');
  assert.equal(text.dedentBlock('\n    a\n      b\n\n'), 'a\n  b');
  assert.equal(text.indent('a\n\nb', '  '), '  a\n\n  b');
  assert.equal(text.unparen('(a + b)'), 'a + b');
  assert.equal(text.unparen('(a) + (b)'), '(a) + (b)');
});

test('withComments: a statement with the comment lines above it and its line\'s comment, not the generated HDL\'s own', () => {
  const src = '-- silinx-symbol\n-- the sum\n-- of a and b\ny <= a xor b; -- here\nz <= a;\n';
  const s0 = src.indexOf('y <='), e0 = src.indexOf(';', s0) + 1;
  const [s, e] = text.withComments(src, s0, e0, 'vhdl');
  assert.equal(src.slice(s, e), '-- the sum\n-- of a and b\ny <= a xor b; -- here');
  const v = '// u1: HDL block\n(* keep *) assign y = a; // why\n';
  const s1 = v.indexOf('assign'), e1 = v.indexOf(';') + 1;
  assert.equal(v.slice(...text.withComments(v, s1, e1, 'verilog')), '(* keep *) assign y = a; // why');
});

test('tokenize, skipParen and toSemi on a VHDL statement', () => {
  const src = "y <= f(a, (b)) when s = '1' else c;";
  const toks = text.tokenize(src, 'vhdl');
  assert.deepEqual(toks.slice(0, 3).map(t => t.v), ['y', '<=', 'f']);
  const open = toks.findIndex(t => t.v === '(');
  assert.equal(toks[text.skipParen(toks, open)].v, 'when');
  assert.equal(text.toSemi(toks, 0), toks.length);
});

test('the expression printers and the types (prVhdl, prVlog, typeTextVhdl, rangeTextVlog)', () => {
  const ref = name => ({ op: 'ref', name }), int = value => ({ op: 'int', value });
  const e = { op: 'binary', o: '^', a: { op: 'index', base: ref('a'), index: int(3) }, b: { op: 'lit', bits: '1', scalar: true } };
  assert.equal(text.prVhdl(e), "(a(3) xor '1')");
  assert.equal(text.prVlog(e), "(a[3] ^ 1'b1)");
  assert.equal(text.prVlog({ op: 'binary', o: 'nand', a: ref('a'), b: ref('b') }), '~(a & b)');
  assert.equal(text.prVhdl({ op: 'concat', parts: [ref('a'), { op: 'lit', bits: '01' }] }), 'a & "01"');
  const range = { left: { op: 'binary', o: '-', a: ref('W'), b: int(1) }, right: int(0) };
  assert.equal(text.typeTextVhdl({ kind: 'logic', range }), 'std_logic_vector(W - 1 downto 0)');
  assert.equal(text.typeTextVhdl({ kind: 'logic', range, signed: true }), 'signed(W - 1 downto 0)');
  assert.equal(text.typeTextVhdl(null), 'std_logic');
  assert.equal(text.typeTextVhdl({ kind: 'integer' }), 'integer');
  assert.equal(text.rangeTextVlog({ range }), '[W - 1:0]');
  assert.equal(text.rangeTextVlog({}), '');
});
